/* ═══════════════════════════════════════════════════════════════
   SuspectAgent — AI-powered (or fallback) suspect interrogation.
   Each suspect gets an agent that manages conversation, emotion,
   and response generation.
   ═══════════════════════════════════════════════════════════════ */

import { pick, clamp } from './utils.js';
import { LOCATIONS, TIME_LABELS, TIME_DESCRIPTIONS } from './data.js';
import { chatCompletion, chatCompletionStream, isLLMEnabled } from './services.js';
import { events } from './events.js';

export class SuspectAgent {
  constructor(profile, caseData, allSuspects) {
    this.profile = profile;
    this.caseData = caseData;
    this.allSuspects = allSuspects;
    this.conversationHistory = [];
    this.pressureLevel = 0;
    this.emotionalState = {
      stress: profile.personality.emotional_baseline.stress,
      confidence: profile.personality.emotional_baseline.confidence,
      cooperativeness: profile.personality.emotional_baseline.empathy
    };
  }

  // ── System Prompt Builder ──

  buildSystemPrompt() {
    const p = this.profile;
    const c = this.caseData;
    const isCulprit = p.culprit_config.is_culprit;
    const victim = c.victim;

    const otherSuspects = this.allSuspects.filter(s => s.id !== p.id);
    const relLines = otherSuspects.map(s => {
      const rel = p.relationships[s.id];
      return rel ? `- ${s.name} (${s.role}): ${rel.type}, affinity ${rel.affinity > 0 ? "positive" : "negative"} (${rel.affinity.toFixed(1)}), trust: ${rel.trust.toFixed(1)}` : "";
    }).filter(Boolean).join("\n");

    const factLines = p.knowledge.known_facts.map(f =>
      `- ${f.text} (certainty: ${(f.certainty * 100).toFixed(0)}%)`
    ).join("\n") || "- Nothing specific.";

    const eventLines = p.knowledge.witnessed_events.map(e =>
      `- At ${TIME_LABELS[e.time] || e.time}: ${e.text} (certainty: ${(e.certainty * 100).toFixed(0)}%)`
    ).join("\n") || "- Nothing specific.";

    const secretLines = p.secrets.map(s => `- [${s.type}] ${s.text}`).join("\n");

    const scheduleTxt = ["T1", "T2", "T3"].map(t =>
      `- ${TIME_LABELS[t]} (${TIME_DESCRIPTIONS[t]}): Actually in ${p.schedule.actual_locations[t]}, ${p.schedule.alibi.activities[t]}`
    ).join("\n");

    const claimTxt = ["T1", "T2", "T3"].map(t =>
      `- ${TIME_LABELS[t]}: Claim to have been in ${p.schedule.locations[t]}`
    ).join("\n");

    let culpritBlock = "";
    if (isCulprit) {
      culpritBlock = `
## YOU ARE THE CULPRIT
You murdered ${victim.name} in ${c.crime.location} at ${c.crime.time} using ${c.crime.weapon}.
- You MUST lie about your location at T2 (9:15 PM). Claim you were in ${p.schedule.locations.T2}.
- Your ${p.physical.personalItem} was left at the scene — if asked, deflect or say you lost it.
- Your shoe size (${p.physical.shoeSize}) matches a footprint found at the scene — if asked, you may lie.
- NEVER confess. NEVER admit to the murder. Deflect, deny, minimize.
- You can point suspicion at others, especially those with medium motive.`;
    } else {
      culpritBlock = `
## YOU ARE INNOCENT
You did NOT commit this crime. You don't know who the culprit is.
- Be mostly truthful (base truthfulness: ${(p.truth_model.base_truthfulness * 100).toFixed(0)}%).
- You may lie to protect your secrets or if under heavy pressure.`;
    }

    const evidenceList = c.evidence.map(e => `- ${e.description}`).join("\n");

    const genderLabel = p.gender === "female" ? "woman" : "man";

    return `You are ${p.name}, a ${p.age}-year-old ${genderLabel} working as ${p.role}. You are being interrogated by a police inspector about the murder of ${victim.name} (${victim.occupation}, age ${victim.age}).

The murder took place in ${c.crime.location} at approximately ${c.crime.time}. The weapon was ${c.crime.weapon}.

## Your Personality
- Core trait: ${p.personality.trait}
- Tone: ${p.personality.speaking_style.tone}
- Speech tics: ${p.personality.speaking_style.tics.length ? p.personality.speaking_style.tics.map(t => `"${t}"`).join(", ") : "none"}
- Politeness: ${p.personality.speaking_style.politeness.toFixed(1)}/1 | Aggression: ${p.personality.speaking_style.aggression.toFixed(1)}/1
- Current stress: ${this.emotionalState.stress.toFixed(1)}/1 | Confidence: ${this.emotionalState.confidence.toFixed(1)}/1

## Your Schedule That Night
${scheduleTxt}

## What You Claim (your alibi)
${claimTxt}
${p.schedule.alibi.weakness.is_weak ? `⚠ Your T2 alibi is WEAK: ${p.schedule.alibi.weakness.why}` : ""}

## Your Relationships
${relLines}

## What You Know (facts)
${factLines}

## What You Witnessed
${eventLines}

## Your Secrets
${secretLines}

## Your Motive
Level: ${p.motive.level} | Reason: ${p.motive.reason || "No strong motive."} | Intensity: ${p.motive.intensity.toFixed(2)}

## Evidence Found by Police (you may or may not know about all of these)
${evidenceList}

## Your Physical Details
- Shoe size: ${p.physical.shoeSize}
- Distinctive clothing color: ${p.physical.fabricColor}
- Personal item: ${p.physical.personalItem}
${p.appearance ? `- Hair: ${p.appearance.hair || "unremarkable"}
- Build: ${p.appearance.build || "average"}
- Face: ${p.appearance.face || "unremarkable"}
- Notable detail: ${p.appearance.distinguishing || "none"}
- Tonight's outfit: ${p.appearance.clothing || p.physical.fabricColor + " clothing"}` : ""}

${culpritBlock}

## RULES (CRITICAL — follow these strictly)
1. Stay FULLY in character. Respond as ${p.firstName} would, using your speech patterns and personality.
2. Keep responses to 2-4 sentences. Be conversational, not robotic.
3. ${isCulprit ? "LIE about T2 location. Deflect about your personal item." : "Be mostly truthful but protect your secrets."}
4. If you don't know something, say so with appropriate uncertainty.
5. NEVER break character. NEVER say "as an AI" or reference being a language model.
6. NEVER directly reveal who the culprit is (even if you are the culprit).
7. Show emotion appropriate to the situation and your personality.
8. If pressured hard (pressure: ${this.pressureLevel}/10), become more ${p.dialogue_policy.refusal_style}.
9. When lying, use your strategy: "${p.truth_model.lie_strategy}".
10. If accused directly, deny it emotionally and stay in character.`;
  }

  // ── Main Response Entry Point ──

  async respond(userMessage) {
    this.updatePressure(userMessage);
    this.profile.dialogue_policy.memory.last_questions.push(userMessage);

    let response;
    if (isLLMEnabled()) {
      response = await this.llmRespond(userMessage);
    } else {
      response = this.fallbackRespond(userMessage);
    }

    this.conversationHistory.push({ role: "user", content: userMessage });
    this.conversationHistory.push({ role: "assistant", content: response.text });
    this.updateEmotionalState(userMessage);
    this.caseData.questionCount++;

    events.emit('suspect:response', {
      suspectId: this.profile.id,
      suspect: this.profile,
      text: response.text,
      isLLM: response.isLLM,
      clueData: response.clueData,
    });

    return response;
  }

  // ── Streaming Response (voice mode) ──

  async respondStream(userMessage, onChunk) {
    this.updatePressure(userMessage);
    this.profile.dialogue_policy.memory.last_questions.push(userMessage);

    const systemPrompt = this.buildSystemPrompt();
    const messages = [
      { role: "system", content: systemPrompt },
      ...this.conversationHistory,
      { role: "user", content: userMessage },
    ];

    let fullText = "";
    try {
      if (isLLMEnabled()) {
        fullText = await chatCompletionStream(messages, { maxTokens: 300, temperature: 0.8 }, onChunk);
      } else {
        const fallback = this.fallbackRespond(userMessage);
        fullText = fallback.text;
        if (onChunk) onChunk(fullText, fullText);
      }
    } catch (err) {
      console.error("LLM stream error:", err);
      const fallback = this.fallbackRespond(userMessage);
      fullText = fallback.text;
      if (onChunk) onChunk(fullText, fullText);
    }

    this.conversationHistory.push({ role: "user", content: userMessage });
    this.conversationHistory.push({ role: "assistant", content: fullText });
    this.updateEmotionalState(userMessage);
    this.caseData.questionCount++;

    const clueData = this.analyzeResponse(userMessage, fullText);
    events.emit("suspect:response", {
      suspectId: this.profile.id,
      suspect: this.profile,
      text: fullText,
      isLLM: true,
      clueData,
    });

    return { text: fullText, tag: clueData?.tag || "info", clueData, isLLM: true };
  }

  // ── LLM Response ──

  async llmRespond(userMessage) {
    const systemPrompt = this.buildSystemPrompt();
    const messages = [
      { role: "system", content: systemPrompt },
      ...this.conversationHistory,
      { role: "user", content: userMessage }
    ];

    try {
      const text = await chatCompletion(messages);
      const clueData = this.analyzeResponse(userMessage, text);
      return { text, tag: clueData?.tag || "info", clueData, isLLM: true };
    } catch (err) {
      console.error("LLM error:", err);
      const fallback = this.fallbackRespond(userMessage);
      fallback.text = `[LLM unavailable — using fallback] ${fallback.text}`;
      return fallback;
    }
  }

  // ── Fallback Response Engine ──

  fallbackRespond(userMessage) {
    const p = this.profile;
    const c = this.caseData;
    const isCulprit = p.culprit_config.is_culprit;
    const qType = this.classifyQuestion(userMessage);
    const style = p.personality.speaking_style;
    const tic = style.tics.length ? pick(style.tics, Math.random) + ", " : "";
    const prefix = this.getPersonalityPrefix();
    let text = "";
    let tag = "info";
    let clueData = null;

    switch (qType) {
      case "alibi": {
        const loc = p.schedule.locations.T2;
        const act = p.schedule.alibi.activities.T2;
        text = `${prefix}At around 9:15 PM, I was in ${loc}, ${act}. ${
          isCulprit
            ? "I had nothing to do with what happened."
            : (Math.random() < p.truth_model.base_truthfulness
              ? "I'm certain about that."
              : "At least... I think that's right.")
        }`;
        tag = "alibi";
        clueData = {
          tag: "alibi", type: "alibi_claim", suspectId: p.id,
          claimedLocation: loc, time: "T2",
          isFalse: isCulprit || loc !== p.schedule.actual_locations.T2
        };
        break;
      }

      case "where_at_time": {
        const timeKey = this.extractTimeKey(userMessage);
        const loc = p.schedule.locations[timeKey];
        const act = p.schedule.alibi.activities[timeKey];
        const timeLabel = TIME_LABELS[timeKey];
        if (isCulprit && timeKey === "T2") {
          text = `${prefix}At ${timeLabel}? I was in ${loc}, ${act}. Why do you keep asking about that time?`;
        } else {
          text = `${prefix}At ${timeLabel}, I was in ${loc}, ${act}.`;
        }
        tag = "alibi";
        clueData = {
          tag: "alibi", type: "alibi_claim", suspectId: p.id,
          claimedLocation: loc, time: timeKey,
          isFalse: loc !== p.schedule.actual_locations[timeKey]
        };
        break;
      }

      case "victim": {
        if (isCulprit) {
          const willLie = Math.random() > p.truth_model.base_truthfulness;
          text = willLie
            ? `${prefix}I barely knew ${c.victim.name}. We had a purely professional relationship.`
            : `${prefix}${c.victim.name} and I... had our differences. But lots of people had issues with them.`;
          if (!willLie) clueData = { tag: "info", type: "victim_relation", suspectId: p.id, admittedConflict: true };
        } else {
          text = p.motive.level === "medium"
            ? `${prefix}${tic}we had some disagreements, I won't deny that. But nothing that would lead to... this.`
            : `${prefix}We got along fine. ${c.victim.name} was ${pick(["well-respected","difficult at times","complicated"], Math.random)}.`;
        }
        tag = "info";
        break;
      }

      case "about_suspect": {
        const target = this.findMentionedSuspect(userMessage);
        if (target) {
          const rel = p.relationships[target.id];
          const knowledge = p.knowledge.known_facts.filter(f => f.aboutId === target.id);
          if (knowledge.length > 0) {
            const fact = knowledge[0];
            if (isCulprit && Math.random() > p.truth_model.base_truthfulness) {
              const falseLoc = pick(LOCATIONS.filter(l => l !== fact.location), Math.random);
              text = `${prefix}I think I saw ${target.name} in ${falseLoc} around ${TIME_LABELS[fact.time]}. But I wasn't paying close attention.`;
              clueData = { tag: "witness", type: "witness_statement", fromId: p.id, aboutId: target.id, claimedLocation: falseLoc, time: fact.time, isFalse: true };
            } else {
              text = `${prefix}I saw ${target.name} in ${fact.location} around ${TIME_LABELS[fact.time]}.`;
              clueData = { tag: "witness", type: "witness_statement", fromId: p.id, aboutId: target.id, claimedLocation: fact.location, time: fact.time, isFalse: !fact.accurate };
            }
            tag = "witness";
          } else if (rel) {
            const trustWord = rel.trust > 0.5 ? "generally trust" : "don't fully trust";
            text = `${prefix}${target.name}? We're ${rel.type}s. I'd say I ${trustWord} them. ${
              rel.affinity < 0 ? "We've had our tensions." : "We get along reasonably well."
            }`;
          } else {
            text = `${prefix}I didn't see much of ${target.name} that evening. Can't tell you much.`;
          }
        } else {
          text = `${prefix}Who exactly are you asking about?`;
        }
        break;
      }

      case "shoe_size": {
        if (isCulprit && Math.random() > p.truth_model.base_truthfulness) {
          const fakeSize = p.physical.shoeSize + (Math.random() > 0.5 ? 1 : -1);
          text = `${prefix}My shoe size? That's an odd question. I wear a size ${fakeSize}.`;
          clueData = { tag: "evidence", type: "shoe_claim", suspectId: p.id, claimedSize: fakeSize, actualSize: p.physical.shoeSize, isFalse: true };
        } else {
          text = `${prefix}I wear a size ${p.physical.shoeSize}.`;
          clueData = { tag: "evidence", type: "shoe_claim", suspectId: p.id, claimedSize: p.physical.shoeSize, actualSize: p.physical.shoeSize, isFalse: false };
        }
        tag = "evidence";
        break;
      }

      case "personal_item": {
        if (isCulprit) {
          if (Math.random() > 0.4) {
            text = `${prefix}My ${p.physical.personalItem}? I... I must have misplaced it somewhere.`;
            clueData = { tag: "evidence", type: "item_admission", suspectId: p.id, item: p.physical.personalItem, admittedMissing: true };
          } else {
            text = `${prefix}My ${p.physical.personalItem}? It should be in my room. I haven't used it all evening.`;
            clueData = { tag: "evidence", type: "item_denial", suspectId: p.id, item: p.physical.personalItem, deniedPresence: true };
          }
        } else {
          text = `${prefix}My ${p.physical.personalItem}? Right here. Why?`;
        }
        tag = "evidence";
        break;
      }

      case "confront_evidence": {
        if (isCulprit) {
          this.emotionalState.stress = clamp(this.emotionalState.stress + 0.15, 0, 1);
          const strategies = {
            deflect: `${prefix}That doesn't prove anything. Anyone could have been there. You should look more carefully at the others.`,
            deny: `${prefix}That's impossible. I was nowhere near there. Someone must be setting me up.`,
            minimize: `${prefix}So what? That could mean a hundred things. You're grasping at straws.`,
            redirect: `${prefix}Interesting, but have you considered that ${pick(this.allSuspects.filter(s => s.id !== p.id), Math.random).name} had just as much reason to be there?`
          };
          text = strategies[p.truth_model.lie_strategy] || strategies.deflect;
        } else {
          text = `${prefix}I don't know what to tell you. I wasn't involved in any of that.`;
        }
        tag = "evidence";
        break;
      }

      case "secret": {
        const secret = p.secrets[0];
        if (secret && !secret.revealed && this.pressureLevel >= 7) {
          secret.revealed = true;
          p.dialogue_policy.memory.revealed_secret_ids.push(secret.id);
          text = `${prefix}Fine! You want the truth? I... ${secret.text}. But that has NOTHING to do with the murder!`;
          tag = "evidence";
          clueData = { tag: "evidence", type: "secret_revealed", suspectId: p.id, secretText: secret.text };
        } else if (secret && !secret.revealed) {
          text = `${prefix}I don't know what you're implying. I have nothing to hide.`;
        } else {
          text = `${prefix}I've already told you everything I know.`;
        }
        break;
      }

      case "accusation": {
        this.emotionalState.stress = clamp(this.emotionalState.stress + 0.3, 0, 1);
        text = isCulprit
          ? `${prefix}What?! You're making a terrible mistake! I didn't do this! You have no real proof!`
          : `${prefix}Are you serious?! I had nothing to do with this! Check your evidence again, Inspector!`;
        tag = "info";
        break;
      }

      case "relationship": {
        const otherNames = this.allSuspects.filter(s => s.id !== p.id);
        const lines = otherNames.map(s => {
          const rel = p.relationships[s.id];
          return rel ? `${s.name}: ${rel.type} (${rel.affinity > 0 ? "we get along" : "it's complicated"})` : null;
        }).filter(Boolean);
        text = `${prefix}${lines.length ? lines.slice(0, 2).join(". ") + "." : "I keep to myself mostly."}`;
        break;
      }

      default: {
        const fillers = [
          `${prefix}I'm not sure what exactly you're asking. Could you be more specific?`,
          `${prefix}That's a strange question. What are you getting at?`,
          `${prefix}I've told you what I know. Is there something specific you want to ask?`
        ];
        text = pick(fillers, Math.random);
        break;
      }
    }

    return { text, tag, clueData, isLLM: false };
  }

  // ── Question Classification ──

  classifyQuestion(msg) {
    const m = msg.toLowerCase();
    if (m.match(/accus|you did it|you('re| are) the (killer|murderer)|arrest you/)) return "accusation";
    if (m.match(/alibi|where were you.*(murder|9:15|crime|killed)|at the time of/)) return "alibi";
    if (m.match(/where were you|what were you doing|location.*(at|during)|at (8|9|10)/)) return "where_at_time";
    if (m.match(/victim|deceased|dead person|(about|know).*(lord|catherine|professor|margaret|dr\.|josephine)/i)) return "victim";
    if (m.match(/shoe|footprint|foot size/)) return "shoe_size";
    if (m.match(/item|belonging|handkerchief|lighter|watch|ring|glove|pen|glasses|cufflink|missing/)) return "personal_item";
    if (m.match(/evidence|found at|scene|footprint|fiber|note|contradict|explain this/)) return "confront_evidence";
    if (m.match(/secret|hiding|truth|what aren't you telling|confess|come clean/)) return "secret";
    if (m.match(/relation|between you|know each other|friends|colleagues|family/)) return "relationship";

    for (const s of this.allSuspects) {
      if (s.id !== this.profile.id && (m.includes(s.name.toLowerCase()) || m.includes(s.firstName.toLowerCase()))) {
        return "about_suspect";
      }
    }

    return "general";
  }

  extractTimeKey(msg) {
    const m = msg.toLowerCase();
    if (m.includes("8:00") || m.includes("8 pm") || m.includes("before") || m.includes("t1") || m.includes("earlier")) return "T1";
    if (m.includes("10:30") || m.includes("10 pm") || m.includes("after") || m.includes("t3") || m.includes("later")) return "T3";
    return "T2";
  }

  findMentionedSuspect(msg) {
    const m = msg.toLowerCase();
    for (const s of this.allSuspects) {
      if (s.id === this.profile.id) continue;
      if (m.includes(s.name.toLowerCase()) || m.includes(s.firstName.toLowerCase())) return s;
    }
    return null;
  }

  getPersonalityPrefix() {
    const style = this.profile.personality.speaking_style;
    const tic = style.tics.length ? pick(style.tics, Math.random) : "";
    const prefixes = {
      calm: ["", "Well, ", "I see. "],
      nervous: ["W-well... ", `${tic}... `, "I, um... "],
      arrogant: ["Obviously, ", "Please. ", "How quaint. "],
      shy: ["Um... ", "I... ", "..."],
      aggressive: ["Look, ", "Listen, ", "For the last time, "],
      friendly: ["Sure! ", "Of course, ", "Hey, "]
    };
    return pick(prefixes[this.profile.personality.trait] || [""], Math.random);
  }

  // ── LLM Response Analysis ──

  analyzeResponse(question, responseText) {
    const qType = this.classifyQuestion(question);
    if (qType === "alibi") return { tag: "alibi", type: "llm_alibi", suspectId: this.profile.id };
    if (qType === "shoe_size") return { tag: "evidence", type: "llm_shoe", suspectId: this.profile.id };
    if (qType === "personal_item") return { tag: "evidence", type: "llm_item", suspectId: this.profile.id };
    if (qType === "about_suspect") return { tag: "witness", type: "llm_witness", suspectId: this.profile.id };
    return { tag: "info" };
  }

  // ── State Updates ──

  updatePressure(msg) {
    const m = msg.toLowerCase();
    if (m.match(/lying|contradict|explain|prove|evidence shows|you were there|admit/)) {
      this.pressureLevel = clamp(this.pressureLevel + 2, 0, 10);
    } else {
      this.pressureLevel = clamp(this.pressureLevel + 0.5, 0, 10);
    }
  }

  updateEmotionalState(msg) {
    const m = msg.toLowerCase();
    const isCulprit = this.profile.culprit_config.is_culprit;
    const aggressive = m.match(/lying|liar|murderer|killed|confess|prove|contradict/);

    if (aggressive) {
      this.emotionalState.stress = clamp(this.emotionalState.stress + (isCulprit ? 0.12 : 0.06), 0, 1);
      this.emotionalState.confidence = clamp(this.emotionalState.confidence - (isCulprit ? 0.08 : 0.03), 0, 1);
      this.emotionalState.cooperativeness = clamp(this.emotionalState.cooperativeness - 0.05, 0, 1);
    } else {
      this.emotionalState.stress = clamp(this.emotionalState.stress - 0.02, 0, 1);
    }
  }

  getStateSnapshot() {
    return {
      stress: this.emotionalState.stress,
      confidence: this.emotionalState.confidence,
      cooperativeness: this.emotionalState.cooperativeness,
      pressure: this.pressureLevel,
      questionsAsked: this.conversationHistory.filter(m => m.role === "user").length
    };
  }
}
