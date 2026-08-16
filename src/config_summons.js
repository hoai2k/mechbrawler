// Summon art and animation — the shared vocabulary summons.js draws from.
//
// SUMMON_ART IS THE WRONG ANSWER FOR A MECH SUMMON, and this is the note that
// says so rather than leaving the empty table looking like a hole.
//
// A mech summon is not a creature that needs drawing: it is the MECH ITSELF.
// A wolf out of Fenrir's WILD HUNT is a small Fenrir, a raptor out of
// Saurion's RAPTOR PACK is a small Saurion, a flea out of Jerry's FLEA CIRCUS
// is a small Jerry, and Rhino's copies are Rhinos. The art already exists —
// it is the rig — and painting a second, flatter version of a body the game
// already renders in 3D would be strictly worse than the body.
//
// AND THE DRAW SITE ALREADY TAKES A RIG. summons.js splits on `this.actor`:
//
//     if (this.actor) this.drawActor(...)   // currentFrame + drawCharFrame
//     else            this.drawStill(...)   // a sprite, or the glow orb
//
// `drawActor` is the fighter path — `currentFrame(actor, animKey, animTime)`
// then `drawCharFrame`, which in the 3D backend resolves that key's rig and
// clips exactly as it does for a player. `actor` comes straight off the kit
// (`actor: cfg.actor || null`, summons.js), and the ult director already
// forwards it (`actor: p.actor && actorPosesReady(p.actor) ? p.actor : null`,
// ultimates.js) — with `actorPosesReady` now unconditionally true, because a
// mech rig carries the full clip set and cannot be half-delivered the way a
// sprite sheet could. Nothing new is needed on the engine side at all.
//
// SO THE WHOLE WIRING IS ONE FIELD PER SUMMON ULT, in characters.js `p`:
//
//     fenrir  WILD HUNT     actor: "fenrir",   scale: ~0.45
//     saurion RAPTOR PACK   actor: "saurion",  scale: ~0.45   (eggs unchanged)
//     jerry   FLEA CIRCUS   actor: "jerry",    scale: ~0.35
//     rhino   (copies)      actor: "rhino",    scale: ~0.5
//
// `scale` is what makes it read as a pack-mate rather than a clone of the
// caster, and the creature's HITBOX stays `hitW`/`hitH` from the kit, so
// shrinking the drawing does not silently shrink the threat. Those four lines
// live in characters.js, which this task does not own.
//
// ONE ENGINE LINE IS OWED FOR THAT `scale`, and it is not in this file either.
// drawActor passes `cfg.scale ?? 0.95` down as `opts.scale`, but
// render3d/src/blit.js reads it as a RATIO against the actor's own sprite-era
// `scale` field:
//
//     const actorScale = getActor(charKey)?.scale;
//     const scaleRatio = opts.scale && actorScale ? opts.scale / actorScale : 1;
//
// and no mech has a `scale` any more — heights.js deleted it when the sprite
// sheets went, because a rig is sized from `heightM` instead. So `actorScale`
// is `undefined` for all seventeen, the ratio collapses to 1, and a summoned
// wolf would render at FULL FENRIR SIZE. The smallest fix is to default the
// missing field rather than to disable the dial:
//
//     const actorScale = getActor(charKey)?.scale ?? 1;
//     const scaleRatio = opts.scale ? opts.scale / actorScale : 1;
//
// — `opts.scale` then means what its callers already believe it means (a plain
// multiple of the head-height target), it stays a ratio for anything that ever
// declares `scale` again, and it is a no-op for fighters, who never pass it.
//
// WHAT SUMMON_ART IS STILL FOR: a summon that is NOT a mech — a drone, a
// swarm, a hazard creature. It stays because that machinery is generic and
// live (poses resolve pose-by-pose against a still, so partial art works), not
// because a mech summon is waiting on it. Register such a creature as
// `{ file, delivered, poses, faceRight }` with art under
// assets/sprites/summons/<file>.png and assets.js/summons.js pick it up with
// no other change. The JJK creature table and the per-cast variety pools went
// out with the conversion (plan task K4); if a summon special ever wants
// pool-rolled variety again, specials.js still rolls `p.pool` per cast.

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

// Every NON-MECH creature's art, keyed the way kits name it (`summon:<key>`).
// Empty, and expected to stay empty while every summon on the roster is a
// mech — those draw through their own rig via the kit's `actor`. See header.
export const SUMMON_ART = {};
