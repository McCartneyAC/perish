//systems.js

///////////////////PUBLICATION CITATIONS ENGINE///////////////////////

const PUBLICATION_TYPES = {
  conference: { baseRate: 0.35, lag: 8,  rise: 25 },
  journal:    { baseRate: 0.45, lag: 18, rise: 60 },
  chapter:    { baseRate: 0.25, lag: 22, rise: 80 },
  monograph:  { baseRate: 0.60, lag: 50, rise: 180 }
};

function ramp(age, lag, rise) {
  if (age <= lag) return 0;
  return clamp((age - lag) / rise, 0, 1);
}

function visibilityMult() {
  return 1 + 0.01 * (state.universityPrestige || 0);
}

function noise() {
  return 0.9 + Math.random() * 0.2; // 0.9–1.1
}

function calcHIndex(papers) {
  const citations = (papers || [])
    .map(p => Math.floor(p.citations || 0))
    .sort((a, b) => b - a);

  let h = 0;
  for (let i = 0; i < citations.length; i++) {
    if (citations[i] >= i + 1) h = i + 1;
    else break;
  }
  return h;
}

function tickCitations() {
  const papers = state.papers || [];
  if (papers.length === 0) {
    state.publications = 0;
    state.citations = 0;
    state.hIndex = 0;
    return;
  }

  const vis = visibilityMult();
  const major = state.identity?.major;

  for (const paper of papers) {
    const prof = PUBLICATION_TYPES[paper.type];
    if (!prof) continue;

    paper.ageTicks = (paper.ageTicks || 0) + 1;

    const r = ramp(paper.ageTicks, prof.lag, prof.rise);
    const q = paper.quality ?? 50;

    const delta =
      prof.baseRate *
      r *
      vis *
      qualityMult(q) *
      majorMultiplier(major, paper.type) *
      noise();

    paper.citations = (paper.citations || 0) + delta;
  }

  // Keep legacy counters in sync for now
  state.publications = papers.length;
  state.citations = papers.reduce((sum, p) => sum + (p.citations || 0), 0);
  state.hIndex = calcHIndex(papers);
}

function tick() {
  state.energy = Math.min(state.maxEnergy, state.energy + ENERGY_REGEN_PER_TICK);

  tickCitations();

const nGroups = studyGroupCount();
if (nGroups > 0) {
  state.studyGroupAccMs += TICK_MS;

  // base 1 knowledge per 5s, compounded by groups
  const basePer5s = 1;
  const compound = Math.pow(1.1, nGroups);

  // extraversion bonus-only (same spirit as your current code)
  const e = traitCentered((state.traits || {}).extraversion ?? 50);
  const extraMult = 1 + EXTRAVERSION_GROUP_MAX * Math.max(0, e);

  // agreeableness perk placeholder (tweak later):
  // agreeable people get +5% per group (bonus-only, mild)
  const a = traitCentered((state.traits || {}).agreeableness ?? 50);
  const agreeMult = 1 + 0.05 * nGroups * Math.max(0, a);

  const per5s = basePer5s * compound * extraMult * agreeMult;


   //sanity saver /////////////////
  localStorage.setItem("pop_save", JSON.stringify(state));

  while (state.studyGroupAccMs >= 5000) {
    state.studyGroupAccMs -= 5000;
    state.knowledge += per5s;
  }

}


  tryLevelUp();
  render();
}

function initNewGame() {
const saved = localStorage.getItem("pop_save");
if (saved) {
  Object.assign(state, JSON.parse(saved));
}

  rollBirthTraitsIfNeeded();

  render();
}
