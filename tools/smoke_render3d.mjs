// Smoke-test the render3d pipeline — phase D0's exit criteria, as a script.
//
// Three passes:
//
//   1. MANNEQUIN MATCH.  `?render=3d&mannequin=all` boots into a real
//      CPU-vs-CPU match. Asserts: the backend engaged, rigs registered,
//      poses rendered through the 3D pipeline, the ON-TWOS ECONOMY holds
//      (renders per second stays comfortably under samples-per-second ×
//      fighters — the cache doing its job), toon-shaded mannequin pixels
//      are on screen where a fighter stands, and no page errors (the 2D
//      context came through clean).
//
//   2. DETERMINISM.  Same pose token -> byte-identical pixels across a
//      cache clear. The afterimage trail replays tokens seconds later, so
//      a nondeterministic render shows as flickering ghosts.
//
//   3. DELIVERY PIPELINE.  Builds a throwaway .glb with billboard_test_rig,
//      runs it through intake with --backend 3d (validate -> import ->
//      approve), boots with NO mannequin flag, and asserts the delivered
//      rig registered from the render3d manifest, its clips resolve, and
//      the fighter draws through drawCharFrame. Restores everything.
//
// Needs `playwright` and Chromium (CHROMIUM_PATH to override), and the game
// served first:  node server.mjs   then:  node tools/smoke_render3d.mjs [baseUrl]

import { chromium } from "playwright";
import { pressStart } from "./smoke_boot.mjs";
import { execFileSync } from "child_process";
import { readFileSync, writeFileSync, rmSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const BASE = process.argv[2] || "http://127.0.0.1:5174";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST = join(ROOT, "render3d", "assets", "manifest.json");

// A key that can never be a fighter — this test fabricates a delivery under
// it, approves it, and deletes it from disk on the way out. It was `todo`
// while no fighter had a real model; once Todo got one, running the suite
// silently deleted him. See the same note in tools/smoke_billboard.mjs.
const TEST_CHAR = "__smoketest";

let failures = 0;
const check = (ok, label, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${detail ? `   ${detail}` : ""}`);
};

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-proxy-server"],
});

async function bootAndFight(page, url) {
  await page.goto(url);
  await pressStart(page);
  await page.waitForFunction(() => window.__render3d?.ready === true, { timeout: 30000 });
  await page.click('[data-character="gojo"]');
  await page.waitForTimeout(300);
  await page.click("#startButton");
  await page.waitForSelector(".stage-card", { timeout: 5000 });
  await page.locator(".stage-card").nth(0).click();
  // Wait for a SETTLED match — the same trap smoke_billboard.mjs documents.
  // The phase blips through `playing` with a stale fighter list during round
  // setup, so a single-shot condition catches that blip and then samples
  // during the asset load that follows, which reads as "the 3D pipeline
  // rendered nothing" when in truth the match had not begun. Requiring the
  // condition to hold across consecutive polls, with the clock genuinely
  // advancing, is what makes every number sampled after this mean something.
  let stable = 0;
  let last = -1;
  for (let waited = 0; stable < 3; waited += 500) {
    if (waited > 180000) throw new Error("match never settled");
    await page.waitForTimeout(500);
    const s = await page.evaluate(async () => {
      const { state } = await import("/src/state.js");
      return { phase: state.phase, n: state.fighters.length, t: state.matchTime || 0 };
    });
    stable = (s.phase === "playing" && s.n > 0 && s.t > 3 && s.t > last) ? stable + 1 : 0;
    last = s.t;
  }
}

// ------------------------------------------------- 1. mannequin match

{
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error" && !/404|Failed to load resource/.test(m.text())) errors.push(m.text());
  });

  await bootAndFight(page, `${BASE}/index.html?render=3d&mannequin=all&camera=flat`);
  const before = await page.evaluate(() => ({
    renders: window.__render3d.stats.renders, t: performance.now(),
  }));
  await page.waitForTimeout(4000);

  const r = await page.evaluate(async (before) => {
    const { state } = await import("/src/state.js");
    const { renderBackendName } = await import("/src/render_backend.js");
    const stats = window.__render3d.stats;
    const dials = window.__render3d.dials;
    const elapsed = (performance.now() - before.t) / 1000;
    // A BODY, drawn where a fighter stands.
    //
    // Two things were wrong with the version this replaces, and they hid each
    // other. It counted grey-BLUE pixels, on the reasoning that the toon
    // mannequin is grey-blue — which stopped meaning anything the moment every
    // fighter had a real model, since what it then measured was whether the
    // costume happened to be navy. And it sampled at the fighter's WORLD
    // coordinates, which are not canvas coordinates: the camera pans and zooms
    // (camera.js applyCamera), so the patch it looked at was somewhere else
    // entirely. Between them the check passed or failed at random.
    //
    // So: sample where the camera actually puts the fighter, and look for the
    // INK OUTLINE this backend draws every body with — hard local contrast,
    // measured against a same-sized patch of empty sky so a busy background
    // cannot pass for a fighter.
    const { WORLD } = await import("/src/constants.js");
    const c = document.getElementById("gameCanvas");
    const ctx = c.getContext("2d");
    const f = state.fighters.find((x) => !x.dead && x.respawnTimer <= 0);
    let hit = 0, sky = 0;
    if (f) {
      const cam = state.camera;
      const sx = c.width / WORLD.w, sy = c.height / WORLD.h;
      const toScreen = (wx, wy) => ({
        x: ((wx - cam.x) * cam.zoom + WORLD.w / 2) * sx,
        y: ((wy - cam.y) * cam.zoom + WORLD.h / 2) * sy,
      });
      const edges = (cx, cy, w, h) => {
        const x = Math.max(0, Math.min(c.width - w, Math.round(cx - w / 2)));
        const y = Math.max(0, Math.min(c.height - h, Math.round(cy)));
        const img = ctx.getImageData(x, y, w, h);
        const d = img.data;
        let n = 0;
        for (let py = 0; py < img.height; py++) {
          for (let px = 1; px < img.width; px++) {
            const i = ((py * img.width) + px) * 4;
            const j = i - 4;
            if (Math.abs(d[i] - d[j]) + Math.abs(d[i + 1] - d[j + 1])
                + Math.abs(d[i + 2] - d[j + 2]) > 90) n++;
          }
        }
        return n;
      };
      const w = Math.round(150 * sx * cam.zoom), h = Math.round(210 * sy * cam.zoom);
      const at = toScreen(f.x, f.y - 200);
      hit = edges(at.x, at.y, w, h);
      // Empty sky: the top of the frame, well above anybody's head.
      sky = edges(c.width / 2, 0, w, Math.round(h * 0.4));
    }
    return {
      backend: renderBackendName(), rigged: window.__render3d.rigged,
      renders: stats.renders, hits: stats.hits, misses: stats.misses,
      windowRenders: stats.renders - before.renders, elapsed,
      hz: dials.sampleHz, fighters: state.fighters.length,
      pixels: hit, sky, sampled: !!f,
    };
  }, before);

  check(r.backend === "3d", "the 3d backend is in force", r.backend);
  check(r.rigged >= 27, "a mannequin rig registered for the whole roster", `${r.rigged} rigs`);
  check(r.renders > 0, "poses were rendered through the 3D pipeline", `${r.renders} renders`);
  // The on-twos economy: live animation must not cost live rendering. Budget
  // = sampleHz per fighter (plus trail ghosts hitting cache, plus slack for
  // aim/parallax dimensions splitting tokens).
  const budget = r.hz * r.fighters * r.elapsed * 2.5;
  check(r.windowRenders <= budget, "renders/sec stays inside the on-twos budget",
    `${r.windowRenders} renders in ${r.elapsed.toFixed(1)}s vs budget ${Math.round(budget)}`);
  check(r.hits > r.misses, "the pose cache carries most frames", `${r.hits} hits / ${r.misses} misses`);
  check(r.sampled && r.pixels > 200 && r.pixels > r.sky * 3,
    "an inked 3D body is drawn where a fighter stands",
    `${r.pixels} edge px on the fighter vs ${r.sky} on an empty patch of stage`);
  check(errors.length === 0, "no page errors in a 3d match", errors.slice(0, 2).join(" | "));
  await page.close();
}

// ------------------------------------------------------ 2. determinism

{
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${BASE}/index.html?render=3d&mannequin=all&camera=flat`);
  await pressStart(page);
  await page.waitForFunction(async () =>
    (await import("/src/state.js")).state.phase === "menu", { timeout: 120000 });
  await page.waitForFunction(() => window.__render3d?.ready === true, { timeout: 30000 });

  const r = await page.evaluate(async () => {
    const backend = await import("/render3d/src/backend.js");
    const scene = await import("/render3d/src/scene.js");
    const draw = () => {
      const c = document.createElement("canvas");
      c.width = 300; c.height = 300;
      const ctx = c.getContext("2d");
      const token = backend.currentFrame("gojo", "run", 0.1234);
      backend.drawCharFrame(ctx, "gojo", token, 150, 280, { scale: 0.6, facing: -1 });
      return c.toDataURL();
    };
    // Both draws must be MODEL renders. Comparing two sprite fallbacks would
    // also come out identical — a determinism check that cannot tell which
    // path it measured proves nothing about the renderer it is named for.
    const before = window.__render3d.stats.renders;
    const a = draw();
    scene.clearCache();
    const b = draw();
    return { same: a === b, len: a.length, renders: window.__render3d.stats.renders - before };
  });
  check(r.renders >= 2, "both determinism draws went through the model path", `${r.renders} renders`);
  check(r.same, "same pose token renders byte-identical pixels across a cache clear", `${r.len}b`);
  check(errors.length === 0, "no page errors in the determinism probe", errors.slice(0, 2).join(" | "));
  await page.close();
}

// -------------------------------------------------- 3. delivered-.glb path

const manifestBefore = readFileSync(MANIFEST, "utf8");
try {
  const tool = (args) => execFileSync("node", [join(ROOT, "tools", args[0]), ...args.slice(1)], { encoding: "utf8" });
  tool(["billboard_test_rig.mjs", TEST_CHAR, join(ROOT, "render3d", "intake", TEST_CHAR, `${TEST_CHAR}.glb`)]);
  tool(["billboard_intake.mjs", "import", TEST_CHAR, "--backend", "3d"]);
  tool(["billboard_intake.mjs", "approve", TEST_CHAR, "--backend", "3d"]);

  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));

  await page.goto(`${BASE}/index.html?render=3d&camera=flat`);
  await pressStart(page);
  await page.waitForFunction(async () =>
    (await import("/src/state.js")).state.phase === "menu", { timeout: 120000 });
  await page.waitForFunction(() => window.__render3d?.ready === true, { timeout: 30000 });

  const r = await page.evaluate(async (charKey) => {
    const backend = await import("/render3d/src/backend.js");
    const loader = await import("/render3d/src/loader.js");
    const own = loader.resolveClip(charKey, "light");
    const inherited = loader.resolveClip(charKey, "ult");
    const c = document.createElement("canvas");
    c.width = 300; c.height = 300;
    const ctx = c.getContext("2d");
    const token = backend.currentFrame(charKey, "idle", 0.5);
    // Count renders across the draw. Pixels alone cannot tell a MODEL from the
    // sprite fallback — drawCharFrame legitimately falls through to sprites
    // and still returns true with a canvas full of pixels, so a check that
    // only counted pixels would pass just as happily with the 3D path dead.
    const before = window.__render3d.stats.renders;
    const drew = backend.drawCharFrame(ctx, charKey, token, 150, 280, { scale: 0.6, facing: 1 });
    const rendered = window.__render3d.stats.renders > before;
    let px = 0;
    const d = ctx.getImageData(0, 0, 300, 300).data;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 60) px++;
    return {
      registered: backend.hasModel(charKey), ownSrc: own?.source, ultSrc: inherited?.source,
      token, drew, px, rendered,
    };
  }, TEST_CHAR);

  check(r.registered, "an imported+approved .glb registers from the render3d manifest");
  check(r.token.startsWith("r3d:"), "rigged characters hand out render3d pose tokens", r.token);
  check(r.ownSrc === "own", "a state the rig covers resolves to its own clip", r.ownSrc);
  check(r.ultSrc === "default", "a state it lacks resolves to the default pose set", r.ultSrc);
  check(r.drew === true && r.px > 100, "the delivered rig draws through drawCharFrame", `${r.px} px`);
  check(r.rendered, "and draws as a MODEL, not via the sprite fallback");
  check(errors.length === 0, "no page errors on the delivered-rig path", errors.slice(0, 2).join(" | "));
  await page.close();
} finally {
  writeFileSync(MANIFEST, manifestBefore);
  rmSync(join(ROOT, "render3d", "assets", TEST_CHAR), { recursive: true, force: true });
  rmSync(join(ROOT, "render3d", "intake", TEST_CHAR), { recursive: true, force: true });
}

// ---------------------------------------------------------------- IK reach
//
// Same claim as the billboard backend, measured the same way — but with one
// case that only exists here: facing left is a real 180° YAW, not a mirror, so
// "forward" genuinely changes direction in the world. A reach target built
// before that yaw is applied sends every left-facing fighter swinging the way
// they are not facing, and nothing else in the suite would notice.
{
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${BASE}/index.html?render=3d&camera=flat`);
  await pressStart(page);
  await page.waitForFunction(async () =>
    (await import("/src/state.js")).state.phase === "menu", { timeout: 120000 });

  const r = await page.evaluate(async () => {
    const THREE = await import("/vendor/three/three.module.js");
    const rigs = await import("/render3d/src/loader.js");
    const pose = await import("/render3d/src/pose.js");
    const charKey = "gojo";
    const rig = rigs.getRig(charKey);
    const resolved = rigs.resolveClip(charKey, "light");
    if (!rig || !resolved) return { skipped: true };
    const targetPx = 175.3;
    const out = { worst: 0, cases: [], handYs: [], forwardSigns: [] };
    for (const [label, dx, dy, facing] of [
      ["high", 260, 300, 1], ["level", 320, 95, 1],
      ["low", 260, -30, 1], ["left-facing", 260, 200, -1],
    ]) {
      pose.poseRig(rig, "light", 0.083, resolved.clip, {
        aimRad: 0, reach: { dx, dy, targetPx }, turnYawRad: facing < 0 ? Math.PI : 0,
      });
      const sh = new THREE.Vector3(), hand = new THREE.Vector3();
      rig.root.getObjectByName("RightArm").getWorldPosition(sh);
      rig.root.getObjectByName("RightHand").getWorldPosition(hand);
      const want = new THREE.Vector3(0, dy * (rig.height / targetPx), dx * (rig.height / targetPx));
      rig.root.localToWorld(want);
      const deg = (Math.acos(Math.min(1, Math.max(-1,
        want.sub(sh).normalize().dot(hand.clone().sub(sh).normalize())))) * 180) / Math.PI;
      out.worst = Math.max(out.worst, deg);
      out.cases.push(`${label}:${deg.toFixed(1)}°`);
      if (facing > 0) out.handYs.push(hand.y);
      out.forwardSigns.push(Math.sign(+hand.z.toFixed(2)));
      rig.root.rotation.y = 0;
    }
    out.spread = Math.max(...out.handYs) - Math.min(...out.handYs);
    return out;
  });

  if (r.skipped) {
    check(true, "IK reach skipped — no rig registered for the probe character");
  } else {
    check(r.worst < 1, "the striking hand points at the target, every case", `worst ${r.worst.toFixed(2)}° — ${r.cases.join(" ")}`);
    check(r.spread > 0.2, "and aim height genuinely moves the hand", `${r.spread.toFixed(2)}m of travel`);
    // Right-facing reaches +Z, left-facing reaches -Z: the turnaround is real.
    check(r.forwardSigns[0] > 0 && r.forwardSigns[3] < 0,
      "reach follows the 180° turnaround rather than fighting it", `z signs ${r.forwardSigns.join(",")}`);
  }
  check(errors.length === 0, "no page errors solving IK", errors.slice(0, 2).join(" | "));
  await page.close();
}

// ---------------------------------------------------------------------------
// A LOST GPU CONTEXT MUST NOT BE CACHED.
//
// three makes render() a silent no-op while the context is gone, and the pose
// cache's next act is to copy the canvas and store it under a key that says
// nothing about the context. A phone that loses its context partway through the
// idle review would fill the cache with blanks and go on serving them after the
// GPU came back — the whole roster dark, permanently, with a reload the only
// cure. Driven on purpose here, because a fault you cannot trigger is one you
// fix by argument.
{
  const page = await browser.newPage({ viewport: { width: 1100, height: 720 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${BASE}/render3d/workbench/index.html?char=yuji`, { waitUntil: "load" });
  await page.waitForFunction(() => window.__render3d?.renderer, { timeout: 60000 });
  await page.waitForTimeout(2500);

  const r = await page.evaluate(async () => {
    const scene = await import("/render3d/src/scene.js");
    const gl = window.__render3d.renderer.getContext();
    const ext = gl.getExtension("WEBGL_lose_context");
    if (!ext) return { skipped: true };
    const before = window.__render3d.stats.lostFrames;
    ext.loseContext();
    await new Promise((r) => setTimeout(r, 400));
    const flagged = window.__render3d.contextLost === true;
    // Ask for renders while it is gone. Each one must come back empty-handed
    // rather than banking a blank.
    scene.clearCache();
    await new Promise((r) => setTimeout(r, 1200));
    const dropped = window.__render3d.stats.lostFrames - before;
    ext.restoreContext();
    await new Promise((r) => setTimeout(r, 1500));
    return { skipped: false, flagged, dropped, restored: window.__render3d.contextLost === false };
  });

  if (r.skipped) {
    check(true, "context-loss check skipped — WEBGL_lose_context unavailable");
  } else {
    check(r.flagged, "a lost context is noticed");
    check(r.dropped > 0, "and frames drawn during it are dropped rather than cached",
      `${r.dropped} dropped`);
    check(r.restored, "the context comes back");
  }
  check(errors.length === 0, "no page errors around a context loss", errors.slice(0, 2).join(" | "));
  await page.close();
}

// --------------------------------------------------------------- the walk
//
// The walk clip is HAND-AUTHORED (render3d/src/walk_cycle.js) rather than built
// from the sheet, so nothing upstream checks it: `check_pose_reads` measures
// drawings and this state deliberately has none of its own. What it checks is
// the one property that separates a walk from every other gait — ONE FOOT IS
// ALWAYS DOWN. Fold the support knee at the pass and it fails (6.4% on
// Hakari); the cycle as authored keeps the whole roster near 2.5%.
{
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${BASE}/index.html?render=3d&mannequin=none&camera=flat`);
  await pressStart(page);
  await page.waitForFunction(
    async () => (await import("/src/state.js")).state.phase === "menu", { timeout: 120000 });
  await page.waitForFunction(() => window.__render3d?.ready === true, { timeout: 90000 });
  const r = await page.evaluate(async () => {
    const THREE = await import("/vendor/three/three.module.js");
    const rigs = await import("/render3d/src/loader.js");
    const pose = await import("/render3d/src/pose.js");
    const { CHARACTER_KEYS } = await import("/src/characters.js");
    const out = { built: 0, missing: [], worstLift: 0, worstWho: null, fromSheet: [] };
    const V = () => new THREE.Vector3();
    for (const key of CHARACTER_KEYS) {
      const rig = rigs.getRig(key);
      // Not every fighter has been modelled: Mei Mei and Kurourushi have no
      // .glb yet, and a fighter with no rig owes no clip. The check is that a
      // rig which EXISTS has a walk, not that the roster is complete.
      if (!rig) continue;
      const res = rigs.resolveClip(key, "walk");
      if (!res?.clip) { out.missing.push(key); continue; }
      out.built++;
      if (res.source !== "library") out.fromSheet.push(`${key}:${res.source}`);
      // EACH FOOT AGAINST ITS OWN FLOOR, not against the other one. These rigs
      // are not left-right symmetric in their bind pose — Geto's ankles sit
      // 4cm apart in height standing still — so "the lower foot" swaps sides
      // every half cycle and a naive min() reports that swap as a lift. It
      // reported 8.9cm of float on Geto that tuning the cycle could not shift,
      // because it was never the cycle.
      const ys = [[], []];
      for (let i = 0; i < 16; i++) {
        pose.poseRig(rig, "walk", (i / 16) * res.clip.duration, res.clip, { turnYawRad: 0 });
        rig.root.updateMatrixWorld(true);
        const a = V(), b = V();
        rig.root.getObjectByName("LeftFoot").getWorldPosition(a);
        rig.root.getObjectByName("RightFoot").getWorldPosition(b);
        ys[0].push(a.y); ys[1].push(b.y);
      }
      const floor = [Math.min(...ys[0]), Math.min(...ys[1])];
      // At every instant, how far above its own floor is the LOWER of the two?
      // A walk keeps that near zero; the moment both feet are up, it is not.
      let worst = 0;
      for (let i = 0; i < 16; i++) {
        worst = Math.max(worst, Math.min(ys[0][i] - floor[0], ys[1][i] - floor[1]));
      }
      const lift = worst / (rig.height || 1);
      if (lift > out.worstLift) { out.worstLift = +lift.toFixed(4); out.worstWho = key; }
    }
    return out;
  });
  check(r.built > 0 && r.missing.length === 0, "every fighter has a walk clip",
    r.missing.length ? `missing: ${r.missing.slice(0, 4).join(", ")}` : `${r.built} built`);
  check(r.fromSheet.length === 0, "...and it is the authored cycle, not the sheet",
    r.fromSheet.length ? r.fromSheet.slice(0, 3).join(", ") : "all from the pose library");
  // A planted ankle may rise as the foot rolls over its ball; it may not leave
  // the floor. 3% of body height is that roll and no more — the roster sits
  // near 2.5% and the first version of the cycle put Geto at 4.7%.
  check(r.worstLift <= 0.03, "one foot stays down through the whole cycle",
    `worst planted-foot rise ${(r.worstLift * 100).toFixed(1)}% of height (${r.worstWho})`);
  check(errors.length === 0, "no page errors building the walk", errors.slice(0, 2).join(" | "));
  await page.close();
}

// ---------------------------------------------------------------- the run
//
// The run is authored the same way (render3d/src/run_cycle.js) and checked for
// the property the four sprite frames cannot give it: A STRIDE HAS A SUPPORT
// PHASE. Reach and pass are the two extremes of the swing, and a cycle made of
// only those two never lands — the foot touches its lowest point for an instant
// on the way between them and leaves again, which is why the sheet-built run
// read as skating rather than running.
//
// Measured as DWELL: how much of the cycle the lower foot spends within 2% of
// body height of its own floor. The sheet-built clip sits at 16%; the authored
// cycle, with a contact and a loading frame on each side, doubles that. (The
// flight phase is NOT measured here and cannot be: the clip owns joint angles
// only, and the body's rise and fall over a stride is motion.js's bob — baking
// it in here would double it, which is the delivery rule.)
{
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${BASE}/index.html?render=3d&mannequin=none&camera=flat`);
  await pressStart(page);
  await page.waitForFunction(
    async () => (await import("/src/state.js")).state.phase === "menu", { timeout: 120000 });
  await page.waitForFunction(() => window.__render3d?.ready === true, { timeout: 90000 });
  const r = await page.evaluate(async () => {
    const THREE = await import("/vendor/three/three.module.js");
    const rigs = await import("/render3d/src/loader.js");
    const pose = await import("/render3d/src/pose.js");
    const { CHARACTER_KEYS } = await import("/src/characters.js");
    const out = { built: 0, missing: [], leastDwell: 1, leastWho: null, fromSheet: [] };
    const V = () => new THREE.Vector3();
    const N = 32;
    for (const key of CHARACTER_KEYS) {
      const rig = rigs.getRig(key);
      if (!rig) continue;
      const res = rigs.resolveClip(key, "run");
      if (!res?.clip) { out.missing.push(key); continue; }
      out.built++;
      if (res.source !== "library") out.fromSheet.push(`${key}:${res.source}`);
      const lows = [];
      for (let i = 0; i < N; i++) {
        pose.poseRig(rig, "run", (i / N) * res.clip.duration, res.clip, { turnYawRad: 0 });
        rig.root.updateMatrixWorld(true);
        const a = V(), b = V();
        rig.root.getObjectByName("LeftFoot").getWorldPosition(a);
        rig.root.getObjectByName("RightFoot").getWorldPosition(b);
        // Whichever foot is down — it swaps sides every half stride.
        lows.push(Math.min(a.y, b.y) / (rig.height || 1));
      }
      const floor = Math.min(...lows);
      const dwell = lows.filter((y) => y - floor < 0.02).length / N;
      if (dwell < out.leastDwell) { out.leastDwell = +dwell.toFixed(3); out.leastWho = key; }
    }
    return out;
  });
  check(r.built > 0 && r.missing.length === 0, "every fighter has a run clip",
    r.missing.length ? `missing: ${r.missing.slice(0, 4).join(", ")}` : `${r.built} built`);
  check(r.fromSheet.length === 0, "...and it is the authored cycle, not the sheet",
    r.fromSheet.length ? r.fromSheet.slice(0, 3).join(", ") : "all from the pose library");
  // The roster sits at 28% and up; the reach/pass sheet cycle it replaces sat
  // at 16%, so this fails the moment the contact and loading frames go away.
  check(r.leastDwell >= 0.25, "each stride lands and loads rather than scissoring",
    `least support ${(r.leastDwell * 100).toFixed(0)}% of the cycle (${r.leastWho})`);
  check(errors.length === 0, "no page errors building the run", errors.slice(0, 2).join(" | "));
  await page.close();
}

await browser.close();
console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exit(failures ? 1 : 0);
