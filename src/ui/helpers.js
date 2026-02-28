/* ═══════════════════════════════════════════════════════════════
   UI Helpers — Shared DOM utilities, escaping, component creation.
   ═══════════════════════════════════════════════════════════════ */

const _escapeDiv = document.createElement("div");

export function escapeHtml(str) {
  _escapeDiv.textContent = str;
  return _escapeDiv.innerHTML;
}

export function $(selector) {
  return document.getElementById(selector) || document.querySelector(selector);
}

export function show(el, display = "block") {
  if (typeof el === "string") el = $(el);
  if (el) el.style.display = display;
}

export function hide(el) {
  if (typeof el === "string") el = $(el);
  if (el) el.style.display = "none";
}

export function setText(el, text) {
  if (typeof el === "string") el = $(el);
  if (el) el.textContent = text;
}

export function addChatBubble(type, text, speaker = "", isLLM = false) {
  const log = $("chat-log");
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
  return div;
}

export function addTypingIndicator(name) {
  const log = $("chat-log");
  const div = document.createElement("div");
  const id = "typing_" + Date.now();
  div.id = id;
  div.className = "chat-bubble answer typing";
  div.innerHTML = `<span class="speaker">${escapeHtml(name)}</span><span class="typing-dots"><span>.</span><span>.</span><span>.</span></span>`;
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
  return id;
}

export function removeTypingIndicator(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
}

export function addNote(store, title, text, tag) {
  const log = $("notes-log");
  const now = new Date();
  const time = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}:${now.getSeconds().toString().padStart(2, "0")}`;

  const entry = document.createElement("div");
  entry.className = "note-entry";
  entry.innerHTML = `
    <div class="note-time">${time}</div>
    <div class="note-text"><span class="note-tag tag-${tag}">${tag.toUpperCase()}</span> <strong>${escapeHtml(title)}:</strong> ${escapeHtml(text)}</div>
  `;
  log.insertBefore(entry, log.firstChild);
  store.addNote({ time, title, text, tag });
}
