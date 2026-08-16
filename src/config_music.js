// ---------------------------------------------------------------------------
// Music configuration — which track plays where.
//
// The soundtrack is Mech Mayhem's, imported whole from robotworld: each arena
// plays its own theme (take 1 of the upstream per-arena set), and the general
// battle loops serve as the fallback pool. Menu screens play the title theme
// at a reduced volume.
//
// THE MUSIC STARTS ON THE TITLE. The splash and the fighter select are the
// same menu phase (MENU_PHASES in audio.js), so MENU_TRACK begins the moment
// the cabinet wakes and plays straight through the hand-over rather than
// restarting at select. The neon sign still buzzes over it — that is a sound
// effect on its own element, not a track, so the two coexist.
//
// TITLE_TRACK gives the splash a track of its OWN (at full battle volume, not
// the menu mix) and is null because it should be: a second source means a cut
// at the hand-over, however well the two pieces match.
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
  file: "Moonlit Go-Go v2",
  // Menu music sits under the battle music: the master volume slider still
  // applies, this is the extra scaling on top of it.
  volumeScale: 0.5,
};

// A splash-only track. Null: the title runs the menu track through — see above.
export const TITLE_TRACK = null;

// The Music setting, in the order it cycles. `default` plays each stage's own
// track, `random` draws from every board track and original alike, `off` mutes
// menus and matches both.
export const MUSIC_MODES = [
  { key: "default", label: "Default" },
  { key: "random", label: "Random" },
  { key: "off", label: "Off" },
];

// Used for any stage with no track of its own (Ironworks Foundry, upstream's
// own gap), picked at random per match, and part of the Random pool.
export const FALLBACK_TRACKS = [
  { label: "Steel Titans", file: "Steel Titans Loop 1" },
  { label: "Steel Titans II", file: "Steel Titans Loop 2" },
  { label: "Titan Clash", file: "Titan Clash Suite 1" },
  { label: "Titan Clash II", file: "Titan Clash Suite 2" },
  { label: "Titan Forge", file: "Titan Forge Loop 1" },
  { label: "Titan Forge II", file: "Titan Forge Loop 2" },
];

// Stage-specific battle tracks. Each entry is a filename (without extension) in
// assets/music/boards/ that must equal a stage name.
export const BOARD_TRACKS = [
  "Crystal Quarry",
  "Desert Ruins",
  "Frozen Outpost",
  "Harbor Docks",
  "Jungle Temple",
  "Neon District",
  "Orbital Platform",
  "Scrapyard 7",
  "Sky Terrace",
  "Uptown Plaza",
  "Volcanic Forge",
];

// Files present in assets/music/boards/ that are deliberately not in use — they
// match no stage. Listed so the checker can stay quiet about them; delete an
// entry here once its track is renamed to a real stage name.
export const UNUSED_BOARD_TRACKS = [];
