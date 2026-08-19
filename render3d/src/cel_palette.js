// The cel palette — why a toon-shaded mech reads as a DRAWN mech and not as
// a 3D model under a different shader.
//
// The deliveries' baseColor textures are painted for the PBR path: gradients,
// grime, baked occlusion, panel wear — hundreds of nearby colours across every
// plate. The two-band ramp (toon.js) can harden the LIGHTING all it likes;
// while the ALBEDO still carries that much continuous variation, the figure
// underneath is unmistakably the 3D asset. A drawn character is coloured the
// other way round: a handful of flat fills, chosen brighter than the "real"
// material would be, and every region wears exactly one of them.
//
// So the toon pass flattens each texture ONCE, at rig load, in two halves:
//
// ANALYSE (the plan — what colours this texture is made of)
//   1. CLUSTER.  Sample the texture and k-means its colours into a small set
//      (deterministic farthest-point seeding — same texture, same palette,
//      every load; the pose cache's byte-identical promise reaches through
//      here). Clusters then GROUP into fills: near-identical centres, and —
//      the one that matters — WEAR VARIANTS: a big patch of grimed yellow is
//      the same paint as the clean yellow beside it (same hue, most of the
//      value and saturation), and painting them as two fills draws the grime
//      as camo. Each group is painted its cleanest member's colour, because a
//      cartoonist colours the plate, not the dirt on it.
//   2. BRIGHTEN.  Each group colour is re-mixed as its cartoon self: value
//      lifted on a curve (dark gunmetal becomes a confident mid-tone, white
//      stays white) and saturation pushed where the fill came out bright, but
//      only where there IS a hue — greys stay grey rather than inventing a
//      tint. Groups in one paint family then draw slightly toward the
//      family's cleanest colour, so a rusted plate still reads as tone rather
//      than as camouflage.
//
// BAKE (the texels — which region wears which fill)
//   3. CLASSIFY every texel to a group, off a slightly blurred read so a fleck
//      of grime votes with its neighbourhood.
//   4. ABSORB BLOBS: connected islands of one paint smaller than `minPlate`
//      fold into the paint that surrounds them, family permitting. Grime is
//      islands; a real second colour holds regions of its own and survives.
//   5. REPAINT.  Region edges follow the original paint job, so the SCHEME
//      survives — the same plates are red — while the surface inside each
//      region goes solid. Alpha passes through untouched: it is the cutout
//      channel or the shade-bias map (toon.js), never colour.
//
// WHO SETS THE KNOBS. `CEL` below is the roster default. A character's
// manifest entry may override any of them (and hand-pick the palette itself)
// in its `toon.cel` block, never hard-coded per fighter in engine code. Two
// things write that block:
//
//   * `tools/derive_cel_from_canonical.mjs`, which pins each fill to the
//     colour the fighter's own concept drawing (docs/canonical/) paints that
//     region. The grade below is a guess from the albedo; the drawing is the
//     answer, and every mech on the roster has one.
//   * the toon workbench (/workbench/?edit=toon), which edits a live rig
//     through `recelRig` and exports the same block — for anything the
//     derivation gets wrong, and for anything without a drawing.

/** The cartoon grade, in one place. Every knob here may be overridden per
 *  character by the manifest entry's `toon.cel` block. */
export const CEL = {
  // --- how the texture's colours are found -------------------------------
  // how many clusters k-means starts from, before grouping
  clusters: 10,
  // centres closer than this (RGB 0..255 distance) are the same paint outright
  mergeDist: 46,
  // ...and how far apart in VALUE two centres may be and still be one paint.
  // This is the gate that keeps a scheme two-tone: titanus's yellow armour
  // never merges with his gunmetal joints, however close their hue.
  groupValueRatio: 0.55,
  // how much SATURATION two centres must share. Wear is duller than the paint
  // it sits on; a different material in the same warm family is not (inferno's
  // red at s≈0.6 over greys at s≈0.2, two hue-hundredths away — hue alone
  // painted his whole body one orange).
  groupSatRatio: 0.55,
  // how far apart in hue (0..1 around the wheel) two centres may be
  groupHue: 0.09,
  // below this saturation a colour counts as grey and keeps its (lack of) hue
  greySat: 0.09,

  // --- how each fill is brightened ---------------------------------------
  // value lift: v' = floor + (1 - floor) * v^gamma  (v is HSV value 0..1).
  // Gentle on purpose: a scheme is mostly its VALUE STRUCTURE, and a curve
  // that hauls the dark accent up to the main colour's brightness turns a
  // two-tone mech into a monochrome one.
  valueFloor: 0.06,
  valueGamma: 0.78,
  // saturation push, SCALED BY THE LIFTED VALUE: bright fills get the full
  // gain, dark accents keep their muted paint — a dark warm grey that gets
  // the full push reads as brown, not as "dark" any more.
  satGain: 1.35,
  satAdd: 0.05,
  // fills in the same paint family that stayed separate pull this far toward
  // the family's cleanest colour: the regions survive (a drawn version still
  // shades a rusted mech) but the boundary reads as tone, not as camo.
  familyPull: 0.45,
  // what counts as one family for that pull, and for the blob absorption
  // below: same hue within `familyHue`, holding `familyValueRatio` of the
  // value. Looser than the grouping gates on purpose — the question there is
  // "is this the same paint", here it is "could this be wear on it".
  familyHue: 0.12,
  familyValueRatio: 0.45,

  // --- how texels are assigned to fills ----------------------------------
  // texels are ASSIGNED from a blurred read of the texture, as a fraction of
  // its edge (≈5 px at 1024): grime and panel noise straddle the cluster
  // boundaries texel by texel, and classifying the raw pixels keeps exactly
  // the mottle the flattening is here to remove.
  classifyBlur: 0.005,
  // a same-paint island smaller than this fraction of the texture is
  // wear/grime — it folds into the paint around it (if the same family).
  // Regions bigger than this are somebody's colour scheme and stay.
  minPlate: 0.01,

  // textures are mapped at up to this edge; larger ones are processed smaller
  maxEdge: 2048,
};

/**
 * The hand-picked palette for ONE texture, out of a `toon.cel.palette` block.
 *
 * Most mechs paint their whole body from a single baseColor image, but jerry
 * carries nine materials and tritone three, so the block is keyed BY TEXTURE
 * NAME — otherwise pinning jerry's chest colour would repaint his cockpit
 * glass with it. A bare list of entries is accepted as the one-texture
 * shorthand, and `""` as a catch-all key for the same case.
 */
export function paletteFor(palette, texName) {
  if (!palette) return null;
  if (Array.isArray(palette)) return palette;
  return palette[texName] || palette[""] || null;
}

/** The knobs whose values change the PLAN (which colours exist), as opposed to
 *  only the bake (which texel wears which). Used to decide whether a live
 *  re-cel has to re-cluster — 8 k-means passes over 40k samples — or can just
 *  repaint. Also the export's field order. */
export const PLAN_KEYS = [
  "clusters", "mergeDist", "groupValueRatio", "groupSatRatio", "groupHue",
  "greySat", "valueFloor", "valueGamma", "satGain", "satAdd",
  "familyPull", "familyHue", "familyValueRatio", "maxEdge",
];

/** The knobs that only affect which texels take which fill. */
export const BAKE_KEYS = ["classifyBlur", "minPlate"];

/** Every knob a `toon.cel` block may carry, besides `palette`. */
export const CEL_KEYS = [...PLAN_KEYS, ...BAKE_KEYS];

/** srcTexture -> the cel texture made from it, so shared textures flatten
 *  once. Keyed by the source, holding the result; the result also carries a
 *  back-pointer (`tex.userData.cel.source`) so a live re-cel can re-read the
 *  ORIGINAL pixels after the material has forgotten them. */
const DONE = new WeakMap();

/**
 * The flattened, brightened version of `srcTex`, cached. `opts` are the
 * character's `toon.cel` overrides (see CEL). Returns `srcTex` itself when its
 * image cannot be read back (not yet loaded, compressed, or a canvas security
 * error) — the toon pass then simply looks as it did.
 */
export function celTexture(THREE, srcTex, opts = {}) {
  if (!srcTex) return srcTex;
  const held = DONE.get(srcTex);
  if (held) return held;
  let out;
  try {
    out = flatten(THREE, srcTex, opts);
  } catch (err) {
    console.warn(`cel_palette: texture "${srcTex.name || "?"}" kept as delivered (${err.message})`);
    out = srcTex;
  }
  DONE.set(srcTex, out);
  return out;
}

/**
 * Repaint an already-flattened texture with different knobs — the workbench's
 * live edit. Paints onto the texture's OWN canvas and flags it, so every
 * material already pointing at it updates without being re-materialed.
 *
 * The plan is recomputed only when a PLAN_KEYS knob moved; a palette swatch
 * edit or a blob-size change repaints from the plan already on the texture.
 * Returns the new plan, or null when `celTex` is not one of ours.
 */
export function recelTexture(THREE, celTex, opts = {}) {
  const held = celTex?.userData?.cel;
  if (!held) return null;
  const k = { ...CEL, ...opts };
  const img = held.source.image;
  const size = fitSize(img, k.maxEdge);
  if (!size) return null;

  const moved = (keys) => keys.some((key) => held.knobs[key] !== k[key]);
  const pal = paletteFor(k.palette, held.source.name);
  const replan = !held.plan || moved(PLAN_KEYS);
  const plan = replan ? analyse(img, size, k, pal) : held.plan;
  if (!plan) return null;
  // A swatch edit changes nothing about WHICH region is which — only what it
  // is painted. Repainting from the cached assignment turns a colour-picker
  // drag from a two-second reclassify into a blit, which is the difference
  // between picking a colour and guessing one. The map is only ever kept on
  // this path: the game calls `flatten`, which does not keep it, so the
  // roster does not pay 4 MB a texture for a tool it never opens.
  const reclassify = replan || !held.map || moved(BAKE_KEYS);
  if (!replan) applyPalette(plan, pal);
  const map = reclassify ? classify(img, size, plan, k) : held.map;
  paint(celTex.image, img, size, plan, map);
  celTex.needsUpdate = true;
  celTex.userData.cel = { source: held.source, plan, knobs: k, map };
  return plan;
}

/** The plan a cel texture was painted from — its palette, and how much of the
 *  texture each fill covers. Null for a texture this module did not make. */
export function celPlanOf(celTex) {
  return celTex?.userData?.cel?.plan || null;
}

// ------------------------------------------------------------------ the bake

/** The working size for a texture: its own, capped at `maxEdge`. */
function fitSize(img, maxEdge) {
  const w0 = img?.width ?? 0;
  const h0 = img?.height ?? 0;
  if (!w0 || !h0) return null;
  const scale = Math.min(1, maxEdge / Math.max(w0, h0));
  return { w: Math.max(1, Math.round(w0 * scale)), h: Math.max(1, Math.round(h0 * scale)) };
}

function flatten(THREE, srcTex, opts) {
  const k = { ...CEL, ...opts };
  const img = srcTex.image;
  const size = fitSize(img, k.maxEdge);
  if (!size) return srcTex;
  const plan = analyse(img, size, k, paletteFor(k.palette, srcTex.name));
  if (!plan) return srcTex;

  const canvas = document.createElement("canvas");
  paint(canvas, img, size, plan, classify(img, size, plan, k));

  // clone() rather than a fresh CanvasTexture: flipY, colorSpace, wrap and
  // filters are the GLB's own answers and all of them must survive. But the
  // clone SHARES its Source with the original (three's Texture.copy), so the
  // canvas goes into a Source of its own — writing `out.image` would quietly
  // repaint the delivered texture too.
  const out = srcTex.clone();
  out.source = new THREE.Source(canvas);
  out.mipmaps = [];
  out.needsUpdate = true;
  if (srcTex.name) out.name = `${srcTex.name}(cel)`;
  // The source is kept reachable so the workbench can re-read the ORIGINAL
  // pixels: once loader.js points the material here, nothing else holds it.
  out.userData = { ...out.userData, cel: { source: srcTex, plan, knobs: k } };
  return out;
}

/** Read `img` into a canvas of `size`, optionally through a blur, and hand
 *  back its pixel bytes. */
function readPixels(img, { w, h }, blurPx = 0) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (blurPx > 0) ctx.filter = `blur(${blurPx}px)`;
  ctx.drawImage(img, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h);
}

/** WHICH FILL EACH TEXEL WEARS — a group id per texel, before any colour is
 *  chosen. This is the expensive half (a nearest-centre pass and a flood fill
 *  over every texel) and the half a palette edit does not disturb. */
function classify(img, size, plan, k) {
  const { w, h } = size;
  // The classification read: the image slightly blurred, so a fleck of grime
  // votes with its neighbourhood instead of flipping its own texel to another
  // fill. The OUTPUT is still written at full sharpness — regions snap to one
  // solid colour either way.
  const blurPx = Math.max(1, Math.round(Math.max(w, h) * k.classifyBlur));
  let read;
  try {
    read = readPixels(img, size, blurPx).data;
  } catch {
    read = readPixels(img, size).data; // no filter support: classify raw
  }

  // The nearest-centre answer is memoised per 5-bit-quantised colour — a
  // 2048² texture asks the distance question 4M times about only a few
  // thousand distinct colours.
  const { centers, home, reps } = plan;
  const lut = new Int16Array(32768).fill(-1);
  const gid = new Uint8Array(w * h);
  for (let p = 0, i = 0; p < gid.length; p++, i += 4) {
    const r = read[i], g = read[i + 1], b = read[i + 2];
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    let c = lut[key];
    if (c < 0) c = lut[key] = nearest(centers, r, g, b);
    gid[p] = home[c];
  }

  // THE BLOB PASS — what makes the regions look coloured on purpose. Grime
  // patches straddle paint-group boundaries mid-plate, so classification
  // alone paints camo blobs across every panel. But grime is ISLANDS: a
  // patch of "darker yellow" floating inside a yellow plate, small next to
  // the panels themselves.
  absorbBlobs(gid, w, h, reps, k);
  return gid;
}

/** Write the plan's fills onto a canvas through the texel assignment.
 *
 *  The source is re-read rather than its alpha being kept alongside the plan:
 *  alpha is the cutout channel or the shade-bias map (toon.js) and must
 *  survive byte for byte, but holding a copy would cost 4 MB per 2048²
 *  texture for the whole roster to spare one drawImage on a path that runs
 *  once per texture at load. */
function paint(canvas, img, size, plan, gid) {
  const { w, h } = size;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const data = readPixels(img, size);
  const px = data.data;
  const { fills } = plan;
  for (let p = 0, i = 0; p < gid.length; p++, i += 4) {
    const fill = fills[gid[p]];
    px[i] = fill[0];
    px[i + 1] = fill[1];
    px[i + 2] = fill[2];
    // alpha untouched
  }
  ctx.putImageData(data, 0, 0);
}

// --------------------------------------------------------------- the analysis

/**
 * A texture's PLAN: which colours it is made of, and what each is painted.
 *
 *   centers  the k-means centres, as delivered (what texels are matched to)
 *   home     centre index -> group index
 *   reps     group index -> the group's representative source colour
 *   fills    group index -> the cartoon colour it is painted (0..255 bytes)
 *   shares   group index -> fraction of the sampled texels it covers
 *
 * `palette` overrides `fills` entry by entry — the workbench's hand-picked
 * colours, already resolved for THIS texture (see paletteFor).
 */
function analyse(img, size, k, palette) {
  const px = readPixels(img, size).data;
  const clustered = clusterColors(px, k);
  if (!clustered) return null;
  const { home, reps, shares } = groupFills(clustered, k);
  const auto = harmonize(reps, k).map((c) => cartoonFill(c, k));
  const plan = { centers: clustered.centers, home, reps, auto, shares, fills: auto };
  applyPalette(plan, palette);
  return plan;
}

/**
 * Lay a hand-picked palette over a plan's automatic fills. A palette is a
 * LIST OF ENTRIES, each naming the fill it pins:
 *
 *     [ { group: 0, to: [210, 60, 40] }, { group: 3, to: [24, 24, 30] } ]
 *
 * — explicitly indexed rather than positional, because a block usually pins
 * one or two plates out of five and a sparse positional array is a row of
 * nulls that a hand edit gets wrong. A fill nobody names keeps the colour the
 * grade chose, so pinning the body does not freeze the rest of the scheme.
 * Sets `plan.fills` in place.
 */
function applyPalette(plan, palette) {
  const pinned = new Map();
  for (const entry of palette || []) {
    const g = Number(entry?.group);
    const to = entry?.to;
    if (!Number.isInteger(g) || !Array.isArray(to) || to.length !== 3) continue;
    pinned.set(g, to.map(clampByte));
  }
  plan.fills = plan.auto.map((auto, g) => pinned.get(g) || auto);
}

const clampByte = (v) => Math.max(0, Math.min(255, Math.round(Number(v) || 0)));

/** k-means over a sample of the texture's opaque-ish texels, deterministic:
 *  farthest-point seeding from the first sample, fixed iteration count.
 *  Returns { centers, count } (population per centre), or null. */
function clusterColors(px, k) {
  // ~40k samples regardless of texture size
  const stride = 4 * Math.max(1, Math.round(px.length / 4 / 40000));
  const samples = [];
  for (let i = 0; i + 3 < px.length; i += stride) {
    if (px[i + 3] < 16) continue; // fully cut-out texels have no colour vote
    samples.push(px[i], px[i + 1], px[i + 2]);
  }
  const n = samples.length / 3;
  if (n < 2) return null;

  const want = Math.min(Math.max(2, Math.round(k.clusters)), n);
  const centers = [[samples[0], samples[1], samples[2]]];
  const minD = new Float32Array(n).fill(Infinity);
  while (centers.length < want) {
    const [cr, cg, cb] = centers[centers.length - 1];
    let far = 0, farD = -1;
    for (let s = 0; s < n; s++) {
      const dr = samples[s * 3] - cr, dg = samples[s * 3 + 1] - cg, db = samples[s * 3 + 2] - cb;
      const d = dr * dr + dg * dg + db * db;
      if (d < minD[s]) minD[s] = d;
      if (minD[s] > farD) { farD = minD[s]; far = s; }
    }
    if (farD <= 0) break; // fewer distinct colours than clusters
    centers.push([samples[far * 3], samples[far * 3 + 1], samples[far * 3 + 2]]);
  }

  const count = new Float64Array(centers.length);
  const sum = new Float64Array(centers.length * 3);
  for (let iter = 0; iter < 8; iter++) {
    count.fill(0);
    sum.fill(0);
    for (let s = 0; s < n; s++) {
      const r = samples[s * 3], g = samples[s * 3 + 1], b = samples[s * 3 + 2];
      const c = nearest(centers, r, g, b);
      count[c]++;
      sum[c * 3] += r;
      sum[c * 3 + 1] += g;
      sum[c * 3 + 2] += b;
    }
    for (let c = 0; c < centers.length; c++) {
      if (!count[c]) continue;
      centers[c] = [sum[c * 3] / count[c], sum[c * 3 + 1] / count[c], sum[c * 3 + 2] / count[c]];
    }
  }
  return { centers, count };
}

/** hue (0..1), sat, value of an RGB-byte triple. */
function hsv([r, g, b]) {
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
  return { h, s: max > 0 ? d / max : 0, v: max };
}

/** Distance around the hue wheel, 0..0.5. */
function hueGap(a, b) {
  const d = Math.abs(a - b);
  return Math.min(d, 1 - d);
}

/** Two centres that are really the same PAINT — nearly the same colour, or
 *  shading/wear of one paint job: same hue family, holding MOST of both the
 *  value and the saturation (CEL.groupValueRatio / groupSatRatio say why).
 *
 *  `shareA`/`shareB` are the centres' population fractions: a TINY patch of
 *  grey on a coloured body (viper's pale scuffs, ~2% of texels) is wear even
 *  though greys have no hue to compare — big grey regions are the scheme. */
function samePaint(a, shareA, b, shareB, k) {
  const A = hsv(a), B = hsv(b);
  const vRatio = Math.min(A.v, B.v) / Math.max(A.v, B.v, 1e-6);
  const sRatio = Math.min(A.s, B.s) / Math.max(A.s, B.s, 1e-6);
  const dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2];
  // Plain nearness is still gated by the value ratio: these textures are DARK
  // (v 0.05 and v 0.15 are 34 RGB units apart — and three stops of paint).
  if (dr * dr + dg * dg + db * db <= k.mergeDist * k.mergeDist
      && vRatio >= k.groupValueRatio) return true;
  if (A.s >= k.greySat && B.s >= k.greySat) {
    return hueGap(A.h, B.h) <= k.groupHue
      && vRatio >= k.groupValueRatio && sRatio >= k.groupSatRatio;
  }
  // both greys: shades of the same grey merge, black vs white does not
  if (A.s < 0.18 && B.s < 0.18) return vRatio >= k.groupValueRatio + 0.07;
  // grey-on-colour: only a scuff-sized grey folds into the paint it sits on
  const greyShare = A.s < B.s ? shareA : shareB;
  return greyShare < 0.04 && vRatio >= k.groupValueRatio + 0.05;
}

/** How much a centre looks like the CLEAN paint of its group — bright AND
 *  still saturated. Plain max-value would elect viper's whitish scuffs over
 *  the purple they sit on. */
function cleanScore(color) {
  const { s, v } = hsv(color);
  return v * (0.3 + s);
}

/** Centres grouped into paint jobs, then RE-ORDERED by how much of the
 *  texture each finished group covers — so group 0 is the body colour and the
 *  indices a hand-picked palette is keyed by mean something.
 *
 *  The reorder is not cosmetic. Groups are BUILT in order of their seed
 *  centre's population, and a group that gathers four middling centres ends
 *  up bigger than one built from a single large one — on titanus the first
 *  group built covers 24% and the second 41%. Keyed on build order, "group 0"
 *  in a manifest block would name whichever plate happened to seed first.
 *
 *  Each group's representative is its cleanest member. Assignment stays
 *  per-CENTRE, so region edges still follow the original paint job; only the
 *  colour is shared. */
function groupFills({ centers, count }, k) {
  const total = count.reduce((a, b) => a + b, 0) || 1;
  const share = centers.map((_, c) => count[c] / total);
  const order = centers.map((_, c) => c).sort((a, b) => count[b] - count[a]);
  const groups = []; // { rep, score, share, vMin, vMax }
  const home = new Array(centers.length);
  for (const c of order) {
    const color = centers[c];
    const v = hsv(color).v;
    // The span bound is what stops TRANSITIVE chaining: a texture's smooth
    // shading ramp merges pairwise step by perfectly-reasonable step until
    // black and highlight are one fill (inferno went 98% one orange this
    // way). However a candidate joins, the group's darkest and brightest
    // members must stay within one paint's worth of each other.
    let g = groups.findIndex((grp) =>
      Math.min(grp.vMin, v) / Math.max(grp.vMax, v, 1e-6) >= k.groupValueRatio
      && samePaint(grp.rep, grp.share, color, share[c], k));
    if (g < 0) {
      g = groups.length;
      groups.push({ rep: color, score: cleanScore(color), share: share[c], vMin: v, vMax: v });
    } else {
      const grp = groups[g];
      grp.share += share[c];
      grp.vMin = Math.min(grp.vMin, v);
      grp.vMax = Math.max(grp.vMax, v);
      const score = cleanScore(color);
      if (score > grp.score) {
        grp.rep = color;
        grp.score = score;
      }
    }
    home[c] = g;
  }

  // Biggest finished group first, and `home` rewritten to the new numbering.
  const bySize = groups.map((_, g) => g).sort((a, b) => groups[b].share - groups[a].share);
  const renumber = new Array(groups.length);
  bySize.forEach((was, now) => { renumber[was] = now; });
  return {
    home: home.map((g) => renumber[g]),
    reps: bySize.map((g) => groups[g].rep),
    shares: bySize.map((g) => groups[g].share),
  };
}

/** Family fills drawn closer together: each group's colour pulls
 *  `familyPull` of the way toward the cleanest colour in its own paint family
 *  (inferno's rust-brown moves toward his red; titanus's gunmetal is NOT the
 *  yellow's family — sameFamily's value gate — and keeps its contrast).
 *  Assignment is untouched; only what the region is painted. */
function harmonize(reps, k) {
  const scores = reps.map(cleanScore);
  return reps.map((color, g) => {
    let leader = -1, best = scores[g];
    for (let l = 0; l < reps.length; l++) {
      if (l === g || scores[l] <= best) continue;
      if (sameFamily(color, reps[l], k)) { best = scores[l]; leader = l; }
    }
    if (leader < 0) return color;
    return color.map((ch, i) => ch + (reps[leader][i] - ch) * k.familyPull);
  });
}

/** Same PAINT FAMILY: could this be wear ON that paint? Greys are hue
 *  wildcards (grime has no reliable hue), and the value gate keeps dark
 *  accents dark — a bright trim line never folds into the dark plate it
 *  crosses, however small it is. */
function sameFamily(a, b, k) {
  const A = hsv(a), B = hsv(b);
  const vRatio = Math.min(A.v, B.v) / Math.max(A.v, B.v, 1e-6);
  if (vRatio < k.familyValueRatio) return false;
  if (A.s < 0.15 || B.s < 0.15) return true;
  return hueGap(A.h, B.h) <= k.familyHue;
}

/**
 * Connected components of same-paint texels; every island smaller than
 * `minPlate` of the texture folds into the group most of its BORDER touches,
 * family permitting. Rewrites `gid` in place.
 */
function absorbBlobs(gid, w, h, reps, k) {
  const nG = reps.length;
  const size = w * h;
  const label = new Int32Array(size); // 0 = unvisited, >0 = component id
  const stack = new Int32Array(size);
  const comps = [null]; // id -> { g, size, border: Uint32Array(nG) }
  for (let seed = 0; seed < size; seed++) {
    if (label[seed] !== 0) continue;
    const id = comps.length;
    const g = gid[seed];
    const border = new Uint32Array(nG);
    let area = 0;
    let top = 0;
    stack[top++] = seed;
    label[seed] = id;
    while (top > 0) {
      const p = stack[--top];
      area++;
      const x = p % w;
      for (const q of [x > 0 ? p - 1 : -1, x + 1 < w ? p + 1 : -1,
                       p >= w ? p - w : -1, p + w < size ? p + w : -1]) {
        if (q < 0) continue;
        if (gid[q] !== g) { border[gid[q]]++; continue; }
        if (label[q] === 0) { label[q] = id; stack[top++] = q; }
      }
    }
    comps.push({ g, size: area, border });
  }

  const minArea = Math.max(16, Math.round(size * k.minPlate));
  const remap = new Int32Array(comps.length).fill(-1);
  for (let id = 1; id < comps.length; id++) {
    const c = comps[id];
    if (c.size >= minArea) continue;
    let into = -1, most = 0;
    for (let g = 0; g < nG; g++) {
      if (c.border[g] > most) { most = c.border[g]; into = g; }
    }
    if (into >= 0 && sameFamily(reps[c.g], reps[into], k)) remap[id] = into;
  }
  for (let p = 0; p < size; p++) {
    const into = remap[label[p]];
    if (into >= 0) gid[p] = into;
  }
}

function nearest(centers, r, g, b) {
  let best = 0, bestD = Infinity;
  for (let c = 0; c < centers.length; c++) {
    const dr = centers[c][0] - r, dg = centers[c][1] - g, db = centers[c][2] - b;
    const d = dr * dr + dg * dg + db * db;
    if (d < bestD) { bestD = d; best = c; }
  }
  return best;
}

/** One palette colour's cartoon self: HSV value lifted, saturation pushed
 *  (greys exempt), back to 0..255 RGB bytes. */
function cartoonFill([r0, g0, b0], k) {
  const r = r0 / 255, g = g0 / 255, b = b0 / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const d = max - min;
  let hue = 0;
  if (d > 0) {
    if (max === r) hue = ((g - b) / d + 6) % 6;
    else if (max === g) hue = (b - r) / d + 2;
    else hue = (r - g) / d + 4;
    hue /= 6;
  }
  const sat = max > 0 ? d / max : 0;
  const v2 = k.valueFloor + (1 - k.valueFloor) * Math.pow(max, k.valueGamma);
  // the push scales with how BRIGHT the fill came out: main colours go vivid,
  // dark accents stay the muted paint they were (see CEL.satGain)
  const s2 = sat < k.greySat
    ? sat
    : Math.min(1, sat * (1 + (k.satGain - 1) * v2) + k.satAdd * v2);
  // HSV back to RGB
  const i = Math.floor(hue * 6);
  const f = hue * 6 - i;
  const p = v2 * (1 - s2), q = v2 * (1 - f * s2), t = v2 * (1 - (1 - f) * s2);
  const [rr, gg, bb] = [
    [v2, t, p], [q, v2, p], [p, v2, t], [p, q, v2], [t, p, v2], [v2, p, q],
  ][i % 6];
  return [Math.round(rr * 255), Math.round(gg * 255), Math.round(bb * 255)];
}
