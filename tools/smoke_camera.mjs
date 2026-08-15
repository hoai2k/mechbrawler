// Headless smoke for the 2.5D camera rig (src/camera3d/rig.js): runs the REAL
// updateCamera() and the rig against scripted fighter paths — no browser, no
// WebGL, three.js used only for its math — and asserts framing invariants:
//
//   * every alive fighter projects inside the frame with margin (neutral play)
//   * the dolly distance stays inside its clamps
//   * yaw and roll stay inside their configured bounds
//   * nothing goes NaN across KO, respawn, ult, domain, GAME and cue storms
//
// Run: node tools/smoke_camera.mjs
import { state } from "../src/state.js";
import { updateCamera } from "../src/camera.js";
import { updateRig, resetRig, worldToScreen, overlayTransform, dollyFor, camera } from "../src/camera3d/rig.js";
import { cameraCue } from "../src/camera_mode.js";
import { CAMERA, BOARD_CAMERA, CUES } from "../src/config_camera.js";
import { WORLD } from "../src/constants.js";

const DT = 1 / 60;
let failures = 0;
const check = (ok, label, detail = "") => {
  if (!ok) failures++;
  if (!ok) console.log(`FAIL ${label}${detail ? `   ${detail}` : ""}`);
};
const pass = (label) => console.log(`ok   ${label}`);

function fighter(id, x, y) {
  return { id, x, y, vx: 0, vy: 0, dead: false, respawnTimer: 0, action: null };
}

function resetState(stageKey = "trainingBridge") {
  state.stageKey = stageKey;
  state.platforms = [{ x: 248, y: 568, w: 784, h: 42, kind: "main" }];
  state.fighters = [fighter(1, 430, 568), fighter(2, 850, 568)];
  state.camera = { x: 640, y: 360, zoom: 1, shake: 0, kick: 0 };
  state.introT = 0;
  state.endT = 0;
  state.domainOverlay = null;
  resetRig();
}

const finite = (...ns) => ns.every(Number.isFinite);

function frameInvariants(label, { neutral = true } = {}) {
  const p = camera.position;
  check(finite(p.x, p.y, p.z), `${label}: camera position finite`, `${p.x},${p.y},${p.z}`);
  const q = camera.quaternion;
  check(finite(q.x, q.y, q.z, q.w), `${label}: camera orientation finite`);
  const t = overlayTransform();
  check(finite(t.a, t.b, t.c, t.d, t.e, t.f), `${label}: overlay transform finite`);
  if (neutral) {
    for (const f of state.fighters) {
      if (f.dead || f.respawnTimer > 0) continue;
      const s = worldToScreen(f.x, f.y - 90);
      check(s.x > -80 && s.x < WORLD.w + 80 && s.y > -80 && s.y < WORLD.h + 80,
        `${label}: fighter ${f.id} inside frame`, `(${Math.round(s.x)}, ${Math.round(s.y)})`);
    }
  }
}

function run(seconds, step) {
  const frames = Math.round(seconds / DT);
  for (let i = 0; i < frames; i++) {
    if (step) step(i * DT);
    updateCamera(DT);
    const out = updateRig(state, DT);
    check(finite(out.D, out.fov, out.yaw, out.roll, out.dollyMul), "rig outputs finite");
    // Global bounds, generous enough for boards' biases and every cue: the
    // dolly never collapses to the plane or backs out past the intro shot.
    check(out.D > 3 && out.D < dollyFor(1) * 1.5, "dolly inside clamps", `D=${out.D.toFixed(2)}`);
    check(Math.abs(out.yaw) < 12, "yaw bounded", `yaw=${out.yaw.toFixed(2)}`);
    check(Math.abs(out.roll) < 6, "roll bounded", `roll=${out.roll.toFixed(2)}`);
    check(out.fov > 20 && out.fov < 40, "fov bounded", `fov=${out.fov.toFixed(2)}`);
  }
}

// ---- 1. neutral play: converge, separate, run to the edges
resetState();
run(3, (t) => {
  state.fighters[0].x = 640 - 200 - Math.sin(t * 2) * 180;
  state.fighters[1].x = 640 + 200 + Math.sin(t * 2) * 180;
  state.fighters[0].vx = -Math.cos(t * 2) * 360;
  state.fighters[1].vx = Math.cos(t * 2) * 360;
});
frameInvariants("neutral spread");
run(3, () => {
  state.fighters[0].x = 300;
  state.fighters[1].x = 420;
});
frameInvariants("left-edge fight");
check(updateRig(state, DT).yaw < 0.01, "camera yaws toward a left-side fight");
pass("neutral play framing");

// ---- 2. intro pull-out eases to standard framing
resetState();
state.introT = 1.6;
let firstD = null;
run(1.9, (t) => {
  state.introT = Math.max(0, 1.6 - t);
  if (firstD === null) firstD = updateRig(state, DT).D;
});
const settled = updateRig(state, DT);
check(firstD > settled.D, "intro starts pulled out", `${firstD?.toFixed(2)} -> ${settled.D.toFixed(2)}`);
frameInvariants("after intro");
pass("round intro");

// ---- 3. KO -> blackout -> respawn never NaNs
resetState();
run(0.5);
state.fighters[1].dead = false;
state.fighters[1].respawnTimer = 0.65;
run(0.7, () => {
  state.fighters[1].respawnTimer = Math.max(0, state.fighters[1].respawnTimer - DT);
});
state.fighters[1].y = 250; // back on the revival platform
run(0.5);
frameInvariants("after respawn");
pass("KO / respawn transitions");

// ---- 4. ult cast dollies in on the caster, then releases
resetState();
state.fighters[0].action = { kind: "ult", t: 0, dur: 1.2 };
run(1.2, () => { state.fighters[0].action.t += DT; });
const ultShot = updateRig(state, DT);
check(ultShot.dollyMul < 0.93, "ult shot dollies in", `mul=${ultShot.dollyMul.toFixed(2)}`);
state.fighters[0].action = null;
run(2.5);
check(Math.abs(updateRig(state, DT).dollyMul - 1) < 0.08, "ult shot releases");
frameInvariants("after ult", { neutral: false });
pass("ult drama shot");

// ---- 5. domain: arrive tight, drift back out while the overlay runs
resetState();
state.fighters[0].action = { kind: "ult", t: 0, dur: 0.9 };
state.domainOverlay = { life: 9, maxLife: 9 };
run(0.9, () => { state.fighters[0].action.t += DT; });
state.fighters[0].action = null;
const early = updateRig(state, DT).dollyMul;
run(8, () => { state.domainOverlay.life -= DT; });
const late = updateRig(state, DT).dollyMul;
check(early < late, "domain drifts back out", `${early.toFixed(2)} -> ${late.toFixed(2)}`);
state.domainOverlay = null;
run(1);
frameInvariants("after domain", { neutral: false });
pass("domain drama shot");

// ---- 6. GAME: frame the winner head-on
resetState();
state.fighters[1].dead = true;
state.fighters[0].x = 300;
state.endT = 1.4;
run(1.2, () => { state.endT = Math.max(0.01, state.endT - DT); });
const endShot = updateRig(state, DT);
check(endShot.dollyMul < 0.85, "GAME shot dollies to the winner", `mul=${endShot.dollyMul.toFixed(2)}`);
check(Math.abs(endShot.yaw) < 1.5, "GAME shot faces head-on", `yaw=${endShot.yaw.toFixed(2)}`);
pass("GAME drama shot");

// ---- 7. every cue, at full strength, on the board that uses it
const CUE_BOARDS = {
  hush: "quietHall", surge: "floodedGate", frenzy: "shibuyaNight",
  fangSnap: "curseMaw", bloom: "gardenSteps", punch: "lanternCorridor",
  wallYaw: "neonSplit", rattle: "boneSanctum", layout: "academyHall",
  fog: "mistPier", inhale: "cursedTeeth", wind: "riverGate", lightning: "billboardRoof",
};
for (const [name, board] of Object.entries(CUE_BOARDS)) {
  resetState(board);
  cameraCue(name, 1);
  cameraCue(name, -1); // retrigger with flipped sign must not stack or NaN
  const def = CUES[name];
  run(Math.min(6, (def.attack ?? 0.1) + (def.hold ?? 0) + (def.release ?? 0.3) + 0.5));
  frameInvariants(`cue ${name}`, { neutral: false });
}
pass("all cues stay bounded");

// ---- 8. board personalities: kicks, shake, and drift-follow boards
for (const board of Object.keys(BOARD_CAMERA)) {
  resetState(board);
  state.camera.kick = 0.14;
  state.camera.shake = 16;
  run(1.5);
  frameInvariants(`board ${board}`, { neutral: false });
}
pass("board personalities stay bounded");

// ---- 9. the overlay affine really matches the projection (centre stage)
resetState();
run(2);
const T = overlayTransform();
const probe = (x, y) => ({ x: T.a * x + T.c * y + T.e, y: T.b * x + T.d * y + T.f });
// The projection of a tilted plane is a homography — the camera's pitch and
// height bias give the plane a ~1% per-100-px scale gradient no affine can
// carry — so the fit is PINNED at the mean fighter position: sub-pixel on the
// action, growing with distance from it, worst at an empty far corner. The
// things that must land exactly (hitbox debug, particles, popups riding the
// fighters) are at the anchor; a free-standing stage-FX drawing 400 px from
// the fight may sit a few px off its GL counterpart, which nothing overlaps.
// Tolerances are calibrated at the dynamic camera's tightest shot (ZOOM_MAX
// 1.32, camera.js): a closer dolly both magnifies the error in screen px and
// steepens the perspective the affine cannot carry — and at that zoom the far
// probes sit at or beyond the frame edge, where nothing aligned is drawn.
for (const [x, y, tol] of [[640, 568, 0.75], [500, 480, 0.75], [300, 400, 4], [1000, 250, 12]]) {
  const direct = worldToScreen(x, y);
  const affine = probe(x, y);
  const err = Math.hypot(direct.x - affine.x, direct.y - affine.y);
  check(err < tol, `affine fit within ${tol} px of true projection`, `err=${err.toFixed(3)} at (${x},${y})`);
}
pass(`overlay affine fit (fov=${CAMERA.fov}, yawMax=${CAMERA.yawMax})`);

console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exit(failures ? 1 : 0);
