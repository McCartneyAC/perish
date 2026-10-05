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

// =====================================================================
// HOOKS — how the feature modules (quests, advisor, delights, desk,
// reading, home, endgame) plug in without the core naming them.
//   onHook(name, fn)          register
//   runHooks(name, ...args)   call every fn; a broken hook never breaks the game
//   foldHooks(name, v, ...)   each fn gets the value and returns a new one
// Events the core fires: tick, second, modifiers(m), action(id, payload, before),
// perk(id), affiliation(id, slot), enterLevel(i), burnout, published(n, tiers),
// landmarkPhase(def, phase), landmarkArtifact(def, artifact),
// landmarkComplete(def, artifact), gradDefended(g), gradHired(g), gradQuit(g),
// load(loaded), render, reset.
// =====================================================================
const HOOKS = {};
function onHook(name, fn) { (HOOKS[name] = HOOKS[name] || []).push(fn); }
function runHooks(name, ...args) {
  const fns = HOOKS[name];
  if (!fns) return;
  for (const fn of fns) {
    try { fn(...args); } catch (e) { console.warn(`hook ${name} failed:`, e?.stack ?? e); }
  }
}
function foldHooks(name, value, ...args) {
  const fns = HOOKS[name];
  if (!fns) return value;
  for (const fn of fns) {
    try { const v = fn(value, ...args); if (v !== undefined) value = v; } catch (e) { console.warn(`hook ${name} failed:`, e?.stack ?? e); }
  }
  return value;
}

// Trait normalization helpers
function trait01(x)       { return clamp(x, 0, 100) / 100; }
function traitCentered(x) { return (clamp(x, 0, 100) - 50) / 50; }  // → -1..+1

// =====================================================================
// ENERGY & BURNOUT
// =====================================================================

function inCooldown() {
  const until = state.cooldownUntil ?? 0;
  if (until - Date.now() > BASE_COOLDOWN_MS * 4) state.cooldownUntil = 0;   // a clock that jumped
  return Date.now() < (state.cooldownUntil ?? 0);
}

function effectiveCooldownMs() {
  const [lo, hi] = BURNOUT_MULT_RANGE;
  return Math.floor(BASE_COOLDOWN_MS * clamp(state.modifiers?.burnoutMult ?? 1, lo, hi));
}

// Career stamina: the bar itself grows as you do. High school gets 100;
// an emeritus gets 300. Regeneration scales with the bar, so a full refill
// always takes about the same time, and lab gear, habits and furniture
// (energyMaxBonus) add on top.
function careerStamina(level = state.levelIndex) {
  return window.ENERGY_MAX_BY_LEVEL?.[level] ?? ENERGY_MAX;
}
function maxEnergy() {
  return Math.max(20, careerStamina() + (state.modifiers?.energyMaxBonus ?? 0));
}
function energyRegenPerTick() {
  return ENERGY_REGEN_PER_TICK * (careerStamina() / ENERGY_MAX) * (state.modifiers?.energyRegenMult ?? 1);
}

// What an action actually costs in energy, after skills and habits
function effectiveEnergyCost(actionId, base) {
  if (!(base > 0)) return 0;
  const mult = foldHooks("energyCost", state.modifiers?.energyCostMult ?? 1, actionId);
  if (mult <= 0) return 0;                       // flow state: free
  return Math.max(1, Math.round(base * mult));
}

function startBurnout() {
  state.cooldownUntil = Date.now() + effectiveCooldownMs();
  state.counters = state.counters || {};
  state.counters.burnouts = (state.counters.burnouts ?? 0) + 1;
  runHooks("burnout");
}

// Returns true if energy was spent; triggers burnout if energy hits 0
function spendEnergy(cost) {
  if (inCooldown()) return false;
  if (state.energy <= 0) {
    startBurnout();
    return false;
  }
  state.energy = Math.max(0, state.energy - cost);
  if (state.energy === 0) startBurnout();
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
  m.burnoutMult        = 1;
  m.debtStressMult     = 1;
  m.tierSpread         = 0;
  m.grantChance        = 0;
  m.gradMorale         = 0;
  m.gradSpeedMult      = 1;
  m.reviewSelfCite     = 0;
  m.energyMaxBonus     = 0;
  m.energyCostMult     = 1;
  m.gradDraftMult      = 1;
  m.honorBonusMult     = 1;
  m.skillXpMult        = 1;
  m.readingSpeedMult   = 1;
  m.buffDurationMult   = 1;
  m.holdingMult        = 1;
  m.propMult           = 1;
  m.frameworkSlotBonus = 0;
  m.homeSpaceBonus     = 0;
  m.routineSlotBonus   = 0;
  m.routineSpeedMult   = 1;
  m.pubTypeMult        = { conference: 1, journal: 1, chapter: 1, monograph: 1 };

  applyTraitEffects(m);

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

  // Lab equipment you own
  for (const id of Object.keys(state.lab?.items ?? {})) {
    const item = window.LAB_ITEMS?.[id];
    if (item?.modifiers) applyModifierTable(m, item.modifiers, false);
  }

  // Student debt wears you down (neuroticism makes it worse)
  m.energyRegenMult *= 1 - debtStress();

  // Former students cite you for the rest of their careers
  m.citationMult *= 1 + Math.min(ALUMNI_CITE_MAX, ALUMNI_CITE_EACH * (state.alumni ?? 0));

  // Advisors, buffs, distinctions, frameworks, furniture, the story, Legacy
  runHooks("modifiers", m);

  m.energyRegenMult = Math.max(0.15, m.energyRegenMult);
  m.energyCostMult  = clamp(m.energyCostMult, 0.25, 3);
}

// Where each trait sits on −1..+1. IQ maps 70..130; everything else 0..100.
function traitPosition(trait) {
  const t = state.traits || {};
  if (trait === "iq") return clamp(((t.iq ?? 100) - 100) / 30, -1, 1);
  return traitCentered(t[trait] ?? 50);
}

// Applies TRAIT_EFFECTS (content.js), each scaled by where the trait sits
function applyTraitEffects(m) {
  for (const [trait, effects] of Object.entries(window.TRAIT_EFFECTS ?? {})) {
    applyModifierTable(m, effects, true, traitPosition(trait));
  }
}

// Shared by traits and lab gear. Keys may be dotted ("pubTypeMult.conference").
// Scaled tables (traits):   "…Mult" × (1 + value·x),  others + value·x
// Unscaled tables (gear):   "…Mult" × value,          others + value
function applyModifierTable(m, table, scaled, x = 1) {
  for (const [key, value] of Object.entries(table)) {
    const parts = key.split(".");
    let target  = m;
    for (let i = 0; i < parts.length - 1; i++) target = target?.[parts[i]];
    const leaf  = parts[parts.length - 1];
    if (typeof target?.[leaf] !== "number") continue;
    const isMult = leaf.endsWith("Mult") || parts.length > 1;   // pubTypeMult.* entries are multipliers
    if (isMult) target[leaf] *= scaled ? 1 + value * x : value;
    else        target[leaf] += scaled ? value * x : value;
  }
}

// 0..DEBT_STRESS_MAX × debtStressMult: the share of energy regen your loans eat
function debtStress() {
  const load = clamp((state.debt ?? 0) / DEBT_STRESS_SCALE, 0, 1);
  return clamp(DEBT_STRESS_MAX * load * (state.modifiers?.debtStressMult ?? 1), 0, 0.5);
}

// Generic modifier applicator — reads the nested effects format from content.js
function applyAffiliationModifiers(affiliation) {
  const fx = affiliation.effects;
  if (!fx) return;
  const m = state.modifiers;

  if (fx.modifiers) {
    for (const [key, val] of Object.entries(fx.modifiers)) {
      if (typeof m[key] !== "number") continue;
      if (key.endsWith("Mult")) m[key] *= val;   // multipliers multiply
      else                      m[key] += val;   // bonuses (energyMaxBonus, paperQualityBonus…) add
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
  if (!canPay(affiliation.cost?.money ?? 0))              return false;
  if (affiliation.cost?.money) pay(affiliation.cost.money);

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

  newsFor(id);
  rebuildModifiers();
  runHooks("affiliation", id, slot);
  return true;
}

// The news line for a club, major, perk or milestone (NEWS_ITEMS in content.js).
// A list picks one at random; a function is called with the state.
function newsFor(id) {
  let item = window.NEWS_ITEMS?.[id];
  if (typeof item === "function") item = item(state);
  if (Array.isArray(item)) item = pickOne(item);
  if (item) pushNews(item);
  return item ?? null;
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
  const maxEnergy = (window.ENERGY_MAX ?? 100) + (state.modifiers.energyMaxBonus ?? 0);
  if ((cost.knowledge ?? 0) > state.knowledge) return false;
  if ((cost.drafts    ?? 0) > state.drafts)     return false;
  if ((cost.energy    ?? 0) > state.energy)     return false;
  if (!canPay(cost.money ?? 0))                  return false;

  // Spend cost
  state.knowledge -= (cost.knowledge ?? 0);
  state.drafts    -= (cost.drafts    ?? 0);
  if ((cost.energy ?? 0) > 0) {
    if (!spendEnergy(cost.energy)) return false;
  }
  if (cost.money) pay(cost.money);
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

  // Arbitrary one-time state changes (mirrors ACTIONS' apply pattern)
  if (perk.apply) perk.apply(state);

  // Lasting modifiers (effects.modifiers) take effect now
  rebuildModifiers();
  if (perk.onJoin) perk.onJoin(state);
  newsFor(perkId);
  runHooks("perk", perkId);
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

  const eligible = Object.keys(window.PERKS ?? {})
    .filter(id => milestoneEligible(state, id) && canPay(window.PERKS[id].cost?.money ?? 0));
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

// Why you can't take a test right now ("" if you can)
function testBlockReason(testId) {
  const def = window.TESTS?.[testId];
  if (!def) return "";
  const ts = state.tests[testId] || {};
  if (inCooldown())                                         return "Burned out.";
  if ((ts.attemptsUsed ?? 0) >= testAttemptsMax(testId))    return "No attempts left. Write more to earn another.";
  if (state.knowledge < (def.minKnowledge ?? 0))            return `Needs ${def.minKnowledge} knowledge.`;
  if (state.energy < (def.energyCost ?? 0))                 return `Needs ${def.energyCost} energy.`;
  return "";
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

// Through the PhD, drafts are also the calendar (and tuition is billed by
// them), so a stage's drafts have to be written during that stage: leftovers
// from high school don't make college last eleven seconds.
function draftsRequired(nextIndex) {
  const req = window.LEVELS?.[nextIndex]?.req;
  if (!req) return Infinity;
  let d = req.d;
  if (nextIndex <= 4) {
    const start = state.levelStartDrafts?.[nextIndex - 1];
    const gap = req.d - (window.LEVELS?.[nextIndex - 1]?.req?.d ?? 0);
    if (start != null && gap > 0) d = Math.max(d, start + gap);
  }
  return d;
}

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
    state.totalDraftsEver   >= draftsRequired(nextIndex) &&
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
    onEnterLevel(state.levelIndex);
    runHooks("enterLevel", state.levelIndex);
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

// h, citations and paper count are read many times a tick (render, honors,
// gates), so they're computed once and cached until the papers change.
// Anything that edits state.papers.tiers calls invalidatePaperStats().
let PAPER_STATS = null;
function invalidatePaperStats() { PAPER_STATS = null; }
function paperStats() {
  const papers = state.papers;
  if (PAPER_STATS && PAPER_STATS.owner === papers && PAPER_STATS.overflow === (papers?.overflow ?? 0)) return PAPER_STATS;
  const buckets = aggregateBuckets();
  let h = 0, cumulative = 0, cites = 0, count = 0;
  for (let i = buckets.length - 1; i >= 0; i--) {
    cumulative += buckets[i];
    if (!h && i >= 1 && cumulative >= i) h = i;
    cites += buckets[i] * i;
    count += buckets[i];
  }
  PAPER_STATS = { owner: papers, overflow: papers?.overflow ?? 0, h, cites: cites + (papers?.overflow ?? 0), count };
  return PAPER_STATS;
}

function calcHIndex()         { return paperStats().h; }
function calcTotalCitations() { return paperStats().cites; }
function calcTotalPapers()    { return paperStats().count; }

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
  state.papers.overflow = Number(state.papers.overflow) || 0;
  invalidatePaperStats();
  state.publications = calcTotalPapers();
}

// File a new paper in its tier at 0 citations
function addPaper(tier = 1) {
  const t = clamp(Math.round(tier), 0, paperTierCount() - 1);
  if (!Array.isArray(state.papers?.tiers?.[t])) ensurePaperTiers();
  state.papers.tiers[t][0] += 1;
  state.papers.lastTier = t;
  invalidatePaperStats();
  state.publications    = calcTotalPapers();
  return t;
}

// Many papers at once, for delegation and holdings: split n across tiers by
// this type's odds (expected counts, remainders rolled), no per-paper loop.
function addPapersBulk(n, type = "journal") {
  n = Math.floor(n);
  if (n <= 0) return [];
  if (n <= 8) { const out = []; for (let i = 0; i < n; i++) out.push(addPaper(rollPaperTier(type))); return out; }
  const w = paperTierWeights(type, computePaperQuality());
  const total = w.reduce((a, b) => a + b, 0);
  const counts = w.map(x => Math.floor(n * x / total));
  let left = n - counts.reduce((a, b) => a + b, 0);
  while (left-- > 0) counts[weightedIndex(w)] += 1;
  if (!Array.isArray(state.papers?.tiers?.[0])) ensurePaperTiers();
  counts.forEach((k, t) => { if (k) state.papers.tiers[t][0] += k; });
  state.papers.lastTier = counts.reduce((best, k, t) => k ? t : best, 0);
  invalidatePaperStats();
  state.publications = calcTotalPapers();
  return counts;
}

// n citations spread over everything you've published, in proportion to how
// readable each tier is. Papers that would pass the per-paper cap keep the
// excess in papers.overflow: it counts toward total citations, not h.
function addCitations(n) {
  n = Math.floor(n);
  if (n <= 0) return 0;
  const tiers = state.papers?.tiers;
  if (!Array.isArray(tiers)) return 0;
  const max = HINDEX_BUCKET_MAX;
  let W = 0;
  tiers.forEach((hist, t) => { const r = window.PAPER_TIERS?.[t]?.rate ?? 1; for (const k of hist) W += k * r; });
  if (W <= 0) return 0;
  let overflow = 0, given = 0;
  tiers.forEach((hist, t) => {
    const r = window.PAPER_TIERS?.[t]?.rate ?? 1;
    const out = new Array(hist.length).fill(0);
    for (let c = 0; c < hist.length; c++) {
      const cnt = hist[c];
      if (!cnt) continue;
      const share = n * cnt * r / W;
      const each  = Math.floor(share / cnt);
      let extra   = Math.floor(share - each * cnt);
      if (Math.random() < (share - each * cnt) - extra) extra += 1;
      extra = clamp(extra, 0, cnt);
      for (const [k, step] of [[cnt - extra, each], [extra, each + 1]]) {
        if (!k) continue;
        let b = c + step;
        if (b > max) { overflow += (b - max) * k; b = max; }
        out[b] += k;
        given += k * step;
      }
    }
    tiers[t] = out;
  });
  state.papers.overflow = (state.papers.overflow ?? 0) + overflow;
  invalidatePaperStats();
  return given;
}

// Papers that come out of a story (positive n) or get retracted (negative n).
// A retraction takes your most-cited paper, because that's the one people check.
function addStoryPapers(n, tier = "low") {
  n = Math.round(n);
  if (n > 0) {
    const pick = { low: () => weightedIndex([60, 35, 5, 0, 0]), mid: () => weightedIndex([10, 40, 35, 13, 2]), high: () => weightedIndex([0, 10, 35, 40, 15]) }[tier] ?? (() => 1);
    for (let i = 0; i < n; i++) addPaper(pick());
  } else if (n < 0) {
    for (let i = 0; i < -n; i++) {
      let best = null;
      state.papers.tiers.forEach((hist, t) => { for (let c = hist.length - 1; c >= 0; c--) if (hist[c] > 0) { if (!best || c > best[1]) best = [t, c]; break; } });
      if (!best) break;
      state.papers.tiers[best[0]][best[1]] -= 1;
    }
    invalidatePaperStats();
    state.publications = calcTotalPapers();
  }
  return state.publications;
}

// Relative odds of each tier for a paper of this type and quality (0–100).
// Base odds come from career level; the tilt leans them up or down.
function paperTierWeights(type, quality) {
  const base  = window.PAPER_TIER_ODDS?.[state.levelIndex] ?? window.PAPER_TIER_ODDS_DEFAULT;
  const tMult = state.modifiers?.pubTypeMult?.[type] ?? 1;
  const tilt  = PAPER_QUALITY_TILT * (quality - PAPER_QUALITY_CENTER) / 35
              + (window.PUB_TYPE_TIER_TILT?.[type] ?? 0)
              + PUB_TYPE_MULT_TILT * Math.log(tMult > 0 ? tMult : 1)
              + REVIEW_GOODWILL_TILT * (state.editorGoodwill ?? 0);
  const spread = state.modifiers?.tierSpread ?? 0;    // openness: fatter tails both ways
  const mid   = (base.length - 1) / 2;
  return base.map((w, t) => w * Math.exp(tilt * (t - mid) + spread * ((t - mid) / mid) ** 2));
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
        PAPER_STATS = null;
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
  runHooks("landmarkStart", def);
  if (def.phases?.[0]) runHooks("landmarkPhase", def, def.phases[0]);
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
  // Knowledge helps, gently: doubling what you know speeds a thesis by 15%
  const km = Math.max(1, state.modifiers?.knowledgeMult ?? 1);
  const base = def?.modifiers?.knowledgeMult ? 1 + 0.15 * Math.log2(km) : 1;
  return foldHooks("landmarkMult", base, def);
}

// Called from doAction after a successful action. The landmark bar fills from
// the player's normal footer actions, per def.progressSources.
// Returns true if this action completed the landmark.
function advanceLandmark(actionId) {
  const def = activeLandmarkDef();
  if (!def) return false;

  let gain = def.progressSources?.[actionId] ?? 0;
  if (gain <= 0) return false;
  if (actionId === "write") gain *= window.LEVELS?.[state.levelIndex]?.draftsPerWrite ?? 1;
  if (doAction.fromRoutine) gain *= 0.5;      // you can't automate a tenure case (entirely)
  return addLandmarkProgress(gain * landmarkProgressMult(def));
}

// Moves the bar, announces new phases, and finishes the landmark when it's
// full — unless something still has to happen first (a defense on the
// calendar: see landmarkHeld, which quests.js answers through a hook).
function addLandmarkProgress(amount) {
  const def = activeLandmarkDef();
  if (!def || !amount) return false;
  const before = currentLandmarkPhase(def).index;
  state.landmarkProgress = clamp(state.landmarkProgress + amount, 0, def.totalProgress);
  if (amount > 0) state.landmarkLastProgressAt = Date.now();
  const now = currentLandmarkPhase(def);
  if (now.index > before && amount > 0) {
    for (let i = before + 1; i <= now.index; i++) runHooks("landmarkPhase", def, def.phases[i]);
  }
  return maybeCompleteLandmark();
}

function landmarkHeld(def) { return foldHooks("landmarkHeld", false, def); }

function maybeCompleteLandmark() {
  const def = activeLandmarkDef();
  if (!def || state.landmarkProgress < def.totalProgress) return false;
  if (landmarkHeld(def)) return false;
  completeLandmark();
  return true;
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
  const flagKey = def.setsFlag ?? flagMap[def.id];
  if (flagKey) state.flags[flagKey] = true;

  const artifact = {
    type:    def.id,
    year:    state.levelIndex,
    title:   state.workingTitles?.[def.id] ?? gen_landmark_title(def.id),
    advisor: state.advisor?.name ?? null,
    place:   state.cv?.universityName ?? null
  };
  runHooks("landmarkArtifact", def, artifact);     // grades, committee, press
  state.cv.landmarks.push(artifact);

  state.landmarksCompleted += 1;
  state.activeLandmark      = null;
  state.landmarkProgress    = 0;
  state.advisorNoteActive   = false;
  runHooks("landmarkComplete", def, artifact);

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
  if (state.landmarkProgress >= def.totalProgress) return;   // finished, waiting on its defense

  const grace = window.LANDMARK_DECAY_GRACE_MS ?? 0;
  if (Date.now() - (state.landmarkLastProgressAt ?? 0) < grace) return;

  const floor = currentLandmarkPhase(def).start;
  const perTick = def.totalProgress * (window.LANDMARK_DECAY_PER_SEC ?? 0) * TICK_MS / 1000;
  state.landmarkProgress = Math.max(floor, state.landmarkProgress - perTick);
}

// True while neglect is actively costing progress (for the "slipping" cue)
function landmarkSlipping() {
  const def = activeLandmarkDef();
  if (!def || inCooldown()) return false;
  if (state.landmarkProgress >= def.totalProgress) return false;
  if (Date.now() - (state.landmarkLastProgressAt ?? 0) < (window.LANDMARK_DECAY_GRACE_MS ?? 0)) return false;
  return state.landmarkProgress > currentLandmarkPhase(def).start;
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
    state.timers.draftAccumulator -= gain;
    onDraftsGained(gain);
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

  if (actionCooldownLeft(actionId) > 0) return false;
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
  const energyCost  = effectiveEnergyCost(actionId, energyDelta ? Math.abs(energyDelta.value) : 0);
  const before = { knowledge: state.knowledge, drafts: state.drafts, publications: state.publications,
                   money: state.money ?? 0, energy: state.energy, funds: state.lab?.funds ?? 0 };
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
  onDraftsGained((state.drafts ?? 0) - draftsBefore);

  if (typeof action.apply === "function") action.apply(state, payload);
  if (action.cooldownMs) state.timers.readyAt[actionId] = Date.now() + action.cooldownMs;

  if (["study_textbooks", "study_papers", "write"].includes(actionId)) {
    state.counters = state.counters || {};
    state.counters.clicks = (state.counters.clicks ?? 0) + 1;
  }
  runHooks("action", actionId, payload, before);

  advanceLandmark(actionId);
  tryLevelUp();
  rebuildModifiers();
  if (!doAction.quiet) render();
  return true;
}

// =====================================================================
// SMALL SHARED HELPERS
// =====================================================================

function pickOne(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function fmtMoney(x) { return Math.round(x).toLocaleString("en-US"); }

function ticksPerYear() { return SECONDS_PER_YEAR * 1000 / TICK_MS; }

function pushNews(text) {
  state.news = state.news || [];
  state.news.unshift(text);
  if (state.news.length > NEWS_MAX) state.news.length = NEWS_MAX;
}

// ── Foundational texts ───────────────────────────────────────────────
// Which texts this game offers, in unlock order. Saves from before the pool
// keep the original list; new games draw from all of FOUNDATIONAL_TEXTS.
function ensureFoundationalOrder() {
  if (Array.isArray(state.foundationalOrder) && state.foundationalOrder.length) return;
  const ids = FOUNDATIONAL_TEXTS.map(t => t[0]);
  if ((state.totalDraftsEver ?? 0) > 0) {
    state.foundationalOrder = ids.slice(0, FOUNDATIONAL_SLOTS);
    return;
  }
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  state.foundationalOrder = ids.slice(0, FOUNDATIONAL_SLOTS);
}

// Has this text's slot come up yet?
function foundationalUnlocked(s, id) {
  const slot = (s.foundationalOrder ?? []).indexOf(id);
  return slot >= 0 && (s.totalDraftsEver ?? 0) >= FOUNDATIONAL_START + FOUNDATIONAL_EVERY * slot;
}

// ── Paying for things ────────────────────────────────────────────────
// Through college, family covers its SES share (same formula as tuition)
function familyShare() {
  if (state.levelIndex > 1) return 0;
  return clamp(((state.traits?.ses ?? 50) - 20) / 60, 0, 1);
}
function outOfPocket(amount) { return Math.round((amount ?? 0) * (1 - familyShare())); }
function canPay(amount)      { return (state.money ?? 0) >= outOfPocket(amount); }

// Purchases need cash on hand
function pay(amount) {
  const you = outOfPocket(amount);
  state.money -= you;
  state.stats.spent = (state.stats.spent ?? 0) + you;
  return you;
}

// Fees never block progress: savings first, the rest goes on your loans
function chargeApplicationFee(kind) {
  const you  = outOfPocket(APPLICATION_FEES[kind] ?? 0);
  const cash = clamp(state.money ?? 0, 0, you);
  state.money -= cash;
  const borrowed = you - cash;
  state.debt += borrowed;
  state.stats.borrowed += borrowed;
  state.stats.spent = (state.stats.spent ?? 0) + cash;
  if (you > 0) pushNews(borrowed > 0
    ? `Application fees: $${fmtMoney(you)}. $${fmtMoney(borrowed)} of it went on your loans.`
    : `Application fees: $${fmtMoney(you)}.`);
}
function feeDetail(kind) {
  const you = outOfPocket(APPLICATION_FEES[kind] ?? 0);
  return you > 0 ? `$${fmtMoney(you)} in fees` : "";
}

// Button suffix for something with a price: your share, or who covered it
function priceNote(amount) {
  if (!amount) return "";
  const you = outOfPocket(amount);
  return you > 0 ? `$${fmtMoney(you)}` : "family pays";
}

// A fresh game starts with a line of story instead of an empty card
function seedOpeningNews() {
  if (state.news?.length || state.levelIndex !== 0 || (state.totalDraftsEver ?? 0) > 0) return;
  pushNews(OPENING_NEWS);
}

// Knowledge from one round of paper reading — the unit reviews and theft scale by
function paperReadingGain() {
  const draftScale = 1 + 0.6 * Math.sqrt(state.totalDraftsEver ?? 0);
  return (state.knowledgePerStudy ?? 1) * draftScale
       * (state.modifiers?.paperMult ?? 1) * (state.modifiers?.knowledgeMult ?? 1);
}

function actionCooldownLeft(actionId) {
  const left = Math.max(0, (state.timers?.readyAt?.[actionId] ?? 0) - Date.now());
  // A clock that jumped (or a save from another machine) never strands a button
  const max = window.ACTIONS?.[actionId]?.cooldownMs;
  return max != null ? Math.min(left, max) : left;
}

// Every draft, whoever wrote it, goes through here: milestone counter + tuition
function onDraftsGained(n) {
  if (!(n > 0)) return;
  state.timers.draftsSinceMilestone = (state.timers.draftsSinceMilestone ?? 0) + n;
  billTuition(n);
  maybeSelectMilestone();
}

// Arriving at a new level (called once per level passed)
function onEnterLevel(index) {
  state.levelStartDrafts = state.levelStartDrafts ?? {};
  state.levelStartDrafts[index] = state.totalDraftsEver ?? 0;
  // Every stage through the tenure track is a new institution
  if (index >= 1 && index <= TENURE_TRACK_LEVEL) {
    moveInstitution(index);
    const name = state.cv.universityName;
    if (index <= 2) {
      const split = tuitionSplit(1);
      pushNews(`Welcome to ${name}. Tuition is $${fmtMoney(tuitionPerCredit())} a credit; `
             + `family covers ${Math.round(split.family * 100)}%, aid ${Math.round(split.aid * 100)}%. The rest is loans.`);
    } else {
      pushNews((ARRIVAL_NEWS[index] ?? "You've moved to {name}.")
        .replace("{name}", name).replace("{startup}", fmtMoney(TT_STARTUP_FUNDS)));
    }
  }
  if (index === TENURE_TRACK_LEVEL) {
    state.lab.funds += TT_STARTUP_FUNDS;
    state.lab.startupGranted = true;
    state.timers.tenureClock = TENURE_CLOCK_YEARS * ticksPerYear();
  }
  if (index === TENURE_TRACK_LEVEL + 1) {
    state.timers.tenureClock = null;
    pushNews("Tenure! Nobody can fire you now, except possibly the board of trustees.");
  }
}

function draftsPerWrite() {
  return (window.LEVELS?.[state.levelIndex]?.draftsPerWrite ?? 1) * WRITE_GAIN_DRAFTS;
}

// High school year, 1 (freshman) to 4 (senior), from drafts written
function hsYear(s = state) {
  return clamp(Math.floor((s.totalDraftsEver ?? 0) / (HS_DRAFTS / 4)) + 1, 1, 4);
}

// =====================================================================
// UNIVERSITY NAMES
// =====================================================================

function universityTier(prestige = state.universityPrestige) {
  const tiers = window.UNIVERSITY_NAMES ?? [];
  let idx = 0;
  tiers.forEach((t, i) => { if (prestige >= t.min) idx = i; });
  return idx;
}

function generateUniversityName(prestige = state.universityPrestige) {
  const tier = window.UNIVERSITY_NAMES?.[universityTier(prestige)];
  if (!tier) return "University";
  if (tier.easterEgg && Math.random() < tier.easterEgg.chance) return tier.easterEgg.name;
  return pickOne(tier.templates).replace(/\{(\w+)\}/g, (_, slot) => pickOne(tier.slots?.[slot] ?? [slot]));
}

function assignUniversity() {
  state.cv.universityName = generateUniversityName();
  state.cv.institutions = state.cv.institutions ?? [];
  state.cv.institutions.push({ level: window.LEVELS?.[state.levelIndex]?.label ?? "", name: state.cv.universityName });
  return state.cv.universityName;
}

// A new stage means a new institution, and past the master's a new prestige:
// measured from your PhD program (INSTITUTION_MOVES), because that's how hiring works.
function moveInstitution(index) {
  const move = window.INSTITUTION_MOVES?.[index];
  if (move) {
    const base  = move.from === "phd" ? (state.phdPrestige ?? state.universityPrestige) : state.universityPrestige;
    const [lo, hi] = move.range;
    const bonus = move.hBonus ? clamp(calcHIndex() - 7, 0, 10) : 0;
    const letters = foldHooks("moveBonus", 0, index);     // your advisor's letter, mostly
    state.universityPrestige = clamp(Math.round(base + lo + Math.random() * (hi - lo) + bonus + letters), 0, 100);
  }
  if (index === 3) state.phdPrestige = state.universityPrestige;
  return assignUniversity();
}

// Saves from before names existed get one on load
function ensureUniversityName() {
  if (state.levelIndex >= 1 && !state.cv.universityName) assignUniversity();
  if (state.cv.universityName && !(state.cv.institutions ?? []).length) {
    state.cv.institutions = [{ level: window.LEVELS?.[state.levelIndex]?.label ?? "", name: state.cv.universityName }];
  }
}

// =====================================================================
// MONEY: tuition, salary, loans
// =====================================================================

function tuitionPerCredit() {
  const annual = window.TUITION_ANNUAL?.[state.levelIndex];
  if (!annual) return 0;
  return annual[universityTier()] / CREDITS_PER_YEAR;
}

// Who pays a bill: family (by SES), then aid (by school), then you
function tuitionSplit(amount) {
  const family = amount * clamp(((state.traits?.ses ?? 50) - 20) / 60, 0, 1);
  const aid    = (amount - family) * (FIN_AID_BY_TIER[universityTier()] ?? 0);
  return { family, aid, you: amount - family - aid };
}

// Your share is borrowed. Savings stay put until you choose Pay Down Loans.
function billTuition(credits) {
  const perCredit = tuitionPerCredit();
  if (!perCredit) return;
  const owed = tuitionSplit(perCredit * credits).you;
  state.debt += owed;
  state.stats.tuitionBilled += owed;
  state.stats.borrowed      += owed;
}

function annualSalary() { return SALARY_ANNUAL[state.levelIndex] ?? 0; }

function tickEconomy() {
  const f      = 1 / ticksPerYear();
  const salary = annualSalary() * f;
  state.money += salary;
  state.lab.funds -= labAnnualCosts() * f;

  if (state.debt > 0) {
    if (state.levelIndex >= LOAN_INTEREST_LEVEL) state.debt += state.debt * LOAN_INTEREST_ANNUAL * f;
    if (state.levelIndex >= LOAN_REPAYMENT_LEVEL) {
      const payment = Math.min(state.debt, salary * LOAN_PAYMENT_SHARE, Math.max(0, state.money));
      state.money -= payment;
      state.debt  -= payment;
    }
    if (state.debt < 1) state.debt = 0;
  }
}

// =====================================================================
// GRANTS
// =====================================================================

function grantChance() {
  const m = state.modifiers ?? {};
  const p = GRANT_BASE_CHANCE
          + GRANT_H_CHANCE * calcHIndex()
          + 0.001 * (state.universityPrestige ?? 0)
          + (m.grantAptitudeBonus ?? 0) / 100
          + (m.grantChance ?? 0)
          + GRANT_RESUBMIT_BONUS * Math.min(3, state.stats?.grantResubmits ?? 0);
  return clamp(p, GRANT_CHANCE_RANGE[0], GRANT_CHANCE_RANGE[1]);
}

function submitGrant() {
  state.stats.grantsTried += 1;
  if (Math.random() < grantChance()) {
    const band = GRANT_AWARD_BAND[state.levelIndex] ?? [0, 0];
    const hBonus = Math.max(0, calcHIndex() - 10) / 50;
    const prestigeBonus = (state.universityPrestige ?? 0) / 150;
    const scale = 1 + hBonus + prestigeBonus;
    const baseAward = band[0] + Math.random() * (band[1] - band[0]);
    const award = Math.round(baseAward * scale);
    if (state.levelIndex >= LAB_LEVEL) state.lab.funds += award;
    else                               state.money     += award;
    state.stats.grantsWon += 1;
    state.stats.grantResubmits = 0;
    pushNews(`Funded: $${fmtMoney(award)}.`);
    return true;
  }
  state.stats.grantResubmits += 1;
  pushNews(pickOne(GRANT_FAIL_QUIPS));
  return false;
}

// =====================================================================
// PEER REVIEW
// =====================================================================

function reviewManuscript() {
  state.stats.reviewsDone += 1;
  state.editorGoodwill = Math.min(REVIEW_GOODWILL_MAX, (state.editorGoodwill ?? 0) + 1);
  state.identity.network = (state.identity.network ?? 0) + 1;

  const selfCite = clamp(REVIEW_SELF_CITE_BASE + (state.modifiers?.reviewSelfCite ?? 0), 0, 1);
  if (calcTotalPapers() > 0 && Math.random() < selfCite) {
    citeRandomPaper();
    pushNews("You suggested the authors \"engage with relevant prior work.\" They cited you.");
  } else {
    pushNews(pickOne(REVIEW_QUIPS));
  }
}

// Moves one random paper up a citation (below the cap)
function citeRandomPaper() {
  const slots = [];
  state.papers.tiers.forEach((hist, t) => hist.forEach((n, c) => {
    if (n > 0 && c < HINDEX_BUCKET_MAX) slots.push([t, c, n]);
  }));
  if (!slots.length) return false;
  const [t, c] = slots[weightedIndex(slots.map(x => x[2]))];
  state.papers.tiers[t][c]     -= 1;
  state.papers.tiers[t][c + 1] += 1;
  invalidatePaperStats();
  return true;
}

// =====================================================================
// LAB: grad students
// =====================================================================

// Students need a faculty advisor (tenure track+) and somewhere to sit
function gradSlots() {
  if (state.levelIndex < TENURE_TRACK_LEVEL) return 0;
  return window.LAB_SPACES?.[state.lab?.space ?? 0]?.slots ?? 0;
}

function gradBaselineMorale() {
  return clamp(GRAD_MORALE_BASE + (state.modifiers?.gradMorale ?? 0), 0.2, 1);
}

function recruitGradStudent() {
  const taken = new Set((state.gradStudents ?? []).map(g => g.name));
  const pool  = GRAD_NAMES.filter(n => !taken.has(n));
  const g = {
    name:     pickOne(pool.length ? pool : GRAD_NAMES),
    quirk:    pickOne(GRAD_QUIRKS),
    ageTicks: 0,
    progress: 0,
    draftAcc: 0,
    morale:   gradBaselineMorale()
  };
  state.gradStudents.push(g);
  pushNews(`New in your lab: ${g.name}, who ${g.quirk}.`);
  runHooks("gradHired", g);
  return g;
}

function gradMoraleLabel(m) {
  if (m >= 0.75) return "thriving";
  if (m >= 0.5)  return "fine";
  if (m >= 0.3)  return "struggling";
  return "drafting a resignation email";
}

function tickGradStudents() {
  if (!state.gradStudents?.length) return;
  const perYear  = ticksPerYear();
  const target   = gradBaselineMorale();
  const unpaid   = (state.lab?.funds ?? 0) < 0;
  const staying  = [];

  for (const g of state.gradStudents) {
    g.ageTicks += 1;
    g.morale   += (target - g.morale) * 0.002;          // drifts back toward your baseline
    if (unpaid) g.morale -= 0.004;                      // missed paychecks hurt fast
    g.morale    = clamp(g.morale, 0, 1);

    const speed = (0.5 + g.morale) * (state.modifiers?.gradSpeedMult ?? 1);
    g.progress += speed / (GRAD_PAPER_YEARS * perYear);
    if (g.progress >= 1) {
      g.progress -= 1;
      addPaper(rollPaperTier("journal"));
      g.papers = (g.papers ?? 0) + 1;
      pushNews(gradPaperNews(g));
    }

    // Students write drafts on their own, so the late game isn't all clicking
    g.draftAcc = (g.draftAcc ?? 0) + GRAD_DRAFTS_PER_YEAR * speed * (state.modifiers?.gradDraftMult ?? 1) / perYear;
    if (g.draftAcc >= 1) {
      const n = Math.floor(g.draftAcc);
      g.draftAcc -= n;
      state.drafts += n;
      state.totalDraftsEver += n;
      state.stats.gradDrafts = (state.stats.gradDrafts ?? 0) + n;
      onDraftsGained(n);
    }

    if (g.morale < GRAD_QUIT_MORALE) {
      pushNews(pickOne(GRAD_QUIT_NEWS).replace(/\{name\}/g, g.name));
      state.stats.gradsQuit = (state.stats.gradsQuit ?? 0) + 1;
      runHooks("gradQuit", g);
    } else if (g.ageTicks >= GRAD_PROGRAM_YEARS * perYear) {
      state.alumni = (state.alumni ?? 0) + 1;
      state.alumniNames = [...(state.alumniNames ?? []), g.name].slice(-40);
      pushNews(pickOne(GRAD_DEFEND_NEWS).replace(/\{name\}/g, g.name));
      runHooks("gradDefended", g);
      rebuildModifiers();
    } else {
      staying.push(g);
    }
  }
  state.gradStudents = staying;
}

function gradPaperNews(g) {
  return pickOne(GRAD_PAPER_NEWS).replace(/\{name\}/g, g.name);
}

// For the story and advisor modules: who's in the lab, and how they feel
function labStudentCount()    { return state.gradStudents?.length ?? 0; }
function labAlumniCount()     { return state.alumni ?? 0; }
function pickLabStudentName() { return state.gradStudents?.length ? pickOne(state.gradStudents).name : null; }
// Story deltas are on a 0–100 scale; morale is 0–1
function adjustAllMorale(delta) {
  for (const g of state.gradStudents ?? []) g.morale = clamp(g.morale + delta / 100, 0, 1);
}
function adjustStudentMorale(name, delta) {
  const g = (state.gradStudents ?? []).find(x => x.name === name);
  if (g) g.morale = clamp(g.morale + delta / 100, 0, 1);
  else adjustAllMorale(delta / 3);
}

// Publish as many papers of one kind as your drafts and knowledge allow, at
// no energy cost (delegation). Respects the pre-defense cap. Returns n.
function bulkPublish(type = "journal") {
  const cost = window.PUB_COST?.[type];
  if (!cost || state.levelIndex < PUB_UNLOCK_LEVEL) return 0;
  let n = Math.floor((state.drafts ?? 0) / cost.drafts);
  if (cost.knowledge > 0) n = Math.min(n, Math.floor((state.knowledge ?? 0) / cost.knowledge));
  if (!state.flags?.dissertationDefended) n = Math.min(n, Math.max(0, PRE_DISSERTATION_PUB_CAP - calcTotalPapers()));
  if (n <= 0) return 0;
  state.drafts    -= n * cost.drafts;
  state.knowledge -= n * cost.knowledge;
  const tiers = addPapersBulk(n, type);
  state.editorGoodwill = 0;
  runHooks("published", n, tiers, type);
  return n;
}

// ── Lab: money in, research out ──

// Saves from before the lab existed: past the tenure-track hire, you'd have
// had a startup package, and any students need somewhere to sit
function ensureLabState() {
  if (state.levelIndex < TENURE_TRACK_LEVEL || state.lab.startupGranted) return;
  state.lab.startupGranted = true;
  state.lab.funds += TT_STARTUP_FUNDS;
  const need = state.gradStudents?.length ?? 0;
  while ((LAB_SPACES[state.lab.space]?.slots ?? 0) < need && state.lab.space < LAB_SPACES.length - 1) state.lab.space += 1;
  pushNews(`Your department found your startup package in a drawer: $${fmtMoney(TT_STARTUP_FUNDS)} in lab funds.`);
}

function labAnnualCosts() {
  const stipends = (state.gradStudents?.length ?? 0) * GRAD_STIPEND_ANNUAL;
  const upkeep   = Object.keys(state.lab?.items ?? {})
    .reduce((sum, id) => sum + (window.LAB_ITEMS?.[id]?.upkeep ?? 0), 0);
  return stipends + upkeep;
}

function labItemStatus(id) {
  const item = window.LAB_ITEMS?.[id];
  if (!item)                                         return { visible: false };
  if (state.lab.items[id])                           return { visible: true, owned: true };
  if (state.levelIndex < (item.minLevel ?? 0))       return { visible: false };
  if ((state.lab.space ?? 0) < (item.minSpace ?? 0)) return { visible: true, ok: false, reason: `needs ${LAB_SPACES[item.minSpace]?.label.toLowerCase() ?? "more space"}` };
  if (state.lab.funds < item.cost)                   return { visible: true, ok: false, reason: `$${fmtMoney(item.cost)}` };
  return { visible: true, ok: true };
}

function buyLabItem(id) {
  if (!labItemStatus(id).ok) return false;
  const item = LAB_ITEMS[id];
  state.lab.funds -= item.cost;
  state.lab.items[id] = true;
  if (item.once) applyOneTimeEffects(item.once);
  rebuildModifiers();
  pushNews(`Purchased: ${item.label}.`);
  return true;
}

function nextLabSpace() { return window.LAB_SPACES?.[(state.lab?.space ?? 0) + 1] ?? null; }

function labSpaceStatus() {
  const next = nextLabSpace();
  if (!next || state.levelIndex < LAB_LEVEL)  return { visible: false };
  if (state.levelIndex < next.minLevel)       return { visible: true, ok: false, reason: `after ${LEVELS[next.minLevel].label.toLowerCase()}` };
  if (state.lab.funds < next.cost)            return { visible: true, ok: false, reason: `$${fmtMoney(next.cost)}` };
  return { visible: true, ok: true };
}

function upgradeLabSpace() {
  if (!labSpaceStatus().ok) return false;
  const next = nextLabSpace();
  state.lab.funds -= next.cost;
  state.lab.space += 1;
  pushNews(`Your lab moved into ${next.label.charAt(0).toLowerCase() + next.label.slice(1)}.`);
  return true;
}

function studyCost()   { return Math.round(STUDY_BASE_COST * STUDY_COST_GROWTH ** (state.lab?.studiesRun ?? 0)); }
function studyDrafts() { return STUDY_DRAFTS_BASE + STUDY_DRAFTS_PER_STUDENT * (state.gradStudents?.length ?? 0); }

// Converts lab money into drafts; students do most of the work
function runStudy() {
  const cost = studyCost(), drafts = studyDrafts();
  state.lab.funds -= cost;
  state.lab.studiesRun += 1;
  state.drafts          += drafts;
  state.totalDraftsEver += drafts;
  onDraftsGained(drafts);
  pushNews(`Study complete: ${drafts} drafts' worth of data. It cost $${fmtMoney(cost)}.`);
  return drafts;
}

// =====================================================================
// STEALING STUDENT IDEAS
// =====================================================================

function stealCaughtChance() {
  return Math.min(STEAL_CAUGHT_MAX, STEAL_CAUGHT_BASE * (1 + (state.stats?.ideasStolen ?? 0)));
}

function stealIdeas() {
  const caught = Math.random() < stealCaughtChance();
  state.stats.ideasStolen += 1;
  state.traits.agreeableness = clamp((state.traits.agreeableness ?? 50) - 2, 0, 100);  // you become this person
  for (const g of state.gradStudents ?? []) g.morale = Math.max(0, g.morale - 0.3);

  if (caught) {
    state.stats.timesCaught += 1;
    state.universityPrestige = clamp(state.universityPrestige - STEAL_CAUGHT_PRESTIGE, 0, 100);
    state.identity.reputation = (state.identity.reputation ?? 0) - 5;
    pushNews("A student's thread about you went viral. The dean \"would like to chat.\"");
  } else {
    pushNews("Brilliant idea. You can't quite remember where you got it.");
  }
  return caught;
}

// =====================================================================
// TENURE CLOCK
// =====================================================================

function tenureClockYear() {
  const left = state.timers?.tenureClock;
  if (left == null) return null;
  const elapsed = TENURE_CLOCK_YEARS * ticksPerYear() - left;
  return clamp(Math.floor(elapsed / ticksPerYear()) + 1, 1, TENURE_CLOCK_YEARS);
}

function tickTenureClock() {
  if (state.levelIndex !== TENURE_TRACK_LEVEL) { state.timers.tenureClock = null; return; }
  if (state.timers.tenureClock == null) state.timers.tenureClock = TENURE_CLOCK_YEARS * ticksPerYear();

  // Your case is with the provost: the clock waits for the letter
  if (foldHooks("tenureClockPaused", false)) return;
  const yearBefore = tenureClockYear();
  state.timers.tenureClock -= 1;
  if (state.timers.tenureClock <= 0) { denyTenure(); return; }
  const year = tenureClockYear();
  if (year !== yearBefore) {
    pushNews(year === TENURE_CLOCK_YEARS
      ? `Final year on the tenure clock. Your dossier is due.`
      : `Year ${year} of ${TENURE_CLOCK_YEARS} on the tenure clock.`);
  }
}

// Up or out: you move somewhere less prestigious and start over
function denyTenure() {
  const votedYes = !!state.flags.tenureGranted;
  state.stats.tenureDenials += 1;
  // The review starts over at the new job: forget the old case
  if (votedYes) {
    state.flags.tenureGranted = false;
    const before = state.cv.landmarks.length;
    state.cv.landmarks = state.cv.landmarks.filter(l => l.type !== "tenure_review");
    state.landmarksCompleted = Math.max(0, (state.landmarksCompleted ?? 0) - (before - state.cv.landmarks.length));
  }
  runHooks("tenureDenied", votedYes);
  state.universityPrestige = clamp(state.universityPrestige - TENURE_DENIAL_PRESTIGE, 0, 100);
  const name = assignUniversity();
  state.identity.resilience = (state.identity.resilience ?? 0) + 5;

  // The tenure review starts over at the new job
  if (state.activeLandmark === "tenure_review") state.activeLandmark = null;
  ensureLevelLandmark();

  state.timers.tenureClock = TENURE_CLOCK_YEARS * ticksPerYear();
  pushNews(votedYes
    ? `Your department voted yes. The provost looked at your numbers and said no. You've taken a tenure-track job at ${name}. The clock starts over.`
    : `Tenure denied. You've taken a tenure-track job at ${name}. The clock starts over.`);
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

// =====================================================================
// PAPERS ON THE DESK — small helpers every feature module uses to own a
// panel. A module calls ensurePanel() once; the desk adopts the panel as a
// paper; setPanelBody() only rewrites the inside when the markup changed,
// so the button under your cursor isn't swapped out mid-click.
// =====================================================================

function escHTML(s) {
  return String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function ensurePanel(id, title, icon) {
  let el = document.getElementById(id);
  if (el) return el;
  const dash = document.getElementById("dashboard");
  if (!dash) return null;
  el = document.createElement("div");
  el.className = "panel";
  el.id = id;
  el.dataset.paperTitle = title;
  el.style.display = "none";
  el.innerHTML = `<h2><i class="fa-solid ${icon}"></i> <span class="panel-title">${title}</span></h2><div class="panel-body"></div>`;
  dash.appendChild(el);
  return el;
}

// Replace an element's HTML only when it changed, so buttons inside it
// survive the ten-times-a-second render and clicks land.
function setHTML(el, html) {
  if (!el || el.__html === html) return;
  el.innerHTML = html;
  el.__html = html;
}

function setPanelBody(el, html) {
  const body = el?.querySelector(".panel-body");
  if (!body || body.__html === html) return;
  body.innerHTML = html;
  body.__html = html;
}

function setPanelTitle(el, title) {
  const t = el?.querySelector(".panel-title");
  if (t && t.__html !== title) { t.innerHTML = title; t.__html = title; }
}

function showPanel(el, on) {
  if (!el) return;
  const want = on ? "" : "none";
  if (el.style.display !== want) el.style.display = want;
}

// Update one live number inside a panel without rebuilding it
function setLive(el, key, text) {
  const n = el?.querySelector(`[data-live="${key}"]`);
  if (n && n.textContent !== text) n.textContent = text;
}

// "40 energy, 12 drafts, $300"
function costLabel(cost) {
  if (!cost) return "";
  const bits = [];
  if (cost.energy)    bits.push(`${cost.energy} energy`);
  if (cost.knowledge) bits.push(`${fmtBig(cost.knowledge)} knowledge`);
  if (cost.drafts)    bits.push(`${fmtBig(cost.drafts)} drafts`);
  if (cost.money)     bits.push(`$${fmtBig(cost.money)}`);
  if (cost.funds)     bits.push(`$${fmtBig(cost.funds)} lab funds`);
  return bits.join(", ");
}

// Big numbers: 9,999 → 10k → 2.6M → 4.1B → 1.2Qa ...
const BIG_SUFFIXES = ["", "k", "M", "B", "T", "Qa", "Qi", "Sx", "Sp", "Oc", "No", "Dc"];
function fmtBig(n, digits = 3) {
  if (typeof n !== "number" || Number.isNaN(n)) return "0";
  if (!Number.isFinite(n)) return "∞";
  const neg = n < 0; n = Math.abs(n);
  if (n < 10000) {
    const str = Number.isInteger(n) ? n.toLocaleString("en-US") : (n < 10 ? n.toFixed(1) : Math.round(n).toLocaleString("en-US"));
    return (neg ? "−" : "") + str;
  }
  const tier = Math.min(BIG_SUFFIXES.length - 1, Math.floor(Math.log10(n) / 3));
  const scaled = n / Math.pow(1000, tier);
  const str = scaled.toPrecision(digits).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
  return (neg ? "−" : "") + str + BIG_SUFFIXES[tier];
}
