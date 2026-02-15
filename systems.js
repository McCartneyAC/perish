//systems.js

function tick() {
  state.energy = Math.min(state.maxEnergy, state.energy + ENERGY_REGEN_PER_TICK);

  autoPurchasePublications(); // <-- add

const nGroups = studyGroupCount();
if (nGroups > 0) {
  state.studyGroupAccMs += TICK_MS;

  // base 1 knowledge per 10s, compounded by groups
  const basePer10s = 1;
  const compound = Math.pow(1.1, nGroups);

  // extraversion bonus-only (same spirit as your current code)
  const e = traitCentered((state.traits || {}).extraversion ?? 50);
  const extraMult = 1 + EXTRAVERSION_GROUP_MAX * Math.max(0, e);

  // agreeableness perk placeholder (tweak later):
  // agreeable people get +5% per group (bonus-only, mild)
  const a = traitCentered((state.traits || {}).agreeableness ?? 50);
  const agreeMult = 1 + 0.05 * nGroups * Math.max(0, a);

  const per10s = basePer10s * compound * extraMult * agreeMult;

  while (state.studyGroupAccMs >= 10000) {
    state.studyGroupAccMs -= 10000;
    state.knowledge += per10s;
  }
}


  if (state.publications >= CITATIONS_UNLOCK_PUBS) {
    const rate = 1 + (state.publications - CITATIONS_UNLOCK_PUBS);
    state.citations += rate;
  }


  tryLevelUp();
  render();
}

function initNewGame() {
  rollBirthTraitsIfNeeded();
  render();
}
