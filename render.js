// render.js — all DOM updates live here
// Reads from state and content. Never modifies state.
// Called after every action and every tick.

"use strict";

function render() {
  renderEnergy();
  renderCurrentStats();
  renderCV();
  renderButtons();
  renderLandmark();
  renderLabAndNews();
  renderDevInspector();   // no-op unless the dev modal is open
}

// ── Energy bar ────────────────────────────────────────────────────────
function renderEnergy() {
  const bar      = document.getElementById("barInner");
  const label    = document.getElementById("barLabel");
  const burnout  = document.getElementById("burnoutLabel");
  const energyUI = document.getElementById("energyUI");

  if (!bar) return;

  const cooling = inCooldown();

  if (cooling) {
    const remaining = Math.ceil((state.cooldownUntil - Date.now()) / 1000);
    bar.style.width      = "100%";
    bar.style.background = "linear-gradient(to bottom, #8b0000, #5c0000)";
    bar.style.opacity    = "0.7";
    if (burnout) {
      burnout.style.opacity = "1";
      burnout.innerHTML = `<i class="fa-solid fa-fire"></i> BURNOUT — ${remaining}s`;
    }
    if (energyUI) energyUI.classList.add("burnout");
    if (label) label.textContent = "";
  } else {
    const pct = clamp((state.energy / ENERGY_MAX) * 100, 0, 100);
    bar.style.width      = pct + "%";
    bar.style.background = "linear-gradient(to bottom, #4f4b44, #2f2c27)";
    bar.style.opacity    = "1";
    if (burnout) {
      burnout.style.opacity = "0";
      burnout.innerHTML = `<em><i class="fa-solid fa-fire"></i> BURNOUT</em>`;
    }
    if (energyUI) energyUI.classList.remove("burnout");
    if (label) label.innerHTML =
      `<i class="fa-solid fa-bed"></i> Energy: ${Math.floor(state.energy)} / ${ENERGY_MAX}`;
  }
}

// ── Current Stats panel ───────────────────────────────────────────────
function renderCurrentStats() {
  const el = document.getElementById("hud_current");
  if (!el) return;

  const hIdx    = calcHIndex();
  const cites   = calcTotalCitations();

  // Study gain previews
  const tGain   = (TEXTBOOK_STUDY_GAIN * (state.modifiers?.knowledgeMult ?? 1)).toFixed(1);
  const draftScale = 1 + 0.6 * Math.sqrt(state.totalDraftsEver ?? 0);
  const pGain   = ((state.knowledgePerStudy ?? 1)
                  * draftScale
                  * (state.modifiers?.paperMult     ?? 1)
                  * (state.modifiers?.knowledgeMult ?? 1)).toFixed(1);

  el.innerHTML = `
    <div><strong><i class="fa-solid fa-brain"></i> Knowledge:</strong> ${Math.floor(state.knowledge)}</div>
    <div><strong><i class="fa-solid fa-pen-fancy"></i> Write Cost:</strong> ${writeCost()} knowledge</div>
    <div><strong><i class="fa-solid fa-book-open"></i> Textbook Study:</strong> +${tGain} knowledge (cost: ${TEXTBOOK_ENERGY_COST} energy)</div>
    <div><strong><i class="fa-solid fa-glasses"></i> Paper Reading:</strong> +${pGain} knowledge (cost: ${PAPER_ENERGY_COST} energy)</div>
    <div><strong><i class="fa-solid fa-scroll"></i> Drafts:</strong> ${Math.floor(state.drafts)}</div>
    <div><strong><i class="fa-solid fa-book"></i> Publications:</strong> ${state.publications}</div>
    <div><strong><i class="fa-brands fa-mendeley"></i> Citations:</strong> ${cites}</div>
    <div><strong><i class="fa-solid fa-h"></i>-Index:</strong> ${hIdx}</div>
    <div><strong><i class="fa-solid fa-monument"></i> Landmarks:</strong> ${state.landmarksCompleted}</div>
    ${renderMoneyLines()}
    ${renderTenureClockLine()}
  `;
}

function renderMoneyLines() {
  const money   = state.money ?? 0;
  const salary  = annualSalary();
  const perCred = tuitionPerCredit();
  let html = `<div style="margin-top:6px;"><strong><i class="fa-solid fa-wallet"></i> Money:</strong>
    <span style="${money < 0 ? "color:#c0392b;" : ""}">${money < 0 ? "−" : ""}$${fmtMoney(Math.abs(money))}</span></div>`;
  if (salary)  html += `<div><strong><i class="fa-solid fa-money-check"></i> Salary:</strong> $${fmtMoney(salary)}/yr</div>`;
  if (perCred) html += `<div><strong><i class="fa-solid fa-receipt"></i> Tuition:</strong> $${fmtMoney(tuitionSplit(perCred).you)} per draft (your share)</div>`;
  if (state.debt > 0) {
    const stress = Math.round(debtStress() * 100);
    html += `<div><strong><i class="fa-solid fa-file-invoice-dollar"></i> Student Debt:</strong> $${fmtMoney(state.debt)}
      ${stress ? `<span style="opacity:0.7;">(−${stress}% energy regen)</span>` : ""}</div>`;
  }
  return html;
}

function renderTenureClockLine() {
  const year = tenureClockYear();
  if (year == null) return "";
  const secs  = Math.ceil((state.timers.tenureClock ?? 0) * TICK_MS / 1000);
  const mmss  = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
  const final = year === TENURE_CLOCK_YEARS;
  return `<div style="margin-top:6px;${final ? " color:#c0392b; font-weight:bold;" : ""}">
    <strong><i class="fa-solid fa-hourglass-half"></i> Tenure Clock:</strong> Year ${year} of ${TENURE_CLOCK_YEARS} (${mmss} left)</div>`;
}

// Lab roster and recent news, in the Actions panel
function renderLabAndNews() {
  const el = document.getElementById("hud_other");
  if (!el) return;
  let html = "";

  const lab = state.gradStudents ?? [];
  if (gradSlots() > 0 || lab.length || state.alumni) {
    html += `<div style="margin-top:10px;"><strong><i class="fa-solid fa-flask"></i> Lab</strong>
      (${lab.length}/${gradSlots()}${state.alumni ? `, ${state.alumni} alumni` : ""})</div>`;
    for (const g of lab) {
      const year = Math.floor(g.ageTicks / ticksPerYear()) + 1;
      html += `<div style="margin-left:10px;">${g.name}, year ${year}: ${g.quirk}. <em>${gradMoraleLabel(g.morale)}</em></div>`;
    }
  }

  if (state.news?.length) {
    html += `<div style="margin-top:10px;"><strong><i class="fa-solid fa-bullhorn"></i> News</strong></div>`;
    state.news.forEach((line, i) => {
      html += `<div style="margin-left:10px; opacity:${Math.max(0.35, 1 - i * 0.13)};">${line}</div>`;
    });
  }
  el.innerHTML = html;
}

function renderNextLevelHint() {
  // Intentionally unused — tip now lives in CV panel
}

// ── CV panel ──────────────────────────────────────────────────────────
function renderCV() {
  const el = document.getElementById("hud_cv");
  if (!el) return;

  const cv       = state.cv;
  const curLevel = window.LEVELS?.[state.levelIndex];
  const nextLevel = window.LEVELS?.[state.levelIndex + 1];
  const req      = nextLevel?.req ?? null;

  const satSections = state.tests?.sat?.sections ?? {};
  const greSections = state.tests?.gre?.sections ?? {};
  const satTot = testTotal("sat");
  const greTot = testTotal("gre");

  let html = `
    <div><strong><i class="fa-solid fa-graduation-cap"></i> Level:</strong> ${currentLevelLabel()}</div>
    <div><strong>Next:</strong> ${nextLevel ? nextLevel.label : "—"}</div>
    ${curLevel?.tip ? `<div style="margin-top:6px; font-style:italic;">${curLevel.tip}</div>` : ""}
  `;

  if (req) {
    html += `
      <div style="margin-top:6px;">
        <strong>Needs:</strong><br>
        <i class="fa-solid fa-brain"></i> &ge; ${req.k},
        <i class="fa-solid fa-scroll"></i> &ge; ${req.d},
        <i class="fa-solid fa-book"></i> &ge; ${req.p},
        <i class="fa-brands fa-mendeley"></i> &ge; ${req.c},
        <i class="fa-solid fa-h"></i> &ge; ${req.h ?? 0},
        <i class="fa-solid fa-monument"></i> &ge; ${req.l}
      </div>
    `;
  } else {
    html += `<div style="margin-top:6px;">You are at the final level.</div>`;
  }

  // SAT
  html += `
    <div style="margin-top:8px;">
      <strong><i class="fa-solid fa-school-flag"></i> SAT (superscore):</strong>
      Math ${satSections.math ?? "—"} / Verbal ${satSections.verbal ?? "—"} / Total ${satTot || "—"}
    </div>
  `;
  if (state.levelIndex === 0) {
    html += `<div><strong><i class="fa-solid fa-list-check"></i> SAT Attempts:</strong>
      ${state.tests.sat.attemptsUsed ?? 0} / ${testAttemptsMax("sat")}
    </div>`;
  }

  // GRE
  html += `
    <div style="margin-top:4px;">
      <strong><i class="fa-solid fa-clipboard-check"></i> GRE (superscore):</strong>
      Quant ${greSections.quant ?? "—"} / Verbal ${greSections.verbal ?? "—"} / Total ${greTot || "—"}
    </div>
  `;
  if (state.levelIndex === 1) {
    html += `<div><strong><i class="fa-solid fa-list-check"></i> GRE Attempts:</strong>
      ${state.tests.gre.attemptsUsed ?? 0} / ${testAttemptsMax("gre")}
    </div>`;
  }

  // Prestige, acceptance, major
  html += `
    ${state.cv?.universityName ? `<div><strong><i class="fa-solid fa-landmark"></i> Institution:</strong> ${state.cv.universityName}</div>` : ""}
    <div><strong><i class="fa-solid fa-building-columns"></i> University Prestige:</strong> ${state.universityPrestige} / 100</div>
    <div><strong><i class="fa-solid fa-trophy"></i> College Accepted:</strong> ${collegeStatusLabel()}</div>
    <div><strong><i class="fa-solid fa-trophy"></i> Master's Accepted:</strong> ${testTotal("gre") >= (window.TESTS?.gre?.scoring?.acceptTotal ?? 310) ? "Yes" : "No"}</div>
    <div><strong><i class="fa-solid fa-bookmark"></i> Major:</strong> ${window.MAJORS?.[state.affiliations?.major]?.label ?? "undeclared"}</div>
  `;

  // Identity stats (only visible if therapy has been unlocked)
  if (state.flags?.therapyUnlocked) {
    const id = state.identity || {};
    html += `
      <div style="margin-top:8px;">
        <strong><i class="fa-solid fa-person"></i> Character:</strong><br>
        <div style="padding-left:8px; font-size:0.9em;">
          Network: ${id.network ?? 0}<br>
          Resilience: ${id.resilience ?? 0}<br>
          Ambition: ${id.ambition ?? 0}<br>
          Reputation: ${id.reputation ?? 0}
        </div>
      </div>
    `;
  }

  // Landmarks
  if (cv.landmarks?.length > 0) {
    html += `<div style="margin-top:8px;"><strong><i class="fa-solid fa-monument"></i> Landmarks:</strong></div>`;
    for (const lm of cv.landmarks) {
      const def = window.LANDMARKS?.[lm.type];
      html += `<div style="padding-left:8px;">— ${def?.label ?? lm.type}${lm.title ? `: <em>${lm.title}</em>` : ""}</div>`;
    }
  }

  el.innerHTML = html;
}

function collegeStatusLabel() {
  if (state.levelIndex >= 1 || state.flags?.appliedToCollege) return "Yes";
  const qualifies = testTotal("sat") >= (window.TESTS?.sat?.scoring?.acceptTotal ?? 1200);
  return qualifies ? "Not yet applied" : "No";
}

// ── Landmark progress bar ─────────────────────────────────────────────
// No buttons of its own: the bar fills from the footer actions listed in
// def.progressSources. The sources row shows which ones, and how much each adds.
function renderLandmark() {
  const el = document.getElementById("hud_landmark");
  if (!el) return;

  const def = activeLandmarkDef();
  if (!def) {
    el.style.display = "none";
    return;
  }

  el.style.display = "block";
  const progress  = state.landmarkProgress;
  const pct       = clamp((progress / def.totalProgress) * 100, 0, 100);
  const { phase } = currentLandmarkPhase(def, progress);
  const mult      = landmarkProgressMult(def);

  const sources = Object.entries(def.progressSources ?? {})
    .filter(([actionId]) => isVisible(window.ACTIONS?.[actionId]))
    .map(([actionId, gain]) => {
      const action = window.ACTIONS?.[actionId];
      const icon   = action?.icon ? `<i class="fa-solid ${action.icon}"></i> ` : "";
      return `<span class="landmark-source" title="${action?.label ?? actionId}">${icon}+${(gain * mult).toFixed(1)}</span>`;
    })
    .join("");

  el.innerHTML = `
    <div class="landmark-label">${def.label}: <em>${phase?.label ?? ""}</em></div>
    <div class="landmark-bar-outer">
      <div class="landmark-bar-inner" style="width:${pct}%"></div>
    </div>
    <div class="landmark-description">${phase?.description ?? ""}</div>
    <div class="landmark-sources">
      <span>${Math.floor(progress)} / ${def.totalProgress}</span>
      <span>${sources}</span>
    </div>
  `;
}

// ── Action buttons ────────────────────────────────────────────────────
// All buttons are rendered dynamically based on visibleWhen(state).
// The footer buttons (study, write) are hardwired in HTML but disabled/enabled here.
// Test buttons, publish buttons, affiliation buttons rendered into panel_other.

function renderButtons() {
  renderFooterButtons();
  renderTestButtons();
  renderPanelActions();
  renderPublishButtons();
  renderAffiliationButtons();
  renderSportButtons();
  renderPerkButtons();
}

function renderFooterButtons() {
  const cooling = inCooldown();
  setButton("study_textbooks", isVisible(ACTIONS.study_textbooks), !cooling && ACTIONS.study_textbooks.canDo(state).ok);
  setButton("study_papers",    isVisible(ACTIONS.study_papers),    !cooling && ACTIONS.study_papers.canDo(state).ok);
  setButton("write",           isVisible(ACTIONS.write),           !cooling && ACTIONS.write.canDo(state).ok);
}

function renderTestButtons() {
  const cooling = inCooldown();
  for (const [testId, def] of Object.entries(window.TESTS ?? {})) {
    const visible = isVisible(def);
    for (const section of (def.sections ?? [])) {
      const btnId = `${testId}_${section.id}`;
      let btn = document.getElementById(btnId);
      if (!btn) {
        btn = document.createElement("button");
        btn.id = btnId;
        document.getElementById("panel_other")?.appendChild(btn);
      }
      btn.textContent   = section.label;
      btn.style.display = visible ? "" : "none";
      btn.disabled      = cooling || !canTakeTest(testId);
    }
  }
}

// Actions marked placement: "panel" get a button in the Actions panel.
// Disabled buttons say why, since tooltips don't exist on phones.
function renderPanelActions() {
  const container = document.getElementById("panel_other");
  if (!container) return;
  for (const [id, action] of Object.entries(window.ACTIONS ?? {})) {
    if (action.placement !== "panel") continue;
    const elId = `act_${id}`;
    let btn = document.getElementById(elId);
    if (!btn) {
      btn = document.createElement("button");
      btn.id = elId;
      container.appendChild(btn);
    }
    const visible = isVisible(action);
    btn.style.display = visible ? "" : "none";
    if (!visible) continue;

    const wait   = Math.ceil(actionCooldownLeft(id) / 1000);
    const check  = wait > 0 ? { ok: false, reason: `ready in ${wait}s` }
                            : (action.canDo?.(state) ?? { ok: true });
    const energy = typeof action.cost === "function"
      ? Math.abs((action.cost(state) ?? []).find?.(d => d.path === "energy")?.value ?? 0)
      : action.cost?.energy;
    const extras = [energy ? `${energy} energy` : "", action.detail?.(state) ?? ""].filter(Boolean).join(", ");
    const icon   = action.icon ? `<i class="fa-solid ${action.icon}"></i> ` : "";
    btn.innerHTML = check.ok
      ? `${icon}${action.label}${extras ? ` (${extras})` : ""}`
      : `${icon}${action.label} — ${check.reason}`;
    btn.title    = (typeof action.blurb === "function" ? action.blurb(state) : action.blurb) ?? "";
    btn.disabled = !check.ok || inCooldown();
  }
}

function renderPublishButtons() {
  const container = document.getElementById("pubUI");
  if (!container) return;

  const anyVisible = isVisible(ACTIONS.publish);
  container.style.display = anyVisible ? "" : "none";
  if (!anyVisible) return;

  const cooling = inCooldown();
  const types = Object.keys(PUB_COST);
  for (const type of types) {
    let btn = document.getElementById(`pub_${type}`);
    if (!btn) {
      btn = document.createElement("button");
      btn.id = `pub_${type}`;
      container.appendChild(btn);
    }
    const cost    = PUB_COST[type];
    const check   = ACTIONS.publish.canDo(state, { type });
    const visible = type !== "monograph" || state.levelIndex >= MONOGRAPH_UNLOCK_LEVEL;
    btn.textContent   = `${type.charAt(0).toUpperCase() + type.slice(1)} (${cost.drafts}d${cost.knowledge ? " / " + cost.knowledge + "k" : ""})`;
    btn.style.display = visible ? "" : "none";
    btn.disabled      = cooling || !check.ok;
    btn.title         = cooling ? "Recovering from burnout." : (check.reason ?? "");
  }
}

function renderAffiliationButtons() {
  const container = document.getElementById("panel_other");
  if (!container) return;

  // Clubs
  for (const [id, club] of Object.entries(window.CLUBS ?? {})) {
    const elId = `club_${id}`;
    let btn = document.getElementById(elId);
    if (!btn) {
      btn = document.createElement("button");
      btn.id = elId;
      container.appendChild(btn);
    }
    const visible = isVisible(club);
    btn.style.display = visible ? "" : "none";
    btn.textContent   = club.label;
    btn.title         = club.blurb;
    btn.disabled      = !!state.affiliations[club.slot ?? "club"];
  }

  // Majors
  for (const [id, major] of Object.entries(window.MAJORS ?? {})) {
    const elId = `major_${id}`;
    let btn = document.getElementById(elId);
    if (!btn) {
      btn = document.createElement("button");
      btn.id = elId;
      container.appendChild(btn);
    }
    const visible = isVisible(major);
    btn.style.display = visible ? "" : "none";
    btn.textContent   = major.label;
    btn.title         = major.blurb;
    btn.disabled      = !!state.affiliations.major;
  }
}

function renderSportButtons() {
  const container = document.getElementById("panel_other");
  if (!container) return;

  for (const [id, sport] of Object.entries(window.SPORTS ?? {})) {
    const elId = `sport_${id}`;
    let btn = document.getElementById(elId);
    if (!btn) {
      btn = document.createElement("button");
      btn.id = elId;
      container.appendChild(btn);
    }
    const visible = isVisible(sport);
    btn.style.display = visible ? "" : "none";
    btn.textContent   = sport.label;
    btn.title         = sport.blurb;
    btn.disabled      = !!state.affiliations.hs_sport;
  }
}

function renderPerkButtons() {
  const container = document.getElementById("panel_other");
  if (!container) return;

  for (const [id, perk] of Object.entries(window.PERKS ?? {})) {
    const elId = `perk_${id}`;
    let btn = document.getElementById(elId);
    if (!btn) {
      btn = document.createElement("button");
      btn.id = elId;
      container.appendChild(btn);
    }
    const visible  = isVisible(perk);
    const unlocked = !!state.perks[id];
    btn.style.display = visible ? "" : "none";

    if (perk.category === "foundational_text") {
      const icon = `<i class="fa-solid fa-book-open"></i>`;
      btn.innerHTML = unlocked
        ? `✓ ${perk.label} — ${perk.author}`
        : `${icon} ${perk.label} — ${perk.author} (50 energy)`;
    } else if (perk.milestone) {
      const e = perk.cost?.energy ?? 0;
      btn.textContent = unlocked ? `✓ ${perk.label}` : `✦ ${perk.label}${e ? ` (${e} energy)` : ""}`;
    } else {
      btn.textContent = unlocked ? `✓ ${perk.label}` : perk.label;
    }

    btn.title    = perk.blurb;   // hover tooltip
    btn.disabled = unlocked || inCooldown() || !canAffordPerk(perk);
  }
}

function canAffordPerk(perk) {
  const c = perk.cost || {};
  return (c.energy    ?? 0) <= state.energy
      && (c.knowledge ?? 0) <= state.knowledge
      && (c.drafts    ?? 0) <= state.drafts;
}

// ── Dev inspector (🧠 button) ──────────────────────────────────────────
// Live view of hidden state while the modal is open. Remove before shipping.
function renderDevInspector() {
  const modal   = document.getElementById("traitsModal");
  const content = document.getElementById("traitsContent");
  if (!modal || !content || modal.style.display === "none") return;

  const pad  = (x, n) => String(x).padEnd(n);
  const lpad = (x, n) => String(x).padStart(n);
  const fmt  = (v) => typeof v === "number" && !Number.isInteger(v) ? v.toFixed(3) : v;
  const lines = [];

  lines.push("=== TRAITS ===");
  for (const [k, v] of Object.entries(state.traits || {})) lines.push(`${pad(k, 18)} ${v}`);

  lines.push("", "=== IDENTITY ===");
  for (const [k, v] of Object.entries(state.identity || {})) lines.push(`${pad(k, 18)} ${v}`);

  lines.push("", "=== PRESTIGE ===");
  lines.push(`${pad("universityPrestige", 18)} ${state.universityPrestige}`);
  lines.push(`${pad("hsPrestige", 18)} ${state.hsPrestige ?? 0}  (added to SAT prestige at admission)`);

  lines.push("", "=== MONEY ===");
  lines.push(`${pad("money", 18)} $${fmtMoney(state.money ?? 0)}`);
  lines.push(`${pad("debt", 18)} $${fmtMoney(state.debt ?? 0)}  (stress −${(debtStress() * 100).toFixed(1)}% regen)`);
  lines.push(`${pad("salary", 18)} $${fmtMoney(annualSalary())}/yr`);
  if (tuitionPerCredit()) {
    const sp = tuitionSplit(1);
    lines.push(`${pad("tuition/credit", 18)} $${fmtMoney(tuitionPerCredit())}  family ${(sp.family * 100).toFixed(0)}% / aid ${(sp.aid * 100).toFixed(0)}% / you ${(sp.you * 100).toFixed(0)}%`);
  }
  lines.push(`${pad("university", 18)} ${state.cv?.universityName ?? "—"} (tier ${universityTier()})`);
  lines.push(`${pad("grant odds", 18)} ${(grantChance() * 100).toFixed(1)}%`);
  lines.push(`${pad("editorGoodwill", 18)} ${state.editorGoodwill ?? 0}`);
  for (const [k, v] of Object.entries(state.stats || {})) lines.push(`${pad(k, 18)} ${fmt(v)}`);

  lines.push("", "=== TENURE & LAB ===");
  lines.push(`${pad("tenure clock", 18)} ${tenureClockYear() == null ? "off" : `year ${tenureClockYear()}, ${Math.ceil(state.timers.tenureClock / 10)}s left`}`);
  lines.push(`${pad("grad students", 18)} ${(state.gradStudents ?? []).map(g => `${g.name} (morale ${g.morale.toFixed(2)}, paper ${(g.progress * 100).toFixed(0)}%)`).join(", ") || "none"}`);
  lines.push(`${pad("alumni", 18)} ${state.alumni ?? 0}`);
  lines.push(`${pad("steal caught odds", 18)} ${(stealCaughtChance() * 100).toFixed(0)}%`);

  lines.push("", "=== MODIFIERS ===");
  for (const [k, v] of Object.entries(state.modifiers || {})) {
    if (typeof v === "object") lines.push(`${pad(k, 18)} ${Object.entries(v).map(([t, x]) => `${t[0]}:${fmt(x)}`).join(" ")}`);
    else                       lines.push(`${pad(k, 18)} ${fmt(v)}`);
  }

  lines.push("", "=== PAPERS ===");
  lines.push(`${pad("tier", 16)}${lpad("papers", 7)}${lpad("cites", 7)}  first cite`);
  (state.papers?.tiers ?? []).forEach((hist, t) => {
    const n     = hist.reduce((a, b) => a + b, 0);
    const cites = hist.reduce((a, b, c) => a + b * c, 0);
    const eta   = Math.round(1 / citationChance(t, 0) / (1000 / TICK_MS));
    lines.push(`${pad(PAPER_TIERS[t]?.label ?? t, 16)}${lpad(n, 7)}${lpad(cites, 7)}  ~${eta}s`);
  });
  const last = state.papers?.lastTier;
  lines.push(`last paper: ${last == null ? "—" : PAPER_TIERS[last]?.label}`);
  lines.push(`h-index ${calcHIndex()} · citations ${calcTotalCitations()} · pubs ${calcTotalPapers()}`);

  lines.push("", "=== MILESTONES ===");
  const counter  = state.timers?.draftsSinceMilestone ?? 0;
  const interval = window.MILESTONE_DRAFT_INTERVAL?.[state.levelIndex];
  lines.push(`drafts since last: ${counter}${interval ? ` / ${interval}` : " (no events at this level)"}`);
  lines.push(`on offer: ${state.selectedMilestoneEvent ?? "—"}`);
  const pool = Object.keys(window.PERKS ?? {}).filter(id => milestoneEligible(state, id));
  lines.push(`eligible now: ${pool.length ? pool.join(", ") : "—"}`);

  lines.push("", "=== FLAGS ===");
  for (const [k, v] of Object.entries(state.flags || {})) lines.push(`${pad(k, 24)} ${v}`);

  content.textContent = lines.join("\n");
}

// ── Utility ───────────────────────────────────────────────────────────
function setButton(id, visible, enabled) {
  const btn = document.getElementById(id);
  if (!btn) return;
  btn.style.display = visible ? "" : "none";
  btn.disabled      = !enabled;
}