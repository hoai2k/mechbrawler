# Asset Requests — history

Record of every art round that has been **delivered and integrated**. Open
requests live in [asset-requests.md](asset-requests.md); nothing in this file
is outstanding.

Round numbers are kept as written at the time so older commits, code comments
and review boards that cite "round 5 art" or "round-6 redesign" still resolve.
Rounds 7 and 8 were requested in parallel and delivered out of order, which is
why the numbering is not strictly chronological.

| Round | Scope | Outcome |
|---|---|---|
| 1–3 | Original 17 sprite sheets, extraction and first corrections | Delivered |
| 2 | Character-wide design splits: Sukuna's shawl, Panda's accessory | Delivered |
| 4 | Outfit consistency + pose correctness (crouch rows especially) | Delivered |
| 5 | Quality pass: 14 semantic poses × 17 fighters (238 sprites) | Delivered |
| 6 | Replacements for clipped/truncated sheet cells; Hanami redesign | Delivered |
| 7 | Six new fighters: Choso, Mei Mei, Uro, Yuji, Reggie, Gakuganji | Delivered |
| 8 | Summon minion art (Geto, Mahito, Toji) | Delivered |
| 9 | Cards, technique frames, domains, stage props, three redrawn fighters, Mahito's re-key, Mahoraga (166 assets) | Delivered |
| 10 | One sprite per action for the sheet-era fighters — Gojo, Mahito, Nobara, Yuta (72 sprites) | Delivered in part; the rest is round 11 |
| 11 | Mahoraga redrawn from canon, the semantic sets finished for the last 13 fighters, wind-up/strike pairs for the round-7 six (280 sprites) | Delivered — **every fighter now has one sprite per action** |
| 12A | Workbench catches: poses that failed once placed at real size (33 sprites) | Delivered — all 33, in three batches |
| 12B/12C | The four-frame run cycle and the `prone` pose, roster-wide (120 sprites) | Delivered — all 24 fighters |
| 12D | Three install auras | Never delivered; moved to round 13 as 13E |
| 13 | Roster-wide sweep of the attack and crouch rows, plus the three install auras (44 sprites) | Delivered — the first round to land through the approval step |
| 18E | Twenty stage backgrounds repainted at 3200×1800 for the 3D camera (20 images) | Delivered ahead of the rest of round 18 |
| 15A (part), 15B, 15D (part) | Three of the four new fighters — Mechamaru, Yuki Tsukumo and Dagon — with all nine technique effects and three hero cards (120 assets) | Delivered — Kurourushi's set, the summons and Dagon's domain backdrop stay open |
| 14 | Heavy strike frames that extend, a consistent idle stance, and five workbench catches (41 sprites) | Delivered in two batches — the first was approved pose by pose and the rejections answered by the second |
| 15 | Four new fighters, nine technique effects, four summon minions, four hero cards and a domain backdrop (129 assets) | Delivered — Kurourushi's set closes it |
| 16 | Six-pose animation sets for seventeen summoned creatures (102 sprites) | Delivered — every creature in the pools now animates |
| 17 | Hanami redrawn to canon, Mahoraga's three poses, two round-13 catches, Hanami's hero card and a simplified roster tile for all 27 fighters (41 sprites, 28 images) | Delivered |
| 20B | Twenty backgrounds re-extended from the paintings 18E replaced (20 images) | Delivered — the composition taken back, the resolution kept |
| 18 | The audit round: workbench catches from four placement passes, poses drawing somebody else's art, two Uro alternates, and fourteen near-field cards for the 3D camera (28 sprites, 14 images) | Delivered complete in one batch; the Uro alternates were discarded on review |
| 20A | The forty-four summon plates that shipped as contact sheets of six creatures, redrawn as one figure each (44 sprites) | Delivered — every plate in the tree passes `check_summon_plates.py`, and the seven authored hit boxes came out with them |
| 20C | The grab set — `grab_reach`, `grab_hold`, `grabbed` — for the `?throw=true` mechanic (81 sprites asked, 78 + Mahoraga delivered) | Delivered for 26 fighters; Yuji's three are 20E |
| 20D | The dash attack pose, one drawing serving both running attacks (27 sprites asked, 26 + Mahoraga delivered) | Delivered for 26 fighters; Yuji's is 20E |

---

## Rounds 1–3 — the original sheets

Seventeen 1254×1568 character sheets on a 4×5 grid (cell ≈ 313.5×313.6 px;
rows: idle / run / air / techniques / crouch). `tools/extract_sprites.py`
rebuilt these into per-frame trimmed PNGs with connected-component labelling,
majority-cell assignment and per-frame anchors. The full rationale is in
[asset-pipeline.md](../sprites/docs/asset-pipeline.md) and is still the authority on how the
sheet era works.

## Round 2 — character-wide design splits

Two cases where a character's art disagreed with *itself* across enough frames
that the fix was a design decision rather than a correction:

- **Sukuna's shoulder shawl** — present in some rows, absent in others. Resolved
  by removing it across rows 0–3 so the bare-chested design is uniform.
- **Panda's accessory** — the teal cursed-energy core moved or vanished between
  frames. Unified across all 20 frames.

## Round 4 — outfit consistency and pose correctness

The audit that produced this round found characters changing costume when they
crouched. All seven affected crouch rows were regenerated so the costume
matches standing (verified at the time in `tools/debug/round4_check.png`).

It also carried a **"free fixes, no art needed"** section: roughly fourteen
`src/characters.js` frame-mapping corrections where the right art already
existed but the wrong cell was wired up (Gojo's ultimate showing red instead of
purple, Geto's side-heavy showing a chain he does not use, jab chains leading
with a stance frame instead of a strike). Those were applied in code.

## Round 5 — the quality pass

The measured problem: sheet frames gave a character body of **256–296 px**
while generated art gave **674–700 px**, and the game draws a fighter ~230 px
tall — so sheet frames ran at roughly 1:1 with no headroom and looked soft.
221 of 340 frames were under 260 px. Separately, seven animation states had no
art at all and borrowed an unrelated frame (`shield` drew idle, `upHeavy` drew
the jump frame, `dizzy` drew hurt).

**Delivered: 238/238 sprites** — 14 semantic poses (Tier 1 + Tier 2) for all 17
fighters. This is the round that replaced `r{row}c{col}` grid names with
semantic pose keys (`idle_a`, `guard`, `attack_up`, …) for the states it
covered. Tier 3 was never generated; those states still resolve to grid cells.

Two things this round established that still hold:

- **Green keying leaves a halo.** The art arrived keyed off green, which left a
  green fringe on every soft edge — hair worst — on 205 frames. Repaired
  in-place with `clean_frames.py --defringe`. Magenta `#FF00FF` has been the
  standard key ever since, with mid-grey `#808080` for warm-palette characters
  (Sukuna, Nobara, Momo, Hakari, and later Yuji and Choso).
- **`bodyH` is not a size control.** Every pose is generated to fill its canvas,
  so raw bbox height is near-identical across poses and rendered size is driven
  entirely by the hand-set `bodyH` target. `ledge_hang` shipped at ~53% of idle
  and rendered as a tiny figure on all 17 characters before this was understood.

## Round 6 — clipped cells and the intake pipeline

Frames where the source art was physically cut off — either running off the
cell edge or drawn already cropped (Gojo's hair sliced flat across the skull,
Yuta's entire technique row cut at the top). Review found that detecting a
clipped pose from geometry alone does not work: of 83 candidates flagged by
tooling, only 8 were genuinely cut off.

This round also introduced:

- the **intake pipeline** (`tools/intake.py` → `intake_sheets.py` →
  `intake_import.py`), so a delivery is checked before it reaches the game;
- **alternate sprite sets** (`manifest.alternates`), first and only used for
  Hanami's redesign — 8 frames, opted into via Settings → Sprites. Removed
  after round 17A redrew him to canon; the frames are archived at
  [`assets/reference/hanami_alt/`](../assets/reference/hanami_alt/);
- `dodge_roll` / `dodge_air` art, initially for 8 of 17 characters and later
  completed for all 17.

## Round 7 — six new fighters

Choso, Mei Mei, Uro, Yuji, Reggie Star and Gakuganji. Per fighter: 1 hero card,
31 poses, and 1–6 technique effect sprites — **210 images**, all delivered.

Their kits, mechanics, AI profiles and audio were built and verified in code
*before* any art existed, behind a `STAGED_CHARACTER_KEYS` list that kept them
out of character select and out of `randomCharacterKey()`. Shipping each one
was then a matter of importing sprites, dropping the card, and moving the key
into a `CHARACTER_GROUPS` bucket in `src/config.js`.

These six have **no sprite sheet at all** — every animation state maps to a
semantic pose key via `SEMANTIC_ANIMS` in `src/characters.js`.

### Lessons this round produced

- **Art arrives raw.** Every delivery came as untrimmed RGB plates on a grey or
  magenta field with no alpha channel. That is expected; it just has to go
  through `tools/intake.py` before reaching `sprites/assets/`. Uploading raw
  plates directly into `sprites/assets/<char>/` makes the game try to draw a
  1024×1536 background as a sprite. This is why deliveries now go to
  `assets/intake/` — see that directory's README.
- **A brand-new character has no frame to inherit placement from.**
  `intake_import.py` falls back to a blind `renderScale` of 0.25 in that case,
  which rendered Choso ~17% oversized. Anchor `idle_a` to the roster's idle
  `bodyH` band (282–299) first, then import the rest so they inherit it.
- **Draw every pose at the same zoom.** Uro's `idle_b` came back ~15% larger
  than `idle_a` — same standing pose, just bigger. Idle alternates between
  those two frames at 2.2 fps, so she visibly pulsed while standing still.
  Corrected with a per-frame `renderScale`. Only catchable by eye.
- **Directional effect art must point LEFT.** The projectile renderer mirrors a
  sprite when it travels right (`src/render.js`), so art drawn pointing right
  flies backwards, blunt end leading. `piercing_blood` and `crow_flock` both
  arrived pointing right and were flipped on import. `chain` and `crow` are the
  correct references. **Exception:** Reggie's `cardrop` ultimate uses the
  opposite convention (`scale(dir > 0 ? 1 : -1)`), so `sedan.png` correctly
  points right.
- **Effects need keying too**, with the same routine as character art, then
  `tools/prep_effects.py` to trim and downscale.
- **Watch the spelling of directory names.** Gakuganji's art arrived in
  `sprites/assets/gakuganjii/` (double "i"); the character key, his card and
  the wiki are all `gakuganji`. Renamed on import.

## Round 8 — summon minions

Dedicated art for the three persistent minions that were running on placeholder
effect sprites: Geto's **Rainbow Dragon**, Mahito's **transfigured human**, and
Toji's **inventory curse**. Delivered, plus higher-resolution regenerations of
both Divine Dogs.

> **Summons bypass the intake pipeline.** The five files arrived with the
> magenta background baked in and no alpha, so each drew as a solid magenta
> rectangle on stage. Files dropped straight into `assets/sprites/summons/` skip
> `tools/intake.py`, so they need the key run over them explicitly:
>
> ```sh
> cd tools && python3 -c "
> from pathlib import Path
> from process_round5_sprites import key_image
> for n in ['rainbow_dragon','transfigured_human','inventory_curse',
>           'divine_dog_white','divine_dog_black']:
>     p = Path('../assets/sprites/summons')/f'{n}.png'; key_image(p, p)"
> ```
>
> Delivering summons into `assets/intake/summons/` instead avoids this.

## Round 9 — accuracy, polish, and three wrong characters

Seven independent parts, all delivered.

**9A — the 17 original hero cards.** The select screen was two styles side by
side; regenerated so it is one. A later variation pass took it to 20 of the 23,
with the uniform originals archived. Previous card art is kept at
`assets/reference/cards_previous/` so any of them can be put back.

**9B — ten technique frames that showed the wrong move.** Maki's neutral special
played her *dash* frame; Geto's played a generic cell. All ten landed, and each
one is pointed at in `src/characters.js` — art alone would have changed nothing,
since the animation table decides which sprite a technique draws.

**9C — seven Domain Expansion backgrounds.** Loaded through `optional()`, so
until they arrived the domain simply dimmed the stage. Their absence was also
what had been failing `tools/smoke_stages.mjs`: 20 boards passed while the run
exited 1 on eleven 404s.

**9D — four stage-hazard props.** The other half of those 404s. Keyed, trimmed
to 700 px and de-fringed on import.

**9E — Gakuganji, Reggie and Uro redrawn from the anime.** Round 7 built these
three from written character blocks nobody checked against the show, so all
three shipped as *a different person*: Gakuganji in a plain black robe with no
guitar, Reggie in a bomber jacket instead of a tunic of torn receipts, Uro with
a black bob instead of violet flame-like hair. 93 poses and 3 cards. The blocks
in the open request were rewritten from the references at the same time, so the
error cannot be regenerated from the doc.

**9F — Mahito's 16 poses re-keyed.** His art was never the problem; the key
screen was, and his set carried residue from two different screens at once.
Magenta fringe across the redelivered poses went 9,159 → 8 and green 5,597 → 5.

**9G — Mahoraga's 31 poses.** Delivered and integrated as an actor rather than a
fighter — nobody selects him, and Megumi's ultimate wears him. The set is
superseded by round 11A, which redraws him from the shikigami's canon design;
what survives from 9G is the pipeline work around it, including the karma wheel
being cut out into `effect:mahoraga_wheel` so it hangs level while he tumbles.

---

## Round 10 — one sprite per action, four fighters in

The seventeen original fighters ran on 4×5 sprite sheets where **one cell serves
several actions at once**: `r4c0` is both crouch and land for everybody, and
`r3c0` covers twelve different combinations across the roster. No amount of
re-pointing fixes that, because there is no fourth sprite to point at.

**Delivered: Gojo, Mahito, Nobara and Yuta**, 18 poses each — 72 newly generated
sprites, plus Nobara reusing the neutral special 9B had already produced. Each of
the four now has one drawing per action.

Two spec sections written for this round outlived it and moved into the open
request rather than here, because they govern every round that follows: **the
canonical reference image** (one `idle_a` per fighter, with a matched-scale
roster sheet), and the **wind-up/strike pair** that replaced the single-frame
heavy and aerial.

**The thirteen fighters this round did not reach became round 11B**, and its
seven-cell clipping list (10D) went with them — every one of those cells belongs
to a pose 11B redraws.

---

## Closed audits

**Missing-sprites audit.** Checked every image the game asks for against what
is in the repo: all 707 asset paths the loader builds, plus a headless browser
pass recording console output and any HTTP response ≥ 400. Result at the time:
nothing 404'd, but 18 sprites were missing as *art* — `dodge_roll` and
`dodge_air` for 9 of 17 characters, which silently fell back to the sprint
frame, so those fighters looked like they were running on the spot mid-roll.
**Closed:** all 23 fighters now have both frames.

The same audit's secondary finding — specials that resolve to a generic grid
cell rather than art of the actual technique — was round 9B for the ten worst
cases and is otherwise round 11B.

**Summoning system worklog.** The persistent-minion system (`src/summons.js`)
for Megumi, Geto, Mahito and Toji. Feature complete and merged; its art was
round 8.

---

# Round 21 — the walk cycle

**Delivered complete: 54 sprites, `walk_a` and `walk_b` for all twenty-seven.**
Keyed and measured through `tools/intake.py` (one frame arrived facing left and
was mirrored), imported, anchored, auto-tuned and given a seeded pose read
apiece. They are BRAND-NEW pose keys, so nothing was replaced and nothing waits
in the approval queue — every fighter draws its own walk the moment it loads,
where before they all replayed the run cycle at a walking cadence.

**Sprite round only, by design.** The 3D and 2.5D renderers play a hand-authored
four-phase cycle (`render3d/src/walk_cycle.js`) and ignore `walk_a`/`walk_b`
entirely; the reasoning is kept in full below. Nothing in 3D changed.

**One fighter's pair is worth a second look.** Maki's naginata is carried
blade-down-and-forward in `walk_a` and blade-up-and-back in `walk_b`, so the
weapon turns over once per stride. Every other armed fighter carries theirs the
same way in both frames — Gakuganji's guitar is the check — so this is hers
alone rather than a fault in the brief. It landed with the rest because the
alternative is her old fallback, which is the run cycle at half speed, and a
walk that carries its weapon oddly still reads better than a jog that does not
walk. A redraw of the two frames would settle it.

**The request, as written**

- **21A** — a walk cycle for every fighter (54 sprites)

**54 sprites, none of it blocking.** Every fighter walks today; the pose they
walk in is their run cycle replayed at a walking cadence, which is exactly what
they drew before the walk existed.

## 21A. A walk cycle for every fighter — 54 sprites

### Why

**The game grew a walk and has nothing to draw it with.** Ground movement used
to be one speed: `dirX` was ±1 past a deadzone, so any input accelerated to the
same run. It is analog now — a partial stick tilt walks at 34–62% of run speed,
scaled by how far it is pushed, and a full tilt or a flick runs, which is how
Smash has always done it ([SmashWiki](https://www.ssbwiki.com/Walk)).

That was not a cosmetic addition. It is what makes the **ledge brake** possible:
a fighter walking into the lip of a platform stops there and will not step off
until the stick is pushed to a run — Smash's teeter
([SmashWiki](https://www.ssbwiki.com/Teeter)) — and a teeter needs a walk to
protect. Both are in `docs/game-mechanics.md § 2`.

So there is a new movement state with real presence in play, and no art. It
currently borrows the run.

### What is already wired

**Nothing is blocked and nothing needs a code change when this lands.** `walk`
is a state on both renderers already, falling back the way the round-20C grab
set did:

- **Sprites** — `WALK_ANIM` in `src/characters.js` names `walk_a` / `walk_b` and
  falls back to the four-frame run cycle (then the old `run_a`/`run_b` pair) at
  a walking cadence. A fighter who has the pair never plays the fallback.
- **3D** — `walk` is a state in `render3d/src/states.js`, aliased to the run
  clip. No rig owes a new clip today. See the note below on when it should.
- **Cadence** — the stride now plays at the speed the fighter is actually
  travelling (`strideRate`, `src/fighter.js`), so a walk does not skate and
  neither does anyone snared or slowed.

Delivery therefore upgrades the roster fighter by fighter, in any order.

### The brief

**Two contacts, not four.** The run is a four-frame cycle (reach and pass on
each leg) because a sprint needs the extension. A walk reads at half the cadence
and half the extension, and two frames is what the roster's other held cycles —
idle, crouch — use for the same reason.

`walk_a` and `walk_b` are **the same walk half a cycle apart**: opposite legs
leading, mirrored in gait but NOT mirrored as images — each is drawn facing
right, with the costume on its correct side, exactly as `run_reach_a` and
`run_reach_b` are.

| File | Pose line |
|---|---|
| `assets/intake/<char>/walk_a.png` | "walking at an unhurried pace, RIGHT leg forward and the heel just making contact, left leg trailing straight behind, arms swinging naturally in opposition — left arm forward — torso upright and relaxed, no lean" |
| `assets/intake/<char>/walk_b.png` | "the same unhurried walk half a stride later, LEFT leg forward and the heel just making contact, right leg trailing straight behind, arms swinging in opposition — right arm forward — torso upright and relaxed, no lean" |

What separates these from the run poses, and the thing most likely to come back
wrong:

- **Upright, not driving.** A run leans into the direction of travel and throws
  its weight ahead of the leading foot. A walk carries the torso vertically over
  the hips. If the pose would read as a slow run, it is the wrong pose.
- **A short stride.** Feet roughly shoulder-width apart at contact, not the
  full split of `run_reach_*`. Both feet stay near the ground; a walk has no
  airborne phase at all, which is the definition of one.
- **Relaxed arms.** Swinging from the shoulder in opposition to the legs, elbows
  soft and near the body — not the pumped, high-elbow carriage of the run.
- **Weapons carried, not readied.** A fighter who runs with a weapon up should
  walk with it lowered or shouldered. This is the calm approach, not the charge.

Otherwise the standard spec: the character's own key screen colour, facing
right, one zoom matched to their own `idle_a`, at least 600 px of body, one
subject per file. Character blocks and canonical references are above;
[pose-brief.md](../sprites/docs/pose-brief.md) is the standing brief.

### The 3D gaits are already authored, and ignore these

**The 3D and 2.5D renderers do not use `walk_a`/`walk_b` and will not.** They
play a hand-authored four-phase cycle instead — `render3d/src/walk_cycle.js` —
and that is a deliberate divergence rather than an interim.

The reason is the cost of a pose. In 2D a pose is a drawing, so two contacts is
the right ask; in 3D a pose is eight joint angles, so the phases a sheet cannot
afford are free. A rig interpolated between two contacts scissors its legs
through each other with the knees straight and the hips never rising — the
DOWN and PASSING positions are what make a walk read as carrying weight, and
they are exactly the two frames a two-frame sheet leaves out.

So this round is a sprite round only, and delivery changes nothing in 3D. The
note above about raising a D- or B-numbered round does not apply: it was
written before the cycle existed and the cycle is the answer to it.

The RUN is now the same, for the same reason: the four-frame sprint cycle is a
reach and a pass, mirrored, and `render3d/src/run_cycle.js` plays contact, down,
passing and up instead. The sprite path keeps both sets of drawings; the rigs
read neither gait off the sheet.

---

# Round 11 — delivered

Three parts; any can be delivered on its own.

- ~~**11A** — redraw Mahoraga from the shikigami's canon design~~ **delivered** (33 sprites)
- **11B** — finish the semantic sets for Toji, the last fighter on sheet cells (18 sprites)
- **11C** — wind-up/strike pairs for the 6 round-7 fighters (24 sprites)
- **11D** — one improvement request: Reggie's crouch attack does not read as the action (1 sprite)

**43 sprites left.** 11B is nearly done — **Toji is the last fighter still
playing a sprint frame for a punch.** 11C is the
smallest and finishes a transition already made everywhere else.

**11A is done** — Mahoraga arrived as the canon shikigami, all 33 poses, and is
integrated. **Twelve of the thirteen are done in 11B**; only Toji is left. Their sections below are struck through rather
than deleted, so a delivery citing "11A" still resolves; the full record moves to
the history file when the round closes.

Deliver **one complete fighter at a time** rather than one pose across everybody.
A fighter whose set is finished can be re-pointed and played immediately; a pose
spread across the roster leaves everyone half-converted.

---

## ~~11A. Redraw Mahoraga from the shikigami's canon design~~ — DELIVERED

**Delivered and integrated.** All 33 poses arrived as the canon shikigami —
covered face with white plates, brass eight-spoke wheel, chain necklace, tattered
skirt with the violet sash, bone sword. The `needsReplacement` flags are cleared
and the poses are in the workbench's "All Recently Updated" list waiting to be
placed.

**One change came out of the delivery: the karma wheel is no longer a separate
prop.** The round-9 art drew it as a large black halo floating detached above his
head, which is why it had to be cut out and composited — a wheel that hangs in
the air must not tumble when he rolls. The canon design mounts it ON the
headdress, small and brass, and a wheel that is part of the head *should* turn
with the head. So it is drawn into all 33 poses, `SPRITE_ACTORS.mahoraga` no
longer declares a `prop`, and `effect:mahoraga_wheel` is kept but unloaded.

The original request follows, for the record.

### The original request — 31 sprites

### Why

Megumi's ultimate now TRANSFORMS him into Mahoraga — he wears the shikigami and
the player drives it, rather than watching one walk around beside him
(`src/config_transform.js`). That puts all 31 poses on screen as a playable
body, which is a much harder test than a summon walking past, and the round-9
set does not survive it: **it is not the shikigami's design.**

Set the delivered `idle_a` beside the canon image and the disagreements are not
details:

| | Canon | Round-9 delivery |
|---|---|---|
| Head | Face fully covered, white blade-like plates sweeping back from it | Open face with three visible eyes |
| Hair | None — plates and a long white tail | Heavy black mane over the shoulders |
| Wheel | **Brass/gold**, eight spokes with ball finials, sitting close behind the head | **Black**, floating detached well above the head |
| Body | Chalk white, chain-and-tassel necklace at the collar | Chalk white, no necklace |
| Dress | Dark tattered skirt, violet sash, violet wrist and ankle wraps | Dark hakama, beige wraps |
| Weapon | Huge bone/stone sword | None |

All 31 poses are flagged `needsReplacement: "replace"` in the manifest, so
`python3 tools/list_replacements.py --markdown` lists them and intake clears the
flags when the new art lands.

### The canon reference

```
assets/reference/canon/mahoraga_canon.png
```

That is the full-body shikigami render the game already ships as
`summons/mahoraga.png`. **It is the authority for the design** — head, wheel,
necklace, skirt, wraps, tail, sword. It is a standing three-quarter pose, so it
answers *what he looks like*, not what each action looks like; the poses come
from the list below.

This is the same relationship 10B sets up for the roster, with one difference:
Mahoraga's canon is this render rather than an `idle_a`, because his existing
`idle_a` is the thing being replaced.

### What to deliver

The full transform set — the poses every round-7 fighter has, since a
transform draws from all of them and a missing one leaves a hole mid-fight:

| | Poses |
|---|---|
| **Stance** | `idle_a`, `idle_b`, `crouch_a`, `crouch_b`, `guard`, `dizzy`, `victory` |
| **Movement** | `run_reach_a`, `run_pass_a`, `run_reach_b`, `run_pass_b`, `dash`, `jump_rise`, `fall`, `land`, `ledge_hang`, `dodge_roll`, `dodge_air` |
| **Attacks** | `attack_light_a`, `attack_light_b`, `attack_heavy_a` + `attack_heavy_b`, `attack_up`, `attack_down`, `attack_air_a` + `attack_air_b`, `crouch_attack_a`, `crouch_attack_b`, `charge` |
| **Techniques** | `special_neutral`, `special_side`, `special_down`, `ult_a`, `ult_b` |
| **Reaction** | `hurt` |

Pose lines are in **10A**; the wind-up/strike pairs are **10C**; the four run
poses are the round-12 cycle, with pose lines in **12B**. Note the attack list
uses the `_a`/`_b` pairs rather than the single `attack_heavy` the round-9 set
delivered, and the run list is the four-frame cycle rather than the old
`run_a`/`run_b` pair — Mahoraga is being redrawn from scratch, so there is no
reason to deliver a superseded shape. (The readiness check in
`src/ultimates.js` accepts the cycle in place of the pair.)

### Two things specific to him

**Draw the wheel INTO the pose, at the right size and place, but expect it to be
cut out.** The karma wheel is composited separately at runtime
(`effect:mahoraga_wheel`) precisely so it hangs level while he tumbles — a wheel
painted into every pose rolled with his body on a dodge, which is the opposite
of what it is for. Drawing it in keeps the poses readable and gives the intake
something to measure against; it gets lifted the same way Geto's curses were
(`tools/recut_curses.py` is the model).

**He is enormous, and that is the point.** `heightCm: 260` against a roster
averaging ~175, and `scale: 0.95` on top. Draw him at the same *figure scale* as
everyone else — body ~290 px on the plate, per the delivery spec — and let the
engine do the enlarging. Compensating by drawing him bigger on the plate would
stack with the height solve and put his head off the top of the screen.

### Delivery

```
assets/intake/mahoraga/<pose_key>.png
```

Standard spec at the top of this file. He is chalk-white against a dark
skirt, so **key on magenta `#FF00FF`** — a grey screen would fight the body.

---

## 11B. Finish the semantic sets — 18 sprites, Toji only

This is round 10A, carried forward with every fighter it has finished removed
from it. Gojo, Mahito, Nobara and Yuta got there in round 10, and **Geto (15
poses), Hakari (17), Hanami (16), Inumaki (18), Jogo (17), Maki (17), Megumi
(17), Momo (18), Nanami (18), Panda (18), Sukuna (18) and Todo (18) have since
been delivered and integrated** — all twelve are re-pointed and off this list.
**Toji alone** still runs on **4×5 sprite sheet cells** named `r{row}c{col}`, where one
cell has to serve several actions at once.

The problem was never the naming. It is that a sprint pose is what plays when
Maki throws a punch, and a crouch is what plays when anyone lands — and no amount
of re-pointing fixes it, because there is no fourth sprite to point at.

### What is missing, per fighter

Counts differ because round 9B already delivered some of the technique frames.
**On-disk filenames are the resume authority** — anything already in
`sprites/assets/<char>/` is done, whatever a total elsewhere says.

| Fighter | Key | Missing | Poses |
|---|---|---|---|
| ~~Suguru Geto~~ | `geto` | ~~15~~ | **Delivered and integrated** — re-pointed to the semantic table, sheet cells retired |
| ~~Kinji Hakari~~ | `hakari` | ~~17~~ | **Delivered and integrated** — re-pointed to the semantic table, sheet cells retired |
| ~~Hanami~~ | `hanami` | ~~16~~ | **Delivered and integrated** — re-pointed to the semantic table, sheet cells retired |
| ~~Toge Inumaki~~ | `inumaki` | ~~18~~ | **Delivered and integrated** — re-pointed to the semantic table, sheet cells retired |
| ~~Jogo~~ | `jogo` | ~~17~~ | **Delivered and integrated** — re-pointed to the semantic table, sheet cells retired |
| ~~Maki Zen'in~~ | `maki` | ~~17~~ | **Delivered and integrated** — re-pointed to the semantic table, sheet cells retired |
| ~~Megumi Fushiguro~~ | `megumi` | ~~17~~ | **Delivered and integrated** — re-pointed to the semantic table, sheet cells retired |
| ~~Momo Nishimiya~~ | `momo` | ~~18~~ | **Delivered and integrated** — re-pointed to the semantic table, sheet cells retired |
| ~~Kento Nanami~~ | `nanami` | ~~18~~ | **Delivered and integrated** — re-pointed to the semantic table, sheet cells retired |
| ~~Panda~~ | `panda` | ~~18~~ | **Delivered and integrated** — re-pointed to the semantic table, sheet cells retired |
| ~~Ryomen Sukuna~~ | `sukuna` | ~~18~~ | **Delivered and integrated** — re-pointed to the semantic table, sheet cells retired |
| ~~Aoi Todo~~ | `todo` | ~~18~~ | **Delivered and integrated** — re-pointed to the semantic table, sheet cells retired |
| Toji Fushiguro | `toji` | 18 | `attack_light_a` `attack_light_b` `attack_heavy_a` `attack_heavy_b` `attack_down` `attack_air_a` `attack_air_b` `special_neutral` `special_side` `special_down` `ult_a` `ult_b` `crouch_a` `crouch_b` `crouch_attack_a` `crouch_attack_b` `dash` `land` |

Deliver to:

```
assets/intake/<character>/<pose_key>.png
```

Already delivered, do not redraw: `idle_a`, `idle_b`, `run_a`, `run_b`,
`jump_rise`, `fall`, `hurt`, `guard`, `ledge_hang`, `dizzy`, `victory`,
`charge`, `attack_up`, `dodge_roll`, `dodge_air`.

### Consistency is the point of this round

These 225 sprites are going to sit beside the poses each fighter already has, so
**matching the delivered set matters more than any individual frame looking
good.** For each fighter, put their `idle_a` beside what you are drawing and
check:

- **Same costume, same proportions, same age.** The sheets and the round-3/4/5
  additions already disagree in places; this round should agree with the
  *semantic* files, which are the newer and better art.
- **Same figure scale.** Body height ~290 px on a ~1024×1536 plate, matching
  their existing `idle_a`. The engine solves the final scale per fighter from
  `heightCm`, so do not compensate.
- **Same line weight and shading.** One character's set should look like it was
  drawn in one sitting.
- **Facing right**, one subject per file, flat key screen — the standard
  delivery spec at the top of this file. Warm-palette fighters (Sukuna, Nobara,
  Momo, Hakari) key on mid-grey `#808080`, everyone else on magenta `#FF00FF`.

### Pose lines

Combine each fighter's character block with the line below. Where a pose is a
technique, the fighter's own kit decides what it looks like — the special names
are in `src/characters.js` and on the move list in game.

| Pose | Pose line |
|---|---|
| `attack_light_a` | fast opening jab or short slash, lead hand, body square, minimal wind-up |
| `attack_light_b` | the follow-up strike with the other hand, hips rotated through it — reads as the second half of a two-hit combo |
| `attack_heavy_a` / `_b` | the wind-up and the strike of one committed heavy blow — see **10C**, which supersedes the single `attack_heavy` this row used to ask for |
| `attack_down` | striking downward at the ground in front, weight dropping onto it |
| `special_neutral` | performing their **neutral special** — the named technique, mid-execution, with its cursed energy forming but not yet released |
| `special_side` | their **side special**, moving forward into it |
| `special_down` | their **down special**, weight low, technique breaking out of the ground or the body |
| `ult_a` | the wind-up of their **ultimate**: gathering, energy at maximum, before release |
| `ult_b` | the release of that ultimate, arms and body fully committed |
| `crouch_a` | crouched low, guard up, alert — not resting |
| `crouch_b` | the same crouch a fraction lower, weight settled |
| `crouch_attack_a` | attacking from the crouch, low sweep or upward strike from the knees |
| `crouch_attack_b` | the follow-through of that low attack |
| `dash` | sprinting flat out, body angled forward past the leading foot — a running pose, distinct from `run_a`/`run_b` which are the mid-stride cycle |
| `land` | absorbing a landing, knees bent, one hand near the floor, dust at the feet — distinct from a crouch, which holds |

### The unused cells stay

Each fighter has 5–8 grid cells nothing draws (115 across the roster). **Do not
delete them.** They are alternate poses the sheets happened to contain, and the
sprite workbench can now point any action at any sprite — so an unused cell is a
candidate for a secondary action rather than dead weight. They stay in the
manifest and stay visible in the workbench under "All sprites".

### Integrating

1. Import with `tools/intake.py`, which registers the new poses.
2. Point each fighter's kit at them: the animation tables in `src/characters.js`
   currently name grid cells, and this is what replaces those names. The
   round-7 fighters' tables are the model — they inherit `SEMANTIC_ANIMS`
   wholesale and override almost nothing.
3. Anything not re-pointed keeps working: an action still naming a grid cell
   draws the grid cell exactly as it does today, so this can land fighter by
   fighter rather than all at once.

The result is 23 fighters with one sprite per action and no shared cells, which
is what makes the roster read consistently — and it retires the `r{row}c{col}`
vocabulary from everything except the leftovers.

---

## 11C. Wind-up and strike — 24 sprites across 6 fighters

This is round 10C, carried forward with the fighters it finished removed. The
four sheet-era fighters round 10 completed have their pairs; so does everyone
`11B` covers, since the pairs are in that pose list. What is left is the six
round-7 fighters, who were built with a single-frame heavy and aerial.

| Fighter | Key | Poses |
|---|---|---|
| Choso | `choso` | `attack_heavy_a` `attack_heavy_b` `attack_air_a` `attack_air_b` |
| Yoshinobu Gakuganji | `gakuganji` | `attack_heavy_a` `attack_heavy_b` `attack_air_a` `attack_air_b` |
| Mei Mei | `meimei` | `attack_heavy_a` `attack_heavy_b` `attack_air_a` `attack_air_b` |
| Reggie Star | `reggie` | `attack_heavy_a` `attack_heavy_b` `attack_air_a` `attack_air_b` |
| Takako Uro | `uro` | `attack_heavy_a` `attack_heavy_b` `attack_air_a` `attack_air_b` |
| Yuji Itadori | `yuji` | `attack_heavy_a` `attack_heavy_b` `attack_air_a` `attack_air_b` |

Mahoraga needs these too and is not listed: his whole set is redrawn in 11A, and
the pairs are in that pose list.

### The problem

A heavy attack and an aerial each draw **one frame** for the whole move. The
engine already splits that move into startup, active and recovery
(`delay` / `dur` / `recover` in `src/moves.js`), but the art cannot follow it,
so whatever was drawn is held through all three.

Which half was drawn varies by fighter, and that is the actual bug. Mei Mei's
`attack_heavy` is a clean **wind-up** — axe raised, weight loaded, nothing struck
yet — held for the entire swing, so her heavy never connects on screen. Others
drew the **strike**, so the move has no anticipation and appears to teleport into
its follow-through. Both are good drawings of half a move.

### What to deliver

Two poses per fighter, for both the heavy and the aerial:

| Pose | What it is |
|---|---|
| `attack_heavy_a` | **wind-up.** Weapon or fist drawn back, weight loaded onto the rear foot, body coiled. Nothing has landed. The moment before commitment. |
| `attack_heavy_b` | **strike.** The same swing at full extension, weight transferred through to the front foot, the arc finished. The moment of contact. |
| `attack_air_a` | **wind-up, airborne.** Body coiled mid-jump, striking limb cocked, legs gathered. |
| `attack_air_b` | **strike, airborne.** Fully extended through the aerial arc, legs trailing, committed. |

**These two frames are one motion, drawn twice.** Same camera distance, same
figure scale, same costume, same weapon at the same size — the only thing that
changes is the body. If you can flip between them and see anything move that is
not the character's own action, they will read as a glitch rather than a swing.

Deliver to `assets/intake/<character>/attack_heavy_a.png` and so on, against
that fighter's canonical `idle_a` (10B above).

### The existing art is kept, not replaced

Whatever a fighter has as `attack_heavy` or `attack_air` today stays in the
repository and stays selectable. It becomes a **variant**: when the new pair
lands, both `_a` and `_b` are seeded with the new art, and the old drawing is
offered alongside each of them as a second option in the sprite workbench's
chevron menu (`manifest.variants`, `tools/build_variants.py`).

That matters because some of the existing art is good — Mei Mei's raised axe is a
better wind-up than a fresh one might be. Nothing is thrown away, and the choice
of which drawing serves which half is made per fighter, by eye, in the workbench.

### It is already wired

`src/characters.js` declares both attacks as two-frame animations:

```js
sideHeavy: { frames: ["attack_heavy_a", "attack_heavy_b"],
             fallback: ["attack_heavy"], fps: 6, loop: false }
```

`resolvedAnim` filters an animation down to the art that exists, so **a fighter
without the pair draws exactly what they draw today**, and picks the pair up the
moment it is imported. No code change per fighter, and the round can land one
fighter at a time.

The frame rate is set so the drawing changes when the **hitbox** does: a heavy's
startup is `0.15 / speed` seconds and 6 fps holds the first frame for 0.167 s; an
aerial's is `0.13 / speed` against 8 fps and 0.125 s. The strike frame appears as
the move goes live, within about 10 ms.

### Relationship to 10A

**10A's `attack_heavy` row is superseded by this section.** The 17 fighters in
that round should be drawn as `attack_heavy_a` + `attack_heavy_b` directly rather
than as a single `attack_heavy` that would immediately need splitting. Everything
else in 10A is unchanged.

---

---

## 11D. Reggie's crouch attack — 1 sprite

The only **improvement** request outstanding, and the only thing in this round
that is not blocking: `reggie/crouch_attack_b` is drawn well, it just does not
read as the action. It is the follow-through of a low attack and looks like
something else.

| Fighter | Key | Pose | Ask |
|---|---|---|---|
| Reggie Star | `reggie` | `crouch_attack_b` | Pose — reads poorly, or is not the action it stands for |

Pose line, from 11B's table: *the follow-through of that low attack.* His canon
reference is `assets/reference/canon/reggie_idle.png` — the receipt tunic, bare
arms and legs, barefoot.

Keep this separate from the rest of the round when scheduling it. A `replace` is
blocking, because something on screen is wrong; this is a wish, and burying the
two together makes the blocking ones wait behind the wish list.

### What round 11 settled

**The 4×5 sprite sheet is retired.** Every fighter and the one sprite actor now
draws one sprite per action, and `src/characters.js` names no `r{row}c{col}`
cell anywhere outside the shared `DEFAULT_ANIMS` table — which `SEMANTIC_ANIMS`
now shadows entirely, state for state. The cells themselves stay in the manifest
and in the workbench's "All sprites" view, as alternate drawings a pose can be
pointed at; nothing draws them by default.

Delivered in this round, in the order it arrived:

| Part | Scope | Sprites |
|---|---|---|
| 11A | Mahoraga, redrawn from the shikigami's canon design | 33 |
| 11B | Semantic sets for Geto, Hakari, Hanami, Inumaki, Jogo, Maki, Megumi, Momo, Nanami, Panda, Sukuna, Todo, Toji | 225 |
| 11C | Wind-up/strike pairs for Choso, Gakuganji, Mei Mei, Reggie, Uro, Yuji | 24 |
| 11D | Reggie's crouch attack, kept alongside the original as a variant | 1 |

The round also produced the checks that make the next one land safely:
`tools/check_pointing.mjs` (art registered but not drawn), the "recently
updated" list covering brand-new poses as well as overwritten ones, and
`tools/swap_poses.py` for a pair delivered under reversed names.

---

## Round 12A — the first workbench catches — 18 sprites across 6 fighters

12A was thirty-three poses that only failed once they were placed in the sprite
workbench, at their real size and standing on the real ground line. Eighteen
came back in the first delivery; the remaining fifteen — Gakuganji, Reggie,
Toji, Megumi and Momo — are still open in
[asset-requests.md](asset-requests.md).

| Fighter | Poses | Kind | What was wrong |
|---|---|---|---|
| Satoru Gojo | `crouch_b` `crouch_attack_b` `special_down` | Pose | Not crouched; the low strike rose; Infinity read as a palm strike |
| Mahito | `crouch_b` | Pose | Not crouched |
| Mahoraga | `crouch_a` `crouch_attack_b` | Pose | A standing stride; the follow-through happened standing |
| Maki Zen'in | `attack_air_a` `attack_heavy_a` `ult_b` | Quality | Hands did not close on the naginata, which kinked where it crossed her body |
| Maki Zen'in | `crouch_b` `crouch_attack_b` | Pose | Barely below `crouch_a`; the follow-through did not travel toward the attack |
| Nobara Kugisaki | `dodge_air` | Quality | A second, grey Nobara ghosted into the plate, holding the hammer |
| Nobara Kugisaki | `special_neutral` `special_down` | Pose | The nails were painted in; Resonance hammered the ground instead of the doll |
| Takako Uro | `attack_air_a` `attack_air_b` `attack_heavy_a` `attack_heavy_b` | Character | A dark bob and a white bodysuit — not her |

All eighteen were flagged `needsReplacement`, so each replaced its drawing
outright and rolled back the hand tuning that had been compensating for it —
`intake_import.py`'s `discard` path. They land on the workbench's **All Recently
Updated Poses** list for re-placement.

### What this delivery settled

**Uro is on-model.** Her four were the last of the three characters round 9E
existed to fix, and they came back with the lavender upswept hair, the
pale-cyan cloud garment and the bare feet — drawn against
`assets/reference/canon/uro_idle.png` and nothing else, which is what the
instruction had been asking for across two rounds. Gakuganji and Reggie are
still outstanding on the same fault.

**Seven of the eight crouches that kept coming back standing are answered.**
The comparative test — head down by at least a quarter of the standing height,
beside that fighter's own `idle_a` — is what the briefs were rewritten around,
and it worked. `momo/crouch_attack_b` and `reggie/crouch_attack_b` are what
remain.

**`nobara/special_neutral` is the worked example for "do not draw the
technique".** The delivered art draws the cast — hammer driving forward, energy
at the hand — and leaves the nails to `effect:nail`. The four still open
(Megumi's two, Toji's two) are the same ask.

### The briefs, as written

Kept verbatim, because they are the record of what was asked for and the
reference for the poses still outstanding.

### The three crouches — 3 sprites

`crouch_a` and `crouch_b` are the two frames of the crouch cycle, and `crouch_b`
is meant to be **the same crouch a fraction lower, weight settled**. What was
delivered for all three is a figure standing upright with the knees slightly
bent — closer to `idle` than to `crouch_a`. On screen the character barely moves
when the player holds down, and `crouch_attack_b` swings upward from standing
rather than following through on a low attack.

The `_a` frames are right; draw the `_b` frames against them.

| Pose | What to draw |
|---|---|
| `gojo/crouch_b` | The same crouch as `gojo/crouch_a`, settled lower — hips down near heel height, thighs closer to horizontal, back angled forward, guard still up. This is a fighting crouch, not a rest. |
| `mahito/crouch_b` | The same, against `mahito/crouch_a`. |
| `gojo/crouch_attack_b` | The **follow-through of a low attack** — the arm or leg extended out at ankle-to-knee height, body still down in the crouch, weight carried through the sweep. Not a rising uppercut. |

Match each fighter's own `crouch_a` for camera distance, figure scale, costume
and line weight: these two frames play back to back at a few frames a second, so
anything that differs between them reads as a flicker rather than a settle.

### Gojo's Infinity — 1 sprite

`gojo/special_down` is his **down special**, which is `Infinity` — a *counter*,
not a strike (`src/characters.js`). What is drawn is Gojo standing square with a
palm thrust forward, which is a good drawing of his heavy (`Lapse Palm`) and is
close enough to it on screen that the two moves look like the same move.

Draw the counter instead: **stopped**, not striking. Weight low and settled, both
hands raised into a hold rather than one arm punched out, the body braced to
receive something. The nullification field is the point — pale blue-white
distortion gathering just off his palms, air bending around him — and the pose
should read as *the attack does not arrive* rather than *he is hitting you*.

### Nobara's air dodge — 1 sprite

`nobara/dodge_air` has **two figures on it.** Behind the drawn Nobara there is a
full grey ghost of her — a second body, a second head of hair, a second arm —
and the hammer belongs to the ghost, not to her: her own hands are closed on
nothing.

Whatever it was meant to be as an illustration, the game composites its own
motion trails behind a dodging fighter (`trailStrength`, `src/motion.js`), so a
painted-in afterimage is a grey duplicate Nobara that trails the real one and
never fades, with a hammer floating loose beside it.

Redraw as **one** figure: Nobara tucked mid-air through an evasive roll, hammer
held in her own hand, nothing behind her. No afterimage, no speed lines, no
second body — the engine adds all of that.

### Nobara's two techniques — 2 sprites

Her kit (`src/characters.js`) is specific about what these are, and neither
drawing matches:

| Pose | Technique | What is drawn | What it should be |
|---|---|---|---|
| `special_neutral` | **Straw Doll: Nail Shot** — cursed nails fired downrange | Hammer raised, arm out, and a row of grey nails already flying off her hand | The moment of the shot, **without the nails.** The game spawns them itself (`effect:nail`, two per cast), so the painted ones fly alongside a second set at a different size and colour. Draw the cast: hammer driving forward, nails just leaving, energy at the hand — no projectiles in flight. |
| `special_down` | **Resonance** — drives a nail into the **straw doll**, so marked souls take the hit wherever they stand | Crouched, hammering nails into the ground | The doll is the whole point of the move and is not in the picture. Draw her low with the straw doll held or braced in one hand, hammer driving a nail into *it*, cursed energy running out of the doll rather than into the floor. Hammering the ground is already what her down-heavy looks like. |

`special_down` is the wish and `special_neutral` the blocking one, because the
doubled nails are visible in every match.

```
assets/intake/gojo/special_down.png
assets/intake/gojo/crouch_b.png
assets/intake/gojo/crouch_attack_b.png
assets/intake/mahito/crouch_b.png
assets/intake/nobara/dodge_air.png
assets/intake/nobara/special_neutral.png
assets/intake/nobara/special_down.png
```

Delivered against the standard spec in
[asset-requests.md](asset-requests.md#delivery-spec). Gojo and Mahito keyed on
magenta `#FF00FF`; Nobara is a warm palette, so hers keyed on mid-grey
`#808080`. Canon references: `assets/reference/canon/gojo_idle.png`,
`assets/reference/canon/mahito_idle.png` and
`assets/reference/canon/nobara_idle.png`. The raw plates for all eighteen are
archived at `assets/reference/round12/`.

---

## Round 12A, second batch — 11 sprites across 3 fighters

The eleven that followed the first eighteen: Gakuganji's four, Reggie's four and
Toji's three. That leaves four of 12A open — Megumi's two and Momo's two — in
[asset-requests.md](asset-requests.md).

| Fighter | Poses | Kind | What was wrong |
|---|---|---|---|
| Yoshinobu Gakuganji | `attack_air_a` `attack_air_b` `attack_heavy_a` `attack_heavy_b` | Character | A plain black robe — the white haori and purple hakama were gone, the flying-V black instead of red |
| Reggie Star | `attack_air_a` `attack_air_b` `attack_heavy_a` `attack_heavy_b` | Character | A dark-haired man in a black coat and gold brocade waistcoat |
| Toji Fushiguro | `attack_air_b` | Quality | The grip on the blade did not read |
| Toji Fushiguro | `special_down` | Quality | The Inventory Curse was a flat ragged purple wash |
| Toji Fushiguro | `special_neutral` | Pose | The chain was painted in, and the engine fires its own |

All eleven replaced their drawing outright and rolled back the hand tuning that
had compensated for it, the same `discard` path the first batch took.

### The three that kept coming back wrong

Rounds **9E** and **11C** both existed partly to fix the same three characters,
and 11C came back with all three wrong again — Uro, Gakuganji and Reggie, all
four wind-up/strike pairs each, twelve sprites. **12A closed it.** Uro landed in
the first batch, Gakuganji and Reggie in the second, all twelve on-model:

| Fighter | Canon says | What 11C had drawn |
|---|---|---|
| Takako Uro | Lavender hair swept upward, pale-blue cloud garment, barefoot | A dark-green bob and a white-and-purple bodysuit with trainers |
| Yoshinobu Gakuganji | White haori over black, purple hakama, red flying-V guitar | A plain black robe, no haori, no hakama, black guitar |
| Reggie Star | Blond, white receipt tunic, bare arms and legs, barefoot | A dark-haired man in a black coat and gold brocade waistcoat |

What finally worked is worth keeping, because it is the instruction that had
been failing: **draw them from `assets/reference/canon/<char>_idle.png` and from
nothing else** — not the character block, not an earlier sprite, not a wiki
search. Those files are the delivered 9E art and carry the design, the figure
scale, the line weight and the palette the rest of each set already has. If the
drawing does not match that image, it is the wrong character no matter how good
it looks.

The raw plates are archived at `assets/reference/round12/`.

---

## Round 12A, third batch — 4 sprites, and 12A closed

Megumi's two specials and Momo's two follow-throughs, the last of the
thirty-three workbench catches.

| Fighter | Poses | Kind | What was wrong |
|---|---|---|---|
| Megumi Fushiguro | `special_neutral` `special_down` | Pose | Nue and the shadow pool were painted in; the engine spawns both |
| Momo Nishimiya | `attack_light_b` | Pose | The follow-up pulled the broom away from what she had just hit |
| Momo Nishimiya | `crouch_attack_b` | Pose | The follow-through stood up out of the crouch |

**12A is closed: 33 of 33.** It ran over three deliveries and settled three
things worth keeping:

- **"Do not draw the technique" is answered everywhere it was raised.** Five
  poses painted in something the engine already spawns — Nobara's nails, Toji's
  chain and Inventory Curse, Megumi's Nue and shadow pool. All five now draw the
  body performing the move and leave the rest to the kit.
- **The crouches that kept coming back standing are done.** Eight of them across
  six fighters and three rounds. The comparative test the briefs were rewritten
  around — head down by at least a quarter of the standing height, judged beside
  that fighter's own `idle_a` — is what finally landed them.
- **The three that kept coming back wrong are on-model.** Uro, Gakuganji and
  Reggie, twelve sprites, drawn from `assets/reference/canon/<char>_idle.png`
  and nothing else.

The briefs, kept verbatim because they are the record of what was asked for:

### The catches, as they were written

Everything here came out of placing the delivered semantic sets in the sprite
workbench: seen at their real size and standing on the real ground line,
thirty-three poses turned out to be wrong. Round 11 is closed, so nothing here is
covered by another round — every fighter listed has a finished set, and these
are faults in it.

**Twenty-nine of the thirty-three are delivered**, in two batches: Gojo's three,
Mahito's crouch, Mahoraga's two, Maki's five, Nobara's three and Uro's four,
then Gakuganji's four, Reggie's four and Toji's three. Megumi's two and Momo's
two are what is left. The delivered briefs are in
[asset-requests-history.md](asset-requests-history.md#round-12a--the-first-workbench-catches--18-sprites-across-6-fighters).

**Everything in this section has to be drawn again.** That is what the section
is: a fault that could be fixed by editing the file — a bad key, a bad crop,
colour past the silhouette — is not a request at all, because it is repo work
(`tools/dekey_fringe.py` and friends) and never waits on a round. Only the
faults no edit can reach are here.

Two reasons a drawing cannot be edited into the right picture, and they want
different things from the redraw:

- **`quality` — the drawing is broken.** A hand that does not close on the
  weapon it is holding, a shaft that bends where it crosses the body, a second
  figure ghosted into the plate.
- **`pose` — the drawing is fine, but it is not the action.** A crouch that is
  not crouched, a strike that does not travel the way the move travels. Keep
  the character, the costume and the finish; change the body.
- **`character` — it is not the right person.** Twelve sprites came back as
  somebody else across two rounds — Uro's, Gakuganji's and Reggie's. All twelve
  are now delivered on-model, and none of the four below is a `character`
  fault; the account is in
  [asset-requests-history.md](asset-requests-history.md#the-three-that-kept-coming-back-wrong).

A third fault runs through several of them and is worth naming on its own,
because it is not obvious from the drawing: **the art paints in something the
game spawns for itself.** See "Do not draw the technique" below.

**The crouches that were not crouched are all delivered** — seven of them, the
bulk of the first 12A batch. One is left, `momo/crouch_attack_b`, plus
`reggie/crouch_attack_b` carried over from 11D: see the note under the table,
which is still the test to draw against.

| Fighter | Key | Pose | Kind | Ask |
|---|---|---|---|---|
| Megumi Fushiguro | `megumi` | `special_neutral` | Pose | Nue is painted in; the engine already flies its own |
| Megumi Fushiguro | `megumi` | `special_down` | Pose | The shadow pool is painted in; the engine draws that too |
| Momo Nishimiya | `momo` | `attack_light_b` | Pose | The follow-up pulls the broom away from the target |
| Momo Nishimiya | `momo` | `crouch_attack_b` | Pose | The follow-through stands up out of the crouch |

### Do not draw the technique

A fighter's sprite is the **body performing the move**. Everything the technique
puts on screen — the projectile, the summon, the pool, the shockwave — is
spawned by the engine from that fighter's kit, composited at its own size and
animated on its own clock. When the art paints it in as well, the player sees it
twice, at two sizes, moving two different ways.

It has now come up three times. Three of the five are answered —
`nobara/special_neutral` draws the cast with the nails left to `effect:nail`,
and Toji's two came back with the chain and the purple wash gone. They are the
reference for Megumi's two, which are what is left:

| Pose | Painted in | What the engine already spawns |
|---|---|---|
| `megumi/special_neutral` | Nue, the shadow bird | `summon:nue` — steerable, 132 px tall, flown by the player |
| `megumi/special_down` | the shadow pool he sinks into | a burst in his shadow colour, both ends of the teleport |

Megumi's are the clearest case, because **Nue is a creature the player flies.**
The neutral special launches him and the right stick steers him across the
arena; a second Nue fixed to Megumi's hip goes nowhere and reads as a glitch the
moment the real one leaves.

So for any technique pose: draw the **cast** — the stance, the hands, the gather
of cursed energy at the point it leaves the body — and stop there. Energy
forming at the palm is the body; a bird in flight is not. Where a fighter's
technique is *inseparable* from the pose (Maki's naginata, Momo's broom — the
thing they are holding), that stays; the test is whether the game spawns its own
copy.

Toji's down special is the sharpest version of the fault yet: **Inventory Curse
is a creature** — it uncoils at his shoulder, hovers behind him and spits cursed
tools for six seconds — and what is drawn in its place is a flat ragged purple
smear across his chest and thigh with a hard edge and no form. It is flagged
`quality` as well as belonging here, because even as an aura it is not finished
art.

**`megumi/special_side` is very likely a third instance** and is not flagged
yet. Two black hounds are painted at his feet, and Divine Dogs spawns two real
ones (`summon:divine_dog_black`, `summon:divine_dog_white`, `maxActive: 2`) that
chase the opponent for six seconds — so a cast puts four dogs on screen, two of
which never move. Worth a look in the workbench before this round is drawn.

### The second frame has to finish the first

`attack_light_a`/`_b` and `crouch_attack_a`/`_b` are **one motion drawn twice**,
and the `_b` frame keeps going the way `_a` was heading. Four of this round's
entries missed the same way — the second frame retreats, rises, or resets to a
neutral stance, so the combo plays as a strike followed by an un-strike.
`maki/crouch_attack_b` and `gojo/crouch_attack_b` are delivered; Momo's two are
what is left.

| Pose | `_a` does | `_b` should | `_b` does |
|---|---|---|---|
| `momo/attack_light_b` | thrusts the broom forward | carry through past the target, hips rotated in | lifts the broom up and back, away from what she just hit |
| `momo/crouch_attack_b` | sweeps low out of a lunge | stay down, the sweep finishing across the floor | rises toward standing |

The check: flip between `_a` and `_b`. Every part of the body that was moving
should have moved **further in the same direction**. If the weapon or fist is
closer to where it started, the second frame is a wind-up, not a follow-through.

### Hands on a weapon

Maki's three quality frames were all the same failure, and it is the one to
watch for on every armed fighter: **the hand does not grip.** The fingers pass
through the shaft, or close on empty air beside it, or the shaft bends through
the fist as though it were rope. `attack_heavy_a` had both — the lead hand never
closed, and the naginata kinked where it crossed her chest.

Her three are delivered, and so is `toji/attack_air_b`, the round's other
instance. `attack_heavy_b` remains the reference: two hands, both closed, the
shaft dead straight through them. Draw the grip first and the pose around it.

### The crouch keeps coming back standing

`gojo/crouch_b`, `gojo/crouch_attack_b`, `mahito/crouch_b`,
`mahoraga/crouch_a`, `mahoraga/crouch_attack_b`, `maki/crouch_b`,
`maki/crouch_attack_b`, `momo/crouch_attack_b` and `reggie/crouch_attack_b`
(11D) were all the same miss, from three different rounds: a figure standing
upright with the knees slightly bent, which reads as `idle` rather than as a
crouch. It survives review every time because in isolation it is a good drawing
— it only fails beside the fighter's own `idle_a`, where nothing has moved.

All but Momo's and Reggie's are delivered, and the delivered ones are the
worked example: put one beside its `idle_a` and the head has visibly dropped.

So the pose lines are not enough on their own. For any crouch pose in this round
or later, the test is comparative and it is the one to draw against:

> Put the crouch beside that fighter's `idle_a`. **The head must drop by at
> least a quarter of the figure's standing height.** Hips down toward heel
> height, thighs closer to horizontal than vertical, back angled forward, and
> the silhouette measurably shorter and wider than the idle. If the two images
> have the same outline at the shoulders, it is not a crouch.

`crouch_attack_a` / `_b` are that same low stance with the strike coming out of
it — the body stays down through the follow-through. A rising strike from
standing is a different move and belongs to `attack_up`.

---

## Round 12B and 12C, first delivery — 75 sprites across 15 fighters

The four-frame run cycle (`run_pass_a/b`, `run_reach_a/b`) and the knocked-flat
`prone` pose, for Choso, Geto, Hakari, Hanami, Inumaki, Jogo, Megumi, Mei Mei,
Momo, Nanami, Panda, Sukuna, Todo, Yuji and Yuta. **Nine fighters are still
without both** — Gakuganji, Gojo, Mahito, Mahoraga, Maki, Nobara, Reggie, Toji,
Uro — and stay open in [asset-requests.md](asset-requests.md).

Seventy-five poses that did not exist before, so nothing was overwritten and no
tuning was rolled back. They land on the workbench's updated list as new work to
be placed rather than re-tuned.

### What the round taught the tools

**The resolution check was measuring the wrong axis.** `prone` arrives about
939×208 — a perfectly sharp figure, lying down — and all fifteen were flagged
`LOW-RES` because the check read body *height*. Resolution is a property of how
big the drawing is, not which way up it is, so `tools/intake.py` now measures
the longest axis. For anything standing that is still the height, so the case it
was written for is unchanged, and fifteen false positives went away.

**The auto-tuner's foot rule assumed the character is standing.** It is not a
question of how sprawling a pose is: the 0.946 fraction holds at the same median
whether the art is drawn taller than wide (n=470) or wider than tall (n=39), so
a running stride is fine. What breaks it is nobody being on their feet — `prone`
lies flat and touches the floor along its whole side, so its contact really *is*
the lowest pixel, and lifting it 5% hovers the body. The magnitude guard caught
`momo/prone` on its own at 37% of body height, which is what a guard is for, but
the other fourteen would have gone through quietly wrong. `prone` is now named
in `NO_STANDING_FOOT` — a list rather than a measurement, because it is a fact
about what the pose means and nothing in the alpha channel knows it.

This was the first round where `tools/auto_tune.py` ran as an ordinary step. It
placed the 78 poses it had rules for and left prone's ground contact to the eye.

### Known and left alone

`momo/run_reach_a` has a few pixels of broom bristle clipped at the canvas edge.
The figure is intact and the rest of the delivery is clean, so it was imported;
whether that is worth a redraw is a workbench decision, not one to make on the
way in.

---

## Round 12B and 12C, completed — 45 sprites across the last 9 fighters

The four-frame run cycle and the `prone` pose for Gakuganji, Gojo, Mahito,
Mahoraga, Maki, Nobara, Reggie, Toji and Uro, finishing both parts.

**All 24 fighters now run on four frames and have a drawn knockdown.** The
two-frame run is retired everywhere, and the engine no longer simulates prone by
sweeping a `hurt` frame 90 degrees.

The delivery arrived as 74 plates, 29 of which were byte-for-byte re-uploads of
12A art already delivered and archived. Those were dropped rather than
reimported — comparing the incoming plate against `assets/reference/round<N>/`
by hash is the cheap way to tell a redelivery from a repeat, and worth doing
whenever a round arrives in more than one upload.

### What round 12 finished

| Part | Scope | Sprites |
|---|---|---|
| 12A | Workbench catches, in three batches | 33 |
| 12B | The four-frame run cycle, roster-wide | 96 |
| 12C | A `prone` pose, roster-wide | 24 |

**12D — three install auras — was never delivered and has moved to round 13 as
13E.** It is effect art rather than a pose, the three installs run on procedural
placeholders in code, and keeping a round open for it would have misreported
what is outstanding.

### One thing left for the eye

**Five of the twenty-four prone poses lie the other way round.** Geto, Mei Mei
and Todo came that way in the first batch; Mahoraga and Nobara in the second.
The other nineteen lie with the head trailing, which is the direction a
knocked-back fighter falls, and the engine mirrors `prone` by facing like every
other frame — so two fighters knocked down beside each other lie head to head.

No redraw is needed: it is one tick of **Mirror this pose** in the workbench per
pose. It is recorded here rather than fixed on the way in because which way a
body falls is a decision about the game, not a fault in the file.

### The briefs, kept verbatim

The pose lines are the reference for anything that has to match this art
later — a redraw of one run frame has to agree with the other three.

### 12B, as it was written

### Why the two-frame run is being retired

Every fighter's run is two sprites, `run_a` and `run_b`, alternated at 10 fps.
Set them side by side for any fighter and the problem is visible before the
game even starts: **they are two drawings of the same half of a stride.** Both
frames tend to show the same leg leading, differing only in arm angle or how
far the legs are apart — so on screen the character does not stride, they
vibrate between two near-identical poses while sliding along the ground. And
because the two were generated independently, they rarely agree on lean or
figure scale either, so the vibration comes with a lurch.

The fix is not better versions of the same two frames. A run cycle has a
structure, and two frames cannot hold it:

- A stride has **two halves** — right leg leading, then left leg leading — and
  a side-view character is asymmetric (Maki's naginata, Yuta's katana, Nanami's
  cleaver, every jacket and hairstyle), so the second half cannot be faked by
  mirroring the first. Both leg-leads must be drawn.
- Between the two reaches the legs **cross under the body**. Without a crossing
  frame the legs teleport from one split to the other, which is exactly the
  "two poses swapping" read the current run has.

Four key poses is the classic minimum that holds all of it — the **reach**
(full stride) and the **pass** (legs crossing) for each leg-lead — and it is
also about the ceiling of what our generator can keep consistent across
independently drawn frames, so that is the shape of this round:

| Order | Pose key | What it is |
|---|---|---|
| 1 | `run_reach_a` | full stride, one leg reaching forward |
| 2 | `run_pass_a` | legs crossing under the body, rear leg swinging through |
| 3 | `run_reach_b` | full stride, the **other** leg reaching forward |
| 4 | `run_pass_b` | legs crossing again, the other leg swinging through |

The loop plays 1→2→3→4 at 13 fps — a full cycle every ~0.31 s, about three
strides a second, which reads as a sprint. The engine adds sway once per cycle
and a bob on each footfall on top (`src/motion.js`).

### Pose lines

Combine each fighter's character block with these, one image per line. The four
are **one continuous motion sampled four times** — same camera, same distance,
same figure scale, same costume and weapon; only the body moves.

| Pose | Pose line |
|---|---|
| `run_reach_a` | sprinting at full stride, torso leaning forward, RIGHT leg extended forward with the heel about to strike, left leg trailing fully behind, LEFT arm swung forward and right arm driven back, body at the lowest point of the stride |
| `run_pass_a` | mid-stride, upright moment of the sprint, legs crossing directly beneath the hips with the left knee driving through to the front, arms passing at the sides, body at the highest point of the stride |
| `run_reach_b` | sprinting at full stride, torso leaning forward, LEFT leg extended forward with the heel about to strike, right leg trailing fully behind, RIGHT arm swung forward and left arm driven back, body at the lowest point of the stride |
| `run_pass_b` | mid-stride, upright moment of the sprint, legs crossing directly beneath the hips with the right knee driving through to the front, arms passing at the sides, body at the highest point of the stride |

Things that make or break this specific set:

- **The lean is constant.** A sprinter's torso holds a steady forward lean
  through the whole cycle. If one frame stands tall and the next dives, the
  loop rocks like a see-saw. Pick the lean from the fighter's `dash` pose,
  dialled back a little, and keep it in all four.
- **Reach low, pass high.** The body genuinely rises on the crossing frames and
  sinks on the contact frames — that is where the bounce of a run comes from,
  and the engine only *adds half* of its usual procedural bob when the cycle
  art is present, expecting the art to carry the rest.
- **Weapons ride, they do not flail.** A carried weapon (naginata, axe, broom,
  sword, guitar) stays in the same hand at the same size in all four frames,
  moving only as much as the arm swing moves it. The most common generator
  failure on this pose is the prop teleporting between hands.
- **Nothing airborne-looking.** Frames where both feet float with the body
  rising read as a jump when looped. On the pass frames the toes of the
  planted foot can leave the ground, but the pose must read as *between*
  steps, not above them.
- **No motion effects.** No speed lines, no dust, no afterimages — the engine
  draws all of that (`trailStrength`, dash dust). Painted-in effects loop as a
  flicker.

### Who and what to deliver

All 23 roster fighters plus **Mahoraga**, four poses each. He was held out of
this list while round 11A was open, on the assumption his cycle would come with
that redraw; 11A has since been delivered as the 33-pose set, which carries
`run_a`/`run_b` and not the cycle. So he needs these four like everyone else —
`assets/intake/mahoraga/run_reach_a.png` and the rest.

```
assets/intake/<character>/run_reach_a.png
assets/intake/<character>/run_pass_a.png
assets/intake/<character>/run_reach_b.png
assets/intake/<character>/run_pass_b.png
```

Standard delivery spec at the top of this file: facing right, flat key screen —
warm-palette fighters (Sukuna, Nobara, Momo, Hakari, Yuji, Choso, Uro,
Gakuganji) on mid-grey `#808080`, everyone else on magenta `#FF00FF`. Each
fighter's canonical reference is their `assets/reference/canon/<char>_idle.png`
— every fighter has one now — and their `dash` sprite is the secondary
reference for how *this* character carries themselves at speed.

Deliver **all four frames of a fighter together.** A half-delivered cycle
plays whatever subset exists, and two frames of the new art loop worse than
the old pair they replace. Fighter by fighter is fine; frame by frame is not.

### The old pair stays, as the fallback

`run_a` and `run_b` are not deleted and not redrawn. The run animation names
the four cycle frames with the old pair as its `fallback`
(`src/characters.js`), so a fighter whose cycle has not landed keeps running
exactly as today, at the old 10 fps — and picks the cycle up the moment their
four frames are imported and registered. No code change per fighter; the round
can land one fighter at a time.

### Integrating

1. Import with `tools/intake.py` as usual — the semantic pose keys register
   like any other.
2. Run `python3 tools/bake_anchors.py` so the new frames get their centre of
   mass measured; the run lean rotates about it.
3. Check the loop in the sprite workbench: the four frames play in order under
   the Run state, and a scale mismatch between them shows up as pulsing there
   before it ships.

---

### 12C, as it was written

### Why

The game now has a KNOCKDOWN: Reggie's runaway sedan (and anything else that
sets `knockdown` on a hit) leaves its victim lying flat on the ground for about
a second before they get up. Every fighter can be on the receiving end, so every
fighter needs the pose.

**Nothing is blocked.** Until a fighter's `prone` art lands, the game simulates
it — their `hurt` pose swept 90 degrees onto its back (`fighter.js`,
`prone` in the shared animation tables). That reads fine at speed; a drawn pose
reads better. Deliveries can land one fighter at a time and each takes effect on
import with no code change, the same fallback machinery as the wind-up/strike
pairs.

### What to deliver

One pose per fighter:

| Pose | Pose line |
|---|---|
| `prone` | flat on their back on the ground, arms out, legs dropped, head tilted — dazed but conscious, the beat after being run over. Drawn HORIZONTAL: the body lies along the ground plane, feet toward the right edge of the frame |

Facing note: the standard spec says faces right — for this pose that means
**feet to the right**, since the body is horizontal. The renderer mirrors it
for a fighter facing left like any other frame.

Match each fighter's canonical reference image for costume, proportions and line
weight. Same delivery spec as everything else; body length on the plate around
the usual ~290 px figure scale, lying down.

Deliver to:

```
assets/intake/<character>/prone.png
```

All 23 fighters plus **Mahoraga** — the transform can be knocked down like
anyone else (his armour eats the hit today, but a future knockdown that pierces
armour would want the pose). Round 11A is closed, so his does not arrive with
anything else.


---

## Round 13 — the attack and crouch sweep, and the install auras

**Delivered in full: 44 sprites.** Forty-one crouch, crouch-attack and
light-attack redraws from the roster-wide sweep, plus 13E's three install auras.
The auras went straight into the game; every one of the forty-one poses came in
through the **approval step** instead — the first round to do so — so the art is
in the repo and each pose is a decision waiting in the sprite workbench rather
than a change players saw on import.

Ten were approved in the first pass. Two of those carried a redraw request out
with them: Choso's `attack_light_b` and Geto's `attack_down` are better than what
they replaced and are in the game, and both are also in **14C**. Approving and
requesting are separate answers, and a drawing can be worth shipping and worth
improving at the same time.

The round also settled how an approval interacts with the comparison view. The
displaced drawing is banked as a `Superseded` option on the pose rather than
dropped, so **Alternate sprite** goes on showing "the drawing this replaced"
after a yes instead of silently switching to something else.

### The sweep, as it was written

Round 12A caught its poses one at a time, as fighters happened to pass through
the sprite workbench. This round is what happens when the same question is asked
of **every attack and crouch frame on the roster at once**: all 288 of them —
24 sets × 12 poses — composited at `character.scale × renderScale`, anchored by
`bodyBottom` to a shared ground line, mirrored where the manifest sets
`faceLeft`, and read against what the animation asks the pose to do.

Fifty-three came back suspect. Twelve are accounted for — all delivered across
12A's three batches. The remaining **forty-one** are this round, plus the three
install auras carried over from round 12.

- **13A** — crouches that are standing (22 sprites)
- **13B** — `crouch_attack` frames that never get low (10 sprites)
- **13C** — light-attack pairs that do not reach (7 sprites)
- **13D** — one wrong direction, one wrong person (2 sprites)
- **13E** — three install auras, carried over from round 12 (3 sprites)

**44 sprites in total.** All but one of the forty-one poses are `pose`: the
drawings are good, they are the wrong body. Nothing here is blocking — every one
of these frames renders and animates today, it just reads as a different move
than the one it plays for, and 13E's three installs run on procedural
placeholders in the meantime.

**Draw 13A first.** 12A's deliveries fixed one frame of four fighters' crouch
pairs and left the other, so Gojo, Mahito, Maki and Mahoraga now alternate at
3 fps between a genuine squat and the old standing guard. That pulse is more
visible in play than either frame was wrong on its own, and this round is what
closes it.

Idle, run and jump rows were deliberately excluded; the run was being redrawn
as 12B at the time, and has since landed — every fighter now has the
four-frame cycle.

## What the sweep found, before the tables

Three things are worth knowing before drawing any of it, because they say more
about *how* to re-request than any individual entry does.

**The defect lives in one frame slot.** Almost everything below sits in
`crouch_b` and `crouch_attack_b`. The `_a` half of each pair is usually right
and the standing attack rows are largely clean. Whatever produced these sets got
the first frame of a pair right and the second wrong, over and over — which
points at how the pairs were generated, not at twenty-two unrelated bad draws.

**Crouch height splits the roster in two, with nothing in between.** Measuring
drawn silhouette height against each fighter's own `idle_a`, before 12A landed:

| Crouches properly, 0.45–0.60 × idle | Stands up, 0.85–1.00 × idle |
|---|---|
| Yuji, Toji, Choso, Mei Mei, Nanami, Todo, Panda, Reggie | Gojo, Geto, Megumi, Inumaki, Hakari, Jogo, Momo, Mahito, Maki, Hanami, Yuta, Uro, Mahoraga |

There is no middle. A gradient would mean uneven drawing quality; a clean split
like this means two batches were drawn to two different readings of the same
word.

**And that reading is the actual bug.** The 0.85–1.00 group is not badly drawn.
The poses are good — they are just *fighting stances*: knees soft, fists up,
weight centred, head a few percent under the idle. "Crouch" is landing as "low
stance". The comparative test in
[The crouch keeps coming back standing](#the-crouch-keeps-coming-back-standing)
is the fix and it applies verbatim to everything in 13A and 13B — **the head
must drop by at least a quarter of the figure's standing height.** Do not draw
any of these against the pose line alone; 12A's delivered crouches are now the
worked example to match.

By contrast the directional poses came through almost untouched: `attack_up` is
correct on all 24 fighters and `attack_down` on 23 of 24. Explicit direction
words survive the pipeline in a way postural ones do not, which is worth
carrying into how 13A and 13B get prompted.

---

## 13A. Crouches that are standing — 22 sprites

All `pose`. Every one is the same miss: the fighter is upright, or nearly, in a
frame that plays while the player is holding down.

The eleven `crouch_b` entries are the severe half — at 0.87–1.00 × idle they are
indistinguishable from a second idle frame, so a crouching fighter does not
visibly change height at all. The `crouch_a` entries are the softer half: a real
stance, just not a crouch.

**★ marks the four that now sit opposite a delivered 12A crouch.** Those four
are the pulse described above and are the ones to draw first.

| Fighter | Key | Pose | Kind | Ask |
|---|---|---|---|---|
| Jogo | `jogo` | `crouch_a` | Pose | 1.00 × idle — the idle hunch with the feet moved |
| Jogo | `jogo` | `crouch_b` | Pose | 0.97 × idle — also indistinguishable from idle |
| Toge Inumaki | `inumaki` | `crouch_b` | Pose | 0.98 × idle — upright, arms at his sides |
| Megumi Fushiguro | `megumi` | `crouch_b` | Pose | 0.98 × idle — standing straight, hands relaxed |
| Suguru Geto | `geto` | `crouch_b` | Pose | 0.98 × idle — the idle pose with a wider foot spacing |
| Momo Nishimiya | `momo` | `crouch_b` | Pose | 0.98 × idle — broom held vertical exactly as in idle |
| Mahoraga ★ | `mahoraga` | `crouch_b` | Pose | 0.97 × idle — upright, opposite a delivered `crouch_a` |
| Kinji Hakari | `hakari` | `crouch_b` | Pose | 0.97 × idle — upright, no knee bend |
| Nobara Kugisaki | `nobara` | `crouch_b` | Pose | Upright, hammer at her waist |
| Hanami | `hanami` | `crouch_b` | Pose | 0.94 × idle — standing |
| Yuta Okkotsu | `yuta` | `crouch_b` | Pose | 0.89 × idle — standing, sword lowered |
| Takako Uro | `uro` | `crouch_b` | Pose | 0.87 × idle — a standing lunge, torso vertical |
| Satoru Gojo ★ | `gojo` | `crouch_a` | Pose | 0.90 × idle — a boxing guard, opposite a delivered `crouch_b` |
| Mahito ★ | `mahito` | `crouch_a` | Pose | 0.85 × idle — fighting stance, opposite a delivered `crouch_b` |
| Maki Zen'in ★ | `maki` | `crouch_a` | Pose | A forward spear lunge, opposite a delivered `crouch_b` |
| Toge Inumaki | `inumaki` | `crouch_a` | Pose | 0.89 × idle — fighting stance |
| Kinji Hakari | `hakari` | `crouch_a` | Pose | 0.89 × idle — fighting stance |
| Suguru Geto | `geto` | `crouch_a` | Pose | 0.87 × idle — fighting stance |
| Megumi Fushiguro | `megumi` | `crouch_a` | Pose | Wide stance, head barely under the idle line |
| Momo Nishimiya | `momo` | `crouch_a` | Pose | Standing wide, broom held horizontal |
| Nobara Kugisaki | `nobara` | `crouch_a` | Pose | Standing, hammer raised |
| Ryomen Sukuna | `sukuna` | `crouch_a` | Pose | Fighting stance; only a slight drop from idle |

### Pose lines

Two frames, one held position. `crouch_a` and `crouch_b` are not a motion — they
alternate at 3 fps while the player holds down, so they are the **same crouch
with a small idle-breath difference**, not a descent sampled twice. Same figure
scale, same costume, same camera; only the arms and weight shift.

| Pose | Pose line |
|---|---|
| `crouch_a` | crouched down low, hips dropped to heel height, thighs closer to horizontal than vertical, back angled forward over the knees, head lowered to about chest height of their standing pose, guard up close to the body |
| `crouch_b` | the same low crouch, weight settled slightly further forward and the head a touch lower, arms shifted — the breathing beat of a held crouch, not a rise out of it |

For the four ★ entries, the fighter's **own delivered frame is the reference**:
match its depth, its figure scale and its costume exactly, because the two play
back to back and any difference between them is what the player sees.

---

## 13B. `crouch_attack` frames that never get low — 10 sprites

All `pose`. A `crouch_attack` is the 13A crouch **with the strike coming out of
it** — the body stays down through the follow-through. Three of these have no
strike in them at all, which is the worse failure: the frame the hitbox goes
live on shows a fighter standing still.

| Fighter | Key | Pose | Kind | Ask |
|---|---|---|---|---|
| Kinji Hakari | `hakari` | `crouch_attack_b` | Pose | Standing upright, arms loose at his sides — no strike and no crouch, it is a neutral stance |
| Jogo | `jogo` | `crouch_attack_b` | Pose | The idle hunch with the arms hanging. No strike of any kind |
| Takako Uro | `uro` | `crouch_attack_b` | Pose | Upright, legs wide, arms spread. Nothing is attacking |
| Megumi Fushiguro | `megumi` | `crouch_attack_a` | Pose | One-legged knee raise, hands slack, and the whole body floats clear of the ground line |
| Megumi Fushiguro | `megumi` | `crouch_attack_b` | Pose | Upright torso, leg swung out at hip height — a standing kick |
| Mahito | `mahito` | `crouch_attack_a` | Pose | Mid-stride knee raise, feet off the ground, hands doing nothing |
| Toge Inumaki | `inumaki` | `crouch_attack_b` | Pose | Torso fully vertical at idle height with a waist-high side kick |
| Kento Nanami | `nanami` | `crouch_attack_a` | Pose | Wide standing stance, cleaver chambered at the hip — the rest of his set crouches properly |
| Yuta Okkotsu | `yuta` | `crouch_attack_b` | Pose | Upright wide stance; only the sword tip dips low |
| Hanami | `hanami` | `crouch_attack_b` | Pose | Standing at full idle height; the low sweep is carried entirely by a branch, not the body |

Megumi's and Mahito's `crouch_attack_a` share a second fault worth calling out:
**the figure is airborne.** A raised knee with both feet clear of the ground is a
jump pose. A crouching attack starts from the floor and stays on it.

### Pose lines

| Pose | Pose line |
|---|---|
| `crouch_attack_a` | crouched low as in `crouch_a`, hips at heel height, winding up a strike from that low position — weight loaded onto the back leg, striking hand or weapon drawn back near the floor, both feet planted |
| `crouch_attack_b` | the same low crouch, the strike now extended forward at ankle-to-knee height and travelling further in the direction `_a` was winding — hips rotated through, still down, head no higher than in `_a` |

The flip test from
[The second frame has to finish the first](#the-second-frame-has-to-finish-the-first)
applies unchanged: put `_a` beside `_b` and every part of the body that was
moving must have moved **further in the same direction**. A `_b` that is taller
than its `_a` is a rising attack, and rising attacks are `attack_up`.

---

## 13C. Light-attack pairs that do not reach — 7 sprites

All `pose`. `attack_light_a`/`_b` is a wind-up and a strike, and `_b` is the
frame that appears as the move becomes active. These have the fist or weapon
still tucked into the body on `_b`, so the fighter connects while visibly not
reaching — the readability problem `REACH_SCALE` exists to fix, coming from the
other direction.

| Fighter | Key | Pose | Kind | Ask |
|---|---|---|---|---|
| Mei Mei | `meimei` | `attack_light_b` | Pose | The axe is drawn back at her hip and her lead arm trails behind her — this is a wind-up |
| Mei Mei | `meimei` | `attack_light_a` | Pose | And this is the fully extended thrust. **The pair is inverted:** it plays extended, then retracted |
| Mahoraga | `mahoraga` | `attack_light_b` | Pose | The blade stays across the body, tip pointing down and back. Nothing reaches forward |
| Mahoraga | `mahoraga` | `attack_light_a` | Pose | Same on the wind-up — the sword never leaves the body line. **Neither frame of the pair extends** |
| Jogo | `jogo` | `attack_light_b` | Pose | Claws stay at chest height; the arms never commit forward |
| Choso | `choso` | `attack_light_b` | Pose | Less extension than his own `_a` — a mild version of Mei Mei's inversion |
| Reggie Star | `reggie` | `attack_light_b` | Pose | Not wrong, but near-identical to `_a`: the pair has no wind-up-to-strike read at all |

Mei Mei is the one to draw first and the clearest statement of the whole class:
**the two frames she has are both correct drawings, in the wrong order.** If
re-drawing is expensive, hers is fixable by swapping which file each frame is
imported as — but the swap has to go through the workbench, because `ox`,
`bodyBottom` and `renderScale` are per-frame and would otherwise follow the
wrong art.

### Pose lines

| Pose | Pose line |
|---|---|
| `attack_light_a` | winding up a fast strike, striking hand or weapon drawn back beside the body, shoulders coiled away from the target, weight on the back foot, lead arm up as a guard |
| `attack_light_b` | the strike fully extended and travelling forward — arm or weapon at full reach out in front of the body, shoulders rotated through, weight transferred onto the front foot, the drawn-back hand now recovered to the chest |

For an armed fighter the weapon leads: the axe head, blade tip or claw is the
furthest thing forward in the frame, and clear of the body silhouette.

---

## 13D. One wrong direction, one wrong person — 2 sprites

| Fighter | Key | Pose | Kind | Ask |
|---|---|---|---|---|
| Suguru Geto | `geto` | `attack_down` | Pose | Both palms are raised **above his head** in an overhead chop. Nothing in the pose is directed downward |
| Reggie Star | `reggie` | `crouch_attack_b` | Character | The suit-and-umbrella design — not the fighter in his `idle_a` |

**Geto's is the only inverted direction on the roster.** `attack_up` is right on
all 24 fighters and `attack_down` on 23; this one frame reaches up where it
should drive down. Pose line:

| Pose | Pose line |
|---|---|
| `attack_down` | driving both palms downward at the ground in front of him, arms extended down and forward below the waist, knees bent and weight dropped over the strike, torso pitched forward, cursed energy gathering at the hands |

**Reggie's is the last of the twelve, and the only one still outstanding.** His
`attack_air_a` `attack_air_b` `attack_heavy_a` `attack_heavy_b` came back
on-model in 12A's second batch; `crouch_attack_b` is the same wrong design — a
dark-haired man in a suit with a purple umbrella — but it was never flagged,
because that pass swept by row rather than by frame. Draw it from
`assets/reference/canon/reggie_idle.png` and nothing else, exactly as his other
four were.

12A's crouch note lists `reggie/crouch_attack_b` among the poses that are "not
crouched". It is not — the pose is a genuine low lunge with the umbrella at
floor level, and it is the only thing about that frame that *is* right. The
fault is the character, which is why it is requested here as `character` rather
than as a crouch.

---

## Re-running this sweep

Worth repeating after any delivery lands, and the reason 13A's split showed up at
all. Render every frame of a pose class across all characters onto one board at
final in-game scale on a shared ground line — `tools/size_board.py` already does
the compositing per character — then read each pose against the action it is
bound to in `SEMANTIC_ANIMS` (`src/characters.js`).

The one number worth computing alongside it is **drawn silhouette height against
the same character's `idle_a`** — `(bodyBottom - oy) × renderScale`, as a ratio.
It does not decide anything on its own (an arm over the head inflates it, which
is exactly why the old `gojo/crouch_attack_b` measured 1.12), but it ranks the
crouch rows for review in seconds and it is what made the 0.60/0.87 gap visible.
Verdicts still come from looking, per §4 of the audit guide.

Two traps this sweep hit, for whoever runs it next:

- **Mirror `faceLeft` frames before judging direction.** Nineteen attack frames
  carry the flag, and read raw they look like they strike backwards. Three
  frames were nearly filed as defects that way.
- **Read a/b pairs together, never one at a time.** Mei Mei's inverted pair is
  invisible frame by frame — both drawings are good — and only shows up when the
  two are flipped between in the same spot, which is what the workbench's
  up/down pose stepping is for.

---

## 13E. Install auras — 3 sprites

Carried over from round 12, where it was 12D. The three sprite parts of
that round are delivered and it is closed; this is the only piece that
never arrived, and it is effect art rather than a pose, so it moves here
rather than keeping a round open on its own.

The install system draws a character-sized aura sprite behind a powered-up
fighter (`drawInstallAura`, `src/render.js`) — Nanami's Overtime has
`aura_gold.png`, Jogo's Furnace Shell `aura_orange.png`, and so on. Three
installs ran on a procedural ellipse because no aura was ever drawn for
them. The engine now names these files and ships **procedural placeholders**
for all three (soft gradient plates, generated in code) — so the slots are
live, and a delivered drawing replaces its placeholder through the normal
intake with no code change.

| File | Install | What to draw |
|---|---|---|
| `aura_jade.png` | Maki — Split Soul Stance / Awakening | **Not cursed energy** — she has none, and that is the point. A faint pale-jade `#b8ffe2` afterimage shell: thin vertical speed-line streaks and a barely-there rim, reading as air sheared by speed rather than as a glow. The most restrained aura in the set. |
| `aura_slate.png` | Panda — Gorilla Mode | Heat-shimmer and steam rolling off the body: soft slate-grey `#8ea0b8` vapour with a faint warm orange-red rim at the shoulders, dense at the bottom, ragged at the top. Physical heat, not energy. |
| `aura_indigo.png` | Yuji — Unbreakable Grit | A low, dense, dark blue-grey `#4a5578` aura hugging the silhouette, heaviest at the planted feet and forearms — endurance, weight, dug-in. No flames, no sparkle. |

Match the existing aura set for format: **portrait plate, the aura alone on the
key screen, no character in the image** — the engine composites it behind the
fighter's own sprite at body size. Open `assets/sprites/effects/aura_gold.png`
beside these before drawing; same canvas proportions, same soft-edged
translucency (the delivery is opaque on the key screen; intake cuts the alpha).
Key on magenta `#FF00FF` for jade and indigo; **grey `#808080` for
`aura_slate`** (its warm rim would fight a magenta key).

Deliver to:

```
assets/intake/effects/aura_jade.png
assets/intake/effects/aura_slate.png
assets/intake/effects/aura_indigo.png
```

---

## Round 15A (part), 15B and 15D (part) — Mechamaru, Yuki and Dagon

Three complete 36-pose sets, the nine technique effects, and three hero cards:
**120 assets**, and the first delivery drawn against
[pose-brief.md](../sprites/docs/pose-brief.md). The three fighters came out of
`STAGED_CHARACTER_KEYS` and onto the select screen the same day — Mechamaru with
the students, Yuki with the other sorcerers, Dagon with the curses. Their kits
had been live and testable in code since before any art existed, so promoting
them was two lines and nothing else.

**Kurourushi's set was not delivered** and he stays staged, along with 15C's
summons and 15E's domain backdrop. All three remain open in
[asset-requests.md](asset-requests.md).

### What the round taught the tools

**The facing detector mirrored five frames that were already right.** It called
them left-facing with confidence and flipped them — Mechamaru's `attack_light_b`,
`attack_up` and `hurt`, Yuki's `attack_light_b`, Dagon's `special_side`. A
mirrored punch is the worst kind of wrong, because it still looks like a
perfectly good punch: Yuki's light strike measured **+3.6%** reach past her idle
in that state and **+11.3%** once turned back. All five are named in
`FACING_OVERRIDE` in `tools/intake.py`, which is the mechanism that exists for
exactly this, and the review boards are where it was caught — which is the
argument for rendering them before importing rather than after.

**Effects must never be auto-mirrored at all.** The facing rule is a *character*
rule: fighters are drawn facing right and mirrored by the engine when they turn.
Travelling effects are the opposite — the projectile renderer mirrors them when
they fly right, so they are drawn pointing LEFT — and the rest have no facing to
speak of. Running the detector over `effects/` turned `egg_shot` around, which
was delivered pointing left exactly as asked. `tools/intake.py` now carries
`NO_MIRROR_DIRS`, and the whole directory is exempt.

**The green-fringe check only means something on a green screen.** It counts
key colour surviving on the silhouette edge, and it fired on every pixel of the
outline of three mint-green cannon beams delivered on magenta. It now reads the
screen colour that was actually keyed out before deciding whether green at the
rim is contamination or art.

**Flagging a pose is not placing it.** Flagging the four poses below took them
off the workbench's updated list, because `apply_sprite_adjustments.py` treated
any adjustment as the placement work the list is asking for. Saying "this has to
be redrawn" and "this is sized and grounded" are different answers; only a
placement field clears the marker now.

### What the delivery got wrong

Every set missed the same criterion — `attack_heavy_b` extending a third of
standing height past the fighter's own idle. Yuki's reached 9%, Dagon's 16%,
Mechamaru's 20%. Dagon's `crouch_b` drops 21% where a quarter is asked, and
Mechamaru's `run_reach_a` arrived as a four-figure contact sheet and was not
imported. They are [18A](#18a-caught-while-placing-the-round-15-sets--12-sprites), with the rest of what the placement passes found.

Everything else landed: the crouch pairs, the light pairs, the idles, the run
cycles, the costumes and all nine effects.

### 15B, as it was written

Each of these is drawn on a key screen with **no character in the frame** — the
engine composites them itself. Travelling effects must **point LEFT** (see
[Directional effects point LEFT](asset-requests.md#directional-effects-point-left)); the ones
that do are marked.

| File | Fighter | Used by | What to draw |
|---|---|---|---|
| `ultra_cannon.png` ◀ | Mechamaru | Ultra Cannon (neutral) | A compact bolt of pale mint-green `#63c7b0` cursed energy with a hard white core and a spiral of exhaust behind it — fired, not thrown. Reads as artillery |
| `pigeon_orb.png` | Mechamaru | Pigeon Viola, in the ultimate | One small tracking orb: a white core in a mint-green shell with a short comet tail. Five of these fly at once, so keep it simple and readable at 64 px |
| `ultimate_cannon.png` ◀ | Mechamaru | Ultimate Cannon, the ultimate's finisher | The three-barrel blast: three converging beams braided into one column, white-hot at the core, mint-green at the edges, wide enough to read as a screen-crosser |
| `star_rage_impact.png` | Yuki | Bombaye (neutral) **and** the ultimate | The moment mass arrives: a hard white shock-ring with amber-gold `#ffb703` fracture lines radiating out, and the air behind it visibly displaced. No flame, no cursed-energy glow — this is weight, not fire |
| `tide_wave.png` ◀ | Dagon | Disaster Tides (neutral) | A rolling wall of sea-blue `#2f8fd8` water, crest breaking forward, foam along the top edge. Wider than it is tall |
| `shikigami_fish.png` ◀ | Dagon | Death Swarm (ultimate) and the summon fallback | One man-eating shikigami mid-lunge: eel-bodied, too many teeth, fins that read at small size. Drawn as a single creature, not a shoal |
| `egg_shot.png` ◀ | Kurourushi | Egg Volley (neutral) | A small dark cursed egg in flight with a wet maroon sheen and a thin trail of already-hatching specks behind it. Tiny — 54 px tall in play |
| `blinding_sacs.png` | Kurourushi | Earthen Insect Trance (down) | A drifting cluster of flying insect curses carrying translucent sacs of ochre `#7c6a3a` liquid, some burst and leaking. A cloud, wider than tall, with ragged edges |
| `aura_chitin.png` | Kurourushi | Parthenogenesis (ultimate install) | An install aura: **the aura alone, no character**, portrait plate, matching `assets/sprites/effects/aura_gold.png` for format. A dense maroon `#8f3b4e` shell of crawling chitin and antennae silhouettes, thickest at the shoulders, ragged at the top |

Deliver to `assets/intake/effects/<name>.png`.

**Not requested, and deliberately:** Simple Domain (the circle) and Undertow
(the spiral) are drawn procedurally in `src/render.js` and `src/specials.js` and
look correct as they are. They need no art and none should be made for them.

---

# Round 14 — reach and stance, delivered in two batches

**14A and 14B are complete and 14C is three-fifths in.** 38 sprites landed on
2026-08-09 and are in the manifest, but not in the game: every one came in as a
held-back replacement, so the pose points at the new drawing for the workbench
to place while `awaitingApproval.live` still names the old one, and that is what
a match draws. What is left on those 38 is the **approval pass** — open each
pose in the [sprite workbench](../sprites/workbench/), stand it beside what is shipping,
and say yes or keep.

Still outstanding: **`choso/attack_light_b` and `geto/attack_down`**, the two
14C poses that are already in the game and were asked to be improved further.

`gakuganji/attack_air_a` arrived in that batch too. It was asked for below as an
**alternate** and it came through the ordinary import instead, so it is waiting
as a held-back replacement rather than as a chevron variant. The outcome is the
same either way — approve and keep both bank the drawing they turn down — but it
is worth knowing which door it came in by when the approval pass reaches it.

The raw plates are archived at `assets/reference/round14/`. The delivery is
disjoint from what round 13 left waiting: no `(character, pose)` appears in
both, so the two approval passes do not interact.

**Reach is now gameplay.** Until this month a fighter's melee range was a
hand-typed number in `characters.js` with no relation to their sprites, and the
hitboxes it produced reached about 2.1× as far as the art. That is gone: a
move's hitbox is now the distance the character's own committed swing is
*painted* to reach, plus a fixed 34 px of forgiveness that is the same for
everybody (`src/silhouette.js`, `MELEE_GRACE`). The full measurement and
rationale is in [hitbox-audit.md](hitbox-audit.md).

Which means the drawings below are no longer only a readability problem. **A
fighter whose strike pose does not extend now has short range in play**, and a
fighter drawn broad is a broader target. The art is the balance data.

- **14A** — heavy-attack strike frames that do not extend (16 sprites)
- **14B** — a consistent idle stance, for the ten outliers (20 sprites)
- **14C** — five caught while placing rounds 12 and 13 (5 sprites) — *3 delivered*

**41 sprites in total, 38 of them delivered.** None of it is blocking: every
fighter plays today, and each delivery re-derives that character's numbers on
import with no code change.

Round 13 was the companion to this and has landed: its 13C asked for seven
**light**-attack strike frames that did not reach, and 13A/13B for the crouches.
14A is the same defect in the **heavy** row, which 13's sweep did not separate
out — so those deliveries are the reference for what "extends" means here.

---

## 14A. Heavy strike frames that do not extend — 16 sprites

### Why

`attack_heavy_a`/`_b` is a wind-up and a strike, and `_b` is what is on screen
while the smash is active. Measured across the roster — from placed art only,
and in the world pixels the game draws at — the furthest a fighter's committed
swing reaches in front of themselves runs from **66 px to 108 px**. That is a
1.6× spread, and it does not line up with what these characters are holding:

| Fighter | Art reach | Holding |
|---|---|---|
| Panda | 108 px | bare paws |
| Yuta, Hanami | 96 px | katana / root-arms |
| Yuji, Todo, Jogo, Choso, Geto, Mei Mei | 90 px | fists, mostly |
| Megumi, Momo, **Nanami** | 84 px | **cleaver blade** |
| **Maki**, **Toji**, Sukuna, Mahito, Hakari, Inumaki | 78 px | **naginata**, **spear** |
| **Uro**, **Reggie** | 72 px | polearm / blade |
| **Gakuganji**, Gojo, Nobara | 66 px | **guitar** |

Gakuganji swings a full-size electric guitar and reaches less far than Panda's
paw. Maki's naginata and Toji's spear reach less far than Yuji's fist. That is
not a balance decision anybody made — it is the poses not extending, and it is
now the thing that decides their range.

**Four of these are a placement job, not a drawing job.** Maki's
`attack_heavy_a` and both heavy frames for Gakuganji, Uro and Reggie have never
been through the sprite workbench's placement pass, so they sit at the intake
pipeline's guess at their scale. The game deliberately ignores unplaced frames
when measuring (it would otherwise hand out ranges that change the moment
somebody opens the workbench), so those four fighters are currently being judged
on half their heavy row. **Place them first** — `node tools/audit_hitboxes.mjs`
lists them, and their numbers may well move on their own.

### What to deliver

Eight fighters, both frames of the heavy pair, drawn to the pose lines below.

| Fighter | Key | Poses | Ask |
|---|---|---|---|
| Gakuganji | `gakuganji` | `attack_heavy_a`, `attack_heavy_b` | The guitar is held across the chest through the whole swing. It should come round and finish out in front, headstock leading, well clear of the body |
| Maki | `maki` | `attack_heavy_a`, `attack_heavy_b` | The naginata stays inside her silhouette. A polearm smash ends with the blade at the far end of a two-handed thrust or sweep — the longest weapon on the roster should read as the longest |
| Toji | `toji` | `attack_heavy_a`, `attack_heavy_b` | Same: the Inverted Spear finishes tucked. He is the roster's weapons specialist and currently out-ranged by a fist |
| Nanami | `nanami` | `attack_heavy_a`, `attack_heavy_b` | The blunt cleaver ends roughly level with his own shoulder. His whole kit is about hitting at a measured distance (the 7:3 band) and the art has to show that distance |
| Uro | `uro` | `attack_heavy_a`, `attack_heavy_b` | Place first (see above), then extend if it still reads short |
| Reggie | `reggie` | `attack_heavy_a`, `attack_heavy_b` | Place first, then extend |
| Sukuna | `sukuna` | `attack_heavy_a`, `attack_heavy_b` | The King of Curses' heavy is a compact chest-height slash. It should be his full span — this is the character who cleaves buildings |
| Gojo | `gojo` | `attack_heavy_a`, `attack_heavy_b` | Lapse Palm ends with the palm barely past his own chest. A thrown palm strike ends with the arm locked out |

### Pose lines

| Pose | Pose line |
|---|---|
| `attack_heavy_a` | the wind-up of a committed, heavy swing: weapon or striking arm drawn fully back and low behind the body, shoulders coiled hard away from the target, weight entirely on the back foot, front foot light. Bigger and slower than the light wind-up — this is a move that takes a moment |
| `attack_heavy_b` | the follow-through at full extension: weapon or arm at maximum reach, arm locked out or the polearm at the end of its sweep, shoulders rotated fully through past square, hips turned, weight driven onto the front foot. **The furthest-forward thing in the frame is the weapon or the fist, and it is clear of the body silhouette by at least half a torso width** |

The comparative test, and the thing to check before delivering: **lay
`attack_heavy_b` over `idle_a` at the same scale. The weapon or striking hand
must sit further forward than anything in the idle by at least a third of the
figure's standing height.** For an armed fighter it should be more. If the two
silhouettes have roughly the same front edge, the pose is a stance, not a strike.

Match each fighter's canonical reference image for costume, proportions and line
weight. Same delivery spec as everything else.

Deliver to:

```
assets/intake/<character>/attack_heavy_a.png
assets/intake/<character>/attack_heavy_b.png
```

---

## 14B. A consistent idle stance — 20 sprites

### Why

Hurtboxes are now measured from each fighter's own art rather than being one
64×108 box for the whole roster. Height works well: heights were solved against
a common target years ago, so a taller fighter is a taller target and the
numbers are trustworthy.

**Width is not.** Measured across the roster's idles, body width runs from
**0.21 to 0.50 of the fighter's own height** — and that spread is drawing style,
not character. Yuji's idle is a slim three-quarter turn; Jogo's is square-on
with his cape spread. Neither fact should decide how easy they are to hit, and
at the moment they would.

The game currently trusts that measurement only 45% of the way
(`BODY.widthTrust`), compressing everyone toward a typical body. That is a
compromise standing in for consistent art — it means a genuinely broad fighter
is under-represented and a slight one over-represented, because the data cannot
be trusted on its own. **Consistent idle stances would let that number go up and
make silhouette a real characteristic.**

Note this is the one row round 13's sweep deliberately excluded, and 12B has
since redrawn the run — so the idle is the remaining unaudited pose, and the one
that now carries the most mechanical weight.

### What to deliver

`idle_a` and `idle_b` for the ten fighters whose measured width falls outside
**0.30–0.45 of their own drawn height** — ten of the twenty-two with placed idle
art, so **20 frames**. The other twelve are already inside the band and need
nothing.

| Too narrow — drawn edge-on | ratio | | Too broad — costume, not body | ratio |
|---|---|---|---|---|
| Yuji | 0.21 | | Sukuna | 0.49 |
| Inumaki | 0.25 | | Jogo | 0.50 |
| Choso | 0.25 | | Mahoraga | 0.80 |
| Mahito | 0.27 | | | |
| Yuta | 0.27 | | | |
| Nobara | 0.29 | | | |
| Megumi | 0.29 | | | |

Mahoraga at 0.80 is the extreme and is partly legitimate — he is a genuinely
enormous shikigami with a tail, and the karma wheel on his headdress is part of
his sprite like everything else he wears. Four-fifths as wide as he is tall is
still a square, though, and the width is carried by the tail sweeping out behind
him rather than by his body. Worth checking against play before asking for a
redraw: a hurtbox that wide is a real disadvantage, but so is a general who
cannot fit his own tail.

`node tools/audit_hitboxes.mjs` prints the live figures; re-run it after any
delivery rather than trusting this table.

The ask is not a redesign. It is one framing rule applied to all of them:

| Pose | Pose line |
|---|---|
| `idle_a` | standing ready, **square to the camera in a three-quarter turn of no more than about 20 degrees**, feet about shoulder-width apart, arms relaxed at the sides or lightly raised, nothing held out away from the body. Weapons carried close — at the side, on the shoulder, or across the back — not extended, not spread |
| `idle_b` | the same stance one breath later: chest a little higher, shoulders a little back, same footprint. **The silhouette's outer edges must not move between the two frames** |

Three specific things to avoid, because they are what the measurements caught:

- **A deep three-quarter or profile turn.** Yuji, Inumaki, Choso and Nobara are
  drawn nearly edge-on, which makes them measure as narrow as a post.
- **Capes, coats and hair spread wide.** Jogo, Sukuna and Gakuganji measure
  broad because of what is *around* them rather than what they are. Costume
  should hang, not fan.
- **Weapons held out.** A held weapon is deliberately excluded from the width
  measurement (`coreLeft`/`coreRight` in `tools/bake_anchors.py` trims it), but
  the trim works best when the weapon is a clear sliver beside the body rather
  than crossing it.

Deliver to:

```
assets/intake/<character>/idle_a.png
assets/intake/<character>/idle_b.png
```

**Important:** the idle is also what every fighter's *size* is solved against
(`docs/character-heights.md`), so a redrawn idle rescales that fighter's entire
sprite set. Deliver these one fighter at a time and expect a workbench pass on
each — this is the one pose where that is unavoidable.

---

## 14C. Caught while placing rounds 12 and 13 — 5 sprites

Poses flagged in the sprite workbench during the placement passes over rounds
12 and 13, rather than by a sweep. They are here rather than in a round of their
own because 14 is the open round for art faults and five poses do not justify a
fifteenth.

**Two of these are already in the game.** Choso's light follow-up and Geto's
down-smash were approved during round 13's pass because they are better than
what they replaced — the ask is to improve them further, not to undo them. That
is the normal case for a `pose` or `alternate` flag on art that has already been
let in: approving and requesting are separate answers, and a drawing can be
worth shipping and worth redrawing at the same time.

| Fighter | Key | Pose | Kind | What is wrong |
|---|---|---|---|---|
| ~~Yoshinobu Gakuganji~~ | `gakuganji` | `attack_heavy_b` | Pose | **Delivered, awaiting approval.** Reads poorly for the action it stands for. Note that 14A already asks for the heavy row to *extend* — this is the same row and should be drawn with that brief in hand. |
| ~~Yoshinobu Gakuganji~~ | `gakuganji` | `attack_air_a` | **Alternate** | **Delivered, awaiting approval** — as a held-back replacement rather than a chevron variant, see the round note above. "AI hand drawing error" — the hands are malformed. Asked for as an **alternate**, not a replacement: the pose itself is right, so the delivery lands beside the current drawing and the better of the two is chosen by eye. |
| ~~Takako Uro~~ | `uro` | `prone` | Character | **Delivered, awaiting approval.** "Costume doesn't match canonical exactly" — check against `assets/reference/canon/uro_idle.png`, which is the design the rest of her set was drawn from. |
| Choso | `choso` | `attack_light_b` | **Alternate** | "AI hand drawing error" — the hands are malformed. **In the game already**, and better than what it replaced; the alternate is to fix the hands without losing the pose. |
| Suguru Geto | `geto` | `attack_down` | Pose | "Should be a more powerful downward smash" — **in the game already**, and an improvement on what it replaced, but it reads as a drop rather than a smash. `downHeavy` is a committed strike; the body should be behind it. |

`attack_air_a` is the first use of **Request alternate**: it comes back as a
second option on the pose rather than overwriting what is there, the chevron in
the workbench gets a dot, and nothing on screen changes until somebody picks.
See [asset-pipeline.md](../sprites/docs/asset-pipeline.md#request-alternate).

`uro/prone` is a costume note on a pose that is otherwise fine, so a redraw
should keep the pose and the framing and only correct the outfit.

Mahoraga's three round-13 poses were **rejected rather than flagged** — they
arrived without the karma wheel, so they never entered the game and the art they
would have replaced is still in play. Their asks are re-stated in
[17B](#17b-mahoraga--three-poses-that-never-extended--3-sprites).

---

# Round 15 — four new fighters, delivered

**Four new fighters: Mechamaru, Yuki Tsukumo, Dagon and Kurourushi.**

**Three of the four have landed.** Mechamaru, Yuki and Dagon delivered their
full 36-pose sets, all nine technique effects and three of the four hero cards;
they are out of `STAGED_CHARACTER_KEYS` and on the select screen. What that
delivery answered is recorded in
[asset-requests-history.md](asset-requests-history.md#round-15a-part-15b-and-15d-part--mechamaru-yuki-and-dagon).

What is still open in this round:

- **15A** — **Kurourushi's** set (36 sprites)
- **15C** — summon minions (4 sprites)
- **15D** — Kurourushi's hero card (1 image)
- **15E** — Dagon's domain background (1 image)

**42 assets in total, none of it blocking.** Kurourushi stays staged until his
set lands — his kit is live in code and testable, and nothing else waits on him.
The three delivered fighters play today; their summons and Dagon's domain
backdrop fall back to procedural art until 15C and 15E arrive.

## 15A. Kurourushi's sprite set — 36 sprites

**36 poses.** The same semantic set every fighter on the roster now has
(`SEMANTIC_ANIMS`, `src/characters.js`) — no sprite sheet, no grid cells, one
drawing per action. Mechamaru's, Yuki's and Dagon's sets have been delivered
against this brief; **only Kurourushi's is outstanding**, and the three that
landed are the reference for what a set that arrives whole looks like:

```
idle_a  idle_b
run_reach_a  run_pass_a  run_reach_b  run_pass_b
dash  jump_rise  fall  land
crouch_a  crouch_b  crouch_attack_a  crouch_attack_b
guard  ledge_hang  dodge_roll  dodge_air
attack_light_a  attack_light_b
attack_heavy_a  attack_heavy_b
attack_air_a  attack_air_b
attack_up  attack_down  charge
special_neutral  special_side  special_down
ult_a  ult_b
hurt  dizzy  prone  victory
```

**The pose lines are in [pose-brief.md](../sprites/docs/pose-brief.md), and that file is what
these four should be drawn from.** It is the standing brief for a whole set —
every pose line, the `_a`/`_b` flip test, the framing rule, and the list of
faults that have each cost the roster a re-request. It exists because the pose
lines used to live scattered across the rounds that happened to ask for them,
which meant a new character was drawn from whatever the last round remembered.
Reading it first is the difference between getting a set right once and
re-requesting it. It did not fully work on the first three: every one of them
came back with a heavy strike that does not extend far enough, which is the
brief's own headline criterion and is now round 17.

Four of its rules are worth repeating here, because they are measurable and
because reach is now taken off the art (`src/silhouette.js`) — a pose that does
not extend is a fighter with short range in play. **All three delivered sets
missed the first one**, so it is the one to check with a ruler before sending
anything:

- `attack_heavy_b` must put the weapon or fist **further forward than anything
  in that fighter's own `idle_a` by at least a third of their standing height**.
- `attack_light_b` is the same rule at a shorter reach: it must extend past
  `idle_a`, because a light attack that stays inside the idle silhouette has no
  range at all. This is 13C in one line, and it is the single most
  re-requested fault on the roster.
- `crouch_a`/`crouch_b` must drop the head **by at least a quarter** of standing
  height. Not a fighting stance — a crouch.
- `idle_a` must be a **plain, square-on standing stance** — arms in, weapon
  held close, nothing spread. Hurtbox *width* is measured off the idle, so a
  cape thrown wide or a three-quarter turn is not a style choice here: it makes
  that fighter easier or harder to hit than the numbers intend. That is
  [14B](#14b-a-consistent-idle-stance--20-sprites), open for twenty existing
  fighters, and these four are the chance not to join it.

**Framing counts double**, for the same reason: a pose that
extends needs the margin drawn for it, rather than the figure enlarged until the
reach falls off the plate. See [the reach margin](../sprites/docs/pose-brief.md#1-the-rules-that-hold-for-every-pose).

### What each fighter is holding, and what their poses are of

| Fighter | Key | Weapon / signature | Notes for the action poses |
|---|---|---|---|
| Mechamaru | `mechamaru` | Blades that extend from the right forearm (Sword Option); cannon ports in both palms | A puppet, not a person: joints are visible seams, the face never changes expression, and the grin is fixed in every pose including `hurt` and `dizzy`. `special_neutral` is a palm thrust forward with the port open (Ultra Cannon); `special_side` is a forward lunge with cursed energy venting from both elbows (Boost On); `special_down` is a braced two-handed guard stance inside a circle (Simple Domain). `ult_a`/`ult_b` are the Mode: Absolute firing stance — feet planted wide, both palms forward, head tilted back |
| Yuki Tsukumo | `yuki` | Bare fists | Everything she does is taijutsu, so her attack poses are boxing: `attack_light_*` a jab, `attack_heavy_*` a full hook with the hips through it, `special_neutral` a committed straight with the whole body behind it (Bombaye). `special_side` is a summoning gesture with Garuda's coils behind her; `special_down` is the same braced Simple Domain stance as Mechamaru's, hers unarmed. `ult_a`/`ult_b` are the wind-up and the release of one enormous punch |
| Dagon | `dagon` | No weapon — water and his own bulk | Heavy and hunched; the wings at his lower back let him hover, so `jump_rise`, `fall` and `dodge_air` should read as **levitation**, not a jump. `special_neutral` is a sweeping arm across the floor sending water out; `special_side` is shikigami tearing out of his own chest; `special_down` is both arms drawing inward, water spiralling in (Undertow). `ult_a`/`ult_b`: arms spread, fish streaming out of him |
| Kurourushi | `kurourushi` | The **Festering Life Sword** — a long dark blade with six firing barrels along its spine | The shroud reaches the floor, so its legs are only visible in motion: for `run_*`, `dash` and `dodge_roll` show the insect legs beneath a shroud that lifts. It can produce up to four arms — use two normally, four for `ult_a`/`ult_b` and `attack_heavy_*`. `special_neutral` is the sword levelled, barrels toward the target; `special_side` a sweeping arm trailing roaches; `special_down` a hand thrown up releasing flying sacs |

Deliver to:

```
assets/intake/<character>/<pose_key>.png
```

Key: `kurourushi`, spelled exactly like that, matching `src/characters.js`.
(Round 7 lost time to art arriving in `gakuganjii/`.) The curse is
**Kurourushi**; "Kuroroshi" and "Kuro-Urushi" are the same character and neither
is the key.

**Key screen:** mid-grey `#808080` — his face is maroon with red-orange eyes,
which a magenta screen eats.

**One plate per pose.** Round 15A delivered `mechamaru/run_reach_a` as a strip
of four small figures on one canvas, which is a contact sheet rather than a
sprite: nothing in it is separable at full resolution and none of the four
clears the 600 px body minimum on its own. It was not imported, and it is round
17.

---

## 15C. Summon minions — 4 sprites

Persistent creatures that walk the stage on their own. Format follows round 8:
one creature per file, full body, facing **RIGHT** (the summon renderer mirrors
toward its target, and the kits that ship with right-facing art set `faceRight`).

| File | Fighter | What to draw |
|---|---|---|
| `garuda.png` | Yuki | Her shikigami: a large serpentine creature with pale bone-like plating along its length, a blunt armoured head, and a pair of floating wings held clear of the body that carry it. Gold-white `#ffcf5c` accents |
| `dagon_shikigami.png` | Dagon | The heavy end of his menagerie: a thick armoured crustacean-eel, deep sea-blue, plated shell, too many legs, mouth open. Bulkier than `shikigami_fish.png`, which is the fast one |
| `cockroach_swarm.png` | Kurourushi | Not one roach — a **swarm shaped like a body**: a dense knot of cursed cockroaches moving as one mass, roughly waist-high, individual insects readable at the edges |
| `kurourushi_child.png` | Kurourushi | Its offspring: an identical but smaller Kurourushi, same black shroud and maroon eight-eyed face, shorter antennae, no sword |

Deliver to `assets/intake/summons/<name>.png`.

> **Do not drop these into `assets/sprites/summons/` directly.** Files that land
> there skip `tools/intake.py` and keep their key screen, which draws as a solid
> magenta rectangle on stage — round 8's one real mistake, recorded in
> [asset-requests-history.md](asset-requests-history.md#round-8--summon-minions).

---

## 15D. Kurourushi's hero card — 1 image

Same spec as round 9A: **JPEG, portrait, full-bleed background** — a card, not a
keyed sprite. Character three-quarter or facing, dramatic lighting, a background
that reads at tile size, no text of any kind.

```
assets/intake/cards/kurourushi_card.jpg
```

Match the existing set in `assets/cards/` for crop and energy — the three
delivered with this round (`mechamaru_card.jpg`, `yuki_card.jpg`,
`dagon_card.jpg`) are the closest reference. Suggested backdrop, from where he
actually fights: a Sendai side street under a hanging swarm.

---

## 15E. Domain background — 1 image

`captivating_skandha.jpg` — the backdrop for Dagon's **Horizon of the
Captivating Skandha**, drawn to the same spec as the seven domain backgrounds
requested in round 9C.

```
assets/intake/backgrounds/captivating_skandha.jpg
```

Landscape, full-bleed, no characters, no text. A bright tropical shore: palms
along one side, an ocean stretching to a horizon that is too far away and too
flat, white sand, a beach umbrella and two lounge chairs sitting incongruously
in the middle distance (they are canon — Mahito and Kenjaku used them). The
whole point of the domain is that it is **pleasant**: a holiday postcard that
happens to be the inside of a curse. Keep the mid-tones open — the game dims and
colour-grades the plate behind the fight, and the renderer draws its own water
line and shoal over the bottom of the screen.

---

## When it lands

The order the three delivered fighters went through, which worked and is what
Kurourushi should follow:

1. `python3 tools/intake.py` over their sprite folder, then the review boards
   (`tools/intake_sheets.py`) **before importing anything** — that is where the
   contact-sheet `run_reach_a` and five backwards-mirrored frames were caught.
2. `intake_variants.py --auto` → `intake_import.py --approve` →
   `bake_anchors.py` → `auto_tune.py`. A brand-new pose has nothing to replace,
   so none of it waits for approval; the whole set lands on the workbench's
   updated list as new work to place.
3. Card into `assets/cards/`, effects copied to `assets/sprites/effects/` and
   run through `tools/prep_effects.py`, summons through `assets/intake/summons/`.
4. Move their key out of `STAGED_CHARACTER_KEYS` in `src/characters.js` and into
   a `CHARACTER_GROUPS` bucket in `src/config_menus.js`. Kurourushi is a curse.
5. `node tools/check_kits.mjs`, `node tools/audit_hitboxes.mjs` (their reach is
   derived from the art that just landed — it reports the new set as
   *provisional* until the placement pass), then `node tools/smoke_combat.mjs`
   and `node tools/smoke_staged.mjs`.

No other code change is needed at any point. The loader already knows their
effect, summon and domain-background paths and starts fetching them the moment
the key moves (`STAGED_EFFECT_KEYS` / `STAGED_SUMMON_KEYS` in `src/assets.js`).
Expect two optional 404s per promoted fighter until 15C and 15E land — the
summon and domain art the loader now asks for and nothing has drawn yet.

**Absolute `renderScale` does not need solving by hand.** A fighter's drawn size
comes from `heightCm` through `heights.js`, which solves the character's scale
against their own idle span, so a set imported at the pipeline's flat 0.25 comes
out at the right height on stage. What the placement pass is for is the
*relative* work: ground contact, centring, and the poses whose size the roster
holds uniform.

---

# Round 16 — the summons animate, delivered

**Summons became creatures.** Two engine changes opened this round, and both
of them are asking for art that did not exist as a concept before:

1. **Summons animate.** A summon used to be *one still image* held for its
   entire lifetime — which is why the renderer swayed and leaned them, because
   a single drawing pinned to the stage reads as a decal. They now play a small
   pose set (`src/config_summons.js`), the same way a fighter plays theirs.
2. **Summon specials roll a creature.** Megumi's side special was the Divine
   Dogs, every cast, forever; Mahito's was one transfigured human. Each summon
   special now names a **pool** and draws one entry per cast, never the same
   one twice running. Twelve creatures were written into those pools and none
   of them have been drawn.

- **16A** — the six-pose animation set for the five summons already delivered
  (30 sprites)
- **16B** — twelve new creatures, six poses each (72 sprites)

**102 sprites in total, and none of it is blocking.** Every pose falls back to
that creature's still, every creature without a still falls back to a borrowed
`effect:*` stand-in named in its kit config, and failing that to a procedural
glow. So the game plays today with placeholders, one delivered pose improves
one state, and nothing has to arrive as a complete set to be worth arriving.

**Deliver per creature, not per pose row.** Six poses of one creature is a
finished creature; sixty scattered poses is nothing playable.

---

## The pose set — the same six for every creature

| Pose key | What it is |
|---|---|
| `idle_a` | Standing, weight settled. The creature's portrait pose — this is also what everything else falls back to. |
| `idle_b` | The same stance a breath later: head/body raised or lowered, one limb shifted. Alternates with `idle_a` at 2.4 fps, so the difference should be small and organic, not a second pose. |
| `move_a` | Mid-stride / mid-wingbeat, one extreme of the cycle. |
| `move_b` | The other extreme. `move_a`/`move_b` alternate at 8 fps and are what plays whenever the creature is travelling. |
| `attack` | The strike itself, at full extension — the bite, the lash, the spit, the detonation lunge. Held for ~0.25 s, so it must read at a glance. |
| `hurt` | Flinch: recoiling **away from the viewer's right**, body compressed, head turned in. Played when the creature is hit — see "why `hurt` matters" below. |

**Every pose of a creature must be the same subject at the same scale, drawn
on the same canvas with the feet (or the hover centre) at the same height.**
The engine anchors these by the bottom of the image, exactly as it does the
single still, so a creature that changes size or floats up between `idle_a` and
`move_a` will visibly jitter. Draw the six as one sheet-in-spirit even though
they are delivered as six files.

The general rules in [pose-brief.md](../sprites/docs/pose-brief.md) hold for creatures too —
one zoom, margin on all four sides, no painted-in motion, and `attack` extends
past the creature's own `idle_a`. Only the pose *lines* differ, and those are in
the table above.

**Facing:** as with everything else, draw **facing RIGHT**. Three of the
delivered summons are flagged `faceRight` in `config_summons.js` and the rest
are mirrored on draw; keep each creature's six poses consistent with each
other and the flag sorts out the rest.

### Why `hurt` matters now

Summons take damage and can be destroyed, and as of this round a hit also
**staggers** one: it is shoved along the line of the blow, thrown off its own
behaviour for a beat, and popped off the floor if the hit was heavy enough.
Until `hurt` is drawn the engine sells that with a lean and a white flash on
whatever pose was showing, which works but reads as the same creature sliding.
A drawn flinch is the difference between "that summon was hit" and "that summon
is being beaten".

---

## 16A. Animation frames for the five delivered summons — 30 sprites

These five already have their single still in `assets/sprites/summons/`, and
that still stays exactly where it is — it is the fallback and the portrait.
**Open it before drawing and match it**: same creature, same colours, same
proportions, same canvas size. This request is the other five poses, plus an
`idle_a` that supersedes the still as the resting pose.

| Creature | Existing still | Character | Notes for the set |
|---|---|---|---|
| Divine Dog (White) | `divine_dog_white.png` | Megumi | Pale wolf-shikigami. `move_*` is a four-legged run; `attack` is the lunging bite the kit is named for. |
| Divine Dog (Black) | `divine_dog_black.png` | Megumi | Its twin in dark fur — draw the pair as one animal in two colourways, same poses, so they read as a matched set on screen (they are summoned together). |
| Rainbow Dragon | `rainbow_dragon.png` | Geto | Serpentine, iridescent. `move_*` is undulation, not legs; `attack` is the head-strike. |
| Transfigured Human | `transfigured_human.png` | Mahito | Shambling patchwork body. `move_*` is a lurch; `attack` is the moment before it bursts — arms out, body swelling. |
| Inventory Curse | `inventory_curse.png` | Toji | Hovering pact-bound curse. `move_*` is a hover cycle (it never touches the ground); `attack` is the gullet open, cursed tool emerging. |

Deliver to `assets/intake/summons/<file>_<pose>.png`, e.g.

```
assets/intake/summons/divine_dog_white_idle_a.png
assets/intake/summons/divine_dog_white_move_b.png
```

---

## 16B. Twelve new creatures — 72 sprites

Each of these is **live in the game right now**, rolling out of its character's
summon pool and fighting with real stats — wearing a borrowed effect sprite or
a coloured glow. The stats in `config_summons.js` are the brief: a creature
described as slow and enormous is slow and enormous in play, so draw the thing
the numbers describe.

The single still is optional for these: `idle_a` **is** the still, and the
loader falls back to it. Draw the six poses and nothing else.

### Megumi — the other shikigami (`SHIKIGAMI_POOL`)

Shadow-summoned beasts. All four share Megumi's palette: near-black bodies with
cool blue-violet `#7c8cff` cursed-energy edge light, as if cut out of shadow.

| Creature | File stem | What to draw |
|---|---|---|
| Great Serpent | `great_serpent` | An enormous shadow snake, body low and very long (it is drawn wide, not tall — 158 px of reach against 78 px of height). Head raised, jaw open. `attack` is the full-length strike. |
| Toad | `toad` | A squat toad-shikigami the size of a car, sitting rather than walking — it holds ground behind Megumi and lashes with its tongue. `move_*` is a settle/shuffle, not a hop. `attack` is the tongue out at full stretch. |
| Max Elephant | `max_elephant` | Vast four-legged shadow elephant, tallest thing in the pool (190 px) and unbothered by being hit. `attack` is the trunk sweep with a burst of water. `hurt` should barely rock — it is drawn heavy on purpose. |
| Rabbit Escape | `rabbit_escape` | ONE small shadow rabbit, drawn alone — the engine spawns three of them. Fast, light, comic, and completely expendable; `attack` is the flying leap that ends it. |

### Mahito — the other transfigurations (`TRANSFIGURED_POOL`)

Reshaped souls: stitched seams, mismatched limbs, patchwork blue-grey flesh
with violet `#b56cff` at the seams. They should look *made*, and made
carelessly.

| Creature | File stem | What to draw |
|---|---|---|
| Bloated Hulk | `transfigured_hulk` | A transfigured human reshaped for mass — huge torso, small head, arms that reach the floor. It walks over and keeps hitting; `attack` is a two-handed downward slam. |
| Crawler | `transfigured_crawler` | Reshaped for speed and drawn LOW to the ground: a body running on too many limbs, face turned up. Draw one; the engine spawns two. |
| Spitter | `transfigured_spitter` | Reshaped for range — a hovering torso with a distended mouth, trailing loose flesh. It never closes distance. `attack` is the mouth open mid-spit. |

### Geto — the rest of the collection (`CURSE_POOL`)

Stored cursed spirits. Unlike Mahito's, these are *whole* creatures with their
own designs — the variety across the four is the point. Violet `#7d58d8` energy.

| Creature | File stem | What to draw |
|---|---|---|
| Smallpox Deity | `smallpox_deity` | The canon curse: a squat pale figure covered in pox marks, arms folded, floating upright. Sickly green-white `#9fd07a` in the plague it coughs. Hovers; never lands. |
| Curse Hound | `curse_hound` | A cheap disposable curse in the shape of a lean four-legged hound, all mouth. Draw one; the engine spawns two. |
| Cursed Womb | `cursed_womb` | A bloated sack-bodied curse that lurches across the stage and detonates. Heavy, wet, unstable — `attack` is the moment it splits open. |

### Toji — the rest of the inventory (`INVENTORY_POOL`)

Curses he *keeps* rather than makes. Muted, tool-like, no cursed-energy glow of
his own — pale grey-green `#9fb8a8`.

| Creature | File stem | What to draw |
|---|---|---|
| Coil Curse | `coil_curse` | The one he lets off the leash: a coiled, chain-wrapped curse that uncoils to run. `attack` is the lunge, chain snapping taut. |
| Husk Curse | `husk_curse` | A hollow humanoid husk with a cursed blade still buried in its chest. It carries the weapon over and lets go — `attack` is the husk splitting and the blade coming free. |

---

## Integrating a round-16 delivery

Two flags in `src/config_summons.js`, and nothing else:

```js
divineDogWhite: { file: "divine_dog_white", delivered: true, poses: true, faceRight: true },
greatSerpent:   { file: "great_serpent", poses: true },
```

- `delivered` — the single still exists and should be fetched.
- `poses` — the six pose files exist and should be fetched.

Both default **off**, and both are off for everything undelivered, so the
loader never asks for a file nobody has drawn. Turn `poses` on for a creature
once *any* of its poses land: the fetch of each individual pose is optional, so
a half-delivered set is fine — a missing pose falls back to the still.

The files go through the normal intake (`assets/intake/summons/` →
`assets/sprites/summons/`); summon art is not in `manifest.json`, so there is
nothing else to register.

---

# Round 17 — Hanami to canon, Mahoraga, the last two round-13 catches, and the roster tiles

**Delivered in full.** 17A–17C and 17E landed first; **17D**, the simplified
card set, followed and is recorded below — all 27 tiles are in the repo.

**17A is the fourth time a fighter has been drawn as the wrong character** — after
Gakuganji, Reggie and Uro in 9E — and the first time it was caught in the request
rather than in the delivery. The section as first written named
`hanami_idle.png` as the design authority, which is the tree; it was rewritten
to point at the anime render before anything was drawn, and the set came back
on-model. His hero card (17E) was repainted to match and is in the game; the
tree card is archived at `assets/reference/cards_previous/tree_hanami/`.

**36 keys, not 39.** `attack_air`, `run_a` and `run_b` are standby fallbacks the
whole roster carries and nothing draws, so they were not flagged and were not
drawn. Hanami's three are still the tree. They only matter if the pair or the
four-frame cycle that superseded them ever goes missing.

## 17A. A full Hanami set — 36 sprites

Hanami's set is the oldest on the roster: it came in at round 6 as a redesign,
was re-pointed to the semantic pose table at round 11B, and has been patched a
pose at a time since. The result is a set drawn across three different rounds
with three different briefs, which shows most in the crouches and the run.

Round 13 delivered `crouch_b` and `crouch_attack_b` against that patchwork.
**Both were rejected at approval** rather than let in: fixing two poses inside a
set that is going to be redrawn whole buys a few weeks of slightly better art
and then throws the work away. The art they would have replaced is still in the
game and stays there until this set lands.

### ⚠ It is the wrong character, not a patchwork

**This section was written as a consistency redraw and it is not one.** Every
sprite Hanami has draws a **bark-and-foliage tree body** — grey-brown wood
grain, branch spurs off the shoulders, leaves, a flower growing out of a cracked
wooden face. Canon Hanami is a **lean pale humanoid curse**: bone-cream skin
under heavy black stripe markings, a rigid grinning mask-face crowned with tan
antler horns, one arm and shoulder bound in white cloth, black hakama, bare
clawed feet.

So this is the same fault 9E fixed for Gakuganji, Reggie and Uro, and 11A for
Mahoraga: a character block written from imagination rather than from the show,
then a full set drawn faithfully from it. The block above has been rewritten
from the render and the old wording is dead.

**Do not match `hanami_idle.png`.** As this section was first written it named
that file as the design authority, which would have produced a fourth tree — the
exact way 13's Mahoraga delivery lost the karma wheel, one step earlier in the
pipeline. His canon is
[`assets/reference/canon/hanami_anime.png`](../assets/reference/canon/hanami_anime.png),
marked ⚠ in
[The canonical reference image](asset-requests.md#the-canonical-reference-image--one-per-fighter).
The idle is still what his **size** is solved against — 220 cm, `scale: 0.58`,
second-tallest on the roster. Match its scale, not its design; check against
`roster_idle.png`, not against the old Hanami alone.

### What to deliver

Deliver **the full semantic pose table** for `hanami` — the same 36 keys every
other fighter carries (`SEMANTIC_ANIMS` in `src/characters.js`, and any fighter
delivered at round 11B or later is the model). The design is the rewritten
character block above plus `assets/reference/canon/hanami_anime.png`.

**Draw it from [pose-brief.md](../sprites/docs/pose-brief.md)**, which is the standing brief for
a whole set: the pose lines, the measurable criteria for the idle, the crouches
and the two strike frames, and the faults that keep coming back. Redrawing whole
rather than piecemeal is most of the reason to do it — every round-14 brief
applies to this set at once, and his idle is what his size is solved against, so
expect a workbench pass over the whole set when it lands
(see [character-heights.md](character-heights.md)).

All 36 are flagged `character` in the manifest, so
`python3 tools/list_replacements.py` carries this worklist without the document.
Three keys sit outside it: `attack_air`, `run_a` and `run_b` are standby
fallbacks the whole roster still carries, superseded by the pairs and the
four-frame cycle, so nothing draws them and a flag on them would read as stale.
**Redraw them anyway if the set is being done whole** — leaving three
tree-bodied frames in the directory behind a fallback path is exactly how a
retired design comes back.

**Grey key, not magenta.** His existing set is keyed off magenta, which was
right for a brown tree. The new design is bone-cream and pale tan against black,
and magenta leaves a fringe on warm pale edges — so this delivery joins the
grey-`#808080` list with Sukuna, Nobara, Momo, Hakari, Yuji, Choso, Uro and
Gakuganji.

**His kit does not change.** Cursed Buds, Root Eruption, Flower Field and Domain
of the Flowering Forest stay as they are, and so do their effect sprites. Canon
Hanami is still a plant curse — the roots and blossoms come out of the ground
and off his hands. What changes is that his *body* stops being made of the same
material.

Two details the render makes obvious and a prompt tends to drop, both worth
checking on every frame before delivering:

- **The white wrap is on one side only.** It covers the right shoulder and the
  whole right arm and it is bulky — it changes his silhouette, and a frame that
  wraps both arms or neither is not the same character.
- **The stripes are markings, not shading.** Hard-edged black brushstrokes in
  fixed places — down the centre of the face, along the outsides of the arms,
  down the ribs and the abdomen. They must land in the same places from pose to
  pose or the set will read as flickering.

## 17B. Mahoraga — three poses that never extended — 3 sprites

| Fighter | Key | Pose | Kind | What is wrong |
|---|---|---|---|---|
| Mahoraga | `mahoraga` | `attack_light_a` | Pose | The sword never leaves the body line — the wind-up does not extend. |
| Mahoraga | `mahoraga` | `attack_light_b` | Pose | The blade stays across the body, tip pointing down and back. Nothing reaches forward. **Neither frame of the pair extends.** |
| Mahoraga | `mahoraga` | `crouch_b` | Pose | Upright rather than crouched, opposite the delivered `crouch_a`. 0.97 × idle. |

These three were asked for in round 13 and **the delivery was rejected**: the
drawings fixed the poses but arrived with **the karma wheel missing from the
headdress**, which no request, no reference image and no code asked for.
`assets/reference/canon/mahoraga_canon.png` shows the wheel, the shipped
`idle_a`, `crouch_a` and `run_reach_a` all have it, and retiring the old
`drawProp` compositing only deleted code the game had already stopped using for
him. So the asks are unanswered and the old, wheel-bearing art is still in play.

The cause was that Mahoraga was **the only fighter in the game with no character
block** in this file, so his prompts carried no design text at all and the design
lived entirely in a reference image — which works when somebody opens it and
fails silently when they do not. Round 11A only worked because that round's own
prose happened to spell the headdress out. He has a block now, at the top of
this file, and it names the wheel in bold. **A redraw here must carry it.**

## 17C. Caught while placing round 13 — 2 sprites

| Fighter | Key | Pose | Kind | What is wrong |
|---|---|---|---|---|
| Yuta Okkotsu | `yuta` | `crouch_attack_b` | Quality | **The blade runs off the right edge of the plate**, so the sword ends in mid-air. Re-draw with the reach inside the frame. |
| Takako Uro | `uro` | `crouch_b` | Character | "Costume doesn't match canon" — check against `assets/reference/canon/uro_idle.png`, the design the rest of her set was drawn from. Her `prone` carries the same note in [14C](#14c-caught-while-placing-rounds-12-and-13--5-sprites). |

Yuta's was first filed as a **crop** — a file fault, fixable in the repo without
anybody redrawing anything — and it is worth saying why it is not. The delivered
plate `assets/reference/round13/yuta/crouch_attack_b.png` is cut the same way as
the keyed sprite: the blade leaves the canvas in the original, so there is
nothing for a re-key to recover. That is the difference the two flags exist to
draw, and the only way to tell them apart is to open the plate.

It is also a straight breach of the [delivery spec](asset-requests.md#delivery-spec) — *full body
inside the frame with margin on all four sides, nothing may touch the canvas
edge* — and the failure mode is specific to poses that extend: the figure is
drawn to fill the canvas and the reach is what falls off. Round 15A now says so
where the four new sets are asked for.
---

## 17D. A simplified card for every fighter — 27 images

### Why

**The hero cards do not survive being made small.** Each one is a full-bleed
640×820 illustration with a painted scene behind the fighter — Gojo on a neon
skyline, Panda outside a shrine at dusk, Nanami against tower blocks at golden
hour. At hero size, on the right of the select screen, that is exactly right and
it should stay.

The same file is also the **roster tile**, and there it is doing a different
job: the player is scanning two dozen thumbnails for the one they want, and the
scene is noise. It is already costing something. `styles.css` carries a
per-card brightness table — `--card-lift`, defaulting to 1.18, with a heavier
tier for Nanami, Toji, Geto, Reggie, Mei Mei and Gakuganji and a saturation-only
case for Panda — that exists solely because the art was not all painted at the
same key and the tiles read murky next to each other. That table is a patch on
using scene illustrations as icons.

**And it gets worse with every fighter added.** `layoutCharacterGrid()` fits the
roster by walking depths and then *cropping*: `ROSTER_ASPECTS` runs
`3/4 → 1/1 → 5/4 → 3/2 → 2/1`, and the tile is `object-fit: cover` anchored to
the **top**. A bigger roster reaches the wide end of that list sooner, so the
tile becomes a **letterbox strip off the top of a portrait** — and `object-position: top`
means it keeps the head and throws the body away. `MIN_CARD_WIDTH` is 96 px, so
at the far end each fighter is a 96 px-wide band of a painting.

Round 15 takes the roster from 23 to 27, which is the point of asking now rather
than later. This request is the art that is drawn for that job from the start.

### What this is not

- **Not a replacement.** Every existing `assets/cards/<key>_card.jpg` stays
  exactly where it is and keeps being the hero card. Nothing is flagged, nothing
  is deleted, and `assets/reference/cards_previous/` is untouched.
- **Not wired up.** The game does not read the new directory and this section
  does not ask for the code that would. It is art banked ahead of a roster big
  enough to need it — the switch is a one-line change in `buildCharacterCard()`
  when that day comes, and it can be made per-surface (tiles simplified, hero
  card and in-match portrait still the painting).
- **Not a redesign.** Same character, same costume, same palette family as their
  hero card, so the two read as the same fighter seen at two distances.

### The brief

**A portrait icon, not a scene.** One fighter, chest-up, filling the frame, on a
plain background. Think a roster icon in a fighting game's character select, or
an app icon of a person: legible at a glance, legible at a glance *small*, and
distinguishable from twenty-six others at the same size.

| | |
|---|---|
| **Crop** | Head and shoulders to mid-chest. The head is large in the frame — roughly the top half of the image — and centred horizontally |
| **Background** | Flat or a single soft vertical gradient in the fighter's theme colour (the `theme` field in `src/characters.js`). No scenery, no buildings, no sky, no props behind the figure, no logo, no text |
| **Lighting** | Even and front-lit. Bright enough to need **no** `--card-lift` correction: the whole point is that all 27 come back at the same key and the brightness table can be deleted |
| **Detail** | Fewer, larger shapes than the hero card. Simplify folds, hair strands and pattern; keep the two or three things that identify the fighter and drop the rest |
| **Silhouette** | Readable as a shape. Squint at it: Gojo's blindfold, Nanami's glasses, Maki's ponytail and glasses, Todo's topknot, Momo's hat, Jogo's volcano head should still be the thing you see |
| **Format** | JPEG, **640 × 820** (3:4), same as the hero cards, so the two are interchangeable in every slot |

**Two crops must both work, because the fitter chooses between them at runtime.**
Before delivering, check each image twice:

1. **Full 3:4** — the shallow-roster case.
2. **The top half only, at 2:1** — the crowded-roster case, which is what
   `object-fit: cover` with `object-position: top` produces at the wide end of
   `ROSTER_ASPECTS`. The fighter must still be recognisable, which in practice
   means **the whole head sits inside the top 45% of the image** and nothing that
   identifies them lives below the shoulders.

**Keep the bottom sixth quiet.** The name plate is drawn over it — white caps on
a dark gradient — so anything with detail down there is covered up.

### Prompt formula

`[CHARACTER BLOCK]`, head-and-shoulders portrait icon facing the viewer, chest-up
crop, head filling the upper half of the frame, flat `[THEME COLOUR]` background
with no scenery or props, even front lighting, simplified shapes and reduced
detail, `[STYLE SUFFIX]`.

Character blocks are in [Character blocks](asset-requests.md#character-blocks) and are used
verbatim, exactly as for sprites — **including Hanami's, which was rewritten for
[17A](asset-requests-history.md#17a-a-full-hanami-set--36-sprites)**. His tile is the pale humanoid curse,
not the tree.

`[THEME COLOUR]` is the fighter's `theme` in `src/characters.js` — the colour the
game already uses for their HUD accent and hit flashes, so a tile painted on it
matches what happens when they land a hit.

| Group | Fighter | Key | Theme |
|---|---|---|---|
| Students | Yuji | `yuji` | `#ff8264` |
| | Nobara | `nobara` | `#d86a4a` |
| | Megumi | `megumi` | `#7c8cff` |
| | Yuta | `yuta` | `#9fc7ff` |
| | Maki | `maki` | `#69d0a8` |
| | Inumaki | `inumaki` | `#d7d9e7` |
| | Panda | `panda` | `#8ea0b8` |
| | Todo | `todo` | `#b66cff` |
| | Momo | `momo` | `#b7b8ff` |
| Faculty | Gojo | `gojo` | `#62dcff` |
| | Nanami | `nanami` | `#ffd35a` |
| | Mei Mei | `meimei` | `#d8b95c` |
| | Gakuganji | `gakuganji` | `#d89b3f` |
| Other Sorcerers | Hakari | `hakari` | `#ff62cf` |
| | Toji | `toji` | `#a8aeb8` |
| | Uro | `uro` | `#8fd7e8` |
| | Reggie Star | `reggie` | `#86d67c` |
| Curses and Curse Users | Mahito | `mahito` | `#b56cff` |
| | Jogo | `jogo` | `#ff7a2f` |
| | Hanami ⚠ | `hanami` | `#9bb36b` |
| | Geto | `geto` | `#7d58d8` |
| | Choso | `choso` | `#c22e4a` |
| | Sukuna | `sukuna` | `#ff4c55` |
| **Staged (round 15)** | Mechamaru | `mechamaru` | `#63c7b0` |
| | Yuki Tsukumo | `yuki` | `#ffb703` |
| | Dagon | `dagon` | `#2f8fd8` |
| | Kurourushi | `kurourushi` | `#8f3b4e` |

**The last four depend on round 15.** They have no delivered art at all, so
their tile is drawn from the same wiki render as their hero card in
[15D](asset-requests-history.md#15d-kurourushis-hero-card--1-image) — and it is worth drawing the two together,
since the questions are the same and the answer to one settles the other. If
15A's sprite sets have landed by then, prefer the delivered `idle_a` as every
other fighter's tile does.

Four themes are close enough to a neighbour's to be worth checking side by side
before delivering — Todo `#b66cff` against Mahito `#b56cff` are all but
identical, and Mei Mei `#d8b95c` against Gakuganji `#d89b3f` are near. The
background is a supporting cue, not the identifier; if two tiles come back
reading as the same card, it is the *figure* that has to carry the difference.

**Mahoraga is deliberately not in it** — he is a `SPRITE_ACTOR`, nobody selects
him, and he has no hero card either.

### Where it goes

Deliver to:

```
assets/intake/cards/simple/<key>_tile.jpg
```

and it lands at:

```
assets/cards/simple/<key>_tile.jpg
```

**`_tile`, not `_card`, and the reason is not cosmetic.** The per-card
brightness rules in `styles.css` are written as filename suffix matches
(`img[src$="nanami_card.jpg"]`), which would match `simple/nanami_card.jpg` just
as happily as the hero card. A simplified card that silently inherited a 1.34×
lift meant for a murky painting would arrive blown out, and it would take a
while to work out why. A distinct suffix makes that impossible.

Cards take the short path through the pipeline — no keying, no measuring, no
manifest entry — so landing these is a move and nothing else.

### Delivered

All 27 tiles are in `assets/cards/simple/<key>_tile.jpg`. They are **banked, not
wired up**, exactly as the request asked: `buildCharacterCard()` still draws the
hero painting in every slot, and switching the roster grid to the tiles is the
one-line change described above whenever the roster is big enough to want it.

---

## 17E. Hanami's hero card, redrawn to canon — 1 image

### Why

`assets/cards/hanami_card.jpg` is the tree. It is a good painting — a
bark-and-vine giant lit through a forest canopy, a glowing lotus in one hand —
and it is the same wrong design as every one of his sprites.
[17A](#17a-a-full-hanami-set--36-sprites) replaces the sprites and
[17D](#17d-a-simplified-card-for-every-fighter--27-images) draws his tile from
canon; without this the card is the last place in the game still showing the old
character, and it is the **largest** place — the hero panel on the select screen
and the portrait in the match HUD both draw it at full size.

### What to deliver

One image, to the **existing hero-card spec** — a straight like-for-like
replacement, not a new format:

| | |
|---|---|
| **Format** | JPEG, **640 × 820**, full-bleed. No text, no border, no logo |
| **Subject** | Canon Hanami, full or three-quarter figure, from the rewritten block in [Character blocks](asset-requests.md#character-blocks) and `assets/reference/canon/hanami_anime.png` |
| **Scene** | Keep the setting. The forest-canopy light of the current card is right for him and matches the rest of the roster's painted backdrops — sunlight through leaves, deep greens, the `#9bb36b` theme reading through the whole frame |
| **Key** | Match the roster's brightness. His current card is one of the ones that does *not* need a heavy `--card-lift`; keep it that way |

The character changes; the painting's mood, palette and framing do not. Put the
new card beside the current one before delivering — a viewer should read it as
the same fighter's card repainted, not as a different card.

**His cursed technique still belongs in it.** Canon Hanami is a plant curse; the
blossom and the roots are his, they are simply not made of the same stuff he is.
Wooden growth in the scene, on the hands, breaking the ground — yes. Wooden
**body** — no.

### Where it goes

Deliver to:

```
assets/intake/cards/hanami_card.jpg
```

and it lands at `assets/cards/hanami_card.jpg`, replacing what is there. The
current painting is worth keeping: copy it to
`assets/reference/cards_previous/hanami_card.jpg` first, which is where round
9A's originals already live and is the reason any of them can be put back.

**Order matters slightly.** This is the one part of round 17 that *does* change
what a player sees the moment it lands — a card is one file with no variant
mechanism and no approval step behind it. So it should go in once enough of 17A
has been approved that the tile and the fighter on the stage agree with it;
landing it first just moves the mismatch somewhere else.

---

---

---

## 18E — twenty backgrounds, repainted for the 3D camera

Twenty stage paintings, redelivered at **3200×1800** against the brief kept
verbatim below. They replaced the old plates under the same filenames, so
nineteen boards needed no code change at all; **Shibuya Night** was the twentieth
and the exception, arriving as `shibuya_night.jpg` where the stage registered a
`.webp`, which is the one string in `src/stages.js` the request predicted.

**The previous paintings are kept**, at
`assets/reference/backgrounds_previous/` — all twenty, at the sizes they shipped
at. That is not ceremony: they are the only copies of art the game wore for
months, three of them were never 1600×900 to begin with (`curse_maw` at
1920×1640, `flooded_gate` at 800×437, `shibuya_night` at 1200×675), and a board
that turns out worse in flat mode can be put back by copying one file.

### What it fixed

The 3D camera over-fills its frustum on purpose, so only the centre half of a
backdrop is ever on screen — **49.4% of the image's linear extent**, which put
about 790 source pixels across 1280 CSS pixels on the old plates. That 1.62×
upscale (3.24× at DPR 2) was the most visible art deficit in `?camera=3d`. At
3200×1800 the same crop is 1600 source pixels wide: a slight downscale rather
than a blur, and flat mode gains the outer ring as extra framing.

Checked on delivery: all twenty are exactly 3200×1800 JPEG, the centre
1600×900 crop stands as a finished picture in each, and no plate paints a
foreground element into that crop — which is the constraint that matters, since
the garnish layer draws the near field in 3d.

### The brief, as it was written

The `?camera=3d` mode (see [2.5d-camera-plan.md](2.5d-camera-plan.md)) puts the
stage painting on a plane in a real 3D scene. It works today with the existing
art, and this is not a bug report — the plates are fine. But the mode changes
what a backdrop has to *be*, in one measurable way and three compositional ones,
and repainting to that spec is the single largest visible win available to the
camera. §10 of the plan has the full measurement; the short version:

**The 3D camera only ever shows the middle of the picture.** The backdrop plane
deliberately over-fills the frustum (×1.5 height, ×1.35 width) so that no dolly,
yaw or roll can swing past its edge. The cost is that **only 49.4% of the
image's linear extent is on screen** — a 1600×900 plate puts about **790 source
pixels across 1280 CSS pixels, a 1.62× upscale (3.24× at DPR 2)**, where flat
mode shows the whole plate at a slight *down*scale. That softness is currently
the most visible art deficit in 3d mode.

### The one rule that is new

> **Paint at 3200×1800. The 3D camera crops to the centre 1600×900 — the size
> the current backgrounds already are — so that centre box has to be a finished
> picture on its own, and the outer ring is what flat mode adds around it.**

Both crops ship. Flat mode (the default) shows the whole 3200×1800 frame; 3d
mode shows the centre half. Neither is a "safe area" to be padded with filler —
they are two framings of one painting, and both are seen by players. The crop is
centred to within 2.4% of image height, so treating it as exactly centred is
correct.

### Three things the 3D scene changes about composition

- **Paint mid-ground and far ground only. No foreground.** Anything painted at
  the very front of frame lands on the same flat plane as the horizon, 14 world
  units back, and then contradicts the real near-field cards the camera draws
  *between* the lens and the fight (traffic, lanterns, leaves — §7c of the
  plan). Foreground is the garnish layer's job now; a plate that paints its own
  fights it. Overhanging branches, near pillars, near railings: leave them out.
- **Keep a calm value band across the middle.** The fight happens there, and in
  3d the platforms are extruded boxes with lit top faces sitting in front of it.
  The band from roughly 45% to 85% down the *centre box* should be the quietest
  part of the painting — low contrast, no hard edges, no bright speculars. Put
  the detail and the drama above and to the sides of it.
- **Avoid a strong one-point perspective aimed at the centre of frame.** A
  painted vanishing point is rigid; a real camera is not. In normal play this
  camera moves so little (±0.88° of yaw — the sim clamps it) that a baked VP is
  harmless, but the drama shots swing to ±4° and a dead-centre VP is where that
  reads worst. An off-centre or open composition is safer and crops better.

### What has not changed

Same filenames, same folder, same JPEG format, so **nineteen of the twenty need
no code change at all** — the loader reads `stage.bgFile` and picks them up
as-is. The exception is Shibuya Night, which is registered as `.webp`: deliver
it as `shibuya_night.jpg` and one string in `src/stages.js` changes with it, or
keep the `.webp` extension and nothing does.

Landscape, full-bleed, no characters, no text, no border, no UI. Keep the
mid-tones open: the renderer lays a 30% black wash and the stage's own colour
tint over the plate before anything else draws, so a plate that arrives already
dark and already saturated has nowhere to go.

```
assets/intake/backgrounds/<name>.jpg      3200×1800, JPEG, full-bleed
```

### Prompt formula

`[BOARD LINE]`, `[COMPOSITION SUFFIX]`, `[STYLE SUFFIX]`

**Composition suffix** — append to every board line:

> wide establishing shot, mid-ground and distance only with no foreground
> elements, empty stage floor across the lower middle of the frame, quiet
> low-contrast band through the middle third, detail and interest in the upper
> half and toward the edges, open mid-tones, no characters, no text

**Style suffix** — the same one the rest of the game uses:

> clean Japanese anime key-art style matching the Jujutsu Kaisen TV anime,
> painted background art, crisp rendering, cel shading with soft gradient
> accents, atmospheric depth, high detail, no text

### The twenty boards

Each line is the setting to paint. The **tint** column is the colour the engine
already washes over the plate — paint *toward* it rather than against it, or the
grade fights the art. The **gimmick** column is what the board does during a
match ([stage_fx.js](../src/stage_fx.js)); the painting should look like a place
where that could happen, and must leave room for it.

| # | File | Board | Tint | The setting to paint | Gimmick it has to host |
|---|---|---|---|---|---|
| 1 | `training_bridge.jpg` | Training Bridge | green | A long arched wooden bridge over a green ravine at a temple school, late afternoon, heavy summer canopy on both banks, tiled roofs beyond. The calmest board in the game and the one the camera is tuned on — it should read as *ordinary*. | Leaves fall constantly; the camera adds more near the lens |
| 2 | `quiet_hall.jpg` | Quiet Hall | warm amber | A long empty tatami hall, shoji screens down one side throwing hard warm rectangles across the floor, a heavy bronze bell hanging in the far dark. Stillness is the subject. | Every ~25 s the bell seals techniques for 4 s; camera pushes in |
| 3 | `flooded_gate.jpg` | Flooded Gate | cool blue | A great stone torii gate standing in knee-deep floodwater, submerged steps, rain-heavy sky, the waterline the dominant horizontal. **Currently 800×437 — the lowest-resolution plate in the game and the most urgent of the twenty.** | A surge wave sweeps the length of the floor |
| 4 | `shibuya_night.webp` | Shibuya Night | indigo | The Shibuya scramble at night from street level, neon towers stacked deep, wet asphalt throwing colour back up. The busiest board — but the busy has to sit *above* the fight band. **Deliver as JPEG at 3200×1800; currently 1200×675 webp.** | An 8 s "curtain" seals the arena and floods everyone's meter |
| 5 | `curse_maw.jpg` | Curse Maw | cyan | The inside of an enormous curse: a ribbed organic cavern, wet cyan bioluminescence in the recesses, a throat receding into dark. **Currently 1920×1640 at a 1.17 aspect — it is cropped hard before 3d crops it again; reframe to true 16:9.** | Fangs snap up at both outer thirds of the floor |
| 6 | `garden_steps.jpg` | Garden Steps | bright green | A terraced temple garden climbing left to right, moss, stone risers, a still pond below, blossom. The one board whose *layout* the 3D camera flatters most — the terracing should read in the painting too. | A flower blooms on a random platform and heals whoever reaches it |
| 7 | `lantern_corridor.jpg` | Lantern Corridor | warm orange | A covered wooden veranda running into the distance, paper lanterns strung the length of it, warm pools of light on dark boards, night garden past the posts. Keep the lanterns *mid-distance and beyond* — the camera hangs its own into the top of frame. | A lantern shakes loose, falls and burns a patch of floor |
| 8 | `sunken_crossing.jpg` | Sunken Crossing | pale blue | A flooded city crossing at dusk, a few centimetres of standing water turning the whole street into a mirror, drowned kerbs, signage doubled in the reflection. The slickness is a mechanic here, so sell the wet. | The floor is genuinely slippery; the camera glides and overshoots |
| 9 | `neon_split.jpg` | Neon Split | magenta | A narrow back alley between two neon-clad blocks, signage crowding in from both sides, a dark gap straight up the centre. Leave the centre line clear — something stands in it. | An energy wall strikes down the centre line and holds |
| 10 | `bone_sanctum.jpg` | Bone Sanctum | pale teal | A cathedral built from bone: ribbed vaults, vertebral columns, cold teal light from high openings, ossuary dark below. | Drop-through platforms rattle, phase out for 3 s, re-knit |
| 11 | `bridge_duel.jpg` | Bridge Duel | sea green | A high suspension span in sea mist, cables climbing out of frame, water far below, distant headland. Emptiness on all sides — the floor here moves, and the surroundings are what make that legible. | The whole main platform drifts side to side under the fight |
| 12 | `academy_hall.jpg` | Academy Hall | brown | A grand school hall — dark timber, a gallery, tall windows down one side, dust in the light. Institutional and a little too big. | On a bell, the platforms glide into a whole new arrangement |
| 13 | `mist_pier.jpg` | Mist Pier | pale ice | A wooden pier running out into flat water under heavy fog, pilings fading by depth, a sun disc barely through. Depth by *fade*, not by detail — this is the board where atmospheric perspective does all the work. | Fog rolls in for 6 s; the camera pushes in rather than out |
| 14 | `crosswalk_rush.jpg` | Crosswalk Rush | blue | A wide city intersection at blue hour, zebra bars running away, signals and streetlights, towers behind. Traffic is drawn by the game, not painted — leave the near lane **empty**. | Cars run the floor; the 3D camera adds more between lens and fight |
| 15 | `cursed_teeth.jpg` | Cursed Teeth | cyan-teal | A gullet: concentric rings of teeth receding into a throat, wet violet-cyan glow deep inside, something breathing. | Fangs drop from above; every 25 s the stage inhales |
| 16 | `river_gate.jpg` | River Gate | jade | A river shrine gate at dawn, mist off the water, reeds bending consistently one way, petals in the air. The wind is a mechanic — paint the world already leaning. | A crosswind alternates direction; the camera rolls with it |
| 17 | `school_wing.jpg` | School Wing | tan | A school corridor after hours — lockers, a run of windows, late sun down the length of it, nothing where there should be somebody. Quiet and slightly wrong. | A weak curse wanders out; pop it for meter |
| 18 | `empty_city.jpg` | Empty City | grey-blue | A derelict city block under an overcast sky, empty windows, weeds through the tarmac, no people and no traffic. Flat grey light. | Two rooftops crumble under weight and re-form |
| 19 | `billboard_roof.jpg` | Billboard Roof | hot pink | A rooftop above a neon city in a storm — plant housings, aerials, hoardings stepping back into rain haze, cloud lit from within. The camera adds its own hoardings behind the stage, so keep the skyline readable and not too crowded. | Lightning takes the top platform; the strongest shake in the game |
| 20 | `domain_core.jpg` | Domain Core | aqua | The inside of a Domain Expansion: a non-place. Geometry that does not resolve, aqua light with no source, fragments hanging at rest. Gravity is low here — nothing should look like it is sitting on anything. | Side platforms orbit slowly; everyone floats |

### Deliver in this order

Not one batch — the first three change what a player sees most.

1. **`flooded_gate`, `shibuya_night`, `curse_maw`** — the three that are below
   the current norm *before* the 3D crop is applied. Flooded Gate at 800×437 is
   soft even in flat mode.
2. **`crosswalk_rush`, `lantern_corridor`, `training_bridge`** — the three
   boards that already have near-field garnish, so they are where the depth
   the repaint supports is most visible.
3. The remaining fourteen, any order.

Flat mode is the default and is unaffected either way, so nothing here is
blocking and a partial delivery is genuinely useful.

---

# Round 18 — delivered

Round 18 arrived complete in one batch: **28 sprites and 14 images**, every
section below answered, plus the five render3d image inputs (DI1–DI4). The
sprites landed through the [approval step](../assets/intake/README.md#the-confirm-step),
so 25 of them are decisions waiting in the sprite workbench rather than changes
already on screen.

| Section | Asked for | Outcome |
|---|---|---|
| 18A | 12 caught while placing the round-15 sets | Delivered — including `mechamaru/run_reach_a`, which was **new rather than a replacement** (the round-15 delivery was an unusable contact sheet), so it went straight into the game and completed his four-frame run cycle |
| 18B | 4 caught while placing Kurourushi | Delivered — his four stand-ins can be retired at approval |
| 18C | 3 that fell through the round renumbering | Delivered, `uro/prone` included — see the note below on whether the re-request worked |
| 18D | 2 Uro alternates, the right pose in the wrong costume | Delivered and **discarded**: the costume was not improved, only differently wrong, so it no longer matched the rest of her set any better than what it would have replaced. Plates kept at `assets/reference/round19/uro_alt_rejected/`; no variant option remains in the manifest |
| 18E | 20 backgrounds repainted at 3200×1800 | Delivered earlier — [its own history entry](#18e--twenty-backgrounds-repainted-for-the-3d-camera) |
| 18F | 14 near-field cards for the garnish layer | Delivered, all fourteen — every procedural stand-in in `src/camera3d/garnish.js` is now a painting |
| 18G | 7 where a pose is drawing somebody else's art | Delivered |

**What the delivery cost in code, which is the part worth keeping.** The
garnish cards exposed a placement bug that had nothing to do with the art: the
3D camera's *standing* scenery — Crosswalk Rush's signal gantry, Billboard
Roof's hoardings — is placed once per match, and the flag saying "placed" was
set before the placement was attempted. The shared art group is a long queue, so
the gantry lost that race every time and the board stood bare for the whole
round. Placement now retries until the art is decoded or the loader has settled,
and `tools/smoke_camera3d.mjs` counts standing cards separately from passing
ones so a car can never stand in for a gantry that never arrived.

**18D is the useful failure.** Her block was rewritten before the round went
out — two separate bands, midriff bare, never one joined garment — on the theory
that the old wording ("a wrap … across her chest and hips") described a dress at
least as naturally as it described two bands. The redraws came back in a costume
that was different but no closer to canon, which says the wording was not the
whole problem. `uro/prone` is the remaining test: it is in the approval queue in
the same round, and if it comes back dressed too, the reclining pose is a
generator limitation rather than a brief fault, exactly as
[18C](#uroprone-is-worth-understanding-before-re-requesting-it) predicted.

---

## 18A. Caught while placing the round-15 sets — 12 sprites

The three new fighters arrived with complete 36-pose sets drawn against
[pose-brief.md](../sprites/docs/pose-brief.md). These are what the placement passes found — a
pose reads differently at real size against a real stage than it does on a
review board — plus the brief's headline criterion, which all three missed.

| Fighter | Key | Pose | Kind | What is wrong |
|---|---|---|---|---|
| Yuki Tsukumo | `yuki` | `attack_heavy_b` | Pose | The hook extends **9%** of standing height past her idle where the brief asks for a third — the shortest heavy on the roster. She is a boxer with no weapon, so the whole body has to be behind it: hips through, shoulder past the lead foot. **Her `ult_b` is standing in** meanwhile, so she has a heavy that reaches while this is redrawn. |
| Mechamaru | `mechamaru` | `attack_heavy_b` | Pose | Extends **20%**. The forearm blade should be the furthest thing forward in the frame. |
| Mechamaru | `mechamaru` | `run_reach_a` | Quality | **Delivered as a contact sheet** — four small figures of the run cycle on one canvas rather than one pose. Nothing in it is separable at full resolution and none of the four clears the 600 px body minimum alone, so it was never imported: he runs on the other three cycle frames until this lands. |
| Dagon | `dagon` | `run_reach_a` | Pose | **Reaches with the arm instead of the leg.** The reach frame is the full stride — the leading heel is the thing out in front, arms only counterbalance it. |
| Dagon | `dagon` | `run_reach_b` | Pose | The same, on the other lead. |
| Yuki Tsukumo | `yuki` | `run_reach_a` | Pose | The same fault again — reaching with the arm. |
| Yuki Tsukumo | `yuki` | `run_reach_b` | Pose | The same, on the other lead. |
| Dagon | `dagon` | `crouch_b` | Pose | Drops **21%** of standing height where the brief asks for a quarter, and reads *taller* than `crouch_a` beside it. The pair is one held crouch a breath apart, not a descent. |
| Dagon | `dagon` | `attack_light_a` | Pose | Not a wind-up. `_a` is the coil before the strike — weight on the back foot, striking hand drawn back — and this reads as a second strike. |
| Mechamaru | `mechamaru` | `crouch_attack_b` | Pose | The forearm blade never reaches full extension. `_b` is the strike; the blade should be the furthest thing forward, out past the knee. |
| Dagon | `dagon` | `crouch_attack_b` | Pose | Flagged during the placement pass. |
| Yuki Tsukumo | `yuki` | `crouch_attack_b` | Pose | Flagged during the placement pass. |

The reach numbers are measured the way the engine measures reach: the forward
edge of the art past the centre of the body's core columns (`bodyRight` against
`coreLeft`/`coreRight`), as a fraction of the idle's own height. They are
comparable within a fighter regardless of placement, because every pose of a set
is drawn at one zoom.

**Three faults repeated across fighters, which is what a missing rule looks
like** rather than three bad drawings: the heavy that does not extend (all
three), the reach frame that reaches with the arm (two), and the `ledge_hang`
with the ledge drawn into it (two). All three are now stated in the pose brief,
so Kurourushi's set will not be asked for without them.

### Fixed in the repo instead of requested

Three of the faults found in this pass were **file** faults rather than drawing
faults, and were fixed here rather than sent back:

- **Dagon's `ult_a` had four arms.** The extra one lay over background for most
  of its length and its own ink line gave the cut a natural boundary at the
  shoulder, so it came out with nothing repainted.
- **`dagon/ledge_hang` and `mechamaru/ledge_hang` had the ledge drawn in.** The
  bar was a flat grey slab across the top of the plate with the hands gripping
  over it, so removing it leaves the hands closed on nothing — which is the
  pose as asked for. The stage supplies the edge.

Each frame was re-measured afterwards (`bodyTop`, the body and core spans, the
centre of mass) so reach and width read off the art that is actually there. The
untouched originals are in `assets/reference/round15/`. That is the whole
difference between an `improvement` flag and a `replacement` flag: these were
recoverable in the file, and Yuta's cut-off sword in 17C was not.


---

## 18B. Caught while placing Kurourushi — 4 sprites

Kurourushi's set was the last of the round-15 four to be placed, and it went
through with all 36 poses approved. Four of the delivered drawings were flagged
`quality` in the same pass, and this is the part that makes them non-blocking:
**each of the four poses is drawn today by another frame of his own set**,
chosen in the workbench rather than left broken. He plays complete. What is
missing is that four poses share art with four others, so a fight shows the same
silhouette in two places.

| Key | Pose | Kind | What is wrong | Standing in |
|---|---|---|---|---|
| `attack_heavy_b` | `sideHeavy` | Quality | **The blade is drawn back over the shoulder** — this is the wind-up, not the strike. `_b` is the contact frame, and nothing in it extends forward past the robe. | `attack_light_b` — the only frame in the set with the blade fully out |
| `attack_light_b` | `light` | Quality | Rejected in the same pass, and then promoted into the heavy slot above because it was the better of the two. The light now needs its own drawing. | the archived round-15 `attack_air_b` |
| `crouch_attack_b` | `crouchAttack` | Quality | A low sprawl with the blade along the ground, which is very close to what `dash` shows. `_b` is the strike out of the crouch — the blade forward and clear of the body. | the archived round-15 `dash` |
| `dash` | `dash` | Quality | Flagged during the placement pass. | the archived round-15 `dodge_roll` |

**The heavy fault is the fourth one this round.** Yuki, Dagon and Mechamaru all
delivered an `attack_heavy_b` that does not extend (18A), and Kurourushi's does
not extend either — his for a different reason, being a wind-up rather than a
short strike, but the frame on screen is the same problem: the heavy does not
read as the biggest thing the fighter does. The rule is in
[pose-brief.md](../sprites/docs/pose-brief.md); this is the evidence it needs to stay there.

### Repo work, not a request: `kurourushi/ledge_hang` — done

The ledge is drawn into the plate — a slab under the hands, the same fault
`dagon/ledge_hang` and `mechamaru/ledge_hang` had in round 15 and the reason the
rule went into the brief. It is flagged `wantsImprovement: "alpha"` with the
note "Remove the ledge", so the workbench shows it and
`tools/list_replacements.py` tracks it. As with the other two, the hands are
closed on the bar and cutting it leaves them closed on nothing, which is the
pose as asked for — **the stage supplies the edge.** No redelivery needed.

**This has now been done**, along with `hanami/ledge_hang`, which had been
flagged as a redraw rather than repo work and did not need to be: his was the
same flat slab with the hands over it. Four of the roster's ledge grips have now
been cut this way (Dagon, Mechamaru, Kurourushi, Hanami) and the rule is in the
pose brief, so a future set should not need it.

---

## 18C. Three that fell through the round renumbering — 3 sprites

Flagged in the workbench, but named in no request section — they were written
into rounds that were later split, renumbered or moved to history, and the flags
outlived the sections. An audit of the manifest against this file found them:
the workbench knew about all three the whole time, and nobody drawing from this
file could have.

| Fighter | Key | Pose | Kind | What is wrong |
|---|---|---|---|---|
| Suguru Geto | `geto` | `attack_down` | Pose | "Should be straight down instead of down and right." `downHeavy` is a committed smash at the floor in front — the arc ends under him, not off to the side. Asked for once as 14C and again after the round-13 redraw was approved-and-reflagged. |
| Mei Mei | `meimei` | `special_down` | Pose | Flagged during a placement pass with no note. Her down special is the crow swarm gathering low; the drawing does not read as a technique starting. |
| Takako Uro | `uro` | `prone` | Character | **The costume is a full pale-blue bodysuit** — covered arms, covered legs — where every other pose in her set draws the canon cloud wrap over bare limbs. See the note below: this is the generator's doing rather than the brief's, and it may not be fixable by asking again. |

### `uro/prone` is worth understanding before re-requesting it

Her other **seven** poses are on-model: `idle_a`, `run_reach_a`, `crouch_a`,
`dodge_roll`, `hurt`, `attack_light_b` and `victory` all draw the pale-cyan
cloud vapour across chest and hips with bare arms and legs, exactly as her
character block asks. Only `prone` comes back dressed, and it comes back dressed
in something that is not in the block at all — a full-length bodysuit.

So this is **not** a prompt fault we can see: the block is explicit ("her only
covering a wrap of pale-cyan cloud vapour clinging across her chest and hips,
bare arms and legs"), the canonical reference shows it, and the pose line for
`prone` says nothing about clothing. What is different about `prone` is that it
is the one pose where the figure is **lying down, horizontal, full-length** —
and a generator handed a reclining, minimally-dressed figure tends to add
clothing on its own. `dodge_roll` is on the ground too and comes back correct,
which suggests it is the reclining read rather than the ground.

That makes it worth **one** re-request with the costume restated inside the pose
line rather than left to the block — and worth knowing it may come back dressed
again. If it does, the honest options are to keep the drawing (a knockdown is on
screen for well under a second) or to draw the pose from a different angle that
is less likely to trip it, e.g. seen more from the feet. It is a limitation of
the generator, not of the request.

---

## 18D. Uro, the right pose in the wrong costume — 2 sprites

**Asked for as alternates, not replacements.** Both poses are good and are
staying in the game; what is wrong is the costume, so the delivery lands *beside*
the current drawing and the better of the two is picked by eye in the workbench.
Nothing changes on screen until somebody chooses.

| Fighter | Key | Pose | Kind | What is wrong |
|---|---|---|---|---|
| Takako Uro | `uro` | `attack_heavy_b` | **Alternate** | The cloud reads as one strapless dress — the chest band and the hip band have merged. Keep the pose exactly: braced wide, the cursed-energy cloud thrown forward off the lead hand. |
| Takako Uro | `uro` | `crouch_b` | **Alternate** | The cloud has become a one-piece dress from chest to thigh. Keep the pose exactly: down on one knee, weight on the trailing hand, head low. |

### The block was ambiguous, and that is the actual fault

Her block used to read *"a wrap of pale-cyan cloud vapour clinging across her
chest and hips"* — which describes **one** garment reaching from chest to hips
at least as naturally as it describes two bands. The canon is two: a band across
the chest, a band at the hips, and a **bare midriff between them**
(`assets/reference/canon/uro_idle.png`).

Read that way, the deliveries were not wrong so much as obedient. Both of these
drew the sentence, and `uro/prone` in [18C](#18c-three-that-fell-through-the-round-renumbering--3-sprites)
went further and put her in a full bodysuit. Her block now says two separate
bands, with the midriff bare, and that a single joined garment is wrong — so
these two are the first test of whether the wording was the whole problem. If
they come back right and `prone` still comes back dressed, the reclining pose is
its own separate limitation.

**Four of her poses were already correct under the old wording** — `idle_a`,
`run_reach_a`, `hurt`, `victory` — which is why this took a workbench pass to
notice rather than showing up on the review board.

---

## 18F. Near-field cards for the garnish layer — 14 images, optional

**Lower priority than 18E was, and genuinely optional** — every one of these has a
procedural stand-in drawing in the game right now, so nothing is missing. But
this is where depth actually comes from, and it is worth saying why, because it
is the opposite of the intuitive answer.

Measured (§10 of [2.5d-camera-plan.md](2.5d-camera-plan.md)): splitting a
*backdrop* into parallax layers buys **2.3 px** of differential shift in normal
play, because this camera barely translates — the sim clamps it to ±0.88° of
yaw. A card at `z = +2`, between the lens and the fight, separates from the
backdrop by **14 px** at that same yaw and **64 px** in a drama shot. Proximity
to the lens is the whole term. So the depth budget is better spent here than on
layering the paintings, and 18E asked for *bigger* backgrounds rather than
*split* ones for exactly this reason.

These are the elements the camera already flies past the lens
([garnish.js](../src/camera3d/garnish.js)), currently drawn with canvas
primitives. Real art would replace the procedural texture and nothing else —
the motion, depth, spawning and per-board wiring already exist.

### Delivery — keyed plates, like sprites, not full-bleed like backgrounds

```
assets/intake/garnish/<name>.png
```

PNG, one subject per file, on a **flat magenta `#FF00FF` key screen** (grey
`#808080` for the warm ones — marked below), same rules as the sprite spec
above: perfectly flat unlit screen, no colour bounce onto edges, margin on all
four sides, nothing touching the canvas edge. **At least 1000 px on the long
edge.** These are seen close to the lens and get magnified.

Anything travelling sideways should be drawn **facing/pointing LEFT**, same as
the projectile rule — the renderer mirrors for the other direction.

| File | Board | What it is | Screen |
|---|---|---|---|
| `leaf_green.png` | Training Bridge | One broad summer leaf, seen flat-on, slight curl. Simple silhouette — it is 30 px on screen half the time. | magenta |
| `leaf_gold.png` | Training Bridge | The same leaf turning: yellow-gold, edge curling, one side catching light. | grey |
| `lantern_paper.png` | Lantern Corridor | A paper lantern hanging on its cord, lit from within but seen against brighter light — mostly silhouette with a warm rim. Cord running off the top of the frame. | grey |
| `lantern_iron.png` | Lantern Corridor | An iron temple lantern on a bracket, heavier, colder, unlit. Variety against the paper one. | magenta |
| `car_sedan.png` | Crosswalk Rush | A car in near-total silhouette, side-on, pointing **left**, headlights blown out, faint lit windows. It passes in front of the whole fight for well under a second — read at a glance, no detail. | magenta |
| `car_van.png` | Crosswalk Rush | A tall delivery van, same treatment, taller and blockier so two passes never look identical. | magenta |
| `car_bike.png` | Crosswalk Rush | A motorcycle and rider, low and fast, single headlight, hard lean. | magenta |
| `rubble_a.png` … `rubble_c.png` | Empty City | Three chunks of broken concrete and rebar, angular, unlit, no two alike. Small and dark — these tumble toward the lens. (3 files) | magenta |
| `hoarding_a.png` … `hoarding_c.png` | Billboard Roof | Three lit advertising hoardings on steel gantries, seen from below and slightly to one side, legs and bracing visible. Abstract light and colour, **no legible text or logos**. These sit *behind* the stage, so they are the one entry here that is far rather than near. (3 files) | magenta |
| `signal_gantry.png` | Crosswalk Rush | A traffic signal on its arm, dark against the sky, lamps lit. Hangs into the top of frame. | magenta |

Fourteen files. Any subset is useful — each one replaces its procedural
stand-in independently, and a board with no delivery keeps the drawing it has.

---

## 18G. Seven a pose is drawing somebody else's art — 7 sprites

[18C](#18c-three-that-fell-through-the-round-renumbering--3-sprites) audited the
**flags** against this file. This is the other half of that audit: the poses that
are outstanding *without* a flag, because the fault was answered by pointing the
pose at a different drawing instead of marking the drawing bad.

That happens at approval. A delivered pose that is rejected leaves a hole, and a
hole draws nothing at all, so the workbench picks another frame of the same
fighter's set to stand in — the game keeps working and the pose keeps being
outstanding. Nothing reports it: `tools/list_replacements.py` reads flags, and a
stand-in raises none. The only way to see them is to ask which poses are drawing
a file that is not their own, which is now how the count at the top of this file
is derived.

Five of the seven below are that. Two are ordinary flags that no round had
picked up.

| Fighter | Key | Pose | Kind | What is wrong |
|---|---|---|---|---|
| Hanami | `hanami` | `crouch_attack_b` | Pose | Flagged at approval, and it is the frame two of the three below are borrowing — so it is the one to draw first. `_b` is the strike out of the crouch: blade of the arm forward at ankle-to-knee height, hips through, head no higher than in `_a`. |
| Hanami | `hanami` | `attack_light_a` | **Standing in** on `run_reach_b` | The delivered wind-up was rejected. His jab now winds up on a sprinting frame, so a light attack shows him mid-stride. |
| Hanami | `hanami` | `attack_light_b` | **Standing in** on `special_neutral` | Rejected in the same pass. The strike frame is his neutral-special pose — a different action, a different arm, and one that does not extend past the body the way a light has to. |
| Hanami | `hanami` | `crouch_b` | **Standing in** on `crouch_attack_b` | Rejected. The held crouch is drawn by the crouch *attack*, so holding down reads as a repeated swing. `crouch_b` is `crouch_a` a breath later — weight settled a touch further forward, head a touch lower, nothing else. |
| Gakuganji | `gakuganji` | `attack_air_a` | **Standing in** on `attack_air` | Round 14C asked for this as an alternate because the delivered hands were malformed; neither drawing was taken, so the pose still draws the legacy single that the `_a`/`_b` pair was meant to supersede. His aerial has a wind-up frame that is not a wind-up. |
| Toji Fushiguro | `toji` | `attack_heavy_b` | Quality | *"Should show full sword extended to the right in attack. (alt has a spear which is wrong)"* — both drawings on this pose are wrong in different ways, so it needs a third. Same criterion as every other heavy: a third of standing height past his own idle, sword tip leading. |
| Choso | `choso` | `attack_light_b` | Quality | Flagged in the workbench. `_b` is the contact frame of the jab — the blood-arm out past the body, shoulders rotated through, weight on the front foot. |

**Hanami's four are one delivery.** They are all from the round-17 set, all
rejected in the same approval pass, and three of them are borrowing from each
other — `crouch_b` borrows `crouch_attack_b`, which is itself flagged. Drawn
together they settle each other; drawn one at a time the borrowing moves around.


---

# Round 20 — the summon sheets, the grab set and the dash attack

**152 sprites in one delivery, and the largest sprite round since 12.** Three of
round 20's four sections landed together: the forty-four summon plates that had
shipped as contact sheets (20A), three grab poses across the roster (20C) and
the dash attack the roster had never had (20D). 20B, the twenty backgrounds,
followed in its own delivery — see
[20B](#20b-twenty-backgrounds-re-extended--delivered) — and four sprites of
Yuji are still outstanding.

**What the round settled**

- **Every summon plate in the game is one creature.** `tools/check_summon_plates.py`
  passes on all 114, where it used to fail on 44. Seven creatures had an
  authored `hitW`/`hitH` pair in `src/config_summons.js` purely because their
  `idle_a` was a sheet and measuring it would have given a box six creatures
  wide; all seven pairs came out with this delivery, and **no creature in the
  pools has an authored box any more** — every one is hit on the shape it is
  drawn as, which is the rule fighters have followed since their hurtboxes
  started coming off their art.
- **The grab mechanic reads.** `grab_reach`, `grab_hold` and `grabbed` are drawn
  for twenty-six fighters, and the grip point 20C was written around — fist and
  prying hands at chest height on the leading edge — held across all of them,
  checked in the game with two fighters posed in a hold rather than on the
  boards alone.
- **Both dash attacks have their own pose.** Nothing needed a code change:
  `attack_dash` was already named by `dashAttack` and `dashAttackHeavy` with the
  standing strike as the fallback, so the pose started being drawn the moment
  the manifest knew about it.
- **Nothing waited for an approval.** All 108 sprite frames are new pose keys,
  and a key with no incumbent has nothing to compare against, so they went
  straight in rather than into the queue ([the confirm
  step](../assets/intake/README.md#the-confirm-step)). The approval queue is
  still round 18's 25 and only those.

**What the round cost, and what it taught**

- **The delivery covered the wrong twenty-seven.** 20C and 20D each asked for
  one file per fighter and each arrived as 27 — with **Mahoraga in Yuji's
  place**. Mahoraga is a summon animated out of a character sprite set, so he
  has an intake directory and a full sheet and looks exactly like a fighter to
  every tool in the pipeline; he is not on `CHARACTER_KEYS`. The count was right
  and the roster was wrong, twice, and nothing downstream could tell. It is now
  a row in [pose-brief.md § 5](../sprites/docs/pose-brief.md#5-the-faults-that-keep-coming-back)
  and a `ROSTER COVERAGE` report that `tools/intake.py` prints on every
  delivery, naming who is missing and who is not a fighter. Yuji's four are
  [20E](asset-requests.md#20e-yujis-four-round-20-poses--4-sprites), still open.
- **Quality was the best of any round so far.** 152 plates: no low-resolution
  figure, no contact sheet, no mirrored strike, seven plates flipped to face
  right by the detector, and four canvas edges touched
  (`gakuganji/grab_hold`, `megumi/grab_reach`, `meimei/grab_hold` — all a braid
  or a sleeve at the left — and `uro/grab_hold`, hair at the top). None was
  worth a redraw and all four are recorded here rather than re-requested.
- **A round that adds pose keys needs pose reads.** Every frame in the manifest
  owes one (`node tools/check_pose_reads.mjs`), and `tools/pose_seed.py` would
  only seed a character who had no read file at all — so 108 new frames were red
  and the only way through was `--force`, which reseeds a whole sheet and throws
  its hand reads away. Seeding is additive now: existing poses are kept, only
  the new frames are fitted, and it is step 6 of
  [the intake flow](../assets/intake/README.md#what-happens-to-it).

**The requests, as they were written.** All three are reproduced below verbatim,
because a later redraw of one frame has to agree with the others.

## 20A. Summon plates that are contact sheets — 44 sprites

**Forty-four of the hundred and fourteen summon plates hold six creatures
instead of one**, and the game draws the whole file as one summon. A six-across
strip of dogs is painted at the dog's height, so what walks the stage is six
dogs in a row at a sixth of the size each — and it changes mid-animation,
because one pose of a creature is a sheet and the next is not.

It shipped because a sheet is invisible at review size: a strip of six dogs in a
thumbnail looks like a dog. It is the same fault as `mechamaru/run_reach_a` in
round 15, which was caught only because the importer refused it, and summon art
has no importer to refuse it — it is a file drop.

So it is a tool now rather than an eye. **`python3 tools/check_summon_plates.py`**
counts the separate figures in each plate's alpha and fails on three or more of
comparable size; detached art (a floating wheel, a thrown chain) reads as one
big blob and some small ones and passes. Run it on any summon delivery before
importing. This table is its output.

| Creature | Sheets | Poses |
|---|---|---|
| `divine_dog_white` | 2 | `move_a`, `hurt` |
| `great_serpent` | 4 | `idle_a`, `idle_b`, `move_a`, `move_b` |
| `inventory_curse` | 4 | `idle_b`, `move_a`, `attack`, `hurt` |
| `max_elephant` | 4 | `idle_a`, `move_a`, `move_b`, `hurt` |
| `rabbit_escape` | 5 | `idle_a`, `idle_b`, `move_a`, `move_b`, `hurt` |
| `rainbow_dragon` | 3 | `move_b`, `attack`, `hurt` |
| `toad` | 4 | `idle_a`, `move_a`, `move_b`, `hurt` |
| `transfigured_crawler` | 6 | all six |
| `transfigured_hulk` | 6 | all six |
| `transfigured_human` | 6 | all six |

**What to deliver: the same pose, as one figure.** Not a redesign, not a new
pose — every one of these sheets contains the right drawing several times over,
so the brief is the pose line it was drawn against
([round 16 in the history](asset-requests-history.md#round-16--the-summons-animate-delivered)),
with **one creature on the canvas**. Where a sheet has an obviously best figure
in it, that figure at full resolution is a complete answer.

Same rules as the round-16 summon art: one subject per file, flat key screen, at
least 600 px of creature, one zoom across all six poses of a creature, delivered
to `assets/intake/summons/<file>_<pose>.png`.

### It is also what is holding up seven hit boxes

A creature's hit box is **measured off its own `idle_a`** now — 85% of the drawn
rectangle — rather than authored in `src/config_summons.js`, which is the rule a
fighter's hurtbox has followed since it started coming off their art. Ten
creatures measure theirs today.

The seven whose `idle_a` is on this list cannot: measuring a sheet would give a
box six creatures wide. They keep an authored pair with a comment naming this
round, and **each pair comes out when the plate lands** — at which point the
creature starts being hit on the shape it is drawn as, with no further code
change.

---

## 20C. The grab poses — 81 sprites

**Three new poses per fighter, all 27 fighters**, for the Smash-style grab and
throw mechanic that shipped behind `?throw=true` (`src/grab.js`,
[game-mechanics.md §8](game-mechanics.md#grabs--throws--on-by-default-throwfalse-turns-them-off)).
The mechanic is fully playable now on **reused art** — the table below is what
each state draws in the meantime — so nothing is blocked; this request is what
makes a grab look like a grab instead of a frozen light attack.

| Pose key | What it must read as | Drawing in the meantime |
|---|---|---|
| `grab_reach` | A committed forward lunge with one open, grasping hand leading — reaching to seize, not to strike. The other arm guards. | first light-attack frame |
| `grab_hold` | Gripping an (unseen) opponent at arm's length by the collar — front hand closed in a fist at chest height, weight planted, coiled to heave. The opponent is NOT in the drawing: the game places the victim's own body in the grip. | `charge` |
| `grabbed` | Seized and struggling: body arched back from the collar, feet scrabbling, both hands prying at an (unseen) grip at their own chest. Also unlocks: this doubles as the pose for any future "held/dragged" effects. | `hurt` |

The four throw states (`throw_fwd`, `throw_back`, `throw_up`, `throw_down`)
are **registered but not requested**: each currently plays the heavy attack
swung that way, which reads correctly because a throw IS a heave in that
direction. If a fighter's grab set ever gets a bespoke throw pose, deliver it
under those keys and it is picked up with no code change — but 20C is complete
without them.

**The critical constraint is the grip point.** `grab_hold`'s closed fist and
`grabbed`'s prying hands must both sit at **chest height on the leading edge of
the body**, because the game overlaps the two drawings at a fixed gap
(`holdGap` in `src/grab.js`) — a fist drawn high on one fighter and low on
another makes every pairing look like they are holding different arguments.
Chest height, front edge, both poses, whole roster.

Same spec as every sprite round: one subject per file, flat key screen (grey
for the warm-palette fighters — see the list at the top), facing right, one
zoom per character matched to their own `idle_a`, at least 600 px of body,
delivered to `assets/intake/<character>/<pose_key>.png`. Read
[pose-brief.md](../sprites/docs/pose-brief.md) first, and the
[canonical reference](asset-requests.md#the-canonical-reference-image--one-per-fighter) rule
applies as always.

**The 2.5D/3D side of the same mechanic is aliased, not owed:** the rig states
`grabReach`, `grabHold`, `grabbed` and the four throws currently play the
`light` / `charge` / `hurt` / heavy clips (`STATE_ALIASES` in
`render3d/src/states.js`). Bespoke grab clips would be a B-/D-round request
if the mechanic graduates from its flag; nothing is asked of the model tracks
yet.

---

## 20D. The dash attack pose — 27 sprites

**A pose the roster has never had, for two attacks it did not have until now.**
Attacking out of a dash or a sprint throws a **dash attack** — light for the
lunge, heavy for the running shoulder-charge (see §4 of
[game-mechanics.md](game-mechanics.md)). Both are in the game and both are
correct in every way except what they look like: they draw the fighter's
standing strike, because that is the only attack art there is. A committed
forward lunge drawn as a jab thrown on the spot reads as a fighter sliding
along the floor while punching the air in front of them.

**Nothing is waiting on this.** `dashAttack` and `dashAttackHeavy` already name
`attack_dash` in `src/characters.js`, with the strike each move draws today as
their `fallback`. So a fighter with no dash pose keeps exactly the drawing they
have now, a fighter who gets one starts using it the moment the manifest knows
about it, and **the delivery can land one fighter at a time** with no code
change at any point.

### The two attacks, so the pose can be drawn to fit both

One drawing serves both dash attacks. That is deliberate — it is the same
motion at two weights, and asking for two poses would double a round to buy a
distinction a player reads from the hit, not the frame.

| | Light, running | Heavy, running |
|---|---|---|
| Reads as | a lunging strike carried by the run | the same lunge, thrown with everything |
| Active | 0.13 s | 0.15 s |
| Recovery | ~1.7× the side tilt's | ~1.4× the side smash's |

So the drawing wants to be the **committed** end of that range: it stands in
for a smash-weight blow as well as a quick one, and a pose that reads as a
light poke will look weak on the heavy version. When in doubt, draw the heavy.

### What the pose has to show

Read [pose-brief.md](../sprites/docs/pose-brief.md) first — it is the standing
brief for every sprite, and this pose is measured by the same four criteria.
On top of it, this one specifically:

- **Weight ahead of the lead foot.** The whole point is momentum: the body is
  travelling and the strike is going with it. A dash attack drawn balanced over
  the hips is a tilt.
- **No wind-up.** The run WAS the wind-up. This is a single held pose, not the
  `_a`/`_b` wind-up-then-strike pair the light and heavy attacks use — draw the
  moment of the blow, arm or weapon already extended along the line of travel.
- **Low and driving**, not upright: shoulder or hip leading, back leg extended
  behind, the trailing arm counterweighting. A shoulder-charge silhouette reads
  at game size where a punch does not.
- **The character's own weapon.** Whoever fights with something leads with it
  — Maki's naginata levelled along the run, Nanami's cleaver driving forward,
  Mei Mei's axe carried low, Gakuganji's guitar swung through. A weapon
  character drawn throwing a shoulder is a different fighter.
- **Facing RIGHT**, one zoom per character (this pose at the same figure scale
  as the rest of their set — it is the criterion that costs the most to fix
  later), flat key screen per the [delivery spec](asset-requests.md#delivery-spec), at
  least 600 px of body.

Prompt formula, as always: `[CHARACTER BLOCK]` (the table above — use it
verbatim), the pose line, facing right, `[STYLE SUFFIX]`.

> **Pose line:** "sprinting forward and striking at the same moment, body low
> and driving, weight thrown ahead of the leading foot, back leg extended
> behind, striking arm or weapon fully extended forward along the direction of
> the run, trailing arm swept back, at the instant of impact"

### The canonical reference is their own `idle_a`

Same rule as every other request in this file (see
[there](asset-requests.md#the-canonical-reference-image--one-per-fighter)): open the fighter's
`idle_a` and match its costume, proportions, palette, line weight and shading.
Hanami and Mahoraga are the two exceptions the table there records, and they
are exceptions here too.

### Delivery, and how the old drawing is kept

`assets/intake/<character>/attack_dash.png` — one file per fighter, 27 in all
(`CHARACTER_KEYS`). Standard intake: `tools/intake.py` keys and measures it,
`tools/intake_sheets.py` boards it for approval, `tools/intake_import.py
--approve` registers it in `manifest.json`, then it is placed in the sprite
workbench like any other pose.

**The current art stays, in both of the ways this repo keeps art:**

1. **In code, as the fallback.** `attack_dash` is a NEW pose key, so nothing is
   replaced and nothing is overwritten. The light and heavy strikes stay
   exactly where they are, still drawn by their own attacks, and still standing
   in for the dash attacks of every fighter whose pose has not landed or has
   been rejected. Delete a delivered `attack_dash` and the game is back to
   today's look with no other edit.
2. **In the manifest, as a banked variant.** A second drawing of the pose banks
   beside the first rather than replacing it — the workbench's **`alternate`**
   kind (`ALTERNATE_KIND` in `sprites/src/sprites.js`, routed by
   `tools/intake_variants.py`), the same mechanism that lets a pose keep an
   older drawing selectable after a redraw. So if a delivered dash pose turns
   out worse than the strike it replaced for some fighter, that is a click in
   the workbench, not a re-request.

### Checked on delivery

Per sprite: it is the same character at the same figure scale as their
`idle_a`; the body is travelling rather than planted; nothing is clipped at
the canvas edge; the key screen is flat and has not bounced colour into hair or
cloth. `python3 tools/check_summon_plates.py` does not apply here — that is
creature art — but the same fault is worth a glance: one figure per file.

### Not part of this round: the 3D clips

The 2.5D billboard path and the live-3D path both know these two states now,
and both **alias** them to the strike clips they already have (`STATE_ALIASES`
in `render3d/src/states.js`, beside the grab states 20C describes) exactly as
the sprites fall back. A bespoke pair of
dash-attack clips is a billboard round (B-numbers) if anyone wants one; it is
not a hole in the roster today, and no rig is missing anything because of it.

---

## What 20A delivered

All forty-four, one figure each, at the resolution the sheets were painted at —
between 600 and 1400 px on the long edge before `prep_effects.py` brought them
down to the 700 px the summon tree runs at. They are keyed by `intake.py` like
any sprite and then take the short path: no manifest entry, no placement, no
approval, because a creature belongs to no fighter. The raw plates are in
`assets/reference/round20/summons/`.

The seven hit-box pairs this was holding up came out in the same change
(`src/config_summons.js`), so the Great Serpent is now hit on 112×88 measured
from its own rearing coil rather than the authored 158×78, Max Elephant on
229×162 rather than 156×156, and so on down the seven. Those are different
numbers, deliberately: the authored pairs were written before the art existed,
which is the whole reason the rule changed.

## What 20C and 20D delivered

Twenty-six fighters of twenty-seven, plus Mahoraga, for each of the four poses —
108 frames. Landed with `intake_variants.py --auto` into `intake_import.py`,
anchored, auto-tuned, and seeded with pose reads. Every one is a new key, so
nothing was overwritten and the "All Recently Updated Poses" list is a round's
worth of new art to place rather than of tuning to redo.

Yuji is the exception in both, and is [20E](asset-requests.md#20e-yujis-four-round-20-poses--4-sprites).

# 20B. Twenty backgrounds, re-extended — delivered

All twenty came back at 3200×1800, exactly 16:9, and are in the game. The ask
was unusual and worth keeping the record of, because it was a re-request of a
round that had been *delivered to spec and still missed*: 18E asked for twenty
boards repainted at 3200×1800 and got exactly that, but each was drawn fresh
from the board's brief, so twenty scenes were re-invented at the same time as
they were enlarged. Against the 3D camera's centre crop the result read sparser
and darker than the paintings players knew.

20B asked for the opposite of a repaint — **keep the source painting as the
picture, extend it outward 30% a side** — and named the input as a file rather
than a description, on the reasoning that any wording paraphrasing a painting
is a chance to drift.

**It worked.** Every delivery carries its source's composition. Shibuya Night
is the clearest case and was the furthest gone: the previous painting is a high
aerial of the scramble crossing, 18E's replacement was a street-level view down
a wet avenue — a different vantage entirely — and the delivery is the aerial
again, brighter and more detailed. What a player sees in 3d is now the board
they knew, very slightly cropped.

**Checking it needed eyes, and nearly did not get them.** A greyscale
correlation of each delivery's centre against its source scored Shibuya Night
at 0.016 — no correlation at all — which would have condemned the single best
plate in the set. The metric was measuring brightness and fine detail on a
painting that had legitimately got brighter. Twenty side-by-sides settled in a
minute what the number got backwards.

The previous 18E plates are archived at `assets/reference/backgrounds_18e/`,
verified byte-identical to what they replaced before the copy. Nothing in
`assets/backgrounds/flat/` was touched: that directory is the FLAT camera's
runtime art, not an archive, and the two cameras have wanted different
paintings of the same scene since 20B was written.

## The request, as written

**This is a re-request of 18E against a different input: the old painting
itself.** 18E asked for twenty boards repainted at 3200×1800 and got exactly
that — the resolution problem it was written to fix is fixed, and nothing here
is a complaint about sharpness. What it did not ask for, and so did not get, is
*the same picture*. Each plate was drawn fresh from the board's brief, so twenty
scenes were re-invented at the same time as they were enlarged, and the result
against the 3D camera's crop reads **sparser and darker than the paintings it
replaced** — more empty middle distance, less of the lit, busy, close detail the
old boards put right behind the fighters.

So: keep the resolution win, take the composition back. **Extend each previous
painting outward instead of replacing it.**

### The previous paintings are the input

They are in the repo, at **`assets/backgrounds/flat/`** — moved there from
`assets/reference/backgrounds_previous/` when this request was written, because
they are runtime art again: the flat camera now draws them (`backgroundFile()`
in `src/stages.js`), which is the half of this that needed no art at all. Flat
mode shows a whole plate, so pointing it back at the paintings composed for a
whole plate fixed flat mode the same afternoon. 3d mode is what this request is
for.

**The input image is the brief.** There is no scene description below and there
should not be one — the board being asked for is the board that is already
there, and any wording paraphrasing it is a chance to drift. Open the file.

### The one rule

> **Keep the source painting as the picture. Extend the scene outward by 30% on
> each of the four sides — same place, same moment, more of it — and deliver the
> whole thing at 3200×1800 or larger, exactly 16:9.**

30% on each side is **1.6× linear**, so the source painting ends up as the
**centre 62.5%** of the delivered plate, in both dimensions:

| delivered plate | the source painting occupies | new ring |
|---|---|---|
| 3200×1800 (minimum) | centre **2000×1125** | 600 px left/right, 337 px top/bottom |
| 4096×2304 (preferred) | centre **2560×1440** | 768 px left/right, 432 px top/bottom |

**Why 30% and not more.** The 3D camera over-fills its frustum on purpose
(×1.5 height, ×1.35 width — `src/camera3d/stage_geo.js`), so only the centre
**49.4%** of a plate's width is ever on screen. Against a 1.6× extension that
visible crop is **79% of the source painting**, centred — so what a player sees
in 3d becomes the old board, very slightly cropped, instead of a different
painting. The ring is not scenery anybody is meant to look at: it exists so no
dolly, yaw or roll can swing past the edge. Extending further would push the old
composition back out of frame, which is the fault being fixed.

The 3D crop of a 3200×1800 delivery is 1581 source pixels across 1280 CSS
pixels — still a downscale, so 18E's sharpness holds. 4096×2304 gives 2023 and
is comfortable at DPR 2, which is why it is preferred.

### What the ring may contain

- **More of the same scene, continued.** Same architecture, materials, weather,
  time of day, light direction and colour temperature; the same painterly style
  and line weight. A wall keeps going, a street keeps receding, a canopy of
  branches keeps spreading.
- **Nothing that reads as a second picture.** No new focal subject, no character,
  no creature, no large new light source, no text, watermark, border or vignette.
  If the ring is interesting enough to look at on its own, it is wrong.
- **Nothing painted at foreground depth in the centre 49.4%.** That is 18E's
  standing rule and it still holds: the near field belongs to the garnish layer
  (`src/camera3d/garnish.js`), which draws cards in front of the backdrop and
  will overlap anything painted there. Where a source painting already has a
  foreground element in its centre, **leave it** — it is the board players know,
  and the garnish placement is checked per board after delivery.

### Do not re-light the middle

The other half of what feels wrong is exposure. Match the source plate's
**brightness, contrast and palette exactly** where the ring meets it, and do not
take the opportunity to grade the centre — no darkening, no desaturating, no
"cinematic" cool cast. Note that the renderer already lays a 30% black wash and
the stage's tint over the plate before a player sees it
(`drawBackdrop()` in `src/render.js`), so a plate that looks a little bright and
a little saturated on its own is the one that lands correctly in the game.

Resampling the centre is unavoidable — a 1600×900 source becomes 2000×1125 at
the minimum delivery size — so upscale it cleanly and keep its detail. **Do not
repaint it.**

### The twenty, and what to open

Filenames are the ones `src/stages.js` registers, so nineteen boards need no
code change and Shibuya Night needs none either as long as it is delivered as
`.jpg` (the source is the older `.webp`; the live plate is already `.jpg`).

| Board | Stage key | Source file (under `assets/backgrounds/flat/`) | Source size | Region to extend |
|---|---|---|---|---|
| Training Bridge | `trainingBridge` | `training_bridge.jpg` | 1920×1080 | whole image |
| Quiet Hall | `quietHall` | `quiet_hall.jpg` | 1920×1080 | whole image |
| Flooded Gate | `floodedGate` | `flooded_gate.jpg` | 800×437 | centre **777×437** ⚠ |
| Shibuya Night | `shibuyaNight` | `shibuya_night.webp` | 1200×675 | whole image |
| Curse Maw | `curseMaw` | `curse_maw.jpg` | 1920×1640 | centre **1920×1080** ⚠ |
| Garden Steps | `gardenSteps` | `garden_steps.jpg` | 1600×900 | whole image |
| Lantern Corridor | `lanternCorridor` | `lantern_corridor.jpg` | 1600×900 | whole image |
| Sunken Crossing | `sunkenCrossing` | `sunken_crossing.jpg` | 1600×900 | whole image |
| Neon Split | `neonSplit` | `neon_split.jpg` | 1600×900 | whole image |
| Bone Sanctum | `boneSanctum` | `bone_sanctum.jpg` | 1600×900 | whole image |
| Bridge Duel | `bridgeDuel` | `bridge_duel.jpg` | 1600×900 | whole image |
| Academy Hall | `academyHall` | `academy_hall.jpg` | 1600×900 | whole image |
| Mist Pier | `mistPier` | `mist_pier.jpg` | 1600×900 | whole image |
| Crosswalk Rush | `crosswalkRush` | `crosswalk_rush.jpg` | 1600×900 | whole image |
| Cursed Teeth | `cursedTeeth` | `cursed_teeth.jpg` | 1600×900 | whole image |
| River Gate | `riverGate` | `river_gate.jpg` | 1600×900 | whole image |
| School Wing | `schoolWing` | `school_wing.jpg` | 1600×900 | whole image |
| Empty City | `emptyCity` | `empty_city.jpg` | 1600×900 | whole image |
| Billboard Roof | `billboardRoof` | `billboard_roof.jpg` | 1600×900 | whole image |
| Domain Core | `domainCore` | `domain_core.jpg` | 1600×900 | whole image |

**The two ⚠ rows are the boards whose source is not 16:9.** Take the centred
16:9 region first — that is what the game has always shown of them, since
`drawBackdrop()` cover-fits — and extend *that*, so the delivery is 16:9
throughout and nothing the player knows is cropped by the change.

**Flooded Gate is the hard one.** Its source is 800×437, so the centre of a
3200×1800 delivery is a 2.6× upscale of a small, soft image and clean
resampling will not carry it. This is the one board where **re-detailing inside
the kept composition is expected**: same gate, same water, same framing, same
palette and light, painted at the delivered resolution. It is also the board
where a 4096×2304 delivery buys the least, so 3200×1800 is fine for it.

### Delivery

`assets/intake/backgrounds/<file>.jpg` — JPEG, high quality, the filenames in
the table above (Shibuya Night as `shibuya_night.jpg`). No alpha, no key screen:
a background is a finished picture, not a subject on a field, and it takes the
short path through intake — no keying, no measuring, no manifest entry (see
[assets/intake/README.md](../assets/intake/README.md)).

**On landing, archive the plate being replaced** into
`assets/reference/backgrounds_18e/`, the same way 18E archived what it replaced.
`assets/backgrounds/flat/` is **not** an archive and must not be touched: the
flat camera draws those twenty files every match.

Checked on delivery, per plate:

1. exactly 16:9, at least 3200×1800;
2. the centre 62.5% is the source painting — not a redraw of it — at matching
   brightness and palette;
3. the centre 49.4% stands as a finished picture, which follows from (2);
4. no text, border, watermark or signature anywhere, ring included.

---
