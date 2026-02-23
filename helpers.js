//helpers.js
    ///////////////////HELPERS/////////////////////////////

/// Level system ///////////////////////////////////////////////////
function levelName() {
  return LEVELS[state.levelIndex]?.label || state.level;
}
function canLevelUp(nextIndex) {
  const nextLevel = LEVELS[nextIndex];
  if (!nextLevel) return false;   // critical

  const req = nextLevel.req;
  if (!req) return false;

  if (nextIndex === 1 && !state.collegeAccepted) return false;

  return (
    state.knowledge >= req.k &&
    state.totalDraftsEver >= req.d &&
    state.publications >= req.p &&
    state.citations >= req.c &&
    state.hIndex >= (req.h ?? 0) &&
    state.landmarksCompleted >= req.l
  );
}
function tryLevelUp() {
  while (canLevelUp(state.levelIndex + 1)) {
    state.levelIndex += 1;
    state.level = LEVELS[state.levelIndex].label; // store label, not object
  }
}

// studying and writing /////////////////////////////////

    function canStudyTextbooks() { return state.levelIndex <= 1; }
    function canStudyPapers() { return state.levelIndex >= 1; }

// math functions//////////////////////////////////////

    function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }
function rand01() { return Math.random(); }

function randInt(lo, hi) { // inclusive
  return Math.floor(lo + rand01() * (hi - lo + 1));
}

/// traits ///////////////////////////////////////////
function rollTrait0to100() {
  return clamp(Math.round(rand01() * 100), 0, 100);
}

function rollIQ() {
  // mean 100, sd 15, clamp to sane range
  return clamp(Math.round(approxNormal(100, 15)), 55, 145);
}

function trait01(x) { // 0..100 -> 0..1
  return clamp(x, 0, 100) / 100;
}

function traitCentered(x) { // 0..100 -> -1..+1 centered at 50
  return (clamp(x, 0, 100) - 50) / 50;
}


function rollBirthTraitsIfNeeded() {
  // pick any one trait as the sentinel
  if (state.traits && state.traits.rolled) return;

  // make sure the object exists
  state.traits = state.traits || {};

  state.traits.iq = rollIQ();
  state.traits.conscientiousness = rollTrait0to100();
  state.traits.agreeableness = rollTrait0to100();
  state.traits.neuroticism = rollTrait0to100();
  state.traits.openness = rollTrait0to100();
  state.traits.extraversion = rollTrait0to100();
  state.traits.ses = rollTrait0to100();

  // reveal flags (optional)
  state.traits.bigFiveAwareness = false; // for Social Science later
  state.traits.revealed = false;         // for therapy later
  state.traits.rolled = true;
}

function rebuildModifiers() {
  // reset baseline
  state.modifiers.knowledgeMult = 1;
  state.modifiers.paperMult = 1;
  state.modifiers.writeCostMult = 1;
  state.modifiers.citationMult = 1;
  state.modifiers.energyRegenMult = 1;

  const t = state.traits || {};
  const iq = traitCentered(t.iq ?? 100);                 // IQ is not 0..100, but close enough centered at 100
  const c  = traitCentered(t.conscientiousness ?? 50);
  const a  = traitCentered(t.agreeableness ?? 50);
  const n  = traitCentered(t.neuroticism ?? 50);
  const o  = traitCentered(t.openness ?? 50);
  const e  = traitCentered(t.extraversion ?? 50);
  // ses used elsewhere (prestige jitter), but available here if you want later

  // IQ: study gain up/down; write cost down/up (smart = slightly cheaper writing)
  state.modifiers.knowledgeMult *= (1 + IQ_STUDY_MAX * (iq / 2));      // gentle: iq/2 keeps it tiny
  state.modifiers.writeCostMult *= (1 - IQ_WRITE_COST_MAX * (iq / 2)); // inverse

  // Openness: paper reading gain (curiosity = better extraction from papers)
  state.modifiers.paperMult *= (1 + OPENNESS_PAPER_MAX * o);

  // (Major effects – keep them simple for now)
  switch (state.identity?.major) {
    case "STEM":
      state.modifiers.paperMult *= 1.06;
      state.modifiers.writeCostMult *= 1.05;
      break;
    case "Humanities":
      state.modifiers.paperMult *= 0.98;
      state.modifiers.writeCostMult *= 0.92;
      break;
    case "Engineering":
      state.modifiers.writeCostMult *= 0.94;
      state.modifiers.paperMult *= 1.02;
      break;
    case "Business":
      state.modifiers.citationMult *= 1.05;
      break;
    case "Arts":
      state.modifiers.energyRegenMult *= 1.03;
      break;
    case "Social Science":
  // Reads broadly, cites obsessively, decent at extracting meaning from papers
     state.modifiers.paperMult *= 1.05;
     state.modifiers.knowledgeMult *= 1.02;
     state.modifiers.citationMult *= 1.08;
     break;

  }
}

function shouldPromptMajor() {
  return (
    state.levelIndex === 1 && // undergrad
    state.totalDraftsEver >= MAJOR_DECLARE_DRAFTS &&
    state.identity?.major === "undeclared"
  );
}

function declareMajor(majorName) {
  state.identity.major = majorName;

  // Social Science perk: +5 agreeableness (cap at 100) and reveal trait labels (not values)
  if (majorName === "Social Science") {
    state.traits.agreeableness = clamp(
      (state.traits.agreeableness ?? 50) + 5,
      0,
      100
    );

    // Only upgrade visibility, never downgrade (therapy can later set "values")
    if ((state.traits.visibility ?? "hidden") === "hidden") {
      state.traits.visibility = "labels";
    }
  }

  rebuildModifiers();
  render();
}




function approxNormal(mean, sd) {
  let s = 0;
  for (let i = 0; i < 6; i++) s += (Math.random() * 2 - 1);
  const z = s / 6;
  return mean + z * sd;
}


    function satPrepBonus() {
      const x = state.totalDraftsEver;
      return SAT_PREP_SCALE * Math.log10(1 + state.totalDraftsEver)
    }

    function satAttemptsMax() {
      return SAT_BASE_ATTEMPTS + Math.floor(state.totalDraftsEver / SAT_ATTEMPTS_PER_DRAFTS);
    }

    function satTotal() {
      const m = state.satMath ?? 0;
      const v = state.satVerbal ?? 0;
      return m + v;
    }

    function inCooldown() { return Date.now() < state.cooldownUntil; }

function act(fn) {
  const did = fn();
  if (did) tryLevelUp();
  render();
}


    function canTakeSAT() {
      return (
        state.levelIndex === 0 &&
        state.knowledge >= SAT_MIN_KNOWLEDGE &&
        state.energy >= SAT_ENERGY_COST &&
        state.satAttemptsUsed < satAttemptsMax() &&
        !inCooldown()
      );
    }

    function rollSatSectionScore() {
      const raw = approxNormal(SAT_MEAN, SAT_SD) + satPrepBonus();
      return clamp(Math.round(raw), 200, 800);
    }

function calcPrestigeFromSAT(totalScore) {
  const base = clamp((totalScore - 800) / 800, 0, 1) * 100;

  const ses = traitCentered((state.traits || {}).ses ?? 50);
  const sesShift = SES_PRESTIGE_JITTER_MAX * ses; // low SES nudges down, high nudges up

  const jitter = (Math.random() * 20 - 10) + sesShift;
  return clamp(Math.round(base + jitter), 0, 100);
}

// GRE parallels SAT (modern GRE: 130–170 per section, total 260–340)
function grePrepBonus() {
  return GRE_PREP_SCALE * Math.log10(1 + state.totalDraftsEver);
}

function greAttemptsMax() {
  return GRE_BASE_ATTEMPTS + Math.floor(state.totalDraftsEver / GRE_ATTEMPTS_PER_DRAFTS);
}

function greTotal() {
  const q = state.greQuant ?? 0;
  const v = state.greVerbal ?? 0;
  return q + v;
}

function canTakeGRE() {
  return (
    state.levelIndex === 1 &&
    state.knowledge >= GRE_MIN_KNOWLEDGE &&
    state.energy >= GRE_ENERGY_COST &&
    state.greAttemptsUsed < greAttemptsMax() &&
    !inCooldown()
  );
}

function rollGreSectionScore() {
  const raw = approxNormal(GRE_MEAN, GRE_SD) + grePrepBonus();
  return clamp(Math.round(raw), 130, 170);
}

function calcPrestigeFromGRE(totalScore) {
  const base = clamp((totalScore - 260) / 80, 0, 1) * 100;

  const ses = traitCentered((state.traits || {}).ses ?? 50);
  const sesShift = SES_PRESTIGE_JITTER_MAX * ses;

  const jitter = (Math.random() * 14 - 7) + sesShift;
  return clamp(Math.round(base + jitter), 0, 100);
}

function textbookStudyGain() {
  return TEXTBOOK_STUDY_GAIN * state.modifiers.knowledgeMult;
}

function paperStudyGain() {
  const mult = 1 + 0.25 * Math.log10(state.publications + 1);
  return state.knowledgePerStudy * mult * state.modifiers.paperMult * state.modifiers.knowledgeMult;
}


function writeCost() {
  const x = state.totalDraftsEver;
  const B = 8;
  const A = 18;
  const base = (B + A * Math.log10(x + 1));
  return Math.floor(base * state.modifiers.writeCostMult);
}


function autoPurchasePublications() {
  // lock publications until masters
  if (state.levelIndex < 2) return;

  const purchasable = Math.floor(state.drafts / DRAFTS_PER_PUBLICATION);
  if (purchasable > 0) {
    state.drafts -= purchasable * DRAFTS_PER_PUBLICATION;
    state.publications += purchasable;
  }
}

function effectiveCooldownMs() {
  const t = state.traits || {};
  const c = traitCentered(t.conscientiousness ?? 50);
  const n = traitCentered(t.neuroticism ?? 50);

  const mult =
    (1 - CONSC_COOLDOWN_MAX * c) *
    (1 + NEURO_COOLDOWN_MAX * n);

  return Math.floor(BASE_COOLDOWN_MS * clamp(mult, 0.6, 1.8));
}


function spendEnergy(cost) {
  if (inCooldown()) return false;
  state.energy = Math.max(0, state.energy - cost);
  if (state.energy === 0) state.cooldownUntil = Date.now() + effectiveCooldownMs();
  return true;
}

function studyGroupCount() {
  const sg = state.studyGroups;
  return (sg.undergrad ? 1 : 0) + (sg.masters ? 1 : 0) + (sg.doctoral ? 1 : 0);
}

function eligibleStudyGroupTier() {
  if (state.levelIndex === 1 && !state.studyGroups.undergrad) return "undergrad";
  if (state.levelIndex === 2 && !state.studyGroups.masters) return "masters";
  if (state.levelIndex === 3 && !state.studyGroups.doctoral) return "doctoral";
  return null;
}

function joinStudyGroup(tier) {
  if (!tier) return false;
  if (!state.studyGroups[tier]) {
    state.studyGroups[tier] = true;
    return true;
  }
  return false;
}

///////////////////PUBLICATIONS (papers[])/////////////////////////////

function canPublish(type) {
  if (state.levelIndex < PUB_UNLOCK_LEVEL) return false;
  if (inCooldown()) return false;
  if (state.energy < PUB_ENERGY_COST) return false;

  const cost = PUB_COST[type];
  if (!cost) return false;

  return state.drafts >= cost.drafts && state.knowledge >= cost.knowledge;
}

function computePaperQuality() {
  // Snapshot quality at publication time. Keep it mostly skill-driven, lightly random.
  const knowledgeFactor = clamp(state.knowledge / 500, 0, 1);
  const prestigeFactor = clamp(state.universityPrestige / 100, 0, 1);
  const experienceFactor = clamp(Math.log10(1 + state.totalDraftsEver) / 3, 0, 1);
  const randomness = 0.9 + Math.random() * 0.2; // 0.9–1.1

  const score =
    40 * knowledgeFactor +
    30 * prestigeFactor +
    20 * experienceFactor +
    10 * randomness;

  return clamp(Math.round(score), 0, 100);
}

function publishPaper(type) {
  if (!canPublish(type)) return false;
  if (!spendEnergy(PUB_ENERGY_COST)) return false;

  const cost = PUB_COST[type];
  state.drafts -= cost.drafts;
  state.knowledge -= cost.knowledge;

  const quality = computePaperQuality();
  state.papers.push({
    type,
    citations: 0,
    ageTicks: 0,
    quality
  });

  // keep legacy counters in sync for now
  state.publications = state.papers.length;
  return true;
}

function majorMultiplier(major, type) {
  const table = {
    STEM:        { conference: 1.10, journal: 1.08, chapter: 0.92, monograph: 0.90 },
    Humanities:  { conference: 0.92, journal: 0.95, chapter: 1.10, monograph: 1.12 },
    Engineering: { conference: 1.12, journal: 1.03, chapter: 0.90, monograph: 0.88 },
    Business:    { conference: 1.00, journal: 1.08, chapter: 1.02, monograph: 0.95 },
    Arts:        { conference: 0.95, journal: 0.95, chapter: 1.08, monograph: 1.05 },
    "Social Science": { conference: 1.00, journal: 1.05, chapter: 1.05, monograph: 1.00 }
  };
  return table[major]?.[type] ?? 1;
}

function qualityMult(q) {
  return 0.7 + 0.6 * (clamp(q, 0, 100) / 100); // 0.7x–1.3x
}
