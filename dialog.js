// dialog.js — questions the game asks you, on an index card
//
// Also: showNote() lays a short typed note over the desk for things the
// game wants you to read once (offline progress, a big moment).
//
// The browser's own confirm() and prompt() boxes are blocked in some places
// the game runs (embedded frames return "no" without showing anything), and
// they look like a different program anyway. These do the same jobs on the
// desk: askConfirm for yes/no, askText for a line (or a block) of text.
//
// Both are fire-and-forget: they call you back on a yes, and do nothing on a
// cancel. askText's callback may return a string to keep the card open and
// show that string as a note (for "that doesn't look like a save file").

function askConfirm({ title, body = "", yes = "Yes", no = "Cancel", danger = false }, onYes) {
  return openDialog({ title, body, yes, no, danger }, () => { onYes?.(); return null; });
}

function askText({ title, body = "", value = "", placeholder = "", yes = "Save", no = "Cancel", multiline = false, maxLength = 200 }, onDone) {
  return openDialog({ title, body, yes, no, field: { value, placeholder, multiline, maxLength } }, (text) => onDone?.(text));
}

function openDialog(opts, onYes) {
  if (typeof document === "undefined") return null;
  closeDialog();
  const scrim = document.createElement("div");
  scrim.className = "dlg-scrim";
  scrim.id = "dlg_scrim";
  const f = opts.field;
  const fieldHTML = !f ? "" : f.multiline
    ? `<textarea class="dlg-input" id="dlg_input" rows="5" maxlength="${f.maxLength * 100}" placeholder="${escapeDlg(f.placeholder)}"></textarea>`
    : `<input class="dlg-input" id="dlg_input" type="text" maxlength="${f.maxLength}" placeholder="${escapeDlg(f.placeholder)}" autocomplete="off">`;
  scrim.innerHTML = `
    <form class="dlg" role="dialog" aria-modal="true" aria-labelledby="dlg_title">
      <h3 id="dlg_title">${escapeDlg(opts.title)}</h3>
      ${opts.body ? `<p class="dlg-body">${escapeDlg(opts.body)}</p>` : ""}
      ${fieldHTML}
      <p class="dlg-note" id="dlg_note" aria-live="polite"></p>
      <div class="dlg-btns">
        <button type="button" class="dlg-no" id="dlg_no">${escapeDlg(opts.no)}</button>
        <button type="submit" class="dlg-yes${opts.danger ? " dlg-danger" : ""}" id="dlg_yes">${escapeDlg(opts.yes)}</button>
      </div>
    </form>`;
  document.body.appendChild(scrim);
  const form  = scrim.querySelector("form");
  const input = scrim.querySelector("#dlg_input");
  if (input) input.value = f.value ?? "";
  const back = document.activeElement;

  const finish = () => { closeDialog(); try { back?.focus?.(); } catch (_) {} };
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const keepOpen = onYes(input ? input.value : true);
    if (typeof keepOpen === "string" && keepOpen) {
      scrim.querySelector("#dlg_note").textContent = keepOpen;
      input?.focus();
      return;
    }
    finish();
    if (typeof render === "function") render();
  });
  scrim.querySelector("#dlg_no").addEventListener("click", finish);
  scrim.addEventListener("pointerdown", (e) => { if (e.target === scrim) finish(); });
  scrim.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { e.preventDefault(); finish(); }
    if (e.key === "Enter" && input?.tagName === "TEXTAREA" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); form.requestSubmit?.(); }
  });
  (input ?? scrim.querySelector("#dlg_yes")).focus();
  if (input?.select) input.select();
  return scrim;
}

function closeDialog() {
  document.getElementById("dlg_scrim")?.remove();
}

function escapeDlg(s) {
  return String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

// A note to read once, with a single button. Optional `html` body.
function showNote({ title, body = "", html = "", ok = "Back to work", cls = "" }) {
  if (typeof document === "undefined") return null;
  closeDialog();
  const scrim = document.createElement("div");
  scrim.className = "dlg-scrim";
  scrim.id = "dlg_scrim";
  scrim.innerHTML = `
    <div class="dlg dlg-note-card ${cls}" role="dialog" aria-modal="true" aria-labelledby="dlg_title">
      <h3 id="dlg_title">${escapeDlg(title)}</h3>
      ${body ? `<p class="dlg-body">${escapeDlg(body)}</p>` : ""}${html}
      <div class="dlg-btns"><button type="button" class="dlg-yes" id="dlg_yes">${escapeDlg(ok)}</button></div>
    </div>`;
  document.body.appendChild(scrim);
  const done = () => closeDialog();
  scrim.querySelector("#dlg_yes").addEventListener("click", done);
  scrim.addEventListener("keydown", (e) => { if (e.key === "Escape" || e.key === "Enter") { e.preventDefault(); done(); } });
  scrim.addEventListener("pointerdown", (e) => { if (e.target === scrim) done(); });
  scrim.querySelector("#dlg_yes").focus();
  return scrim;
}
