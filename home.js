// home.js — the things you buy, the habits you build, the place you live,
// and the routine that eventually does your clicking for you
//
// HABITS AND THINGS. New perks from high school to emeritus: a library card,
// touch-typing, LaTeX, a writing group, therapy, the union, a podcast, a
// chair endowed in your own name. "Things" (category "desk") also appear on
// your desk, and each one on the desk adds a little to your stamina.
//
// HOME. Arcanum had a cottage with room for furniture; you get a childhood
// bedroom, a dorm, an apartment with three roommates, a studio with a
// radiator that clanks... and eventually a cottage by the sea with a writing
// shed. Each home has room for so much furniture, and furniture is where
// most of your extra stamina comes from.
//
// THE ROUTINE. Buy a planner and you can set actions to repeat on their own
// while your energy stays above a reserve. Better planners, timers and
// calendars make the routine faster and longer. This is the answer to the
// late game's endless clicking: you decide what a day looks like, and then
// the days happen.
//
// MILESTONES. The one-at-a-time life events now run past college: your
// first section to TA, the archive, a desk rejection, a city where you know
// no one, a thank-you note from a student.

"use strict";

Object.assign(DEFAULT_STATE, {
  home: { id: null, furniture: [], placed: [] },     // furniture: owned ids; placed: those in the current home
  routine: { slots: [], on: true, reserve: 0.5, acc: 0, ran: 0, idx: 0, sinceRecommit: 0 }
});

// ── Habits and things ─────────────────────────────────────────────────
const once = (s, id) => !s.perks?.[id];
window.PERKS_1_0 = {
  // ── High school ──
  planner: {
    label: "Buy a Planner", category: "habit",
    blurb: "A planner with stickers. You use it for two weeks every September. This time you mean it. (Unlocks your Routine.)",
    visibleWhen: (s) => (s.totalDraftsEver ?? 0) >= 4 && once(s, "planner"),
    cost: { energy: 10, money: 12 }
  },
  library_card: {
    label: "Get a Library Card", category: "habit",
    blurb: "The most powerful object you'll own for a decade. It's free.",
    visibleWhen: (s) => s.levelIndex <= 1 && (s.knowledge ?? 0) >= 10 && once(s, "library_card"),
    cost: { energy: 10 },
    effects: { modifiers: { knowledgeMult: 1.04 }, traits: { openness: +1 } }
  },
  glasses: {
    label: "Get Glasses", category: "habit",
    blurb: "You can see the board now. You had no idea the board had words on it.",
    visibleWhen: (s) => s.levelIndex === 0 && (s.totalDraftsEver ?? 0) >= 10 && once(s, "glasses"),
    cost: { money: 40 },
    effects: { modifiers: { knowledgeMult: 1.03 } }
  },
  learn_to_type: {
    label: "Learn to Touch-Type", category: "habit",
    blurb: "Home row. Home row. Home row. Your pinkies have never worked this hard. Mavis Beacon would be proud.",
    visibleWhen: (s) => s.levelIndex <= 1 && (s.totalDraftsEver ?? 0) >= 8 && once(s, "learn_to_type"),
    cost: { energy: 40, knowledge: 15 },
    effects: { modifiers: { writeCostMult: 0.96 } }
  },
  ap_classes: {
    label: "Take AP Everything", category: "habit",
    blurb: "College credit, eventually. Anxiety, immediately.",
    visibleWhen: (s) => s.levelIndex === 0 && (s.knowledge ?? 0) >= 30 && once(s, "ap_classes"),
    cost: { energy: 35, knowledge: 30 },
    effects: { modifiers: { knowledgeMult: 1.06 }, traits: { neuroticism: +2, conscientiousness: +1 } }
  },
  desk_lamp: {
    label: "Buy a Desk Lamp", category: "desk",
    blurb: "A warm circle of light. Inside it, you are a scholar.",
    visibleWhen: (s) => (s.money ?? 0) >= 15 && once(s, "desk_lamp"),
    cost: { money: 25 },
    effects: { modifiers: { energyRegenMult: 1.03 } }
  },
  globe: {
    label: "Buy an Old Globe", category: "desk",
    blurb: "Half the countries on it don't exist anymore. You spin it while thinking.",
    visibleWhen: (s) => s.levelIndex <= 2 && (s.money ?? 0) >= 50 && once(s, "globe"),
    cost: { money: 70 },
    effects: { traits: { openness: +2 }, modifiers: { paperMult: 1.02 } }
  },

  // ── Undergraduate ──
  office_hours_regular: {
    label: "Actually Go to Office Hours", category: "habit",
    blurb: "It's just you and the professor, every week. They start saving articles for you.",
    visibleWhen: (s) => s.levelIndex === 1 && once(s, "office_hours_regular"),
    cost: { energy: 30 },
    effects: { modifiers: { knowledgeMult: 1.04 }, identity: { network: +3 }, traits: { extraversion: +1 } }
  },
  ra_position: {
    label: "Become a Research Assistant", category: "habit",
    blurb: "You alphabetize a professor's reprints. It counts as research experience.",
    visibleWhen: (s) => s.levelIndex === 1 && (s.knowledge ?? 0) >= 80 && once(s, "ra_position"),
    cost: { energy: 50, knowledge: 60 },
    effects: { modifiers: { paperMult: 1.06 }, identity: { network: +2 } }
  },
  pomodoro: {
    label: "Buy a Pomodoro Timer", category: "desk",
    blurb: "A tomato-shaped kitchen timer. Twenty-five minutes of focus, five of guilt. Your routine runs faster.",
    visibleWhen: (s) => s.perks?.planner && s.levelIndex >= 1 && once(s, "pomodoro"),
    cost: { money: 15 }
  },
  houseplant: {
    label: "Adopt a Houseplant", category: "desk",
    blurb: "A pothos. The only thing in your life you're keeping alive on purpose.",
    visibleWhen: (s) => s.levelIndex >= 1 && (s.money ?? 0) >= 10 && once(s, "houseplant"),
    cost: { money: 15 },
    effects: { modifiers: { energyRegenMult: 1.02 } },
    apply: (s) => { s.story.meaning = Math.min(100, (s.story.meaning ?? 30) + 2); }
  },
  used_laptop: {
    label: "Buy a Used Laptop", category: "desk",
    blurb: "Previous owner's stickers included. The battery lasts about as long as a lecture.",
    visibleWhen: (s) => s.levelIndex >= 1 && s.levelIndex <= 3 && (s.money ?? 0) >= 200 && once(s, "used_laptop"),
    cost: { money: 350 },
    effects: { modifiers: { writeCostMult: 0.95 } }
  },
  study_abroad: {
    label: "Study Abroad", category: "habit",
    blurb: "A semester somewhere with better bread. You come back insufferable, and better read.",
    visibleWhen: (s) => s.levelIndex === 1 && (s.money ?? 0) >= 1500 && once(s, "study_abroad"),
    cost: { money: 2500, energy: 30 },
    effects: { modifiers: { knowledgeMult: 1.05 }, traits: { openness: +5, extraversion: +2 }, identity: { network: +3 } }
  },
  moka_pot: {
    label: "Buy a Moka Pot", category: "desk",
    blurb: "Stovetop espresso. Unlocks coffee, which unlocks the crash after coffee.",
    visibleWhen: (s) => s.levelIndex >= 1 && (s.money ?? 0) >= 20 && once(s, "moka_pot"),
    cost: { money: 35 }
  },

  // ── Master's ──
  learn_latex: {
    label: "Learn LaTeX", category: "habit",
    blurb: "Your documents are beautiful. Your figures are on the wrong page.",
    visibleWhen: (s) => s.levelIndex >= 2 && (s.knowledge ?? 0) >= 150 && once(s, "learn_latex"),
    cost: { energy: 40, knowledge: 120 },
    effects: { modifiers: { writeCostMult: 0.95 } }
  },
  reference_manager: {
    label: "Set Up a Reference Manager", category: "habit",
    blurb: "Four thousand PDFs, finally in one place. You'll read eleven of them.",
    visibleWhen: (s) => s.levelIndex >= 2 && once(s, "reference_manager"),
    cost: { energy: 30 },
    effects: { modifiers: { paperMult: 1.05 } }
  },
  color_calendar: {
    label: "Color-Code Your Calendar", category: "habit",
    blurb: "Blue for teaching, green for research, red for the meetings you'll be late to. One more routine slot.",
    visibleWhen: (s) => s.perks?.planner && s.levelIndex >= 2 && once(s, "color_calendar"),
    cost: { energy: 25 }
  },
  noise_cancel: {
    label: "Buy Noise-Canceling Headphones", category: "desk",
    blurb: "The open-plan office disappears. So do your labmates, which is the point.",
    visibleWhen: (s) => s.levelIndex >= 2 && (s.money ?? 0) >= 150 && once(s, "noise_cancel"),
    cost: { money: 280 },
    effects: { modifiers: { knowledgeMult: 1.05 }, traits: { extraversion: -1 } }
  },
  bookshelf: {
    label: "Build a Bookshelf", category: "desk",
    blurb: "Flat-pack, two leftover screws. It holds every book you mean to read.",
    visibleWhen: (s) => s.levelIndex >= 2 && (s.money ?? 0) >= 80 && once(s, "bookshelf"),
    cost: { money: 120, energy: 20 },
    effects: { modifiers: { knowledgeMult: 1.03, paperMult: 1.02, readingSpeedMult: 1.1 } }
  },
  free_food_map: {
    label: "Map Every Free Lunch on Campus", category: "habit",
    blurb: "Mondays: the chemistry seminar. Thursdays: the provost's town hall. You've never eaten better.",
    visibleWhen: (s) => s.levelIndex >= 2 && s.levelIndex <= 5 && once(s, "free_food_map"),
    cost: { energy: 25 },
    effects: { modifiers: { energyRegenMult: 1.04 } }
  },

  // ── Doctoral ──
  writing_group: {
    label: "Join a Writing Group", category: "habit",
    blurb: "Six people, two hours, one rule: no talking. You've never been so productive or so lonely.",
    visibleWhen: (s) => s.levelIndex >= 3 && once(s, "writing_group"),
    cost: { energy: 40 },
    effects: { modifiers: { writeCostMult: 0.94 }, traits: { neuroticism: -2 } }
  },
  therapy: {
    label: "Start Therapy", category: "habit",
    blurb: "You find out a lot about yourself. Some of it is numbers. (Your temperament and character appear on your CV.)",
    visibleWhen: (s) => s.levelIndex >= 3 && once(s, "therapy"),
    cost: { money: 600, energy: 20 },
    effects: { modifiers: { energyRegenMult: 1.06, burnoutMult: 0.85 }, traits: { neuroticism: -5 }, identity: { resilience: +5 } },
    apply: (s) => { s.traits.visibility = "values"; s.flags.therapyUnlocked = true; s.story.meaning = Math.min(100, (s.story.meaning ?? 30) + 4); }
  },
  learn_python: {
    label: "Learn Python", category: "habit",
    blurb: "You now spend most of your time fixing your environment. Sometimes, between fixes, a figure.",
    visibleWhen: (s) => s.levelIndex >= 3 && (s.knowledge ?? 0) >= 300 && once(s, "learn_python"),
    cost: { energy: 50, knowledge: 250 },
    effects: { modifiers: { paperMult: 1.07 } }
  },
  academic_twitter: {
    label: "Join Academic Social Media", category: "habit",
    blurb: "Networking, discourse, and somebody's hot take about your entire field, every morning.",
    visibleWhen: (s) => s.levelIndex >= 3 && once(s, "academic_twitter"),
    cost: { energy: 15 },
    effects: { modifiers: { citationMult: 1.05, energyRegenMult: 0.97 }, identity: { network: +5 } }
  },
  adopt_cat: {
    label: "Adopt a Cat", category: "desk",
    blurb: "It sits on the keyboard. It sits on the draft. It is, structurally, the best part of your day.",
    visibleWhen: (s) => s.levelIndex >= 3 && (s.money ?? 0) >= 100 && once(s, "adopt_cat"),
    cost: { money: 150 },
    effects: { modifiers: { energyRegenMult: 1.06, writeCostMult: 1.02 } },
    apply: (s) => { s.story.meaning = Math.min(100, (s.story.meaning ?? 30) + 5); }
  },
  fountain_pen: {
    label: "Buy a Fountain Pen", category: "desk",
    blurb: "Your handwriting gets worse, more expensively. Your marginalia have never looked better.",
    visibleWhen: (s) => s.levelIndex >= 3 && (s.money ?? 0) >= 100 && once(s, "fountain_pen"),
    cost: { money: 180 },
    effects: { modifiers: { writeCostMult: 0.97 } }
  },
  whiteboard: {
    label: "Get a Whiteboard", category: "desk",
    blurb: "Every idea, briefly. Someone wrote DO NOT ERASE in the corner in 2019 and nobody has.",
    visibleWhen: (s) => s.levelIndex >= 3 && (s.money ?? 0) >= 120 && once(s, "whiteboard"),
    cost: { money: 200 },
    effects: { modifiers: { paperMult: 1.05 } }
  },
  conference_karaoke: {
    label: "Go to Conference Karaoke", category: "habit",
    blurb: "You sing \"Total Eclipse of the Heart\" in front of three editors. One of them joins in.",
    visibleWhen: (s) => s.levelIndex >= 3 && (s.identity?.network ?? 0) >= 5 && once(s, "conference_karaoke"),
    cost: { energy: 35 },
    effects: { identity: { network: +6 }, traits: { extraversion: +3 } }
  },
  lucky_pen: {
    label: "Find a Lucky Pen", category: "desk",
    blurb: "A plain ballpoint from a hotel in Ohio. It has never once let you down. Good things turn up more often.",
    visibleWhen: (s) => (s.serendipity?.clicked ?? 0) >= 3 && once(s, "lucky_pen"),
    cost: { energy: 5 }
  },
  backup_habit: {
    label: "Start Backing Things Up", category: "habit",
    blurb: "Three copies, two drives, one cloud. You sleep like someone who has lost data before.",
    visibleWhen: (s) => s.levelIndex >= 3 && once(s, "backup_habit"),
    cost: { energy: 20, money: 120 }
  },
  join_union: {
    label: "Join the Union", category: "habit",
    blurb: "Dues, meetings, and the strange feeling of being on someone's side.",
    visibleWhen: (s) => s.levelIndex >= 3 && s.levelIndex <= 6 && once(s, "join_union"),
    cost: { money: 150, energy: 15 },
    effects: { identity: { network: +4, resilience: +3 }, modifiers: { debtStressMult: 0.85 } },
    apply: (s) => { s.story.meaning = Math.min(100, (s.story.meaning ?? 30) + 4); }
  },

  // ── Postdoc / adjunct ──
  preprint_habit: {
    label: "Post Everything as a Preprint", category: "habit",
    blurb: "Your work is out before it's reviewed. People cite the preprint, then the paper, then both.",
    visibleWhen: (s) => s.levelIndex >= 4 && once(s, "preprint_habit"),
    cost: { energy: 25 },
    effects: { modifiers: { citationMult: 1.08 } }
  },
  reliable_car: {
    label: "Buy a Reliable Car", category: "habit",
    blurb: "Three campuses, four sections, one car that starts every time. Mostly.",
    visibleWhen: (s) => s.levelIndex >= 4 && s.levelIndex <= 6 && (s.money ?? 0) >= 2000 && once(s, "reliable_car"),
    cost: { money: 4000 },
    effects: { modifiers: { energyRegenMult: 1.05 } }
  },
  standing_desk_home: {
    label: "Buy a Standing Desk", category: "desk",
    blurb: "You stand for a week. Then it's a very expensive regular desk. (+12 stamina while it's on your desk.)",
    visibleWhen: (s) => s.levelIndex >= 4 && (s.money ?? 0) >= 300 && once(s, "standing_desk_home"),
    cost: { money: 450 }
  },

  // ── Faculty ──
  say_no: {
    label: "Learn to Say No", category: "habit",
    blurb: "The hardest word in academia. Your colleagues notice. Your energy notices more.",
    visibleWhen: (s) => s.levelIndex >= 6 && once(s, "say_no"),
    cost: { energy: 80 },
    effects: { modifiers: { energyRegenMult: 1.10, energyCostMult: 0.95 }, prestigeDelta: -2 }
  },
  open_door: {
    label: "Keep Your Door Open", category: "habit",
    blurb: "Students wander in with ideas. Colleagues wander in with complaints. Good things turn up more often.",
    visibleWhen: (s) => s.levelIndex >= 5 && once(s, "open_door"),
    cost: { energy: 20 },
    effects: { modifiers: { energyRegenMult: 0.98, gradMorale: 0.04 } },
    apply: (s) => { s.story.meaning = Math.min(100, (s.story.meaning ?? 30) + 3); }
  },
  podcast: {
    label: "Start a Podcast", category: "habit",
    blurb: "Two academics, one microphone, ninety minutes on a paper from 1974. Somehow it has listeners.",
    visibleWhen: (s) => s.levelIndex >= 6 && once(s, "podcast"),
    cost: { money: 6000, energy: 40 },
    effects: { modifiers: { citationMult: 1.06, knowledgeMult: 0.98 }, identity: { network: +8 } }
  },
  ergonomic_chair: {
    label: "Buy a Very Good Chair", category: "desk",
    blurb: "It costs more than your first car. Your lower back writes you a thank-you note. (+20 stamina.)",
    visibleWhen: (s) => s.levelIndex >= 6 && (s.money ?? 0) >= 800 && once(s, "ergonomic_chair"),
    cost: { money: 1400 }
  },
  typewriter: {
    label: "Buy a Vintage Typewriter", category: "desk",
    blurb: "You don't use it. You look at it. Sometimes that's enough.",
    visibleWhen: (s) => s.levelIndex >= 6 && (s.money ?? 0) >= 500 && once(s, "typewriter"),
    cost: { money: 900 },
    effects: { modifiers: { writeCostMult: 0.97 } }
  },
  skull: {
    label: "Buy a Skull (Replica)", category: "desk",
    blurb: "Memento mori. Also a pencil holder.",
    visibleWhen: (s) => s.levelIndex >= 5 && (s.money ?? 0) >= 60 && once(s, "skull"),
    cost: { money: 85 },
    apply: (s) => { s.story.meaning = Math.min(100, (s.story.meaning ?? 30) + 2); }
  },
  hourglass: {
    label: "Buy an Hourglass", category: "desk",
    blurb: "It measures nothing in particular. You turn it over when you feel time passing. Your routine runs a little faster.",
    visibleWhen: (s) => s.levelIndex >= 6 && once(s, "hourglass"),
    cost: { money: 60 }
  },
  consulting: {
    label: "Consult for Industry", category: "habit",
    blurb: "You explain your field to people with bigger budgets. They pay you to say \"it depends.\"",
    visibleWhen: (s) => s.levelIndex >= 7 && once(s, "consulting"),
    cost: { energy: 50 },
    apply: (s) => { s.money = (s.money ?? 0) + 60000; },
    effects: { modifiers: { knowledgeMult: 0.97 } }
  },
  research_assistant: {
    label: "Hire a Research Assistant", category: "habit",
    blurb: "An undergraduate who answers email faster than you do. Your routine gets another slot, and runs faster.",
    visibleWhen: (s) => s.levelIndex >= 6 && s.perks?.planner && once(s, "research_assistant"),
    cost: { money: 12000 }
  },

  bullet_journal: {
    label: "Start a Bullet Journal", category: "habit",
    blurb: "Dots, lines, migrations, and a key for the key. One more routine slot, and a new identity as a Bullet Journal Person.",
    visibleWhen: (s) => s.levelIndex >= 5 && s.perks?.planner && once(s, "bullet_journal"),
    cost: { energy: 30, money: 40 },
    effects: { modifiers: { routineSlotBonus: 1 } }
  },
  marie_kondo: {
    label: "Read Marie Kondo", category: "habit",
    blurb: "You thank your old futon for its service. It does not spark joy. Room for one more piece of furniture.",
    visibleWhen: (s) => s.levelIndex >= 4 && (s.home?.furniture?.length ?? 0) >= 2 && once(s, "marie_kondo"),
    cost: { energy: 25 },
    effects: { modifiers: { homeSpaceBonus: 1 } }
  },

  // ── Emeritus ──
  endowed_chair: {
    label: "Endow a Chair in Your Own Name", category: "habit",
    blurb: "Someone younger will sit in it and feel the weight of your name. That's the point.",
    visibleWhen: (s) => s.levelIndex >= 8 && (s.money ?? 0) >= 2e6 && once(s, "endowed_chair"),
    cost: { money: 5e6 },
    effects: { modifiers: { citationMult: 1.12 }, prestigeDelta: 8 }
  },
  named_building: {
    label: "Name a Building After Yourself", category: "habit",
    blurb: "Students will mispronounce it for a century. You'll love every one of them.",
    visibleWhen: (s) => s.levelIndex >= 9 && (s.money ?? 0) >= 1e7 && once(s, "named_building"),
    cost: { money: 4e7 },
    effects: { modifiers: { citationMult: 1.25 }, prestigeDelta: 20 }
  }
};

// Objects that show on the desk once bought: perk id → prop. stamina is
// added to max energy (× propMult) while you own it.
window.DESK_PROPS = {
  desk_lamp:          { icon: "fa-lightbulb",       label: "Desk lamp",        stamina: 4 },
  globe:              { icon: "fa-earth-americas",  label: "Old globe",        stamina: 3 },
  houseplant:         { icon: "fa-seedling",        label: "Pothos",           stamina: 3 },
  used_laptop:        { icon: "fa-laptop",          label: "Laptop",           stamina: 4 },
  moka_pot:           { icon: "fa-mug-hot",         label: "Moka pot",         stamina: 5 },
  pomodoro:           { icon: "fa-stopwatch",       label: "Tomato timer",     stamina: 2 },
  noise_cancel:       { icon: "fa-headphones",      label: "Headphones",       stamina: 5 },
  bookshelf:          { icon: "fa-book",            label: "Books",            stamina: 4 },
  adopt_cat:          { icon: "fa-cat",             label: "The cat",          stamina: 8 },
  fountain_pen:       { icon: "fa-pen-fancy",       label: "Fountain pen",     stamina: 3 },
  whiteboard:         { icon: "fa-chalkboard",      label: "Whiteboard",       stamina: 4 },
  lucky_pen:          { icon: "fa-pen",             label: "Lucky pen",        stamina: 2 },
  standing_desk_home: { icon: "fa-person",          label: "Standing desk",    stamina: 12 },
  ergonomic_chair:    { icon: "fa-chair",           label: "The good chair",   stamina: 20 },
  typewriter:         { icon: "fa-keyboard",        label: "Typewriter",       stamina: 5 },
  skull:              { icon: "fa-skull",           label: "Skull (replica)",  stamina: 3 },
  hourglass:          { icon: "fa-hourglass-half",  label: "Hourglass",        stamina: 3 }
};

window.NEWS_ITEMS_1_0 = {
  planner:              "You buy a planner with a cover that says CARPE DIEM in gold foil. You write \"study\" on every day for September.",
  library_card:         "Your library card has your signature from age fifteen on it. You'll keep it, laminated, for the rest of your life.",
  glasses:              "New glasses. The trees have individual leaves! The board has words! The world is in focus and slightly smaller.",
  learn_to_type:        "asdf jkl; asdf jkl; You can now type faster than you can think, which explains a lot about the internet.",
  ap_classes:           "You sign up for six AP classes. Your guidance counselor says \"ambitious\" in a tone you will hear again from your advisor.",
  desk_lamp:            "You buy a desk lamp. In its warm circle of light, you are a scholar. Outside it, you're sixteen.",
  globe:                "An old globe from a yard sale. It still has the USSR on it. You spin it and point: that's where you'll do your fieldwork.",
  office_hours_regular: "You go to office hours. The professor looks startled, then delighted. Nobody comes to office hours.",
  ra_position:          "You're a research assistant! Your first task is alphabetizing reprints from 1983. Your second is finding the stapler.",
  pomodoro:             "A tomato-shaped timer ticks on your desk. Twenty-five minutes. Ding. Five minutes. You spend them checking your phone.",
  houseplant:           "You adopt a pothos and name it Derrida. It is very hard to kill, which is the only reason it survives you.",
  used_laptop:          "A used laptop with someone else's stickers. One says \"I'd rather be in Ithaca.\" You wouldn't, yet.",
  study_abroad:         "A semester abroad. You learn to order coffee in two languages and to say \"that's very American\" about everything.",
  moka_pot:             "You buy a moka pot. It hisses like a small, judgmental espresso dragon. Coffee is now a thing you can do.",
  learn_latex:          "You learn LaTeX. Your equations are gorgeous. Figure 2 is on page 14, for reasons only Donald Knuth understands.",
  reference_manager:    "You import four thousand PDFs into a reference manager. 1,200 are duplicates. 300 are titled \"untitled.pdf\".",
  color_calendar:       "Your calendar is now a rainbow. Red: meetings. Blue: teaching. Green: research, a color you rarely see.",
  noise_cancel:         "Noise-canceling headphones. The open office falls silent. You can hear your own thoughts. They're mostly about lunch.",
  bookshelf:            "You build a bookshelf. Two screws left over. It leans slightly to the left, which some reviewers will say about your work too.",
  free_food_map:        "Your free-food map: chemistry seminar (pizza), provost's town hall (sandwiches), job talks (cookies, if you ask a question).",
  writing_group:        "You join a writing group. Two hours, no talking. Someone's pen squeaks. You write four pages and hate the squeaking pen.",
  therapy:              "Your first therapy session. You talk about your advisor for forty-five minutes. Your therapist says, \"Interesting. And your father?\"",
  learn_python:         "You learn Python. You spend the first week installing Python. The second week, you install it again, differently.",
  academic_twitter:     "You join academic social media. Your first post gets two likes: your advisor and a bot that sells conference lanyards.",
  adopt_cat:            "You adopt a cat. It immediately sits on chapter two. You take this as feedback.",
  fountain_pen:         "A fountain pen. Your hands are permanently blue now, like a Smurf who reads Derrida.",
  whiteboard:           "A whiteboard! You draw a diagram of your entire project. It looks like a conspiracy theory. It sort of is.",
  conference_karaoke:   "Conference karaoke. You sing \"Total Eclipse of the Heart.\" An editor from a top journal does the \"turn around\" parts.",
  lucky_pen:            "You find a pen from a Holiday Inn in Dayton, Ohio. It's perfect. You'll defend your dissertation with it.",
  backup_habit:         "You back everything up: three copies, two drives, one cloud. Your past self, who lost a chapter in 2014, weeps with relief.",
  join_union:           "You sign the union card. At the first meeting there are bagels, solidarity, and a forty-minute debate about the bagels.",
  preprint_habit:       "You post your paper as a preprint. Within an hour someone has tweeted a screenshot of Figure 2 with \"hmm\".",
  reliable_car:         "A reliable car. It starts every time, mostly. You put 30,000 miles on it between three campuses in a year.",
  standing_desk_home:   "You buy a standing desk and stand at it for a week. Then you sit. But the stamina was there when you needed it.",
  say_no:               "You say no to a committee. The word feels strange in your mouth. The chair blinks twice and writes something down.",
  open_door:            "You start keeping your office door open. Students come in with ideas. One comes in with your next grant.",
  podcast:              "Episode 1 of your podcast: ninety minutes on a paper from 1974. It has 41 listeners. One of them is the author.",
  ergonomic_chair:      "The good chair arrives. It has more adjustable parts than your first car. Your spine sings a small hymn.",
  typewriter:           "A vintage typewriter. You never type on it. Visitors ask about it, and you tell them about Hemingway, inaccurately.",
  skull:                "A replica skull for your desk. Memento mori. Your students assume you're either deep or a dentist.",
  hourglass:            "An hourglass. You turn it over at the start of every meeting. Your colleagues have started to take the hint.",
  consulting:           "You consult for industry. They pay you $60,000 to say \"it depends.\" It does depend, so you feel fine about it.",
  research_assistant:   "You hire an undergraduate research assistant. They answer your email faster than you do. They are, frankly, terrifying.",
  endowed_chair:        "You endow a chair in your own name. Somewhere a young scholar will sit in it and feel the weight of your name. Good.",
  named_building:       "The building is named after you. Students already call it something else, ruder and shorter. You love it.",
  bullet_journal:       "You start a bullet journal. Day one: a beautiful monthly spread. Day nine: a single dot, migrated forward, forever.",
  marie_kondo:          "You hold each book and ask whether it sparks joy. They all do. You keep all of them and get rid of a lamp."
};

// Merge into the game's registries
(() => {
  for (const [id, perk] of Object.entries(window.PERKS_1_0)) window.PERKS[id] = Object.assign({ id }, perk);
  Object.assign(window.NEWS_ITEMS, window.NEWS_ITEMS_1_0);
})();

// ── Milestones past college ───────────────────────────────────────────
Object.assign(window.MILESTONE_DRAFT_INTERVAL, { 2: 14, 3: 22, 4: 28, 5: 24 });

window.MILESTONES_1_0 = {
  // Master's
  ma_first_ta:       { level: 2, label: "TA Your First Section", cost: { energy: 30 },
    blurb: "Forty undergraduates, one of you. Someone asks if this will be on the test. It will.",
    effects: { traits: { extraversion: +1 }, identity: { resilience: +2 }, modifiers: { knowledgeMult: 1.02 } },
    news: "Your first section. You prepared ninety minutes of material. It lasts eleven. You improvise a discussion about \"what this means for us today.\"" },
  ma_poster:         { level: 2, label: "Present a Poster", cost: { energy: 25 },
    blurb: "You stand next to your poster for two hours. Four people stop. One is lost.",
    effects: { identity: { network: +3 } },
    news: "Poster session: four visitors, two business cards, one person asking where the bathroom is. You count it as a success." },
  ma_reading_group:  { level: 2, label: "Start a Reading Group", cost: { energy: 30 },
    blurb: "Week one: twelve people. Week four: you and a guy named Todd who hasn't done the reading.",
    effects: { modifiers: { paperMult: 1.03 }, identity: { network: +1 } },
    news: "Your reading group shrinks to you and Todd. Todd has not done the reading. Todd has, however, brought snacks. You keep going." },
  ma_impostor:       { level: 2, label: "Learn Everyone Else Is Faking It Too", cost: { energy: 10 },
    blurb: "At the department party, a fourth-year admits they don't understand Foucault either.",
    effects: { traits: { neuroticism: -3 }, identity: { resilience: +3 } },
    news: "A fourth-year confesses, three drinks in, that nobody understands Foucault. You have never felt so free." },
  ma_grading:        { level: 2, label: "Grade 80 Essays in One Weekend", cost: { energy: 45 },
    blurb: "By essay 61 everyone is getting a B+. By essay 74 you're grading the margins.",
    effects: { identity: { resilience: +4 }, traits: { agreeableness: -1 } },
    news: "Eighty essays. By the end your only comment is \"Good point!\" next to things that are not points." },
  // Doctoral
  phd_office_mate:   { level: 3, label: "Get an Office Mate", cost: { energy: 15 },
    blurb: "They eat tuna at their desk. They also become your closest friend for five years.",
    effects: { identity: { network: +2 }, modifiers: { energyRegenMult: 1.03 } },
    news: "Your new office mate eats tuna at 10 a.m. By October you'd take a bullet for them. By May you're godparent to their cat." },
  phd_archive:       { level: 3, label: "Visit the Archive", cost: { energy: 40, money: 300 },
    blurb: "White gloves, a pencil, no pens. You find a letter that changes chapter three.",
    effects: { modifiers: { knowledgeMult: 1.04 } },
    news: "In box 47 of an uncatalogued collection, a letter that changes everything. You're not allowed to photograph it. You memorize it." },
  phd_fieldwork:     { level: 3, label: "Go Into the Field", cost: { energy: 60 },
    blurb: "Six weeks somewhere with no Wi-Fi. You come back with data, a tan, and a mild parasite.",
    effects: { modifiers: { paperMult: 1.05 }, traits: { openness: +2 } },
    news: "Six weeks in the field. Your notebooks are waterlogged, your data are irreplaceable, and you have a parasite your doctor finds \"interesting.\"" },
  phd_desk_reject:   { level: 3, label: "Get Your First Desk Rejection", cost: {},
    blurb: "Three weeks to reject without review. The email starts with \"Unfortunately.\"",
    effects: { identity: { resilience: +6 }, traits: { neuroticism: +2 } },
    news: "\"Unfortunately, your manuscript is not a good fit for this journal.\" Every bad thing in academia starts with \"Unfortunately.\"" },
  phd_talk:          { level: 3, label: "Give a Conference Talk", cost: { energy: 40 },
    blurb: "Fifteen minutes. A man in the third row asks a question that is actually a comment about his own work.",
    effects: { identity: { network: +4, reputation: +1 } },
    news: "Q&A: \"This is more of a comment than a question...\" He talks for four minutes about his 1998 paper. You thank him for his question." },
  phd_own_course:    { level: 3, label: "Teach Your Own Course", cost: { energy: 50 },
    blurb: "Your syllabus, your rules, your 8 a.m. slot in a room with no windows.",
    effects: { modifiers: { knowledgeMult: 1.02 }, identity: { reputation: +2 } },
    news: "Your own course. You put a reading you love on the syllabus. Three students love it too. That's three more than you expected." },
  phd_mental_health: { level: 3, label: "Take a Mental Health Day", cost: {},
    blurb: "You take a day. You spend it feeling guilty about taking a day. It still helps.",
    effects: { modifiers: { energyRegenMult: 1.03 }, traits: { neuroticism: -2 } },
    news: "You take a whole day off. You don't check email until 4 p.m. This is a personal record, and a cry for help, and it helps." },
  // Postdoc
  pd_new_city:       { level: 4, label: "Move to a City Where You Know No One", cost: { energy: 30 },
    blurb: "Your third city in eight years. You learn where the good grocery store is, again.",
    effects: { identity: { resilience: +3 }, traits: { openness: +2 } },
    news: "New city. You find the good grocery store, a decent coffee place, and a bench you like. That's home now, for two years." },
  pd_lab_mom:        { level: 4, label: "Become the Lab's Unofficial Manager", cost: { energy: 35 },
    blurb: "You order the pipette tips. You know the PI's calendar. You are not paid for this.",
    effects: { identity: { network: +3 }, traits: { conscientiousness: +2 } },
    news: "You're the lab's unofficial manager now. The grad students come to you with problems. You come to nobody with yours." },
  pd_career_award:   { level: 4, label: "Apply for a Career Development Award", cost: { energy: 45 },
    blurb: "A grant to help you get a job, judged on whether you'll get a job.",
    effects: { modifiers: { grantChance: 0.02 } },
    news: "You apply for an award designed to help you get a job, judged on how likely you are to get a job. Kafka would have applied too." },
  pd_side_project:   { level: 4, label: "Start a Side Project Nobody Asked For", cost: { energy: 25 },
    blurb: "It's the only thing you're excited about. It will become your job talk.",
    effects: { modifiers: { paperQualityBonus: 3 } },
    news: "A side project, at night, that nobody asked for. It's the only thing you're excited about. (It will become your job talk.)" },
  pd_job_wiki:       { level: 4, label: "Discover the Academic Job Wiki", cost: {},
    blurb: "An anonymous spreadsheet of every search and its gossip. You refresh it like a stock ticker.",
    effects: { traits: { neuroticism: +3 }, identity: { network: +2 } },
    news: "The job wiki: every search, every rumor, every \"campus visits scheduled (not me).\" You refresh it forty times a day." },
  // Adjunct
  adj_four_campuses: { level: 5, label: "Teach at Four Campuses", cost: { energy: 40 },
    blurb: "You know every parking lot in the metro area. None of them have a space for you.",
    effects: { identity: { resilience: +5 } },
    news: "Four campuses, five courses, one car. You grade at red lights. You have opinions about every on-ramp in the county." },
  adj_shared_office: { level: 5, label: "Share an Office With Nine People", cost: {},
    blurb: "One desk, one filing cabinet, nine adjuncts. You leave each other notes.",
    effects: { identity: { network: +3 } },
    news: "You share an office with nine adjuncts. You've never met four of them. You know them by their mugs." },
  adj_thank_you:     { level: 5, label: "Get a Thank-You Note From a Student", cost: {},
    blurb: "\"Your class is why I'm staying in college.\" You keep it in your wallet.",
    effects: { identity: { resilience: +3 } }, apply: (s) => { s.story.meaning = Math.min(100, (s.story.meaning ?? 30) + 6); },
    news: "A note slipped under the door: \"Your class is why I'm staying in college.\" You keep it in your wallet for the rest of your life." },
  adj_summer:        { level: 5, label: "Survive a Summer Without Pay", cost: { energy: 20 },
    blurb: "Ten weeks, no paycheck, one very long research agenda.",
    effects: { identity: { resilience: +4 } },
    news: "A summer without pay. You write two papers and eat a lot of rice. In August, a dean emails to ask if you can teach one more section." }
};

(() => {
  for (const [id, m] of Object.entries(window.MILESTONES_1_0)) {
    window.PERKS[id] = {
      id, label: m.label, blurb: m.blurb, category: "milestone",
      milestone: { level: m.level, when: m.when }, cost: m.cost ?? {}, effects: m.effects, apply: m.apply,
      visibleWhen: (s) => milestoneOffered(s, id)
    };
    window.NEWS_ITEMS[id] = m.news;
  }
})();

// ── Desk props: stamina from the things on your desk ─────────────────
function propStamina() {
  let n = 0;
  for (const [id, p] of Object.entries(window.DESK_PROPS)) if (state.perks?.[id]) n += p.stamina ?? 3;
  return n * (state.modifiers?.propMult ?? 1);
}

// ── Home and furniture ────────────────────────────────────────────────
window.HOMES = [
  { id: "bedroom",   level: 0, space: 2,  cost: 0,      label: "Your childhood bedroom",
    blurb: "Glow-in-the-dark stars on the ceiling. A desk your dad assembled with one Allen key and great confidence." },
  { id: "dorm",      level: 1, space: 2,  cost: 0,      label: "A dorm room (shared)",
    blurb: "Cinderblock walls, a lofted bed, and a roommate who sleeps fifteen hours a day and is somehow on the dean's list." },
  { id: "apartment", level: 2, space: 3,  cost: 0,      label: "An apartment with three roommates",
    blurb: "A shared fridge with labeled shelves, and one unlabeled thing in the back that nobody will claim." },
  { id: "studio",    level: 3, space: 4,  cost: 0,      label: "A studio with a radiator that clanks",
    blurb: "Yours alone. The radiator clanks at 3 a.m. like it's trying to tell you something about your methods section." },
  { id: "sublet",    level: 4, space: 4,  cost: 0,      label: "A furnished sublet",
    blurb: "Someone else's books on the shelves, someone else's art on the walls. You live in a stranger's life for two years." },
  { id: "rented_room", level: 5, space: 3, cost: 0,     label: "A room in a stranger's house",
    blurb: "Your landlord is also an adjunct. You never discuss it. You leave each other casseroles." },
  { id: "starter",   level: 6, space: 6,  cost: 0,      label: "A starter house (with a mortgage)",
    blurb: "A thirty-year mortgage on a six-year tenure clock. Very confident. Very normal." },
  { id: "study_house", level: 6, space: 8, cost: 150000, label: "A house with a real study",
    blurb: "A room with a door that closes, just for thinking. You spend the first month just sitting in it." },
  { id: "library_house", level: 7, space: 10, cost: 600000, label: "A house with a library (and a ladder)",
    blurb: "Floor-to-ceiling shelves and a rolling ladder. You don't need the ladder. You ride it anyway." },
  { id: "cottage",   level: 9, space: 12, cost: 250000, label: "A cottage by the sea, with a writing shed",
    blurb: "The shed has one desk, facing the water. You finally start the book you meant to write at twenty-five." }
];

window.FURNITURE = {
  futon:          { label: "A futon",                   cost: 80,     level: 1, stamina: 6,
    blurb: "Couch by day, bed by night, back problem by thirty." },
  curb_chair:     { label: "An office chair from the curb", cost: 0,  level: 1, stamina: 5,
    blurb: "Rescued in May, when the undergrads move out. Still spins. Smells faintly of Red Bull." },
  milk_crates:    { label: "Milk-crate bookshelves",    cost: 10,     level: 1, stamina: 3, mods: { readingSpeedMult: 1.05 },
    blurb: "Liberated from behind a grocery store. They hold more books than any shelf you'll ever buy." },
  ikea_desk:      { label: "A flat-pack desk",          cost: 120,    level: 2, stamina: 8,
    blurb: "Assembled in four hours with two screws left over. It wobbles when you write something true." },
  reading_chair:  { label: "A reading armchair",        cost: 400,    level: 3, stamina: 10, mods: { readingSpeedMult: 1.15 },
    blurb: "The chair where you read. Nobody else is allowed to sit in it. The cat sits in it." },
  blackout:       { label: "Blackout curtains",         cost: 90,     level: 3, stamina: 8,
    blurb: "For sleeping at 9 a.m. after writing until 5. You call it \"a schedule.\"" },
  second_monitor: { label: "A second monitor",          cost: 250,    level: 3, stamina: 4, routine: 0.9,
    blurb: "Paper on the left, draft on the right, email in the corner of your eye, forever. Your routine runs faster." },
  good_mattress:  { label: "A good mattress",           cost: 1200,   level: 4, stamina: 18, mods: { burnoutMult: 0.92 },
    blurb: "You spent your twenties on a futon. Your thirties are going to be different." },
  nap_couch:      { label: "A couch for \"thinking\"",  cost: 900,    level: 4, stamina: 6, mods: { energyRegenMult: 1.05 },
    blurb: "Academic couches are for thinking. You think lying down, with your eyes closed, for twenty minutes." },
  espresso_home:  { label: "A real espresso machine",   cost: 1500,   level: 6, stamina: 10, mods: { energyRegenMult: 1.04 },
    blurb: "Italian, chrome, louder than a jet. You learn the word \"crema\" and use it with strangers." },
  wall_shelves:   { label: "Floor-to-ceiling bookshelves", cost: 6000, level: 6, stamina: 12, mods: { knowledgeMult: 1.03, readingSpeedMult: 1.1 },
    blurb: "Organized by color, which makes no sense and looks incredible on video calls." },
  cat_tree:       { label: "A cat tree",                cost: 200,    level: 3, stamina: 4, needs: "adopt_cat",
    blurb: "The cat ignores it and sleeps on your notes. You keep it out of respect for what might have been." },
  record_player:  { label: "A record player",           cost: 700,    level: 6, stamina: 8, mods: { energyRegenMult: 1.03 },
    blurb: "Bach while you write, Coltrane while you revise, nothing at all while you read the reviews." },
  library_ladder: { label: "A rolling library ladder",  cost: 9000,   level: 7, stamina: 6, mods: { knowledgeMult: 1.04 },
    blurb: "You don't need it. You ride it. This is what tenure is for." },
  writing_shed:   { label: "A writing shed",            cost: 40000,  level: 9, stamina: 30, mods: { writeCostMult: 0.9 },
    blurb: "One desk, one window, one view of the sea. Roald Dahl had one. So do you." },
  rocking_chair:  { label: "A rocking chair on the porch", cost: 1500, level: 9, stamina: 15,
    blurb: "You rock. You think. You rock. Sometimes you think of a paper; mostly you just rock, and that's allowed." }
};

function homeDef(id = state.home?.id) { return window.HOMES.find(h => h.id === id) ?? null; }
function homeSpace() { return (homeDef()?.space ?? 2) + (state.modifiers?.homeSpaceBonus ?? 0); }

function defaultHomeFor(level) {
  // The free home for this stage of life
  let best = window.HOMES[0];
  for (const h of window.HOMES) if (h.level <= level && h.cost === 0) best = h;
  return best;
}

// A new stage usually means a move. You keep your furniture; whatever
// doesn't fit goes into storage (owned, not placed).
function syncHome() {
  const H = state.home;
  const def = homeDef();
  const free = defaultHomeFor(state.levelIndex);
  if (!def || (def.cost === 0 && def.id !== free.id && free.level > def.level)) {
    const moving = !!def;
    H.id = free.id;
    if (moving) pushNews(`You move into ${free.label.charAt(0).toLowerCase() + free.label.slice(1)}. ${free.blurb}`);
  }
  // Emeritus: the cottage is waiting if you can afford it
  H.placed = (H.placed ?? []).filter(id => H.furniture.includes(id)).slice(0, homeSpace());
  rebuildModifiers();
}

function homeUpgrades() {
  const cur = homeDef();
  return window.HOMES.filter(h => h.cost > 0 && h.level <= state.levelIndex && h.space > (cur?.space ?? 0));
}

function buyHome(id) {
  const h = homeDef(id);
  if (!h || h.cost <= 0 || h.level > state.levelIndex || !canPay(h.cost)) return false;
  pay(h.cost);
  state.home.id = id;
  pushNews(`You move into ${h.label.charAt(0).toLowerCase() + h.label.slice(1)}. ${h.blurb}`);
  storyLog(`Moved into ${h.label.toLowerCase()}.`, "home");
  rebuildModifiers();
  return true;
}

function furnitureStatus(id) {
  const f = window.FURNITURE[id];
  if (!f) return { ok: false, reason: "" };
  if (state.home.furniture.includes(id)) return { ok: false, reason: "Owned" };
  if (f.level > state.levelIndex) return { ok: false, reason: "Not yet" };
  if (f.needs && !state.perks?.[f.needs]) return { ok: false, reason: "Needs a cat" };
  if (!canPay(f.cost)) return { ok: false, reason: `Needs $${fmtBig(outOfPocket(f.cost))}` };
  return { ok: true, reason: "" };
}

function buyFurniture(id) {
  if (!furnitureStatus(id).ok) return false;
  const f = window.FURNITURE[id];
  pay(f.cost);
  state.home.furniture.push(id);
  if (state.home.placed.length < homeSpace()) state.home.placed.push(id);
  pushNews(`${f.label.charAt(0).toUpperCase() + f.label.slice(1)}. ${f.blurb}`);
  rebuildModifiers();
  return true;
}

function toggleFurniture(id) {
  const H = state.home;
  if (!H.furniture.includes(id)) return false;
  if (H.placed.includes(id)) H.placed = H.placed.filter(x => x !== id);
  else if (H.placed.length < homeSpace()) H.placed.push(id);
  else return false;
  rebuildModifiers();
  return true;
}

function applyHomeModifiers(m) {
  let stamina = 0;
  for (const id of state.home?.placed ?? []) {
    const f = window.FURNITURE[id];
    if (!f) continue;
    stamina += f.stamina ?? 0;
    for (const [k, v] of Object.entries(f.mods ?? {})) {
      if (typeof m[k] !== "number") continue;
      if (k.endsWith("Mult")) m[k] *= v; else m[k] += v;
    }
  }
  m.energyMaxBonus += stamina + propStamina();
}

// ── The Routine ───────────────────────────────────────────────────────
// Arcanum's running tasks: actions repeat on their own while your energy
// stays above the reserve. One runs every routineInterval() seconds.
window.ROUTINE_CHOICES = {
  study_textbooks:    { label: "Study textbooks",   icon: "fa-book-open-reader" },
  study_papers:       { label: "Read papers",       icon: "fa-newspaper" },
  write:              { label: "Write",             icon: "fa-feather-pointed" },
  work_shift:         { label: "Work a shift",      icon: "fa-briefcase" },
  review_manuscript:  { label: "Review a manuscript", icon: "fa-glasses" },
  write_grant:        { label: "Write a grant",     icon: "fa-file-invoice-dollar" },
  "publish:conference": { label: "Publish (conference)", icon: "fa-book" },
  "publish:journal":  { label: "Publish (journal)", icon: "fa-book" },
  "publish:chapter":  { label: "Publish (chapter)", icon: "fa-book" }
};

function routineUnlocked() { return !!state.perks?.planner; }
function routineSlotCount() {
  if (!routineUnlocked()) return 0;
  return 1 + (state.perks?.color_calendar ? 1 : 0) + (state.perks?.research_assistant ? 1 : 0)
           + (state.levelIndex >= 3 ? 1 : 0) + (state.modifiers?.routineSlotBonus ?? 0);
}
function routineInterval() {
  let sec = 2.0;
  if (state.perks?.pomodoro) sec *= 0.8;
  if (state.perks?.hourglass) sec *= 0.9;
  if (state.perks?.research_assistant) sec *= 0.75;
  if (state.home?.placed?.includes("second_monitor")) sec *= 0.9;
  sec *= state.modifiers?.routineSpeedMult ?? 1;
  return Math.max(0.2, sec);
}

function routineAvailable(key) {
  const [id, type] = key.split(":");
  const a = window.ACTIONS?.[id];
  if (!a || !isVisible(a)) return false;
  if (id === "publish" && type === "monograph") return false;
  return true;
}

function runRoutineStep() {
  const R = state.routine;
  const keys = (R.slots ?? []).slice(0, routineSlotCount()).filter(Boolean);
  if (!keys.length) return false;
  for (let tries = 0; tries < keys.length; tries++) {
    R.idx = ((R.idx ?? 0) + 1) % keys.length;
    const key = keys[R.idx];
    if (!routineAvailable(key)) continue;
    const [id, type] = key.split(":");
    doAction.quiet = true;
    doAction.fromRoutine = true;
    let done = false;
    try { done = doAction(id, type ? { type } : undefined); } finally { doAction.quiet = false; doAction.fromRoutine = false; }
    if (done) {
      R.ran = (R.ran ?? 0) + 1;
      R.sinceRecommit = (R.sinceRecommit ?? 0) + 1;
      if (routineLapsed()) pushNews(pickOne([
        "It's October. The planner is in a drawer somewhere. Your routine has quietly stopped.",
        "You haven't opened the planner in two weeks. The routine stops. The stickers remain unused.",
        "The planner has become a coaster. Your routine is on hold until you find it again."
      ]));
      return true;
    }
  }
  return false;
}

// Before the doctorate the planner lapses, the way planners do. After a
// while the routine stops itself until you go find the planner again.
const ROUTINE_COMMITMENT = { 0: 40, 1: 80, 2: 160 };
function routineCommitment() {
  if (typeof legacyHas === "function" && legacyHas("family_planner")) return Infinity;
  return ROUTINE_COMMITMENT[state.levelIndex] ?? Infinity;
}
function routineLapsed() { return (state.routine.sinceRecommit ?? 0) >= routineCommitment(); }
function recommitRoutine() {
  state.routine.sinceRecommit = 0;
  state.routine.on = true;
  pushNews(pickOne([
    "You find the planner under a pile of laundry. New week, new you. You write \"study\" on every day again.",
    "You buy new highlighters and recommit to the planner. This time is different. (It is a little different.)",
    "You dig the planner out of your backpack. The last entry, from three weeks ago, says \"start planner.\""
  ]));
}

function tickRoutine() {
  const R = state.routine;
  if (!R?.on || !routineSlotCount() || inCooldown()) return;
  if (routineLapsed()) return;
  if ((state.energy ?? 0) < maxEnergy() * (R.reserve ?? 0.5)) return;
  R.acc = (R.acc ?? 0) + TICK_MS / 1000;
  const iv = routineInterval();
  let steps = 0;
  while (R.acc >= iv && steps < 20) {
    R.acc -= iv;
    steps++;
    if ((state.energy ?? 0) < maxEnergy() * (R.reserve ?? 0.5)) { R.acc = 0; break; }
    if (!runRoutineStep()) { R.acc = 0; break; }
  }
}

// ── Temperament (read by the CV in render.js) ─────────────────────────
window.TEMPERAMENT_READS = {
  conscientiousness: ["The planner is in a drawer somewhere", "Has a planner, mostly", "Color-codes the planner"],
  agreeableness:     ["Reviewer Two energy", "Says yes, then regrets it", "Says yes to every committee"],
  neuroticism:       ["Forgets they submitted", "Checks the portal daily", "Refreshes the submission portal hourly"],
  openness:          ["Methodologically committed", "Reads abstracts outside the field", "Reads whole books outside the field"],
  extraversion:      ["Leaves before the reception", "Stays for one drink", "Works the reception"]
};

// ── The Home and Routine papers ───────────────────────────────────────
function renderHome() {
  const el = ensurePanel("panel_home", "Home", "fa-house-chimney");
  if (!el) return;
  const def = homeDef();
  const show = state.levelIndex >= 1 || state.home.furniture.length > 0;
  showPanel(el, show && !!def);
  if (!show || !def) return;
  const H = state.home;
  const space = homeSpace();
  const placed = H.placed.map(id => window.FURNITURE[id]).filter(Boolean);
  const stamina = placed.reduce((a, f) => a + (f.stamina ?? 0), 0);
  const owned = H.furniture.map(id => {
    const f = window.FURNITURE[id];
    const on = H.placed.includes(id);
    return `<button type="button" class="home-item${on ? " home-on" : ""}" data-home-toggle="${id}" title="${escHTML(f.blurb)}">${on ? "✓ " : ""}${escHTML(f.label)} <small>+${f.stamina}</small></button>`;
  }).join("");
  const shop = Object.entries(window.FURNITURE)
    .filter(([id, f]) => !H.furniture.includes(id) && f.level <= state.levelIndex && (!f.needs || state.perks?.[f.needs]))
    .map(([id, f]) => {
      const st = furnitureStatus(id);
      return `<button type="button" class="home-buy" data-home-buy="${id}" ${st.ok ? "" : "disabled"} title="${escHTML(f.blurb)}">${escHTML(f.label)} <small>${f.cost ? `$${fmtBig(outOfPocket(f.cost))}` : "free"} · +${f.stamina} stamina</small></button>`;
    }).join("");
  const ups = homeUpgrades().map(h => `<button type="button" class="home-move" data-home-move="${h.id}" ${canPay(h.cost) ? "" : "disabled"} title="${escHTML(h.blurb)}">Move: ${escHTML(h.label)} <small>$${fmtBig(h.cost)} · room for ${h.space}</small></button>`).join("");
  setPanelBody(el, `
    <div class="home-where"><strong>${escHTML(def.label)}</strong><div class="home-blurb">${escHTML(def.blurb)}</div></div>
    <div class="home-space">Room for ${space} piece${space === 1 ? "" : "s"} of furniture · ${placed.length} in use · <strong>+${stamina} stamina</strong>${propStamina() ? ` (and +${Math.round(propStamina())} from things on your desk)` : ""}</div>
    ${owned ? `<div class="home-owned">${owned}</div><p class="home-hint">Click to move a piece in or out of storage.</p>` : ""}
    ${shop ? `<details class="home-shop"><summary>Furnish</summary>${shop}</details>` : ""}
    ${ups ? `<div class="home-ups">${ups}</div>` : ""}`);
}

function renderRoutine() {
  const el = ensurePanel("panel_routine", "Routine", "fa-calendar-check");
  if (!el) return;
  const n = routineSlotCount();
  showPanel(el, n > 0);
  if (!n) return;
  const R = state.routine;
  const opts = Object.entries(window.ROUTINE_CHOICES).filter(([k]) => routineAvailable(k));
  const slots = [];
  for (let i = 0; i < n; i++) {
    const cur = R.slots[i] ?? "";
    const options = [`<option value="">— nothing —</option>`]
      .concat(opts.map(([k, c]) => `<option value="${k}" ${k === cur ? "selected" : ""}>${escHTML(c.label)}</option>`)).join("");
    slots.push(`<label class="rt-slot">${i + 1}. <select data-rt-slot="${i}">${options}</select></label>`);
  }
  const reserves = [0.25, 0.5, 0.75].map(r => `<button type="button" class="rt-res${R.reserve === r ? " rt-on" : ""}" data-rt-res="${r}">${Math.round(r * 100)}%</button>`).join("");
  setPanelBody(el, `
    <p class="rt-intro">Pick what a day looks like. It repeats on its own every ${routineInterval().toFixed(1)}s while your energy stays above the reserve.</p>
    ${slots.join("")}
    <div class="rt-ctl"><span>Keep in reserve:</span> ${reserves}</div>
    ${routineLapsed() ? `<div class="rt-lapsed">The planner is in a drawer somewhere. <button type="button" data-rt-recommit="1">Find the planner</button></div>` : ""}
    <div class="rt-ctl"><button type="button" class="rt-toggle" data-rt-toggle="1">${R.on ? "Pause the routine" : "Resume the routine"}</button>
      <span class="rt-ran" data-live="rt-ran"></span></div>`);
  setLive(el, "rt-ran", `Done ${fmtBig(R.ran ?? 0)} time${(R.ran ?? 0) === 1 ? "" : "s"}.`);
}

if (typeof document !== "undefined") {
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-home-toggle], [data-home-buy], [data-home-move], [data-rt-res], [data-rt-toggle], [data-rt-recommit]");
    if (!btn || btn.disabled) return;
    if (btn.dataset.homeToggle) toggleFurniture(btn.dataset.homeToggle);
    else if (btn.dataset.homeBuy) buyFurniture(btn.dataset.homeBuy);
    else if (btn.dataset.homeMove) buyHome(btn.dataset.homeMove);
    else if (btn.dataset.rtRes) state.routine.reserve = Number(btn.dataset.rtRes);
    else if (btn.dataset.rtToggle) state.routine.on = !state.routine.on;
    else if (btn.dataset.rtRecommit) recommitRoutine();
    render();
  });
  document.addEventListener("change", (e) => {
    const sel = e.target.closest?.("select[data-rt-slot]");
    if (!sel) return;
    state.routine.slots[Number(sel.dataset.rtSlot)] = sel.value || null;
    render();
  });
}

// ── Wiring ────────────────────────────────────────────────────────────
onHook("modifiers", applyHomeModifiers);
onHook("serendipityRate", (r) => r * (state.perks?.lucky_pen ? 1.2 : 1) * (state.perks?.open_door ? 1.25 : 1));
onHook("tick", tickRoutine);
onHook("enterLevel", syncHome);
onHook("load", syncHome);
onHook("reset", syncHome);
onHook("render", () => { renderRoutine(); renderHome(); });
onHook("perk", (id) => {
  if (id === "planner") pushNews("Your Routine is open: choose what a day looks like, and the days will happen on their own.");
});
