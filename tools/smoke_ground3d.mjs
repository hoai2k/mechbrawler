// Do the 3D rigs stand ON the platforms, or sink through them?
//
// THE BUG THIS EXISTS FOR. The two ground solvers in render3d/src/pose.js —
// standOnGround (drop the body until its feet reach the floor) and plantFeet
// (push a foot that has sunk below the floor back up) — both read a foot's
// WORLD y and compared it against 0. That is the floor only while the rig
// stands at the world origin, which is exactly how the offscreen blit poses
// it. `?camera=3d` does not: models.js puts the rig at the platform's own
// height, so a fighter on a raised platform read as standing half a metre in
// the air, and the correction hauled them down by its whole clamp — feet
// through the deck on every platform except the main one, which sits at world
// y = 0 and therefore looked fine. The clamp is why the number was ~0.6 m of
// rig, and why it was the same on every raised platform.
//
// So the check is: park a fighter on each platform in turn and measure the
// SOLE — the lowest drawn vertex of the posed mesh — against the platform's
// top. Not a Box3, whose AABB for a SkinnedMesh is the bind pose through the
// root transform and nowhere near the posed feet (believing it hid this bug
// from an early version of the probe); and not the lowest foot BONE either,
// which is the ankle on a mech and read as a constant 73 px of float.
//
// TWO BOARDS, because world y = 0 is sim y 568 and the sign of the error
// matters. Neon District's main platform sits at 570, all but exactly there
// (which is why the bug looked like "every platform but the bottom one");
// Harbor terraces from 574 up to 255, so most of its stage is on the other
// side of the origin — the case where the foot IK's world-space test fires
// instead of silently doing nothing.
//
// These were Training Bridge and Garden Steps, two JJK boards, until the arenas
// were replaced; the pair above is chosen on the same property, measured off
// src/stages.js rather than remembered.
//
// The probe measures the lowest DRAWN vertex of the posed mesh, not the lowest
// foot bone — see the long note at the measurement itself for why that
// distinction cost this tool its credibility on the mech roster.
//
// Needs playwright + Chromium (CHROMIUM_PATH to override) and the game served:
//   node server.mjs   then:  node tools/smoke_ground3d.mjs [baseUrl]

import { chromium } from "playwright";
import { pressStart, pickAnyFighter } from "./smoke_boot.mjs";

const BASE = process.argv[2] || "http://127.0.0.1:5174";

// Sim pixels of slack between the sole and the platform's top.
//
// Not zero, because the sole is SAMPLED rather than scanned exhaustively (see
// the measurement) and the CPU picks a different opponent every run. Now that
// the probe measures the drawn mesh instead of the ankle bone the settled
// reading is 0.04–0.26 px across both boards, so six is a wide margin rather
// than a tuned one — and still seven times smaller than the bug it is here to
// catch (≈40 px, the ±0.6 m clamp through the rig scale). A regression does
// not creep in at this size; it arrives at the clamp.
const TOLERANCE = 6;

let failures = 0;
const check = (ok, label, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${detail ? `   ${detail}` : ""}`);
};

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-proxy-server", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on("pageerror", (e) => console.log("[pageerror]", e.message));

await page.goto(`${BASE}/index.html?render=3d`);
await pressStart(page);

// [stage-grid index, board key] — see the note at the top on why two.
const BOARDS = [[0, "neon"], [3, "harbor"]];
for (const [gridIndex, board] of BOARDS) await run(gridIndex, board);

await browser.close();
console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exit(failures ? 1 : 0);

async function run(gridIndex, board) {
await pickAnyFighter(page);
await page.click("#startButton");
await page.waitForSelector(".stage-card", { timeout: 8000 });
await page.locator(".stage-card").nth(gridIndex).click();
await page.waitForFunction(() => window.__render3d?.ready === true, { timeout: 180000 });

// The phase blips through `playing` during round setup, so settle on a match
// that has platforms, fighters and a clock that is actually advancing.
let settled = null;
for (let i = 0; i < 240; i++) {
  settled = await page.evaluate(async () => {
    const { state } = await import("/src/state.js");
    return { phase: state.phase, plats: state.platforms.length, t: state.matchTime || 0 };
  });
  if (settled.phase === "playing" && settled.plats > 0 && settled.t > 3) break;
  await page.waitForTimeout(500);
}
check(settled.phase === "playing" && settled.plats > 0,
  `${board}: a match with platforms is running`, JSON.stringify(settled));

const plats = await page.evaluate(async () =>
  (await import("/src/state.js")).state.platforms
    .map((p) => ({ kind: p.kind, y: p.y })));
check(plats.some((p) => p.kind !== "main"),
  `${board}: has a platform above the main stage (the case that broke)`,
  plats.map((p) => `${p.kind}@${p.y}`).join(" "));

let measured = 0;
for (let i = 0; i < plats.length; i++) {
  // Hold the fighter on this platform: the sim keeps running, so a one-shot
  // assignment would be walked off by the CPU before the rig is read.
  await page.evaluate((idx) => {
    if (window.__pin) clearInterval(window.__pin);
    window.__pin = setInterval(async () => {
      const { state } = await import("/src/state.js");
      const p = state.platforms[idx];
      if (!p) return;
      // ONE rig on screen, and it is standing still. The CPU opponent keeps
      // acting whatever is done to it, and an attack pose is not a GROUNDED
      // state — its foot belongs to the clip, not to the ground solver — so a
      // reading taken during one measures nothing at all. Holding them off
      // screen (models.js skips a respawning fighter) leaves exactly the rig
      // this test is about.
      state.fighters.forEach((f, i) => {
        if (i > 0) { f.respawnTimer = 1; return; }
        f.x = p.x + p.w / 2; f.y = p.y; f.vx = 0; f.vy = 0;
        f.grounded = true; f.animKey = "idle"; f.animTime = 0.3;
        f.facing = 1; f.facingVis = 1;
        f.action = null; f.charging = null; f.hitstun = 0; f.shielding = false;
      });
    }, 8);
  }, i);
  await page.waitForTimeout(1500);

  const m = await page.evaluate(async (idx) => {
    const { state } = await import("/src/state.js");
    const { debugScene } = await import("/src/camera3d/index.js");
    const THREE = await import("/vendor/three/three.module.js");
    const { models } = debugScene();
    const { CAMERA } = await import("/src/config_camera.js");
    const p = state.platforms[idx];
    const out = {
      kind: p.kind, y: p.y, rigs: [],
      who: `${state.fighters[0].spriteChar || state.fighters[0].charKey}`
        + `/${state.fighters[0].animKey}`,
    };
    // THE LOWEST DRAWN POINT, not the lowest bone.
    //
    // This used to take the lowest bone matching /foot|toe/ and call it the
    // sole. That holds for a human rig, where the foot bone sits a centimetre
    // inside the shoe, and it does not hold for a mech: the ankle joint is the
    // lowest bone and the foot assembly — tracks, pads, splayed toes — hangs
    // well below it. Every mech therefore read as floating by a constant
    // ~73 px, on every platform of every board, which is exactly the shape a
    // measurement error makes and not the shape of the bug this tool exists
    // for (that one varies with platform height).
    //
    // Skinning happens on the GPU, so a bounding box off the geometry is the
    // BIND pose, not the posed one. `applyBoneTransform` is three's exact
    // CPU-side answer for one vertex, so the sole is found by asking it for
    // vertices and keeping the lowest.
    //
    // SAMPLED, because a mech is tens of thousands of vertices and this runs
    // per platform per board. The stride is chosen to look at ~3000 per mesh,
    // which finds the sole to well inside the 6 px tolerance — the foot is a
    // large flat region, not a single spike. A full scan would be exact and
    // roughly twenty times slower for no change in verdict.
    const SAMPLES = 3000;
    for (const c of models.children) {
      if (!c.visible || c.children.some((x) => x.isLight)) continue;
      c.updateWorldMatrix(true, true);
      let low = null;
      const v = new THREE.Vector3();
      c.traverse((o) => {
        const pos = o.isMesh && o.geometry?.attributes?.position;
        if (!pos) return;
        const stride = Math.max(1, Math.floor(pos.count / SAMPLES));
        for (let i = 0; i < pos.count; i += stride) {
          v.fromBufferAttribute(pos, i);
          // Skinned meshes deform; static props (a prop bone's mesh) do not.
          if (o.isSkinnedMesh) o.applyBoneTransform(i, v);
          o.localToWorld(v);
          if (low === null || v.y < low) low = v.y;
        }
      });
      if (low === null) continue;
      // World y back into sim pixels, positive = below the platform's top.
      out.rigs.push(+((c.position.y - low) / CAMERA.simScale).toFixed(2));
    }
    return out;
  }, i);

  if (!m.rigs.length) {
    console.log(`--  ${board} ${m.kind}@${m.y}: no rig on screen, skipped`);
    continue;
  }
  measured++;
  const worst = Math.max(...m.rigs.map(Math.abs));
  check(worst <= TOLERANCE,
    `${board} ${m.kind} platform (sim y ${m.y}): feet stand on the deck`,
    `worst ${worst.toFixed(2)} px, tolerance ${TOLERANCE} — ${m.who}`);
}
await page.evaluate(() => { if (window.__pin) clearInterval(window.__pin); });

check(measured >= 2, `${board}: measured a rig on more than one platform height`,
  `${measured} platform(s)`);

// Back to the menu for the next board.
await page.keyboard.press("Escape");
await page.waitForTimeout(200);
await page.click("#pauseMenuButton");
await page.waitForTimeout(400);
}
