// THE CARD WORKBENCH — where each mech's painting gets cropped.
//
// One control, and it is a line: drag it up and down the painting to say which
// height must survive when the card is squeezed into a hole that is not its
// shape. Everything else on the page exists to show the CONSEQUENCE of that
// line, because the line on its own tells you nothing — a card is never seen at
// this size in the game, and "looks about right on the big picture" is how the
// blanket `top` crop got shipped in the first place.
//
// So the rail holds the eight real holes (src/config_cards.js lists them), each
// one an actual `object-fit: cover` box at its actual size, re-cropping live as
// the line moves. The 52px and 44px squares are the ones worth watching: they
// throw away the most, so they are where a wrong line shows first.
//
// Nothing here persists — no localStorage, no server write, same as the other
// two tools. Export writes a JSON snapshot of every card, tuned or not, and
// tools/apply_card_focus.mjs rebuilds src/config_cards.js from it.

import { CHARACTERS, CHARACTER_KEYS } from "../src/characters.js";
import { CARD_FOCUS, cardFocus } from "../src/config_cards.js";

const el = (id) => document.getElementById(id);
const cardSrc = (key) => `../assets/cards/${key}_card.jpg`;

// The holes the game actually crops a card into, measured off styles.css. The
// point of listing them here is that they are the REAL numbers: a preview at a
// convenient size would agree with the game only by luck.
const HOLES = [
  { label: "HUD portrait", note: ".hud-portrait — beside the damage", w: 52, h: 52 },
  { label: "Pause chip", note: ".pause-chip img", w: 44, h: 44 },
  { label: "Select tile", note: ".char-card img — 3:4, the card's own shape", w: 132, h: 176 },
  { label: "Matchup art", note: ".matchup-side img — the VS splash", w: 150, h: 200 },
  { label: "Victory card", note: ".victory-card img", w: 120, h: 160 },
  { label: "Victory hero", note: ".victory-hero-art — overscanned 124%", w: 174, h: 140 },
  { label: "Loser card", note: ".victory-card--loser img", w: 140, h: 112 },
  { label: "Intro panel", note: ".intro-panel img — overscanned 134%", w: 168, h: 210 },
];

// key -> percentage from the painting's top edge. Seeded from the committed
// config so a session REFINES what is shipped rather than starting from blank
// and quietly reverting somebody's earlier pass on export.
const store = new Map();
const touched = new Set();
let current = null;
let dirty = false;

const focusOf = (key) => (store.has(key) ? store.get(key) : 0);

function setFocus(key, pct, { mark = true } = {}) {
  const v = Math.min(100, Math.max(0, Math.round(pct * 10) / 10));
  store.set(key, v);
  if (mark) {
    touched.add(key);
    dirty = true;
    el("dirtyFlag").hidden = false;
  }
  if (key === current) paint();
  const tile = el(`tile-${key}`);
  if (tile) tile.classList.toggle("is-dirty", touched.has(key));
}

// ----------------------------------------------------------------- geometry
//
// The painting is letterboxed inside its box by `object-fit: contain`, so every
// reading and every overlay has to be measured against the PAINTED rect rather
// than the element — otherwise the line lands somewhere the game will not crop
// to, off by exactly the letterbox.

function paintedRect() {
  const img = el("cardImg");
  const box = img.getBoundingClientRect();
  const nat = img.naturalWidth / img.naturalHeight;
  if (!nat || !box.width) return { top: box.top, left: box.left, width: box.width, height: box.height };
  if (box.width / box.height > nat) {
    const w = box.height * nat;
    return { top: box.top, height: box.height, left: box.left + (box.width - w) / 2, width: w };
  }
  const h = box.width / nat;
  return { top: box.top + (box.height - h) / 2, height: h, left: box.left, width: box.width };
}

/** The fraction of the painting's HEIGHT that survives the tightest hole in the
 *  game — a square one. `cover` into a square scales the painting to fill the
 *  width, so what is kept is its own aspect ratio; the rest is thrown away, and
 *  that is the band the overlay dims. */
function keptFraction() {
  const img = el("cardImg");
  if (!img.naturalWidth || !img.naturalHeight) return 1;
  return Math.min(1, img.naturalWidth / img.naturalHeight);
}

/** Lay the line, its grab handle and the two discarded bands over the painting.
 *  Pixel positions rather than percentages, because they are positioned against
 *  the painted rect and that is not the element they live in. */
function layout() {
  const wrap = el("cardWrap");
  const r = paintedRect();
  const box = wrap.getBoundingClientRect();
  const left = r.left - box.left;
  const top = r.top - box.top;
  const pct = focusOf(current) / 100;
  const kept = keptFraction();
  // Where the surviving window sits, as a fraction of the painting's height:
  // `object-position: 50% p%` aligns the p point of the painting with the p
  // point of the hole, which puts the window's top at p × (1 − kept).
  const winTop = pct * (1 - kept);

  for (const id of ["focusLine", "focusGrab", "focusAbove", "focusBelow"]) {
    const node = el(id);
    node.style.left = `${left}px`;
    node.style.width = `${r.width}px`;
  }
  el("focusLine").style.top = `${top + pct * r.height}px`;
  el("focusGrab").style.top = `${top + pct * r.height}px`;
  el("focusAbove").style.top = `${top}px`;
  el("focusAbove").style.height = `${winTop * r.height}px`;
  el("focusBelow").style.top = `${top + (winTop + kept) * r.height}px`;
  el("focusBelow").style.height = `${(1 - winTop - kept) * r.height}px`;
}

// ------------------------------------------------------------------ painting

function paint() {
  const key = current;
  const pct = focusOf(key);
  layout();
  el("focusGrab").setAttribute("aria-valuenow", String(pct));
  el("focusPct").textContent = `${pct.toFixed(1)}%`;
  el("focusRange").value = String(pct);
  el("focusOut").textContent = `${pct.toFixed(1)}%`;
  el("resetBtn").disabled = !touched.has(key) && pct === cardFocus(key);
  for (const hole of HOLES) {
    const img = el(`hole-${hole.label.replace(/\W+/g, "")}`);
    if (img) img.style.objectPosition = `50% ${pct}%`;
  }
  const committed = cardFocus(key);
  el("committed").textContent = CARD_FOCUS[key] === undefined
    ? "not tuned yet — the game crops this card at the top"
    : `committed: ${committed}%`;
}

function select(key) {
  current = key;
  const char = CHARACTERS[key];
  for (const k of CHARACTER_KEYS) {
    el(`tile-${k}`)?.classList.toggle("is-selected", k === key);
  }
  el("who").textContent = char?.name || key;
  el("whoKey").textContent = `${key}_card.jpg`;
  el("cardImg").src = cardSrc(key);
  for (const hole of HOLES) {
    const img = el(`hole-${hole.label.replace(/\W+/g, "")}`);
    if (img) img.src = cardSrc(key);
  }
  paint();
}

// ---------------------------------------------------------------- the export

const EXPORT_SCHEMA = "mechbrawler.card-focus";
const EXPORT_VERSION = 1;

function snapshot() {
  const cards = {};
  for (const key of CHARACTER_KEYS) {
    cards[key] = {
      // `set` is the one thing a reader cannot derive: a card parked at 0
      // because nobody touched it and a card deliberately SET to 0 export the
      // same number, and only the deliberate one belongs in the config.
      set: touched.has(key) || CARD_FOCUS[key] !== undefined,
      focus: focusOf(key),
      name: CHARACTERS[key]?.name || key,
    };
  }
  return {
    schema: EXPORT_SCHEMA,
    version: EXPORT_VERSION,
    generatedBy: "Mech Brawler card workbench (/workbench/?edit=cards) — nothing is persisted in the browser; this file is the only record of the session's edits.",
    generatedAt: new Date().toISOString(),
    applyTo: "src/config_cards.js — export const CARD_FOCUS",
    howToApply: "node tools/apply_card_focus.mjs <this file>. Rebuilds CARD_FOCUS wholesale: an entry for every key whose `set` is true, dropping the rest. `focus` is a percentage from the painting's top edge and goes to CSS as the y half of object-position.",
    defaults: { focus: 0 },
    counts: { cards: CHARACTER_KEYS.length, set: CHARACTER_KEYS.filter((k) => touched.has(k) || CARD_FOCUS[k] !== undefined).length },
    cards,
  };
}

function exportJSON() {
  const text = JSON.stringify(snapshot(), null, 2);
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `mechbrawler-card-focus-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  dirty = false;
  el("dirtyFlag").hidden = true;
  el("status").textContent = `exported ${a.download} — apply it with tools/apply_card_focus.mjs`;
}

// ----------------------------------------------------------------- the shell

function shell() {
  const tiles = CHARACTER_KEYS.map((key) => `
    <button class="tile" id="tile-${key}" type="button" data-key="${key}">
      <img class="tile-thumb tile-thumb--card" src="${cardSrc(key)}" alt="">
      <span class="tile-name">${CHARACTERS[key]?.name || key}</span>
      <span class="dot"></span>
    </button>`).join("");

  const holes = HOLES.map((h) => `
    <figure class="hole">
      <div class="hole-box" style="width:${h.w}px;height:${h.h}px">
        <img id="hole-${h.label.replace(/\W+/g, "")}" alt="">
      </div>
      <figcaption>
        <strong>${h.label}</strong>
        <span class="muted">${h.w}×${h.h} · ${h.note}</span>
      </figcaption>
    </figure>`).join("");

  return `
    <header class="bar">
      <div class="bar-title">
        <strong>Card workbench</strong>
        <span id="count" class="muted">${CHARACTER_KEYS.length} cards</span>
        <a class="bar-link" href="?">effect workbench →</a>
        <a class="bar-link" href="?edit=pose">pose workbench →</a>
      </div>
      <div class="bar-tools">
        <span id="dirtyFlag" class="flag" hidden>unexported edits</span>
        <button id="exportBtn" type="button">Export JSON</button>
      </div>
    </header>
    <main class="split split--cards">
      <nav class="rail rail--picker"><div class="grid grid--cards">${tiles}</div></nav>
      <section class="viewer">
        <div class="viewer-stage viewer-stage--card">
          <div id="cardWrap" class="cardwrap">
            <img id="cardImg" class="cardwrap-img" alt="">
            <div id="focusAbove" class="focus-band"></div>
            <div id="focusBelow" class="focus-band"></div>
            <div id="focusLine" class="focus-line"></div>
            <div id="focusGrab" class="focus-grab" tabindex="0" role="slider"
                 aria-label="Crop focus height" aria-valuemin="0" aria-valuemax="100">
              <span id="focusPct" class="focus-pct">0%</span>
            </div>
          </div>
        </div>
        <p class="viewer-note">
          <strong>Drag the line</strong> to the height that must survive a crop — usually the head.
          Click anywhere on the painting to send it there; arrow keys nudge by 0.5%, shift by 5%.
          The dimmed band is what a square crop throws away.
          <span id="committed" class="muted"></span>
        </p>
      </section>
      <aside class="rail rail--cards">
        <div class="params">
          <div class="params-head">
            <h2 id="who">…</h2>
            <code id="whoKey"></code>
          </div>
          <div class="ctrls">
            <label class="ctrl">
              <span class="ctrl-name">Focus</span>
              <input id="focusRange" type="range" min="0" max="100" step="0.5" value="0">
              <output id="focusOut">0%</output>
            </label>
          </div>
          <div class="rail-actions">
            <button id="resetBtn" type="button">Reset this card</button>
            <button id="centreBtn" type="button">Centre (50%)</button>
          </div>
        </div>
        <h3 class="rail-head">Every hole the game crops this card into</h3>
        <div class="holes">${holes}</div>
        <p id="status" class="muted rail-foot">Nothing is saved in the browser — export when you are done.</p>
      </aside>
    </main>`;
}

// ------------------------------------------------------------------ dragging

function bindLine() {
  const wrap = el("cardWrap");
  const img = el("cardImg");
  let dragging = false;

  const fromEvent = (ev) => {
    const r = paintedRect();
    return ((ev.clientY - r.top) / r.height) * 100;
  };

  wrap.addEventListener("pointerdown", (ev) => {
    dragging = true;
    wrap.setPointerCapture(ev.pointerId);
    setFocus(current, fromEvent(ev));
    ev.preventDefault();
  });
  wrap.addEventListener("pointermove", (ev) => {
    if (dragging) setFocus(current, fromEvent(ev));
  });
  const stop = (ev) => {
    if (!dragging) return;
    dragging = false;
    try { wrap.releasePointerCapture(ev.pointerId); } catch { /* already gone */ }
  };
  wrap.addEventListener("pointerup", stop);
  wrap.addEventListener("pointercancel", stop);

  el("focusGrab").addEventListener("keydown", (ev) => {
    const step = ev.shiftKey ? 5 : 0.5;
    if (ev.key === "ArrowUp") setFocus(current, focusOf(current) - step);
    else if (ev.key === "ArrowDown") setFocus(current, focusOf(current) + step);
    else return;
    ev.preventDefault();
  });

  // The overlay is measured off the painted rect, so it has to be re-laid when
  // the painting's own size changes: a new card decoding, or the window moving
  // under it. Until a card has decoded, naturalWidth is 0 and the kept-band
  // maths would divide into nothing.
  img.addEventListener("load", layout);
  window.addEventListener("resize", layout);
}

export async function boot(root) {
  root.innerHTML = shell();

  for (const key of CHARACTER_KEYS) {
    store.set(key, cardFocus(key));
    el(`tile-${key}`).addEventListener("click", () => select(key));
  }

  bindLine();

  el("focusRange").addEventListener("input", (ev) => setFocus(current, Number(ev.target.value)));
  el("resetBtn").addEventListener("click", () => {
    touched.delete(current);
    setFocus(current, cardFocus(current), { mark: false });
    el(`tile-${current}`).classList.remove("is-dirty");
    paint();
  });
  el("centreBtn").addEventListener("click", () => setFocus(current, 50));
  el("exportBtn").addEventListener("click", exportJSON);

  // An unexported session is lost on navigation, and this tool is one drag per
  // card — easy to do seventeen of and then close the tab.
  window.addEventListener("beforeunload", (ev) => {
    if (!dirty) return;
    ev.preventDefault();
    ev.returnValue = "";
  });

  select(CHARACTER_KEYS[0]);
}
