// state.js


const LEVELS = [
  {
    id: "highschool",
    label: "high school",
    req: { k: 0, d: 0, p: 0, c: 0, h: 0, l: 0 },
    gates: {},
    tip: "To be accepted to college, you must receive a sufficient SAT score."
  },

  {
    id: "undergrad",
    label: "undergrad",
    req: { k: 40, d: 25, p: 0, c: 0, h: 0, l: 0 },
    gates: { satTotal: 1200 },
    tip: "To be accepted to a master's program, you must earn a sufficient GRE score."
  },

  {
    id: "masters",
    label: "masters",
    req: { k: 120, d: 120, p: 0, c: 0, h: 0, l: 0 },
    gates: {},
    tip: "To be accepted to a doctoral program, you must complete a master's thesis."
  },

  {
    id: "doctoral",
    label: "doctoral",
    req: { k: 220, d: 320, p: 0, c: 0, h: 0, l: 1 },
    gates: { dissertationDefense: true },
    tip: "To earn your PhD, you must pass your dissertation defense."
  },

  {
    id: "postdoc",
    label: "postdoc",
    req: { k: 320, d: 520, p: 3, c: 0, h: 0, l: 2 },
    gates: {},
    tip: "To earn an adjunct position, write your first 3 papers."
  },

  {
    id: "adjunct",
    label: "adjunct",
    req: { k: 420, d: 760, p: 10, c: 20, h: 0, l: 2 },
    gates: {},
    tip: "To find a tenure-track job, accumulate citations in major papers."
  },

  {
    id: "tenuretrack",
    label: "tenure track",
    req: { k: 520, d: 1050, p: 20, c: 60, h: 5, l: 2 },
    gates: { tenureReview: true },
    tip: "To earn tenure, you must pass departmental review."
  },

  {
    id: "tenured",
    label: "tenured",
    req: { k: 650, d: 1400, p: 35, c: 140, h: 25, l: 2 },
    gates: {},
    tip: "To earn habilitation, you must write a significant landmark work."
  },

  {
    id: "habilitation",
    label: "habilitation",
    req: { k: 820, d: 1850, p: 55, c: 300, h: 50, l: 3 },
    gates: {},
    tip: "To become professor emeritus, your reputation must be undeniable."
  },

  {
    id: "emeritus",
    label: "emeritus",
    req: { k: 1000, d: 2400, p: 85, c: 650, h: 150, l: 3 },
    gates: {},
    tip: "There is nothing left to prove. Wait for your Nobel Prize."
  }
];


// ================= CLUBS (Undergrad identity fork) =================
// Effects are intentionally SMALL (mostly 3–8%).
// Philosophy: clubs bend slopes; they don’t print free resources.
// Wiring happens later in joinClub() + rebuildModifiers().

const CLUBS = {
  robotics: {
    id: "robotics",
    label: "Join Robotics Team",
    blurb: "Competitions, late nights, and a suspicious amount of solder fumes.",
    effects: {
      modifiersMult: {
        knowledgeMult: 1.06,
        paperMult: 1.04,
        energyRegenMult: 0.95
      },
      traitDelta: {
        conscientiousness: +2,
        extraversion: -1
      },
      // optional later: publication-type leaning
      pubTypeMult: {
        conference: 1.06,
        journal: 1.02,
        chapter: 0.98,
        monograph: 0.95
      }
    }
  },

  lab: {
    id: "lab",
    label: "Join a Research Lab",
    blurb: "You become the undergrad RA in someone else's grant narrative.",
    effects: {
      modifiersMult: {
        paperMult: 1.06,
        knowledgeMult: 1.02,
        writeCostMult: 1.04
      },
      traitDelta: {
        conscientiousness: +2,
        neuroticism: +2
      },
      pubTypeMult: {
        conference: 1.03,
        journal: 1.06,
        chapter: 0.98,
        monograph: 0.95
      },
      // used later when we compute paper quality at publish time
      paperQualityBonus: +5
    }
  },

  greek: {
    id: "greek",
    label: "Join the Greek System",
    blurb: "Social capital, alumni networks, and a calendar that belongs to other people now.",
    effects: {
      modifiersMult: {
        energyRegenMult: 0.95,
        citationMult: 1.03
      },
      traitDelta: {
        extraversion: +3,
        neuroticism: +2,
        agreeableness: +1
      },
      // later: used for admissions / advisor selection / job market
      networkDelta: +12,
      // mild prestige halo you can apply on joining (if you want later)
      prestigeDelta: +2,
      pubTypeMult: {
        conference: 1.02,
        journal: 1.02,
        chapter: 1.00,
        monograph: 0.98
      }
    }
  },

  theater: {
    id: "theater",
    label: "Join Theater / Band",
    blurb: "Rehearsals, performances, and the rare skill of not combusting onstage.",
    effects: {
      modifiersMult: {
        energyRegenMult: 1.08,
        writeCostMult: 0.98,
        knowledgeMult: 0.97
      },
      traitDelta: {
        extraversion: +2,
        resilience: +3 // if you later want to map this to identity stats
      },
      pubTypeMult: {
        conference: 0.98,
        journal: 0.98,
        chapter: 1.02,
        monograph: 1.03
      }
    }
  },

  gov: {
    id: "gov",
    label: "Join Student Government",
    blurb: "Meetings. Motions. Committees. A taste of administrative gravity.",
    effects: {
      modifiersMult: {
        energyRegenMult: 0.97,
        paperMult: 0.96
      },
      traitDelta: {
        extraversion: +1,
        agreeableness: +2,
        neuroticism: +1
      },
      networkDelta: +8,
      // later: can boost grant odds / reduce admin penalties
      grantAptitudeBonus: +8,
      pubTypeMult: {
        conference: 1.00,
        journal: 1.02,
        chapter: 1.02,
        monograph: 1.00
      }
    }
  },

  litmag: {
    id: "litmag",
    label: "Join Literary Magazine",
    blurb: "Workshop nights, editorial bloodsport, and sentences that actually sing.",
    effects: {
      modifiersMult: {
        writeCostMult: 0.94,
        knowledgeMult: 1.02,
        paperMult: 0.98
      },
      traitDelta: {
        openness: +3,
        neuroticism: +1
      },
      pubTypeMult: {
        conference: 0.95,
        journal: 0.98,
        chapter: 1.08,
        monograph: 1.10
      }
    }
  }
};

    /////////////////////STATE///////////////////////////
    const state = {
      // progression
      levelIndex: 0,

      level: LEVELS[0].label,

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

      // GRE + masters gate
      greQuant: null,
      greVerbal: null,
      greAttemptsUsed: 0,
      mastersAccepted: false,

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
  rolled: false,
  visibility: "hidden" // "hidden" | "labels" | "values"
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

    // GRE gating + costs (modern GRE 130-170 per section; total 260-340)
    const GRE_UNLOCK_KNOWLEDGE = 90;
    const GRE_MIN_KNOWLEDGE = 110;
    const GRE_ENERGY_COST = 80;

    const GRE_BASE_ATTEMPTS = 3;
    const GRE_ATTEMPTS_PER_DRAFTS = 60;

    const GRE_MEAN = 150;
    const GRE_SD = 8;
    const GRE_PREP_SCALE = 8;
    const GRE_ACCEPT_TOTAL = 310;

    // Publications (papers[]) — unlock at doctoral
    const PUB_UNLOCK_LEVEL = 3; // doctoral
    const MONOGRAPH_UNLOCK_LEVEL = 5; // adjunct (adjunct -> tenure track gate later)
    const PUB_ENERGY_COST = 25;

    const PUB_COST = {
      conference: { drafts: 12, knowledge: 0 },
      journal:    { drafts: 20, knowledge: 15 },
      chapter:    { drafts: 16, knowledge: 5 },
      monograph:  { drafts: 60, knowledge: 80 }
    };

const COFFEE_COST_DRAFTS = 50;       // one-time mokapot purchase
const COFFEE_DURATION_MS = 30000;    // 30 seconds
const COFFEE_OVER_CAP = 40;          // max energy becomes 140
const COFFEE_CRASH_MS = 20000;       // extended burnout

const BASE_COOLDOWN_MS = 10000;          // replace COOLDOWN_MS usage with this


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
