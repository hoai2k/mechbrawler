// The anime materials — the render3d backend's answer to "why does a 3D model
// read as a drawn character instead of a figurine".
//
// The recipe (render3d/docs/plan.md §4, the Guilty Gear Xrd approach sized to
// this game):
//
//   * TWO-BAND RAMP.  Lit and shade, one hard terminator, no gradient. The
//     shade band is not "darker" — it is a PAINTED SHADOW COLOR, cool-shifted
//     the way the sprite art's own shading is, delivered per material as a
//     shade tint (glTF extras) with the global cool shift as the fallback.
//   * SHADE-BIAS (ILM) MAP.  A grayscale channel that biases the terminator
//     per texel — the underside of a jaw drops into shade early, the face
//     plane holds the light late. Delivered packed in the baseColor alpha
//     (extras: `"shadeBias": "baseColorAlpha"`); rigs without one get the
//     neutral 0.5 everywhere, i.e. no bias.
//   * RIM LIGHT.  A thin stage-colored rim, driven by the stage the fight is
//     in (scene.js derives it from the stage tint and calls setRimColor).
//     A material term here, never ctx.shadow* at blit time.
//
// HOW IT IS WIRED.  Materials are three.js MeshToonMaterial with the ramp
// replaced: onBeforeCompile swaps the stock `getGradientIrradiance` for the
// two-band function above, so the whole lighting pipeline (skinning, shadows,
// multiple lights) stays stock three.js and only the band math is ours.
//
// EVERY KNOB DEFAULTS FROM `TOON` BELOW and is overridable per material via
// the .glb's extras (`extras.toon = { shadeTint, shadeThreshold, ... }`) or
// per character via the manifest entry's `toon` block — art-directed in the
// workbench, never hard-coded per fighter in engine code. The workbench edits
// these live through setToonDefaults / setRimColor.

/** Per-character shading, and the switch that turns it off.
 *
 *  A DI3 shade sheet says what a fighter's own art shades LIKE — the painted
 *  shadow beside the lit fill, per region — and `tools/derive_toon_from_shade.py`
 *  turns that into the `shadeTint` in their manifest entry. Before those sheets
 *  existed every rig used the roster default below, which is cooler and darker
 *  than most of the roster actually paints.
 *
 *  `?shade=roster` puts every fighter back on that default, which is the
 *  comparison this is worth having: one flag, whole roster, no rebuild. Other
 *  per-character art direction (thresholds, rim, brightness, outline width) is
 *  NOT affected — the switch is specifically about the graded tint, because
 *  that is the part derived from art rather than chosen by eye.
 */
export const PER_CHARACTER_SHADE = (() => {
  const p = new URLSearchParams(typeof location !== "undefined" ? location.search : "");
  const v = (p.get("shade") ?? "").trim().toLowerCase();
  return !["roster", "default", "off", "0", "none"].includes(v);
})();

/** The overrides a character's manifest entry contributes, with the graded
 *  tint dropped when the switch is off. */
export function characterToon(entry) {
  const toon = entry?.toon || {};
  if (PER_CHARACTER_SHADE) return toon;
  const { shadeTint, ...rest } = toon;
  return rest;
}

/** The look, in one place. Colors are [r, g, b] 0..1. */
export const TOON = {
  // ramp coordinate (dotNL * 0.5 + 0.5) below which a texel falls into shade
  shadeThreshold: 0.62,
  // half-width of the terminator; near-zero = the hard drawn line
  shadeSoftness: 0.02,
  // the painted shadow palette: shade texels show baseColor * this. Cool and
  // a touch dark, per the sprite art's own shading.
  shadeTint: [0.52, 0.56, 0.74],
  // how far a shade-bias texel (0..1, 0.5 neutral) can push the terminator
  biasScale: 0.5,
  // rim: stage-colored (scene.js overrides the color per stage), shaded side
  rimColor: [0.72, 0.80, 1.0],
  rimStrength: 0.28,
  rimPower: 3.0,
  // Overall gain on the lit result, before the rim is added. A delivery that
  // arrives dark — baked-in ambient occlusion, a texture graded for a brighter
  // room, a costume that is simply black — cannot be fixed by moving the
  // terminator: the whole figure needs lifting. 1 is as delivered.
  brightness: 1.0,
};

// Uniform sets of every live toon material, so the workbench dials update
// materials that already compiled.
const LIVE = new Set();

const RAMP_CHUNK = /* glsl */ `
uniform vec3 uShadeColor;
uniform float uShadeThreshold;
uniform float uShadeSoftness;
uniform float uBiasScale;
uniform vec3 uRimColor;
uniform float uRimStrength;
uniform float uRimPower;
uniform float uBrightness;
vec3 getGradientIrradiance( vec3 normal, vec3 lightDirection ) {
  float dotNL = dot( normal, lightDirection );
  float coord = dotNL * 0.5 + 0.5;
  float thr = uShadeThreshold;
  #if defined( TOON_ALPHA_BIAS ) && defined( USE_MAP )
    // shade-bias (ILM) map packed as baseColor alpha: 0.5 is neutral, low
    // forces shade early, high holds the lit side late.
    thr += ( 0.5 - texture2D( map, vMapUv ).a ) * uBiasScale;
  #endif
  float lit = smoothstep( thr - uShadeSoftness, thr + uShadeSoftness, coord );
  return mix( uShadeColor, vec3( 1.0 ), lit );
}
`;

// Injected just before the lit color becomes gl_FragColor, so the rim is a
// lighting term (pre-tonemap), not a screen-space glow.
const RIM_CHUNK = /* glsl */ `
{
  // Gain first, rim second: the rim is a stage-coloured line of a chosen
  // strength, and scaling it with the body's exposure would make brightening a
  // fighter quietly re-art-direct the room's light on them too.
  outgoingLight *= uBrightness;
  vec3 rimV = normalize( vViewPosition );
  float rimK = pow( 1.0 - saturate( dot( normalize( normal ), rimV ) ), uRimPower );
  outgoingLight += uRimColor * uRimStrength * rimK;
}
#include <opaque_fragment>`;

/** One toon material from whatever the .glb (or the mannequin) carried.
 *  `overrides` come from the manifest's per-character `toon` block; the
 *  material's own glTF extras win over both. */
export function makeToonMaterial(THREE, src, overrides = {}) {
  const extras = src?.userData?.toon || {};
  const p = { ...TOON, ...overrides, ...extras };
  const mat = new THREE.MeshToonMaterial({
    color: src?.color ? src.color.clone() : new THREE.Color(0xffffff),
    map: src?.map || null,
    transparent: !!src?.transparent,
    opacity: src?.opacity ?? 1,
    side: src?.side ?? THREE.FrontSide,
    // Cutouts survive the conversion: a delivery's hair card or lash plane
    // with alphaTest rendered fully OPAQUE when only the five knobs above
    // were carried. depthWrite rides along for the same reason — a material
    // that turned it off for layered transparency gets its choice kept.
    alphaTest: src?.alphaTest ?? 0,
    alphaMap: src?.alphaMap || null,
    depthWrite: src?.depthWrite ?? true,
  });
  if (src?.name) mat.name = src.name;
  // The camera sits at a 15° lens and the blit downsamples — a touch of
  // anisotropy keeps painted costume detail from mushing at glancing angles.
  if (mat.map) mat.map.anisotropy = Math.max(mat.map.anisotropy || 1, 4);
  const u = {
    uShadeColor: { value: new THREE.Color(
      p.shadeTint[0], p.shadeTint[1], p.shadeTint[2]) },
    uShadeThreshold: { value: p.shadeThreshold },
    uShadeSoftness: { value: p.shadeSoftness },
    uBiasScale: { value: p.biasScale },
    uRimColor: { value: new THREE.Color(p.rimColor[0], p.rimColor[1], p.rimColor[2]) },
    uRimStrength: { value: p.rimStrength },
    uRimPower: { value: p.rimPower },
    uBrightness: { value: p.brightness ?? 1 },
  };
  // baseColor alpha cannot be a shade-bias map AND a cutout/opacity channel
  // at once — the two readings of the same bytes are mutually exclusive. The
  // cutout wins (visible geometry beats a lighting nuance) and the collision
  // is said out loud, because a delivery that does this has a real problem.
  const alphaInUse = !!src?.transparent || (src?.alphaTest ?? 0) > 0;
  let alphaBias = src?.userData?.shadeBias === "baseColorAlpha" && !!src?.map;
  if (alphaBias && alphaInUse) {
    console.warn(`toon: material "${src?.name || "?"}" declares shadeBias=baseColorAlpha but also uses alpha for transparency/cutout — bias disabled.`);
    alphaBias = false;
  }
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    if (alphaBias) shader.defines = { ...shader.defines, TOON_ALPHA_BIAS: "" };
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <gradientmap_pars_fragment>", RAMP_CHUNK)
      .replace("#include <opaque_fragment>", RIM_CHUNK);
  };
  mat.customProgramCacheKey = () => `r3d-toon${alphaBias ? "+bias" : ""}`;
  mat.userData.toonified = true;
  // Remember which knobs this material pinned for itself, so global dial
  // sweeps in the workbench respect per-material art direction.
  mat.userData.pinned = new Set([...Object.keys(overrides), ...Object.keys(extras)]);
  mat.userData.uniforms = u;
  LIVE.add(mat);
  return mat;
}

/** Convert every material under `root` to the toon pass. Idempotent; shared
 *  source materials convert once and stay shared. Outline shells (added by
 *  outline.js, marked isOutline) are left alone. */
export function applyToonMaterials(THREE, root, overrides = {}) {
  const converted = new Map();
  root.traverse((o) => {
    if (!o.isMesh || o.userData.isOutline) return;
    const src = o.material;
    if (!src || src.userData?.toonified) return;
    if (!converted.has(src)) converted.set(src, makeToonMaterial(THREE, src, overrides));
    o.material = converted.get(src);
  });
}

/** Workbench dial: merge new defaults and push them onto every live material
 *  that did not pin the knob for itself. */
export function setToonDefaults(partial) {
  Object.assign(TOON, partial);
  for (const mat of LIVE) {
    const u = mat.userData.uniforms;
    const pinned = mat.userData.pinned;
    if (partial.shadeTint && !pinned.has("shadeTint")) {
      u.uShadeColor.value.setRGB(...partial.shadeTint);
    }
    if (partial.shadeThreshold !== undefined && !pinned.has("shadeThreshold")) u.uShadeThreshold.value = partial.shadeThreshold;
    if (partial.shadeSoftness !== undefined && !pinned.has("shadeSoftness")) u.uShadeSoftness.value = partial.shadeSoftness;
    if (partial.biasScale !== undefined && !pinned.has("biasScale")) u.uBiasScale.value = partial.biasScale;
    if (partial.rimStrength !== undefined && !pinned.has("rimStrength")) u.uRimStrength.value = partial.rimStrength;
    if (partial.rimPower !== undefined && !pinned.has("rimPower")) u.uRimPower.value = partial.rimPower;
    if (partial.rimColor && !pinned.has("rimColor")) u.uRimColor.value.setRGB(...partial.rimColor);
    if (partial.brightness !== undefined && !pinned.has("brightness")) u.uBrightness.value = partial.brightness;
  }
}

// ------------------------------------------------------- per-character look
//
// The dials above are the GLOBAL look, which is a code decision. What a single
// delivery needs is usually not: one fighter arrives dark, another's costume
// eats its own outline, and those are facts about that model rather than about
// the game's art direction. Those live in the manifest entry's `toon` block,
// are applied at load (makeToonMaterial's `overrides`), and are edited live
// here by the workbench — which is what makes them tunable by eye instead of
// by guessing numbers into a JSON file.

/** Which knobs a material carries as uniforms, and how to write each one. */
const WRITERS = {
  shadeThreshold: (u, v) => { u.uShadeThreshold.value = v; },
  shadeSoftness: (u, v) => { u.uShadeSoftness.value = v; },
  biasScale: (u, v) => { u.uBiasScale.value = v; },
  rimStrength: (u, v) => { u.uRimStrength.value = v; },
  rimPower: (u, v) => { u.uRimPower.value = v; },
  brightness: (u, v) => { u.uBrightness.value = v; },
  shadeTint: (u, v) => { u.uShadeColor.value.setRGB(v[0], v[1], v[2]); },
  rimColor: (u, v) => { u.uRimColor.value.setRGB(v[0], v[1], v[2]); },
};

/** Set `partial` on every toon material under `root` only, pinning each knob so
 *  a later global sweep leaves this character's art direction alone. */
export function setToonFor(root, partial) {
  root.traverse((o) => {
    const mat = o.material;
    if (!mat?.userData?.toonified || !mat.userData.uniforms) return;
    for (const [key, value] of Object.entries(partial)) {
      if (value === undefined || !WRITERS[key]) continue;
      WRITERS[key](mat.userData.uniforms, value);
      mat.userData.pinned.add(key);
    }
  });
}

/** Drop this character's override of `keys` and fall back to the global look. */
export function clearToonFor(root, keys) {
  root.traverse((o) => {
    const mat = o.material;
    if (!mat?.userData?.toonified || !mat.userData.uniforms) return;
    for (const key of keys) {
      if (!WRITERS[key]) continue;
      // A knob the MATERIAL pinned for itself (glTF extras) is the delivery's
      // own art direction and is not the manifest's to clear, but the workbench
      // only ever asks about knobs it set, so falling back to TOON is right.
      mat.userData.pinned.delete(key);
      WRITERS[key](mat.userData.uniforms, TOON[key]);
    }
  });
}

/** The stage speaks: scene.js derives a rim color from the stage's tint and
 *  sets it here, on every material at once (per-material pins still win —
 *  a material that art-directed its rim keeps it). */
export function setRimColor(r, g, b) {
  TOON.rimColor = [r, g, b];
  for (const mat of LIVE) {
    if (!mat.userData.pinned.has("rimColor")) mat.userData.uniforms.uRimColor.value.setRGB(r, g, b);
  }
}
