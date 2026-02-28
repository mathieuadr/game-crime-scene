/* ═══════════════════════════════════════════════════════════════
   CRIME SCENE — app.js
   Frontend: UI initialization, DOM wiring, rendering, events.
   Depends on: engine.js, agent.js (loaded before this file)
   ═══════════════════════════════════════════════════════════════ */

let GAME = null;
let AGENTS = {};
let _buttonsWired = false;

const AVATAR_COLORS = ["#e94560","#0f3460","#4ade80","#fbbf24","#a78bfa","#f97316"];

// ─── Initialization ─────────────────────────────────────────

function initUI() {
  document.getElementById("btn-start").addEventListener("click", startGame);
  wireGameButtons();
}

function wireGameButtons() {
  if (_buttonsWired) return;
  _buttonsWired = true;

  // Quick action buttons
  document.getElementById("btn-ask-alibi").addEventListener("click", () =>
    sendFromButton("Where were you at the time of the murder, around 9:15 PM?"));
  document.getElementById("btn-ask-victim").addEventListener("click", () => {
    if (!GAME) return;
    sendFromButton(`What was your relationship with ${GAME.caseData.victim.name}?`);
  });
  document.getElementById("btn-ask-about").addEventListener("click", () => {
    const sel = document.getElementById("select-about-suspect");
    const target = GAME?.suspects.find(s => s.id === sel.value);
    if (target) sendFromButton(`What can you tell me about ${target.name}? Did you see them that evening?`);
  });
  document.getElementById("btn-ask-time").addEventListener("click", () => {
    const t = document.getElementById("select-time").value;
    sendFromButton(`Where were you at ${TIME_LABELS[t]} (${TIME_DESCRIPTIONS[t]})?`);
  });
  document.getElementById("btn-ask-shoes").addEventListener("click", () =>
    sendFromButton("What is your shoe size?"));
  document.getElementById("btn-ask-item").addEventListener("click", () => {
    if (!GAME?.selectedSuspect) return;
    const s = GAME.suspects.find(s => s.id === GAME.selectedSuspect);
    sendFromButton(`Do you have your ${s.physical.personalItem} with you?`);
  });
  document.getElementById("btn-ask-confront").addEventListener("click", () =>
    sendFromButton("How do you explain the evidence found at the crime scene that points to you?"));
  document.getElementById("btn-ask-secret").addEventListener("click", () =>
    sendFromButton("I know you're hiding something. What aren't you telling me?"));

  // Free text input
  const input = document.getElementById("chat-input");
  const sendBtn = document.getElementById("btn-send");
  sendBtn.addEventListener("click", () => handleSendMessage());
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  });

  // Accuse, reveal, new case
  document.getElementById("btn-accuse").addEventListener("click", makeAccusation);
  document.getElementById("btn-reveal").addEventListener("click", revealSolution);
  document.getElementById("btn-new-case").addEventListener("click", () => {
    document.getElementById("setup-screen").style.display = "";
    document.getElementById("game-screen").style.display = "none";
    document.getElementById("interrogation-controls").style.display = "none";
    document.getElementById("debug-panel").style.display = "none";
    GAME = null;
    AGENTS = {};
    document.getElementById("chat-log").innerHTML = "";
    document.getElementById("notes-log").innerHTML = "";
    document.getElementById("suspect-state").innerHTML = "";
  });

  document.getElementById("btn-debug-toggle").addEventListener("click", () => {
    const panel = document.getElementById("debug-panel");
    if (panel.style.display === "none") {
      panel.style.display = "block";
      renderDebugInfo();
    } else {
      panel.style.display = "none";
    }
  });
}

function sendFromButton(text) {
  const input = document.getElementById("chat-input");
  input.value = text;
  handleSendMessage();
}

// ─── Game Lifecycle ─────────────────────────────────────────

function startGame() {
  const count = parseInt(document.getElementById("suspect-count").value, 10);
  const seed = document.getElementById("seed-input").value.trim() || Date.now().toString();

  window._suspectCount = count;
  GAME = generate_case(seed);
  GAME.notes = [];
  GAME.selectedSuspect = null;

  AGENTS = {};
  for (const s of GAME.suspects) {
    AGENTS[s.id] = new SuspectAgent(s, GAME.caseData, GAME.suspects);
  }

  document.getElementById("setup-screen").style.display = "none";
  document.getElementById("game-screen").style.display = "block";

  renderGameUI();
}

function renderGameUI() {
  const { caseData, suspects } = GAME;
  const apiConfig = getApiConfig();
  const mode = apiConfig.apiKey ? "AI Agents" : "Classic";
  document.getElementById("header-case-info").textContent =
    `Case #${String(Math.abs(hashString(String(caseData.seed)))).slice(0, 6)} — ${mode}`;

  document.getElementById("case-victim").textContent = `${caseData.victim.name} (${caseData.victim.occupation}, ${caseData.victim.age})`;
  document.getElementById("case-time").textContent = caseData.crime.time;
  document.getElementById("case-location").textContent = caseData.crime.location;
  document.getElementById("case-weapon").textContent = caseData.crime.weapon;

  const evList = document.getElementById("evidence-list");
  evList.innerHTML = "";
  caseData.evidence.forEach(e => {
    const li = document.createElement("li");
    li.className = "evidence-tag";
    li.textContent = e.description;
    evList.appendChild(li);
  });

  renderSuspectList();
  populateDropdowns();

  document.getElementById("chat-log").innerHTML = "";
  document.getElementById("notes-log").innerHTML = "";
  document.getElementById("interrogation-controls").style.display = "none";
  document.getElementById("debug-panel").style.display = "none";

  addChatBubble("system", `The body of ${caseData.victim.name} was found in ${caseData.crime.location} at approximately ${caseData.crime.time}. The weapon: ${caseData.crime.weapon}. You have ${suspects.length} suspects to interrogate. Select one from the left panel.`);
  addNote("Case opened", `Victim: ${caseData.victim.name}. Location: ${caseData.crime.location}. Weapon: ${caseData.crime.weapon}.`, "info");
}

// ─── Suspect List ───────────────────────────────────────────

function renderSuspectList() {
  const list = document.getElementById("suspect-list");
  list.innerHTML = "";
  GAME.suspects.forEach((s, i) => {
    const agent = AGENTS[s.id];
    const qCount = agent ? agent.conversationHistory.filter(m => m.role === "user").length : 0;

    const li = document.createElement("li");
    li.className = "suspect-item" + (GAME.selectedSuspect === s.id ? " active" : "");
    li.innerHTML = `
      <div class="suspect-avatar" style="background:${AVATAR_COLORS[i % AVATAR_COLORS.length]}">
        ${s.firstName[0]}
      </div>
      <div class="suspect-info">
        <div class="suspect-name">${s.name}</div>
        <div class="suspect-trait">${s.role} · ${s.personality.trait} ${qCount > 0 ? `· <span style="color:var(--text-dim)">${qCount}Q</span>` : ""}</div>
      </div>
      <span class="motive-badge motive-${s.motive.level}">${s.motive.level}</span>
    `;
    li.addEventListener("click", () => selectSuspect(s.id));
    list.appendChild(li);
  });
}

function selectSuspect(id) {
  GAME.selectedSuspect = id;
  renderSuspectList();
  updateSuspectState();
  const suspect = GAME.suspects.find(s => s.id === id);
  addChatBubble("system", `Now interrogating ${suspect.name} — ${suspect.age}yo ${suspect.role} (${suspect.personality.trait}).`);
  document.getElementById("interrogation-controls").style.display = "flex";
  document.getElementById("chat-input").focus();
}

function updateSuspectState() {
  const stateEl = document.getElementById("suspect-state");
  if (!GAME?.selectedSuspect) { stateEl.innerHTML = ""; return; }

  const agent = AGENTS[GAME.selectedSuspect];
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
  const aboutSelect = document.getElementById("select-about-suspect");
  aboutSelect.innerHTML = "";
  GAME.suspects.forEach(s => {
    const opt = document.createElement("option");
    opt.value = s.id;
    opt.textContent = s.name;
    aboutSelect.appendChild(opt);
  });

  const timeSelect = document.getElementById("select-time");
  timeSelect.innerHTML = "";
  for (const [key, label] of Object.entries(TIME_LABELS)) {
    const opt = document.createElement("option");
    opt.value = key;
    opt.textContent = `${label} (${TIME_DESCRIPTIONS[key]})`;
    timeSelect.appendChild(opt);
  }

  const accuseSelect = document.getElementById("select-accuse");
  accuseSelect.innerHTML = "";
  GAME.suspects.forEach(s => {
    const opt = document.createElement("option");
    opt.value = s.id;
    opt.textContent = s.name;
    accuseSelect.appendChild(opt);
  });
}

// ─── Interrogation ──────────────────────────────────────────

async function handleSendMessage() {
  const input = document.getElementById("chat-input");
  const msg = input.value.trim();
  if (!msg) return;

  if (!GAME?.selectedSuspect) {
    addChatBubble("system", "Select a suspect first.");
    return;
  }

  input.value = "";
  input.disabled = true;
  document.getElementById("btn-send").disabled = true;

  const suspect = GAME.suspects.find(s => s.id === GAME.selectedSuspect);
  addChatBubble("question", msg);

  const agent = AGENTS[GAME.selectedSuspect];
  const typingId = addTypingIndicator(suspect.name);

  try {
    const result = await agent.respond(msg);
    removeTypingIndicator(typingId);

    const actionText = `*${suspect.name} ${getActionDescription(suspect, agent)}*`;
    addChatBubble("system", actionText);
    addChatBubble("answer", result.text, suspect.name, result.isLLM);

    const tagMap = { alibi: "alibi", witness: "witness", evidence: "evidence", info: "info" };
    addNote(suspect.name, result.text, tagMap[result.tag] || "info");

    if (result.clueData) detectContradiction(result.clueData);
  } catch (err) {
    removeTypingIndicator(typingId);
    addChatBubble("system", `Error: ${err.message}`);
  }

  input.disabled = false;
  document.getElementById("btn-send").disabled = false;
  input.focus();

  renderSuspectList();
  updateSuspectState();
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

// ─── Typing Indicator ───────────────────────────────────────

function addTypingIndicator(name) {
  const log = document.getElementById("chat-log");
  const div = document.createElement("div");
  const id = "typing_" + Date.now();
  div.id = id;
  div.className = "chat-bubble answer typing";
  div.innerHTML = `<span class="speaker">${escapeHtml(name)}</span><span class="typing-dots"><span>.</span><span>.</span><span>.</span></span>`;
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
  return id;
}

function removeTypingIndicator(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
}

// ─── Contradiction Detection ────────────────────────────────

function detectContradiction(clueData) {
  if (!clueData || !GAME) return;
  const { caseData, suspects } = GAME;

  if (clueData.type === "alibi_claim" && clueData.isFalse) {
    const conflicting = caseData.evidence.filter(e => e.pointsTo === clueData.suspectId && e.strength !== "weak");
    if (conflicting.length > 0) {
      const suspect = suspects.find(s => s.id === clueData.suspectId);
      addNote("CONTRADICTION", `${suspect.name} claims to have been in ${clueData.claimedLocation} at ${TIME_LABELS[clueData.time]}, but physical evidence suggests otherwise!`, "contradiction");
    }
  }

  if (clueData.type === "shoe_claim" && clueData.isFalse) {
    if (caseData.evidence.some(e => e.description.includes("footprint"))) {
      const suspect = suspects.find(s => s.id === clueData.suspectId);
      addNote("CONTRADICTION", `${suspect.name} claims shoe size ${clueData.claimedSize}, but the footprint is size ${clueData.actualSize}.`, "contradiction");
    }
  }

  if (clueData.type === "item_admission" && clueData.admittedMissing) {
    if (caseData.evidence.some(e => e.description.includes(clueData.item))) {
      const suspect = suspects.find(s => s.id === clueData.suspectId);
      addNote("KEY CLUE", `${suspect.name} admits their ${clueData.item} is missing — one was found at the crime scene!`, "contradiction");
    }
  }

  if (clueData.type === "item_denial" && clueData.deniedPresence) {
    if (caseData.evidence.some(e => e.description.includes(clueData.item))) {
      const suspect = suspects.find(s => s.id === clueData.suspectId);
      addNote("SUSPICIOUS", `${suspect.name} claims their ${clueData.item} is elsewhere, but one was found at the scene.`, "contradiction");
    }
  }

  if (clueData.type === "secret_revealed") {
    const suspect = suspects.find(s => s.id === clueData.suspectId);
    addNote("SECRET", `${suspect.name} revealed: ${clueData.secretText}`, "evidence");
  }
}

// ─── Accusation & Result ────────────────────────────────────

function makeAccusation() {
  const accusedId = document.getElementById("select-accuse").value;
  const result = evaluate_accusation(GAME.caseData, accusedId);
  const accused = GAME.suspects.find(s => s.id === accusedId);
  const culprit = GAME.suspects.find(s => s.id === GAME.caseData.culpritId);
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
        <p><strong>Questions asked:</strong> ${GAME.caseData.questionCount}</p>
      </div>
      <button class="btn btn-primary" onclick="this.closest('.modal-overlay').remove()">Close</button>
      <button class="btn btn-outline" style="margin-top:.5rem;width:100%" onclick="this.closest('.modal-overlay').remove();document.getElementById('btn-new-case').click()">New Case</button>
    </div>
  `;
  document.body.appendChild(overlay);
  GAME.caseData.solved = true;
}

// ─── Reveal & Debug ─────────────────────────────────────────

function revealSolution() {
  const { caseData, suspects } = GAME;
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
  addNote("SOLUTION", `The culprit is ${culprit.name}. ${culprit.motive.reason}`, "contradiction");
}

function renderDebugInfo() {
  const panel = document.getElementById("debug-panel");
  const { caseData, suspects } = GAME;
  const consistency = check_consistency(caseData, suspects);

  let text = `=== DEBUG ===\nSeed: ${caseData.seed}\n`;
  text += `Culprit: ${suspects.find(s => s.id === caseData.culpritId).name} (${caseData.culpritId})\n`;
  text += `Consistency: ${consistency.valid ? "VALID" : "ISSUES: " + consistency.issues.join(", ")}\n`;
  text += `Contradictions: ${consistency.contradictionCount} | Evidence: ${consistency.evidenceCount}\n\n`;

  suspects.forEach(s => {
    const agent = AGENTS[s.id];
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

// ─── Chat & Notes Helpers ───────────────────────────────────

function addChatBubble(type, text, speaker = "", isLLM = false) {
  const log = document.getElementById("chat-log");
  const div = document.createElement("div");
  div.className = `chat-bubble ${type}`;
  if (speaker && type === "answer") {
    const badge = isLLM ? '<span class="llm-badge">AI</span>' : '';
    div.innerHTML = `<span class="speaker">${escapeHtml(speaker)} ${badge}</span>${escapeHtml(text)}`;
  } else {
    div.textContent = text;
  }
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
}

function addNote(title, text, tag) {
  const log = document.getElementById("notes-log");
  const now = new Date();
  const time = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}:${now.getSeconds().toString().padStart(2, "0")}`;

  const entry = document.createElement("div");
  entry.className = "note-entry";
  entry.innerHTML = `
    <div class="note-time">${time}</div>
    <div class="note-text"><span class="note-tag tag-${tag}">${tag.toUpperCase()}</span> <strong>${escapeHtml(title)}:</strong> ${escapeHtml(text)}</div>
  `;
  log.insertBefore(entry, log.firstChild);
  if (GAME) GAME.notes.push({ time, title, text, tag });
}

function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = str;
  return d.innerHTML;
}

// ─── Init ───────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", initUI);
