/* ═══════════════════════════════════════════════════════════════
   Game Screen — Interrogation UI, suspect list, chat, notes,
   image display, voice controls, accusation flow.
   ═══════════════════════════════════════════════════════════════ */

import { events } from '../events.js';
import { store } from '../store.js';
import { hashString } from '../utils.js';
import { TIME_LABELS, TIME_DESCRIPTIONS, AVATAR_COLORS } from '../data.js';
import { checkConsistency, evaluateAccusation } from '../engine.js';
import { getConfig, isLLMEnabled, isImageEnabled, isVoiceEnabled, isConversationEnabled, generateImage, playSuspectVoice, stopVoice, clearVoiceAssignments, isSTTSupported, isSTTActive, startSTT, stopSTT, getVoiceIdForSuspect } from '../services.js';
import { startSuspectSession, endCurrentSession, sendTextInput, isActive as isConversationActive } from '../conversation.js';
import { $, show, hide, setText, escapeHtml, addChatBubble, addTypingIndicator, removeTypingIndicator, addNote } from './helpers.js';
import { showSetupScreen } from './setup.js';

let _buttonsWired = false;

// ─── Initialization ─────────────────────────────────────────

export function initGameScreen() {
  wireGameButtons();

  events.on('game:started', onGameStarted);
  events.on('suspect:selected', onSuspectSelected);
  events.on('image:ready', onImageReady);

  wireConversationEvents();
}

function wireGameButtons() {
  if (_buttonsWired) return;
  _buttonsWired = true;

  $("btn-ask-alibi").addEventListener("click", () =>
    sendFromButton("Where were you at the time of the murder, around 9:15 PM?"));
  $("btn-ask-victim").addEventListener("click", () => {
    if (!store.caseData) return;
    sendFromButton(`What was your relationship with ${store.caseData.victim.name}?`);
  });
  $("btn-ask-about").addEventListener("click", () => {
    const sel = $("select-about-suspect");
    const target = store.suspects.find(s => s.id === sel.value);
    if (target) sendFromButton(`What can you tell me about ${target.name}? Did you see them that evening?`);
  });
  $("btn-ask-time").addEventListener("click", () => {
    const t = $("select-time").value;
    sendFromButton(`Where were you at ${TIME_LABELS[t]} (${TIME_DESCRIPTIONS[t]})?`);
  });
  $("btn-ask-shoes").addEventListener("click", () =>
    sendFromButton("What is your shoe size?"));
  $("btn-ask-item").addEventListener("click", () => {
    const s = store.selectedSuspect;
    if (s) sendFromButton(`Do you have your ${s.physical.personalItem} with you?`);
  });
  $("btn-ask-confront").addEventListener("click", () =>
    sendFromButton("How do you explain the evidence found at the crime scene that points to you?"));
  $("btn-ask-secret").addEventListener("click", () =>
    sendFromButton("I know you're hiding something. What aren't you telling me?"));

  const input = $("chat-input");
  const sendBtn = $("btn-send");
  sendBtn.addEventListener("click", () => handleSendMessage());
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSendMessage(); }
  });

  $("btn-accuse").addEventListener("click", makeAccusation);
  $("btn-reveal").addEventListener("click", revealSolution);
  $("btn-new-case").addEventListener("click", () => showSetupScreen());

  $("btn-debug-toggle").addEventListener("click", () => {
    const panel = $("debug-panel");
    if (panel.style.display === "none") { show(panel); renderDebugInfo(); } else { hide(panel); }
  });

  const voiceToggle = $("btn-voice-toggle");
  if (voiceToggle) {
    voiceToggle.addEventListener("click", () => {
      voiceToggle.classList.toggle("active");
      if (!voiceToggle.classList.contains("active")) stopVoice();
    });
  }

  const talkBtn = $("btn-talk");
  if (talkBtn) {
    if (!isConversationEnabled()) {
      talkBtn.style.display = "none";
    } else {
      talkBtn.addEventListener("click", async () => {
        if (!store.selectedSuspect) {
          addChatBubble("system", "Select a suspect first.");
          return;
        }

        if (isConversationActive()) {
          talkBtn.disabled = true;
          await endCurrentSession();
          // button state reset happens via conversation:disconnected event
          talkBtn.disabled = false;
        } else {
          setTalkButtonState("connecting");
          talkBtn.disabled = true;
          const suspect = store.selectedSuspect;
          const agent   = store.selectedAgent;
          const { conversation } = getConfig();
          try {
            const systemPrompt = agent.buildSystemPrompt();
            const voiceId      = isVoiceEnabled() ? await getVoiceIdForSuspect(suspect) : null;
            await startSuspectSession(suspect, systemPrompt, voiceId, conversation.agentId);
            // button state set to "active" via conversation:connected event
          } catch (err) {
            addChatBubble("system", `Voice session failed: ${err.message}`);
            setTalkButtonState("idle");
          } finally {
            talkBtn.disabled = false;
          }
        }
      });
    }
  }

  const micBtn = $("btn-mic");
  if (micBtn) {
    if (!isSTTSupported()) {
      micBtn.style.display = "none";
    } else {
      micBtn.addEventListener("click", () => {
        if (isConversationActive()) return; // mic managed by ElevenLabs in conversation mode
        toggleMic();
      });
    }
  }

  events.on("stt:start", () => {
    const btn = $("btn-mic");
    if (btn) btn.classList.add("active");
  });

  events.on("stt:result", ({ transcript, isFinal }) => {
    const input = $("chat-input");
    input.value = transcript;
    if (isFinal) {
      const btn = $("btn-mic");
      if (btn) btn.classList.remove("active");
    }
  });

  events.on("stt:end", () => {
    const btn = $("btn-mic");
    if (btn) btn.classList.remove("active");
  });

  events.on("stt:error", () => {
    const btn = $("btn-mic");
    if (btn) btn.classList.remove("active");
  });
}

function toggleMic() {
  if (isSTTActive()) {
    stopSTT();
  } else {
    startSTT();
  }
}

function sendFromButton(text) {
  const input = $("chat-input");
  input.value = text;
  handleSendMessage();
}

// ─── Game Started ───────────────────────────────────────────

function onGameStarted({ caseData, suspects }) {
  const apiConfig = getConfig();
  const isAiStory = String(caseData.seed).startsWith("ai_");
  const mode = isAiStory ? "AI Story" : (apiConfig.llm.enabled ? "AI Agents" : "Classic");
  setText("header-case-info", `Case #${String(Math.abs(hashString(String(caseData.seed)))).slice(0, 6)} — ${mode}`);

  setText("case-victim", `${caseData.victim.name} (${caseData.victim.occupation}, ${caseData.victim.age})`);
  setText("case-time", caseData.crime.time);
  setText("case-location", caseData.crime.location);
  setText("case-weapon", caseData.crime.weapon);
  $("evidence-list").innerHTML = "";

  renderSuspectList();
  populateDropdowns();

  $("chat-log").innerHTML = "";
  $("notes-log").innerHTML = "";
  hide("interrogation-controls");
  hide("debug-panel");

  clearAssetPanels();
  clearVoiceAssignments();

  addChatBubble("system",
    `The body of ${caseData.victim.name} was found in ${caseData.crime.location} at approximately ${caseData.crime.time}. The weapon: ${caseData.crime.weapon}. You have ${suspects.length} suspects to interrogate. Select one from the left panel.`
  );
  addNote(store, "Case opened", `Victim: ${caseData.victim.name}. Location: ${caseData.crime.location}. Weapon: ${caseData.crime.weapon}.`, "info");

  if (isImageEnabled()) generateSceneImages(caseData);

  renderServiceIndicators();
}

// ─── Service Indicators ─────────────────────────────────────

function renderServiceIndicators() {
  const container = $("active-services");
  if (!container) return;
  const badges = [];
  if (isLLMEnabled())           badges.push('<span class="service-indicator si-llm"   title="LLM active">AI</span>');
  if (isImageEnabled())         badges.push('<span class="service-indicator si-image" title="Image generation active">IMG</span>');
  if (isVoiceEnabled())         badges.push('<span class="service-indicator si-voice" title="Voice active (auto-matched per suspect)">VOX</span>');
  if (isConversationEnabled())  badges.push('<span class="service-indicator si-conv"  title="Live Voice conversation available">LIVE</span>');
  if (isSTTSupported())         badges.push('<span class="service-indicator si-stt"   title="Speech-to-Text available">MIC</span>');
  container.innerHTML = badges.join("");
}

// ─── Image Generation ───────────────────────────────────────

function buildScenePrompt(caseData) {
  const clueDetails = (caseData.evidence || [])
    .filter(e => !e.isRedHerring && e.type === "physical")
    .slice(0, 3)
    .map(e => e.description)
    .join(". ");

  const aiScene = caseData.crime.sceneDescription || "";

  return [
    `A dark, atmospheric crime scene photograph of ${caseData.crime.location}.`,
    `In the center of the scene there is a dead body lying on the floor, completely covered by a white sheet/blanket — only the human shape is visible under the drape.`,
    aiScene ? `Scene details: ${aiScene}` : `Moody nighttime lighting, furniture slightly disturbed, signs of a struggle.`,
    clueDetails ? `Visible clues scattered in the scene: ${clueDetails}.` : "",
    `The murder weapon (${caseData.crime.weapon}) should be visible nearby.`,
    `Style: cinematic detective noir, high detail, dramatic shadows, volumetric lighting, wide-angle view of the full room. No text, no UI elements.`
  ].filter(Boolean).join(" ");
}

function buildWeaponPrompt(caseData) {
  const aiDesc = caseData.crime.weaponDescription || "";
  return [
    `Close-up evidence photograph of ${caseData.crime.weapon} used in a murder.`,
    aiDesc ? `Details: ${aiDesc}` : `The weapon shows signs of use, placed on a dark surface with an evidence marker nearby.`,
    `Style: forensic photography, dramatic side-lighting, dark moody background, extremely detailed macro shot, photorealistic. No text, no labels.`
  ].filter(Boolean).join(" ");
}

async function generateSceneImages(caseData) {
  const sceneEl = $("crime-scene-image");
  const weaponEl = $("weapon-image");

  if (sceneEl) {
    sceneEl.innerHTML = '<div class="image-loading">Generating crime scene...</div>';
    const prompt = buildScenePrompt(caseData);
    const url = await generateImage(prompt, { cacheKey: `scene_${caseData.seed}`, size: "landscape_4_3" });
    if (url) {
      store.assets.crimeScene = url;
      sceneEl.innerHTML = `<img src="${url}" alt="Crime scene" class="generated-image scene-thumbnail" title="Click to inspect the crime scene">`;
      sceneEl.querySelector("img").addEventListener("click", () => openSceneLightbox(url, caseData));
    } else {
      sceneEl.innerHTML = '';
    }
  }

  if (weaponEl) {
    weaponEl.innerHTML = '<div class="image-loading">Generating weapon...</div>';
    const prompt = buildWeaponPrompt(caseData);
    const url = await generateImage(prompt, { cacheKey: `weapon_${caseData.seed}`, size: "square" });
    if (url) {
      store.assets.weapon = url;
      weaponEl.innerHTML = `<img src="${url}" alt="Weapon" class="generated-image">`;
    } else {
      weaponEl.innerHTML = '';
    }
  }
}

function buildPortraitPrompt(suspect) {
  const a = suspect.appearance || {};
  const genderLabel = suspect.gender === "female" ? "woman" : "man";
  const parts = [
    `Portrait of a ${suspect.age}-year-old ${genderLabel}.`,
    a.hair ? `Hair: ${a.hair}.` : "",
    a.build ? `Build: ${a.build}.` : "",
    a.face ? `Face: ${a.face}.` : "",
    a.distinguishing ? `Notable detail: ${a.distinguishing}.` : "",
    a.clothing ? `Wearing ${a.clothing}.` : `Wearing ${suspect.physical.fabricColor} clothing.`,
    `Expression: ${suspect.personality.trait}.`,
    `Style: noir detective portrait, dramatic chiaroscuro side-lighting, painterly, head and shoulders, dark moody background. No text.`
  ];
  return parts.filter(Boolean).join(" ");
}

async function generateSuspectPortrait(suspect) {
  if (store.assets.suspectPortraits[suspect.id]) return store.assets.suspectPortraits[suspect.id];

  const prompt = buildPortraitPrompt(suspect);
  const url = await generateImage(prompt, { cacheKey: `portrait_${suspect.id}`, size: "portrait_4_3" });

  if (url) store.assets.suspectPortraits[suspect.id] = url;
  return url;
}

function openSceneLightbox(url, caseData) {
  const existing = document.querySelector(".scene-lightbox");
  if (existing) existing.remove();

  const clueHints = (caseData.evidence || [])
    .filter(e => !e.isRedHerring)
    .slice(0, 4)
    .map(e => `<li>${escapeHtml(e.description)}</li>`)
    .join("");

  const overlay = document.createElement("div");
  overlay.className = "scene-lightbox";
  overlay.innerHTML = `
    <div class="scene-lightbox-inner">
      <button class="scene-lightbox-close" title="Close">&times;</button>
      <div class="scene-lightbox-img-wrap">
        <img src="${url}" alt="Crime scene — full view">
      </div>
      <div class="scene-lightbox-info">
        <h3>Crime Scene — ${escapeHtml(caseData.crime.location)}</h3>
        <p class="scene-lightbox-desc">${escapeHtml(caseData.crime.sceneDescription || `The body was found in ${caseData.crime.location}. The weapon, ${caseData.crime.weapon}, was nearby.`)}</p>
        ${clueHints ? `<div class="scene-lightbox-clues"><strong>Evidence at the scene:</strong><ul>${clueHints}</ul></div>` : ""}
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay || e.target.classList.contains("scene-lightbox-close")) overlay.remove();
  });
  document.addEventListener("keydown", function onKey(e) {
    if (e.key === "Escape") { overlay.remove(); document.removeEventListener("keydown", onKey); }
  });
}

function onImageReady({ cacheKey, url }) {
  const match = cacheKey?.match(/^portrait_(suspect_\d+)$/);
  if (match) {
    const avatarEl = document.querySelector(`[data-portrait="${match[1]}"]`);
    if (avatarEl) avatarEl.style.backgroundImage = `url(${url})`;
  }
}

function clearAssetPanels() {
  const sceneEl = $("crime-scene-image");
  const weaponEl = $("weapon-image");
  if (sceneEl) sceneEl.innerHTML = '';
  if (weaponEl) weaponEl.innerHTML = '';
}

// ─── Suspect List ───────────────────────────────────────────

function buildAppearanceTooltip(s) {
  const a = s.appearance || {};
  const parts = [a.build, a.hair, a.face, a.distinguishing].filter(Boolean);
  return parts.length ? parts.join(" · ") : "";
}

function renderSuspectList() {
  const list = $("suspect-list");
  list.innerHTML = "";
  store.suspects.forEach((s, i) => {
    const agent = store.agents[s.id];
    const qCount = agent ? agent.conversationHistory.filter(m => m.role === "user").length : 0;
    const portrait = store.assets.suspectPortraits[s.id];
    const tooltip = buildAppearanceTooltip(s);

    const li = document.createElement("li");
    li.className = "suspect-item" + (store.selectedSuspectId === s.id ? " active" : "");
    li.innerHTML = `
      <div class="suspect-avatar" data-portrait="${s.id}" title="${escapeHtml(tooltip)}" style="background:${AVATAR_COLORS[i % AVATAR_COLORS.length]};${portrait ? `background-image:url(${portrait});background-size:cover;` : ''}">
        ${portrait ? '' : s.firstName[0]}
      </div>
      <div class="suspect-info">
        <div class="suspect-name">${s.name}</div>
        <div class="suspect-trait">${s.role} · ${s.personality.trait} ${qCount > 0 ? `· <span style="color:var(--text-dim)">${qCount}Q</span>` : ""}</div>
      </div>
    `;
    li.addEventListener("click", () => store.selectSuspect(s.id));
    list.appendChild(li);
  });
}

function buildSuspectIntro(suspect) {
  const a = suspect.appearance || {};
  const descParts = [
    `${suspect.age}yo ${suspect.role}`,
    `(${suspect.personality.trait})`,
  ];
  const physParts = [a.build, a.hair, a.face, a.distinguishing].filter(Boolean);
  if (physParts.length) descParts.push("— " + physParts.join(", "));
  if (a.clothing) descParts.push(`Wearing ${a.clothing}.`);
  return `Now interrogating ${suspect.name} — ${descParts.join(" ")}`;
}

async function onSuspectSelected({ suspectId, suspect }) {
  renderSuspectList();
  updateSuspectState();
  addChatBubble("system", buildSuspectIntro(suspect));
  show("interrogation-controls", "flex");
  $("chat-input").focus();

  if (isImageEnabled() && !store.assets.suspectPortraits[suspectId]) {
    generateSuspectPortrait(suspect);
  }

  // End any session from the previous suspect, reset Talk button for new suspect
  if (isConversationActive()) {
    await endCurrentSession();
  }
  if (isConversationEnabled()) {
    const talkBtn = $("btn-talk");
    if (talkBtn) talkBtn.style.display = "";  // make visible
    setTalkButtonState("idle");
  }
}

function updateSuspectState() {
  const stateEl = $("suspect-state");
  if (!store.selectedSuspectId) { stateEl.innerHTML = ""; return; }

  const agent = store.selectedAgent;
  if (!agent) return;
  const snap = agent.getStateSnapshot();

  stateEl.innerHTML = `
    <div class="state-bar"><span class="state-label">Stress</span>
      <div class="bar-track"><div class="bar-fill bar-stress" style="width:${snap.stress * 100}%"></div></div>
      <span class="state-val">${(snap.stress * 100).toFixed(0)}%</span></div>
    <div class="state-bar"><span class="state-label">Confidence</span>
      <div class="bar-track"><div class="bar-fill bar-confidence" style="width:${snap.confidence * 100}%"></div></div>
      <span class="state-val">${(snap.confidence * 100).toFixed(0)}%</span></div>
    <div class="state-bar"><span class="state-label">Pressure</span>
      <div class="bar-track"><div class="bar-fill bar-pressure" style="width:${snap.pressure * 10}%"></div></div>
      <span class="state-val">${snap.pressure.toFixed(0)}/10</span></div>
  `;
}

// ─── Dropdowns ──────────────────────────────────────────────

function populateDropdowns() {
  const aboutSelect = $("select-about-suspect");
  aboutSelect.innerHTML = "";
  store.suspects.forEach(s => {
    const opt = document.createElement("option");
    opt.value = s.id; opt.textContent = s.name;
    aboutSelect.appendChild(opt);
  });

  const timeSelect = $("select-time");
  timeSelect.innerHTML = "";
  for (const [key, label] of Object.entries(TIME_LABELS)) {
    const opt = document.createElement("option");
    opt.value = key; opt.textContent = `${label} (${TIME_DESCRIPTIONS[key]})`;
    timeSelect.appendChild(opt);
  }

  const accuseSelect = $("select-accuse");
  accuseSelect.innerHTML = "";
  store.suspects.forEach(s => {
    const opt = document.createElement("option");
    opt.value = s.id; opt.textContent = s.name;
    accuseSelect.appendChild(opt);
  });
}

// ─── Interrogation ──────────────────────────────────────────

async function handleSendMessage() {
  const input = $("chat-input");
  const msg = input.value.trim();
  if (!msg) return;

  if (!store.selectedSuspectId) {
    addChatBubble("system", "Select a suspect first.");
    return;
  }

  input.value = "";
  input.disabled = true;
  $("btn-send").disabled = true;

  const suspect = store.selectedSuspect;
  addChatBubble("question", msg);

  const agent = store.selectedAgent;

  // ── Live voice mode: inject text into the active WebSocket session ──
  if (isConversationActive()) {
    addChatBubble("question", msg);
    sendTextInput(msg);
    // Response arrives via conversation:message event — no further handling here
    input.disabled = false;
    $("btn-send").disabled = false;
    input.focus();
    return;
  }

  const typingId = addTypingIndicator(suspect.name);

  try {
    const result = await agent.respond(msg);
    removeTypingIndicator(typingId);

    const actionText = `*${suspect.name} ${getActionDescription(suspect, agent)}*`;
    addChatBubble("system", actionText);

    const bubbleEl = addChatBubble("answer", result.text, suspect.name, result.isLLM);

    if (isVoiceEnabled() && isAutoVoiceOn()) {
      appendVoiceButton(bubbleEl, result.text, suspect);
      playSuspectVoice(result.text, suspect);
    } else if (isVoiceEnabled()) {
      appendVoiceButton(bubbleEl, result.text, suspect);
    }

    const tagMap = { alibi: "alibi", witness: "witness", evidence: "evidence", info: "info" };
    addNote(store, suspect.name, result.text, tagMap[result.tag] || "info");

    if (result.clueData) detectContradiction(result.clueData);
  } catch (err) {
    removeTypingIndicator(typingId);
    addChatBubble("system", `Error: ${err.message}`);
  }

  input.disabled = false;
  $("btn-send").disabled = false;
  input.focus();

  renderSuspectList();
  updateSuspectState();
}

function isAutoVoiceOn() {
  const toggle = $("btn-voice-toggle");
  return toggle && toggle.classList.contains("active");
}

// ─── Talk Button State ──────────────────────────────────────

function setTalkButtonState(state) {
  const btn = $("btn-talk");
  if (!btn || btn.style.display === "none") return;

  switch (state) {
    case "idle":
      btn.innerHTML = "&#127900; Talk";
      btn.classList.remove("active", "btn-danger");
      btn.title = "Start real-time voice conversation with this suspect";
      break;
    case "connecting":
      btn.innerHTML = "Connecting...";
      btn.classList.remove("active", "btn-danger");
      break;
    case "active":
      btn.innerHTML = "&#9209; End";
      btn.classList.add("active");
      btn.title = "End voice conversation";
      break;
  }
}

// ─── ElevenLabs Conversation Events ────────────────────────

function wireConversationEvents() {
  let _lastUserText = "";

  events.on('conversation:message', ({ text, source, suspectId }) => {
    const suspect = store.suspects.find(s => s.id === suspectId);
    const agent   = store.agents?.[suspectId];

    if (source === 'user') {
      _lastUserText = text;
      addChatBubble("question", text);
      return;
    }

    // AI response
    if (agent && suspect) {
      agent.updatePressure(_lastUserText);
      agent.updateEmotionalState(_lastUserText);
      agent.conversationHistory.push({ role: "user",      content: _lastUserText });
      agent.conversationHistory.push({ role: "assistant", content: text });
      store.caseData.questionCount++;

      const clueData   = agent.analyzeResponse(_lastUserText, text);
      const actionText = `*${suspect.name} ${getActionDescription(suspect, agent)}*`;

      addChatBubble("system", actionText);
      addChatBubble("answer", text, suspect.name, true);
      addNote(store, suspect.name, text, clueData?.tag || "info");
      if (clueData) detectContradiction(clueData);

      renderSuspectList();
      updateSuspectState();
    } else {
      addChatBubble("answer", text, suspect?.name || "Suspect", true);
    }
  });

  events.on('conversation:connected', ({ suspectId }) => {
    const name = store.suspects.find(s => s.id === suspectId)?.name || "suspect";
    addChatBubble("system", `Voice session active — speak to interrogate ${name}.`);
    setTalkButtonState("active");
    const micBtn = $("btn-mic");
    if (micBtn) { micBtn.classList.add("active"); micBtn.title = "Listening..."; }
  });

  events.on('conversation:disconnected', () => {
    addChatBubble("system", "Voice session ended.");
    setTalkButtonState("idle");
    const micBtn = $("btn-mic");
    if (micBtn) { micBtn.classList.remove("active"); micBtn.title = "Speech-to-Text"; }
  });

  events.on('conversation:mode', ({ mode }) => {
    const micBtn = $("btn-mic");
    if (!micBtn) return;
    if (mode === 'speaking') {
      micBtn.classList.remove("active");
      micBtn.title = "Suspect is speaking...";
    } else {
      micBtn.classList.add("active");
      micBtn.title = "Listening — speak now";
    }
  });

  events.on('conversation:error', ({ error, suspectId }) => {
    const name = store.suspects.find(s => s.id === suspectId)?.name || "suspect";
    const msg  = typeof error === "string" ? error : (error?.message || JSON.stringify(error));
    addChatBubble("system", `Voice session error (${name}): ${msg}`);
    setTalkButtonState("idle");
  });
}

function appendVoiceButton(bubbleEl, text, suspect) {
  const btn = document.createElement("button");
  btn.className = "btn-voice-play";
  btn.innerHTML = "&#9654;";
  btn.title = "Play voice";
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    playSuspectVoice(text, suspect);
  });
  const speakerEl = bubbleEl.querySelector(".speaker");
  if (speakerEl) speakerEl.appendChild(btn);
}

function getActionDescription(suspect, agent) {
  const stress = agent.emotionalState.stress;
  const trait = suspect.personality.trait;
  const descriptions = {
    calm: stress > 0.7 ? "maintains composure, but a bead of sweat appears" : "speaks in a measured, steady tone",
    nervous: stress > 0.7 ? "hands are trembling visibly" : "fidgets and avoids eye contact",
    arrogant: stress > 0.7 ? "scoffs, but their voice wavers slightly" : "scoffs dismissively",
    shy: stress > 0.7 ? "shrinks back, voice barely audible" : "looks down and speaks quietly",
    aggressive: stress > 0.7 ? "slams the table, face red with anger" : "leans forward with clenched fists",
    friendly: stress > 0.7 ? "smile fades, replaced by visible worry" : "offers a tense but warm smile"
  };
  return descriptions[trait] || "pauses before responding";
}

// ─── Contradiction Detection ────────────────────────────────

function detectContradiction(clueData) {
  if (!clueData || !store.caseData) return;
  const { caseData, suspects } = store;

  if (clueData.type === "alibi_claim" && clueData.isFalse) {
    const conflicting = caseData.evidence.filter(e => e.pointsTo === clueData.suspectId && e.strength !== "weak");
    if (conflicting.length > 0) {
      const suspect = suspects.find(s => s.id === clueData.suspectId);
      addNote(store, "CONTRADICTION", `${suspect.name} claims to have been in ${clueData.claimedLocation} at ${TIME_LABELS[clueData.time]}, but physical evidence suggests otherwise!`, "contradiction");
    }
  }

  if (clueData.type === "shoe_claim" && clueData.isFalse) {
    if (caseData.evidence.some(e => e.description.includes("footprint"))) {
      const suspect = suspects.find(s => s.id === clueData.suspectId);
      addNote(store, "CONTRADICTION", `${suspect.name} claims shoe size ${clueData.claimedSize}, but the footprint is size ${clueData.actualSize}.`, "contradiction");
    }
  }

  if (clueData.type === "item_admission" && clueData.admittedMissing) {
    if (caseData.evidence.some(e => e.description.includes(clueData.item))) {
      const suspect = suspects.find(s => s.id === clueData.suspectId);
      addNote(store, "KEY CLUE", `${suspect.name} admits their ${clueData.item} is missing — one was found at the crime scene!`, "contradiction");
    }
  }

  if (clueData.type === "item_denial" && clueData.deniedPresence) {
    if (caseData.evidence.some(e => e.description.includes(clueData.item))) {
      const suspect = suspects.find(s => s.id === clueData.suspectId);
      addNote(store, "SUSPICIOUS", `${suspect.name} claims their ${clueData.item} is elsewhere, but one was found at the scene.`, "contradiction");
    }
  }

  if (clueData.type === "secret_revealed") {
    const suspect = suspects.find(s => s.id === clueData.suspectId);
    addNote(store, "SECRET", `${suspect.name} revealed: ${clueData.secretText}`, "evidence");
  }
}

// ─── Accusation & Result ────────────────────────────────────

function makeAccusation() {
  const accusedId = $("select-accuse").value;
  const result = evaluateAccusation(store.caseData, accusedId);
  const accused = store.suspects.find(s => s.id === accusedId);
  const culprit = store.suspects.find(s => s.id === store.caseData.culpritId);
  showModal(result.correct, accused, culprit, result);
}

function showModal(correct, accused, culprit, result) {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  const icon = correct ? "&#10003;" : "&#10007;";
  const title = correct ? "Case Solved!" : "Wrong Suspect!";
  const color = correct ? "var(--success)" : "var(--danger)";

  overlay.innerHTML = `
    <div class="modal-box">
      <h2 style="color:${color}">${icon} ${title}</h2>
      <p>${result.message}</p>
      <div class="verdict">
        <p><strong>You accused:</strong> ${accused.name}</p>
        <p><strong>The culprit was:</strong> ${culprit.name}</p>
        <p><strong>Motive:</strong> ${culprit.motive.reason}</p>
        <p><strong>Secret:</strong> ${culprit.secrets[0]?.text || "N/A"}</p>
        <p><strong>Questions asked:</strong> ${store.caseData.questionCount}</p>
      </div>
      <button class="btn btn-primary" onclick="this.closest('.modal-overlay').remove()">Close</button>
      <button class="btn btn-outline" style="margin-top:.5rem;width:100%" onclick="this.closest('.modal-overlay').remove();" id="modal-new-case">New Case</button>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.querySelector("#modal-new-case").addEventListener("click", () => showSetupScreen());
  store.caseData.solved = true;
}

// ─── Reveal & Debug ─────────────────────────────────────────

function revealSolution() {
  const { caseData, suspects } = store;
  const culprit = suspects.find(s => s.id === caseData.culpritId);

  let info = `CULPRIT: ${culprit.name} (${culprit.role})\n`;
  info += `MOTIVE: ${culprit.motive.reason}\n`;
  info += `SECRET: ${culprit.secrets[0]?.text}\n`;
  info += `ACTUAL T2 LOCATION: ${culprit.schedule.actual_locations.T2}\n`;
  info += `CLAIMED T2 LOCATION: ${culprit.schedule.locations.T2}\n\n`;

  info += `CONTRADICTIONS:\n`;
  caseData.contradictions.forEach(c => { info += `  [${c.severity}] ${c.description}\n`; });

  info += `\nALL SUSPECTS:\n`;
  suspects.forEach(s => {
    info += `${s.name} (${s.culprit_config.is_culprit ? "CULPRIT" : "innocent"}) - ${s.role}\n`;
    ["T1", "T2", "T3"].forEach(t => {
      info += `  ${TIME_LABELS[t]}: actual=${s.schedule.actual_locations[t]}, claimed=${s.schedule.locations[t]}\n`;
    });
  });

  addChatBubble("system", "──── SOLUTION REVEALED ────");
  addChatBubble("answer", info.trim(), "Case File", false);
  addNote(store, "SOLUTION", `The culprit is ${culprit.name}. ${culprit.motive.reason}`, "contradiction");
}

function renderDebugInfo() {
  const panel = $("debug-panel");
  const { caseData, suspects } = store;
  const consistency = checkConsistency(caseData, suspects);

  let text = `=== DEBUG ===\nSeed: ${caseData.seed}\n`;
  text += `Culprit: ${suspects.find(s => s.id === caseData.culpritId).name} (${caseData.culpritId})\n`;
  text += `Consistency: ${consistency.valid ? "VALID" : "ISSUES: " + consistency.issues.join(", ")}\n`;
  text += `Contradictions: ${consistency.contradictionCount} | Evidence: ${consistency.evidenceCount}\n\n`;

  suspects.forEach(s => {
    const agent = store.agents[s.id];
    const snap = agent?.getStateSnapshot();
    text += `[${s.id}] ${s.name} | ${s.personality.trait} | motive:${s.motive.level} | truth:${s.truth_model.base_truthfulness.toFixed(2)}\n`;
    text += `  Role: ${s.role} | Secret: ${s.secrets[0]?.text}\n`;
    text += `  Shoe: ${s.physical.shoeSize} | Item: ${s.physical.personalItem} | Fabric: ${s.physical.fabricColor}\n`;
    text += `  Actual: T1=${s.schedule.actual_locations.T1}, T2=${s.schedule.actual_locations.T2}, T3=${s.schedule.actual_locations.T3}\n`;
    text += `  Claims: T1=${s.schedule.locations.T1}, T2=${s.schedule.locations.T2}, T3=${s.schedule.locations.T3}\n`;
    if (snap) text += `  State: stress=${snap.stress.toFixed(2)} conf=${snap.confidence.toFixed(2)} pressure=${snap.pressure}\n`;
    text += `  Culprit: ${s.culprit_config.is_culprit}\n\n`;
  });

  text += `=== EVIDENCE ===\n`;
  caseData.evidence.forEach(e => {
    const who = e.pointsTo ? suspects.find(s => s.id === e.pointsTo)?.name || "?" : "none";
    text += `[${e.id}] ${e.type} -> ${who} (${e.strength})${e.isRedHerring ? " RED HERRING" : ""}\n  ${e.description}\n\n`;
  });

  panel.textContent = text;
}
