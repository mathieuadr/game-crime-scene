/* ═══════════════════════════════════════════════════════════════
   Setup Screen — Configuration UI before game starts.
   ═══════════════════════════════════════════════════════════════ */

import { events } from '../events.js';
import { store } from '../store.js';
import { isLLMEnabled, isImageEnabled, isVoiceEnabled } from '../services.js';
import { generateCase, generateCaseAI } from '../engine.js';
import { SuspectAgent } from '../agent.js';
import { $, show, hide, setText } from './helpers.js';
import { typewriterReveal, glitchFlicker, pageTransition } from './animations.js';
import { soundManager } from './sound.js';

let _titleLoopRunning = false;
const sleep = ms => new Promise(r => setTimeout(r, ms));

export function initSetupScreen() {
  $("btn-start").addEventListener("click", startGame);
  wireStoryModeToggle();
  renderServiceStatus();
  wireMuteToggle();
  animateTitle();
  soundManager.preloadAll();

  document.addEventListener('click', () => soundManager.playBg('bg-menu'), { once: true });
}

function wireMuteToggle() {
  const btn = $("btn-mute");
  if (!btn) return;
  if (soundManager.isMuted()) btn.classList.add('muted');
  btn.addEventListener("click", () => {
    const muted = soundManager.toggleMute();
    btn.classList.toggle('muted', muted);
    btn.innerHTML = muted ? '&#128263;' : '&#128264;';
  });
}

async function animateTitle() {
  if (_titleLoopRunning) return;
  _titleLoopRunning = true;
  const el = $("title-text");
  if (!el) return;
  const sub = $("subtitle-text");
  let firstRun = true;

  while (_titleLoopRunning) {
    await typewriterReveal(el, "CRIME SCENE", { speed: 80, soundEvery: 2 });
    await glitchFlicker(el);
    if (firstRun && sub) {
      sub.classList.add("visible");
      firstRun = false;
    }
    await sleep(3500);
    el.style.transition = 'opacity .6s ease';
    el.style.opacity = '0';
    await sleep(600);
    el.textContent = '';
    el.style.opacity = '1';
    el.style.transition = '';
    await sleep(800);
  }
}

function wireStoryModeToggle() {
  const btns = document.querySelectorAll(".mode-btn");
  const hint = $("story-mode-hint");
  const themeField = $("ai-theme-field");
  const seedField = $("classic-seed-field");

  // Sync to the initially active button (AI by default)
  store.storyMode = "ai";

  btns.forEach(btn => {
    btn.addEventListener("click", () => {
      btns.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      store.storyMode = btn.dataset.mode;
      soundManager.play('key-click');

      if (store.storyMode === "ai") {
        hint.textContent = "An LLM generates a unique story, characters, and clues from scratch.";
        show(themeField);
        hide(seedField);
      } else {
        hint.textContent = "Procedural story from built-in data pools.";
        hide(themeField);
        show(seedField);
      }
    });
  });
}

function renderServiceStatus() {
  const container = $("service-status");
  if (!container) return;

  const services = [
    { name: "LLM", enabled: isLLMEnabled(), icon: "[X]" },
    { name: "Images", enabled: isImageEnabled(), icon: "[X]" },
    { name: "Voice", enabled: isVoiceEnabled(), icon: "[X]" },
  ];

  container.innerHTML = services.map(s =>
    `<span class="service-badge ${s.enabled ? 'service-on' : 'service-off'}">${s.enabled ? s.icon : '[ ]'} ${s.name}</span>`
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
    soundManager.playBg('bg-loading');

    try {
      result = await generateCaseAI(count, theme, (msg) => { statusEl.textContent = msg; });
    } catch (err) {
      hide(overlay);
      $("btn-start").disabled = false;
      soundManager.playBg('bg-menu');
      alert("AI generation failed: " + err.message);
      return;
    }

    hide(overlay);
    $("btn-start").disabled = false;
    soundManager.playBg('bg-menu');
  } else {
    result = generateCase(seed, count);
  }

  store.setCase(result);

  store.agents = {};
  for (const s of store.suspects) {
    store.agents[s.id] = new SuspectAgent(s, store.caseData, store.suspects);
  }

  soundManager.play('folder-snap');

  const setupEl = $("setup-screen");
  const gameEl = $("game-screen");

  events.emit('game:started', {
    caseData: store.caseData,
    suspects: store.suspects,
  });

  pageTransition(setupEl, gameEl, null, 'block');
}

export function showSetupScreen() {
  const setupEl = $("setup-screen");
  const gameEl = $("game-screen");

  soundManager.playBg('bg-menu');
  show(setupEl, "flex");
  hide(gameEl);
  hide("interrogation-controls");
  hide("debug-panel");
  store.reset();
  $("chat-log").innerHTML = "";
  $("notes-log").innerHTML = "";
  $("suspect-state").innerHTML = "";
  renderServiceStatus();
}
