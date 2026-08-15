// ---------------------------------------------------------------------------
// Music configuration — which track plays where.
//
// The soundtrack is Mech Mayhem's, imported whole from robotworld: each arena
// plays its own theme (take 1 of the upstream per-arena set), and the general
// battle loops serve as the fallback pool. Menu screens play the upstream menu
// suite at a reduced volume.
//
// THE TITLE SCREEN IS SILENT ON PURPOSE. Mech Mayhem's title has no music —
// its audio signature is the neon sign buzzing (assets/sfx/neon_buzz.mp3,
// played by the tube-flicker watcher in ui.js), and a track under it would
// bury the one sound the screen is about. TITLE_TRACK is null and audio.js
// treats that as "menu track, but let the buzz through".
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
  file: "Bohemian Cello Flame Hybrid Suite",
  // Menu music sits under the battle music: the master volume slider still
  // applies, this is the extra scaling on top of it.
  volumeScale: 0.5,
};

// The title screen: no track — see the header. The neon buzz is the signature.
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
