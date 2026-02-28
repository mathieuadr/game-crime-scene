/* ═══════════════════════════════════════════════════════════════
   EventBus — Lightweight publish/subscribe for decoupled features.
   Subscribe to game events to add voice, images, sounds, etc.
   without modifying existing code.
   ═══════════════════════════════════════════════════════════════ */

class EventBus {
  constructor() {
    this._listeners = new Map();
  }

  on(event, fn) {
    if (!this._listeners.has(event)) this._listeners.set(event, []);
    this._listeners.get(event).push(fn);
    return () => this.off(event, fn);
  }

  off(event, fn) {
    const list = this._listeners.get(event);
    if (list) this._listeners.set(event, list.filter(f => f !== fn));
  }

  emit(event, data) {
    const list = this._listeners.get(event);
    if (list) list.forEach(fn => { try { fn(data); } catch (e) { console.error(`Event "${event}" handler error:`, e); } });
  }

  once(event, fn) {
    const unsub = this.on(event, (data) => { unsub(); fn(data); });
    return unsub;
  }
}

export const events = new EventBus();
