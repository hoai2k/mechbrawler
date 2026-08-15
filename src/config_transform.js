// Ultimate transformations — a fighter becoming another actor for a while,
// rather than summoning it as a separate entity.
//
// The machinery is live (transformReady in ultimates.js, the install director,
// transformActorsFor below feeding the asset loader) but the table is empty:
// no mech ultimate swaps the fighter's body for another actor's. The JJK-era
// worked example (Megumi/Mahoraga) went out with the conversion (plan task K4).
//
// TODO: the first mech that wants a true second-body ultimate registers it
// here — `{ fighter, actor, enabled, install: {...} }` — and lists the actor
// in SPRITE_ACTORS (characters.js) so its art loads with the fighter's.

export const TRANSFORMS = {};

/** Actors a fighter can turn into, so their art can be loaded with the
 *  fighter's own. Only transforms that are switched ON count. */
export function transformActorsFor(fighterKey) {
  return Object.values(TRANSFORMS)
    .filter((t) => t.enabled && t.fighter === fighterKey)
    .map((t) => t.actor);
}
