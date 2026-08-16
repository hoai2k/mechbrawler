// THE MOBILE SHEETS — one modal at a time, over a viewer that keeps the screen.
//
// WHY. Both tools in this folder were laid out for a desk: a toolbar of six
// controls across the top, a viewer, and a 360–430px rail of pickers and
// parameters glued to its right. On a phone that rail is most of the screen and
// the toolbar wraps into three rows, which leaves a letterbox of viewer between
// them — and the viewer is the entire reason to open a workbench on a phone in
// the first place ("does this pose look right").
//
// So on a narrow screen every panel becomes a BOTTOM SHEET: off screen until a
// button in the mobile bar asks for it, over the viewer while it is up, gone
// again the moment a choice is made. The viewer keeps everything else.
//
// WHAT THIS FILE IS AND IS NOT. It is the open/close plumbing only — which
// panel is up, the scrim behind it, the close affordance, Escape, and the
// pressed state on the button that opened it. It never moves a node and never
// rewrites one: a sheet's panel is the SAME element the desktop layout uses
// (the effect grid, the parameter panel, the pose readout), styled differently
// by a media query. That is what keeps one tool rather than two — a phone build
// that diverged would be a second place for every bug to live.
//
// The panels are also allowed to have their contents replaced under us
// (`buildParams` empties the parameter panel on every selection), which is the
// other reason nothing is injected into them: the chrome lives in body-level
// elements this module owns.

/** The narrow-screen switch, shared by the stylesheet and by the tools.
 *
 *  Two clauses because a phone has two shapes: portrait is caught by the width,
 *  landscape (844×390 on a modern handset — wider than most tablets) by the
 *  short viewport, and `pointer: coarse` keeps a short desktop window out of
 *  it. The stylesheet's media query is this string, character for character. */
export const MOBILE_QUERY = "(max-width: 820px), (max-height: 560px) and (pointer: coarse)";

const media = () => window.matchMedia(MOBILE_QUERY);

/** Is the page in its phone layout right now? */
export function isMobile() {
  return media().matches;
}

/**
 * Wire a tool's sheets.
 *
 * `panels` maps a sheet id to `{ el, title, onOpen }`. Anything inside `root` carrying
 * `data-sheet="<id>"` opens that sheet — and closes it when pressed again, so
 * the button a reader used to get somewhere is also the way back.
 *
 * Returns a controller: `open`, `close`, `toggle`, `current`.
 */
export function attachSheets(root, panels) {
  const scrim = document.createElement("div");
  scrim.className = "sheet-scrim";
  scrim.hidden = true;

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "sheet-close";
  closeBtn.hidden = true;
  const title = document.createElement("span");
  closeBtn.append(title, document.createTextNode(" ✕"));

  document.body.append(scrim, closeBtn);

  let open = null;

  const buttonsFor = (id) => root.querySelectorAll(`[data-sheet="${id}"]`);

  function close() {
    if (!open) return;
    panels[open]?.el?.classList.remove("is-open");
    for (const b of buttonsFor(open)) {
      b.classList.remove("is-on");
      b.setAttribute("aria-expanded", "false");
    }
    open = null;
    scrim.hidden = true;
    closeBtn.hidden = true;
    document.body.classList.remove("sheet-open");
  }

  function show(id) {
    const panel = panels[id];
    if (!panel?.el) return;
    if (open === id) return;
    close();
    open = id;
    panel.el.classList.add("is-open");
    for (const b of buttonsFor(id)) {
      b.classList.add("is-on");
      b.setAttribute("aria-expanded", "true");
    }
    title.textContent = panel.title || "";
    scrim.hidden = false;
    closeBtn.hidden = false;
    document.body.classList.add("sheet-open");
    // A sheet re-opened after a scroll should start where its content starts,
    // not two hundred pixels into a grid of sixty tiles.
    panel.el.scrollTop = 0;
    // A panel that was off screen may have been skipped by whatever fills it
    // lazily — an IntersectionObserver over a translated-away sheet is not a
    // reliable answer to "is this on screen". `onOpen` is where a tool tops it
    // up, now that the panel really is being looked at.
    panel.onOpen?.();
  }

  function toggle(id) {
    if (open === id) close();
    else show(id);
  }

  root.addEventListener("click", (e) => {
    const btn = e.target.closest?.("[data-sheet]");
    if (!btn || !root.contains(btn)) return;
    e.preventDefault();
    toggle(btn.dataset.sheet);
  });
  scrim.addEventListener("click", close);
  closeBtn.addEventListener("click", close);
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
  });
  // Rotating a phone, or dragging a desktop window past the breakpoint, leaves
  // a sheet up that the desktop layout has no scrim behind. Drop it.
  media().addEventListener?.("change", (e) => { if (!e.matches) close(); });

  for (const id of Object.keys(panels)) {
    for (const b of buttonsFor(id)) b.setAttribute("aria-expanded", "false");
  }

  return { open: show, close, toggle, current: () => open };
}
