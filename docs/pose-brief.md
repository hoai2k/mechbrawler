# The pose brief — what every pose has to be

This is the standing brief for drawing a fighter. Everything here was learned by
getting it wrong: each rule below exists because a delivered round missed it and
had to be re-requested, and the round it came from is cited so the reasoning can
be checked rather than taken on faith.

**It is the thing to read before asking for a new character**, and the thing to
add to after every round. A request file describes one delivery and then moves to
history; this file is cumulative, so the roster's twenty-eighth fighter should
arrive closer to right than the twenty-seventh did. When a round turns up a fault
that is not written here yet, write it here — that is the step that makes the
next set better, and it is the one that gets skipped.

- The delivery format — key screen, resolution, file naming — is
  [asset-requests.md § Delivery spec](asset-requests.md#delivery-spec).
- The design of a particular fighter is their **character block** in that same
  file, plus their canonical reference image.
- **This file is the pose half.** Prompt formula:
  `[CHARACTER BLOCK]`, `[POSE LINE]`, facing right, `[STYLE SUFFIX]`.

---

## 1. The rules that hold for every pose

**One zoom per character.** Draw every pose of a fighter at the same figure
scale. Do not redraw each pose to fill its canvas. Standing poses should measure
within a few percent of each other; genuinely low poses (crouch, roll, prone) are
shorter because the body is lower, not because the camera moved. This is the most
expensive fault to fix later — it is only catchable by eye, and two idle frames at
different scales make the fighter visibly pulse while standing still.

**Framing, and the reach margin.** Full body inside the frame, margin on all four
sides, nothing touching the canvas edge. The poses that break this are always the
ones that extend: the figure gets drawn to fill the canvas and the weapon is what
falls off. Round 13's `yuta/crouch_attack_b` came back with the blade running off
the right of the plate, which no amount of placement recovers — the sword simply
ends in mid-air. **Draw the margin for the reach, do not shrink the reach to fit
the margin.**

**Facing right**, always. The engine mirrors for the other direction.

**No painted-in motion or effects.** No speed lines, no dust, no afterimages, no
cursed-energy glow that the engine draws itself (`trailStrength`, dash dust,
hit flashes, install auras). Painted effects loop as a flicker and double up on
what the renderer is already doing. A technique's *energy forming in the hands*
is part of the pose; the projectile leaving is not — that is a separate effect
sprite.

**The costume does not change between poses.** Every likeness fault on the roster
has been one pose out of a set drawn from a different reading of the character.
The canonical reference image is the authority, and it is checked pose by pose.

**A pose is not a scene.** One subject per file, no props the character is not
holding, no ground, no background.

**One pose per plate — not a strip of them.** A generator asked for a run frame
will sometimes return the whole cycle as a contact sheet of small figures. It is
unusable twice over: the figures overlap, so no single one crops out cleanly,
and each is a fraction of the canvas, so none of them clears the 600 px body
minimum. Round 15A lost `mechamaru/run_reach_a` this way. Four poses means four
files.

---

## 2. Every `_a`/`_b` pair, and the flip test

Eleven of the poses come in pairs, and the pairs are not two drawings of the same
idea. They are **one motion sampled twice**, and the engine plays them back to
back at a fixed rate, so anything that differs between them other than the motion
reads as a glitch: same camera, same distance, same figure scale, same costume,
same weapon in the same hand.

**The flip test.** Put `_a` beside `_b`. Every part of the body that was moving
must have moved **further in the same direction**. If something reverses, the
pair reads as a twitch; if nothing moves, it reads as a still.

Which kind of pair each one is:

| Pair | What the two frames are |
|---|---|
| `idle_a` / `idle_b` | The same stance a breath apart. Small and organic — a shift of weight, not a second pose. |
| `crouch_a` / `crouch_b` | The same held crouch, breathing. **Not a descent sampled twice.** |
| `run_reach_a` / `run_pass_a` / `run_reach_b` / `run_pass_b` | One continuous stride cycle, four samples. See §4. |
| `attack_light_a` / `_b` | Wind-up, then strike. |
| `attack_heavy_a` / `_b` | Wind-up, then strike, of **one committed blow**. |
| `attack_air_a` / `_b` | The same, airborne. |
| `crouch_attack_a` / `_b` | The same, from the crouch and staying down. |
| `ult_a` / `ult_b` | Gathering, then release. |

A `_b` that is *taller* than its `_a` is a rising attack, and rising attacks are
`attack_up`. That is a different move.

---

## 3. The measurable ones

Three poses now feed numbers the engine uses in play, so they are not only a
readability question — **the art is balance data**. These are the acceptance
criteria, and they can be checked with a ruler:

**Measure them, do not eyeball them.** Round 15A stated the heavy-strike rule in
the request itself and all three delivered sets still missed it — 9%, 16% and
20% against a third. A criterion that is read is not a criterion that is
checked. The measurement is mechanical: the forward edge of the art past the
centre of the body's core columns, as a fraction of the idle's own height, and
it is comparable across a set without any placement because every pose of a
fighter is drawn at one zoom.

| Pose | Criterion | Why |
|---|---|---|
| `attack_heavy_b` | The weapon or fist reaches **further forward than anything in that fighter's own `idle_a`, by at least a third of their standing height**. | Reach is measured off the art (`src/silhouette.js`). A heavy that does not extend is a fighter with short range. |
| `attack_light_b` | Extends past `idle_a` — less far than the heavy, but unmistakably out. | Same measurement. A light attack drawn inside the idle silhouette has no range at all. This is the most re-requested fault on the roster: rounds 11C, 13C and 14A are all this one thing. |
| `crouch_a` / `crouch_b` | The head drops **by at least a quarter of standing height**. Hips at heel height, thighs closer to horizontal than vertical. | Crouching lowers the hurtbox. A "crouch" with the same shoulder line as the idle is not one, and the player ducks nothing. |
| `idle_a` | A **plain, square-on standing stance** — arms in, weapon held close, nothing spread. | Hurtbox *width* is measured off the idle. A cape thrown wide or a deep three-quarter turn makes that fighter a broader target than intended. Measured across the roster, idle body width ran from 0.21 to 0.50 of standing height, which is drawing style rather than character — the engine currently trusts the measurement only 45% of the way to compensate. |

The idle carries one more consequence: **a fighter's whole sprite set is sized
against their idle** (`docs/character-heights.md`), so redrawing an idle rescales
everything else. Get it right the first time on a new character, and expect a
workbench pass on the whole set if it is ever redrawn.

---

## 4. The pose lines

36 poses, the same semantic set every fighter has (`SEMANTIC_ANIMS`,
`src/characters.js`). Combine each with the fighter's character block.

### Stance

| Pose | Pose line |
|---|---|
| `idle_a` | standing at rest, square on, weight even, guard low but ready, weapon held close to the body — a plain neutral stance with nothing spread wide |
| `idle_b` | the same stance a breath later, chest raised or lowered and one arm shifted slightly — the breathing beat, not a second pose |
| `guard` | braced behind a raised guard, both arms up and in, weight back, head tucked — absorbing rather than attacking |
| `charge` | gathering power on the spot, body coiled and still, energy building but not yet released |

### Movement

The run is **one continuous motion sampled four times** — same camera, same
distance, same figure scale, only the body moves.

| Pose | Pose line |
|---|---|
| `run_reach_a` | sprinting at full stride, torso leaning forward, RIGHT leg extended forward with the heel about to strike, left leg trailing fully behind, LEFT arm swung forward and right arm driven back, body at the lowest point of the stride |
| `run_pass_a` | mid-stride, upright moment of the sprint, legs crossing directly beneath the hips with the left knee driving through to the front, arms passing at the sides, body at the highest point of the stride |
| `run_reach_b` | the mirror of `run_reach_a`: LEFT leg extended forward, right leg trailing, RIGHT arm swung forward |
| `run_pass_b` | the mirror of `run_pass_a`: right knee driving through to the front |
| `dash` | sprinting flat out, body angled forward past the leading foot — a single committed running pose, distinct from the stride cycle |
| `jump_rise` | pushing up off the ground, legs still extending, arms rising, body stretched upward |
| `fall` | descending, legs gathered under the body, arms out for balance, head up |
| `land` | absorbing a landing, knees deeply bent, one hand near the floor — distinct from a crouch, which holds |
| `ledge_hang` | hanging by both hands raised overhead, fingers closed on **nothing** — the body straight below, feet dangling. **Do not draw the ledge.** The stage supplies the edge he is hanging from, so a painted ledge floats in front of the real platform (round 15A, `dagon/ledge_hang`) |
| `dodge_roll` | tucked into a tight roll, knees to chest, arms in, body compact and round — **drawn upright, head up.** The engine spins the sprite through the roll itself, so a pre-rotated drawing rotates twice |
| `dodge_air` | twisting aside in mid-air, body turned out of the line of the blow, limbs pulled in |

**Things that make or break the run cycle**, all learned in round 12B:

- **The lean is constant.** A sprinter's torso holds a steady forward lean
  through the whole cycle. One frame standing tall and the next diving makes the
  loop rock like a see-saw. Take the lean from the fighter's `dash`, dialled
  back, and hold it in all four.
- **Reach low, pass high.** The body genuinely sinks on the contact frames and
  rises on the crossing frames. The engine adds only *half* its usual procedural
  bob when cycle art is present, expecting the art to carry the rest.
- **Weapons ride, they do not flail.** A carried weapon stays in the same hand at
  the same size in all four frames, moving only as far as the arm swings it. The
  most common generator failure on this pose is the prop teleporting between
  hands.
- **Nothing airborne-looking.** Both feet floating with the body rising reads as
  a jump when looped. Toes may leave the ground on the pass frames; the pose has
  to read as *between* steps, not above them.
- **The reach frame reaches with the LEG.** The leading heel is the furthest
  thing forward; the arms only counterbalance it. Dagon's pair came back with
  the arm out in front and the legs under the body, which reads as lunging
  rather than running (round 15A).

### Attacks

| Pose | Pose line |
|---|---|
| `attack_light_a` | winding up a fast strike, striking hand or weapon drawn back beside the body, shoulders coiled away from the target, weight on the back foot, lead arm up as a guard |
| `attack_light_b` | the strike fully extended and travelling forward — arm or weapon at full reach out in front of the body, shoulders rotated through, weight transferred onto the front foot, the drawn-back hand recovered to the chest |
| `attack_heavy_a` | the wind-up of one committed heavy blow: weapon or fist drawn as far back as the body allows, hips loaded, front foot light |
| `attack_heavy_b` | that blow landing at full extension, hips driven through it, the whole body behind the strike and past its own centre of balance |
| `attack_air_a` | **wind-up, airborne.** Body coiled mid-jump, striking limb cocked, legs gathered |
| `attack_air_b` | **strike, airborne.** Fully extended through the aerial arc, legs trailing, committed |
| `attack_up` | striking upward overhead, body extended and rising with it |
| `attack_down` | striking downward at the ground in front, weight dropping onto it — a committed smash, not a drop |
| `crouch_a` | crouched down low, hips dropped to heel height, thighs closer to horizontal than vertical, back angled forward over the knees, head lowered to about chest height of their standing pose, guard up close to the body |
| `crouch_b` | the same low crouch, weight settled slightly further forward and the head a touch lower, arms shifted — the breathing beat of a held crouch, not a rise out of it |
| `crouch_attack_a` | crouched low as in `crouch_a`, hips at heel height, winding up a strike from that low position — weight loaded onto the back leg, striking hand or weapon drawn back near the floor, both feet planted |
| `crouch_attack_b` | the same low crouch, the strike now extended forward at ankle-to-knee height and travelling further in the direction `_a` was winding — hips rotated through, still down, head no higher than in `_a` |

**For an armed fighter the weapon leads.** The axe head, blade tip or claw is the
furthest thing forward in the frame and clear of the body silhouette. A strike
where the weapon stays inside the body line is the fault behind rounds 11C, 13C
and 14A, and it is the one that costs range in play.

**Hands close on the weapon.** Round 12A was largely one failure: grips that did
not read — fingers not wrapped, a naginata kinking where it crossed the body,
a blade passing through the hand. Draw the hand closed around the haft and the
weapon unbroken across the figure.

### Techniques

The fighter's own kit decides what these look like — the technique names are in
`src/characters.js` and on the in-game move list.

| Pose | Pose line |
|---|---|
| `special_neutral` | performing their **neutral special** — the named technique mid-execution, with its cursed energy forming but not yet released |
| `special_side` | their **side special**, moving forward into it |
| `special_down` | their **down special**, weight low, technique breaking out of the ground or the body |
| `ult_a` | the wind-up of their **ultimate**: gathering, energy at maximum, before release |
| `ult_b` | the release of that ultimate, arms and body fully committed |

**Do not draw the technique.** The projectile, the beam, the summoned creature
and the domain are separate effect sprites the engine composites — this pose is
the *fighter casting*, and art that includes the finished technique plays with
two of them on screen.

### Reaction

| Pose | Pose line |
|---|---|
| `hurt` | recoiling from a blow, head snapped back, body compressed, arms thrown out — struck, not falling |
| `dizzy` | stunned on their feet, guard down, body loose and swaying, head lolling |
| `prone` | flat on their back on the ground, arms out, legs dropped, head tilted — dazed but conscious, the beat after being run over. Drawn HORIZONTAL: the body lies along the ground plane, **feet toward the right edge of the frame** |
| `victory` | celebrating, weapon raised or arms up, weight tall and open |

`prone` is the one pose the placement tools cannot reason about: it lies along
the floor, so its ground contact really is the lowest pixel and the usual foot
rule would hover it. It is named in `NO_STANDING_FOOT` for exactly that reason
and its vertical position is set by eye. Drawing it head-**left**, feet-right is
what keeps the set consistent — five of the twenty-four on the roster are drawn
the other way round and read as sliding the wrong way when knocked down.

---

## 5. The faults that keep coming back

Each of these has cost at least one re-request. They are in rough order of how
often.

| Fault | Where it shows | Round(s) |
|---|---|---|
| **The strike does not extend** | `attack_light_b`, `attack_heavy_b`, `crouch_attack_b` | 11C, 13C, 14A |
| **The crouch is a standing fighting stance** | `crouch_a`, `crouch_b`, both `crouch_attack` frames | 12A, 13A, 13B |
| **The costume is a different reading of the character** | any pose, usually a whole sub-batch drawn in one sitting | 10, 12A, 13 |
| **Hands do not close on the weapon** | `attack_*`, `run_*` | 12A |
| **`_b` does not finish `_a`** | every pair | 12A, 13B |
| **The reach falls off the canvas** | `crouch_attack_b`, `attack_heavy_b` | 13 |
| **Figure scale drifts between poses** | worst between `idle_a` and `idle_b` | 9, 12B |
| **The technique is drawn into the pose** | `special_*`, `ult_*` | 12A |
| **A design element is silently dropped** | Mahoraga's karma wheel | 13 |
| **A whole cycle arrives as one contact-sheet plate** | `run_*` | 15A |
| **Scenery drawn into the pose** — a ledge, a floor, a wall | `ledge_hang` | 15A |
| **The reach frame reaches with the arm** | `run_reach_*` | 15A |

Two of these are worth stating as numbers rather than as complaints, because
that is the difference between a rule somebody reads and a rule somebody checks:
the heavy strike missed its third-of-height reach in **all three** sets round
15A delivered, and it was the *only* stated criterion any of them missed. The
crouches, the light pairs and the idles all landed. Whatever is written as a
measurement gets met; whatever is written as a sentence gets interpreted.

The Mahoraga entry has a cause worth naming: **Mahoraga was the only fighter with no
character block**, so his prompts carried no design text at all and the design
lived entirely in a reference image. That works when somebody opens the image and
fails silently when they do not. Every fighter has a block now, and a new
character needs one written *before* the first pose is asked for. A reference
image is not a substitute for the block; it is what the block is checked against.

---

## 6. Adding to this file

The workbench is where faults are found, and the flags carry the reason: a
`needsReplacement` note is one sentence about what is wrong with a drawing. When
a round's flags show the **same** fault on several fighters, that is a rule
missing from this file, not a run of bad luck — write it into §5 and, if it can
be measured, into §3. That is the whole mechanism by which the next set arrives
better than the last one, and it takes about five minutes at the end of a round.

Round intake already ends with "update the request docs"
([assets/intake/README.md](../assets/intake/README.md), step 7). Updating this
file is part of that step.

**Look at the review boards before importing, not after.** `tools/intake_sheets.py`
renders every delivered plate beside what it replaces, and it is the only step
that catches the faults no measurement will: round 15A's contact-sheet run frame
and its five backwards-mirrored poses were both found there, and both would have
been invisible in the numbers. A mirrored strike in particular still looks like
a perfectly good strike — it just lands behind the fighter.
