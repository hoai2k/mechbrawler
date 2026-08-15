// Smoke-test the render3d pipeline, on the MECH roster.
//
// The JJK-era version of this file leaned on machinery the mech conversion
// removed — the billboard intake tools and test rig (deleted), the render3d
// workbench page (deleted), and the Mixamo bone names (LeftFoot, RightArm)
// that the walk/run/IK probes measured, which no generated mech skeleton
// carries (hips/thighL/ankleL/toeL...). Those passes are gone; what remains
// is what still describes this renderer:
//
//   1. MANNEQUIN MATCH.  `?render=3d&mannequin=all` boots into a real
//      CPU-vs-CPU match. Asserts: the backend engaged, rigs registered,
//      poses rendered through the 3D pipeline, the sampling economy holds
//      (renders per second stays well under full rate — the pose cache
//      doing its job), toon-shaded pixels are on screen where a fighter
//      stands, and no page errors.
//
//   2. DETERMINISM.  Same pose token -> byte-identical pixels across a
//      cache clear. The afterimage trail replays tokens seconds later, so
//      a nondeterministic render shows as flickering ghosts.
//
//   3. MECH CLIPS.  With no mannequin flag, a delivered mech registers from
//      the render3d manifest, its states resolve to its OWN exported GLB
//      animations (the M2 clip mapping), and it draws through drawCharFrame
//      as a model.
//
//   4. K3 PRESENTATION.  The facing rules (pose.PRESENT): idle pins to a ¾
//      toward the lens, travel and an attack's hit phase to pure profile,
//      an attack's wind-up toward the lens — and facing left is the exact
//      mirror of facing right. Measured off the posed rig's own feet,
//      degree-exact against the dials.
//
//   5. LOST CONTEXT.  A lost GL context must not poison the pose cache
//      (frames drawn during the outage are dropped, not stored).
//
// Needs `playwright` and Chromium (CHROMIUM_PATH to override), and the game
// served first:  node server.mjs   then:  node tools/smoke_render3d.mjs [baseUrl]

import { chromium } from "playwright";
import { pressStart } from "./smoke_boot.mjs";

const BASE = process.argv[2] || "http://127.0.0.1:5174";

let failures = 0;
const check = (ok, label, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${detail ? `   ${detail}` : ""}`);
};

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-proxy-server"],
});

async function bootMenu(page, url) {
  await page.goto(url);
  await pressStart(page);
  await page.waitForFunction(async () =>
    (await import("/src/state.js")).state.phase === "menu", { timeout: 120000 });
  await page.waitForFunction(() => window.__render3d?.ready === true, { timeout: 60000 });
}

/** Page-side helper source: load one mech's rig (lazy by default) and wait. */
const ENSURE_RIG = `async (charKey) => {
  const backend = await import("/render3d/src/backend.js");
  backend.hasModel(charKey);
  await new Promise((res) => {
    const poll = () => backend.hasModel(charKey) ? res() : setTimeout(poll, 200);
    poll();
  });
}`;

async function bootAndFight(page, url) {
  await page.goto(url);
  await pressStart(page);
  await page.waitForFunction(() => window.__render3d?.ready === true, { timeout: 30000 });
  await page.click('[data-character="titanus"]');
  await page.waitForTimeout(300);
  await page.click("#startButton");
  await page.waitForSelector(".stage-card", { timeout: 5000 });
  await page.locator(".stage-card").nth(0).click();
  // Wait for a SETTLED match — the phase blips through `playing` with a stale
  // fighter list during round setup, so the condition must hold across
  // consecutive polls with the clock genuinely advancing.
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
    const rigs = await import("/render3d/src/loader.js");
    const stats = window.__render3d.stats;
    const dials = window.__render3d.dials;
    const elapsed = (performance.now() - before.t) / 1000;
    // A BODY, drawn where a fighter stands: sample where the camera actually
    // puts the fighter and look for the INK OUTLINE this backend draws every
    // body with — hard local contrast, measured against a same-sized patch
    // of empty sky so a busy background cannot pass for a fighter.
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
      sky = edges(c.width / 2, 0, w, Math.round(h * 0.4));
    }
    return {
      engaged: window.__render3d.ready === true, rigged: rigs.rigCount(),
      renders: stats.renders, hits: stats.hits, misses: stats.misses,
      windowRenders: stats.renders - before.renders, elapsed,
      hz: dials.onTwos ? dials.sampleHz : dials.smoothHz,
      fighters: state.fighters.length,
      pixels: hit, sky, sampled: !!f,
    };
  }, before);

  check(r.engaged, "the 3d backend is in force");
  check(r.rigged >= 17, "a rig registered for the whole mech roster", `${r.rigged} rigs`);
  check(r.renders > 0, "poses were rendered through the 3D pipeline", `${r.renders} renders`);
  // The sampling economy: live animation must not cost live rendering.
  const budget = r.hz * r.fighters * r.elapsed * 2.5;
  check(r.windowRenders <= budget, "renders/sec stays inside the sampling budget",
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
  await bootMenu(page, `${BASE}/index.html?render=3d&mannequin=all&camera=flat`);

  const r = await page.evaluate(async (ensureSrc) => {
    const backend = await import("/render3d/src/backend.js");
    const scene = await import("/render3d/src/scene.js");
    await eval(ensureSrc)("titanus");
    const draw = () => {
      const c = document.createElement("canvas");
      c.width = 300; c.height = 300;
      const ctx = c.getContext("2d");
      const token = backend.currentFrame("titanus", "run", 0.1234);
      backend.drawCharFrame(ctx, "titanus", token, 150, 280, { scale: 0.6, facing: -1 });
      return c.toDataURL();
    };
    // Both draws must be MODEL renders — count them, or a dead 3D path with
    // two identical placeholder draws would pass.
    const before = window.__render3d.stats.renders;
    const a = draw();
    scene.clearCache();
    const b = draw();
    return { same: a === b, len: a.length, renders: window.__render3d.stats.renders - before };
  }, ENSURE_RIG);
  check(r.renders >= 2, "both determinism draws went through the model path", `${r.renders} renders`);
  check(r.same, "same pose token renders byte-identical pixels across a cache clear", `${r.len}b`);
  check(errors.length === 0, "no page errors in the determinism probe", errors.slice(0, 2).join(" | "));
  await page.close();
}

// -------------------------------------------------- 3. mech GLB clip path

{
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await bootMenu(page, `${BASE}/index.html?render=3d&camera=flat`);

  const r = await page.evaluate(async (ensureSrc) => {
    const backend = await import("/render3d/src/backend.js");
    const loader = await import("/render3d/src/loader.js");
    await eval(ensureSrc)("titanus");
    const own = loader.resolveClip("titanus", "light");
    const idle = loader.resolveClip("titanus", "idle");
    const c = document.createElement("canvas");
    c.width = 300; c.height = 300;
    const ctx = c.getContext("2d");
    const token = backend.currentFrame("titanus", "idle", 0.5);
    const before = window.__render3d.stats.renders;
    const drew = backend.drawCharFrame(ctx, "titanus", token, 150, 280, { scale: 0.6, facing: 1 });
    const rendered = window.__render3d.stats.renders > before;
    let px = 0;
    const d = ctx.getImageData(0, 0, 300, 300).data;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 60) px++;
    return {
      registered: backend.hasModel("titanus"),
      lightSrc: own?.source, idleSrc: idle?.source,
      token, drew, px, rendered,
    };
  }, ENSURE_RIG);

  check(r.registered, "a delivered mech registers from the render3d manifest");
  check(r.token.startsWith("r3d:"), "rigged characters hand out render3d pose tokens", r.token);
  check(/^glb:/.test(r.lightSrc || ""), "an attack resolves to the mech's own GLB animation", r.lightSrc);
  check(/^glb:/.test(r.idleSrc || ""), "the idle resolves to the mech's own GLB animation", r.idleSrc);
  check(r.drew === true && r.px > 100, "the delivered rig draws through drawCharFrame", `${r.px} px`);
  check(r.rendered, "and draws as a MODEL, not a cached or placeholder path");
  check(errors.length === 0, "no page errors on the mech clip path", errors.slice(0, 2).join(" | "));
  await page.close();
}

// ---------------------------------------------- 4. K3 presentation pin
//
// The owner's facing rules, measured: idle pins the body to a ¾ toward the
// lens, travel and an attack's hit phase to pure profile, the wind-up toward
// the lens — and facing left is the exact mirror. Measured off the posed
// rig's feet (toe minus heel — the same compass pose.applyPresentation
// steers by), degree-exact against the dials in pose.PRESENT.

{
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await bootMenu(page, `${BASE}/index.html?render=3d&camera=flat`);

  const r = await page.evaluate(async (ensureSrc) => {
    const THREE = await import("/vendor/three/three.module.js");
    const rigs = await import("/render3d/src/loader.js");
    const pose = await import("/render3d/src/pose.js");
    const CAM = -78;
    const presentedFeet = (rig) => {
      rig.root.updateMatrixWorld(true);
      let sx = 0, sz = 0, n = 0;
      const add = (toe, heel) => {
        const a = new THREE.Vector3(), b = new THREE.Vector3();
        toe.getWorldPosition(a); heel.getWorldPosition(b);
        const d = a.sub(b).setY(0);
        if (d.lengthSq() < 1e-8) return;
        sx += d.x; sz += d.z; n++;
      };
      for (const [tn, hn] of [["toeL", "heelL"], ["toeR", "heelR"]]) {
        const t = rig.root.getObjectByName(tn), h = rig.root.getObjectByName(hn);
        if (t && h) add(t, h);
      }
      if (!n) for (const side of ["L", "R"]) {
        const ankle = rig.root.getObjectByName(`ankle${side}`);
        const toe = ankle?.children.find((o) => o.isBone);
        if (ankle && toe) add(toe, ankle);
      }
      if (!n) return null;
      let deg = (Math.atan2(sx, sz) * 180 / Math.PI) - CAM;
      while (deg > 180) deg -= 360;
      while (deg < -180) deg += 360;
      return Math.round(deg);
    };
    const out = { present: pose.PRESENT, chars: {} };
    for (const k of ["titanus", "viper"]) {
      await eval(ensureSrc)(k);
      const rig = rigs.getRig(k);
      out.chars[k] = {};
      for (const [label, state, t, facing] of [
          ["idleR", "idle", 0.5, 1], ["idleL", "idle", 0.5, -1],
          ["runR", "run", 0.1, 1], ["runL", "run", 0.1, -1],
          ["windupR", "light", 0.04, 1], ["windupL", "light", 0.04, -1],
          ["hitR", "light", 0.12, 1], ["hitL", "light", 0.12, -1]]) {
        const res = rigs.resolveClip(k, state);
        const target = pose.presentTargetDeg(state, t);
        const presentDeg = target != null ? Math.round(target * facing) : 0;
        pose.poseRig(rig, state, pose.sampleTime(state, t), res.clip,
          { charKey: k, presentDeg, facing, facingK: facing,
            turnYawRad: facing < 0 ? 2 * CAM * Math.PI / 180 : 0 });
        out.chars[k][label] = presentedFeet(rig);
        rig.root.rotation.y = 0;
      }
    }
    return out;
  }, ENSURE_RIG);

  const P = r.present;
  for (const [k, c] of Object.entries(r.chars)) {
    check(c.idleR === P.idleDeg && c.idleL === -P.idleDeg,
      `${k}: idle pins to a ±${P.idleDeg}° ¾ toward the lens`, `${c.idleR}/${c.idleL}`);
    check(c.runR === P.profileDeg && c.runL === -P.profileDeg,
      `${k}: run pins to ±${P.profileDeg}° pure profile`, `${c.runR}/${c.runL}`);
    check(c.windupR === P.windupDeg && c.windupL === -P.windupDeg,
      `${k}: the wind-up pins to ±${P.windupDeg}° toward the lens, never away`,
      `${c.windupR}/${c.windupL}`);
    check(c.hitR === P.profileDeg && c.hitL === -P.profileDeg,
      `${k}: the hit phase pins to ±${P.profileDeg}° pure profile`, `${c.hitR}/${c.hitL}`);
  }
  check(errors.length === 0, "no page errors measuring presentation", errors.slice(0, 2).join(" | "));
  await page.close();
}

// ---------------------------------------------------------------------------
// 5. A LOST GPU CONTEXT MUST NOT BE CACHED. three makes render() a silent
// no-op while the context is gone; a render taken during the outage must be
// dropped rather than stored under a token that says nothing about the
// context — or the roster goes dark until reload. Driven on purpose, on the
// game page (the old workbench page is gone).

{
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await bootMenu(page, `${BASE}/index.html?render=3d&camera=flat`);

  const r = await page.evaluate(async (ensureSrc) => {
    const backend = await import("/render3d/src/backend.js");
    const scene = await import("/render3d/src/scene.js");
    await eval(ensureSrc)("titanus");
    const gl = window.__render3d.renderer.getContext();
    const ext = gl.getExtension("WEBGL_lose_context");
    if (!ext) return { skipped: true };
    const draw = () => {
      const c = document.createElement("canvas");
      c.width = 200; c.height = 200;
      backend.drawCharFrame(c.getContext("2d"), "titanus",
        backend.currentFrame("titanus", "idle", 0.5), 100, 180, { facing: 1 });
    };
    draw(); // warm — a real render exists first
    const before = window.__render3d.stats.lostFrames;
    ext.loseContext();
    await new Promise((r) => setTimeout(r, 400));
    const flagged = window.__render3d.contextLost === true;
    scene.clearCache();
    draw(); draw();
    await new Promise((r) => setTimeout(r, 400));
    const dropped = window.__render3d.stats.lostFrames - before;
    ext.restoreContext();
    await new Promise((r) => setTimeout(r, 1500));
    return { skipped: false, flagged, dropped, restored: window.__render3d.contextLost === false };
  }, ENSURE_RIG);

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

await browser.close();
console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exit(failures ? 1 : 0);
