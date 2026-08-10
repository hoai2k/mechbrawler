// Hover help for workbench controls.
//
// Every control used to carry its explanation as a paragraph underneath, which
// pushed the next control further down the panel — a page of prose between you
// and the slider you wanted. The text now lives on the control's own title as
// `data-help`, and appears in a bubble on hover.
//
// Two implementation notes worth keeping:
//
// The bubble is a single element on `<body>`, positioned `fixed`. The panel
// scrolls with `overflow-y: auto` and is only 340px wide, so a bubble inside it
// would be clipped both vertically and horizontally.
//
// Triggers are found by event delegation rather than wired up once, because
// half of them (the anchor rows) are rebuilt every time the pose changes.

const OFFSET = 10;
const MAX_WIDTH = 330;

let bubble = null;
let current = null;

function ensureBubble() {
  if (bubble) return bubble;
  bubble = document.createElement("div");
  bubble.className = "help-bubble";
  bubble.setAttribute("role", "tooltip");
  bubble.hidden = true;
  document.body.appendChild(bubble);
  return bubble;
}

/** Place the bubble beside its trigger, taking the first side it fits on
 *  outright. Left is tried first because the panel lives against the right edge
 *  and that is where the room is; below and above come last because they can
 *  cover the control being explained. Whatever wins is clamped into view. */
function position(el) {
  const r = el.getBoundingClientRect();
  const b = bubble.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const candidates = [
    { left: r.left - b.width - OFFSET, top: r.top },              // left
    { left: r.right + OFFSET, top: r.top },                        // right
    { left: r.left, top: r.bottom + OFFSET },                      // below
    { left: r.left, top: r.top - b.height - OFFSET },              // above
  ];
  const fits = (c) => c.left >= OFFSET && c.top >= OFFSET
    && c.left + b.width <= vw - OFFSET && c.top + b.height <= vh - OFFSET;

  const pick = candidates.find(fits) || candidates[0];
  bubble.style.left = `${clampTo(pick.left, b.width, vw)}px`;
  bubble.style.top = `${clampTo(pick.top, b.height, vh)}px`;
}

function clampTo(value, size, extent) {
  return Math.max(OFFSET, Math.min(value, extent - size - OFFSET));
}

function show(el) {
  const text = el.dataset.help;
  if (!text) return;
  current = el;
  ensureBubble();
  bubble.innerHTML = text;
  bubble.hidden = false;
  // measured after the content is in, so the width is real before placing
  position(el);
  el.classList.add("help-open");
}

function hide() {
  if (!current) return;
  current.classList.remove("help-open");
  current = null;
  if (bubble) bubble.hidden = true;
}

/** A `?` marker so a control that HAS help is visibly different from one that
 *  does not, and a focus target for keyboard and touch. Added here rather than
 *  written into the markup twelve times. */
function decorate(el) {
  if (el.querySelector(".help-badge")) return;
  const badge = document.createElement("span");
  badge.className = "help-badge";
  badge.textContent = "?";
  badge.tabIndex = 0;
  badge.setAttribute("aria-label", "What is this?");
  el.appendChild(badge);
}

export function initTooltips(root = document) {
  root.querySelectorAll("[data-help]").forEach(decorate);

  document.addEventListener("pointerover", (e) => {
    const el = e.target.closest?.("[data-help]");
    if (el === current) return;
    hide();
    if (el) show(el);
  });
  document.addEventListener("pointerdown", (e) => {
    // tapping the badge is how this works without a pointer that hovers
    const badge = e.target.closest?.(".help-badge");
    if (!badge) { hide(); return; }
    const el = badge.closest("[data-help]");
    if (el === current) hide();
    else { hide(); show(el); }
  });
  document.addEventListener("focusin", (e) => {
    const badge = e.target.closest?.(".help-badge");
    hide();
    if (badge) show(badge.closest("[data-help]"));
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") hide(); });
  // a bubble left floating over a control the user scrolled away from is worse
  // than no bubble at all
  window.addEventListener("scroll", hide, true);
  window.addEventListener("resize", hide);
}

/** For help text that changes with the selection, like the anchor rows. */
export function setHelp(el, text) {
  if (!el) return;
  el.dataset.help = text;
  decorate(el);
  if (current === el) show(el);
}
