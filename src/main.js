/* ═══════════════════════════════════════════════════════════════
   CRIME SCENE — Main Entry Point
   Wires all modules together. This is the only file loaded
   by index.html via <script type="module">.
   ═══════════════════════════════════════════════════════════════ */

import { events } from './events.js';
import { store } from './store.js';
import { isImageEnabled, isVoiceEnabled, isSTTSupported } from './services.js';
import { initSetupScreen } from './ui/setup.js';
import { initGameScreen } from './ui/game.js';

function init() {
  initSetupScreen();
  initGameScreen();

  events.on('game:started', ({ caseData }) => {
    console.log(`[Crime Scene] Case started — seed: ${caseData.seed}, culprit: ${caseData.culpritId}`);
    if (isImageEnabled()) console.log("[Crime Scene] Image generation enabled (fal.ai)");
    if (isVoiceEnabled()) console.log("[Crime Scene] Voice enabled (ElevenLabs — auto-assigned per suspect)");
    if (isSTTSupported()) console.log("[Crime Scene] Speech-to-Text available (Web Speech API)");
  });
}

document.addEventListener("DOMContentLoaded", init);
