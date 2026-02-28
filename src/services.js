/* ═══════════════════════════════════════════════════════════════
   AI Services — Unified facade for all external AI providers.

   ┌─────────────────────────────────────────────────────┐
   │  LLM (chat)     →  Mistral / OpenAI / Groq / Ollama│
   │  Image gen       →  fal.ai (Flux, SDXL, etc.)      │
   │  Voice / TTS     →  ElevenLabs                      │
   └─────────────────────────────────────────────────────┘

   Each section is independent. Features degrade gracefully
   when a service key is missing.
   ═══════════════════════════════════════════════════════════════ */

import { events } from './events.js';

// ─── Configuration ──────────────────────────────────────────

export function getConfig() {
  const cfg = window.CRIME_SCENE_CONFIG || {};
  return {
    llm: {
      enabled: !!cfg.apiKey,
      provider: cfg.provider || "mistral",
      apiKey: cfg.apiKey || "",
      model: cfg.model || "mistral-small-latest",
      baseUrl: cfg.baseUrl || "",
    },
    image: {
      enabled: !!cfg.falApiKey,
      apiKey: cfg.falApiKey || "",
      model: cfg.imageModel || "fal-ai/flux/schnell",
    },
    voice: {
      enabled: !!cfg.elevenLabsApiKey,
      apiKey: cfg.elevenLabsApiKey || "",
      model: cfg.elevenLabsModel || "eleven_multilingual_v2",
    },
  };
}

// ─── LLM (Chat Completion) ─────────────────────────────────

function getLLMBaseUrl(llm) {
  if (llm.baseUrl) return llm.baseUrl.replace(/\/+$/, "");
  const urls = {
    openai:  "https://api.openai.com/v1",
    mistral: "https://api.mistral.ai/v1",
    groq:    "https://api.groq.com/openai/v1",
    ollama:  "http://localhost:11434/v1",
  };
  return urls[llm.provider] || llm.baseUrl || "https://api.openai.com/v1";
}

export async function chatCompletion(messages, opts = {}) {
  const { llm } = getConfig();
  if (!llm.apiKey) throw new Error("API key required for LLM.");

  const baseUrl = getLLMBaseUrl(llm);
  const headers = { "Content-Type": "application/json" };
  if (llm.apiKey) headers["Authorization"] = `Bearer ${llm.apiKey}`;

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: llm.model,
      messages,
      max_tokens: opts.maxTokens || 300,
      temperature: opts.temperature || 0.8,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`LLM API error ${res.status}: ${err}`);
  }

  const data = await res.json();
  return data.choices[0].message.content.trim();
}

export function isLLMEnabled() {
  return getConfig().llm.enabled;
}

// ─── Image Generation (fal.ai) ─────────────────────────────

const _imageCache = new Map();

export async function generateImage(prompt, opts = {}) {
  const { image } = getConfig();
  if (!image.enabled) return null;

  const cacheKey = opts.cacheKey || prompt;
  if (_imageCache.has(cacheKey)) return _imageCache.get(cacheKey);

  events.emit('image:generating', { prompt, cacheKey });

  try {
    const res = await fetch(`https://fal.run/${image.model}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Key ${image.apiKey}`,
      },
      body: JSON.stringify({
        prompt,
        image_size: opts.size || "landscape_4_3",
        num_images: 1,
        ...(opts.params || {}),
      }),
    });

    if (!res.ok) {
      console.warn("Image generation failed:", res.status, await res.text());
      return null;
    }

    const data = await res.json();
    const url = data.images?.[0]?.url || null;

    if (url) {
      _imageCache.set(cacheKey, url);
      events.emit('image:ready', { prompt, url, cacheKey });
    }
    return url;
  } catch (err) {
    console.warn("Image generation error:", err);
    return null;
  }
}

export function isImageEnabled() {
  return getConfig().image.enabled;
}

export function clearImageCache() {
  _imageCache.clear();
}

// ─── Voice / TTS (ElevenLabs) ───────────────────────────────

let _currentAudio = null;
let _availableVoices = null;
const _suspectVoiceAssignments = new Map();

async function fetchAvailableVoices() {
  if (_availableVoices) return _availableVoices;

  const { voice } = getConfig();
  try {
    const res = await fetch("https://api.elevenlabs.io/v1/voices", {
      headers: { "xi-api-key": voice.apiKey },
    });
    if (!res.ok) {
      console.warn("Failed to fetch ElevenLabs voices:", res.status);
      return [];
    }
    const data = await res.json();
    _availableVoices = (data.voices || []).map(v => ({
      id: v.voice_id,
      name: v.name,
      labels: v.labels || {},
      previewUrl: v.preview_url,
    }));
    return _availableVoices;
  } catch (err) {
    console.warn("Error fetching voices:", err);
    return [];
  }
}

function scoreVoiceMatch(voiceLabels, suspect) {
  let score = 0;
  const tone = (suspect.voiceTone || "").toLowerCase();
  const trait = suspect.personality?.trait || "";
  const age = suspect.age || 40;
  const desc = Object.values(voiceLabels).join(" ").toLowerCase();

  const toneKeywords = tone.split(/[\s,]+/).filter(w => w.length > 2);
  for (const kw of toneKeywords) {
    if (desc.includes(kw)) score += 3;
  }

  if (age >= 50 && (desc.includes("old") || desc.includes("mature") || desc.includes("middle"))) score += 2;
  if (age < 35 && (desc.includes("young") || desc.includes("youthful"))) score += 2;

  const traitMap = {
    calm: ["calm", "deep", "authoritative", "confident"],
    nervous: ["anxious", "young", "thin", "weak"],
    arrogant: ["confident", "strong", "deep", "authoritative"],
    shy: ["soft", "gentle", "young", "thin"],
    aggressive: ["strong", "deep", "raspy", "intense", "ground"],
    friendly: ["warm", "friendly", "bright", "pleasant"],
  };
  for (const kw of (traitMap[trait] || [])) {
    if (desc.includes(kw)) score += 2;
  }

  return score;
}

export async function getVoiceIdForSuspect(suspect) {
  if (!suspect) return "";
  if (_suspectVoiceAssignments.has(suspect.id)) return _suspectVoiceAssignments.get(suspect.id);

  const voices = await fetchAvailableVoices();
  if (!voices.length) return "";

  const usedIds = new Set(_suspectVoiceAssignments.values());
  const available = voices.filter(v => !usedIds.has(v.id));
  const pool = available.length ? available : voices;

  const scored = pool.map(v => ({ voice: v, score: scoreVoiceMatch(v.labels, suspect) }));
  scored.sort((a, b) => b.score - a.score);

  const bestId = scored[0].voice.id;
  _suspectVoiceAssignments.set(suspect.id, bestId);
  console.log(`[Voice] Assigned "${scored[0].voice.name}" to ${suspect.name} (tone: ${suspect.voiceTone})`);
  return bestId;
}

export function clearVoiceAssignments() {
  _suspectVoiceAssignments.clear();
  _availableVoices = null;
}

export async function textToSpeech(text, opts = {}) {
  const { voice } = getConfig();
  if (!voice.enabled) return null;

  const voiceId = opts.voiceId;
  if (!voiceId) {
    console.warn("No voice ID provided for TTS.");
    return null;
  }

  events.emit('voice:generating', { text });

  try {
    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "xi-api-key": voice.apiKey,
        },
        body: JSON.stringify({
          text,
          model_id: voice.model,
          voice_settings: {
            stability: opts.stability ?? 0.5,
            similarity_boost: opts.similarity ?? 0.75,
          },
        }),
      }
    );

    if (!res.ok) {
      console.warn("TTS failed:", res.status);
      return null;
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    events.emit('voice:ready', { text, url });
    return url;
  } catch (err) {
    console.warn("TTS error:", err);
    return null;
  }
}

export async function playSuspectVoice(text, suspect) {
  stopVoice();
  const voiceId = await getVoiceIdForSuspect(suspect);
  if (!voiceId) return null;

  const url = await textToSpeech(text, { voiceId });
  if (!url) return null;

  _currentAudio = new Audio(url);
  _currentAudio.addEventListener('ended', () => {
    events.emit('voice:ended', { text });
    _currentAudio = null;
  });
  events.emit('voice:playing', { text, audio: _currentAudio });
  _currentAudio.play();
  return _currentAudio;
}

export function stopVoice() {
  if (_currentAudio) {
    _currentAudio.pause();
    _currentAudio.currentTime = 0;
    _currentAudio = null;
  }
}

export function isVoiceEnabled() {
  return getConfig().voice.enabled;
}

// ─── Speech-to-Text (Web Speech API) ────────────────────

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

let _recognition = null;
let _sttActive = false;

export function isSTTSupported() {
  return !!SpeechRecognition;
}

export function isSTTActive() {
  return _sttActive;
}

export function startSTT(opts = {}) {
  if (!SpeechRecognition) {
    console.warn("Speech recognition not supported in this browser.");
    return;
  }

  stopSTT();

  _recognition = new SpeechRecognition();
  _recognition.lang = opts.lang || "en-US";
  _recognition.continuous = false;
  _recognition.interimResults = true;

  _recognition.addEventListener("start", () => {
    _sttActive = true;
    events.emit("stt:start");
  });

  _recognition.addEventListener("result", (e) => {
    const transcript = Array.from(e.results)
      .map(r => r[0].transcript)
      .join("");
    const isFinal = e.results[e.results.length - 1].isFinal;
    events.emit("stt:result", { transcript, isFinal });
  });

  _recognition.addEventListener("end", () => {
    _sttActive = false;
    events.emit("stt:end");
  });

  _recognition.addEventListener("error", (e) => {
    _sttActive = false;
    console.warn("STT error:", e.error);
    events.emit("stt:error", { error: e.error });
  });

  _recognition.start();
}

export function stopSTT() {
  if (_recognition) {
    try { _recognition.stop(); } catch (_) {}
    _recognition = null;
    _sttActive = false;
  }
}
