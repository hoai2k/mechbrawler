// The 12 Mech Mayhem arenas (docs/arenas.md is the design source of truth).
// Each stage is one "main" platform (solid ground, grabbable ledges, the
// lowest surface) plus 2–5 drop-through platforms. Layout rules carried over
// from the JJK engine: tier steps stay ≤145px comfortable / 175px hard (the
// weakest jumper's single+air jump covers ~239px), and nothing sits above
// y≈235 so a full jump from the highest platform stays on screen.
// tools/audit_stage_reach.mjs enforces both.
//
// Drop-throughs are a 15px sliver so attacks read through them; mains stay 42
// — they are the ground and should read heavy. Backgrounds are the intake
// paintings, one 2048×1152 plate per arena in assets/backgrounds/arenas/,
// shared by the flat and 3D cameras alike (no wide/flat plate split any more).
//
// A stage's gameplay identity (hazards, platform motion — "Active Boards" in
// Settings) lives in src/stage_fx.js, keyed by the stage key. The optional
// `mods` field holds always-on-while-active field modifiers:
//   gravityMul  — scales gravity for the whole match (Orbital Platform floats)
//   frictionPow — exponent on ground friction; < 1 is slick (unused today)
//
// `tint` is the arena's colour wash — the flat renderer paints it over the
// backdrop and the 3D rig reads it for the fighters' rim light, so it is
// picked from each painting's palette. `desc` is the select screen's one-line
// hazard blurb. `name` must match config_music.js BOARD_TRACKS exactly.

export const STAGES = [
  { key: "neon", name: "Neon District", bgFile: "arenas/neon.jpg",
    tint: "rgba(255, 77, 216, 0.14)",
    desc: "The maglev crosses the track platform every ~22s — high ground with a timetable.",
    platforms: [
      { x: 190, y: 570, w: 900, h: 42, kind: "main" },
      { x: 250, y: 430, w: 780, h: 15, kind: "side" }, // the monorail track
      { x: 545, y: 300, w: 190, h: 15, kind: "top" },  // the torii crossbeam
    ] },
  { key: "foundry", name: "Ironworks Foundry", bgFile: "arenas/foundry.jpg",
    tint: "rgba(255, 158, 64, 0.14)",
    desc: "The furnace pours onto the left floor every ~20s; only the grounded burn.",
    platforms: [
      { x: 220, y: 572, w: 840, h: 42, kind: "main" },
      { x: 850, y: 445, w: 240, h: 15, kind: "side" }, // right-mid catwalk
      { x: 560, y: 435, w: 170, h: 15, kind: "side" }, // the hanging hook platform (sways)
      { x: 190, y: 320, w: 240, h: 15, kind: "side" }, // left-high catwalk
    ] },
  { key: "uptown", name: "Uptown Plaza", bgFile: "arenas/uptown.jpg",
    tint: "rgba(146, 190, 255, 0.10)",
    desc: "No hazard. The tournament flat in honest daylight.",
    platforms: [
      { x: 240, y: 570, w: 800, h: 42, kind: "main" },
      { x: 250, y: 445, w: 230, h: 15, kind: "side" },
      { x: 800, y: 445, w: 230, h: 15, kind: "side" },
      { x: 525, y: 320, w: 230, h: 15, kind: "top" },
    ] },
  { key: "harbor", name: "Harbor Docks", bgFile: "arenas/harbor.jpg",
    tint: "rgba(255, 138, 84, 0.12)",
    desc: "The crane spreader traverses the top; every third pass it drops a container.",
    platforms: [
      { x: 200, y: 574, w: 880, h: 42, kind: "main" },
      { x: 190, y: 460, w: 220, h: 15, kind: "side" }, // left container stack, low
      { x: 240, y: 345, w: 190, h: 15, kind: "side" }, // left stack, high
      { x: 870, y: 460, w: 220, h: 15, kind: "side" }, // right stack, low
      { x: 850, y: 345, w: 190, h: 15, kind: "side" }, // right stack, high
      { x: 540, y: 255, w: 200, h: 15, kind: "top" },  // the crane spreader (traverses)
    ] },
  { key: "skyterrace", name: "Sky Terrace", bgFile: "arenas/skyterrace.jpg",
    tint: "rgba(120, 214, 255, 0.11)",
    desc: "Every ~25s a gust crosses the terrace and re-prices every edge guard.",
    platforms: [
      { x: 320, y: 576, w: 640, h: 42, kind: "main" }, // the helipad — small and scrappy
      { x: 280, y: 465, w: 210, h: 15, kind: "side" }, // HVAC bank left
      { x: 790, y: 465, w: 210, h: 15, kind: "side" }, // HVAC bank right
      { x: 330, y: 345, w: 160, h: 15, kind: "side" }, // deck perch left
      { x: 790, y: 345, w: 160, h: 15, kind: "side" }, // deck perch right
    ] },
  { key: "scrapyard", name: "Scrapyard 7", bgFile: "arenas/scrapyard.jpg",
    tint: "rgba(214, 160, 96, 0.13)",
    desc: "The crane magnet stops over someone every ~18s and yanks them skyward.",
    platforms: [
      { x: 210, y: 578, w: 860, h: 42, kind: "main" },
      { x: 330, y: 462, w: 190, h: 15, kind: "side" }, // the buried hand: index finger
      { x: 550, y: 355, w: 180, h: 15, kind: "side" }, // middle finger
      { x: 770, y: 470, w: 200, h: 15, kind: "side" }, // thumb
    ] },
  { key: "quarry", name: "Crystal Quarry", bgFile: "arenas/quarry.jpg",
    tint: "rgba(180, 107, 255, 0.13)",
    desc: "Mining charges detonate one-two-three every ~24s; read the sequence.",
    platforms: [
      { x: 230, y: 574, w: 820, h: 42, kind: "main" },
      { x: 170, y: 460, w: 220, h: 15, kind: "side" }, // terrace bench, left low
      { x: 150, y: 345, w: 200, h: 15, kind: "side" }, // terrace bench, left high
      { x: 880, y: 450, w: 220, h: 15, kind: "side" }, // terrace bench, right
      { x: 660, y: 370, w: 180, h: 15, kind: "side" }, // crystal outcrop
    ] },
  { key: "volcano", name: "Volcanic Forge", bgFile: "arenas/volcano.jpg",
    tint: "rgba(255, 106, 61, 0.15)",
    desc: "Flame jets erupt along the armed fissure every ~19s — the air is safe.",
    platforms: [
      { x: 250, y: 576, w: 780, h: 42, kind: "main" },
      { x: 270, y: 448, w: 200, h: 15, kind: "side" }, // basalt column
      { x: 750, y: 435, w: 230, h: 15, kind: "side" }, // the rock arch (pass-through beneath)
    ] },
  { key: "frozen", name: "Frozen Outpost", bgFile: "arenas/frozen.jpg",
    tint: "rgba(84, 180, 255, 0.13)",
    desc: "The centre third is sea ice; every ~26s it cracks, breaks, and refreezes.",
    platforms: [
      { x: 200, y: 574, w: 880, h: 42, kind: "main" },
      { x: 210, y: 455, w: 260, h: 15, kind: "side" }, // pipeline run, left
      { x: 810, y: 455, w: 260, h: 15, kind: "side" }, // pipeline run, right
      { x: 540, y: 330, w: 200, h: 15, kind: "top" },  // the icebreaker's bow
    ] },
  { key: "ruins", name: "Desert Ruins", bgFile: "arenas/ruins.jpg",
    tint: "rgba(255, 202, 110, 0.12)",
    desc: "Heavy hits crack the colonnade's columns; break one and the lintel falls for the stock.",
    platforms: [
      { x: 220, y: 576, w: 840, h: 42, kind: "main" },
      { x: 190, y: 445, w: 250, h: 15, kind: "side" }, // the colonnade lintel (collapsible)
      { x: 560, y: 460, w: 220, h: 15, kind: "side" }, // the sphinx's back
      { x: 610, y: 350, w: 150, h: 15, kind: "side" }, // the sphinx's head
      { x: 870, y: 330, w: 200, h: 15, kind: "side" }, // the pylon gate top
    ] },
  { key: "jungle", name: "Jungle Temple", bgFile: "arenas/jungle.jpg",
    tint: "rgba(98, 255, 154, 0.12)",
    desc: "Every ~20s the lianas whip the right half — thrown INTO the fight, never off it.",
    platforms: [
      { x: 230, y: 576, w: 820, h: 42, kind: "main" },
      { x: 500, y: 458, w: 280, h: 15, kind: "side" }, // pyramid tier one
      { x: 555, y: 350, w: 170, h: 15, kind: "side" }, // pyramid tier two
      { x: 200, y: 335, w: 190, h: 15, kind: "side" }, // the bough, high left
    ] },
  { key: "orbital", name: "Orbital Platform", bgFile: "arenas/orbital.jpg",
    tint: "rgba(94, 200, 255, 0.13)",
    mods: { gravityMul: 0.88 }, // Station VALKYRIE: gravity 12% lower for everyone
    desc: "Low gravity, and station debris rakes the upper platforms every ~30s.",
    platforms: [
      { x: 240, y: 572, w: 800, h: 42, kind: "main" },
      { x: 390, y: 430, w: 210, h: 15, kind: "side" }, // the robotic arm's forearm (drifts)
      { x: 840, y: 452, w: 230, h: 15, kind: "side" }, // the shuttle's fuselage
    ] },
];

export function getStage(key) {
  return STAGES.find((s) => s.key === key) || STAGES[0];
}

/** The backdrop file for `stage`. Every arena has exactly ONE painting
 *  (assets/backgrounds/arenas/<key>.jpg, 2048×1152) serving both cameras —
 *  the `flat` flag is kept so callers didn't have to change, but it no longer
 *  selects a different plate. */
export function backgroundFile(stage, _flat) {
  return `assets/backgrounds/${stage.bgFile}`;
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
