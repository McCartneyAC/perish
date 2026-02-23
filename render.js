// render.js
///////////////////RENDER/////////////////////////////
function render() {
  console.log("render() tick", Date.now());
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

  // GRE buttons: visible only when unlocked (undergrad + knowledge threshold)
  const greUnlocked =
    state.levelIndex === 1 && state.knowledge >= GRE_UNLOCK_KNOWLEDGE;
  greQuantBtn.style.display = greUnlocked ? "inline-block" : "none";
  greVerbalBtn.style.display = greUnlocked ? "inline-block" : "none";

  // GRE buttons: enabled only when canTakeGRE()
  const greDisabled = !canTakeGRE();
  greQuantBtn.disabled = greDisabled;
  greVerbalBtn.disabled = greDisabled;

  // Publications UI: visible at doctoral+
  const pubsUnlocked = state.levelIndex >= PUB_UNLOCK_LEVEL;
  pubUI.style.display = pubsUnlocked ? "block" : "none";
  if (pubsUnlocked) {
    pubConferenceBtn.disabled = !canPublish("conference");
    pubJournalBtn.disabled = !canPublish("journal");
    pubChapterBtn.disabled = !canPublish("chapter");

    // Monograph later (adjunct+ by design)
    const monoUnlocked = state.levelIndex >= MONOGRAPH_UNLOCK_LEVEL;
    pubMonographBtn.style.display = monoUnlocked ? "inline-block" : "none";
    pubMonographBtn.disabled = !canPublish("monograph");
  }

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

  // Next-level requirements (safe at final level)
  const nextIndex = Math.min(state.levelIndex + 1, LEVELS.length - 1);
  const nextLevel = LEVELS[nextIndex] || null;
  const req = nextLevel?.req || null;
  const curLevel = LEVELS[state.levelIndex] || null;

  // CURRENT
  hudCurrent.innerHTML = `
    <div><strong><i class="fa-solid fa-brain"></i> Knowledge:</strong> ${Math.floor(state.knowledge)}</div>
    <div><strong><i class="fa-solid fa-pen-fancy"></i> Write Cost:</strong> ${writeCost()} knowledge</div>

    <div><strong><i class="fa-solid fa-book-open"></i> Textbook Study:</strong> +${tGain.toFixed(1)} knowledge (cost: ${TEXTBOOK_ENERGY_COST} energy)</div>
    <div><strong><i class="fa-solid fa-glasses"></i> Paper Reading:</strong> +${pGain.toFixed(1)} knowledge (cost: ${PAPER_ENERGY_COST} energy)</div>

    <div><strong><i class="fa-solid fa-scroll"></i> Drafts:</strong> ${state.drafts}</div>
    <div><strong><i class="fa-solid fa-book"></i> Publications:</strong> ${(state.papers || []).length}</div>
    <div><strong><i class="fa-brands fa-mendeley"></i> Citations:</strong> ${Math.floor(state.citations)}</div>

    <div><strong><i class="fa-solid fa-h"></i>-Index:</strong> ${state.hIndex}</div>
    <div><strong><i class="fa-solid fa-monument"></i>  Landmarks</strong> ${state.landmarksCompleted}</div>
    <div><!--<i class="fa-brands fa-google-scholar"></i>--></div>
  `;

  // CV
  hudCV.innerHTML = `
    <div><strong><i class="fa-solid fa-graduation-cap"></i> Level:</strong> ${levelName()}</div>
    <div><strong>Next:</strong> ${nextLevel ? nextLevel.label : "—"}</div>

    ${curLevel?.tip ? `<div style="margin-top:6px; font-style:italic;">${curLevel.tip}</div>` : ""}

    ${
      req
        ? `<div style="margin-top:6px;">
             Needs:<br>
             knowledge &ge; ${req.k},<br>
             draftsEver &ge; ${req.d},<br>
             publications &ge; ${req.p},<br>
             citations &ge; ${req.c},<br>
             h-index &ge; ${req.h ?? 0},<br>
             landmarks &ge; ${req.l}
           </div>`
        : `<div style="margin-top:6px;">You are at the final level.</div>`
    }

    <div style="margin-top:8px;"><strong><i class="fa-solid fa-school-flag"></i> SAT (superscore):</strong>
      Math ${state.satMath ?? "—"} / Verbal ${state.satVerbal ?? "—"} / Total ${satTotal() || "—"}
    </div>

    ${
      state.levelIndex === 0
        ? `<div><strong><i class="fa-solid fa-list-check"></i> SAT Attempts:</strong>
             ${state.satAttemptsUsed} / ${satAttemptsMax()}
           </div>`
        : ""
    }

    <div style="margin-top:8px;"><strong><i class="fa-solid fa-clipboard-check"></i> GRE (superscore):</strong>
      Quant ${state.greQuant ?? "—"} / Verbal ${state.greVerbal ?? "—"} / Total ${greTotal() || "—"}
    </div>

    ${
      state.levelIndex === 1
        ? `<div><strong><i class="fa-solid fa-list-check"></i> GRE Attempts:</strong>
             ${state.greAttemptsUsed} / ${greAttemptsMax()}
           </div>`
        : ""
    }

    <div><strong><i class="fa-solid fa-building-columns"></i> University Prestige:</strong>
      ${state.universityPrestige} / 100
    </div>

    <div><strong><i class="fa-solid fa-trophy"></i> College Accepted:</strong> ${
      state.collegeAccepted ? "Yes" : "No"
    }</div>

    <div><strong><i class="fa-solid fa-trophy"></i> Master's Accepted:</strong> ${
      state.mastersAccepted ? "Yes" : "No"
    }</div>

    <div><strong><i class="fa-solid fa-bookmark"></i> Major:</strong> ${
      state.identity.major
    }</div>
  `;

  // OTHER (traits visibility ladder)
  const vis = state.traits?.visibility || "hidden";
  const showTraits = vis !== "hidden";
  const showValues = vis === "values";

  hudOther.innerHTML = `
    ${
      sgTier
        ? `<div style="margin-top:8px;">
             <button id="join_study_group">Join Study Group (${sgTier})</button>
           </div>`
        : ""
    }

    ${
      showTraits
        ? `<div style="margin-top:10px; border-top:1px dashed #999; padding-top:6px;">
             <strong>Traits</strong><br>
             IQ: ${showValues ? state.traits.iq : "—"}<br>
             Conscientiousness: ${showValues ? state.traits.conscientiousness : "—"}<br>
             Agreeableness: ${showValues ? state.traits.agreeableness : "—"}<br>
             Neuroticism: ${showValues ? state.traits.neuroticism : "—"}<br>
             Openness: ${showValues ? state.traits.openness : "—"}<br>
             Extraversion: ${showValues ? state.traits.extraversion : "—"}<br>
             SES: ${showValues ? state.traits.ses : "—"}
           </div>`
        : ""
    }
  `;
}
