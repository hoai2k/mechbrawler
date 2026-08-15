# Audit Guide — how to keep hardening JJK Brawler II

This is a handoff document. It exists so a fresh process (or a fresh you) can
pick up the quality work on this game without re-deriving the context, and keep
going until the game is as solid as it can be.

Read this top to bottom once, then work the loop in §3.

---

## 1. What this game is, in one screen

A browser platform fighter (Smash-style) with 17 *Jujutsu Kaisen* characters.
Plain ES modules, no build step, no dependencies, no network at runtime. Serve
over HTTP and open — `node server.mjs`, or double-click `play-mac.command` /
`play-windows.bat`.

```
src/main.js         boot, fixed-timestep loop, match flow, input latching
src/state.js        the single mutable state object everything reads
src/constants.js    physics + balance constants
src/config_tuning.js       hand-tweakable feel dials (motion, tumble, DI, staling)
src/characters.js   all 17 fighters as DATA (stats, anims, specials, ultimate, passive)
src/moves.js        derives light/heavy hitboxes from each character's profile
src/fighter.js      per-fighter state machine: movement, defense, ledges, KO
src/combat.js       hit resolution, shields/parry, statuses, projectiles
src/specials.js     special-move handlers (type -> behavior) + shared primitives
src/ultimates.js    the 17 cinematic ultimates (type -> director)
src/ai.js           CPU opponent, 3 difficulty levels
src/render.js       all drawing; sprites.js, camera.js, particles.js support it
src/motion.js       procedural sprite motion (tumble, lean, swing) — sprites/docs/sprite-motion.md
src/ui.js           menus, HUD, move list, gamepad/keyboard menu navigation
tools/              offline asset pipeline (see sprites/docs/asset-pipeline.md)
                    plus check_imports.mjs — run it after moving any export
docs/               mechanics, character research, asset pipeline, asset requests
```

**Design invariants** — violate these and things break in confusing ways:

- `characters.js` is data, not logic. New behavior belongs in a `specials.js`
  handler or `ultimates.js` director keyed by `type`.
- The simulation runs on a **fixed 1/60 timestep**. Input *edges* (`…P` fields)
  are latched in `main.js` and cleared only after a sim step consumes them —
  never read `playerInput()` directly inside `updateSimulation`.
- Anything spawned into `state.entities` **must carry `owner`**, or it will
  outlive its owner's death and keep dealing damage (this was a real bug).
- Sprite frames are pre-processed offline. The renderer does no per-frame pixel
  work. Frame placement comes from `sprites/assets/manifest.json`.
- Most animation states are ONE still frame. The life in them is procedural,
  from `motion.js`, and it is draw-time only — it can never change what a hit
  connects with. See `sprites/docs/sprite-motion.md`.
- The main loop has a `setInterval` watchdog because `requestAnimationFrame` is
  throttled in some embedded browsers. A thrown exception therefore does *not*
  permanently kill the game — it retries every frame and spams the console.
  **Always check the console for errors; a silently retrying loop looks fine.**
- There is no build step, so nothing checks the module graph. `node --check`
  parses a file but will not notice an import of a constant that moved.
  `node tools/check_imports.mjs` does, and takes a second.
- The headless suites, all needing `npm i playwright` and a running
  `node server.mjs`:

      node tools/check_imports.mjs      # module graph, no browser needed
      node tools/check_music.mjs        # stage/track wiring, no browser needed
      node tools/smoke_controllers.mjs  # two pads: seats, join, split cursors
      python3 tools/check_doc_links.py  # every relative doc link and anchor
      node tools/build_image_requests.mjs --check   # docs/image-requests.md is current
      python3 tools/import_render3d_images.py       # dry-run the DI intake
      node tools/audit_stage_reach.mjs  # platform layouts, no browser needed
      node tools/audit_hitboxes.mjs     # reach/hurtbox/angle numbers, no browser
      node tools/smoke_stages.mjs       # every stage's Active Boards gimmick
      node tools/smoke_combat.mjs       # a real CPU match: hits, boxes, launches
      node tools/smoke_workbench.mjs    # the sprite workbench's edit tracking
      python3 tools/test_intake_placement.py   # touch-up re-import, no browser

  `audit_hitboxes.mjs` is the one to run after touching sprites, `moves.js`,
  `combat.js` or `silhouette.js`. Hitboxes and hurtboxes are now derived from
  the artwork (docs/hitbox-audit.md), so a sprite delivery can move a matchup —
  it prints every fighter's reach, body and up-smash coverage and fails if the
  invariants that make that safe have broken. It also names the frames still
  waiting on the workbench's placement pass, which are deliberately excluded
  from the measurements until somebody sizes them.

---

## 2. How to drive the game headlessly (this is the important part)

Most audit value comes from scripting the game in the browser rather than
playing it by hand. The pattern that works:

```js
// 1. let it boot, 2. start a match through the real UI, 3. manipulate state
new Promise(r => setTimeout(r, 3000))
  .then(() => { document.getElementById("startButton").click();
                return new Promise(r => setTimeout(r, 300)); })
  .then(() => { document.querySelectorAll(".stage-card")[0].click();
                return new Promise(r => setTimeout(r, 2200)); })
  .then(() => Promise.all(["state","specials","fighter"].map(n => import(`/src/${n}.js`))))
  .then(([S, SP, F]) => { /* ... */ });
```

**Hard-won gotchas:**

- `javascript_tool` has **no top-level `await`** — use `.then()` chains.
- The match has a ~1.6 s "READY…" intro during which fighters are frozen.
- To inspect a frame without the CPU interfering: press Escape (the sim
  stops, but `draw()` still runs), then
  `document.getElementById("pauseOverlay").style.display="none"` for a clean
  screenshot. Restore it afterward.
- **Never null out `f.aiState`** to stop the CPU — `ai.js` dereferences it every
  frame and the loop will throw forever. Set `f.invuln = 999` or swap in a
  fresh fighter instead. (I burned time on exactly this.)
- To freeze projectiles for inspection: `p.vx = p.vy = p.gravity = 0; p.dur = 9999`.
- To keep an entity's visuals on screen: replace `e.update` with a no-op after
  advancing it to the frame you want.
- Menu element IDs change as the UI evolves. **Don't assume** `modeButton` etc.
  exists — enumerate first:
  `[...document.querySelectorAll("#menuOverlay button")].map(b => b.id)`.
- Hitbox debug: send a `Backquote` keydown, or set `state.debugHitboxes = true`.
- **The console buffer survives reloads**, so stale errors look current. To
  test for *new* errors, install your own listener and count:
  `window.__e=[]; addEventListener("error", e=>window.__e.push(e.message))`.
- **Don't measure timing while the browser pane is hidden.** Background tabs
  throttle both `requestAnimationFrame` and the `setInterval` watchdog, so the
  sim appears to run at a fraction of real speed. Screenshot first (which
  fronts the pane), then measure.

### The standing smoke test

Run this after *any* change to characters/specials/ultimates/assets. It proves
every referenced sprite resolves and every kit path executes without throwing:

```js
Promise.all(["state","fighter","specials","ultimates","combat","input","characters","stages","assets"]
  .map(n => import(`/src/${n}.js`)))
.then(([S,F,SP,U,C,I,CH,ST,A]) => {
  const st = S.state; st.platforms = ST.STAGES[0].platforms.map(p => ({...p}));
  const errs = [], seen = new Set();
  const walk = (o) => { if (!o || typeof o !== "object") return;
    for (const [k,v] of Object.entries(o)) {
      if (k === "sprite" && typeof v === "string") seen.add(v);
      else if (k === "sprites" && Array.isArray(v)) v.forEach(x => seen.add(x));
      else walk(v); } };
  walk(CH.CHARACTERS);
  for (const k of seen) if (!A.getImage(k)) errs.push(`UNLOADED ${k}`);
  for (const key of CH.CHARACTER_KEYS) {
    const anims = {...CH.DEFAULT_ANIMS, ...(CH.CHARACTERS[key].anims||{})};
    for (const [an,a] of Object.entries(anims)) for (const fk of a.frames)
      if (!A.frameMeta(key,fk) || !A.frameImage(key,fk)) errs.push(`FRAME ${key}/${fk} (${an})`);
  }
  const step = (n) => { for (let i=0;i<n;i++) {
    for (const f of st.fighters) F.updateFighter(f,1/60,I.blankInput());
    C.updateHitboxes(1/60); C.updateProjectiles(1/60);
    for (let j=st.entities.length-1;j>=0;j--) { const e=st.entities[j]; e.update(1/60); if(e.dead) st.entities.splice(j,1); }
    st.matchTime += 1/60; } };
  for (const key of CH.CHARACTER_KEYS) for (const slot of ["neutral","side","down","ULT"]) {
    try {
      const f1=F.makeFighter(1,key,500,1), f2=F.makeFighter(2,"gojo",720,-1);
      f1.y=568; f2.y=568; f1.grounded=true; f2.grounded=true; f1.invuln=0; f2.invuln=0; f1.meter=100;
      st.fighters=[f1,f2]; st.hitboxes.length=0; st.projectiles.length=0; st.entities.length=0; st.particles.length=0;
      if (slot==="ULT") U.performUltimate(f1); else SP.performSpecial(f1,slot);
      step(slot==="ULT"?260:110);
    } catch(e) { errs.push(`${key}/${slot}: ${e.message}`); }
  }
  st.fighters=[]; st.hitboxes.length=0; st.projectiles.length=0; st.entities.length=0; st.particles.length=0;
  return errs.length ? errs.slice(0,15).join("\n") : "CLEAN";
});
```

### The soak test

Then run a real match with a mashing bot for ~25 s and confirm it reaches
`roundOver` with **zero** leaked particles/entities/projectiles:

```js
const kd=(c)=>window.dispatchEvent(new KeyboardEvent("keydown",{code:c,bubbles:true}));
const ku=(c)=>window.dispatchEvent(new KeyboardEvent("keyup",{code:c,bubbles:true}));
const keys=["KeyA","KeyD","KeyW","KeyJ","KeyK","KeyL","KeyS","ShiftLeft","KeyI"];
window.__bot=setInterval(()=>{const k=keys[Math.floor(Math.random()*keys.length)];
  kd(k); setTimeout(()=>ku(k), 100+Math.random()*320);}, 220);
// ...later: clearInterval(window.__bot) and inspect state
```

---

## 3. The audit loop

Work one theme at a time. For each: **reproduce → fix → re-verify with the
smoke + soak tests → update the docs that claim otherwise.**

Rules that keep this honest:

1. **Verify before believing.** Several "obvious" findings turned out to be
   false positives (see §5). Prove the defect exists — measure it, screenshot
   it, or write the repro — before changing code.
2. **Prefer data fixes to logic fixes.** If a problem can be corrected in
   `characters.js` or the asset manifest, do it there.
3. **One concern per change**, then re-run the smoke test. The kit paths are
   the fastest signal that something broke.
4. **Docs are part of the deliverable.** `docs/game-mechanics.md` and
   `docs/characters.md` state numbers; if you change balance, change them too.
   They carry a note that code wins when they disagree — don't lean on it.

### Themes, in priority order

**A. Correctness / state-machine holes.** The richest vein historically. Ask:
what happens if X is interrupted by a KO, a respawn, a ledge grab, hitstun, a
shield break, or another install? Past real bugs: entities outliving their
owner; installs overwriting each other (a gamble could delete your own
ultimate); armor that never expired and persisted across stocks; a swap that
left the victim floating in mid-air because their `ledge` state wasn't cleared.

**B. Exploits / degenerate strategies.** Anything with no cost and a positive
return. Past finds: parry-farming by mashing shield (fixed with a fresh-raise
requirement); a meter-battery special with zero risk; ledge-regrab loops giving
~40% invincibility uptime. Look for: infinite loops, zero-risk resource gain,
unreactable mixups, and moves that beat every option.

**C. Feel.** Hitstun/hitlag/knockback tuning, whether attacks connect where
they look like they connect (`REACH_SCALE` in `moves.js` exists because
hitboxes once reached 2.4–4× past the sprites), animation readability, camera
behavior. Use hitbox debug and screenshots; trust your eyes over the numbers.

**D. AI quality.** The CPU should look like it's playing, not flailing. Past
finds: it rolled *into* attacks, rolled off stages and self-destructed, and
could never charge a heavy because `heavyHeld` was never set. Watch a full
Hard-difficulty match and note every moment it looks stupid.

**E. Presentation.** Effects that are still canvas primitives (see
`asset-requests.md` for the live list), readability during big effects (a domain
overlay once buried both fighters), HUD clarity, menu polish.

**F. Performance / hygiene.** Per-frame allocations, unbounded arrays, audio
element churn, asset weight. Lower priority — the game runs two fighters — but
`state.particles` is capped for a reason.

**G. Accessibility & robustness.** Gamepad and keyboard parity across every
menu, phase transitions that can't strand the player, behavior on window blur,
odd aspect ratios.

---

## 4. Asset auditing

### Sprite-frame auditing (`tools/audit_frames.py`)

Run after any re-extraction or art delivery:

```sh
python3 tools/audit_frames.py                  # all checks
python3 tools/audit_frames.py --only bleed     # one class
python3 tools/size_board.py --chars toji       # visual size board
```

It covers four classes:

- **BLEED** — detached blobs sitting below the body with a clear gap. These are
  the *top of the sprite in the row beneath* captured by the grid crop, and in
  game they render as stray arcs under the fighter's feet. The extractor now
  drops them automatically (`DETACHED_BELOW_GAP` / `DETACHED_BELOW_MIN_PX`);
  legitimate ground debris abuts the feet and survives. Opt a frame out with
  `{"keepDetachedBelow": True}` in `FRAME_OVERRIDES`.
- **ALPHA** — semi-transparent bodies (the ghost-frame failure) and moth-eaten
  hole clusters. Large holes are *anatomical* (gaps between limbs, Hanami's
  branch body) and are deliberately not flagged.
- **SIZE** — reported as numbers, but **trust the board, not the metric**. Any
  bounding-box proxy for head/torso size is swamped by pose (outstretched arms,
  horizontal flight). `tools/size_board.py` renders every frame at final
  in-game scale on a shared ground line with a head-height reference; size
  problems are obvious to the eye and invisible to the statistic.
- **ANCHOR** — foot line far from the cell's ground line. Mostly noise for air
  frames (tucked legs legitimately raise the lowest body pixel), so read it
  only alongside the size board.

### Outfit continuity

The sheets were generated in passes, and some rows show a **different costume
than the rest of the character**. This is invisible to pixel statistics and to
palette histograms (effect colours swamp them) — build the board and look:

Build a board that puts each character's idle frame beside their crouch row
(the rows most likely to drift) and review it by eye — the last run is saved at
`tools/debug/outfit_check_1.png` and `outfit_check_2.png`. Confirmed mismatches
are listed in `docs/asset-requests.md` round 4.


New art arrives via `docs/asset-requests.md` (the user runs the prompts and
drops files in). **Screen every delivery before trusting it.**

```sh
python3 tools/prep_effects.py      # trim padding + downscale; idempotent
```

Then check for the two chroma-key failure modes:

- **Semi-transparent subjects.** Compute the share of pixels with
  `alpha >= 250`. A good character frame is ~98%. One delivery came in at 49%
  and rendered as a ghost. Effects may legitimately be translucent; character
  bodies may not.
- **Warm-tone loss.** Pink/red palettes sit next to the magenta key and get
  eaten. This is **not recoverable** — un-mixing the magenta pushes the art
  green. Request a re-do on grey or true alpha.

Beware the **magenta false positive**: purple/magenta *artwork* (Nue's
lightning, Hakari's shutter, the Rainbow Dragon's sheen) trips a naive detector.
Distinguish real background leak by testing for near-pure `#FF00FF` that is
**connected to the image border**.

Also check **padding**: the renderer sizes sprites by image height, so
transparent margin makes an effect draw undersized and off-center. `prep_effects.py`
fixes this by trimming to the alpha bounding box — always run it.

To verify art in place, stage it and screenshot (see §2). Compare against a
known-good frame on both black and white backgrounds when alpha is suspect.

---

### Facing / directionality — tooling

`tools/sprite_facing.py` is the whole loop:

```sh
python3 sprite_facing.py --check ~/Downloads/pose.png       # what way does it face?
python3 sprite_facing.py --audit                            # recorded vs detected, worst first
python3 sprite_facing.py --flip toji/r4c0 toji/r4c1         # mirror + repair metadata
python3 sprite_facing.py --import pose.png --char toji --frame r4c0
python3 facing_review.py                                    # human review sheets
```

**The detector is a prior, not proof.** It isolates the head blob and asks
which side the skin (face) sits on; measured at ~83% against known-good data,
and it is wrong often enough that auto-flipping on it would corrupt the set. It
exists to *rank* frames for review. Ground truth comes from
`facing_review.py`, which draws every frame exactly as the engine draws it for
`facing = right` — on a correct sheet every character looks rightward, and each
label is the literal `--flip` argument.

**`--flip` keeps metadata coherent**, which is the part that silently breaks if
you mirror a PNG by hand. Placement lives in cell coordinates, so mirroring the
art about the cell centre means `ox' = CELL_W - (ox + w)`; `centroidX` mirrors
the same way; `oy` / `bodyBottom` / `bodyH` / `renderScale` are vertical and
unchanged; `faceLeft` is cleared because the art becomes canonical. This holds
for both the extracted frames (`ox` = bbox offset) and the generated high-res
frames (`ox` = centering offset) — verified by a flip-twice round trip that
returns byte-identical pixels and metadata.

**`--import` normalises delivered pose art**: keys a flat magenta/grey
background if one is still present, mirrors to right-facing, then derives the
size target from the median `bodyH` of the frame's own ROW (so a new crouch
matches other crouches rather than the taller standing art) and emits
`renderScale` / `ox` / `oy` / `bodyBottom`. It prints its reasoning and reminds
you to register the frame in `GENERATED_FRAME_TARGETS`.

### Facing / directionality

Sheet art faces **right** by default; `faceLeft` in the manifest marks the
exceptions. Verify with a forced-facing test rather than by eye on a contact
sheet — reading direction off small thumbnails is exactly how the polarity got
inverted once already:

```js
// both fighters forced to face right; they should BOTH look rightward
st.fighters[0].facing = 1; st.fighters[1].facing = 1;
```

Then check an exception frame (a weapon pose like Maki's `r0c2`): the weapon
must point the same way the fighter faces.


### Sizing review

`python3 tools/size_review.py` draws every pose at true in-game scale on a
shared ground line. **Do not try to normalise size automatically** — bbox
height is not pose-invariant, and head-size detection fails on this art (see
`sprites/docs/asset-pipeline.md`). Two attempts at algorithmic normalisation both made
things worse; the working method is the review sheet plus `workbench/`.

### The verification bench — work that is a LIST

`workbench/?edit=verification` is the odd one out among the benches, and the
one to reach for when the job is *check these two hundred things* rather than
*edit this one thing*. It presents one item at a time with the art it is a
claim about, takes approve / edit / flag / skip, keeps your place, and exports
every decision as JSON — including, where the task set knows the shape of the
file its answers belong in, a paste-ready block.

Seven task sets ship, picked from the dropdown in the header:

| set | asks | answers land in |
|---|---|---|
| **Strike points** | where each attack lands — fist, foot or blade | `src/config_strike_points.js` |
| **Centre of mass** | where this body balances (0.55 is assumed for everyone) | `src/config_body_points.js` |
| **Muzzle points** | where a shot leaves the caster | `src/config_body_points.js` |
| **Ledge grip** | where the hand meets the lip | `src/config_body_points.js` |
| **Hurtbox fit** | does the box cover the body, in each state | `src/config_body_points.js` |
| **Model facing** | is the 3D model facing the way its drawing is | `render3d/assets/manifest.json` |
| **Pose reads** | does the model's pose read as the drawing | a work list |

**One download carries every set.** Decisions are kept per set and exported
together as a single `verification-decisions.json`, so a sitting that touched
three kinds of check produces one artifact with a paste-ready block per file.
The set picker shows how much work each is holding.

Adding a set is a provider module — see `workbench/verify_strike_points.js`,
written as the reference implementation of the contract, and
`workbench/verify_common.js` for the stage, the guides, the frame stepper and
the sliders. Register it in `SETS` and navigation, progress, decisions,
keyboard handling and export already work.

Good candidates are anywhere the codebase *measures* something a person could
settle better, or where automation is known to fail —
`tools/check_model_facing.mjs` explains at length that an outline cannot tell
front from back, and the automated version of that check turned five fighters
around backwards before anybody noticed.

Nothing the bench records reaches the game: an export has to be applied to a
config file and committed. That is what makes resuming from browser storage
safe here, where the pose bench had to stop doing it — and each set's stored
work is keyed by a fingerprint of the measurements it was reviewing, so a
re-bake drops that set's stale decisions and leaves the others alone.

The consumption side is already wired and inert: `src/body_points.js` reads
the config and falls back to exactly today's assumptions, so an empty config
is today's game and filling one in is the only thing that changes anything.

### The sprite workbench

`workbench/?edit=sprites` is a live editor for per-frame **size**
(`renderScale`), **horizontal centring** (`ox`) and **ground contact**
(`bodyBottom`). It imports the game's own `assets.js` / `sprites.js` /
`render.js` / `characters.js` and **mutates the same manifest objects the
renderer reads**, so the preview can never be stale.

- character picker + full pose list (changed poses marked)
- three sliders with nudge buttons; **undo/redo** (Cmd/Ctrl+Z, +Shift to redo)
  with a slider drag counting as one undo step, not hundreds
- **viewer zoom** 0.6x-5x for precision work
- a **real game platform**, drawn by `render.js`'s own `drawPlatformShape`, so
  feet are aligned against the actual surface rather than a lookalike
- two reference ghosts: the character's own idle, and Gojo's idle as a
  cross-character size benchmark
- six background colours including magenta and white for alpha fringing
- arrow keys nudge; up/down step through poses **in place**, so frames can be
  flipped between in the same spot to compare
- frame label always shows `char/frame` plus the animation states using it

**On ground contact:** `bodyBottom` defaults to the lowest opaque pixel of the
body, which is wrong whenever perspective puts one foot below the standing
plane — the sprite then floats, because the game rests that stray lowest pixel
on the floor. The ground slider re-specifies where the character actually meets
the ground. Positive values sit the sprite lower.

Export a per-character JSON patch and apply it:

```sh
python3 tools/apply_sprite_adjustments.py patch.json
pbpaste | python3 tools/apply_sprite_adjustments.py -      # from clipboard
```

Note: `src/assets.js` resolves asset URLs against its own module URL, not the
document — that is what lets a page in `/workbench/` load the same files as the
game. Don't change it back to document-relative paths.

## 5. False positives already burned — don't re-litigate

- **Nue's "magenta"** is purple lightning. Intentional.
- **Mahito's unraveling arm** is in every generation of the source art. It's a
  design choice, not damage.
- **Sukuna's white crouch trousers** are Heian-era art; his other rows are the
  Yuji-vessel design. Inconsistent on purpose, and now replaced anyway.
- **A "frozen" game** during scripted testing is usually a thrown exception in
  the loop (check the console), not a render bug.
- **Sprites "not drawing"** was, once, the loop being dead — `drawImage` call
  counts of zero mean nothing is rendering *at all*, which is a loop problem.
- **"Magenta contamination"** in effect art is usually intentional purple/pink
  artwork. Only near-pure `#FF00FF` *connected to the image border* is a real
  background leak; interior magenta is the drawing.
- **Green tint under a sprite** during inspection is your own preview
  background showing through semi-transparent pixels — not a colour defect.
- **Large enclosed transparent holes** are anatomy (arm gaps), not damage.
- **Judging facing from a contact sheet** is unreliable at thumbnail size, and
  produced an inverted `faceRight` table that made the whole roster run
  backwards. Always confirm in game with forced facing.

---

## 6. Current known gaps

- `sukuna/r4c2` was re-delivered and is integrated; if it ever regresses, the
  fallback is dropping it from `crouchAttack` in `characters.js`.
- ~20 visual moves still draw with canvas primitives — the live list and the
  prompts to fix them are in `docs/asset-requests.md`.
- Audio still creates an `Audio` element per one-shot (no pooling), and there's
  a single global shield loop shared by both fighters.
- No touch controls, despite a mobile viewport in `index.html`.
- The AI never uses ledge options beyond climbing, so its recovery is
  predictable and always punishable.
- CPU seats are assigned in `main.js` by `isHumanSlot(id)`: slots 1–2 always
  have keyboard maps, slots 3–4 are human only when a gamepad is connected for
  them, and every other entrant gets `aiState`. This is what makes 3/4-player
  modes testable without controllers.
- **A pad's seat is its own, and is taken on sight.** `input.js` keys seats on
  `pad.index` the first time each pad is seen, so a second controller becomes
  player 2 — and the second slot stops being a CPU — the moment the browser
  reveals it, with no button press needed and nothing required of player 1.
  Seats never move afterwards, which is the part that matters: the browser's
  gamepad list is SPARSE (a pad is invisible until its owner touches it), so
  reading a seat off a position in that list handed player 2's pad to player 1
  whenever player 1 had not touched theirs yet. `tools/smoke_controllers.mjs`
  drives fake pads through both orderings.
- Several crouch rows show the wrong outfit for their character (Toji, Todo,
  Inumaki, Sukuna are the clear ones) — see `docs/asset-requests.md` round 4.
- Row-3 technique art still bleeds *sideways* in a few frames; only the
  below-body case is auto-detected today.

---

## 7. Definition of "solid"

The game is solid when, for a full afternoon of play:

- no console errors, ever;
- the smoke test is CLEAN and the soak test leaks nothing;
- no character has a move that is strictly correct to spam;
- every attack connects where it visually appears to;
- the Hard CPU never self-destructs and never stands still;
- every menu is fully operable on a gamepad alone;
- nothing on screen is unreadable during any ultimate;
- and the docs describe what the code actually does.
