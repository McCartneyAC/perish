// desk.js — the desk
//
// Every panel is a sheet of paper on a desk. Pick one up and move it, stack
// it on another, turn it by its dog-eared corner, fold it down to its title,
// pin it in place, or drop it on a folder to file it away. Drag the empty
// desk to look around it. The things you've bought sit on the desk too:
// the lamp, the globe, the cat. Click them.
//
// Pure UI: reads and rearranges the DOM, and only touches game state to
// count tidies and folders (for the distinctions) and to let you poke a
// prop. The layout lives under its own storage key, so resetting the game
// keeps your desk the way you left it (and "Tidy desk" puts it back).
//
// Papers are wrapped, not modified: the game can rewrite a panel's insides
// every tick and the paper's chrome (pin, fold, corner) survives, because it
// lives on the wrapper. A paper hides itself whenever the thing inside it is
// hidden (display:none), so the game keeps control of what's visible.

"use strict";

const DESK_KEY        = "polp_desk_v1";
const DESK_W          = 3000;
const DESK_H          = 2200;
const DESK_MIN_WIDTH  = 760;          // narrower than this: classic stacked layout
const DESK_DRAG_SLOP  = 5;            // px of movement before a press becomes a drag
const DESK_ZOOMS      = [0.5, 0.6, 0.75, 0.9, 1, 1.15];
const DESK_GAP        = 24;

// Papers the desk knows by name, in the order "Tidy desk" lays them out.
// Anything else that turns up (a .panel in #dashboard) is adopted too.
const DESK_ORDER = [
  "news_card", "panel_current", "panel_other", "panel_inbox", "hud_landmark", "panel_cv",
  "panel_advisor", "panel_routine", "panel_reading", "panel_skills", "panel_gazette",
  "panel_frameworks", "panel_lab", "panel_holdings", "panel_home", "panel_honors",
  "panel_scrapbook", "panel_lineage", "panel_paperwork"
];

// Things on a paper you can press without picking the paper up
const DESK_NO_DRAG = "button, a, input, select, textarea, label, summary, details, [contenteditable], .no-drag, .paper-dogear, .mail-body";

const Desk = {
  active:  false,
  layout:  null,
  papers:  new Map(),     // id → { wrap, inner }
  folders: new Map(),     // id → element
  props:   new Map(),     // perk id → element
  zTop:    10,
  els:     {},            // viewport, sizer, surface, tools
  _saveTimer: null
};
window.Desk = Desk;

// ── Persistence ───────────────────────────────────────────────────────
function deskDefaultLayout() {
  return { v: 1, mode: "desk", zoom: 1, scroll: { x: 0, y: 0 }, papers: {}, folders: [], nextFolder: 1, props: {} };
}

function deskLoad() {
  try {
    const raw = localStorage.getItem(DESK_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      if (saved && saved.v === 1) return Object.assign(deskDefaultLayout(), saved);
    }
  } catch (_) {}
  return deskDefaultLayout();
}

function deskSave() {
  clearTimeout(Desk._saveTimer);
  Desk._saveTimer = setTimeout(deskSaveNow, 300);
}

function deskSaveNow() {
  if (!Desk.layout) return;
  try { localStorage.setItem(DESK_KEY, JSON.stringify(Desk.layout)); } catch (_) {}
}

// ── Setup ─────────────────────────────────────────────────────────────
function deskWanted() {
  const layout = Desk.layout ?? deskLoad();
  return layout.mode !== "classic" && (window.innerWidth ?? 1024) >= DESK_MIN_WIDTH;
}

function initDesk() {
  Desk.layout = deskLoad();
  buildDeskTools();
  if (!deskWanted()) {
    document.body.classList.add("classic-mode");
    return false;
  }

  const dashboard = document.getElementById("dashboard");
  if (!dashboard) return false;

  document.body.classList.add("desk-mode");

  // viewport (scrolls) > sizer (scaled size) > surface (#dashboard, unscaled)
  const viewport = document.createElement("div");
  viewport.id = "desk_viewport";
  const sizer = document.createElement("div");
  sizer.id = "desk_sizer";
  dashboard.parentNode.insertBefore(viewport, dashboard);
  viewport.appendChild(sizer);
  sizer.appendChild(dashboard);
  dashboard.classList.add("desk-surface");
  Desk.els = Object.assign(Desk.els, { viewport, sizer, surface: dashboard });

  deskScan();
  for (const f of Desk.layout.folders) deskBuildFolder(f);
  deskApplyZoom(Desk.layout.zoom, false);

  // First visit: lay the papers out in columns, then let go
  const placed = Object.keys(Desk.layout.papers).length > 0;
  if (!placed) {
    deskTidy({ initial: true, quiet: true });
    // Fonts and the first few papers arrive a beat later; straighten up again
    // once they have, unless you've already started moving things around
    const settle = () => { if (!Desk.touched) { deskSyncAll(); deskTidy({ initial: true, quiet: true }); } };
    document.fonts?.ready?.then(() => setTimeout(settle, 50));
    setTimeout(settle, 1500);
  } else deskSyncAll();

  viewport.scrollLeft = Desk.layout.scroll?.x ?? 0;
  viewport.scrollTop  = Desk.layout.scroll?.y ?? 0;

  wireDeskPointer();
  viewport.addEventListener("scroll", () => {
    Desk.layout.scroll = { x: viewport.scrollLeft, y: viewport.scrollTop };
    deskSave();
  }, { passive: true });

  Desk.active = true;
  return true;
}

// Toolbar in the header: tidy, new folder, zoom, classic view
function buildDeskTools() {
  const header = document.querySelector("header");
  if (!header || document.getElementById("desk_tools")) return;
  if ((window.innerWidth ?? 1024) < DESK_MIN_WIDTH) return;     // a phone gets the stacked layout, no desk tools
  const tools = document.createElement("div");
  tools.id = "desk_tools";
  const classic = (Desk.layout?.mode === "classic");
  tools.innerHTML = classic
    ? `<button type="button" data-desk="desk" title="Spread your papers out on a desk you can rearrange"><i class="fa-solid fa-table-cells-large"></i> Desk view</button>`
    : `<button type="button" data-desk="tidy" title="Straighten everything into neat piles"><i class="fa-solid fa-broom"></i> Tidy desk</button>
       <button type="button" data-desk="folder" title="Put a new folder on the desk; drop papers on it to file them"><i class="fa-solid fa-folder-plus"></i> New folder</button>
       <span class="desk-zoom">
         <button type="button" data-desk="zoom-out" title="Step back from the desk" aria-label="Zoom out"><i class="fa-solid fa-magnifying-glass-minus"></i></button>
         <button type="button" data-desk="zoom-in" title="Lean in" aria-label="Zoom in"><i class="fa-solid fa-magnifying-glass-plus"></i></button>
       </span>
       <button type="button" data-desk="classic" title="Stack the papers in fixed columns instead"><i class="fa-solid fa-table-columns"></i> Classic view</button>`;
  header.appendChild(tools);
  Desk.els.tools = tools;

  tools.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-desk]");
    if (!btn) return;
    const what = btn.dataset.desk;
    if (what === "tidy")     deskTidy();
    if (what === "folder")   deskNewFolder();
    if (what === "zoom-in")  deskStepZoom(+1);
    if (what === "zoom-out") deskStepZoom(-1);
    if (what === "classic" || what === "desk") deskSetMode(what);
  });
}

function deskSetMode(mode) {
  Desk.layout.mode = mode;
  deskSaveNow();
  saveGame();
  location.reload();
}

// Find papers: known ids, every .panel on the dashboard
function deskScan() {
  if (!Desk.els.surface) return;
  for (const id of DESK_ORDER) {
    const el = document.getElementById(id);
    if (el && !Desk.papers.has(id)) deskAdopt(el);
  }
  for (const el of Desk.els.surface.querySelectorAll(":scope > .panel")) deskAdopt(el);
}

function deskAdopt(inner) {
  if (!inner?.id || Desk.papers.has(inner.id)) return;
  if (inner.closest(".paper")) return;

  const wrap = document.createElement("div");
  wrap.className = "paper";
  wrap.dataset.paperId = inner.id;
  wrap.innerHTML = `
    <div class="paper-chrome">
      <button type="button" class="paper-tool" data-tool="pin" title="Pin it in place" aria-label="Pin"><i class="fa-solid fa-thumbtack"></i></button>
      <button type="button" class="paper-tool" data-tool="fold" title="Fold it down to its title" aria-label="Fold"><i class="fa-solid fa-chevron-up"></i></button>
    </div>
    <div class="paper-dogear" title="Drag to turn the page. Double-click to straighten it."></div>`;
  Desk.els.surface.appendChild(wrap);
  wrap.insertBefore(inner, wrap.firstChild);
  inner.classList.add("paper-sheet");
  inner.style.margin = "0";

  Desk.papers.set(inner.id, { wrap, inner });

  const saved = Desk.layout.papers[inner.id];
  if (saved) deskPlace(inner.id);
  else       wrap.classList.add("paper-unplaced");
}

// ── Visibility and placement ──────────────────────────────────────────
function deskInnerHidden(inner) {
  return inner.style.display === "none" || inner.hidden;
}

// Called after every render: adopt new papers, hide papers whose contents
// are hidden, and find a spot for any paper showing up for the first time.
function deskSyncAll() {
  if (!Desk.els.surface) return;
  deskScan();
  for (const [id, p] of Desk.papers) {
    const L      = Desk.layout.papers[id];
    const hidden = deskInnerHidden(p.inner);
    const filed  = !!L?.folder;
    const want   = hidden || filed;
    if (p.wrap.classList.contains("paper-hidden") !== want) p.wrap.classList.toggle("paper-hidden", want);
    if (!hidden && !L) deskPlaceNew(id);
  }
  deskSyncProps();
}

function deskPaperTitle(id) {
  const p = Desk.papers.get(id);
  const inner = p?.inner;
  if (!inner) return id;
  if (inner.dataset.paperTitle) return inner.dataset.paperTitle;
  const h = inner.querySelector("h2, .news-heading, .landmark-label");
  return (h?.textContent ?? id).trim().replace(/\s+/g, " ").slice(0, 40) || id;
}

function deskPlace(id) {
  const p = Desk.papers.get(id);
  const L = Desk.layout.papers[id];
  if (!p || !L) return;
  p.wrap.classList.remove("paper-unplaced");
  p.wrap.style.left      = `${Math.round(L.x)}px`;
  p.wrap.style.top       = `${Math.round(L.y)}px`;
  p.wrap.style.transform = `rotate(${(L.rot ?? 0).toFixed(2)}deg)`;
  p.wrap.style.zIndex    = String(L.z ?? 1);
  p.wrap.classList.toggle("paper-folded", !!L.folded);
  p.wrap.classList.toggle("paper-pinned", !!L.pinned);
  p.wrap.classList.toggle("paper-flipped", Math.abs(L.rot ?? 0) > 150);
  Desk.zTop = Math.max(Desk.zTop, L.z ?? 1);
}

// A new paper lands near the middle of what you're looking at, in the
// first gap big enough to hold it.
function deskPlaceNew(id) {
  const p = Desk.papers.get(id);
  if (!p) return;
  const w = p.wrap.offsetWidth  || 380;
  const h = p.wrap.offsetHeight || 240;
  const view = deskVisibleRect();
  const spot = deskFindGap(w, h, view) ?? { x: view.x + 40 + Math.random() * 80, y: view.y + 40 + Math.random() * 60 };
  Desk.layout.papers[id] = {
    x: spot.x, y: spot.y, rot: deskJitter(1.4), z: ++Desk.zTop,
    folded: false, pinned: false, folder: null
  };
  deskPlace(id);
  p.wrap.classList.add("paper-arrive");
  setTimeout(() => p.wrap.classList.remove("paper-arrive"), 900);
  deskSave();
}

function deskVisibleRect() {
  const v = Desk.els.viewport;
  const z = Desk.layout.zoom || 1;
  if (!v) return { x: 0, y: 0, w: 1200, h: 800 };
  return {
    x: v.scrollLeft / z, y: v.scrollTop / z,
    w: (v.clientWidth || 1200) / z, h: (v.clientHeight || 800) / z
  };
}

function deskOccupied() {
  const boxes = [];
  for (const [id, p] of Desk.papers) {
    const L = Desk.layout.papers[id];
    if (!L || L.folder || p.wrap.classList.contains("paper-hidden")) continue;
    boxes.push({ x: L.x, y: L.y, w: p.wrap.offsetWidth || 380, h: p.wrap.offsetHeight || 240 });
  }
  for (const f of Desk.layout.folders) boxes.push({ x: f.x, y: f.y, w: 190, h: 130 });
  return boxes;
}

function deskFindGap(w, h, view) {
  const boxes = deskOccupied();
  const hits  = (x, y) => boxes.some(b => x < b.x + b.w + 12 && x + w + 12 > b.x && y < b.y + b.h + 12 && y + h + 12 > b.y);
  const step  = 40;
  const x0 = Math.max(20, view.x + 20), y0 = Math.max(20, view.y + 20);
  for (let y = y0; y < y0 + view.h * 1.5; y += step) {
    for (let x = x0; x < x0 + Math.max(step, view.w - w); x += step) {
      if (x + w > DESK_W - 20 || y + h > DESK_H - 20) continue;
      if (!hits(x, y)) return { x, y };
    }
  }
  return null;
}

function deskJitter(max) { return (Math.random() * 2 - 1) * max; }

// ── Tidy: lay everything out in neat columns that fit the window ──────
function deskTidy({ initial = false, quiet = false } = {}) {
  const view   = deskVisibleRect();
  const width  = Math.max(900, view.w);
  const ids    = [...Desk.papers.keys()]
    .filter(id => !Desk.layout.papers[id]?.folder)
    .sort((a, b) => deskOrderIndex(a) - deskOrderIndex(b));

  // Shortest-column packing: each paper drops into the column with the most room
  const colW  = 400;
  const nCols = Math.max(1, Math.floor((width - DESK_GAP) / (colW + DESK_GAP)));
  const colY  = new Array(nCols).fill(initial ? 24 : view.y + 24);
  const left  = initial ? DESK_GAP : view.x + DESK_GAP;

  for (const id of ids) {
    const p = Desk.papers.get(id);
    const prev = Desk.layout.papers[id] ?? {};
    const visible = !deskInnerHidden(p.inner);
    if (!visible) { delete Desk.layout.papers[id]; p.wrap.classList.add("paper-hidden"); continue; }
    const h = p.wrap.offsetHeight || 260;
    const span = (p.wrap.offsetWidth || colW) > colW + DESK_GAP ? Math.min(nCols, 2) : 1;
    let best = 0;
    for (let c = 0; c + span <= nCols; c++) {
      const top = Math.max(...colY.slice(c, c + span));
      const bestTop = Math.max(...colY.slice(best, best + span));
      if (top < bestTop) best = c;
    }
    const y = Math.max(...colY.slice(best, best + span));
    Desk.layout.papers[id] = {
      x: left + best * (colW + DESK_GAP), y,
      rot: deskJitter(0.7), z: ++Desk.zTop,
      folded: !!prev.folded, pinned: !!prev.pinned, folder: null
    };
    for (let c = best; c < best + span; c++) colY[c] = y + h + DESK_GAP;
    deskPlace(id);
  }

  // Folders line up along the right-hand edge of the papers
  let fy = initial ? 24 : view.y + 24;
  const fx = left + nCols * (colW + DESK_GAP);
  for (const f of Desk.layout.folders) {
    f.x = Math.min(fx, DESK_W - 220); f.y = fy; f.rot = deskJitter(1.5);
    fy += 150;
    deskPlaceFolder(f);
  }
  // Props gather in a little still life beside the folders
  deskTidyProps(fx, fy + 20);
  if (!quiet) {
    state.counters.tidies = (state.counters.tidies ?? 0) + 1;
    if (state.counters.tidies === 1) pushNews("You tidy your desk. For a moment you are the kind of person who has a tidy desk.");
  }
  deskSave();
}

function deskOrderIndex(id) {
  const i = DESK_ORDER.indexOf(id);
  return i === -1 ? DESK_ORDER.length : i;
}

// ── Zoom ──────────────────────────────────────────────────────────────
function deskApplyZoom(z, keepCenter = true) {
  const { viewport, sizer, surface } = Desk.els;
  if (!surface) return;
  const old = Desk.layout.zoom || 1;
  let cx = 0, cy = 0;
  if (keepCenter && viewport) {
    cx = (viewport.scrollLeft + viewport.clientWidth  / 2) / old;
    cy = (viewport.scrollTop  + viewport.clientHeight / 2) / old;
  }
  Desk.layout.zoom = z;
  surface.style.transform = `scale(${z})`;
  sizer.style.width  = `${DESK_W * z}px`;
  sizer.style.height = `${DESK_H * z}px`;
  if (keepCenter && viewport) {
    viewport.scrollLeft = cx * z - viewport.clientWidth  / 2;
    viewport.scrollTop  = cy * z - viewport.clientHeight / 2;
  }
  deskSave();
}

function deskStepZoom(dir) {
  const cur = Desk.layout.zoom || 1;
  let i = DESK_ZOOMS.findIndex(z => Math.abs(z - cur) < 0.01);
  if (i === -1) i = DESK_ZOOMS.indexOf(1);
  const next = DESK_ZOOMS[Math.max(0, Math.min(DESK_ZOOMS.length - 1, i + dir))];
  if (next !== cur) deskApplyZoom(next);
}

// ── Folders ───────────────────────────────────────────────────────────
const FOLDER_NAMES = ["Later", "Read This Weekend", "Misc (Important)", "Revise & Resubmit", "Ideas (Bad)", "Ideas (Good?)", "Do Not Open", "Taxes, Probably", "FINAL_v3"];

function deskNewFolder() {
  const view = deskVisibleRect();
  const n = Desk.layout.nextFolder++;
  const spot = deskFindGap(200, 140, view) ?? { x: view.x + 60, y: view.y + 60 };
  const f = { id: `folder_${n}`, label: FOLDER_NAMES[(n - 1) % FOLDER_NAMES.length], x: spot.x, y: spot.y, rot: deskJitter(2), z: ++Desk.zTop, open: false };
  Desk.layout.folders.push(f);
  const el = deskBuildFolder(f);
  el.classList.add("paper-arrive");
  setTimeout(() => el.classList.remove("paper-arrive"), 900);
  deskSave();
  return f;
}

function deskBuildFolder(f) {
  const el = document.createElement("div");
  el.className = "folder";
  el.dataset.folderId = f.id;
  Desk.els.surface.appendChild(el);
  Desk.folders.set(f.id, el);
  deskPlaceFolder(f);
  return el;
}

function deskFolderPapers(folderId) {
  return Object.entries(Desk.layout.papers)
    .filter(([id, L]) => L.folder === folderId && Desk.papers.has(id))
    .map(([id]) => id);
}

function deskPlaceFolder(f) {
  const el = Desk.folders.get(f.id);
  if (!el) return;
  el.style.left      = `${Math.round(f.x)}px`;
  el.style.top       = `${Math.round(f.y)}px`;
  el.style.transform = `rotate(${(f.rot ?? 0).toFixed(2)}deg)`;
  el.style.zIndex    = String(f.z ?? 1);
  Desk.zTop = Math.max(Desk.zTop, f.z ?? 1);

  const inside = deskFolderPapers(f.id);
  el.classList.toggle("folder-open", !!f.open);
  el.classList.toggle("folder-empty", inside.length === 0);
  const list = inside.map(id =>
    `<li><button type="button" data-unfile="${id}" title="Take it out and put it on the desk">${escHTML(deskPaperTitle(id))}</button></li>`
  ).join("");
  setHTML(el, `
    <div class="folder-tab" title="Double-click to rename">${escHTML(f.label)}</div>
    <div class="folder-body">
      <div class="folder-count">${inside.length === 0 ? "Empty. Drop a paper here." : inside.length === 1 ? "1 paper" : `${inside.length} papers`}${inside.length ? ` · ${f.open ? "click to close" : "click to open"}` : ""}</div>
      ${f.open && inside.length ? `<ul class="folder-contents">${list}</ul>` : ""}
      ${inside.length === 0 ? `<button type="button" class="folder-discard" data-discard="${f.id}" title="Throw the folder away">Throw away</button>` : ""}
    </div>`);
}

function deskFolderById(id) { return Desk.layout.folders.find(f => f.id === id) ?? null; }

function deskFile(paperId, folderId) {
  const L = Desk.layout.papers[paperId];
  const f = deskFolderById(folderId);
  if (!L || !f) return false;
  L.folder = folderId;
  Desk.papers.get(paperId)?.wrap.classList.add("paper-hidden");
  deskPlaceFolder(f);
  state.counters.folders = (state.counters.folders ?? 0) + 1;
  deskSave();
  return true;
}

function deskUnfile(paperId) {
  const L = Desk.layout.papers[paperId];
  if (!L?.folder) return false;
  const f = deskFolderById(L.folder);
  L.folder = null;
  if (f) {
    L.x = Math.min(DESK_W - 400, f.x + 210);
    L.y = f.y + 10;
    L.rot = deskJitter(1.5);
    L.z = ++Desk.zTop;
    deskPlaceFolder(f);
  }
  const p = Desk.papers.get(paperId);
  if (p && !deskInnerHidden(p.inner)) p.wrap.classList.remove("paper-hidden");
  deskPlace(paperId);
  deskSave();
  return true;
}

function deskDiscardFolder(folderId) {
  if (deskFolderPapers(folderId).length) return false;
  Desk.layout.folders = Desk.layout.folders.filter(f => f.id !== folderId);
  Desk.folders.get(folderId)?.remove();
  Desk.folders.delete(folderId);
  deskSave();
  return true;
}

function deskRenameFolder(folderId) {
  const f = deskFolderById(folderId);
  if (!f) return;
  askText({ title: "Label this folder", value: f.label, maxLength: 28, yes: "Label it" }, (name) => {
    const t = String(name ?? "").trim();
    if (!t) return "A folder needs a label. Even \"Misc.\"";
    f.label = t.slice(0, 28);
    deskPlaceFolder(f);
    deskSave();
    return null;
  });
}

// ── Props: the things you bought, sitting on the desk ─────────────────
const GLOBE_CITIES = ["Ulaanbaatar", "Reykjavík", "Montevideo", "Tbilisi", "Ouagadougou", "Hobart", "Trondheim", "Valparaíso",
                      "Lviv", "Kyoto", "Bologna", "Leuven", "Salamanca", "Uppsala", "Coimbra", "Timbuktu", "Ithaca (the other one)"];

const PROP_POKES = {
  desk_lamp:          (el) => { el.classList.toggle("prop-lit"); return el.classList.contains("prop-lit") ? "Click. The circle of light makes the rest of the desk disappear." : "Click. The desk comes back."; },
  globe:              (el) => { el.classList.remove("prop-spin"); void el.offsetWidth; el.classList.add("prop-spin");
                                return `You spin the globe and stop it with a finger: ${pickOne(GLOBE_CITIES)}. You'll give a talk there someday, jet-lagged.`; },
  houseplant:         () => "You water Derrida. Derrida, as ever, defers.",
  used_laptop:        () => `${randInt(23, 61)} open tabs. One is a paper you opened in 2019. You'll read it someday.`,
  moka_pot:           () => {
    if (isVisible(window.ACTIONS.brew_coffee) && (window.ACTIONS.brew_coffee.canDo(state)?.ok)) { doAction("brew_coffee"); return null; }
    return "The moka pot is still warm. You've had enough. (Your hands agree.)";
  },
  pomodoro:           () => "Ding. Twenty-five minutes. You spent them looking at the timer.",
  noise_cancel:       () => "Headphones on. Silence. Then, faintly, your own heartbeat, and the thought that you should be writing.",
  bookshelf:          () => "You run a finger along the spines. You've read about a third of these. You've cited about two-thirds.",
  adopt_cat:          () => {
    if (pokeCooldown("cat", 180)) applyStoryEffects({ meaning: 0.2 });
    return pickOne(["The cat allows exactly one pat, then leaves to sit on your drafts.", "The cat purrs, which you choose to read as peer review: accept, no revisions.",
                    "The cat knocks your pen off the desk while maintaining eye contact.", "The cat is asleep on chapter three. Chapter three is now finished, apparently."]);
  },
  fountain_pen:       () => "You uncap the fountain pen. A single drop of ink lands on your best paragraph. It's an improvement.",
  whiteboard:         () => "DO NOT ERASE, says the corner, in handwriting nobody recognizes. You don't.",
  lucky_pen:          () => "You click the lucky pen three times, for luck. Ritual is just superstition with tenure.",
  standing_desk_home: () => "You stand. You feel virtuous for four minutes.",
  ergonomic_chair:    () => "You lean back. The chair leans with you, like a good mentor.",
  typewriter:         () => "Clack. Clack. Ding! You type \"The\" and admire it for a while.",
  skull:              () => "Alas, poor Yorick. He was an associate professor, a fellow of infinite jest, and he never got the second book out.",
  hourglass:          (el) => { el.classList.toggle("prop-flipped"); return "You turn the hourglass over. Time keeps doing what it does."; }
};
const POKE_AT = {};
function pokeCooldown(key, sec) {
  const now = state.gameTicks ?? 0;
  if ((POKE_AT[key] ?? -1e9) + ticksFromSeconds(sec) > now) return false;
  POKE_AT[key] = now;
  return true;
}

function deskSyncProps() {
  if (!Desk.els.surface || !window.DESK_PROPS) return;
  Desk.layout.props = Desk.layout.props ?? {};
  for (const [id, def] of Object.entries(window.DESK_PROPS)) {
    const owned = !!state.perks?.[id];
    let el = Desk.props.get(id);
    if (!owned) { if (el) { el.remove(); Desk.props.delete(id); } continue; }
    if (!el) {
      el = document.createElement("button");
      el.type = "button";
      el.className = "desk-prop";
      el.dataset.prop = id;
      el.title = def.label;
      el.setAttribute("aria-label", def.label);
      el.innerHTML = `<i class="fa-solid ${def.icon}"></i>`;
      Desk.els.surface.appendChild(el);
      Desk.props.set(id, el);
      if (!Desk.layout.props[id]) {
        const view = deskVisibleRect();
        const spot = deskFindGap(70, 70, { x: view.x + view.w * 0.55, y: view.y, w: view.w * 0.45, h: view.h }) ?? { x: view.x + view.w - 160, y: view.y + 80 };
        Desk.layout.props[id] = { x: spot.x, y: spot.y, rot: deskJitter(12) };
        el.classList.add("paper-arrive");
        setTimeout(() => el.classList.remove("paper-arrive"), 900);
        deskSave();
      }
      deskPlaceProp(id);
    }
  }
}

function deskPlaceProp(id) {
  const el = Desk.props.get(id);
  const P = Desk.layout.props?.[id];
  if (!el || !P) return;
  el.style.left = `${Math.round(P.x)}px`;
  el.style.top  = `${Math.round(P.y)}px`;
  el.style.setProperty("--prop-rot", `${(P.rot ?? 0).toFixed(1)}deg`);
}

function deskTidyProps(x0, y0) {
  // A still life that fits on screen: as many columns as there's room for
  const view = deskVisibleRect();
  const right = view.x + view.w - 20;
  const cols = Math.max(1, Math.min(4, Math.floor((right - x0) / 80)));
  if (cols < 2) { x0 = right - 2 * 80; }
  const per = Math.max(2, cols);
  let i = 0;
  for (const id of Desk.props.keys()) {
    Desk.layout.props[id] = { x: Math.min(DESK_W - 100, x0 + (i % per) * 80), y: y0 + Math.floor(i / per) * 80, rot: deskJitter(8) };
    deskPlaceProp(id);
    i++;
  }
}

function pokeProp(id) {
  const el = Desk.props.get(id);
  const fn = PROP_POKES[id];
  if (!el || !fn) return;
  el.classList.remove("prop-poke"); void el.offsetWidth; el.classList.add("prop-poke");
  const line = fn(el);
  if (line && pokeCooldown(`news_${id}`, 4)) pushNews(line);
  state.counters.pokes = (state.counters.pokes ?? 0) + 1;
  render();
}

// ── Pointer handling: drag papers, folders and props; turn pages; pan ─
function wireDeskPointer() {
  const { viewport, surface } = Desk.els;
  let g = null;  // the gesture in progress
  const z = () => Desk.layout.zoom || 1;

  surface.addEventListener("pointerdown", (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    const wrap   = e.target.closest(".paper");
    const folder = e.target.closest(".folder");
    const prop   = e.target.closest(".desk-prop");
    const dogear = e.target.closest(".paper-dogear");

    if (dogear && wrap) {
      const L = Desk.layout.papers[wrap.dataset.paperId];
      if (!L || L.pinned) return;
      const r = wrap.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      g = { kind: "turn", id: wrap.dataset.paperId, cx, cy, a0: Math.atan2(e.clientY - cy, e.clientX - cx), rot0: L.rot ?? 0 };
      deskRaise(wrap.dataset.paperId);
      deskCapture(surface, e);
      e.preventDefault();
      return;
    }

    if (wrap) {
      const id = wrap.dataset.paperId;
      deskRaise(id);
      if (e.target.closest(DESK_NO_DRAG)) return;
      const L = Desk.layout.papers[id];
      if (!L || L.pinned) return;
      g = { kind: "paper", id, sx: e.clientX, sy: e.clientY, x0: L.x, y0: L.y, moved: false };
      deskCapture(surface, e);
      return;
    }

    if (prop) {
      const P = Desk.layout.props?.[prop.dataset.prop];
      if (!P) return;
      g = { kind: "prop", id: prop.dataset.prop, sx: e.clientX, sy: e.clientY, x0: P.x, y0: P.y, moved: false };
      deskCapture(surface, e);
      e.preventDefault();
      return;
    }

    if (folder) {
      const f = deskFolderById(folder.dataset.folderId);
      if (!f) return;
      f.z = ++Desk.zTop; folder.style.zIndex = String(f.z);
      if (e.target.closest("button")) return;
      g = { kind: "folder", id: f.id, sx: e.clientX, sy: e.clientY, x0: f.x, y0: f.y, moved: false };
      deskCapture(surface, e);
      return;
    }

    // Empty desk: pan
    g = { kind: "pan", sx: e.clientX, sy: e.clientY, l0: viewport.scrollLeft, t0: viewport.scrollTop };
    document.body.classList.add("desk-panning");
    deskCapture(surface, e);
  });

  surface.addEventListener("pointermove", (e) => {
    if (!g) return;
    if (g.kind === "pan") {
      viewport.scrollLeft = g.l0 - (e.clientX - g.sx);
      viewport.scrollTop  = g.t0 - (e.clientY - g.sy);
      return;
    }
    if (g.kind === "turn") {
      const a = Math.atan2(e.clientY - g.cy, e.clientX - g.cx);
      let rot = g.rot0 + (a - g.a0) * 180 / Math.PI;
      rot = ((rot + 540) % 360) - 180;
      if (Math.abs(rot) < 1.5) rot = 0;          // snaps straight
      const L = Desk.layout.papers[g.id];
      L.rot = rot;
      if (Math.abs(rot) > 170) state.counters.flipped = true;
      deskPlace(g.id);
      return;
    }
    const dx = e.clientX - g.sx, dy = e.clientY - g.sy;
    if (!g.moved && Math.hypot(dx, dy) < DESK_DRAG_SLOP) return;
    if (!g.moved) {
      g.moved = true;
      Desk.touched = true;
      document.body.classList.add("desk-dragging");
      if (g.kind === "paper") Desk.papers.get(g.id)?.wrap.classList.add("paper-lifted");
    }
    const nx = clampDesk(g.x0 + dx / z(), -100, DESK_W - 120);
    const ny = clampDesk(g.y0 + dy / z(), -20,  DESK_H - 60);
    if (g.kind === "paper") {
      const L = Desk.layout.papers[g.id];
      L.x = nx; L.y = ny;
      deskPlace(g.id);
      deskHighlightFolderUnder(e.clientX, e.clientY);
    } else if (g.kind === "prop") {
      const P = Desk.layout.props[g.id];
      P.x = nx; P.y = ny;
      deskPlaceProp(g.id);
    } else {
      const f = deskFolderById(g.id);
      f.x = nx; f.y = ny;
      deskPlaceFolder(f);
    }
  });

  const finish = (e) => {
    if (!g) return;
    const gesture = g;
    g = null;
    document.body.classList.remove("desk-dragging", "desk-panning");
    if (gesture.kind === "paper") {
      Desk.papers.get(gesture.id)?.wrap.classList.remove("paper-lifted");
      if (gesture.moved) {
        const target = deskFolderUnder(e.clientX, e.clientY);
        if (target) deskFile(gesture.id, target);
      }
      deskHighlightFolderUnder(null);
    }
    if (gesture.kind === "prop" && !gesture.moved && e.type === "pointerup") pokeProp(gesture.id);
    if (gesture.kind === "folder" && !gesture.moved) {
      const f = deskFolderById(gesture.id);
      if (f) { f.open = !f.open; deskPlaceFolder(f); }
    }
    deskSave();
  };
  surface.addEventListener("pointerup", finish);
  surface.addEventListener("pointercancel", finish);

  // Keyboard: a focused prop pokes on Enter/Space
  surface.addEventListener("keydown", (e) => {
    const prop = e.target.closest?.(".desk-prop");
    if (prop && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); pokeProp(prop.dataset.prop); }
  });

  // Buttons on papers and folders
  surface.addEventListener("click", (e) => {
    const tool = e.target.closest(".paper-tool");
    if (tool) {
      const id = tool.closest(".paper")?.dataset.paperId;
      const L  = Desk.layout.papers[id];
      if (!L) return;
      if (tool.dataset.tool === "pin")  L.pinned = !L.pinned;
      if (tool.dataset.tool === "fold") L.folded = !L.folded;
      deskPlace(id);
      deskSave();
      return;
    }
    const unfile = e.target.closest("[data-unfile]");
    if (unfile) { deskUnfile(unfile.dataset.unfile); return; }
    const discard = e.target.closest("[data-discard]");
    if (discard) { deskDiscardFolder(discard.dataset.discard); return; }
  });

  surface.addEventListener("dblclick", (e) => {
    const dogear = e.target.closest(".paper-dogear");
    if (dogear) {
      const id = dogear.closest(".paper")?.dataset.paperId;
      const L = Desk.layout.papers[id];
      if (L && !L.pinned) { L.rot = 0; deskPlace(id); deskSave(); }
      return;
    }
    const tab = e.target.closest(".folder-tab");
    if (tab) deskRenameFolder(tab.closest(".folder")?.dataset.folderId);
  });

  // Ctrl/⌘ + wheel zooms the desk instead of the page
  viewport.addEventListener("wheel", (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    deskStepZoom(e.deltaY < 0 ? +1 : -1);
  }, { passive: false });
}

function deskCapture(el, e) {
  try { if (e.pointerId !== undefined) el.setPointerCapture(e.pointerId); } catch (_) {}
}

function clampDesk(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function deskRaise(id) {
  const L = Desk.layout.papers[id];
  if (!L) return;
  if ((L.z ?? 0) >= Desk.zTop) return;
  L.z = ++Desk.zTop;
  const p = Desk.papers.get(id);
  if (p) p.wrap.style.zIndex = String(L.z);
}

function deskFolderUnder(clientX, clientY) {
  if (clientX == null) return null;
  for (const [id, el] of Desk.folders) {
    const r = el.getBoundingClientRect();
    if (r.width && clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom) return id;
  }
  return null;
}

function deskHighlightFolderUnder(clientX, clientY) {
  const hit = deskFolderUnder(clientX, clientY);
  for (const [id, el] of Desk.folders) el.classList.toggle("folder-target", id === hit);
}

// ── Wiring ────────────────────────────────────────────────────────────
// The desk sets up once everything else has loaded and rendered once.
onHook("load", () => {
  if (typeof document === "undefined") return;
  // Wait for the first render so panels exist and have sizes
  setTimeout(() => { initDesk(); if (Desk.active) { deskSyncAll(); } }, 0);
});
onHook("render", () => { if (Desk.active) deskSyncAll(); });
onHook("reset", () => { for (const k of Object.keys(POKE_AT)) delete POKE_AT[k]; });
// New mail comes to the top of the pile, where you can see it
onHook("mail", () => { if (Desk.active && Desk.layout.papers.panel_inbox) { deskRaise("panel_inbox"); const L = Desk.layout.papers.panel_inbox; if (L.folded) { L.folded = false; deskPlace("panel_inbox"); } } });
