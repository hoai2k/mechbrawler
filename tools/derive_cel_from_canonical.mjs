// derive_cel_from_canonical — paint every rig the colours its canonical
// drawing is painted.
//
// THE PROBLEM. `?render=toon` flattens each delivery's PBR albedo into a few
// solid cartoon fills (render3d/src/cel_palette.js), and the colours it picks
// are chosen by a grade: brighten the value, push the saturation, draw fills in
// one paint family toward the family's cleanest colour. Tuned by eye against
// four mechs and applied to seventeen, that grade gets the roster WRONG, and
// wrong in a specific way — these albedos are dark bodies with saturated
// accents, so the family pull hauls the body toward the accent and the lift
// carries it up out of black. Rhino, whose drawing is a black machine with
// oxide-red plates, renders as one warm brown. Viper, a black machine with
// purple armour and green blades, renders OLIVE, because his grey averaged
// toward his neon. Wraith and saurion render maroon; both are drawn near-black.
//
// The manifest already has the place to fix this — a character's
// `toon.cel.palette` pins any fill to a chosen colour, which is what the toon
// workbench exists to art-direct by hand. What it did not have is an answer to
// "what colour SHOULD this fill be", and for these seventeen there is one:
// `docs/canonical/mech_<id>.png`, the concept drawing each machine was modelled
// from, keyed to alpha by tools/key_canonical.py. So this reads the answer off
// the drawing instead of asking somebody to match it by eye.
//
// HOW IT READS A DRAWING. Through cel_palette's own analysis, run on the
// canonical PNG — same clustering, same grouping, same code. Cel art is already
// flat fills, so the analysis lands on them exactly; it is only told not to
// re-grade what it finds (the drawing is already the cartoon colour, and
// brightening it again would be inventing a second opinion).
//
// That read comes back with the lit band AND the painted shadow of each paint
// as separate groups — a cel shadow is a big enough value drop to clear the
// same-paint gate. So they are PAIRED back up here, which yields both halves of
// what a manifest entry needs:
//
//   * the PAINT is the LIT band, because that is what the ramp multiplies: pin
//     it and the shader draws the shadow. Within a group that is the brightest
//     cluster holding a real share of it — a quorum, so the trim line and the
//     specular flick along an edge cannot stand in for the plate they sit on;
//   * and shadow-over-lit across every pair is the `shadeTint`, the thing the
//     ramp multiplies BY. Measured from this fighter's own art rather than from
//     the roster default, which is the same argument
//     tools/derive_toon_from_shade.py makes from the DI3 sheets, on art that
//     exists for all seventeen.
//
// HOW IT MATCHES. Two palettes describing one machine: the rig's fills (each
// with the source colour it was graded from and the share of the texture it
// covers) and the drawing's paints (colour and share of the figure). Every fill
// takes the paint it is most likely to BE, scored on
//
//   * hue, weighted by how colourful both sides are — a grey has no hue to
//     compare and must not be matched on the noise in one;
//   * where each sits in its own palette's value order, as a share-weighted
//     quantile. Not absolute value: these albedos are authored dark for an
//     environment map and the drawings are lit, so the two scales do not meet.
//     What survives the difference is the ORDER — the body is darker than the
//     trim in both;
//   * likewise saturation, as each side's own range: the albedo is muted
//     against its drawing by construction, so comparing the two raw punishes
//     the very match it should reward. Which entry is the colourful one is
//     what carries across;
//   * how much of its own image each covers — a weak tiebreak, plus a firm
//     refusal to hand a 40% hull to the 0.3% trim beside it.
//
// Fills may share a paint (a model region split in two that the drawing paints
// once) and paints may go unused (a detail the model has no region for). Both
// are real, so neither is forced.
//
// WHAT IT WRITES. `characters.<id>.toon` in render3d/assets/manifest.json: a
// `cel.palette` keyed by source texture name, and a `shadeTint`. Everything
// else in the entry is left alone, and the entry survives a re-run of
// tools/mech_intake.mjs (which regenerates the rest of the manifest and now
// carries the toon blocks across).
//
//   node tools/derive_cel_from_canonical.mjs           # what it would write
//   node tools/derive_cel_from_canonical.mjs --apply   # write the manifest
//
// Needs the game served (`node server.mjs`) and a Chromium, like every other
// tool here that has to ask the real renderer a question: the cel plan is made
// by cel_palette in a browser, off the GLB's own decoded texture, and group
// indices are what a palette block is keyed by. Re-deriving them in another
// language would be a second implementation to disagree with the first.
import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST = join(ROOT, "render3d/assets/manifest.json");
const BASE = process.env.BASE_URL || "http://127.0.0.1:5174";
const APPLY = process.argv.includes("--apply");

// The drawings are named for the character except nullbot, whose file predates
// the rename.
const CANON_FILE = { nullbot: "mech_null" };

// Reading a drawing, not grading one: the fills in a canonical PNG are already
// the cartoon colours, so the grade is set to identity and only the clustering
// runs. `clusters` is up from the roster's 10 because a drawing carries both
// bands of every paint plus its ink, and they have to be found before they can
// be paired.
const READ_KNOBS = {
  clusters: 16, valueFloor: 0, valueGamma: 1, satGain: 1, satAdd: 0, familyPull: 0,
};

// What share of its group's texels a cluster must hold before it may be the
// colour that group stands for. See the election note in the page code below.
const CLUSTER_QUORUM = 0.15;

// --- pairing a drawing's lit fills with their painted shadows ---------------
// A cel shadow is the same paint at a large, deliberate value drop. These are
// the bounds of "large, deliberate": below MIN the darker colour is a different
// PAINT (konga's black fur beside his grey plates, rhino's black frame beside
// his gunmetal), above MAX it is the same band read twice.
const SHADE_VALUE_MIN = 0.32;
const SHADE_VALUE_MAX = 0.82;
const SHADE_HUE = 0.11;        // how far a shadow may cool-shift around the wheel
const SHADE_SAT_RATIO = 0.55;  // …and how much of the paint's saturation it keeps
// A shadow does not cover much more of a figure than the light it is cast from.
// This is what keeps vulcan's oxide-red panels (14% of him) from being read as
// the shadow of his orange visor (6%) and disappearing into it.
const SHADE_MAX_SHARE = 2.0;
// A colour has no hue worth comparing when its channels sit within this many
// bytes of each other. Not a saturation threshold: saturation is a RATIO, and
// on a near-black it is noise — #1b1616 is three bytes off neutral and scores
// s = 0.19, higher than a colour anyone would call tinted.
const GREY_CHROMA = 10;
const GREY_SAT = 0.14;
// A paint's colour is its brightest member that is actually a REGION — a 1%
// specular flick belongs to the paint but is not what the paint IS.
const PAINT_MIN_SHARE = 0.18;
// How hard the measured tint is pulled back toward the roster default, as a
// fraction of the best-determined channel's evidence. A scheme with no blue in
// it (titanus is yellow over gunmetal) says almost nothing about how its
// shadows treat blue, and dividing two small numbers to find out is how a
// derivation invents art direction.
const TINT_PRIOR = 0.15;

// --- matching a rig's fills to those paints ---------------------------------
const W_HUE = 2.4;
const W_SAT = 1.2;
const W_ORDER = 1.3;
const W_SHARE = 0.8;
// …and a paint far smaller than the fill is almost certainly not what that
// fill is. Without this, a 40% hull lands on the 0.3% gold trim beside it
// whenever the hue happens to agree. The guard is quiet until the paint is
// under a quarter of the fill, so a real accent (rhino's red plates against
// his frame) is not pushed away.
const W_SMALLER = 1.5;
const SMALLER_FROM = 0.25;
// Saturation is compared WITHIN each palette's own range — each side's
// saturations divided by its most saturated entry. Comparing them raw is
// backwards: a delivery's albedo is muted against its drawing by construction
// (pushing it is what the cel grade is for), so the absolute gap punishes
// exactly the match it should reward. What carries across is which entry is the
// colourful one — glacier's blue body against his pale ice, rhino's red plates
// against his gunmetal.
// Hue counts for its full weight once both sides are at least this saturated,
// and fades to nothing below — a grey's hue is whatever its noise happens to be.
const HUE_FULL_SAT = 0.28;

const hsv = ([r, g, b]) => {
  const max = Math.max(r, g, b) / 255, min = Math.min(r, g, b) / 255;
  const d = max - min;
  let h = 0;
  if (d > 0) {
    const rr = r / 255, gg = g / 255, bb = b / 255;
    if (max === rr) h = ((gg - bb) / d + 6) % 6;
    else if (max === gg) h = (bb - rr) / d + 2;
    else h = (rr - gg) / d + 4;
    h /= 6;
  }
  // Neutral by absolute chroma, not by saturation — see GREY_CHROMA.
  const neutral = d * 255 < GREY_CHROMA;
  return { h, s: neutral ? 0 : (max > 0 ? d / max : 0), v: max };
};
const hueGap = (a, b) => { const d = Math.abs(a - b); return Math.min(d, 1 - d); };
const hex = (c) => "#" + c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
const shareOf = (p) => p.members.reduce((a, m) => a + m.share, 0);

/** The drawing's PAINTS: its groups with each lit fill's painted shadow folded
 *  back onto it. Returns `{ paints, tint, pairs }`, paints sorted by coverage. */
function paintsOf(groups, defaultTint) {
  // Brightest first, so a shadow always meets its lit side already placed.
  const order = groups.map((_, i) => i)
    .sort((a, b) => hsv(groups[b].color).v - hsv(groups[a].color).v);
  const paints = [];
  for (const i of order) {
    const g = groups[i];
    const G = hsv(g.color);
    const fits = paints.filter((p) => {
      const P = hsv(p.members[0].color);
      const ratio = G.v / Math.max(P.v, 1e-6);
      if (ratio < SHADE_VALUE_MIN || ratio > SHADE_VALUE_MAX) return false;
      if (g.share > shareOf(p) * SHADE_MAX_SHARE) return false;
      if (P.s < GREY_SAT || G.s < GREY_SAT) return P.s < GREY_SAT && G.s < GREY_SAT;
      return hueGap(P.h, G.h) <= SHADE_HUE
        && Math.min(P.s, G.s) / Math.max(P.s, G.s) >= SHADE_SAT_RATIO;
    });
    // The BIGGEST paint it could belong to, not the first one found: a shadow
    // band belongs to the region it shadows, and a small bright flick of the
    // same colour would otherwise adopt it and leave the real paint bandless.
    const lit = fits.sort((a, b) => shareOf(b) - shareOf(a))[0];
    if (lit) lit.members.push(g);
    else paints.push({ members: [g] });
  }
  for (const p of paints) {
    p.share = shareOf(p);
    const real = p.members.filter((m) => m.share >= p.share * PAINT_MIN_SHARE);
    p.color = (real.length ? real : p.members)
      .reduce((best, m) => (hsv(m.color).v > hsv(best.color).v ? m : best)).color;
    const lit = hsv(p.color).v;
    p.shade = p.members.filter((m) => hsv(m.color).v < lit - 1e-6);
  }
  paints.sort((a, b) => b.share - a.share);

  // The tint, as a least-squares fit of shadow = tint * lit across every pair,
  // weighted by coverage and pulled toward the roster default in proportion to
  // how little each channel was exercised (TINT_PRIOR). Per pair per channel it
  // would be a division, and a paint with almost no blue in it divides badly.
  const num = [0, 0, 0], den = [0, 0, 0];
  let pairs = 0;
  for (const p of paints) {
    for (const s of p.shade) {
      pairs++;
      for (let c = 0; c < 3; c++) {
        num[c] += s.share * p.color[c] * s.color[c];
        den[c] += s.share * p.color[c] * p.color[c];
      }
    }
  }
  const lambda = TINT_PRIOR * Math.max(...den);
  const tint = pairs
    ? num.map((n, c) => (n + lambda * defaultTint[c]) / (den[c] + lambda))
    : null;
  return { paints, tint, pairs };
}

/** Where each entry sits in its own palette's value order, 0..1, as a
 *  share-weighted quantile — comparable across palettes of different sizes. */
function valueQuantiles(items) {
  const order = items.map((_, i) => i)
    .sort((a, b) => hsv(items[a].color).v - hsv(items[b].color).v);
  const total = items.reduce((a, it) => a + it.share, 0) || 1;
  const q = new Array(items.length);
  let acc = 0;
  for (const i of order) {
    q[i] = (acc + items[i].share / 2) / total;
    acc += items[i].share;
  }
  return q;
}

/** Every rig fill's best paint. Returns one row per fill. */
function match(fills, paints) {
  const qf = valueQuantiles(fills);
  const qp = valueQuantiles(paints);
  const satF = Math.max(1e-3, ...fills.map((f) => hsv(f.color).s));
  const satP = Math.max(1e-3, ...paints.map((p) => hsv(p.color).s));
  return fills.map((f, i) => {
    const F = hsv(f.color);
    let best = null;
    paints.forEach((p, j) => {
      const P = hsv(p.color);
      const colourful = Math.min(1, Math.min(F.s, P.s) / HUE_FULL_SAT);
      const satMiss = Math.abs(F.s / satF - P.s / satP);
      const cost = W_HUE * hueGap(F.h, P.h) * 2 * colourful
        + W_SAT * satMiss
        + W_ORDER * Math.abs(qf[i] - qp[j])
        + W_SHARE * Math.abs(f.share - p.share)
        + W_SMALLER * Math.max(0, 1 - p.share / Math.max(f.share * SMALLER_FROM, 1e-6));
      if (!best || cost < best.cost) best = { cost, paint: p };
    });
    return { fill: f, group: i, ...best };
  });
}

// ------------------------------------------------------------------ the run

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-proxy-server", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 900, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));

await page.goto(`${BASE}/workbench/?edit=toon&render=toon`);
const { keys, defaultTint } = await page.evaluate(async () => {
  const rv = await import("/workbench/rig_view.js");
  window.__rv = rv;
  window.__cel = await import("/render3d/src/cel_palette.js");
  window.__toon = await import("/render3d/src/toon.js");
  window.__three = await import("/vendor/three/three.module.js");
  await rv.bootRenderer();
  return { keys: rv.MECHS.map((m) => m.key), defaultTint: window.__toon.TOON.shadeTint };
});

const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
let wrote = 0;

for (const key of keys) {
  const file = CANON_FILE[key] || `mech_${key}`;
  const { rig, drawn, error } = await page.evaluate(async ({ key, file, knobs, quorum }) => {
    const rv = window.__rv, toon = window.__toon, cel = window.__cel, THREE = window.__three;
    try {
      rv.ensureRig(key);
      await rv.whenRigReady(key, 60000);
      const rig = toon.celTexturesOf(rv.rigRoot(key)).map((tex) => {
        const held = tex.userData.cel;
        return {
          texture: held.source.name || "",
          fills: held.plan.reps.map((color, g) => ({
            color: color.map(Math.round), share: held.plan.shares[g], auto: held.plan.auto[g],
          })),
        };
      });
      const img = new Image();
      img.src = `/docs/canonical/${file}.png`;
      await img.decode();
      const tex = new THREE.Texture(img);
      tex.name = `canonical:${file}`;
      const plan = cel.celTexture(THREE, tex, knobs).userData.cel.plan;
      // WHICH COLOUR STANDS FOR A GROUP. cel_palette elects the group's
      // CLEANEST member — the brightest, most saturated of its clusters —
      // because on a texture that is the paint rather than the grime on it.
      // On a drawing it goes wrong in one specific way: a flat fill's group
      // also gathers the thin vivid trim drawn along its edge, and a 2%
      // orange highlight then stands for tritone's whole olive hull.
      //
      // What a fill should be pinned to is the paint's LIT BAND — the ramp
      // makes the shade one from it — so a group is represented by its
      // BRIGHTEST cluster that holds a real share of the group. The quorum is
      // the whole trick: it keeps the lit band (a quarter to a half of its
      // paint) and drops the trim, the specular flick and the anti-aliased
      // rim, all of which are brighter still and none of which is the paint.
      // That needs populations, so the centres are re-counted over the drawing.
      const c = document.createElement("canvas");
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      const ctx2d = c.getContext("2d", { willReadFrequently: true });
      ctx2d.drawImage(img, 0, 0);
      const px = ctx2d.getImageData(0, 0, c.width, c.height).data;
      const counts = new Float64Array(plan.centers.length);
      const step = 4 * Math.max(1, Math.round(px.length / 4 / 200000));
      for (let i = 0; i + 3 < px.length; i += step) {
        if (px[i + 3] < 250) continue;   // the keyed rim is card, not paint
        let best = 0, bestD = Infinity;
        for (let k = 0; k < plan.centers.length; k++) {
          const [cr, cg, cb] = plan.centers[k];
          const d = (cr - px[i]) ** 2 + (cg - px[i + 1]) ** 2 + (cb - px[i + 2]) ** 2;
          if (d < bestD) { bestD = d; best = k; }
        }
        counts[best]++;
      }
      const total = counts.reduce((a, b) => a + b, 0) || 1;
      const pop = plan.reps.map(() => 0);
      plan.home.forEach((g, k) => { pop[g] += counts[k]; });
      const drawn = plan.reps.map(() => ({ color: null, share: 0, lit: -1, top: -1 }));
      plan.home.forEach((g, k) => {
        const d = drawn[g];
        d.share += counts[k] / total;
        if (counts[k] > d.top) { d.top = counts[k]; d.busiest = plan.centers[k]; }
        if (counts[k] < pop[g] * quorum) return;   // too small to speak for the group
        const v = Math.max(...plan.centers[k]);
        if (v > d.lit) { d.lit = v; d.color = plan.centers[k]; }
      });
      for (const d of drawn) d.color = (d.color || d.busiest || [0, 0, 0]).map(Math.round);
      return { rig, drawn };
    } catch (err) {
      return { error: String(err && err.message || err) };
    }
  }, { key, file, knobs: READ_KNOBS, quorum: CLUSTER_QUORUM });

  if (error) { console.log(`${key.padEnd(9)} SKIPPED — ${error}`); continue; }

  // Groups too small to be a region are speckle the drawing does not have an
  // opinion about; they are left on the grade rather than pinned to a guess.
  const { paints, tint, pairs } = paintsOf(drawn.filter((d) => d.share >= 0.002), defaultTint);
  console.log(`\n${key} — drawing: ${paints.map((p) => `${hex(p.color)} ${(p.share * 100).toFixed(0)}%`).join("  ")}`);
  console.log(`${" ".repeat(key.length)}   shadeTint ${tint ? tint.map((v) => v.toFixed(2)).join(", ") : "(no shadow pairs found)"} from ${pairs} pair(s)`);

  const palette = {};
  for (const tex of rig) {
    const rows = match(tex.fills, paints);
    palette[tex.texture] = rows.map((r) => ({
      group: r.group, hex: hex(r.paint.color), to: r.paint.color,
    }));
    for (const r of rows) {
      console.log(`  ${String(r.group).padStart(2)} ${(r.fill.share * 100).toFixed(1).padStart(5)}%  `
        + `texture ${hex(r.fill.color)}  was ${hex(r.fill.auto)}  ->  ${hex(r.paint.color)}`);
    }
  }

  const entry = manifest.characters[key];
  if (!entry) { console.log(`  (not in the manifest — nothing written)`); continue; }
  entry.toon = { ...entry.toon, ...(tint ? { shadeTint: tint.map((v) => +v.toFixed(3)) } : {}) };
  entry.toon.cel = { ...entry.toon.cel, palette };
  wrote++;
}

await browser.close();
if (errors.length) console.log(`\npage errors: ${errors.slice(0, 3).join(" | ")}`);

if (APPLY) {
  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`\nwrote ${wrote} toon block(s) to render3d/assets/manifest.json`);
} else {
  console.log(`\ndry run — ${wrote} toon block(s) would be written. --apply to write them.`);
}
