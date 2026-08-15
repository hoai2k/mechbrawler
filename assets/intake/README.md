# assets/intake — where delivered art is dropped

**What to draw is [docs/image-requests.md](../../docs/image-requests.md)** —
the single image-request document for every render mode, generated from the
rounds and from what is on disk. This file is about what happens to a delivery
once it lands here.

**Upload new art here, not into `sprites/assets/`.** A delivery that arrives
wrapped in its own batch directory — `R20A/assets/intake/summons/...`, the shape
an upload of a whole tree makes — has to be flattened onto the layout below
before anything runs: `tools/intake.py` reads `assets/intake/<dir>/*.png` one
level deep, so a plate nested deeper is silently not there rather than an error.
`git mv` it into place; the batch directory is not kept.

**The 3D track's reference images (DI rounds) have their own importer**, because
they are not sprites — nothing keys, trims or measures them:
`python3 tools/import_render3d_images.py` (dry run) then `--apply`. It knows
where each round lands and refuses a turnaround board whose head runs off the
canvas, which twelve of the first twenty did.

```
assets/intake/<character>/<pose_key>.png     e.g. assets/intake/yuji/idle_a.png
assets/intake/effects/<name>.png             e.g. assets/intake/effects/sedan.png
assets/intake/summons/<name>.png
assets/intake/garnish/<name>.png
assets/intake/cards/<key>_card.jpg
assets/intake/cards/simple/<key>_tile.jpg
```

**Garnish cards are sprites, not backgrounds**, despite belonging to the 3D
camera: keyed screen, one subject, margin all round, at least 1000 px on the
long edge. They land at `assets/sprites/garnish/<name>.png` and
[src/camera3d/garnish.js](../../src/camera3d/garnish.js) draws them between the
lens and the fight in place of its procedural stand-in, one file at a time — a
card with no delivery keeps the drawing it has. Round 18F delivered all
fourteen, so anything arriving now is a redraw or a new element, and a new
element also needs a spawner in `garnish.js` the way `signal_gantry` did.

**Cards take the short path.** Neither kind is keyed, trimmed, measured or
registered in the manifest, so landing one is a move into `assets/cards/` (hero
cards) or `assets/cards/simple/` (the simplified roster tiles asked for in round
15B) and nothing else. Everything below is about sprites.

Delivered **sound** goes to `assets/intake/sfx/` and takes the short path: it
needs no keying or measuring, so landing it is a move into `assets/sfx/`, a key
in `src/config_audio.js`, and the request moved into
[docs/audio-requests-history.md](../../docs/audio-requests-history.md) where
`tools/generate_sfx.py` can re-roll it.

**A summon plate takes the short path too**, in its own tree: creatures belong
to no fighter, so nothing about them is in `manifest.json` and neither
`intake_variants.py` nor `intake_import.py` knows what they are — handing them a
`summons/` directory registers a character called "summons". Key them with
`intake.py` like anything else, then copy `_processed/summons/*.png` into
`assets/sprites/summons/`, run `python3 tools/prep_effects.py --dirs summons` to
trim and downscale, and **run `python3 tools/check_summon_plates.py`**, which
fails on a plate holding three or more figures — the fault that put 44
contact sheets into the game and became round 20A. Their raw originals archive
to `assets/reference/round<N>/summons/`. A creature's hit box is measured off
its own `idle_a`, so landing that pose is also what retires any authored
`hitW`/`hitH` pair in `src/config_summons.js`.

A **background** takes the short path too — no keying, no measuring, no manifest
entry — so landing one is a copy into `assets/backgrounds/` and nothing else.
**Copy the painting it replaces into `assets/reference/backgrounds_<round>/`
first** (18E's went to `backgrounds_previous/`, 20B's to `backgrounds_18e/`).
Putting a board back is then one file copy rather than a trip through git.
Watch the extension: a board is registered in `src/stages.js` by filename, so a
`.webp` replaced by a `.jpg` needs that one string changed with it (round 18E,
Shibuya Night).

**`assets/backgrounds/flat/` is not an archive — do not overwrite it.** A board
ships two paintings of the same scene, one per camera: the wide plate in
`assets/backgrounds/` for the 3D camera, which sees only its centre ~49%, and
the pre-18E painting in `flat/` for the flat camera, which sees the whole thing.
`backgroundFile()` in `src/stages.js` picks between them and `src/assets.js`
fetches the one the running camera wants, so a delivery landing in the wrong
directory changes which camera it breaks rather than whether it works.

Everything below is about sprites.

Nothing in this directory is loaded by the game, which is the whole point:
generated art arrives as an untrimmed plate on a magenta or grey field with no
alpha channel, and dropping that straight into `sprites/assets/` makes the game
try to draw a 1024×1536 background as a sprite. Every round so far has arrived
that way, so this is the normal case, not a mistake.

## What happens to it

1. `tools/intake.py` keys the background, straightens facing, and measures body
   height / clipping / fringe / holes → `assets/intake/_processed/` (gitignored).
   Straightening facing is a **character** rule: fighters are drawn facing right,
   so art delivered facing left is flipped. `assets/intake/effects/` and
   `assets/intake/garnish/` are exempt (`NO_MIRROR_DIRS`) — anything that
   travels sideways in those two is drawn pointing LEFT because its renderer
   mirrors it when it flies right, and the rest have no facing at all.
2. `tools/intake_sheets.py` renders before/after boards for approval. **Look at
   them before importing.** They are the only step that catches what no
   measurement will: round 15A's four-figures-on-one-plate run frame and its
   five backwards-mirrored poses were both found here, and a mirrored strike
   reads as a perfectly good strike until you notice it lands behind the
   fighter.
3. `tools/intake_import.py --approve` copies approved frames into
   `sprites/assets/<char>/` and registers them in `manifest.json`. **A frame
   that replaces existing art does not enter the game here** — it lands beside
   the drawing it replaces and waits to be approved in the workbench. A
   brand-new pose has nothing to compare against and goes straight in. See
   [the confirm step](#the-confirm-step) below.
4. `tools/bake_anchors.py` measures each new frame's centre of mass.
5. `tools/auto_tune.py` applies the placement corrections that are mechanical —
   the ground contact, the centring, and the size of the states the whole roster
   sizes alike. It never touches a field you have edited, and it does **not**
   count as an edit: the poses stay on the workbench's to-do lists, because a
   rule cannot say whether this drawing looks right. See
   [sprites/docs/sprite-auto-adjust.md](../../sprites/docs/sprite-auto-adjust.md).
6. `tools/pose_seed.py` fits a pose read onto each new frame. Every frame in the
   manifest owes one — `node tools/check_pose_reads.mjs` fails on a frame with
   no pose, so a round that adds pose keys is red until this runs — and the
   seed is a starting point for the pose editor, not a read. It is additive:
   poses already in the file are kept, including the hand-read ones, and only
   the new frames are fitted. (`--force` still reseeds a whole character from
   the reference and throws their hand work away.)
7. The untouched originals are moved to `assets/reference/round<N>/<char>/` so a
   frame can be reprocessed later without regenerating it.
8. **Once the round's verdicts are applied, put the names back on the
   drawings.** `python3 tools/canonicalise_sprites.py` moves whatever each pose
   ended up drawing to `sprites/assets/<char>/<pose>.png`, and whatever used to
   hold that name into `<char>/archive/<pose>_2.png`. Approving is a change of
   pointer, not a move, so without this the art in the game goes on living at a
   staging path and `<char>/<pose>.png` is a drawing nothing draws. Nothing is
   deleted — a superseded drawing is the only copy of art that shipped for a
   while, and the workbench still offers it — and every reference in the
   manifest is rewritten. It checks the whole plan first — that no two drawings
   want one name, that the file count is unchanged, that nothing is left
   pointing at a path that will not exist — and moves only once all three hold,
   because a refusal after the moves leaves the tree rearranged and the manifest
   describing the old arrangement, which is a repair by hand (round 20).
9. **A NEW POSE KEY OWES A 3D STATE.** The game draws through more than one
   renderer, and a round that adds a pose key nobody has drawn before has only
   answered the sprite half of it. Check whether the new key is a state
   `render3d/src/states.js` knows: if it is not, the 3D and 2.5D paths have an
   animKey they cannot resolve, which is a fighter frozen mid-match rather than
   a fighter drawn slightly wrong.

   There are two honest answers and the cheap one is usually right:

   - **Alias it.** Add the state and point it at the nearest existing clip in
     `STATE_ALIASES`. No rig owes anything, every fighter animates, and the
     entry is there to be upgraded later. This is what the grab set and both
     dash attacks do.
   - **Author the clip.** Only when the pose genuinely differs from everything
     already in the library, or when 3D can afford phases the sheet cannot. The
     GAITS are the worked example of both: round 21 asks the artists for two
     walk contacts and the run sheet is a reach and a pass, and
     `render3d/src/walk_cycle.js` and `render3d/src/run_cycle.js` play
     four-phase cycles that ignore those drawings entirely, because a pose
     costs a drawing in 2D and eight joint angles here. Where the clip needs ART rather than authoring,
     raise it as a round in
     [render3d/docs/asset-requests.md](../../render3d/docs/asset-requests.md)
     (D-numbers) or
     [billboards/docs/asset-requests.md](../../billboards/docs/asset-requests.md)
     (B-numbers) — those are model/clip requests, not sprite ones, and they do
     not belong in the 2D file.

   Either way the answer is written down in the round, so "the sprites landed
   and the 3D path still plays the old pose" is a decision rather than an
   oversight. `node tools/check_kits.mjs` catches an animKey with no state at
   all; it cannot tell you that an alias is the wrong clip, which is why this is
   a step and not just a check.
10. **Update the request docs.** A delivery answers a request, and the request
   file is defined as "everything in here is outstanding" — so art that has
   landed has to leave it the same day, or the file starts lying about what is
   still needed. Move the delivered section out of
   [docs/asset-requests.md](../../docs/asset-requests.md) into
   [asset-requests-history.md](../../docs/asset-requests-history.md), keeping
   its pose lines verbatim (a later redraw of one frame has to agree with the
   others), add a row to the history table, and correct the status line at the
   top of the open file. Anything the round did NOT answer stays open, and
   anything it turned up gets flagged in the workbench and folded into the
   current round. `python3 tools/list_replacements.py --markdown` writes the
   tables in the shape that file uses.

   **And update the standing brief.** When the round's flags show the *same*
   fault on several fighters, that is a rule missing from
   [sprites/docs/pose-brief.md](../../sprites/docs/pose-brief.md) rather than a run of bad luck:
   write it in, and into that file's measurable criteria if it can be measured.
   The request docs describe one delivery and then move to history; the brief is
   what carries a lesson forward into the next character. Skipping it is how the
   same fault gets re-requested three rounds running.

   Delivered is not the same as approved. A replacement is in the repo from
   step 3 and in the *game* only when somebody approves it, so the request doc
   records the delivery and the workbench tracks the decision.

After that this directory is empty again, apart from this README.

Step 3 also records which poses it landed on top of previous work, since a redraw
rolls the hand tuning back and that work has to be done again. Those poses are
the sprite workbench's **All Recently Updated Poses** list — a round's worth of
re-tuning, gathered across every character it touched, instead of a hunt through
the roster for the ones you remember having tuned. See
[sprites/docs/asset-pipeline.md](../../sprites/docs/asset-pipeline.md#finding-what-the-round-overwrote).

## The confirm step

Until the roster was finished, an intake round changed what every player saw the
moment it ran, and the only way to find out whether a redraw was actually better
was to ship it and look. That is the wrong default for a finished game, so a
**replacement is now a proposal** until somebody says yes.

`intake_import.py` writes the new drawing to
`sprites/assets/<char>/incoming/<pose>.png` and puts two pointers on the pose:

```json
"crouch_b": {
  "file": "maki/incoming/crouch_b.png",   ← the workbench edits THIS
  "renderScale": 0.26, "bodyBottom": 148,
  "awaitingApproval": {
    "at": "2026-08-09T15:00:00+00:00",
    "live": { "file": "maki/crouch_b.png", … }   ← the game draws THIS
  }
}
```

The pose's own fields are the **new** drawing, because placing it is the work
the approval is waiting on — open the pose in the workbench and you are sizing
and grounding the art that has just arrived. `awaitingApproval.live` carries the
whole placement of the drawing still in play, and `frameMeta`/`frameImage` in
`src/assets.js` hand that to the game. The workbench asks for the other one by
passing `preview: true`.

The pose sits on **All Recently Updated Poses** with a **Replacement waiting**
panel offering two answers, because "keep what we have" is a real outcome and a
single button would make rejecting the art the thing you do by not clicking:

- **Approve** — the marker is dropped and the new drawing, with the placement
  you just gave it, becomes what the game draws.
- **Keep the current art** — the live drawing's fields go back onto the pose and
  the newcomer is discarded.

To see them together, set **This character's idle → Alternate sprite**: the
comparison slot fills with the drawing still in play, captioned *in the game
now*, so the question the approval is asking is answered side by side. The
option only appears when the pose has another drawing to show.

Approving does not end that comparison. The displaced drawing is banked as a
`Superseded` option on the pose rather than dropped, so the view goes on showing
*the drawing this replaced* after a yes — the question is still "what was here
before", and dropping the answer the moment you said yes would make the view
silently start showing something else. The file stays on disk too: it is the
only copy of a drawing that shipped for a while, and reverting is otherwise a
trip through git.

Approving and requesting a redraw are **separate answers**, and both can be
right at once. A delivery that beats what it replaced but is still not what you
want gets approved *and* flagged — the game improves now, and the pose joins the
open round. Round 13's `choso/attack_light_b` and `geto/attack_down` are both.

Either answer exports as `approvals` and is applied by
`apply_sprite_adjustments.py`, like every other change. Characters with a
replacement still waiting carry a dot in the workbench's character dropdown.

`--replace-now` skips all of this and overwrites immediately, the way imports
worked before.

## What happens to a plate is decided by the flag already on the pose

The workbench flags say what is wrong with the art the game currently draws, so
they are also the instruction for what incoming art should do about it. Nobody
has to decide twice.

The two flags split by **who does the work**, and that is what decides the
disposition. `needsReplacement` means the drawing is wrong and only a redraw
answers it, so art delivered against one is the verdict. `wantsImprovement`
means the drawing is fine and the *file* is wrong — a bad key, a bad crop,
colour past the silhouette — which is repo work; art delivered against one is a
second opinion, and the original stays to switch back to. `REPLACEMENT_KINDS`
and `IMPROVEMENT_KINDS` in `sprites/src/sprites.js` are the source of truth for which
kind is which.

| Flag on the existing pose | What the new art does |
|---|---|
| nothing registered under this name | **imported as the pose itself** |
| `needs replacement: quality / pose / character`, or the selected drawing is tagged `delete` | **replaces the old art outright.** It was condemned; keeping it would leave the chevron offering a drawing we already decided to throw away |
| `needs replacement: alternate` | **imported beside the old art, selection unchanged, and marked new.** The request asked for a second opinion, so selecting it here would answer the question it was raised to ask. The pose goes on the workbench's updated list with a dot on its chevron, because nothing else about this delivery is visible |
| `wants improvement: alpha / crop / bleed` | **imported as a variant AND selected.** The complaint was about the file, not the drawing, so the old one stays available in case the new one is worse |
| no flag at all | **held for approval, same as a flagged replacement.** "Nobody asked for this" and "somebody asked for this" reach the same place now — new art beside the old, the game unchanged, the pose on the updated list. It used to be added quietly as a variant, which was the honest answer only while a flagged import overwrote on arrival |

The kinds were the other way round until [19efd99]: `replace` sat beside `fix
alpha` under `needsReplacement`, and pose and quality complaints — the ones only
a redraw can answer — were filed as the softer wish. Anything written before
that split, in a commit message or an older doc, uses the old names.

```bash
python3 tools/intake.py                       # key everything
python3 tools/intake_variants.py --plan       # what each plate will do, and why
python3 tools/intake_variants.py --auto --label "Round 9 upload"
```

`--auto` handles the variant cases itself and writes an approvals file for the
replacements and new poses, which `intake_import.py` applies — that tool owns the
placement rules and the flag clearing, and there is no reason to have a second
implementation of either.

## Art that is different rather than better

Steps 3–6 above answer "this art replaces what shipped". Art that is a genuine
alternative — a redraw that may not beat the incumbent, a second costume, a
wind-up that reads as a strike — takes the other path:

```
python3 tools/intake_variants.py --survey       # what is here and what it would become
python3 tools/intake.py                         # key it, as always
python3 tools/intake_variants.py --import-all --label "Round 7 unused"
```

That lands the drawing at `sprites/assets/<char>/alt/<pose>.png` and adds it to
`manifest["variants"]` as another option for that pose, **without changing what
the game draws**. Its placement is measured from scratch, because it is a
different drawing — placement belongs to the image, not the pose. Choosing which
drawing a pose actually uses is then done by eye in the sprite workbench, via the
chevron on any pose that has more than one.

`--survey` is the thing to run on a folder whose contents you are unsure of: it
reports, per plate, whether it has been keyed yet and whether the pose it names
is already registered, already carries that exact drawing, or is new.

## Why it is tracked by git

`_processed/` is gitignored, but `assets/intake/<char>/` is not. Art is
delivered by uploading it to the repository, so an ignored directory would
silently swallow the upload. Raw plates live here only until they are
processed, then move to `assets/reference/`.
