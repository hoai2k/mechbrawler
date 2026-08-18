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
//   2. THE PIVOT. Every mech turned about a roster-wide 0.55 of drawn height,
//      because src/config_body_points.js is empty and that was the only answer
//      body_points.comFrac had. It is measured per mech and per state now
//      (tools/derive_com.mjs), and the checks below hold the game to answering
//      with the measurement — a pivot that is not the number body_points hands
//      out is a pivot nothing else in the game shares, which is exactly how an
//      airborne mech ended up anchored to one point and rotated about another.
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
  const { comFrac } = await import("/src/body_points.js");
  const { MODEL_COM } = await import("/src/config_model_com.js");
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

  // Every mech's measured centre, and what the game answers with for it — the
  // two must agree, because a pivot that is not what body_points hands out is a
  // pivot nothing else in the game shares.
  const rigged = [];
  for (const key of CHARACTER_KEYS) {
    const measured = MODEL_COM[key]?.base ?? null;
    if (measured !== null) rigged.push({ key, measured, resolved: +comFrac(key).toFixed(4) });
  }
  return {
    depthAt80: headAfterRoll("XYZ", 80, 45),
    fixedAt80: headAfterRoll("ZYX", 80, 45),
    fixedAt60: headAfterRoll("ZYX", 60, 45),
    rigged,
    rosterSize: CHARACTER_KEYS.length,
    statesMeasured: Object.values(MODEL_COM).reduce((n, m) => n + Object.keys(m.states || {}).length, 0),
    wantMeasured: MODEL_COM[want]?.base ?? null,
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

check(r.rigged.length === r.rosterSize,
  "EVERY mech has a measured centre of mass, not just the ones a bone search understood",
  `${r.rigged.length} of ${r.rosterSize}`);
check(r.rigged.every((x) => x.measured > 0.35 && x.measured < 0.7),
  "...and every one of them is somewhere a centre of mass could be",
  r.rigged.slice(0, 4).map((x) => `${x.key} ${x.measured}`).join(", "));
// The measurement is only worth having if the game actually answers with it.
const mismatched = r.rigged.filter((x) => Math.abs(x.measured - x.resolved) > 0.0005);
check(!mismatched.length,
  "...and body_points.comFrac hands out the measured number, not the 0.55 default",
  mismatched.length
    ? mismatched.slice(0, 3).map((x) => `${x.key} measured ${x.measured} but got ${x.resolved}`).join("; ")
    : `all ${r.rigged.length} agree`);
// A pose moves the mass, and the states that move it are the airborne ones —
// which is where an anchor that disagrees with its pivot used to show.
check(r.statesMeasured > 0,
  "...and the states that move the mass carry their own centre",
  `${r.statesMeasured} state override(s) across the roster`);

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

// NOTE ON WHAT IS NOT CHECKED HERE. An airborne body is still hung by its feet
// (src/camera3d/models.js says why), so there is no "the mass holds still
// through a roll" invariant to assert yet — an earlier version of this file
// checked exactly that against an implementation that tracked a chest bone, and
// tracking the chest is what left a mech floating. When a runtime centre of mass
// exists for both rig families, the check to add back is that the drawn body's
// centre moves LESS than its origin across a swept roll; measured today it moves
// more, which is the honest reason the anchor is not wired up.

await browser.close();
console.log(failed ? `\n${failed} check(s) failed` : "\nall roll-axis checks passed");
process.exit(failed ? 1 : 0);
