// PBR mech-skin synthesizer: albedo + normal + roughness/metalness maps from
// layered procedural noise. Recipes are small parameter sets (typically
// derived from a concept image's palette/weathering) — see docs/IMAGE_TO_MECH.md.
//
// Layers: BSP panel subdivision → grooves & rivets (height), fBm paint tone
// variation, Worley-clustered edge chips exposing bare metal, scratches,
// grime streaks, optional two-tone panels. Normal map via Sobel over the
// height field. Roughness in G, metalness in B (one shared texture).
import * as THREE from 'three';
import { makeRng } from './utils.js';
import { CONFIG } from './config.js';
import { pbrMaterial } from './texload.js';

const cache = new Map();

// ---------- noise ----------
function valueNoise2D(rng, size) {
  // lattice of random values, sampled bilinearly
  const g = new Float32Array(size * size);
  for (let i = 0; i < g.length; i++) g[i] = rng();
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const sx = xf * xf * (3 - 2 * xf), sy = yf * yf * (3 - 2 * yf);
    const i00 = (yi % size + size) % size * size + (xi % size + size) % size;
    const i10 = (yi % size + size) % size * size + ((xi + 1) % size + size) % size;
    const i01 = ((yi + 1) % size + size) % size * size + (xi % size + size) % size;
    const i11 = ((yi + 1) % size + size) % size * size + ((xi + 1) % size + size) % size;
    const a = g[i00] + (g[i10] - g[i00]) * sx;
    const b = g[i01] + (g[i11] - g[i01]) * sx;
    return a + (b - a) * sy;
  };
}

function fbm(noise, x, y, octaves = 4, lac = 2.1, gain = 0.5) {
  let amp = 1, freq = 1, sum = 0, norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += noise(x * freq, y * freq) * amp;
    norm += amp;
    amp *= gain;
    freq *= lac;
  }
  return sum / norm;
}

// Worley (cellular) noise: distance to nearest feature point, tiled.
function worley2D(rng, points, S) {
  const pts = [];
  for (let i = 0; i < points; i++) pts.push([rng() * S, rng() * S]);
  return (x, y) => {
    let best = Infinity;
    for (const [px, py] of pts) {
      // tiled distance
      let dx = Math.abs(x - px); if (dx > S / 2) dx = S - dx;
      let dy = Math.abs(y - py); if (dy > S / 2) dy = S - dy;
      const d = dx * dx + dy * dy;
      if (d < best) best = d;
    }
    return Math.sqrt(best);
  };
}

// ---------- panel subdivision (BSP) ----------
function splitPanels(rng, S, depth) {
  let rects = [{ x: 0, y: 0, w: S, h: S }];
  for (let d = 0; d < depth; d++) {
    const next = [];
    for (const r of rects) {
      const canSplit = Math.min(r.w, r.h) > S * 0.14 && rng() < 0.82;
      if (!canSplit) { next.push(r); continue; }
      const vertical = r.w > r.h ? true : r.h > r.w ? false : rng() < 0.5;
      const t = 0.32 + rng() * 0.36;
      if (vertical) {
        const w1 = Math.round(r.w * t);
        next.push({ x: r.x, y: r.y, w: w1, h: r.h });
        next.push({ x: r.x + w1, y: r.y, w: r.w - w1, h: r.h });
      } else {
        const h1 = Math.round(r.h * t);
        next.push({ x: r.x, y: r.y, w: r.w, h: h1 });
        next.push({ x: r.x, y: r.y + h1, w: r.w, h: r.h - h1 });
      }
    }
    rects = next;
  }
  return rects;
}

function hexRGB(hex) {
  return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
}

/**
 * Generate a full PBR skin texture set.
 * recipe: {
 *   base (hex), base2 (hex|null two-tone), metal (hex bare steel),
 *   wear 0..1, grime 0..1, panelDepth (BSP splits, ~4),
 *   roughPaint, roughMetal, metalPaint (0..1s),
 *   normalStrength (~1), seed, res (default 384)
 * }
 */
export function mechSkin(recipe) {
  const key = 'skin_' + JSON.stringify(recipe);
  if (cache.has(key)) return cache.get(key);

  const S = recipe.res || 384;
  const seed = recipe.seed || 1;
  const rng = makeRng(seed * 6151 + 17);
  const wear = recipe.wear ?? 0.5;
  const grime = recipe.grime ?? 0.5;

  const nPaint = valueNoise2D(makeRng(seed * 7 + 1), 32);
  const nChip = valueNoise2D(makeRng(seed * 13 + 2), 64);
  const nGrime = valueNoise2D(makeRng(seed * 17 + 3), 24);
  const wChips = worley2D(makeRng(seed * 23 + 4), 26, S);

  const height = new Float32Array(S * S).fill(0.5);
  const chipMask = new Uint8Array(S * S);       // 1 = bare metal
  const grimeMask = new Float32Array(S * S);

  const panels = splitPanels(rng, S, recipe.panelDepth ?? 4);
  // panel border distance field (cheap: per-pixel min distance to own rect edge)
  const panelOf = new Int32Array(S * S).fill(-1);
  panels.forEach((r, i) => {
    for (let y = r.y; y < r.y + r.h && y < S; y++) {
      for (let x = r.x; x < r.x + r.w && x < S; x++) panelOf[y * S + x] = i;
    }
  });
  const edgeDist = (x, y) => {
    const r = panels[panelOf[y * S + x]];
    if (!r) return 99;
    return Math.min(x - r.x, r.x + r.w - 1 - x, y - r.y, r.y + r.h - 1 - y);
  };

  // per-panel tone offsets + optional two-tone assignment
  const panelTone = panels.map(() => (rng() - 0.5) * 0.05);
  const panelAlt = panels.map(() => recipe.base2 != null && rng() < 0.3);

  // ---- height + masks ----
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = y * S + x;
      const ed = edgeDist(x, y);
      // groove at panel borders
      if (ed <= 1) height[i] -= 0.34;
      else if (ed === 2) height[i] -= 0.12;
      // subtle surface undulation
      height[i] += (fbm(nPaint, x / 46, y / 46, 3) - 0.5) * 0.10;
      // chips: clustered near edges via worley + noise, denser with wear
      const w = wChips(x, y) / (S * 0.09);
      const chipBias = ed < 5 ? 0.34 : 0; // edges chip first
      if (nChip(x / 16, y / 16) * 0.6 + chipBias + wear * 0.3 - w * 0.24 > 0.86) {
        chipMask[i] = 1;
        height[i] -= 0.16;
      }
      // grime accumulation (pools along lower panel edges + noise)
      const r = panels[panelOf[i]];
      const belowEdge = r ? (y - r.y) / r.h : 0.5;
      grimeMask[i] = Math.max(0, fbm(nGrime, x / 60, y / 60, 3) - 0.42) * 2.2 * grime
        + (belowEdge > 0.82 ? (belowEdge - 0.82) * 2.4 * grime : 0);
    }
  }

  // rivets at some panel corners
  for (const r of panels) {
    if (rng() < 0.45) continue;
    const inset = 5;
    const corners = [
      [r.x + inset, r.y + inset], [r.x + r.w - inset, r.y + inset],
      [r.x + inset, r.y + r.h - inset], [r.x + r.w - inset, r.y + r.h - inset],
    ];
    for (const [cx, cy] of corners) {
      if (cx < 2 || cy < 2 || cx > S - 3 || cy > S - 3) continue;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d <= 2.2) height[(cy + dy) * S + cx + dx] += (1 - d / 2.6) * 0.32;
        }
      }
    }
  }

  // scratches: thin bright metal lines
  const scratchCount = Math.round(10 + wear * 26);
  for (let s = 0; s < scratchCount; s++) {
    let x = rng() * S, y = rng() * S;
    const a = rng() * Math.PI * 2, len = 8 + rng() * 42;
    const dx = Math.cos(a), dy = Math.sin(a);
    for (let t = 0; t < len; t++) {
      const xi = Math.round(x + dx * t), yi = Math.round(y + dy * t);
      if (xi < 0 || yi < 0 || xi >= S || yi >= S) break;
      chipMask[yi * S + xi] = 1;
      height[yi * S + xi] -= 0.08;
    }
  }

  // ---- albedo + rough/metal ----
  const albedo = document.createElement('canvas');
  albedo.width = albedo.height = S;
  const aCtx = albedo.getContext('2d');
  const aImg = aCtx.createImageData(S, S);
  const rm = document.createElement('canvas');
  rm.width = rm.height = S;
  const rmCtx = rm.getContext('2d');
  const rmImg = rmCtx.createImageData(S, S);

  const baseC = hexRGB(recipe.base);
  const base2C = recipe.base2 != null ? hexRGB(recipe.base2) : baseC;
  const metalC = hexRGB(recipe.metal ?? 0x8a8f96);
  const roughPaint = recipe.roughPaint ?? 0.58;
  const roughMetal = recipe.roughMetal ?? 0.34;
  const metalPaint = recipe.metalPaint ?? 0.25;

  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = y * S + x, o = i * 4;
      const pi = panelOf[i];
      const tone = 1 + (pi >= 0 ? panelTone[pi] : 0) + (fbm(nPaint, x / 42, y / 42, 4) - 0.5) * 0.09;
      const chip = chipMask[i] === 1;
      const src = chip ? metalC : (pi >= 0 && panelAlt[pi] ? base2C : baseC);
      let r = src[0] * tone, g = src[1] * tone, b = src[2] * tone;
      // panel groove darkening
      const ed = edgeDist(x, y);
      if (ed <= 1) { r *= 0.42; g *= 0.42; b *= 0.42; }
      else if (ed === 2) { r *= 0.8; g *= 0.8; b *= 0.8; }
      // grime darkens & browns
      const gr = Math.min(1, grimeMask[i]) * (chip ? 0.4 : 1);
      r = r * (1 - gr * 0.5) + 34 * gr * 0.22;
      g = g * (1 - gr * 0.52) + 30 * gr * 0.22;
      b = b * (1 - gr * 0.56) + 24 * gr * 0.22;
      aImg.data[o] = Math.min(255, r);
      aImg.data[o + 1] = Math.min(255, g);
      aImg.data[o + 2] = Math.min(255, b);
      aImg.data[o + 3] = 255;

      // G = roughness, B = metalness
      let rough = chip ? roughMetal : roughPaint;
      rough += gr * 0.3 + (fbm(nChip, x / 22, y / 22, 3) - 0.5) * 0.1;
      let metal = chip ? 0.95 : metalPaint;
      metal *= 1 - gr * 0.5;
      rmImg.data[o] = 255;
      rmImg.data[o + 1] = Math.max(0, Math.min(255, rough * 255));
      rmImg.data[o + 2] = Math.max(0, Math.min(255, metal * 255));
      rmImg.data[o + 3] = 255;
    }
  }
  aCtx.putImageData(aImg, 0, 0);
  rmCtx.putImageData(rmImg, 0, 0);

  // ---- normal map from height (Sobel) ----
  const nrm = document.createElement('canvas');
  nrm.width = nrm.height = S;
  const nCtx = nrm.getContext('2d');
  const nImg = nCtx.createImageData(S, S);
  const strength = (recipe.normalStrength ?? 1) * 2.2;
  const H = (x, y) => height[((y + S) % S) * S + ((x + S) % S)];
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const o = (y * S + x) * 4;
      const gx = (H(x + 1, y - 1) + 2 * H(x + 1, y) + H(x + 1, y + 1)
        - H(x - 1, y - 1) - 2 * H(x - 1, y) - H(x - 1, y + 1)) * strength;
      const gy = (H(x - 1, y + 1) + 2 * H(x, y + 1) + H(x + 1, y + 1)
        - H(x - 1, y - 1) - 2 * H(x, y - 1) - H(x + 1, y - 1)) * strength;
      const inv = 1 / Math.sqrt(gx * gx + gy * gy + 1);
      nImg.data[o] = (-gx * inv * 0.5 + 0.5) * 255;
      nImg.data[o + 1] = (-gy * inv * 0.5 + 0.5) * 255;
      nImg.data[o + 2] = (inv * 0.5 + 0.5) * 255;
      nImg.data[o + 3] = 255;
    }
  }
  nCtx.putImageData(nImg, 0, 0);

  const mkTex = (canvas, srgb) => {
    const t = new THREE.CanvasTexture(canvas);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = 4;
    return t;
  };
  const out = {
    map: mkTex(albedo, true),
    normalMap: mkTex(nrm, false),
    rmMap: mkTex(rm, false), // roughnessMap + metalnessMap (G/B channels)
  };
  cache.set(key, out);
  return out;
}

// Build a MeshStandardMaterial from a skin recipe.
// pick a pack armor material for a skin recipe (texture-pack mode)
function armorTexName(recipe) {
  if ((recipe.metalPaint ?? 0) >= 0.6) return 'mech_steel_bare';
  if ((recipe.wear ?? 0) >= 0.62) return 'mech_armor_worn';
  if ((recipe.panelDepth ?? 0) >= 4) return 'mech_armor_heavy';
  return 'mech_armor_clean';
}

export function skinMaterial(recipe, extra = {}) {
  // texture-pack mode: neutral-gray armor albedos tinted by the mech's
  // palette; anything missing falls back to the procedural synth below
  if (CONFIG.useTextures) {
    const name = recipe.frameBucket ? 'mech_gunmetal_dark' : armorTexName(recipe);
    const mat = pbrMaterial('mech', name, {
      repeat: 0.5, color: recipe.base ?? 0xffffff,
      extra: { envMapIntensity: extra.envMapIntensity ?? 1.0, ...extra },
    });
    if (mat) return mat;
  }
  const tex = mechSkin(recipe);
  return new THREE.MeshStandardMaterial({
    map: tex.map,
    normalMap: tex.normalMap,
    normalScale: new THREE.Vector2(1, 1),
    roughnessMap: tex.rmMap,
    metalnessMap: tex.rmMap,
    roughness: 1,   // maps carry the values
    metalness: 1,
    envMapIntensity: extra.envMapIntensity ?? 1.0,
    ...extra,
  });
}

// Decal plate texture: renders unit text / emblem / stripes over a skin.
// Used for dedicated chest/leg plates that carry markings.
export function decalTexture(recipe, decal) {
  const key = 'decal_' + JSON.stringify(recipe) + JSON.stringify(decal);
  if (cache.has(key)) return cache.get(key);
  const base = mechSkin(recipe);
  const S = base.map.image.width;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = S;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(base.map.image, 0, 0);

  ctx.save();
  ctx.globalAlpha = decal.alpha ?? 0.92;
  if (decal.emblem) {
    // simple aggressive chevron/fang emblem
    const cx = S * (decal.emblemX ?? 0.5), cy = S * (decal.emblemY ?? 0.34);
    const s = S * (decal.emblemScale ?? 0.13);
    ctx.fillStyle = decal.color || '#e8e4da';
    ctx.beginPath();
    ctx.moveTo(cx - s, cy - s * 0.6);
    ctx.lineTo(cx, cy + s);
    ctx.lineTo(cx + s, cy - s * 0.6);
    ctx.lineTo(cx + s * 0.55, cy - s * 0.6);
    ctx.lineTo(cx, cy + s * 0.35);
    ctx.lineTo(cx - s * 0.55, cy - s * 0.6);
    ctx.closePath();
    ctx.fill();
  }
  if (decal.text) {
    ctx.fillStyle = decal.color || '#e8e4da';
    ctx.font = `900 ${Math.round(S * (decal.textScale ?? 0.13))}px Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(decal.text, S * (decal.textX ?? 0.5), S * (decal.textY ?? 0.6));
  }
  if (decal.stripes) {
    ctx.fillStyle = decal.stripeColor || '#1a1a1e';
    for (let x = 0; x < S; x += 34) ctx.fillRect(x, S * 0.86, 17, S * 0.08);
  }
  // re-weather over the decal so it doesn't look pasted on
  ctx.globalAlpha = 0.5;
  ctx.globalCompositeOperation = 'destination-out';
  const rng = makeRng((recipe.seed || 1) * 31 + 9);
  for (let i = 0; i < 60; i++) {
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(rng() * S, rng() * S, rng() * 3.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  const out = { map: t, normalMap: base.normalMap, rmMap: base.rmMap };
  cache.set(key, out);
  return out;
}
