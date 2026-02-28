/* ═══════════════════════════════════════════════════════════════
   ElevenLabs Conversational AI — Real-time voice session manager.

   Each suspect gets a fresh WebSocket session when selected.
   The session handles the full STT → custom LLM → TTS pipeline
   in one low-latency round-trip managed by ElevenLabs servers.

   SDK: @11labs/client  (loaded from CDN via esm.sh, no build step)
   ═══════════════════════════════════════════════════════════════ */

import { events } from './events.js';

// ── SDK (lazy-loaded on first use) ───────────────────────────

let _Conversation = null;

async function loadSDK() {
  if (_Conversation) return _Conversation;
  const mod = await import('https://esm.sh/@11labs/client');
  _Conversation = mod.Conversation;
  return _Conversation;
}

// ── Session state ────────────────────────────────────────────

let _session    = null;
let _suspectId  = null;
let _connecting = false;

// ── Public API ───────────────────────────────────────────────

/**
 * Start a real-time voice session for a suspect.
 * Any previously active session is closed first.
 *
 * @param {object}      suspect      - Suspect profile from game data
 * @param {string}      systemPrompt - From SuspectAgent.buildSystemPrompt()
 * @param {string|null} voiceId      - ElevenLabs voice ID for this suspect
 * @param {string}      agentId      - ElevenLabs Conversational AI agent ID
 */
export async function startSuspectSession(suspect, systemPrompt, voiceId, agentId) {
  if (_connecting) return;
  _connecting = true;

  try {
    await endCurrentSession();

    const Conversation = await loadSDK();

    const session = await Conversation.startSession({
      agentId,
      overrides: {
        agent: {
          prompt:       { prompt: systemPrompt },
          firstMessage: buildFirstMessage(suspect),
        },
        ...(voiceId ? { tts: { voiceId } } : {}),
      },

      onConnect: ({ conversationId }) => {
        events.emit('conversation:connected', { conversationId, suspectId: suspect.id });
      },

      onDisconnect: () => {
        _session   = null;
        _suspectId = null;
        events.emit('conversation:disconnected', { suspectId: suspect.id });
      },

      onMessage: ({ message, source }) => {
        // source: 'ai' | 'user'
        events.emit('conversation:message', { text: message, source, suspectId: suspect.id });
      },

      onError: (message, context) => {
        console.error('[Conversation] Error:', message, context);
        events.emit('conversation:error', { error: message, context, suspectId: suspect.id });
      },

      onStatusChange: ({ status }) => {
        events.emit('conversation:status', { status, suspectId: suspect.id });
      },

      onModeChange: ({ mode }) => {
        // mode: 'listening' | 'speaking'
        events.emit('conversation:mode', { mode, suspectId: suspect.id });
      },
    });

    _session   = session;
    _suspectId = suspect.id;

  } finally {
    _connecting = false;
  }
}

/**
 * Close the active voice session gracefully.
 */
export async function endCurrentSession() {
  if (_session) {
    try { await _session.endSession(); } catch (_) {}
    _session   = null;
    _suspectId = null;
  }
}

/**
 * Send typed text into the active conversation.
 * Returns false if no session is active.
 */
export function sendTextInput(text) {
  if (_session) {
    _session.sendUserInput(text);
    return true;
  }
  return false;
}

export const isActive        = () => !!_session;
export const activeSuspectId = () => _suspectId;

// ── Helpers ──────────────────────────────────────────────────

function buildFirstMessage(suspect) {
  const openers = {
    calm:       `Inspector. I'll answer your questions.`,
    nervous:    `I— I've been waiting. What do you want to know?`,
    arrogant:   `I hope this won't take long, Inspector.`,
    shy:        `...Hello, Inspector.`,
    aggressive: `Let's get this over with.`,
    friendly:   `Inspector! I want to help however I can.`,
  };
  return openers[suspect.personality?.trait] ?? `Inspector. I'm ready.`;
}
