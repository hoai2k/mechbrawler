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
// So the toon pass flattens each texture ONCE, at rig load:
//
//   1. CLUSTER.  Sample the texture and k-means its colours into a small set
//      (deterministic farthest-point seeding — same texture, same palette,
//      every load; the pose cache's byte-identical promise reaches through
//      here). Clusters then GROUP into fills: near-identical centres, and —
//      the one that matters — WEAR VARIANTS: a big patch of grimed yellow is
//      the same paint as the clean yellow beside it (same hue, most of the
//      value), and painting them as two fills draws the grime as camo. Each
//      group is painted its cleanest member's colour, because a cartoonist
//      colours the plate, not the dirt on it.
//   2. BRIGHTEN.  Each palette colour is re-mixed as its cartoon self: value
//      lifted on a curve (dark gunmetal becomes a confident mid-tone, white
//      stays white) and saturation pushed, but only where there IS a hue —
//      greys stay grey rather than inventing a tint.
//   3. REPAINT.  Every texel snaps to its cluster's cartoon fill. Region
//      edges follow the original paint job, so the SCHEME survives — the same
//      plates are red — while the surface inside each region goes solid.
//      Alpha passes through untouched: it is the cutout channel or the
//      shade-bias map (toon.js), never colour.
//
// The result feeds the same toon materials as before; the ramp then paints
// its one shade band over genuinely flat fills, which is the whole look.

/** The cartoon grade, in one place. */
export const CEL = {
  // how many clusters k-means starts from, before merging
  clusters: 10,
  // centres closer than this (RGB 0..255 distance) merge into one fill
  mergeDist: 46,
  // value lift: v' = floor + (1 - floor) * v^gamma  (v is HSV value 0..1).
  // Gentle on purpose: a scheme is mostly its VALUE STRUCTURE, and a curve
  // that hauls the dark accent up to the main colour's brightness turns a
  // two-tone mech into a monochrome one (titanus's gunmetal is warm — lifted
  // and saturated it became the same orange as his yellow).
  valueFloor: 0.06,
  valueGamma: 0.78,
  // saturation push, SCALED BY THE LIFTED VALUE: bright fills get the full
  // gain, dark accents keep their muted paint — a dark warm grey that gets
  // the full push reads as brown, not as "dark" any more.
  satGain: 1.35,
  satAdd: 0.05,
  // below this saturation a colour counts as grey and keeps its (lack of) hue
  greySat: 0.09,
  // texels are ASSIGNED to a fill from a blurred read of the texture, as a
  // fraction of its edge (≈2 px at 1024): grime and panel noise straddle the
  // cluster boundaries texel by texel, and classifying the raw pixels keeps
  // exactly the mottle the flattening is here to remove.
  classifyBlur: 0.005,
  // blob pass: a same-paint island smaller than this fraction of the texture
  // is wear/grime — it folds into the paint around it (if the same family).
  // Regions bigger than this are somebody's colour scheme and stay.
  minPlate: 0.01,
  // fills in the same paint family that stayed separate pull this far toward
  // the family's cleanest colour: the regions survive (a drawn version still
  // shades a rusted mech) but the boundary reads as tone, not as camo.
  familyPull: 0.45,
  // textures are mapped at up to this edge; larger ones are processed smaller
  maxEdge: 2048,
};

/** srcTexture -> flattened texture, so shared textures flatten once. */
const DONE = new WeakMap();

/** What each flatten decided — centres, populations, chosen fills — one entry
 *  per texture, for the workbench and the smoke tools to inspect. */
export const CEL_DEBUG = [];

/**
 * The flattened, brightened version of `srcTex`, cached. Returns `srcTex`
 * itself when its image cannot be read back (not yet loaded, compressed,
 * or a canvas security error) — the toon pass then simply looks as it did.
 */
export function celTexture(THREE, srcTex) {
  if (!srcTex) return srcTex;
  const held = DONE.get(srcTex);
  if (held) return held;
  let out;
  try {
    out = flatten(THREE, srcTex);
  } catch (err) {
    console.warn(`cel_palette: texture "${srcTex.name || "?"}" kept as delivered (${err.message})`);
    out = srcTex;
  }
  DONE.set(srcTex, out);
  return out;
}

function flatten(THREE, srcTex) {
  const img = srcTex.image;
  const w0 = img?.width ?? 0;
  const h0 = img?.height ?? 0;
  if (!w0 || !h0) return srcTex;
  const scale = Math.min(1, CEL.maxEdge / Math.max(w0, h0));
  const w = Math.max(1, Math.round(w0 * scale));
  const h = Math.max(1, Math.round(h0 * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h);
  const px = data.data;

  const clustered = clusterColors(px);
  if (!clustered) return srcTex;
  const { centers } = clustered;
  const { home, reps } = groupFills(clustered);
  const groupFill = harmonize(reps).map(cartoonFill);
  CEL_DEBUG.push({ name: srcTex.name || "?", centers, count: [...clustered.count],
    home, reps, fills: groupFill });

  // The classification read: the same image, slightly blurred, so a fleck of
  // grime votes with its neighbourhood instead of flipping its own texel to
  // another fill. The OUTPUT is still written at full sharpness — regions
  // snap to one solid colour either way.
  let read = px;
  const blurPx = Math.max(1, Math.round(Math.max(w, h) * CEL.classifyBlur));
  try {
    const bc = document.createElement("canvas");
    bc.width = w;
    bc.height = h;
    const bctx = bc.getContext("2d", { willReadFrequently: true });
    bctx.filter = `blur(${blurPx}px)`;
    bctx.drawImage(img, 0, 0, w, h);
    read = bctx.getImageData(0, 0, w, h).data;
  } catch { /* no filter support: classify the raw texels */ }

  // Classify every texel: nearest centre -> paint group. The nearest-centre
  // answer is memoised per 5-bit-quantised colour — a 2048² texture asks the
  // distance question 4M times about only a few thousand distinct colours.
  const lut = new Int16Array(32768).fill(-1);
  const gid = new Uint8Array(w * h);
  for (let p = 0, i = 0; i < px.length; p++, i += 4) {
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
  // the panels themselves. So: connected components of same-paint texels,
  // and every island below CEL.minPlate folds into the paint that surrounds
  // it when it is the same family — while a genuine second colour holds
  // large regions of its own and survives untouched.
  absorbBlobs(gid, w, h, reps);

  for (let p = 0, i = 0; i < px.length; p++, i += 4) {
    const fill = groupFill[gid[p]];
    px[i] = fill[0];
    px[i + 1] = fill[1];
    px[i + 2] = fill[2];
    // alpha untouched: cutout or shade-bias data, not colour
  }
  ctx.putImageData(data, 0, 0);

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
  return out;
}

/** k-means over a sample of the texture's opaque-ish texels, deterministic:
 *  farthest-point seeding from the first sample, fixed iteration count.
 *  Returns { centers, count } (population per centre), or null. */
function clusterColors(px) {
  // ~40k samples regardless of texture size
  const stride = 4 * Math.max(1, Math.round(px.length / 4 / 40000));
  const samples = [];
  for (let i = 0; i + 3 < px.length; i += stride) {
    if (px[i + 3] < 16) continue; // fully cut-out texels have no colour vote
    samples.push(px[i], px[i + 1], px[i + 2]);
  }
  const n = samples.length / 3;
  if (n < 2) return null;

  const k = Math.min(CEL.clusters, n);
  const centers = [[samples[0], samples[1], samples[2]]];
  const minD = new Float32Array(n).fill(Infinity);
  while (centers.length < k) {
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

/** Two centres that are really the same PAINT — nearly the same colour, or
 *  shading/wear of one paint job: same hue family, holding MOST of both the
 *  value and the saturation. The two ratio gates carry the schemes:
 *
 *    value ratio  ≥ 0.55   tells "the same plate, dirtier/darker" from a
 *                          deliberate dark accent colour (titanus's yellow
 *                          armour never merges with his gunmetal joints);
 *    sat ratio    ≥ 0.55   tells paint from a different MATERIAL in the same
 *                          warm family (inferno's red is s≈0.6 over greys at
 *                          s≈0.2 two hue-hundredths away — hue alone painted
 *                          the whole mech one orange).
 *
 *  `shareA`/`shareB` are the centres' population fractions: a TINY patch of
 *  grey on a coloured body (viper's pale scuffs, ~2% of texels) is wear even
 *  though greys have no hue to compare — big grey regions are the scheme. */
function samePaint(a, shareA, b, shareB) {
  const A = hsv(a), B = hsv(b);
  const vRatio = Math.min(A.v, B.v) / Math.max(A.v, B.v, 1e-6);
  const sRatio = Math.min(A.s, B.s) / Math.max(A.s, B.s, 1e-6);
  const dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2];
  // Plain nearness is still gated by the value ratio: these textures are DARK
  // (v 0.05 and v 0.15 are 34 RGB units apart — and three stops of paint).
  if (dr * dr + dg * dg + db * db <= CEL.mergeDist * CEL.mergeDist && vRatio >= 0.55) return true;
  const dh = Math.abs(A.h - B.h);
  const hueDist = Math.min(dh, 1 - dh);
  if (A.s >= CEL.greySat && B.s >= CEL.greySat) {
    return hueDist <= 0.09 && vRatio >= 0.55 && sRatio >= 0.55;
  }
  // both greys: shades of the same grey merge, black vs white does not
  if (A.s < 0.18 && B.s < 0.18) return vRatio >= 0.62;
  // grey-on-colour: only a scuff-sized grey folds into the paint it sits on
  const greyShare = A.s < B.s ? shareA : shareB;
  return greyShare < 0.04 && vRatio >= 0.6;
}

/** How much a centre looks like the CLEAN paint of its group — bright AND
 *  still saturated. Plain max-value would elect viper's whitish scuffs over
 *  the purple they sit on. */
const cleanScore = (color) => {
  const { s, v } = hsv(color);
  return v * (0.3 + s);
};

/** One fill colour PER CENTRE: centres grouped by samePaint (largest
 *  population first), every member painted the group's cleanest colour.
 *  Assignment stays per-centre, so region edges still follow the original
 *  paint job; only the fill is shared. */
function groupFills({ centers, count }) {
  const total = count.reduce((a, b) => a + b, 0) || 1;
  const share = centers.map((_, c) => count[c] / total);
  const order = centers.map((_, c) => c).sort((a, b) => count[b] - count[a]);
  const groups = []; // { rep, score, share, vMin, vMax }
  const fill = new Array(centers.length);
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
      Math.min(grp.vMin, v) / Math.max(grp.vMax, v, 1e-6) >= 0.55
      && samePaint(grp.rep, grp.share, color, share[c]));
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
  return { home, reps: groups.map((g) => g.rep) };
}

// -------------------------------------------------------------- blob pass

/** Same PAINT FAMILY for the blob vote: could this island be wear ON the
 *  paint around it? Greys are hue wildcards (grime has no reliable hue), and
 *  the value gate keeps dark accents dark: a bright trim line never folds
 *  into the dark plate it crosses, however small it is. */
function sameFamily(a, b) {
  const A = hsv(a), B = hsv(b);
  const vRatio = Math.min(A.v, B.v) / Math.max(A.v, B.v, 1e-6);
  if (vRatio < 0.45) return false;
  if (A.s < 0.15 || B.s < 0.15) return true;
  const dh = Math.abs(A.h - B.h);
  return Math.min(dh, 1 - dh) <= 0.12;
}

/** Family fills drawn closer together: each group's colour pulls
 *  CEL.familyPull of the way toward the cleanest colour in its own paint
 *  family (inferno's rust-brown moves toward his red; titanus's gunmetal is
 *  NOT the yellow's family — sameFamily's value gate — and keeps its
 *  contrast). Assignment is untouched; only what the region is painted. */
function harmonize(reps) {
  const scores = reps.map(cleanScore);
  return reps.map((color, g) => {
    let leader = -1, best = scores[g];
    for (let l = 0; l < reps.length; l++) {
      if (l === g || scores[l] <= best) continue;
      if (sameFamily(color, reps[l])) { best = scores[l]; leader = l; }
    }
    if (leader < 0) return color;
    const k = CEL.familyPull;
    return color.map((ch, i) => ch + (reps[leader][i] - ch) * k);
  });
}

/**
 * Connected components of same-paint texels; every island smaller than
 * CEL.minPlate of the texture folds into the group most of its BORDER
 * touches, family permitting. Rewrites `gid` in place.
 */
function absorbBlobs(gid, w, h, reps) {
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

  const minArea = Math.max(16, Math.round(size * CEL.minPlate));
  const remap = new Int32Array(comps.length).fill(-1);
  for (let id = 1; id < comps.length; id++) {
    const c = comps[id];
    if (c.size >= minArea) continue;
    let into = -1, most = 0;
    for (let g = 0; g < nG; g++) {
      if (c.border[g] > most) { most = c.border[g]; into = g; }
    }
    if (into >= 0 && sameFamily(reps[c.g], reps[into])) remap[id] = into;
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
function cartoonFill([r0, g0, b0]) {
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
  const v2 = CEL.valueFloor + (1 - CEL.valueFloor) * Math.pow(max, CEL.valueGamma);
  // the push scales with how BRIGHT the fill came out: main colours go vivid,
  // dark accents stay the muted paint they were (see CEL.satGain)
  const s2 = sat < CEL.greySat
    ? sat
    : Math.min(1, sat * (1 + (CEL.satGain - 1) * v2) + CEL.satAdd * v2);
  // HSV back to RGB
  const i = Math.floor(hue * 6);
  const f = hue * 6 - i;
  const p = v2 * (1 - s2), q = v2 * (1 - f * s2), t = v2 * (1 - (1 - f) * s2);
  const [rr, gg, bb] = [
    [v2, t, p], [q, v2, p], [p, v2, t], [p, q, v2], [t, p, v2], [v2, p, q],
  ][i % 6];
  return [Math.round(rr * 255), Math.round(gg * 255), Math.round(bb * 255)];
}
