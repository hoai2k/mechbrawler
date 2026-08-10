# Asset Pipeline — Sprite Extraction

## The problem with the v1 sheets

The original game shipped seventeen 1254×1568 character sheets on a 4×5 grid
(cell ≈ 313.5×313.6 px; rows: idle / run / air / techniques / crouch). The art
inside those cells is imprecise in ways that hurt a fighting game:

1. **Cell bleed** — weapons and effect trails cross cell borders (Maki's
   naginata, Gojo's energy trails). A naive grid crop cuts sprites apart *and*
   pastes fragments of neighbors into the wrong frames. v1 worked around this
   at runtime by scrubbing one pixel of border and binarizing alpha, which
   trimmed legitimate art along with the bleed.
2. **Inconsistent foot lines** — characters stand at slightly different
   heights per frame, so a fixed pivot makes idle/run animations bob. v1
   re-detected feet at runtime by scanning alpha rows per frame.
3. **Soft alpha halos** — leftover semi-transparent fringing from the original
   background removal.

## The v2 approach: transfer sprites individually

`tools/extract_sprites.py` rebuilds the assets offline instead of patching
them at runtime:

1. **Connected-component labeling** (scipy, 8-connectivity) over each sheet's
   alpha channel — every blob of art becomes an addressable component.
2. **Majority-cell assignment** — each component belongs to the grid cell
   containing most of its pixels. A weapon tip that pokes into the next cell
   stays with the body it's connected to; a detached energy burst stays with
   the frame it overlaps most.
3. **Fragment rules** — detached fragments hanging almost entirely below their
   cell's bottom edge are reassigned to the frame beneath (the sheets' rows
   overlap slightly); per-frame overrides handle known one-offs (e.g. a stray
   mandala arc under Inumaki's landing frame).
4. **Per-frame trimmed PNGs** — every frame is composited from exactly its own
   components (foreign pixels inside the bounding box are excluded), trimmed
   tight, and written to `assets/sprites/<char>/r<row>c<col>.png`.
5. **Manifest** — `assets/sprites/manifest.json` records each frame's size,
   its offset relative to the logical cell (so frames can legitimately
   overhang their cell), and two derived anchors:
   - `bodyBottom`: the bottom of the frame's *largest* component — the foot
     line, unpolluted by detached effects. The renderer pins this to the
     fighter's ground Y, which kills animation bobbing without runtime pixel
     scans.
   - `centroidX`: alpha-weighted center of mass, kept for debugging.

Individually generated replacement cells are listed in
`GENERATED_FRAME_TARGETS`. The extractor preserves those high-resolution alpha
PNGs at their final paths and rebuilds sheet-compatible anchors and render
scales from their alpha bounds, so a historical sheet re-extraction cannot
restore the broken art.

The engine (`src/sprites.js`) draws a frame by translating to the fighter's
feet, flipping by facing, and blitting the trimmed PNG at
`(ox − cellW/2, oy − bodyBottom) × scale`. No per-frame canvas processing
happens at runtime, which also means the game no longer cares about
canvas-tainting — though it should still be served over HTTP like any module
app.

## Regenerating

The extractor reads the v1 sheets, so it only matters if you want to re-run
history — the extracted PNGs in `assets/sprites/` are committed and
self-sufficient:

```sh
cd tools
python3 extract_sprites.py --src /path/to/v1/assets
```

Debug contact sheets (grid, tight bounds, detected foot lines) are written to
`tools/debug/<char>_contact.jpg`.

## Facing, sizing, and cleanup passes

Three more correction layers ship in the manifest, all curated frame-by-frame
against comparison boards (see `tools/debug/`):

- **`faceLeft`** — the sheets are drawn facing **RIGHT** by default; this was
  verified against every character's run row (all 17 run rightward, see
  `tools/debug/run_facing.png`). A minority of cells — mostly aiming/casting
  poses whose weapon or blast points the other way — are drawn facing left and
  carry `faceLeft: true`. The engine mirrors those so a fighter always looks in
  their logical direction.

  > **Polarity warning.** An earlier version of this table was inverted: it
  > listed the same frames as *right*-facing exceptions against a *left*-facing
  > default, which made **every character face backwards** in game (running
  > right while looking left). If characters ever look reversed again, check
  > this table's polarity before touching the renderer. The quick test: force
  > `f.facing = 1` on both fighters and confirm they look rightward.
- **`renderScale`** — dramatic technique cells and some imagegen crouch cells
  are drawn at a different zoom (Hakari's jackpot cell is ~30% oversized,
  Momo's crouch-attack ~35% undersized). 23 frames carry corrections so a
  fighter keeps one body size across animations.
- **Pixel repairs** — flat-white matte wedges (Sukuna r0c0/r1c2/r1c3), baked-in
  transparency checkerboards (Toji r2c1, Inumaki r3c1), and sub-60px pinholes
  in every frame (moth-eaten hair) are removed/inpainted at extraction time.

## Repaired source-sheet quirks

- **Momo's crouch row** now uses auburn-haired Kyoto-uniform replacement art.
- **Hanami's crouch row** now consistently uses the bark-bodied cursed-spirit
  design.
- **Toji's hurt frame** (`r2c3`) was replaced to remove doubled linework.
- **Sukuna's crouch row** now matches the Yuji-vessel uniform used elsewhere.
  `r4c2` needed one re-delivery: the first attempt came back semi-transparent
  (49% opaque) because the chroma key ate his pink hair and skin.
- **Mahito's left arm** unravels into hanging threads in several frames — it's
  drawn that way in every generation of the source art (and is, honestly, very
  Mahito).

Remaining quirks are content issues in the painted sheets, not extraction
bugs — fixing them means repainting those cells.

## A renamed file makes a fighter invisible

The manifest is the **index**: it names the file each pose draws from, and those
names move. Hanami's canon redraw renamed all 36 of his — `hanami/incoming/idle_a-2.png`
became `hanami/idle_a.png` — and a browser holding the previous manifest asked
for 36 files that no longer existed, got 36 404s, and drew a fighter with no art
at all. Invisible, silently, and only him: everyone else's paths had not moved.

Two things follow, and both are now in the code:

- **The manifest is fetched `cache: "no-cache"`** (`loadCoreAssets`,
  `src/assets.js`) — revalidated on every load, so the index can never be older
  than what it indexes. The images themselves still cache normally; they are
  addressed by a name that only changes when the drawing does.
- **A pose that cannot be drawn says so.** `drawCharFrame` returns `false`
  instead of returning quietly, warns once per pose, and the renderer paints an
  **ART MISSING** box at the fighter's hurtbox. A fighter who is not on screen
  points at everything except the art that failed to arrive, which is why this
  took a bug report to find.

Renaming a delivered file is still fine — that is what `tools/apply_sprite_adjustments.py`
and the intake tools do — but it is worth knowing that the old path dies with
the rename, and anybody mid-session is one reload away from it.

## Preparing delivered effect art

`tools/prep_effects.py` runs over `assets/sprites/effects/` and
`assets/sprites/summons/` after every delivery. Generated art arrives with
25-46% transparent padding, which matters because the renderer sizes a sprite
by its image height — padding makes an effect draw undersized and shifts it off
the projectile's collision center or off the ground line. The tool trims to the
alpha bounding box, drops keying specks, and downscales. It is idempotent.

## Delivered-art hygiene

Generated replacement art is checked on arrival for two failure modes that a
magenta chroma key introduces: **semi-transparent subjects** (body pixels below
full alpha, so the stage bleeds through) and **warm-tone loss** (pink hair and
skin sit near magenta and get keyed away). Sukuna's `r4c2` hit both. Prefer
true alpha output, or a neutral grey key, for characters with pink or red
palettes.

## Sizing: why `bodyH` is not a size control

Every delivered pose is generated to fill its canvas, so the raw art bbox is
near-identical across poses (measured 986-991 px for all 14 of Gojo's new
frames). `renderScale` is derived as `bodyH / artBBoxHeight`, which means the
**rendered size is driven entirely by the hand-set `bodyH` target** — and
because bbox height is not pose-invariant, matching bbox heights across poses
does *not* make the character look the same size.

This bit us: `ledge_hang` shipped with `bodyH` at ~53% of idle and rendered as a
tiny figure in all 17 characters. A hanging pose extends the silhouette
vertically, so its target must *exceed* the standing idle, not fall below it.
Corrected to `idle_a x 1.15`.

**Nothing here can be fixed by measuring the art.** Head-size measurement — the
obvious pose-invariant proxy — is unreliable on this art: on Toji's run frames
the detector measures a "head" 478-606 px wide because it captures arms and
torso. Two separate attempts at automatic size normalisation produced worse
results than hand values, and a third would too.

What *can* be automated is the opposite approach: never look at pixels, and
compare one hand-set number against the others. Ten animation states turn out to
carry a single height ratio across every size-reviewed fighter, and those are
recoverable exactly — `tools/audit_frame_sizes.py` reports them and
`tools/auto_tune.py` sets them on import. The other fifteen states vary 8-18%
between characters, which is the size of the corrections themselves, so they are
refused rather than guessed at. See
[sprite-auto-adjust.md](sprite-auto-adjust.md).

**So sizing is still a human-in-the-loop judgement** everywhere it is actually a
judgement. `tools/size_review.py` renders every pose at true in-game scale on a
shared ground line with the idle head height marked, and `workbench/` (see
below) allows live adjustment.

### How big a character is overall

Per-*pose* size is `bodyH`, above. How big the *character* is comes from their
canon height — see [character-heights.md](character-heights.md). Briefly:
`heightCm` in characters.js becomes a head-height target, and `heights.js`
solves each character's draw scale from it. The sprite workbench's **Character
height** control edits that one number and rescales the whole sprite set.

### Replacing a sprite whose art is wrong

Placement problems are fixed in the workbench. Art problems are not — the file
itself has to change. Two flags carry that, and **the line between them is who
does the work:**

- **Sprite needs replacement** (`needsReplacement`) — the drawing is wrong and
  nothing in the file can be edited into the right picture. It goes out as an
  asset request and comes back as new art.
- **Improvement request** (`wantsImprovement`) — the drawing is right and the
  *file* is wrong. That is repo work, done here with `tools/dekey_fringe.py` and
  friends, and it never waits on a round.

Each has a dropdown naming *what* is wrong, because a redraw and a re-key are
very different asks and a request that does not distinguish them is one someone
has to come back and clarify:

| Flag | Kind | Means |
|---|---|---|
| `needsReplacement` | `quality` | the drawing is rough, malformed or off-model |
| `needsReplacement` | `pose` | reads poorly, or is not the action it stands for |
| `needsReplacement` | `character` | likeness or costume is off |
| `needsReplacement` | `alternate` | the drawing is not condemned — deliver a **second** one beside it. See below. |
| `needsReplacement` | `delete` | this DRAWING is surplus — discard it and keep the other variant. Only offered on a pose that has more than one drawing, so a deletion can never leave a pose with no art. Stored on the variant option rather than the pose, because it names one image out of several. |
| `wantsImprovement` | `alpha` | transparency is wrong or has hard edges |
| `wantsImprovement` | `crop` | the framing or bounds are wrong |
| `wantsImprovement` | `bleed` | colour bleeds past the silhouette |

It used to be the other way round — `replace` sat beside `fix alpha` under
`needsReplacement`, and pose and quality complaints were filed as the softer
wish, so the blocking list was full of things nobody needed to draw. [19efd99]
split them by who does the work. Anything written before that uses the old
names; a legacy `true` or `"replace"` still reads as `quality`.

Either flag can carry a **description** — free text saying what is actually
wrong with this drawing, written in the workbench beside the dropdown. The kind
says which of six shapes the fault has; it cannot say that the naginata bends
where it crosses her chest, and the person who spotted that is otherwise the
only one who ever knew. It is optional, it travels through the same export and
apply path, and `list_replacements.py` prints it under the pose and as a column
in the markdown a request is written from. Notes belong to the *drawing*
(`VARIANT_REVIEW`), so switching drawings does not leave a description of the
old one attached to its replacement, and clearing a flag clears its note.

#### Request alternate

`alternate` is the one replacement kind that does not condemn the drawing. The
ask is still "draw this" and it goes out in the request like the others, but the
delivery lands **beside** the current art rather than on top of it: a second
option on the pose's chevron, with the selection untouched. It is for a pose
that works and might work better, where replacing it outright throws away
something you cannot get back if the new one loses.

It is the one delivery that leaves no trace of itself — the art on screen is
unchanged, the numbers are unchanged, and the only new thing is an option behind
a chevron nobody has a reason to open. So `intake_variants.py` marks the new
option `fresh`, which the workbench draws as a dot on the chevron and on the
option itself, and puts the pose on the **All Recently Updated Poses** list with
`how: "alternate"`. Both clear when the pose is adjusted or marked reviewed, the
same lifecycle as every other marker here.

#### A repeated flag is a missing rule

A flag is one sentence about one drawing, but flags come in batches, and the
same complaint on four fighters is not four mistakes — it is something nobody
told the artist. That belongs in [pose-brief.md](pose-brief.md), the standing
brief a new set is drawn from, which is cumulative where the request files are
not. `python3 tools/list_replacements.py --markdown` groups the open flags by
kind, which is the quickest way to see a repeat.

#### A flagged pose is marked in the grid

A `needsReplacement` flag other than `delete` means **somebody has been asked to
draw this pose again**, so the cell carries a red **⚠** in its corner and the
cell itself is dimmed. Both say the same thing: any placement done on this
drawing today is measured off art that is on its way out, because the
replacement is measured from scratch when it lands.

Neither is a barrier — the pose still selects, still edits and still exports,
because a request can sit unanswered for rounds and the art has to stay usable
in the meantime. The point is only that you find out *before* starting rather
than after. `delete` is excluded: it throws a drawing away and asks for nothing,
so no art is coming. The improvement flags are excluded too — they are repo work
on the file we already have, and nothing arrives to overwrite the numbers.

**A flag is also an instruction to the next import.** When new art arrives for a
flagged pose, what happens to the old drawing is decided by what the flag said —
`intake_variants.py --plan` reads it and reports the disposition:

| Flag on the pose | Incoming art |
|---|---|
| `needsReplacement`: `quality`, `pose`, `character`, or the selected drawing tagged `delete` | **replaces it outright** — the old art was condemned, so nothing is kept |
| `needsReplacement`: `alternate` | **added as a variant, selection unchanged, and marked new** — the request asked for a second opinion, and selecting it here would answer the question it was raised to ask |
| any `wantsImprovement` | **added as a variant and selected**, old drawing kept as a fallback |
| unflagged | **added as a variant, selection unchanged** |

The split is between a verdict on the *drawing* and a complaint about the
*file*. "Redraw this" says the drawing should not survive; "the alpha is wrong"
says it should, and a delivery answering one is a second opinion rather than a
replacement — kept beside the original until something is demonstrably better.
See [assets/intake/README.md](../assets/intake/README.md).

**Answering these flags is a procedure, not a judgement call each time.** Ask for
a "full sprite cleanup" and [docs/sprite-cleanup.md](sprite-cleanup.md) is what
runs: deletions applied, alpha/crop/bleed fixed in place with a before/after
contact sheet and workbench deep links to approve, and everything needing new art
folded into the open asset-request round.

The kind is the flag's *value*, so there is one field rather than a boolean and a
reason that could disagree. `REPLACEMENT_KINDS` and `IMPROVEMENT_KINDS` in
`src/sprites.js` are the single source of truth — `list_replacements.py` parses
both from there — so adding a kind is one line.

The flag rides through the same export and apply path as everything else:

```
workbench  ->  Export  ->  apply_sprite_adjustments.py  ->  needsReplacement: true
python3 tools/list_replacements.py --markdown     # grouped by kind, for a request
```

#### What survives the redraw

A wholesale redraw and a crop fix are not the same event, so they do not get the
same treatment on the way back in. `KIND_PLACEMENT` in `src/sprites.js` maps
each kind to how much of the existing placement is still meaningful, and
`intake_import.py` follows it:

| Kind | Survives | Because |
|---|---|---|
| `alpha` | **keep** | same drawing, same bounds — every measurement and anchor is still exactly right |
| `crop`, `bleed` | **reframe** | same drawing, moved bounds — the tuning still applies, but the numbers have to be re-pointed at the new framing |
| `quality`, `pose`, `character` | **discard** | a different drawing; nothing about the old placement means anything |
| `delete` | **none** | there is no incoming art, so there is no placement to decide |

An unflagged frame is treated as a wholesale replacement, which is the safe
reading: nothing said the art was merely being touched up.

The reframe is the delicate one, and it is delicate in two ways. Anchors are
stored in the image's own pixels, so they move when the framing does. And a
frame's `oy` and `bodyBottom` are *independent* — `bodyBottom` is the foot line,
`oy` is where the art sits, and the gap between them is a hand-tuned ground
contact for a pose drawn in perspective. Re-deriving either from the other
silently throws that away.

So a touch-up's placement is derived from **how far the re-crop moved the
drawing**, not rebuilt from scratch: `ox`/`oy` shift by the change in the content
box, the anchors ride along with them, and `renderScale` is held so the drawing
comes back at exactly the size it had. Matching rendered *heights* instead would
be wrong — trimming a bleed makes the content box smaller, and stretching the
result back would quietly enlarge the fighter.

`tools/test_intake_placement.py` proves it, against synthetic re-crops of real
art where the right answer is known: the art stands in the same place, the tuned
ground contact survives, and the anchor keeps both its height above the feet and
its offset across the body.

#### Clearing

The flags clear themselves. `intake_import.py` drops `needsReplacement` and
`wantsImprovement` when the new art lands; on a `discard` it drops the anchors
and measurements too, and rolls back hand tuning first, because a nudge made to
compensate for bad art must not be inherited by the art that fixes it.
`apply_sprite_adjustments.py` records each hand-edited field's pre-edit value in
`edited` so that rollback has something to restore.

Flagging and importing are the two ends of one pipeline, so the list is always
what is still outstanding rather than a historical record.

#### Finding what the round overwrote

Rolling the tuning back is right, and it leaves work to do: those poses now stand
at whatever the placement maths derived for the new art, and someone has to go
back through them. They are scattered across the roster by definition — a round
touches four fighters — and one character at a time is the wrong shape for
finding them, which meant opening every character and remembering which poses
had been tuned before the delivery.

So an import over existing art leaves a marker on the pose:

```json
"replaced": { "at": "2026-08-08T18:22:04+00:00", "kept": "discard",
              "how": "import", "lost": ["ox", "renderScale", "anchors"] }
```

`lost` is what has to be redone — the keys of the `edited` map that was rolled
back, plus the anchors when those went with the drawing. An empty `lost` is a
touch-up that came back with its tuning intact: worth a look, not a re-tune. A
brand-new pose is marked too, as `how: "new"` with an empty `lost`, so it sorts
below the poses with tuning to redo — it overwrote nothing, but it still has to
be placed, and a round that adds fifteen poses to one fighter and seventeen to
another scatters that work exactly the way an overwrite does.
`intake_variants.py` writes one too when it
selects a delivered alternate over the art a pose was pointing at, because the
pose's numbers stop applying just the same.

### Staged fighters are edited here too

The dropdown lists every fighter in `CHARACTER_KEYS` **plus every one in
`STAGED_CHARACTER_KEYS`** — the ones whose art is unfinished and who are
therefore off the select screen. That is not a special case bolted on; it is the
set the tool exists for. A staged fighter's sprites arrive through the same
intake, land on the same updated list and wait for the same approval, so
hiding them meant a delivery could not be looked at until the fighter was
already live, which is backwards.

They are labelled *(not on the roster yet)* rather than hidden, because it
changes what an approval means: nothing is drawing either drawing today, so the
decision settles which one the set carries when the fighter ships. The
**Replacement waiting** panel says so on a staged fighter.

The sprite workbench's character dropdown ends with **All Recently Updated
Poses**, which is those markers listed across the whole roster, newest round
first and the poses that lost tuning at the top. It is not a character: selecting
a pose switches to its character underneath, so the panel, the export and the
undo stack go on working on real characters — one pass can walk poses belonging
to four fighters and export all four at once, which the export already handled.

It drains the same way the flags do. Adjusting a pose takes it off the list, since
being retuned is the entire point of being on it; **Mark reviewed** is for the
other outcome — the new art needed nothing — and exports as `clearUpdated`, which
`apply_sprite_adjustments.py` reads. Neither takes effect until the export is
applied, so a pose stays on the list, ticked or dotted, while it is worked on.

### Improvement requests

`wantsImprovement` is the softer ask: the art *works*, it is just not as good as
it should be. One of `quality` (rough or sloppily executed), `pose` (reads
poorly, or is not the action it stands for) or `character` (likeness or costume
is off) — `IMPROVEMENT_KINDS` in `src/sprites.js`.

It travels the same export/apply path and is listed by the same tool, but
separately and after the replacements, because nothing is blocked by one.

### Catching poses that are sized wrong

`tools/audit_frame_sizes.py` compares every pose against the height its
animation state occupies across the size-reviewed roster — a crouch is short, a
ledge hang is tall — and reports the ones that fall outside it. It never
measures the art, which is what made the two earlier normalisation attempts
worse than hand values; it only compares one hand-set number against others.

```
python3 tools/audit_frame_sizes.py          # report
python3 tools/audit_frame_sizes.py --fix    # correct the outliers
```

Run it after importing a new character. Rounds 7-9 shipped without a size pass
and it found 41 broken poses across those six fighters and none across the
original 17 — including the same `ledge_hang` bug documented above, and `run`
frames rendering at 0.65-0.72x instead of the 0.82x every reviewed character
uses.

## Intake pipeline (round 6 onward)

Delivered art lands in `assets/intake/<char>/<frame>.png` and is **not** loaded
by the game. Three steps, each separable so a bad delivery stops at the door:

1. `tools/intake.py` — keys the background, straightens facing, measures body
   height / clipping / green fringe / holes, writes `assets/intake/_processed/`.
2. `tools/intake_sheets.py` — before/after boards labelled with the animation
   state each frame drives, for human approval.
3. `tools/intake_import.py --approve FILE` — copies approved frames into
   `assets/sprites/` and registers them.
4. `tools/bake_anchors.py` — measures the rotation pivot (and the ledge grip on
   a hang pose) for anything newly registered. Skips frames whose anchors were
   placed by hand, so it is safe to re-run over the whole roster.
5. `tools/auto_tune.py` — applies the placement corrections that are mechanical.
   See [the tuning phase](#the-tuning-phase) below.
6. `tools/canonicalise_sprites.py` — after the round's approve/keep verdicts are
   applied, gives each pose's drawing the pose's own name and archives the one
   it displaced. Deliveries land in `<char>/incoming/` and approving them is a
   change of pointer, so this is what keeps the tree describing the game rather
   than the order things arrived in. Re-runnable; a no-op when everything is
   already where it belongs.
7. **Move the answered requests into history.**
   [asset-requests.md](asset-requests.md) is defined as "everything in here is
   outstanding", so a delivered section has to leave it or the file misreports
   what is still needed. See step 8 in
   [assets/intake/README.md](../assets/intake/README.md#what-happens-to-it).

Placement is delegated to `extract_sprites.generated_frame_meta`. A replacement
inherits the old frame's rendered height and foot line, so a swap changes art
and never size; a brand-new frame borrows the character's idle scale factor.

Step 4 exists because the sprites rotate now — see `docs/sprite-motion.md`. A
frame with no `anchors.com` still draws, falling back to a heuristic; it just
pivots less convincingly than a measured one.

### The tuning phase

Steps 1-4 land the art. What they cannot do is decide where it stands, and for
years that was entirely a hand pass in the workbench.

Some of it turned out not to be a judgement at all. `edited` stores each
hand-tuned field's *pre-edit* value, which makes every correction ever made a
labelled example — the pipeline's answer beside a human's. Asked across 1,605 of
them, three of the corrections are mechanical and the rest are not;
[sprite-auto-adjust.md](sprite-auto-adjust.md) is that measurement and
`tools/auto_tune.py` is the part of it that runs.

```bash
python3 tools/auto_tune.py --report     # what the rules learned from the roster
python3 tools/auto_tune.py --backtest   # scored against the hand values
python3 tools/auto_tune.py --dry-run    # what it would do to the last import
python3 tools/auto_tune.py
```

The bar for a rule is not "usually right" but **wrong in a consistent
direction**, because a correction that guesses can land further from the answer
than doing nothing and does it silently. Three clear it: the ground contact
(the derived foot line is the bottom of the alpha box, which it can only ever
be — all 513 hand corrections raised it), the horizontal centring (the derived
`ox` centres the bounding box, so a naginata drags the body off centre), and
the size of the ten animation states every reviewed fighter sizes identically.
Rotation and facing do not, and are left alone.

**Tuning is not an edit.** The workbench's *No saved edits (to do)* list, its
character markers and the recently-updated list all read `meta.edited`, and
nothing here writes there — provenance goes to `autoTuned`, which the panel
shows as "Auto-placed · not an edit". A tuned pose is still a pose nobody has
looked at, because a rule measured across the roster cannot say whether *this*
drawing looks right. The tuner also never touches a field that appears in
`edited`: a value somebody chose while looking at the sprite outranks every
measurement in it.

`tools/test_auto_tune.py` holds those guarantees down — that a hand-edited field
survives, that nothing is marked as edited, that a non-uniform state is refused,
and that running it twice changes nothing the second time.

**The foot rule declines where there is no foot.** `NO_STANDING_FOOT` names the
states whose contact is not the sole of a standing foot: `prone`, which lies
flat, and the five airborne states, which touch nothing at all. In the air the
rule was solving for a contact that does not exist — it pinned every jump, fall,
air dodge and aerial by whatever pixel hung lowest, a trailing toe or a tucked
heel, to the ground line. What an airborne pose has to sit correctly inside is
the **hurtbox**, which does not move when a fighter leaves the ground, and only
an eye can place a tucked body in it. So the rule leaves them alone and the
workbench's vertical-position control is live there.

`tools/audit_air_placement.mjs` is where that gets checked. It measures every
pose against the box `combat.js` actually tests for it and reports the ones
sitting lower in their own hurtbox than the same pose does across the rest of
the roster — per pose key, because a `dodge_roll` is legitimately floor-level
and a flat threshold would report the whole column.

### Keying, and why it is layered

Three passes, each narrower than the last, because a single rule cannot tell
background from art:

- **border flood fill** — key colour reachable from the canvas edge
- **strict pass** — unmistakable key colour anywhere, for background sealed
  inside the silhouette
- **flat-fill pass** — key colour that is also locally uniform; art over the
  same colour carries lineart and shading, background does not

Translucent motion trails drawn over the key come back tinted and defeat all
three. Those are cleared per-frame via `TINT_FIX` / `GREY_TINT_FIX`, named by a
reviewer, never swept.

**Facing is not automated.** `detect_facing` returned near-zero confidence on
two thirds of round 6. Only confident calls are acted on; the rest are marked on
the board and corrected via `FACING_OVERRIDE`.

## Alternate sprite sets

`manifest.alternates.<char>.<frame>` holds a second art set, opted into with
**Settings → Sprites: Default / Alternate**. Unlisted frames fall through to the
default set, so an alternate only ships the frames that differ. Hanami's
round-6 redesign is the first (8 frames).

## Summoned-curse sprites

`tools/extract_curses.py` lifts Geto's four cursed spirits and his rainbow
dragon out of the art they were drawn into, writing them to
`assets/sprites/effects/`. Baking a creature into a fighter frame means it
cannot move, be timed or be reused, and it inflates the fighter's bounding box.
As projectiles they do all three. His volley uses `spritePool`, drawing a random
curse per shot.

## How the art gets loaded (lazy, in `src/assets.js`)

Sprite art is ~450 MB across 23 fighters and a match uses at most four of them,
so nothing waits on the whole roster. The loader splits three ways:

| Function | What it fetches | When |
|---|---|---|
| `loadCoreAssets()` | `manifest.json` only (~230 KB) | before the menu, blocking |
| `startBackgroundLoad()` | shared art, then each fighter, then stage backdrops | behind the menu |
| `ensureMatchAssets(keys, stage)` | whatever this match still lacks | at match start |
| `loadFrame(char, frame)` | one frame | the workbenches, selected pose first |
| `loadAllAssets()` | everything, awaited | nothing in-tree; kept for one-off scripts |

The menu itself needs no canvas art: select-screen portraits (`assets/cards/`)
and stage tiles are plain `<img>` tags the browser fetches on its own. So the
blocking load is one JSON file, and the title screen appears in well under a
second.

Behind it, a **pump** walks a queue one group at a time. A group is one
fighter's frames (plus their alternate set), one stage backdrop, or the
`shared` bundle — effects, summons, domain backdrops, stage-hazard props. One
group at a time is deliberate: a fighter is ~30 files, which already saturates
the six connections a browser opens per host, so running several at once would
only mean the fighter a player just picked queues behind three they did not.

Two levels of priority sit on top:

- **Looking at a fighter** (pad cursor, mouse hover) calls `previewCharacter()`,
  which moves them to the head of the queue. It starts no download of its own,
  so sweeping across the roster cannot kick off twenty parallel loads.
- **Choosing a fighter** calls `claimCharacter()`, which starts them
  immediately, outside the queue, and makes the pump defer until every claim has
  finished. The CPU's random draw and the default fighters on slots 3 and 4 are
  claimed the same way.

The two workbenches use the same core load and then stream **only the character
on screen** (`workbench/lazy_sprites.js`): the selected pose first so there is
something to look at, then the rest of that set behind it, with a spinner on the
canvas until the pose has art. Switching characters abandons the previous tail —
its frames stay cached, so switching back is instant, but no bandwidth finishes a
set nobody is looking at. Gojo's idle is fetched separately because it is the
size benchmark drawn beside *every* character, and the action workbench pulls the
individual effect and summon art a move spawns via `loadSharedImage()`. Both
mirror the current character (and pose, or action) into the URL with
`replaceState`, so a reload or a shared link comes back to what you were editing.

`ensureMatchAssets()` is the backstop, and it waits on the entrants and the
stage backdrop **only**. Everything in `shared` has a procedural fallback in the
renderer — a summon or effect that has not arrived yet draws its stand-in shape
— whereas `drawCharFrame` bails on a missing image, so a fighter without frames
would be invisible. That is the whole reason the gate exists. In practice it
never shows itself: a fighter claimed at pick time is in memory long before the
player has chosen a stage. It does show for a Random slot, which only resolves
to a concrete fighter inside `resetMatch()` — and re-resolves on every rematch.

## Staging changes for upload

There is no VCS here, so `tools/collect_updates.py` tracks what still needs
uploading in `tools/.updates-ledger.json` — a map of every file ever staged to
the mtime it had when staged. The ledger lives beside the tool, NOT inside
`updates/`, because `updates/` is emptied after each upload.

    python3 tools/collect_updates.py --new     # what changed since last staged
    python3 tools/collect_updates.py --new --list

`--hours N` and `--since` still exist for one-off queries, but `--new` is the
one to use. A time window cannot tell "changed recently" from "changed a while
ago and never uploaded", and the second case is the one that loses work.
