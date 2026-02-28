# Crime Scene — A Deductive Mystery Game

A noir detective mystery game where you interrogate suspects, find contradictions, and solve the case.

## How to Run

Serve this folder with any local server, then open in a browser:

```bash
python3 -m http.server 8000
# or
npx serve .
```

Then open `http://localhost:8000`.

## AI Services (all optional)

| Service | Provider | Purpose |
|---------|----------|---------|
| LLM | Mistral / OpenAI / Groq / Ollama | AI-powered suspect dialogues |
| Images | fal.ai | Generate crime scene & portrait images |
| Voice | ElevenLabs | Text-to-speech for suspects |
| STT | Web Speech API (built-in) | Speech-to-text input |

Configure API keys in `config.js` (gitignored). See `index.html` header comments for the config format.

---

## Design System

### Philosophy

The UI is designed to feel like a real detective game, not a SaaS dashboard.
Inspirations: L.A. Noire, Disco Elysium, Her Story, Return of the Obra Dinn, Orwell.
Overall mood: **dark, noir, analog, tense, cinematic**.

### Color Palette

| Token | Hex | Usage |
|-------|-----|-------|
| `--bg-deep` | `#0A0A0F` | Primary background |
| `--bg-surface` | `#12121A` | Panel backgrounds |
| `--bg-elevated` | `#1A1A24` | Elevated surfaces, inputs |
| `--gold` | `#C8A96E` | Primary accent (UI highlights, borders) |
| `--gold-dim` | `#9A7E4F` | Secondary gold (labels, inactive) |
| `--blood` | `#8B1A1A` | Danger, confront, contradiction |
| `--parchment` | `#E8DCC8` | Primary text |
| `--muted` | `#6B7280` | Secondary text, labels |
| `--cleared` | `#2D5A27` | Confirmed alibi, success states |

### Typography

All loaded from Google Fonts:

| Font | CSS Variable | Usage |
|------|-------------|-------|
| Special Elite | `--font-title` | Titles, suspect names, case headers (typewriter feel) |
| IBM Plex Mono | `--font-body` | Body text, dialogue, timestamps (clean monospace) |
| Bebas Neue | `--font-label` | UI labels, buttons, section headings (bold impact) |

### Global Visual Effects

Applied across all screens:

1. **Film grain** — SVG noise texture at ~7% opacity, fixed over entire viewport
2. **Vignette** — Radial gradient darkening screen edges
3. **Scanlines** — Optional CRT effect, toggled via `.scanlines-on` class on `<body>`
4. **Page transitions** — 300ms cross-fade with vertical slide between setup/game screens

### Sound Effects

Managed by `SoundManager` (`src/ui/sound.js`):

```javascript
import { soundManager } from './ui/sound.js';

soundManager.play('typewriter');    // play a named sound
soundManager.toggleMute();          // toggle mute (persisted in localStorage)
soundManager.isMuted();             // check mute state
soundManager.preloadAll();          // preload all sound files
```

Available sound names: `typewriter`, `paper-rustle`, `folder-snap`, `vhs-static`, `alarm`, `key-click`.

Place `.mp3` files in `assets/sounds/`. See `assets/sounds/README.md` for details.

### Animation Utilities

Reusable JS animation helpers (`src/ui/animations.js`):

| Function | Description |
|----------|-------------|
| `typewriterReveal(el, text, opts)` | Character-by-character text reveal with sound |
| `typewriterChat(el, text, opts)` | Same but optimized for chat bubbles (faster) |
| `glitchFlicker(el, opts)` | Red/cyan glitch effect (title screen) |
| `shakeElement(el, opts)` | Brief horizontal shake (contradiction, confront) |
| `flashEdge(color, opts)` | Flash screen edges in a color (red for danger) |
| `pageTransition(outEl, inEl, cb)` | Cinematic cross-fade between screens |

### Asset Structure

```
assets/
├── sounds/          # Short .mp3 sound effects
├── textures/        # Optional texture images (paper, concrete)
└── videos/          # Background video for landing (bg-loop.mp4)
```

### UI Components

| Component | File | Styling |
|-----------|------|---------|
| Landing / Setup | `src/ui/setup.js` | Classified dossier card, video background, typewriter title |
| Suspect Panel | `src/ui/game.js` (renderSuspectList) | Polaroid cards, status stamps, suspicion bars |
| Chat Area | `src/ui/game.js` + `helpers.js` | VHS-style suspect bubbles, handwritten inspector messages |
| Action Buttons | `index.html` + `style.css` | Mechanical keycap buttons with 3D press effect |
| Notes Panel | `src/ui/helpers.js` (addNote) | Detective notebook, washi tape tags, contradiction flash |

### Key CSS Classes

| Class | Effect |
|-------|--------|
| `.btn-keycap` | Mechanical keyboard key button with 3D shadow |
| `.btn-confront` | Red-glowing confront button |
| `.btn-pressure` | Heat gradient button (2s hover transition) |
| `.btn-cta` | Gold-bordered call-to-action with folder-flap hover |
| `.suspect-item.active` | Raised polaroid with gold glow |
| `.notes-panel.flash-border` | Red border flash on contradiction |
| `.glitch-active` | Red/cyan glitch text effect |
| `.anim-shake` | Horizontal shake animation |
