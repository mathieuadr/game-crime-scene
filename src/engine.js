/* ═══════════════════════════════════════════════════════════════
   Case Generation Engine — Procedural + AI story generation.
   Pure game logic, no DOM dependencies.
   ═══════════════════════════════════════════════════════════════ */

import { createRng, pick, shuffle, randInt, randFloat } from './utils.js';
import {
  FIRST_NAMES_MALE, FIRST_NAMES_FEMALE, LAST_NAMES, ROLES,
  PERSONALITY_TRAITS, SPEAKING_STYLES,
  RELATIONSHIP_TYPES, LOCATIONS, ACTIVITIES, VICTIM_POOL, WEAPONS,
  SECRET_POOL, MOTIVE_REASONS, FABRIC_COLORS, PERSONAL_ITEMS,
  TIME_LABELS, TIME_DESCRIPTIONS, VOICE_TONES,
  HAIR_STYLES, BUILDS, FACIAL_FEATURES, DISTINGUISHING_MARKS
} from './data.js';
import { chatCompletion, getConfig } from './services.js';

// ─── Suspect Profile Generation ─────────────────────────────

function generateSuspects(count, rng) {
  const usedNames = new Set();
  const suspects = [];
  const roles = shuffle(ROLES, rng);

  for (let i = 0; i < count; i++) {
    const gender = rng() < 0.5 ? "male" : "female";
    const namePool = gender === "male" ? FIRST_NAMES_MALE : FIRST_NAMES_FEMALE;
    let first, last, fullName;
    do {
      first = pick(namePool, rng);
      last = pick(LAST_NAMES, rng);
      fullName = `${first} ${last}`;
    } while (usedNames.has(fullName));
    usedNames.add(fullName);

    const trait = pick(PERSONALITY_TRAITS, rng);
    const speakStyle = { ...SPEAKING_STYLES[trait] };
    const secret = pick(SECRET_POOL, rng);

    suspects.push({
      id: `suspect_${String(i).padStart(2, "0")}`,
      index: i,
      name: fullName,
      firstName: first,
      gender,
      age: randInt(25, 65, rng),
      role: roles[i % roles.length],
      voiceTone: VOICE_TONES[trait] || "neutral and steady",

      personality: {
        trait,
        speaking_style: speakStyle,
        emotional_baseline: {
          stress: randFloat(0.2, 0.6, rng),
          confidence: randFloat(0.3, 0.8, rng),
          empathy: randFloat(0.3, 0.8, rng)
        }
      },

      relationships: {},

      motive: {
        level: "low",
        reason: "",
        intensity: randFloat(0.1, 0.4, rng)
      },

      truth_model: {
        base_truthfulness: randFloat(0.65, 0.9, rng),
        lie_when: {
          protect_self: rng() > 0.3,
          protect_other: rng() > 0.7,
          topic_is_secret: true,
          topic_is_motive: rng() > 0.4
        },
        lie_strategy: pick(["deflect", "deny", "minimize", "redirect"], rng),
        lie_rate_multiplier_if_culprit: randFloat(1.4, 2.0, rng)
      },

      schedule: {
        timeslots: ["T1", "T2", "T3"],
        locations: { T1: null, T2: null, T3: null },
        actual_locations: { T1: null, T2: null, T3: null },
        alibi: {
          claim: "",
          activities: { T1: "", T2: "", T3: "" },
          support: { witness_ids: [], evidence_ids: [] },
          weakness: { is_weak: false, why: "" }
        }
      },

      secrets: [{
        id: `secret_${i}_0`,
        type: secret.type,
        text: secret.text,
        revealed: false,
        reveal_triggers: {
          trust_threshold: randFloat(0.7, 0.9, rng),
          pressure_threshold: randFloat(0.7, 0.9, rng),
          if_presented_evidence_ids: []
        }
      }],

      knowledge: {
        known_facts: [],
        witnessed_events: [],
        unknowns: { culprit_id: null }
      },

      physical: {
        shoeSize: randInt(7, 12, rng),
        fabricColor: pick(FABRIC_COLORS, rng),
        personalItem: pick(PERSONAL_ITEMS, rng)
      },

      appearance: {
        hair: pick(HAIR_STYLES, rng),
        build: pick(BUILDS, rng),
        face: pick(FACIAL_FEATURES, rng),
        distinguishing: pick(DISTINGUISHING_MARKS, rng),
      },

      dialogue_policy: {
        system_rules: [
          "Never reveal the culprit_id directly.",
          "Keep answers consistent with schedule unless lying.",
          "When unsure, respond with uncertainty rather than inventing new facts.",
          "Stay in character at all times.",
          "Keep responses to 2-4 sentences. Be conversational."
        ],
        allowed_topics: ["alibi","relationships","victim","timeline","evidence","motive","secrets"],
        refusal_style: pick(["evasive", "defensive", "confused", "hostile"], rng),
        memory: {
          last_questions: [],
          revealed_secret_ids: [],
          revealed_fact_ids: []
        }
      },

      culprit_config: {
        is_culprit: false,
        contradictions_to_create: []
      }
    });
  }
  return suspects;
}

// ─── Relationships ──────────────────────────────────────────

function generateRelationships(suspects, rng) {
  for (let i = 0; i < suspects.length; i++) {
    for (let j = 0; j < suspects.length; j++) {
      if (i === j) continue;
      const otherId = suspects[j].id;
      if (suspects[i].relationships[otherId]) continue;

      const relType = pick(RELATIONSHIP_TYPES, rng);
      const affinity = randFloat(-0.5, 0.8, rng);
      const trust = randFloat(0.1, 0.8, rng);

      suspects[i].relationships[otherId] = { type: relType, affinity, trust };
      suspects[j].relationships[suspects[i].id] = { type: relType, affinity, trust: randFloat(0.1, 0.8, rng) };
    }
  }
}

// ─── Culprit Assignment ─────────────────────────────────────

function assignCulprit(caseData, suspects, rng) {
  const idx = Math.floor(rng() * suspects.length);
  const culprit = suspects[idx];

  culprit.culprit_config.is_culprit = true;
  culprit.motive = {
    level: "high",
    reason: pick(MOTIVE_REASONS, rng),
    intensity: randFloat(0.75, 0.95, rng)
  };
  culprit.truth_model.base_truthfulness = randFloat(0.15, 0.35, rng);

  const others = suspects.filter(s => s.id !== culprit.id);
  const mediumCount = Math.max(1, Math.floor(others.length / 2));
  shuffle(others, rng).slice(0, mediumCount).forEach(s => {
    s.motive = {
      level: "medium",
      reason: pick(MOTIVE_REASONS, rng),
      intensity: randFloat(0.4, 0.65, rng)
    };
  });

  caseData.culpritId = culprit.id;
  return culprit;
}

// ─── Timeline ───────────────────────────────────────────────

function generateTimeline(caseData, suspects, culprit, rng) {
  const locs = shuffle(LOCATIONS, rng).slice(0, Math.min(7, LOCATIONS.length));
  caseData.crime.location = locs[0];

  for (const s of suspects) {
    for (const t of ["T1", "T2", "T3"]) {
      if (s.id === culprit.id && t === "T2") {
        s.schedule.actual_locations[t] = caseData.crime.location;
      } else {
        s.schedule.actual_locations[t] = pick(locs.slice(1), rng);
      }
    }
  }

  for (const s of suspects) {
    if (s.id !== culprit.id && s.schedule.actual_locations.T2 === caseData.crime.location) {
      s.schedule.actual_locations.T2 = pick(locs.filter(l => l !== caseData.crime.location), rng);
    }
  }

  for (const s of suspects) {
    for (const t of ["T1", "T2", "T3"]) {
      const activity = pick(ACTIVITIES, rng);
      s.schedule.alibi.activities[t] = activity;

      if (s.id === culprit.id && t === "T2") {
        const falseLoc = pick(locs.filter(l => l !== caseData.crime.location), rng);
        s.schedule.locations[t] = falseLoc;
        s.schedule.alibi.claim = `At 9:15 PM I was in ${falseLoc}, ${activity}.`;
        s.schedule.alibi.weakness = {
          is_weak: true,
          why: "No one can corroborate this alibi and evidence contradicts it."
        };
      } else {
        const honest = rng() < s.truth_model.base_truthfulness;
        s.schedule.locations[t] = honest ? s.schedule.actual_locations[t] : pick(locs, rng);
      }
    }
  }
}

// ─── Evidence ───────────────────────────────────────────────

function generateEvidence(caseData, suspects, culprit, rng) {
  const evidence = [];
  const crimeLoc = caseData.crime.location;

  evidence.push({
    id: "evidence_footprint_01",
    type: "physical",
    description: `A muddy footprint matching size ${culprit.physical.shoeSize} shoes was found near ${crimeLoc}.`,
    pointsTo: culprit.id,
    strength: "strong"
  });

  evidence.push({
    id: "evidence_item_01",
    type: "physical",
    description: `A ${culprit.physical.personalItem} was found on the floor of ${crimeLoc}, near the victim.`,
    pointsTo: culprit.id,
    strength: "strong",
    linkedItem: culprit.physical.personalItem
  });

  const witnesses = suspects.filter(s => s.id !== culprit.id);
  const witness = pick(witnesses, rng);
  evidence.push({
    id: "evidence_witness_01",
    type: "testimony",
    description: `${witness.name} claims to have seen someone heading toward ${crimeLoc} around 9:15 PM.`,
    witnessId: witness.id,
    pointsTo: culprit.id,
    strength: "moderate"
  });

  const herring = pick(witnesses, rng);
  const herringLoc = pick(LOCATIONS.filter(l => l !== crimeLoc), rng);
  evidence.push({
    id: "evidence_herring_01",
    type: "physical",
    description: `A ${herring.physical.fabricColor} fiber was found on the ${herringLoc} door, matching ${herring.name}'s jacket.`,
    pointsTo: herring.id,
    strength: "weak",
    isRedHerring: true
  });

  evidence.push({
    id: "evidence_note_01",
    type: "document",
    description: `A threatening note reading "You'll pay for what you've done" was found in the victim's pocket. Handwriting is inconclusive.`,
    pointsTo: null,
    strength: "moderate"
  });

  caseData.evidence = evidence;

  for (const s of suspects) {
    s.knowledge.witnessed_events = [];

    if (s.id === witness.id) {
      s.knowledge.witnessed_events.push({
        event_id: "evt_witness_main",
        time: "T2",
        text: `I saw a figure moving toward ${crimeLoc} around 9:15 PM.`,
        certainty: 0.7,
        who_was_involved: ["unknown"]
      });
    }

    const others = suspects.filter(o => o.id !== s.id);
    const seenCount = randInt(0, 2, rng);
    for (let i = 0; i < seenCount; i++) {
      const seen = pick(others, rng);
      const t = pick(["T1", "T3"], rng);
      const accurate = rng() < 0.8;
      const loc = accurate ? seen.schedule.actual_locations[t] : pick(LOCATIONS, rng);
      s.knowledge.witnessed_events.push({
        event_id: `evt_${s.index}_saw_${seen.index}_${t}`,
        time: t,
        text: `Saw ${seen.name} in ${loc} around ${TIME_LABELS[t]}.`,
        certainty: randFloat(0.5, 0.9, rng),
        who_was_involved: [seen.id],
        location: loc,
        accurate
      });
      s.knowledge.known_facts.push({
        fact_id: `fact_${s.index}_${seen.index}_${t}`,
        text: `${seen.name} was in ${loc} at ${TIME_LABELS[t]}.`,
        aboutId: seen.id,
        time: t,
        location: loc,
        certainty: accurate ? 0.8 : 0.4
      });
    }
  }
}

// ─── Contradictions ─────────────────────────────────────────

function generateContradictions(caseData, suspects, culprit) {
  const contradictions = [];
  const crimeLoc = caseData.crime.location;

  contradictions.push({
    id: "contradiction_alibi_evidence",
    type: "alibi_vs_evidence",
    description: `${culprit.name} claims to have been in ${culprit.schedule.locations.T2} at 9:15 PM, but a size ${culprit.physical.shoeSize} footprint was found at ${crimeLoc}.`,
    involvedSuspect: culprit.id,
    severity: "critical"
  });

  contradictions.push({
    id: "contradiction_item",
    type: "object_vs_denial",
    description: `${culprit.name}'s ${culprit.physical.personalItem} was found at the crime scene, though they deny being there.`,
    involvedSuspect: culprit.id,
    severity: "critical"
  });

  const witnessEv = caseData.evidence.find(e => e.id === "evidence_witness_01");
  if (witnessEv) {
    const w = suspects.find(s => s.id === witnessEv.witnessId);
    contradictions.push({
      id: "contradiction_witness",
      type: "witness_vs_alibi",
      description: `${w.name} saw someone heading toward ${crimeLoc} at 9:15 PM, contradicting ${culprit.name}'s alibi.`,
      involvedSuspect: culprit.id,
      witnessId: w.id,
      severity: "strong"
    });
  }

  culprit.culprit_config.contradictions_to_create = contradictions.map(c => c.id);
  caseData.contradictions = contradictions;
}

// ─── Consistency Check ──────────────────────────────────────

export function checkConsistency(caseData, suspects) {
  const issues = [];
  const culprits = suspects.filter(s => s.id === caseData.culpritId);
  if (culprits.length !== 1) issues.push("Must have exactly 1 culprit");

  const culprit = culprits[0];
  if (culprit && culprit.motive.level !== "high") issues.push("Culprit must have high motive");

  const cc = (caseData.contradictions || []).filter(c => c.involvedSuspect === caseData.culpritId);
  if (cc.length < 1) issues.push("Need >= 1 contradiction pointing to culprit");

  const ce = (caseData.evidence || []).filter(e => e.pointsTo === caseData.culpritId && !e.isRedHerring);
  if (ce.length < 2) issues.push("Need >= 2 independent clues pointing to culprit");

  if (culprit && culprit.schedule.actual_locations.T2 !== caseData.crime.location) {
    issues.push("Culprit must actually be at crime location at T2");
  }

  return { valid: issues.length === 0, issues, contradictionCount: cc.length, evidenceCount: ce.length };
}

// ─── Accusation Evaluation ──────────────────────────────────

export function evaluateAccusation(caseData, accusedId) {
  const correct = accusedId === caseData.culpritId;
  return {
    correct,
    actualCulpritId: caseData.culpritId,
    message: correct
      ? "Brilliant deduction, Inspector! You've identified the murderer."
      : "That's not the right person. The real culprit remains free..."
  };
}

// ─── Procedural Case Generation ─────────────────────────────

export function generateCase(seed, suspectCount = 4) {
  const rng = createRng(seed);

  const victim = pick(VICTIM_POOL, rng);
  const caseData = {
    seed,
    victim,
    crime: { time: "9:15 PM", location: null, weapon: pick(WEAPONS, rng) },
    culpritId: null,
    evidence: [],
    contradictions: [],
    solved: false,
    questionCount: 0
  };

  const suspects = generateSuspects(suspectCount, rng);
  generateRelationships(suspects, rng);
  const culprit = assignCulprit(caseData, suspects, rng);

  generateTimeline(caseData, suspects, culprit, rng);
  generateEvidence(caseData, suspects, culprit, rng);
  generateContradictions(caseData, suspects, culprit);

  const validity = checkConsistency(caseData, suspects);
  if (!validity.valid) console.warn("Case consistency issues:", validity.issues);

  return { caseData, suspects, rng };
}

// ─── AI-Generated Story ─────────────────────────────────────

function buildStoryGenerationPrompt(suspectCount, theme) {
  const themeInstruction = theme
    ? `The story should be set in the following theme/setting: "${theme}". Adapt names, locations, weapons, roles, and atmosphere accordingly.`
    : "The story should be set in a classic murder mystery setting (manor house, upscale event, etc.).";

  return `You are a murder mystery story generator. Create a complete, self-consistent crime story with exactly ${suspectCount} suspects. ${themeInstruction}

Return ONLY a valid JSON object (no markdown, no code fences, no commentary) with this exact structure:

{
  "victim": {
    "name": "Full Name",
    "age": 55,
    "occupation": "Their profession"
  },
  "crime": {
    "time": "9:15 PM",
    "location": "a specific place within the setting",
    "weapon": "the murder weapon with rich detail (e.g. 'an ornate silver letter opener with an ivory handle' instead of just 'a letter opener')",
    "weapon_description": "A vivid 2-3 sentence description of the weapon as evidence: its appearance, condition, where exactly it was found, and any notable details (blood, fingerprints, engravings, etc.)",
    "scene_description": "A vivid 3-5 sentence description of the crime scene: the room layout, lighting, state of furniture, signs of struggle, notable objects around the body, atmosphere. Include specific visual details that a detective would notice."
  },
  "suspects": [
    {
      "firstName": "First",
      "lastName": "Last",
      "gender": "male or female",
      "age": 40,
      "role": "their relationship to the victim (2-3 words)",
      "personality_trait": "one of: calm, nervous, arrogant, shy, aggressive, friendly",
      "voiceTone": "a short description of how their voice sounds — MUST match gender (e.g. male: 'deep and gravelly', female: 'soft and breathy')",
      "is_culprit": false,
      "motive_level": "low or medium or high",
      "motive_reason": "Why they might want the victim dead (1 sentence). Empty string if low motive.",
      "secret": {
        "type": "one of: financial, personal, blackmail, criminal, identity, escape, grudge, witness, fraud",
        "text": "a dark secret about this person (starts lowercase, no period)"
      },
      "appearance": {
        "hair": "detailed hair description (color, style, length — e.g. 'short slicked-back silver hair')",
        "build": "body type (e.g. 'tall and lean', 'stocky and broad-shouldered')",
        "face": "key facial features (e.g. 'sharp jawline, deep-set brown eyes, thin lips')",
        "distinguishing": "one notable mark or habit (e.g. 'a thin scar across the left cheek', 'always fidgets with a gold ring')",
        "clothing": "what they were wearing that evening (e.g. 'a tailored navy suit with a burgundy pocket square')"
      },
      "schedule": {
        "T1_actual": "location at 8:00 PM",
        "T1_claimed": "what they claim for 8:00 PM",
        "T1_activity": "what they were doing (gerund phrase)",
        "T2_actual": "location at 9:15 PM (culprit MUST be at crime location)",
        "T2_claimed": "what they claim for 9:15 PM (culprit MUST lie here)",
        "T2_activity": "activity",
        "T3_actual": "location at 10:30 PM",
        "T3_claimed": "what they claim for 10:30 PM",
        "T3_activity": "activity"
      },
      "physical": {
        "shoeSize": 10,
        "fabricColor": "a clothing color",
        "personalItem": "a distinctive personal item (2-3 words, no article)"
      },
      "knowledge": {
        "known_facts": [
          { "text": "What this suspect knows about another suspect", "aboutFirstName": "OtherFirst", "time": "T1 or T2 or T3", "location": "where", "certainty": 0.8 }
        ],
        "witnessed_events": [
          { "time": "T1 or T2 or T3", "text": "What they saw (first person)", "certainty": 0.7 }
        ]
      }
    }
  ],
  "evidence": [
    {
      "type": "physical or testimony or document",
      "description": "Detailed evidence description",
      "pointsToFirstName": "SuspectFirst or null",
      "strength": "strong or moderate or weak",
      "isRedHerring": false
    }
  ],
  "contradictions": [
    {
      "type": "alibi_vs_evidence or object_vs_denial or witness_vs_alibi",
      "description": "How this contradiction manifests",
      "involvedSuspectFirstName": "CulpritFirst",
      "severity": "critical or strong or moderate"
    }
  ]
}

CRITICAL RULES:
1. Exactly ONE suspect must have is_culprit=true with motive_level="high".
2. The culprit's T2_actual MUST equal the crime location. Their T2_claimed MUST be different (a lie).
3. At least 2 evidence items must point to the culprit (not red herrings), with strength "strong".
4. At least 1 evidence item should be a red herring pointing to an innocent suspect.
5. At least 2 contradictions must involve the culprit, with severity "critical".
6. Innocent suspects should be mostly truthful (claimed ≈ actual) but may have 1 discrepancy.
7. At least 1-2 suspects should have motive_level="medium" to create suspicion.
8. Each suspect must have at least 1 known fact about another suspect.
9. The story must be internally consistent — no impossible timelines.
10. Make the characters vivid: interesting secrets, compelling motives, realistic relationships.
11. Include exactly ${suspectCount} suspects.
12. All locations must be specific places within the setting (e.g. "the library", "the wine cellar").
13. The shoe size of the culprit must appear in at least one evidence description.
14. The culprit's personal item must appear in at least one evidence description.
15. Each suspect MUST have a detailed "appearance" object with hair, build, face, distinguishing mark, and clothing.
16. The crime weapon_description and scene_description must be vivid and atmospheric — they will be used to generate images.
17. The scene_description MUST mention visible clues from the evidence list that a detective could spot.
18. Each suspect MUST have a "gender" field ("male" or "female"). Ensure a mix of genders. The voiceTone MUST be consistent with the suspect's gender.`;
}

function repairJSON(text) {
  // remove trailing commas before ] or }
  text = text.replace(/,\s*([}\]])/g, '$1');
  // remove JS-style // comments
  text = text.replace(/\/\/[^\n]*/g, '');
  // replace smart quotes with straight quotes
  text = text.replace(/[\u201C\u201D]/g, '"').replace(/[\u2018\u2019]/g, "'");
  return text;
}

function extractJSON(raw) {
  // 1. strip markdown fences
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/s);
  const candidate = fenceMatch ? fenceMatch[1].trim() : raw.trim();

  // 2. find the outermost { … } in case there is surrounding prose
  const start = candidate.indexOf('{');
  const end   = candidate.lastIndexOf('}');
  const text  = (start !== -1 && end > start) ? candidate.slice(start, end + 1) : candidate;

  // 3. try direct parse
  try { return JSON.parse(text); } catch (_) {}

  // 4. try with repairs (trailing commas, smart quotes, comments)
  try { return JSON.parse(repairJSON(text)); } catch (_) {}

  throw new Error("No valid JSON found in response");
}

export async function generateCaseAI(suspectCount, theme, onStatus) {
  const config = getConfig();
  if (!config.llm.apiKey) throw new Error("API key required for AI story generation.");

  if (onStatus) onStatus("Crafting the story premise...");

  const prompt = buildStoryGenerationPrompt(suspectCount, theme);
  const messages = [
    { role: "system", content: "You are a JSON generator. Output ONLY valid JSON, no markdown fences, no text before or after." },
    { role: "user", content: prompt }
  ];

  if (onStatus) onStatus("The AI is writing your mystery...");

  let raw = await chatCompletion(messages, { maxTokens: 16000, temperature: 0.9, jsonMode: true });

  if (onStatus) onStatus("Parsing the generated mystery...");

  let story;
  try {
    story = extractJSON(raw);
  } catch (e) {
    console.error("=== RAW MODEL RESPONSE ===\n", raw, "\n=========================");
    throw new Error(`JSON parse failed: ${e.message}`);
  }

  if (onStatus) onStatus("Building the case file...");
  try {
    return buildCaseFromAIStory(story, suspectCount);
  } catch (e) {
    console.error("=== buildCaseFromAIStory error ===\n", e, "\nStory object:\n", JSON.stringify(story, null, 2));
    throw new Error(`Story build failed: ${e.message}`);
  }
}

function buildCaseFromAIStory(story, expectedCount) {
  const rng = createRng(Date.now());

  const caseData = {
    seed: "ai_" + Date.now(),
    victim: story.victim,
    crime: {
      time: story.crime.time || "9:15 PM",
      location: story.crime.location,
      weapon: story.crime.weapon,
      weaponDescription: story.crime.weapon_description || "",
      sceneDescription: story.crime.scene_description || "",
    },
    culpritId: null,
    evidence: [],
    contradictions: [],
    solved: false,
    questionCount: 0
  };

  const suspects = [];
  for (let i = 0; i < story.suspects.length; i++) {
    const s = story.suspects[i];
    const trait = PERSONALITY_TRAITS.includes(s.personality_trait) ? s.personality_trait : pick(PERSONALITY_TRAITS, rng);
    const speakStyle = { ...SPEAKING_STYLES[trait] };
    const id = `suspect_${String(i).padStart(2, "0")}`;

    const suspect = {
      id,
      index: i,
      name: `${s.firstName} ${s.lastName}`,
      firstName: s.firstName,
      gender: s.gender || (rng() < 0.5 ? "male" : "female"),
      age: s.age || randInt(25, 65, rng),
      role: s.role,
      voiceTone: s.voiceTone || VOICE_TONES[trait] || "neutral and steady",

      personality: {
        trait,
        speaking_style: speakStyle,
        emotional_baseline: {
          stress: s.is_culprit ? randFloat(0.4, 0.7, rng) : randFloat(0.2, 0.6, rng),
          confidence: randFloat(0.3, 0.8, rng),
          empathy: randFloat(0.3, 0.8, rng)
        }
      },

      relationships: {},

      motive: {
        level: s.motive_level || "low",
        reason: s.motive_reason || "",
        intensity: s.motive_level === "high" ? randFloat(0.75, 0.95, rng)
                 : s.motive_level === "medium" ? randFloat(0.4, 0.65, rng)
                 : randFloat(0.1, 0.4, rng)
      },

      truth_model: {
        base_truthfulness: s.is_culprit ? randFloat(0.15, 0.35, rng) : randFloat(0.65, 0.9, rng),
        lie_when: {
          protect_self: rng() > 0.3,
          protect_other: rng() > 0.7,
          topic_is_secret: true,
          topic_is_motive: rng() > 0.4
        },
        lie_strategy: pick(["deflect", "deny", "minimize", "redirect"], rng),
        lie_rate_multiplier_if_culprit: randFloat(1.4, 2.0, rng)
      },

      schedule: {
        timeslots: ["T1", "T2", "T3"],
        locations: {
          T1: s.schedule.T1_claimed || s.schedule.T1_actual,
          T2: s.schedule.T2_claimed || s.schedule.T2_actual,
          T3: s.schedule.T3_claimed || s.schedule.T3_actual
        },
        actual_locations: {
          T1: s.schedule.T1_actual,
          T2: s.schedule.T2_actual,
          T3: s.schedule.T3_actual
        },
        alibi: {
          claim: `At 9:15 PM I was in ${s.schedule.T2_claimed}, ${s.schedule.T2_activity}.`,
          activities: {
            T1: s.schedule.T1_activity || pick(ACTIVITIES, rng),
            T2: s.schedule.T2_activity || pick(ACTIVITIES, rng),
            T3: s.schedule.T3_activity || pick(ACTIVITIES, rng)
          },
          support: { witness_ids: [], evidence_ids: [] },
          weakness: s.is_culprit
            ? { is_weak: true, why: "No one can corroborate this alibi and evidence contradicts it." }
            : { is_weak: false, why: "" }
        }
      },

      secrets: [{
        id: `secret_${i}_0`,
        type: s.secret?.type || "personal",
        text: s.secret?.text || "has a hidden past",
        revealed: false,
        reveal_triggers: {
          trust_threshold: randFloat(0.7, 0.9, rng),
          pressure_threshold: randFloat(0.7, 0.9, rng),
          if_presented_evidence_ids: []
        }
      }],

      knowledge: {
        known_facts: [],
        witnessed_events: [],
        unknowns: { culprit_id: null }
      },

      physical: {
        shoeSize: s.physical?.shoeSize || randInt(7, 12, rng),
        fabricColor: s.physical?.fabricColor || pick(FABRIC_COLORS, rng),
        personalItem: s.physical?.personalItem || pick(PERSONAL_ITEMS, rng)
      },

      appearance: {
        hair: s.appearance?.hair || pick(HAIR_STYLES, rng),
        build: s.appearance?.build || pick(BUILDS, rng),
        face: s.appearance?.face || pick(FACIAL_FEATURES, rng),
        distinguishing: s.appearance?.distinguishing || pick(DISTINGUISHING_MARKS, rng),
        clothing: s.appearance?.clothing || "",
      },

      dialogue_policy: {
        system_rules: [
          "Never reveal the culprit_id directly.",
          "Keep answers consistent with schedule unless lying.",
          "When unsure, respond with uncertainty rather than inventing new facts.",
          "Stay in character at all times.",
          "Keep responses to 2-4 sentences. Be conversational."
        ],
        allowed_topics: ["alibi","relationships","victim","timeline","evidence","motive","secrets"],
        refusal_style: pick(["evasive", "defensive", "confused", "hostile"], rng),
        memory: {
          last_questions: [],
          revealed_secret_ids: [],
          revealed_fact_ids: []
        }
      },

      culprit_config: {
        is_culprit: !!s.is_culprit,
        contradictions_to_create: []
      }
    };

    if (s.is_culprit) caseData.culpritId = id;
    suspects.push(suspect);
  }

  if (!caseData.culpritId && suspects.length > 0) {
    const fallbackIdx = Math.floor(rng() * suspects.length);
    suspects[fallbackIdx].culprit_config.is_culprit = true;
    suspects[fallbackIdx].motive.level = "high";
    suspects[fallbackIdx].truth_model.base_truthfulness = randFloat(0.15, 0.35, rng);
    caseData.culpritId = suspects[fallbackIdx].id;
  }

  generateRelationships(suspects, rng);

  const nameToId = {};
  for (const s of suspects) {
    nameToId[s.firstName.toLowerCase()] = s.id;
    nameToId[s.name.toLowerCase()] = s.id;
  }

  for (let i = 0; i < story.suspects.length; i++) {
    const aiS = story.suspects[i];
    const suspect = suspects[i];

    if (aiS.knowledge?.known_facts) {
      for (const f of aiS.knowledge.known_facts) {
        const aboutId = nameToId[(f.aboutFirstName || "").toLowerCase()];
        if (aboutId) {
          suspect.knowledge.known_facts.push({
            fact_id: `fact_ai_${i}_${suspect.knowledge.known_facts.length}`,
            text: f.text,
            aboutId,
            time: f.time || "T2",
            location: f.location || "unknown",
            certainty: f.certainty || 0.7
          });
        }
      }
    }

    if (aiS.knowledge?.witnessed_events) {
      for (const e of aiS.knowledge.witnessed_events) {
        suspect.knowledge.witnessed_events.push({
          event_id: `evt_ai_${i}_${suspect.knowledge.witnessed_events.length}`,
          time: e.time || "T2",
          text: e.text,
          certainty: e.certainty || 0.7,
          who_was_involved: ["unknown"]
        });
      }
    }
  }

  if (story.evidence) {
    for (let i = 0; i < story.evidence.length; i++) {
      const e = story.evidence[i];
      const pointsTo = e.pointsToFirstName ? nameToId[(e.pointsToFirstName || "").toLowerCase()] || null : null;
      caseData.evidence.push({
        id: `evidence_ai_${String(i).padStart(2, "0")}`,
        type: e.type || "physical",
        description: e.description,
        pointsTo,
        strength: e.strength || "moderate",
        isRedHerring: !!e.isRedHerring
      });
    }
  }

  if (story.contradictions) {
    const culprit = suspects.find(s => s.culprit_config.is_culprit);
    for (let i = 0; i < story.contradictions.length; i++) {
      const c = story.contradictions[i];
      const involved = c.involvedSuspectFirstName
        ? nameToId[(c.involvedSuspectFirstName || "").toLowerCase()] || caseData.culpritId
        : caseData.culpritId;
      const contId = `contradiction_ai_${String(i).padStart(2, "0")}`;
      caseData.contradictions.push({
        id: contId,
        type: c.type || "alibi_vs_evidence",
        description: c.description,
        involvedSuspect: involved,
        severity: c.severity || "critical"
      });
      if (culprit && involved === culprit.id) {
        culprit.culprit_config.contradictions_to_create.push(contId);
      }
    }
  }

  const validity = checkConsistency(caseData, suspects);
  if (!validity.valid) console.warn("AI case consistency issues:", validity.issues);

  return { caseData, suspects, rng };
}
