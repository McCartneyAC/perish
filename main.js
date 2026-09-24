// main.js — initialization only
// Loads save, bootstraps state, wires events, starts loop.

"use strict";

// Shuffle foundational text unlock thresholds so each run feels different.
// Builds a map of { perkId -> unlocksAt } and stores it on window so
// visibleWhen functions can read it. Called once per session (not per save).
function shuffleFoundationalTexts() {
  const thresholds = [20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100, 105, 110, 115];
  const ids = Object.entries(window.PERKS ?? {})
    .filter(([, p]) => p.category === "foundational_text")
    .map(([id]) => id);

  // Fisher-Yates shuffle of thresholds
  for (let i = thresholds.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [thresholds[i], thresholds[j]] = [thresholds[j], thresholds[i]];
  }

  window.FOUNDATIONAL_TEXT_THRESHOLDS = {};
  ids.forEach((id, i) => {
    window.FOUNDATIONAL_TEXT_THRESHOLDS[id] = thresholds[i] ?? 20;
  });
}

document.addEventListener("DOMContentLoaded", () => {

  // Try to load saved game (migrated + deep-merged); fall back to fresh state
  const loaded = loadGame();
  if (!loaded) window.state = cloneState(DEFAULT_STATE);

  // Paper tier histograms need a fixed shape (one 151-slot array per tier)
  ensurePaperTiers();

  // Shuffle foundational text unlock order for this session
  shuffleFoundationalTexts();

  // Roll birth traits if this is a new game or traits weren't saved
  rollBirthTraitsIfNeeded();

  // Build modifier cache from loaded affiliations/traits
  rebuildModifiers();

  // Start this level's landmark if a save arrived here without it running
  ensureLevelLandmark();

  // Saves from before university names existed get one
  ensureUniversityName();

  // Wire all button event listeners
  wireEvents();

  // Initial render before loop starts
  render();

  // Start the tick loop
  startGameLoop();
});
