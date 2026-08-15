# Gameplay TODO — the defensive triangle, and four fairness gaps

Two pieces of work that came out of the round-18 polish review. Status, as of
round 19:

- **The grab (§1) is BUILT and now ON BY DEFAULT** — `src/grab.js`,
  `src/flags.js`. It matches this brief: shield-ignoring reach with whiff
  recovery, four throws routed through `applyHit`, damage-scaled mash escape,
  break-out punish window, a no-regrab beat, `isFoe` teams routing — plus a
  pummel and the shield-grab input this brief didn't ask for. The flag has
  flipped and every generated control surface names RT as grab; `?throw=false`
  is all that is left of it, kept so the game can be played without grabs to
  compare. What remains is the two shield tweaks below (§1a).
- **The fairness patches (§2) are DONE**: projectiles and owned entities
  freeze through their owner's hitlag, particles and the camera run on the
  slow-motion clock, and the ledge is one-per-customer with a Smash-style
  trump. A fourth candidate — a ledge-regrab limit per airtime — was
  considered and dropped: the ledge was retuned toward Smash's generous snap
  in the same round, the trump already removes the camped-ledge abuse case,
  and a regrab limit pulls against both.

---

## 1. A universal grab / throw

### The problem

The game has no answer to a shield.

Shield is finite (`SHIELD_MAX` 100, drain 22/s, so about 4.5 s) and it can be
broken by damage, which is a real cost. But nothing in the game *beats* it on
purpose. In a standard platform fighter the defensive layer is a triangle:

```
attack  beats  grab
grab    beats  shield
shield  beats  attack
```

Take grab out and it collapses into "shield beats attack, attack eventually
beats shield by chipping it down". Holding shield is then never a mistake, only
sometimes slow — and the correct play against pressure is to sit in it and wait
for the attacker to run out of ideas.

Two smaller things make it worse and should be fixed in the same pass:

- **Shield regenerates the instant it drops** (`src/fighter.js`, the shield
  block in `updateFighter`). There is no penalty for tapping in and out of
  shield repeatedly, so the 4.5 s budget is only really 4.5 s of *continuous*
  holding.
- **Dropping shield is free** — no shield-drop lag. So the shield's recovery
  cannot be punished on reaction even when it is read correctly.

`commandGrab` already exists (`src/specials.js`), but it is one character's
special move — an unblockable melee box, not the universal mechanic. It is not
a substitute; it is evidence the shape is missing.

### What to build

A grab on every fighter:

- **Input.** There is no free face button; the pad is fully spoken for. The
  conventional answer is **shield + attack** (LT + X), which is also how a new
  player discovers it by accident, and which reads correctly — you are giving up
  your guard to reach for them.
- **Properties.** Short range, slow startup, and losing to any attack that
  connects first. That losing-to-attack part is not a drawback, it is the whole
  point: it is the third side of the triangle.
- **Ignores shield.** The grab box must test the target's hurtbox and skip the
  shield check entirely — that is the mechanic.
- **Throws.** Four directions at minimum (forward / back / up / down) so the
  grab is a positional tool and not just damage. Down-throw into a juggle and
  up-throw as a kill option at high percent are the two that carry it.
- **Escape.** A mashable grab-release scaled by the victim's damage, so a grab
  at 10% is a combo starter and a grab at 140% is a stock. Without an escape
  the grab is a hard read with no counterplay, which is the failure mode on the
  other side.
- **Teams.** Route the target test through `isFoe` (`src/teams.js`) like every
  other damage path, so a grab cannot pick up a teammate.

### §1a Still open in this area

The grab itself shipped (see the status note at the top). Two shield tweaks
from this brief did not ship with it and should land when the flag graduates,
as one balance pass:

- **Shield regen delay** — regen still starts the instant the shield drops
  (`src/fighter.js`, the shield block). A short beat (~0.4 s) before refilling
  makes tapping in and out of shield cost something.
- **Shield-drop lag** — dropping shield is still free; a few frames of
  recovery on release makes a read on the shield drop punishable.

The graduation is DONE: the flag defaults on, the controls tables are
regenerated and name RT as grab, and only `?throw=false` remains. Removing the
flag entirely is the last step, and is worth leaving until the balance pass
below has been played against.

---

## 2. Three fairness and consistency patches

All shipped in round 19; the write-ups are kept for the record.

### 2a. ~~Projectiles and summons do not freeze during hitlag~~ (done)

`updateProjectiles` and the entity loop now carry the same `owner.hitPause`
guard `updateHitboxes` always had; ownerless entities (stage gimmicks) keep
ticking.

### 2b. ~~Particles and the camera ignore slow motion~~ (done)

`updateParticles` and `updateCamera` take the slow-motion-scaled dt, so a KO's
beat plays at one speed. The camera's dt-correct smoothing means the follow
and shake decay slow with it — kept deliberately: that drift is what a
slow-motion shot wants.

### 2c. ~~No ledge occupancy~~ (done — as a trump)

One fighter per ledge point, resolved Smash's way: grabbing an occupied ledge
**trumps** — the newcomer takes it, the occupant is popped off outward with a
brief protection window. Hogging a ledge is now an interaction, not a wall.

---

## Order

What's left: the shield tweaks (§1a). The flag graduation that used to sit
beside them is done.
