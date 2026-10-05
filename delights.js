// delights.js — the small pleasures (and small cruelties)
//
// BUFFS. Temporary effects with a timer: coffee, then the crash; an
// all-nighter, then being fried; a semester in Paris. They fold into the
// modifiers while they last and show as rubber stamps under the energy bar.
//
// RITUALS. Things you do to yourself on purpose: brew coffee, pull an
// all-nighter, go for a walk, check Google Scholar again.
//
// SKILLS. Arcanum-style: the things you do often you get better at. Every
// click trains a skill, and every level makes that kind of work cheaper in
// energy and better in output, so the late game gets lighter instead of
// heavier. Each level has a title, because academics love a title.
//
// SERENDIPITY. Every so often something turns up on your desk for a few
// seconds: an idea, free pizza, a forgotten draft, a viral preprint. Click
// it before it's gone. If your integrity has slipped, some of what turns up
// is less friendly, and much more tempting.
//
// DISTINCTIONS. Achievements, framed on the wall. Each one adds 1% to what
// you learn and how much you're cited, so collecting them isn't pure vanity.
//
// THE DAILY FOOTNOTE. A campus paper on your desk, one headline at a time.
// It follows your career, and in the endgame it loses the plot.
//
// FLOATERS. When a click earns something, the number floats off the button.

"use strict";

Object.assign(DEFAULT_STATE, {
  buffs: [],                                 // [{ id, until }] in gameTicks
  serendipity: { nextAt: 1200, clicked: 0, missed: 0, dark: 0 },
  honors: {},                                // id → gameTicks earned
  gazette: { headline: null, nextAt: 0, seen: [], issue: 0 },
  skills: { reading: 0, writing: 0, grantsmanship: 0, mentoring: 0 },   // XP
  scholar: { lastCites: 0, checks: 0 }
});

// ── Buffs ─────────────────────────────────────────────────────────────
// mods: "…Mult" keys multiply, the rest add. then: the buff that follows.
window.BUFFS = {
  coffee:           { label: "Caffeinated",           icon: "fa-mug-hot",           seconds: 30,  mods: { energyRegenMult: 1.6 }, then: "crash" },
  crash:            { label: "Caffeine crash",        icon: "fa-face-tired",        seconds: 20,  mods: { energyRegenMult: 0.55 }, bad: true },
  jitters:          { label: "The jitters",           icon: "fa-heart-pulse",       seconds: 25,  mods: { writeCostMult: 1.4, energyRegenMult: 0.7 }, bad: true },
  pizza:            { label: "Free pizza",            icon: "fa-pizza-slice",       seconds: 20,  mods: { energyRegenMult: 2 } },
  flow:             { label: "Flow state",            icon: "fa-water",             seconds: 30,  mods: { writeCostMult: 0.5 } },
  frenzy:           { label: "Viral preprint",        icon: "fa-fire-flame-curved", seconds: 30,  mods: { citationMult: 7 } },
  reviewer_holiday: { label: "Reviewer 2 on holiday", icon: "fa-umbrella-beach",    seconds: 60,  mods: { paperQualityBonus: 25 } },
  all_nighter:      { label: "Running on fumes",      icon: "fa-moon",              seconds: 40,  mods: { knowledgeMult: 1.35, writeCostMult: 0.85 }, then: "fried" },
  fried:            { label: "Fried",                 icon: "fa-bed",               seconds: 30,  mods: { energyRegenMult: 0.4, knowledgeMult: 0.8 }, bad: true },
  walk:             { label: "Fresh air",             icon: "fa-person-walking",    seconds: 25,  mods: { energyRegenMult: 1.7 } },
  retreat:          { label: "Writing retreat",       icon: "fa-tree",              seconds: 60,  mods: { writeCostMult: 0.55, energyCostMult: 0.7 } },
  sabbatical_paris: { label: "Sabbatical (Paris)",    icon: "fa-wine-glass",        seconds: 150, mods: { knowledgeMult: 2.2, citationMult: 1.2 } },
  sabbatical_field: { label: "Sabbatical (field)",    icon: "fa-mountain-sun",      seconds: 150, mods: { writeCostMult: 0.5, paperMult: 1.5 } },
  sabbatical:       { label: "On sabbatical",         icon: "fa-plane-departure",   seconds: 120, mods: { knowledgeMult: 2, energyRegenMult: 1.5 } },
  golden_hour:      { label: "Golden hour",           icon: "fa-sun",               seconds: 20,  mods: { knowledgeMult: 3, citationMult: 3 } },
  bad_press:        { label: "Bad press",             icon: "fa-newspaper",         seconds: 45,  mods: { citationMult: 0.5 }, bad: true },
  conference:       { label: "Conference high",       icon: "fa-id-badge",          seconds: 40,  mods: { knowledgeMult: 1.5, energyRegenMult: 1.2 } },
  doomscroll:       { label: "Doomscrolling",         icon: "fa-mobile-screen",     seconds: 15,  mods: { energyRegenMult: 0.8 }, bad: true },
  muse:             { label: "The muse",              icon: "fa-feather",           seconds: 25,  mods: { paperQualityBonus: 15, writeCostMult: 0.8 } }
};

function buffDef(id) { return window.BUFFS[id] ?? null; }

function addBuff(id, seconds) {
  const def = buffDef(id);
  if (!def) return false;
  state.buffs = state.buffs ?? [];
  const stretch = def.bad ? 1 : (state.modifiers?.buffDurationMult ?? 1);
  const until = (state.gameTicks ?? 0) + ticksFromSeconds((seconds ?? def.seconds) * stretch);
  const existing = state.buffs.find(b => b.id === id);
  if (existing) existing.until = Math.max(existing.until, until);
  else state.buffs.push({ id, until });
  rebuildModifiers();
  return true;
}

function hasBuff(id) { return (state.buffs ?? []).some(b => b.id === id); }

function buffSecondsLeft(b) {
  return Math.max(0, Math.ceil((b.until - (state.gameTicks ?? 0)) * TICK_MS / 1000));
}

function tickBuffs() {
  const now = state.gameTicks ?? 0;
  const done = (state.buffs ?? []).filter(b => now >= b.until);
  if (!done.length) return;
  state.buffs = state.buffs.filter(b => now < b.until);
  for (const b of done) {
    const next = buffDef(b.id)?.then;
    if (next) addBuff(next);
  }
  rebuildModifiers();
}

function applyBuffModifiers(m) {
  for (const b of state.buffs ?? []) {
    const def = buffDef(b.id);
    if (!def?.mods) continue;
    for (const [k, v] of Object.entries(def.mods)) {
      if (typeof m[k] !== "number") continue;
      if (k.endsWith("Mult")) m[k] *= v; else m[k] += v;
    }
  }
}

function giveEnergy(fraction) {
  state.energy = Math.min(maxEnergy(), (state.energy ?? 0) + maxEnergy() * fraction);
}

// ── Rituals (actions with buffs attached) ─────────────────────────────
// Added to ACTIONS so the core dispatcher handles visibility and costs.
(() => {
  const A = window.ACTIONS;
  if (!A) return;
  const notBurned = () => inCooldown() ? { ok: false, reason: "burned out" } : { ok: true, reason: "" };

  A.brew_coffee = {
    id: "brew_coffee", label: "Brew Coffee", icon: "fa-mug-hot", placement: "panel",
    blurb: () => (state.counters?.coffees ?? 0) % 3 === 2
      ? "A third cup. You know how this ends."
      : "Twenty minutes of feeling like a person.",
    visibleWhen: (s) => !!(s.perks?.moka_pot || s.lab?.items?.espresso || s.levelIndex >= 3),
    canDo: () => {
      if (inCooldown()) return { ok: false, reason: "burned out" };
      if (hasBuff("crash") || hasBuff("jitters")) return { ok: false, reason: "still crashing" };
      if (hasBuff("coffee")) return { ok: false, reason: "still caffeinated" };
      return { ok: true, reason: "" };
    },
    detail: () => "+25% energy, then a crash",
    cost: { energy: 0 },
    effects: () => [],
    apply: (s) => {
      s.counters.coffees = (s.counters.coffees ?? 0) + 1;
      giveEnergy(0.25);
      // Three cups inside two and a half minutes: the jitters, not the buzz
      s.story.coffeeTimes = (s.story.coffeeTimes ?? []).filter(t => (s.gameTicks ?? 0) - t < 1500);
      s.story.coffeeTimes.push(s.gameTicks ?? 0);
      if (s.story.coffeeTimes.length >= 3) {
        addBuff("jitters");
        s.story.coffeeTimes = [];
        pushNews("Third cup. Your hands are vibrating at a frequency only dogs can hear.");
      } else {
        addBuff("coffee");
        if (s.counters.coffees === 1) pushNews("Your first real coffee. It tastes like a decision.");
      }
    }
  };

  A.all_nighter = {
    id: "all_nighter", label: "Pull an All-Nighter", icon: "fa-moon", placement: "panel",
    blurb: "Borrow energy from tomorrow. Tomorrow will want it back, with interest.",
    visibleWhen: (s) => s.levelIndex >= 1,
    canDo: (s) => {
      if (inCooldown()) return { ok: false, reason: "burned out" };
      if (hasBuff("fried") || hasBuff("all_nighter")) return { ok: false, reason: "still fried" };
      if ((s.energy ?? 0) > maxEnergy() * 0.4) return { ok: false, reason: "not tired enough yet" };
      return { ok: true, reason: "" };
    },
    detail: () => "+60% energy, then fried",
    cost: { energy: 0 },
    effects: () => [],
    apply: (s) => {
      giveEnergy(0.6);
      addBuff("all_nighter");
      s.counters.allNighters = (s.counters.allNighters ?? 0) + 1;
      pushNews(pickOne([
        "3 a.m. The hum of the vending machine is the only other living thing. You write your best paragraph of the year.",
        "You watch the sun come up from the library. It's beautiful. You feel terrible.",
        "4:12 a.m. You've rewritten the same sentence nine times. The ninth one is perfect. You'll delete it tomorrow."
      ]));
    }
  };

  A.go_for_walk = {
    id: "go_for_walk", label: "Go for a Walk", icon: "fa-person-walking", placement: "panel",
    blurb: "Outside. The place with the weather. Kant did this every day at 3:30.",
    visibleWhen: (s) => s.levelIndex >= 2,
    canDo: () => inCooldown() ? { ok: false, reason: "burned out" } : hasBuff("walk") ? { ok: false, reason: "already out" } : { ok: true, reason: "" },
    detail: () => "faster energy for a bit",
    cost: { energy: 0 },
    effects: () => [],
    apply: (s) => {
      addBuff("walk");
      if ((s.gameTicks ?? 0) - (s.story.lastWalkAt ?? -1e9) > ticksFromSeconds(120)) { applyStoryEffects({ meaning: 0.3 }); s.story.lastWalkAt = s.gameTicks ?? 0; }
      s.counters.walks = (s.counters.walks ?? 0) + 1;
      if (Math.random() < 0.12) {
        addBuff("muse");
        pushNews("Halfway around the quad, the answer arrives, fully formed, like it was waiting for you to stop looking.");
      }
    }
  };

  A.writing_retreat = {
    id: "writing_retreat", label: "Book a Writing Retreat", icon: "fa-tree", placement: "panel",
    blurb: "A cabin, no wifi, and the creeping suspicion that you were the problem all along.",
    visibleWhen: (s) => s.levelIndex >= 3,
    canDo: (s) => {
      if (hasBuff("retreat")) return { ok: false, reason: "already away" };
      const price = retreatPrice(s);
      if (!canPay(price)) return { ok: false, reason: `needs $${fmtBig(outOfPocket(price))}` };
      return notBurned();
    },
    detail: (s) => `$${fmtBig(outOfPocket(retreatPrice(s)))}: cheaper writing for a minute`,
    cost: { energy: 0 },
    effects: () => [],
    apply: (s) => { pay(retreatPrice(s)); addBuff("retreat"); }
  };

  A.check_scholar = {
    id: "check_scholar", label: "Check Google Scholar", icon: "fa-magnifying-glass-chart", placement: "panel",
    blurb: "Just to see. Just once. (Again.)",
    visibleWhen: (s) => (s.publications ?? 0) >= 1,
    canDo: () => ({ ok: true, reason: "" }),
    detail: () => "",
    cooldownMs: 15000,
    cost: { energy: 0 },
    effects: () => [],
    apply: (s) => {
      const now = calcTotalCitations();
      const gained = now - (s.scholar.lastCites ?? 0);
      s.scholar.lastCites = now;
      s.scholar.checks = (s.scholar.checks ?? 0) + 1;
      addBuff("doomscroll");
      let line;
      if (s.scholar.checks === 1) line = `You check Google Scholar for the first time. ${fmtBig(now)} citation${now === 1 ? "" : "s"}. ${now === 0 ? "Not even you have cited you yet." : now <= 2 ? "One of them is you." : "You screenshot it."}`;
      else if (gained <= 0) line = pickOne([
        "No new citations since you last checked, eleven minutes ago.",
        "Still the same number. You refresh. Still the same number.",
        "No change. Google Scholar has, however, found a paper by someone with your name, which it has given to you.",
        "Nothing new. You check your rival's profile instead. That was a mistake."
      ]);
      else if (gained < 5) line = `${gained} new citation${gained === 1 ? "" : "s"}! You read ${gained === 1 ? "it" : "them"} to see if they agree with you. ${gained === 1 ? "It cites you in a list of twelve." : "They cite you in lists."}`;
      else line = `${fmtBig(gained)} new citations since you last looked. You feel briefly, dangerously, like a real scholar.`;
      if (gained > 0) applyStoryEffects({ meaning: 0.1 });
      pushNews(line);
    }
  };

  function retreatPrice(s) { return [0, 0, 0, 400, 800, 300, 1500, 4000, 8000, 15000][s.levelIndex] ?? 400; }
})();

// Flow state: writing costs no energy while it lasts
function buffEnergyCost(mult, actionId) {
  if (actionId === "write" && hasBuff("flow")) return 0;
  return mult;
}

// ── Skills ────────────────────────────────────────────────────────────
// Train by doing. Each level: that kind of work costs less energy, and
// the skill's own bonus grows. Titles are earned; numbers are for the CV.
window.SKILLS = {
  reading: {
    label: "Close Reading", icon: "fa-glasses",
    train: { study_textbooks: 1, study_papers: 1, review_manuscript: 2 },
    bonus: (L) => `+${3 * L}% knowledge`,
    mods: (m, L) => { m.knowledgeMult *= 1 + 0.03 * L; },
    titles: ["Reads the title", "Reads the abstract", "Reads the abstract and the figures", "Reads the methods (voluntarily)",
             "Reads the footnotes for fun", "Reads the supplementary materials", "Reads it in the original German",
             "Reads Finnegans Wake (twice)", "Reads between the lines of the lines", "Reads reviewers' minds",
             "Reads the room, and the room's citations", "Has read everything; is reading it again"]
  },
  writing: {
    label: "Prose", icon: "fa-pen-nib",
    train: { write: 1, publish: 3, advisor_chapter: 3 },
    bonus: (L) => `writing costs ${Math.round((1 - Math.pow(0.975, L)) * 100)}% less knowledge`,
    mods: (m, L) => { m.writeCostMult *= Math.pow(0.975, L); m.paperQualityBonus += L * 0.5; },
    titles: ["Passive voice was used", "Topic sentences, mostly", "Knows what a semicolon is for; uses it anyway",
             "Can go a page without \"However,\"", "Writes the abstract last, like a pro", "Kills darlings without remorse",
             "Strunk & White would nod", "Reviewers quote your sentences back to you", "Prose described as \"limpid\" in a review",
             "Writes like Didion, cites like Foucault", "Your drafts don't need drafts", "Has a prose style other people imitate badly"]
  },
  grantsmanship: {
    label: "Grantsmanship", icon: "fa-file-invoice-dollar",
    train: { write_grant: 2, self_fund: 1 },
    bonus: (L) => `+${L}% grant success`,
    mods: (m, L) => { m.grantChance += 0.01 * L; },
    titles: ["Doesn't know what F&A means", "Knows what F&A means, is furious", "Can pad a budget justification",
             "Speaks fluent \"Broader Impacts\"", "Has a boilerplate folder", "Program officers return your calls",
             "Writes Specific Aims in one sitting", "Your biosketch has a biosketch", "Study sections fear you",
             "Agencies ask what you'd fund", "Funded for an idea you haven't had yet", "The money finds you"]
  },
  mentoring: {
    label: "Mentoring", icon: "fa-people-arrows",
    train: { recruit_grad: 3, run_study: 1 },
    bonus: (L) => `students write ${5 * L}% more drafts`,
    mods: (m, L) => { m.gradDraftMult *= 1 + 0.05 * L; m.gradMorale += 0.008 * L; },
    titles: ["\"My door is always open\" (it's closed)", "Remembers their names", "Remembers their projects",
             "Reads drafts within a month", "Reads drafts within a week", "Writes letters that say specific things",
             "Named in the acknowledgments, sincerely", "Former students send holiday cards", "Students cite you in their own students' theses",
             "A middle name, somewhere, is yours", "Your academic family tree needs a second page", "Everyone was once your student"]
  }
};

const SKILL_ACTIONS = {};    // actionId → skill id, for the energy discount
for (const [sid, sk] of Object.entries(window.SKILLS)) for (const a of Object.keys(sk.train)) SKILL_ACTIONS[a] = sid;
SKILL_ACTIONS.advisor_email = "writing"; SKILL_ACTIONS.advisor_meeting = "reading"; SKILL_ACTIONS.advisor_grunt = "grantsmanship";

function skillXpFor(L) { return Math.round(8 * Math.pow(1.42, L)); }       // XP to go from L to L+1
function skillLevel(id) {
  let xp = state.skills?.[id] ?? 0, L = 0;
  while (xp >= skillXpFor(L) && L < 60) { xp -= skillXpFor(L); L++; }
  return L;
}
function skillProgress(id) {
  let xp = state.skills?.[id] ?? 0, L = 0;
  while (xp >= skillXpFor(L) && L < 60) { xp -= skillXpFor(L); L++; }
  return { level: L, into: xp, need: skillXpFor(L) };
}
function skillTitle(id, L = skillLevel(id)) {
  const t = window.SKILLS[id].titles;
  return L < t.length ? t[L] : `${t[t.length - 1]} (${L})`;
}

function trainSkill(id, xp) {
  if (!window.SKILLS[id] || !xp) return;
  const before = skillLevel(id);
  state.skills[id] = (state.skills[id] ?? 0) + xp * (state.modifiers?.skillXpMult ?? 1);
  const after = skillLevel(id);
  if (after > before) {
    pushNews(`${window.SKILLS[id].label} improved: "${skillTitle(id, after)}."`);
    rebuildModifiers();
  }
}

function skillEnergyCost(mult, actionId) {
  const sid = SKILL_ACTIONS[actionId];
  if (!sid) return mult;
  return mult * Math.max(0.4, 1 - 0.025 * skillLevel(sid));
}

function applySkillModifiers(m) {
  for (const [id, sk] of Object.entries(window.SKILLS)) {
    const L = skillLevel(id);
    if (L) sk.mods(m, L);
  }
}

function renderSkills() {
  const el = ensurePanel("panel_skills", "Skills", "fa-chart-simple");
  if (!el) return;
  const any = Object.values(state.skills ?? {}).some(x => x > 0);
  showPanel(el, any && state.levelIndex >= 1);
  if (!any) return;
  const rows = Object.entries(window.SKILLS).map(([id, sk]) => {
    const p = skillProgress(id);
    const pct = Math.round(100 * p.into / p.need);
    const disc = Math.round((1 - Math.max(0.4, 1 - 0.025 * p.level)) * 100);
    return `<div class="skill" title="${escHTML(`${sk.bonus(p.level)}; related actions cost ${disc}% less energy`)}">
      <div class="skill-head"><i class="fa-solid ${sk.icon}"></i> <strong>${sk.label}</strong> <span class="skill-lvl">${p.level}</span></div>
      <div class="skill-title">${escHTML(skillTitle(id, p.level))}</div>
      <div class="skill-bar"><div class="skill-fill" style="width:${pct}%"></div></div>
    </div>`;
  }).join("");
  setPanelBody(el, rows);
}

// ── Serendipity ───────────────────────────────────────────────────────
const SERENDIPITY_LIFETIME = 130;          // ticks on the desk (13 s)
const SERENDIPITY_GAP      = [900, 2400];  // ticks between appearances

function serendipityMoney(s) {
  return [25, 60, 150, 250, 600, 300, 2500, 8000, 25000, 80000][s.levelIndex] ?? 100;
}

window.SERENDIPITY = [
  { id: "eureka", icon: "fa-lightbulb", label: "An idea", weight: 4,
    run: (s) => {
      const gain = Math.round(Math.max(20, Math.min((s.knowledge ?? 0) * 0.15, writeCost() * 15)));
      s.knowledge += gain;
      return { text: pickOne([`Eureka, in the shower. +${fmtBig(gain)} knowledge.`,
                              `A footnote in a 1974 paper changes everything. +${fmtBig(gain)} knowledge.`,
                              `You finally understand a paper you pretended to understand in seminar. +${fmtBig(gain)} knowledge.`]),
               float: `+${fmtBig(gain)} knowledge` };
    } },
  { id: "pizza", icon: "fa-pizza-slice", label: "Free food", weight: 3,
    run: () => {
      state.energy = maxEnergy();
      addBuff("pizza");
      return { text: pickOne(["Leftover pizza from a seminar you didn't attend. Full energy.",
                              "Email subject: \"FREE FOOD 3rd floor lounge.\" You arrive in ninety seconds, before the email finishes loading. Full energy.",
                              "Catered sandwiches from a job talk. You take three \"for later.\" Full energy."]), float: "Full energy" };
    } },
  { id: "flow", icon: "fa-water", label: "The zone", weight: 2, when: (s) => (s.totalDraftsEver ?? 0) >= 5,
    run: () => { addBuff("flow"); return { text: "You hit the zone. For thirty seconds, writing costs no energy at all.", float: "Flow state" }; } },
  { id: "viral", icon: "fa-fire-flame-curved", label: "Your preprint is trending", weight: 2, when: (s) => (s.publications ?? 0) >= 1,
    run: () => { addBuff("frenzy"); return { text: "Your preprint is trending. Someone with a blue checkmark called it \"wild.\" Citations ×7 for thirty seconds.", float: "Citations ×7" }; } },
  { id: "holiday", icon: "fa-umbrella-beach", label: "An out-of-office reply", weight: 1.5, when: (s) => s.levelIndex >= 3,
    run: () => { addBuff("reviewer_holiday"); return { text: "Reviewer 2 is on holiday. Everything you submit for a minute reads better.", float: "Better reviews" }; } },
  { id: "coat", icon: "fa-money-bill-wave", label: "Something in a book", weight: 2,
    run: (s) => {
      const n = serendipityMoney(s);
      s.money = (s.money ?? 0) + n;
      return { text: pickOne([`$${fmtBig(n)} in an old coat pocket. You decide not to question it.`,
                              `$${fmtBig(n)} tucked in a library book as a bookmark, apparently since 1987.`,
                              `A refund check from a conference you forgot you registered for: $${fmtBig(n)}.`]), float: `+$${fmtBig(n)}` };
    } },
  { id: "old_draft", icon: "fa-file-circle-plus", label: "A forgotten folder", weight: 2, when: (s) => (s.totalDraftsEver ?? 0) >= 10,
    run: (s) => {
      const n = Math.max(2, Math.round((s.drafts ?? 0) * 0.08));
      s.drafts += n; s.totalDraftsEver += n; onDraftsGained(n);
      return { text: pickOne([`You find ${fmtBig(n)} drafts in a folder called "misc FINAL". Some of them are good.`,
                              `A flash drive labeled "THESIS BACKUP 3 (USE THIS ONE)". ${fmtBig(n)} drafts you'd forgotten.`]), float: `+${fmtBig(n)} drafts` };
    } },
  { id: "advisor_mood", icon: "fa-face-smile", label: "Your advisor, smiling", weight: 1.5, when: (s) => !!s.advisor && s.advisor.archetype !== "ghost",
    run: (s) => { adjustFavor(12); return { text: `${s.advisor.name} is in a great mood today and stops by your desk to say so.`, float: "+12 rapport" }; } },
  { id: "cookies", icon: "fa-cookie-bite", label: "Cookies in the lab", weight: 1.5, when: () => labStudentCount() > 0,
    run: () => { adjustAllMorale(8); return { text: "A student brought homemade cookies to lab meeting. Everyone's a little nicer all week.", float: "Morale up" }; } },
  { id: "laureate", icon: "fa-medal", label: "A famous citation", weight: 1, when: (s) => (s.publications ?? 0) >= 3,
    run: () => {
      const n = Math.max(5, Math.round(calcTotalCitations() * 0.05));
      addCitations(n);
      return { text: `A Nobel laureate cites your paper on page 1 and calls it "elegant." +${fmtBig(n)} citations as everyone goes to look.`, float: `+${fmtBig(n)} citations` };
    } },
  { id: "hawaii", icon: "fa-plane", label: "An acceptance email", weight: 1.2, when: (s) => s.levelIndex >= 2,
    run: () => { addBuff("conference"); return { text: "Your abstract is accepted at a conference in Honolulu. You learn more at the poster session than in a semester.", float: "Conference high" }; } },
  { id: "golden", icon: "fa-sun", label: "Late afternoon light", weight: 0.6, when: (s) => s.levelIndex >= 6,
    run: () => { addBuff("golden_hour"); return { text: "The light through the window turns gold, and so does everything you touch, for twenty seconds.", float: "Everything ×3" }; } },

  // The dark ones: only when your integrity has slipped. Generous. Risky.
  { id: "clean_data", icon: "fa-eye", label: "Data that's a little too clean", weight: 3, dark: true,
    run: (s) => {
      if (Math.random() < 0.4) {
        addPrestige(-2); addBuff("bad_press");
        return { text: "A sleuth on PubPeer has questions about Figure 3. Retraction Watch would like a comment. Citations halve for a while.", float: "Bad press" };
      }
      const gain = Math.round(Math.max(30, (s.knowledge ?? 0) * 0.25));
      s.knowledge += gain;
      return { text: `A "collaborator" sends data that's a little too clean. You use it. +${fmtBig(gain)} knowledge.`, float: `+${fmtBig(gain)} knowledge`, fx: { integrity: -3 } };
    } },
  { id: "paper_mill", icon: "fa-industry", label: "An authorship offer", weight: 2, dark: true, when: (s) => s.levelIndex >= 3,
    run: () => {
      if (Math.random() < 0.3) {
        addStoryPapers(-1);
        return { text: "The paper mill you bought authorship from is exposed. Your paper is retracted along with 400 others. Your name is on a list.", float: "Retracted", fx: { integrity: -2, flag: "paperMill" } };
      }
      addStoryPapers(2, "mid");
      return { text: "An email offers \"authorship slots\" on two papers, $400 each, no questions. You don't ask any. +2 papers.", float: "+2 papers", fx: { integrity: -4, flag: "paperMill" } };
    } }
];

let SERENDIPITY_ACTIVE = null;     // { def, el, until } — runtime only, never saved

function serendipityRate() { return foldHooks("serendipityRate", 1); }

function tickSerendipity() {
  const S = state.serendipity;
  const now = state.gameTicks ?? 0;
  if (SERENDIPITY_ACTIVE) {
    if (now >= SERENDIPITY_ACTIVE.until) {
      S.missed = (S.missed ?? 0) + 1;
      removeSerendipity();
    }
    return;
  }
  if (now < (S.nextAt ?? 0)) return;
  const [lo, hi] = SERENDIPITY_GAP;
  S.nextAt = now + Math.round(randInt(lo, hi) / serendipityRate());
  spawnSerendipity();
}

function pickSerendipity() {
  const dark = (state.story?.integrity ?? 70) < 40;
  const pool = window.SERENDIPITY.filter(d => (d.dark ? dark : true) && (!d.when || d.when(state)));
  return pool.length ? pool[weightedIndex(pool.map(d => d.weight))] : null;
}

function spawnSerendipity(forceId) {
  if (typeof document === "undefined") return null;
  const def = forceId ? window.SERENDIPITY.find(d => d.id === forceId) : pickSerendipity();
  if (!def) return null;
  removeSerendipity();
  const el = document.createElement("button");
  el.type = "button";
  el.className = "serendipity" + (def.dark ? " serendipity-dark" : "");
  el.title = def.label;
  el.setAttribute("aria-label", def.label);
  el.innerHTML = `<i class="fa-solid ${def.icon}"></i>`;
  const w = window.innerWidth || 1024, h = window.innerHeight || 768;
  el.style.left = `${Math.round(60 + Math.random() * Math.max(100, w - 160))}px`;
  el.style.top  = `${Math.round(110 + Math.random() * Math.max(100, h - 300))}px`;
  el.addEventListener("click", () => clickSerendipity());
  document.body.appendChild(el);
  SERENDIPITY_ACTIVE = { def, el, until: (state.gameTicks ?? 0) + SERENDIPITY_LIFETIME };
  return el;
}

function removeSerendipity() {
  if (SERENDIPITY_ACTIVE?.el) SERENDIPITY_ACTIVE.el.remove();
  SERENDIPITY_ACTIVE = null;
}

function clickSerendipity() {
  const act = SERENDIPITY_ACTIVE;
  if (!act) return false;
  const rect = act.el.getBoundingClientRect?.() ?? { left: 0, top: 0, width: 0 };
  removeSerendipity();
  const res = act.def.run(state) ?? {};
  if (res.fx) applyStoryEffects(res.fx);
  state.serendipity.clicked = (state.serendipity.clicked ?? 0) + 1;
  if (act.def.dark) state.serendipity.dark = (state.serendipity.dark ?? 0) + 1;
  if (res.text) pushNews(res.text);
  if (res.float) spawnFloater(res.float, rect.left + rect.width / 2, rect.top, "floater-big");
  runHooks("serendipity", act.def.id);
  rebuildModifiers();
  tryLevelUp();
  render();
  return true;
}

// ── Floaters ──────────────────────────────────────────────────────────
let LAST_POINTER = { x: null, y: null };
if (typeof document !== "undefined") {
  document.addEventListener("pointerdown", (e) => { LAST_POINTER = { x: e.clientX, y: e.clientY }; }, true);
}

function spawnFloater(text, x, y, cls = "") {
  if (typeof document === "undefined" || x == null) return;
  const live = document.querySelectorAll(".floater");
  if (live.length > 14) live[0].remove();
  const el = document.createElement("div");
  el.className = `floater ${cls}`.trim();
  el.textContent = text;
  el.style.left = `${Math.round(x)}px`;
  el.style.top  = `${Math.round(y)}px`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1300);
}

function floatActionGains(actionId, payload, before) {
  if (!before || LAST_POINTER.x == null || doAction.quiet) return;
  const bits = [];
  const dk = (state.knowledge ?? 0) - before.knowledge;
  const dd = (state.drafts ?? 0) - before.drafts;
  const dp = (state.publications ?? 0) - before.publications;
  const dm = (state.money ?? 0) - before.money;
  if (dp > 0) bits.push(`+${fmtBig(dp)} publication${dp === 1 ? "" : "s"}`);
  else if (dd > 0) bits.push(`+${fmtBig(dd)} draft${dd === 1 ? "" : "s"}`);
  if (dk > 0.05) bits.push(`+${fmtBig(Math.round(dk * 10) / 10)} knowledge`);
  if (dm > 0) bits.push(`+$${fmtBig(dm)}`);
  if (!bits.length) return;
  spawnFloater(bits.join("  "), LAST_POINTER.x + (Math.random() * 16 - 8), LAST_POINTER.y - 12);
}

// ── Distinctions (achievements) ───────────────────────────────────────
const HONOR_BONUS = 0.01;

(() => {
  const H = [];
  const add = (id, label, desc, icon, test, hidden = false) => H.push({ id, label, desc, icon, test, hidden });
  const cites = () => calcTotalCitations();
  const h = () => calcHIndex();
  const owned = (s) => Object.values(s.holdings?.owned ?? {}).reduce((a, n) => a + n, 0);

  [[100, "Well Read", "fa-book"], [1000, "Well, Actually", "fa-book-open"], [10000, "Polymath", "fa-brain"],
   [100000, "Walking Library", "fa-building-columns"], [1e6, "The Library of Babel", "fa-infinity"], [1e9, "Omniscient-ish", "fa-eye"]]
    .forEach(([n, label, icon]) => add(`know_${n}`, label, `Hold ${fmtBig(n)} knowledge at once.`, icon, s => (s.knowledge ?? 0) >= n));
  [[10, "Terrible First Drafts", "fa-pen"], [100, "Prolific", "fa-pen-nib"], [1000, "Graphomaniac", "fa-feather-pointed"],
   [10000, "Draft Factory", "fa-industry"], [100000, "The Infinite Typewriter", "fa-keyboard"], [1e7, "Every Possible Sentence", "fa-scroll"]]
    .forEach(([n, label, icon]) => add(`drafts_${n}`, label, `Write ${fmtBig(n)} drafts in total.`, icon, s => (s.totalDraftsEver ?? 0) >= n));
  [[1, "Published!", "fa-book"], [10, "Salami Slicer", "fa-bacon"], [50, "Least Publishable Units", "fa-cubes"],
   [100, "Paper Mill (Legitimate)", "fa-gears"], [500, "Encyclopedic", "fa-book-bookmark"], [5000, "Bibliography Unto Itself", "fa-book-atlas"], [100000, "Literature", "fa-landmark"]]
    .forEach(([n, label, icon]) => add(`pubs_${n}`, label, `Publish ${fmtBig(n)} paper${n === 1 ? "" : "s"}.`, icon, s => (s.publications ?? 0) >= n));
  [[1, "Someone Read It (Probably)", "fa-quote-left"], [100, "Noticed", "fa-quote-right"], [1000, "Influential", "fa-bullhorn"],
   [10000, "Canonical", "fa-crown"], [1e6, "Required Reading", "fa-graduation-cap"], [1e9, "Citation Singularity", "fa-atom"]]
    .forEach(([n, label, icon]) => add(`cites_${n}`, label, `Reach ${fmtBig(n)} citations.`, icon, () => cites() >= n));
  [[1, "h = 1", "fa-h"], [10, "Respectable", "fa-ranking-star"], [25, "Full Professor Material", "fa-user-graduate"],
   [50, "Field-Defining", "fa-mountain"], [100, "Nobel-Adjacent", "fa-medal"], [500, "Statistically Implausible", "fa-chart-line"], [1500, "h Is for Hubris", "fa-sun"],
   [2000, "Integer Overflow", "fa-bug"]]
    .forEach(([n, label, icon]) => add(`h_${n}`, label, `Reach an h-index of ${n}.`, icon, () => h() >= n));

  add("lvl_1", "Freshman Fifteen", "Make it to college.", "fa-school", s => s.levelIndex >= 1);
  add("lvl_2", "Grad School, Apparently", "Start a master's.", "fa-person-chalkboard", s => s.levelIndex >= 2);
  add("lvl_3", "ABD", "Start a doctorate. All But Dissertation, for now.", "fa-scroll", s => s.levelIndex >= 3);
  add("lvl_4", "Dr.", "Earn the title. Correct people about it exactly once.", "fa-user-doctor", s => s.levelIndex >= 4);
  add("lvl_5", "Freeway Flyer", "Teach as an adjunct.", "fa-car-side", s => s.levelIndex === 5);
  add("lvl_6", "The Clock Starts", "Land a tenure-track job.", "fa-stopwatch", s => s.levelIndex >= 6);
  add("lvl_7", "Unfireable", "Get tenure.", "fa-shield-halved", s => s.levelIndex >= 7);
  add("lvl_8", "Habilitated", "Finish the Habilitation. The Germans are satisfied.", "fa-stamp", s => s.levelIndex >= 8);
  add("lvl_9", "Professor Emeritus", "Reach emeritus. Keep your office anyway.", "fa-chess-king", s => s.levelIndex >= 9);

  add("burn_1", "Crispy", "Burn out once.", "fa-fire", s => (s.counters?.burnouts ?? 0) >= 1);
  add("burn_10", "Extra Crispy", "Burn out ten times.", "fa-fire-flame-curved", s => (s.counters?.burnouts ?? 0) >= 10);
  add("burn_50", "Phoenix", "Burn out fifty times and keep going.", "fa-dove", s => (s.counters?.burnouts ?? 0) >= 50);
  add("no_burn_phd", "Moderation", "Start a PhD without ever burning out.", "fa-scale-balanced", s => s.levelIndex >= 3 && (s.counters?.burnouts ?? 0) === 0, true);
  [[100, "Diligent", "fa-hand-pointer"], [1000, "Grinder", "fa-hand"], [10000, "Repetitive Strain", "fa-hand-dots"]]
    .forEach(([n, label, icon]) => add(`clicks_${n}`, label, `Study or write ${fmtBig(n)} times.`, icon, s => (s.counters?.clicks ?? 0) >= n));
  add("coffee_10", "Bean There", "Brew ten coffees.", "fa-mug-hot", s => (s.counters?.coffees ?? 0) >= 10);
  add("coffee_100", "Bloodstream: Espresso", "Brew a hundred coffees.", "fa-mug-saucer", s => (s.counters?.coffees ?? 0) >= 100);
  add("nighter_10", "Nocturnal", "Pull ten all-nighters.", "fa-moon", s => (s.counters?.allNighters ?? 0) >= 10, true);
  add("walks_25", "Peripatetic", "Go for twenty-five walks. Aristotle taught this way.", "fa-shoe-prints", s => (s.counters?.walks ?? 0) >= 25, true);
  add("scholar_50", "Refresh, Refresh, Refresh", "Check Google Scholar fifty times.", "fa-rotate-right", s => (s.scholar?.checks ?? 0) >= 50, true);

  add("adv_best", "Favorite Student", "Reach full rapport with an advisor.", "fa-star", s => (s.advisor?.favor ?? 0) >= 99.5);
  add("adv_zero", "Persona Non Grata", "Let an advisor's rapport fall below 10.", "fa-user-slash", s => !!s.advisor && s.advisor.archetype !== "ghost" && s.advisor.favor < 10, true);
  add("adv_switch", "Advisor Roulette", "Switch advisors.", "fa-shuffle", () => storyFlag("switchedAdvisor"));
  add("adv_ignore", "Selective Hearing", "Let ten emails expire unanswered.", "fa-ear-deaf", s => (s.inboxStats?.expired ?? 0) >= 10, true);
  add("adv_ghost", "Self-Taught", "Finish a stage under a ghost.", "fa-ghost", s => (s.advisorHistory ?? []).some(a => a.archetype === "ghost" && !a.left), true);
  add("adv_reveal", "I See You", "Work out what kind of advisor you have.", "fa-magnifying-glass", s => !!s.advisor?.revealed || (s.advisorHistory ?? []).length > 1);
  add("mentor_10", "The Advisor You Wished You'd Had", "Say yes to your students ten times.", "fa-hand-holding-heart", () => (state.story?.flags?.goodMentor ?? 0) >= 10, true);
  add("alumni_5", "Academic Grandparent", "See five students defend.", "fa-sitemap", s => (s.alumni ?? 0) >= 5);

  add("inbox_zero", "Inbox Zero", "Answer everything in your inbox.", "fa-inbox", s => (s.inboxStats?.zeroes ?? 0) >= 1 && (s.inboxStats?.answered ?? 0) >= 5);
  add("inbox_50", "Reply All", "Answer fifty emails.", "fa-reply-all", s => (s.inboxStats?.answered ?? 0) >= 50);

  add("story_honest", "p = 0.051", "Report an inconvenient result honestly.", "fa-scale-balanced", () => storyFlag("honestNull"), true);
  add("story_fraud", "Too Good to Be True", "Fabricate data.", "fa-mask", () => storyFlag("fabricated"), true);
  add("story_retract", "Owned It", "Retract your own paper.", "fa-rotate-left", () => storyFlag("retracted"), true);
  add("story_scandal", "Autocomplete", "Become a scandal.", "fa-newspaper", () => storyFlag("scandal"), true);
  add("story_rival_friend", "Frenemies", "Turn your rival into a friend.", "fa-handshake", s => (s.story?.rival?.relation ?? 0) >= 40, true);
  add("story_rival_enemy", "Nemesis", "Make your rival a true enemy.", "fa-skull", s => (s.story?.rival?.relation ?? 0) <= -40, true);
  add("story_committee", "Service Animal", "Serve on three committees.", "fa-people-group", s => (s.story?.service ?? 0) >= 3, true);
  add("story_ashley", "Closure", "Explain your methods section to Ashley.", "fa-heart-crack", () => storyFlag("ashleyClosure"), true);
  add("story_dean", "Administrator", "Become a dean. Your friends stop telling you things.", "fa-briefcase", () => storyFlag("dean"), true);
  add("story_festschrift", "Festschrift", "Have a volume written in your honor.", "fa-book-bookmark", () => storyFlag("festschrift"), true);
  add("story_danish", "Enten-Eller", "Read the Danish.", "fa-language", () => storyFlag("readDanish"), true);
  add("story_lacan", "The Big Other", "Survive the Lacan reading group.", "fa-couch", () => storyFlag("lacanian"), true);
  add("story_union", "Solidarity", "Join the picket line.", "fa-people-carry-box", () => storyFlag("picketed") || storyFlag("adjunctUnion"), true);
  add("story_erdos", "Erdős Number", "Earn an Erdős number.", "fa-diagram-project", s => s.story?.erdos != null, true);
  add("story_erdos2", "Two Steps From Paul", "Earn an Erdős number of 2.", "fa-circle-nodes", s => (s.story?.erdos ?? 99) <= 2, true);
  add("story_public", "Public Intellectual", "Go on television to explain your field in ninety seconds.", "fa-tv", () => storyFlag("publicFigure"), true);
  add("story_grade", "With Distinction", "Earn the top grade on a landmark.", "fa-award", s => (s.cv?.landmarks ?? []).some(l => l.gradeIndex === 0));

  add("lucky_1", "Serendipitous", "Catch something on your desk.", "fa-clover", s => (s.serendipity?.clicked ?? 0) >= 1);
  add("lucky_25", "Charmed Life", "Catch twenty-five things.", "fa-wand-sparkles", s => (s.serendipity?.clicked ?? 0) >= 25);
  add("lucky_100", "Lucky Pen", "Catch a hundred things.", "fa-pen-fancy", s => (s.serendipity?.clicked ?? 0) >= 100);
  add("missed_10", "Missed Connections", "Let ten things slip away.", "fa-hourglass-end", s => (s.serendipity?.missed ?? 0) >= 10, true);
  add("dark_5", "Deal With the Devil", "Take five offers you shouldn't have.", "fa-handshake-slash", s => (s.serendipity?.dark ?? 0) >= 5, true);

  add("skill_10", "Practice Makes Tenure", "Reach level 10 in any skill.", "fa-dumbbell", () => Object.keys(window.SKILLS).some(id => skillLevel(id) >= 10));
  add("skill_all5", "Well-Rounded", "Reach level 5 in every skill.", "fa-circle", () => Object.keys(window.SKILLS).every(id => skillLevel(id) >= 5));

  add("desk_folder", "Organized", "File a paper in a folder.", "fa-folder-open", s => (s.counters?.folders ?? 0) >= 1);
  add("desk_tidy", "Compulsively Tidy", "Tidy your desk ten times.", "fa-broom", s => (s.counters?.tidies ?? 0) >= 10, true);
  add("desk_flip", "Upside Down", "Turn a paper all the way over.", "fa-rotate", s => !!s.counters?.flipped, true);

  add("debt_50k", "Leveraged", "Owe $50,000.", "fa-credit-card", s => (s.debt ?? 0) >= 50000, true);
  add("debt_free", "Debt Free", "Pay off your loans.", "fa-piggy-bank", s => (s.counters?.debtPaid ?? 0) >= 1);
  add("money_1m", "Seven Figures", "Have $1,000,000.", "fa-sack-dollar", s => (s.money ?? 0) >= 1e6);
  add("money_1b", "Endowment", "Have $1,000,000,000.", "fa-vault", s => (s.money ?? 0) >= 1e9);

  add("hold_first", "Institution Builder", "Establish your first holding.", "fa-building", s => owned(s) > 0);
  add("hold_100", "Hiring Spree", "Own 100 holdings.", "fa-city", s => owned(s) >= 100);
  add("hold_disc", "Founder of a Field", "Found a discipline.", "fa-sitemap", s => (s.holdings?.owned?.discipline ?? 0) >= 1);
  add("retired", "Retired (Allegedly)", "Retire.", "fa-umbrella-beach", s => (s.meta?.retirements ?? 0) >= 1 || !!s.retired);
  add("gen_3", "Academic Dynasty", "Reach the third generation of your lineage.", "fa-tree", () => (typeof lineageGeneration === "function" ? lineageGeneration() : 1) >= 3);

  window.HONORS = H;
})();

function honorCount() { return Object.keys(state.honors ?? {}).length; }

function applyHonorModifiers(m) {
  const n = honorCount();
  if (!n) return;
  const each = HONOR_BONUS * (state.modifiers?.honorBonusMult ?? 1);
  m.knowledgeMult *= 1 + each * n;
  m.citationMult  *= 1 + each * n;
}

function checkHonors() {
  let gained = 0;
  for (const hnr of window.HONORS) {
    if (state.honors[hnr.id]) continue;
    let met = false;
    try { met = !!hnr.test(state); } catch (_) { met = false; }
    if (!met) continue;
    state.honors[hnr.id] = state.gameTicks ?? 0;
    gained++;
    pushNews(`Distinction earned: ${hnr.label}${/[.!?]$/.test(hnr.label) ? "" : "."} ${hnr.desc}`);
    showHonorToast(hnr);
  }
  if (gained) rebuildModifiers();
  return gained;
}

function showHonorToast(hnr) {
  if (typeof document === "undefined") return;
  const live = document.querySelectorAll(".honor-toast");
  if (live.length >= 3) live[0].remove();
  const el = document.createElement("div");
  el.className = "honor-toast";
  el.setAttribute("role", "status");
  el.innerHTML = `<i class="fa-solid ${hnr.icon}"></i><div><strong>${escHTML(hnr.label)}</strong><span>${escHTML(hnr.desc)}</span></div>`;
  document.body.appendChild(el);
  setTimeout(() => el.classList.add("honor-toast-out"), 3600);
  setTimeout(() => el.remove(), 4200);
}

function renderHonors() {
  const el = ensurePanel("panel_honors", "Distinctions", "fa-award");
  if (!el) return;
  const n = honorCount();
  showPanel(el, n > 0);
  if (!n) return;
  const each = Math.round(HONOR_BONUS * (state.modifiers?.honorBonusMult ?? 1) * 1000) / 10;
  setPanelTitle(el, `Distinctions <span class="inbox-count">${n}</span>`);
  const frames = window.HONORS.map(hn => {
    const got = state.honors[hn.id] != null;
    if (!got && hn.hidden) return `<span class="honor honor-hidden" title="A hidden distinction">?</span>`;
    return `<span class="honor${got ? " honor-got" : ""}" title="${escHTML(`${hn.label}: ${hn.desc}`)}"><i class="fa-solid ${hn.icon}"></i></span>`;
  }).join("");
  setPanelBody(el, `<p class="honors-sum">${n} of ${window.HONORS.length} framed on the wall. +${fmtBig(Math.round(n * each * 10) / 10)}% knowledge and citations (${each}% each).</p><div class="honor-wall">${frames}</div>`);
}

// ── The Daily Footnote ────────────────────────────────────────────────
window.GAZETTE = {
  early: [
    "Local Teen Discovers Library Has Books, Is \"Kind of Into It\"",
    "Guidance Counselor Recommends \"Something Practical,\" Is Ignored",
    "Study Finds 94% of Studies Are Findings",
    "SAT Prep Industry Announces Prep Course for SAT Prep Course",
    "Area Student Highlights Entire Textbook, Retains Color Yellow",
    "Report: Your Parents Still Telling People You Want to Be a Doctor",
    "Homework Eaten by Dog; Dog Now Knows Calculus",
    "Student Council Passes Bold Resolution to Have Another Meeting",
    "Scantron Machine Achieves Consciousness, Fills In Own Bubbles",
    "Graphing Calculator Found to Contain Entire Game of Tetris, Productivity Collapses"
  ],
  undergrad: [
    "Dining Hall Introduces \"Chicken\"",
    "Philosophy Major Asks What \"Employment\" Is, Exactly",
    "Office Hours Attendance Doubles to Two",
    "Campus Unveils $40M Climbing Wall, Raises Tuition to Pay for Climbing Wall",
    "Professor Announces Exam Will Be \"Cumulative,\" Stares Into Middle Distance",
    "Study Group Meets, Studies Nothing, Leaves Satisfied",
    "Unpaid Internship Offers \"Exposure\" and Access to the Good Stapler",
    "Area Sophomore Declares Major, Then Another, Then Another",
    "Student Discovers Wikipedia's Citations, Cites Those Instead, Feels Like a Genius",
    "Roommate's Band Plays First Show; Attendance: You"
  ],
  grad: [
    "Graduate Students Discover Free Food Within 4 Minutes of Its Existence",
    "Advisor Replies to Email; Lab Declares Holiday",
    "Committee Member Has Not Read Thesis, Has Strong Opinions on Thesis",
    "Stipend Increased by $40 a Year; Rent Increased by $4,000",
    "PhD Student Describes Project to Family, Family Says \"So Like Science?\"",
    "Lab Coffee Machine Granted Co-Authorship",
    "Study: Time Spent Reformatting Citations Now Exceeds Time Spent Citing",
    "Reviewer 2 Seen Laughing in a Parking Lot",
    "Fifth-Year Reveals Dissertation Is \"Basically Done\" for Third Year Running",
    "Department Hosts Wellness Workshop at 7 a.m. on a Saturday",
    "Grad Lounge Microwave Line Reaches Twelve; Fish Reheated Anyway",
    "Conference Poster Session Attended Solely by Poster's Author and a Confused Janitor"
  ],
  faculty: [
    "Adjunct Teaches at Three Universities, Is Paid by None of Them on Time",
    "Faculty Meeting Runs 40 Minutes Over to Discuss Running Over",
    "Tenure Clock Now Ticks Audibly, Professors Report",
    "Dean Unveils Strategic Plan Indistinguishable From Last Strategic Plan",
    "Search Committee Narrows 400 Applicants to the One Who Went to Their Alma Mater",
    "Grant Funding Rate Falls to 6%; Agency Calls It \"Highly Competitive\"",
    "Professor Finally Clears Inbox, Is Immediately Assigned to Committee",
    "University Rebrands Parking Lot as \"Innovation Commons\"",
    "Study Finds Teaching Evaluations Correlate Strongly With Professor's Shoes",
    "Lab Purchases $2M Instrument, Cannot Afford Person to Operate It",
    "Provost Announces Listening Tour; Will Be Wearing Noise-Canceling Headphones",
    "\"Reply All\" Incident Enters Its Fourth Day; Casualties Mount"
  ],
  late: [
    "Your Name Now Appears in Other People's Reading Lists",
    "Undergraduates Misattribute Famous Quote to You; You Let It Slide",
    "Emeritus Professor Continues to Attend Every Faculty Meeting, Out of Spite",
    "Your Office Converted to \"Flexible Collaboration Space\" Around You",
    "Retired Professor Publishes More Than Entire Department",
    "Former Student Now Your Boss, Is Very Nice About It",
    "Your Textbook in Its 11th Edition; Only Change Is Page Numbers"
  ],
  // Endgame: these escalate. Each is unlocked by a citation threshold.
  absurd: [
    [1e5,  "Your h-Index Now Exceeds Your Age, Your Weight, and Your Blood Pressure"],
    [3e5,  "Citation Count Visible From Low Earth Orbit"],
    [1e6,  "Scholars Debate Whether You Are a Person or a School of Thought"],
    [3e6,  "Your Footnotes Now Have Footnotes, Which Are Cited Independently"],
    [1e7,  "Universities Begin Naming Buildings After Your Papers"],
    [3e7,  "A New Field Exists Solely to Study the Previous Field Studying You"],
    [1e8,  "Your Bibliography Achieves Sentience, Requests Sabbatical"],
    [3e8,  "Peer Review Abolished: \"Who Would We Even Ask?\" Says Editor"],
    [1e9,  "Physicists Detect Gravitational Waves Emanating From Your CV"],
    [1e10, "Library of Congress Opens Annex Dedicated to Your Errata"],
    [1e11, "Every Paper Ever Written Now Cites You, Including Ones From Before You Were Born"],
    [1e12, "Citations Exceed Number of Atoms in the Observable Department"],
    [1e14, "Reviewer 2 Finally Satisfied; Universe Ends Shortly After"]
  ],
  // When the h-index hits the ceiling of what anything can count
  ceiling: [
    "Google Scholar Files Bug Report: \"h-Index Field Was Not Designed for This\"",
    "Bibliometricians Request You Stop, Politely, for the Sake of the Spreadsheets",
    "Your h-Index Can No Longer Be Displayed; Scholars Describe It as \"Yes\""
  ],
  // About you, specifically
  personal: [
    (s) => s.story?.rival ? `${s.story.rival.name} Named "Rising Star"; Local Academic "Thrilled for Them"` : null,
    (s) => s.advisor && s.advisor.archetype === "legend" ? `${s.advisor.name} Spotted in Person; Grad Students Advised to Remain Calm` : null,
    (s) => s.advisor && s.advisor.archetype === "ghost" ? `Department Confirms ${s.advisor.name} "Definitely Exists," Declines to Elaborate` : null,
    (s) => calcHIndex() >= 5 ? `Area Scholar's h-Index Reaches ${calcHIndex()}; Mother Still Asks When They'll Get a Real Job` : null,
    (s) => s.activeLandmark && s.workingTitles?.[s.activeLandmark] ? `"${s.workingTitles[s.activeLandmark]}": Committee Says It Is "Certainly a Title"` : null,
    (s) => (s.debt ?? 0) > 20000 ? "Student Loan Servicer Sends Area Scholar a Birthday Card" : null,
    (s) => labStudentCount() >= 3 ? `Lab of ${labStudentCount()} Graduate Students Runs on One (1) Shared Kettle` : null,
    (s) => (s.counters?.coffees ?? 0) >= 30 ? "Campus Coffee Cart Names a Drink After You; It's Just Coffee, but Sadder" : null,
    (s) => (s.counters?.burnouts ?? 0) >= 5 ? "Local Academic Describes Burnout as \"a Phase,\" Fifth Time This Year" : null,
    (s) => s.story?.erdos != null ? `Mathematicians Confirm Your Erdős Number Is ${s.story.erdos}; You Mention It Within 30 Seconds of Meeting Anyone` : null,
    (s) => storyFlag("ashleyClosure") ? "Ashley Reportedly \"Doing Great, Actually\"; You Are Also Doing Great, Actually" : null
  ]
};

function gazettePool() {
  const L = state.levelIndex ?? 0;
  const G = window.GAZETTE;
  let pool = L <= 0 ? G.early : L === 1 ? G.undergrad : L <= 4 ? G.grad : L <= 7 ? G.faculty : G.late.concat(G.faculty);
  const personal = G.personal.map(f => { try { return f(state); } catch (_) { return null; } }).filter(Boolean);
  pool = pool.concat(personal, personal);
  const c = calcTotalCitations();
  const absurd = G.absurd.filter(([n]) => c >= n).map(([, t]) => t);
  if (calcHIndex() >= (window.HINDEX_BUCKET_MAX ?? 2000)) absurd.push(...G.ceiling);
  if (absurd.length) pool = absurd.slice(-4).concat(absurd.slice(-2), pool.slice(0, 3), personal);
  return pool;
}

function tickGazette() {
  const G = state.gazette;
  const now = state.gameTicks ?? 0;
  if (now < (G.nextAt ?? 0)) return;
  G.nextAt = now + 250;      // 25 s
  const pool = gazettePool();
  const fresh = pool.filter(t => !G.seen.includes(t));
  G.headline = pickOne(fresh.length ? fresh : pool);
  G.issue = (G.issue ?? 0) + 1;
  G.seen.push(G.headline);
  if (G.seen.length > 40) G.seen.splice(0, G.seen.length - 40);
}

const GAZETTE_PRICES = ["Free (take one)", "25¢", "50¢", "50¢", "75¢", "$1 (adjunct discount: none)", "$1", "$2", "$5", "Priceless"];
function renderGazette() {
  const el = ensurePanel("panel_gazette", "The Daily Footnote", "fa-newspaper");
  if (!el) return;
  const G = state.gazette;
  showPanel(el, !!G.headline);
  if (!G.headline) return;
  el.classList.add("gazette");
  setPanelBody(el, `<div class="gz-masthead">The Daily Footnote</div>
    <div class="gz-dateline"><span>Vol. ${state.levelIndex + 1}, No. ${G.issue ?? 1}${typeof currentSeason === "function" && state.levelIndex >= 1 ? ` · ${currentSeason().label}` : ""}</span><span>"All the News That Fits, ibid."</span><span>${GAZETTE_PRICES[state.levelIndex] ?? "50¢"}</span></div>
    <div class="gz-headline">${escHTML(G.headline)}</div>`);
}

// ── Buff stamps under the energy bar ──────────────────────────────────
function renderBuffs() {
  const ui = document.getElementById("energyUI");
  if (!ui) return;
  let box = document.getElementById("buff_stamps");
  if (!box) { box = document.createElement("div"); box.id = "buff_stamps"; ui.appendChild(box); }
  const html = (state.buffs ?? []).map(b => {
    const d = buffDef(b.id);
    if (!d) return "";
    return `<span class="stamp${d.bad ? " stamp-bad" : ""}" title="${escHTML(d.label)}"><i class="fa-solid ${d.icon}"></i> ${escHTML(d.label)} <b>${buffSecondsLeft(b)}s</b></span>`;
  }).join("");
  if (box.__html !== html) { box.innerHTML = html; box.__html = html; }
}

// ── Wiring ────────────────────────────────────────────────────────────
onHook("tick", () => { tickBuffs(); tickSerendipity(); tickGazette(); });
onHook("second", checkHonors);
onHook("modifiers", (m) => { applyBuffModifiers(m); applySkillModifiers(m); applyHonorModifiers(m); });
onHook("energyCost", buffEnergyCost);
onHook("energyCost", skillEnergyCost);
onHook("action", (id, payload, before) => {
  const sid = SKILL_ACTIONS[id];
  const xp = sid ? window.SKILLS[sid].train[id] : 0;
  if (xp) trainSkill(sid, xp);
  floatActionGains(id, payload, before);
});
onHook("advisorAction", (id) => { if (id === "chapter") trainSkill("writing", 3); if (id === "meeting") trainSkill("reading", 2); });
onHook("mailAnswered", (mail, index) => { if (mail.source === "student" && index === 0) trainSkill("mentoring", 3); });
onHook("burnout", () => removeSerendipity());
onHook("render", () => { renderBuffs(); renderSkills(); renderHonors(); renderGazette(); });
onHook("reset", removeSerendipity);
