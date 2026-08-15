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
export const LIGHT_RIG = {
  hemi: { sky: 0xf4f6ff, ground: 0x3a4152, intensity: 1.0 },
  key: { color: 0xffffff, intensity: 2.6, position: [1.5, 2.5, 2.0] },
};
