// events.js — button wiring
// Footer buttons (always in DOM) use direct on() wiring.
// All dynamic buttons (tests, publish, clubs, majors, perks, landmarks)
// use event delegation on their container so wiring survives re-renders.

"use strict";

function wireEvents() {

  // ── Footer buttons — always in DOM at startup ───────────────────────
  on("study_textbooks", () => doAction("study_textbooks"));
  on("study_papers",    () => doAction("study_papers"));
  on("write",           () => doAction("write"));
  on("dev_reset",       () => { if (confirm("Reset all progress?")) resetGame(); });
  on("dev_traits",      () => toggleTraitsModal());
  on("closeTraitsModal", () => toggleTraitsModal());
  on("dev_toggle_therapy", () => toggleTherapyFlag());
  // Playtest helpers: skip a tenure year; fund a lab
  on("dev_tenure_year", () => {
    if (state.timers.tenureClock != null) state.timers.tenureClock = Math.max(1, state.timers.tenureClock - ticksPerYear());
    render();
  });
  on("dev_add_money", () => { state.money += 100000; render(); });

  // ── panel_other — all dynamic buttons via delegation ────────────────
  // Tests, publish, clubs, sports, majors, perks, landmarks all live here.
  document.getElementById("panel_other")?.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn || btn.disabled) return;
    const id = btn.id;

    // Tests: sat_math, sat_verbal, gre_quant, gre_verbal
    for (const [testId, def] of Object.entries(window.TESTS ?? {})) {
      for (const section of (def.sections ?? [])) {
        if (id === `${testId}_${section.id}`) {
          takeTest(testId, section.id);
          tryLevelUp();
          render();
          return;
        }
      }
    }

    // Panel actions: act_<actionId> (e.g. act_apply_college)
    for (const actionId of Object.keys(window.ACTIONS ?? {})) {
      if (id === `act_${actionId}`) {
        doAction(actionId);
        return;
      }
    }

    // Publish: pub_conference, pub_journal, pub_chapter, pub_monograph
    for (const type of Object.keys(window.PUB_COST ?? {})) {
      if (id === `pub_${type}`) {
        doAction("publish", { type });
        return;
      }
    }

    // Clubs
    for (const clubId of Object.keys(window.CLUBS ?? {})) {
      if (id === `club_${clubId}`) {
        joinAffiliation(window.CLUBS, clubId);
        render();
        return;
      }
    }

    // Majors
    for (const majorId of Object.keys(window.MAJORS ?? {})) {
      if (id === `major_${majorId}`) {
        joinAffiliation(window.MAJORS, majorId);
        render();
        return;
      }
    }

    // Sports
    for (const sportId of Object.keys(window.SPORTS ?? {})) {
      if (id === `sport_${sportId}`) {
        joinAffiliation(window.SPORTS, sportId);
        render();
        return;
      }
    }

    // Perks
    for (const perkId of Object.keys(window.PERKS ?? {})) {
      if (id === `perk_${perkId}`) {
        unlockPerk(perkId);
        render();
        return;
      }
    }

    // Landmarks
    if (id === "landmark_start") {
      const landmarkId = btn.dataset?.landmarkId;
      if (landmarkId) { startLandmark(landmarkId); render(); }
      return;
    }
  });
}

// Convenience: attach click listener if element exists
function on(id, fn) {
  const el = document.getElementById(id);
  if (el) el.addEventListener("click", fn);
}
