// advisor.js — the people above you, and later, below you
//
// The master's, the doctorate and the postdoc each come with someone who
// decides how your life goes: an advisor, then a PI. You pick from three
// candidates and a rumor about each. Their real personality you learn the
// hard way, one email at a time.
//
// RAPPORT (favor, 0–100) is the relationship in one number. It drifts down
// when you go quiet and up when you show up, and it moves a lot when they
// ask for something and you say yes, no, or nothing. It speeds or stalls
// your thesis, tints what you learn, and becomes your LETTER when you move
// on, which decides (some of) where you land next.
//
// REQUESTS arrive in the inbox with a deadline: proofread my grant, cover my
// class, pick me up from the airport at 6:10 a.m. Yes costs you time; no
// costs rapport; silence costs more.
//
// THE MIRROR. Once you have grad students of your own, they send YOU
// requests. Read my chapter? Write me a letter? Can I go home for a week?
// You will recognize every one, and sometimes you'll hear your old
// advisor's voice come out of your mouth.

"use strict";

Object.assign(DEFAULT_STATE, {
  advisor: null,            // the current advisor/PI (see makeAdvisor)
  advisorCandidates: null,  // [advisor, ...] while you're choosing
  advisorChoosingSince: 0,  // gameTicks when the candidates arrived
  advisorHistory: [],       // past advisors with their final rapport and letter
  advisorNextEventAt: 0,    // gameTicks
  studentNextRequestAt: 0
});

// Stages that come with an advisor, and what to call them
const ADVISOR_STAGES = {
  2: { role: "thesis advisor",       noun: "advisor" },
  3: { role: "dissertation advisor", noun: "advisor" },
  4: { role: "PI",                   noun: "PI" }
};

const ADVISOR_EMAIL_COOLDOWN   = 200;    // ticks
const ADVISOR_MEETING_COOLDOWN = 450;
const ADVISOR_GRUNT_COOLDOWN   = 600;
const ADVISOR_ASSIGN_SECONDS   = 150;    // dither this long and the department picks for you

// ── Archetypes ────────────────────────────────────────────────────────
// Ranges are [lo, hi]; a candidate rolls inside them. `rumor` is what you
// hear before you choose. Everything else you find out by working with them.
window.ADVISOR_ARCHETYPES = {
  legend: {
    label: "The Living Legend",
    rumor: "Everyone wants to work with them. Nobody has seen them in person since 2009.",
    reveal: "You finally understand: the legend is real, and you will see them twice a year, both times in an airport.",
    prestige: [82, 98], responsiveness: [5, 20], demandingness: [30, 50], network: [85, 100], warmth: [20, 50],
    requestRate: 0.5, decay: 0.6,
    replies: ["No reply.", "No reply.", "\"Ok\" (Sent from my iPhone)", "An auto-reply: they are \"traveling with limited access to email\" until further notice."]
  },
  micromanager: {
    label: "The Micromanager",
    rumor: "Replies to email before you've finished writing it. Has opinions about your font.",
    reveal: "It's official: they have a shared spreadsheet tracking your hours, and it has conditional formatting.",
    prestige: [50, 75], responsiveness: [90, 100], demandingness: [85, 100], network: [40, 65], warmth: [30, 60],
    requestRate: 1.8, decay: 1.6,
    replies: ["\"Let's discuss. Free in 10?\"", "\"Saw this. Some thoughts (attached, 4 pages).\"", "\"Why is this in Calibri?\"", "\"Good. Next steps?\""]
  },
  rising: {
    label: "The Rising Star",
    rumor: "Just got a huge grant. Very ambitious. Very, very ambitious.",
    reveal: "You see it now: every project is the one that gets them into the National Academy, and you are the one doing it.",
    prestige: [55, 78], responsiveness: [50, 75], demandingness: [65, 85], network: [50, 72], warmth: [35, 65],
    requestRate: 1.3, decay: 1.1,
    replies: ["\"Great — this could be a Nature paper.\"", "\"Love it. Let's add three more studies.\"", "\"On a plane, will read later!\"", "\"Can you present this at lab meeting?\""]
  },
  oldguard: {
    label: "The Kindly Old Guard",
    rumor: "Has been \"about to retire\" for eleven years. Bakes for lab meeting.",
    reveal: "You understand them now: they will never retire, and you would be devastated if they did.",
    prestige: [40, 65], responsiveness: [40, 60], demandingness: [10, 30], network: [30, 50], warmth: [80, 100],
    requestRate: 0.6, decay: 0.5,
    replies: ["\"Wonderful. Come by Thursday, I'll make tea.\"", "\"This reminds me of a paper from 1987...\" (a long, kind email)", "\"Splendid.\"", "A printed letter in your mailbox. Handwritten. Fountain pen."]
  },
  empire: {
    label: "The Empire Builder",
    rumor: "Runs a lab of forty. Knows about six of them by name.",
    reveal: "You have worked it out: you are not in a lab, you are in an organization, and the org chart has a dotted line to you.",
    prestige: [75, 92], responsiveness: [15, 35], demandingness: [50, 70], network: [80, 96], warmth: [15, 40],
    requestRate: 1.4, decay: 1.4,
    replies: ["A reply from their lab manager.", "\"Who is this?\"", "\"Please coordinate with my senior postdoc.\"", "\"Great work, team!\" (you are cc'd with 38 people)"]
  },
  visionary: {
    label: "The Visionary",
    rumor: "Has a new big idea every week. Some of them used to be yours.",
    reveal: "It dawns on you: they'll never remember which ideas were yours, and they will be right about something enormous, once.",
    prestige: [60, 85], responsiveness: [30, 60], demandingness: [40, 60], network: [55, 75], warmth: [50, 70],
    requestRate: 1.0, decay: 1.0,
    replies: ["\"What if we threw all of this out and started from Hegel?\"", "\"Interesting! Have you considered the opposite?\"", "A voice memo, eleven minutes, recorded while walking.", "\"YES. But bigger.\""]
  },
  buddy: {
    label: "The Best Friend",
    rumor: "Takes the lab out for drinks. Knows your coffee order. Boundaries: unclear.",
    reveal: "You realize: they want to be your friend more than your advisor, and you needed an advisor.",
    prestige: [35, 60], responsiveness: [70, 90], demandingness: [15, 35], network: [45, 65], warmth: [90, 100],
    requestRate: 0.8, decay: 0.8,
    replies: ["\"Love this!! Drinks Friday?\"", "\"haha amazing\"", "\"You're killing it. Also, are you free to help me move?\"", "A GIF of a dog wearing glasses."]
  },
  ghost: {
    label: "The Ghost",
    rumor: "Technically your advisor. Has signed your forms. Possibly real.",
    reveal: "You have confirmed it: your advisor exists only as a signature. You are, effectively, self-taught. Very Good Will Hunting of you.",
    prestige: [30, 70], responsiveness: [0, 5], demandingness: [0, 5], network: [20, 60], warmth: [30, 60],
    requestRate: 0, decay: 0,
    replies: ["No reply.", "No reply.", "No reply.", "Your email bounces. Then, the next day, it doesn't."]
  }
};

const ADVISOR_FIRST = ["Hollis", "Margarethe", "Desmond", "Priyanka", "Ansel", "Beatrix", "Cornelius", "Odalys",
                       "Ingram", "Rosalind", "Thaddeus", "Wilhelmina", "Lucan", "Imogen", "Barnaby", "Seraphina",
                       "Emeric", "Constance", "Ravi", "Henrike", "Augustin", "Dagny", "Ezra", "Philippa"];
const ADVISOR_LAST  = ["Vandermeer", "Ashgrove", "Pellingham", "Okafor", "Thistlewood", "Baptiste", "Lindgren",
                       "Kovač", "Hargreave", "Moreau", "Iwasaki", "Fairbrother", "Castellanos", "Quist",
                       "Abernathy-Lowe", "Nakamura", "Blackwood", "Esterházy", "Szymanski", "Delacroix-Hume"];

// How rapport reads, from the floor up
const RAPPORT_WORDS = [
  [0,  "Has forgotten your name"],
  [15, "Visibly disappointed"],
  [30, "Professionally neutral"],
  [45, "Cordial"],
  [60, "Says \"good work\" sometimes"],
  [75, "Mentions you to colleagues"],
  [90, "Calls you their best student"]
];

const TRAIT_WORDS = {
  responsiveness: ["Replies to email", ["never", "eventually", "same week", "same day", "before you hit send"]],
  demandingness:  ["Expects",          ["nothing", "a little", "steady progress", "a lot", "everything, yesterday"]],
  network:        ["Knows",            ["nobody", "a few people", "the right people", "everyone", "everyone's advisor"]],
  warmth:         ["Bedside manner",   ["glacial", "cool", "decent", "kind", "bakes for you"]]
};

function rapportWord(f) {
  let word = RAPPORT_WORDS[0][1];
  for (const [at, w] of RAPPORT_WORDS) if (f >= at) word = w;
  return word;
}

function traitWord(trait, v) {
  const [, words] = TRAIT_WORDS[trait];
  return words[clamp(Math.floor(v / 20), 0, 4)];
}

// ── Making advisors ───────────────────────────────────────────────────
function rollRange([lo, hi]) { return randInt(lo, hi); }

function makeAdvisor(archetypeId, stage) {
  const A = window.ADVISOR_ARCHETYPES[archetypeId];
  // Better institutions attract (slightly) more prestigious faculty
  const instBias = Math.round(((state.universityPrestige ?? 50) - 50) / 6);
  const prestige = clamp(rollRange(A.prestige) + instBias, 5, 100);
  const rank = prestige >= 85 ? "Distinguished Professor" : prestige >= 60 ? "Professor" : prestige >= 40 ? "Associate Professor" : "Assistant Professor";
  const startFavor = archetypeId === "ghost" ? 50 : foldHooks("advisorStartFavor", 50 + randInt(-5, 5));
  return {
    name:      `Prof. ${pickOne(ADVISOR_FIRST)} ${pickOne(ADVISOR_LAST)}`,
    rank,
    archetype: archetypeId,
    rumor:     A.rumor,
    stage,
    prestige,
    traits: {
      responsiveness: rollRange(A.responsiveness),
      demandingness:  rollRange(A.demandingness),
      network:        rollRange(A.network),
      warmth:         rollRange(A.warmth)
    },
    favor:      clamp(startFavor, 0, 100),
    known:      {},         // which traits you've figured out
    revealed:   false,      // whether you've worked out what they are
    stats:      { emails: 0, meetings: 0, grunt: 0, requestsDone: 0, requestsDeclined: 0, requestsIgnored: 0 },
    lastContact: state.gameTicks ?? 0,
    lastEmail:   -9999, lastMeeting: -9999, lastGrunt: -9999,
    away:        0          // gameTicks until they're back from sabbatical
  };
}

// Three candidates from three different archetypes. A previous generation of
// you may turn up among them (endgame.js: lineageAdvisorCandidate).
function rollAdvisorCandidates(stage) {
  const ids = Object.keys(window.ADVISOR_ARCHETYPES);
  for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
  const picks = ids.slice(0, 3).map(id => makeAdvisor(id, stage));
  if (typeof lineageAdvisorCandidate === "function") {
    const ancestor = lineageAdvisorCandidate(stage);
    if (ancestor) picks[2] = ancestor;
  }
  // The professor who noticed you in college remembers you
  if (storyFlag("alderMentee") && stage === 2) {
    picks[0].name  = "Prof. Alder";
    picks[0].favor = 65;
    picks[0].rumor = "Your old seminar instructor. Already thinks you're promising. You'd hate to prove them wrong.";
  }
  return picks;
}

function advisorStageInfo(level = state.levelIndex) { return ADVISOR_STAGES[level] ?? null; }
function advisorNoun() { return advisorStageInfo()?.noun ?? "advisor"; }

// The advisor who shaped you the most: your doctoral one, if you had one
function oldAdvisorName() {
  const h = state.advisorHistory ?? [];
  return (h.find(a => a.stage === 3 && !a.left) ?? h.find(a => a.stage === 3) ?? h[h.length - 1])?.name ?? null;
}

// Called on level change and on load: offer candidates when a new stage
// begins, and retire the old advisor when you've moved past their stage.
function syncAdvisorStage() {
  const info = advisorStageInfo();
  const adv = state.advisor;

  if (adv && adv.stage !== state.levelIndex) retireAdvisor();
  if (!info) { state.advisorCandidates = null; return; }
  if (state.advisorCandidates && state.advisorCandidates[0]?.stage !== state.levelIndex) state.advisorCandidates = null;
  if (state.advisor || state.advisorCandidates) return;

  state.advisorCandidates = rollAdvisorCandidates(state.levelIndex);
  state.advisorChoosingSince = state.gameTicks ?? 0;
  pushNews(state.levelIndex === 4
    ? "New postdoc, new PI. Three labs have an opening. You have a choice, which is more than most people get."
    : `Time to choose a ${info.role}. Three faculty have said they "might have room."`);
}

function chooseAdvisor(index, how = "chose") {
  const cand = state.advisorCandidates?.[index];
  if (!cand) return false;
  state.advisor = cand;
  state.advisor.lastContact = state.gameTicks ?? 0;
  state.advisorCandidates = null;
  state.advisorNextEventAt = (state.gameTicks ?? 0) + randInt(400, 900);
  if (state.cv) state.cv.advisor = cand.name;
  const A = window.ADVISOR_ARCHETYPES[cand.archetype];
  if (how === "assigned") {
    pushNews(`You didn't choose, so the Director of Graduate Studies did. ${cand.name} is your ${advisorNoun()}. "They had room."`);
  } else {
    pushNews(cand.archetype === "ghost"
      ? `${cand.name} has agreed to be your ${advisorNoun()}. You think. The form came back signed.`
      : `${cand.name} is your new ${advisorNoun()}. First email: ${A.replies[2]}`);
  }
  storyLog(`${cand.name} became your ${advisorNoun()}${how === "assigned" ? " (assigned; you didn't pick)" : ""}.`, "advisor");
  runHooks("advisorChosen", cand);
  rebuildModifiers();
  return true;
}

// The stage is over: write the letter, file them in your history
function retireAdvisor() {
  const adv = state.advisor;
  if (!adv) return;
  const letter = adv.letter ?? advisorLetter(adv);
  state.advisorHistory = state.advisorHistory ?? [];
  state.advisorHistory.push({
    name: adv.name, archetype: adv.archetype, stage: adv.stage,
    favor: Math.round(adv.favor), letter, prestige: adv.prestige, stats: adv.stats
  });
  pushNews(letterNews(adv, letter));
  storyLog(letterNews(adv, letter), "advisor");
  state.advisor = null;
  state.inbox = (state.inbox ?? []).filter(m => m.source !== "advisor");
  rebuildModifiers();
}

function advisorLetter(adv) {
  if (adv.archetype === "ghost") return 45;
  const f = adv.favor, p = adv.prestige, n = adv.traits.network;
  return clamp(Math.round(f * 0.6 + p * 0.25 + n * 0.15 + randInt(-6, 6)), 0, 100);
}

// Letters move you up or down the ladder of where you land next. The letter
// is written the moment you leave, so the current advisor's counts.
function letterMoveBonus(total, index) {
  const adv = state.advisor;
  let letters = [];
  if (adv && adv.stage === index - 1) {
    adv.letter = adv.letter ?? advisorLetter(adv);
    letters.push(adv.letter);
  } else if (index === 6) {
    // The tenure-track search reads every letter you've ever had
    letters = (state.advisorHistory ?? []).filter(a => a.stage >= 3).map(a => a.letter);
  }
  if (!letters.length) return total;
  const avg = letters.reduce((a, b) => a + b, 0) / letters.length;
  return total + Math.round((avg - 50) / 7);
}

function letterNews(adv, letter) {
  const who = adv.name;
  if (adv.archetype === "ghost") return `${who} writes your letter. It is two sentences long and spells your name two different ways.`;
  if (adv.archetype === "buddy" && letter >= 50) return `${who}'s letter calls you "an absolute delight." Committees read that as a warning.`;
  if (letter >= 85) return `${who}'s letter calls you "the best student I have worked with in a decade." Doors open that you didn't know were doors.`;
  if (letter >= 65) return `${who} writes you a strong letter. It uses the word "exceptional" once, which in academic letters is a lot.`;
  if (letter >= 45) return `${who}'s letter says you are "reliable and hardworking." This is not a compliment, and everyone reading it knows.`;
  if (letter >= 25) return `${who}'s letter is short and lists your publications. It does not say anything about you.`;
  return `${who} declines to write you a letter. You find another letter writer. Everyone notices.`;
}

// ── Rapport ───────────────────────────────────────────────────────────
function adjustFavor(delta) {
  const adv = state.advisor;
  if (!adv || adv.archetype === "ghost") return;
  adv.favor = clamp(adv.favor + delta, 0, 100);
  if (delta > 0) adv.lastContact = state.gameTicks ?? 0;
}

function advisorFavorCentered() {
  const adv = state.advisor;
  if (!adv) return 0;
  if (adv.archetype === "ghost") return -0.15;    // you're on your own
  return clamp((adv.favor - 50) / 50, -1, 1);
}

// Modifiers hook: rapport touches knowledge; some archetypes touch energy
function applyAdvisorModifiers(m) {
  const adv = state.advisor;
  if (!adv) return;
  const f = advisorFavorCentered();
  m.knowledgeMult *= 1 + 0.06 * f;
  if (adv.archetype === "micromanager") m.energyRegenMult *= 0.95;
  if (adv.archetype === "buddy")        m.energyRegenMult *= 1.05;
  if (adv.archetype === "visionary")    m.paperMult       *= 1.06;
  // Coauthoring with a famous advisor gets read
  if (f > 0) m.citationMult *= 1 + 0.15 * (adv.prestige / 100) * f;
}

// Landmark hook: a happy advisor reads your chapters; an unhappy one sits on them
function advisorLandmarkMult() {
  const info = advisorStageInfo();
  const adv = state.advisor;
  if (!info) return 1;
  if (!adv) return 0.8;                                   // nobody is reading your chapters
  if (advisorIsAway()) return 0.85;
  let mult = 1 + 0.35 * advisorFavorCentered();
  if (adv.archetype === "micromanager") mult *= 1.12;   // structure helps, even when it hurts
  return clamp(mult, 0.6, 1.5);
}

function advisorIsAway() { return (state.advisor?.away ?? 0) > (state.gameTicks ?? 0); }

function learnTrait(adv, trait) {
  if (adv.known[trait]) return;
  adv.known[trait] = true;
  const knownCount = Object.keys(adv.known).length;
  if (!adv.revealed && knownCount >= 3) {
    adv.revealed = true;
    const A = window.ADVISOR_ARCHETYPES[adv.archetype];
    pushNews(A.reveal);
    storyLog(`You worked out what ${adv.name} was: ${A.label}.`, "advisor");
  }
}

// Slowly forget you. Ghosts don't, because they never knew you.
function tickAdvisor() {
  const now = state.gameTicks ?? 0;
  // Nobody picked? The department picks for you.
  if (state.advisorCandidates && !state.advisor
      && now - (state.advisorChoosingSince ?? now) > ticksFromSeconds(ADVISOR_ASSIGN_SECONDS)) {
    chooseAdvisor(randInt(0, state.advisorCandidates.length - 1), "assigned");
    adjustFavor(-8);
  }
  const adv = state.advisor;
  if (!adv) return;
  const A = window.ADVISOR_ARCHETYPES[adv.archetype];
  if (A.decay > 0 && !advisorIsAway()) {
    const quiet = now - (adv.lastContact ?? now);
    if (quiet > 300 && adv.favor > 20) adv.favor = Math.max(20, adv.favor - 0.0035 * A.decay);
  }
  if (now >= (state.advisorNextEventAt ?? 0)) {
    const rate = A.requestRate ?? 1;
    state.advisorNextEventAt = now + Math.round(randInt(700, 1500) / Math.max(0.4, rate));
    if (rate > 0 && !advisorIsAway() && !inCooldown()) maybeAdvisorMail();
  }
}

// ── Things you can do ─────────────────────────────────────────────────
const ADVISOR_ACTIONS = {
  email: {
    label: "Email an update", icon: "fa-envelope", energy: 4, cooldown: ADVISOR_EMAIL_COOLDOWN, field: "lastEmail",
    blurb: "Short. Upbeat. Mentions progress, vaguely."
  },
  meeting: {
    label: "Go to office hours", icon: "fa-door-open", energy: 15, cooldown: ADVISOR_MEETING_COOLDOWN, field: "lastMeeting",
    blurb: "Bring a draft. Leave with a different project."
  },
  chapter: {
    label: "Hand in a chapter", icon: "fa-file-lines", energy: 10, drafts: 8, cooldown: ADVISOR_MEETING_COOLDOWN, field: "lastMeeting",
    blurb: "Eight drafts, stapled. They will read it eventually."
  },
  grunt: {
    label: "Do their grunt work", icon: "fa-dolly", energy: 25, cooldown: ADVISOR_GRUNT_COOLDOWN, field: "lastGrunt",
    blurb: "Review papers in their name. Format their grant. Feed their fish."
  }
};

function advisorActionStatus(id) {
  const adv = state.advisor;
  const a = ADVISOR_ACTIONS[id];
  if (!adv || !a) return { ok: false, reason: "" };
  if (inCooldown()) return { ok: false, reason: "Burned out" };
  if (advisorIsAway() && id !== "email") return { ok: false, reason: "On sabbatical" };
  const wait = (adv[a.field] ?? -9999) + a.cooldown - (state.gameTicks ?? 0);
  if (wait > 0) return { ok: false, reason: "Not yet", wait: Math.ceil(wait / 10) };
  const energy = effectiveEnergyCost(`advisor_${id}`, a.energy);
  if ((state.energy ?? 0) < energy) return { ok: false, reason: `Needs ${Math.ceil(energy)} energy` };
  if (a.drafts && (state.drafts ?? 0) < a.drafts) return { ok: false, reason: `Needs ${a.drafts} drafts` };
  if (id === "chapter" && !activeLandmarkDef()) return { ok: false, reason: "No thesis in progress" };
  return { ok: true, reason: "" };
}

function doAdvisorAction(id) {
  const adv = state.advisor;
  const a = ADVISOR_ACTIONS[id];
  if (!advisorActionStatus(id).ok) return false;
  spendEnergy(effectiveEnergyCost(`advisor_${id}`, a.energy));
  if (a.drafts) state.drafts -= a.drafts;
  adv[a.field] = state.gameTicks ?? 0;
  const A = window.ADVISOR_ARCHETYPES[adv.archetype];
  const t = adv.traits;

  if (id === "email") {
    adv.stats.emails++;
    const replied = Math.random() * 100 < t.responsiveness + 10;
    if (replied) { adjustFavor(2 + Math.round(t.warmth / 30)); learnTrait(adv, "responsiveness"); }
    else         { adv.lastContact = state.gameTicks ?? 0; if (adv.stats.emails >= 3) learnTrait(adv, "responsiveness"); }
    pushNews(replied ? `${adv.name}: ${pickOne(A.replies)}` : `You email ${adv.name}. ${adv.archetype === "legend" || adv.archetype === "ghost" ? "No reply." : "No reply yet."}`);
  }

  if (id === "meeting") {
    adv.stats.meetings++;
    learnTrait(adv, "warmth");
    state.knowledge += Math.round(15 + adv.prestige / 4);
    applyStoryEffects({ landmark: 0.02 });
    if (adv.archetype === "visionary" && Math.random() < 0.35) {
      applyStoryEffects({ landmark: -0.04 });
      adjustFavor(4);
      pushNews(`${adv.name} loves your idea and suggests you start over from a different one. You leave with forty pages of notes and no thesis.`);
    } else if (Math.random() < 0.15 + t.demandingness / 400) {
      spendEnergy(10);
      adjustFavor(3);
      learnTrait(adv, "demandingness");
      pushNews(`Office hours with ${adv.name} turn into a conversation about whether your project is "really a contribution." You need to lie down.`);
    } else {
      adjustFavor(4 + Math.round(t.warmth / 25));
      pushNews(pickOne([
        `${adv.name} reads your draft in front of you, making small noises. It's going well, you think.`,
        `${adv.name} gives you three papers to read and one good idea. You write the idea on your hand.`,
        `${adv.name} spends the first twenty minutes on a story about their own advisor. Then, in five, they fix your chapter.`,
        `${adv.name} draws a 2×2 matrix on the whiteboard. Your whole project fits in the top-right box. You photograph it.`,
        `${adv.name} asks, "But what's the story?" You don't know. By the end of the hour, you do.`
      ]));
    }
  }

  if (id === "chapter") {
    adv.stats.meetings++;
    learnTrait(adv, "demandingness");
    const quality = computePaperQuality();
    const bar = 40 + t.demandingness / 2;
    applyStoryEffects({ landmark: 0.06 });
    if (quality >= bar) {
      adjustFavor(6);
      applyStoryEffects({ score: 1 });
      pushNews(`${adv.name} returns your chapter with one comment: "Good." You read it eleven times.`);
    } else {
      adjustFavor(-2);
      pushNews(pickOne([
        `${adv.name} returns your chapter covered in red ink. In the margin of page 3: "?" Just that.`,
        `${adv.name} returns your chapter with tracked changes. There are 1,140 of them. Most are commas.`,
        `${adv.name}'s only comment, on page 41: "Says who?"`
      ]));
    }
  }

  if (id === "grunt") {
    adv.stats.grunt++;
    learnTrait(adv, "network");
    adjustFavor(8 + Math.round(t.demandingness / 20));
    pushNews(pickOne([
      `You review three papers for a journal in ${adv.name}'s name. One of them cites ${adv.name} eleven times. You recommend acceptance.`,
      `You format ${adv.name}'s grant budget at midnight. They say "thanks" in lab meeting, which counts.`,
      `You feed ${adv.name}'s fish for a week. Two of them die. You buy two identical fish. Nobody knows.`,
      `You rewrite ${adv.name}'s keynote slides. They give the talk and get a standing ovation.`,
      `You reconcile ${adv.name}'s travel receipts. One is for a "working dinner" for eleven people in Lisbon.`
    ]));
  }

  runHooks("advisorAction", id);
  rebuildModifiers();
  return true;
}

// Switch advisors: once per stage, and it's expensive
function canSwitchAdvisor() {
  const adv = state.advisor;
  if (!adv) return { ok: false, reason: "" };
  if (adv.switched) return { ok: false, reason: "You've already switched once" };
  return { ok: true, reason: "" };
}

function switchAdvisor() {
  if (!canSwitchAdvisor().ok) return false;
  const old = state.advisor;
  state.advisorHistory.push({ name: old.name, archetype: old.archetype, stage: old.stage, favor: Math.round(old.favor), letter: 20, prestige: old.prestige, left: true });
  state.advisor = null;
  state.inbox = (state.inbox ?? []).filter(m => m.source !== "advisor");
  applyStoryEffects({ landmark: -0.25, prestige: -2, traits: { neuroticism: 2 }, flag: "switchedAdvisor" });
  state.advisorCandidates = rollAdvisorCandidates(state.levelIndex);
  state.advisorCandidates.forEach(c => { c.switched = true; c.favor = 40; });
  state.advisorChoosingSince = state.gameTicks ?? 0;
  pushNews(`You leave ${old.name}'s lab. It takes three meetings and a form with seven signatures. You lose a quarter of your progress and gain the ability to sleep.`);
  storyLog(`You left ${old.name}'s lab. It was the right call, probably.`, "advisor");
  rebuildModifiers();
  return true;
}

// ── Requests and events (in the inbox) ────────────────────────────────
// Requests: { id, archetypes?, subject, body, yes: {label, cost, fx, out}, no: {...}, ignore: {fx, out}, due }
window.ADVISOR_REQUESTS = [
  { id: "proofread_grant", subject: "Quick favor", due: 70,
    body: "Can you proofread my grant? It's due tomorrow at 5. Should only take an hour. (It's 94 pages.)",
    yes:    { label: "Proofread it tonight", cost: { energy: 20 }, fx: { favor: 9 }, out: "You find 212 typos and one sentence that says the opposite of what they meant. {advisor} submits it at 4:58." },
    no:     { label: "Say you're swamped", fx: { favor: -3 }, out: "\"No worries!\" says {advisor}, who clearly has worries." },
    ignore: { fx: { favor: -8 }, out: "{advisor} submitted the grant with \"pubic health\" in the title. They know you saw the email." } },

  { id: "lab_meeting", subject: "Lab meeting Thursday", due: 80,
    body: "You're presenting at lab meeting Thursday. Show us where things are. Everyone's excited.",
    yes:    { label: "Prepare a real talk", cost: { energy: 20, drafts: 2 }, fx: { favor: 7, knowledge: 30 }, out: "Your talk goes well. A labmate asks a question so good it changes your next chapter." },
    no:     { label: "Ask to push it a week", fx: { favor: -2 }, out: "Pushed a week. Then it's Thursday again, somehow." },
    ignore: { fx: { favor: -7, traits: { neuroticism: 2 } }, out: "You present eleven slides you made that morning. One of them is a photo of a whiteboard." } },

  { id: "keynote_numbers", subject: "Need numbers for my keynote", due: 60, archetypes: ["rising", "empire", "legend", "micromanager"],
    body: "Giving a keynote in Geneva Friday. Can you run the numbers on the new data and send me three figures? Thx",
    yes:    { label: "Run the numbers", cost: { energy: 15, knowledge: 30 }, fx: { favor: 10, network: 2 }, out: "{advisor} shows your figures in Geneva. They thank \"my wonderful lab.\" You are part of the lab." },
    no:     { label: "Point out it's not your project", fx: { favor: -5, integrity: 1 }, out: "{advisor} goes quiet for a few days. Then, \"Fair enough.\" It isn't, to them." },
    ignore: { fx: { favor: -9 }, out: "{advisor} gives the keynote without figures. You hear it went \"fine.\"" } },

  { id: "teach_class", subject: "Can you cover my class?", due: 75,
    body: "I'm traveling next week. Can you cover my intro lecture? Slides are in the shared drive (somewhere). 300 students.",
    yes:    { label: "Teach it", cost: { energy: 30 }, fx: { favor: 10, knowledge: 15, meaning: 1 }, out: "You teach 300 undergraduates. A third are asleep, a third are on their phones, and one asks a question you still think about." },
    no:     { label: "Decline", fx: { favor: -4 }, out: "{advisor} cancels class. The students are thrilled. {advisor} is not." },
    ignore: { fx: { favor: -10 }, out: "Nobody covered the class. 300 students wait fifteen minutes (the rule!) and leave. {advisor} hears about it from the chair." } },

  { id: "airport", subject: "Silly question", due: 50, archetypes: ["buddy", "oldguard", "rising", "micromanager"],
    body: "Silly question, any chance you could pick me up from the airport Sunday? 6:10 a.m. arrival.",
    yes:    { label: "Set an alarm", cost: { energy: 15 }, fx: { favor: 7 }, out: "You wait at arrivals at 6:10 a.m. holding a coffee for {advisor}. You talk about your project the whole way back. It's the best meeting you've had." },
    no:     { label: "You don't have a car", fx: { favor: -1 }, out: "\"Oh right, no worries.\" You suspect you are now known as the one without a car." },
    ignore: { fx: { favor: -4 }, out: "{advisor} takes a taxi. It is mentioned once, lightly, in a way you'll remember for years." } },

  { id: "cite_me", subject: "One small thing", due: 60,
    body: "Read your draft. One small thing: you should really cite my 2004 paper in the intro. And the 2007. And possibly the 2011 book.",
    yes:    { label: "Cite all three", fx: { favor: 6, integrity: -1 }, out: "Three new citations to {advisor}. Your intro now has a paragraph that exists only to hold them." },
    no:     { label: "Cite only the relevant one", cost: { energy: 5 }, fx: { favor: 1, integrity: 1 }, out: "You cite the 2004 paper, which is relevant. {advisor} notices the other two aren't there." },
    ignore: { fx: { favor: -5 }, out: "Your draft comes back with \"Ahem.\" written next to the intro." } },

  { id: "authorship", subject: "Authorship on your paper", due: 70, archetypes: ["empire", "rising", "visionary", "legend"],
    body: "Before you submit: I think my postdoc should be second author on your paper. They gave you some really useful feedback that one time.",
    yes:    { label: "Add the postdoc", fx: { favor: 7, integrity: -2, network: 1 }, out: "The postdoc is now second author. They thank you by never mentioning it again." },
    no:     { label: "Push back, politely", cost: { energy: 10 }, fx: { favor: -6, integrity: 3, resilience: 2 }, out: "You push back. The paper goes out with two authors. Lab meeting is quiet for a month." },
    ignore: { fx: { favor: -6 }, out: "{advisor} adds the postdoc to the submission themselves. You find out from the confirmation email." } },

  { id: "plants", subject: "While I'm on sabbatical", due: 60, archetypes: ["oldguard", "buddy", "legend", "visionary"],
    body: "I'll be away for the semester. Could you water my plants and check the mail? Key is under the mat. The fern is a diva.",
    yes:    { label: "Water the plants", cost: { energy: 8 }, fx: { favor: 6, meaning: 1 }, out: "The fern lives. {advisor} brings you back a small, specific gift that shows they were paying attention." },
    no:     { label: "Recommend a labmate", fx: { favor: -1 }, out: "Your labmate waters the plants. Your labmate is now the favorite." },
    ignore: { fx: { favor: -5 }, out: "The fern does not survive the semester. {advisor} never asks you for anything personal again." } },

  { id: "rewrite_intro", subject: "Thoughts on your intro", due: 80, archetypes: ["micromanager", "visionary", "rising"],
    body: "I've rewritten your introduction. Please accept all changes. (Also the abstract. And the title. And I've moved the discussion to the beginning.)",
    yes:    { label: "Accept all changes", fx: { favor: 6, meaning: -2 }, out: "Your paper is now very good and doesn't sound like you at all." },
    no:     { label: "Keep your version, fold in their best ideas", cost: { energy: 20, knowledge: 40 }, fx: { favor: 2, meaning: 2, resilience: 1 }, out: "It takes a week. The result is better than either version. {advisor} says \"see?\" as if it were their plan." },
    ignore: { fx: { favor: -6 }, out: "{advisor} submits their version. With your name on it." } },

  { id: "weekend", subject: "Saturday?", due: 50, archetypes: ["micromanager", "empire", "rising"],
    body: "Can you come in Saturday? The equipment's free and we need the pilot data before the site visit.",
    yes:    { label: "Come in Saturday", cost: { energy: 25 }, fx: { favor: 8, knowledge: 20, traits: { neuroticism: 1 } }, out: "You spend Saturday in the windowless lab with two other students and a broken centrifuge. You bond. The pilot data is fine." },
    no:     { label: "You have plans", fx: { favor: -5, meaning: 1 }, out: "You have plans. They are good plans. You check email during all of them." },
    ignore: { fx: { favor: -8 }, out: "On Monday, {advisor} says \"we missed you Saturday\" in front of everyone." } },

  { id: "move_house", subject: "big ask lol", due: 60, archetypes: ["buddy"],
    body: "big ask lol — any chance you could help me move this weekend? pizza and beer on me. it's a third floor walkup",
    yes:    { label: "Lift boxes", cost: { energy: 30 }, fx: { favor: 10, network: 1 }, out: "You carry a couch up three flights. {advisor} buys pizza and tells you, a little drunk, what they really think of the department." },
    no:     { label: "Your back is bad", fx: { favor: -2 }, out: "\"No stress!!\" {advisor} sends you a photo of four other students carrying the couch." },
    ignore: { fx: { favor: -4 }, out: "{advisor} moves without you. You see the photos. Everyone looks like they're having fun." } },

  { id: "ghost_review", subject: "Fwd: Invitation to review", due: 70, archetypes: ["legend", "empire", "rising", "visionary"],
    body: "Fwd: \"Invitation to review for the Journal of...\" Can you draft this one? I'll look it over before I submit it. (I won't.)",
    yes:    { label: "Write the review", cost: { energy: 15 }, fx: { favor: 7, knowledge: 35, integrity: -1 }, out: "You write a careful four-page review. {advisor} submits it unchanged under their name. You learn more from it than from any seminar." },
    no:     { label: "Say you'd love to, as a named co-reviewer", cost: { energy: 15 }, fx: { favor: 2, knowledge: 35, integrity: 2, reputation: 1 }, out: "The editor adds you as co-reviewer. It's a line on your CV and the start of your relationship with that journal." },
    ignore: { fx: { favor: -6 }, out: "The review is three weeks late. The editor emails {advisor}. {advisor} emails you: \"??\"" } },

  { id: "snacks", subject: "Snack rotation", due: 60,
    body: "Reminder: it's your week for lab meeting snacks! (Last week's hummus set a high bar.)",
    yes:    { label: "Bring the good hummus", cost: { money: 25 }, fx: { favor: 3, meaning: 1 }, out: "You bring the good hummus and the expensive pita. A labmate asks where you got it. It's the most anyone has engaged with your work all semester." },
    no:     { label: "Bring a bag of baby carrots", fx: { favor: -1 }, out: "You bring baby carrots. They sit untouched, sweating gently, through a forty-minute talk on mixed models." },
    ignore: { fx: { favor: -3 }, out: "There are no snacks at lab meeting. Everyone knows whose week it was." } },

  { id: "write_own_letter", subject: "Re: letter for your fellowship", due: 70, archetypes: ["legend", "empire", "rising", "ghost", "buddy"],
    body: "Happy to support your application! Could you draft the letter yourself? I'll sign it. You know your work best.",
    yes:    { label: "Write it glowingly", cost: { energy: 10 }, fx: { favor: 3, integrity: -1, prestige: 1 }, out: "You describe yourself as \"one of the most promising scholars of their generation.\" It's the hardest thing you've written all year." },
    no:     { label: "Write it honestly", cost: { energy: 10 }, fx: { favor: 3, meaning: 1 }, out: "You write a modest, accurate letter about yourself. {advisor} signs it without reading it. It's fine. It's not glowing." },
    ignore: { fx: { favor: -4 }, out: "You don't write it. Neither does {advisor}. The fellowship deadline passes quietly, like a ship in the night." } }
];

// Advisor events: bigger moments, sometimes with real choices
window.ADVISOR_EVENTS = [
  { id: "sabbatical", weight: 1, archetypes: ["oldguard", "legend", "visionary", "rising", "buddy"],
    subject: "Off to Oxford!", body: "I'll be on sabbatical for a while. Keep working hard! I'll be checking email \"periodically.\"",
    run: (adv) => { adv.away = (state.gameTicks ?? 0) + randInt(900, 1500); },
    choices: [ { label: "Enjoy the quiet", fx: {}, out: "{advisor} is on sabbatical. No requests. No meetings. You realize how much of your week was them." } ] },

  { id: "poached", weight: 0.7, archetypes: ["rising", "legend", "empire", "visionary"],
    subject: "Big news (confidential)", body: "I've accepted an offer from another university. I'd love for you to come with me. Or you can stay; the department will find you someone.",
    choices: [
      { label: "Follow them", fx: { favor: 12, prestige: 3, landmark: -0.10 }, out: "You pack up your desk and follow {advisor}. New city, new building, same advisor. Your progress takes a hit; your loyalty is noted." },
      { label: "Stay", fx: {}, run: () => { const a = state.advisor; if (a) { a.favor = 40; a.switched = true; } },
        out: "You stay. {advisor} leaves. You're reassigned to someone with \"room in the lab,\" which means someone nobody chose.", reassign: true } ] },

  { id: "credit", weight: 0.8, archetypes: ["rising", "empire", "visionary", "legend"],
    subject: "Saw the conference program?", body: "(From a labmate) Did you see? {advisor} presented your idea at the conference. As theirs. Your name wasn't on the slide.",
    choices: [
      { label: "Confront them about it", cost: { energy: 15 }, fx: { favor: -12, integrity: 3, meaning: 3, resilience: 3 }, out: "It's the most uncomfortable meeting of your life. {advisor} says \"of course it's your idea\" and adds your name to the next slide. Things are different now." },
      { label: "Let it go", fx: { favor: 4, meaning: -3, traits: { neuroticism: 2 } }, out: "You let it go. It doesn't let go of you." },
      { label: "Mention it, casually, at lab meeting", fx: { favor: -4, network: 2, reputation: 2 }, out: "\"Funny, I was just working on that!\" The room goes very still. Everyone knows now. So does {advisor}." } ] },

  { id: "intro_famous", weight: 1, archetypes: ["legend", "empire", "rising", "oldguard", "buddy"], minFavor: 55,
    subject: "Someone you should meet", body: "Come find me at the reception tonight. There's someone you should meet.",
    choices: [
      { label: "Go to the reception", cost: { energy: 15 }, fx: { network: 8, favor: 2 }, out: "{advisor} introduces you to someone whose book you have read twice. They ask what you work on, and they actually listen." },
      { label: "You're exhausted", fx: { favor: -2 }, out: "You go to bed. You find out the next morning who it was. You think about it for a year." } ] },

  { id: "late_email", weight: 1.3, archetypes: ["micromanager", "rising", "empire", "visionary"],
    subject: "quick question", body: "Sent 11:58 p.m.: \"Quick question — where are we on the analysis?\"",
    choices: [
      { label: "Reply now", cost: { energy: 10 }, fx: { favor: 4, traits: { neuroticism: 1 } }, out: "You reply at 12:03 a.m. {advisor} replies at 12:04. You both pretend this is normal." },
      { label: "Reply in the morning", fx: { favor: -1, meaning: 1 }, out: "You reply at 9 a.m. {advisor} has already sent two more emails." } ] },

  { id: "big_grant", weight: 1, archetypes: ["rising", "empire", "micromanager", "legend", "visionary"],
    subject: "We got it!!", body: "The grant came through. Five years. You're on it — stipend and summer salary. Expectations are going to go up a bit.",
    run: (adv) => { adv.traits.demandingness = clamp(adv.traits.demandingness + 8, 0, 100); },
    choices: [ { label: "Celebrate", fx: { money: 6000, favor: 3 }, out: "Funded. {advisor} buys champagne for the lab. It's warm, and it's the best champagne you've ever had." } ] },

  { id: "crisis", weight: 0.6, archetypes: ["oldguard", "buddy", "visionary", "rising", "micromanager"],
    subject: "(no subject)", body: "{advisor} has started coming into the lab at 2 a.m. Their marriage is apparently ending. They asked if you wanted to get a coffee and \"talk about anything except work.\"",
    choices: [
      { label: "Get the coffee", cost: { energy: 15 }, fx: { favor: 8, meaning: 4 }, out: "You talk about films and dogs and not much else. At the end {advisor} says \"thank you\" like they mean something bigger." },
      { label: "Keep it professional", fx: { favor: -1 }, out: "You say you're on a deadline. It's true. It's also not why." } ] },

  { id: "retiring", weight: 0.5, archetypes: ["oldguard"],
    subject: "An announcement", body: "After forty-one years I've decided it really is time. I'll stay on to see you through, emeritus, but I won't be taking new students.",
    choices: [ { label: "Ask them to stay on your committee", fx: { favor: 8, meaning: 3 }, out: "\"Of course,\" says {advisor}. \"I wouldn't miss it.\" At your defense they're the only one who asks a kind question." } ] },

  { id: "other_student", weight: 0.7, archetypes: ["empire", "rising", "visionary"],
    subject: "Exciting new direction", body: "I've asked our new postdoc to take the lead on the project you've been working on. You can be second author! Should free you up to explore.",
    choices: [
      { label: "Fight for it", cost: { energy: 25 }, chance: { p: (s) => (s.advisor?.favor ?? 50) / 100,
          win: { fx: { favor: -4, resilience: 3 }, out: "You make your case. {advisor} reverses it. The postdoc doesn't speak to you for a semester." },
          lose: { fx: { favor: -8, landmark: -0.08 }, out: "You make your case. {advisor} listens, nods, and doesn't change anything." } } },
      { label: "Start something new", fx: { landmark: -0.06, meaning: 2, perm: { paperMult: 1.02 } }, out: "You start something new, alone, at night. It becomes your best chapter." } ] },

  { id: "their_book", weight: 1, archetypes: ["oldguard", "legend", "visionary", "empire", "micromanager", "rising", "buddy"],
    subject: "Coffee?", body: "Over coffee, {advisor} asks, casually, what you thought of their book.",
    choices: [
      { label: "Admit you haven't read it", fx: { favor: -3, integrity: 1 }, out: "\"Ah.\" {advisor} lends you their own copy, annotated. You read it that weekend. It's good, actually." },
      { label: "Say you loved chapter four", chance: { p: 0.5,
          win:  { fx: { favor: 7 }, out: "Chapter four is their favorite. Nobody ever mentions chapter four. {advisor} talks for an hour. You've never seen them this happy." },
          lose: { fx: { favor: -7, integrity: -1 }, out: "The book has three chapters. {advisor} says nothing. They don't need to." } } },
      { label: "Ask what they'd change now", fx: { favor: 4, knowledge: 20 }, out: "Nobody has asked them that in twenty years. The answer takes two coffees and is better than the book." } ] },

  { id: "lab_retreat", weight: 0.8, archetypes: ["empire", "rising", "buddy", "micromanager"],
    subject: "Lab retreat (mandatory fun)", body: "Lab retreat this weekend! A cabin, two days, a \"vision session,\" and a ropes course. Attendance strongly encouraged.",
    choices: [
      { label: "Go, and do the trust fall", cost: { energy: 20 }, fx: { favor: 6, network: 2 }, out: "You fall backwards into the arms of four labmates. They catch you. One of them becomes your closest friend in the program." },
      { label: "Go, but bring your laptop", cost: { energy: 10 }, fx: { favor: 2, drafts: 3 }, out: "You write in the cabin's one chair while the lab does the ropes course. Productive. Lonely. Someone brings you a s'more." },
      { label: "Have a \"family thing\"", fx: { favor: -4, meaning: 1 }, out: "You stay home. The photos look fun. There's an inside joke about a moose you'll never understand." } ] },

  { id: "rival_lab", weight: 0.6, archetypes: ["rising", "empire", "legend", "micromanager"],
    subject: "Do NOT talk to them", body: "Heads up: {rival}'s lab is working on something close to ours. Don't share anything at the conference. Not even with friends.",
    choices: [
      { label: "Keep quiet", fx: { favor: 3, rival: -5 }, out: "At the conference you talk about the weather with people you like. It's lonely being on a team." },
      { label: "Grab a beer with {rival} anyway", fx: { favor: -4, rival: 15, network: 3 }, out: "You and {rival} spend three hours comparing advisors. You have more in common with each other than with either of them." } ] }
];

function advisorFits(entry, adv) {
  if (entry.archetypes && !entry.archetypes.includes(adv.archetype)) return false;
  if (entry.minFavor && adv.favor < entry.minFavor) return false;
  return true;
}

function maybeAdvisorMail() {
  const adv = state.advisor;
  if (!adv || adv.archetype === "ghost") return;
  if ((state.inbox ?? []).some(m => m.source === "advisor")) return;   // one at a time

  if (Math.random() < 0.3) {
    const pool = window.ADVISOR_EVENTS.filter(e => advisorFits(e, adv));
    if (!pool.length) return;
    const ev = pool[weightedIndex(pool.map(e => e.weight ?? 1))];
    if (ev.run) ev.run(adv);
    sendMail("advisor", {
      key: `event:${ev.id}`, kind: "advisor", eventId: ev.id,
      from: adv.name, subject: storyText(ev.subject), body: storyText(ev.body),
      choices: ev.choices.map((c, i) => ({ label: storyText(c.label), cost: c.cost ?? null, ref: i }))
    });
    return;
  }

  const pool = window.ADVISOR_REQUESTS.filter(r => advisorFits(r, adv));
  if (!pool.length) return;
  const req = pickOne(pool);
  const due = Math.round(req.due * (1.2 - adv.traits.demandingness / 250));
  sendMail("advisor", {
    key: `req:${req.id}`, kind: "advisor", requestId: req.id,
    from: adv.name, subject: req.subject, body: storyText(req.body), dueIn: due,
    choices: [
      { label: storyText(req.yes.label), cost: req.yes.cost ?? null },
      { label: storyText(req.no.label),  cost: req.no.cost ?? null }
    ]
  });
}

registerMailSource("advisor", {
  choose(mail, index) {
    const adv = state.advisor;
    if (!adv) return null;
    if (mail.requestId) {
      const req = window.ADVISOR_REQUESTS.find(r => r.id === mail.requestId);
      if (!req) return null;
      const side = index === 0 ? req.yes : req.no;
      if (index === 0) adv.stats.requestsDone++; else adv.stats.requestsDeclined++;
      adv.lastContact = state.gameTicks ?? 0;
      if (adv.stats.requestsDone + adv.stats.requestsDeclined >= 2) learnTrait(adv, "demandingness");
      applyStoryEffects(side.fx);
      return storyText(side.out);
    }
    if (mail.eventId) {
      const ev = window.ADVISOR_EVENTS.find(e => e.id === mail.eventId);
      let c = ev?.choices?.[mail.choices?.[index]?.ref ?? index];
      if (!c) return null;
      if (c.chance) {
        const p = typeof c.chance.p === "function" ? c.chance.p(state) : c.chance.p;
        c = Object.assign({}, c, Math.random() < p ? c.chance.win : c.chance.lose);
      }
      const name = adv.name;
      applyStoryEffects(c.fx);
      if (c.run) c.run(adv);
      const out = storyText(c.out).replace(/\{advisor\}/g, name);
      if (c.reassign) reassignAdvisor();
      storyLog(out, "advisor");
      return out;
    }
    return null;
  },
  expire(mail) {
    const adv = state.advisor;
    if (!adv) return null;
    if (mail.requestId) {
      const req = window.ADVISOR_REQUESTS.find(r => r.id === mail.requestId);
      adv.stats.requestsIgnored++;
      learnTrait(adv, "demandingness");
      applyStoryEffects(req?.ignore?.fx);
      return storyText(req?.ignore?.out);
    }
    return null;
  }
});

// Your advisor left and you stayed: someone gets assigned to you
function reassignAdvisor() {
  const old = state.advisor;
  if (old) state.advisorHistory.push({ name: old.name, archetype: old.archetype, stage: old.stage, favor: Math.round(old.favor), letter: advisorLetter(old), prestige: old.prestige, left: true });
  state.advisor = makeAdvisor(pickOne(["oldguard", "ghost", "micromanager", "buddy"]), state.levelIndex);
  state.advisor.favor = 40;
  state.advisor.switched = true;
  if (state.cv) state.cv.advisor = state.advisor.name;
}

// ── The mirror: your own students' requests ───────────────────────────
// {echo} in an outcome is replaced with a line about your old advisor, if
// you had one: the moment you realize you've become them (or haven't).
window.STUDENT_REQUESTS = [
  { id: "read_chapter", subject: "Chapter draft (sorry it's long)", due: 80,
    body: "Hi! I've attached my chapter. It's 74 pages. No rush, but my committee meeting is Thursday.",
    yes: { label: "Read it properly", cost: { energy: 20 }, fx: { morale: 10, meaning: 2 }, out: "You read all 74 pages and leave real comments. {student} thanks you three times. You remember the first time someone did this for you." },
    no:  { label: "Skim it and say \"looks great\"", cost: { energy: 3 }, fx: { morale: 2, integrity: -1 }, out: "\"Looks great!\" {student} goes into their committee meeting with a problem in chapter two you didn't catch." },
    ignore: { fx: { morale: -10 }, out: "You never got to {student}'s chapter. Their committee did. It went badly, and they don't bring it up. {echo}" } },

  { id: "rec_letter", subject: "Letter of recommendation?", due: 90,
    body: "Would you be willing to write me a letter for a fellowship? Deadline's in two weeks. I've attached a draft you can \"edit as you see fit.\"",
    yes: { label: "Write a real letter", cost: { energy: 15, drafts: 1 }, fx: { morale: 12, meaning: 2 }, out: "You write {student} a letter that says specific, true things. They get the fellowship." },
    no:  { label: "Sign their draft", fx: { morale: 4, integrity: -2 }, out: "You sign the letter {student} wrote about themselves. It says you've \"never seen a student like them.\" {echo}" },
    ignore: { fx: { morale: -12 }, out: "The deadline passes. {student} doesn't apply. They don't mention it. That's worse." } },

  { id: "conference_money", subject: "Conference travel", due: 70,
    body: "My poster got accepted! Is there any money for travel? I can share a room with three people.",
    yes: { label: "Fund the trip", cost: { funds: 1200 }, fx: { morale: 12, network: 1 }, out: "{student} goes, presents, and comes back with a collaborator and a new idea. Best $1,200 the lab has spent." },
    no:  { label: "Tell them to apply for a travel grant", fx: { morale: -3 }, out: "{student} applies for the travel grant. The travel grant is $200." },
    ignore: { fx: { morale: -8 }, out: "{student} pays for the conference with a credit card. You find out later." } },

  { id: "vacation", subject: "Time off?", due: 60,
    body: "Would it be okay if I took a week off in August? I haven't seen my family in two years.",
    yes: { label: "Of course, go", fx: { morale: 15, meaning: 2 }, out: "\"Of course.\" {student} comes back rested and finishes a chapter in ten days." },
    no:  { label: "\"Is now really the time?\"", fx: { morale: -12, meaning: -2 }, out: "{student} stays. They are physically present in the lab every day in August. {echo}" },
    ignore: { fx: { morale: -6 }, out: "{student} goes anyway, after waiting a week for an answer that didn't come." } },

  { id: "authorship_q", subject: "Question about authorship", due: 80,
    body: "Sorry if this is awkward — on the paper we're submitting, would I be first author? I did most of the analysis and wrote the draft.",
    yes: { label: "Yes, you're first author", fx: { morale: 14, integrity: 2 }, out: "\"Yes, obviously.\" {student} looks like they might cry. The paper does well." },
    no:  { label: "\"Let's put me first, for visibility\"", fx: { morale: -15, integrity: -4, perm: { citationMult: 1.01 } }, out: "You're first author. It is good for the paper's visibility. {student} updates their CV and their opinion of you. {echo}" },
    ignore: { fx: { morale: -8 }, out: "You don't answer. The paper goes out with you first, by default. {student} doesn't ask again." } },

  { id: "rec_job", subject: "Faculty job?", due: 80,
    body: "I'm going on the job market this year. Could we talk about strategy? I'm terrified.",
    yes: { label: "Spend an afternoon on it", cost: { energy: 25 }, fx: { morale: 12, meaning: 3, network: 1 }, out: "You go through every application with {student}. You tell them the market is random. You don't tell them how random." },
    no:  { label: "Forward them a blog post", fx: { morale: -4 }, out: "You forward \"Ten Tips for the Academic Job Market.\" They've read it. Everyone's read it." },
    ignore: { fx: { morale: -8 }, out: "{student} goes on the market alone. They'll figure it out, the way you did, painfully." } },

  { id: "quit_q", subject: "Can we talk? (not urgent) (kind of urgent)", due: 70,
    body: "I've been thinking a lot about whether a PhD is right for me. Could we meet? I don't know who else to ask.",
    yes: { label: "Clear your afternoon", cost: { energy: 20 }, fx: { morale: 18, meaning: 4 }, out: "You listen more than you talk. {student} decides to stay for now, and to start seeing someone at counseling services. You tell them you did too." },
    no:  { label: "\"Everyone feels this way. Push through.\"", fx: { morale: -6, meaning: -2 }, out: "\"Everyone feels this way.\" It's true, and it's the least helpful true thing you've ever said. {echo}" },
    ignore: { fx: { morale: -14 }, out: "You meant to reply. By the time you do, {student} has already decided, and it isn't about you, and it is." } },

  { id: "idea", subject: "Crazy idea", due: 80,
    body: "This might be a crazy idea, but what if we tested the main finding of your 2nd most-cited paper with better data? I think it might not hold up.",
    yes: { label: "\"Do it. I want to know.\"", fx: { morale: 14, integrity: 3, meaning: 3, citations: -20 }, out: "It doesn't hold up. {student} publishes the correction with you as coauthor. It's the paper you're proudest of, and it cost you twenty citations." },
    no:  { label: "\"Let's focus on new work\"", fx: { morale: -8, integrity: -2 }, out: "{student} drops it. Someone else checks it two years later. It doesn't hold up. {echo}" },
    ignore: { fx: { morale: -6 }, out: "{student} takes your silence as an answer. It was one." } }
];

const ECHO_LINES = {
  legend:       "You realize this is exactly what {oldAdvisor} would have done, if {oldAdvisor} had ever read your email.",
  micromanager: "Somewhere, {oldAdvisor} is updating a spreadsheet, and you finally understand the spreadsheet.",
  rising:       "You hear {oldAdvisor}'s voice come out of your mouth: \"Let's think about visibility.\" You need to sit down.",
  oldguard:     "{oldAdvisor} would never have done this. You know, because you remember the tea.",
  empire:       "You wonder, briefly, whether {student} knows your name. Then you remember {oldAdvisor}, and you check.",
  visionary:    "You promise yourself you'll remember this was {student}'s idea. {oldAdvisor} used to promise that too.",
  buddy:        "{oldAdvisor} would have taken them out for a drink first. You're not sure that would have been better.",
  ghost:        "You swore you'd be the advisor {oldAdvisor} never was. You're not, today."
};

function echoLine(studentName) {
  const h = state.advisorHistory ?? [];
  const old = h.find(a => a.stage === 3) ?? h[h.length - 1];
  if (!old) return "";
  return (ECHO_LINES[old.archetype] ?? "").replace(/\{oldAdvisor\}/g, old.name).replace(/\{student\}/g, studentName);
}

function studentOutcome(text, name) {
  return text.replace(/\{echo\}/g, () => echoLine(name)).replace(/\{student\}/g, name).trim();
}

function maybeStudentMail() {
  if (labStudentCount() < 1) return;
  if ((state.inbox ?? []).filter(m => m.source === "student").length >= 2) return;
  const req = pickOne(window.STUDENT_REQUESTS);
  const name = pickLabStudentName() ?? "A student";
  sendMail("student", {
    key: `student:${req.id}:${name}`, kind: "student", requestId: req.id, student: name,
    from: name, subject: req.subject, body: req.body.replace(/\{student\}/g, name), dueIn: req.due,
    choices: [
      { label: req.yes.label, cost: req.yes.cost ?? null },
      { label: req.no.label,  cost: req.no.cost ?? null }
    ]
  });
}

function applyStudentFx(mail, fx) {
  fx = Object.assign({}, fx);
  if (fx.morale) { adjustStudentMorale(mail.student, fx.morale); delete fx.morale; }
  applyStoryEffects(fx);
}

registerMailSource("student", {
  choose(mail, index) {
    const req = window.STUDENT_REQUESTS.find(r => r.id === mail.requestId);
    if (!req) return null;
    const side = index === 0 ? req.yes : req.no;
    applyStudentFx(mail, side.fx);
    const out = studentOutcome(side.out, mail.student);
    if (index !== 0 && /\{echo\}/.test(side.out)) storyLog(out, "mentor");
    if (index === 0) state.story.flags.goodMentor = (state.story.flags.goodMentor ?? 0) + 1;
    return out;
  },
  expire(mail) {
    const req = window.STUDENT_REQUESTS.find(r => r.id === mail.requestId);
    if (!req) return null;
    applyStudentFx(mail, req.ignore.fx);
    return studentOutcome(req.ignore.out, mail.student);
  }
});

function tickStudentRequests() {
  const now = state.gameTicks ?? 0;
  if (now < (state.studentNextRequestAt ?? 0)) return;
  state.studentNextRequestAt = now + randInt(900, 1800);
  if (!inCooldown()) maybeStudentMail();
}

// ── The advisor paper ─────────────────────────────────────────────────
function renderAdvisor() {
  const el = ensurePanel("panel_advisor", "Advisor", "fa-user-tie");
  if (!el) return;
  const info = advisorStageInfo();
  const cands = state.advisorCandidates;
  const adv = state.advisor;
  showPanel(el, !!(info && (adv || cands)));
  if (!info || (!adv && !cands)) return;

  if (!adv && cands) {
    setPanelTitle(el, `Choose a ${info.role}`);
    const left = Math.max(0, ADVISOR_ASSIGN_SECONDS - Math.floor(((state.gameTicks ?? 0) - (state.advisorChoosingSince ?? 0)) * TICK_MS / 1000));
    const cards = cands.map((c, i) => `
      <div class="adv-cand">
        <div class="adv-name">${escHTML(c.name)}</div>
        <div class="adv-rank">${escHTML(c.rank)}</div>
        <div class="adv-rumor">"${escHTML(c.rumor)}"</div>
        <button type="button" class="adv-choose" data-adv-choose="${i}">Ask them</button>
      </div>`).join("");
    setPanelBody(el, `<p class="adv-intro">Three people "might have room." You know them by reputation, which is to say by gossip.</p>
      <div class="adv-cands">${cards}</div>
      <p class="adv-assign">Choose in <span data-live="adv-left"></span>s or the department chooses for you.</p>`);
    setLive(el, "adv-left", String(left));
    return;
  }

  const A = window.ADVISOR_ARCHETYPES[adv.archetype];
  setPanelTitle(el, adv.stage === 4 ? "Your PI" : "Your Advisor");
  const f = Math.round(adv.favor);
  const traits = Object.keys(TRAIT_WORDS).map(t => {
    const [label] = TRAIT_WORDS[t];
    const known = adv.known[t];
    return `<li><span>${label}:</span> <em>${known ? traitWord(t, adv.traits[t]) : "?"}</em></li>`;
  }).join("");
  const actions = Object.entries(ADVISOR_ACTIONS).map(([id, a]) => {
    const st = advisorActionStatus(id);
    const why = st.ok ? "" : st.wait ? `<small data-adv-wait="${id}"></small>` : `<small>${escHTML(st.reason)}</small>`;
    return `<button type="button" class="adv-act" data-adv-act="${id}" ${st.ok ? "" : "disabled"} title="${escHTML(st.ok || st.wait ? a.blurb : st.reason)}"><i class="fa-solid ${a.icon}"></i> ${a.label}${why}</button>`;
  }).join("");
  const sw = canSwitchAdvisor();
  const away = advisorIsAway() ? `<p class="adv-away"><i class="fa-solid fa-plane"></i> On sabbatical. Back "soon."</p>` : "";
  setPanelBody(el, `
    <div class="adv-head">
      <div class="adv-monogram">${escHTML(adv.name.replace(/^Prof\.\s*/, "").split(/\s+/).map(w => w[0]).join("").slice(0, 2))}</div>
      <div>
        <div class="adv-name">${escHTML(adv.name)}</div>
        <div class="adv-rank">${escHTML(adv.rank)}${adv.revealed ? ` · <span class="adv-arch">${escHTML(A.label)}</span>` : ""}</div>
      </div>
    </div>
    ${away}
    <div class="adv-rapport"><span>Rapport</span>
      <div class="adv-bar"><div class="adv-fill" style="width:${f}%"></div></div>
      <em data-live="adv-word">${escHTML(adv.archetype === "ghost" ? "Unknowable" : rapportWord(f))}</em></div>
    <ul class="adv-traits">${traits}</ul>
    <div class="adv-actions">${actions}</div>
    ${sw.ok ? `<button type="button" class="adv-switch" data-adv-switch="1" title="Once per stage. Costs a quarter of your progress and some prestige.">Switch ${advisorNoun()}s…</button>` : ""}`);
  // Countdowns tick in place so the buttons aren't rebuilt every second
  el.querySelectorAll("[data-adv-wait]").forEach(sm => {
    const st = advisorActionStatus(sm.dataset.advWait);
    const t = st.wait ? `Again in ${st.wait}s` : "";
    if (sm.textContent !== t) sm.textContent = t;
  });
}

if (typeof document !== "undefined") {
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-adv-choose], [data-adv-act], [data-adv-switch]");
    if (!btn || btn.disabled) return;
    if (btn.dataset.advChoose != null) chooseAdvisor(Number(btn.dataset.advChoose));
    else if (btn.dataset.advAct) doAdvisorAction(btn.dataset.advAct);
    else if (btn.dataset.advSwitch) {
      const go = () => { switchAdvisor(); render(); };
      if (typeof askConfirm === "function") askConfirm({
        title: `Leave ${state.advisor?.name}?`,
        body: "You'll lose a quarter of your progress, some prestige, and a little sleep at first. You can only do this once per stage. Everyone will hear about it.",
        yes: "Leave the lab", no: "Stay"
      }, go);
      else go();
      return;
    }
    render();
  });
}

// ── Wiring ────────────────────────────────────────────────────────────
onHook("enterLevel", syncAdvisorStage);
onHook("load", syncAdvisorStage);
onHook("modifiers", applyAdvisorModifiers);
onHook("landmarkMult", (v) => v * advisorLandmarkMult());
onHook("moveBonus", letterMoveBonus);
onHook("tick", tickAdvisor);
onHook("second", tickStudentRequests);
onHook("render", renderAdvisor);
onHook("reset", () => { state.advisor = null; state.advisorCandidates = null; });
