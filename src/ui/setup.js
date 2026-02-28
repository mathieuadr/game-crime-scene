/* ═══════════════════════════════════════════════════════════════
   Setup Screen — Configuration UI before game starts.
   ═══════════════════════════════════════════════════════════════ */

import { events } from '../events.js';
import { store } from '../store.js';
import { isLLMEnabled, isImageEnabled, isVoiceEnabled } from '../services.js';
import { generateCase, generateCaseAI } from '../engine.js';
import { SuspectAgent } from '../agent.js';
import { $, show, hide, setText } from './helpers.js';

export function initSetupScreen() {
  $("btn-start").addEventListener("click", startGame);
  wireStoryModeToggle();
  renderServiceStatus();
}

function wireStoryModeToggle() {
  const btns = document.querySelectorAll(".mode-btn");
  const hint = $("story-mode-hint");
  const themeField = $("ai-theme-field");

  btns.forEach(btn => {
    btn.addEventListener("click", () => {
      btns.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      store.storyMode = btn.dataset.mode;

      if (store.storyMode === "ai") {
        hint.textContent = "An LLM generates a unique story, characters, and clues from scratch.";
        show(themeField);
      } else {
        hint.textContent = "Procedural story from built-in data pools.";
        hide(themeField);
      }
    });
  });
}

function renderServiceStatus() {
  const container = $("service-status");
  if (!container) return;

  const services = [
    { name: "LLM (Chat)", enabled: isLLMEnabled(), icon: "💬" },
    { name: "Images (fal.ai)", enabled: isImageEnabled(), icon: "🖼" },
    { name: "Voice (ElevenLabs)", enabled: isVoiceEnabled(), icon: "🔊" },
  ];

  container.innerHTML = services.map(s =>
    `<span class="service-badge ${s.enabled ? 'service-on' : 'service-off'}">${s.icon} ${s.name}</span>`
  ).join("");
}

async function startGame() {
  const count = parseInt($("suspect-count").value, 10);
  const seed = $("seed-input").value.trim() || Date.now().toString();

  let result;

  if (store.storyMode === "ai") {
    if (!isLLMEnabled()) {
      alert("AI story generation requires an API key. Please configure one in config.js.");
      return;
    }
    const theme = $("ai-theme").value.trim();
    const overlay = $("loading-overlay");
    const statusEl = $("loading-status");
    show(overlay, "flex");
    $("btn-start").disabled = true;

    try {
      result = await generateCaseAI(count, theme, (msg) => { statusEl.textContent = msg; });
    } catch (err) {
      hide(overlay);
      $("btn-start").disabled = false;
      alert("AI generation failed: " + err.message);
      return;
    }

    hide(overlay);
    $("btn-start").disabled = false;
  } else {
    result = generateCase(seed, count);
  }

  store.setCase(result);

  store.agents = {};
  for (const s of store.suspects) {
    store.agents[s.id] = new SuspectAgent(s, store.caseData, store.suspects);
  }

  hide("setup-screen");
  show("game-screen");

  events.emit('game:started', {
    caseData: store.caseData,
    suspects: store.suspects,
  });
}

export function showSetupScreen() {
  show("setup-screen", "flex");
  hide("game-screen");
  hide("interrogation-controls");
  hide("debug-panel");
  store.reset();
  $("chat-log").innerHTML = "";
  $("notes-log").innerHTML = "";
  $("suspect-state").innerHTML = "";
  renderServiceStatus();
}
