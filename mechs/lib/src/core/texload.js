// Loader for the generated PBR texture pack in src/textures/.
// Layout: <set>/<name>/<name>_<map>.png with maps albedo/normal/rough and
// optional metal/emissive. Everything is optional — callers fall back to
// procedural materials when a file is missing.
import * as THREE from 'three';

const FILES = import.meta.glob('../textures/**/*.png', {
  eager: true, query: '?url', import: 'default',
});

const loader = new THREE.TextureLoader();
const texCache = new Map();

function fileUrl(set, name, map) {
  return FILES[`../textures/${set}/${name}/${name}_${map}.png`] || null;
}

export function hasTex(set, name) {
  return !!fileUrl(set, name, 'albedo');
}

const MAPS = ['albedo', 'normal', 'rough', 'metal', 'emissive'];

/**
 * Warm the browser cache for one pack entry, without building a texture.
 * The idle prefetcher (game/predict.js) calls this for the arena it expects
 * to be picked, so the real `loadMap` later reads from cache. Deliberately
 * NOT `loadMap`: the material's repeat/tint (and so the texture cache key)
 * depend on arena size, which isn't known yet — the HTTP cache doesn't care.
 * Resolves when every map of the entry has landed (or failed).
 */
export function prefetchTex(set, name) {
  const urls = MAPS.map((m) => fileUrl(set, name, m)).filter(Boolean);
  return Promise.all(urls.map((u) => fetch(u, { priority: 'low' }).catch(() => null)));
}

export function loadMap(set, name, map, { srgb = false, repeat = 1 } = {}) {
  const u = fileUrl(set, name, map);
  if (!u) return null;
  const key = `${u}|${srgb}|${repeat}`;
  let t = texCache.get(key);
  if (!t) {
    t = loader.load(u);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat, repeat);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    texCache.set(key, t);
  }
  return t;
}

// Standard PBR material from a pack entry; null if the entry is absent.
// `color` tints the albedo (the mech armor albedos are neutral gray on
// purpose so per-mech palettes tint them).
export function pbrMaterial(set, name, {
  repeat = 1, color = 0xffffff, emissiveIntensity = 0.6, metalness = 0.15, extra = {},
} = {}) {
  if (!hasTex(set, name)) return null;
  const metalMap = loadMap(set, name, 'metal', { repeat });
  const emissiveMap = loadMap(set, name, 'emissive', { repeat, srgb: true });
  const mat = new THREE.MeshStandardMaterial({
    map: loadMap(set, name, 'albedo', { srgb: true, repeat }),
    normalMap: loadMap(set, name, 'normal', { repeat }),
    roughnessMap: loadMap(set, name, 'rough', { repeat }),
    metalnessMap: metalMap || undefined,
    roughness: 1,
    metalness: metalMap ? 1 : metalness,
    color,
    ...extra,
  });
  if (emissiveMap) {
    mat.emissiveMap = emissiveMap;
    mat.emissive = new THREE.Color(0xffffff);
    mat.emissiveIntensity = emissiveIntensity;
  }
  return mat;
}
