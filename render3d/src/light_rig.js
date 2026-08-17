// THE LIGHT RIG, as numbers — the one source both consumers build from.
//
// Two scenes light a fighter: the offscreen toon pass (scene.js) and the 2.5D
// camera's own scene (src/camera3d/models.js), which holds real rigs instead
// of textures. They used to hand-duplicate these constants, which is exactly
// how the same fighter ends up lit two different ways depending on a URL
// flag. This module is dependency-free on purpose so either side can import
// it without dragging the other's world in.
//
// BALANCE. The ratio is the whole point of the numbers. Three.js routes a
// HemisphereLight through indirect diffuse — it never touches the toon
// gradient ramp — so every unit of hemisphere is UNBANDED light washing over
// the terminator the ramp exists to draw. The original rig ran hemi 2.2
// against key 1.9: more than half the light on the fighter ignored the ramp,
// which is why the shade band read as a soft gradient rather than a drawn
// edge. The rebalance shifts the same overall exposure toward the banded key
// (hemi 1.0, key 2.6), so the terminator is the key's to draw and the
// hemisphere is fill — ambient bounce, not a second sun.
//
// WHERE THE KEY STANDS. It used to sit at +X, and the offscreen camera sits at
// yaw −78° — mostly −X (scene.js CAMERA_YAW_DEG). So the key lit the flank
// FACING AWAY from the lens: dot(camera-facing normal, key) came out negative,
// every surface the viewer could see fell on the shade side of the ramp, and a
// two-band shader with nothing in the lit band is not a drawn look, it is a
// flat wash of the shade tint. The PBR rig had already been moved for exactly
// this reason (see PBR_LIGHT_RIG below, "a mech in its own shadow"); the toon
// rig kept the old position because the JJK roster's painted textures carried
// enough of their own shading to survive it. The mechs' do not.
//
// So the key comes over the camera's shoulder here too — the same side as the
// PBR key, a touch further round so the terminator crosses the body rather
// than hugging the silhouette, and high enough that the shade band lands under
// the overhangs where a painter would put it.
export const LIGHT_RIG = {
  hemi: { sky: 0xf4f6ff, ground: 0x3a4152, intensity: 1.0 },
  key: { color: 0xffffff, intensity: 2.6, position: [-2.0, 2.4, 1.6] },
};

// THE PBR RIG (K6) — Mech Mayhem's balance, read straight off robotworld
// src/core/engine.js: warm sun 2.4, cool-sky hemi 0.7, and a REAL rim light
// (a directional from behind-left) rather than the toon shader's fresnel
// term, because a MeshStandardMaterial has no rim uniform to push. The rim's
// neutral colour/intensity here is MM's default; on a tinted stage scene.js
// re-colours it from the stage tint and runs it HOT (MM's neon arenas run
// their rims 1.25–1.4) — that is the per-arena seam stageLightTint feeds.
// The banding argument above does not apply: PBR wants the hemisphere's
// unbanded fill, that is what makes it read as ambient bounce.
// POSITIONS ARE CAMERA-AWARE, unlike the toon rig's. The offscreen camera
// sits at yaw −78° — mostly −X, barely +Z (scene.js CAMERA_YAW_DEG) — and the
// toon key at +X lights the FAR flank, which the ramp+rim shrugged off but
// PBR shows as a mech in its own shadow. The PBR key comes over the camera's
// shoulder, the rim from behind the far shoulder where a back light belongs.
export const PBR_LIGHT_RIG = {
  hemi: { sky: 0x8fb4d8, ground: 0x2a2620, intensity: 0.8 },
  key: { color: 0xfff2dd, intensity: 2.4, position: [-2.2, 2.6, 1.4] },
  rim: { color: 0x5f8fff, intensity: 0.85, position: [2.2, 2.2, -2.2],
         tintedIntensity: 1.3 },
  // Environment reflections for the metals (scene.js builds the PMREM from a
  // synthetic room; MM runs RoomEnvironment at 0.55 — a touch more here, the
  // roster's dark paint jobs need the fill and there is no bloom pass).
  envIntensity: 0.85,
  exposure: 1.05,
};
