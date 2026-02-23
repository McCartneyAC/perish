// main.js

const SAVE_KEY = "pop_save_v1";

function saveGame() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn("Save failed:", e);
  }
}

function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;

    const saved = JSON.parse(raw);

    // merge into existing state object (do NOT replace const state)
    Object.assign(state, saved);

    // defensive defaults if older saves are missing fields
    state.papers = state.papers || [];
    state.studyGroups = state.studyGroups || { undergrad: false, masters: false, doctoral: false };
    state.modifiers = state.modifiers || {
      knowledgeMult: 1, paperMult: 1, writeCostMult: 1, citationMult: 1, energyRegenMult: 1
    };
    state.identity = state.identity || { major: "undeclared", reputation: 50, resilience: 50, ambition: 50, network: 50 };
    state.traits = state.traits || {};

    return true;
  } catch (e) {
    console.warn("Load failed (starting new game):", e);
    return false;
  }
}

// Try load first. If no save, initialize new game.
const loaded = loadGame();
if (!loaded) initNewGame();

// Autosave frequently (every tick is fine for a small game)
setInterval(() => {
  tick();
  saveGame();
}, TICK_MS);
