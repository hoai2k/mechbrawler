// Sizing the viewer canvas to the space its column leaves it.
//
// Both workbenches lay the viewer column out as a flex column: the canvas box
// on top, a fixed amount of chrome (transport, sliders, chips) under it. The
// canvas is what has to give, so the column never needs a scrollbar.
//
// Doing that in CSS alone means `flex: 1` on the canvas box and `max-height:
// 100%` on the canvas — and that is a cycle: the box is sized by its content
// and the content is sized by the box. Browsers break cycles by guessing, and
// the guesses were wrong often enough (the action workbench settled on a 150px
// canvas in a 776px column) that they are not worth relying on. So the whole
// thing is arithmetic instead:
//
//   * the canvas wrapper is positioned out of flow, so the canvas can never
//     feed back into the height of the box that sizes it;
//   * the box gets whatever the column has left once its siblings have taken
//     theirs;
//   * the canvas is scaled by whichever axis of that box runs out first, so it
//     fills the space and keeps its aspect ratio.
//
// Only the CSS size changes — the backing store keeps its authored resolution,
// and every pointer handler already converts through `getBoundingClientRect`,
// so hit-testing follows for free.

const STACKED = "(max-width: 980px)";   // matches the stacked layout in the CSS
const MIN_STAGE = 160;                  // never squeeze the viewer to nothing

/** How much of `el`'s bottom the open sprite drawer covers. */
function overlapWithDrawer(el) {
  const drawer = document.querySelector(".drawer");
  if (!drawer) return 0;
  const d = drawer.getBoundingClientRect();
  if (!d.height) return 0;
  return Math.max(0, el.getBoundingClientRect().bottom - d.top);
}

/** Fit `canvas` into the space its column leaves, now and on every resize. */
export function fitStageCanvas(canvas) {
  const box = canvas.closest(".stage-fit");
  const col = box?.parentElement;
  if (!box || !col) return;

  const apply = () => {
    // Stacked on a narrow window the page scrolls and the canvas simply takes
    // the width, so the measured fit is not wanted — hand the sizing back.
    if (window.matchMedia(STACKED).matches) {
      box.style.height = "";
      canvas.style.width = "";
      canvas.style.height = "";
      return;
    }
    const colH = col.clientHeight;
    if (!colH) return;                  // hidden view: nothing to measure yet

    const gap = parseFloat(getComputedStyle(col).rowGap) || 0;
    let used = 0;
    for (const sib of col.children) {
      if (sib === box) continue;
      used += sib.getBoundingClientRect().height + gap;
    }

    // The sprite drawer is fixed to the bottom of the window and covers the
    // foot of the column when it opens. The column no longer scrolls, so
    // anything it covers is unreachable rather than merely out of sight —
    // the canvas gives that height up too.
    let avail = colH - overlapWithDrawer(col);

    const h = Math.max(MIN_STAGE, avail - used);
    box.style.height = `${h}px`;
    const w = box.clientWidth;
    if (!w || !h) return;
    const scale = Math.min(w / canvas.width, h / canvas.height);
    canvas.style.width = `${Math.floor(canvas.width * scale)}px`;
    canvas.style.height = `${Math.floor(canvas.height * scale)}px`;
  };

  apply();
  if (typeof ResizeObserver === "function") {
    // The column for the space, the siblings because a row of chips reflows
    // into two at some widths and that is height the canvas no longer has.
    // Twice per change: once on the next frame, and once after the drawer's
    // slide has had time to finish — its final height is what the canvas has
    // to fit around, not the height it is passing through.
    let settle = 0;
    const schedule = () => {
      requestAnimationFrame(apply);
      clearTimeout(settle);
      settle = setTimeout(apply, 320);
    };
    const ro = new ResizeObserver(schedule);
    ro.observe(col);
    for (const sib of col.children) if (sib !== box) ro.observe(sib);
    // The drawer is built on demand, so it is picked up the first time it
    // appears rather than only if it happened to exist at boot.
    let watched = null;
    const watchDrawer = () => {
      const d = document.querySelector(".drawer");
      if (d && d !== watched) {
        watched = d;
        ro.observe(d);
        d.addEventListener("transitionend", schedule);
      }
      schedule();
    };
    watchDrawer();
    new MutationObserver(watchDrawer).observe(document.body, { childList: true, subtree: true });
  }
  window.addEventListener("resize", apply);
}
