//render.js
///////////////////RENDER/////////////////////////////
function render() {
  const tGain = textbookStudyGain();
  const pGain = paperStudyGain();
  const sgTier = eligibleStudyGroupTier();
  // Button enable/disable
  writeBtn.disabled =
    inCooldown() || state.energy <= 0 || state.knowledge < writeCost();

  // Study buttons: visible by level
  studyTextBtn.style.display = canStudyTextbooks() ? "inline-block" : "none";
  studyPaperBtn.style.display = canStudyPapers() ? "inline-block" : "none";

  // SAT buttons: visible only when unlocked (HS + knowledge threshold)
  const satUnlocked =
    state.levelIndex === 0 && state.knowledge >= SAT_UNLOCK_KNOWLEDGE;
  satMathBtn.style.display = satUnlocked ? "inline-block" : "none";
  satVerbalBtn.style.display = satUnlocked ? "inline-block" : "none";

  // SAT buttons: enabled only when canTakeSAT()
  const satDisabled = !canTakeSAT();
  satMathBtn.disabled = satDisabled;
  satVerbalBtn.disabled = satDisabled;

  // Study buttons: disabled in cooldown or no energy
  const studyDisabled = inCooldown() || state.energy <= 0;
  studyTextBtn.disabled = studyDisabled;
  studyPaperBtn.disabled = studyDisabled;

  // Energy bar
  const pct = (state.energy / state.maxEnergy) * 100;
  barInner.style.width = pct + "%";

  // Burnout label visibility
  burnoutLabel.style.opacity = inCooldown() ? "1" : "0";

  // Major UI gate
  const showMajor = shouldPromptMajor();
  majorUI.style.display = showMajor ? "block" : "none";

  // Energy / burnout line
  barLabel.innerHTML = inCooldown()
    ? `<i class="fa-solid fa-fire"></i> Burnout: ${Math.ceil(
        (state.cooldownUntil - Date.now()) / 1000
      )}s`
    : `<i class="fa-solid fa-bed"></i> Energy: ${Math.floor(
        state.energy
      )}/${state.maxEnergy}`;

  // Next-level requirements
  const next = Math.min(state.levelIndex + 1, LEVELS.length - 1);
  const req = LEVEL_REQS[next];

  //
// CURRENT
hudCurrent.innerHTML = `
  <div><strong><i class="fa-solid fa-brain"></i> Knowledge:</strong> ${Math.floor(state.knowledge)}</div>
  <div><strong><i class="fa-solid fa-pen-fancy"></i> Write Cost:</strong> ${writeCost()} knowledge</div>

  <div><strong><i class="fa-solid fa-book-open"></i> Textbook Study:</strong> +${tGain.toFixed(1)} knowledge (cost: ${TEXTBOOK_ENERGY_COST} energy)</div>
  <div><strong><i class="fa-solid fa-glasses"></i> Paper Reading:</strong> +${pGain.toFixed(1)} knowledge (cost: ${PAPER_ENERGY_COST} energy)</div>



  <div><strong><i class="fa-solid fa-scroll"></i> Drafts:</strong> ${state.drafts}</div>
  <div><strong><i class="fa-solid fa-book"></i> Publications:</strong> ${state.publications} (auto-buy: ${DRAFTS_PER_PUBLICATION} drafts)</div>
  <div><strong><i class="fa-brands fa-mendeley"></i> Citations:</strong> ${state.citations} ${
    state.publications < CITATIONS_UNLOCK_PUBS
      ? `(locked until ${CITATIONS_UNLOCK_PUBS} publications)`
      : ""
  }</div>

  <div><strong><i class="fa-solid fa-h"></i>-Index:</strong> ${state.hIndex}</div>
  <div><i class="fa-brands fa-google-scholar"></i></div>
`;

// CV
hudCV.innerHTML = `
  <div><strong><i class="fa-solid fa-graduation-cap"></i> Level:</strong> ${levelName()}</div>
  <div><strong>Next:</strong> ${LEVELS[next]}</div>

  <div style="margin-top:6px;">
    Needs:<br>
    knowledge &ge; ${req.k},<br>
    draftsEver &ge; ${req.d},<br>
    publications &ge; ${req.p},<br>
    citations &ge; ${req.c},<br>
    landmarks &ge; ${req.l}
  </div>



  <div><strong><i class="fa-solid fa-school-flag"></i> SAT (superscore):</strong>
    Math ${state.satMath ?? "—"} / Verbal ${state.satVerbal ?? "—"} / Total ${satTotal() || "—"}
  </div>

  ${
    state.levelIndex === 0
      ? `
        <div><strong><i class="fa-solid fa-list-check"></i> Attempts:</strong>
          ${state.satAttemptsUsed} / ${satAttemptsMax()}
        </div>
      `
      : ""
  }

  <div><strong><i class="fa-solid fa-building-columns"></i> University Prestige:</strong>
    ${state.universityPrestige} / 100
  </div>

  <div><strong><i class="fa-solid fa-trophy"></i> College Accepted:</strong> ${
    state.collegeAccepted ? "Yes" : "No"
  }</div>

  <div><strong><i class="fa-solid fa-bookmark"></i> Major:</strong> ${
    state.identity.major
  }</div>
`;

// OTHER
hudOther.innerHTML = `
  ${
    sgTier
      ? `<div style="margin-top:8px;">
           <button id="join_study_group">
             Join Study Group (${sgTier})
           </button>
         </div>`
      : ""
  }

  <div style="margin-top:10px; border-top:1px dashed #999; padding-top:6px;">
    <strong>DEBUG: Birth Traits</strong><br>
    IQ: ${state.traits.iq}<br>
    C: ${state.traits.conscientiousness}<br>
    A: ${state.traits.agreeableness}<br>
    N: ${state.traits.neuroticism}<br>
    O: ${state.traits.openness}<br>
    E: ${state.traits.extraversion}<br>
    SES: ${state.traits.ses}
  </div>
`;
}
