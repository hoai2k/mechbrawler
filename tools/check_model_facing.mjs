// WHICH WAY DOES THE MODEL FACE? Measured against the drawing, not by eye.
//
// The sprite is the authority: every fighter's art is drawn facing RIGHT, and
// the 3D rig exists to reproduce that fighter. So the question "is this model
// backwards" has an objective answer — render the rig, take its outline, and
// compare it with the sprite's outline and with the sprite's MIRROR. If the
// mirror matches better, the model is facing the wrong way.
//
// WHY NOT LOOK. Because looking does not work here, and the project has the
// scars to prove it: smoke_facing.mjs opens by noting the camera yaw was wrong
// twice and a human missed it both times. A 380-pixel figure in a dark coat
// reads about the same from four angles, and a black-robed curse reads as a
// silhouette from all of them. Every eyeball pass I made on this disagreed
// with the last one.
//
// WHY NOT THE BONES. smoke_facing.mjs measures heel-to-toe on one foot, which
// is fine for the sign check it does. It is not fine as a measurement: fighters
// stand with their toes turned out, and across this roster that splay runs from
// 15° to 72°, so one foot is the body's forward plus an unknown share of a very
// large angle. Hips and shoulders are steadier but need a left/right bone
// convention that the rigs do not all honour. The outline needs neither.
//
// IoU on the outline is the same measure tools/pose_silhouettes.mjs uses for
// whether two poses read apart, for the same reason: it is what the eye is
// doing when it decides which way somebody is facing.
//
// WHAT THIS CANNOT DO, AND IT COST A ROSTER TO LEARN IT. An outline cannot tell
// FRONT from BACK. Turn a standing figure through 180° and the silhouette is
// very nearly the same shape — measured across this roster the two score within
// 0.118 of each other on average, within 0.012 for Nobara, and for four
// fighters the model facing AWAY scores HIGHER than the model facing the
// camera. So a sweep of the whole circle has a second peak about 180° from the
// true one, and it can win on details that have nothing to do with facing: a
// gap under an arm, the flare of a coat.
//
// An earlier version of this file swept the circle, took the best score, and
// called it confident when the score beat the stored angle by a margin. That
// margin measured OUTLINE FIT, not FACING, and it duly turned Nobara, Yuta,
// Todo, Yuki and Dagon around backwards — every one of them moved by 112° to
// 164°, which is the signature of landing on the wrong peak. `--solve` now
// refuses any answer its own opposite can match (frontBackGap below), which is
// most of them. Front-versus-back is a job for the 3D workbench, where a human
// looks at the model beside the drawing.
//
//   node server.mjs
//   node tools/check_model_facing.mjs            # every fighter
//   node tools/check_model_facing.mjs gojo       # just one
//   node tools/check_model_facing.mjs --out dir  # ...and write the masks

import { chromium } from "playwright";
import { pressStart } from "./smoke_boot.mjs";
import { mkdirSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const BASE = args.find((a) => a.startsWith("http")) || "http://127.0.0.1:5174";
const outIdx = args.indexOf("--out");
const OUT = outIdx >= 0 ? args[outIdx + 1] : null;
const ONLY = args.find((a) => !a.startsWith("-") && !a.startsWith("http") && a !== OUT) || null;
/** --solve sweeps yawOffsetDeg for the named fighter and reports the angle
 *  whose outline matches the drawing best, instead of reporting a verdict on
 *  the one it is stored at. The manifest is not written: a delivery correction
 *  is a claim about a file and deserves a human reading the number. */
const SOLVE = args.includes("--solve");
/** --turn-sweep asks the other half of the question. Once every model is
 *  solved to the angle the art is drawn at, the turnaround is ONE number for
 *  the whole roster — the yaw that reflects that angle — and it can be read the
 *  same way: try turns, score every fighter's left-facing outline against the
 *  mirrored drawing, keep the turn that wins on average. */
const TURN_SWEEP = args.includes("--turn-sweep");
/** A standing idle is very nearly bilaterally symmetric, so its outline scores
 *  almost as well at angles that are plainly wrong — sweeping Yuji names 101°
 *  "best" on a 0.005 lead over the 0° he is correctly stored at. A solve is
 *  therefore only worth reporting when it beats the stored angle by a margin
 *  no near-symmetry can produce. Below it the honest answer is "this cannot be
 *  read off an idle", not a number. */
const SOLVE_CONFIDENT = 0.08;

/** THE NOISE FLOOR, and the same number the solve uses to decide it has found
 *  anything. A standing idle is very nearly bilaterally symmetric, so its
 *  outline scores almost as well against the mirror as against itself: sweeping
 *  Yuji's angle names 101° "best" on a 0.005 lead over the 0° he is correctly
 *  stored at. Anything under this is a coin toss dressed as a measurement.
 *
 *  A model that is genuinely backwards is nowhere near it — Maki scored 0.227
 *  the right way round against 0.320 mirrored, and 0.555 once corrected. That
 *  is the size of a real answer, and it is why this tool is worth trusting for
 *  the gross error and worth ignoring for the last twenty degrees. */
const MARGIN = 0.08;

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-proxy-server"],
});
const page = await browser.newPage();
page.on("pageerror", (e) => console.log(`  page error: ${String(e).slice(0, 160)}`));

await page.goto(`${BASE}/index.html?render=3d&mannequin=none&camera=flat`);
await pressStart(page);
await page.waitForFunction(
  async () => (await import("/src/state.js")).state.phase === "menu", { timeout: 120000 });
await page.waitForFunction(() => window.__render3d?.ready === true, { timeout: 90000 });

const rows = await page.evaluate(async ([only, wantMasks, solve, turnSweep]) => {
  const rigs = await import("/render3d/src/loader.js");
  const scene = await import("/render3d/src/scene.js");
  const assets = await import("/src/assets.js");
  const { CHARACTER_KEYS } = await import("/src/characters.js");

  const N = 96;   // mask resolution; the outline is a shape, not a portrait

  /** A pose's outline as an N×N bitmask, cropped to its own bounding box and
   *  scaled to fill it — so the comparison is of SHAPE, free of how big either
   *  source happens to draw the fighter or where in the frame it sits. */
  const maskOf = (src, w, h, read) => {
    let x0 = w, x1 = -1, y0 = h, y1 = -1;
    const hit = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (!read(x, y)) continue;
        hit[y * w + x] = 1;
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
    if (x1 < x0 || y1 < y0) return null;
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
    const m = new Uint8Array(N * N);
    for (let j = 0; j < N; j++) {
      const sy = y0 + Math.floor((j + 0.5) * bh / N);
      for (let i = 0; i < N; i++) {
        const sx = x0 + Math.floor((i + 0.5) * bw / N);
        m[j * N + i] = hit[sy * w + sx];
      }
    }
    return m;
  };

  const mirror = (m) => {
    const o = new Uint8Array(N * N);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) o[j * N + i] = m[j * N + (N - 1 - i)];
    return o;
  };
  const iou = (a, b) => {
    let inter = 0, uni = 0;
    for (let i = 0; i < a.length; i++) {
      if (a[i] && b[i]) inter++;
      if (a[i] || b[i]) uni++;
    }
    return uni ? inter / uni : 0;
  };
  const toPng = (m) => {
    const c = document.createElement("canvas");
    c.width = N; c.height = N;
    const g = c.getContext("2d");
    const d = g.createImageData(N, N);
    for (let i = 0; i < m.length; i++) {
      d.data[i * 4] = d.data[i * 4 + 1] = d.data[i * 4 + 2] = m[i] ? 255 : 0;
      d.data[i * 4 + 3] = 255;
    }
    g.putImageData(d, 0, 0);
    return c.toDataURL("image/png");
  };

  const out = [];
  for (const key of (only ? [only] : CHARACTER_KEYS)) {
    const rig = rigs.getRig(key);
    const clip = rig && rigs.resolveClip(key, "idle");
    if (!rig || !clip || rig.isMannequin) { out.push({ key, skip: "no delivered rig" }); continue; }

    // THE MODEL, drawn both ways the game draws it. Facing right is the render
    // with no turnaround; facing left is the TURNED render, because with the
    // turnaround dial on the rig is yawed and the blit does not mirror — so
    // what reaches the screen when a fighter faces left is this, unflipped.
    const renderMask = (turn) => {
      const e = scene.renderPose(key, "idle", 0.1, rig, clip, { turnYawRad: turn });
      if (!e) return null;
      const c = e.canvas, g = c.getContext("2d");
      const d = g.getImageData(0, 0, c.width, c.height).data;
      return maskOf(null, c.width, c.height, (x, y) => d[(y * c.width + x) * 4 + 3] > 40);
    };
    const model = renderMask(0);
    const modelLeft = renderMask(scene.turnaroundYaw());
    if (!model) { out.push({ key, skip: "no render" }); continue; }

    // THE DRAWING for the same pose. `preview: false` — the sprite the game is
    // actually shipping, not one waiting on approval.
    // The sprite has to be fetched: this page runs the 3D backend, so nothing
    // has pulled the drawings in on its own.
    let poseKey = null;
    for (const k of ["idle_a", "idle_b"]) {
      if (!assets.frameMeta(k === "idle_a" ? key : key, k)) continue;
      await assets.loadFrame(key, k);
      if (assets.frameImage(key, k)) { poseKey = k; break; }
    }
    const meta = poseKey && assets.frameMeta(key, poseKey);
    const img = poseKey && assets.frameImage(key, poseKey);
    if (!meta || !img || !img.complete || !img.naturalWidth) {
      out.push({ key, skip: "no sprite loaded" }); continue;
    }
    const sc = document.createElement("canvas");
    sc.width = img.naturalWidth; sc.height = img.naturalHeight;
    const sg = sc.getContext("2d");
    sg.drawImage(img, 0, 0);
    const sd = sg.getImageData(0, 0, sc.width, sc.height).data;
    // A sprite stored mirrored is un-mirrored by the renderer before it is
    // ever drawn, so the mask has to agree with what the player sees.
    const flip = !!meta.faceLeft;
    let sprite = maskOf(null, sc.width, sc.height,
      (x, y) => sd[(y * sc.width + (flip ? sc.width - 1 - x : x)) * 4 + 3] > 40);
    if (!sprite || !model) { out.push({ key, skip: "empty mask" }); continue; }

    if (solve) {
      // Sweep the whole circle at 5°, then refine at 1° around the winner.
      const scoreAt = (deg) => {
        rigs.setRigSettings(key, { yawOffsetDeg: deg });
        scene.clearCache();
        const m = renderMask(0);
        return m ? iou(m, sprite) : 0;
      };
      const stored = rig.yawOffsetDeg ?? 0;
      let best = { deg: stored, score: -1 }, curve = [];
      for (let d = -180; d < 180; d += 5) {
        const sc = scoreAt(d);
        curve.push([d, +sc.toFixed(3)]);
        if (sc > best.score) best = { deg: d, score: sc };
      }
      for (let d = best.deg - 4; d <= best.deg + 4; d += 1) {
        const sc = scoreAt(d);
        if (sc > best.score) best = { deg: d, score: sc };
      }
      const storedScore = scoreAt(stored);
      // THE ONE CHECK THAT MATTERS: how much worse is this same answer spun
      // half a turn? If the outline cannot tell, neither can this tool, and
      // the number it would print is a coin toss between facing and facing
      // away.
      const oppositeScore = scoreAt(best.deg + 180);
      rigs.setRigSettings(key, { yawOffsetDeg: stored });
      scene.clearCache();
      out.push({ key, solve: true, stored, storedScore: +storedScore.toFixed(3),
                 bestDeg: best.deg, bestScore: +best.score.toFixed(3),
                 frontBackGap: +(best.score - oppositeScore).toFixed(3),
                 curve: curve.sort((a, b) => b[1] - a[1]).slice(0, 6) });
      continue;
    }

    if (turnSweep) {
      const spriteL = mirror(sprite);
      const scores = [];
      for (let t = -200; t <= -20; t += 5) {
        const m = renderMask((t * Math.PI) / 180);
        scores.push([t, m ? +iou(m, spriteL).toFixed(4) : 0]);
      }
      out.push({ key, turnSweep: true, scores });
      continue;
    }

    const spriteL = mirror(sprite);
    const same = iou(model, sprite);
    const mirrored = iou(model, spriteL);
    // Facing left should look like the MIRRORED drawing, for the same reason
    // facing right should look like the drawing.
    const leftSame = modelLeft ? iou(modelLeft, spriteL) : null;
    const leftMirrored = modelLeft ? iou(modelLeft, sprite) : null;
    const row = { key, same: +same.toFixed(3), mirrored: +mirrored.toFixed(3),
                  leftSame: leftSame === null ? null : +leftSame.toFixed(3),
                  leftMirrored: leftMirrored === null ? null : +leftMirrored.toFixed(3),
                  spriteFaceLeft: flip };
    if (wantMasks) { row.modelPng = toPng(model); row.spritePng = toPng(sprite); }
    out.push(row);
  }
  return out;
}, [ONLY, !!OUT, SOLVE, TURN_SWEEP]);

await browser.close();

if (OUT) mkdirSync(OUT, { recursive: true });
if (TURN_SWEEP) {
  const rows2 = rows.filter((r) => r.turnSweep);
  const turns = rows2[0].scores.map(([t]) => t);
  const mean = turns.map((t, i) => [t,
    rows2.reduce((a, r) => a + r.scores[i][1], 0) / rows2.length]);
  mean.sort((a, b) => b[1] - a[1]);
  console.log(`${rows2.length} fighters scored across ${turns.length} candidate turns\n`);
  console.log("best turns by mean left-facing match with the mirrored drawing:");
  for (const [t, v] of mean.slice(0, 8)) console.log(`  ${String(t).padStart(5)}°   ${v.toFixed(4)}`);
  const cur = mean.find(([t]) => t === -120);
  console.log(`\ncurrently shipping -120°: ${cur ? cur[1].toFixed(4) : "?"}`);
  process.exit(0);
}

if (SOLVE) {
  for (const r of rows) {
    if (r.skip) { console.log(`${r.key.padEnd(13)} (${r.skip})`); continue; }
    const gain = r.bestScore - r.storedScore;
    console.log(`${r.key}: stored ${r.stored}° scores ${r.storedScore}`
      + `  ·  best ${r.bestDeg}° scores ${r.bestScore}  (+${gain.toFixed(3)})`);
    console.log(`  same angle spun 180°: ${(r.bestScore - r.frontBackGap).toFixed(3)}`
      + `  (gap ${r.frontBackGap >= 0 ? "+" : ""}${r.frontBackGap.toFixed(3)})`);
    if (r.frontBackGap < SOLVE_CONFIDENT) {
      console.log(`  WITHHELD — the outline cannot tell front from back here, so `
        + `${r.bestDeg}° and ${((r.bestDeg + 180 + 180) % 360) - 180}° are the same claim.`);
      console.log(`  Judge this one in the 3D workbench, model beside drawing.`);
    } else if (gain < SOLVE_CONFIDENT) {
      console.log(`  WITHHELD — beats the stored angle by only ${gain.toFixed(3)} `
        + `(needs ${SOLVE_CONFIDENT}): leave it alone.`);
    } else {
      console.log(`  usable — ${r.bestDeg}° fits the drawing better AND survives the `
        + `front/back check. Still worth a look in the workbench before writing it.`);
    }
    console.log(`  top angles: ${r.curve.map(([d, v]) => `${d}°=${v}`).join("  ")}`);
  }
  process.exit(0);
}

let backwards = 0, unclear = 0, ok = 0;
// "MIRRORED" rather than "backwards": the mirror of the drawing is what a
// fighter facing LEFT looks like, and also roughly what one facing AWAY looks
// like, so a flag here says the facing is wrong without saying which way.
const call = (d) => (d > MARGIN ? "MIRRORED" : d < -MARGIN ? "ok" : "unclear");
console.log("fighter       facing RIGHT              facing LEFT");
console.log("              drawn  mirror  verdict    drawn  mirror  verdict");
for (const r of rows) {
  if (r.skip) { console.log(`${r.key.padEnd(13)} (${r.skip})`); continue; }
  const dR = r.mirrored - r.same;
  const dL = r.leftSame === null ? null : r.leftMirrored - r.leftSame;
  const vR = call(dR), vL = dL === null ? "—" : call(dL);
  for (const v of [vR, vL]) {
    if (v === "MIRRORED") backwards++; else if (v === "ok") ok++; else if (v === "unclear") unclear++;
  }
  console.log(`${r.key.padEnd(13)} ${String(r.same).padStart(5)} ${String(r.mirrored).padStart(7)}`
    + `  ${vR.padEnd(9)}  ${String(r.leftSame).padStart(5)} ${String(r.leftMirrored).padStart(7)}  ${vL}`);
  if (OUT && r.modelPng) {
    writeFileSync(`${OUT}/${r.key}_model.png`, Buffer.from(r.modelPng.split(",")[1], "base64"));
    writeFileSync(`${OUT}/${r.key}_sprite.png`, Buffer.from(r.spritePng.split(",")[1], "base64"));
  }
}
console.log(`\n${ok} right way round · ${backwards} mirrored · ${unclear} too close to call`
  + "   (each fighter counts twice: facing right and facing left)");
process.exit(backwards > 0 ? 1 : 0);
