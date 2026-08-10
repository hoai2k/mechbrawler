// 20 stages. Each is one "main" platform (solid ground, grabbable ledges, the
// lowest surface) plus 2–6 drop-through platforms in a deliberate archetype —
// arenas, skylines, galleries, towers, staircases, orbit fields (see
// docs/stage-variety-plan.md, "Platform configurations"). Layout rules: tier
// steps stay ≤140px (every fighter's single+air jump covers ~198px minimum),
// and nothing sits above y≈235 so a full jump from the highest platform stays
// on screen. tools/audit_stage_reach.mjs enforces both.
//
// A stage's gameplay identity (hazards, platform motion — "Active Boards" in
// Settings) lives in src/stage_fx.js, keyed by the stage key. The optional
// `mods` field holds always-on-while-active field modifiers:
//   gravityMul  — scales gravity for the whole match (Domain Core floats)
//   frictionPow — exponent on ground friction; < 1 is slick (Sunken Crossing)

export const STAGES = [
  { key: "trainingBridge", name: "Training Bridge", bgFile: "training_bridge.jpg", tint: "rgba(87, 186, 129, 0.12)", platforms: [
    { x: 248, y: 568, w: 784, h: 42, kind: "main" }, { x: 168, y: 424, w: 250, h: 22, kind: "side" }, { x: 862, y: 424, w: 250, h: 22, kind: "side" }, { x: 512, y: 302, w: 256, h: 20, kind: "top" }
  ] },
  { key: "quietHall", name: "Quiet Hall", bgFile: "quiet_hall.jpg", tint: "rgba(175, 128, 80, 0.12)", platforms: [
    { x: 236, y: 572, w: 808, h: 42, kind: "main" }, { x: 250, y: 438, w: 270, h: 22, kind: "side" }, { x: 760, y: 438, w: 270, h: 22, kind: "side" }
  ] },
  { key: "floodedGate", name: "Flooded Gate", bgFile: "flooded_gate.jpg", tint: "rgba(107, 174, 214, 0.13)", platforms: [
    { x: 220, y: 570, w: 840, h: 42, kind: "main" }, { x: 190, y: 446, w: 180, h: 22, kind: "side" }, { x: 910, y: 446, w: 180, h: 22, kind: "side" }, { x: 552, y: 336, w: 176, h: 20, kind: "top" }
  ] },
  { key: "shibuyaNight", name: "Shibuya Night", bgFile: "shibuya_night.webp", tint: "rgba(88, 116, 220, 0.16)", platforms: [
    { x: 250, y: 566, w: 780, h: 42, kind: "main" }, { x: 200, y: 452, w: 220, h: 22, kind: "side" }, { x: 860, y: 452, w: 220, h: 22, kind: "side" }, { x: 360, y: 342, w: 190, h: 22, kind: "side" }, { x: 730, y: 342, w: 190, h: 22, kind: "side" }, { x: 505, y: 240, w: 270, h: 20, kind: "top" }
  ] },
  { key: "curseMaw", name: "Curse Maw", bgFile: "curse_maw.jpg", tint: "rgba(60, 215, 218, 0.13)", platforms: [
    { x: 258, y: 576, w: 764, h: 42, kind: "main" }, { x: 300, y: 442, w: 220, h: 22, kind: "side" }, { x: 760, y: 442, w: 220, h: 22, kind: "side" }
  ] },
  // Terraced like the garden's stone steps: each platform is one stair higher
  // than the last, climbing left to right.
  { key: "gardenSteps", name: "Garden Steps", bgFile: "garden_steps.jpg", tint: "rgba(111, 219, 147, 0.16)", platforms: [
    { x: 212, y: 584, w: 856, h: 42, kind: "main" }, { x: 150, y: 474, w: 210, h: 22, kind: "side" }, { x: 470, y: 392, w: 210, h: 20, kind: "top" }, { x: 800, y: 318, w: 240, h: 22, kind: "side" }
  ] },
  { key: "lanternCorridor", name: "Lantern Corridor", bgFile: "lantern_corridor.jpg", tint: "rgba(255, 187, 93, 0.11)", platforms: [
    { x: 252, y: 570, w: 776, h: 42, kind: "main" }, { x: 240, y: 428, w: 190, h: 22, kind: "side" }, { x: 545, y: 428, w: 190, h: 22, kind: "side" }, { x: 850, y: 428, w: 190, h: 22, kind: "side" }
  ] },
  { key: "sunkenCrossing", name: "Sunken Crossing", bgFile: "sunken_crossing.jpg", tint: "rgba(87, 196, 255, 0.12)", mods: { frictionPow: 0.35 }, platforms: [
    { x: 190, y: 578, w: 900, h: 42, kind: "main" }, { x: 210, y: 452, w: 300, h: 22, kind: "side" }, { x: 770, y: 452, w: 300, h: 22, kind: "side" }
  ] },
  { key: "neonSplit", name: "Neon Split", bgFile: "neon_split.jpg", tint: "rgba(224, 82, 192, 0.12)", platforms: [
    { x: 270, y: 568, w: 740, h: 42, kind: "main" }, { x: 220, y: 452, w: 230, h: 22, kind: "side" }, { x: 830, y: 452, w: 230, h: 22, kind: "side" }, { x: 280, y: 332, w: 180, h: 22, kind: "side" }, { x: 820, y: 332, w: 180, h: 22, kind: "side" }
  ] },
  { key: "boneSanctum", name: "Bone Sanctum", bgFile: "bone_sanctum.jpg", tint: "rgba(76, 221, 210, 0.1)", platforms: [
    { x: 236, y: 574, w: 808, h: 42, kind: "main" }, { x: 190, y: 456, w: 190, h: 22, kind: "side" }, { x: 900, y: 456, w: 190, h: 22, kind: "side" }, { x: 400, y: 376, w: 180, h: 22, kind: "side" }, { x: 700, y: 376, w: 180, h: 22, kind: "side" }, { x: 330, y: 296, w: 170, h: 22, kind: "side" }, { x: 780, y: 296, w: 170, h: 22, kind: "side" }
  ] },
  { key: "bridgeDuel", name: "Bridge Duel", bgFile: "bridge_duel.jpg", tint: "rgba(49, 168, 134, 0.12)", platforms: [
    { x: 310, y: 582, w: 660, h: 42, kind: "main" }, { x: 150, y: 448, w: 230, h: 22, kind: "side" }, { x: 900, y: 448, w: 230, h: 22, kind: "side" }
  ] },
  { key: "academyHall", name: "Academy Hall", bgFile: "academy_hall.jpg", tint: "rgba(140, 112, 80, 0.14)", platforms: [
    { x: 180, y: 568, w: 920, h: 42, kind: "main" }, { x: 250, y: 446, w: 220, h: 22, kind: "side" }, { x: 810, y: 446, w: 220, h: 22, kind: "side" }, { x: 512, y: 320, w: 256, h: 20, kind: "top" }, { x: 560, y: 452, w: 160, h: 22, kind: "side" }
  ] },
  { key: "mistPier", name: "Mist Pier", bgFile: "mist_pier.jpg", tint: "rgba(178, 226, 255, 0.1)", platforms: [
    { x: 252, y: 580, w: 776, h: 42, kind: "main" }, { x: 180, y: 462, w: 240, h: 22, kind: "side" }, { x: 840, y: 462, w: 240, h: 22, kind: "side" }, { x: 540, y: 352, w: 150, h: 20, kind: "top" }
  ] },
  { key: "crosswalkRush", name: "Crosswalk Rush", bgFile: "crosswalk_rush.jpg", tint: "rgba(76, 171, 255, 0.13)", platforms: [
    { x: 230, y: 570, w: 820, h: 42, kind: "main" }, { x: 380, y: 430, w: 520, h: 22, kind: "side" }, { x: 180, y: 300, w: 150, h: 20, kind: "top" }, { x: 950, y: 300, w: 150, h: 20, kind: "top" }
  ] },
  { key: "cursedTeeth", name: "Cursed Teeth", bgFile: "cursed_teeth.jpg", tint: "rgba(42, 205, 204, 0.14)", platforms: [
    { x: 274, y: 584, w: 732, h: 42, kind: "main" }, { x: 190, y: 452, w: 220, h: 22, kind: "side" }, { x: 870, y: 452, w: 220, h: 22, kind: "side" }, { x: 555, y: 330, w: 170, h: 20, kind: "top" }
  ] },
  { key: "riverGate", name: "River Gate", bgFile: "river_gate.jpg", tint: "rgba(91, 205, 176, 0.13)", platforms: [
    { x: 230, y: 576, w: 820, h: 42, kind: "main" }, { x: 210, y: 448, w: 280, h: 22, kind: "side" }, { x: 800, y: 440, w: 200, h: 22, kind: "side" }, { x: 560, y: 310, w: 150, h: 20, kind: "top" }
  ] },
  { key: "schoolWing", name: "School Wing", bgFile: "school_wing.jpg", tint: "rgba(205, 148, 92, 0.1)", platforms: [
    { x: 260, y: 570, w: 760, h: 42, kind: "main" }, { x: 200, y: 446, w: 200, h: 22, kind: "side" }, { x: 880, y: 446, w: 200, h: 22, kind: "side" }, { x: 330, y: 330, w: 150, h: 22, kind: "side" }, { x: 800, y: 330, w: 150, h: 22, kind: "side" }
  ] },
  { key: "emptyCity", name: "Empty City", bgFile: "empty_city.jpg", tint: "rgba(159, 189, 214, 0.15)", platforms: [
    { x: 210, y: 574, w: 860, h: 42, kind: "main" }, { x: 170, y: 446, w: 210, h: 22, kind: "side" }, { x: 900, y: 446, w: 210, h: 22, kind: "side" }, { x: 360, y: 326, w: 190, h: 20, kind: "top" }, { x: 730, y: 326, w: 190, h: 20, kind: "top" }
  ] },
  { key: "billboardRoof", name: "Billboard Roof", bgFile: "billboard_roof.jpg", tint: "rgba(255, 83, 148, 0.1)", platforms: [
    { x: 244, y: 580, w: 792, h: 42, kind: "main" }, { x: 210, y: 500, w: 150, h: 22, kind: "side" }, { x: 920, y: 500, w: 150, h: 22, kind: "side" }, { x: 470, y: 440, w: 340, h: 22, kind: "side" }, { x: 540, y: 310, w: 200, h: 20, kind: "top" }
  ] },
  { key: "domainCore", name: "Domain Core", bgFile: "domain_core.jpg", tint: "rgba(108, 255, 230, 0.13)", mods: { gravityMul: 0.88 }, platforms: [
    { x: 196, y: 578, w: 888, h: 42, kind: "main" }, { x: 240, y: 458, w: 180, h: 22, kind: "side" }, { x: 860, y: 458, w: 180, h: 22, kind: "side" }, { x: 430, y: 338, w: 170, h: 22, kind: "side" }, { x: 680, y: 338, w: 170, h: 22, kind: "side" }
  ] }
];

export function getStage(key) {
  return STAGES.find((s) => s.key === key) || STAGES[0];
}

// Where a match of `count` fighters lines up. Two, three and four are placed by
// hand — those are the spacings the stages were laid out around. A crowd (the
// Players vs CPUs and Battle Royal modes) is spread evenly across the middle of
// the stage instead, tightening as it grows so eight fighters still start on
// solid ground on the narrowest board.
const SPAWN_SETS = {
  2: [430, 850],
  3: [320, 640, 960],
  4: [250, 500, 780, 1030],
};
const CROWD_SPAN = { left: 320, right: 960 };

export function spawnXs(count) {
  if (SPAWN_SETS[count]) return SPAWN_SETS[count];
  const { left, right } = CROWD_SPAN;
  const step = (right - left) / Math.max(1, count - 1);
  return Array.from({ length: count }, (_, i) => Math.round(left + step * i));
}

export function mainPlatform(platforms) {
  return platforms.find((p) => p.kind === "main") || platforms[0];
}
