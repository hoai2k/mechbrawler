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
//      doing its job), 3D-rendered pixels are on screen where a fighter
//      stands, and no page errors.
//
//   2. DETERMINISM.  Same pose token -> byte-identical pixels across a
//      cache clear. The afterimage trail replays tokens seconds later, so
//      a nondeterministic render shows as flickering ghosts.
//
//   3. MECH CLIPS + NATIVE PBR (K6).  With no mannequin flag, a delivered
//      mech registers from the render3d manifest, its states resolve to its
//      OWN exported GLB animations (the M2 clip mapping), it draws through
//      drawCharFrame as a model — and it keeps its NATIVE baked PBR
//      materials under the ACES grade (the default since K6: no toon
//      re-materialing, no outline shells).
//
//   3b. TOON FLAG.  `?render=toon` keeps the old anime pass: toon-converted
//      materials, ink outline shells, NoToneMapping — and the same clip
//      resolution, with the style in the light half of the cache key so the
//      two styles can never serve each other's pixels.
//
//   4. K3 PRESENTATION, ON EVERY MECH.  The facing rules (pose.PRESENT): idle
//      pins to a ¾ toward the lens, travel and an attack's hit phase to pure
//      profile, an attack's wind-up toward the lens — and facing left is the
//      exact mirror of facing right. Degree-exact against the dials, for the
//      WHOLE roster: this used to check titanus and viper, the only two rigs
//      carrying toe and heel bones, and the twelve mechs whose compass was
//      quietly reading a bone that points backwards were never asked.
//
//   5. LOST CONTEXT.  A lost GL context must not poison the pose cache
//      (frames drawn during the outage are dropped, not stored).
//
// Needs `playwright` and Chromium (CHROMIUM_PATH to override), and the game
// served first:  node server.mjs   then:  node tools/smoke_render3d.mjs [baseUrl]

import { readFileSync } from "node:fs";
import { chromium } from "playwright";
import { pressStart } from "./smoke_boot.mjs";

const BASE = process.argv[2] || "http://127.0.0.1:5174";

/** The whole delivered roster, read from the manifest rather than listed here
 *  — the presentation rules are a promise about every mech, so a mech added to
 *  the manifest is a mech this test starts covering. */
const ROSTER = Object.keys(JSON.parse(
  readFileSync(new URL("../render3d/assets/manifest.json", import.meta.url), "utf8"),
).characters);

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
    // puts the fighter and look for hard local contrast (a lit body against
    // the stage — the PBR default has no ink shells), measured against a
    // same-sized patch of empty sky so a busy background cannot pass for a
    // fighter.
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
    "a rendered 3D body is drawn where a fighter stands",
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
    const scn = await import("/render3d/src/scene.js");
    await eval(ensureSrc)("titanus");
    // The K6 material census: under the PBR default the rig keeps its GLB's
    // own MeshStandardMaterials — nothing toonified, no outline shells.
    const rig = loader.getRig("titanus");
    let std = 0, toonified = 0, outlines = 0;
    rig.root.traverse((o) => {
      if (o.userData.isOutline) { outlines++; return; }
      if (!o.isMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (m?.userData?.toonified) toonified++;
        else if (m?.isMeshStandardMaterial) std++;
      }
    });
    const own = loader.resolveClip("titanus", "light");
    const idle = loader.resolveClip("titanus", "idle");
    const charge = loader.resolveClip("titanus", "charge");
    const jump = loader.resolveClip("titanus", "jump");
    const crouch = loader.resolveClip("titanus", "crouch");
    const dodge = loader.resolveClip("titanus", "dodge");
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
      lightSrc: own?.source, idleSrc: idle?.source, chargeSrc: charge?.source,
      jumpSrc: jump?.source, crouchSrc: crouch?.source, dodgeSrc: dodge?.source,
      token, drew, px, rendered,
      std, toonified, outlines,
      toneMapping: window.__render3d.renderer.toneMapping,
      lightKey: scn.lightKey(),
    };
  }, ENSURE_RIG);

  check(r.registered, "a delivered mech registers from the render3d manifest");
  // K6: native PBR is the default — ACESFilmicToneMapping is 4 in three.js.
  check(r.toneMapping === 4, "the default render grades with ACES tone mapping",
    `toneMapping ${r.toneMapping}`);
  check(r.std > 0 && r.toonified === 0 && r.outlines === 0,
    "the mech keeps its native PBR materials — no toon conversion, no ink shells",
    `${r.std} standard / ${r.toonified} toonified / ${r.outlines} outline meshes`);
  check(/@pbr$/.test(r.lightKey), "the cache's light key carries the pbr style", r.lightKey);
  check(r.token.startsWith("r3d:"), "rigged characters hand out render3d pose tokens", r.token);
  check(/^glb:/.test(r.lightSrc || ""), "an attack resolves to the mech's own GLB animation", r.lightSrc);
  // K8: idle is MM's real ready stance, sampled as the battleIdle clip
  // (K5's frozen heavy wind-up is retired); titanus's charge is his real
  // poundHold loop, unfrozen.
  check(r.idleSrc === "glb:battleIdle",
    "the idle plays the sampled ready-stance clip", r.idleSrc);
  check(r.chargeSrc === "glb:poundHold",
    "the charge resolves to the mech's own hold loop, unfrozen", r.chargeSrc);
  // MM clips only; K8 upgraded the K5 freeze-frame stopgap: jump/crouch play
  // the export's SAMPLED procedural-layer clips (jumpRise = the rising tuck,
  // crouch = the duck layer at the mech's own depth) — never the JJK pose
  // sets, never the ball tuck — and the dodge tuck rides the dodge_roll alias.
  check(r.jumpSrc === "glb:jumpRise",
    "the jump plays the sampled rising-tuck clip", r.jumpSrc);
  check(r.crouchSrc === "glb:crouch",
    "the crouch plays the sampled duck-layer clip", r.crouchSrc);
  check(r.dodgeSrc === "glb:ball", "the dodge keeps the ball tuck", r.dodgeSrc);
  check(r.drew === true && r.px > 100, "the delivered rig draws through drawCharFrame", `${r.px} px`);
  check(r.rendered, "and draws as a MODEL, not a cached or placeholder path");
  check(errors.length === 0, "no page errors on the mech clip path", errors.slice(0, 2).join(" | "));
  await page.close();
}

// -------------------------------------------- 3b. the toon experiment flag
//
// `?render=toon` preserves the pre-K6 anime pass exactly: every material
// toon-converted, ink outline shells grown, NoToneMapping for the two-band
// ramp — same clip resolution, style-tagged cache keys.

{
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await bootMenu(page, `${BASE}/index.html?render=toon&camera=flat`);

  const r = await page.evaluate(async (ensureSrc) => {
    const loader = await import("/render3d/src/loader.js");
    const scn = await import("/render3d/src/scene.js");
    const backend = await import("/render3d/src/backend.js");
    await eval(ensureSrc)("titanus");
    const rig = loader.getRig("titanus");
    let toonified = 0, outlines = 0;
    rig.root.traverse((o) => {
      if (o.userData.isOutline) { outlines++; return; }
      if (o.isMesh && o.material?.userData?.toonified) toonified++;
    });
    // HOW MUCH OF THE FIGHTER IS INK. The ink shell is pushed out by a width
    // in WORLD units, and it used to spend that width in the mesh's own local
    // space — fine for a unit-scaled rig, catastrophic for a mech, whose
    // geometry lives in a unit cube under an Armature scaled ~7-9x. The line
    // came out that many times too thick, closed over the whole body, and
    // turned inside out on every panel thinner than it: `?render=toon` drew a
    // black blob. Nothing here noticed, because every assertion in this block
    // was about materials EXISTING rather than about what they drew.
    //
    // So: of the pose texture's opaque pixels, what fraction is near-black?
    // A correct line sits around a third (mechs carry plenty of genuinely dark
    // paint and a crease line between every plate); the 9x line measured 89%.
    const shot = scn.renderPose("titanus", "idle", 0,
      rig, loader.resolveClip("titanus", "idle"), {});
    let body = 0, ink = 0;
    if (shot) {
      const px = shot.canvas.getContext("2d")
        .getImageData(0, 0, shot.canvas.width, shot.canvas.height).data;
      for (let i = 0; i < px.length; i += 4) {
        if (px[i + 3] < 200) continue;
        body++;
        if (Math.max(px[i], px[i + 1], px[i + 2]) < 60) ink++;
      }
    }
    const c = document.createElement("canvas");
    c.width = 300; c.height = 300;
    const drew = backend.drawCharFrame(c.getContext("2d"), "titanus",
      backend.currentFrame("titanus", "idle", 0.5), 150, 280, { facing: 1 });
    return {
      toonified, outlines,
      inkPct: body ? (100 * ink) / body : 100,
      toneMapping: window.__render3d.renderer.toneMapping,
      lightKey: scn.lightKey(),
      idleSrc: loader.resolveClip("titanus", "idle")?.source,
      drew,
    };
  }, ENSURE_RIG);

  check(r.toneMapping === 0, "?render=toon keeps NoToneMapping for the ramp",
    `toneMapping ${r.toneMapping}`);
  check(r.toonified > 0 && r.outlines > 0,
    "?render=toon keeps the toon materials and ink shells",
    `${r.toonified} toonified / ${r.outlines} outline meshes`);
  check(r.inkPct < 50, "the ink line draws a line, not a silhouette",
    `${r.inkPct.toFixed(1)}% of the body is ink`);
  check(/@toon$/.test(r.lightKey), "the cache's light key carries the toon style", r.lightKey);
  check(r.idleSrc === "glb:battleIdle", "clip resolution is style-independent", r.idleSrc);
  check(r.drew === true, "the toon path still draws through drawCharFrame");
  check(errors.length === 0, "no page errors on the toon flag", errors.slice(0, 2).join(" | "));
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

  const r = await page.evaluate(async ([ensureSrc, roster]) => {
    const THREE = await import("/vendor/three/three.module.js");
    const rigs = await import("/render3d/src/loader.js");
    const pose = await import("/render3d/src/pose.js");
    const ik = await import("/render3d/src/ik.js");
    const CAM = -78;
    // The measurement, written out here rather than borrowed from pose.js, so
    // the assert is a second opinion about the body and not the pin agreeing
    // with itself: the hip-joint axis's heading now, less the heading it had in
    // the rig's own bind pose (where the delivery spec says the body faces +Z).
    // Every delivered skeleton carries thighL/thighR; a rig that did not would
    // report null and fail loudly rather than silently skip.
    const hipAxis = (root) => {
      const L = root.getObjectByName("thighL") || root.getObjectByName("LeftUpLeg");
      const R = root.getObjectByName("thighR") || root.getObjectByName("RightUpLeg");
      if (!L || !R) return null;
      const a = new THREE.Vector3(), b = new THREE.Vector3();
      L.getWorldPosition(a); R.getWorldPosition(b);
      const d = a.sub(b).setY(0);
      return d.lengthSq() > 1e-10 ? Math.atan2(d.x, d.z) * 180 / Math.PI : null;
    };
    const wrap = (deg) => {
      while (deg > 180) deg -= 360;
      while (deg < -180) deg += 360;
      return deg;
    };
    const out = { present: pose.PRESENT, chars: {} };
    for (const k of roster) {
      await eval(ensureSrc)(k);
      const rig = rigs.getRig(k);
      // The rig's own bind heading, taken the same way the engine takes it.
      const held = [];
      rig.root.traverse((o) => {
        if (o.isBone) held.push([o, o.quaternion.clone(), o.position.clone()]);
      });
      rig.root.rotation.y = rig.yawOffset || 0;
      ik.applyBindPose(THREE, rig.root);
      rig.root.updateMatrixWorld(true);
      const bind = hipAxis(rig.root);
      for (const [b, q, p] of held) { b.quaternion.copy(q); b.position.copy(p); }
      rig.root.rotation.y = 0;
      rig.root.updateMatrixWorld(true);

      const c = { tiers: pose.compassTiers(rig), bind };
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
        rig.root.updateMatrixWorld(true);
        const now = hipAxis(rig.root);
        c[label] = (now === null || bind === null)
          ? null : Math.round(wrap(now - bind - CAM));
        rig.root.rotation.y = 0;
      }
      out.chars[k] = c;
    }
    return out;
  }, [ENSURE_RIG, ROSTER]);

  const P = r.present;
  for (const [k, c] of Object.entries(r.chars)) {
    check(c.idleR === P.idleDeg && c.idleL === -P.idleDeg,
      `${k}: idle pins to a ±${P.idleDeg}° ¾ toward the lens`,
      `${c.idleR}/${c.idleL} via ${c.tiers[0]}`);
    check(c.runR === P.profileDeg && c.runL === -P.profileDeg,
      `${k}: run pins to ±${P.profileDeg}° pure profile`, `${c.runR}/${c.runL}`);
    check(c.windupR === P.windupDeg && c.windupL === -P.windupDeg,
      `${k}: the wind-up pins to ±${P.windupDeg}° toward the lens, never away`,
      `${c.windupR}/${c.windupL}`);
    check(c.hitR === P.profileDeg && c.hitL === -P.profileDeg,
      `${k}: the hit phase pins to ±${P.profileDeg}° pure profile`, `${c.hitR}/${c.hitL}`);
  }
  check(Object.keys(r.chars).length === ROSTER.length,
    `the presentation pin is measured on the whole roster`,
    `${Object.keys(r.chars).length} of ${ROSTER.length} mechs`);
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

// ---------------------------------------------------------------------------
// 6. THE TWO SEAMS. `initRenderBackend` has to hand back the load promise —
// awaiting a function that returns undefined is a race that reads like a
// guarantee — and the pose texture's size has to be askable-for, so a zoomed
// viewer can have a sharp render without a second pipeline, while the GAME's
// size stays exactly 384.

{
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await bootMenu(page, `${BASE}/index.html?render=3d&camera=flat`);

  const r = await page.evaluate(async (ensureSrc) => {
    const rb = await import("/src/render_backend.js");
    const scene = await import("/render3d/src/scene.js");
    const backend = await import("/render3d/src/backend.js");
    await eval(ensureSrc)("titanus");
    const returned = rb.initRenderBackend();
    const thenable = typeof returned?.then === "function";
    if (thenable) await returned;   // idempotent: init resolves the same load

    const drawnEdge = () => {
      const c = document.createElement("canvas");
      c.width = 40; c.height = 40;
      backend.drawCharFrame(c.getContext("2d"), "titanus",
        backend.currentFrame("titanus", "idle", 0.5), 20, 36, { facing: 1 });
      // The cache entry's own canvas is the texture — read its edge back.
      return window.__render3d.renderer.domElement.width;
    };
    const beforeSize = scene.TEX_SIZE;
    const beforeGl = drawnEdge();
    const asked = scene.setTexSize(768);
    const live = scene.TEX_SIZE;   // the live module binding, at the raised size
    const afterGl = drawnEdge();
    const back = scene.setTexSize(scene.TEX_SIZE_DEFAULT);
    return {
      thenable, beforeSize, asked, live,
      beforeGl, afterGl, back, backGl: drawnEdge(),
      clamped: (() => { const v = scene.setTexSize(99999); scene.setTexSize(384); return v; })(),
    };
  }, ENSURE_RIG);

  check(r.thenable, "initRenderBackend hands back the load promise, so awaiting it waits");
  check(r.beforeSize === 384, "the game's pose texture is still 384", `${r.beforeSize}`);
  check(r.asked === 768 && r.live === 768, "a caller can ask for a sharper texture",
    `asked 768, got ${r.asked}/${r.live}`);
  check(r.afterGl === 768 * 2 && r.beforeGl === 384 * 2,
    "and the render really is drawn at that size (2x supersampled)",
    `${r.beforeGl} -> ${r.afterGl} px of GL canvas`);
  check(r.back === 384 && r.backGl === 768, "and it goes back", `${r.back} / ${r.backGl}`);
  check(r.clamped <= 2048, "an absurd request is clamped rather than honoured", `${r.clamped}`);
  check(errors.length === 0, "no page errors around the texture-size seam",
    errors.slice(0, 2).join(" | "));
  await page.close();
}

await browser.close();
console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exit(failures ? 1 : 0);
