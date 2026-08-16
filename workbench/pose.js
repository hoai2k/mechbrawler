// THE POSE WORKBENCH — one mech, one state, rendered the way the game renders
// it, with the loader's own answer about where that pose came from printed
// underneath.
//
// WHAT IT IS FOR. Seventeen mechs times forty states is nearly seven hundred
// poses, and an unknown number of them are wrong: a state with no clip mapping
// draws the placeholder body, a mis-mapped one plays somebody else's move, a
// mirrored or frozen clip can be right in the manifest and wrong on the rig.
// None of that is visible from inside a match, where a bad pose is a nineteenth
// of a second. So this is a debugging tool first and a viewer second, and its
// job is to make wrongness VISIBLE:
//
//   * the RESOLUTION READOUT is the loader's answer, not a guess — clip name,
//     which branch of resolveClip won, and whether the state is an alias for
//     another. A state that resolves to nothing says so in red, because that is
//     the failure this tool exists to find.
//   * the DEFAULT VIEW is the gameplay view. render3d frames every fighter at
//     scene.CAMERA_YAW_DEG (-78°, a few degrees off profile) and pose.js pins
//     several states to a presented angle on top of that (the K3 facing work).
//     Both happen inside the shared drawMech, so what opens here is what plays
//     — a viewer that quietly showed a nicer angle would hide exactly the
//     mis-orientations it was built to catch.
//   * the ORBIT is an offset ON that camera (scene.setOrbit), not a second
//     camera, so "Reset" is a return to the truth rather than to another
//     approximation. It says so in the caption whenever it is off zero.
//
// THE URL CARRIES BOTH. ?edit=pose&mech=titanus&pose=sideHeavy reloads to the
// same view and can be pasted into a bug report, which is the difference
// between "the ult looks wrong on someone, I think the big one" and a link.
//
// NOTHING HERE IS EDITABLE, so there is nothing to save and nothing to export:
// every number on screen is read out of the engine.
//
// ON A PHONE the same tool goes modal. The viewer takes the whole screen and
// everything else is behind a button: WHO (the roster, as a list you can read
// rather than a native dropdown), WHICH POSE (the state list, grouped by tier
// and marked where a state is an alias), and the loader's readout. The two
// pickers are the point — checking a model's poses on a handset is a walk
// through the cast, and each step should be one tap on a target a thumb can
// hit. The desktop dropdowns stay in the DOM and stay in step, so there is one
// state here and two ways to move it rather than two tools.

import {
  bootRenderer, MECHS, POSE_STATES, resolution, drawMech, drawGhost,
  mechHeightPx, mechFrameBox, ensureRig, rigReady, whenRigReady, attachOrbit,
  setOrbit, inGameCameraDeg,
} from "./rig_view.js";
import { attachSheets } from "./sheet.js";

const el = (id) => document.getElementById(id);

let sheets = null;    // the phone layout's modal panels; null until boot wires them

const view = {
  mech: MECHS[0]?.key || "titanus",
  pose: "idle",
  t: 0,
  playing: false,
  orbit: null,
  raf: 0,
  last: 0,
};

// -------------------------------------------------------------------- the URL

function readURL() {
  const q = new URLSearchParams(location.search);
  const mech = q.get("mech");
  const pose = q.get("pose");
  if (MECHS.some((m) => m.key === mech)) view.mech = mech;
  if (POSE_STATES.some((s) => s.state === pose)) view.pose = pose;
}

/** Both dropdowns in the address bar, replaced rather than pushed: a reload
 *  returns to this view, and the back button still leaves the tool. */
function writeURL() {
  const url = new URL(location.href);
  url.searchParams.set("edit", "pose");
  url.searchParams.set("mech", view.mech);
  url.searchParams.set("pose", view.pose);
  history.replaceState(null, "", url);
}

// ------------------------------------------------------------------ the draw

let canvas = null;

function paint() {
  if (!canvas) return;
  const stage = canvas.parentElement.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  // The floors are a guard against a zero-sized stage mid-layout, not a minimum
  // canvas: set them above a phone's viewport and the canvas overflows the
  // screen it was supposed to fit.
  const w = Math.max(240, Math.floor(stage.width));
  const h = Math.max(200, Math.floor(stage.height));
  if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
    canvas.width = w * dpr; canvas.height = h * dpr;
    canvas.style.width = `${w}px`; canvas.style.height = `${h}px`;
  }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  // The orbit is pushed at DRAW time rather than on the pointer event: it is
  // global to the renderer's camera, so setting it here is what keeps it from
  // leaking into anything else that renders on this page.
  setOrbit(view.orbit.orbit);

  const mechH = mechHeightPx(view.mech);
  // Framed on the mech's WHOLE RENDERED BOX (rig_view.mechFrameBox), not on its
  // height: the failures being hunted are whole-body ones — a machine on its
  // face, a limb through the torso, feet through the floor — so the frame is
  // never allowed to crop at the hips, however wide the pose throws itself.
  const box = mechFrameBox(view.mech);
  // Less air around the machine on a phone: the margin that reads as framing on
  // a 1400px viewer is a tenth of a handset's width, and the mech is the thing
  // that came here to be looked at.
  const pad = w < 520 ? 18 : 70;
  const z = Math.min((w - pad) / box.side, (h - pad * 0.85) / box.side);
  const originX = w / 2;
  const originY = (h - box.side * z) / 2 + box.above * z;
  ctx.setTransform(z * dpr, 0, 0, z * dpr, originX * dpr, originY * dpr);

  // The floor line and a metre-ish grid, so a pose that floats or sinks reads
  // as one rather than as a framing choice.
  ctx.save();
  ctx.strokeStyle = "rgba(120, 200, 255, 0.18)";
  ctx.lineWidth = 1 / z;
  ctx.beginPath();
  ctx.moveTo(-originX / z, 0);
  ctx.lineTo((w - originX) / z, 0);
  ctx.stroke();
  ctx.strokeStyle = "rgba(120, 200, 255, 0.09)";
  for (let y = -mechH; y >= -mechH * 1.25; y -= mechH / 4) {
    ctx.beginPath();
    ctx.moveTo(-originX / z, y); ctx.lineTo((w - originX) / z, y); ctx.stroke();
  }
  for (let y = -mechH / 4; y >= -mechH * 1.25; y -= mechH / 4) {
    ctx.beginPath();
    ctx.moveTo(-originX / z, y); ctx.lineTo((w - originX) / z, y); ctx.stroke();
  }
  ctx.restore();

  const drew = drawMech(ctx, view.mech, view.pose, view.t, 0, 0, { facing: 1 });
  if (!drew) drawGhost(ctx, view.mech, 0, 0, 1 / z);

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.save();
  ctx.font = "500 11px Inter, system-ui, sans-serif";
  ctx.fillStyle = drew ? "rgba(160, 180, 210, 0.75)" : "rgba(255, 120, 120, 0.9)";
  const o = view.orbit.orbit;
  // The caption is painted, so nothing wraps it: on a narrow canvas the long
  // form runs off the right edge and the sentence that explains what you are
  // looking at is the half you cannot read. Same facts, fewer words.
  const roomy = w >= 520;
  ctx.fillText(view.orbit.moved()
    ? (roomy
      ? `orbited — yaw ${o.yawDeg.toFixed(0)}° / pitch ${o.pitchDeg.toFixed(0)}° / ${o.dolly.toFixed(2)}× off the game's camera. Reset returns to it.`
      : `orbited ${o.yawDeg.toFixed(0)}° / ${o.pitchDeg.toFixed(0)}° / ${o.dolly.toFixed(2)}× · ⟳ returns to the game's camera`)
    : (roomy
      ? `the game's own camera — ${inGameCameraDeg()}° yaw, presentation pin applied exactly as in a match`
      : `the game's own camera — ${inGameCameraDeg()}° yaw, pinned as in a match`), 12, 20);
  if (!drew) {
    ctx.fillText(roomy
      ? "nothing rendered: this mech's rig is not in memory yet, or this state resolves to no clip"
      : "nothing rendered: the rig is still loading, or no clip", 12, 38);
  }
  ctx.restore();
}

function draw() {
  if (view.raf) return;
  view.raf = requestAnimationFrame(() => { view.raf = 0; paint(); });
}

/** The clip clock. Held still by default — a debugging read is about one pose —
 *  and played when asked, so a clip that is right at t=0 and wrong at 0.3s can
 *  be caught. */
function tick() {
  const now = performance.now();
  const dt = Math.min(0.05, (now - view.last) / 1000);
  view.last = now;
  if (view.playing) {
    const spec = POSE_STATES.find((s) => s.state === view.pose);
    const dur = spec?.duration ?? 1;
    view.t = spec?.loop ? (view.t + dt) % dur : Math.min(view.t + dt, dur - 1e-4);
    if (!spec?.loop && view.t >= dur - 1e-3) view.t = 0;
    showTime(view.t);
    paint();
  }
  requestAnimationFrame(tick);
}

// ------------------------------------------------- the two copies of a control
//
// The clip clock and the play button exist twice: once on the desk toolbar and
// once in the phone's bar, because neither layout can borrow the other's node.
// Every write goes through these, so the copy that is off screen is never the
// one holding the truth.

function showTime(t) {
  for (const id of ["timeSlider", "timeSliderM"]) {
    const s = el(id);
    if (s) s.value = String(t);
  }
  for (const id of ["timeOut", "timeOutM"]) {
    const o = el(id);
    if (o) o.textContent = `${t.toFixed(2)}s`;
  }
}

function setPlaying(on) {
  view.playing = on;
  view.last = performance.now();
  if (el("play")) el("play").textContent = on ? "Pause" : "Play ▶";
  if (el("playM")) el("playM").textContent = on ? "❚❚" : "▶";
}

function scrubTo(t) {
  setPlaying(false);
  view.t = t;
  showTime(t);
  paint();
}

// -------------------------------------------------------------- the selection
//
// One way in for each of the two choices, because there are now two controls
// for each: the desk dropdown and the phone's picker. Both call these, so the
// select, the picker, the mobile button's caption and `view` cannot disagree.

function setMech(key, onChange) {
  if (!MECHS.some((m) => m.key === key)) return;
  view.mech = key;
  if (el("mech")) el("mech").value = key;
  syncPickers();
  onChange?.();
}

function setPose(state, onChange) {
  if (!POSE_STATES.some((s) => s.state === state)) return;
  view.pose = state;
  view.t = 0;
  if (el("pose")) el("pose").value = state;
  showTime(0);
  syncPickers();
  onChange?.();
}

/** The phone's captions and ticks, for whatever the state now is. */
function syncPickers() {
  const mech = MECHS.find((m) => m.key === view.mech);
  if (el("mMech")) el("mMech").textContent = mech?.name || view.mech;
  if (el("mPose")) el("mPose").textContent = view.pose;
  for (const b of document.querySelectorAll("#mechList .pick")) {
    b.classList.toggle("is-on", b.dataset.mech === view.mech);
  }
  for (const b of document.querySelectorAll("#poseList .pick")) {
    b.classList.toggle("is-on", b.dataset.pose === view.pose);
  }
}

// ------------------------------------------------------------- the readout

function refreshReadout() {
  const r = resolution(view.mech, view.pose);
  const host = el("readout");
  host.className = `readout ${r.ok ? "is-ok" : "is-bad"}`;
  const rows = [
    ["state asked for", r.state],
    ["clip played", r.alias ? `${r.clip} — ALIAS: ${r.state} has no clip of its own and borrows this one` : r.clip],
    ["loader resolved to", r.ok ? r.source
      : r.rig ? "NOTHING — no glb mapping for this state; the fighter draws the placeholder body"
              : "not answered yet — this mech's rig is still loading"],
    ["rig in memory", r.rig ? "yes" : "loading…"],
    ["clip timing", `${r.loop ? "loops" : "one-shot"} · ${r.duration.toFixed(3)}s`],
  ];
  if (r.error) rows.push(["⚠ resolve threw", r.error]);
  host.innerHTML = rows.map(([k, v]) =>
    `<dt>${k}</dt><dd${k.startsWith("⚠") || (k === "loader resolved to" && !r.ok) ? ' class="warn"' : ""}>${v}</dd>`
  ).join("");

  for (const id of ["timeSlider", "timeSliderM"]) {
    const s = el(id);
    if (s) s.max = String((r.duration - 1e-4).toFixed(4));
  }
  if (view.t > r.duration) { view.t = 0; showTime(0); }

  // The verdict, on the button that opens the readout. On a phone the rail is
  // off screen, and "this state resolves to nothing" is the one thing this tool
  // exists to say — so it is said on the bar rather than one tap away.
  const btn = el("mInfoBtn");
  if (btn) {
    const bad = r.rig && !r.ok;
    btn.classList.toggle("is-bad", bad);
    el("mResolved").textContent = !r.rig ? "loading rig…"
      : bad ? "NO CLIP"
      : r.alias ? "alias" : "resolved";
  }
}

// ----------------------------------------------------------------- the shell

function shell() {
  const mechOpts = MECHS.map((m) => `<option value="${m.key}">${m.name}</option>`).join("");
  // Grouped by tier so the list reads as "who owes this clip" — the library
  // states are shared, the archetype ones are per weapon class, the identity
  // ones are bespoke per mech, and a hole in each means something different.
  const group = (tier, label) => {
    const items = POSE_STATES.filter((s) => stateTier(s) === tier);
    if (!items.length) return "";
    return `<optgroup label="${label}">` + items.map((s) =>
      `<option value="${s.state}">${s.state}${s.alias ? ` → ${s.alias}` : ""}</option>`).join("") + "</optgroup>";
  };
  return `
    <header class="bar">
      <div class="bar-title">
        <strong>Pose workbench</strong>
        <span class="muted">${MECHS.length} mechs · ${POSE_STATES.length} states</span>
        <a class="bar-link" href="./">← effect workbench</a>
        <a class="bar-link" href="?edit=cards">card workbench →</a>
      </div>
      <div class="bar-tools bar-tools--desk">
        <label class="tool">Mech <select id="mech">${mechOpts}</select></label>
        <label class="tool">Pose <select id="pose">
          ${group("library", "library — shared locomotion & defense")}
          ${group("archetype", "archetype — the normals")}
          ${group("identity", "identity — bespoke per mech")}
        </select></label>
        <label class="tool">Clip time
          <input id="timeSlider" type="range" min="0" max="1" step="0.005" value="0">
          <output id="timeOut">0.00s</output>
        </label>
        <button id="play" type="button">Play ▶</button>
        <button id="reset" type="button" class="primary">Reset view</button>
      </div>
      <p id="status" class="muted">booting…</p>
    </header>

    <main class="split split--pose">
      <section class="viewer">
        <div class="viewer-stage"><canvas id="poseCanvas"></canvas></div>
        <p class="viewer-note muted">
          Opens on the <strong>angle the game shows</strong> — render3d's
          ${inGameCameraDeg()}° lens with pose.js's per-state presentation pin
          applied, exactly as in a match. <strong>Drag</strong> to orbit,
          <strong>scroll</strong> to dolly, <strong>Reset view</strong> to go
          back to the game's camera. Nothing here is editable: every number is
          read out of the engine.
        </p>
      </section>
      <aside id="rail" class="rail rail--pose">
        <h2 class="rail-head">What the loader resolved</h2>
        <dl id="readout" class="readout"></dl>
        <p class="muted rail-foot">
          A state that resolves to <em>nothing</em> has no <code>glb</code>
          mapping for this rig — the hole is in
          <code>tools/mech_intake.mjs</code>, and the fighter draws the
          placeholder body in game. An <em>alias</em> is a state that never had
          its own clip and borrows one on purpose
          (<code>render3d/src/states.js</code>).
        </p>
      </aside>
    </main>

    <!-- The phone's chrome. In the markup on every screen, hidden by the
         stylesheet above the breakpoint; the desk toolbar is hidden below it.
         Neither is a copy of the other's layout — they are two controls over
         the one piece of state, kept in step by setMech / setPose. -->
    <nav class="mbar">
      <div class="mscrub">
        <button id="playM" class="mbtn mbtn--icon" type="button" aria-label="Play or pause the clip">▶</button>
        <input id="timeSliderM" type="range" min="0" max="1" step="0.005" value="0" aria-label="Clip time">
        <output id="timeOutM">0.00s</output>
      </div>
      <div class="mrow">
        <button class="mbtn" type="button" data-sheet="mech">
          <span class="mbtn-k">Mech</span><span class="mbtn-v" id="mMech">—</span>
        </button>
        <button class="mbtn" type="button" data-sheet="pose">
          <span class="mbtn-k">Pose</span><span class="mbtn-v" id="mPose">—</span>
        </button>
        <button class="mbtn" type="button" id="mInfoBtn" data-sheet="info">
          <span class="mbtn-k">Loader</span><span class="mbtn-v" id="mResolved">…</span>
        </button>
        <button class="mbtn mbtn--icon" id="resetM" type="button" aria-label="Reset the view to the game's camera">⟳</button>
      </div>
    </nav>

    <section class="sheet" id="sheetMech">
      <h3 class="sheet-title">Which mech · ${MECHS.length} in the roster</h3>
      <div class="picklist" id="mechList"></div>
    </section>

    <section class="sheet" id="sheetPose">
      <h3 class="sheet-title">Which pose · ${POSE_STATES.length} states</h3>
      <div class="picklist" id="poseList"></div>
    </section>`;
}

/** The phone's two pickers. Lists rather than dropdowns: a native select on a
 *  handset is a wheel of truncated strings, and these carry what the choice is
 *  actually made on — the mech's key, and whether a state is an alias for
 *  somebody else's clip. */
function buildPickers(onMech, onPose) {
  const mechList = el("mechList");
  for (const m of MECHS) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "pick";
    b.dataset.mech = m.key;
    b.innerHTML = `<span>${m.name}</span><span class="pick-sub">${m.key}</span>`;
    b.addEventListener("click", () => onMech(m.key));
    mechList.append(b);
  }

  const poseList = el("poseList");
  const TIERS = [
    ["library", "library — shared locomotion & defense"],
    ["archetype", "archetype — the normals"],
    ["identity", "identity — bespoke per mech"],
  ];
  for (const [tier, label] of TIERS) {
    const items = POSE_STATES.filter((s) => stateTier(s) === tier);
    if (!items.length) continue;
    const head = document.createElement("p");
    head.className = "pick-group";
    head.textContent = label;
    poseList.append(head);
    for (const s of items) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "pick";
      b.dataset.pose = s.state;
      b.innerHTML = `<span>${s.state}</span>` +
        (s.alias ? `<span class="pick-sub">plays ${s.alias}</span>`
                 : `<span class="pick-sub">${s.loop ? "loops" : `${s.duration.toFixed(2)}s`}</span>`);
      b.addEventListener("click", () => onPose(s.state));
      poseList.append(b);
    }
  }
}

/** A state's authoring tier, taken from the state table (library / archetype /
 *  identity), falling back to library for anything unlabelled. */
function stateTier(s) {
  return s.tier || "library";
}

// ----------------------------------------------------------------------- boot

export async function boot(root) {
  readURL();
  root.innerHTML = shell();
  el("mech").value = view.mech;
  el("pose").value = view.pose;

  const status = el("status");
  status.textContent = "loading the renderer…";
  await bootRenderer();

  canvas = el("poseCanvas");
  view.orbit = attachOrbit(canvas, () => draw());
  new ResizeObserver(() => draw()).observe(canvas.parentElement);

  const changed = () => {
    writeURL();
    refreshReadout();
    ensureRig(view.mech);
    draw();
    // The rig lands asynchronously with no event to hang off, so the readout
    // and the viewer are refreshed a few times over the next few seconds.
    const say = () => {
      status.textContent = rigReady(view.mech)
        ? `${view.mech} · ${view.pose}` : `loading ${view.mech}'s rig…`;
    };
    say();
    // The rig lands asynchronously with no event to hang off. Until it does,
    // resolveClip cannot answer and the readout would report "NOTHING" for a
    // state that is fine — so both the readout and the status are re-asked.
    const mech = view.mech;
    whenRigReady(mech).then(() => {
      if (view.mech !== mech) return;   // the dropdown moved on while it loaded
      refreshReadout(); say(); draw();
    });
    for (const ms of [400, 1000, 2200, 4500, 8000]) {
      setTimeout(() => { refreshReadout(); say(); draw(); }, ms);
    }
  };

  // A pick on the phone closes the sheet it was made in: the choice was made to
  // look at something, so the thing being looked at gets the screen back.
  const pickMech = (key) => { setMech(key, changed); sheets?.close(); };
  const pickPose = (state) => { setPose(state, changed); sheets?.close(); };
  buildPickers(pickMech, pickPose);

  sheets = attachSheets(root, {
    mech: { el: el("sheetMech"), title: "Mech" },
    pose: { el: el("sheetPose"), title: "Pose" },
    info: { el: el("rail"), title: "What the loader resolved" },
  });

  el("mech").addEventListener("change", (e) => setMech(e.target.value, changed));
  el("pose").addEventListener("change", (e) => setPose(e.target.value, changed));
  for (const id of ["timeSlider", "timeSliderM"]) {
    el(id).addEventListener("input", (e) => scrubTo(Number(e.target.value)));
  }
  for (const id of ["play", "playM"]) {
    el(id).addEventListener("click", () => setPlaying(!view.playing));
  }
  for (const id of ["reset", "resetM"]) {
    el(id).addEventListener("click", () => { view.orbit.reset(); draw(); });
  }

  syncPickers();
  view.last = performance.now();
  requestAnimationFrame(tick);
  changed();
}
