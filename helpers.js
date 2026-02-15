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
