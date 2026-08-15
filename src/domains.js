// Domain machinery — STUBBED in the mech conversion (plan task K4).
//
// The JJK game had a second full-bar super here: Domain Expansion, a
// several-second environment the caster kept operating while it was open.
// The mech roster has exactly one full-bar super — the ultimate (Q3 in
// docs/mech-conversion-plan.md) — so no kit defines `char.domains` and none
// of the old machinery can ever run. The 800-line implementation is gone;
// what remains are the seams the engine still asks through, each answering
// "no domain".
//
// TODO(A4): if a future mech wants an ultimate that plays like a domain did
// (a lasting environment the owner operates), rebuild it as an ultimate
// director in ultimates.js rather than resurrecting this file. The engine
// hooks that made domains work are still in place: `state.domainOverlay`
// (the full-screen grade, drawn by render.js and used by several mech ults
// already) and these entry points.

/** The domain a fighter currently has open. Always null: no mech has one. */
export function activeDomain(f) {
  return null;
}

/** Let an open domain consume an input press. Never; see activeDomain. */
export function domainInput(f, input) {
  return false;
}

/** Knockback multiplier a victim takes inside a domain. Neutral. */
export function domainKnockbackMul(f) {
  return 1;
}

/** Left-stick mapping for a fighter with several domains (nobody). */
export function domainStickFor(slot, count) {
  return null;
}

/** The special slot the domain button doubles as (Simple Domain). None. */
export function charDomainSpecialSlot(char) {
  return null;
}
