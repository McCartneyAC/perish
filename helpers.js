// helpers.js — pure logic functions
// These functions know about state shape and content structure,
// but never reference specific content by name (no "sat", "robotics", etc.)
// All content-specific behavior lives in content.js.

"use strict";

// =====================================================================
// MATH UTILITIES
// =====================================================================

function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }
function rand01()          { return Math.random(); }
function randInt(lo, hi)   { return Math.floor(lo + rand01() * (hi - lo + 1)); }

// Box-Muller approximation via sum of uniforms
function approxNormal(mean, sd) {
  let s = 0;
  for (let i = 0; i < 6; i++) s += (Math.random() * 2 - 1);
  return mean + (s / 6) * sd;
}

// Trait normalization helpers
function trait01(x)       { return clamp(x, 0, 100) / 100; }
function traitCentered(x) { return (clamp(x, 0, 100) - 50) / 50; }  // → -1..+1

// =====================================================================
// ENERGY & BURNOUT
// =====================================================================

function inCooldown() {
  return Date.now() < (state.cooldownUntil ?? 0);
}

function effectiveCooldownMs() {
  const t   = state.traits || {};
  const c   = traitCentered(t.conscientiousness ?? 50);
  const n   = traitCentered(t.neuroticism       ?? 50);
  const mult = (1 - CONSC_COOLDOWN_MAX * c) * (1 + NEURO_COOLDOWN_MAX * n);
  return Math.floor(BASE_COOLDOWN_MS * clamp(mult, 0.6, 1.8));
}

// Returns true if energy was spent; triggers burnout if energy hits 0
function spendEnergy(cost) {
  if (inCooldown()) return false;
  if (state.energy <= 0) {
    state.cooldownUntil = Date.now() + effectiveCooldownMs();
    return false;
  }
  state.energy = Math.max(0, state.energy - cost);
  if (state.energy === 0) {
    state.cooldownUntil = Date.now() + effectiveCooldownMs();
  }
  return true;
}
// =====================================================================
// TRAIT ROLLING
// =====================================================================

// Standard normal draw (Box–Muller). approxNormal() above is much narrower
// than its sd suggests (~0.24 × sd); SAT/GRE were tuned against it, so it stays.
function randNormal(mean, sd) {
  const z = Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());
  return mean + z * sd;
}

function rollIQ() {
  return clamp(Math.round(randNormal(100, 15)), 55, 145);
}

function rollTrait0to100() {
  return clamp(Math.round(rand01() * 100), 0, 100);
}

function rollBirthTraitsIfNeeded() {
  if (state.traits?.rolled) return;
  state.traits = state.traits || {};
  state.traits.iq                = rollIQ();
  state.traits.conscientiousness = rollTrait0to100();
  state.traits.agreeableness     = rollTrait0to100();
  state.traits.neuroticism       = rollTrait0to100();
  state.traits.openness          = rollTrait0to100();
  state.traits.extraversion      = rollTrait0to100();
  state.traits.ses               = rollTrait0to100();
  state.traits.visibility        = "hidden";
  state.traits.bigFiveAwareness  = false;
  state.traits.rolled            = true;
}

// =====================================================================
// MODIFIERS — rebuilt each tick from affiliations, majors, clubs, perks
// =====================================================================

function rebuildModifiers() {
  // Reset to baseline
  const m = state.modifiers;
  m.knowledgeMult      = 1;
  m.paperMult          = 1;
  m.writeCostMult      = 1;
  m.citationMult       = 1;
  m.energyRegenMult    = 1;
  m.paperQualityBonus  = 0;
  m.grantAptitudeBonus = 0;
  m.pubTypeMult        = { conference: 1, journal: 1, chapter: 1, monograph: 1 };

  // Apply trait effects
  const t   = state.traits || {};
  const iq  = traitCentered(clamp(((t.iq ?? 100) - 70) / 60 * 100, 0, 100));
  const c   = traitCentered(t.conscientiousness ?? 50);
  const n   = traitCentered(t.neuroticism       ?? 50);
  const o   = traitCentered(t.openness          ?? 50);

  m.knowledgeMult     *= (1 + IQ_KNOWLEDGE_MAX    * iq);
  m.writeCostMult     *= (1 - CONSC_WRITE_MAX      * c);
  m.energyRegenMult   *= (1 - NEURO_COOLDOWN_MAX   * n * 0.3);
  m.paperMult         *= (1 + OPENNESS_PAPER_MAX   * o);

  // Apply all active affiliation effects — clubs (any slot) and majors.
  // We loop over all affiliation slots rather than hardcoding slot names,
  // so adding new slots (hs_club, college_club, future) requires no changes here.
  const allRegistries = [window.CLUBS, window.MAJORS, window.SPORTS].filter(Boolean);
  for (const [, affiliatedId] of Object.entries(state.affiliations ?? {})) {
    if (!affiliatedId) continue;
    for (const registry of allRegistries) {
      if (registry[affiliatedId]) {
        applyAffiliationModifiers(registry[affiliatedId]);
        break;
      }
    }
  }

  // Owned perks with lasting modifiers (e.g. perfect attendance, office hours)
  for (const [perkId, owned] of Object.entries(state.perks ?? {})) {
    if (!owned) continue;
    const perk = window.PERKS?.[perkId];
    if (perk?.effects) applyAffiliationModifiers(perk);
  }
}

// Generic modifier applicator — reads the nested effects format from content.js
function applyAffiliationModifiers(affiliation) {
  const fx = affiliation.effects;
  if (!fx) return;
  const m = state.modifiers;

  if (fx.modifiers) {
    for (const [key, val] of Object.entries(fx.modifiers)) {
      if (m[key] !== undefined) m[key] *= val;
    }
  }

  if (fx.pubTypeMult) {
    for (const [type, val] of Object.entries(fx.pubTypeMult)) {
      m.pubTypeMult[type] = (m.pubTypeMult[type] ?? 1) * val;
    }
  }

  if (fx.paperQualityBonus) {
    m.paperQualityBonus += fx.paperQualityBonus;
  }

  if (fx.grantAptitudeBonus) {
    m.grantAptitudeBonus += fx.grantAptitudeBonus;
  }
}

// =====================================================================
// AFFILIATION JOINING
// One-time trait deltas and identity deltas are applied here, not in rebuildModifiers.
// =====================================================================

// One-time deltas shared by affiliations and perks: traits, identity, prestige.
// (Lasting multipliers live in effects.modifiers and are rebuilt, not applied here.)
function applyOneTimeEffects(fx) {
  if (!fx) return;

  if (fx.traits) {
    for (const [trait, delta] of Object.entries(fx.traits)) {
      if (state.traits[trait] !== undefined) {
        state.traits[trait] = clamp(state.traits[trait] + delta, 0, 100);
      }
    }
  }

  if (fx.identity) {
    state.identity = state.identity || {};
    for (const [key, delta] of Object.entries(fx.identity)) {
      state.identity[key] = (state.identity[key] ?? 0) + delta;
    }
  }

  if (fx.prestigeDelta) addPrestige(fx.prestigeDelta);
}

// High schoolers don't have a university yet. Prestige earned in HS is banked
// in hsPrestige and added on top of the SAT-derived prestige at admission
// (see applyPrestigeFromTest). If the SAT already admitted you, it lands now too.
function addPrestige(delta) {
  if (state.levelIndex === 0) {
    state.hsPrestige = (state.hsPrestige ?? 0) + delta;
    if (satAdmitted()) state.universityPrestige = clamp(state.universityPrestige + delta, 0, 100);
    return;
  }
  state.universityPrestige = clamp(state.universityPrestige + delta, 0, 100);
}

function satAdmitted() {
  const accept = window.TESTS?.sat?.scoring?.acceptTotal;
  return accept != null && testTotal("sat") >= accept;
}

function joinAffiliation(registry, id) {
  const affiliation = registry[id];
  if (!affiliation) return false;

  const slot = affiliation.slot;
  if (affiliation.exclusive && state.affiliations[slot]) return false;

  applyOneTimeEffects(affiliation.effects);

  // Run any custom onJoin hook defined on the affiliation
  if (typeof affiliation.onJoin === "function") {
    affiliation.onJoin(state);
  }

  // Record the affiliation
  state.affiliations[slot] = id;

  // Update CV — major gets its own field; club/sport slots map to cv.club/cv.sport
  if (slot === "major")                                           state.cv.major = affiliation.label;
  if (slot === "hs_club" || slot === "college_club")            state.cv.club  = affiliation.label;
  if (slot === "hs_sport")                                         state.cv.sport = affiliation.label;

  rebuildModifiers();
  return true;
}

// =====================================================================
// PERK UNLOCKING
// =====================================================================

function unlockPerk(perkId) {
  const perk = window.PERKS?.[perkId];
  if (!perk)                      return false;
  if (state.perks[perkId])        return false;

  // Check cost
  const cost = perk.cost || {};
  if ((cost.knowledge ?? 0) > state.knowledge) return false;
  if ((cost.drafts    ?? 0) > state.drafts)     return false;
  if ((cost.energy    ?? 0) > state.energy)     return false;

  // Spend cost
  state.knowledge -= (cost.knowledge ?? 0);
  state.drafts    -= (cost.drafts    ?? 0);
  if ((cost.energy ?? 0) > 0) {
    if (!spendEnergy(cost.energy)) return false;
  }
  state.perks[perkId] = true;

  // Milestone claimed → start the next cycle
  if (perk.milestone) {
    state.timers.draftsSinceMilestone = 0;
    state.selectedMilestoneEvent = null;
  }

  // One-time trait / identity / prestige deltas
  applyOneTimeEffects(perk.effects);

  // Apply one-time reward (e.g. foundational texts → knowledgePerStudy)
  if (perk.reward?.knowledgePerStudy) {
    state.knowledgePerStudy = (state.knowledgePerStudy ?? 1) + perk.reward.knowledgePerStudy;
  }

  // Lasting modifiers (effects.modifiers) take effect now
  rebuildModifiers();
  return true;
}

// =====================================================================
// MILESTONE EVENTS
// Any perk with a `milestone` block is a one-at-a-time random event:
//   milestone: { level, afterDrafts?, when?(s), weight? }
// Once draftsSinceMilestone reaches the event's afterDrafts (default from
// MILESTONE_DRAFT_INTERVAL for its level), it joins the eligible pool. One
// eligible event is picked at random and shown; claiming it resets the counter.
// =====================================================================

function milestoneThreshold(perk) {
  const ms = perk.milestone;
  return ms.afterDrafts ?? window.MILESTONE_DRAFT_INTERVAL?.[ms.level] ?? 7;
}

// Could this event be picked right now?
function milestoneEligible(s, id) {
  const perk = window.PERKS?.[id];
  const ms   = perk?.milestone;
  if (!ms)                                   return false;
  if (s.levelIndex !== ms.level)             return false;
  if (s.perks?.[id])                         return false;
  if ((s.timers?.draftsSinceMilestone ?? 0) < milestoneThreshold(perk)) return false;
  return typeof ms.when === "function" ? !!ms.when(s) : true;
}

// Is this event the one currently on offer? (used as the perk's visibleWhen)
function milestoneOffered(s, id) {
  return s.selectedMilestoneEvent === id && milestoneEligible(s, id);
}

function maybeSelectMilestone() {
  // Drop a pick that no longer applies (level changed, club switched, claimed)
  const current = state.selectedMilestoneEvent;
  if (current && !milestoneEligible(state, current)) state.selectedMilestoneEvent = null;
  if (state.selectedMilestoneEvent) return;

  const eligible = Object.keys(window.PERKS ?? {}).filter(id => milestoneEligible(state, id));
  if (!eligible.length) return;

  const weights = eligible.map(id => window.PERKS[id].milestone.weight ?? 1);
  state.selectedMilestoneEvent = eligible[weightedIndex(weights)];
}

// Index into `weights` chosen with probability proportional to its weight
function weightedIndex(weights) {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r < 0) return i;
  }
  return weights.length - 1;
}

// =====================================================================
// TESTS
// =====================================================================

function testTotal(testId) {
  const sections = state.tests?.[testId]?.sections || {};
  return Object.values(sections)
    .filter(v => typeof v === "number" && Number.isFinite(v))
    .reduce((a, b) => a + b, 0);
}

function testAttemptsMax(testId) {
  const def = window.TESTS?.[testId];
  if (!def) return 0;
  return (def.attempts?.base ?? 0)
       + Math.floor((state.totalDraftsEver ?? 0) / (def.attempts?.perDrafts ?? 1));
}

function testPrepBonus(testId) {
  const def = window.TESTS?.[testId];
  if (!def) return 0;
  return (def.scoring?.prepScale ?? 0) * Math.log10(1 + (state.totalDraftsEver ?? 0));
}

function canTakeTest(testId) {

  const def = window.TESTS?.[testId];
  if (!def) return false;

  const ts         = state.tests[testId] || {};
  const minLevel   = def.unlock?.minLevelIndex ?? 0;
  const minK       = def.minKnowledge          ?? 0;
  const energyCost = def.energyCost            ?? 0;

  return (
    state.levelIndex === minLevel &&
    state.knowledge  >= minK &&
    state.energy     >= energyCost &&
    (ts.attemptsUsed ?? 0) < testAttemptsMax(testId) &&
    !inCooldown()
  );
}

function takeTest(testId, sectionId) {
  if (!canTakeTest(testId)) return false;
  const def = window.TESTS[testId];

  if (!spendEnergy(def.energyCost)) return false;

  const s      = def.scoring;
  const raw    = approxNormal(s.mean, s.sd) + testPrepBonus(testId);
  const score  = clamp(Math.round(raw), s.sectionMin, s.sectionMax);

  const ts     = state.tests[testId];
  const prev   = ts.sections[sectionId] ?? 0;
  ts.sections[sectionId] = Math.max(prev, score);   // superscore
  ts.attemptsUsed += 1;

  // Check for acceptance and apply prestige
  const total = testTotal(testId);
  if (total >= s.acceptTotal) {
    applyPrestigeFromTest(testId, total);
  }

  return true;
}

function applyPrestigeFromTest(testId, total) {
  const def = window.TESTS?.[testId];
  if (!def) return;
  const model = def.scoring?.prestigeModel;
  if (model === "sat") state.universityPrestige = clamp(calcPrestigeFromSAT(total) + (state.hsPrestige ?? 0), 0, 100);
  if (model === "gre") state.universityPrestige = calcPrestigeFromGRE(total);
}

function calcPrestigeFromSAT(totalScore) {
  const base       = clamp((totalScore - 800) / 800, 0, 1) * 100;
  const ses        = traitCentered((state.traits || {}).ses ?? 50);
  const sesShift   = SES_PRESTIGE_JITTER_MAX * ses;
  const jitter     = (Math.random() * 20 - 10) + sesShift;
  return clamp(Math.round(base + jitter), 0, 100);
}

function calcPrestigeFromGRE(totalScore) {
  const base     = clamp((totalScore - 260) / 80, 0, 1) * 100;
  const ses      = traitCentered((state.traits || {}).ses ?? 50);
  const sesShift = SES_PRESTIGE_JITTER_MAX * ses;
  const jitter   = (Math.random() * 14 - 7) + sesShift;
  return clamp(Math.round(base + jitter), 0, 100);
}

// =====================================================================
// LEVEL PROGRESSION
// =====================================================================

function canLevelUp(nextIndex) {
  const next = window.LEVELS?.[nextIndex];
  if (!next) return false;

  const req = next.req;
  if (!req)  return false;

  // Check gate
  if (next.gateId) {
    const gate = window.GATES?.[next.gateId];
    if (!gate || typeof gate.isMet !== "function") return false;
    if (!gate.isMet(state))                        return false;
  }

  // Check resource requirements
  return (
    state.knowledge         >= req.k &&
    state.totalDraftsEver   >= req.d &&
    state.publications      >= req.p &&
    calcTotalCitations()    >= req.c &&
    calcHIndex()            >= req.h &&
    state.landmarksCompleted >= req.l
  );
}

function tryLevelUp() {
  const before = state.levelIndex;
  while (canLevelUp(state.levelIndex + 1)) {
    state.levelIndex += 1;
  }
  if (state.levelIndex !== before) {
    // New chapter of life: milestone events start their cycle over
    state.timers.draftsSinceMilestone = 0;
    state.selectedMilestoneEvent      = null;
  }
  ensureLevelLandmark();
}

function currentLevelLabel() {
  return window.LEVELS?.[state.levelIndex]?.label ?? "Unknown";
}

// =====================================================================
// PAPERS, CITATIONS & H-INDEX (quality-tier histograms)
// state.papers.tiers[t][c] = number of papers in quality tier t with exactly
// c citations (c capped at HINDEX_BUCKET_MAX). Paper count, citation total and
// h-index are all derived from these; no per-paper records are stored.
// =====================================================================

function paperTierCount() {
  return (window.PAPER_TIERS ?? []).length || 1;
}

// Collapse the tiers into one histogram: out[c] = papers with exactly c citations
function aggregateBuckets() {
  const size = HINDEX_BUCKET_MAX + 1;
  const out  = new Array(size).fill(0);
  for (const hist of state.papers?.tiers ?? []) {
    if (!Array.isArray(hist)) continue;
    for (let c = 0; c < hist.length && c < size; c++) out[c] += hist[c] || 0;
  }
  return out;
}

function calcHIndex() {
  const buckets = aggregateBuckets();
  let cumulative = 0;                     // papers with ≥ i citations
  for (let i = buckets.length - 1; i >= 1; i--) {
    cumulative += buckets[i];
    if (cumulative >= i) return i;
  }
  return 0;
}

function calcTotalCitations() {
  return aggregateBuckets().reduce((sum, count, c) => sum + count * c, 0);
}

function calcTotalPapers() {
  return aggregateBuckets().reduce((a, b) => a + b, 0);
}

// Papers per quality tier, lowest first — e.g. [12, 7, 3, 1, 0].
// For tenure / job-market checks that care about quality, not just h.
function paperTierCounts() {
  return (state.papers?.tiers ?? []).map(h => h.reduce((a, b) => a + b, 0));
}

function papersAtOrAboveTier(minTier) {
  return paperTierCounts().slice(minTier).reduce((a, b) => a + b, 0);
}

// Guarantee one histogram per tier, each HINDEX_BUCKET_MAX + 1 long.
// Pads short or missing arrays without losing papers.
function ensurePaperTiers() {
  const size = HINDEX_BUCKET_MAX + 1;
  const n    = paperTierCount();
  state.papers = state.papers || {};
  const old  = Array.isArray(state.papers.tiers) ? state.papers.tiers : [];

  const tiers = [];
  for (let t = 0; t < n; t++) {
    const fixed = new Array(size).fill(0);
    (Array.isArray(old[t]) ? old[t] : []).forEach((count, c) => {
      fixed[Math.min(c, size - 1)] += Number(count) || 0;
    });
    tiers.push(fixed);
  }
  // If the tier table ever shrinks, fold orphaned tiers into the top one
  for (let t = n; t < old.length; t++) {
    (Array.isArray(old[t]) ? old[t] : []).forEach((count, c) => {
      tiers[n - 1][Math.min(c, size - 1)] += Number(count) || 0;
    });
  }
  state.papers.tiers = tiers;
  state.publications = calcTotalPapers();
}

// File a new paper in its tier at 0 citations
function addPaper(tier = 1) {
  const t = clamp(Math.round(tier), 0, paperTierCount() - 1);
  if (!Array.isArray(state.papers?.tiers?.[t])) ensurePaperTiers();
  state.papers.tiers[t][0] += 1;
  state.papers.lastTier = t;
  state.publications    = calcTotalPapers();
  return t;
}

// Relative odds of each tier for a paper of this type and quality (0–100).
// Base odds come from career level; the tilt leans them up or down.
function paperTierWeights(type, quality) {
  const base  = window.PAPER_TIER_ODDS?.[state.levelIndex] ?? window.PAPER_TIER_ODDS_DEFAULT;
  const tMult = state.modifiers?.pubTypeMult?.[type] ?? 1;
  const tilt  = PAPER_QUALITY_TILT * (quality - PAPER_QUALITY_CENTER) / 35
              + (window.PUB_TYPE_TIER_TILT?.[type] ?? 0)
              + PUB_TYPE_MULT_TILT * Math.log(tMult > 0 ? tMult : 1);
  const mid   = (base.length - 1) / 2;
  return base.map((w, t) => w * Math.exp(tilt * (t - mid)));
}

function rollPaperTier(type) {
  return weightedIndex(paperTierWeights(type, computePaperQuality()));
}

// Chance per tick that one paper in tier t with c citations gains a citation
function citationChance(tier, c) {
  const def     = window.PAPER_TIERS?.[tier] ?? {};
  const rate    = def.rate ?? 1;
  const ceiling = def.ceiling ?? HINDEX_BUCKET_MAX;
  const mult    = state.modifiers?.citationMult ?? 1;
  const growth  = 1 + CITE_GROWTH * Math.log10(c + 1);
  const room    = Math.max(CITE_TRICKLE, 1 - c / ceiling);   // readers run out near the ceiling
  return clamp(CITE_BASE_RATE * rate * growth * room * mult, 0, 1);
}

// Each tick, move papers up one citation bucket, stochastically.
// Top-down so no paper moves twice per tick; the last bucket is a ceiling.
function tickCitations() {
  const tiers = state.papers?.tiers;
  if (!Array.isArray(tiers)) return;
  for (let t = 0; t < tiers.length; t++) {
    const hist = tiers[t];
    for (let c = hist.length - 2; c >= 0; c--) {
      const n = hist[c];
      if (!n) continue;
      const moving = sampleBinomial(n, citationChance(t, c));
      if (moving) {
        hist[c]     -= moving;
        hist[c + 1] += moving;
      }
    }
  }
}

// Successes in n trials at chance p. Exact for small n; Poisson or normal
// approximation for large n, so 5,000 papers cost about the same as 5.
function sampleBinomial(n, p) {
  if (n <= 0 || p <= 0) return 0;
  if (p >= 1)           return n;
  if (n <= 40) {
    let k = 0;
    for (let i = 0; i < n; i++) if (Math.random() < p) k++;
    return k;
  }
  const mean = n * p;
  if (mean < 15) {
    const L = Math.exp(-mean);
    let k = 0, prod = Math.random();
    while (prod > L) { k++; prod *= Math.random(); }
    return Math.min(k, n);
  }
  return clamp(Math.round(randNormal(mean, Math.sqrt(mean * (1 - p)))), 0, n);
}

// =====================================================================
// WRITE COST (logarithmic scaling — preserved from original)
// =====================================================================

function writeCost() {
  const x = state.totalDraftsEver ?? 0;
  return Math.floor(
    (WRITE_COST_B + WRITE_COST_A * Math.log10(x + 1))
    * (state.modifiers?.writeCostMult ?? 1)
  );
}

// =====================================================================
// PAPER QUALITY
// =====================================================================

function computePaperQuality() {
  const knowledgeFactor   = clamp(state.knowledge / 500, 0, 1);
  const prestigeFactor    = clamp(state.universityPrestige / 100, 0, 1);
  const experienceFactor  = clamp(Math.log10(1 + state.totalDraftsEver) / 3, 0, 1);
  const randomness        = 0.9 + Math.random() * 0.2;
  const bonus             = state.modifiers?.paperQualityBonus ?? 0;

  return clamp(Math.round(
    40 * knowledgeFactor +
    30 * prestigeFactor +
    20 * experienceFactor +
    10 * randomness +
    bonus
  ), 0, 100);
}

// =====================================================================
// LANDMARK HELPERS
// =====================================================================

function activeLandmarkDef() {
  const id = state.activeLandmark;
  return id ? (window.LANDMARKS?.[id] ?? null) : null;
}

function startLandmark(landmarkId) {
  if (state.activeLandmark) return false;
  const def = window.LANDMARKS?.[landmarkId];
  if (!def)                  return false;
  state.activeLandmark         = landmarkId;
  state.landmarkProgress       = 0;
  state.landmarkLastProgressAt = Date.now();
  return true;
}

// Start the current level's landmark if it hasn't been done yet and nothing
// else is running. Called from tryLevelUp and on load, so a save that reached
// a level without its landmark starting (the old habilitation deadlock) recovers.
function ensureLevelLandmark() {
  if (state.activeLandmark) return false;
  const id = window.LEVELS?.[state.levelIndex]?.autoStartLandmark;
  if (!id) return false;
  const alreadyDone = (state.cv?.landmarks ?? []).some(lm => lm.type === id);
  if (alreadyDone) return false;
  return startLandmark(id);
}

// Phases list the progress at which each one ENDS. Returns the phase the
// player is in now, its index, and the progress where it began.
function currentLandmarkPhase(def, progress = state.landmarkProgress) {
  const phases = def?.phases ?? [];
  for (let i = 0; i < phases.length; i++) {
    if (progress < phases[i].progressRequired) {
      return { phase: phases[i], index: i, start: i > 0 ? phases[i - 1].progressRequired : 0 };
    }
  }
  const last = phases.length - 1;
  return { phase: phases[last] ?? null, index: last, start: last > 0 ? phases[last - 1].progressRequired : 0 };
}

// Multiplier on landmark progress from state modifiers the landmark opts into.
// Only knowledgeMult is live; the other flags in def.modifiers are placeholders.
function landmarkProgressMult(def) {
  return def?.modifiers?.knowledgeMult ? (state.modifiers?.knowledgeMult ?? 1) : 1;
}

// Called from doAction after a successful action. The landmark bar fills from
// the player's normal footer actions, per def.progressSources.
// Returns true if this action completed the landmark.
function advanceLandmark(actionId) {
  const def = activeLandmarkDef();
  if (!def) return false;

  const gain = def.progressSources?.[actionId] ?? 0;
  if (gain <= 0) return false;

  state.landmarkProgress = Math.min(
    def.totalProgress,
    state.landmarkProgress + gain * landmarkProgressMult(def)
  );
  state.landmarkLastProgressAt = Date.now();

  if (state.landmarkProgress >= def.totalProgress) {
    completeLandmark();
    return true;
  }
  return false;
}

function completeLandmark() {
  const def = activeLandmarkDef();
  if (!def) return;

  const flagMap = {
    masters_thesis:    "mastersThesisCompleted",
    dissertation:      "dissertationDefended",
    first_monograph:   "firstMonographCompleted",
    job_market:        "jobMarketCleared",
    tenure_review:     "tenureGranted",
    habilitation_opus: "habilitationCompleted"
  };
  const flagKey = flagMap[def.id];
  if (flagKey) state.flags[flagKey] = true;

  const artifact = {
    type:  def.id,
    year:  state.levelIndex,
    title: gen_landmark_title(def.id)
  };
  state.cv.landmarks.push(artifact);

  state.landmarksCompleted += 1;
  state.activeLandmark      = null;
  state.landmarkProgress    = 0;
  state.advisorNoteActive   = false;

  tryLevelUp();
  rebuildModifiers();
  render();
}

// Called every tick. Softened decay: waits out a grace period after the last
// progress gain, pauses during burnout, and never drops below the start of
// the current phase.
function tickLandmarkDecay() {
  const def = activeLandmarkDef();
  if (!def)         return;
  if (inCooldown()) return;

  const grace = window.LANDMARK_DECAY_GRACE_MS ?? 0;
  if (Date.now() - (state.landmarkLastProgressAt ?? 0) < grace) return;

  const floor = currentLandmarkPhase(def).start;
  state.landmarkProgress = Math.max(
    floor,
    state.landmarkProgress - (window.LANDMARK_DECAY_PER_TICK ?? 0.01)
  );
}

// Called every tick — random chance to fire an advisor note
function maybeFireAdvisorNote() {
  if (!state.activeLandmark)   return;
  if (state.advisorNoteActive) return;

  const prob = window.ADVISOR_NOTE_PROBABILITY ?? 0.0003;
  if (Math.random() > prob)    return;

  const def = activeLandmarkDef();
  if (!def?.advisorNotes?.length) return;

  const note = def.advisorNotes[Math.floor(Math.random() * def.advisorNotes.length)];

  state.landmarkProgress = Math.max(
    0,
    state.landmarkProgress - (window.ADVISOR_NOTE_PENALTY ?? 5)
  );

  state.advisorNoteActive = true;
  showAdvisorModal(note);
}

// =====================================================================
// TITLE GENERATOR
// Generates absurd academic titles from TITLE_BANK templates.
// Templates use [BracketCase] placeholders; each is replaced with a random
// word from the matching bank (e.g. [Verbing] → word from TITLE_BANK.verbs).
// =====================================================================

function gen_landmark_title(landmarkId) {
  const B = window.TITLE_BANK;
  if (!B?.templates?.length) return null;

  const template = B.templates[Math.floor(Math.random() * B.templates.length)];
  
  // Find all [BracketCase] placeholders and replace each with a random word
  // Template uses [Concept], [Verbs], etc; TITLE_BANK keys are lowercase (concepts, verbs, etc)
  return template.replace(/\[([A-Z][a-z]+)\]/g, (match, key) => {
    const bankKey = key.toLowerCase();
    const bank = B[bankKey];
    if (!Array.isArray(bank) || bank.length === 0) return match;
    return bank[Math.floor(Math.random() * bank.length)];
  });
}

// =====================================================================
// PASSIVE PERK TICKS
// =====================================================================

function tickPerks() {
  if (!window.PERKS || inCooldown()) return;  // skip passive gains during burnout
  for (const [perkId, isActive] of Object.entries(state.perks)) {
    if (!isActive) continue;
    const perk = window.PERKS[perkId];
    if (!perk?.passiveTick) continue;

    const tick = perk.passiveTick;

    if (tick.knowledge) {
      state.timers.knowledgeAccumulator += tick.knowledge;
    }
    if (tick.drafts) {
      state.timers.draftAccumulator += tick.drafts * 0.2;  // slow down study group drafts
    }
  }

  // Flush accumulators
  if (state.timers.knowledgeAccumulator >= 1) {
    const gain = Math.floor(state.timers.knowledgeAccumulator);
    state.knowledge += gain;
    state.timers.knowledgeAccumulator -= gain;
  }
  if (state.timers.draftAccumulator >= 1) {
    const gain = Math.floor(state.timers.draftAccumulator);
    state.drafts         += gain;
    state.totalDraftsEver += gain;
    state.timers.draftsSinceMilestone = (state.timers.draftsSinceMilestone ?? 0) + gain;
    state.timers.draftAccumulator -= gain;
    maybeSelectMilestone();
  }
}

// =====================================================================
// VISIBILITY HELPERS
// =====================================================================

// Generic visibility check — works for any object with a visibleWhen function
function isVisible(obj) {
  if (typeof obj?.visibleWhen !== "function") return true;
  return obj.visibleWhen(state);
}

// =====================================================================
// ACTION DISPATCHER
// Applies cost + effects from an ACTIONS entry to state.
// Handles both flat and function-form cost/effects.
// =====================================================================

function applyResourceDeltas(deltas) {
  if (!Array.isArray(deltas) || !deltas.length) return;
  for (const delta of deltas) {
    if (!delta || delta.op !== "add") continue;
    const parts = delta.path.split(".");
    let target  = state;
    for (let i = 0; i < parts.length - 1; i++) target = target[parts[i]];
    target[parts[parts.length - 1]] = (target[parts[parts.length - 1]] ?? 0) + delta.value;
  }
}

function doAction(actionId, payload) {
  const action = window.ACTIONS?.[actionId];
  if (!action) return false;
  if (!isVisible(action)) return false;

  // Study and write actions blocked during burnout (energy regen/cooldown still works)
  if ((actionId === "study_textbooks" || actionId === "study_papers" || actionId === "write") && inCooldown()) {
    return false;
  }

  const check = action.canDo?.(state, payload) ?? { ok: true };
  if (!check.ok) return false;

  // Resolve costs
  const costs = typeof action.cost === "function"
    ? action.cost(state, payload)
    : action.cost
      ? [{ op: "add", path: "energy", value: -(action.cost.energy ?? 0) }]
      : [];
  const costsArr = Array.isArray(costs) ? costs : [costs];

  // Extract energy cost and route through spendEnergy()
  const energyDelta = costsArr.find(d => d.path === "energy");
  const energyCost  = energyDelta ? Math.abs(energyDelta.value) : 0;
  if (energyCost > 0) {
    if (!spendEnergy(energyCost)) return false;
    // Apply only the non-energy costs
    applyResourceDeltas(costsArr.filter(d => d.path !== "energy"));
  } else {
    applyResourceDeltas(costsArr);
  }

  // Apply effects
  const draftsBefore = state.drafts ?? 0;
  const effects = typeof action.effects === "function"
    ? action.effects(state, payload)
    : action.effects;
  applyResourceDeltas(Array.isArray(effects) ? effects : [effects]);
  const draftsGained = (state.drafts ?? 0) - draftsBefore;
  if (draftsGained > 0) {
    state.timers.draftsSinceMilestone = (state.timers.draftsSinceMilestone ?? 0) + draftsGained;
    maybeSelectMilestone();
  }

  if (typeof action.apply === "function") action.apply(state, payload);

  advanceLandmark(actionId);
  tryLevelUp();
  rebuildModifiers();
  render();
  return true;
}

// =====================================================================
// DEBUG: TRAITS MODAL
// =====================================================================

function toggleTraitsModal() {
  const modal = document.getElementById("traitsModal");
  if (!modal) return;
  modal.style.display = modal.style.display === "none" ? "block" : "none";
  renderDevInspector();
}

function toggleTherapyFlag() {
  state.flags.therapyUnlocked = !state.flags.therapyUnlocked;
  render();
}
