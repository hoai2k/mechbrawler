// Who is allowed to hit whom.
//
// Every fighter carries a `team`. In a free-for-all each one gets a team of
// their own, so "different team" and "different fighter" mean the same thing
// and the rule below collapses to the old `target !== self` check. Players vs
// CPUs is the only mode that puts several fighters on one team, and it is this
// one predicate that makes their attacks pass through each other — melee,
// projectiles, summons, domains and CPU target picking all ask here.
import { state } from "./state.js";

/** True if `attacker` may damage `target`. A fighter with no team at all (the
 *  workbench builds fighters by hand) is hostile to everyone, so tools that
 *  never heard of teams keep behaving exactly as they did. */
export function isFoe(attacker, target) {
  if (!attacker || !target || attacker === target) return false;
  if (attacker.team == null || target.team == null) return true;
  return attacker.team !== target.team;
}

/** Every live fighter `f` is entitled to attack — no teammates, nobody who is
 *  out, nobody still on the respawn platform. */
export function foesOf(f) {
  return state.fighters.filter((o) => isFoe(f, o) && !o.dead && o.respawnTimer <= 0);
}

/** True once every surviving fighter is on the same side: the match is over.
 *  Covers both shapes — a free-for-all ends when one fighter is left, a team
 *  match when one team is. */
export function oneSideLeft(alive) {
  if (alive.length <= 1) return true;
  if (alive.some((f) => f.team == null)) return false; // teamless: last one standing only
  return new Set(alive.map((f) => f.team)).size <= 1;
}
