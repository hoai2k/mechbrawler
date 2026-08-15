# All Requests — the index

Every open asset request in the repo, in the order to commission them, with
what each one depends on and what *kind* of thing it asks for.

**This file links; it does not duplicate.** Each request document below owns
its own briefs, prompts, delivery specs and status — this page exists so that
"what is outstanding, and what should I ask for first?" has a one-screen
answer instead of six documents to cross-read. If a detail here disagrees with
the document it links to, **the linked document wins** and this page is stale.

Nothing outstanding blocks play. The game is complete and playable on the
sprite path with 27 fighters; everything below either extends it (the 3D
tracks) or fills a gap that currently degrades to silence or to a fallback.

**[image-requests.md](image-requests.md) is THE image-request document** — every
render mode's requests, in one file — **none of them today**, and when there are, with every
prompt, canon reference, height
and character block needed to draw them. Re-run
`node tools/build_image_requests.mjs` after any delivery; it reads the open
round, the manifests and the files on disk, so it cannot go stale the way this
page can.

**Rows 1–3 and DI4 below are where those rounds are AUTHORED**, and stay the
place to edit or add one. Nobody needs to read them to draw: everything in them
is reproduced in the generated file, resolved against what is actually on disk.

**The 3D track's image rounds are done.** DI1, DI2, DI3, DI4 and DI5 are all
complete for the whole roster.

**Nothing is outstanding.** Round 20 landed in full — 44 summon plates, the
grab set and the dash attack, 152 sprites in one delivery, then the twenty
re-extended backgrounds (20B) and Yuji's four poses (20E) in deliveries of
their own — and is
[in the history](asset-requests-history.md#round-20--the-summon-sheets-the-grab-set-and-the-dash-attack).
**Round 21**, the two-frame walk cycle for all 27 fighters, followed it and is
[in the history](asset-requests-history.md#round-21--the-walk-cycle) too. Round
22 is the round to add to; [asset-requests.md](asset-requests.md) is where a
2D round is authored.

Round 18 was delivered complete and is
[in the history](asset-requests-history.md#round-18--delivered). Also
outstanding but not art: poses waiting on approval in the sprite workbench,
and six retired `hanami_alt` variant options that
`tools/canonicalise_sprites.py` refuses on.

**All three render modes are covered here.** The sprite path is fed by the 2D
art rounds (row 1); the billboard and render3d paths are fed by **one shared
commission** (rows 2–8) because they are now one pipeline: `render3d/` owns the
rigs, clips and posing, and `billboards/` is a way of PRESENTING them (a cached
card instead of live geometry). Neither
model path is blocked on code — both run today against the mannequin, which
is what `?render=billboard` and `?render=3d` now show by default for any
fighter without a delivered rig.

---

## The whole picture

| # | Request | Type | Status | Blocked by |
|---|---|---|---|---|
| 0 | [**image-requests.md — every open image request**](image-requests.md) | 🖼️ **Images** | **none outstanding.** Generated; supersedes rows 1–3 and DI4 below, which are where those rounds are AUTHORED | — |
| 1 | [2D art — round 22](asset-requests.md) *(authoring source)* | 🖼️ **Images** (sprites, backdrops) | **nothing open** — rounds 1–21 delivered; 22 is the round to add to | — |
| 2 | [3D images — DI1: turnaround boards](../render3d/docs/image-requests.md#round-di1--model-generation-turnaround-boards-the-tripo-inputs) *(authoring source)* | 🖼️ **Images** (reference) | **delivered** — all 20 | — |
| 2b | [3D images — DI5: regeneration seeds](../render3d/docs/image-requests.md#round-di5--regeneration-seeds-delivered--read-the-verdict-before-generating) *(authoring source)* | 🖼️ **Images** (reference) | **delivered** — all 5 reseeds for the models that came back broken | — |
| 3 | [3D images — DI2/DI3: face sheets, shade palettes](../render3d/docs/image-requests.md#round-di2--face-sheets-the-face-first-gates-reference) *(authoring source)* | 🖼️ **Images** (reference) | **delivered** — all 28, both rounds | — |
| 4 | [3D models — B1/D1: the Yuji pilot](../render3d/docs/asset-requests.md#round-d1--the-pilot-yuji-complete-open--draw-against-this) | 🧊 **3D model + clips** | open | DI1–DI3 for Yuji |
| 5 | [3D models — D2: library + archetypes](../render3d/docs/asset-requests.md#round-d2--the-shared-library-and-the-archetype-sets) | 🧊 **Animation clips** | open | D1 review |
| 6 | [3D models — D3: the standard roster](../render3d/docs/asset-requests.md#round-d3--the-standard-humanoid-rigs) | 🧊 **3D models + clips** | open | D2 |
| 7 | [3D models — D4: bespoke bodies](../render3d/docs/asset-requests.md#round-d4--the-bespoke-bodies) | 🧊 **3D models + clips** | open | D3 |
| 8 | [3D models — D5: spectacle](../render3d/docs/asset-requests.md#round-d5--spectacle-opens-after-d3s-first-batch) | 🧊 **Animation clips** | open | D3 first batch |
| — | [3D images — DI4: shared face textures](../render3d/docs/image-requests.md#round-di4--shared-face-textures-one-time-roster-wide) | 🖼️ **Images** (texture) | **delivered** — the shared highlight and a mouth sheet for every fighter | — |
| — | [Music](music-requests.md) | 🎵 **Music** | **all 20 delivered** | — |
| — | [Audio Rounds 1–11](audio-requests-history.md) | 🔊 Sound effects + 🎙️ voice | **all delivered** | — |
| — | [Audio Rounds 12–14 — alternate takes](audio-requests.md#round-14--two-more-of-whatever-survived-delivered) | 🎙️ Voice | **delivered** — alternates to audition; 38 auditioned and [pruned](audio-pruned.md) | — |
| — | [Audio Round 15 — the instruments](audio-requests.md#round-15--three-techniques-that-were-never-really-scored-delivered) | 🔊 Sound effects | **delivered** — a C♯m chord and metal licks for Gakuganji, the sea for Dagon, a djembe for Panda | — |
| — | [2D art Rounds 1–21](asset-requests-history.md) | 🖼️ Images | **delivered** | — |

---

## Unfinished engineering — plans you may or may not want continued

Not asset requests: these are **implementation** plans with work still in
them. They need no delivery to progress, only a decision to carry on. Listed
so that "what is half-built?" is answerable from the same page.

| Plan | State | What is left |
|---|---|---|
| [2.5D camera (`?camera=3d`)](2.5d-camera-plan.md) | feature-complete, polish open | Garnish cards for 15 of 20 boards; a Settings toggle. Its art asks (18E backdrops, 18F cards) are **all delivered and in use**; composing with the render backends is **built** (§11 of that plan) |
| [render3d (`?render=3d`)](../render3d/docs/plan.md) | D0–D2 built, D3+ need art | Engine side is done and dialled. D3–D5 are asset rounds (7–11 above), not code |
| [billboards (`?render=billboard`)](../billboards/docs/plan.md) | B0 built, B1+ need art | Same shape: the pipeline runs on the mannequin; everything further is the shared commission |
| [Effects plan](effects-plan.md) | reference doc | Element-aware attack feedback; check `src/config_fx.js` against it before treating anything here as open |
| [Stage variety](stage-variety-plan.md) | **complete** (15/15 checked) | Nothing — kept for the decisions record and [its ideas doc](stage-variety-ideas.md) |

### The render modes and the camera compose

`?render=` (how a character is drawn) and `?camera=` (the lens they exist in)
are orthogonal flags, and every combination now draws bodies by the mechanism
native to that backend — see [§11 of the camera plan](2.5d-camera-plan.md).

| | `?render=sprite` | `?render=billboard` | `?render=3d` |
|---|---|---|---|
| *(no camera flag)* | sprites | posed models / mannequins, blitted flat | live anime models / mannequins, blitted flat |
| `?camera=3d` | sprite cards in 3D space | cards wearing the posed-model texture | **the real rig in the scene**, lit and rendered by the game camera |

The bottom-right cell is the one that took design rather than plumbing: the
model goes into the camera's own scene as geometry, so it gets real
perspective, real depth against the extruded platforms, and the
micro-parallax dial retires. `tools/smoke_camera_render.mjs` asserts each
cell by its own mechanism, because every path ends in a fighter-shaped thing
on screen and "it quietly fell back to sprites" is the failure worth testing
for.

---

## The order, and why

### The audio column is closed

It used to head this list. Round 10 delivered the domain moment — the barrier,
the room tone, the refusal cue, Dagon's missing sting and **the eight domain
owners' spoken call-outs**, the first voice lines in the game — along with the
three element hit layers the staged fighters had been owed. Nothing in
[audio-requests.md](audio-requests.md) is outstanding.

Round 11 followed it and is also delivered: **Inumaki's cursed speech**, his
three commands and his ultimate in Japanese, in a voice cast for him alone.

**Voice is no longer a request the repo cannot fill itself.** 10A was the only
🎙️ entry here and was written on the assumption it needed a Japanese-speaking
VA or a hand-driven TTS pass, because `tools/generate_sfx.py` drives a
sound-*effects* endpoint and does not speak. It now has a sibling,
`tools/generate_voice.py`, which reads the same docs in the same format and
drives text-to-speech instead — so a future voice round is commissioned exactly
like a sound round, with one extra field naming the cast voice. Round 11 added
the other half: `MOVE_CALL` in `src/config_audio.js` maps any fighter's move to
a spoken line, so **a further slice of the technique call-out pass is now rows
in a table rather than new code**.

### The 2D art column (1) — the sprite path's own queue

Unrelated to the 3D tracks and on its own clock, and currently empty: rounds
1–21 are all delivered. Kept here because it is the queue that touches what
most players actually see, and the next round lands in it.

**Rows 1b and 1c now have a home.** §10 of the camera plan measured which art
changes the 2.5D camera would actually reward, and that finding is now written
as two request blocks in the 2D art file.

**18E** repaints the twenty stage backdrops at **3200×1800**. The backdrop
plane over-fills the frustum, so only ~49% of a painting's linear extent is
ever on screen — a 1600×900 board upscales 1.62× (3.24× at DPR 2) where flat
mode shows it at a slight downscale. The rule that falls out is a neat one:
paint 3200×1800 and make the **centre 1600×900** a finished picture on its
own, because that centre box is what the 3D camera crops to while flat mode
shows the whole frame. `flooded_gate.jpg` (800×437), `shibuya_night.webp`
(1200×675) and `curse_maw.jpg` (wrong aspect) went first.

**Delivered.** All twenty landed at 3200×1800; the previous paintings are kept
at `assets/reference/backgrounds_previous/`. Shibuya Night came as `.jpg` and
`src/stages.js` changed with it. The rest of round 18 landed too.

**Then re-done once more as 20B**, because several 18E plates had reworked the
centre instead of extending it, and the centre is the only part the 3D camera
sees. The twenty 20B plates are live in `assets/backgrounds/`; 18E's are kept
at `assets/reference/backgrounds_18e/`, and `assets/backgrounds/flat/` — the
pre-18E paintings the flat camera still draws — was untouched by either round.

**18F** is the more interesting half and is optional: fourteen keyed near-field
cards for the garnish layer. Splitting a *backdrop* into parallax layers buys
2.3 px of shift because this camera barely translates; a card at `z = +2` buys
14 px at the same yaw and 64 px in a drama shot. Proximity to the lens is the
whole term — which is why 18E asks for bigger paintings rather than split ones,
and why the measurement **withdrew** the parallax-layer idea entirely. All
fourteen have procedural stand-ins today, so any subset lands usefully.

### Then: the 3D tracks (2–8) — strictly ordered, and image-first

The dependency that is easy to miss: **the image rounds feed the model
rounds.** A modeller — human or image-to-3D — cannot work from the sprite set,
because sprites only ever show one ¾ view and mirror the rest. So:

```
DI1 turnaround board ─┐
DI2 face sheet        ├─▶ D1 Yuji rig + 26 clips ─▶ D2 library + archetypes
DI3 shade palette    ─┘         (the style call)          │
                                                          ▼
                                        D3 roster ─▶ D4 bespoke ─▶ D5 spectacle
```

Commission DI1–DI3 **for Yuji only** first. D1 exists to answer one question —
*does an anime-shaded, live-animated fighter sit beside 26 sprite fighters
without clashing?* — on one rig, before the roster spends anything. Ordering
the whole roster's boards before that question is answered is the expensive
mistake this sequence exists to prevent.

### The B-rounds and the D-rounds are the same commission

[`billboards/docs/asset-requests.md`](../billboards/docs/asset-requests.md)
(rounds B1–B5) and
[`render3d/docs/asset-requests.md`](../render3d/docs/asset-requests.md)
(rounds D1–D6) request **the same rigs and the same clips**. Both backends
read one delivery spec, one skeleton and one 26-state clip contract; a rig
approved for one is a valid intake candidate for the other the same day.

The D-rounds add a **finishing pass**, not a second roster: a shade-bias map
packed in the baseColor alpha, an outline width channel in vertex colours,
edited normals, per-material shade tints. If you are commissioning fresh,
**ask for the D-spec in the same round** — it is far cheaper than a second
pass later. The D-round tables carry the full delta.

So the practical reading of rows 4–8: they are one commission that satisfies
both 3D backends, and the B-numbers exist because the billboard path was
specified first.

---

## Asset types, and where each one goes

| Type | Deliver to | Processed by | Reviewed in |
|---|---|---|---|
| 🖼️ Images — sprites, cards, effects, backdrops | `assets/intake/` | `tools/intake.py` | `/sprites/workbench/` |
| 🖼️ Images — 3D reference boards, face sheets, palettes | `assets/intake/render3d/` | by hand (briefs, not runtime art) | — |
| 🧊 3D models + clips (`.glb`) | `billboards/intake/` or `render3d/intake/` | `tools/billboard_intake.mjs [--backend 3d]`, `tools/blender_conform.py` (which runs `blender_clean_weights.py` + `blender_grade_texture.py`) | `/billboards/workbench/`, `/render3d/workbench/` |
| 🔊 Sound effects | `assets/intake/sfx/` → `assets/sfx/` | `tools/generate_sfx.py` | in play |
| 🎙️ Voice | `assets/intake/sfx/` → `assets/sfx/` | `tools/generate_voice.py` (**not** `generate_sfx.py` — that endpoint does not speak) | in play |
| 🎵 Music | `assets/music/boards/` | — | in play |

Two rules hold across every type: **deliveries land in an intake directory,
never in the runtime directory**, and **approval is a separate step from
import** — art is in the repo before it is in the game, and what players see is
what somebody reviewed.

---

## Keeping this page honest

This index goes stale the moment a round lands and nobody edits it. The
guardrail is that it holds **no facts of its own** — every status here is
restating a status line in a linked document, so the fix for a wrong row is
always "read the linked doc, correct the row", never "decide what is true".

When a round is delivered: move it to that track's history file (each track
has one), then flip its row here to **delivered** or delete it. When a round
is opened: add a row, and say what it is blocked by.
