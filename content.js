// content.js — all static game data
// This file defines the shape of the game world. No logic lives here except
// visibleWhen(state) functions on individual objects.
// To add new content: add a new object. No other file should need to change.

(() => {
  "use strict";

  // =====================================================================
  // CONSTANTS — tunable knobs
  // =====================================================================

  window.TICK_MS                    = 100;
  window.ENERGY_MAX                 = 100;
  window.ENERGY_REGEN_PER_TICK      = .6;

  window.TEXTBOOK_ENERGY_COST       = 3;
  window.TEXTBOOK_STUDY_GAIN        = 1;

  window.PAPER_ENERGY_COST          = 6;

  window.WRITE_ENERGY_COST          = 8;
  window.WRITE_BASE_KNOWLEDGE_COST  = 8;   // multiplied by writeCostMult
  window.WRITE_GAIN_DRAFTS          = 1;

  // Logarithmic write cost: cost = (B + A * log10(totalDraftsEver + 1)) * writeCostMult
  window.WRITE_COST_B               = 8;
  window.WRITE_COST_A               = 18;

  window.PUB_ENERGY_COST            = 25;
  window.COLLEGE_APPLICATION_ENERGY = 20;
  window.PUB_UNLOCK_LEVEL           = 3;    // doctoral
  window.MONOGRAPH_UNLOCK_LEVEL     = 4;    // postdoc
  window.PRE_DISSERTATION_PUB_CAP   = 5;    // max papers before dissertation defense

  window.DRAFTS_PER_PUBLICATION     = 10;   // legacy auto-convert (pre-manual publish system)
  window.MAJOR_DECLARE_DRAFTS       = 60;   // drafts needed before major declaration prompt

  window.BASE_COOLDOWN_MS           = 15000;

  // Landmark decay (softened). Progress slips only after a grace period with
  // no landmark progress, pauses during burnout, and never drops below the
  // start of the current phase.
  window.LANDMARK_DECAY_PER_TICK    = 0.01;
  window.LANDMARK_DECAY_GRACE_MS    = 20000;

  window.SES_PRESTIGE_JITTER_MAX    = 8;

  // ── Personality → mechanics ──────────────────────────────────────────
  // Each value is the effect at the trait's extreme. Traits are centered to
  // −1..+1 (50 → 0; IQ maps 70..130 → −1..+1) and scale linearly:
  //   keys ending in "Mult" multiply:  × (1 + value × centered)
  //   other keys add:                  + value × centered
  // Keys can reach into objects with a dot ("pubTypeMult.conference").
  // rebuildModifiers() applies the table; add a row here and it just works.
  window.TRAIT_EFFECTS = {
    iq:                { knowledgeMult: 0.15 },
    conscientiousness: { writeCostMult: -0.15, burnoutMult: -0.25 },
    neuroticism:       { burnoutMult: 0.50, energyRegenMult: -0.10, debtStressMult: 0.60 },
    openness:          { paperMult: 0.12, tierSpread: 0.35 },              // bolder ideas: more duds AND more bangers
    extraversion:      { "pubTypeMult.conference": 0.12, grantChance: 0.06 },  // networking pays at conferences and on panels
    agreeableness:     { gradMorale: 0.25, reviewSelfCite: -0.25 }         // nicer to students; less likely to demand citations
  };
  window.BURNOUT_MULT_RANGE         = [0.5, 2.0];   // clamp on the combined burnoutMult

  // ── Time ─────────────────────────────────────────────────────────────
  // One career "year" of real time. Salaries, tuition, interest, grad school
  // length, and the tenure clock all count in these years.
  window.SECONDS_PER_YEAR           = 60;

  // ── Money ────────────────────────────────────────────────────────────
  // Drafts ≈ credits, so college and master's bill tuition per draft written.
  window.CREDITS_PER_YEAR           = 30;
  // Annual sticker price by level, then by university tier (see UNIVERSITY_NAMES)
  //               CC     regional  lib arts  state   ivy
  window.TUITION_ANNUAL = {
    1: [ 4000,  12000,    64000,    28000,  88000],   // undergrad
    2: [ 9000,  18000,    46000,    30000,  72000]    // master's; doctoral is funded
  };
  // Parents pay (ses − 20) / 60 of the bill (0 below SES 20, all of it above 80).
  // Aid covers this share of whatever's left. Ivies are rich; state schools are not.
  window.FIN_AID_BY_TIER            = [0.5, 0.2, 0.4, 0.2, 0.8];
  window.SHIFT_PAY                  = { 0: 60, 1: 90 };   // per shift: high school, undergrad
  window.SHIFT_ENERGY_COST          = 20;
  window.SALARY_ANNUAL              = { 3: 32000, 4: 56000, 5: 22000, 6: 85000, 7: 115000, 8: 140000, 9: 60000 };
  window.LOAN_INTEREST_ANNUAL       = 0.068;
  window.LOAN_REPAYMENT_LEVEL       = 4;      // in-school deferment ends after the PhD; interest accrues anyway
  window.LOAN_PAYMENT_SHARE         = 0.15;   // income-driven repayment: 15% of salary
  window.DEBT_STRESS_SCALE          = 250000; // debt at which stress maxes out
  window.DEBT_STRESS_MAX            = 0.15;   // energy regen lost at full stress (before neuroticism)

  // ── Grants ───────────────────────────────────────────────────────────
  window.GRANT_ENERGY_COST          = 30;
  window.GRANT_DRAFT_COST           = 15;
  window.GRANT_COOLDOWN_MS          = 45000;
  window.GRANT_BASE_CHANCE          = 0.12;
  window.GRANT_H_CHANCE             = 0.006;  // per point of h-index
  window.GRANT_RESUBMIT_BONUS       = 0.04;   // per failed attempt, up to 3
  window.GRANT_CHANCE_RANGE         = [0.03, 0.65];
  window.GRANT_AWARD                = { 4: 40000, 5: 15000, 6: 250000, 7: 450000, 8: 700000, 9: 100000 };

  // ── Peer review ──────────────────────────────────────────────────────
  window.REVIEW_ENERGY_COST         = 12;
  window.REVIEW_COOLDOWN_MS         = 20000;
  window.REVIEW_KNOWLEDGE_MULT      = 3;      // × one round of paper reading
  window.REVIEW_GOODWILL_MAX        = 5;
  window.REVIEW_GOODWILL_TILT       = 0.08;   // tier tilt per goodwill, spent on your next publication
  window.REVIEW_SELF_CITE_BASE      = 0.25;   // chance you talk the authors into citing you

  // ── Tenure clock ─────────────────────────────────────────────────────
  window.TENURE_TRACK_LEVEL         = 6;
  window.TENURE_CLOCK_YEARS         = 7;
  window.TENURE_DENIAL_PRESTIGE     = 15;     // denied → a less prestigious school, clock restarts

  // ── Grad students ────────────────────────────────────────────────────
  window.GRAD_SLOTS                 = { 6: 2, 7: 4, 8: 6, 9: 1 };
  window.GRAD_STIPEND_ANNUAL        = 35000;  // paid out of your money every tick; hire with a year in the bank
  window.GRAD_PAPER_YEARS           = 2;      // one paper per student per ~2 years at normal morale
  window.GRAD_PROGRAM_YEARS         = 5;      // then they defend and leave
  window.GRAD_MORALE_BASE           = 0.6;    // 0..1; agreeableness shifts it
  window.GRAD_QUIT_MORALE           = 0.15;
  window.ALUMNI_CITE_EACH           = 0.03;   // citationMult per graduated student
  window.ALUMNI_CITE_MAX            = 0.30;

  // ── Stealing student ideas ───────────────────────────────────────────
  window.STEAL_ENERGY_COST          = 5;
  window.STEAL_COOLDOWN_MS          = 60000;
  window.STEAL_KNOWLEDGE_MULT       = 10;     // × one round of paper reading
  window.STEAL_CAUGHT_BASE          = 0.05;   // +5% per previous theft, up to 50%
  window.STEAL_CAUGHT_MAX           = 0.5;
  window.STEAL_CAUGHT_PRESTIGE      = 8;

  window.NEWS_MAX                   = 6;

  // Per-paper citation cap (histogram length − 1). Papers stop at this count.
  window.HINDEX_BUCKET_MAX          = 500;

  // ── Citations ────────────────────────────────────────────────────────
  // Papers live in one citation histogram per quality tier:
  //   state.papers.tiers[t][c] = number of tier-t papers with exactly c citations
  // Fixed size (tiers × 151) no matter how many papers get published.
  //
  // Every paper starts at 0 citations. Each tick, each paper picks up one
  // citation with probability
  //   CITE_BASE_RATE × tier.rate × (1 + CITE_GROWTH × log10(c + 1))
  //     × max(CITE_TRICKLE, 1 − c / tier.ceiling) × citationMult
  // so the first citation is the slowest, later ones come faster, and then the
  // paper runs out of readers near its tier's ceiling and slows to a trickle.
  // The ceilings are what keep h-index well below paper count, as in real life:
  // forty obscure papers with six citations each do nothing for your h.
  window.CITE_BASE_RATE             = 1 / 600;  // tier "competent", 0 cites: ~600 ticks (~60 s) to the first
  window.CITE_GROWTH                = 3;        // 1 cite → 1.9×, 9 → 4×, 99 → 7×
  window.CITE_TRICKLE               = 0.03;     // past its ceiling a paper still gets the odd citation

  // Quality tiers. Order matters (index = tier).
  //   rate    — multiplies CITE_BASE_RATE
  //   ceiling — where citations taper off
  window.PAPER_TIERS = [
    { id: "obscure",   label: "Obscure",        rate: 0.4, ceiling: 8   },
    { id: "competent", label: "Competent",      rate: 1.0, ceiling: 30  },
    { id: "solid",     label: "Solid",          rate: 1.8, ceiling: 90  },
    { id: "strong",    label: "Strong",         rate: 3.0, ceiling: 250 },
    { id: "landmark",  label: "Field-Defining", rate: 5.0, ceiling: 500 }
  ];

  // Base odds (relative weights over the tiers above) by career level.
  // Levels not listed fall back to PAPER_TIER_ODDS_DEFAULT.
  window.PAPER_TIER_ODDS = {
    3: [60, 28,  9,  2.7, 0.3],   // doctoral — mostly obscure; the occasional accidental banger
    4: [40, 33, 18,  7.5, 1.5],   // postdoc
    5: [50, 30, 14,  5,   1  ],   // adjunct — five sections of intro, no time to think
    6: [35, 33, 20, 10,   2  ],   // tenure track
    7: [35, 30, 21, 11,   3  ],   // tenured
    8: [30, 30, 23, 13,   4  ],   // habilitation
    9: [45, 28, 16,  8,   3  ]    // emeritus — the final book nobody cites
  };
  window.PAPER_TIER_ODDS_DEFAULT = [60, 28, 9, 2.7, 0.3];

  // Tilts on top of the base odds. Positive tilt shifts weight toward higher tiers.
  window.PAPER_QUALITY_CENTER       = 65;    // computePaperQuality() at which the tilt is zero
  window.PAPER_QUALITY_TILT         = 0.35;  // × (paperQuality − center) / 35
  window.PUB_TYPE_MULT_TILT         = 3;     // × ln(modifiers.pubTypeMult[type]) — majors/clubs
  window.PUB_TYPE_TIER_TILT = {
    conference: -0.3,
    journal:     0,
    chapter:    -0.15,
    monograph:   0.4
  };

  // ── Milestone events (HS, undergrad) ─────────────────────────────────
  // A perk with a `milestone` block becomes a one-at-a-time random event:
  // after `afterDrafts` drafts since the last milestone, one eligible event
  // is picked and shown as a button. See maybeSelectMilestone() in helpers.js.
  // Default afterDrafts per level; an event can override with its own afterDrafts.
  window.MILESTONE_DRAFT_INTERVAL   = { 0: 7, 1: 8 };

  // Publication costs (drafts + knowledge consumed on publish)
  window.PUB_COST = {
    conference: { drafts: 36,  knowledge: 0  },   // 12 * 3
    journal:    { drafts: 60,  knowledge: 15 },   // 20 * 3
    chapter:    { drafts: 48,  knowledge: 5  },   // 16 * 3
    monograph:  { drafts: 180, knowledge: 80 }    // 60 * 3
  };

  // =====================================================================
  // TESTS
  // =====================================================================

  window.TESTS = {
    sat: {
      id:           "sat",
      label:        "SAT",
      visibleWhen:  (s) => s.levelIndex === 0 && s.knowledge >= 20,
      unlock:       { minLevelIndex: 0, minKnowledge: 20 },
      minKnowledge: 35,
      energyCost:   80,
      attempts: {
        base:      4,
        perDrafts: 25   // +1 attempt per 25 totalDraftsEver
      },
      scoring: {
        sectionMin:  200,
        sectionMax:  800,
        mean:        500,
        sd:          120,
        prepScale:   120,   // bonus = prepScale * log10(1 + totalDraftsEver)
        acceptTotal: 1200,
        prestigeModel: "sat"
      },
      sections: [
        { id: "math",   label: "SAT Math"   },
        { id: "verbal", label: "SAT Verbal" }
      ]
    },

    gre: {
      id:           "gre",
      label:        "GRE",
      visibleWhen:  (s) => s.levelIndex === 1 && s.knowledge >= 90,
      unlock:       { minLevelIndex: 1, minKnowledge: 90 },
      minKnowledge: 110,
      energyCost:   80,
      attempts: {
        base:      3,
        perDrafts: 60
      },
      scoring: {
        sectionMin:  130,
        sectionMax:  170,
        mean:        150,
        sd:          8,
        prepScale:   8,
        acceptTotal: 310,
        prestigeModel: "gre"
      },
      sections: [
        { id: "quant",  label: "GRE Quant"  },
        { id: "verbal", label: "GRE Verbal" }
      ]
    }
  };

  // =====================================================================
  // GATES
  // Each gate has an isMet(state) function.
  // Levels reference gates by id. Gates are the only things that can
  // block level progression beyond raw resource requirements.
  // =====================================================================

  window.GATES = {
    college_admission: {
      id:    "college_admission",
      label: "College Admission",
      tip:   "You must achieve a combined SAT score of 1200 or higher.",
      // SAT superscore alone — used by the Apply to College action
      scoreMet: (s) => {
        const sat = s.tests?.sat?.sections || {};
        return ((sat.math ?? 0) + (sat.verbal ?? 0)) >= (window.TESTS.sat.scoring.acceptTotal ?? 1200);
      },
      // Leaving high school also takes an application, so the player decides
      // when senior year ends (and gets to finish its events first)
      isMet: (s) => window.GATES.college_admission.scoreMet(s) && s.flags?.appliedToCollege === true
    },

    masters_admission: {
      id:    "masters_admission",
      label: "Master's Admission",
      tip:   "You must achieve a combined GRE score of 310 or higher.",
      isMet: (s) => {
        const gre = s.tests?.gre?.sections || {};
        return ((gre.quant ?? 0) + (gre.verbal ?? 0)) >= (window.TESTS.gre.scoring.acceptTotal ?? 310);
      }
    },

    masters_thesis: {
      id:    "masters_thesis",
      label: "Master's Thesis",
      tip:   "You must complete and defend your master's thesis.",
      isMet: (s) => s.flags?.mastersThesisCompleted === true
    },

    dissertation_defense: {
      id:    "dissertation_defense",
      label: "Dissertation Defense",
      tip:   "You must successfully defend your doctoral dissertation.",
      isMet: (s) => s.flags?.dissertationDefended === true
    },

    job_market: {
      id:    "job_market",
      label: "Job Market",
      tip:   "You must survive the academic job market.",
      isMet: (s) => s.flags?.jobMarketCleared === true
    },

    tenure_review: {
      id:    "tenure_review",
      label: "Tenure Review",
      tip:   "You must pass your departmental tenure review.",
      isMet: (s) => s.flags?.tenureGranted === true
    },

    habilitation_work: {
      id:    "habilitation_work",
      label: "Landmark Work",
      tip:   "You must complete a significant landmark work.",
      isMet: (s) => s.flags?.habilitationCompleted === true
    }
  };

  // =====================================================================
  // LEVELS
  // req = minimum resources to ENTER this level (checked alongside gate)
  // gateId = gate that must be met before entry (null = no gate)
  // autoStartLandmark = landmark that starts on arrival at this level
  // Landmark counts (l): thesis=1, dissertation=2, first_monograph=3, hab_opus=4
  // =====================================================================

  // Citation-era requirements were set against simulated careers (see the
  // citation model above). Rules of thumb they respect: h ≤ papers, and
  // citations ≈ 3–4 × h² — roughly how real citation records look.
  // Real-world anchors, loosely: TT hire h≈7, tenure h≈14, full prof h≈20-30.
  window.LEVELS = [
    {
      id:     "highschool",
      label:  "High School",
      req:    { k: 0,    d: 0,    p: 0,  c: 0,   h: 0,   l: 0 },
      gateId: null,
      tip:    "Study hard and take the SAT to earn college admission."
    },
    {
      id:     "undergrad",
      label:  "Undergrad",
      req:    { k: 40,   d: 40,   p: 0,  c: 0,    h: 0,   l: 0 },
      gateId: "college_admission",
      tip:    "Declare a major, join a club, and earn a sufficient GRE score."
    },
    {
      id:     "masters",
      autoStartLandmark: "masters_thesis",
      label:  "Master's",
      req:    { k: 120,  d: 120,  p: 0,  c: 0,   h: 0,   l: 0 },
      gateId: "masters_admission",
      tip:    "Complete your master's thesis to advance to doctoral study."
    },
    {
      id:     "doctoral",
      autoStartLandmark: "dissertation",
      label:  "Doctoral",
      req:    { k: 220,  d: 220,  p: 0,  c: 0,   h: 0,   l: 1 },
      gateId: "masters_thesis",
      tip:    "Defend your dissertation to earn your PhD."
    },
    {
      id:     "postdoc",
      autoStartLandmark: "job_market",
      label:  "Postdoc",
      req:    { k: 320,  d: 320,  p: 3,  c: 0,   h: 0,   l: 2 },
      gateId: "dissertation_defense",
      tip:    "Publish, survive, repeat. The job market awaits."
    },
    {
      id:     "adjunct",
      label:  "Adjunct",
      req:    { k: 420,  d: 560,  p: 10, c: 25,   h: 3,   l: 2 },
      gateId: "job_market",
      tip:    "Build your citation record. A tenure-track offer requires proof of impact."
    },
    {
      id:     "tenuretrack",
      autoStartLandmark: "tenure_review",
      label:  "Tenure Track",
      req:    { k: 520,  d: 1050, p: 20, c: 150,  h: 7,   l: 2 },
      gateId: null,
      tip:    "Six years to prove yourself. The tenure review clock is ticking."
    },
    {
      id:     "tenured",
      autoStartLandmark: "habilitation_opus",
      label:  "Tenured",
      req:    { k: 650,  d: 1400, p: 35, c: 600,  h: 14,  l: 2 },
      gateId: "tenure_review",
      tip:    "Write your first monograph. Habilitation requires a landmark work."
    },
    {
      id:     "habilitation",
      label:  "Habilitation",
      req:    { k: 820,  d: 1850, p: 55, c: 2000, h: 24,  l: 3 },
      gateId: "habilitation_work",
      tip:    "Your reputation is becoming undeniable. Emeritus status awaits."
    },
    {
      id:     "emeritus",
      label:  "Emeritus",
      req:    { k: 1000, d: 2400, p: 85, c: 5000, h: 35,  l: 4 },
      gateId: null,
      tip:    "There is nothing left to prove. Await your Nobel Prize."
    }
  ];

  // =====================================================================
  // ACTIONS
  // visibleWhen(state) — should this button be shown?
  // canDo(state) — returns { ok: bool, reason: string }
  // cost — flat object OR function(state) returning resource deltas
  // effects — flat array OR function(state) returning resource deltas
  // Resource deltas: { path: "knowledge", op: "add", value: N }
  // =====================================================================

  window.ACTIONS = {
    study_textbooks: {
      id:          "study_textbooks",
      label:       "Study Textbooks",
      icon:        "fa-book-open-reader",
      visibleWhen: (s) => s.levelIndex <= 1,
      canDo:       (s) => inCooldown()
                     ? { ok: false, reason: "Burned out." }
                     : { ok: true,  reason: "" },
      cost:        { energy: window.TEXTBOOK_ENERGY_COST },
      effects:     (s) => [
        { op: "add", path: "knowledge",
          value: window.TEXTBOOK_STUDY_GAIN * (s.modifiers?.knowledgeMult ?? 1) }
      ]
    },

    study_papers: {
      id:          "study_papers",
      label:       "Read Papers",
      icon:        "fa-newspaper",
      visibleWhen: (s) => s.levelIndex >= 1,
      canDo:       (s) => inCooldown()
                     ? { ok: false, reason: "Burned out." }
                     : { ok: true,  reason: "" },
      cost:        { energy: window.PAPER_ENERGY_COST },
      // Scales with totalDraftsEver (writing makes you a better reader)
      effects:     (s) => {
        const draftScale = 1 + 0.6 * Math.sqrt(s.totalDraftsEver ?? 0);
        const gain = (s.knowledgePerStudy ?? 1)
                   * draftScale
                   * (s.modifiers?.paperMult     ?? 1)
                   * (s.modifiers?.knowledgeMult ?? 1);
        return [{ op: "add", path: "knowledge", value: gain }];
      }
    },

    write: {
      id:          "write",
      label:       "Write",
      icon:        "fa-feather-pointed",
      visibleWhen: (s) => s.levelIndex >= 0,
      canDo:       (s) => {
        if (inCooldown()) return { ok: false, reason: "Burned out." };
        const kCost = Math.floor(
          (window.WRITE_COST_B + window.WRITE_COST_A * Math.log10((s.totalDraftsEver ?? 0) + 1))
          * (s.modifiers?.writeCostMult ?? 1)
        );
        if (s.knowledge < kCost) return { ok: false, reason: `Need ${kCost} knowledge to write.` };
        return { ok: true, reason: "" };
      },
      // Cost and effects are functions because write cost scales with progress
      cost: (s) => {
        const kCost = Math.floor(
          (window.WRITE_COST_B + window.WRITE_COST_A * Math.log10((s.totalDraftsEver ?? 0) + 1))
          * (s.modifiers?.writeCostMult ?? 1)
        );
        return [
          { op: "add", path: "energy",    value: -window.WRITE_ENERGY_COST },
          { op: "add", path: "knowledge", value: -kCost }
        ];
      },
      effects: [
        { op: "add", path: "drafts",         value: window.WRITE_GAIN_DRAFTS },
        { op: "add", path: "totalDraftsEver", value: window.WRITE_GAIN_DRAFTS }
      ]
    },

    // Publish is parameterized by type (conference, journal, chapter, monograph)
    // The UI renders one button per type; each passes payload: { type }
    // Ends high school. Shown once every SAT section has a score; enabled once
    // the SAT superscore, drafts, and knowledge meet the undergrad requirements.
    apply_college: {
      id:          "apply_college",
      label:       "Apply to College",
      icon:        "fa-envelope-open-text",
      placement:   "panel",   // rendered as a button in the Actions panel (render.js)
      blurb:       "Twelve essays about a time you overcame adversity. The adversity is the essays.",
      visibleWhen: (s) => s.levelIndex === 0
                       && !s.flags?.appliedToCollege
                       && (window.TESTS.sat.sections ?? []).every(sec => typeof s.tests?.sat?.sections?.[sec.id] === "number"),
      canDo: (s) => {
        const req    = window.LEVELS[1].req;
        const accept = window.TESTS.sat.scoring.acceptTotal;
        if (!window.GATES.college_admission.scoreMet(s))
          return { ok: false, reason: `needs SAT ≥ ${accept}` };
        if ((s.totalDraftsEver ?? 0) < req.d)
          return { ok: false, reason: `needs ${req.d} drafts written` };
        if ((s.knowledge ?? 0) < req.k)
          return { ok: false, reason: `needs ${req.k} knowledge` };
        if (s.energy < window.COLLEGE_APPLICATION_ENERGY)
          return { ok: false, reason: `needs ${window.COLLEGE_APPLICATION_ENERGY} energy` };
        return { ok: true, reason: "" };
      },
      cost:    { energy: window.COLLEGE_APPLICATION_ENERGY },
      effects: [],
      // Setting the flag opens the college_admission gate; doAction's
      // tryLevelUp() then graduates you in the same click.
      apply:   (s) => { s.flags.appliedToCollege = true; }
    },

    // ── Money ──────────────────────────────────────────────────────────

    // Energy is this game's time, so a shift is energy not spent studying.
    // At Greendale a shift covers about a credit. At an Ivy it covers a textbook.
    work_shift: {
      id:          "work_shift",
      label:       "Work a Shift",
      icon:        "fa-cash-register",
      placement:   "panel",
      blurb:       (s) => s.levelIndex === 0
                     ? "Four hours folding sweaters at the mall. They'll be unfolded by 4:15."
                     : "Four hours at the library desk, telling people the printer is broken.",
      visibleWhen: (s) => s.levelIndex <= 1,
      canDo:       () => inCooldown() ? { ok: false, reason: "burned out" } : { ok: true, reason: "" },
      detail:      (s) => `+$${window.SHIFT_PAY[s.levelIndex] ?? 0}`,
      cost:        { energy: window.SHIFT_ENERGY_COST },
      effects:     (s) => [{ op: "add", path: "money", value: window.SHIFT_PAY[s.levelIndex] ?? 0 }],
      apply:       (s) => { s.stats.shiftsWorked += 1; }
    },

    pay_debt: {
      id:          "pay_debt",
      label:       "Pay Down Loans",
      icon:        "fa-money-bill-transfer",
      placement:   "panel",
      blurb:       "Every dollar goes to principal. Emotionally, it goes to interest.",
      visibleWhen: (s) => s.debt > 0 && s.money >= 1 && s.levelIndex >= 2,
      detail:      (s) => `$${fmtMoney(Math.min(s.money, s.debt))}`,
      apply:       (s) => { const pay = Math.min(s.money, s.debt); s.money -= pay; s.debt -= pay; }
    },

    // ── Post-PhD service ───────────────────────────────────────────────

    review_manuscript: {
      id:          "review_manuscript",
      label:       "Review a Manuscript",
      icon:        "fa-marker",
      placement:   "panel",
      blurb:       "Unpaid, anonymous, and the only time anyone reads your comments closely. The editor remembers, though.",
      visibleWhen: (s) => s.levelIndex >= 4,
      cooldownMs:  window.REVIEW_COOLDOWN_MS,
      canDo:       () => inCooldown() ? { ok: false, reason: "burned out" } : { ok: true, reason: "" },
      detail:      (s) => `goodwill ${s.editorGoodwill ?? 0}/${window.REVIEW_GOODWILL_MAX}`,
      cost:        { energy: window.REVIEW_ENERGY_COST },
      effects:     () => [{ op: "add", path: "knowledge", value: window.REVIEW_KNOWLEDGE_MULT * paperReadingGain() }],
      apply:       () => reviewManuscript()
    },

    write_grant: {
      id:          "write_grant",
      label:       "Write a Grant Proposal",
      icon:        "fa-sack-dollar",
      placement:   "panel",
      blurb:       "Forty pages explaining why this will work, for reviewers who will explain why it won't.",
      visibleWhen: (s) => s.levelIndex >= 4,
      cooldownMs:  window.GRANT_COOLDOWN_MS,
      canDo:       (s) => {
        if (inCooldown()) return { ok: false, reason: "burned out" };
        if ((s.drafts ?? 0) < window.GRANT_DRAFT_COST) return { ok: false, reason: `needs ${window.GRANT_DRAFT_COST} drafts` };
        return { ok: true, reason: "" };
      },
      detail:      (s) => `${window.GRANT_DRAFT_COST} drafts, ~${Math.round(grantChance() * 100)}% odds, $${fmtMoney(window.GRANT_AWARD[s.levelIndex] ?? 0)}`,
      cost:        () => [
        { op: "add", path: "energy", value: -window.GRANT_ENERGY_COST },
        { op: "add", path: "drafts", value: -window.GRANT_DRAFT_COST }
      ],
      apply:       () => submitGrant()
    },

    // ── Running a lab ──────────────────────────────────────────────────

    recruit_grad: {
      id:          "recruit_grad",
      label:       "Recruit a Grad Student",
      icon:        "fa-user-graduate",
      placement:   "panel",
      blurb:       "They'll write papers, run your experiments, and cost you $35,000 a year. Hire with a year of funding in the bank.",
      visibleWhen: (s) => s.levelIndex >= window.TENURE_TRACK_LEVEL,
      canDo:       (s) => {
        if ((s.gradStudents?.length ?? 0) >= gradSlots()) return { ok: false, reason: "lab is full" };
        if (s.money < window.GRAD_STIPEND_ANNUAL)         return { ok: false, reason: `needs $${fmtMoney(window.GRAD_STIPEND_ANNUAL)} in the bank` };
        return { ok: true, reason: "" };
      },
      detail:      (s) => `${s.gradStudents?.length ?? 0}/${gradSlots()}`,
      cost:        { energy: 15 },
      apply:       () => recruitGradStudent()
    },

    steal_ideas: {
      id:          "steal_ideas",
      label:       "Steal Student Ideas",
      icon:        "fa-user-secret",
      placement:   "panel",
      blurb:       "It was a great point in office hours. It'll be an even better one in your next paper.",
      visibleWhen: (s) => s.levelIndex >= 5,
      cooldownMs:  window.STEAL_COOLDOWN_MS,
      canDo:       () => inCooldown() ? { ok: false, reason: "burned out" } : { ok: true, reason: "" },
      detail:      () => `+${Math.round(window.STEAL_KNOWLEDGE_MULT * paperReadingGain())} knowledge`,
      cost:        { energy: window.STEAL_ENERGY_COST },
      effects:     () => [{ op: "add", path: "knowledge", value: window.STEAL_KNOWLEDGE_MULT * paperReadingGain() }],
      apply:       () => stealIdeas()
    },

    publish: {
      id:          "publish",
      label:       "Publish",
      icon:        "fa-scroll",
      visibleWhen: (s) => s.levelIndex >= window.PUB_UNLOCK_LEVEL,
      canDo:       (s, payload) => {
        const type = payload?.type;
        const cost = window.PUB_COST[type];
        if (!cost)
          return { ok: false, reason: "Unknown publication type." };
        if (type === "monograph" && s.levelIndex < window.MONOGRAPH_UNLOCK_LEVEL)
          return { ok: false, reason: "Monographs require postdoc standing." };
        if (s.energy < window.PUB_ENERGY_COST)
          return { ok: false, reason: "Too exhausted to publish." };
        if (s.drafts < cost.drafts)
          return { ok: false, reason: `Need ${cost.drafts} drafts.` };
        if (s.knowledge < cost.knowledge)
          return { ok: false, reason: `Need ${cost.knowledge} knowledge.` };
        // Pre-dissertation publication cap
        if (!s.flags?.dissertationDefended) {
          if (calcTotalPapers() >= window.PRE_DISSERTATION_PUB_CAP)
            return { ok: false, reason: "Doctoral candidates rarely publish more than a handful of papers before defending." };
        }
        return { ok: true, reason: "" };
      },
      cost: (s, payload) => {
        const cost = window.PUB_COST[payload.type];
        return [
          { op: "add", path: "energy",    value: -window.PUB_ENERGY_COST },
          { op: "add", path: "drafts",    value: -cost.drafts            },
          { op: "add", path: "knowledge", value: -cost.knowledge         }
        ];
      },
      // apply() handles non-numeric side effects: roll a quality tier and
      // file the new paper in that tier's histogram at 0 citations.
      apply: (s, payload) => {
        addPaper(rollPaperTier(payload?.type));
        s.editorGoodwill = 0;   // the editor's goodwill got you this far; it's spent
      }
    }
  };

  // =====================================================================
  // AFFILIATIONS — clubs and majors
  // slot: "club" | "major"
  // exclusive: true = player may only hold one per slot
  // effects.modifiers: multiplicative modifiers applied by rebuildModifiers()
  // effects.traits: one-time additive deltas applied on join
  // effects.pubTypeMult: per-publication-type citation/quality multipliers
  // effects.identity: one-time deltas to identity stats (network, resilience, etc.)
  // =====================================================================

  window.CLUBS = {
    // =====================================================================
    // HIGH SCHOOL CLUBS — levelIndex 0, exclusive per slot
    // =====================================================================

    yearbook: {
      id:          "yearbook",
      label:       "Join Yearbook",
      blurb:       "Candid shots, deadlines, and an archive of adolescence.",
      slot:        "hs_club",
      exclusive:   true,
      visibleWhen: (s) => s.levelIndex === 0 && !s.affiliations?.hs_club,
      effects: {
        modifiers: { knowledgeMult: 1.01, writeCostMult: 0.97 },
        traits: { conscientiousness: +2, openness: +2 },
        identity: { network: +4 }
      }
    },

    drama: {
      id:          "drama",
      label:       "Join Drama Club",
      blurb:       "Stage fright, standing ovations, and the stage is yours.",
      slot:        "hs_club",
      exclusive:   true,
      visibleWhen: (s) => s.levelIndex === 0 && !s.affiliations?.hs_club,
      effects: {
        modifiers: { energyRegenMult: 1.03, knowledgeMult: 0.99 },
        traits: { extraversion: +3, openness: +2, neuroticism: -1 },
        identity: { network: +5, resilience: +2 }
      }
    },

    band: {
      id:          "band",
      label:       "Join Band",
      blurb:       "Scales, symphonies, and the clarinet player who always comes in late.",
      slot:        "hs_club",
      exclusive:   true,
      visibleWhen: (s) => s.levelIndex === 0 && !s.affiliations?.hs_club,
      effects: {
        modifiers: { energyRegenMult: 1.04, knowledgeMult: 1.02 },
        traits: { openness: +3, conscientiousness: +1 },
        identity: { resilience: +3 }
      }
    },

    chess: {
      id:          "chess",
      label:       "Join Chess Club",
      blurb:       "Four knights, infinite variations, zero social life.",
      slot:        "hs_club",
      exclusive:   true,
      visibleWhen: (s) => s.levelIndex === 0 && !s.affiliations?.hs_club,
      effects: {
        modifiers: { knowledgeMult: 1.03, citationMult: 1.02 },
        traits: { conscientiousness: +2, extraversion: -2, openness: +1 },
        identity: { network: -1, resilience: +2 }
      }
    },

    debate: {
      id:          "debate",
      label:       "Join Debate Team",
      blurb:       "Prepared speeches, counter-arguments, and a vocabulary you'll regret.",
      slot:        "hs_club",
      exclusive:   true,
      visibleWhen: (s) => s.levelIndex === 0 && !s.affiliations?.hs_club,
      effects: {
        modifiers: { knowledgeMult: 1.04, writeCostMult: 0.95 },
        traits: { conscientiousness: +3, extraversion: +1, neuroticism: -2 },
        identity: { network: +6 },
        prestigeDelta: +3
      }
    },

    newspaper: {
      id:          "newspaper",
      label:       "Join School Newspaper",
      blurb:       "Hot takes, cold coffee, and the real story.",
      slot:        "hs_club",
      exclusive:   true,
      visibleWhen: (s) => s.levelIndex === 0 && !s.affiliations?.hs_club,
      effects: {
        modifiers: { writeCostMult: 0.96, knowledgeMult: 1.01 },
        traits: { openness: +2, conscientiousness: +1 },
        identity: { network: +4 }
      }
    },

    math_club: {
      id:          "math_club",
      label:       "Join Math Club",
      blurb:       "Problem sets, proofs, and the thrill of the AMC.",
      slot:        "hs_club",
      exclusive:   true,
      visibleWhen: (s) => s.levelIndex === 0 && !s.affiliations?.hs_club,
      effects: {
        modifiers: { knowledgeMult: 1.05, writeCostMult: 0.98 },
        traits: { conscientiousness: +2, openness: +2 },
        identity: { resilience: +3 }
      }
    },

    science_club: {
      id:          "science_club",
      label:       "Join Science Club",
      blurb:       "Experiments, lab reports, and things that smell questionable.",
      slot:        "hs_club",
      exclusive:   true,
      visibleWhen: (s) => s.levelIndex === 0 && !s.affiliations?.hs_club,
      effects: {
        modifiers: { knowledgeMult: 1.05, paperMult: 1.03 },
        traits: { conscientiousness: +2, openness: +3 },
        identity: { resilience: +4 }
      }
    },

    art_club: {
      id:          "art_club",
      label:       "Join Art Club",
      blurb:       "Canvas, critique, and the eternal question: is it art?",
      slot:        "hs_club",
      exclusive:   true,
      visibleWhen: (s) => s.levelIndex === 0 && !s.affiliations?.hs_club,
      effects: {
        modifiers: { energyRegenMult: 1.02, knowledgeMult: 1.02 },
        traits: { openness: +4, neuroticism: +1 },
        identity: { resilience: +3 }
      }
    },

    // =====================================================================
    // COLLEGE CLUBS — levelIndex 1, exclusive per slot
    // =====================================================================

    robotics: {
      id:          "robotics",
      label:       "Join Robotics Team",
      blurb:       "Competitions, late nights, and a suspicious amount of solder fumes.",
      slot:        "college_club",
      exclusive:   true,
      visibleWhen: (s) => s.levelIndex === 1 && !s.affiliations?.college_club,
      effects: {
        modifiers: {
          knowledgeMult:    1.06,
          paperMult:        1.04,
          energyRegenMult:  0.95
        },
        traits: {
          conscientiousness: +2,
          extraversion:      -1
        },
        pubTypeMult: {
          conference: 1.06,
          journal:    1.02,
          chapter:    0.98,
          monograph:  0.95
        }
      }
    },

    lab: {
      id:          "lab",
      label:       "Join a Research Lab",
      blurb:       "You become the undergrad RA in someone else's grant narrative.",
      slot:        "college_club",
      exclusive:   true,
      visibleWhen: (s) => s.levelIndex === 1 && !s.affiliations?.college_club,
      effects: {
        modifiers: {
          paperMult:       1.06,
          knowledgeMult:   1.02,
          writeCostMult:   1.04
        },
        traits: {
          conscientiousness: +2,
          neuroticism:       +2
        },
        pubTypeMult: {
          conference: 1.03,
          journal:    1.06,
          chapter:    0.98,
          monograph:  0.95
        },
        paperQualityBonus: 5
      }
    },

    greek: {
      id:          "greek",
      label:       "Join the Greek System",
      blurb:       "Social capital, alumni networks, and a calendar that belongs to other people now.",
      slot:        "college_club",
      exclusive:   true,
      visibleWhen: (s) => s.levelIndex === 1 && !s.affiliations?.college_club,
      effects: {
        modifiers: {
          energyRegenMult: 0.95,
          citationMult:    1.03
        },
        traits: {
          extraversion:  +3,
          neuroticism:   +2,
          agreeableness: +1
        },
        identity: {
          network: +12
        },
        prestigeDelta: +2,
        pubTypeMult: {
          conference: 1.02,
          journal:    1.02,
          chapter:    1.00,
          monograph:  0.98
        }
      }
    },

    theater: {
      id:          "theater",
      label:       "Join Theater / Band",
      blurb:       "Rehearsals, performances, and the rare skill of not combusting onstage.",
      slot:        "college_club",
      exclusive:   true,
      visibleWhen: (s) => s.levelIndex === 1 && !s.affiliations?.college_club,
      effects: {
        modifiers: {
          energyRegenMult: 1.08,
          writeCostMult:   0.98,
          knowledgeMult:   0.97
        },
        traits: {
          extraversion: +2
        },
        identity: {
          resilience: +3
        },
        pubTypeMult: {
          conference: 0.98,
          journal:    0.98,
          chapter:    1.02,
          monograph:  1.03
        }
      }
    },

    gov: {
      id:          "gov",
      label:       "Join Student Government",
      blurb:       "Meetings. Motions. Committees. A taste of administrative gravity.",
      slot:        "college_club",
      exclusive:   true,
      visibleWhen: (s) => s.levelIndex === 1 && !s.affiliations?.college_club,
      effects: {
        modifiers: {
          energyRegenMult: 0.97,
          paperMult:       0.96
        },
        traits: {
          extraversion:  +1,
          agreeableness: +2,
          neuroticism:   +1
        },
        identity: {
          network: +8
        },
        grantAptitudeBonus: 8,
        pubTypeMult: {
          conference: 1.00,
          journal:    1.02,
          chapter:    1.02,
          monograph:  1.00
        }
      }
    },

    litmag: {
      id:          "litmag",
      label:       "Join Literary Magazine",
      blurb:       "Workshop nights, editorial bloodsport, and sentences that actually sing.",
      slot:        "college_club",
      exclusive:   true,
      visibleWhen: (s) => s.levelIndex === 1 && !s.affiliations?.college_club,
      effects: {
        modifiers: {
          writeCostMult:  0.94,
          knowledgeMult:  1.02,
          paperMult:      0.98
        },
        traits: {
          openness:    +3,
          neuroticism: +1
        },
        pubTypeMult: {
          conference: 0.95,
          journal:    0.98,
          chapter:    1.08,
          monograph:  1.10
        }
      }
    }
  };

  window.MAJORS = {
    stem: {
      id:          "stem",
      label:       "Natural Sciences",
      blurb:       "Data, pipettes, and the quiet terror of the replication crisis.",
      slot:        "major",
      exclusive:   true,
      visibleWhen: (s) => s.levelIndex === 1
                       && (s.totalDraftsEver ?? 0) >= window.MAJOR_DECLARE_DRAFTS
                       && !s.affiliations?.major,
      effects: {
        modifiers: {
          paperMult:      1.05,
          knowledgeMult:  1.02,
          citationMult:   1.02
        },
        pubTypeMult: {
          conference: 1.10,
          journal:    1.08,
          chapter:    0.92,
          monograph:  0.90
        }
      }
    },

    humanities: {
      id:          "humanities",
      label:       "Humanities",
      blurb:       "Close reading, footnotes, and the eternal question of what it all means.",
      slot:        "major",
      exclusive:   true,
      visibleWhen: (s) => s.levelIndex === 1
                       && (s.totalDraftsEver ?? 0) >= window.MAJOR_DECLARE_DRAFTS
                       && !s.affiliations?.major,
      effects: {
        modifiers: {
          writeCostMult:  0.94,
          knowledgeMult:  0.99,
          citationMult:   1.03
        },
        pubTypeMult: {
          conference: 0.92,
          journal:    0.95,
          chapter:    1.10,
          monograph:  1.12
        }
      }
    },

    fine_arts: {
      id:          "fine_arts",
      label:       "Fine Arts",
      blurb:       "You will feel everything. Most of it at 2am.",
      slot:        "major",
      exclusive:   true,
      visibleWhen: (s) => s.levelIndex === 1
                       && (s.totalDraftsEver ?? 0) >= window.MAJOR_DECLARE_DRAFTS
                       && !s.affiliations?.major,
      effects: {
        modifiers: {
          energyRegenMult: 1.05,
          paperMult:       0.97
        },
        pubTypeMult: {
          conference: 0.95,
          journal:    0.95,
          chapter:    1.08,
          monograph:  1.05
        }
      }
    },

    engineering: {
      id:          "engineering",
      label:       "Engineering",
      blurb:       "If it compiles, ship it. If it doesn't, keep shipping.",
      slot:        "major",
      exclusive:   true,
      visibleWhen: (s) => s.levelIndex === 1
                       && (s.totalDraftsEver ?? 0) >= window.MAJOR_DECLARE_DRAFTS
                       && !s.affiliations?.major,
      effects: {
        modifiers: {
          knowledgeMult:   1.05,
          paperMult:       1.03,
          energyRegenMult: 0.97
        },
        pubTypeMult: {
          conference: 1.12,
          journal:    1.03,
          chapter:    0.90,
          monograph:  0.88
        }
      }
    },

    business_econ: {
      id:          "business_econ",
      label:       "Business / Economics",
      blurb:       "You will be asked if you've considered industry. Constantly.",
      slot:        "major",
      exclusive:   true,
      visibleWhen: (s) => s.levelIndex === 1
                       && (s.totalDraftsEver ?? 0) >= window.MAJOR_DECLARE_DRAFTS
                       && !s.affiliations?.major,
      effects: {
        modifiers: {
          energyRegenMult: 1.03,
          citationMult:    1.02
        },
        identity: {
          network: +5
        },
        pubTypeMult: {
          conference: 1.00,
          journal:    1.08,
          chapter:    1.02,
          monograph:  0.95
        }
      }
    },

    social_science: {
      id:          "social_science",
      label:       "Social Science",
      blurb:       "Reads broadly, cites obsessively, takes the structural view of everything.",
      slot:        "major",
      exclusive:   true,
      visibleWhen: (s) => s.levelIndex === 1
                       && (s.totalDraftsEver ?? 0) >= window.MAJOR_DECLARE_DRAFTS
                       && !s.affiliations?.major,
      effects: {
        modifiers: {
          paperMult:      1.05,
          knowledgeMult:  1.02,
          citationMult:   1.08,
          writeCostMult:  0.98
        },
        pubTypeMult: {
          conference: 1.00,
          journal:    1.05,
          chapter:    1.05,
          monograph:  1.00
        }
      },
      // Social science uniquely reveals trait labels (not values) on declaration
      onJoin: (s) => {
        s.traits.agreeableness = Math.min(100, (s.traits.agreeableness ?? 50) + 5);
        if ((s.traits.visibility ?? "hidden") === "hidden") {
          s.traits.visibility = "labels";
        }
      }
    }
  };


  // =====================================================================
  // SPORTS — high school athletics, levelIndex 0, exclusive per slot
  // =====================================================================

  window.SPORTS = {
    track: {
      id:          "track",
      label:       "Join Track",
      blurb:       "Early mornings, split times, and legs that hate stairs.",
      slot:        "hs_sport",
      exclusive:   true,
      visibleWhen: (s) => s.levelIndex === 0 && !s.affiliations?.hs_sport,
      effects: {
        modifiers: { energyRegenMult: 1.08, knowledgeMult: 0.98 },
        traits: { conscientiousness: +3, neuroticism: -2 },
        identity: { resilience: +4 }
      }
    },

    football: {
      id:          "football",
      label:       "Join Football",
      blurb:       "Friday nights, tackles, and a sport that owns your fall.",
      slot:        "hs_sport",
      exclusive:   true,
      visibleWhen: (s) => s.levelIndex === 0 && !s.affiliations?.hs_sport,
      effects: {
        modifiers: { energyRegenMult: 1.05, writeCostMult: 1.02 },
        traits: { extraversion: +2, conscientiousness: +1, agreeableness: +1 },
        identity: { network: +5, resilience: +3 },
        prestigeDelta: +2
      }
    },

    cheerleading: {
      id:          "cheerleading",
      label:       "Join Cheerleading",
      blurb:       "Spirit, coordination, and yelling yourself hoarse.",
      slot:        "hs_sport",
      exclusive:   true,
      visibleWhen: (s) => s.levelIndex === 0 && !s.affiliations?.hs_sport,
      effects: {
        modifiers: { energyRegenMult: 1.06, citationMult: 1.01 },
        traits: { extraversion: +4, conscientiousness: +1, agreeableness: +2 },
        identity: { network: +6, resilience: +4 },
        prestigeDelta: +3
      }
    },

    basketball: {
      id:          "basketball",
      label:       "Join Basketball",
      blurb:       "Fast breaks, buzzer beaters, and the swish of the net.",
      slot:        "hs_sport",
      exclusive:   true,
      visibleWhen: (s) => s.levelIndex === 0 && !s.affiliations?.hs_sport,
      effects: {
        modifiers: { energyRegenMult: 1.07, knowledgeMult: 0.97 },
        traits: { extraversion: +3, conscientiousness: +1, agreeableness: +1 },
        identity: { network: +5, resilience: +4 },
        prestigeDelta: +2
      }
    },

    swimming: {
      id:          "swimming",
      label:       "Join Swimming",
      blurb:       "Chlorine, lane discipline, and muscles that forget what dry feels like.",
      slot:        "hs_sport",
      exclusive:   true,
      visibleWhen: (s) => s.levelIndex === 0 && !s.affiliations?.hs_sport,
      effects: {
        modifiers: { energyRegenMult: 1.10, knowledgeMult: 0.99 },
        traits: { conscientiousness: +3, neuroticism: -2, agreeableness: +1 },
        identity: { resilience: +5 }
      }
    },

    soccer: {
      id:          "soccer",
      label:       "Join Soccer",
      blurb:       "90 minutes, one ball, infinite arguments about offsides.",
      slot:        "hs_sport",
      exclusive:   true,
      visibleWhen: (s) => s.levelIndex === 0 && !s.affiliations?.hs_sport,
      effects: {
        modifiers: { energyRegenMult: 1.06, knowledgeMult: 0.98 },
        traits: { extraversion: +2, conscientiousness: +2, agreeableness: +1 },
        identity: { network: +5, resilience: +3 },
        prestigeDelta: +2
      }
    },

    tennis: {
      id:          "tennis",
      label:       "Join Tennis",
      blurb:       "Rackets, rally points, and the eternal search for a doubles partner.",
      slot:        "hs_sport",
      exclusive:   true,
      visibleWhen: (s) => s.levelIndex === 0 && !s.affiliations?.hs_sport,
      effects: {
        modifiers: { energyRegenMult: 1.05, knowledgeMult: 1.01 },
        traits: { conscientiousness: +2, openness: +1 },
        identity: { resilience: +2 },
        prestigeDelta: +1
      }
    },

    volleyball: {
      id:          "volleyball",
      label:       "Join Volleyball",
      blurb:       "Serves, sets, and spikes. Also a lot of screaming.",
      slot:        "hs_sport",
      exclusive:   true,
      visibleWhen: (s) => s.levelIndex === 0 && !s.affiliations?.hs_sport,
      effects: {
        modifiers: { energyRegenMult: 1.06, knowledgeMult: 0.99 },
        traits: { extraversion: +3, agreeableness: +2, conscientiousness: +1 },
        identity: { network: +4, resilience: +3 }
      }
    },

    crosscountry: {
      id:          "crosscountry",
      label:       "Join Cross Country",
      blurb:       "Distance running, variable terrain, and the occasional wrong turn.",
      slot:        "hs_sport",
      exclusive:   true,
      visibleWhen: (s) => s.levelIndex === 0 && !s.affiliations?.hs_sport,
      effects: {
        modifiers: { energyRegenMult: 1.09, knowledgeMult: 0.97 },
        traits: { conscientiousness: +3, neuroticism: -2, openness: +1 },
        identity: { resilience: +5 }
      }
    },

    baseball: {
      id:          "baseball",
      label:       "Join Baseball",
      blurb:       "America's pastime, one strikeout at a time.",
      slot:        "hs_sport",
      exclusive:   true,
      visibleWhen: (s) => s.levelIndex === 0 && !s.affiliations?.hs_sport,
      effects: {
        modifiers: { energyRegenMult: 1.04, knowledgeMult: 0.98 },
        traits: { extraversion: +2, agreeableness: +2, conscientiousness: +1 },
        identity: { network: +4, resilience: +3 }
      }
    }
  };

  // =====================================================================
  // PERKS — one-time unlocks with passive ongoing effects
  // Includes study groups and foundational texts.
  // cost: resources required to unlock
  // passiveTick: applied each game tick while perk is active
  // reward: applied once on unlock (e.g. knowledgePerStudy bonus)
  // category: "study_group" | "foundational_text" (for render grouping)
  // =====================================================================

  window.PERKS = {
    studygroup_undergrad: {
      id:          "studygroup_undergrad",
      label:       "Form a Study Group",
      blurb:       "A motley crew of undergrads who occasionally study.",
      visibleWhen: (s) => s.levelIndex === 1
                       && (s.knowledge ?? 0) >= 80
                       && (s.totalDraftsEver ?? 0) >= 80
                       && !s.perks?.studygroup_undergrad,
      cost: {
        knowledge: 20,
        drafts:    10
      },
      passiveTick: {
        knowledge: .1,    // +1 knowledge per 10 ticks
        drafts:    0.1    // fractional — accumulates in helpers.js before applying
      }
    },

    studygroup_masters: {
      id:          "studygroup_masters",
      label:       "Organize a Graduate Seminar",
      blurb:       "Weekly readings, heated debates, and at least one person who hasn't done the reading.",
      visibleWhen: (s) => s.levelIndex === 2
                       && (s.knowledge ?? 0) >= 180
                       && (s.totalDraftsEver ?? 0) >= 180
                       && !s.perks?.studygroup_masters,
      cost: {
        knowledge: 40,
        drafts:    20
      },
      passiveTick: {
        knowledge: 0.5,
        drafts:    0.3    // fractional — accumulates in helpers.js before applying
      }
    },

    studygroup_doctoral: {
      id:          "studygroup_doctoral",
      label:       "Convene a Writing Group",
      blurb:       "You meet every Thursday. You have collectively written one (1) paragraph.",
      visibleWhen: (s) => s.levelIndex === 3
                       && (s.knowledge ?? 0) >= 300
                       && (s.totalDraftsEver ?? 0) >= 300
                       && !s.perks?.studygroup_doctoral,
      cost: {
        knowledge: 60,
        drafts:    40
      },
      passiveTick: {
        knowledge: 0.5,
        drafts:    0.5   // fractional — accumulates in systems.js before applying
      }
    },

    // =====================================================================
    // HIGH SCHOOL MILESTONES — one-time events in levelIndex 0
    // High school runs totalDraftsEver 0 → 40, about ten per year, so the
    // `when` gates use it as a calendar (≥ 25 is junior/senior year).
    // A player sees five or six of these per run.
    // =====================================================================

    prom: {
      id:          "prom",
      label:       "Go to Prom",
      blurb:       "A night you'll remember (or regret).",
      category:    "hs_milestone",
      milestone:   { level: 0, when: (s) => s.affiliations?.hs_club !== "chess" && (s.totalDraftsEver ?? 0) >= 25 },
      cost:        { energy: 30 },
      effects: {
        traits: { extraversion: +2 },
        identity: { network: +3 }
      }
    },

    school_play: {
      id:          "school_play",
      label:       "Perform in School Play",
      blurb:       "Stage fright, applause, and a costume you'll regret.",
      category:    "hs_milestone",
      milestone:   { level: 0 },
      cost:        { energy: 40 },
      effects: {
        traits: { extraversion: +2, openness: +1 },
        identity: { resilience: +4 }
      }
    },

    debate_tournament_win: {
      id:          "debate_tournament_win",
      label:       "Win Debate Tournament",
      blurb:       "Trophies and vindication.",
      category:    "hs_milestone",
      milestone:   { level: 0, when: (s) => s.affiliations?.hs_club === "debate" },
      cost:        { energy: 50 },
      effects: {
        traits: { conscientiousness: +2 },
        identity: { network: +5, resilience: +3 }
      }
    },

    science_fair_winner: {
      id:          "science_fair_winner",
      label:       "Win Science Fair",
      blurb:       "Your project is better than theirs.",
      category:    "hs_milestone",
      milestone:   { level: 0, when: (s) => ["science_club", "math_club"].includes(s.affiliations?.hs_club) },
      cost:        { energy: 50 },
      effects: {
        modifiers: { knowledgeMult: 1.02 },
        traits: { conscientiousness: +1, openness: +2 },
        identity: { resilience: +3 }
      }
    },

    star_athlete: {
      id:          "star_athlete",
      label:       "Become a Star Athlete",
      blurb:       "All-state, varsity, and everyone knows your name.",
      category:    "hs_milestone",
      milestone:   { level: 0, when: (s) => !!s.affiliations?.hs_sport },
      cost:        { energy: 60 },
      effects: {
        traits: { extraversion: +1, conscientiousness: +2 },
        identity: { network: +6, resilience: +5 },
        prestigeDelta: +5
      }
    },

    first_heartbreak: {
      id:          "first_heartbreak",
      label:       "Experience First Heartbreak",
      blurb:       "Character building, they say. Doesn't feel like it.",
      category:    "hs_milestone",
      milestone:   { level: 0 },
      cost:        {},
      effects: {
        traits: { neuroticism: +3, openness: +1 },
        identity: { resilience: +5 }
      }
    },

    perfect_attendance: {
      id:          "perfect_attendance",
      label:       "Achieve Perfect Attendance",
      blurb:       "Four years without a sick day. Suspicious.",
      category:    "hs_milestone",
      milestone:   { level: 0 },
      cost:        { energy: 20 },
      effects: {
        modifiers: { knowledgeMult: 1.03 },
        traits: { conscientiousness: +3 },
        identity: { resilience: +2 }
      }
    },

    hs_driving_test: {
      id:          "hs_driving_test",
      label:       "Fail Your Driving Test",
      blurb:       "You parallel parked into a hedge. The examiner wrote for a long time.",
      category:    "hs_milestone",
      milestone:   { level: 0, when: (s) => (s.totalDraftsEver ?? 0) >= 10 },
      cost:        { energy: 15 },
      effects: {
        traits: { neuroticism: +1 },
        identity: { resilience: +3 }
      }
    },

    hs_summer_job: {
      id:          "hs_summer_job",
      label:       "Work a Summer Job",
      blurb:       "Three months of asking whether they want fries with that. They always want fries.",
      category:    "hs_milestone",
      milestone:   { level: 0, when: (s) => (s.traits?.ses ?? 50) < 60 },    // hidden SES gate
      cost:        { energy: 25 },
      effects: {
        traits: { conscientiousness: +2 },
        identity: { resilience: +2, ambition: +1 }
      }
    },

    hs_summer_program: {
      id:          "hs_summer_program",
      label:       "Attend a Summer Enrichment Program",
      blurb:       "Your parents paid for you to take a college course on a college campus. You now know where the college is.",
      category:    "hs_milestone",
      milestone:   { level: 0, when: (s) => (s.traits?.ses ?? 50) >= 60 },   // hidden SES gate
      cost:        { energy: 25 },
      effects: {
        modifiers: { knowledgeMult: 1.02 },
        identity: { network: +2, ambition: +2 },
        prestigeDelta: +2
      }
    },

    hs_ap_week: {
      id:          "hs_ap_week",
      label:       "Survive AP Week",
      blurb:       "Five exams, four days, and one pencil sharpener that finally gives up.",
      category:    "hs_milestone",
      milestone:   { level: 0, when: (s) => (s.totalDraftsEver ?? 0) >= 20 },
      cost:        { energy: 35 },
      effects: {
        modifiers: { knowledgeMult: 1.01 },
        traits: { conscientiousness: +1, neuroticism: +1 },
        identity: { resilience: +2 }
      }
    },

    hs_valedictorian: {
      id:          "hs_valedictorian",
      label:       "Become Valedictorian",
      blurb:       "Your speech quotes Robert Frost. Everyone saw it coming, including Robert Frost.",
      category:    "hs_milestone",
      milestone:   { level: 0, when: (s) => (s.totalDraftsEver ?? 0) >= 32
                                         && (s.traits?.iq  ?? 100) > 115
                                         && (s.traits?.ses ?? 50)  > 50 },    // hidden trait gates
      cost:        { energy: 20 },
      effects: {
        identity: { reputation: +4, ambition: +3 },
        prestigeDelta: +3
      }
    },

    // ── Club-specific ────────────────────────────────────────────────────

    hs_lead_role: {
      id:          "hs_lead_role",
      label:       "Land the Lead in the Spring Musical",
      blurb:       "You can't sing. Neither could anyone else who auditioned.",
      category:    "hs_milestone",
      milestone:   { level: 0, when: (s) => s.affiliations?.hs_club === "drama" },
      cost:        { energy: 40 },
      effects: {
        traits: { extraversion: +2 },
        identity: { reputation: +2, resilience: +2 }
      }
    },

    hs_superlative: {
      id:          "hs_superlative",
      label:       "Win \"Most Likely to Succeed\"",
      blurb:       "You counted the ballots. Nobody thought to ask who counted the ballots.",
      category:    "hs_milestone",
      milestone:   { level: 0, when: (s) => s.affiliations?.hs_club === "yearbook" },
      cost:        { energy: 10 },
      effects: {
        traits: { agreeableness: -1 },
        identity: { reputation: +3 }
      }
    },

    hs_band_trip: {
      id:          "hs_band_trip",
      label:       "Survive the Band Trip",
      blurb:       "Six hours on a bus with the brass section. What happens on the band trip stays on the band trip.",
      category:    "hs_milestone",
      milestone:   { level: 0, when: (s) => s.affiliations?.hs_club === "band" },
      cost:        { energy: 30 },
      effects: {
        traits: { extraversion: +2 },
        identity: { network: +3 }
      }
    },

    hs_scoop: {
      id:          "hs_scoop",
      label:       "Break a Story in the School Paper",
      blurb:       "You exposed the vending machine contract. The principal would like a word.",
      category:    "hs_milestone",
      milestone:   { level: 0, when: (s) => s.affiliations?.hs_club === "newspaper" },
      cost:        { energy: 30 },
      effects: {
        traits: { openness: +1 },
        identity: { reputation: +2, resilience: +2 }
      }
    },

    hs_chess_tournament: {
      id:          "hs_chess_tournament",
      label:       "Play a Weekend Chess Tournament",
      blurb:       "Eleven hours in a hotel ballroom. You gained forty rating points and lost the concept of daylight.",
      category:    "hs_milestone",
      milestone:   { level: 0, when: (s) => s.affiliations?.hs_club === "chess" },
      cost:        { energy: 40 },
      effects: {
        traits: { conscientiousness: +1, openness: +1 },
        identity: { resilience: +2 }
      }
    },

    hs_art_show: {
      id:          "hs_art_show",
      label:       "Get into the District Art Show",
      blurb:       "Your piece hung by the fire exit, where thousands of people saw it on their way out.",
      category:    "hs_milestone",
      milestone:   { level: 0, when: (s) => s.affiliations?.hs_club === "art_club" },
      cost:        { energy: 25 },
      effects: {
        traits: { openness: +2 },
        identity: { reputation: +2 }
      }
    },

    // =====================================================================
    // UNDERGRADUATE MILESTONES — one-time events in levelIndex 1
    // Drafts ≈ credits. Undergrad runs totalDraftsEver 40 → 120 (you arrive
    // with 40 "AP credits"), so the `when` gates use it as a calendar:
    // < 60 is the first year on campus, ≥ 90 is senior year. A few gates read
    // hidden traits (ses, conscientiousness) — some players will simply never
    // be offered these, and won't know why.
    // =====================================================================

    ug_roommate: {
      id:          "ug_roommate",
      label:       "Survive Your Roommate",
      blurb:       "They practice the bagpipes. At six in the morning. Every morning.",
      category:    "ug_milestone",
      milestone:   { level: 1, when: (s) => (s.totalDraftsEver ?? 0) < 60 },
      cost:        { energy: 15 },
      effects: {
        traits: { agreeableness: +2, neuroticism: +1 },
        identity: { resilience: +3 }
      }
    },

    ug_office_hours: {
      id:          "ug_office_hours",
      label:       "Actually Go to Office Hours",
      blurb:       "The professor looks startled, then delighted, then asks what you're working on. You were not working on anything.",
      category:    "ug_milestone",
      milestone:   { level: 1 },
      cost:        { energy: 25 },
      effects: {
        modifiers: { knowledgeMult: 1.02 },
        identity: { network: +3, ambition: +2 }
      }
    },

    ug_all_nighter: {
      id:          "ug_all_nighter",
      label:       "Pull Your First All-Nighter",
      blurb:       "Sunrise, cold coffee, and an essay that is somehow worse than the outline.",
      category:    "ug_milestone",
      milestone:   { level: 1 },
      cost:        { energy: 40 },
      effects: {
        traits: { conscientiousness: +1, neuroticism: +2 },
        identity: { resilience: +4 }
      }
    },

    ug_existential_crisis: {
      id:          "ug_existential_crisis",
      label:       "Have an Existential Crisis at 3 a.m.",
      blurb:       "You read one page of Camus in the dining hall. Nothing will ever be the same, or matter.",
      category:    "ug_milestone",
      milestone:   { level: 1 },
      cost:        {},
      effects: {
        traits: { openness: +2, neuroticism: +2 },
        identity: { ambition: +2, resilience: +2 }
      }
    },

    ug_study_abroad: {
      id:          "ug_study_abroad",
      label:       "Study Abroad for a Semester",
      blurb:       "You come back with a scarf, a slight accent, and strong opinions about bread.",
      category:    "ug_milestone",
      milestone:   { level: 1, when: (s) => (s.traits?.ses ?? 50) >= 45 },   // hidden SES gate
      cost:        { energy: 35 },
      effects: {
        traits: { openness: +3, extraversion: +1 },
        identity: { network: +4 }
      }
    },

    ug_campus_protest: {
      id:          "ug_campus_protest",
      label:       "Join a Campus Protest",
      blurb:       "You made a sign. The administration made a statement. Nobody changed their mind except you.",
      category:    "ug_milestone",
      milestone:   { level: 1 },
      cost:        { energy: 30 },
      effects: {
        traits: { agreeableness: -1, extraversion: +1 },
        identity: { network: +3, resilience: +2, reputation: +1 }
      }
    },

    ug_research_assistant: {
      id:          "ug_research_assistant",
      label:       "Land a Research Assistantship",
      blurb:       "You enter data into a spreadsheet older than you are. You have never been happier.",
      category:    "ug_milestone",
      milestone:   { level: 1, when: (s) => s.affiliations?.college_club === "lab"
                                         || ["stem", "social_science", "engineering"].includes(s.affiliations?.major) },
      cost:        { energy: 35 },
      effects: {
        modifiers: { writeCostMult: 0.98 },
        traits: { conscientiousness: +2 },
        identity: { network: +2, ambition: +3 }
      }
    },

    ug_grad_school_talk: {
      id:          "ug_grad_school_talk",
      label:       "Hear \"You Should Think About Grad School\"",
      blurb:       "A professor says it in passing, on the way to the photocopier. You will think about little else for a decade.",
      category:    "ug_milestone",
      milestone:   { level: 1, when: (s) => (s.totalDraftsEver ?? 0) >= 70 },
      cost:        {},
      effects: {
        traits: { neuroticism: +1 },
        identity: { ambition: +5, network: +2 }
      }
    },

    ug_first_conference: {
      id:          "ug_first_conference",
      label:       "Attend Your First Academic Conference",
      blurb:       "You understood a fifth of the talks and all of the free coffee.",
      category:    "ug_milestone",
      milestone:   { level: 1, when: (s) => (s.totalDraftsEver ?? 0) >= 75 && !!s.affiliations?.major },
      cost:        { energy: 30 },
      effects: {
        modifiers: { citationMult: 1.02 },
        identity: { network: +4, ambition: +2 }
      }
    },

    ug_honors_thesis: {
      id:          "ug_honors_thesis",
      label:       "Write an Honors Thesis",
      blurb:       "Forty pages, one reader, and a footnote you are genuinely proud of.",
      category:    "ug_milestone",
      milestone:   { level: 1, when: (s) => (s.totalDraftsEver ?? 0) >= 90 && !!s.affiliations?.major },
      cost:        { energy: 50 },
      effects: {
        modifiers: { writeCostMult: 0.97 },
        traits: { conscientiousness: +2 },
        identity: { ambition: +3, reputation: +2 }
      }
    },

    ug_latin_honors: {
      id:          "ug_latin_honors",
      label:       "Graduate with Latin Honors",
      blurb:       "Your diploma is now partly in a dead language. This feels correct.",
      category:    "ug_milestone",
      milestone:   { level: 1, when: (s) => (s.totalDraftsEver ?? 0) >= 100
                                         && (s.traits?.conscientiousness ?? 50) >= 60 },   // hidden trait gate
      cost:        {},
      effects: {
        identity: { reputation: +4, ambition: +1 }
      }
    },

    // ── Club-specific ────────────────────────────────────────────────────

    ug_rush_week: {
      id:          "ug_rush_week",
      label:       "Survive Rush Week",
      blurb:       "You learned a handshake and three songs you will never repeat to anyone.",
      category:    "ug_milestone",
      milestone:   { level: 1, when: (s) => s.affiliations?.college_club === "greek" },
      cost:        { energy: 40 },
      effects: {
        traits: { extraversion: +2, conscientiousness: -1 },
        identity: { network: +6 }
      }
    },

    ug_impeached: {
      id:          "ug_impeached",
      label:       "Get Impeached from Student Government",
      blurb:       "It was about the parking committee. It is always about the parking committee.",
      category:    "ug_milestone",
      milestone:   { level: 1, when: (s) => s.affiliations?.college_club === "gov" },
      cost:        { energy: 30 },
      effects: {
        traits: { agreeableness: -1 },
        identity: { resilience: +4, network: +2, reputation: -2 }
      }
    },

    ug_litmag_rejection: {
      id:          "ug_litmag_rejection",
      label:       "Get Rejected by Your Own Literary Magazine",
      blurb:       "The editorial board was unanimous. You are on the editorial board.",
      category:    "ug_milestone",
      milestone:   { level: 1, when: (s) => s.affiliations?.college_club === "litmag" },
      cost:        { energy: 20 },
      effects: {
        traits: { openness: +1, neuroticism: +1 },
        identity: { resilience: +3 }
      }
    },

    ug_robotics_loss: {
      id:          "ug_robotics_loss",
      label:       "Lose a Robotics Competition to a High School Team",
      blurb:       "They were fourteen. Their robot had a name.",
      category:    "ug_milestone",
      milestone:   { level: 1, when: (s) => s.affiliations?.college_club === "robotics" },
      cost:        { energy: 35 },
      effects: {
        traits: { conscientiousness: +1 },
        identity: { resilience: +3, ambition: +2 }
      }
    },

    ug_opening_night: {
      id:          "ug_opening_night",
      label:       "Survive Opening Night",
      blurb:       "The set fell over in act two. You kept going. The campus paper called it brave.",
      category:    "ug_milestone",
      milestone:   { level: 1, when: (s) => s.affiliations?.college_club === "theater" },
      cost:        { energy: 35 },
      effects: {
        traits: { extraversion: +2 },
        identity: { resilience: +3, reputation: +1 }
      }
    },

    // =====================================================================
    // FOUNDATIONAL TEXTS
    // =====================================================================
    // FOUNDATIONAL TEXTS
    // Unlock sequentially every 5 drafts starting at totalDraftsEver >= 20.
    // Available until dissertation is defended.
    // Each costs 50 energy and grants +0.05 knowledgePerStudy permanently.
    // =====================================================================

    the_republic: {
      id:          "the_republic",
      label:       "The Republic",
      author:      "Plato",
      blurb:       "Justice is harmony. Your committee will disagree.",
      category:    "foundational_text",
      visibleWhen: (s) => (s.totalDraftsEver ?? 0) >= 20
                       && !s.flags?.dissertationDefended
                       && !s.perks?.the_republic,
      cost:        { energy: 50 },
      reward:      { knowledgePerStudy: 0.05 }
    },

    the_prince: {
      id:          "the_prince",
      label:       "The Prince",
      author:      "Machiavelli",
      blurb:       "It is better to be feared than loved. Your advisor knows this.",
      category:    "foundational_text",
      visibleWhen: (s) => (s.totalDraftsEver ?? 0) >= 25
                       && !s.flags?.dissertationDefended
                       && !s.perks?.the_prince,
      cost:        { energy: 50 },
      reward:      { knowledgePerStudy: 0.05 }
    },

    leviathan: {
      id:          "leviathan",
      label:       "Leviathan",
      author:      "Hobbes",
      blurb:       "Life outside tenure is solitary, poor, nasty, brutish, and short.",
      category:    "foundational_text",
      visibleWhen: (s) => (s.totalDraftsEver ?? 0) >= 30
                       && !s.flags?.dissertationDefended
                       && !s.perks?.leviathan,
      cost:        { energy: 50 },
      reward:      { knowledgePerStudy: 0.05 }
    },

    discourse_on_method: {
      id:          "discourse_on_method",
      label:       "Discourse on Method",
      author:      "Descartes",
      blurb:       "I think, therefore I am. I cite, therefore I exist.",
      category:    "foundational_text",
      visibleWhen: (s) => (s.totalDraftsEver ?? 0) >= 35
                       && !s.flags?.dissertationDefended
                       && !s.perks?.discourse_on_method,
      cost:        { energy: 50 },
      reward:      { knowledgePerStudy: 0.05 }
    },

    wealth_of_nations: {
      id:          "wealth_of_nations",
      label:       "The Wealth of Nations",
      author:      "Adam Smith",
      blurb:       "The invisible hand will not write your literature review.",
      category:    "foundational_text",
      visibleWhen: (s) => (s.totalDraftsEver ?? 0) >= 40
                       && !s.flags?.dissertationDefended
                       && !s.perks?.wealth_of_nations,
      cost:        { energy: 50 },
      reward:      { knowledgePerStudy: 0.05 }
    },

    communist_manifesto: {
      id:          "communist_manifesto",
      label:       "The Communist Manifesto",
      author:      "Marx & Engels",
      blurb:       "A specter is haunting your methodology.",
      category:    "foundational_text",
      visibleWhen: (s) => (s.totalDraftsEver ?? 0) >= 45
                       && !s.flags?.dissertationDefended
                       && !s.perks?.communist_manifesto,
      cost:        { energy: 50 },
      reward:      { knowledgePerStudy: 0.05 }
    },

    origin_of_species: {
      id:          "origin_of_species",
      label:       "On the Origin of Species",
      author:      "Darwin",
      blurb:       "Survival of the most published.",
      category:    "foundational_text",
      visibleWhen: (s) => (s.totalDraftsEver ?? 0) >= 50
                       && !s.flags?.dissertationDefended
                       && !s.perks?.origin_of_species,
      cost:        { energy: 50 },
      reward:      { knowledgePerStudy: 0.05 }
    },

    interpretation_of_dreams: {
      id:          "interpretation_of_dreams",
      label:       "The Interpretation of Dreams",
      author:      "Freud",
      blurb:       "Sometimes a dissertation is just a dissertation.",
      category:    "foundational_text",
      visibleWhen: (s) => (s.totalDraftsEver ?? 0) >= 55
                       && !s.flags?.dissertationDefended
                       && !s.perks?.interpretation_of_dreams,
      cost:        { energy: 50 },
      reward:      { knowledgePerStudy: 0.05 }
    },

    protestant_ethic: {
      id:          "protestant_ethic",
      label:       "The Protestant Ethic and the Spirit of Capitalism",
      author:      "Weber",
      blurb:       "Your work ethic is a theological problem.",
      category:    "foundational_text",
      visibleWhen: (s) => (s.totalDraftsEver ?? 0) >= 60
                       && !s.flags?.dissertationDefended
                       && !s.perks?.protestant_ethic,
      cost:        { energy: 50 },
      reward:      { knowledgePerStudy: 0.05 }
    },

    structure_of_scientific_revolutions: {
      id:          "structure_of_scientific_revolutions",
      label:       "The Structure of Scientific Revolutions",
      author:      "Kuhn",
      blurb:       "Normal science is what you do when nothing interesting is happening.",
      category:    "foundational_text",
      visibleWhen: (s) => (s.totalDraftsEver ?? 0) >= 65
                       && !s.flags?.dissertationDefended
                       && !s.perks?.structure_of_scientific_revolutions,
      cost:        { energy: 50 },
      reward:      { knowledgePerStudy: 0.05 }
    },

    orientalism: {
      id:          "orientalism",
      label:       "Orientalism",
      author:      "Said",
      blurb:       "Knowledge is never innocent. Neither is your theoretical framework.",
      category:    "foundational_text",
      visibleWhen: (s) => (s.totalDraftsEver ?? 0) >= 70
                       && !s.flags?.dissertationDefended
                       && !s.perks?.orientalism,
      cost:        { energy: 50 },
      reward:      { knowledgePerStudy: 0.05 }
    },

    the_selfish_gene: {
      id:          "the_selfish_gene",
      label:       "The Selfish Gene",
      author:      "Dawkins",
      blurb:       "You are a gene's way of getting a tenure-track position.",
      category:    "foundational_text",
      visibleWhen: (s) => (s.totalDraftsEver ?? 0) >= 75
                       && !s.flags?.dissertationDefended
                       && !s.perks?.the_selfish_gene,
      cost:        { energy: 50 },
      reward:      { knowledgePerStudy: 0.05 }
    },

    discipline_and_punish: {
      id:          "discipline_and_punish",
      label:       "Discipline and Punish",
      author:      "Foucault",
      blurb:       "The department is watching. It has always been watching.",
      category:    "foundational_text",
      visibleWhen: (s) => (s.totalDraftsEver ?? 0) >= 80
                       && !s.flags?.dissertationDefended
                       && !s.perks?.discipline_and_punish,
      cost:        { energy: 50 },
      reward:      { knowledgePerStudy: 0.05 }
    },

    a_theory_of_justice: {
      id:          "a_theory_of_justice",
      label:       "A Theory of Justice",
      author:      "Rawls",
      blurb:       "Behind the veil of ignorance, everyone deserves a fair R&R.",
      category:    "foundational_text",
      visibleWhen: (s) => (s.totalDraftsEver ?? 0) >= 85
                       && !s.flags?.dissertationDefended
                       && !s.perks?.a_theory_of_justice,
      cost:        { energy: 50 },
      reward:      { knowledgePerStudy: 0.05 }
    },

    the_second_sex: {
      id:          "the_second_sex",
      label:       "The Second Sex",
      author:      "de Beauvoir",
      blurb:       "One is not born an academic. One becomes one.",
      category:    "foundational_text",
      visibleWhen: (s) => (s.totalDraftsEver ?? 0) >= 90
                       && !s.flags?.dissertationDefended
                       && !s.perks?.the_second_sex,
      cost:        { energy: 50 },
      reward:      { knowledgePerStudy: 0.05 }
    },

    simulacra_and_simulation: {
      id:          "simulacra_and_simulation",
      label:       "Simulacra and Simulation",
      author:      "Baudrillard",
      blurb:       "The map precedes the territory. So does the abstract.",
      category:    "foundational_text",
      visibleWhen: (s) => (s.totalDraftsEver ?? 0) >= 95
                       && !s.flags?.dissertationDefended
                       && !s.perks?.simulacra_and_simulation,
      cost:        { energy: 50 },
      reward:      { knowledgePerStudy: 0.05 }
    },

    thinking_fast_and_slow: {
      id:          "thinking_fast_and_slow",
      label:       "Thinking, Fast and Slow",
      author:      "Kahneman",
      blurb:       "System 1 clicks. System 2 writes the literature review.",
      category:    "foundational_text",
      visibleWhen: (s) => (s.totalDraftsEver ?? 0) >= 100
                       && !s.flags?.dissertationDefended
                       && !s.perks?.thinking_fast_and_slow,
      cost:        { energy: 50 },
      reward:      { knowledgePerStudy: 0.05 }
    },

    what_is_it_like_to_be_a_bat: {
      id:          "what_is_it_like_to_be_a_bat",
      label:       "What Is It Like to Be a Bat?",
      author:      "Nagel",
      blurb:       "There is something it is like to be ABD. You will find out.",
      category:    "foundational_text",
      visibleWhen: (s) => (s.totalDraftsEver ?? 0) >= 105
                       && !s.flags?.dissertationDefended
                       && !s.perks?.what_is_it_like_to_be_a_bat,
      cost:        { energy: 50 },
      reward:      { knowledgePerStudy: 0.05 }
    },

    godel_escher_bach: {
      id:          "godel_escher_bach",
      label:       "Gödel, Escher, Bach",
      author:      "Hofstadter",
      blurb:       "Strange loops all the way down. Your citations cite your citations.",
      category:    "foundational_text",
      visibleWhen: (s) => (s.totalDraftsEver ?? 0) >= 110
                       && !s.flags?.dissertationDefended
                       && !s.perks?.godel_escher_bach,
      cost:        { energy: 50 },
      reward:      { knowledgePerStudy: 0.05 }
    },

    pedagogy_of_the_oppressed: {
      id:          "pedagogy_of_the_oppressed",
      label:       "Pedagogy of the Oppressed",
      author:      "Freire",
      blurb:       "The banking model of education will not survive your seminar.",
      category:    "foundational_text",
      visibleWhen: (s) => (s.totalDraftsEver ?? 0) >= 115
                       && !s.flags?.dissertationDefended
                       && !s.perks?.pedagogy_of_the_oppressed,
      cost:        { energy: 50 },
      reward:      { knowledgePerStudy: 0.05 }
    }
  };

  // Milestone events don't hand-write visibleWhen: they're visible only while
  // they're the one event picked for this cycle (see helpers.js).
  for (const [id, perk] of Object.entries(window.PERKS)) {
    if (perk.milestone) perk.visibleWhen = (s) => milestoneOffered(s, id);
  }

  // =====================================================================
  // LANDMARKS — mini-arcs with phases, progress bars, and CV artifacts
  // Each landmark has a unique mechanical and tonal identity.
  // phases: ordered array of { id, label, description, progressRequired }
  // artifact: template for what gets written to state.cv.landmarks on completion
  // modifiers: state values that influence progress rate
  // crisisEvents: pool of mid-landmark complications (stubbed for now)
  // =====================================================================

  window.LANDMARKS = {
    masters_thesis: {
      id:          "masters_thesis",
      label:       "Master's Thesis",
      blurb:       "Your first sustained argument. It will be revised. Repeatedly.",
      visibleWhen: (s) => s.levelIndex === 2 && !s.flags?.mastersThesisCompleted,
      totalProgress: 200,
      phases: [
        { id: "proposal",  label: "Proposal",       description: "Identify a question worth asking.",        progressRequired: 40  },
        { id: "research",  label: "Research",        description: "Read everything. Understand some of it.", progressRequired: 80  },
        { id: "writing",   label: "Writing",         description: "The abyss of the blank page.",            progressRequired: 140 },
        { id: "revisions", label: "Revisions",       description: "Your committee has notes.",               progressRequired: 180 },
        { id: "defense",   label: "Defense",         description: "Defend your choices in front of people.", progressRequired: 200 }
      ],
      // What moves the bar: write actions and study actions while landmark is active
      progressSources: {
        write:         2.0,
        study_papers:  0.5
      },
      // State modifiers that affect progress rate
      modifiers: {
        knowledgeMult:      true,
        advisorRelationship: false  // not yet implemented, stubbed
      },
      // What goes on the CV when complete
      artifact: {
        type:   "masters_thesis",
        fields: ["title", "advisor", "year", "quality"]
      },
      crisisEvents: []  // stubbed — populated in future events pass
    },

    dissertation: {
      id:          "dissertation",
      label:       "Doctoral Dissertation",
      blurb:       "The document that will define you, haunt you, and eventually gather dust.",
      visibleWhen: (s) => s.levelIndex === 3 && !s.flags?.dissertationDefended,
      totalProgress: 500,
      phases: [
        { id: "prospectus",   label: "Prospectus",       description: "Convince your committee the project is possible.",         progressRequired: 80  },
        { id: "candidacy",    label: "Candidacy Exam",   description: "Everything you know, examined at once.",                   progressRequired: 160 },
        { id: "chapters",     label: "Writing Chapters", description: "The long middle. This is where people leave academia.",    progressRequired: 320 },
        { id: "committee",    label: "Committee Review", description: "Revisions from four people who disagree with each other.", progressRequired: 430 },
        { id: "defense",      label: "Final Defense",    description: "You know this better than anyone in the room.",            progressRequired: 500 }
      ],
      progressSources: {
        write:        2.5,
        study_papers: 0.8
      },
      modifiers: {
        knowledgeMult:       true,
        advisorRelationship: true   // advisor system will plug in here
      },
      artifact: {
        type:   "dissertation",
        fields: ["title", "advisor", "committee", "year", "quality", "defenseScore"]
      },
      crisisEvents: []
    },

    first_monograph: {
      id:          "first_monograph",
      label:       "First Monograph",
      blurb:       "A book. Your book. The one you will be introduced by for the rest of your career.",
      visibleWhen: (s) => s.levelIndex >= 5   // adjunct+
                       && s.flags?.dissertationDefended
                       && !s.flags?.firstMonographCompleted,
      totalProgress: 350,
      phases: [
        { id: "proposal",    label: "Book Proposal",    description: "Convince a press your dissertation is a book.",   progressRequired: 60  },
        { id: "revision",    label: "Revision",         description: "It is not a dissertation. Revise accordingly.",   progressRequired: 150 },
        { id: "peer_review", label: "Peer Review",      description: "Anonymous experts have opinions.",                progressRequired: 240 },
        { id: "production",  label: "Production",       description: "Copyedits, proofs, and the index from hell.",     progressRequired: 310 },
        { id: "publication", label: "Publication",      description: "It exists. Someone will cite it. Maybe.",         progressRequired: 350 }
      ],
      progressSources: {
        write:        2.0,
        study_papers: 0.4
      },
      modifiers: {
        knowledgeMult: true,
        universityPrestige: true
      },
      artifact: {
        type:   "first_monograph",
        fields: ["title", "press", "year", "quality"]
      },
      crisisEvents: []
    },

    job_market: {
      id:          "job_market",
      label:       "The Job Market",
      blurb:       "Two hundred applications. Eight interviews. One offer. Maybe.",
      visibleWhen: (s) => s.levelIndex === 4   // postdoc
                       && s.flags?.dissertationDefended
                       && !s.flags?.jobMarketCleared,
      totalProgress: 300,
      phases: [
        { id: "materials",   label: "Application Materials", description: "The cover letter that will be read for 45 seconds.",    progressRequired: 60  },
        { id: "applications",label: "Mass Applications",     description: "Apply everywhere. Mean it.",                            progressRequired: 130 },
        { id: "interviews",  label: "Interviews",            description: "Fly to a cold city. Perform.",                          progressRequired: 210 },
        { id: "flyouts",     label: "Campus Visits",         description: "Two days. Every committee member. Smile.",              progressRequired: 270 },
        { id: "offer",       label: "Offer & Negotiation",   description: "They want you. The salary is not negotiable.",          progressRequired: 300 }
      ],
      progressSources: {
        write:        1.5,   // a weaker input — the market doesn't care how much you write
        study_papers: 0.3
      },
      // Prestige is the dominant modifier here — the Harvard effect
      modifiers: {
        universityPrestige:  true,   // high prestige = faster progress
        dissertationQuality: true,   // good dissertation = better odds
        network:             true    // identity.network feeds in
      },
      artifact: {
        type:   "job_market",
        fields: ["outcome", "institution", "year", "prestige"]
      },
      crisisEvents: []
    },

    tenure_review: {
      id:          "tenure_review",
      label:       "Tenure Review",
      blurb:       "Six years of work, judged in a single year. Mostly by people in other departments.",
      visibleWhen: (s) => s.levelIndex === 6   // tenure track
                       && !s.flags?.tenureGranted,
      totalProgress: 400,
      phases: [
        { id: "dossier",     label: "Dossier Assembly",   description: "Document everything. Every talk, every review.",           progressRequired: 80  },
        { id: "external",    label: "External Review",    description: "Six letters from people you have never met.",              progressRequired: 160 },
        { id: "department",  label: "Department Vote",    description: "Your colleagues vote. You are not in the room.",           progressRequired: 240 },
        { id: "dean",        label: "Dean's Review",      description: "Bureaucracy moves at its own pace.",                       progressRequired: 320 },
        { id: "decision",    label: "Final Decision",     description: "A letter arrives. Your hands are shaking.",                progressRequired: 400 }
      ],
      progressSources: {
        write:        1.0,
        study_papers: 0.2
      },
      modifiers: {
        publications:        true,
        citationCount:       true,
        universityPrestige:  true,
        network:             true
      },
      artifact: {
        type:   "tenure_review",
        fields: ["outcome", "institution", "year", "departmentRank"]
      },
      crisisEvents: []
    },

    habilitation_opus: {
      id:          "habilitation_opus",
      label:       "Habilitation Opus",
      blurb:       "The work that proves you have moved beyond your dissertation. Finally.",
      visibleWhen: (s) => s.levelIndex === 7   // tenured — completing it gates entry to habilitation
                       && !s.flags?.habilitationCompleted,
      totalProgress: 600,
      phases: [
        { id: "conception",  label: "Conception",         description: "An idea that has been waiting fifteen years.",             progressRequired: 100 },
        { id: "research",    label: "Deep Research",      description: "You know where every body is buried.",                    progressRequired: 220 },
        { id: "synthesis",   label: "Synthesis",          description: "Drawing together a career's worth of threads.",           progressRequired: 380 },
        { id: "submission",  label: "Submission",         description: "The manuscript leaves your hands.",                       progressRequired: 500 },
        { id: "recognition", label: "Recognition",        description: "The field responds. It takes a while.",                   progressRequired: 600 }
      ],
      progressSources: {
        write:        3.0,
        study_papers: 1.0
      },
      modifiers: {
        knowledgeMult:      true,
        hIndex:             true,
        universityPrestige: true
      },
      artifact: {
        type:   "habilitation_opus",
        fields: ["title", "year", "quality", "hIndexAtTime"]
      },
      crisisEvents: []
    }
  };


  // =====================================================================
  // TITLE BANK — formulaic absurdist academic paper generator
  // Templates use [BracketCase] for substitution; each bracket gets a random word.
  // Inspired by Sokal & Bricmont's postmodern generator.
  // =====================================================================

  window.TITLE_BANK = {
    templates: [
      "[Verbs] the [Nouns]: a [Methods] study of [Topics]",
      "Toward a [Adjectives] [Concepts]: [Gerunds] [Objects]",
      "The [Concepts] of [Nouns]: [Gerunds] [Adjectives] [Topics]",
      "[Concepts], [Concepts], and [Concepts]: [Adjectives] [Gerunds] in [Fields]",
      "[Adjectives] [Concepts]: [Gerunds] [Nouns] in the age of [Topics]"
    ],
    verbs: [
      "Problematizing", "Interrogating", "Transgressing", "Decentering",
      "Excavating", "Materializing", "Articulating", "Destabilizing"
    ],
    nouns: [
      "Boundaries", "Alterity", "Margins", "Epistemologies", "Methodologies",
      "Subjectivities", "Archives", "Hegemonies", "Assemblages", "Positionalities"
    ],
    methods: [
      "heuristic", "phenomenological", "rhizomatic", "genealogical",
      "diasporic", "algorithmic", "cybernetic", "speculative", "affective"
    ],
    topics: [
      "quantum learning design", "algorithmic bias", "neoliberal governance",
      "affective labor", "postcolonial futures", "digital embodiment",
      "data justice", "epistemic violence", "climate affect"
    ],
    adjectives: [
      "emergent", "liminal", "posthuman", "affective", "embodied",
      "speculative", "queer", "subaltern", "visceral", "intra-acting"
    ],
    concepts: [
      "Jouissance", "Praxis", "Alterity", "Epistemic rupture", "Liminality",
      "Heterotopia", "Hauntology", "Remediation", "Becoming", "Difference"
    ],
    gerunds: [
      "Rethinking", "Articulating", "Materializing", "Becoming", "Troubling",
      "Queering", "Undoing", "Deterritorializing", "Assembling", "Haunting"
    ],
    objects: [
      "subjectivity", "the archive", "difference", "the corporeal",
      "the posthuman", "encounter", "relation", "futurity", "the everyday"
    ],
    fields: [
      "affect theory", "critical pedagogy", "STS", "postcolonial studies",
      "new materialism", "disability justice", "queer theory", "media ecology"
    ]
  };

  // =====================================================================
  // EVENTS — stubbed. Will be tier-based narrative triggers.
  // =====================================================================

  window.EVENTS = {};

  // =====================================================================
  // UNIVERSITY NAMES — generated from your prestige when you arrive
  // Tiers by universityPrestige. Templates fill {slot}s from `slots`.
  // =====================================================================

  window.UNIVERSITY_NAMES = [
    { min: 0, label: "Community College",
      easterEgg: { name: "Greendale Community College", chance: 0.05 },
      templates: ["{place} Community College", "Community College of {place}", "{place} Technical & Community College"],
      slots: {
        place: ["Exit 14", "the Former Blockbuster", "Parking Structure B", "the Tri-County Area", "the Old Sears",
                "Route 9", "Lower Strip Mall", "Unincorporated Township", "the Greater Outlet Mall Region"]
      } },

    { min: 10, label: "Regional College",
      templates: ["{dir} State College", "{dir} {dir2} State College", "{dir} State University at {town}",
                  "{dir} {dir2} {dir3} State", "{town} State College"],
      slots: {
        dir:  ["North", "South", "East", "West", "Upper", "Lower", "Mid"],
        dir2: ["Central", "Eastern", "Western", "Coastal", "Plains"],
        dir3: ["Northeast", "Southwest", "Lakeshore"],
        town: ["Dry Fork", "Muncie-Adjacent", "Fort Humbler", "Little Rapids", "Slippery Elm", "New Middleton"]
      } },

    { min: 30, label: "Liberal Arts College",
      templates: ["{surname} College", "{surname}-{surname2} College", "The College of Saint {saint} the {epithet}",
                  "{surname} College (Formerly the {surname2} Female Seminary)"],
      slots: {
        surname:  ["Pemberton", "Whitcombe", "Ashgrove", "Thistlewood", "Hollingsworth", "Bramblewick", "Fairweather", "Quimby"],
        surname2: ["Aldersey", "Crane", "Moxley", "Birchard", "Pellew", "Wainscott"],
        saint:    ["Cuthbert", "Hildegard", "Ambrose", "Bartholomew", "Ethelreda"],
        epithet:  ["Reasonably Priced", "Mildly Concerned", "Overcommitted", "Well-Endowed", "Unbothered"]
      } },

    { min: 50, label: "State University",
      templates: ["University of {state} at {town}", "{state} State University", "{state} Tech",
                  "University of Northern Southern {state}", "The {state} University of Agriculture, Mechanics, and Marketing"],
      slots: {
        state: ["Ohio", "Vermont", "Nebraska", "Oregon", "Delaware", "New Mexico", "Kansas", "Michigan", "Virginia"],
        town:  ["Normal", "Boring", "Truth or Consequences", "Intercourse", "Accident", "Hell", "Nothing", "Why"]
      } },

    { min: 90, label: "Ivy League",
      templates: ["{surname} University", "Old {surname}", "The {surname} Institute of Being Right",
                  "{surname} University (Est. 1636, Allegedly)", "University of {surname} and {surname2}"],
      slots: {
        surname:  ["Vandermeer", "Ashcombe", "Wexley", "Harkness", "Pellingham", "Stuyvesant-Hale", "Throckmorton"],
        surname2: ["Endicott", "Van Rensselaer", "Coldwater", "Grosvenor"]
      } }
  ];

  // =====================================================================
  // LAB — grad student names and personalities
  // =====================================================================

  window.GRAD_NAMES = [
    "Priya", "Kevin", "Oksana", "Mateo", "Aisha", "Tobias", "Mei", "Dmytro", "Fatima", "Liam",
    "Chiara", "Kwame", "Ingrid", "Rahul", "Yuki", "Sofía", "Emeka", "Hannah", "Arjun", "Zeynep",
    "Nikolai", "Grace", "Tariq", "Maren"
  ];

  window.GRAD_QUIRKS = [
    "has opinions about Foucault", "is secretly writing a novel", "runs the department Discord",
    "carries a Nalgene everywhere", "keeps asking about the job market", "has not been seen since March",
    "is suspiciously good at R", "cites Wikipedia with confidence", "brings a different sourdough every week",
    "is on their fourth dissertation topic", "replies to email within ninety seconds", "owns a lab coat for fun"
  ];

  // =====================================================================
  // NEWS FEED LINES
  // =====================================================================

  window.REVIEW_QUIPS = [
    "Recommendation: major revisions. Tone: minor menace.",
    "You wrote \"the authors should consider\" eleven times.",
    "You were Reviewer 2. You didn't mean to be. It just happened.",
    "Accept with minor revisions. You feel generous and slightly suspicious of yourself.",
    "Four hours on a paper that cited you zero times. You noted this, professionally."
  ];

  window.GRANT_FAIL_QUIPS = [
    "Not funded. Reviewers called your approach \"ambitious,\" which is not a compliment.",
    "Not funded. One reviewer seems to have read a different proposal.",
    "Not funded. Your score was \"Very Good,\" the worst possible kind of Very Good.",
    "Not funded. The panel loved it and funded someone else's."
  ];

})();