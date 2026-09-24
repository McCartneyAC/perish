// systems.js — game loop and autosave
// Runs on a fixed tick interval. No DOM access here — that's render.js.

"use strict";

const SAVE_KEY = "polp_save_v1";   // storage key stays fixed; the version lives inside the save
const CURRENT_SAVE_VERSION = DEFAULT_STATE.saveVersion;

// Tick counter lives here, not in state — it's runtime bookkeeping, not progress.
let tickCount = 0;

// ── Game tick ─────────────────────────────────────────────────────────
function tick() {
  // Energy regeneration (respects burnout cooldown)
  if (!inCooldown()) {
    const regenRate = ENERGY_REGEN_PER_TICK * (state.modifiers?.energyRegenMult ?? 1);
    state.energy = Math.min(ENERGY_MAX, state.energy + regenRate);
  }

  // Passive perk ticks (study groups, etc.)
  tickPerks();

  // Milestone events: drop stale picks, offer one if a newly eligible event appeared
  maybeSelectMilestone();

  // Citation accumulation
  tickCitations();

  // Money, the lab, and the tenure clock
  tickEconomy();
  tickGradStudents();
  tickTenureClock();

  // Citations grow and debt shifts on their own, so once a second check for
  // promotion and refresh modifiers (debt stress, alumni citations)
  if (tickCount % 10 === 0) {
    tryLevelUp();
    rebuildModifiers();
  }

  // Landmark decay and advisor notes
  tickLandmarkDecay();
  maybeFireAdvisorNote();

  // Autosave every 300 ticks (~30 seconds)
  tickCount += 1;
  if (tickCount % 300 === 0) saveGame();

  render();
}

// ── Save migration ────────────────────────────────────────────────────
// A save is loaded in two passes:
//   1. migrateSave() walks it from its saveVersion up to CURRENT_SAVE_VERSION,
//      running MIGRATIONS[v] to get from v to v+1. A missing entry is a no-op.
//   2. deepMerge() lays it over a fresh DEFAULT_STATE, so any field added to
//      DEFAULT_STATE since the save was written gets its default value.
//
// Adding a field → no migration needed, the merge handles it.
// Renaming, moving, or deleting a field → bump saveVersion in state.js and
// add a migration here. The merge keeps keys it doesn't recognise (it has to:
// perks, flags, and the like are open-ended maps), so removed fields only go
// away if a migration deletes them.

const MIGRATIONS = {
  // v1 → v2: baseline for the modularization refactor. Nothing to transform;
  // the tick counter moved out of state, so drop the stale copy.
  1: (s) => {
    delete s._tickCount;
    return s;
  },

  // v2 → v3: one citation histogram became one per quality tier. Papers from
  // before tiers existed keep their citations and count as "competent" (tier 1).
  // ensurePaperTiers() pads everything to full shape after the merge.
  2: (s) => {
    s.papers = isPlainObject(s.papers) ? s.papers : {};
    if (!Array.isArray(s.papers.tiers)) {
      const old = Array.isArray(s.papers.buckets) ? s.papers.buckets : [];
      s.papers.tiers = [[], old.slice()];
    }
    delete s.papers.buckets;
    return s;
  }
};

function isPlainObject(x) {
  return x !== null && typeof x === "object" && !Array.isArray(x);
}

// Walk the default's shape, taking the save's value wherever it fits.
//  - objects: recurse key by key; keep any extra keys the save has
//  - arrays:  the save's array wins whole (never merged index by index)
//  - null defaults: nullable slots (ids, scores) — the save's value wins
//  - primitives: the save wins if it has the same type, else the default
function deepMerge(def, saved) {
  if (saved === undefined) return cloneState(def);

  if (isPlainObject(def)) {
    if (!isPlainObject(saved)) return cloneState(def);
    const out = {};
    for (const key of Object.keys(def))   out[key] = deepMerge(def[key], saved[key]);
    for (const key of Object.keys(saved)) if (!(key in def)) out[key] = saved[key];
    return out;
  }

  if (Array.isArray(def)) return Array.isArray(saved) ? saved : cloneState(def);
  if (def === null)       return saved;
  return typeof saved === typeof def ? saved : def;
}

function migrateSave(saved) {
  let v = Number.isInteger(saved.saveVersion) ? saved.saveVersion : 1;
  if (v > CURRENT_SAVE_VERSION) {
    console.warn(`Save is from a newer version (v${v} > v${CURRENT_SAVE_VERSION}); loading anyway.`);
    return saved;
  }
  while (v < CURRENT_SAVE_VERSION) {
    const step = MIGRATIONS[v];
    if (typeof step === "function") saved = step(saved) ?? saved;
    v += 1;
    saved.saveVersion = v;
  }
  return saved;
}

// ── Save / Load ───────────────────────────────────────────────────────
function saveGame() {
  try {
    state.lastSaved = Date.now();
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn("Save failed:", e);
  }
}

function loadGame() {
  let raw = null;
  try {
    raw = localStorage.getItem(SAVE_KEY);
  } catch (e) {
    console.warn("Load failed (storage unavailable):", e);
    return false;
  }
  if (!raw) return false;

  try {
    const saved = JSON.parse(raw);
    if (!isPlainObject(saved)) throw new Error("save is not an object");

    // Keep a copy of the pre-migration save, one per old version, so a bad
    // migration never costs a playtest save.
    const fromVersion = Number.isInteger(saved.saveVersion) ? saved.saveVersion : 1;
    if (fromVersion < CURRENT_SAVE_VERSION) {
      localStorage.setItem(`${SAVE_KEY}_backup_v${fromVersion}`, raw);
    }

    window.state = deepMerge(DEFAULT_STATE, migrateSave(saved));
    window.state.saveVersion = CURRENT_SAVE_VERSION;
    return true;
  } catch (e) {
    // Don't let the next autosave silently overwrite an unreadable save.
    try { localStorage.setItem(`${SAVE_KEY}_unreadable_${Date.now()}`, raw); } catch (_) {}
    console.warn("Load failed; starting fresh. The unreadable save was kept under a backup key.", e);
    return false;
  }
}

function resetGame() {
  localStorage.removeItem(SAVE_KEY);
  window.state = cloneState(DEFAULT_STATE);
  ensurePaperTiers();
  rollBirthTraitsIfNeeded();
  rebuildModifiers();
  render();
}

let tickInterval = null;

function startGameLoop() {
  if (tickInterval) clearInterval(tickInterval);
  tickInterval = setInterval(tick, TICK_MS);
}
