// Ink outlines — the inverted-hull pass that draws the line around a fighter.
//
// For every mesh in a rig, a back-face shell is added as a sibling: the same
// geometry (and, for skinned meshes, the same skeleton — the shell animates
// with the body for free), pushed out along its normals by a width measured
// in SCREEN PIXELS. scene.js converts pixels to world units per render from
// the camera framing, so the line holds its weight whatever size the fighter
// blits at — the "drawn with one pen" rule.
//
// PER-VERTEX WIDTH.  Delivered rigs may paint vertex color channel R
// (0..1, default 0.5): 0.5 is nominal width, 1.0 doubles it (the thick jaw
// and silhouette lines), near 0 tapers to a hairline (interior details).
// Rigs without vertex colors get the uniform width everywhere.
//
// Interior detail lines are NOT generated here — they are painted in the
// baseColor texture by the artist (cheaper, calmer, more "drawn"); this pass
// only owns the silhouette and crease shell.

/** Outline defaults; the workbench edits these live via setOutline. */
export const OUTLINE = {
  px: 1.6,                        // line width in blitted screen pixels
  color: [0.055, 0.05, 0.085],    // near-black, cool — reads as ink, not soot
  opacity: 1.0,
};

const LIVE = new Set();

// THE PUSH HAPPENS IN VIEW SPACE, NOT IN THE MESH'S OWN.
//
// `uWidth` is a distance in WORLD units — scene.js computes it from the camera
// framing, which is the whole "one pen" guarantee. Adding it to `position`
// spends it in the mesh's LOCAL space instead, and the two are only the same
// number when the rig's transform chain has unit scale. The JJK deliveries did;
// THE MECHS DO NOT. Every mech .glb carries its geometry in a unit cube (1.0
// tall) under an Armature node scaled ~7-9x, so a 1.6 px line was inflated by
// that same factor: a ~15 px hull that closed over the whole fighter, and on
// any panel thinner than twice the width the inverted shell turned inside out
// and drew in FRONT of the body. `?render=toon` on a mech was a black blob
// with a few lit chips showing through, which is exactly what it looked like.
//
// So the vertex is skinned and taken to view space FIRST, and the offset is
// applied there along the view-space normal. View space is world-scaled (the
// camera matrix carries no scale of its own), so the pixels a width buys no
// longer depend on how a delivery happens to be scaled internally. Rigs that
// were already unit-scaled render exactly as they did.
const VERT = /* glsl */ `
#include <common>
#include <skinning_pars_vertex>
uniform float uWidth;
void main() {
  #include <skinbase_vertex>
  #include <beginnormal_vertex>
  #include <skinnormal_vertex>
  float w = uWidth;
  #if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )
    // vertex color R tapers the line: 0.5 = nominal, 1.0 = double, 0 = gone
    w *= color.r * 2.0;
  #endif
  #if defined( OUTLINE_CUTOUT )
    vCutoutUv = uv;
  #endif
  vec3 transformed = position;
  #include <skinning_vertex>
  vec4 mvPosition = modelViewMatrix * vec4( transformed, 1.0 );
  // normalMatrix takes the (already skinned) object-space normal to view
  // space; normalizing after it is what makes a non-uniform bone scale a
  // direction error at worst rather than a width error.
  mvPosition.xyz += normalize( normalMatrix * objectNormal ) * w;
  gl_Position = projectionMatrix * mvPosition;
}
`;

const VERT_CUTOUT_PARS = /* glsl */ `
varying vec2 vCutoutUv;
`;

const FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
#if defined( OUTLINE_CUTOUT )
  // The body material cuts holes with alphaTest (hair cards, lash planes); a
  // shell that ignored that drew a solid slab of ink behind every cutout.
  uniform sampler2D uCutoutMap;
  uniform float uCutoutTest;
  varying vec2 vCutoutUv;
#endif
void main() {
  #if defined( OUTLINE_CUTOUT )
    if ( texture2D( uCutoutMap, vCutoutUv ).a < uCutoutTest ) discard;
  #endif
  gl_FragColor = vec4( uColor, uOpacity );
}
`;

/** The outline materials living under each rig root, so setWorldWidth is a
 *  short array walk instead of a full graph traversal per render. A WeakMap
 *  rather than userData: three.js deep-copies userData on clone, and material
 *  references do not survive that. Cloned roots (per-fighter instances) fall
 *  back to a traversal. */
const ROOT_MATS = new WeakMap();

function makeOutlineMaterial(THREE, mesh) {
  const geo = mesh.geometry;
  const hasWidthChannel = !!geo?.attributes?.color;
  // Runs AFTER toon conversion (loader.js order), so the body material's
  // alphaTest/map are whatever survives to the screen.
  const body = mesh.material;
  const cutout = (body?.alphaTest ?? 0) > 0 && !!body?.map && !!geo?.attributes?.uv;
  const uniforms = {
    uWidth: { value: 0.01 }, // world units; scene.js sets the real value per render
    uColor: { value: new THREE.Color(...OUTLINE.color) },
    uOpacity: { value: OUTLINE.opacity },
  };
  if (cutout) {
    uniforms.uCutoutMap = { value: body.map };
    uniforms.uCutoutTest = { value: body.alphaTest };
  }
  const mat = new THREE.ShaderMaterial({
    vertexShader: cutout ? VERT_CUTOUT_PARS + VERT : VERT,
    fragmentShader: FRAG,
    defines: cutout ? { OUTLINE_CUTOUT: "" } : {},
    uniforms,
    side: THREE.BackSide,
    // The opacity dial only blends when the material is transparent; a
    // ShaderMaterial never flips that on by itself. setOutline keeps it live.
    transparent: OUTLINE.opacity < 1,
    // vertexColors makes three declare the `color` attribute (vec3 or vec4)
    // and define USE_COLOR / USE_COLOR_ALPHA to match the geometry.
    vertexColors: hasWidthChannel,
  });
  LIVE.add(mat);
  return mat;
}

/** Add the ink shell to every mesh under `root`. Idempotent: shells are
 *  marked and skipped on a second pass. A mesh (or its whole material) can
 *  opt out via glTF extras `"outline": false` — eye whites and effect cards
 *  usually should. */
export function addOutlines(THREE, root) {
  const meshes = [];
  root.traverse((o) => {
    if (o.isMesh && !o.userData.isOutline && !o.userData.hasOutline) meshes.push(o);
  });
  // One shell material per (body material, width channel, cutout) triple
  // rather than one per mesh: a generated body arrives as hundreds of shells
  // sharing a handful of materials, and giving each its own uniform block
  // multiplied uniform uploads for identical state. The same dedup
  // applyToonMaterials does for the body pass.
  const shared = new Map();
  const mats = ROOT_MATS.get(root) || [];
  for (const mesh of meshes) {
    if (mesh.userData.outline === false || mesh.material?.userData?.outline === false) continue;
    const body = mesh.material;
    const key = `${body?.uuid || "-"}|${!!mesh.geometry?.attributes?.color}|${!!mesh.geometry?.attributes?.uv}`;
    let mat = shared.get(key);
    if (!mat) {
      mat = makeOutlineMaterial(THREE, mesh);
      shared.set(key, mat);
      mats.push(mat);
    }
    const shell = mesh.clone(false);
    shell.material = mat;
    shell.userData = { isOutline: true };
    mesh.userData.hasOutline = true;
    mesh.parent.add(shell);
  }
  ROOT_MATS.set(root, mats);
}

/** Convert the pixel width into world units for this render — scene.js calls
 *  it with (world units per blitted pixel) just before drawing. */
export function setWorldWidth(root, worldPerPx) {
  // A character may carry its own line weight (manifest `toon.outlinePx`,
  // dialled in the workbench): a delivery whose costume is already near-black
  // drowns in the global width, and one with fine detail loses it. Falls back
  // to the global dial, which is still the art direction for the roster.
  const px = root.userData.outlinePx ?? OUTLINE.px;
  const w = px * worldPerPx;
  // The rig this root was outlined as keeps its material list; a cloned
  // instance (2.5D camera) shares the original's materials but is not in the
  // map, so it walks — the uncommon path.
  const mats = ROOT_MATS.get(root);
  if (mats) {
    for (const m of mats) m.uniforms.uWidth.value = w;
    return;
  }
  root.traverse((o) => {
    if (o.userData.isOutline) o.material.uniforms.uWidth.value = w;
  });
}

/** The workbench's per-character line weight. `px` of null clears it. */
export function setOutlineFor(root, px) {
  if (px === null || px === undefined) delete root.userData.outlinePx;
  else root.userData.outlinePx = px;
}

/** Workbench dials: width in px, ink color, opacity. */
export function setOutline(partial) {
  Object.assign(OUTLINE, partial);
  for (const mat of LIVE) {
    if (partial.color) mat.uniforms.uColor.value.setRGB(...partial.color);
    if (partial.opacity !== undefined) {
      mat.uniforms.uOpacity.value = partial.opacity;
      mat.transparent = partial.opacity < 1;
    }
    // px takes effect on the next render via setWorldWidth
  }
}
