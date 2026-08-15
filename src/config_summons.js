// Summon art and animation — the shared vocabulary summons.js draws from.
//
// A summoned creature animates off a small fixed pose set, the same way a
// fighter does off theirs, with a single still as the fallback and a
// procedural glow behind that (summons.js). The mech ultimates that summon —
// Fenrir's WILD HUNT, Saurion's RAPTOR PACK, Jerry's FLEA CIRCUS
// (characters.js) — currently draw the procedural body: no creature art has
// been delivered for them, so SUMMON_ART is empty.
//
// TODO: when mech summon art lands (docs/image-requests.md), register each
// creature here — `{ file, delivered, poses, faceRight }`, art under
// assets/sprites/summons/<file>.png — and the loader (assets.js) and
// summons.js pick it up with no other change. The JJK creature table and the
// per-cast variety pools went out with the conversion (plan task K4); if a
// mech summon special ever wants pool-rolled variety again, specials.js still
// rolls `p.pool` per cast.

// Every pose a summon can be asked to draw. Deliberately tiny next to a
// fighter's set: a summon is read at a glance while the player is watching
// their own fighter, so what it needs is a breath, a stride, a strike and a
// flinch — not a move set.
export const SUMMON_POSES = ["idle_a", "idle_b", "move_a", "move_b", "attack", "hurt"];

// How those poses play. `attack` and `hurt` are one-shots held for as long as
// the state that asked for them lasts; idle and move loop.
export const SUMMON_ANIMS = {
  idle: { frames: ["idle_a", "idle_b"], fps: 2.4, loop: true },
  move: { frames: ["move_a", "move_b"], fps: 8, loop: true },
  attack: { frames: ["attack"], fps: 1, loop: false },
  hurt: { frames: ["hurt"], fps: 1, loop: false },
};

// Every creature's art, keyed the way kits name it (`summon:<key>`). Empty —
// see the header.
export const SUMMON_ART = {};
