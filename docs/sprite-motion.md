# Sprite motion — making still frames move

## The problem this solves

Of the animation definitions in `src/characters.js`, most resolve to a **single
still frame**. `jump`, `fall`, `dash`, `hurt`, `dizzy`, `shield`, `ledge`,
`dodge_roll`, `dodge_air` and nearly every special are one image held for the
entire state. `idle` is two poses at 2.2 fps; `run` is a four-frame stride
cycle at 13 fps where the round-12 art has landed, and the old two-frame pair
at 10 fps everywhere it has not.

Drawn unchanged, that reads as static in exactly the moments that should have
the most life: a fighter launched across the stage was a rigid pose *sliding*,
a 0.42-second roll never rolled, and a projectile arced across the screen at a
fixed orientation like a sliding decal.

The fix is procedural: derive a draw-time transform from state the simulation
already keeps, so one frame can lean, tumble, breathe and swing. No new art.

**Everything here is draw-time only.** Hurtboxes and hitboxes are computed
independently in `combat.js` from the fighter's position, so none of it can
change what connects.

**Every number you would want to tweak lives in `src/config_tuning.js`** — amplitudes,
tumble thresholds, squash depth, trail length. Nothing in that file is
load-bearing; edit it freely without reading the code that consumes it.

## Where it lives

| File | Role |
|---|---|
| `src/config_tuning.js` | **every hand-tweakable value.** Start here |
| `src/motion.js` | `fighterTransform(f)` → `{rotation, scaleX, scaleY, offsetX, offsetY}` |
| `src/sprites.js` | anchors, and `drawCharFrame`'s transform support |
| `src/fighter.js` | `updatePresentation()` — steps spin, facing sweep, timers, trail |
| `src/combat.js` | sets `target.spin` on a launch past `TUMBLE_KB_MIN` |
| `src/render.js` | afterimages, the ledge hang, projectile aiming |

Presentation state (`spin`, `spinAngle`, `facingVis`, `landT`, `takeoffT`,
`trail`) lives on the fighter and is stepped on the **fixed 1/60 clock**, after
the hitlag early-return — so it stays deterministic and freezes with the rest
of the fighter during a hit freeze.

## What each state does

| State | Motion |
|---|---|
| Launched (kb > `TUMBLE_KB_MIN`) | tumbles, spin ∝ knockback, unwinds to upright before landing |
| Light hit | flinches away from the blow |
| Roll | a full turn over the action, out of one frame |
| Air dodge | tilts into the dodge and back |
| Airborne | leans into horizontal air speed; stretches into a fast fall |
| Dash / pivot | leans forward / back against the abandoned direction |
| Run | sways once per stride cycle, bobs once per footfall; the bob halves when the four-frame cycle art carries its own rise and fall |
| Idle, crouch | breathes — a slow sway and bob, phase-offset per fighter |
| Shield | trembles, harder as the shield is spent |
| Charging a smash | trembles and shifts, rising with charge |
| Attacks | winds back through startup, whips through active, settles over recovery |
| Landing / takeoff | a ~4% squash / stretch, anchored at the feet |
| Facing flip | sweeps the mirror through side-on over `TURN_TIME` |
| Dash, roll, tumble | afterimages, `TRAIL_LEN` samples deep |

Projectiles point along their velocity; summons sway with their hover and lean
into a lunge.

## Anchors

Rotation needs a pivot. A frame carries named anchor points in
`meta.anchors`, stored as `[x, y]` in the **source image's own pixels**,
measured from its top-left corner.

Image-local coordinates are the whole point. `ox` (horizontal placement),
`bodyBottom` (ground contact) and `renderScale` (size) all move or resize the
art; an anchor expressed this way rides along with it. Put one on a character's
navel and it stays on the navel however the frame is nudged afterwards.

| Anchor | Meaning |
|---|---|
| `com` | Centre of mass — the pivot every rotation turns about. Every frame has one. |
| `ledge` | The hand that grips the edge. The sprite is hung so this point lands on the platform corner. Only on frames used by the `ledge` state. |

An anchor that has never been placed still works: it reports a derived position
(for `com`, the fallback below; for `ledge`, `LEDGE_GRIP_Y_FRAC` down the art),
and the renderer uses it. Placing one by hand only refines it.

Adding another is an entry in `EXTRA_ANCHORS` (`src/sprites.js`) naming the
states that need it, plus the renderer call that reads it. The workbench builds
its editor from that table, so no UI work is required.

### Where the values come from

`tools/bake_anchors.py` measures each PNG's opaque-pixel centroid offline and
writes it in as `anchors.com`. The centroid is far better than any heuristic on
sprawled, crouched or mid-swing poses — exactly the ones that rotate most —
because it reads the actual pose rather than assuming an upright body.

It is not the whole answer, though, because a centroid assumes **uniform
density** and a human is not uniform. Legs are about a third of body mass but
occupy far more than a third of a standing silhouette's area, so the area
centroid is dragged down into the thighs, below the midsection a body really
pivots about. The script corrects for that with `COM_LIFT_FRAC`, raising the
measured point by 6.5% of the character's height.

That number is measured rather than chosen. Gojo's 28 hand-placed anchors —
dragged from the sprite's centre to his stomach, one pose at a time — are the
reference, and against them the lift halves the raw centroid's error (26 px RMS
against 55) and removes its bias entirely (+0.4 px against +41). It beat both a
flat anatomical fraction and every blend of the two, because the centroid still
carries the pose and a flat fraction throws that away. As a cross-check, the
hand-placed points sit at 0.570 ± 0.053 of body height above the feet, which is
the textbook figure for a standing human.

It measures state anchors too, where a rule can find them: the `ledge` grip is
the centroid of the topmost band of opaque pixels on a hang pose, which is the
raised hand. The `EXTRA` table in that script is where a new rule goes.

```
python3 tools/bake_anchors.py                 # every character, skip hand-placed
python3 tools/bake_anchors.py --only gojo     # one character
python3 tools/bake_anchors.py --force         # re-measure hand-placed anchors too
```

It **never overwrites a hand-placed anchor** without `--force`, so re-running it
after new art lands is safe. Run it whenever frames are added.

Note the flip side: because it skips frames that already carry an anchor, a
change to how the measurement works reaches existing art only under `--force`.
When `COM_LIFT_FRAC` was introduced, the 22 characters holding untouched raw
bakes were re-measured with `--force --only <those characters>`, and Gojo was
left out so his hand-placed values survived. Do the same for the next such
change: check which frames are still raw bakes before forcing anything.

The runtime fallback in `defaultCom` only applies to frames the bake hasn't
reached. It must stay in image pixels: `ox`, `oy`, `bodyBottom` and `centroidX`
are, but **`bodyH` is not** — it is a rendered height used for head-height
comparison, and mixing it in put the pivot hundreds of pixels too low.

## Editing anchors

**Sprite workbench** (`workbench/`) — pick an anchor under *Anchors*, and its
handle appears on the sprite. Drag it on the canvas, nudge it with the arrow
keys or the buttons, or *Reset this anchor* to go back to the measured value.
**Spin preview** rotates the pose about
its centre of mass exactly as the game does: a pivot in the wrong place makes
the body orbit instead of turn, which is instantly obvious.

**Action workbench** (`workbench/?edit=actions`) — *Procedural motion* runs the
real `motion.js` against the fighter state each action implies, so the tumble on
Hurt, the roll on Roll and the swing arc on attacks all play as they do in a
match. *Centre of mass* overlays the pivot.

Both export through the existing flow: **Export all adjustments** →
`tools/apply_sprite_adjustments.py`, which merges anchors per name so exporting
one never drops another. The button downloads the JSON as a file named after
what is in it — `gojo-adjustments.json`, or `roster-adjustments.json` when the
session touched several characters — and also leaves it in the textarea to read
or copy. Nothing is downloaded when nothing has been edited.

## Finding your way around the workbench

Every control's explanation lives on its **title**, as a hover bubble — the
titles that have one carry a small `?`. They used to be paragraphs underneath
each control, which meant a page of prose between you and the slider you wanted;
moving them out took ~350px off the panel. `workbench/tooltip.js` owns this: put
`data-help` on a label and it is wired automatically, including on controls that
are rebuilt as the selection changes.

## Two workbench behaviours worth knowing

**Facing is the game's.** The canvas draws each pose exactly as a match does,
including the mirror applied to art drawn facing left. `nativeLeft` in the
manifest seeded which frames those are, by guess; the **Mirror this pose**
checkbox is the per-frame override, it wins over the list, and it exports with
everything else. Turning a mirror *off* is meaningful and is stored as
`faceLeft: false` rather than by deleting the key.

**Two independent questions get asked about a pose, and they must not be
confused.** Mixing them is a bug that has already been shipped once, so it has
its own regression test (`tools/smoke_workbench.mjs`).

| | question | shows up as | changes when |
|---|---|---|---|
| **Saved state** | had this pose already been dealt with *before the page loaded*? | which view it appears in | you apply an export and reload |
| **Session state** | has it changed *since the page loaded*? | the yellow dot | you edit it |

So the pose list is a **work list that holds still while you work**. Editing a
pose — including flagging its art as needing replacement — never moves it
between views; it only picks up a dot. It leaves the to-do list once your export
has been applied to the manifest and the page reloaded, and not before. Reading
the live manifest to answer the first question is what broke this: the workbench
mutates that object in place, so an in-session flag looked like a committed one
and the pose vanished the instant it was marked.

**The pose list is filtered.** *No saved edits (to do)* — the default — shows the
poses the game draws that nobody has committed an adjustment for yet, so a pass
through a character does not keep re-presenting work already done. *Has saved
edits (done)* is the other half, *Used in game* drops the filter entirely, and
*All* adds the sheet cells the game never draws (the list otherwise shows only
frames an animation names, plus `r0c0`, which `render.js` draws for the respawn
platform).

**The filter never limits what an edit reaches.** Export, the change count and
*Reset character* all read every frame of the character, not the ones the view
happens to show — otherwise switching views would silently drop work from an
export, or leave some behind on a reset.

**Airborne-only poses have no ground contact.** A frame used only by `jump`,
`fall`, `ledge`, `dodge_air` or `airLight` never touches the floor, so the
control is locked — it keeps the detected value. The ground line, platform and
idle ghost stay on screen as a size reference. `AIRBORNE_STATES` in
`src/sprites.js` is the list.

## Tuning

All of it is in `src/config_tuning.js`:

- **Tumble too much / too little** — `TUMBLE_SPIN_PER_KB`, `TUMBLE_KB_MIN`,
  `TUMBLE_SPIN_MAX`.
- **Squash & stretch** — `SQUASH` is the master dial (0 disables, 0.5 halves),
  then `SQUASH_DEPTH` per effect.
- **Leans, sway, breathing, swing arcs** — the `MOTION` table.
- **Afterimages** — `TRAIL_LEN`, `TRAIL_STEP`, `TRAIL_ALPHA`, `TRAIL_STRENGTH`.
- **Anchor fallbacks** — `COM_BODY_FRAC`, `LEDGE_GRIP_Y_FRAC`.

Three files are meant for hand editing, and the split is deliberate:

| File | Holds | Affects |
|---|---|---|
| `src/config_menus.js` | roster grouping, every player-facing string | nothing mechanical |
| `src/config_tuning.js` | motion, tumble, squash, trails, DI, move staling | how it feels |
| `src/constants.js` | gravity, jump height, shield economy, blast zones | what the game is |
