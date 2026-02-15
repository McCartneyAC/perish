// state.js
    const LEVELS = [
      "high school","undergrad","masters","doctoral","postdoc",
      "adjunct","tenure track","tenured","habilitation","emeritus"
    ];

    /////////////////////STATE///////////////////////////
    const state = {
      // progression
      levelIndex: 0,
      level: "high school",
      landmarksCompleted: 0,

      // core resources
      knowledge: 0,
      knowledgePerStudy: 1,
      drafts: 0,
      publications: 0,
      citations: 0,
      totalDraftsEver: 0,
      universityPrestige: 0,
      

      // burnout system
      energy: 100,
      maxEnergy: 100,
      cooldownUntil: 0,

      // academic metrics
      hIndex: 0,
      papers: [],

      // milestones (future)
      apClasses: 0,
      credits: 0,
      landmarkInProgress: false,
      landmarkProgress: 0,
      landmarkRequired: 0,

      // SAT + college gate
      satMath: null,
      satVerbal: null,
      satAttemptsUsed: 0,
      collegeAccepted: false,

coffeeUnlocked: false,
coffeeActiveUntil: 0,
coffeeCrashPending: false,


// study groups (one per tier; permanent; max 3)
studyGroups: {
  undergrad: false,
  masters: false,
  doctoral: false
},
studyGroupAccMs: 0,


// player stats for now
  identity: {
    major: "undeclared",
    reputation: 50,
    resilience: 50,
    ambition: 50,
    network: 50
  },

  modifiers: {
    knowledgeMult: 1,
    paperMult: 1,
    writeCostMult: 1,
    citationMult: 1,
    energyRegenMult: 1
  },
traits: {
  iq: 0,
  conscientiousness: 0,
  neuroticism: 0,
  extraversion: 0,
  openness: 0,
  agreeableness: 0,
  ses: 0,
  revealed: false
}


    };

    ///////////////////KNOBS/////////////////////////////
    const WRITE_GAIN_DRAFTS = 1;
    const STUDY_BOOST_PER_WRITE = 0.1;
    const DRAFTS_PER_PUBLICATION = 10;

    const CITATIONS_UNLOCK_PUBS = 3;
    const TICK_MS = 1000;

    // Study modes + energy costs
    const TEXTBOOK_ENERGY_COST = 3;
    const PAPER_ENERGY_COST = 6;

    // Textbook study is FLAT
    const TEXTBOOK_STUDY_GAIN = 1;

    const WRITE_ENERGY_COST = 8;
    const ENERGY_REGEN_PER_TICK = 6;
    const COOLDOWN_MS = 10000;

    // SAT gating + costs
    const SAT_UNLOCK_KNOWLEDGE = 20;
    const SAT_MIN_KNOWLEDGE = 35;
    const SAT_ENERGY_COST = 80;

    // attempts tied to effort
    const SAT_BASE_ATTEMPTS = 4;
    const SAT_ATTEMPTS_PER_DRAFTS = 25;

    // SAT score roll tuning
    const SAT_MEAN = 500;
    const SAT_SD = 120;
    const SAT_PREP_SCALE = 120;
    const SAT_ACCEPT_TOTAL = 1200;

const COFFEE_COST_DRAFTS = 50;       // one-time mokapot purchase
const COFFEE_DURATION_MS = 30000;    // 30 seconds
const COFFEE_OVER_CAP = 40;          // max energy becomes 140
const COFFEE_CRASH_MS = 20000;       // extended burnout

const BASE_COOLDOWN_MS = 10000;          // replace COOLDOWN_MS usage with this
const STUDY_GROUP_BASE_COST = 40;        // whatever you’re using now

// Trait effect strengths (keep tiny)
const IQ_STUDY_MAX = 0.08;               // up to ±8% study gain
const IQ_WRITE_COST_MAX = 0.06;          // up to ±6% write cost

const OPENNESS_PAPER_MAX = 0.06;         // up to ±6% paper reading gain
const EXTRAVERSION_GROUP_MAX = 0.10;     // up to ±10% study group tick

const CONSC_COOLDOWN_MAX = 0.12;         // up to -12% cooldown for high C
const NEURO_COOLDOWN_MAX = 0.18;         // up to +18% cooldown for high N

const AGREE_GROUP_COST_MAX = 0.25;       // up to -25% cost for high A
const SES_PRESTIGE_JITTER_MAX = 6;       // shifts prestige jitter by ±6 points


const MAJOR_DECLARE_DRAFTS = 60;

    const LEVEL_REQS = [
      { k: 0,    d: 0,    p: 0,   c: 0,    l: 0 },
      { k: 40,   d: 25,   p: 0,   c: 0,    l: 0 },
      { k: 120,  d: 120,  p: 0,   c: 0,    l: 0 },
      { k: 220,  d: 320,  p: 0,   c: 0,    l: 1 },
      { k: 320,  d: 520,  p: 3,   c: 0,    l: 2 },
      { k: 420,  d: 760,  p: 10,  c: 20,   l: 2 },
      { k: 520,  d: 1050, p: 20,  c: 60,   l: 2 },
      { k: 650,  d: 1400, p: 35,  c: 140,  l: 2 },
      { k: 820,  d: 1850, p: 55,  c: 300,  l: 3 },
      { k: 1000, d: 2400, p: 85,  c: 650,  l: 3 }
    ];