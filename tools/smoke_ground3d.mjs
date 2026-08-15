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
// lowest FOOT BONE against the platform's top. Bones, not a Box3 — the AABB
// of a SkinnedMesh is its bind pose through the root transform, which is
// nowhere near the posed feet, and believing it hid this bug from an earlier
// version of the probe.
//
// TWO BOARDS, because world y = 0 is sim y 568 and the sign of the error
// matters. Training Bridge's main platform sits exactly there (which is why
// the bug looked like "every platform but the bottom one"); Garden Steps
// terraces from 584 up to 294, so its whole stage is on the other side of the
// origin — the case where the foot IK's world-space test fires instead of
// silently doing nothing.
//
// Needs playwright + Chromium (CHROMIUM_PATH to override) and the game served:
//   node server.mjs   then:  node tools/smoke_ground3d.mjs [baseUrl]

import { chromium } from "playwright";
import { pressStart } from "./smoke_boot.mjs";

const BASE = process.argv[2] || "http://127.0.0.1:5174";

// Sim pixels of slack between the lowest foot bone and the platform's top.
//
// Not zero, because the FOOT BONE is not the sole: it is the ankle joint, and
// how far inside the boot mesh it sits is a fact about each delivered rig, not
// about this code — across the roster the settled reading runs 0–3.5 px, and
// the CPU picks a different opponent every run. Six is comfortably above that
// spread, comfortably below what reads as sinking, and seven times smaller
// than the bug it is here to catch (≈40 px, the ±0.6 m clamp through the rig
// scale). A regression does not creep in at this size; it arrives at the
// clamp.
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
const BOARDS = [[0, "trainingBridge"], [5, "gardenSteps"]];
for (const [gridIndex, board] of BOARDS) await run(gridIndex, board);

await browser.close();
console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exit(failures ? 1 : 0);

async function run(gridIndex, board) {
await page.click('[data-character="nobara"]');
await page.waitForTimeout(300);
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
    for (const c of models.children) {
      if (!c.visible || c.children.some((x) => x.isLight)) continue;
      c.updateWorldMatrix(true, true);
      let low = null;
      c.traverse((o) => {
        if (!o.isBone || !/foot|toe/i.test(o.name)) return;
        const w = new THREE.Vector3().setFromMatrixPosition(o.matrixWorld);
        if (low === null || w.y < low) low = w.y;
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
