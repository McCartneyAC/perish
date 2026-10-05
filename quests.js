// quests.js — the inbox, the stories that arrive in it, and landmarks as quests
//
// THE INBOX. Anything that wants a decision from you arrives as mail: your
// advisor, your students, editors, chairs, strangers with opinions about
// Figure 3. Each piece of mail has buttons. Some have a deadline; ignore it
// and the sender decides for you.
//
// Mail is plain data in state.inbox (it has to survive a save), so each one
// names a SOURCE whose handler knows what its buttons do. advisor.js
// registers "advisor" and "student"; this file registers "saga" and "notice".
//
// SAGAS. Multi-step stories with choices. A saga is a small state machine:
// stages, each a letter with choices. A choice applies effects, writes a line
// to your story, and ends the saga, moves to another stage, or waits a while
// first (the reviews take time to come back). Choices leave flags; later
// sagas read them. Fabricate data in your PhD and a blogger may find Figure 3
// when you're up for tenure.
//
// LANDMARKS AS QUESTS. Every thesis, dissertation and opus gets a working
// title in your field's dialect (retitle it whenever you like), and each
// phase can open a saga: quals, the defense, the job talk, the department
// vote. Those choices add up to a grade on your CV. A finished landmark
// waits for its defense: you have to show up.
//
// THE STORY. state.story holds what the game remembers about the kind of
// academic you've been: integrity and meaning (never shown until the end),
// flags, a rival, permanent effects from choices, and the log the scrapbook
// and the obituary read from.
//
// Time here is PLAYED time (state.gameTicks), so deadlines don't expire
// while the tab is closed.

"use strict";

Object.assign(DEFAULT_STATE, {
  inbox: [],
  mailSeq: 0,
  inboxStats: { answered: 0, expired: 0, zeroes: 0 },
  sagas: {
    active:  {},            // id → { stage, data, startedAt }
    waiting: [],            // [{ id, stage, at }]
    done:    {},            // id → how it ended
    count:   {},            // id → times started
    nextAt:  900            // gameTicks when the next random saga may start
  },
  story: {
    integrity: 70,          // 0–100, hidden
    meaning:   30,          // 0–100, hidden
    flags:     {},
    perm:      {},          // permanent modifier multipliers earned in stories
    rival:     null,        // { name, relation −100..100 }
    erdos:     null,        // your Erdős number, once you have a collaborator who has one
    service:   0,
    log:       []           // [{ t, level, text, kind }] — the scrapbook and obituary
  },
  landmarkScore: 0          // what this landmark's moments have added up to so far
});

const INBOX_MAX       = 8;
const SAGA_GAP_TICKS  = [1100, 2200];    // 110–220 s of play between random stories
const SAGA_MAX_ACTIVE = 2;

// ── Time ──────────────────────────────────────────────────────────────
function playedSeconds() { return (state.gameTicks ?? 0) * (window.TICK_MS ?? 100) / 1000; }
function ticksFromSeconds(sec) { return Math.round(sec * 1000 / (window.TICK_MS ?? 100)); }

// ── Mail ──────────────────────────────────────────────────────────────
// handler: { choose(mail, index) → outcome text, expire(mail) → text, canChoose?(mail, index) }
const MAIL_SOURCES = {};
function registerMailSource(name, handler) { MAIL_SOURCES[name] = handler; }

// data: { from, subject, body, choices: [{ label, hint?, cost? }], dueIn? (s), kind?, key? }
function sendMail(source, data) {
  state.inbox = state.inbox ?? [];
  if (data.key && state.inbox.some(m => m.source === source && m.key === data.key)) return null;
  if (state.inbox.length >= INBOX_MAX) {
    const idx = state.inbox.findIndex(m => !m.choices?.length);   // a full inbox drops a notice first
    if (idx === -1) return null;
    state.inbox.splice(idx, 1);
  }
  const mail = Object.assign({
    uid: ++state.mailSeq, source, from: "Unknown", subject: "(no subject)", body: "",
    choices: [], kind: source, sentAt: state.gameTicks ?? 0, dueAt: null, read: false
  }, data);
  if (data.dueIn) mail.dueAt = (state.gameTicks ?? 0) + ticksFromSeconds(data.dueIn);
  delete mail.dueIn;
  state.inbox.push(mail);
  runHooks("mail", mail);
  return mail;
}

function findMail(uid) { return (state.inbox ?? []).find(m => m.uid === uid) ?? null; }
function removeMail(uid) { state.inbox = (state.inbox ?? []).filter(m => m.uid !== uid); }
function markMailRead(uid) { const m = findMail(uid); if (m) m.read = true; }

function canAffordCost(cost) {
  if (!cost) return { ok: true, reason: "" };
  if (cost.energy    && (state.energy    ?? 0) < cost.energy)    return { ok: false, reason: `Needs ${cost.energy} energy` };
  if (cost.knowledge && (state.knowledge ?? 0) < cost.knowledge) return { ok: false, reason: `Needs ${fmtBig(cost.knowledge)} knowledge` };
  if (cost.drafts    && (state.drafts    ?? 0) < cost.drafts)    return { ok: false, reason: `Needs ${fmtBig(cost.drafts)} drafts` };
  if (cost.money     && !canPay(cost.money))                     return { ok: false, reason: `Needs $${fmtBig(outOfPocket(cost.money))}` };
  if (cost.funds     && (state.lab?.funds ?? 0) < cost.funds)    return { ok: false, reason: `Needs $${fmtBig(cost.funds)} in lab funds` };
  return { ok: true, reason: "" };
}

function payCost(cost) {
  if (!cost) return true;
  if (!canAffordCost(cost).ok) return false;
  if (cost.energy) { if (inCooldown()) return false; spendEnergy(cost.energy); }
  if (cost.knowledge) state.knowledge -= cost.knowledge;
  if (cost.drafts)    state.drafts    -= cost.drafts;
  if (cost.money)     pay(cost.money);
  if (cost.funds)     state.lab.funds -= cost.funds;
  return true;
}

function mailChoiceStatus(mail, index) {
  const choice = mail.choices?.[index];
  if (!choice) return { ok: false, reason: "" };
  if (choice.cost?.energy && inCooldown()) return { ok: false, reason: "Burned out" };
  const afford = canAffordCost(choice.cost);
  if (!afford.ok) return afford;
  return MAIL_SOURCES[mail.source]?.canChoose?.(mail, index) ?? { ok: true, reason: "" };
}

function answerMail(uid, index) {
  const mail = findMail(uid);
  if (!mail) return false;
  const handler = MAIL_SOURCES[mail.source];
  if (!handler) { removeMail(uid); return false; }
  if (mail.choices?.length) {
    if (!mailChoiceStatus(mail, index).ok) return false;
    if (!payCost(mail.choices[index].cost)) return false;
  }
  removeMail(uid);
  const out = handler.choose?.(mail, index);
  if (out) pushNews(out);
  state.inboxStats.answered = (state.inboxStats.answered ?? 0) + 1;
  if (!state.inbox.length) state.inboxStats.zeroes = (state.inboxStats.zeroes ?? 0) + 1;
  runHooks("mailAnswered", mail, index);
  rebuildModifiers();
  tryLevelUp();
  maybeCompleteLandmark();
  return true;
}

// A notice (no choices) is read and filed
function dismissMail(uid) {
  const mail = findMail(uid);
  if (!mail || mail.choices?.length) return false;
  removeMail(uid);
  MAIL_SOURCES[mail.source]?.choose?.(mail, -1);
  return true;
}

function tickInbox() {
  const now = state.gameTicks ?? 0;
  const overdue = (state.inbox ?? []).filter(m => m.dueAt != null && now >= m.dueAt);
  for (const mail of overdue) {
    removeMail(mail.uid);
    state.inboxStats.expired = (state.inboxStats.expired ?? 0) + 1;
    const out = MAIL_SOURCES[mail.source]?.expire?.(mail);
    if (out) pushNews(out);
  }
  if (overdue.length) { rebuildModifiers(); maybeCompleteLandmark(); }
}

function mailSecondsLeft(mail) {
  if (mail.dueAt == null) return null;
  return Math.max(0, Math.ceil((mail.dueAt - (state.gameTicks ?? 0)) * (window.TICK_MS ?? 100) / 1000));
}

registerMailSource("notice", { choose: () => null, expire: () => null });
function sendNotice(from, subject, body, extra = {}) {
  return sendMail("notice", Object.assign({ from, subject, body, choices: [] }, extra));
}

// ── Story effects ─────────────────────────────────────────────────────
// One small vocabulary for every consequence in sagas, advisor events,
// serendipity and milestones, so content stays data:
//   energy knowledge drafts money funds      add (negative money is a payment)
//   prestige citations                        university prestige; citations on your papers
//   network resilience ambition reputation   identity
//   traits: { neuroticism: +2 }               trait nudges
//   integrity meaning                         the hidden ledger
//   favor rival morale                        your advisor; your rival's opinion; your students
//   flag: "x" | ["x","y"]                     remembered for later stories
//   perm: { citationMult: 1.05 }              permanent multipliers
//   pubs, pubTier: "low"|"mid"|"high"         papers on your CV (negative: retractions)
//   landmark: 0.1                             share of the active landmark (±)
//   score: 3                                  this landmark's grade
//   buff: "id"                                a temporary effect (delights.js)
//   erdos: 3                                  you now have this Erdős number (if lower)
//   log: "text"                               a line for the scrapbook
function applyStoryEffects(fx) {
  if (!fx) return;
  const st = state.story;
  if (fx.energy)    state.energy = clamp((state.energy ?? 0) + fx.energy, 0, maxEnergy());
  if (fx.knowledge) state.knowledge = Math.max(0, (state.knowledge ?? 0) + fx.knowledge);
  if (fx.drafts) {
    state.drafts = Math.max(0, (state.drafts ?? 0) + fx.drafts);
    if (fx.drafts > 0) { state.totalDraftsEver += fx.drafts; onDraftsGained(fx.drafts); }
  }
  if (fx.money)    { if (fx.money < 0) pay(-fx.money); else state.money = (state.money ?? 0) + fx.money; }
  if (fx.funds)    state.lab.funds = (state.lab?.funds ?? 0) + fx.funds;
  if (fx.prestige) addPrestige(fx.prestige);
  for (const k of ["network", "resilience", "ambition", "reputation"]) {
    if (fx[k]) state.identity[k] = (state.identity[k] ?? 0) + fx[k];
  }
  if (fx.traits) {
    for (const [t, d] of Object.entries(fx.traits)) {
      if (typeof state.traits?.[t] === "number") state.traits[t] = clamp(state.traits[t] + d, 0, 100);
    }
  }
  if (fx.integrity) st.integrity = clamp((st.integrity ?? 70) + fx.integrity, 0, 100);
  if (fx.meaning) {
    // A meaningful life gets harder to add to the more of it you have
    const m = st.meaning ?? 30;
    const d = fx.meaning > 0 ? fx.meaning * Math.max(0.15, 1 - m / 110) : fx.meaning;
    st.meaning = clamp(m + d, 0, 100);
  }
  if (fx.favor && typeof adjustFavor === "function") adjustFavor(fx.favor);
  if (fx.rival) { ensureRival(); st.rival.relation = clamp((st.rival.relation ?? 0) + fx.rival, -100, 100); }
  if (fx.morale) adjustAllMorale(fx.morale);
  if (fx.flag) for (const f of [].concat(fx.flag)) st.flags[f] = (st.flags[f] ?? 0) + 1;
  if (fx.perm) for (const [k, mult] of Object.entries(fx.perm)) st.perm[k] = (st.perm[k] ?? 1) * mult;
  if (fx.pubs) addStoryPapers(fx.pubs, fx.pubTier ?? "low");
  if (fx.citations) addCitations(fx.citations);
  if (fx.landmark) { const def = activeLandmarkDef(); if (def) addLandmarkProgress(fx.landmark * def.totalProgress); }
  if (fx.score) state.landmarkScore = (state.landmarkScore ?? 0) + fx.score;
  if (fx.buff && typeof addBuff === "function") addBuff(fx.buff);
  if (fx.erdos) st.erdos = st.erdos == null ? fx.erdos : Math.min(st.erdos, fx.erdos);
  if (fx.log) storyLog(fx.log);
}

// The scrapbook: a line about your life, filed under the stage you were in
function storyLog(text, kind = "story") {
  if (!text) return;
  const log = state.story.log = state.story.log ?? [];
  log.push({ t: state.gameTicks ?? 0, level: state.levelIndex, text, kind });
  if (log.length > 400) log.splice(0, log.length - 400);
}
function storyFlag(name) { return (state.story?.flags?.[name] ?? 0) > 0; }

function applyStoryModifiers(m) {
  for (const [k, mult] of Object.entries(state.story?.perm ?? {})) {
    if (typeof m[k] === "number") m[k] *= mult;
  }
}

// ── The rival ─────────────────────────────────────────────────────────
const RIVAL_FIRST = ["Brennan", "Ines", "Torvald", "Marguerite", "Desmond", "Saskia", "Felix", "Anouk",
                     "Rupert", "Ottilie", "Caspian", "Linnea", "Hugo", "Philippa", "Lorcan", "Delphine"];
const RIVAL_LAST  = ["Holt", "Achterberg", "Vance", "Okonkwo-Reyes", "Lindqvist", "Marchetti", "Szabo",
                     "Penhaligon", "Abernathy", "Kowalczyk", "Ferreira", "Strand", "Whitlock", "Desrosiers"];

function ensureRival() {
  if (state.story.rival) return state.story.rival;
  state.story.rival = { name: `${pickOne(RIVAL_FIRST)} ${pickOne(RIVAL_LAST)}`, relation: 0 };
  return state.story.rival;
}

// Placeholders: {rival} {advisor} {oldAdvisor} {student} {city} {topic}
// {committee} {title} {field} {uni} {name}
function storyText(str, q) {
  if (typeof str === "function") str = str(state, q);
  return String(str ?? "")
    .replace(/\{rival\}/g,      () => ensureRival().name)
    .replace(/\{advisor\}/g,    () => state.advisor?.name ?? "your advisor")
    .replace(/\{oldAdvisor\}/g, () => q?.data?.oldAdvisor ?? (typeof oldAdvisorName === "function" ? oldAdvisorName() : null) ?? "your old advisor")
    .replace(/\{student\}/g,    () => q?.data?.student ?? pickLabStudentName() ?? "one of your students")
    .replace(/\{city\}/g,       () => q?.data?.city ?? "Schaumburg, Illinois")
    .replace(/\{topic\}/g,      () => q?.data?.topic ?? "methodology")
    .replace(/\{committee\}/g,  () => q?.data?.committee ?? "Curriculum Committee")
    .replace(/\{title\}/g,      () => state.workingTitles?.[state.activeLandmark] ?? "your thesis")
    .replace(/\{field\}/g,      () => (typeof fieldName === "function" ? fieldName() : "your field").toLowerCase())
    .replace(/\{uni\}/g,        () => state.cv?.universityName ?? "the university")
    .replace(/\{name\}/g,       () => (state.profile?.name || "you"));
}

// ── Saga engine ───────────────────────────────────────────────────────
// A choice may carry `chance: { p, win, lose }`; p is a number or (s, q) → number.
// `req(s, q)` greys a choice out; `showIf(s, q)` hides it; `holds` (on the
// saga) keeps a landmark from finishing until the saga is answered.
function sagaEligible(id, saga) {
  const S = state.sagas;
  if (S.active[id]) return false;
  if (saga.once !== false && S.done[id] !== undefined) return false;
  if (saga.max && (S.count[id] ?? 0) >= saga.max) return false;
  const [lo, hi] = saga.levels ?? [0, 9];
  if (state.levelIndex < lo || state.levelIndex > hi) return false;
  if (saga.when && !saga.when(state)) return false;
  return true;
}

function startSaga(id, data = {}) {
  const saga = window.SAGAS?.[id];
  if (!saga || state.sagas.active[id]) return false;
  const q = { stage: saga.start ?? "start", data: Object.assign({}, data), startedAt: state.gameTicks ?? 0 };
  if (saga.setup) saga.setup(state, q);
  state.sagas.active[id] = q;
  state.sagas.count[id] = (state.sagas.count[id] ?? 0) + 1;
  sendSagaStage(id);
  return true;
}

function sendSagaStage(id) {
  const saga = window.SAGAS?.[id];
  const q = state.sagas.active[id];
  if (!saga || !q) return;
  const stage = saga.stages[q.stage];
  if (!stage) { endSaga(id, "missing"); return; }
  const visible = (stage.choices ?? []).map((c, i) => ({ c, i })).filter(({ c }) => !c.showIf || c.showIf(state, q));
  sendMail("saga", {
    key: `${id}:${q.stage}`, saga: id, stage: q.stage,
    from:    storyText(stage.from ?? saga.from, q),
    subject: storyText(stage.subject ?? saga.title, q),
    body:    storyText(stage.body, q),
    choices: visible.map(({ c, i }) => ({ label: storyText(c.label, q), hint: c.hint ? storyText(c.hint, q) : "", cost: c.cost ?? null, ref: i })),
    dueIn:   stage.timeout?.seconds ?? null,
    kind:    saga.kind ?? "saga"
  });
}

function endSaga(id, how) {
  delete state.sagas.active[id];
  state.sagas.done[id] = how ?? "done";
  state.inbox = (state.inbox ?? []).filter(m => !(m.source === "saga" && m.saga === id));
}

function resolveSagaChoice(id, refIndex) {
  const saga = window.SAGAS?.[id];
  const q = state.sagas.active[id];
  if (!saga || !q) return null;
  let choice = saga.stages[q.stage]?.choices?.[refIndex];
  if (!choice) { endSaga(id, "lost"); return null; }
  if (choice.chance) {
    const p = typeof choice.chance.p === "function" ? choice.chance.p(state, q) : choice.chance.p;
    choice = Object.assign({}, choice, Math.random() < p ? choice.chance.win : choice.chance.lose, { chance: null });
  }
  applyStoryEffects(typeof choice.fx === "function" ? choice.fx(state, q) : choice.fx);
  if (choice.run) choice.run(state, q);
  const outcome = choice.outcome ? storyText(choice.outcome, q) : null;
  if (outcome && choice.remember !== false && saga.remember !== false) storyLog(outcome, saga.kind ?? "story");
  if (choice.go) {
    q.stage = choice.go;
    if (choice.wait) state.sagas.waiting.push({ id, stage: choice.go, at: (state.gameTicks ?? 0) + ticksFromSeconds(choice.wait) });
    else sendSagaStage(id);
  } else {
    endSaga(id, choice.key ?? `choice${refIndex}`);
  }
  return outcome;
}

registerMailSource("saga", {
  choose(mail, index) { return resolveSagaChoice(mail.saga, mail.choices?.[index]?.ref ?? index); },
  canChoose(mail, index) {
    const saga = window.SAGAS?.[mail.saga];
    const q = state.sagas.active[mail.saga];
    const c = saga?.stages?.[mail.stage]?.choices?.[mail.choices?.[index]?.ref ?? index];
    if (!c || !q) return { ok: false, reason: "" };
    return c.req ? c.req(state, q) : { ok: true, reason: "" };
  },
  expire(mail) {
    const stage = window.SAGAS?.[mail.saga]?.stages?.[mail.stage];
    const fallback = stage?.timeout?.choice;
    if (fallback === undefined) { endSaga(mail.saga, "ignored"); return null; }
    return resolveSagaChoice(mail.saga, fallback);
  }
});

function tickSagas() {
  const S = state.sagas;
  const now = state.gameTicks ?? 0;
  if (S.waiting.length) {
    const due = S.waiting.filter(w => now >= w.at);
    S.waiting = S.waiting.filter(w => now < w.at);
    for (const w of due) if (S.active[w.id]) sendSagaStage(w.id);
  }
  if (now < (S.nextAt ?? 0)) return;
  S.nextAt = now + randInt(SAGA_GAP_TICKS[0], SAGA_GAP_TICKS[1]);
  if (Object.keys(S.active).filter(id => !window.SAGAS?.[id]?.trigger).length >= SAGA_MAX_ACTIVE) return;
  if (inCooldown()) return;
  const pool = Object.entries(window.SAGAS ?? {})
    .filter(([id, sg]) => !sg.trigger && sagaEligible(id, sg))
    .map(([id, sg]) => ({ id, w: typeof sg.weight === "function" ? sg.weight(state) : (sg.weight ?? 1) }))
    .filter(x => x.w > 0);
  if (!pool.length) return;
  startSaga(pool[weightedIndex(pool.map(x => x.w))].id);
}

// Sagas that wait for an event (saga.trigger names it, e.g. "phase:dissertation:defense")
function triggerSagas(event, data) {
  for (const [id, sg] of Object.entries(window.SAGAS ?? {})) {
    if (sg.trigger !== event || !sagaEligible(id, sg)) continue;
    const p = typeof sg.chance === "function" ? sg.chance(state, data) : (sg.chance ?? 1);
    if (Math.random() < p) startSaga(id, data);
  }
}

// =====================================================================
// LANDMARKS AS QUESTS: working titles, grades, defenses that wait
// =====================================================================

// Working titles in each field's dialect. {A}/{B} pick from the banks below.
window.WORKING_TITLES = {
  stem: {
    templates: ["{Process} of {thing} in {organism}", "A {adj} role for {thing} in {process}", "{Thing} regulates {thing2} under {condition}",
                "Temperature-dependent {process} in {organism}: {adj} evidence", "Toward a mechanistic account of {process}"],
    process:  ["folding", "signaling", "migration", "decay", "self-assembly", "dormancy", "uptake", "phase separation"],
    thing:    ["a heat-shock protein", "mitochondrial calcium", "a non-coding RNA", "biofilm matrix", "the gut microbiome", "a misfolded enzyme", "dark matter halos", "nitrogen flux"],
    thing2:   ["circadian rhythm", "wing size", "neuronal pruning", "soil respiration", "star formation"],
    organism: ["zebrafish", "Drosophila", "a cave-dwelling salamander", "Arabidopsis", "lab mice who deserved better", "a single very cooperative yeast strain"],
    condition:["drought", "low oxygen", "mild social stress", "reviewer pressure", "microgravity"],
    adj:      ["previously unrecognized", "surprising", "context-dependent", "conserved", "modest but significant"]
  },
  humanities: {
    templates: ["{Gerund} the {noun}: {topic} in {period} {place}", "The {noun} and its discontents: {topic}, {years}", "Reading {author} against the grain",
                "{Noun}s of {topic} in {period} {place}", "Haunted {noun}s: {topic} and the archive"],
    gerund: ["Unreading", "Rethinking", "Haunting", "Inhabiting", "Translating", "Mourning"],
    noun:   ["archive", "margin", "footnote", "household", "silence", "ledger", "garden", "map"],
    topic:  ["grief", "debt", "letter-writing", "domestic labor", "piety", "the novel", "illness", "weather"],
    period: ["early modern", "Victorian", "late medieval", "interwar", "post-Soviet", "Restoration"],
    place:  ["Lisbon", "Kyiv", "the Scottish Borders", "Bengal", "Antwerp", "the Hudson Valley"],
    years:  ["1580–1660", "1847–1901", "1919–1939", "1660–1688"],
    author: ["Milton", "George Eliot", "Woolf", "Lesya Ukrainka", "Montaigne", "Henry James"]
  },
  social_science: {
    templates: ["{Verb} {concept}: evidence from {sample}", "Who {action}? {concept} and {outcome} in {sample}", "The {concept} paradox: {outcome} among {group}",
                "{Concept} at the margins: a mixed-methods study of {group}", "When {concept} meets {concept2}: {outcome} in {sample}"],
    verb:    ["Contesting", "Measuring", "Reproducing", "Negotiating", "Explaining"],
    concept: ["inequality", "trust", "precarity", "social capital", "civic participation", "status anxiety", "institutional memory"],
    concept2:["the state", "the market", "the family", "the algorithm"],
    sample:  ["three Midwestern counties", "a panel of 4,000 households", "twelve school districts", "the 2019 census microdata", "a very patient Facebook group"],
    action:  ["gets ahead", "votes", "moves away", "stays", "volunteers"],
    outcome: ["mobility", "turnout", "wellbeing", "segregation", "trust in institutions"],
    group:   ["adjunct faculty", "rural teachers", "first-generation students", "gig workers", "retired dentists"]
  },
  engineering: {
    templates: ["A {adj} framework for {task} in {system}", "{Thing}: {task} at scale", "Toward {adj} {task} with {method}",
                "Fault-tolerant {task} for {system}", "{Method} for real-time {task}"],
    adj:    ["robust", "lightweight", "provably correct", "energy-aware", "self-healing", "mostly working"],
    task:   ["scheduling", "localization", "compression", "anomaly detection", "load balancing", "path planning"],
    system: ["edge devices", "swarm robotics", "the power grid", "legacy COBOL", "autonomous vehicles", "a very old bridge"],
    thing:  ["MOTHBALL", "SPARROW", "Gizmo-7", "LATTICE", "OBELISK"],
    method: ["graph neural networks", "convex relaxation", "a lookup table, honestly", "Kalman filtering", "reinforcement learning"]
  },
  business_econ: {
    templates: ["{Thing} and {thing2}: evidence from {data}", "The hidden cost of {thing}", "Do {actors} {verb}? Evidence from {data}",
                "{Thing} under uncertainty: a structural approach", "Nudging {actors}: a field experiment"],
    thing:  ["minimum wages", "remote work", "loyalty programs", "credit scores", "pricing algorithms", "franchise fees"],
    thing2: ["firm survival", "worker mobility", "household debt", "market concentration"],
    data:   ["Danish registry data", "a natural experiment in Ohio", "4 million grocery receipts", "the gig economy", "scanner data"],
    actors: ["firms", "consumers", "central banks", "CEOs", "retirees"],
    verb:   ["learn", "collude", "overreact", "procrastinate"]
  },
  fine_arts: {
    templates: ["{Noun}, {noun2}, {noun3}: a practice-based inquiry", "Studies for an unbuilt {noun}", "On {gerund}: {noun}s, {year}–present",
                "The weight of {noun}: works on paper", "{Gerund} in public: a portfolio"],
    noun:   ["salt", "window", "chair", "thread", "ruin", "orchard", "mirror"],
    noun2:  ["grief", "light", "water", "rust"],
    noun3:  ["return", "silence", "noise", "repair"],
    gerund: ["Mending", "Waiting", "Erasing", "Walking", "Listening"],
    year:   ["2019", "2021", "2023"]
  }
};

window.LANDMARK_GRADES = {
  masters_thesis:    ["Passed with distinction", "Passed", "Passed with revisions", "Passed, eventually"],
  dissertation:      ["Passed with no revisions (a myth)", "Minor revisions", "Major revisions", "Passed, eventually"],
  first_monograph:   ["A classic", "Well reviewed", "Reviewed", "Remaindered"],
  job_market:        ["Multiple offers", "One offer", "One offer, after the first choice said no", "A visiting position (renewable)"],
  tenure_review:     ["Unanimous", "Granted", "Granted, narrowly", "Granted on appeal"],
  habilitation_opus: ["An instant classic", "Well received", "Reviewed, eventually", "Remaindered"]
};
const GRADE_CUTS = [8, 2, -4];          // score ≥ 8 → best grade; ≥ 2; ≥ −4; worse
const GRADE_PRESTIGE = [3, 1, 0, -2];

function fillTitle(dialect) {
  const T = window.WORKING_TITLES[dialect];
  if (!T) return gen_landmark_title();
  const tpl = pickOne(T.templates);
  return tpl.replace(/\{(\w+)\}/g, (_, key) => {
    const bank = T[key.toLowerCase()] ?? T[key];
    if (!Array.isArray(bank)) return key;
    const word = pickOne(bank);
    return key[0] === key[0].toUpperCase() ? word.charAt(0).toUpperCase() + word.slice(1) : word;
  }).replace(/^./, c => c.toUpperCase());
}

function workingTitleFor(landmarkId) {
  const dialect = state.affiliations?.major ?? null;
  const t = fillTitle(dialect);
  if (landmarkId === "habilitation_opus") return pickOne([`${t}`, `The Long Argument: ${t.charAt(0).toLowerCase() + t.slice(1)}`, `${t}, Reconsidered`]);
  if (landmarkId === "job_market") return null;     // the market doesn't get a title, it gets a cover letter
  if (landmarkId === "tenure_review") return null;
  return t;
}

function retitleLandmark(landmarkId, title) {
  const t = String(title ?? "").trim().slice(0, 140);
  if (!t) return false;
  state.workingTitles = state.workingTitles ?? {};
  state.workingTitles[landmarkId] = t;
  state.counters.retitles = (state.counters.retitles ?? 0) + 1;
  pushNews(pickOne([
    `New working title: "${t}". Your committee will want a colon.`,
    `Retitled: "${t}". It's better. It's definitely better. You'll change it again by Friday.`,
    `"${t}." You say it out loud in the shower. It sounds like a real book.`
  ]));
  return true;
}

// The grade: what the moments added up to, plus your advisor and your work
function gradeLandmark(def, artifact) {
  const grades = window.LANDMARK_GRADES[def.id];
  if (!grades) { state.landmarkScore = 0; return; }
  let score = state.landmarkScore ?? 0;
  if (state.advisor && state.advisor.archetype !== "ghost") score += (state.advisor.favor - 50) / 10;
  score += (computePaperQuality() - 60) / 12;
  const i = score >= GRADE_CUTS[0] ? 0 : score >= GRADE_CUTS[1] ? 1 : score >= GRADE_CUTS[2] ? 2 : 3;
  artifact.grade = grades[i];
  artifact.gradeIndex = i;
  if (GRADE_PRESTIGE[i]) addPrestige(GRADE_PRESTIGE[i]);
  state.landmarkScore = 0;
}

// The tenure clock stops while a tenure decision is in your inbox
onHook("tenureClockPaused", (paused) => paused || landmarkHeldBySaga(false, { id: "tenure_review" }));
// A denial sends the whole case back to the start, stories included
onHook("tenureDenied", () => {
  for (const [id, sg] of Object.entries(window.SAGAS ?? {})) {
    if (!sg.trigger?.startsWith("phase:tenure_review:")) continue;
    if (state.sagas.active[id]) endSaga(id, "denied");
    delete state.sagas.done[id];
  }
  state.landmarkScore = 0;
});

// What the committee would say if it met today (no dice): 0 best .. 3 worst
function projectedGradeIndex() {
  let score = state.landmarkScore ?? 0;
  if (state.advisor && state.advisor.archetype !== "ghost") score += (state.advisor.favor - 50) / 10;
  score += (computePaperQuality() - 60) / 12;
  return score >= GRADE_CUTS[0] ? 0 : score >= GRADE_CUTS[1] ? 1 : score >= GRADE_CUTS[2] ? 2 : 3;
}
const COMMITTEE_MOODS = ["delighted", "pleased", "polite", "worried"];

// Why a finished landmark is waiting (shown on the landmark bar)
function landmarkHoldReason(def) { return foldHooks("landmarkHoldReason", null, def); }
onHook("landmarkHoldReason", (why, def) => why ?? (landmarkHeldBySaga(false, def) ? "Finished. Now you have to show up for it: check your inbox." : null));

// A landmark waits while any saga that holds it is still open
function landmarkHeldBySaga(held, def) {
  if (held) return held;
  return Object.keys(state.sagas?.active ?? {}).some(id => {
    const sg = window.SAGAS?.[id];
    return sg?.holds && sg.trigger?.startsWith(`phase:${def.id}:`);
  });
}

// ── Erdős number: STEM-adjacent players get one on their first coauthorship
function erdosEligible() { return ["stem", "engineering", "business_econ", "social_science"].includes(state.affiliations?.major); }

// =====================================================================
// SAGA CONTENT
// Levels: 0 high school · 1 undergrad · 2 masters · 3 doctoral · 4 postdoc
//         5 adjunct · 6 tenure track · 7 tenured · 8 habilitation · 9 emeritus
// =====================================================================
(() => {
  const CONF_CITIES = ["Vienna", "Toronto", "a Marriott near the Atlanta airport", "Lisbon", "San Diego", "Kraków",
                       "a Hilton in Schaumburg, Illinois", "Montréal", "Edinburgh", "Las Vegas, somehow", "Kyoto",
                       "a conference center attached to a casino in Reno", "Kyiv", "Philadelphia in February"];
  const TOPICS = ["methodology", "why peer review is broken", "the replication crisis", "your own field's founding myth",
                  "academic job market math", "a famous study nobody has read", "citation metrics", "whether the humanities are dying (again)"];
  const COMMITTEES = ["Curriculum Committee", "Parking Appeals Board", "Ad Hoc Committee on Committee Reform",
                      "Strategic Visioning Task Force (Phase II)", "Assessment of Assessment Working Group",
                      "Search Committee for an Associate Dean of Strategic Visioning", "Library Space Reallocation Panel",
                      "Faculty Senate Subcommittee on Faculty Senate Subcommittees", "Task Force on Email Etiquette"];
  const pubs = (s) => s.publications ?? 0;
  const ok = { ok: true, reason: "" };
  const hasAdvisor = (s) => s.advisor ? ok : { ok: false, reason: "No advisor" };

  window.SAGAS = {

    // ═══ Undergraduate ════════════════════════════════════════════════
    noticed_by_professor: {
      title: "A word after class", from: "Prof. Alder, your seminar instructor", levels: [1, 1],
      when: (s) => (s.totalDraftsEver ?? 0) >= 40, weight: 3,
      stages: { start: {
        body: "You stayed after class to ask about the reading. Prof. Alder looked at you for a long moment and said: \"Have you ever thought about graduate school?\"",
        choices: [
          { label: "\"I've thought about it a lot.\"", fx: { network: 3, ambition: 2, flag: "alderMentee" },
            outcome: "Prof. Alder lends you a book and tells you to come by office hours. The book is annotated in three colors of ink, and one of the colors is angry." },
          { label: "\"I'm thinking about law school.\"", fx: { meaning: -1 },
            outcome: "Prof. Alder nods slowly. \"Of course,\" they say, the way people say it at funerals." },
          { label: "\"What does graduate school pay?\"", fx: { traits: { conscientiousness: 1 } },
            outcome: "Prof. Alder laughs for longer than seems necessary, then tells you a number. You assume it's monthly. It isn't." }
        ] } }
    },

    roommate_startup: {
      title: "Big news (from your roommate)", from: "Your roommate", levels: [1, 1], weight: 2,
      stages: {
        start: {
          body: "Your roommate has dropped two classes to build \"Uber, but for tutoring.\" They want you as a cofounder. They have already ordered hoodies.",
          choices: [
            { label: "Join as cofounder", cost: { energy: 25 }, fx: { network: 4, traits: { extraversion: 2 }, knowledge: -10 },
              go: "pivot", wait: 40, outcome: "You are now Chief Learning Officer. Your equity is a hoodie." },
            { label: "Stay in the library", fx: { knowledge: 25, meaning: 1 },
              outcome: "You hear the pitch practice through the wall all semester. You learn a great deal about synergy, against your will." },
            { label: "Ask whether the tutors are employees", fx: { integrity: 2 },
              outcome: "Your roommate says that's \"a later problem.\" It is, in fact, a later problem, for a labor board in two states." }
          ] },
        pivot: {
          body: "The startup has pivoted to \"Uber, but for flashcards.\" Your roommate is asking everyone to invest their summer savings.",
          choices: [
            { label: "Invest $200", cost: { money: 200 }, chance: { p: 0.15,
                win:  { fx: { money: 2400, network: 3 }, outcome: "Against every law of economics, a bigger startup buys the flashcards. Your $200 is now $2,400 and a story you'll tell at parties until people beg you to stop." },
                lose: { fx: { meaning: 1 }, outcome: "The startup is now a podcast. Your $200 is now a podcast." } } },
            { label: "Quietly step down", fx: { knowledge: 15 },
              outcome: "You return the hoodie. Your roommate keeps you on the website as \"advisor\" for three more years." }
          ] }
      }
    },

    lacan_reading_group: {
      title: "Reading group: Lacan (all welcome!!)", from: "A flyer stapled to a tree", levels: [1, 2], weight: 1.5,
      stages: { start: {
        body: "Thursdays, 8 p.m., the basement of the humanities building. \"No prior knowledge assumed. Some prior suffering helpful.\" Someone has drawn a little objet petit a in the corner.",
        choices: [
          { label: "Go every week", cost: { energy: 20 }, fx: { knowledge: 30, traits: { openness: 3 }, network: 2, flag: "lacanian" },
            outcome: "You understand none of it for six weeks, and then on week seven you understand all of it for about four minutes. You chase those four minutes for the rest of your life." },
          { label: "Go once, for the wine", fx: { network: 1 },
            outcome: "The wine is in a box. The box is labeled \"the Real.\" You leave with a free tote bag and a new word for your mother." },
          { label: "Start a rival Wittgenstein group", cost: { energy: 15 }, fx: { traits: { extraversion: 1 }, network: 2, flag: "wittgensteinian" },
            outcome: "Your group's first meeting is spent deciding whether you can meaningfully decide anything. Whereof one cannot speak, one orders pizza." }
        ] } }
    },

    // ═══ Master's ═════════════════════════════════════════════════════
    predatory_journal: {
      title: "Invitation to Publish — Esteemed Professor", from: "Dr. Editor-in-Chief, Intl. Journal of Advanced Everything",
      levels: [2, 6], weight: 2,
      stages: {
        start: {
          body: "Greetings of the day! We are impressed by your recent work and invite you to contribute to the International Journal of Advanced Everything (impact factor: pending). Publication charge: only $1,499. Rapid review guaranteed in 48 hours.",
          choices: [
            { label: "Pay and publish", cost: { money: 1499, drafts: 3 }, fx: { pubs: 1, pubTier: "low", integrity: -6, flag: "predatory", prestige: -1 },
              outcome: "Published! Your paper appears between an article on cold fusion and one on the healing properties of quartz." },
            { label: "Ask about the impact factor", cost: { energy: 3 }, go: "reply", outcome: "You hit send before you can stop yourself." },
            { label: "Mark as spam", remember: false,
              outcome: "Marked as spam. The International Journal of Advanced Everything writes again tomorrow, as Dr. Editor-in-Chief." }
          ] },
        reply: {
          body: "Greetings of the day!! Our impact factor is 9.7 (calculated internally). As a valued author you are eligible for our Early Career Discount: $1,399. Also we would like you to join the Editorial Board.",
          choices: [
            { label: "Join the Editorial Board", fx: { integrity: -4, flag: "predatoryBoard", network: 1 },
              outcome: "You're on the Editorial Board of the IJAE. Your photo on their website has been stretched horizontally." },
            { label: "Stop replying", outcome: "You stop replying. They do not." }
          ] }
      }
    },

    first_section: {
      title: "Your TA assignment", from: "Graduate Program Coordinator", levels: [2, 3], weight: 3,
      stages: { start: {
        body: "You've been assigned two discussion sections of Introduction to {field}. Thursday 8 a.m. and Friday 4 p.m., the two times no human being wants to discuss anything. Twenty-eight students each.",
        choices: [
          { label: "Prepare like it's a job talk", cost: { energy: 25 }, fx: { meaning: 3, knowledge: 20, flag: "goodTA" },
            outcome: "Week one, a student asks a question you can't answer. You say \"I don't know, let's find out,\" and it's the best class you teach all year." },
          { label: "Wing it with the professor's slides", fx: { traits: { neuroticism: 1 } },
            outcome: "The slides are from 2009 and reference a website that is now a casino. You learn to say \"as you can see\" about things nobody can see." },
          { label: "Ask: \"Will this be on the test?\" back at them", fx: { reputation: 1, traits: { extraversion: 1 } },
            outcome: "It gets a laugh. You've found your bit. You'll do it for thirty years. It'll stop getting a laugh in about five." }
        ] } }
    },

    // ═══ Masters & up: inbox familiarities ════════════════════════════
    conference_season: {
      title: "Abstract accepted", from: "Annual Meeting Program Committee", levels: [2, 8], once: false, max: 4, weight: 2,
      setup: (s, q) => { q.data.city = pickOne(CONF_CITIES); },
      stages: { start: {
        body: "Congratulations! Your abstract has been accepted for a twelve-minute talk at this year's Annual Meeting in {city}. Your session is at 8:00 a.m. on the last day, opposite the keynote.",
        choices: [
          { label: "Go and give the talk", cost: { energy: 35, money: 600 },
            chance: { p: (s) => 0.35 + Math.min(0.4, (s.identity?.network ?? 0) / 100),
              win:  { fx: { network: 6, knowledge: 40, reputation: 2 }, outcome: "Eleven people come to your talk. One of them is famous. She asks a question that is mostly a compliment, and then she follows you on social media." },
              lose: { fx: { network: 3, knowledge: 25 }, outcome: "Six people come, including the next speaker and a man clearly in the wrong room. He asks the best question." } } },
          { label: "Go, skip the talks, work the receptions", cost: { energy: 50, money: 600 }, fx: { network: 10, knowledge: -10, traits: { extraversion: 1 } },
            outcome: "You remember none of the talks and all of the gossip. Your business cards are gone by the second night, mostly to bartenders." },
          { label: "Present on Zoom from your kitchen", cost: { energy: 10 }, fx: { network: 1 },
            outcome: "Your slides freeze on slide three for eleven minutes. Nobody tells you. The chair thanks you for \"a very focused talk.\"" }
        ] } }
    },

    conference_hotel: {
      title: "Room block closing soon", from: "Conference Housing (do not reply)", levels: [3, 5], weight: 1.2,
      stages: { start: {
        body: "The conference hotel is $389 a night. The room block closes Friday. The overflow hotel is forty minutes away by a shuttle that runs \"approximately hourly.\"",
        choices: [
          { label: "Share a room with three other grad students", fx: { network: 5, energy: -20, traits: { agreeableness: 1 } },
            outcome: "Four people, two beds, one bathroom, one person who sets an alarm for 5 a.m. to \"get a run in.\" You're friends for life now, against your will." },
          { label: "Sleep on a former classmate's couch", fx: { meaning: 2, network: 1 },
            outcome: "Their cat sleeps on your face. They make you breakfast. You stay up until two talking about whether you'd both still do this again. You would. Probably." },
          { label: "Pay for the hotel and eat crackers", cost: { money: 1200 }, fx: { network: 3, energy: 20 },
            outcome: "You sleep eight hours in a bed the size of your apartment. You eat the free lobby apples for three days. It was worth it." }
        ] } }
    },

    reviewer_two: {
      title: "Decision on your manuscript: major revision", from: "Editorial Office", levels: [3, 9], once: false, max: 3,
      when: (s) => pubs(s) >= 1, weight: 3,
      setup: (s, q) => { q.data.rivalReviewer = !!s.story.rival && Math.random() < 0.4; },
      stages: {
        start: {
          body: (s, q) => "Reviewer 1: \"Accept as is. A pleasure to read.\"\n\nReviewer 2 asks for three additional studies, a new theoretical framework, a discussion of limitations \"commensurate with the limitations,\" and citations to seven papers that share an author."
            + (q.data.rivalReviewer ? "\n\nThe prose style seems familiar." : ""),
          choices: [
            { label: "Do everything Reviewer 2 asked", cost: { drafts: 6, energy: 30, knowledge: 40 }, fx: { pubs: 1, pubTier: "mid", resilience: 2 },
              outcome: (s, q) => q.data.rivalReviewer
                ? "Accepted. Seven new references in your bibliography belong to {rival}. You're certain now."
                : "Accepted, nine months later. The seven papers you were asked to cite have one thing in common, and you'll never be able to prove it." },
            { label: "Write a firm, polite rebuttal", cost: { energy: 20 },
              chance: { p: (s) => 0.35 + ((s.traits?.extraversion ?? 50) - 50) / 250 + ((s.identity?.reputation ?? 0) / 100),
                win:  { fx: { pubs: 1, pubTier: "high", reputation: 2 }, outcome: "The editor agrees with you. Reviewer 2 has been \"thanked for their service.\" You frame the decision letter." },
                lose: { go: "reject", outcome: "The editor sides with Reviewer 2. Editors always side with Reviewer 2." } } },
            { label: "Withdraw it and send it somewhere easier", cost: { drafts: 2 }, fx: { pubs: 1, pubTier: "low" },
              outcome: "Accepted in four days at a journal you'd never heard of. You suspect no one read it, including the reviewers." }
          ] },
        reject: {
          body: "Rejected. The editor \"encourages resubmission elsewhere\" and wishes you luck finding \"an appropriate venue.\"",
          choices: [
            { label: "Send it straight back out", cost: { drafts: 2, energy: 10 }, fx: { pubs: 1, pubTier: "low", resilience: 2 },
              outcome: "Third journal's the charm. You changed one comma." },
            { label: "Put it in the drawer", fx: { meaning: -2, flag: "drawer" },
              outcome: "The paper goes in the drawer with the others. The drawer is getting heavy." }
          ] }
      }
    },

    the_scoop: {
      title: "New preprint in your area", from: "arXiv daily digest", levels: [3, 7], when: (s) => pubs(s) >= 2, weight: 2,
      setup: () => { ensureRival(); },
      stages: {
        start: {
          body: "A new preprint does exactly what you've been doing for the last eight months. Same data. Better figures. The first author is {rival}, whom you met once at a poster session and did not like.",
          choices: [
            { label: "Rush yours out this week", cost: { drafts: 8, energy: 40 }, fx: { pubs: 1, pubTier: "low", integrity: -1, rival: -15, flag: "rushed" },
              outcome: "You post yours thirty-one hours later and argue, in a footnote, that the projects were \"independent and concurrent.\" Your figures are worse." },
            { label: "Find a new angle", cost: { knowledge: 80 }, fx: { meaning: 2, perm: { paperMult: 1.03 }, flag: "pivoted" },
              outcome: "You find an angle {rival} missed. It's narrower than your idea was, but it's yours." },
            { label: "Email {rival} about collaborating", cost: { energy: 10 }, go: "reply", wait: 30,
              outcome: "You write four drafts of a two-line email and send the fifth." },
            { label: "Pretend you didn't see it", fx: { traits: { neuroticism: 2 } },
              outcome: "You close the tab. Every reviewer for the next three years asks how your work differs from {rival}'s." }
          ] },
        reply: {
          body: "{rival} has replied.",
          choices: [
            { label: "Open it", chance: { p: (s) => 0.5 + (s.story.rival?.relation ?? 0) / 200,
                win:  { fx: { network: 6, rival: 25, pubs: 1, pubTier: "mid" }, outcome: "{rival} says yes. You end up second author on a paper you mostly wrote, which is still a paper. You start getting along, which is worse." },
                lose: { fx: { rival: -10 }, outcome: "\"Thanks for reaching out! We'll be sure to cite you.\" They cite you in footnote 41, misspelled." } } }
          ] }
      }
    },

    p_value: {
      title: "Analysis complete", from: "analysis_final_v3_REAL.R", levels: [3, 6], when: (s) => (s.totalDraftsEver ?? 0) >= 150, weight: 2,
      stages: {
        start: {
          body: "The model finishes running at 1:40 a.m.\n\np = 0.051.",
          choices: [
            { label: "Report it as it is", fx: { pubs: 1, pubTier: "low", integrity: 5, meaning: 2, flag: "honestNull" },
              outcome: "Reviewers call it \"a valuable null result\" and recommend rejection. You publish it anyway, in a journal that mostly publishes null results. It's cited by the people who matter." },
            { label: "Try a few other specifications", cost: { energy: 15 }, fx: { pubs: 1, pubTier: "mid", integrity: -8, flag: "phacked" },
              outcome: "Specification nine gives p = 0.049. You don't think about the other eight. You don't write them down, either." },
            { label: "Collect more data", cost: { energy: 35, drafts: 4 }, go: "more", wait: 45,
              outcome: "You file an amendment with the IRB and start recruiting again. Your advisor asks why this is taking so long." },
            { label: "Make the numbers cooperate", hint: "You know what this means.", fx: { pubs: 1, pubTier: "high", integrity: -30, flag: "fabricated" },
              outcome: "The new numbers are beautiful. The paper sails through review. You sleep fine, mostly." }
          ] },
        more: {
          body: "The new data is in. You run the model again, with the same script, at the same hour of the night.",
          choices: [
            { label: "Look at the result", chance: { p: 0.5,
                win:  { fx: { pubs: 1, pubTier: "high", integrity: 3, reputation: 3 }, outcome: "p = 0.003, and the effect is bigger than before. It's real. You walk home at dawn feeling like a scientist." },
                lose: { fx: { pubs: 1, pubTier: "low", meaning: 4 }, outcome: "p = 0.41. The effect was never there. You publish the null result, and you feel strangely light." } } }
          ] }
      }
    },

    irb: {
      title: "IRB Protocol #2024-0457: revisions required", from: "Institutional Review Board", levels: [2, 6], weight: 1.5,
      when: (s) => ["social_science", "stem", "business_econ"].includes(s.affiliations?.major),
      stages: { start: {
        body: "The Board has reviewed your protocol. Required revisions: (1) the word \"fun\" in the consent form may be coercive; (2) please justify the use of pencils; (3) the survey asks participants their age, which may cause distress to participants who are old.",
        choices: [
          { label: "Make every change, cheerfully", cost: { energy: 15 }, fx: { landmark: -0.02, integrity: 2, traits: { agreeableness: 1 } },
            outcome: "Approved in six weeks. The consent form is now nine pages long and contains the phrase \"enjoyment-adjacent.\"" },
          { label: "Call the IRB office and be charming", cost: { energy: 10 }, chance: { p: (s) => 0.3 + (s.traits?.extraversion ?? 50) / 200,
              win:  { fx: { network: 2 }, outcome: "The coordinator, Barb, laughs at your pencil joke. Approved by Friday. You send Barb a card at Christmas for the rest of your career." },
              lose: { fx: { landmark: -0.04 }, outcome: "Barb is not charmed. Barb has seen your kind. The protocol goes back to the full board, which meets quarterly." } } },
          { label: "Switch to publicly available data", fx: { perm: { paperMult: 0.99 }, knowledge: 20 },
            outcome: "You pivot to a public dataset. Your study is now about a slightly different question than the one you cared about. This is called \"feasibility.\"" }
        ] } }
    },

    impostor: {
      title: "(drafts)", from: "An email you wrote to yourself at 2 a.m.", levels: [2, 4], weight: 1.5, kind: "notice",
      stages: { start: {
        body: "Subject: they made a mistake\n\nThe admissions committee made a mistake. Everyone in the cohort read Deleuze in high school. You read Deleuze last week and thought it was about a dog.",
        choices: [
          { label: "Tell a friend in the cohort", fx: { meaning: 3, traits: { neuroticism: -2 }, network: 1 },
            outcome: "They confess they also thought it was about a dog. You have never loved anyone more." },
          { label: "Work harder, tell no one", cost: { energy: 30 }, fx: { knowledge: 60, traits: { neuroticism: 2 } },
            outcome: "You read four books in a week out of pure terror. It works, sort of. It will work, sort of, for the next twenty years." },
          { label: "Delete the email", fx: {},
            outcome: "You delete it. It's still there, in the way these things are." }
        ] } }
    },

    funding_cut: {
      title: "Update on your funding", from: "Graduate Program Office", levels: [2, 4], weight: 1.5,
      stages: { start: {
        body: "Due to budgetary realignment, your funding line has been \"restructured.\" We remain deeply committed to student success.",
        choices: [
          { label: "Take an extra TA section", fx: { money: 4000, perm: { energyRegenMult: 0.97 } },
            outcome: "You now teach 140 undergraduates statistics on Tuesday mornings. Some of them are learning statistics." },
          { label: "Ask {advisor} for help", req: hasAdvisor,
            chance: { p: (s) => ((s.advisor?.favor ?? 0) - 20) / 80,
              win:  { fx: { money: 8000, favor: -3 }, outcome: "{advisor} moves you onto their grant without a word. Later you find out it cost them a summer month of salary." },
              lose: { fx: { favor: -6, money: 1500 }, outcome: "{advisor} says \"funding is tough right now\" and suggests you \"look into fellowships.\" They give you $1,500 from a discretionary account, and the sense of being a problem." } } },
          { label: "Take out a loan", fx: { money: 8000, flag: "fundingLoan" }, run: (s) => { s.debt = (s.debt ?? 0) + 8000; },
            outcome: "You borrow $8,000 at an interest rate the loan officer describes as \"competitive.\"" }
        ] } }
    },

    grad_strike: {
      title: "Strike vote: results", from: "Graduate Workers United", levels: [3, 4], weight: 1, when: (s) => s.levelIndex === 3 || !!s.perks?.join_union,
      stages: { start: {
        body: "The vote passed, 94%. Starting Monday, graduate workers will withhold grading and teaching until the university agrees to a living stipend. The provost has sent an email with the subject line \"Our Shared Community.\"",
        choices: [
          { label: "Walk the picket line", cost: { energy: 25 }, fx: { meaning: 6, network: 4, integrity: 3, favor: -3, flag: "picketed" },
            outcome: "Three weeks of signs, chants and donated bagels. You win a raise that almost covers rent. You learn the names of the custodians, who bring you coffee." },
          { label: "Strike, but finish your own research", fx: { meaning: 2, drafts: 10, flag: "picketed" },
            outcome: "You hold your grades and write two chapters in the quiet. The picket line has a schedule; you take the Thursday shift." },
          { label: "Cross the line", fx: { favor: 4, meaning: -5, network: -4, flag: "crossedLine" },
            outcome: "You teach your section to four students and a reporter. The contract is ratified in March. Nobody in your cohort mentions it. Everyone in your cohort remembers." }
        ] } }
    },

    quals: {
      title: "Qualifying exams: two weeks", from: "Director of Graduate Studies", levels: [3, 3], trigger: "phase:dissertation:candidacy", holds: false,
      stages: { start: {
        body: "A reminder that your qualifying exams are in two weeks. The reading list is attached. It is 212 items long. Several of them are books. One of them is \"all of Hegel.\"",
        choices: [
          { label: "Study like your life depends on it", cost: { energy: 60 }, fx: { prestige: 2, resilience: 4, knowledge: 150, score: 4, flag: "qualsDistinction" },
            outcome: "You pass with distinction. One examiner says it was the best answer he's read in years. You don't remember writing it." },
          { label: "Study a normal amount", cost: { energy: 30 }, fx: { resilience: 2, knowledge: 60, score: 1 },
            outcome: "You pass. Nobody mentions it again, which is how you know it went fine." },
          { label: "Panic productively", fx: { traits: { neuroticism: 3 }, knowledge: 80, energy: -40, score: 2 },
            outcome: "You pass. You don't remember the exam. You remember the panic in perfect detail." }
        ], timeout: { seconds: 150, choice: 2 } } }
    },

    // ═══ Landmark moments: the master's thesis ═══════════════════════
    thesis_topic: {
      title: "Re: your thesis proposal", from: "{advisor}", levels: [2, 2], trigger: "phase:masters_thesis:research",
      stages: { start: {
        body: "Read your proposal. Good energy! One thought: it's about four dissertations. Maybe narrow it to a third of one?\n\nWorking title: \"{title}\"",
        choices: [
          { label: "Narrow it, gratefully", fx: { score: 2, favor: 3 },
            outcome: "You cut it to one chapter of the original idea. It's still a lot. It's the right amount of a lot." },
          { label: "Keep the big version", fx: { score: -1, meaning: 2, knowledge: 30, flag: "ambitiousThesis" },
            outcome: "You keep all four dissertations. You'll write them all, eventually, one per decade." },
          { label: "Narrow it so far it's a footnote", fx: { score: 1, landmark: 0.05 },
            outcome: "Your thesis is now about one word in one letter written in 1843. It's very, very good." }
        ], timeout: { seconds: 150, choice: 0 } } }
    },

    thesis_defense: {
      title: "Your thesis defense", from: "Your thesis committee", levels: [2, 2], trigger: "phase:masters_thesis:defense", holds: true,
      stages: { start: {
        body: "A windowless room. Three committee members, one of whom is eating a sandwich. The external reader opens with: \"I enjoyed this. But I want to talk about chapter three.\"",
        choices: [
          { label: "Concede chapter three is the weakest", fx: { score: 3, meaning: 1 },
            outcome: "\"It is,\" says the external, delighted, and spends twenty minutes telling you how to fix it. It's the best feedback you've ever gotten." },
          { label: "Defend chapter three to the death", cost: { energy: 20 }, chance: { p: (s) => 0.35 + (s.knowledge ?? 0) / 4000,
              win:  { fx: { score: 4, reputation: 2 }, outcome: "You defend it. You win. The sandwich-eater nods for the first time." },
              lose: { fx: { score: -3 }, outcome: "You defend it. You lose. You will be revising chapter three until August." } } },
          { label: "Say \"that's a great question\" and nothing else", fx: { score: -2, traits: { neuroticism: 1 } },
            outcome: "\"It is,\" says the external, and waits. The silence lasts an academic eternity: forty seconds." }
        ], timeout: { seconds: 180, choice: 2 } } }
    },

    // ═══ Landmark moments: the dissertation ══════════════════════════
    chapter_three: {
      title: "chapter_3_DRAFT_v11_actuallyfinal.docx", from: "Your own laptop", levels: [3, 3], trigger: "phase:dissertation:chapters",
      stages: { start: {
        body: "It's month nineteen of chapter three. The chapter has had four titles, three theoretical frameworks, and one dog. You haven't written a sentence you liked since March.",
        choices: [
          { label: "Write 300 bad words every morning", cost: { energy: 30 }, fx: { score: 3, drafts: 15, traits: { conscientiousness: 2 } },
            outcome: "Three hundred terrible words a day for six weeks. On day forty-one, one of them is good. Then twelve more are good. Then it's a chapter." },
          { label: "Throw it out and start over", fx: { landmark: -0.06, score: 2, meaning: 3 },
            outcome: "You delete eleven drafts. The new chapter takes a month and says what you meant the whole time." },
          { label: "Merge it with chapter two and hope", fx: { score: -2, landmark: 0.06 },
            outcome: "Chapter two-and-three is now 140 pages. Your committee will notice. Your committee will notice in about eight months." }
        ], timeout: { seconds: 180, choice: 2 } } }
    },

    committee_feud: {
      title: "Committee meeting (rescheduled x4)", from: "Department Administrator", levels: [3, 3], trigger: "phase:dissertation:committee",
      stages: { start: {
        body: "Your committee met at last. Two members disagree about your methods. They disagreed about the same methods in 1997, at a conference, and have not spoken since. You are now the conference.",
        choices: [
          { label: "Side with {advisor}", fx: { favor: 6, score: 1, network: -2 },
            outcome: "You side with your advisor. The other member signs off with the word \"fine\" and a period that does a lot of work." },
          { label: "Write a chapter that satisfies both", cost: { energy: 35, knowledge: 120 }, fx: { score: 4, meaning: 2, resilience: 3 },
            outcome: "You write a methods section so balanced it gets cited by both camps, separately, as support." },
          { label: "Invite them both to coffee, together", chance: { p: (s) => 0.25 + (s.traits?.agreeableness ?? 50) / 200,
              win:  { fx: { score: 5, network: 4, flag: "peacemaker" }, outcome: "They talk for three hours and forget you're there. They co-author a paper the next year. They thank you in it." },
              lose: { fx: { score: -3, traits: { neuroticism: 2 } }, outcome: "It's the worst ninety minutes of your life. You pay for the coffee." } } }
        ], timeout: { seconds: 180, choice: 0 } } }
    },

    dissertation_defense: {
      title: "Your dissertation defense", from: "Office of Graduate Studies", levels: [3, 3], trigger: "phase:dissertation:defense", holds: true,
      stages: { start: {
        body: "Your family is in the back row, your advisor is in the front, and the external examiner has flown in from a better university. After your forty-minute talk, the external leans back and asks: \"So what?\"",
        choices: [
          { label: "Tell them why it matters to you", fx: { score: 4, meaning: 4 },
            outcome: "You stop performing and just tell them. The room goes quiet in the good way. Your mother cries. Then your advisor does, which is new." },
          { label: "Cite the literature that says it matters", cost: { knowledge: 100 }, fx: { score: 3, reputation: 1 },
            outcome: "You cite forty years of scholarship from memory. The external writes \"thorough\" on their notepad, underlines it twice." },
          { label: "Turn it around: \"So what, indeed\"", chance: { p: (s) => 0.3 + (s.traits?.openness ?? 50) / 250,
              win:  { fx: { score: 5, flag: "boldDefense" }, outcome: "It's a gamble. It works. The external laughs, and you spend the rest of the defense in a genuine argument, which is what this was supposed to be all along." },
              lose: { fx: { score: -3, traits: { neuroticism: 2 } }, outcome: "It's a gamble. The external does not laugh. \"Indeed,\" they say, and write for a very long time." } } }
        ], timeout: { seconds: 180, choice: 1 } } }
    },

    dissertation_danish: {
      title: "Re: a quick question about your topic", from: "A librarian with good intentions", levels: [3, 3], weight: 1,
      when: (s) => s.activeLandmark === "dissertation" && (s.landmarkProgress ?? 0) > 100,
      stages: { start: {
        body: "Hello! I came across this while cataloguing and thought of your work. It's a 1987 dissertation, in Danish. From the abstract, it appears to make your exact argument.",
        choices: [
          { label: "Learn enough Danish to read it", cost: { energy: 40, knowledge: 60 }, fx: { score: 2, knowledge: 100, flag: "readDanish" },
            outcome: "It does make your argument. Then, on page 200, it makes a mistake you'd never have noticed without reading it. Your chapter four is about the mistake now." },
          { label: "Cite it in a footnote and move on", fx: { integrity: 1, score: 1 },
            outcome: "\"See also Sørensen (1987), whose prescient work this dissertation extends.\" Nobody on your committee reads Danish. Nobody ever will." },
          { label: "Never open the email again", fx: { integrity: -3, traits: { neuroticism: 2 } },
            outcome: "You archive it. Somewhere in Aarhus, an emeritus professor named Sørensen sneezes and doesn't know why." }
        ] } }
    },

    // ═══ Postdoc / job market ════════════════════════════════════════
    cover_letter: {
      title: "Application portal: 112 open positions", from: "The Job Wiki (anonymous)", levels: [4, 4], trigger: "phase:job_market:materials",
      stages: { start: {
        body: "This year's job list has 112 postings in your area, if your area is defined generously. One is in your exact subfield, at a school you'd love. Eleven are \"open rank, open field, open to anything.\"",
        choices: [
          { label: "Tailor every letter", cost: { energy: 50, drafts: 20 }, fx: { score: 3, landmark: 0.06 },
            outcome: "Forty letters, each one specific. You learn the name of every department's founding donor. A search chair writes back to say it was the best letter she'd read all year." },
          { label: "One letter, find-and-replace the school", fx: { score: -1, landmark: 0.1, flag: "massMailed" },
            outcome: "You send ninety letters in an afternoon. One of them is addressed to the wrong university. You'll find out which one in March." },
          { label: "Apply only to the dream job", fx: { score: 1, meaning: 2, landmark: 0.03, flag: "dreamOnly" },
            outcome: "One application, the best thing you've ever written. Then you wait, which is the real job." }
        ], timeout: { seconds: 180, choice: 1 } } }
    },

    job_talk: {
      title: "Campus visit invitation", from: "Search Committee Chair", levels: [4, 5], trigger: "phase:job_market:flyouts",
      stages: { start: {
        body: "We're delighted to invite you for a campus visit: two days, a job talk, a teaching demonstration, twenty-three individual meetings, and dinner with the committee. Please book your own flights; you'll be reimbursed in 8–14 weeks.",
        choices: [
          { label: "Rehearse the talk for weeks", cost: { energy: 50, knowledge: 100 }, fx: { score: 4, network: 3, flag: "greatJobTalk" },
            outcome: "Your talk is clean and good. Someone asks how it generalizes, and you have a slide for that. The chair gets quiet the way chairs do when they've decided." },
          { label: "Wing it", chance: { p: (s) => 0.25 + ((s.traits?.extraversion ?? 50) / 200),
              win:  { fx: { score: 4, network: 4 }, outcome: "You're funny, apparently. The committee loves you. You can't remember a single thing you said." },
              lose: { fx: { score: -3, traits: { neuroticism: 2 } }, outcome: "Someone asks how it generalizes. You say \"great question.\" Then you say nothing else for a while." } } },
          { label: "Ask {advisor} for advice first", req: hasAdvisor, cost: { energy: 15 },
            chance: { p: (s) => (s.advisor?.favor ?? 30) / 100,
              win:  { fx: { score: 4, favor: 3 }, outcome: "{advisor} spends an hour tearing your talk apart, then calls the search chair, an old friend. The visit goes very well." },
              lose: { fx: { favor: -2 }, outcome: "{advisor}'s advice is \"be yourself.\" You suspect they didn't open the slides." } } }
        ], timeout: { seconds: 180, choice: 1 } } }
    },

    negotiation: {
      title: "Offer letter (please respond within 48 hours)", from: "Dean of the College", levels: [4, 5], trigger: "phase:job_market:offer", holds: true,
      stages: { start: {
        body: "We are pleased to offer you a position as Assistant Professor. Salary: as discussed. Start-up: as discussed. Teaching load: as discussed. Please respond within 48 hours.",
        choices: [
          { label: "Accept immediately, with gratitude", fx: { score: 1, meaning: 2 },
            outcome: "You accept before the dean finishes the sentence. You find out later that everyone else asked for more. Everyone else got more." },
          { label: "Negotiate (politely)", cost: { energy: 25 }, chance: { p: (s) => 0.55 + (s.identity?.network ?? 0) / 200,
              win:  { fx: { score: 3, funds: 80000, money: 5000 }, outcome: "You ask for a course release and more startup. You get both. The dean says \"you drive a hard bargain\" with what you choose to believe is respect." },
              lose: { fx: { score: 0 }, outcome: "\"We're at the limit of what we can do.\" They were. You accept, a little embarrassed, and nobody remembers but you." } } },
          { label: "Use another offer as leverage", req: (s) => (s.identity?.network ?? 0) >= 15 ? ok : { ok: false, reason: "No other offer" }, fx: { score: 4, funds: 150000, rival: -5 },
            outcome: "You mention the other offer. The dean's eyebrows move. The startup package doubles. Somewhere, a search committee you turned down sighs." }
        ], timeout: { seconds: 120, choice: 0 } } }
    },

    two_body: {
      title: "I got the job", from: "Your partner", levels: [4, 6], weight: 1.5,
      stages: {
        start: {
          body: "\"I got the job!! It's the one I wanted. It's... about two thousand miles from here. Can we talk tonight?\"",
          choices: [
            { label: "Follow them", fx: { prestige: -5, meaning: 8, flag: "followedPartner" },
              outcome: "You move. Your new institution describes itself as \"teaching-focused.\" You have a window now, and someone to eat dinner with." },
            { label: "Try long distance", fx: { meaning: 2, perm: { energyRegenMult: 0.96 }, flag: "longDistance" },
              outcome: "You learn the airport by heart: which security line is fastest, which gate has outlets. You become very good at goodbyes." },
            { label: "Ask for a spousal hire", cost: { energy: 20 }, go: "spousal", wait: 40,
              outcome: "You email the chair, the dean, and someone in HR whose title includes the word \"Partnership.\"" },
            { label: "End it", fx: { resilience: 5, meaning: -6, traits: { neuroticism: 4 }, flag: "endedIt" },
              outcome: "You end it. You keep the cat. You publish a lot that year." }
          ] },
        spousal: {
          body: "The dean has replied.",
          choices: [
            { label: "Read it", chance: { p: (s) => 0.25 + (s.universityPrestige ?? 0) / 300,
                win:  { fx: { meaning: 8, network: 2, flag: "spousalHire" }, outcome: "They found a line! \"Visiting Lecturer, one year, renewable.\" It gets renewed for eleven years." },
                lose: { go: "start", outcome: "The dean says \"we'll certainly look into it.\" You've been in academia long enough to know what that means." } } }
          ] }
      }
    },

    coauthor_ghost: {
      title: "Re: Re: Re: Re: data?", from: "Your coauthor (last seen in March)", levels: [4, 7], weight: 1, when: (s) => pubs(s) >= 3,
      stages: { start: {
        body: "Your coauthor has the data. Your coauthor has had the data for fourteen months. Your coauthor last replied with \"on it!! 🙏\" in March. The paper is otherwise finished.",
        choices: [
          { label: "Drive to their house", cost: { energy: 30 }, fx: { pubs: 1, pubTier: "mid", traits: { extraversion: 1 } },
            outcome: "They answer the door in a bathrobe, hand you a USB stick without a word, and close the door. The paper comes out in the spring." },
          { label: "Rebuild the dataset yourself", cost: { energy: 40, knowledge: 150 }, fx: { pubs: 1, pubTier: "mid", resilience: 3, flag: "rebuiltData" },
            outcome: "It takes the summer. Your version has fewer errors than theirs did. You drop them to third author. They reply \"np!! 🙏\" within the hour." },
          { label: "Let the paper go", fx: { meaning: -2, flag: "drawer" },
            outcome: "Another one for the drawer. The drawer has a name now. You call it \"Future Work.\"" }
        ] } }
    },

    citation_error: {
      title: "A small thing in your 2019 paper", from: "A very polite graduate student", levels: [4, 9], weight: 1, when: (s) => pubs(s) >= 4,
      stages: { start: {
        body: "Hi! I'm trying to replicate your most-cited paper for a class. I think line 214 of the code reverses the coding of the main variable? Sorry if I'm wrong!! I'm probably wrong.",
        choices: [
          { label: "Check, thank them, publish a correction", cost: { energy: 25 }, fx: { integrity: 8, meaning: 3, citations: 15, flag: "corrected" },
            outcome: "They're right. You publish a correction and credit them by name. They put it on their CV. Your paper gets cited more now, as an example of how to do this." },
          { label: "Check quietly; it's 'not material'", fx: { integrity: -6, flag: "errorIgnored" },
            outcome: "It's material. You decide it isn't. The student gets a B+ and a lesson about the field." },
          { label: "Don't reply", fx: { integrity: -3, traits: { neuroticism: 2 }, flag: "errorIgnored" },
            outcome: "You don't reply. Every few months you open the code and look at line 214. It's still there." }
        ] } }
    },

    data_sleuth: {
      title: "Some questions about Figure 3", from: "A pseudonymous blogger", levels: [4, 9],
      when: (s) => storyFlag("fabricated") || storyFlag("phacked") || storyFlag("aiGhost") || storyFlag("errorIgnored"),
      weight: (s) => (storyFlag("fabricated") ? 6 : 0) + (storyFlag("phacked") ? 1.5 : 0) + (storyFlag("aiGhost") ? 2 : 0) + (storyFlag("errorIgnored") ? 1.5 : 0),
      stages: {
        start: {
          body: (s) => storyFlag("fabricated")
            ? "Hi. I've been looking at Figure 3 of your paper. The error bars are remarkably consistent. The last digits of your means follow no distribution I recognize. I've written a post. It goes up Monday unless you'd like to comment."
            : storyFlag("aiGhost")
              ? "Hi. I tried to find three of the references in your latest paper. I couldn't, because they don't exist. Would you like to comment before I post?"
              : "Hi. I tried to reproduce your main result from the paper's description. I got it on one specification out of nine. Would you like to comment before I post?",
          choices: [
            { label: "Post all the code and data", cost: { energy: 20 }, showIf: () => !storyFlag("fabricated"), fx: { integrity: 6, reputation: 2 },
              outcome: "You post everything. The blogger updates the post: \"Mostly fine. Some forking paths.\" It's the best review you've ever gotten." },
            { label: "Retract the paper yourself", fx: { pubs: -1, prestige: -6, integrity: 12, meaning: 3, flag: "retracted" },
              outcome: "Retraction Watch covers it in four sentences. Two of them are kind. You sleep better than you have in years." },
            { label: "Hire a lawyer", cost: { money: 20000 }, chance: { p: (s) => storyFlag("fabricated") ? 0.35 : 0.7,
                win:  { fx: { integrity: -4 }, outcome: "The post goes up with a lot of \"allegedly\" in it. Your university \"stands by its researchers.\" The story dies down. It doesn't go away." },
                lose: { go: "inquiry", outcome: "The post goes up anyway. It has 40,000 views by Wednesday." } } },
            { label: "Ignore it", go: "inquiry", wait: 30, outcome: "You don't reply. The post goes up Monday." }
          ],
          timeout: { seconds: 120, choice: 3 } },
        inquiry: {
          body: "The university has opened a research integrity inquiry. A committee of five people you've had lunch with will review your lab notebooks.",
          choices: [
            { label: "Cooperate fully", chance: { p: (s) => storyFlag("fabricated") ? 0.15 : 0.75,
                win:  { fx: { prestige: -4, integrity: 4 }, outcome: "The committee finds \"sloppiness, not misconduct.\" You're required to take an online ethics module. You take it twice." },
                lose: { fx: { prestige: -20, pubs: -2, integrity: -10, flag: "scandal", reputation: -10 }, outcome: "The committee finds misconduct. Two papers are retracted. Your name now autocompletes with a word you don't like." } } },
            { label: "Blame a former student", fx: { prestige: -8, integrity: -20, meaning: -10, flag: ["scandal", "blamedStudent"], morale: -30 },
              outcome: "The committee accepts your version. Your former student does not. Neither, eventually, does anyone else in the field." }
          ] }
      }
    },

    // ═══ Adjunct life ════════════════════════════════════════════════
    freeway_flyer: {
      title: "Your schedule for spring", from: "Three different departments", levels: [5, 5], weight: 3,
      stages: { start: {
        body: "Spring: two sections at the community college, one at the state school across the river, and an online course at a university you've never seen, in a time zone you've never lived in. Combined pay: less than one assistant professor. Combined commute: 400 miles a week.",
        choices: [
          { label: "Take all of it", fx: { money: 9000, perm: { energyRegenMult: 0.95 }, meaning: 1, flag: "freewayFlyer" },
            outcome: "You grade in parking lots. You know every rest stop between three campuses. Your car becomes your office, and your office becomes a feeling." },
          { label: "Take two, keep time to write", fx: { money: 3000, drafts: 20 },
            outcome: "You turn down the online course. You eat a lot of rice. You write a paper in the time you saved, which is how you get out of here." },
          { label: "Organize the adjuncts", cost: { energy: 30 }, fx: { meaning: 5, network: 5, integrity: 2, flag: "adjunctUnion" },
            outcome: "Forty adjuncts in a library basement, one of them with a laminated sign-up sheet. By May you have a union and a pay raise of $300 a course. It's a start." }
        ] } }
    },

    plagiarism: {
      title: "Final papers (Intro, section 4)", from: "The course learning system", levels: [5, 7], weight: 1.5,
      stages: { start: {
        body: "Paper 17 of 34 begins: \"As a large language model, I cannot have personal opinions about the French Revolution, but here are five key themes.\" It is otherwise very well organized.",
        choices: [
          { label: "Report it to academic integrity", cost: { energy: 15 }, fx: { integrity: 2, traits: { neuroticism: 1 } },
            outcome: "The hearing is in six weeks. The student brings their parents, a lawyer, and a printout of the first sentence, highlighted, as evidence for the defense." },
          { label: "Talk to the student", cost: { energy: 10 }, fx: { meaning: 4, integrity: 1 },
            outcome: "They're working thirty hours a week and taking six courses. You give them an extension. The rewrite is clumsy, and theirs, and better." },
          { label: "Give it a B and move on", fx: { integrity: -2 },
            outcome: "B. It was better organized than half the others. You try not to think about what that means." }
        ] } }
    },

    // ═══ The tenure track ════════════════════════════════════════════
    teaching_evals: {
      title: "Your course evaluations are available", from: "Office of Institutional Effectiveness", levels: [5, 7], once: false, max: 2, weight: 1.5,
      stages: { start: {
        body: "Response rate: 14%. Selected comments: \"disorganized but passionate\", \"why is this class at 8am\", \"the readings were long\", and \"nice shoes\".",
        choices: [
          { label: "Read every comment", fx: { meaning: 2, traits: { neuroticism: 2 } },
            outcome: "You read them twice. One student says your class made them change majors. You don't know which direction." },
          { label: "Don't read them", fx: { resilience: 1 }, outcome: "You don't read them. They're still there, though." },
          { label: "Put \"nice shoes\" in your teaching statement", fx: { reputation: 1, integrity: -1 },
            outcome: "\"Students consistently note my attention to professional presentation.\"" }
        ] } }
    },

    grade_appeal: {
      title: "RE: RE: FW: My grade", from: "A student (cc: their father, Esq.)", levels: [5, 7], weight: 1,
      stages: { start: {
        body: "I am writing to formally dispute my B+. I attended most of the classes and I feel my effort was A-level. My father, who is cc'd, is an attorney.",
        choices: [
          { label: "Hold the line", cost: { energy: 20 }, fx: { integrity: 3, resilience: 3 },
            outcome: "You write a calm, careful explanation of the rubric. The father replies \"Noted.\" You'll think about that word for a while." },
          { label: "Change it to an A−", fx: { integrity: -3 },
            outcome: "You get a thank-you email with three exclamation points. The next semester, four students mention their fathers." },
          { label: "Forward it to the chair", outcome: "The chair forwards it back to you with \"Thoughts?\"" }
        ] } }
    },

    committee_service: {
      title: "A small ask", from: "Department Chair", levels: [6, 8], once: false, max: 5, weight: 2,
      setup: (s, q) => { q.data.committee = pickOne(COMMITTEES); },
      stages: { start: {
        body: "We'd love for you to serve on the {committee}. It's a light lift: monthly meetings, a short report. Your perspective would be really valuable.",
        choices: [
          { label: "Say yes", fx: { reputation: 3, perm: { energyRegenMult: 0.97 }, flag: "committee" }, run: (s) => { s.story.service = (s.story.service ?? 0) + 1; },
            outcome: "You join the {committee}. The monthly meetings are weekly. The short report is 61 pages and you wrote 58 of them." },
          { label: "Say no", fx: { reputation: -2, meaning: 1 },
            outcome: "The chair says \"no problem at all!\" It is a problem. It will come up at your annual review." },
          { label: "Say yes and never go", fx: { reputation: 1, integrity: -2 }, run: (s) => { s.story.service = (s.story.service ?? 0) + 1; },
            outcome: "Your name is on the {committee}'s report. You haven't read the report. Neither has anyone else." }
        ] } }
    },

    grants_gov: {
      title: "Submission deadline: 5:00 p.m. today", from: "Office of Sponsored Programs", levels: [5, 9], weight: 1.2,
      stages: { start: {
        body: "It's 4:51 p.m. The federal submission portal is \"experiencing higher than normal volume.\" Your budget justification is 14 KB over the limit. The PDF must be \"flattened.\" Nobody knows what that means.",
        choices: [
          { label: "Call the grants office, beg", cost: { energy: 20 }, chance: { p: 0.6,
              win:  { fx: { funds: 60000, network: 1 }, outcome: "Denise from Sponsored Programs submits it at 4:59:41 from her personal laptop. It gets funded. You name a figure after her." },
              lose: { fx: { meaning: -1 }, outcome: "Submitted at 5:00:03. Rejected for lateness by an automated email that begins \"Dear Applicant.\"" } } },
          { label: "Delete the budget justification's adjectives", cost: { energy: 10 }, fx: { funds: 20000 },
            outcome: "You remove the words \"critical,\" \"essential,\" and \"transformative\" eleven times each. The file fits. The proposal is somehow better." },
          { label: "Let it go, resubmit next cycle", fx: { meaning: 1, resilience: 2 },
            outcome: "You close the laptop. You go outside. It's a nice evening. The next deadline is in four months, and it will be exactly like this." }
        ] } }
    },

    rival_letter: {
      title: "External review letters", from: "Tenure & Promotion Office", levels: [6, 6], trigger: "phase:tenure_review:external",
      setup: () => { ensureRival(); },
      stages: { start: {
        body: "As a courtesy: the committee has solicited external letters for your case. One of the writers is {rival}.",
        choices: [
          { label: "Send {rival} a friendly note", fx: (s) => (s.story.rival?.relation ?? 0) >= 0 ? { rival: 10, score: 3 } : { rival: -5, score: -1 },
            outcome: (s) => (s.story.rival?.relation ?? 0) >= 0
              ? "{rival} replies warmly. Their letter calls you \"a generous colleague and a serious scholar.\" You'll never read it, but you hear."
              : "Your note reads as desperate, because it is. {rival}'s letter is two paragraphs long. One of them is about themselves." },
          { label: "Do nothing", fx: (s) => (s.story.rival?.relation ?? 0) >= 20 ? { score: 3 } : (s.story.rival?.relation ?? 0) <= -20 ? { score: -3 } : { score: 1 },
            outcome: (s) => (s.story.rival?.relation ?? 0) >= 20
              ? "{rival}'s letter is generous. Somewhere along the way you became friends."
              : (s.story.rival?.relation ?? 0) <= -20
                ? "{rival}'s letter praises your \"energy.\" Everyone on the committee knows what that means."
                : "{rival}'s letter is fair. That's the most you could have hoped for, honestly." }
        ], timeout: { seconds: 180, choice: 1 } } }
    },

    department_vote: {
      title: "(overheard, by the copier)", from: "A colleague who means well", levels: [6, 6], trigger: "phase:tenure_review:department",
      stages: { start: {
        body: "\"Between us: Hargreave is going to raise 'concerns' at the vote. Something about your 'service profile.' He did this to the last three people. Two of them are in industry now. One is a beekeeper.\"",
        choices: [
          { label: "Take Hargreave to lunch", cost: { energy: 20, money: 90 }, chance: { p: (s) => 0.4 + (s.traits?.agreeableness ?? 50) / 200,
              win:  { fx: { score: 4, network: 2 }, outcome: "Two hours on his sailboat, which he describes in loving, technical detail. At the vote, he says nothing. Silence, from Hargreave, is a standing ovation." },
              lose: { fx: { score: -1 }, outcome: "Hargreave orders the most expensive thing on the menu and talks about his sailboat. At the vote, he raises concerns anyway, about your \"collegiality at lunch.\"" } } },
          { label: "Pile up service, fast", cost: { energy: 30 }, fx: { score: 3, perm: { energyRegenMult: 0.98 } }, run: (s) => { s.story.service = (s.story.service ?? 0) + 2; },
            outcome: "You join two committees in a week. Your service profile is now \"exemplary.\" Your Wednesday afternoons are gone forever." },
          { label: "Trust your record", fx: (s) => ({ score: (s.publications ?? 0) >= 25 ? 3 : -1, meaning: 1 }),
            outcome: (s) => (s.publications ?? 0) >= 25 ? "Your record speaks. Hargreave's concerns take ninety seconds and nobody writes them down." : "Hargreave talks for twenty minutes. Your record is good. It wasn't louder." }
        ], timeout: { seconds: 180, choice: 2 } } }
    },

    tenure_letter: {
      title: "Re: your tenure case", from: "Office of the Provost", levels: [6, 6], trigger: "phase:tenure_review:decision", holds: true,
      stages: { start: {
        body: "A letter. Cream envelope, real stamp, your name typed slightly off-center. You can feel your heartbeat in the hand that's holding it.",
        choices: [
          { label: "Open it now, standing in the mailroom", fx: { score: 1, traits: { neuroticism: 1 } },
            outcome: "\"We are pleased to inform you…\" You read it four times. The department administrator, who already knew, hugs you." },
          { label: "Take it home and open it with someone", fx: { score: 1, meaning: 4 },
            outcome: "You open it at the kitchen table with the person who's been there for all of it. You both cry, and then you order the expensive takeout." },
          { label: "Don't open it for a week", fx: { traits: { neuroticism: 3 }, resilience: 2 },
            outcome: "Seven days with the envelope on your desk. You finally open it at 3 a.m. It was good news the whole time. Of course it was." }
        ], timeout: { seconds: 120, choice: 0 } } }
    },

    citation_ring: {
      title: "A proposal (off the record)", from: "A colleague in a nearby field", levels: [6, 9], weight: 1,
      stages: { start: {
        body: "\"We're all doing this, you know. You cite us, we cite you. Twelve of us. Nobody gets hurt and everybody's h-index goes up.\"",
        choices: [
          { label: "Shake on it", fx: { perm: { citationMult: 1.12 }, integrity: -12, flag: "citationRing" },
            outcome: "You're in. Your citations start climbing in a way that doesn't quite look natural, because it isn't." },
          { label: "Decline", fx: { integrity: 3 },
            outcome: "\"Suit yourself.\" Over the next year you're cited a little less by a certain twelve people." },
          { label: "Report it to the editor", fx: { integrity: 6, network: -4, reputation: 2 },
            outcome: "Three journals add a \"citation manipulation\" clause to their policies. Twelve people are no longer speaking to you." }
        ] } }
    },

    ai_ghostwriter: {
      title: "Write 10x more papers with AI", from: "A startup with no vowels in its name", levels: [6, 9], weight: 1,
      stages: { start: {
        body: "Hi! Our model writes papers in YOUR voice. Upload your CV and it does the rest: lit review, methods, discussion, even the cover letter. Early adopters include several deans.",
        choices: [
          { label: "Sign up", cost: { money: 3000 }, fx: { perm: { paperMult: 1.25 }, integrity: -10, flag: "aiGhost" },
            outcome: "Your output doubles. The papers sound like you, if you'd never had a bad day or a specific opinion." },
          { label: "Decline", fx: { meaning: 2 },
            outcome: "You keep writing the slow way, sentence by sentence, which is the only way you find out what you think." },
          { label: "Use it only for the cover letters", cost: { money: 300 }, fx: { perm: { writeCostMult: 0.98 } },
            outcome: "Your cover letters are now flawless and bland. Editors don't notice. Editors were never reading them." }
        ] } }
    },

    viral_thread: {
      title: "Your post is doing numbers", from: "Notifications (99+)", levels: [3, 9],
      when: (s) => !!s.perks?.academic_twitter || (s.identity?.network ?? 0) >= 25, weight: 1.5,
      setup: (s, q) => { q.data.topic = pickOne(TOPICS); },
      stages: {
        start: {
          body: "Your thread about {topic} has 41,000 likes. A journalist wants a quote. Three strangers have explained your own paper to you.",
          choices: [
            { label: "Lean in: start a newsletter", fx: { network: 10, perm: { citationMult: 1.05, energyRegenMult: 0.97 }, meaning: -2, flag: "publicFigure" },
              outcome: "You're a Content Creator now, technically. Your newsletter has 9,000 subscribers and you write it at midnight." },
            { label: "Log off for a week", fx: { energy: 60, meaning: 3 },
              outcome: "You log off. You go for walks. When you log back on, the internet has moved on, and so have you." },
            { label: "Reply to everyone", cost: { energy: 40 }, go: "pile", outcome: "You start replying. You do not stop." }
          ] },
        pile: {
          body: "Someone with an anime avatar has quote-posted you with a screenshot of your own paper. They're using it to argue the opposite of what it says. They have more followers than you.",
          choices: [
            { label: "Correct them, politely", cost: { energy: 10 }, fx: { traits: { neuroticism: 2 } },
              outcome: "They block you. Their screenshot of your paper gets 10,000 more likes." },
            { label: "Let it go", fx: { meaning: 2, resilience: 2 }, outcome: "You let it go. Somewhere, your paper is being wrong without you." }
          ] }
      }
    },

    erdos_collab: {
      title: "Quick collaboration?", from: "A mathematician with an Erdős number of 2", levels: [3, 9], weight: 1,
      when: (s) => erdosEligible() && (s.story.erdos == null || s.story.erdos > 3),
      stages: { start: {
        body: "Hello! A mutual friend says you have exactly the dataset I need for a small result. Twelve pages, two lemmas, one figure. Interested? (I coauthored with Erdős's coauthor in 1994. I mention this only because everyone asks.)",
        choices: [
          { label: "Yes. Absolutely yes.", cost: { energy: 25, knowledge: 80 }, fx: { pubs: 1, pubTier: "mid", erdos: 3, network: 3, flag: "erdos3" },
            outcome: "Twelve pages, two lemmas, one figure. Your Erdős number is now 3. You add it to your email signature, then remove it, then add it back." },
          { label: "Too busy, sorry", fx: { meaning: -1 },
            outcome: "You say no. You will think about this every time someone mentions their Erdős number at a party, which is more often than you'd think." }
        ] } }
    },

    // ═══ Tenured and beyond ══════════════════════════════════════════
    retention_offer: {
      title: "Would you consider joining us?", from: "Chair of a better-funded department", levels: [7, 8], weight: 1,
      stages: { start: {
        body: "We'd love to bring you here. Better lab, lighter teaching, a view of an actual body of water. Think it over?",
        choices: [
          { label: "Use it to get a retention raise", cost: { energy: 20 }, fx: { money: 30000, funds: 250000, reputation: -1 },
            outcome: "You show the offer to your dean. Your dean shows you a spreadsheet. Your salary goes up and your dean's opinion of you goes down by the same amount." },
          { label: "Take the job", fx: { prestige: 8, network: 4, meaning: -2, flag: "moved" }, run: (s) => { if (typeof assignUniversity === "function") assignUniversity(); },
            outcome: "You move. New city, new building, the same problems with better coffee. You still dream about your old office." },
          { label: "Decline, and mean it", fx: { meaning: 4 },
            outcome: "You stay. Your students cheer when they hear. One of them baked something. It's slightly burnt and perfect." }
        ] } }
    },

    dean_offer: {
      title: "Confidential", from: "The Provost", levels: [7, 8], weight: 1,
      stages: { start: {
        body: "We'd like you to consider serving as Dean. You'd have real influence over the direction of the college, a substantial stipend, and a reserved parking space.",
        choices: [
          { label: "Accept", fx: { money: 150000, prestige: 8, perm: { knowledgeMult: 0.85 }, meaning: -4, flag: "dean" },
            outcome: "You're Dean. You attend meetings about meetings. You approve a new logo. You have the parking space." },
          { label: "Decline", fx: { meaning: 2, reputation: 1 }, outcome: "You decline. The person they hire instead approves a new logo." },
          { label: "Negotiate a course release instead", cost: { energy: 25 }, fx: { perm: { energyRegenMult: 1.05 }, reputation: -1 },
            outcome: "No deanship, but a permanent course release, which you suspect was the real prize all along." }
        ] } }
    },

    book_deal: {
      title: "Have you thought about a general audience?", from: "An acquisitions editor", levels: [7, 9], when: (s) => pubs(s) >= 20, weight: 1.2,
      stages: { start: {
        body: "I loved your recent paper. Have you ever thought about writing for a general audience? Something like your work, but with a subtitle and a colon.",
        choices: [
          { label: "Write the trade book", cost: { drafts: 40, energy: 60 }, fx: { perm: { citationMult: 1.08 }, money: 40000, network: 6, flag: "tradeBook" },
            outcome: "A national newspaper reviews it. The review is mostly about the cover. You sell 30,000 copies and get invited to a festival with a tent." },
          { label: "Write a serious monograph instead", cost: { drafts: 30 }, fx: { prestige: 4, pubs: 1, pubTier: "high", meaning: 2 },
            outcome: "Three journals review your monograph over four years. One review is longer than a chapter of the book." },
          { label: "No time", outcome: "You say no. You start the book in your head anyway." }
        ] } }
    },

    sabbatical: {
      title: "Sabbatical approved", from: "Office of the Dean", levels: [7, 9], once: false, max: 2, weight: 1.2,
      stages: { start: {
        body: "Your sabbatical has been approved for the coming year. Please submit a brief report on your activities upon return.",
        choices: [
          { label: "Go to Paris", cost: { money: 15000 }, fx: { buff: "sabbatical_paris", traits: { openness: 3 }, meaning: 4 },
            outcome: "A year in Paris, in a library with no wifi. You come back with an accent you deny having." },
          { label: "Go to a remote field site", cost: { energy: 30 }, fx: { buff: "sabbatical_field", resilience: 5, meaning: 3 },
            outcome: "A year somewhere with more goats than people. You come back with data and a beard, or the spiritual equivalent." },
          { label: "Stay home and finish the book", fx: { drafts: 30, meaning: -1 },
            outcome: "You don't finish the book. You reorganize your office twice and write thirty drafts that are mostly the introduction." }
        ] } }
    },

    student_in_crisis: {
      title: "Can we talk?", from: "{student}", levels: [6, 9], when: () => labStudentCount() >= 1, weight: 1.5,
      setup: (s, q) => { q.data.student = pickLabStudentName() ?? "Your student"; },
      stages: { start: {
        body: "Hi. Can we talk sometime this week? I don't think I can finish. I haven't slept properly since the fall and I keep thinking everyone else is smarter.",
        choices: [
          { label: "Clear your afternoon", cost: { energy: 35 }, fx: { meaning: 6, morale: 15 },
            outcome: "You talk for two hours. Mostly you listen. You tell them about your own second year. They stay." },
          { label: "Tell them to push through", fx: { morale: -12, meaning: -3 },
            outcome: "\"Everyone feels like this. Push through.\" They nod. They leave for industry in March, and they're happier, which you hear about secondhand." },
          { label: "Walk them to the counseling center", cost: { energy: 10 }, fx: { morale: 6, meaning: 2 },
            outcome: "The counseling center has a six-week wait. You check in with {student} every Friday until then, and after." }
        ] } }
    },

    lab_server: {
      title: "URGENT: server failure", from: "IT Services (auto-generated)", levels: [6, 9], when: (s) => (s.drafts ?? 0) >= 60, weight: 0.8,
      stages: { start: {
        body: "The server hosting your lab's shared drive has failed. Ticket #48812 has been opened. Estimated time to resolution: unknown. Backups: unknown.",
        choices: [
          { label: "Restore from your own backups", req: (s) => (s.lab?.items?.server_rack || s.perks?.backup_habit) ? ok : { ok: false, reason: "You don't have backups" },
            fx: { resilience: 2 }, outcome: "You restore everything from the backups you've been quietly making for years. You become insufferable about it." },
          { label: "Pay a data recovery service", cost: { funds: 30000 },
            outcome: "A man in a van recovers 96% of everything. He doesn't say which 4%." },
          { label: "Accept the loss", fx: (s) => ({ drafts: -Math.floor((s.drafts ?? 0) * 0.3), meaning: 2, flag: "lostData" }),
            outcome: "You lose a third of your drafts. It turns out you remember most of them, and the rewrites are better." }
        ] } }
    },

    old_advisor_favor: {
      title: "Long time!", levels: [6, 8], when: (s) => (s.advisorHistory?.length ?? 0) > 0, weight: 1.5,
      setup: (s, q) => {
        const best = [...(s.advisorHistory ?? [])].sort((a, b) => (b.favor ?? 0) - (a.favor ?? 0))[0];
        q.data.oldAdvisor = best?.name ?? "Your old advisor";
      },
      stages: { start: {
        from: "{oldAdvisor}",
        body: "Long time! Quick favor: would you write the opening chapter for a volume I'm editing? You were always the best writer in the lab. Need it by the end of the month.",
        choices: [
          { label: "Of course", cost: { drafts: 8, energy: 30 }, fx: { meaning: 4, network: 5, pubs: 1, pubTier: "mid", flag: "helpedOldAdvisor" },
            outcome: "You write the chapter. {oldAdvisor} replies \"thx.\" It's the warmest thing they've ever written to you, and you know it." },
          { label: "Too busy, sorry", fx: { meaning: -2 },
            outcome: "{oldAdvisor} says \"no worries.\" You think about it every time you see their name." }
        ] } }
    },

    old_advisor_passes: {
      title: "Sad news", from: "Your old graduate program", levels: [8, 9], when: (s) => (s.advisorHistory?.length ?? 0) > 0, weight: 1,
      setup: (s, q) => { const a = (s.advisorHistory ?? []).find(x => x.stage === 3) ?? s.advisorHistory?.[0]; q.data.oldAdvisor = a?.name ?? "Your old advisor"; },
      stages: { start: {
        body: "It is with great sadness that we share that {oldAdvisor} has died. A memorial will be held next month. The family asks that, in lieu of flowers, you cite their work.",
        choices: [
          { label: "Go to the memorial", cost: { energy: 30 }, fx: { meaning: 6, network: 3, flag: "attendedMemorial" },
            outcome: "Forty former students come. You recognize half of them. Everyone tells the same three stories about {oldAdvisor}, and they're all true." },
          { label: "Write a remembrance", cost: { drafts: 3 }, fx: { meaning: 5, reputation: 1 },
            outcome: "You write about the time {oldAdvisor} read your first draft and said \"there's something here.\" You realize it's the thing you say to your own students." },
          { label: "Cite their work, as requested", fx: { meaning: 2 },
            outcome: "You cite them in your next paper. It's a small, strange way to say goodbye, which is how most academic things feel." }
        ] } }
    },

    opus_reviews: {
      title: "The first reviews are in", from: "Your editor at the press", levels: [7, 8], trigger: "phase:habilitation_opus:submission",
      stages: { start: {
        body: "The first two reader reports on \"{title}\". Reader A: \"a landmark.\" Reader B: \"a landmark, in the sense that one drives past it.\"",
        choices: [
          { label: "Revise for Reader B", cost: { energy: 40, drafts: 30 }, fx: { score: 4 },
            outcome: "You rewrite the middle third. Reader B's second report is one line: \"Better. Annoyingly.\"" },
          { label: "Publish as is", fx: { score: 1, landmark: 0.05 },
            outcome: "You publish it as is. Reader B reviews it again in a journal, under their own name. The review is longer than your chapter four." },
          { label: "Guess who Reader B is", fx: { score: -1, rival: -10 },
            outcome: "It's {rival}. You're sure of it. You're wrong, actually, but you'll never know that." }
        ], timeout: { seconds: 180, choice: 1 } } }
    },

    opus_reception: {
      title: "Book launch (wine and cheese)", from: "The university bookstore", levels: [7, 8], trigger: "phase:habilitation_opus:recognition", holds: true,
      stages: { start: {
        body: "Forty folding chairs, a stack of your books, a cheese plate going quietly translucent. Twenty-two people come. Six of them are your students, who were told to.",
        choices: [
          { label: "Read the chapter you love", fx: { score: 3, meaning: 4 },
            outcome: "You read the chapter nobody will cite and everybody who reads it will remember. A stranger in the back row asks you to sign it \"for my mother.\"" },
          { label: "Give the talk you give everywhere", fx: { score: 2, network: 2 },
            outcome: "It goes well. It always goes well. You could give it in your sleep, and some nights you do." },
          { label: "Spend the whole time thanking people", fx: { score: 1, meaning: 6 },
            outcome: "You thank your advisor, your students, the librarian who found the Danish dissertation, and the custodian who let you into the building at 2 a.m. for ten years." }
        ], timeout: { seconds: 150, choice: 1 } } }
    },

    festschrift: {
      title: "A volume in your honor", from: "Your former students", levels: [8, 9],
      when: (s) => labAlumniCount() >= 2 || (s.publications ?? 0) >= 60, weight: 2,
      stages: { start: {
        body: "We've been putting this together for a while, and now we can tell you: a festschrift, in your honor. Twelve chapters. We'd love for you to write the afterword.",
        choices: [
          { label: "Pretend to be surprised", fx: { meaning: 6, network: 5, perm: { citationMult: 1.10 }, flag: "festschrift" },
            outcome: "You're actually surprised. You pretend to be pretending. At the launch, a student you'd forgotten reads aloud a note you wrote in their margin twenty years ago." },
          { label: "Insist on reading every chapter", cost: { energy: 60 }, fx: { knowledge: 400, meaning: 2, perm: { citationMult: 1.06 }, flag: "festschrift" },
            outcome: "You send detailed comments to every author. The volume is delayed two years. It is, everyone agrees, much better." }
        ] } }
    },

    rival_prize: {
      title: "Award announcement", from: "Society newsletter", levels: [7, 9], when: (s) => !!s.story.rival, weight: 1,
      stages: { start: {
        body: "The Society is pleased to announce that this year's Distinguished Career Award goes to {rival}.",
        choices: [
          { label: "Send congratulations", fx: { meaning: 3, rival: 20 },
            outcome: "{rival} writes back: \"It should have been you, honestly.\" You decide to believe it, which is generous of you." },
          { label: "Write a pointed book review", cost: { drafts: 4 }, fx: { rival: -25, reputation: 1, integrity: -2 },
            outcome: "Your review of {rival}'s book is so precise it's cruel. Everyone reads it. Nobody says so." },
          { label: "Nominate yourself next year", fx: { ambition: 3, traits: { neuroticism: 1 } },
            outcome: "You start a folder called \"nomination materials.\" You add to it at 2 a.m." }
        ] } }
    },

    last_lecture: {
      title: "The Last Lecture series", from: "The Student Union", levels: [9, 9], weight: 1.5,
      stages: { start: {
        body: "Every spring, the students ask one professor to give a lecture as if it were their last. This year they asked you. The hall holds 400. They've already given out 500 tickets.",
        choices: [
          { label: "Talk about what you got wrong", fx: { meaning: 8, flag: "lastLecture" },
            outcome: "You spend an hour on your mistakes: the papers you'd retract, the students you'd treat better, the year you didn't call your mother. Nobody checks their phone." },
          { label: "Give your greatest hits", fx: { network: 4, citations: 500, flag: "lastLecture" },
            outcome: "Forty years in fifty minutes. They laugh at the jokes you've told since 1998. Some of them were told the jokes by their parents, who took your class." },
          { label: "Read them a poem and sit down", fx: { meaning: 5, traits: { openness: 2 }, flag: "lastLecture" },
            outcome: "You read Mary Oliver's \"Wild Geese\" and sit down. It's the shortest last lecture in the history of the series. It's the one they still talk about." }
        ] } }
    },

    emeritus_email: {
      title: "Your account will be deactivated", from: "IT Services (do not reply)", levels: [9, 9], weight: 1,
      stages: { start: {
        body: "As part of your transition to emeritus status, your university email account will be deactivated in 30 days. Please migrate any important correspondence.",
        choices: [
          { label: "Forward forty years of email to Gmail", cost: { energy: 30 }, fx: { knowledge: 200, meaning: 2 },
            outcome: "Forty years of email, 212,000 messages. You find the email from your advisor that just says \"yes.\" It was about the PhD offer. You print it." },
          { label: "Let it go", fx: { meaning: 4, energy: 50 },
            outcome: "You let it go. On the thirtieth day you feel lighter than you have since the tenure track." },
          { label: "Appeal to the Faculty Senate", cost: { energy: 20 }, fx: { reputation: 2, network: 2 },
            outcome: "The Faculty Senate forms a subcommittee. The subcommittee forms a working group. Your email account survives, because nobody can remember whose job it is to turn it off." }
        ] } }
    },

    // ═══ Ashley (only if you remember the heartbreak) ════════════════
    reunion: {
      title: "Class reunion!", from: "The Reunion Committee", levels: [6, 9], when: (s) => !!s.perks?.first_heartbreak, weight: 1.5,
      stages: {
        start: {
          body: "Can you believe it's been twenty years? Come celebrate with the old gang! Cash bar. Name tags. Ashley says she's coming!",
          choices: [
            { label: "Go", cost: { energy: 30 }, go: "there", outcome: "You buy a new shirt. You tell yourself it's unrelated." },
            { label: "You're too busy", fx: { meaning: -1, flag: "skippedReunion" },
              outcome: "You tell yourself you're busy. You are, technically. You look at the photos online at midnight." }
          ] },
        there: {
          body: "Ashley remembers you. Ashley read about your research. Ashley has questions about your methods section.",
          choices: [
            { label: "Explain the methods section", fx: { meaning: 5, traits: { neuroticism: -3 }, flag: "ashleyClosure" },
              outcome: "Ashley says it's \"actually really interesting.\" You walk to your car feeling twenty years lighter." },
            { label: "Mention your h-index", fx: { traits: { neuroticism: 2 }, flag: "ashleyHIndex" },
              outcome: "Ashley nods politely. You hear yourself say \"h-index\" twice. You will think about this for longer than is reasonable." },
            { label: "Leave early", outcome: "You leave before the slideshow. Some doors are better left as doors." }
          ] }
      }
    },

    ashley_likes: {
      title: "New notification", from: "Notifications", kind: "notice", levels: [7, 9], weight: 1,
      when: (s) => !!s.perks?.first_heartbreak && (storyFlag("publicFigure") || !!s.perks?.research_makes_news || !!s.perks?.public_intellectual),
      stages: { start: {
        body: "Ashley liked your post.",
        choices: [
          { label: "Like it back", fx: { meaning: 1, flag: "ashleyLiked" }, outcome: "You like it back. Nothing happens. It's nice." },
          { label: "Close the app", fx: { traits: { neuroticism: 1 } }, outcome: "You close the app. You open the app." }
        ] } }
    }
  };
})();

// =====================================================================
// THE INBOX PAPER
// =====================================================================
const MAIL_ICONS = { advisor: "fa-user-tie", student: "fa-user-graduate", saga: "fa-envelope", notice: "fa-bell" };

function renderInbox() {
  const el = ensurePanel("panel_inbox", "Inbox", "fa-inbox");
  if (!el) return;
  const mail = [...(state.inbox ?? [])].reverse();
  const everUsed = (state.mailSeq ?? 0) > 0;
  showPanel(el, everUsed);
  if (!everUsed) return;
  setPanelTitle(el, `Inbox${mail.length ? ` <span class="inbox-count">${mail.length}</span>` : ""}`);
  el.classList.toggle("inbox-unread", mail.some(m => !m.read));

  if (!mail.length) {
    setPanelBody(el, `<p class="inbox-empty">${pickInboxZero()}</p>`);
    return;
  }
  const html = mail.map(m => {
    const icon = MAIL_ICONS[m.kind] ?? MAIL_ICONS[m.source] ?? "fa-envelope";
    const choices = (m.choices ?? []).map((c, i) => {
      const st = mailChoiceStatus(m, i);
      const cost = costLabel(c.cost);
      const tip = st.ok ? (c.hint || cost) : st.reason;
      return `<button type="button" class="mail-choice" data-mail="${m.uid}" data-choice="${i}" ${st.ok ? "" : "disabled"} title="${escHTML(tip)}">${escHTML(c.label)}${cost || !st.ok ? `<small>${escHTML(st.ok ? cost : st.reason)}</small>` : ""}</button>`;
    }).join("");
    const close = m.choices?.length ? "" : `<button type="button" class="mail-choice mail-file" data-mail="${m.uid}" data-choice="-1">File it</button>`;
    const due = m.dueAt != null ? `<span class="mail-due" data-countdown="${m.uid}" title="Answer before this runs out, or they'll decide for you"></span>` : "";
    return `<article class="mail mail-${m.kind}" data-mail-uid="${m.uid}">
        <div class="mail-head"><i class="fa-solid ${icon}"></i> <span class="mail-from">${escHTML(m.from)}</span>${due}</div>
        <div class="mail-subject">${escHTML(m.subject)}</div>
        <div class="mail-body">${escHTML(m.body).replace(/\n/g, "<br>")}</div>
        <div class="mail-choices">${choices}${close}</div>
      </article>`;
  }).join("");
  setPanelBody(el, html);
  el.querySelectorAll("article.mail").forEach(art => {
    const m = findMail(Number(art.dataset.mailUid));
    const fresh = !!m && !m.read;
    if (art.classList.contains("mail-new") !== fresh) art.classList.toggle("mail-new", fresh);
  });
  el.querySelectorAll("[data-countdown]").forEach(span => {
    const m = findMail(Number(span.dataset.countdown));
    const left = m ? mailSecondsLeft(m) : null;
    const txt = left == null ? "" : `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
    if (span.textContent !== txt) span.textContent = txt;
    span.classList.toggle("mail-due-soon", left != null && left <= 15);
  });
}

let INBOX_ZERO_LINE = null;
function pickInboxZero() {
  if (!INBOX_ZERO_LINE || Math.random() < 0.002) INBOX_ZERO_LINE = pickOne([
    "Inbox zero. Enjoy it; it won't last.",
    "Nothing here. You refresh it anyway.",
    "Inbox zero. Somewhere, a dean is drafting a survey.",
    "All caught up. This has happened to you twice in your career.",
    "Empty. Even the International Journal of Advanced Everything is quiet."
  ]);
  return INBOX_ZERO_LINE;
}

// The landmark paper's Retitle button (render.js draws it)
function askRetitle(landmarkId) {
  const def = window.LANDMARKS?.[landmarkId];
  askText({
    title: `Retitle your ${def?.label?.toLowerCase() ?? "work"}`,
    body: "Committees love a colon. Readers love a short title. You can't have both, and you'll try anyway.",
    value: state.workingTitles?.[landmarkId] ?? "", maxLength: 140, yes: "Retitle"
  }, (text) => { if (!retitleLandmark(landmarkId, text)) return "It needs at least a word."; return null; });
}

if (typeof document !== "undefined") {
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("button.mail-choice, button[data-retitle]");
    if (!btn || btn.disabled) return;
    if (btn.dataset.retitle) { askRetitle(btn.dataset.retitle); return; }
    const uid = Number(btn.dataset.mail), idx = Number(btn.dataset.choice);
    if (idx === -1) dismissMail(uid); else answerMail(uid, idx);
    render();
  });
  document.addEventListener("pointerover", (e) => {
    const art = e.target.closest?.("article.mail.mail-new");
    if (art) { markMailRead(Number(art.dataset.mailUid)); art.classList.remove("mail-new"); }
  });
}

// ── Wiring ────────────────────────────────────────────────────────────
onHook("tick", () => { tickInbox(); tickSagas(); });
onHook("render", renderInbox);
onHook("modifiers", applyStoryModifiers);
onHook("landmarkStart", (def) => {
  state.workingTitles = state.workingTitles ?? {};
  if (!state.workingTitles[def.id]) {
    const t = workingTitleFor(def.id);
    if (t) state.workingTitles[def.id] = t;
  }
  state.landmarkScore = 0;
});
onHook("landmarkPhase", (def, phase) => { if (phase) triggerSagas(`phase:${def.id}:${phase.id}`); });
onHook("landmarkArtifact", gradeLandmark);
onHook("landmarkHeld", landmarkHeldBySaga);
onHook("load", () => {
  // A landmark already under way (an older save) gets its working title
  const def = activeLandmarkDef();
  if (def && !state.workingTitles?.[def.id]) {
    const t = workingTitleFor(def.id);
    if (t) (state.workingTitles = state.workingTitles ?? {})[def.id] = t;
  }
});
