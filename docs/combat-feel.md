# Combat feel — what's missing versus Super Smash Bros

Read against the current code in `combat.js`, `fighter.js` and `constants.js`.
Nothing here is a bug; the systems that exist are correct. This is about the
mechanics Smash has that this game does not, ranked by how much each one
changes how a match *feels*.

**Status: items 1-4 are implemented and verified in a live match.** Items 5-7
remain proposals. Each section below is marked.

## Already here, and right

Worth stating so nobody re-implements it: hitlag/freeze frames scaled by damage
(`combat.js:417`), percent-based knockback with per-character weight, hitstun
scaled by knockback, jump buffering, coyote time, short hop, fast fall, air
jumps, shield with damage/regen/break and a 0.12s parry window, rolls, spot
dodge, air dodge with staling, ledge grab and hang, chargeable smashes,
camera shake and slow-mo on big hits, meter economy.

That is most of the skeleton. What follows is the connective tissue.

---

## 1. Directional Influence (DI) — the big one — DONE

Knockback used to come entirely from the attacker's angle, so once a hit landed
the outcome was fixed and the defender had no input until hitstun ended. DI is
what makes Smash's damage model survivable and skilful.

Implemented as **perpendicular DI** (`diAngle` / `diSpeedScale` in `combat.js`):
only stick input *across* the launch vector turns it, up to ~17°, which is what
makes the classic "DI away to live, DI in to escape" read work. Input *along*
the launch trades launch speed instead, ±8%.

`fighter.js` stores `f.input` each frame — before the hitlag early-return, so a
fighter frozen in hitlag still DIs with a live stick. That freeze is exactly the
window a Smash player uses to pick a direction.

Measured behaviour, symmetric across both facings:

| Hold | Result |
|---|---|
| up | steeper launch |
| down | flatter launch |
| away from the attacker | flatter, +7.5% knockback — fly far and low |
| into the attacker | steeper, −7.5% knockback — kill your momentum |

## 2. Move staling — DONE

Nothing tracked how recently a move was used, so the optimal play was to find
your best kill move and throw it forever. Dodges already staled
(`fighter.js:134`); attacks now do too.

A 9-slot ring buffer per fighter (`owner.recentMoves`) holds recently *landed*
moves — whiffs cost nothing. Each repeat in the buffer cuts damage 9% and
knockback 6%, floored at 0.25x and 0.4x. Staling is applied before crits,
installs and passives so those scale the weakened value rather than papering
over it.

## 3. Attack input buffering — DONE

Only jump was buffered (`JUMP_BUFFER`). Attack, heavy and special presses during
hitstun, landing or the tail of another move were dropped, which reads as the
game ignoring you.

Presses are now held for `ACTION_BUFFER` (0.12s) in `f.bufferedAction` and fire
the instant `canAct` returns. A fresh press always beats a buffered one, so the
buffer only ever covers inputs that arrived while the fighter was busy.

## 4. Landing lag on aerials — DONE

`landTimer` was a flat 0.14s on every landing that only drove the animation — it
did not lock actions and did not care whether you were attacking, so cancelling
an aerial into the ground was strictly better than finishing it.

Landing mid-aerial now costs `move.recover * AERIAL_LAND_LAG_MULT` (floor
`AERIAL_LAND_LAG_MIN`), stored in `f.landLag`, which gates `canAct`. An
L-cancel-style timing bonus could follow, but the base cost matters far more
than the tech.

## 5. Teching — NOT DONE

**Missing.** A fighter thrown into the ground or a wall just bounces or lands.
Smash lets you press shield within a few frames of impact to tech — cancelling
the knockdown, optionally rolling.

This is what stops hard knockdowns feeling like a death sentence, and it gives
the defender one more skill expression at exactly the moment they most want one.

Proposal: on ground/wall contact with `hitstun > 0` and knockback over a
threshold, open a ~0.2s window where shield triggers a tech (brief invuln, no
knockdown; ±roll with a direction held). Missing it gives the current behaviour
plus a short getup.

## 6. Directional air dodge — ALREADY PRESENT

Correction to the original audit: air dodge **already applies directional
velocity** — `fighter.js` adds `input.dirX * 340` and reacts to up/down on the
air-dodge branch. I called it neutral-only on the first pass by reading the
constant rather than the call site. Nothing to do here.

## 7. Smaller polish — NOT DONE

- **Hitstun scaling cap.** `clamp(0.12 + kb*0.00048, 0.12, 1.35)` — the 1.35s
  ceiling means very high-percent hits stop scaling, so late-game combos behave
  oddly. Consider raising the cap and letting DI (item 1) be the counterplay.
- **Crouch-cancelling / armour on heavies.** There is armour support in the code
  already; using it on a few slow heavies would reward commitment.
- **Ledge trump and invincibility timers.** Ledge grab exists but has no
  contested-ledge rules; two fighters at one ledge currently has no answer.
- **Shield tilting** — angling a shield to protect high or low, so shield
  pressure has a mixup.
- **Rage** — Smash Ultimate's damage bonus at high percent. Cheap comeback
  mechanic, fits a party brawler.
- **Directional taunt / no-op inputs** don't matter here.

---

## What shipped, and how it was verified

Driven in a live CPU-vs-CPU match with a state probe sampling at 10Hz for ~26
seconds:

| Mechanic | Evidence |
|---|---|
| DI | `f.input` populated on every fighter; launch angle and speed verified across both facings — hold down/away flies flat and far, hold in kills momentum |
| Move staling | queue reached 4 repeats of one move (`Cleave`), putting it at ~0.64x damage |
| Input buffering | buffered presses observed firing |
| Landing lag | 0.084s observed on an aerial landing |

Zero console errors over 259 samples.

**Tuning knobs**, if any of it feels wrong. `DI_MAX_TURN` (0.30 rad ~ 17
degrees), `DI_SPEED` (0.08), `STALE_DMG_STEP` (0.09) and `STALE_KB_STEP` (0.06)
live in `src/config_tuning.js` alongside the sprite-motion dials; `ACTION_BUFFER`
(0.12s) and `AERIAL_LAND_LAG_MULT` (0.6) are match rules, so they stay in
`src/constants.js`.

Still open: teching (item 5) and the item-7 polish list.
