// A rolling mech turns in the SCREEN plane, about its own centre.
//
// Two faults this covers, both of which made a roll look like it was turning
// about some other axis entirely:
//
//   1. THE ORDER. `rotation.y` on the rig root carries the facing and the
//      presentation angle; the roll is `rotation.z` on the same object. Three
//      composes an Euler as XYZ by default, applying Z first and then yawing
//      the result — so the roll axis was the body's local Z carried round by the
//      yaw. At the angles this game presents a travel state at, almost all of a
//      45° roll became DEPTH: the mech swung toward the lens instead of tipping.
//   2. THE PIVOT. `comFrac` (src/body_points.js) is a fraction of the DRAWN
//      height, placed by eye. A rig is a different body — an ordinary biped's
//      spine sits around 0.58 — so the model turned about a point that was not
//      its centre.
//
// Needs playwright + Chromium (CHROMIUM_PATH to override) and the game served:
//   node server.mjs   then:  node tools/smoke_roll_axis.mjs [baseUrl]

import { chromium } from "playwright";
import { pressStart, pickAnyFighter } from "./smoke_boot.mjs";

const BASE = process.argv[2] || "http://127.0.0.1:5174";

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-proxy-server", "--enable-unsafe-swiftshader"],
});

let failed = 0;
const check = (ok, msg, detail = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${msg}${detail ? `   ${detail}` : ""}`);
};

// The mech whose roll is driven below. Any rigged mech would do; a heavyweight
// is simply the easiest to see a wrong axis on.
const WANT = "titanus";

const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on("pageerror", (e) => console.log("[pageerror]", e.message));
await page.goto(BASE);
await pressStart(page);
await page.evaluate(async (k) => {
  const { state } = await import("/src/state.js");
  state.selection[1] = k;
}, WANT);
await pickAnyFighter(page);
await page.evaluate(async (k) => {
  const { state } = await import("/src/state.js");
  state.selection[1] = k; state.roster[1] = k;
}, WANT);
await page.click("#startButton");
await page.waitForSelector(".stage-card", { timeout: 30000 });
await page.locator(".stage-card").nth(0).click();
for (let w = 0; ; w += 250) {
  const live = await page.evaluate(async () => {
    const { state } = await import("/src/state.js");
    return state.phase === "playing" && state.fighters.length > 1;
  });
  if (live) break;
  if (w > 180000) throw new Error("match never started");
  await page.waitForTimeout(250);
}
// The rigs arrive over the first seconds of the match; the reads below are all
// about a loaded skeleton.
await page.waitForTimeout(8000);

// ---------------------------------------------------------------- the arithmetic
//
// Composition and pivot in isolation, including a reproduction of the fault, so
// a regression is told apart from a fixture that simply stopped working.
const r = await page.evaluate(async (want) => {
  const THREE = await import("/vendor/three/three.module.js");
  const rigs = await import("/render3d/src/loader.js");
  const { comFrac } = await import("/src/body_points.js");
  const { CHARACTER_KEYS } = await import("/src/characters.js");

  // The composition, exactly as src/camera3d/models.js builds it: a yaw from the
  // pose layer, a roll from the tumble, on one object.
  const headAfterRoll = (order, yawDeg, rollDeg) => {
    const o = new THREE.Object3D();
    o.rotation.order = order;
    o.rotation.y = (yawDeg * Math.PI) / 180;
    o.rotation.z = (rollDeg * Math.PI) / 180;
    o.updateMatrixWorld(true);
    const v = new THREE.Vector3(0, 1, 0).applyMatrix4(o.matrixWorld);
    return { x: +v.x.toFixed(3), y: +v.y.toFixed(3), z: +v.z.toFixed(3) };
  };

  const rigged = [];
  for (const key of CHARACTER_KEYS) {
    const measured = rigs.rigComFrac(key);
    if (measured !== null) rigged.push({ key, measured, authored: +comFrac(key).toFixed(3) });
  }
  return {
    depthAt80: headAfterRoll("XYZ", 80, 45),
    fixedAt80: headAfterRoll("ZYX", 80, 45),
    fixedAt60: headAfterRoll("ZYX", 60, 45),
    rigged,
    wantMeasured: rigs.rigComFrac(want),
  };
}, WANT);

const near = (a, b) => Math.abs(a - b) < 0.01;
check(near(r.fixedAt80.x, -0.707) && near(r.fixedAt80.y, 0.707) && near(r.fixedAt80.z, 0),
  "a 45° roll turns in the screen plane at a travel-state yaw",
  `head at (${r.fixedAt80.x}, ${r.fixedAt80.y}, ${r.fixedAt80.z})`);
check(near(r.fixedAt60.x, -0.707) && near(r.fixedAt60.z, 0),
  "...and at a stand's yaw, which is the same answer",
  `head at (${r.fixedAt60.x}, ${r.fixedAt60.y}, ${r.fixedAt60.z})`);
check(Math.abs(r.depthAt80.z) > 0.5,
  "(the old order really did send the roll into depth — the fault is reproduced here)",
  `XYZ at yaw 80° put the head at z=${r.depthAt80.z}, against 0`);

check(r.rigged.length > 0, "the rigs report a measured centre of mass",
  `${r.rigged.length} of the roster`);
check(r.rigged.every((x) => x.measured > 0.3 && x.measured < 0.8),
  "...and every one of them is somewhere a torso could be",
  r.rigged.slice(0, 4).map((x) => `${x.key} ${x.measured}`).join(", "));
// The authored fractions are all still the roster default (config_body_points.js
// BODY_POINTS is empty), so measuring off the spine has to move the pivot for
// most of the roster — otherwise the measurement is not being used.
const moved = r.rigged.filter((x) => Math.abs(x.measured - x.authored) > 0.05);
check(moved.length > 0,
  "...and it is not just the authored number again where the two bodies differ",
  `${moved.length} mech(s) differ, e.g. ${moved.slice(0, 3)
    .map((x) => `${x.key} rig ${x.measured} vs authored ${x.authored}`).join("; ")}`);

// ---------------------------------------------------------------- the shipped path
//
// Everything above is arithmetic; the thing that regresses is a line in
// src/camera3d/models.js. Put a real mech into a real roll in a real match and
// read the rig back.
const live = await page.evaluate(async () => {
  const { state } = await import("/src/state.js");
  const rigs = await import("/render3d/src/loader.js");
  const { fighterTransform } = await import("/src/motion.js");
  const a = state.fighters[0];
  a.aiState = null;
  const main = state.platforms.find((p) => p.kind === "main");
  // The turn comes from the ACTION, not the clip: motion.js gives a grounded
  // dodge a full TAU across its duration ("a roll that actually rolls"), so a
  // fifth of the way through is a roll clearly in progress.
  const inst = rigs.acquireInstance(a.charKey, a.id);
  // RETRIED, because the fixture shares its mech with the REAL game loop: the
  // loop steps the action's clock and can expire or replace it between the pin
  // and the render. Re-pin and read again until a frame really caught the roll
  // mid-turn; a genuine axis fault still fails every attempt.
  let out = null;
  for (let tries = 0; tries < 8; tries++) {
    Object.assign(a, {
      x: 640, y: main.y, vx: 300, vy: 0, grounded: true, facing: 1, facingVis: 1,
      hitstun: 0, dead: false, respawnTimer: 0, invuln: 0,
    });
    a.action = { kind: "dodge", t: 0.08, dur: 0.4, anim: "dodge_roll", lockMovement: true };
    await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
    out = {
      charKey: a.charKey,
      order: inst?.root?.rotation?.order || null,
      rollRad: +(inst?.root?.rotation?.z ?? 0).toFixed(4),
      yawRad: +(inst?.root?.rotation?.y ?? 0).toFixed(4),
      motionRot: +(fighterTransform(a).rotation || 0).toFixed(4),
    };
    // BOTH: the facing sweep passes through zero while a mech turns to face its
    // opponent, and a sample landing on that frame has a roll but no yaw — which
    // is not the composition being tested.
    if (Math.abs(out.rollRad) > 0.01 && Math.abs(out.yawRad) > 0.01) break;
  }
  return out;
});

check(live.order === "ZYX",
  "the live model layer composes the roll outside the yaw",
  `${live.charKey}'s rig root is on ${live.order} order`);
check(Math.abs(live.rollRad) > 0.01 && Math.abs(live.yawRad) > 0.01,
  "...on a mech that is really both rolling and turned",
  `roll ${live.rollRad} rad, yaw ${live.yawRad} rad, motion says ${live.motionRot}`);

// AIRBORNE, THE MASS HOLDS STILL. The rig's origin is on the floor between the
// feet, so anchoring there makes the clip's own movement of the hips read as the
// whole mech bobbing — and mid-somersault there are no feet on anything for the
// anchor to mean. Sweep a roll and watch where the centre goes.
const drift = await page.evaluate(async () => {
  const { state } = await import("/src/state.js");
  const rigs = await import("/render3d/src/loader.js");
  const a = state.fighters[0];
  const main = state.platforms.find((p) => p.kind === "main");
  const inst = rigs.acquireInstance(a.charKey, a.id);
  const bones = {};
  inst.root.traverse((o) => { if (o.isBone) bones[o.name] = o; });
  // Same order pose.js COM_BONES searches in, so this reads the bone the shipped
  // code actually anchored to.
  const spine = bones.torso || bones.hips || bones.Spine || bones.mixamorigSpine
    || bones.Spine1 || bones.Hips || bones.mixamorigHips;
  if (!spine) return null;
  const origins = [];
  const centres = [];
  const pin = (t) => {
    Object.assign(a, { x: 640, y: main.y - 260, vx: 300, vy: 0, grounded: false,
      hitstun: 0, dead: false, respawnTimer: 0, invuln: 0 });
    a.action = { kind: "dodge", t, dur: 0.4, anim: "dodge_roll", lockMovement: true };
  };
  for (let i = 0; i <= 8; i++) {
    // Re-pinned on both sides of the frame: gravity would otherwise carry the
    // mech down between them and the fall would be measured as pose drift.
    pin((i / 8) * 0.4);
    await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
    pin((i / 8) * 0.4);
    await new Promise((res) => requestAnimationFrame(res));
    inst.root.updateMatrixWorld(true);
    centres.push(spine.matrixWorld.elements[13]);
    origins.push(inst.root.position.y);
  }
  const span = (v) => Math.max(...v) - Math.min(...v);
  return { comSpan: +span(centres).toFixed(4), originSpan: +span(origins).toFixed(4) };
});

if (drift === null) {
  check(false, "airborne, the centre of mass holds still through a whole roll",
    "this mech's rig has no COM bone to measure");
} else {
  // 0.08, not the ~0.001 the mechanism itself measures: the fixture shares its
  // mech with the live loop, so up to two sim steps of gravity land between each
  // pin and its render and read as drift. A foot-anchored rig measured an order
  // of magnitude more, with the ORIGIN steadier than the centre, so the pair of
  // checks still separates cleanly.
  check(drift.comSpan < 0.08,
    "airborne, the centre of mass holds still through a whole roll",
    `centre moved ${drift.comSpan} world units across the turn`);
  check(drift.originSpan > drift.comSpan,
    "...which is the origin doing the moving instead, as it should be",
    `origin moved ${drift.originSpan} against the centre's ${drift.comSpan}`);
}

await browser.close();
console.log(failed ? `\n${failed} check(s) failed` : "\nall roll-axis checks passed");
process.exit(failed ? 1 : 0);
