// endgame.js — when the numbers stop being reasonable, and what it all meant
//
// DELEGATION. From the tenure track on, routine work can be handed off. A
// lab manager (bought in the lab) submits finished drafts for you; a writing
// assistant turns spare knowledge into drafts. Delegated work costs no
// energy. By emeritus your energy is for choices, not chores.
//
// HOLDINGS. Once tenured, you can build an empire out of lab funds:
// postdocs, visiting scholars, a textbook franchise, a lab wing, your own
// journal, a research center, a school of thought, a discipline, and at the
// very end a Citation Singularity. Each one costs ×1.15 the last and
// produces every second; upgrades double a holding's output once you own
// enough of it.
//
// THE ACADEMIC YEAR. Fall, winter break, spring, summer: a season every two
// minutes, each with its own weather. Grading in December, writing in July.
//
// HONORS. Late-career recognitions that turn up when you've earned them:
// the Wikipedia page, the honorary doctorate, the Academy, the Nobel, your
// name as an adjective.
//
// RETIREMENT AND LEGACY. At emeritus you can retire. You get an obituary
// written from the career you actually had (the choices, the people, the
// cat), and you can pass the torch: begin again as one of your students,
// carrying Legacy that buys permanent advantages. Each generation joins the
// lineage, and your past self turns up as a candidate to supervise your PhD.
//
// THE SCRAPBOOK. Your life, as it happened. The obituary reads from it.
//
// Lineage and Legacy live under their own storage key, so starting a new
// career keeps your family tree.

"use strict";

Object.assign(DEFAULT_STATE, {
  delegation: { autoPublish: false, autoWrite: false, publishType: "journal" },
  holdings:   { owned: {}, upgrades: {}, acc: { drafts: 0, knowledge: 0, funds: 0, citations: 0, money: 0 } },
  season:     { idx: 0, at: 0 },
  retired:    false,
  generation: 1,
  lastObituary: null
});

window.GAME_VERSION = "1.0.0";

// =====================================================================
// META: lineage and Legacy (survive every reset)
// =====================================================================
const META_KEY = "polp_meta_v1";
window.META = null;

function defaultMeta() { return { v: 1, legacy: 0, legacyTotal: 0, upgrades: {}, lineage: [], retirements: 0 }; }
function initMeta() {
  try {
    const raw = localStorage.getItem(META_KEY);
    window.META = raw ? Object.assign(defaultMeta(), JSON.parse(raw)) : defaultMeta();
  } catch (_) { window.META = defaultMeta(); }
  return window.META;
}
function saveMeta() { try { localStorage.setItem(META_KEY, JSON.stringify(window.META)); } catch (_) {} }
function legacyHas(id) { return !!window.META?.upgrades?.[id]; }
function lineageGeneration() { return (window.META?.lineage?.length ?? 0) + 1; }
initMeta();

// =====================================================================
// DELEGATION
// =====================================================================
function delegationUnlocked(kind) {
  if (kind === "publish") return !!state.lab?.items?.lab_manager;
  if (kind === "write")   return !!state.perks?.writing_assistant;
  return false;
}

// Drafts the writing assistant can turn out per second, by level
const ASSISTANT_RATE = { 6: 3, 7: 12, 8: 40, 9: 150 };

function tickDelegation() {
  const D = state.delegation;
  if (D.autoWrite && delegationUnlocked("write")) {
    const wc = writeCost();
    const keep = Math.max(wc * 5, 200);          // leave something for your own clicks
    const spare = (state.knowledge ?? 0) - keep;
    const rate = (ASSISTANT_RATE[state.levelIndex] ?? 3) * (state.modifiers?.gradDraftMult ?? 1);
    const n = Math.min(Math.floor(spare / Math.max(1, wc)), Math.floor(rate));
    if (n > 0) {
      state.knowledge -= n * wc;
      state.drafts += n;
      state.totalDraftsEver += n;
      onDraftsGained(n);
    }
  }
  if (D.autoPublish && delegationUnlocked("publish")) {
    const n = bulkPublish(D.publishType ?? "journal");
    if (n > 0) {
      const first = !(state.stats.delegatedPubs ?? 0);
      state.stats.delegatedPubs = (state.stats.delegatedPubs ?? 0) + n;
      if (first) pushNews("Your lab manager submitted a paper while you were in a meeting. You find out from the department newsletter.");
    }
  }
}

// =====================================================================
// HOLDINGS
// out: per second, per unit, before upgrades; cost: lab funds for the first
// =====================================================================
window.HOLDINGS = [
  { id: "postdoc",     label: "Postdoc",              icon: "fa-user-graduate",    level: 7, cost: 5e4,   out: { drafts: 1 },
    blurb: "Two-year contract, renewable \"if funding allows.\" Writes constantly, sleeps under the desk.",
    ups: ["Fellowship Branding", "A Desk with a Window", "A Postdoc Union Contract", "The Indefinite Postdoc", "Postdocs Supervising Postdocs"] },
  { id: "visiting",    label: "Visiting Scholar",     icon: "fa-suitcase-rolling", level: 7, cost: 3e5,   out: { drafts: 5, knowledge: 3 },
    blurb: "Here for a year. Gives one talk. Leaves you a paper's worth of ideas and a mug from their university.",
    ups: ["The Good Guest Apartment", "A Parking Pass", "A Courtesy Appointment", "Permanently Visiting", "Visiting Visiting Scholars"] },
  { id: "textbook",    label: "Textbook Franchise",   icon: "fa-book-open",        level: 7, cost: 1e6,   out: { funds: 3000 },
    blurb: "A new edition every two years. The only changes are the page numbers and the price.",
    ups: ["Access Codes", "The Bundled Workbook", "The Edition Treadmill", "Mandatory Adoption", "The Textbook Is a Subscription Now"] },
  { id: "lab_wing",    label: "Lab Wing",             icon: "fa-flask",            level: 7, cost: 2e6,   out: { drafts: 22 },
    blurb: "A whole wing with your name over the door, in a typeface you chose yourself.",
    ups: ["Better Coffee in the Wing", "Card Access, All Night", "A Second Floor", "The Underground Annex", "The Wing Has a Wing"] },
  { id: "journal",     label: "Your Own Journal",     icon: "fa-newspaper",        level: 8, cost: 8e6,   out: { drafts: 30, citations: 12 },
    blurb: "You're the editor. The reviewers are your friends. The citations are, statistically, inevitable.",
    ups: ["A Special Issue", "Impact Factor Optimization", "Open Access (Fee Applies)", "A Sister Journal", "The Journal of Your Journal"] },
  { id: "center",      label: "Research Center",      icon: "fa-building-columns", level: 8, cost: 2.5e7, out: { drafts: 140, knowledge: 30 },
    blurb: "An acronym, a logo, and twelve people with \"Associate\" in their titles.",
    ups: ["A Good Acronym", "An Advisory Board of Famous People", "The Center for the Center", "Federal Designation", "Center of Excellence in Excellence"] },
  { id: "mooc",        label: "MOOC",                 icon: "fa-laptop",           level: 8, cost: 6e7,   out: { funds: 90000, knowledge: 60 },
    blurb: "Two million enrolled. Nine thousand finished. Thirty watched past week two on purpose.",
    ups: ["A Certificate of Completion", "The Professional Track", "Microcredentials", "A Partner University in Every Time Zone", "The MOOC Accredits Itself"] },
  { id: "think_tank",  label: "Think Tank",           icon: "fa-chess",            level: 8, cost: 2e8,   out: { drafts: 900, citations: 150 },
    blurb: "A policy institute in a renovated townhouse. Op-eds every morning. Cocktails every evening.",
    ups: ["The Op-Ed Pipeline", "Senate Testimony", "A Second Townhouse", "A Bipartisan Fellow", "The Think Tank Thinks for Itself"] },
  { id: "satellite",   label: "Satellite Campus",     icon: "fa-satellite",        level: 9, cost: 1e9,   out: { drafts: 5000, funds: 2e6 },
    blurb: "A campus in a city that wanted one. The mascot is a version of yours, slightly off.",
    ups: ["A Branch Library", "The Dual Degree", "A Campus Abroad", "A Campus in a Mall", "A Campus Orbiting the Main Campus"] },
  { id: "school",      label: "School of Thought",    icon: "fa-people-roof",      level: 9, cost: 6e9,   out: { drafts: 30000, citations: 5000 },
    blurb: "Your ideas, with \"-ism\" on the end. Adherents. Heretics. A schism by year three.",
    ups: ["A Manifesto", "A Rival Interpretation", "Neo-You-ism", "Post-You-ism", "You-ism Studies"] },
  { id: "discipline",  label: "Discipline",           icon: "fa-sitemap",          level: 9, cost: 5e10,  out: { drafts: 220000, citations: 40000, funds: 4e7 },
    blurb: "A field. Departments. Conferences. A job market, which you're sorry about.",
    ups: ["A Founding Journal", "An Annual Meeting", "Subfields", "A Methodological Crisis", "The Interdisciplinary Turn"] },
  { id: "singularity", label: "Citation Singularity", icon: "fa-atom",             level: 9, cost: 8e11,  out: { drafts: 2e6, citations: 5e5 },
    blurb: "Every paper cites you, including the ones about other things. Time is a footnote.",
    ups: ["Event Horizon", "Self-Citing Citations", "Retrocausal Bibliography", "The Last Paper", "Heat Death of Peer Review"] }
];

const HOLDING_GROWTH = 1.15;
const HOLDING_UP_AT  = [1, 10, 25, 50, 100];
const HOLDING_UP_X   = [12, 120, 2400, 60000, 2.4e6];

function holdingDef(id)       { return window.HOLDINGS.find(h => h.id === id) ?? null; }
function holdingOwned(id)     { return state.holdings?.owned?.[id] ?? 0; }
function holdingsUnlocked()   { return state.levelIndex >= 7; }
function holdingCostMult() {
  let m = 1;
  if (legacyHas("generational_wealth")) m *= 0.9;
  if (state.perks?.development_office)  m *= 0.92;
  return m;
}
function holdingPrice(id, n = holdingOwned(id)) {
  return Math.ceil(holdingDef(id).cost * Math.pow(HOLDING_GROWTH, n) * holdingCostMult());
}
function holdingVisible(id) {
  const def = holdingDef(id);
  if (!def || !holdingsUnlocked() || state.levelIndex < def.level) return false;
  const i = window.HOLDINGS.indexOf(def);
  if (i === 0 || holdingOwned(id) > 0) return true;
  const prev = window.HOLDINGS[i - 1];
  return holdingOwned(prev.id) > 0 || (state.lab?.funds ?? 0) >= def.cost * 0.3;
}
function canBuyHolding(id) {
  if (!holdingVisible(id)) return { ok: false, reason: "" };
  const price = holdingPrice(id);
  if ((state.lab?.funds ?? 0) < price) return { ok: false, reason: `Needs $${fmtBig(price)} in lab funds` };
  return { ok: true, reason: "" };
}
function buyHolding(id) {
  if (!canBuyHolding(id).ok) return false;
  state.lab.funds -= holdingPrice(id);
  state.holdings.owned[id] = holdingOwned(id) + 1;
  if (holdingOwned(id) === 1) {
    pushNews(HOLDING_FIRST_NEWS[id] ?? `You now have a ${holdingDef(id).label}.`);
    storyLog(HOLDING_FIRST_NEWS[id] ?? `Founded: ${holdingDef(id).label}.`, "empire");
  }
  runHooks("holding", id);
  return true;
}

const HOLDING_FIRST_NEWS = {
  postdoc:     "Your first postdoc arrives with a laptop covered in stickers from conferences you didn't go to.",
  visiting:    "Your first visiting scholar has brought their family, a strong opinion about your coffee, and a manuscript.",
  textbook:    "Your intro textbook is adopted at 300 universities. Students hate it. Students buy it.",
  lab_wing:    "The lab wing opens. There's a ribbon. You cut it with scissors that cost more than your first car.",
  journal:     "Volume 1, Issue 1. You wrote the editorial, the lead article, and two of the reviews.",
  center:      "The Center opens with a reception. The acronym spells something unfortunate in Portuguese.",
  mooc:        "Your MOOC launches. Two million people watch the first video. Eleven watch the last one.",
  think_tank:  "Your think tank publishes its first white paper. A senator quotes it, wrongly, on television.",
  satellite:   "Your satellite campus opens. Its library is a vending machine with books in it.",
  school:      "People call themselves by your name with \"-ist\" on the end. Some of them are wrong about you, confidently.",
  discipline:  "There are departments of the thing you made up. You are the keynote at every one of their conferences, forever.",
  singularity: "Every paper published anywhere now cites you. You check whether that includes this one. It does."
};

function holdingUpgradeLevel(id) {
  return HOLDING_UP_AT.filter((_, i) => state.holdings.upgrades?.[`${id}:${i}`]).length;
}
function nextHoldingUpgrade(id) {
  const def = holdingDef(id);
  for (let i = 0; i < HOLDING_UP_AT.length; i++) {
    const key = `${id}:${i}`;
    if (state.holdings.upgrades?.[key]) continue;
    return { key, i, label: def.ups[i] ?? `${def.label} Upgrade ${i + 1}`, need: HOLDING_UP_AT[i],
             price: Math.ceil(def.cost * HOLDING_UP_X[i] * holdingCostMult()) };
  }
  return null;
}
function canBuyHoldingUpgrade(id) {
  const up = nextHoldingUpgrade(id);
  if (!up) return { ok: false, reason: "Every upgrade bought" };
  if (holdingOwned(id) < up.need) return { ok: false, reason: `Own ${up.need} first` };
  if ((state.lab?.funds ?? 0) < up.price) return { ok: false, reason: `Needs $${fmtBig(up.price)}` };
  return { ok: true, reason: "" };
}
function buyHoldingUpgrade(id) {
  if (!canBuyHoldingUpgrade(id).ok) return false;
  const up = nextHoldingUpgrade(id);
  state.lab.funds -= up.price;
  state.holdings.upgrades[up.key] = true;
  pushNews(`${up.label}: your ${holdingDef(id).label.toLowerCase()} output doubles.`);
  return true;
}

function holdingsMult() {
  let m = state.modifiers?.holdingMult ?? 1;
  if (legacyHas("compound_interest")) m *= 1.5;
  if (state.levelIndex >= 9) m *= 1.5;             // emeritus: nobody can stop you
  return m;
}
function holdingsRate() {
  const rate = { drafts: 0, knowledge: 0, funds: 0, citations: 0 };
  const g = holdingsMult();
  for (const def of window.HOLDINGS) {
    const n = holdingOwned(def.id);
    if (!n) continue;
    const up = Math.pow(2, holdingUpgradeLevel(def.id));
    for (const [k, v] of Object.entries(def.out)) rate[k] += v * n * up * g;
  }
  return rate;
}

// Accumulate fractions; flush whole units. dtSec defaults to one tick.
function produceHoldings(dtSec = TICK_MS / 1000) {
  if (!holdingsUnlocked()) return;
  const rate = holdingsRate();
  const acc = state.holdings.acc;
  for (const k of ["drafts", "knowledge", "funds", "citations"]) acc[k] = (acc[k] ?? 0) + rate[k] * dtSec;
  acc.money = (acc.money ?? 0) + speakingIncomeRate() * dtSec;
  if (acc.drafts >= 1)    { const n = Math.floor(acc.drafts);    acc.drafts -= n;    state.drafts += n; state.totalDraftsEver += n; onDraftsGained(n); }
  if (acc.knowledge >= 1) { const n = Math.floor(acc.knowledge); acc.knowledge -= n; state.knowledge += n; }
  if (acc.funds >= 1)     { const n = Math.floor(acc.funds);     acc.funds -= n;     state.lab.funds += n; }
  if (acc.money >= 1)     { const n = Math.floor(acc.money);     acc.money -= n;     state.money += n; }
  if (acc.citations >= 1) { const n = Math.floor(acc.citations); acc.citations -= n; addCitations(n); }
}

// Speaking fees: personal money per second from your citations
function speakingIncomeRate() {
  if (!state.perks?.speaking_circuit) return 0;
  return Math.sqrt(calcTotalCitations()) * 25;
}

// =====================================================================
// THE ACADEMIC YEAR
// =====================================================================
window.SEASONS = [
  { id: "fall",   label: "Fall semester",   icon: "fa-leaf",          mods: { knowledgeMult: 1.1, energyCostMult: 1.05 },
    blurb: "New students, new syllabi, the smell of a photocopier warming up. Learning is up; so is everything else.",
    start: ["Fall semester begins. The quad is full of people who look impossibly young. The bookstore line is forty minutes.",
            "September. Your inbox fills with \"Can I still add your class?\" You learn eleven new names and forget nine."] },
  { id: "winter", label: "Winter break",    icon: "fa-snowflake",     mods: { energyRegenMult: 1.3, citationMult: 0.9 },
    blurb: "Grades are in. The building is empty. You promised yourself you'd rest. You will, a little.",
    start: ["Grades submitted at 11:58 p.m. Winter break. You sleep twelve hours and wake up with a research idea.",
            "The campus empties. The heat in your building turns off on a schedule nobody understands. You work in a coat, happily."] },
  { id: "spring", label: "Spring semester", icon: "fa-seedling",      mods: { citationMult: 1.12, knowledgeMult: 1.03 },
    blurb: "Conference season. Everyone's in a hotel ballroom somewhere, citing each other.",
    start: ["Spring semester, which begins in a blizzard. Conference season: you pack the good blazer.",
            "Spring. Job talks, conference abstracts, and a faculty meeting about the strategic plan's strategic plan."] },
  { id: "summer", label: "Summer",          icon: "fa-sun",           mods: { writeCostMult: 0.85, energyRegenMult: 1.1 },
    blurb: "Research season. No classes, no committees, and the dangerous belief that you'll finish everything.",
    start: ["Summer: no classes, no meetings, and a to-do list that assumes you are four people.",
            "Summer. You write in the empty library while the undergrads are gone. It's quiet. It's perfect. It's already July."] }
];
const SEASON_SECONDS = 120;

function currentSeason() { return window.SEASONS[state.season?.idx ?? 0] ?? window.SEASONS[0]; }

function tickSeason() {
  if (state.levelIndex < 1) return;           // high school runs on a different calendar
  const S = state.season;
  const now = state.gameTicks ?? 0;
  if (!S.at) { S.at = now; return; }
  if (now - S.at < ticksFromSeconds(SEASON_SECONDS)) return;
  S.at = now;
  S.idx = ((S.idx ?? 0) + 1) % window.SEASONS.length;
  const se = currentSeason();
  pushNews(pickOne(se.start));
  rebuildModifiers();
}

function applySeasonModifiers(m) {
  if (state.levelIndex < 1) return;
  for (const [k, v] of Object.entries(currentSeason().mods)) {
    if (typeof m[k] !== "number") continue;
    if (k.endsWith("Mult")) m[k] *= v; else m[k] += v;
  }
}

// =====================================================================
// THE CALENDAR OF A CAREER: some things can't be rushed
// Tenure goes up in year five (year three if your record is overwhelming).
// The opus takes at least four years after tenure, because good books do.
// Emeritus comes after twelve years of tenured service, whatever your h.
// =====================================================================
const TENURE_UP_YEAR = 5, TENURE_EARLY_YEAR = 3;
const OPUS_MIN_YEARS = 4, EMERITUS_YEARS = 12;

function yearsSince(t) { return t == null ? Infinity : ((state.gameTicks ?? 0) - t) / ticksPerYear(); }
function tenureEarly() { return calcHIndex() >= 2 * (window.LEVELS?.[7]?.req?.h ?? 14); }

onHook("landmarkHeld", (held, def) => {
  if (held) return held;
  if (def.id === "tenure_review") {
    const y = tenureClockYear();
    return y != null && y < (tenureEarly() ? TENURE_EARLY_YEAR : TENURE_UP_YEAR);
  }
  if (def.id === "habilitation_opus") return yearsSince(state.timers.tenuredAt) < OPUS_MIN_YEARS;
  return false;
});
onHook("landmarkHoldReason", (why, def) => {
  if (why) return why;
  if (def.id === "tenure_review" && tenureClockYear() != null) {
    const up = tenureEarly() ? TENURE_EARLY_YEAR : TENURE_UP_YEAR;
    if (tenureClockYear() < up) return tenureEarly()
      ? `Your dossier is ready. Your record is strong enough to go up early, in year ${up}. Your chair says "no rush," which means "wait."`
      : `Your dossier is ready. Cases go up in year ${up}. Until then: publish, teach, and try not to refresh the faculty handbook.`;
  }
  if (def.id === "habilitation_opus" && yearsSince(state.timers.tenuredAt) < OPUS_MIN_YEARS) {
    const left = Math.ceil(OPUS_MIN_YEARS - yearsSince(state.timers.tenuredAt));
    return `The manuscript is done. It needs ${left} more year${left === 1 ? "" : "s"} in a drawer before you can stand to send it out. Good books take time; yours is taking exactly the minimum.`;
  }
  return null;
});

(() => {
  window.GATES.years_of_service = {
    id: "years_of_service",
    label: "Years of service",
    tip: `Emeritus comes after ${EMERITUS_YEARS} years of tenured service.`,
    isMet: (s) => yearsSince(s.timers?.tenuredAt) >= EMERITUS_YEARS
  };
  if (window.LEVELS?.[9]) window.LEVELS[9].gateId = "years_of_service";
})();

onHook("enterLevel", (i) => { if (i === 7 && state.timers.tenuredAt == null) state.timers.tenuredAt = state.gameTicks ?? 0; });
onHook("load", () => {
  // Saves from before the calendar: count them as long-serving already
  if (state.levelIndex >= 7 && state.timers.tenuredAt == null) state.timers.tenuredAt = (state.gameTicks ?? 0) - EMERITUS_YEARS * ticksPerYear();
});

// =====================================================================
// LATE-CAREER PERKS: delegation, honors (free, when earned)
// =====================================================================
(() => {
  const P = window.PERKS;
  const h = () => calcHIndex();
  const c = () => calcTotalCitations();

  Object.assign(P, {
    writing_assistant: {
      id: "writing_assistant", label: "Hire a Writing Assistant", category: "delegation",
      blurb: "Someone else turns your knowledge into drafts while you sleep. They're better at it than you were at their age.",
      visibleWhen: (s) => s.levelIndex >= 6 && !s.perks?.writing_assistant,
      cost: { money: 40000 },
      onJoin: (s) => { s.delegation.autoWrite = true; }
    },
    development_office: {
      id: "development_office", label: "Befriend the Development Office", category: "delegation",
      blurb: "They know every donor's birthday and every donor's dog's birthday. Holdings cost 8% less.",
      visibleWhen: (s) => s.levelIndex >= 7 && !s.perks?.development_office,
      cost: { money: 250000, energy: 40 }
    },
    speaking_circuit: {
      id: "speaking_circuit", label: "Join the Speaking Circuit", category: "delegation",
      blurb: "Same talk, forty cities, a lanyard in every one. Paid by the citation.",
      visibleWhen: (s) => s.levelIndex >= 7 && !s.perks?.speaking_circuit && calcTotalCitations() >= 1000,
      cost: { money: 100000, energy: 60 }
    },
    emeritus_office: {
      id: "emeritus_office", label: "Refuse to Give Up Your Office", category: "delegation",
      blurb: "They've asked three times. You changed the lock. Energy comes back twice as fast; nobody can make you do anything.",
      visibleWhen: (s) => s.levelIndex >= 9 && !s.perks?.emeritus_office,
      cost: { energy: 80 },
      effects: { modifiers: { energyRegenMult: 2 } }
    },

    // ── Honors: free, and only when you've earned them ───────────────
    wikipedia_page: {
      id: "wikipedia_page", label: "Someone Writes Your Wikipedia Page", category: "honor",
      blurb: "It's mostly about a controversy you don't remember. The photo is from a conference where you had a cold.",
      visibleWhen: (s) => s.levelIndex >= 6 && h() >= 20 && !s.perks?.wikipedia_page,
      cost: {}, effects: { modifiers: { citationMult: 1.04 } }
    },
    honorary_doctorate: {
      id: "honorary_doctorate", label: "Accept an Honorary Doctorate", category: "honor",
      blurb: "You give the commencement address in a velvet hat you will never wear again. You quote Robert Frost.",
      visibleWhen: (s) => s.levelIndex >= 7 && h() >= 40 && !s.perks?.honorary_doctorate,
      cost: { energy: 30 }, effects: { prestigeDelta: 3, modifiers: { citationMult: 1.04 } }
    },
    named_lecture: {
      id: "named_lecture", label: "Get a Lecture Series Named After You", category: "honor",
      blurb: "The inaugural speaker spends forty minutes disagreeing with you, which is the highest honor there is.",
      visibleWhen: (s) => s.levelIndex >= 7 && h() >= 60 && !s.perks?.named_lecture,
      cost: {}, effects: { modifiers: { citationMult: 1.08 } }
    },
    macarthur: {
      id: "macarthur", label: "Win a MacArthur \"Genius\" Grant", category: "honor",
      blurb: "The call comes from a number you don't recognize. You let it go to voicemail twice.",
      visibleWhen: (s) => s.levelIndex >= 6 && h() >= 50 && (s.traits?.openness ?? 50) >= 55 && !s.perks?.macarthur,
      cost: {}, apply: (s) => { s.money += 800000; }, effects: { modifiers: { knowledgeMult: 1.1 } }
    },
    academy: {
      id: "academy", label: "Get Elected to the National Academy", category: "honor",
      blurb: "You get a pin. You wear it to the grocery store once, as a test. Nobody notices. You keep wearing it.",
      visibleWhen: (s) => s.levelIndex >= 7 && h() >= 80 && !s.perks?.academy,
      cost: {}, effects: { prestigeDelta: 5, modifiers: { citationMult: 1.1 } }
    },
    ig_nobel: {
      id: "ig_nobel", label: "Win an Ig Nobel Prize", category: "honor",
      blurb: "For research that first makes people laugh, then makes them think. You accept in a paper hat.",
      visibleWhen: (s) => s.levelIndex >= 5 && (s.publications ?? 0) >= 30 && (s.traits?.openness ?? 50) >= 60 && !s.perks?.ig_nobel,
      cost: {}, effects: { modifiers: { citationMult: 1.05 } }
    },
    too_old_for_fields: {
      id: "too_old_for_fields", label: "Become Too Old for the Fields Medal", category: "honor",
      blurb: "You've turned forty. The Fields Medal is no longer possible. You mourn a prize you were never going to win.",
      visibleWhen: (s) => s.levelIndex >= 7 && ["stem", "engineering"].includes(s.affiliations?.major) && !s.perks?.too_old_for_fields,
      cost: {}, effects: { identity: { resilience: 3 } }
    },
    official_portrait: {
      id: "official_portrait", label: "Sit for Your Official Portrait", category: "honor",
      blurb: "The painter gives you a kinder jawline. It will hang in a hallway forever, frowning at undergraduates.",
      visibleWhen: (s) => s.levelIndex >= 9 && !s.perks?.official_portrait,
      cost: { energy: 40 }, effects: { prestigeDelta: 2 }
    },
    name_adjective: {
      id: "name_adjective", label: "Your Name Becomes an Adjective", category: "honor",
      blurb: "Scholars now describe things as distinctly yours. Nobody, including you, is sure what it means.",
      visibleWhen: (s) => s.levelIndex >= 8 && h() >= 300 && !s.perks?.name_adjective,
      cost: {}, effects: { modifiers: { citationMult: 1.25 } }
    }
  });

  // The big ones should be hard. They used to arrive with emeritus itself.
  if (P.pulitzer_prize) {
    P.pulitzer_prize.blurb = "For a book. People cite you without reading you, and now they buy you without reading you.";
    P.pulitzer_prize.visibleWhen = (s) => s.levelIndex >= 7 && !s.perks?.pulitzer_prize
      && (s.perks?.book_contract || storyFlag("tradeBook")) && h() >= 30 && (s.publications ?? 0) >= 50;
  }
  if (P.nobel_prize) {
    P.nobel_prize.visibleWhen = (s) => s.levelIndex >= 8 && !s.perks?.nobel_prize
      && h() >= 120 && c() >= 100000 && papersAtOrAboveTier(4) >= 10;
  }
})();

Object.assign(window.NEWS_ITEMS, {
  writing_assistant:  "Your writing assistant starts Monday. By Wednesday they've written more than you did last month, in your voice, better.",
  development_office: "You learn the development officers' names, their children's names, and the donors' dogs' names. Doors open.",
  speaking_circuit:   "Your first keynote is in a hotel ballroom in Phoenix. Your second is in a hotel ballroom in Phoenix that looks exactly like the first.",
  emeritus_office:    "Facilities has asked for your office back. You've added a second lock and a small sign that says \"In Use.\"",
  wikipedia_page:     "You have a Wikipedia page now. Someone has added your birthplace, wrongly, and [citation needed] next to your best idea.",
  honorary_doctorate: "An honorary doctorate. The velvet hat itches. The graduates are kind about your speech, which is mostly about failure.",
  named_lecture:      "The first annual lecture in your name. The speaker disagrees with you for forty minutes. It's the best gift you've ever been given.",
  macarthur:          "A MacArthur. $800,000, no strings, and the permanent, low-grade worry that you need to prove them right.",
  academy:            "Elected to the Academy. Your mother calls it \"the club.\" She's not wrong.",
  ig_nobel:           "An Ig Nobel. You give your acceptance speech in sixty seconds while an eight-year-old shouts \"Please stop, I'm bored.\"",
  too_old_for_fields: "Forty. The Fields Medal is now mathematically impossible. You take the afternoon off.",
  official_portrait:  "Your official portrait is unveiled. You look wise, a little stern, and slightly taller than you are.",
  name_adjective:     "Your name is an adjective now. A grad student uses it in a sentence you don't understand, and you nod as if you do.",
  nobel_prize:        "The call comes at 4:40 a.m. Stockholm time. You assume it's a prank. It's not. You will be confused with the physics winner for the rest of your life.",
  pulitzer_prize:     "A Pulitzer, for the book. Your publisher reprints it with a gold sticker. Your mother buys eleven copies."
});

// =====================================================================
// LEGACY UPGRADES
// =====================================================================
window.LEGACY_UPGRADES = [
  { id: "old_money",          cost: 10,   label: "Old Money",                       blurb: "Start each career with $5,000. Your family has \"a little set aside.\"" },
  { id: "inherited_library",  cost: 15,   label: "Inherited Library",               blurb: "Start each career having read three books from the family shelves." },
  { id: "name_recognition",   cost: 20,   label: "Name Recognition",                blurb: "Every advisor's rapport starts 15 higher. They've heard of your family." },
  { id: "serendipity_gene",   cost: 25,   label: "Serendipity Runs in the Family",  blurb: "Lucky things turn up on your desk 30% more often." },
  { id: "tenured_genes",      cost: 30,   label: "Tenured Genes",                   blurb: "Energy comes back 10% faster." },
  { id: "early_reader",       cost: 40,   label: "Early Reader",                    blurb: "Knowledge +25% before college." },
  { id: "ancestral_favor",    cost: 50,   label: "Ancestral Favor",                 blurb: "When your academic parent supervises you, they start at 90 rapport." },
  { id: "family_planner",     cost: 60,   label: "The Family Planner",              blurb: "Your planner never lapses, even in high school, and your routine runs 20% faster. You come from a long line of people who use planners." },
  { id: "muscle_memory",      cost: 80,   label: "Muscle Memory",                   blurb: "Writing costs 10% less knowledge, and every skill trains 25% faster." },
  { id: "generational_wealth",cost: 100,  label: "Generational Wealth",             blurb: "Holdings cost 10% less." },
  { id: "reviewer_whisperer", cost: 120,  label: "Reviewer Whisperer",              blurb: "Paper quality +5, always." },
  { id: "dynasty",            cost: 150,  label: "Dynasty",                         blurb: "+20 maximum energy." },
  { id: "compound_interest",  cost: 250,  label: "Compound Interest",               blurb: "Holdings produce 50% more." },
  { id: "academic_royalty",   cost: 400,  label: "Academic Royalty",                blurb: "Citations ×2." },
  { id: "immortal_prose",     cost: 600,  label: "Immortal Prose",                  blurb: "Reading papers gives twice the knowledge." },
  { id: "interdisciplinary",  cost: 200,  label: "Interdisciplinary Bloodline",     blurb: "One more theoretical framework, from the doctorate on. Both sides of the family are suspicious of you." },
  { id: "the_canon",          cost: 1000, label: "The Canon",                       blurb: "Each distinction is worth 2% instead of 1%." }
];

function legacyUpgradeDef(id) { return window.LEGACY_UPGRADES.find(u => u.id === id) ?? null; }
function canBuyLegacy(id) {
  const u = legacyUpgradeDef(id);
  if (!u || legacyHas(id)) return { ok: false, reason: "" };
  if ((window.META?.legacy ?? 0) < u.cost) return { ok: false, reason: `Needs ${u.cost} Legacy` };
  return { ok: true, reason: "" };
}
function buyLegacy(id) {
  if (!canBuyLegacy(id).ok) return false;
  window.META.legacy -= legacyUpgradeDef(id).cost;
  window.META.upgrades[id] = true;
  saveMeta();
  rebuildModifiers();
  return true;
}

// Every point of Legacy your family has ever earned helps a little (spent or
// not, so buying upgrades never makes you weaker): +10% × √(total earned)
function legacyFamilyBonus() { return 0.1 * Math.sqrt(Math.max(0, window.META?.legacyTotal ?? 0)); }
function applyLegacyModifiers(m) {
  const M = window.META;
  if (!M) return;
  const fam = legacyFamilyBonus();
  m.knowledgeMult *= 1 + fam;
  m.citationMult  *= 1 + fam;
  if (legacyHas("tenured_genes"))      m.energyRegenMult *= 1.10;
  if (legacyHas("early_reader") && state.levelIndex <= 0) m.knowledgeMult *= 1.25;
  if (legacyHas("muscle_memory"))      { m.writeCostMult *= 0.90; m.skillXpMult *= 1.25; }
  if (legacyHas("reviewer_whisperer")) m.paperQualityBonus += 5;
  if (legacyHas("dynasty"))            m.energyMaxBonus += 20;
  if (legacyHas("academic_royalty"))   m.citationMult *= 2;
  if (legacyHas("immortal_prose"))     m.paperMult *= 2;
  if (legacyHas("the_canon"))          m.honorBonusMult *= 2;
  if (legacyHas("family_planner"))     m.routineSpeedMult *= 0.8;
  if (legacyHas("interdisciplinary"))  m.frameworkSlotBonus += 1;
}

function legacyEarned() {
  const honors = typeof honorCount === "function" ? honorCount() : 0;
  const lived  = Math.floor((state.story?.meaning ?? 30) / 10);    // a life well lived counts
  return Math.floor(Math.sqrt(calcTotalCitations()) / 10 + calcHIndex() / 2 + (state.landmarksCompleted ?? 0) * 5 + honors + lived);
}

function applyLegacyAtStart() {
  if (legacyHas("old_money")) state.money = (state.money ?? 0) + 5000;
  if (legacyHas("inherited_library") && window.BOOKS) {
    const books = Object.values(window.BOOKS).filter(b => b.shelfId === "hs" || b.shelfId === "ug").map(b => b.id);
    for (let i = 0; i < 3 && books.length; i++) {
      const id = books.splice(Math.floor(Math.random() * books.length), 1)[0];
      state.reading.done[id] = 0;
      const r = window.READING_SHELVES[window.BOOKS[id].shelfId]?.reward?.knowledgePerStudy;
      if (r) state.knowledgePerStudy = (state.knowledgePerStudy ?? 1) + r;
    }
  }
  if (lineageGeneration() > 1) {
    const parent = window.META.lineage.at(-1);
    storyLog(`Born into generation ${lineageGeneration()} of an academic family. ${parent?.name ?? "Your academic parent"} kept a framed copy of their dissertation in the hallway.`, "life");
  }
}

// Your previous generation, as a candidate to supervise your PhD
function lineageAdvisorCandidate(stage) {
  const L = window.META?.lineage ?? [];
  if (!L.length || stage !== 3) return null;
  const parent = L[L.length - 1];
  const adv = makeAdvisor("legend", stage);
  adv.name = `Prof. ${parent.name.replace(/^(Dr\.|Prof\.)\s*/, "")}`;
  adv.prestige = clamp(50 + Math.round((parent.h ?? 0) / 2), 50, 100);
  adv.favor = legacyHas("ancestral_favor") ? 90 : 70;
  adv.ancestor = true;
  adv.rumor = `Your academic parent. ${parent.h >= 50 ? "Famous." : "Respected."} Busy. Proud of you, probably. Still has your old office.`;
  return adv;
}

// =====================================================================
// THE SCRAPBOOK — your life, as it happened (state.story.log, quests.js)
// =====================================================================
const LIFE_STAGES = ["High school", "College", "Master's", "PhD", "Postdoc", "Adjunct", "Tenure track", "Tenured", "Habilitation", "Emeritus"];

onHook("perk", (id) => {
  const p = window.PERKS?.[id];
  if (!p) return;
  if (p.milestone || p.category === "honor" || ["research_makes_news", "pulitzer_prize", "nobel_prize", "public_intellectual",
      "department_chair", "editorial_board", "book_contract", "mentorship_legacy", "therapy", "adopt_cat", "join_union",
      "study_abroad", "endowed_chair", "named_building", "get_a_job", "library_card"].includes(id)) {
    let line = window.NEWS_ITEMS?.[id];
    if (typeof line === "function") line = line(state);
    storyLog(Array.isArray(line) ? line[0] : (typeof line === "string" ? line : p.label), p.milestone ? "milestone" : "honor");
  }
});
onHook("affiliation", (id, slot) => {
  const reg = slot === "major" ? window.MAJORS : slot === "hs_sport" ? window.SPORTS : window.CLUBS;
  const a = reg?.[id];
  if (a) storyLog(slot === "major" ? `Declared a major: ${a.label}.` : `${a.label.replace(/^Join (the )?/, "Joined ")}.`, "affiliation");
});
onHook("enterLevel", (index) => {
  const inst = state.cv?.universityName;
  const where = inst && index >= 1 && index <= TENURE_TRACK_LEVEL ? ` at ${inst}` : "";
  const line = {
    1: `Started college${where}.`, 2: `Started a master's${where}.`, 3: `Started a PhD${where}.`,
    4: `Earned the doctorate. Postdoc${where}.`, 5: `Adjunct${where}: five sections of intro, three campuses.`,
    6: `Tenure-track job${where}.`, 7: "Tenure.", 8: "Habilitation: the second book, the one for the Germans.", 9: "Emeritus."
  }[index];
  if (line) storyLog(line, "career");
});
onHook("landmarkComplete", (def, artifact) => {
  storyLog(`${def.label}${artifact.title ? `: "${artifact.title}"` : ""}${artifact.advisor ? `, under ${artifact.advisor}` : ""}${artifact.grade ? ` (${artifact.grade.toLowerCase()})` : ""}.`, "landmark");
});
onHook("gradDefended", (g) => storyLog(`Dr. ${g.name} defended. Your student, now a colleague.`, "student"));
onHook("gradQuit", (g) => storyLog(`${g.name} left the program. You still think about it.`, "student"));

function renderScrapbook() {
  const el = ensurePanel("panel_scrapbook", "Scrapbook", "fa-images");
  if (!el) return;
  const log = state.story?.log ?? [];
  showPanel(el, log.length >= 3);
  if (log.length < 3) return;
  const recent = log.slice(-6).reverse();
  setPanelBody(el, `
    <ul class="scrap-list">${recent.map(e => `<li><span class="scrap-when">${LIFE_STAGES[e.level] ?? ""}</span> ${escHTML(e.text)}</li>`).join("")}</ul>
    <button type="button" data-memoir="1">Read it from the beginning</button>`);
}

function memoirHTML() {
  const log = state.story?.log ?? [];
  const byStage = {};
  for (const e of log) (byStage[e.level] = byStage[e.level] ?? []).push(e);
  return Object.keys(byStage).sort((a, b) => a - b).map(lvl => `
    <section class="memoir-stage">
      <h3>${LIFE_STAGES[lvl] ?? "Later"}</h3>
      ${byStage[lvl].map(e => `<p>${escHTML(e.text)}</p>`).join("")}
    </section>`).join("");
}

function showMemoir() {
  document.getElementById("memoir")?.remove();
  const wrap = document.createElement("div");
  wrap.id = "memoir";
  wrap.className = "overlay";
  wrap.setAttribute("role", "dialog");
  wrap.setAttribute("aria-label", "Your life so far");
  wrap.innerHTML = `<article class="memoir-book">
      <h2>${escHTML(playerName())}: a life in the literature</h2>
      ${memoirHTML() || "<p>Nothing yet. Give it time.</p>"}
      <div class="obit-btns"><button type="button" data-overlay-close="memoir">Close the book</button></div>
    </article>`;
  document.body.appendChild(wrap);
}

// =====================================================================
// RETIREMENT AND THE OBITUARY
// =====================================================================
function canRetire() {
  if (state.levelIndex < 9) return { ok: false, reason: "Only emeriti can retire for good" };
  if (state.retired) return { ok: false, reason: "Already retired" };
  return { ok: true, reason: "" };
}

function playerName() {
  const n = (state.profile?.name ?? "").trim();
  if (n) return state.levelIndex >= 4 && !/^(Dr\.|Prof\.)/.test(n) ? `Dr. ${n}` : n;
  return state.levelIndex >= 4 ? "The Professor" : "You";
}
function bareName() { return playerName().replace(/^(Dr\.|Prof\.)\s*/, ""); }

function fieldName() {
  const f = (state.profile?.field ?? "").trim();
  if (f) return f;
  return window.MAJORS?.[state.affiliations?.major]?.label ?? "Their Field";
}

// Numbers in an obituary are written out, the way a newspaper would
function proseNumber(n) {
  n = Math.round(n ?? 0);
  if (n < 1e6) return n.toLocaleString("en-US");
  const units = [[1e12, "trillion"], [1e9, "billion"], [1e6, "million"]];
  for (const [v, w] of units) if (n >= v) return `${(n / v).toFixed(n / v >= 100 ? 0 : 1).replace(/\.0$/, "")} ${w}`;
  return fmtBig(n);
}

function composeObituary() {
  const s = state, st = s.story ?? {};
  const name = playerName(), bare = bareName();
  const h = calcHIndex(), c = calcTotalCitations(), pubs = s.publications ?? 0;
  const age = 70 + Math.min(29, Math.floor(h / 12)) + randInt(0, 6);
  const opus = [...(s.cv?.landmarks ?? [])].reverse().find(l => l.title)?.title;
  const advisors = s.advisorHistory ?? [];
  const phdAdvisor = advisors.find(a => a.stage === 3 && !a.left) ?? advisors.find(a => a.stage === 3) ?? advisors[0];
  const alumni = s.alumni ?? 0;
  const integrity = st.integrity ?? 70, meaning = st.meaning ?? 30;
  const F = (f) => (st.flags?.[f] ?? 0) > 0;
  const field = fieldName();
  const books = typeof readCount === "function" ? readCount() : 0;

  let outlet, headline;
  if (F("scandal") || F("paperMill")) { outlet = "Retraction Watch"; headline = `${name}, Whose Work Was Later Retracted, Dies at ${age}`; }
  else if (h >= 150) { outlet = "The New York Times";        headline = `${name}, Who Changed How the World Thinks About ${field}, Dies at ${age}`; }
  else if (h >= 60)  { outlet = "The Chronicle";             headline = `${name}, Influential Scholar of ${field}, Dies at ${age}`; }
  else if (h >= 20)  { outlet = "University News";           headline = `Remembering ${name}`; }
  else               { outlet = "The Department Newsletter"; headline = `In Memoriam: ${name}`; }

  const paras = [];
  paras.push(`${name}, ${h >= 60 ? `whose work on ${field.toLowerCase()} is cited across a dozen fields` : `a scholar of ${field.toLowerCase()}`}, died at home${s.home?.id === "cottage" ? ", in a cottage by the sea, at a desk facing the water" : ""}.${opus ? ` ${bare} was best known for <em>${escHTML(opus)}</em>.` : ""}`);

  let career = `Over a career of ${proseNumber(pubs)} publication${pubs === 1 ? "" : "s"}, ${bare} was cited ${proseNumber(c)} times`;
  if (s.perks?.nobel_prize) career += " and received the Nobel Prize, which they described privately as \"administratively exhausting\"";
  else if (s.perks?.pulitzer_prize) career += " and won the Pulitzer Prize, which they kept on a shelf next to a chipped mug";
  else if (s.perks?.macarthur) career += " and was a MacArthur Fellow, which they never once called a genius grant";
  paras.push(career + ".");

  const early = [];
  const hsClub = window.CLUBS?.[s.affiliations?.hs_club]?.label?.replace(/^Join (the )?/, "");
  if (hsClub) early.push(`In high school they were in ${hsClub}`);
  if (s.perks?.library_card) early.push(`${early.length ? "and" : "As a teenager they"} kept their first library card, laminated, for the rest of their life`);
  if (early.length) paras.push(early.join(", ") + ".");
  if (books >= 20) paras.push(`They read ${books} books on purpose${s.reading?.done?.proust != null ? ", including all of Proust, which they mentioned" : ""}${s.reading?.done?.moby_dick != null && F("sparknotes") ? ", and finally the real Moby-Dick" : ""}.`);

  if (phdAdvisor) {
    const said = phdAdvisor.letter >= 80 ? "\"the best student I ever had\"" : phdAdvisor.letter >= 55 ? "\"very promising\"" : phdAdvisor.letter >= 35 ? "\"fine\"" : "nothing at all";
    paras.push(`They trained under ${phdAdvisor.name}, who once described them as ${said}.`);
  }

  const people = [];
  if (st.rival) {
    const r = st.rival;
    people.push(r.relation >= 30 ? `Their longtime rival, ${r.name}, spoke at the memorial and had to stop twice.`
      : r.relation <= -30 ? `Their longtime rival, ${r.name}, declined to comment, at length.`
      : `${r.name}, a colleague of many years, sent a short, correct note.`);
  }
  if (F("ashleyClosure")) people.push("Ashley sent flowers.");
  else if (F("ashleyHIndex")) people.push("Ashley, a high school classmate, recalled that they \"talked about their h-index a lot.\"");
  else if (s.perks?.first_heartbreak && F("ashleyLiked")) people.push("Ashley, who knew them in high school, left a comment on the memorial page.");
  if (F("followedPartner") || F("spousalHire")) people.push("They are survived by the partner they followed across the country, a decision they called the best of their career.");
  else if (F("endedIt")) people.push("They kept the cat.");
  else if (s.perks?.adopt_cat) people.push("They are survived by a cat, who sat on their final manuscript and approved of it.");
  if (people.length) paras.push(people.join(" "));

  const character = [];
  if (F("retracted")) character.push("They once retracted one of their own papers after finding an error, which colleagues still describe as unusual.");
  if (F("blamedStudent")) character.push("A former student's account of the integrity inquiry is available online.");
  if (F("dean")) character.push("They served as Dean, a period they rarely discussed.");
  if (F("festschrift")) character.push("Their students published a volume in their honor, which they read in one sitting and then again.");
  if (F("tradeBook")) character.push("Their popular book is still in print, and still has the wrong cover.");
  if ((s.frameworks?.turns ?? 0) >= 3) character.push(`They took ${s.frameworks.turns} theoretical turns, and could explain every one.`);
  if ((st.flags?.goodMentor ?? 0) >= 8) character.push("They read every chapter their students sent them, properly, and said yes when it mattered.");
  if (meaning >= 65) character.push("Former students describe office hours that ran long and letters that said true things.");
  else if (meaning <= 15) character.push("Colleagues remember them as extraordinarily productive.");
  if (integrity >= 85) character.push("They never once added an author who hadn't earned it.");
  if (character.length) paras.push(character.join(" "));

  const survived = [];
  if (alumni) survived.push(`${alumni} doctoral student${alumni === 1 ? "" : "s"}`);
  survived.push(`an h-index of ${h}`);
  survived.push(F("dean") ? "a reserved parking space" : "one unfinished monograph");
  const list = survived.length > 2 ? survived.slice(0, -1).join(", ") + ", and " + survived.at(-1)
             : survived.join(" and ");
  paras.push(`${bare} is survived by ${list}.`);

  let ending;
  if (F("scandal") || F("paperMill")) ending = "The Asterisk";
  else if (meaning >= 65 && h >= 60)  ending = "The Teacher Who Was Also Famous";
  else if (meaning >= 65)             ending = "The One Everyone Thanked";
  else if (h >= 150)                  ending = "The Name on the Building";
  else if (h >= 60)                   ending = "The Footnote Everyone Cites";
  else if (integrity >= 85)           ending = "The Honest Career";
  else                                ending = "A Life in the Literature";

  // The last word: something they'd have said themselves
  const epitaph = meaning >= 65 ? "\"It was worth it. Mostly the students.\""
                : integrity >= 85 ? "\"p = 0.051. I reported it.\""
                : h >= 150 ? "\"Of making many books there is no end.\""
                : F("scandal") ? "\"The data were real. Some of them.\""
                : "\"Revise and resubmit.\"";

  return { outlet, headline, paras, ending, epitaph, name, h, c, pubs, age, opus: opus ?? null, integrity, meaning };
}

function pickHeir() {
  if (labStudentCount() > 0) return pickLabStudentName();
  if ((state.alumniNames ?? []).length) return pickOne(state.alumniNames);
  return pickOne(window.GRAD_NAMES ?? ["Priya"]);
}

function inventName() {
  return `${pickOne(ADVISOR_FIRST)} ${pickOne(ADVISOR_LAST)}`;
}

function retire() {
  if (!canRetire().ok) return null;
  if (!(state.profile?.name ?? "").trim()) state.profile.name = inventName();
  const obit = composeObituary();
  const earned = legacyEarned();
  const M = window.META;
  M.legacy += earned;
  M.legacyTotal += earned;
  M.retirements += 1;
  M.lineage.push({
    gen: lineageGeneration(), name: obit.name, field: fieldName(), h: obit.h, citations: obit.c,
    pubs: obit.pubs, opus: obit.opus, ending: obit.ending, legacy: earned, heir: pickHeir()
  });
  saveMeta();
  state.retired = true;
  state.lastObituary = obit;
  storyLog(`Retired. ${earned} Legacy passed on.`, "career");
  pushNews(`You retire. The department throws a party with a sheet cake that says CONGRATULATIONS in a font you'd never use. ${earned} Legacy passes to the next generation.`);
  saveGame();
  return { obit, earned };
}

function passTheTorch() {
  if (!state.retired) return false;
  const heir = window.META.lineage.at(-1)?.heir ?? "";
  resetGame();
  state.profile.name = heir;
  state.generation = lineageGeneration();
  applyLegacyAtStart();
  state.news = [];
  pushNews(heir
    ? `Generation ${state.generation}. You were ${heir}, once, a student in someone's lab. Now it starts again: high school, a library card, a long way to go.`
    : `Generation ${state.generation}. It starts again.`);
  rebuildModifiers();
  saveGame();
  return true;
}

// =====================================================================
// OFFLINE PROGRESS — the lab keeps working while the tab is closed
// Half efficiency, up to eight hours. Energy refills; students write;
// institutions produce; papers get read; the book on your nightstand gets
// finished. The tenure clock doesn't move while you're away.
// =====================================================================
const OFFLINE_CAP_SEC = 8 * 3600;
const OFFLINE_EFFICIENCY = 0.5;

function applyOfflineProgress(nowMs = Date.now(), last = state.lastSaved) {
  if (!last) return null;
  const away = Math.min(OFFLINE_CAP_SEC, Math.max(0, (nowMs - last) / 1000));
  if (away < 60) return null;
  const sec = away * OFFLINE_EFFICIENCY;
  const before = { drafts: state.drafts, pubs: state.publications, cites: calcTotalCitations(), funds: state.lab?.funds ?? 0, money: state.money ?? 0, books: Object.keys(state.reading?.done ?? {}).length };

  state.energy = maxEnergy();
  state.cooldownUntil = 0;
  state.landmarkLastProgressAt = Date.now();

  // Salary and lab running costs
  const years = sec / SECONDS_PER_YEAR;
  state.money += annualSalary() * years;
  state.lab.funds -= labAnnualCosts() * years;

  // Students: drafts and papers in bulk (no defenses or departures offline)
  for (const g of state.gradStudents ?? []) {
    const speed = (0.5 + g.morale) * (state.modifiers?.gradSpeedMult ?? 1);
    const n = Math.floor(GRAD_DRAFTS_PER_YEAR * speed * (state.modifiers?.gradDraftMult ?? 1) * years);
    state.drafts += n; state.totalDraftsEver += n;
    g.progress += speed * years / GRAD_PAPER_YEARS;
    let papers = 0;
    while (g.progress >= 1 && papers < 500) { g.progress -= 1; papers++; }
    if (papers) addPapersBulk(papers, "journal");
  }

  // Study groups and other passive perks
  for (const [id, on] of Object.entries(state.perks ?? {})) {
    const pt = on && window.PERKS?.[id]?.passiveTick;
    if (!pt) continue;
    const ticks = sec * 1000 / TICK_MS;
    if (pt.knowledge) state.knowledge += pt.knowledge * ticks;
    if (pt.drafts) { const n = Math.floor(pt.drafts * 0.2 * ticks); state.drafts += n; state.totalDraftsEver += n; }
  }

  // The book on the nightstand
  const cur = state.reading?.current;
  if (cur && window.BOOKS?.[cur]) {
    state.reading.progress[cur] = (state.reading.progress[cur] ?? 0) + readingPagesPerSecond() * sec;
    if (state.reading.progress[cur] >= window.BOOKS[cur].pages) finishBook(cur);
  }

  // Holdings and delegation
  produceHoldings(sec);
  if (state.delegation?.autoPublish && delegationUnlocked("publish")) bulkPublish(state.delegation.publishType ?? "journal");

  // Citations: coarse steps of ten seconds each
  const steps = Math.min(2880, Math.floor(sec / 10));
  for (let i = 0; i < steps; i++) tickCitationsCoarse(100);
  invalidatePaperStats();

  const got = {
    drafts: Math.floor(state.drafts - before.drafts),
    pubs: state.publications - before.pubs,
    cites: calcTotalCitations() - before.cites,
    funds: Math.round((state.lab?.funds ?? 0) - before.funds),
    money: Math.round((state.money ?? 0) - before.money),
    books: Object.keys(state.reading?.done ?? {}).length - before.books
  };
  const hrs = away / 3600;
  const span = hrs >= 1 ? `${hrs.toFixed(1)} hours` : `${Math.round(away / 60)} minutes`;
  const bits = [];
  if (got.drafts > 0) bits.push(`${fmtBig(got.drafts)} drafts got written`);
  if (got.pubs > 0)   bits.push(`${fmtBig(got.pubs)} paper${got.pubs === 1 ? "" : "s"} came out`);
  if (got.cites > 0)  bits.push(`you picked up ${fmtBig(got.cites)} citation${got.cites === 1 ? "" : "s"}`);
  if (got.books > 0)  bits.push(`you finished ${got.books === 1 ? "a book" : `${got.books} books`}`);
  if (got.money > 0)  bits.push(`$${fmtBig(got.money)} in salary arrived`);
  const body = bits.length
    ? `While you were away (${span}): ${bits.join(", ")}. You come back rested.`
    : `You were away for ${span}. Nothing happened, which is its own kind of rest.`;
  pushNews(body);
  if (away >= 600 && typeof showNote === "function" && bits.length) {
    setTimeout(() => showNote({ title: "While you were away", body, ok: "Back to work" }), 50);
  }
  return got;
}

// Like tickCitations, but each step stands in for `ticks` ticks
function tickCitationsCoarse(ticks) {
  const tiers = state.papers?.tiers;
  if (!Array.isArray(tiers)) return;
  for (let t = 0; t < tiers.length; t++) {
    const hist = tiers[t];
    for (let c = hist.length - 2; c >= 0; c--) {
      const n = hist[c];
      if (!n) continue;
      const p = 1 - Math.pow(1 - citationChance(t, c), ticks);
      const moving = sampleBinomial(n, p);
      if (moving) { hist[c] -= moving; hist[c + 1] += moving; }
    }
  }
}

// =====================================================================
// PAPERS: holdings, lineage, paperwork; the obituary and memoir overlays
// =====================================================================
function rateLine(rate) {
  const bits = [];
  if (rate.drafts)    bits.push(`${fmtBig(rate.drafts)} drafts`);
  if (rate.knowledge) bits.push(`${fmtBig(rate.knowledge)} knowledge`);
  if (rate.citations) bits.push(`${fmtBig(rate.citations)} citations`);
  if (rate.funds)     bits.push(`$${fmtBig(rate.funds)} in funds`);
  return bits.length ? bits.join(", ") + " a second" : "nothing yet";
}

function renderHoldings() {
  const el = ensurePanel("panel_holdings", "Holdings", "fa-city");
  if (!el) return;
  const delegationAny = delegationUnlocked("write") || delegationUnlocked("publish");
  const show = holdingsUnlocked() || delegationAny;
  showPanel(el, show);
  if (!show) return;
  setPanelTitle(el, holdingsUnlocked() ? "Holdings" : "Delegation");

  const D = state.delegation;
  const toggles = [];
  if (delegationUnlocked("write")) toggles.push(`<label class="deleg"><input type="checkbox" data-deleg="autoWrite" ${D.autoWrite ? "checked" : ""}> Writing assistant turns spare knowledge into drafts</label>`);
  if (delegationUnlocked("publish")) {
    const types = Object.keys(window.PUB_COST ?? { journal: 1 }).filter(t => t !== "monograph");
    toggles.push(`<label class="deleg"><input type="checkbox" data-deleg="autoPublish" ${D.autoPublish ? "checked" : ""}> Lab manager submits finished drafts as</label>
      <select class="deleg-type" data-deleg-type aria-label="Kind of paper">${types.map(t => `<option value="${t}" ${D.publishType === t ? "selected" : ""}>${t} papers</option>`).join("")}</select>`);
  }

  const rows = window.HOLDINGS.filter(h => holdingVisible(h.id)).map(h => {
    const n = holdingOwned(h.id);
    const buy = canBuyHolding(h.id);
    const up = nextHoldingUpgrade(h.id);
    const upSt = canBuyHoldingUpgrade(h.id);
    const each = Object.entries(h.out).map(([k, v]) => k === "funds" ? `$${fmtBig(v)}` : `${fmtBig(v)} ${k}`).join(", ");
    const lvl = holdingUpgradeLevel(h.id);
    return `<div class="holding">
        <div class="holding-head"><i class="fa-solid ${h.icon}"></i> <strong>${h.label}</strong> <span class="holding-n">${n ? `×${n}` : ""}</span>${lvl ? `<span class="holding-lvl" title="Upgrades bought">${"✦".repeat(lvl)}</span>` : ""}</div>
        <p class="holding-blurb">${escHTML(h.blurb)}</p>
        <div class="holding-btns">
          <button type="button" data-holding-buy="${h.id}" ${buy.ok ? "" : "disabled"} title="Each makes ${escHTML(each)} a second">Buy: $${fmtBig(holdingPrice(h.id))}<small>${escHTML(each)}/s each</small></button>
          ${up && n >= up.need ? `<button type="button" data-holding-up="${h.id}" ${upSt.ok ? "" : "disabled"} title="Doubles this holding's output">${escHTML(up.label)}<small>$${fmtBig(up.price)}, ×2 output</small></button>` : ""}
        </div>
      </div>`;
  }).join("");

  setPanelBody(el, `
    ${toggles.length ? `<div class="deleg-box">${toggles.join("")}</div>` : ""}
    ${holdingsUnlocked() ? `<p class="holdings-rate">Lab funds: <strong data-live="hfunds"></strong>. Your institutions make <span data-live="hrate"></span>.</p>${rows}` : ""}`);
  setLive(el, "hrate", rateLine(holdingsRate()));
  setLive(el, "hfunds", `$${fmtBig(state.lab?.funds ?? 0)}`);
}

function renderLineage() {
  const el = ensurePanel("panel_lineage", "Lineage", "fa-tree");
  if (!el || !window.META) return;
  const M = window.META;
  const show = state.levelIndex >= 9 || M.lineage.length > 0 || M.legacy > 0;
  showPanel(el, show);
  if (!show) return;

  const tree = M.lineage.map(g => `<li><strong>${escHTML(g.name)}</strong>, generation ${g.gen}. h-index ${g.h}, ${fmtBig(g.citations)} citations. <em>${escHTML(g.ending)}</em></li>`).join("");
  const shop = window.LEGACY_UPGRADES.map(u => {
    const has = legacyHas(u.id);
    const st = canBuyLegacy(u.id);
    return `<button type="button" class="legacy-up${has ? " legacy-owned" : ""}" data-legacy="${u.id}" ${has || !st.ok ? "disabled" : ""} title="${escHTML(u.blurb)}">${has ? "✓ " : ""}${escHTML(u.label)}${has ? "" : `<small>${u.cost} Legacy</small>`}</button>`;
  }).join("");
  const preview = state.levelIndex >= 9 && !state.retired ? legacyEarned() : 0;

  setPanelBody(el, `
    <p>You are generation ${lineageGeneration()}${M.lineage.length ? `, descended from ${escHTML(M.lineage.at(-1).name)}` : ""}.${M.legacyTotal ? ` Your family has earned ${fmtBig(M.legacyTotal)} Legacy, worth +${Math.round(legacyFamilyBonus() * 100)}% knowledge and citations. <strong>${fmtBig(M.legacy)}</strong> left to spend.` : ""}</p>
    ${tree ? `<ol class="lineage-tree">${tree}</ol>` : ""}
    ${state.levelIndex >= 9 && !state.retired ? `<button type="button" class="retire-btn" data-retire="1">Retire for good<small>${fmtBig(preview)} Legacy to pass on; you can keep working afterwards</small></button>` : ""}
    ${state.retired ? `<button type="button" class="retire-btn" data-torch="1">Pass the torch</button> <button type="button" data-obit="1">Read your obituary again</button>` : ""}
    ${M.legacyTotal > 0 ? `<div class="legacy-shop">${shop}</div>` : ""}`);
}

function showObituary(obit, earned) {
  if (!obit) return;
  document.getElementById("obituary")?.remove();
  const heir = window.META?.lineage?.at(-1)?.heir;
  const wrap = document.createElement("div");
  wrap.id = "obituary";
  wrap.className = "overlay";
  wrap.setAttribute("role", "dialog");
  wrap.setAttribute("aria-label", "Obituary");
  wrap.innerHTML = `
    <article class="obit-clipping">
      <div class="obit-outlet">${escHTML(obit.outlet)}</div>
      <h2 class="obit-headline">${escHTML(obit.headline)}</h2>
      ${obit.paras.map(p => `<p>${p}</p>`).join("")}
      ${obit.epitaph ? `<p class="obit-epitaph">${escHTML(obit.epitaph)}</p>` : ""}
      <div class="obit-ending">${escHTML(obit.ending)}</div>
      ${earned != null ? `<p class="obit-legacy">${fmtBig(earned)} Legacy passes to the next generation.</p>` : ""}
      <div class="obit-btns">
        <button type="button" data-memoir="1">Read your life</button>
        ${state.retired ? `<button type="button" data-torch="1">${heir ? `Begin again as ${escHTML(heir)}` : "Begin again"}</button>` : ""}
        <button type="button" data-overlay-close="obituary">${state.retired ? "Not yet: keep working" : "Close"}</button>
      </div>
    </article>`;
  document.body.appendChild(wrap);
}

// ── Paperwork: name, field, save file, bug report, start over ──
const RECENT_ERRORS = [];
if (typeof window !== "undefined") {
  window.addEventListener("error", (e) => {
    RECENT_ERRORS.push(`${new Date().toISOString()} ${e.message ?? e.error} @ ${(e.filename ?? "?").split("/").pop()}:${e.lineno ?? "?"}`);
    if (RECENT_ERRORS.length > 10) RECENT_ERRORS.shift();
  });
}

function exportSaveText() {
  saveGame();
  return btoa(unescape(encodeURIComponent(JSON.stringify({ v: window.GAME_VERSION, state, meta: window.META }))));
}
function importSaveText(text) {
  try {
    const payload = JSON.parse(decodeURIComponent(escape(atob(String(text).trim()))));
    if (!payload?.state || typeof payload.state !== "object") return false;
    localStorage.setItem(SAVE_KEY, JSON.stringify(payload.state));
    if (payload.meta) localStorage.setItem(META_KEY, JSON.stringify(payload.meta));
    return true;
  } catch (_) { return false; }
}
function bugReportText() {
  const s = state;
  return [
    `Publish or Literally Perish ${window.GAME_VERSION}`,
    `When: ${new Date().toISOString()}`,
    `Browser: ${navigator.userAgent}`,
    `Level ${s.levelIndex}, knowledge ${Math.floor(s.knowledge)}, drafts ${Math.floor(s.drafts)}, papers ${s.publications}, h ${calcHIndex()}, citations ${calcTotalCitations()}`,
    `Played ${Math.round(playedSeconds() / 60)} minutes, generation ${lineageGeneration()}`,
    `Recent errors:`,
    ...(RECENT_ERRORS.length ? RECENT_ERRORS : ["(none)"]),
    ``,
    `What happened:`,
    ``
  ].join("\n");
}

function renderPaperwork() {
  const el = ensurePanel("panel_paperwork", "Paperwork", "fa-folder-open");
  if (!el) return;
  showPanel(el, (state.gameTicks ?? 0) > 300 || (state.levelIndex ?? 0) > 0);
  const name = (state.profile?.name ?? "").trim();
  setPanelBody(el, `
    <p class="paperwork-line"><strong>Name on your CV:</strong> ${name ? escHTML(name) : "<em>not set</em>"} <button type="button" data-paperwork="name">${name ? "Change" : "Set"}</button></p>
    <p class="paperwork-line"><strong>Your field:</strong> ${escHTML(fieldName())} <button type="button" data-paperwork="field">Rename</button></p>
    <div class="paperwork-btns">
      <button type="button" data-paperwork="export">Copy save file</button>
      <button type="button" data-paperwork="import">Load a save file</button>
      <button type="button" data-paperwork="bug">Copy a bug report</button>
      <button type="button" data-paperwork="restart">Start over</button>
    </div>
    <textarea class="paperwork-text" data-paperwork-text hidden rows="4" aria-label="Save file"></textarea>
    <p class="paperwork-note" data-paperwork-note></p>
    <p class="paperwork-version">Version ${escHTML(window.GAME_VERSION)}. The game saves itself every thirty seconds, and whenever you leave.</p>`);
}

function copyText(text, note) {
  const area = document.querySelector("[data-paperwork-text]");
  const say = (t) => { const n = document.querySelector("[data-paperwork-note]"); if (n) n.textContent = t; };
  if (area) { area.hidden = false; area.value = text; area.select(); }
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(() => say(note), () => say("Selected below. Copy it with Ctrl+C (⌘C on a Mac)."));
  else say("Selected below. Copy it with Ctrl+C (⌘C on a Mac).");
}

if (typeof document !== "undefined") {
  document.addEventListener("click", (e) => {
    const t = e.target.closest("button, input[type=checkbox]");
    if (!t || t.disabled) return;
    const d = t.dataset;
    if (d.holdingBuy)  { buyHolding(d.holdingBuy); render(); return; }
    if (d.holdingUp)   { buyHoldingUpgrade(d.holdingUp); render(); return; }
    if (d.deleg)       { state.delegation[d.deleg] = t.checked; return; }
    if (d.legacy)      { buyLegacy(d.legacy); render(); return; }
    if (d.memoir)      { showMemoir(); return; }
    if (d.overlayClose){ document.getElementById(d.overlayClose)?.remove(); return; }
    if (d.retire && !(state.profile?.name ?? "").trim()) {
      askText({ title: "The obituary needs a name", body: "Your CV never had one. What should the obituary (and your descendants) call you?", value: inventName(), maxLength: 40, yes: "That's me" },
        (n) => { const t = String(n ?? "").trim(); if (!t) return "Everyone needs a name. Even emeriti."; state.profile.name = t.slice(0, 40); setTimeout(() => t && document.querySelector("[data-retire]")?.click(), 0); return null; });
      return;
    }
    if (d.retire) {
      askConfirm({ title: "Retire for good?", body: "You'll read your obituary, and you can begin again as one of your students. You can also keep working afterwards; nobody can make you leave.", yes: "Retire" }, () => {
        const res = retire();
        if (res) showObituary(res.obit, res.earned);
        render();
      });
      return;
    }
    if (d.obit) { showObituary(state.lastObituary, null); return; }
    if (d.torch) {
      askConfirm({ title: "Begin a new career?", body: "This one is over. Your Legacy and your lineage carry on.", yes: "Begin again", danger: true }, () => {
        document.getElementById("obituary")?.remove();
        passTheTorch(); render();
      });
      return;
    }
    if (d.paperwork === "name") {
      askText({ title: "Your name", body: "What name should your CV (and, one day, your obituary) use?", value: state.profile.name ?? "", maxLength: 40 },
        (n) => { state.profile.name = String(n).trim().slice(0, 40); render(); return null; });
      return;
    }
    if (d.paperwork === "field") {
      askText({ title: "Your field", body: "What's your field called? Leave it blank to use your major.", value: state.profile.field ?? "", maxLength: 40 },
        (f) => { state.profile.field = String(f).trim().slice(0, 40); render(); return null; });
      return;
    }
    if (d.paperwork === "export") { copyText(exportSaveText(), "Save file copied. Keep it somewhere safe."); return; }
    if (d.paperwork === "bug")    { copyText(bugReportText(), "Bug report copied. Paste it wherever you're sending feedback."); return; }
    if (d.paperwork === "import") {
      askText({ title: "Load a save file", body: "Paste a save file. This replaces your current game.", multiline: true, yes: "Load it" }, (text) => {
        if (!String(text).trim()) return "Paste something first.";
        if (!importSaveText(text)) return "That doesn't look like a save file from this game.";
        if (tickInterval) clearInterval(tickInterval);
        window.__importing = true;
        location.reload();
        return null;
      });
      return;
    }
    if (d.paperwork === "restart") {
      askConfirm({ title: "Start over?", body: "This deletes this career and starts again in high school. Your lineage and Legacy are kept.", yes: "Start over", danger: true }, () => {
        resetGame(); applyLegacyAtStart(); rebuildModifiers(); saveGame(); render();
      });
    }
  });
  document.addEventListener("change", (e) => {
    const sel = e.target.closest?.("select[data-deleg-type]");
    if (sel) state.delegation.publishType = sel.value;
  });
}

// Browsers barely run a background tab's timer, so catch up on return
let HIDDEN_AT = null, HIDDEN_TICKS = 0;
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") { HIDDEN_AT = Date.now(); HIDDEN_TICKS = state.gameTicks ?? 0; return; }
    if (HIDDEN_AT == null) return;
    const ranSec  = ((state.gameTicks ?? 0) - HIDDEN_TICKS) * TICK_MS / 1000;
    const awaySec = (Date.now() - HIDDEN_AT) / 1000 - ranSec;
    HIDDEN_AT = null;
    if (awaySec >= 60) { applyOfflineProgress(Date.now(), Date.now() - awaySec * 1000); render(); }
  });
}

// ── Wiring ────────────────────────────────────────────────────────────
onHook("tick", () => { produceHoldings(); tickSeason(); });
// Debt free: the last payment goes through
function checkDebtFree() {
  const c = state.counters;
  const debt = state.debt ?? 0;
  if (debt > 0.5) { c.hadDebt = true; return; }
  if (!c.hadDebt) return;
  c.hadDebt = false;
  c.debtPaid = (c.debtPaid ?? 0) + 1;
  pushNews("Your last loan payment goes through. The servicer sends a form letter of congratulations with your name spelled wrong. You frame it.");
  storyLog("Paid off the student loans.", "life");
}
onHook("second", checkDebtFree);
onHook("load", checkDebtFree);
onHook("action", (id) => { if (id === "pay_debt") checkDebtFree(); });
onHook("second", tickDelegation);
onHook("modifiers", (m) => { applyLegacyModifiers(m); applySeasonModifiers(m); });
onHook("advisorStartFavor", (f) => f + (legacyHas("name_recognition") ? 15 : 0));
onHook("serendipityRate", (r) => r * (legacyHas("serendipity_gene") ? 1.3 : 1));
onHook("render", () => { renderHoldings(); renderScrapbook(); renderLineage(); renderPaperwork(); });
onHook("load", (loaded) => {
  if (!state.generation || state.generation < 1) state.generation = lineageGeneration();
  state.landmarkLastProgressAt = Date.now();      // the decay grace period starts when you sit back down
  if (loaded) applyOfflineProgress();
  else applyLegacyAtStart();
});
