// EVERY MECH HAS A CENTRE OF MASS, THE GAME USES IT, AND EVERY MECH STANDS ON
// THE DECK.
//
// The centre of mass is the one point on a fighter that should hold STILL while
// everything else moves around it — the pivot a tumble turns about, the anchor an
// airborne body hangs from, the chest line an aim solves from, the centre a
// launched hurtbox hangs on. Three things have to hold for that to mean anything,
// and each was broken at some point:
//
//   1. IT IS KNOWN, for every mech. It used to be the roster-wide 0.55 for all
//      seventeen (src/config_body_points.js is empty), and a first attempt to
//      measure it off a named bone answered for five of them not at all and gave
//      the CHEST for the other twelve. It is weighed off the body itself now.
//   2. THE GAME ANSWERS WITH IT. A measurement nothing reads is decoration, and a
//      pivot that is not the number body_points hands out is a pivot nothing else
//      shares — which is how an airborne mech ended up anchored to one point and
//      rotated about another.
//   3. THE BODY STANDS ON THE FLOOR. A centre of mass measured as a fraction of
//      drawn height is only in the right PLACE if the drawing itself is in the
//      right place. smoke_ground3d checks this thoroughly, but only ever for the
//      mech it puts in the match, in whatever state it happened to be in — which
//      is why Saurion floating 66 px above the deck went unnoticed. This sweeps
//      the whole roster, across every grounded state, which is the only shape of
//      check that would have caught it.
//
// Needs playwright + Chromium (CHROMIUM_PATH to override) and the game served:
//   node server.mjs   then:  node tools/smoke_com.mjs [baseUrl]

import { chromium } from "playwright";
import { pressStart, pickAnyFighter } from "./smoke_boot.mjs";

const BASE = process.argv[2] || "http://127.0.0.1:5174";
// Sim pixels of slack between the lowest drawn point and the deck. The same
// reasoning smoke_ground3d's tolerance uses: the sole is SAMPLED, and a mech's
// foot is a broad flat region rather than a spike, so a few pixels is a wide
// margin. The fault this catches is an order of magnitude bigger.
const PLANT_TOLERANCE = 6;

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-proxy-server", "--enable-unsafe-swiftshader"],
});

let failed = 0;
const check = (ok, msg, detail = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${msg}${detail ? `   ${detail}` : ""}`);
};

const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on("pageerror", (e) => console.log("[pageerror]", e.message));
// `rigs=eager` so every mech is measurable in one match rather than seventeen.
await page.goto(`${BASE}/?rigs=eager`);
await page.waitForFunction(() => window.__render3d?.ready === true, { timeout: 300000 });
await pressStart(page);
await pickAnyFighter(page);
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
await page.waitForTimeout(4000);

// ---------------------------------------------------------- known, and used
const known = await page.evaluate(async () => {
  const { comFrac } = await import("/src/body_points.js");
  const { MODEL_COM } = await import("/src/config_model_com.js");
  const { CHARACTER_KEYS } = await import("/src/characters.js");
  return {
    roster: CHARACTER_KEYS.length,
    measured: CHARACTER_KEYS.filter((k) => typeof MODEL_COM[k] === "number").length,
    outOfBand: CHARACTER_KEYS.filter((k) => {
      const v = MODEL_COM[k];
      return typeof v === "number" && !(v > 0.35 && v < 0.7);
    }),
    disagreeing: CHARACTER_KEYS.filter((k) => {
      const v = MODEL_COM[k];
      return typeof v === "number" && Math.abs(comFrac(k) - v) > 0.0005;
    }),
  };
});

check(known.measured === known.roster,
  "every mech has a measured centre of mass",
  `${known.measured} of ${known.roster}`);
check(!known.outOfBand.length,
  "...and every one of them is somewhere a centre of mass could be",
  known.outOfBand.length ? known.outOfBand.join(", ") : "all within 0.35-0.70 of drawn height");
check(!known.disagreeing.length,
  "...and body_points.comFrac hands out the measurement, not the 0.55 default",
  known.disagreeing.length ? known.disagreeing.join(", ") : `all ${known.roster} agree`);

// ------------------------------------------------------ and standing on it
// The grounded states, from pose.js's own GROUNDED set. A rig can settle in its
// stance and float in a crouch or a knockdown — the correction is computed per
// pose, so one pose passing says nothing about the others.
// A spread rather than all twenty-two: a stance, both travel states, the two
// crouched poses, a swing, a knockdown and the getup off it. Each re-renders the
// whole roster, so the list is what fits in a smoke run — the shapes that differ
// (upright, moving, ducked, swinging, on the floor) are all represented.
const GROUNDED_STATES = [
  "idle", "walk", "run", "crouch", "crouchAttack",
  "sideHeavy", "hurt", "prone", "getup",
];

const plants = await page.evaluate(async ({ SAMPLES, GROUNDED_STATES }) => {
  const { state } = await import("/src/state.js");
  const { CHARACTER_KEYS } = await import("/src/characters.js");
  const { CAMERA } = await import("/src/config_camera.js");
  const rigs = await import("/render3d/src/loader.js");
  const THREE = await import("/vendor/three/three.module.js");
  const f = state.fighters[0];
  const main = state.platforms.find((p) => p.kind === "main");
  const out = [];
  for (const key of CHARACTER_KEYS) {
    for (const st of GROUNDED_STATES) {
    // Wear each mech in turn on a fighter the scene is already drawing, so this
    // measures the SHIPPED placement path rather than a rig posed on the side.
    f.spriteChar = key;
    Object.assign(f, { x: 640, y: main.y, vx: 0, vy: 0, grounded: true,
      hitstun: 0, dead: false, respawnTimer: 0, invuln: 0, action: null });
    try {
      Object.defineProperty(f, "animKey", { get: () => st, set: () => {}, configurable: true });
    } catch { /* already pinned */ }
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    await new Promise((r) => requestAnimationFrame(r));
    const inst = rigs.acquireInstance(key, f.id);
    if (!inst) { out.push({ key, state: st, error: "no instance" }); continue; }
    const root = inst.root;
    root.updateMatrixWorld(true);
    // THE LOWEST DRAWN POINT, not the lowest bone — smoke_ground3d says why at
    // length: on a mech the ankle is the lowest BONE and the foot assembly hangs
    // well below it. Skinning is on the GPU, so `applyBoneTransform` is the only
    // CPU-side answer for where a vertex really ended up.
    const v = new THREE.Vector3();
    let low = null;
    root.traverse((o) => {
      const pos = o.isMesh && !o.userData.isOutline && o.geometry?.attributes?.position;
      if (!pos) return;
      // The same BODY filter the settle uses (pose.js isBodyMesh): a chain or a
      // slung prop hangs below the feet by design and is not what "standing on
      // the deck" is about. Measuring it here and not there reports a mech as
      // sunk for carrying something.
      for (let q = o; q; q = q.parent) if (/^(Prop_|Chain_)/.test(q.name || "")) return;
      const stride = Math.max(1, Math.floor(pos.count / SAMPLES));
      for (let i = 0; i < pos.count; i += stride) {
        v.fromBufferAttribute(pos, i);
        if (o.isSkinnedMesh && o.applyBoneTransform) o.applyBoneTransform(i, v);
        o.localToWorld(v);
        if (low === null || v.y < low) low = v.y;
      }
    });
    if (low === null) { out.push({ key, state: st, error: "nothing drawn" }); continue; }
    // World y back into sim pixels. Positive = the body hangs below the foot
    // line, negative = it floats above it.
    out.push({ key, state: st, px: +((root.position.y - low) / CAMERA.simScale).toFixed(2) });
    }
  }
  f.spriteChar = null;
  return out;
}, { SAMPLES: 1500, GROUNDED_STATES });

const drawn = plants.filter((p) => !p.error);
const off = drawn.filter((p) => Math.abs(p.px) > PLANT_TOLERANCE);
const mechsDrawn = new Set(drawn.map((p) => p.key)).size;
check(mechsDrawn === known.roster, "every mech draws a body to measure",
  `${mechsDrawn} of ${known.roster}, over ${drawn.length} pose(s)`);
check(!off.length,
  "every mech stands on the deck rather than in the air, in every grounded state",
  off.length
    ? off.slice(0, 8).map((p) => `${p.key}/${p.state} ${p.px > 0 ? "sunk" : "floating"} ${Math.abs(p.px)}px`).join(", ")
      + (off.length > 8 ? ` (+${off.length - 8} more)` : "")
    : `worst ${Math.max(...drawn.map((p) => Math.abs(p.px))).toFixed(2)} px of ${PLANT_TOLERANCE}, over ${drawn.length} pose(s)`);

await browser.close();
console.log(failed ? `\n${failed} check(s) failed` : "\nall centre-of-mass checks passed");
process.exit(failed ? 1 : 0);
