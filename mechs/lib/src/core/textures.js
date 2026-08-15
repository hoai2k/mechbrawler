// Procedural canvas textures: armor plating, building facades, roads, FX sprites.
import * as THREE from 'three';
import { makeRng } from './utils.js';

const cache = new Map();

export function makeCanvasTexture(key, w, h, draw, opts = {}) {
  if (key && cache.has(key)) return cache.get(key);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  draw(ctx, w, h);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = opts.wrap === false ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  tex.colorSpace = opts.data ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  if (key) cache.set(key, tex);
  return tex;
}

function hexToRgb(hex) {
  return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
}
function shade(hex, f) {
  const [r, g, b] = hexToRgb(hex);
  const m = (v) => Math.round(Math.min(255, Math.max(0, v * f)));
  return `rgb(${m(r)},${m(g)},${m(b)})`;
}

// ============ ARMOR PLATING ============
// Panel lines, rivets, scratches, grime — tinted by base color.
export function platingTextures(baseHex, seed = 1, opts = {}) {
  const key = `plate_${baseHex}_${seed}_${opts.stripes ? 1 : 0}`;
  if (cache.has(key)) return cache.get(key);
  const rng = makeRng(seed * 7919 + 13);
  const S = 256;

  // Subtle by design: parts are small and UVs stretch 0-1 per face, so any
  // busy detail reads as noisy tiling. Keep it clean; geometry carries detail.
  const drawBase = (ctx, forBump) => {
    if (forBump) {
      ctx.fillStyle = '#808080';
      ctx.fillRect(0, 0, S, S);
    } else {
      const g = ctx.createLinearGradient(0, 0, 0, S);
      g.addColorStop(0, shade(baseHex, 1.07));
      g.addColorStop(0.5, shade(baseHex, 1.0));
      g.addColorStop(1, shade(baseHex, 0.9));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, S, S);
      // faint worn-metal mottling
      for (let i = 0; i < 90; i++) {
        const x = rng() * S, y = rng() * S, r = rng.range(8, 30);
        ctx.fillStyle = rng.chance(0.5)
          ? `rgba(255,255,255,${rng.range(0.005, 0.018)})`
          : `rgba(0,0,10,${rng.range(0.006, 0.022)})`;
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      }
    }
    // a couple of faint panel seams
    ctx.strokeStyle = forBump ? 'rgba(90,90,90,0.8)' : 'rgba(6,10,16,0.22)';
    ctx.lineWidth = 1.5;
    const rng2 = makeRng(seed * 131 + 7);
    const px = S * rng2.range(0.3, 0.7), py = S * rng2.range(0.3, 0.7);
    ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, S); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(S, py); ctx.stroke();
    // sparse edge rivets
    for (let i = 0; i < 8; i++) {
      const x = rng2() * S, y = rng2() * S;
      ctx.fillStyle = forBump ? '#b8b8b8' : 'rgba(255,255,255,0.09)';
      ctx.beginPath(); ctx.arc(x, y, 1.8, 0, Math.PI * 2); ctx.fill();
    }
    // faint scratches
    ctx.lineWidth = 1;
    for (let i = 0; i < 9; i++) {
      const x = rng() * S, y = rng() * S, a = rng() * Math.PI * 2, l = rng.range(8, 28);
      ctx.strokeStyle = forBump
        ? 'rgba(160,160,160,0.4)'
        : `rgba(255,255,255,${rng.range(0.02, 0.05)})`;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
      ctx.stroke();
    }
    if (!forBump) {
      // soft grime streaks
      for (let i = 0; i < 6; i++) {
        const x = rng() * S, y = rng() * S, l = rng.range(14, 46);
        const g = ctx.createLinearGradient(x, y, x, y + l);
        g.addColorStop(0, 'rgba(8,10,14,0.1)');
        g.addColorStop(1, 'rgba(8,10,14,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x, y, rng.range(4, 10), l);
      }
      if (opts.stripes) {
        ctx.save();
        ctx.globalAlpha = 0.85;
        ctx.translate(0, S * 0.86);
        for (let x = 0; x < S; x += 26) {
          ctx.fillStyle = '#17171a';
          ctx.fillRect(x, 0, 13, 15);
          ctx.fillStyle = '#d99e0e';
          ctx.fillRect(x + 13, 0, 13, 15);
        }
        ctx.restore();
      }
    }
  };

  const map = makeCanvasTexture(null, S, S, (ctx) => drawBase(ctx, false));
  const bumpMap = makeCanvasTexture(null, S, S, (ctx) => drawBase(ctx, true), { data: true });
  const out = { map, bumpMap };
  cache.set(key, out);
  return out;
}

// ============ BUILDING FACADE ============
// Windows grid; emissive map has lit windows for night arenas.
export function buildingFacade(style = 0, seed = 3) {
  const key = `bldg_${style}_${seed}`;
  if (cache.has(key)) return cache.get(key);
  const rng = makeRng(seed * 883 + style * 97);
  const S = 256;
  const palettes = [
    { wall: '#3d4654', win: '#101820', lit: '#ffd98a' },   // steel office
    { wall: '#5a5148', win: '#141a20', lit: '#ffe9b0' },   // brown brick office
    { wall: '#2c3a48', win: '#0e1620', lit: '#9adfff' },   // glass tower
    { wall: '#4c4c55', win: '#12161c', lit: '#ffc37a' },   // concrete block
  ];
  const p = palettes[style % palettes.length];
  const cols = 6, rows = 8, m = 8;
  const cw = (S - m * 2) / cols, ch = (S - m * 2) / rows;

  const lit = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) lit.push(rng.chance(0.38));

  const map = makeCanvasTexture(null, S, S, (ctx) => {
    ctx.fillStyle = p.wall;
    ctx.fillRect(0, 0, S, S);
    // wall weathering
    for (let i = 0; i < 120; i++) {
      ctx.fillStyle = `rgba(0,0,0,${rng.range(0.02, 0.08)})`;
      ctx.fillRect(rng() * S, rng() * S, rng.range(4, 20), rng.range(4, 20));
    }
    let i = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++, i++) {
        const x = m + c * cw + 3, y = m + r * ch + 3, w = cw - 6, h = ch - 6;
        ctx.fillStyle = lit[i] ? p.lit : p.win;
        ctx.fillRect(x, y, w, h);
        // window frame + reflection slash
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x, y, w, h);
        ctx.fillStyle = 'rgba(255,255,255,0.10)';
        ctx.beginPath();
        ctx.moveTo(x, y + h);
        ctx.lineTo(x + w * 0.45, y);
        ctx.lineTo(x + w * 0.7, y);
        ctx.lineTo(x + w * 0.25, y + h);
        ctx.fill();
      }
    }
  });

  const emissiveMap = makeCanvasTexture(null, S, S, (ctx) => {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, S, S);
    let i = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++, i++) {
        if (!lit[i]) continue;
        const x = m + c * cw + 3, y = m + r * ch + 3, w = cw - 6, h = ch - 6;
        ctx.fillStyle = p.lit;
        ctx.fillRect(x, y, w, h);
      }
    }
  });

  const out = { map, emissiveMap };
  cache.set(key, out);
  return out;
}

// Chunk-scale facade: a couple of windows per destructible chunk face.
export function chunkFacade(style = 0, seed = 3) {
  const key = `chunkf_${style}_${seed}`;
  if (cache.has(key)) return cache.get(key);
  const rng = makeRng(seed * 449 + style * 31);
  const S = 128;
  const palettes = [
    { wall: '#4a5260', win: '#101820', lit: '#ffd98a' },
    { wall: '#5a5148', win: '#141a20', lit: '#ffe9b0' },
    { wall: '#37475a', win: '#0e1620', lit: '#9adfff' },
    { wall: '#4c4c55', win: '#12161c', lit: '#ffc37a' },
  ];
  const p = palettes[style % palettes.length];
  const cols = 2, rows = 2, m = 14;
  const cw = (S - m * 2) / cols, chh = (S - m * 2) / rows;
  const lit = [];
  for (let i = 0; i < cols * rows; i++) lit.push(rng.chance(0.3));

  const map = makeCanvasTexture(null, S, S, (ctx) => {
    ctx.fillStyle = p.wall;
    ctx.fillRect(0, 0, S, S);
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = `rgba(0,0,0,${rng.range(0.02, 0.06)})`;
      ctx.fillRect(rng() * S, rng() * S, rng.range(3, 12), rng.range(3, 12));
    }
    let i = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++, i++) {
        const x = m + c * cw + 5, y = m + r * chh + 5, w = cw - 10, h = chh - 10;
        ctx.fillStyle = lit[i] ? p.lit : p.win;
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = 'rgba(0,0,0,0.55)';
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, w, h);
        ctx.fillStyle = 'rgba(255,255,255,0.09)';
        ctx.beginPath();
        ctx.moveTo(x, y + h);
        ctx.lineTo(x + w * 0.5, y);
        ctx.lineTo(x + w * 0.75, y);
        ctx.lineTo(x + w * 0.3, y + h);
        ctx.fill();
      }
    }
  });
  const emissiveMap = makeCanvasTexture(null, S, S, (ctx) => {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, S, S);
    let i = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++, i++) {
        if (!lit[i]) continue;
        const x = m + c * cw + 5, y = m + r * chh + 5, w = cw - 10, h = chh - 10;
        ctx.fillStyle = p.lit;
        ctx.fillRect(x, y, w, h);
      }
    }
  });
  const out = { map, emissiveMap };
  cache.set(key, out);
  return out;
}

// ============ GROUND ============
export function roadTexture() {
  return makeCanvasTexture('road', 512, 512, (ctx, S) => {
    const rng = makeRng(42);
    ctx.fillStyle = '#23262b';
    ctx.fillRect(0, 0, S, S);
    for (let i = 0; i < 2600; i++) {
      ctx.fillStyle = `rgba(${rng.int(28, 78)},${rng.int(30, 78)},${rng.int(34, 84)},0.5)`;
      ctx.fillRect(rng() * S, rng() * S, rng.range(1, 3.4), rng.range(1, 3.4));
    }
    // cracks
    ctx.strokeStyle = 'rgba(10,10,12,0.55)';
    for (let i = 0; i < 10; i++) {
      ctx.lineWidth = rng.range(0.8, 2);
      let x = rng() * S, y = rng() * S;
      ctx.beginPath(); ctx.moveTo(x, y);
      for (let j = 0; j < 7; j++) {
        x += rng.range(-38, 38); y += rng.range(-38, 38);
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    // lane paint (worn)
    ctx.fillStyle = 'rgba(210,190,90,0.5)';
    for (let y = 20; y < S; y += 128) {
      for (let x = 0; x < S; x += 64) ctx.fillRect(x, y, 34, 7);
    }
  });
}

export function sidewalkTexture() {
  return makeCanvasTexture('sidewalk', 256, 256, (ctx, S) => {
    const rng = makeRng(77);
    ctx.fillStyle = '#63666c';
    ctx.fillRect(0, 0, S, S);
    for (let i = 0; i < 900; i++) {
      ctx.fillStyle = `rgba(${rng.int(70, 130)},${rng.int(70, 130)},${rng.int(75, 135)},0.4)`;
      ctx.fillRect(rng() * S, rng() * S, 2, 2);
    }
    ctx.strokeStyle = 'rgba(20,22,26,0.7)';
    ctx.lineWidth = 3;
    for (let i = 0; i <= 2; i++) {
      const p = (i / 2) * S;
      ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, S); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(S, p); ctx.stroke();
    }
  });
}

// ============ FX SPRITES ============
export function softCircleTexture() {
  return makeCanvasTexture('softcircle', 128, 128, (ctx, S) => {
    const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.7)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
  });
}

export function sparkTexture() {
  return makeCanvasTexture('spark', 64, 64, (ctx, S) => {
    const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.2, 'rgba(255,240,200,0.95)');
    g.addColorStop(0.55, 'rgba(255,160,60,0.5)');
    g.addColorStop(1, 'rgba(255,120,20,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
  });
}

export function smokeTexture() {
  return makeCanvasTexture('smoke', 128, 128, (ctx, S) => {
    const rng = makeRng(1234);
    for (let i = 0; i < 26; i++) {
      const x = S / 2 + rng.range(-26, 26), y = S / 2 + rng.range(-26, 26);
      const r = rng.range(14, 34);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(255,255,255,0.10)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
  });
}

export function ringTexture() {
  return makeCanvasTexture('ring', 128, 128, (ctx, S) => {
    ctx.strokeStyle = 'rgba(255,255,255,1)';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.arc(S / 2, S / 2, S / 2 - 8, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.arc(S / 2, S / 2, S / 2 - 11, 0, Math.PI * 2);
    ctx.stroke();
  });
}

// ---------- fractal value noise (for luscious FX sprites) ----------
function makeNoise(rng, size, oct = 4) {
  const out = new Float32Array(size * size);
  let amp = 1, sum = 0;
  for (let o = 0; o < oct; o++) {
    const n = 4 << o;
    const grid = new Float32Array((n + 1) * (n + 1));
    for (let i = 0; i < grid.length; i++) grid[i] = rng();
    const sc = n / size;
    for (let y = 0; y < size; y++) {
      const gy = y * sc, y0 = gy | 0, fy = gy - y0;
      const sy = fy * fy * (3 - 2 * fy);
      for (let x = 0; x < size; x++) {
        const gx = x * sc, x0 = gx | 0, fx = gx - x0;
        const sx = fx * fx * (3 - 2 * fx);
        const i00 = grid[y0 * (n + 1) + x0], i10 = grid[y0 * (n + 1) + x0 + 1];
        const i01 = grid[(y0 + 1) * (n + 1) + x0], i11 = grid[(y0 + 1) * (n + 1) + x0 + 1];
        const v = (i00 + (i10 - i00) * sx) * (1 - sy) + (i01 + (i11 - i01) * sx) * sy;
        out[y * size + x] += v * amp;
      }
    }
    sum += amp;
    amp *= 0.55;
  }
  for (let i = 0; i < out.length; i++) out[i] /= sum;
  return out;
}

function fxTexture(key, w, h, draw) {
  const tex = makeCanvasTexture(key, w, h, draw, { wrap: false });
  tex.flipY = false; // atlas cell math indexes rows from the top
  tex.needsUpdate = true;
  return tex;
}

// 4x4 flipbook of a LOOPING turbulent flame puff — the classic technique
// for fire that reads as fire. Loop comes from circling the sample window
// through a fixed noise field. White-hot heart and orange skirts are baked
// in; the per-particle color ramp handles yellow->deep-red cooling.
export function flameAtlasTexture() {
  return fxTexture('flameAtlas', 512, 512, (ctx) => {
    const CELL = 128, COLS = 4, FRAMES = 16, S = 512;
    const rng = makeRng(4242);
    const noiseA = makeNoise(rng, 256, 4);
    const noiseB = makeNoise(rng, 256, 4);
    const img = ctx.createImageData(S, S);
    for (let fr = 0; fr < FRAMES; fr++) {
      const cx0 = (fr % COLS) * CELL, cy0 = ((fr / COLS) | 0) * CELL;
      const th = (fr / FRAMES) * Math.PI * 2;
      const oxA = 90 + 42 * Math.cos(th), oyA = 90 + 42 * Math.sin(th);
      const oxB = 90 + 42 * Math.cos(th + 2.1), oyB = 90 + 42 * Math.sin(th + 2.1);
      for (let y = 0; y < CELL; y++) {
        for (let x = 0; x < CELL; x++) {
          const dx = (x - 64) / 64, dy = (y - 64) / 64;
          const r = Math.sqrt(dx * dx + dy * dy);
          const nA = noiseA[(((y * 0.55 + oyA) | 0) * 256 + ((x * 0.55 + oxA) | 0))];
          const nB = noiseB[(((y * 0.85 + oyB) | 0) * 256 + ((x * 0.85 + oxB) | 0))];
          let v = (0.62 * nA + 0.38 * nB) * 1.8 - r * 1.5 + 0.12;
          v = Math.max(0, Math.min(1, v));
          v *= Math.max(0, Math.min(1, 1 - (r - 0.78) / 0.2)); // hard edge kill
          const px = ((cy0 + y) * S + (cx0 + x)) * 4;
          img.data[px] = 255;
          img.data[px + 1] = Math.round(140 + 115 * Math.min(1, v * 1.6));
          img.data[px + 2] = Math.round(36 + 219 * Math.max(0, v * 1.8 - 0.62));
          img.data[px + 3] = Math.round(Math.pow(v, 1.3) * 255);
        }
      }
    }
    ctx.putImageData(img, 0, 0);
  });
}

// 2x2 atlas of DISTINCT billowy smoke puffs: fractal density, ragged edges.
// Baked white; particle color tints (soot, dust, mist, steam).
export function smokeCellsTexture() {
  return fxTexture('smokeCells', 256, 256, (ctx) => {
    const CELL = 128, S = 256;
    const rng = makeRng(9137);
    const img = ctx.createImageData(S, S);
    for (let c = 0; c < 4; c++) {
      const cx0 = (c % 2) * CELL, cy0 = ((c / 2) | 0) * CELL;
      const noise = makeNoise(rng, 128, 4);
      for (let y = 0; y < CELL; y++) {
        for (let x = 0; x < CELL; x++) {
          const dx = (x - 64) / 64, dy = (y - 64) / 64;
          const r = Math.sqrt(dx * dx + dy * dy);
          const n = noise[y * 128 + x];
          let a = n * 1.7 - r * 1.55 + 0.34;
          a = Math.max(0, Math.min(1, a));
          a *= Math.max(0, Math.min(1, 1 - (r - 0.76) / 0.22));
          const px = ((cy0 + y) * S + (cx0 + x)) * 4;
          // slight internal shading so puffs read as volumes, not discs
          const shade = 205 + Math.round(50 * Math.min(1, n * 1.4));
          img.data[px] = shade;
          img.data[px + 1] = shade;
          img.data[px + 2] = shade;
          img.data[px + 3] = Math.round(Math.pow(a, 1.15) * 232);
        }
      }
    }
    ctx.putImageData(img, 0, 0);
  });
}

// a single glossy water bead: cool body, off-center specular glint, darker
// belly — normally-blended so it reads as matter with a wet shine
export function dropletTexture() {
  return fxTexture('droplet', 64, 64, (ctx, S) => {
    const c = S / 2;
    const body = ctx.createRadialGradient(c - 6, c - 8, 2, c, c, c * 0.92);
    body.addColorStop(0, 'rgba(255,255,255,0.98)');
    body.addColorStop(0.3, 'rgba(214,236,250,0.95)');
    body.addColorStop(0.7, 'rgba(150,193,232,0.9)');
    body.addColorStop(0.92, 'rgba(108,152,204,0.45)');
    body.addColorStop(1, 'rgba(96,140,196,0)');
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.arc(c, c, c * 0.92, 0, Math.PI * 2); ctx.fill();
    // specular glint + a faint low rim-light: the "wet" signature
    const hi = ctx.createRadialGradient(c - 9, c - 10, 0, c - 9, c - 10, 8);
    hi.addColorStop(0, 'rgba(255,255,255,1)');
    hi.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = hi;
    ctx.beginPath(); ctx.arc(c - 9, c - 10, 8, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(c, c, c * 0.7, Math.PI * 0.2, Math.PI * 0.8); ctx.stroke();
  });
}

// 2x2 atlas of gooey irregular blobs — lumpy noise-warped outlines with a
// glossy highlight and satellite droplets. Baked white; color makes slime.
export function goopCellsTexture() {
  return fxTexture('goopCells', 256, 256, (ctx) => {
    const CELL = 128;
    const rng = makeRng(5150);
    for (let c = 0; c < 4; c++) {
      const cx = (c % 2) * CELL + 64, cy = ((c / 2) | 0) * CELL + 64;
      const p1 = rng() * Math.PI * 2, p2 = rng() * Math.PI * 2, p3 = rng() * Math.PI * 2;
      ctx.save();
      ctx.beginPath();
      for (let i = 0; i <= 30; i++) {
        const th = (i / 30) * Math.PI * 2;
        const rad = 40 * (0.72 + 0.17 * Math.sin(3 * th + p1) + 0.09 * Math.sin(7 * th + p2) + 0.06 * Math.sin(11 * th + p3));
        const x = cx + Math.cos(th) * rad, y = cy + Math.sin(th) * rad * 1.06;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.closePath();
      const body = ctx.createRadialGradient(cx - 8, cy - 10, 4, cx, cy, 46);
      body.addColorStop(0, 'rgba(255,255,255,0.98)');
      body.addColorStop(0.45, 'rgba(228,238,215,0.96)');
      body.addColorStop(0.85, 'rgba(178,198,150,0.92)');
      body.addColorStop(1, 'rgba(150,172,120,0.55)');
      ctx.fillStyle = body;
      ctx.fill();
      // glossy wet highlight
      const hi = ctx.createRadialGradient(cx - 12, cy - 14, 0, cx - 12, cy - 14, 12);
      hi.addColorStop(0, 'rgba(255,255,255,0.95)');
      hi.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = hi;
      ctx.beginPath(); ctx.arc(cx - 12, cy - 14, 12, 0, Math.PI * 2); ctx.fill();
      // satellite droplets hanging off the mass
      for (let s = 0; s < 3; s++) {
        const a = rng() * Math.PI * 2, d = 44 + rng() * 9;
        ctx.fillStyle = 'rgba(214,228,196,0.9)';
        ctx.beginPath();
        ctx.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 2.5 + rng() * 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  });
}

// tiling fractal noise for stream shaders (water jets, flame throwers)
export function streamNoiseTexture() {
  const key = 'streamNoise';
  if (cache.has(key)) return cache.get(key);
  const S = 128;
  const canvas = document.createElement('canvas');
  canvas.width = S; canvas.height = S;
  const ctx = canvas.getContext('2d');
  const rng = makeRng(7331);
  const n = makeNoise(rng, S, 4);
  const img = ctx.createImageData(S, S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      // fold the field over both axes so REPEAT wrapping shows no seam
      const xm = Math.min(x, S - 1 - x) * 2, ym = Math.min(y, S - 1 - y) * 2;
      const v = Math.round(n[Math.min(S - 1, ym) * S + Math.min(S - 1, xm)] * 255);
      const px = (y * S + x) * 4;
      img.data[px] = img.data[px + 1] = img.data[px + 2] = v;
      img.data[px + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.NoColorSpace;
  cache.set(key, tex);
  return tex;
}

// 2x2 atlas of DIGITAL CORRUPTION fragments: clusters of hard square
// pixels, torn scanline bars and dead-channel blocks — no soft edges
// anywhere, so the particles read as broken DATA, not light or smoke.
// Baked white; the per-particle color tint cycles the glitch palette.
export function glitchCellsTexture() {
  return fxTexture('glitchCells', 256, 256, (ctx) => {
    const CELL = 128, S = 256;
    const rng = makeRng(0x0bad);
    for (let c = 0; c < 4; c++) {
      const cx0 = (c % 2) * CELL, cy0 = ((c / 2) | 0) * CELL;
      ctx.save();
      ctx.beginPath();
      ctx.rect(cx0, cy0, CELL, CELL);
      ctx.clip();
      // pixel clusters: random square chunks clumped near the cell center
      const blocks = 14 + ((rng() * 8) | 0);
      for (let i = 0; i < blocks; i++) {
        const bw = 6 + rng() * 26, bh = 4 + rng() * 18;
        const x = cx0 + 20 + rng() * (CELL - 40 - bw) + (rng() - 0.5) * 14;
        const y = cy0 + 20 + rng() * (CELL - 40 - bh) + (rng() - 0.5) * 14;
        ctx.fillStyle = `rgba(255,255,255,${(0.45 + rng() * 0.55).toFixed(2)})`;
        ctx.fillRect(Math.round(x), Math.round(y), Math.round(bw), Math.round(bh));
      }
      // torn horizontal scanline bars sliding off the clusters
      for (let i = 0; i < 5; i++) {
        const y = cy0 + 16 + rng() * (CELL - 32);
        const x = cx0 + 8 + rng() * 50;
        ctx.fillStyle = `rgba(255,255,255,${(0.3 + rng() * 0.5).toFixed(2)})`;
        ctx.fillRect(Math.round(x), Math.round(y), Math.round(30 + rng() * (CELL - 70)), 2 + ((rng() * 4) | 0));
      }
      // a few isolated dead pixels around the mass
      for (let i = 0; i < 16; i++) {
        ctx.fillStyle = `rgba(255,255,255,${(0.3 + rng() * 0.6).toFixed(2)})`;
        ctx.fillRect(cx0 + (rng() * (CELL - 4)) | 0, cy0 + (rng() * (CELL - 4)) | 0,
          2 + ((rng() * 3) | 0), 2 + ((rng() * 3) | 0));
      }
      ctx.restore();
    }
  });
}

// A sheet of 2D RENDERING FAILURE, transparent background: JPEG-style
// macroblock noise, RGB channel-split scan bars, and fine TV static.
// Sampled through random repeat/offset sub-windows by the glitch patches
// pinned to corrupted body parts, so every flicker shows a fresh tear.
// v picks one of a few baked layouts.
export function glitchNoiseTexture(v = 0) {
  return fxTexture('glitchNoise' + v, 128, 128, (ctx) => {
    const rng = makeRng(0x51a71c + v * 977);
    const PAL = ['#ff2038', '#27f6ff', '#ff2df2', '#3cff6e', '#3350ff', '#ffe23c', '#ffffff', '#0a0a10'];
    // JPEG macroblocks: hard 8px squares, most of the sheet left transparent
    for (let by = 0; by < 16; by++) {
      for (let bx = 0; bx < 16; bx++) {
        const r = rng();
        if (r < 0.58) continue;
        ctx.globalAlpha = 0.4 + rng() * 0.6;
        if (r < 0.82) { // desaturated broken-decode gray
          const g = (30 + rng() * 200) | 0;
          ctx.fillStyle = `rgb(${g},${g},${g})`;
        } else {
          ctx.fillStyle = PAL[(rng() * PAL.length) | 0];
        }
        ctx.fillRect(bx * 8, by * 8, 8, 8);
      }
    }
    // RGB channel-split scan bars (the classic torn-frame smear)
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 6; i++) {
      const y = (rng() * 120) | 0, h = 2 + ((rng() * 4) | 0);
      const x = (rng() * 50) | 0, w = 40 + rng() * 80;
      ctx.globalAlpha = 0.75;
      ctx.fillStyle = '#ff0026'; ctx.fillRect(x, y, w, h);
      ctx.fillStyle = '#00ffe6'; ctx.fillRect(x + 3, y + 1, w, h);
      ctx.fillStyle = '#2236ff'; ctx.fillRect(x - 3, y - 1, w, h);
    }
    // fine RGB static sprinkled over everything
    ctx.globalCompositeOperation = 'source-over';
    for (let i = 0; i < 240; i++) {
      ctx.globalAlpha = 0.35 + rng() * 0.65;
      ctx.fillStyle = ['#ff2038', '#3cff6e', '#3350ff', '#ffffff', '#27f6ff'][(rng() * 5) | 0];
      ctx.fillRect((rng() * 126) | 0, (rng() * 126) | 0, rng() < 0.3 ? 2 : 1, 1);
    }
  });
}

// crystalline six-armed ice sparkle (additive)
export function iceTexture() {
  return fxTexture('iceSparkle', 64, 64, (ctx, S) => {
    const c = S / 2;
    ctx.translate(c, c);
    for (let arm = 0; arm < 6; arm++) {
      ctx.rotate(Math.PI / 3);
      const g = ctx.createLinearGradient(0, 0, 0, -c * 0.9);
      g.addColorStop(0, 'rgba(255,255,255,0.95)');
      g.addColorStop(0.6, 'rgba(190,230,255,0.55)');
      g.addColorStop(1, 'rgba(160,215,255,0)');
      ctx.strokeStyle = g;
      ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -c * 0.9); ctx.stroke();
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(0, -c * 0.4); ctx.lineTo(c * 0.16, -c * 0.55); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -c * 0.4); ctx.lineTo(-c * 0.16, -c * 0.55); ctx.stroke();
    }
    const heart = ctx.createRadialGradient(0, 0, 0, 0, 0, 10);
    heart.addColorStop(0, 'rgba(255,255,255,1)');
    heart.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = heart;
    ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2); ctx.fill();
  });
}

// star-field / night sky dome texture
export function skyStarsTexture() {
  return makeCanvasTexture('stars', 1024, 512, (ctx, W, H) => {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    const rng = makeRng(999);
    for (let i = 0; i < 700; i++) {
      const x = rng() * W, y = rng() * H * 0.7;
      const b = rng.range(0.3, 1);
      ctx.fillStyle = `rgba(255,255,255,${b})`;
      const s = rng.chance(0.06) ? 2 : 1;
      ctx.fillRect(x, y, s, s);
    }
  });
}

// 2x2 flipbook of a BAT in silhouette, one cell per wing position: down,
// mid-up, up, mid-down — so a particle looping the four cells flaps.
//
// Baked WHITE, like every other atlas here, because the fragment shader
// multiplies the sampled texel by the particle's own colour: a sprite baked
// black would be black whatever it was asked for, and these are asked for at
// near-black on a NORMAL-blended pool (an additive black bat is invisible,
// which is the trap this shape exists to avoid).
//
// The silhouette is what carries it at particle size — a body, two ears, and
// a wing whose trailing edge is SCALLOPED into three fingers. Round the
// scallops off and it reads as a bird.
export function batTexture() {
  return fxTexture('bat', 256, 256, (ctx) => {
    const CELL = 128;
    // how far each cell's wing tip sits above the shoulder, as a fraction of
    // the half-cell — the flap
    const LIFT = [-0.34, 0.16, 0.5, 0.16];
    for (let c = 0; c < 4; c++) {
      const cx = (c % 2) * CELL + CELL / 2, cy = ((c / 2) | 0) * CELL + CELL / 2;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.fillStyle = '#fff';
      const lift = LIFT[c] * (CELL * 0.5);
      // body: a small tapered lozenge, plus ears
      ctx.beginPath();
      ctx.ellipse(0, 2, CELL * 0.075, CELL * 0.135, 0, 0, Math.PI * 2);
      ctx.fill();
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(s * CELL * 0.055, -CELL * 0.1);
        ctx.lineTo(s * CELL * 0.085, -CELL * 0.215);
        ctx.lineTo(s * CELL * 0.012, -CELL * 0.135);
        ctx.closePath(); ctx.fill();
      }
      // wings: leading edge sweeps out to the tip, trailing edge comes back in
      // three scallops through the elbow to the body
      for (const s of [-1, 1]) {
        const tipX = s * CELL * 0.46, tipY = -CELL * 0.02 - lift;
        const elbX = s * CELL * 0.24, elbY = -CELL * 0.07 - lift * 0.62;
        ctx.beginPath();
        ctx.moveTo(s * CELL * 0.05, -CELL * 0.06);
        ctx.quadraticCurveTo(elbX, elbY - CELL * 0.06, tipX, tipY);
        ctx.quadraticCurveTo((tipX + elbX) * 0.5, tipY + CELL * 0.13, elbX, elbY + CELL * 0.045);
        ctx.quadraticCurveTo((elbX + s * CELL * 0.12) * 0.5, elbY + CELL * 0.14,
          s * CELL * 0.11, -CELL * 0.005 + lift * 0.1);
        ctx.quadraticCurveTo(s * CELL * 0.09, CELL * 0.07, s * CELL * 0.045, CELL * 0.055);
        ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    }
  });
}
