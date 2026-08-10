// ---------------------------------------------------------------------------
// Music configuration — which track plays where.
//
// Menu screens play one fixed track at a reduced volume. A match plays the
// track named after its stage if one has been delivered, and otherwise falls
// back to a random pick from the originals. The Music setting can override that
// with Random — any board track or original, drawn per match — or Off.
//
// BOARD_TRACKS is the manifest of what actually exists in assets/music/boards/:
// a browser cannot list a directory, so the filenames are listed here. After
// adding or renaming files, run `node tools/check_music.mjs` to see what
// changed, or `node tools/check_music.mjs --write` to refresh this list from
// disk. Names must match a stage's `name` in stages.js exactly — the checker
// and the game both report entries that match nothing.
// ---------------------------------------------------------------------------

export const MUSIC_DIR = "assets/music/";
export const BOARD_MUSIC_DIR = "assets/music/boards/";
export const MUSIC_EXT = ".mp3";

// Menu, stage select, move list, settings and the results screen.
export const MENU_TRACK = {
  label: "Menu",
  file: "JJK Brawler Menu",
  // Menu music sits under the battle music: the master volume slider still
  // applies, this is the extra scaling on top of it.
  volumeScale: 0.55,
};

// The Music setting, in the order it cycles. `default` plays each stage's own
// track, `random` draws from every board track and original alike, `off` mutes
// menus and matches both.
export const MUSIC_MODES = [
  { key: "default", label: "Default" },
  { key: "random", label: "Random" },
  { key: "off", label: "Off" },
];

// Used for any stage with no track of its own, picked at random per match, and
// part of the pool the Random mode draws from.
export const FALLBACK_TRACKS = [
  { label: "Final Match", file: "The_Final_Match_Point" },
  { label: "Iron vs Bone", file: "Iron_Versus_Bone" },
];

// Stage-specific battle tracks. Each entry is a filename (without extension) in
// assets/music/boards/ that must equal a stage name.
export const BOARD_TRACKS = [
  "Academy Hall",
  "Billboard Roof",
  "Bone Sanctum",
  "Bridge Duel",
  "Crosswalk Rush",
  "Curse Maw",
  "Cursed Teeth",
  "Domain Core",
  "Empty City",
  "Flooded Gate",
  "Garden Steps",
  "Lantern Corridor",
  "Mist Pier",
  "Neon Split",
  "Quiet Hall",
  "River Gate",
  "School Wing",
  "Shibuya Night",
  "Sunken Crossing",
  "Training Bridge",
];

// Files present in assets/music/boards/ that are deliberately not in use — they
// match no stage. Listed so the checker can stay quiet about them; delete an
// entry here once its track is renamed to a real stage name.
export const UNUSED_BOARD_TRACKS = [];
