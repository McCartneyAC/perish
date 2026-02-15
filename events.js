//events.js
   ///////////////////EVENT LISTENERS/////////////////////////////
    studyTextBtn.addEventListener("click", () => {
      if (!canStudyTextbooks()) return;
      if (!spendEnergy(TEXTBOOK_ENERGY_COST)) return;
      state.knowledge += textbookStudyGain();
      tryLevelUp();
      render();
    });


    studyPaperBtn.addEventListener("click", () => {
      if (!canStudyPapers()) return;
      if (!spendEnergy(PAPER_ENERGY_COST)) return;
      state.knowledge += paperStudyGain();
      tryLevelUp();
      render();
    });
writeBtn.addEventListener("click", () => act(() => {
  if (!spendEnergy(WRITE_ENERGY_COST)) return false;
  const cost = writeCost();
  if (state.knowledge < cost) return false;

  state.knowledge -= cost;
  state.drafts += WRITE_GAIN_DRAFTS;
  state.totalDraftsEver += WRITE_GAIN_DRAFTS;
  state.knowledgePerStudy += STUDY_BOOST_PER_WRITE / (1 + state.knowledgePerStudy * 0.2);
  autoPurchasePublications();
  return true;
}));


    satMathBtn.addEventListener("click", () => {
      if (!canTakeSAT()) return;
      if (!spendEnergy(SAT_ENERGY_COST)) return;

      const score = rollSatSectionScore();
      state.satMath = Math.max(state.satMath ?? 0, score);
      state.satAttemptsUsed += 1;

      const total = satTotal();
      if (total >= SAT_ACCEPT_TOTAL) {
        state.collegeAccepted = true;
        state.universityPrestige = calcPrestigeFromSAT(total);
      }

      tryLevelUp();
      render();
    });

majStemBtn.addEventListener("click", () => declareMajor("STEM"));
majHumBtn.addEventListener("click",  () => declareMajor("Humanities"));
majArtsBtn.addEventListener("click", () => declareMajor("Arts"));
majEngBtn.addEventListener("click",  () => declareMajor("Engineering"));
majBusBtn.addEventListener("click",  () => declareMajor("Business"));




    satVerbalBtn.addEventListener("click", () => {
      if (!canTakeSAT()) return;
      if (!spendEnergy(SAT_ENERGY_COST)) return;

      const score = rollSatSectionScore();
      state.satVerbal = Math.max(state.satVerbal ?? 0, score);
      state.satAttemptsUsed += 1;

      const total = satTotal();
      if (total >= SAT_ACCEPT_TOTAL) {
        state.collegeAccepted = true;
        state.universityPrestige = calcPrestigeFromSAT(total);
      }

      tryLevelUp();
      render();
    });

hudOther.addEventListener("click", (e) => {
  if (e.target && e.target.id === "join_study_group") {
    const tier = eligibleStudyGroupTier();
    if (joinStudyGroup(tier)) {
      render();
    }
  }
});


