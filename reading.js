// reading.js — the Reading List, and the frameworks you read the world through
//
// THE READING LIST. Shelves of books that open up as your life does: the
// required reading of high school, the doorstop intro textbooks, the methods
// books every grad student owns and three have finished, the campus novels
// you read to cope, and the long books you saved for retirement. Pick one
// and it reads itself while you work (one at a time; reading gets faster as
// your Close Reading skill grows). Finish it and it changes you, a little.
//
// The Foundational Texts live here too, on their own shelf, still read in
// one heroic 50-energy sitting.
//
// THEORETICAL FRAMEWORKS. From the doctorate on you see the world through a
// framework, and later two or three. Each one gives and each one takes. If
// you've actually read the source text, the good part counts half again.
// Changing frameworks is a "turn" (the linguistic turn, the affective
// turn...), and your old papers become "early work."

"use strict";

Object.assign(DEFAULT_STATE, {
  reading: { current: null, progress: {}, done: {}, started: 0 },
  frameworks: { slots: [], turns: 0, lastTurnAt: -99999, history: [] }
});

// ── The shelves ───────────────────────────────────────────────────────
// Each shelf: { label, icon, opensAt(s), books: [[id, title, author, pages, blurb, extra?]] }
// extra may carry { fx, mods, reward, done(s) → news line }. Shelf defaults
// apply to every book on it.
window.READING_SHELVES = {
  hs: {
    label: "Required Reading", icon: "fa-school",
    note: "The books you were assigned at sixteen and understood at thirty.",
    opensAt: (s) => (s.totalDraftsEver ?? 0) >= 3,
    reward: { knowledgePerStudy: 0.02 },
    books: [
      ["catcher_rye", "The Catcher in the Rye", "J. D. Salinger", 234, "Everyone's a phony except you. You are sixteen."],
      ["lord_flies", "Lord of the Flies", "William Golding", 224, "A group project with no adult supervision. Accurate."],
      ["gatsby", "The Great Gatsby", "F. Scott Fitzgerald", 180, "The green light is a symbol. Your English teacher will not let this go."],
      ["mockingbird", "To Kill a Mockingbird", "Harper Lee", 281, "Your first lesson that being right and winning are different things."],
      ["nineteen84", "Nineteen Eighty-Four", "George Orwell", 328, "Big Brother is watching. So is Turnitin."],
      ["scarlet_letter", "The Scarlet Letter", "Nathaniel Hawthorne", 272, "Forty pages about a custom house before anything happens. Excellent training for literature reviews."],
      ["mice_men", "Of Mice and Men", "John Steinbeck", 107, "Short enough to read the night before. You did."],
      ["romeo_juliet", "Romeo and Juliet", "William Shakespeare", 160, "Two teenagers make a series of poor decisions over five days. In iambic pentameter."],
      ["hamlet", "Hamlet", "William Shakespeare", 342, "A prince who can't stop overthinking and won't finish his project. Foreshadowing."],
      ["fahrenheit451", "Fahrenheit 451", "Ray Bradbury", 158, "A world without books. You'd be unemployable."],
      ["brave_new_world", "Brave New World", "Aldous Huxley", 288, "Everyone is happy and nobody reads. Your future students, your teacher warns you."],
      ["frankenstein", "Frankenstein", "Mary Shelley", 280, "A brilliant student creates something in a lab and then refuses to mentor it."],
      ["crucible", "The Crucible", "Arthur Miller", 143, "A town tears itself apart over accusations nobody can check. A rehearsal for faculty meetings."],
      ["animal_farm", "Animal Farm", "George Orwell", 112, "All animals are equal, but some animals have endowed chairs."],
      ["their_eyes", "Their Eyes Were Watching God", "Zora Neale Hurston", 219, "The first book that made you put it down and stare at the wall for a while."],
      ["outsiders", "The Outsiders", "S. E. Hinton", 192, "Stay gold, Ponyboy. You will not stay gold."],
      ["separate_peace", "A Separate Peace", "John Knowles", 204, "Boarding school, a tree, and guilt. Mostly guilt."],
      ["sparknotes", "SparkNotes: Moby-Dick", "SparkNotes Editors", 64, "You have read Moby-Dick, in the sense that matters to a multiple-choice test.",
        { fx: { flag: "sparknotes", integrity: -0.5 } }],
      ["cracking_sat", "Cracking the SAT", "The Princeton Review", 900, "Teaches you to beat a test, which is a different skill from knowing things. You'll use it for twenty years."],
      ["walden_two", "Walden Two", "B. F. Skinner", 301, "A utopia run on reinforcement schedules. Your school runs on detention."]
    ]
  },

  ug: {
    label: "The Intro Syllabus", icon: "fa-building-columns",
    note: "Doorstops, paperbacks with someone else's highlighting, and one book that changed your major.",
    opensAt: (s) => s.levelIndex >= 1,
    mods: { knowledgeMult: 1.01 },
    books: [
      ["campbell_bio", "Campbell Biology", "Campbell & Reece", 1488, "Weighs as much as a small dog. Costs as much as a large one."],
      ["norton", "The Norton Anthology of English Literature", "Stephen Greenblatt, ed.", 3000, "Pages thin enough to roll cigarettes. Someone in your dorm did."],
      ["zinn", "A People's History of the United States", "Howard Zinn", 729, "Your roommate's entire personality for one semester."],
      ["cosmos", "Cosmos", "Carl Sagan", 365, "Billions and billions. You decide, briefly, to become an astrophysicist."],
      ["strunk_white", "The Elements of Style", "Strunk & White", 105, "Omit needless words. Your committee will later omit needed ones.", { mods: { writeCostMult: 0.97 } }],
      ["feynman", "The Feynman Lectures on Physics, Vol. I", "Richard Feynman", 560, "Physics explained by a man who also played bongos. Surely you're joking."],
      ["guns_germs", "Guns, Germs, and Steel", "Jared Diamond", 480, "Explains all of human history. Anthropologists would like a word. Several words."],
      ["sophies_world", "Sophie's World", "Jostein Gaarder", 518, "A philosophy course disguised as a novel disguised as a philosophy course."],
      ["clrs", "Introduction to Algorithms", "Cormen, Leiserson, Rivest & Stein", 1312, "Nobody has read it cover to cover. It is a doorstop with pseudocode."],
      ["freakonomics", "Freakonomics", "Levitt & Dubner", 315, "Makes you insufferable at dinner parties for about two years."],
      ["lie_statistics", "How to Lie with Statistics", "Darrell Huff", 142, "Written in 1954. Every chart you will ever see is still lying in the same five ways.", { mods: { paperQualityBonus: 2 } }],
      ["on_bullshit", "On Bullshit", "Harry Frankfurt", 67, "A Princeton philosopher defines bullshit. Seminar participation will never sound the same."],
      ["siddhartha", "Siddhartha", "Hermann Hesse", 152, "Read during a semester abroad. You find yourself, then lose your passport."],
      ["bell_jar", "The Bell Jar", "Sylvia Plath", 244, "The fig tree. You will think about the fig tree for the rest of your life.", { fx: { meaning: 1 } }],
      ["ways_seeing", "Ways of Seeing", "John Berger", 166, "Seeing comes before words. Also, the advertisements are lying to you."],
      ["zen_motorcycle", "Zen and the Art of Motorcycle Maintenance", "Robert Pirsig", 418, "A road trip about Quality. You start saying \"Quality\" with a capital Q. It's unbearable."],
      ["hitchhikers", "The Hitchhiker's Guide to the Galaxy", "Douglas Adams", 193, "The answer is 42. Your dissertation will also have the wrong question. Don't panic."],
      ["pragmatism_james", "Pragmatism", "William James", 160, "Truth is what works. Your code works. Therefore: truth."],
      ["comp_reader", "The Freshman Composition Reader, 7th ed.", "Various", 640, "One essay you loved, and forty about the five-paragraph essay."],
      ["intro_psych", "Psychology, 11th ed.", "David Myers", 832, "You diagnose everyone you know with something in chapter 14."]
    ]
  },

  methods: {
    label: "How to Be an Academic", icon: "fa-flask",
    note: "Every grad student owns these. Three have finished one.",
    opensAt: (s) => s.levelIndex >= 2,
    mods: { writeCostMult: 0.985, energyCostMult: 0.99 },
    books: [
      ["craft_research", "The Craft of Research", "Booth, Colomb & Williams", 336, "Teaches you to ask a question. Then to ask why anyone would care. Then to sit quietly for a while."],
      ["write_a_lot", "How to Write a Lot", "Paul Silvia", 149, "The secret is to schedule writing and then write. That's the whole book. It's 149 pages.", { mods: { energyCostMult: 0.97 } }],
      ["twelve_weeks", "Writing Your Journal Article in Twelve Weeks", "Wendy Belcher", 384, "Twelve weeks. You'll do it in thirty-one."],
      ["bird_by_bird", "Bird by Bird", "Anne Lamott", 237, "Permission to write terrible first drafts. You've never felt so seen.", { fx: { meaning: 1 } }],
      ["kkv", "Designing Social Inquiry", "King, Keohane & Verba", 245, "Everyone calls it KKV. Nobody agrees with it. Everyone cites it."],
      ["stat_rethinking", "Statistical Rethinking", "Richard McElreath", 612, "Golems, owls, and the quiet realization that your p-values were never what you thought.", { mods: { paperQualityBonus: 3 } }],
      ["mostly_harmless", "Mostly Harmless Econometrics", "Angrist & Pischke", 392, "Mostly. Harmless. The instrument is never as exogenous as you hope."],
      ["esl", "The Elements of Statistical Learning", "Hastie, Tibshirani & Friedman", 745, "Free PDF. Infinite dread."],
      ["gtd", "Getting Things Done", "David Allen", 352, "You build a system. You maintain the system. You get nothing else done."],
      ["chicago", "The Chicago Manual of Style, 17th ed.", "University of Chicago Press", 1146, "A thousand pages on commas. You have opinions now. You can never go back."],
      ["deep_work", "Deep Work", "Cal Newport", 296, "You read it while checking email. The irony is not lost on you.", { mods: { energyRegenMult: 1.02 } }],
      ["tufte", "The Visual Display of Quantitative Information", "Edward Tufte", 197, "You will never make a 3-D pie chart again. You will judge everyone who does.", { mods: { paperQualityBonus: 3 } }],
      ["shadish", "Experimental and Quasi-Experimental Designs", "Shadish, Cook & Campbell", 623, "Seventeen threats to validity. You start seeing them everywhere, including your relationships."],
      ["r4ds", "R for Data Science", "Hadley Wickham", 520, "You stop using Excel. You become someone who says \"tidyverse\" out loud."],
      ["latex", "LaTeX: A Document Preparation System", "Leslie Lamport", 272, "Your equations look beautiful. Your figures are on the wrong page. Forever."],
      ["laboratory_life", "Laboratory Life", "Latour & Woolgar", 296, "Two sociologists watch scientists manufacture facts. The scientists did not love the review."],
      ["truth_method", "Truth and Method", "Hans-Georg Gadamer", 601, "To understand the parts, understand the whole. To understand the whole, read it again."],
      ["professor_is_in", "The Professor Is In", "Karen Kelsky", 450, "Chapter one: the job market is worse than you think. Chapter two: worse than that.",
        { done: () => "You now know exactly how bad the job market is. It helps, in the way a weather forecast helps with a hurricane." }]
    ]
  },

  campus: {
    label: "Campus Novels (for Coping)", icon: "fa-mug-saucer",
    note: "Novels about professors, read by professors, at night, for reasons.",
    opensAt: (s) => s.levelIndex >= 5,
    fx: { meaning: 0.5 },
    mods: { energyRegenMult: 1.01 },
    books: [
      ["lucky_jim", "Lucky Jim", "Kingsley Amis", 251, "A junior lecturer gives a drunk lecture on \"Merrie England.\" The funniest novel about academia, and not by much a documentary."],
      ["stoner", "Stoner", "John Williams", 278, "A quiet man teaches English for forty years and is mostly forgotten. You cry for a week. It's about you.", { fx: { meaning: 3 } }],
      ["straight_man", "Straight Man", "Richard Russo", 391, "A department chair threatens to kill a goose a day on the local news until he gets a budget. Reasonable."],
      ["moo", "Moo", "Jane Smiley", 414, "A land-grant university, a secret hog, and budget cuts. Only the hog is fictional."],
      ["changing_places", "Changing Places", "David Lodge", 251, "Two professors swap jobs for a year and, gradually, everything else."],
      ["small_world", "Small World", "David Lodge", 339, "The conference circuit as Arthurian romance. Every keynote is a quest. Every hotel bar is a grail."],
      ["possession", "Possession", "A. S. Byatt", 555, "Two scholars fall in love in an archive. Footnotes have never been this romantic."],
      ["dear_committee", "Dear Committee Members", "Julie Schumacher", 180, "A novel told entirely in letters of recommendation. You have written every one of them."],
      ["wonder_boys", "Wonder Boys", "Michael Chabon", 368, "A writing professor's novel is 2,611 pages and unfinished. You know the feeling."],
      ["secret_history", "The Secret History", "Donna Tartt", 559, "Classics majors commit murder. The Greek, at least, is excellent."],
      ["pnin", "Pnin", "Vladimir Nabokov", 191, "A professor boards the wrong train to give a lecture with the wrong notes. Gently devastating."],
      ["disgrace", "Disgrace", "J. M. Coetzee", 220, "A professor refuses to say the words and loses everything. Bleak and brilliant.", { fx: { integrity: 1 } }],
      ["homo_academicus", "Homo Academicus", "Pierre Bourdieu", 344, "Bourdieu turns sociology on the sociologists. Everyone is furious, mostly in footnotes."],
      ["idea_university", "The Idea of a University", "John Henry Newman", 450, "Newman's 1852 lectures on liberal education. Quote it at your next budget meeting. It won't help."],
      ["two_cultures", "The Two Cultures", "C. P. Snow", 107, "Scientists and humanists can't talk to each other. Your dean read this and built an Innovation Hub."],
      ["academic_capitalism", "Academic Capitalism", "Slaughter & Rhoades", 368, "Explains everything wrong with your university. Your university bought it in bulk."],
      ["gaudy_night", "Gaudy Night", "Dorothy L. Sayers", 501, "A mystery at an Oxford women's college. The real crime is the governing body."],
      ["jude", "Jude the Obscure", "Thomas Hardy", 490, "A stonemason dreams of Oxford. Oxford does not dream of him. Hardy does not want you happy."],
      ["dialectic_enlightenment", "Dialectic of Enlightenment", "Adorno & Horkheimer", 304, "Enlightenment turns into its opposite. So did your department's \"innovation initiative.\""],
      ["vibrant_matter", "Vibrant Matter", "Jane Bennett", 200, "A trash heap has agency. You look at your desk differently. It looks back."],
      ["gender_trouble", "Gender Trouble", "Judith Butler", 272, "Identity is performed. So is \"having done the reading\" in seminar, and you've performed it for years."]
    ]
  },

  late: {
    label: "The Long Books, Saved for Retirement", icon: "fa-couch",
    note: "You always said you'd read these when you had time. You have time.",
    opensAt: (s) => s.levelIndex >= 8,
    fx: { meaning: 1 },
    mods: { citationMult: 1.03 },
    books: [
      ["proust", "In Search of Lost Time", "Marcel Proust", 4215, "A madeleine, a cup of tea, and seven volumes. You finally have the time. That's rather the point.", { fx: { meaning: 4 } }],
      ["middlemarch", "Middlemarch", "George Eliot", 880, "Dorothea marries a scholar writing The Key to All Mythologies. It is never finished. Uncomfortably familiar."],
      ["war_peace", "War and Peace", "Leo Tolstoy", 1225, "Napoleon, a ball, and 580 characters. You keep a spreadsheet. Your old advisor would approve."],
      ["magic_mountain", "The Magic Mountain", "Thomas Mann", 720, "A man visits a sanatorium for three weeks and stays seven years. Like a PhD."],
      ["infinite_jest", "Infinite Jest", "David Foster Wallace", 1079, "388 endnotes. You read every one. You are, it turns out, the kind of person who reads every endnote."],
      ["musil", "The Man Without Qualities", "Robert Musil", 1774, "Unfinished at 1,774 pages. Musil had a habilitation problem too."],
      ["montaigne", "Essays", "Michel de Montaigne", 1283, "The man who invented the essay, alone in a tower, in retirement. Que sais-je? Exactly."],
      ["ecclesiastes", "Ecclesiastes", "Qoheleth, the Preacher", 12, "\"Of making many books there is no end; and much study is a weariness of the flesh.\" (12:12)",
        { fx: { meaning: 3 }, done: () => "You read Ecclesiastes in one sitting. \"Of making many books there is no end.\" You laugh out loud in the empty library. You've made a lot of books." }],
      ["being_mortal", "Being Mortal", "Atul Gawande", 282, "What matters at the end. Not your h-index, it turns out."],
      ["ivan_ilyich", "The Death of Ivan Ilyich", "Leo Tolstoy", 86, "A respectable career, a fall from a ladder, and the question you've been putting off."],
      ["finnegans_wake", "Finnegans Wake", "James Joyce", 628, "riverrun, past Eve and Adam's... You finish it. Nobody believes you. You aren't sure you believe you."],
      ["genji", "The Tale of Genji", "Murasaki Shikibu", 1216, "The first novel, written by a woman, a thousand years ago. None of your syllabi assigned it."],
      ["anatomy_melancholy", "The Anatomy of Melancholy", "Robert Burton", 1392, "An Oxford don writes about sadness for forty years, citing absolutely everyone. A man after your own heart."],
      ["gilead", "Gilead", "Marilynne Robinson", 247, "An old minister writes a long letter to his young son about everything that mattered. You start one too."],
      ["remains_day", "The Remains of the Day", "Kazuo Ishiguro", 245, "A man realizes, a little too late, what he gave his life to. Read it before it's too late."],
      ["moby_dick", "Moby-Dick", "Herman Melville", 635, "The real one this time. There's a whole chapter on the whiteness of the whale. You get it now.",
        { done: (s) => storyFlag("sparknotes")
          ? "You finally read Moby-Dick, all of it, forty years after the SparkNotes. Herman, you have been avenged."
          : "You read Moby-Dick. Call yourself Ishmael. Some years ago, never mind how long precisely..." }]
    ]
  }
};

// Flat index: id → { book, shelfId }
const BOOKS = {};
for (const [shelfId, shelf] of Object.entries(window.READING_SHELVES)) {
  for (const [id, title, author, pages, blurb, extra] of shelf.books) {
    BOOKS[id] = { id, title, author, pages, blurb, extra: extra ?? {}, shelfId };
  }
}
window.BOOKS = BOOKS;

function shelfOpen(shelfId) { return !!window.READING_SHELVES[shelfId]?.opensAt(state); }
function bookRead(id) { return state.reading?.done?.[id] != null || !!state.perks?.[id]; }   // foundational texts are perks

function readingPagesPerSecond() {
  const L = typeof skillLevel === "function" ? skillLevel("reading") : 0;
  return 2 * (1 + 0.06 * L) * (state.modifiers?.readingSpeedMult ?? 1);
}

function bookSecondsLeft(id) {
  const b = BOOKS[id];
  if (!b) return 0;
  const left = Math.max(0, b.pages - (state.reading.progress[id] ?? 0));
  return Math.ceil(left / readingPagesPerSecond());
}

function startReading(id) {
  const b = BOOKS[id];
  if (!b || bookRead(id) || !shelfOpen(b.shelfId)) return false;
  state.reading.current = id;
  state.reading.started = (state.reading.started ?? 0) + 1;
  return true;
}

function stopReading() { state.reading.current = null; }

function tickReading() {
  const id = state.reading?.current;
  if (!id) return;
  const b = BOOKS[id];
  if (!b) { state.reading.current = null; return; }
  const p = (state.reading.progress[id] ?? 0) + readingPagesPerSecond() * TICK_MS / 1000;
  state.reading.progress[id] = p;
  if (p >= b.pages) finishBook(id);
}

function finishBook(id) {
  const b = BOOKS[id];
  const shelf = window.READING_SHELVES[b.shelfId];
  state.reading.done[id] = state.gameTicks ?? 0;
  delete state.reading.progress[id];
  if (state.reading.current === id) state.reading.current = null;
  const reward = Object.assign({}, shelf.reward, b.extra.reward);
  if (reward.knowledgePerStudy) state.knowledgePerStudy = (state.knowledgePerStudy ?? 1) + reward.knowledgePerStudy;
  applyStoryEffects(shelf.fx);
  applyStoryEffects(b.extra.fx);
  const line = b.extra.done ? b.extra.done(state) : `You finished ${b.title} (${b.author}). ${b.blurb}`;
  pushNews(line);
  if (["campus", "late"].includes(b.shelfId) || b.extra.done) storyLog(`Read ${b.title}.`, "reading");
  trainSkill("reading", Math.max(1, Math.round(b.pages / 100)));
  runHooks("bookRead", id);
  rebuildModifiers();
  // Pick up the next unread book on the same shelf, like you would
  const next = shelf.books.map(x => x[0]).find(x => !bookRead(x));
  if (next && state.reading.autoNext !== false) state.reading.current = next;
}

function readCount() {
  return Object.keys(state.reading?.done ?? {}).length
       + Object.keys(state.perks ?? {}).filter(id => window.PERKS?.[id]?.category === "foundational_text" && state.perks[id]).length;
}

// Modifiers hook: every finished book's lasting effect
function applyReadingModifiers(m) {
  for (const id of Object.keys(state.reading?.done ?? {})) {
    const b = BOOKS[id];
    if (!b) continue;
    const shelf = window.READING_SHELVES[b.shelfId];
    for (const table of [shelf.mods, b.extra.mods]) {
      if (!table) continue;
      for (const [k, v] of Object.entries(table)) {
        if (typeof m[k] !== "number") continue;
        if (k.endsWith("Mult")) m[k] *= v; else m[k] += v;
      }
    }
  }
}

// Foundational texts finally get a line when you read them
onHook("perk", (id) => {
  const p = window.PERKS?.[id];
  if (p?.category !== "foundational_text") return;
  const label = p.label.replace(/^Read /, "");
  pushNews(`You read ${label}, ${p.author}. ${p.blurb}`);
  storyLog(`Read ${label} (${p.author}).`, "reading");
  trainSkill("reading", 4);
});

// ── Theoretical frameworks ────────────────────────────────────────────
// pros scale ×1.5 if you've read any of `sources`; cons never do.
window.FRAMEWORKS = {
  positivism: {
    label: "Logical Positivism", icon: "fa-ruler", turn: "the empirical turn", sources: ["principia", "discourse_on_method"],
    blurb: "If it can't be verified, it's meaningless. This includes most of your colleagues.",
    pros: { paperQualityBonus: 8 }, cons: { knowledgeMult: 0.92 }
  },
  marxism: {
    label: "Marxism", icon: "fa-hammer", turn: "the materialist turn", sources: ["communist_manifesto"],
    blurb: "Seize the means of knowledge production. The means are a shared Dropbox.",
    pros: { gradDraftMult: 1.25, gradMorale: 0.05 }, cons: { grantChance: -0.03 }
  },
  psychoanalysis: {
    label: "Psychoanalysis", icon: "fa-couch", turn: "the psychoanalytic turn", sources: ["interpretation_of_dreams"],
    blurb: "Everything is about your advisor. Especially the things that aren't.",
    pros: { knowledgeMult: 1.15 }, cons: { burnoutMult: 1.15 }
  },
  structuralism: {
    label: "Structuralism", icon: "fa-sitemap", turn: "the linguistic turn", sources: ["course_in_general_linguistics"],
    blurb: "Meaning comes from difference. Your paper differs from the last one by one variable.",
    pros: { writeCostMult: 0.88 }, cons: { citationMult: 0.95 }
  },
  poststructuralism: {
    label: "Poststructuralism", icon: "fa-shapes", turn: "the poststructural turn", sources: ["simulacra_and_simulation", "discipline_and_punish"],
    blurb: "There is nothing outside the text. There is also no sentence inside your text shorter than forty words.",
    pros: { citationMult: 1.3 }, cons: { writeCostMult: 1.15 }
  },
  pragmatism: {
    label: "Pragmatism", icon: "fa-screwdriver-wrench", turn: "the pragmatic turn", sources: ["pragmatism_james"],
    blurb: "Truth is what works. You would like to work less.",
    pros: { energyCostMult: 0.9 }, cons: { citationMult: 0.92 }
  },
  bayesianism: {
    label: "Bayesianism", icon: "fa-dice", turn: "the Bayesian turn", sources: ["stat_rethinking"],
    blurb: "You update your priors constantly. Your priors are mostly anxiety.",
    pros: { grantChance: 0.04, paperQualityBonus: 6 }, cons: { writeCostMult: 1.08 }
  },
  phenomenology: {
    label: "Phenomenology", icon: "fa-eye", turn: "the phenomenological turn", sources: ["being_and_time"],
    blurb: "Back to the things themselves. The things themselves are behind schedule.",
    pros: { energyRegenMult: 1.1, knowledgeMult: 1.05 }, cons: { writeCostMult: 1.08 }
  },
  feminist: {
    label: "Feminist Standpoint Theory", icon: "fa-venus", turn: "the feminist turn", sources: ["the_second_sex", "a_room_of_ones_own"],
    blurb: "Knowledge is situated. Yours is situated in a basement office with no windows.",
    pros: { gradMorale: 0.06, gradDraftMult: 1.1, paperQualityBonus: 3 }, cons: { grantChance: -0.01 }
  },
  postcolonial: {
    label: "Postcolonial Theory", icon: "fa-earth-africa", turn: "the decolonial turn", sources: ["orientalism", "things_fall_apart"],
    blurb: "The archive is never neutral. Neither is the funding agency.",
    pros: { citationMult: 1.12, knowledgeMult: 1.04 }, cons: { grantChance: -0.02 }
  },
  ant: {
    label: "Actor-Network Theory", icon: "fa-circle-nodes", turn: "the material turn", sources: ["laboratory_life"],
    blurb: "The espresso machine is an actant. So is the broken printer, and it is winning.",
    pros: { propMult: 1.5, gradSpeedMult: 1.1 }, cons: { knowledgeMult: 0.96 }
  },
  rational_choice: {
    label: "Rational Choice Theory", icon: "fa-chart-line", turn: "the economic turn", sources: ["wealth_of_nations"],
    blurb: "Everyone maximizes utility. You maximize citations. Your students maximize leaving.",
    pros: { grantChance: 0.05, energyCostMult: 0.95 }, cons: { gradMorale: -0.04 }
  },
  systems: {
    label: "Systems Theory", icon: "fa-diagram-project", turn: "the systems turn", sources: ["godel_escher_bach"],
    blurb: "Everything is connected to everything. Especially the deadlines.",
    pros: { holdingMult: 1.15, gradSpeedMult: 1.05 }, cons: { energyRegenMult: 0.96 }
  },
  behaviorism: {
    label: "Behaviorism", icon: "fa-bell", turn: "the behavioral turn", sources: ["walden_two"],
    blurb: "There is no mind, only reinforcement. Coffee is a reinforcement schedule.",
    pros: { buffDurationMult: 1.4 }, cons: { knowledgeMult: 0.95 }
  },
  critical_theory: {
    label: "Critical Theory", icon: "fa-industry", turn: "the critical turn", sources: ["dialectic_enlightenment"],
    blurb: "The culture industry is everywhere. You notice it in your own year-end playlist recap.",
    pros: { citationMult: 1.15, paperQualityBonus: 2 }, cons: { energyRegenMult: 0.93 }
  },
  hermeneutics: {
    label: "Hermeneutics", icon: "fa-rotate", turn: "the interpretive turn", sources: ["truth_method"],
    blurb: "To understand the parts, understand the whole. You read everything twice. Productivity: circular.",
    pros: { readingSpeedMult: 1.5, knowledgeMult: 1.05 }, cons: { writeCostMult: 1.05 }
  },
  new_materialism: {
    label: "New Materialism", icon: "fa-cube", turn: "the ontological turn", sources: ["vibrant_matter"],
    blurb: "Your stapler has agency. Your desk lamp has politics. You've never felt less alone.",
    pros: { propMult: 1.3, energyMaxBonus: 15 }, cons: { citationMult: 0.95 }
  },
  darwinism: {
    label: "Evolutionary Theory", icon: "fa-dna", turn: "the Darwinian turn", sources: ["origin_of_species", "the_selfish_gene", "voyage_of_the_beagle"],
    blurb: "Survival of the most cited. Your papers compete for niches and occasionally eat each other.",
    pros: { paperMult: 1.15, tierSpread: 0.15 }, cons: { gradMorale: -0.02 }
  },
  queer_theory: {
    label: "Queer Theory", icon: "fa-arrows-split-up-and-left", turn: "the queer turn", sources: ["gender_trouble"],
    blurb: "Categories are performed. You've been performing \"having done the reading\" since 2009.",
    pros: { citationMult: 1.1, paperQualityBonus: 4 }, cons: { grantChance: -0.02 }
  }
};

const FRAMEWORK_TURN_SECONDS = 90;

function frameworkSlotCount(level = state.levelIndex) {
  const base = level >= 7 ? 3 : level >= 6 ? 2 : level >= 3 ? 1 : 0;
  return base + (state.modifiers?.frameworkSlotBonus ?? 0);
}

function frameworkInformed(id) {
  return (window.FRAMEWORKS[id]?.sources ?? []).some(bookRead);
}

function frameworkTurnStatus() {
  const wait = (state.frameworks.lastTurnAt ?? -99999) + ticksFromSeconds(FRAMEWORK_TURN_SECONDS) - (state.gameTicks ?? 0);
  if (wait > 0) return { ok: false, reason: `Still recovering from your last turn (${Math.ceil(wait * TICK_MS / 1000)}s)` };
  if (inCooldown()) return { ok: false, reason: "Burned out" };
  const cost = Math.round(maxEnergy() * 0.2);
  if ((state.energy ?? 0) < cost) return { ok: false, reason: `Needs ${cost} energy` };
  return { ok: true, reason: "", cost };
}

function adoptFramework(slot, id) {
  const F = window.FRAMEWORKS[id];
  const fw = state.frameworks;
  if (!F || slot < 0 || slot >= frameworkSlotCount()) return false;
  if (fw.slots.includes(id)) return false;
  const st = frameworkTurnStatus();
  const firstTime = !fw.slots.filter(Boolean).length && !fw.turns;
  if (!firstTime && !st.ok) return false;
  if (!firstTime) spendEnergy(st.cost);
  const old = fw.slots[slot];
  fw.slots[slot] = id;
  fw.lastTurnAt = state.gameTicks ?? 0;
  if (old) {
    fw.turns = (fw.turns ?? 0) + 1;
    pushNews(`You take ${F.turn}. Your ${window.FRAMEWORKS[old].label} papers are now "early work."`);
    storyLog(`Took ${F.turn}, leaving ${window.FRAMEWORKS[old].label} behind.`, "framework");
  } else {
    pushNews(`You now read everything through ${F.label}. ${F.blurb}${frameworkInformed(id) ? " (You've even read the source text, which puts you ahead of most.)" : ""}`);
    storyLog(`Adopted ${F.label}.`, "framework");
  }
  fw.history = [...(fw.history ?? []), id].slice(-20);
  rebuildModifiers();
  return true;
}

function applyFrameworkModifiers(m) {
  const slots = (state.frameworks?.slots ?? []).slice(0, frameworkSlotCount());
  for (const id of slots) {
    const F = window.FRAMEWORKS[id];
    if (!F) continue;
    const amp = frameworkInformed(id) ? 1.5 : 1;
    for (const [k, v] of Object.entries(F.pros)) {
      if (typeof m[k] !== "number") continue;
      if (k.endsWith("Mult")) m[k] *= 1 + (v - 1) * amp; else m[k] += v * amp;
    }
    for (const [k, v] of Object.entries(F.cons)) {
      if (typeof m[k] !== "number") continue;
      if (k.endsWith("Mult")) m[k] *= v; else m[k] += v;
    }
  }
}

function describeMods(table) {
  const names = {
    knowledgeMult: "knowledge", writeCostMult: "writing cost", citationMult: "citations", energyRegenMult: "energy regen",
    energyCostMult: "energy costs", gradDraftMult: "student drafts", gradSpeedMult: "student papers", paperMult: "reading papers",
    burnoutMult: "burnout length", readingSpeedMult: "reading speed", buffDurationMult: "buff duration", holdingMult: "holdings",
    propMult: "desk props", paperQualityBonus: "paper quality", grantChance: "grant odds", gradMorale: "student morale",
    energyMaxBonus: "max energy", tierSpread: "boldness"
  };
  return Object.entries(table).map(([k, v]) => {
    const n = names[k] ?? k;
    if (k.endsWith("Mult")) return `${v >= 1 ? "+" : "−"}${Math.round(Math.abs(v - 1) * 100)}% ${n}`;
    if (k === "grantChance" || k === "gradMorale" || k === "tierSpread") return `${v >= 0 ? "+" : "−"}${Math.round(Math.abs(v) * 100)}% ${n}`;
    return `${v >= 0 ? "+" : "−"}${Math.abs(v)} ${n}`;
  }).join(", ");
}

function openFrameworkPicker(slot) {
  const fw = state.frameworks;
  const st = frameworkTurnStatus();
  const firstTime = !fw.slots.filter(Boolean).length && !fw.turns;
  const cards = Object.entries(window.FRAMEWORKS).map(([id, F]) => {
    const inUse = fw.slots.includes(id);
    const informed = frameworkInformed(id);
    const can = !inUse && (firstTime || st.ok);
    return `<button type="button" class="fw-pick" data-fw-pick="${id}" data-fw-slot="${slot}" ${can ? "" : "disabled"}>
      <strong><i class="fa-solid ${F.icon}"></i> ${escHTML(F.label)}</strong>${informed ? ` <span class="fw-read" title="You've read the source text: the good part counts 1.5×">read ✓</span>` : ""}
      <span class="fw-blurb">${escHTML(F.blurb)}</span>
      <span class="fw-pros">${escHTML(describeMods(F.pros))}</span>
      <span class="fw-cons">${escHTML(describeMods(F.cons))}</span>
    </button>`;
  }).join("");
  const note = firstTime ? "Your first framework is free. After that, every change is a turn, and turns are tiring."
             : st.ok ? `Changing costs ${st.cost} energy. Your old papers will become "early work."` : st.reason;
  showNote({ title: "Choose a theoretical framework", html: `<p class="dlg-body">${escHTML(note)}</p><div class="fw-grid">${cards}</div>`, ok: "Never mind", cls: "dlg-wide" });
}

// ── The Reading List paper ────────────────────────────────────────────
function renderReading() {
  const el = ensurePanel("panel_reading", "Reading List", "fa-book-bookmark");
  if (!el) return;
  const openShelves = Object.keys(window.READING_SHELVES).filter(shelfOpen);
  const foundational = (state.foundationalOrder ?? []).filter(id => foundationalUnlocked(state, id) || state.perks?.[id]);
  showPanel(el, openShelves.length > 0 || foundational.length > 0);
  if (!openShelves.length && !foundational.length) return;
  setPanelTitle(el, `Reading List <span class="inbox-count">${readCount()}</span>`);

  const cur = state.reading.current ? BOOKS[state.reading.current] : null;
  let html = "";
  if (cur) {
    html += `<div class="rd-current"><div class="rd-now">Now reading</div>
      <div class="rd-title"><em>${escHTML(cur.title)}</em>, ${escHTML(cur.author)}</div>
      <div class="rd-bar"><div class="rd-fill"></div></div>
      <div class="rd-meta"><span data-live="rd-pages"></span> · <span data-live="rd-left"></span>
      <button type="button" class="rd-stop" data-rd-stop="1">Put it down</button></div></div>`;
  } else {
    html += `<p class="rd-idle">Your nightstand is empty. Pick something; it reads itself while you work.</p>`;
  }

  if (foundational.length && !state.flags?.dissertationDefended || foundational.some(id => state.perks?.[id])) {
    const items = foundational.map(id => {
      const p = window.PERKS[id];
      const read = !!state.perks[id];
      const can = !read && !state.flags?.dissertationDefended && !inCooldown() && (state.energy ?? 0) >= (p.cost?.energy ?? 50);
      const label = p.label.replace(/^Read /, "");
      return read
        ? `<li class="rd-book rd-done" title="${escHTML(p.blurb)}">✓ <em>${escHTML(label)}</em>, ${escHTML(p.author)}</li>`
        : `<li class="rd-book"><button type="button" data-rd-found="${id}" ${can ? "" : "disabled"} title="${escHTML(p.blurb)}"><i class="fa-solid fa-book-open"></i> <em>${escHTML(label)}</em>, ${escHTML(p.author)} <small>(50 energy, one sitting)</small></button></li>`;
    }).join("");
    html += `<details class="rd-shelf" ${state.levelIndex <= 3 ? "open" : ""}><summary><i class="fa-solid fa-landmark"></i> Foundational Texts <span class="rd-count">${foundational.filter(id => state.perks[id]).length}/${foundational.length}</span></summary>
      <p class="rd-note">The canon, one heroic sitting each. Until you defend, anyway; after that you'll just say you've read them.</p><ul>${items}</ul></details>`;
  }

  for (const shelfId of openShelves.slice().reverse()) {
    const shelf = window.READING_SHELVES[shelfId];
    const done = shelf.books.filter(b => bookRead(b[0])).length;
    const items = shelf.books.map(([id, title, author, pages, blurb]) => {
      if (bookRead(id)) return `<li class="rd-book rd-done" title="${escHTML(blurb)}">✓ <em>${escHTML(title)}</em>, ${escHTML(author)}</li>`;
      const now = state.reading.current === id;
      const started = !now && state.reading.progress[id] ? ` · p. ${Math.floor(state.reading.progress[id])}` : "";
      return `<li class="rd-book"><button type="button" data-rd-start="${id}" ${now ? "disabled" : ""} title="${escHTML(blurb)}"><em>${escHTML(title)}</em>, ${escHTML(author)} <small>${pages}pp.${started}</small></button></li>`;
    }).join("");
    const openAttr = shelfId === openShelves[openShelves.length - 1] ? "open" : "";
    html += `<details class="rd-shelf" ${openAttr} data-shelf="${shelfId}"><summary><i class="fa-solid ${shelf.icon}"></i> ${escHTML(shelf.label)} <span class="rd-count">${done}/${shelf.books.length}</span></summary>
      <p class="rd-note">${escHTML(shelf.note)}</p><ul>${items}</ul></details>`;
  }
  // Keep open/closed shelves as the player left them
  const openNow = new Set([...el.querySelectorAll("details.rd-shelf")].filter(d => d.open).map(d => d.querySelector("summary")?.textContent?.slice(0, 20)));
  const had = el.querySelectorAll("details.rd-shelf").length > 0;
  setPanelBody(el, html);
  if (had) el.querySelectorAll("details.rd-shelf").forEach(d => { d.open = openNow.has(d.querySelector("summary")?.textContent?.slice(0, 20)); });
  if (cur) {
    const p = state.reading.progress[cur.id] ?? 0;
    setLive(el, "rd-pages", `p. ${Math.floor(p)} of ${cur.pages}`);
    setLive(el, "rd-left", `${fmtDuration(bookSecondsLeft(cur.id))} left`);
    const fill = el.querySelector(".rd-fill");
    const w = `${Math.min(100, (100 * p / cur.pages)).toFixed(1)}%`;
    if (fill && fill.style.width !== w) fill.style.width = w;
  }
}

function fmtDuration(sec) {
  sec = Math.max(0, Math.round(sec));
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60), s = sec % 60;
  if (m < 60) return `${m}m ${String(s).padStart(2, "0")}s`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}

function renderFrameworks() {
  const el = ensurePanel("panel_frameworks", "Theoretical Framework", "fa-glasses");
  if (!el) return;
  const n = frameworkSlotCount();
  showPanel(el, n > 0);
  if (!n) return;
  setPanelTitle(el, n > 1 ? "Theoretical Frameworks" : "Theoretical Framework");
  const fw = state.frameworks;
  const slots = [];
  for (let i = 0; i < n; i++) {
    const id = fw.slots[i];
    const F = id ? window.FRAMEWORKS[id] : null;
    slots.push(F
      ? `<div class="fw-slot"><div class="fw-name"><i class="fa-solid ${F.icon}"></i> ${escHTML(F.label)}${frameworkInformed(id) ? ` <span class="fw-read" title="You've read the source text">read ✓</span>` : ""}</div>
           <div class="fw-blurb">${escHTML(F.blurb)}</div>
           <div class="fw-pros">${escHTML(describeMods(F.pros))}${frameworkInformed(id) ? " (×1.5)" : ""}</div><div class="fw-cons">${escHTML(describeMods(F.cons))}</div>
           <button type="button" data-fw-open="${i}">Take a turn…</button></div>`
      : `<div class="fw-slot fw-empty"><p>An empty lens. Everything looks like data.</p><button type="button" data-fw-open="${i}">Choose a framework…</button></div>`);
  }
  const turns = fw.turns ? `<p class="fw-turns">Turns taken: ${fw.turns}. ${fw.turns >= 5 ? "Colleagues have started calling you \"protean.\" It isn't a compliment." : ""}</p>` : "";
  setPanelBody(el, slots.join("") + turns);
}

if (typeof document !== "undefined") {
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-rd-start], [data-rd-stop], [data-rd-found], [data-fw-open], [data-fw-pick]");
    if (!btn || btn.disabled) return;
    if (btn.dataset.rdStart) startReading(btn.dataset.rdStart);
    else if (btn.dataset.rdStop) stopReading();
    else if (btn.dataset.rdFound) unlockPerk(btn.dataset.rdFound);
    else if (btn.dataset.fwOpen != null) { openFrameworkPicker(Number(btn.dataset.fwOpen)); return; }
    else if (btn.dataset.fwPick) { adoptFramework(Number(btn.dataset.fwSlot), btn.dataset.fwPick); closeDialog(); }
    render();
  });
}

// ── Wiring ────────────────────────────────────────────────────────────
onHook("tick", tickReading);
onHook("modifiers", (m) => { applyReadingModifiers(m); applyFrameworkModifiers(m); });
onHook("render", () => { renderReading(); renderFrameworks(); });
onHook("enterLevel", (i) => {
  if (i === 3) pushNews("Your doctorate comes with a free gift: a theoretical framework. Choose carefully; you'll be defending it for years.");
  if (i === 6 || i === 7) pushNews("You can hold another framework now. Interdisciplinary! Your colleagues in either field will find you suspicious.");
});
