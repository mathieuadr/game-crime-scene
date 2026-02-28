/* ═══════════════════════════════════════════════════════════════
   GameStore — Centralized game state.
   All mutable state lives here; UI and services read from it.
   ═══════════════════════════════════════════════════════════════ */

import { events } from './events.js';

class GameStore {
  constructor() {
    this.reset();
  }

  reset() {
    this.caseData = null;
    this.suspects = [];
    this.agents = {};
    this.selectedSuspectId = null;
    this.notes = [];
    this.storyMode = "classic";
    this.rng = null;

    this.assets = {
      crimeScene: null,
      weapon: null,
      suspectPortraits: {},
    };
  }

  setCase({ caseData, suspects, rng }) {
    this.caseData = caseData;
    this.suspects = suspects;
    this.rng = rng;
    this.notes = [];
    this.selectedSuspectId = null;
    this.assets = { crimeScene: null, weapon: null, suspectPortraits: {} };
  }

  selectSuspect(id) {
    this.selectedSuspectId = id;
    const suspect = this.suspects.find(s => s.id === id);
    events.emit('suspect:selected', { suspectId: id, suspect });
  }

  get selectedSuspect() {
    return this.suspects.find(s => s.id === this.selectedSuspectId) || null;
  }

  get selectedAgent() {
    return this.agents[this.selectedSuspectId] || null;
  }

  addNote(note) {
    this.notes.push(note);
    events.emit('note:added', note);
  }
}

export const store = new GameStore();
