// state.js — runtime state
// This is the single source of truth for a playthrough.
// All values here are plain data — no functions, no content references.
// content.js defines what the game world looks like.
// state.js defines where the player currently is in it.

const DEFAULT_STATE = {

  // ── Core resources ──────────────────────────────────────────────────
  knowledge:        0,
  drafts:           0,
  totalDraftsEver:  0,   // monotonic — never decreases, drives write cost scaling
  publications:     0,   // mirrors the total across papers.tiers, kept in sync
  energy:           100,
  cooldownUntil:    0,   // timestamp (ms); if Date.now() < cooldownUntil → in burnout

  // knowledgePerStudy: base gain for read_papers, improves with writing
  knowledgePerStudy: 1,

  // ── Progression ─────────────────────────────────────────────────────
  levelIndex: 0,

  // ── Papers (quality-tier citation histograms) ───────────────────────
  // tiers[t][c] = number of papers in quality tier t (see PAPER_TIERS)
  // with exactly c citations. Paper count, total citations and h-index are
  // derived from this. Capped at HINDEX_BUCKET_MAX (500) citations per paper.
  papers: {
    tiers:    [],     // shaped to PAPER_TIERS.length × (HINDEX_BUCKET_MAX + 1) by ensurePaperTiers() in main.js
    lastTier: null    // tier of the most recent paper (dev inspector)
  },

  // ── Tests ────────────────────────────────────────────────────────────
  // Keyed by test id (sat, gre). Sections hold superscore values.
  tests: {
    sat: {
      sections:     { math: null, verbal: null },
      attemptsUsed: 0
    },
    gre: {
      sections:     { quant: null, verbal: null },
      attemptsUsed: 0
    }
  },

  // ── Traits (rolled once at game start, hidden until revealed) ────────
  traits: {
    rolled:            false,
    iq:                100,
    conscientiousness: 50,
    agreeableness:     50,
    neuroticism:       50,
    openness:          50,
    extraversion:      50,
    ses:               50,    // socioeconomic status — affects prestige jitter
    visibility:        "hidden",  // "hidden" | "labels" | "values"
    bigFiveAwareness:  false       // unlocked by social science major
  },

  // ── Modifiers (rebuilt each frame from affiliations + traits + perks) ─
  // These are multipliers applied to resource gains and costs.
  modifiers: {
    knowledgeMult:      1,
    paperMult:          1,
    writeCostMult:      1,
    citationMult:       1,
    energyRegenMult:    1,
    pubTypeMult: {
      conference: 1,
      journal:    1,
      chapter:    1,
      monograph:  1
    },
    paperQualityBonus:  0,
    grantAptitudeBonus: 0
  },

  // ── Affiliations ──────────────────────────────────────────────────────
  // Stores the id of the chosen affiliation per slot, or null.
  affiliations: {
    hs_club:      null,   // high school club id or null
    hs_sport:     null,   // high school sport id or null
    college_club: null,   // undergrad club id or null
    major:        null    // one major id or null
  },

  // ── Perks ─────────────────────────────────────────────────────────────
  // Keyed by perk id; value is true when unlocked.
  perks: {},

  // ── Identity ──────────────────────────────────────────────────────────
  // Derived stats that accumulate over the playthrough.
  identity: {
    network:    0,
    resilience: 0,
    ambition:   0,
    reputation: 0
  },

  // ── University prestige ───────────────────────────────────────────────
  // Set once on college admission from SAT/GRE score. Never resets.
  universityPrestige: 0,
  hsPrestige:         0,   // banked in high school; added to SAT prestige at admission

  // ── Active landmark ───────────────────────────────────────────────────
  // Only one landmark can be in progress at a time.
  activeLandmark: null,   // landmark id or null
  landmarkProgress: 0,    // 0..landmark.totalProgress
  landmarkLastProgressAt: 0, // timestamp (ms) of the last progress gain; decay waits out a grace period after it
  landmarksCompleted: 0,  // total completed across career

  // ── Flags ─────────────────────────────────────────────────────────────
  // Boolean milestones. Gates read these. Never reset them to false.
  flags: {
    appliedToCollege:         false,   // HS → undergrad needs the application, not just the SAT
    mastersThesisCompleted:   false,
    dissertationDefended:     false,
    jobMarketCleared:         false,
    tenureGranted:            false,
    firstMonographCompleted:  false,
    habilitationCompleted:    false,
    emeritus:                 false,
    therapyUnlocked:          false    // unlocks at doctoral; reveals traits and identity
  },

  // ── Timers ────────────────────────────────────────────────────────────
  // Accumulator buckets for fractional passive gains (e.g. 0.5 drafts/tick).
  timers: {
    draftAccumulator:      0,
    knowledgeAccumulator:  0,
    draftsSinceMilestone:  0    // triggers HS milestone events at intervals
  },

  // ── Milestone selection ────────────────────────────────────────────────
  // Which milestone event is available to click during this cycle (after reaching threshold)
  selectedMilestoneEvent: null,

  // ── Curriculum Vitae ──────────────────────────────────────────────────
  // Permanent record. Written to on landmark completion and key events.
  // Never modified by resource deltas.
  cv: {
    universityName:   null,   // generated on college admission
    satScore:         null,
    greScore:         null,
    major:            null,
    club:             null,
    sport:            null,
    landmarks:        [],     // array of landmark artifact objects
    advisor:          null    // stubbed for advisor system
  },

  // ── Save metadata ─────────────────────────────────────────────────────
  // Bump this when a change to state needs a migration (see MIGRATIONS in
  // systems.js). Adding a field with a sensible default does NOT need a bump;
  // the deep merge on load fills it in.
  saveVersion: 3,
  lastSaved:   null
};

// Deep clone helper — state is always initialized from a clean clone
function cloneState(src) {
  return JSON.parse(JSON.stringify(src));
}

// window.state is the live runtime state
// Initialized in main.js from localStorage or DEFAULT_STATE
window.DEFAULT_STATE = DEFAULT_STATE;
window.state = cloneState(DEFAULT_STATE);
