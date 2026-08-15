# The `3d` rendering backend — anime-style 3D models, live

The third answer behind the `src/render_backend.js` waist: rigged 3D models,
animated live at full frame rate, rendered in a hand-drawn anime style —
toon-ramped, ink-outlined, sampled on twos — and composited into the unchanged
2D game. Selected with **`?render=3d`**; everything it owns lives under
**`/render3d`** (the backend NAME is `3d`, the directory avoids a leading
digit). The game, the sim, the sprites and the billboard path are untouched.

> **Status: the roster is DELIVERED and live.** 27 rigged characters are in
> `render3d/assets/` (25 in game; Mei Mei and Kurourushi are held back by
> `inGame: false` pending rebuilds), the toon/outline/on-twos pass is live,
> and the 2.5D layers (turnaround, parallax, aim, look-at, flinch, stage
> light rig, foot IK, contact-beat sync, cross-fades) each sit behind a dial
> in `render3d/src/pose.js`. The mannequin remains the stand-in for pipeline
> work (`?mannequin=all`). Still outstanding from this plan: smears (§6),
> the eyes/face pass (§4 — the mouth sheets and eye highlight are on disk
> under `assets/textures/`, but wiring them needs per-character mouth/eye
> placement data that no delivery carries yet, so it is an art round before
> it is engine work), contact shadows (§9), and costume variants (§9).

This is the sibling of `billboards/` and deliberately its heir: the billboard
backend proved the pipe (offscreen WebGL → texture → blit through the
`drawCharFrame` contract) and wrote the contracts a model must honour (the
26-state clip contract in `render3d/src/states.js`, the delivery spec, the
timing beats, the no-baked-engine-motion rule). This backend keeps **all** of
those and changes two things:

1. **Live animation.** Billboards pose a rig at quantised holds and cache the
   texture; this backend plays the clip continuously, so a run cycle runs, a
   hurt pose recoils, an ult churns — full skeletal motion, not held poses.
2. **The anime look.** A real toon pipeline — ramp shading, shade-bias maps,
   ink outlines, edited normals, on-twos stepping — so a model reads as a
   drawn character, not as a 3D figure standing in a 2D game.

And it earns its keep with what only a live 3D character can do (§7): real
turnarounds instead of mirroring, strikes that aim, heads that track the
opponent, bodies that flinch away from the hit, light that comes from the
stage the fight is in.

---

## 1. Fit: the backend registry

One new entry in `BACKENDS` (src/render_backend.js), name **`3d`**, plus
aliases that read naturally (`model`, `models`, `anime`):

```js
"3d": {
  label: "3D anime-rendered models",
  drawCharFrame, currentFrame, cyclePhase,   // from /render3d/src/backend.js
  init,                                       // lazy engine + rig load
},
```

Everything the registry promises holds unchanged: `drawCharFrame` returns
`false` when it cannot draw (render.js paints the placeholder), the 2D context
comes back exactly as found, pose tokens are opaque, and **fallthrough is per
character** — a fighter with no approved 3D set draws sprites, mid-roster,
loudly on failure. Partial rollout is the normal state, exactly as it is for
billboards.

`init()` dynamic-imports the engine and the manifest, so nothing under
`/render3d` (three.js included) loads unless `?render=3d` was typed. Three.js
was vendored at `billboards/vendor/`; rather than a second copy, it is
**hoisted to `/vendor/three/`** shared by both backends (one version, one
VENDOR.md, both import sites updated) — the only cross-subsystem file move
this plan makes.

## 2. Directory layout

Mirrors `billboards/` because that shape already works:

```
render3d/
  src/
    backend.js     the registry entry: currentFrame / cyclePhase /
                   drawCharFrame, per-character fallthrough
    loader.js      .glb fetch/parse, manifest, clip resolution, all-or-nothing
                   registration; every body converted to toon + outline on load
    pose.js        animKey + animTime -> posed skeleton; on-twos quantisation;
                   the live layers: aim pitch, IK reach, look-at, flinch, turnaround,
                   foot IK, breath — each behind a dial in DIALS
    toon.js        the anime materials: ramp, shade-bias, shade tint, rim
    outline.js     inverted-hull ink pass, per-vertex width channel
    scene.js       offscreen WebGL scene: long-lens character camera, stage
                   light rig, supersampled render target, the pose cache
    blit.js        texture -> 2D context, same placement maths as
                   billboards/src/blit.js — plus the no-mirror turnaround rule
  assets/          approved runtime rigs + textures + manifest.json
  intake/          deliveries land here first; validate -> review -> apply
  workbench/       /render3d/workbench/ — look-dev + clip review (§9)
  docs/
    plan.md        this file
    asset-requests.md  rounds D1, D2… (delivery spec deltas in §5–6)
    image-requests.md  the 2D images this backend needs (Tripo inputs, ramps)
```

**The state list is imported from `render3d/src/states.js`, not copied.**
It is dependency-free by design, it *is* the contract (durations, contact
beats, tiers), and two copies of a timing table is how the two backends drift
apart. `tools/` gains a check that both backends resolve all 26 states.

## 3. Architecture: live render, still a blit

The game stays 2D. Per fighter per display frame:

```
animKey + animTime ──pose.js──▶ posed skeleton (+ live layers)
                     scene.js ──▶ offscreen render: toon + outline + shadow
                     blit.js  ──▶ drawImage into the 2D world at (x, y)
```

- **One shared WebGL context**, one render target per on-screen character
  (≤4 fighters + brawler summons), each rendered with a tight per-character
  camera: orthographic-leaning long lens (perspective, FOV ≈ 15°) framing the
  fighter with margin for full attack extension. The narrow FOV keeps limbs
  from distorting while still giving real foreshortening on strikes toward
  the lens — sprites can never do that.
- **Supersample 2×** relative to the blit size, downsampled at blit — this is
  what keeps 1-px ink lines crisp instead of shimmering. Premultiplied alpha
  so edges composite cleanly over painted backgrounds.
- **`motion.js` stays the owner of engine motion.** Sway, bob, squash,
  tumble, dodge spin arrive through `opts` and are applied at blit time,
  identically to sprites and billboards. Clips still must not bake them —
  the delivery rule and its review gate carry over verbatim.
- **Afterimages**: the trail stores pose tokens (fighter.js); the render
  cache must retain the trail window, same floor as the billboard LRU.

**Cost model.** Live animation looks like it forfeits the billboard path's
pose cache — but the anime look *wants* stepped motion (§4), and stepping
restores the cache: poses are sampled at 12–15 Hz ("on twos"), so a fighter
re-renders 12–15 times a second, not 60, and held states (17 of the 26)
collapse to almost nothing. Four fighters at ≤30k tris with toon materials
and a hull outline is comfortably real-time on integrated GPUs; the
supersample is the only real fill-rate cost and has a half-res fallback.

**Measured, not assumed** (the D0 smokes, four-fighter CPU match, same
machine): this backend renders **144 poses to the billboard path's 101** over
a comparable run — 557/144 cache hits against 563/101. It steps its clock
coarser (13 Hz vs the billboard path's 30 Hz quantisation) and still renders
MORE, because its cache key is wider: aim, look-at, flinch, turnaround,
parallax bucket and stage-light key are all dimensions the billboard key does
not carry. Micro-parallax is the biggest single contributor — quantised to 2°
across a ±7° range, a fighter crossing the stage cycles through ~8 buckets of
otherwise identical poses. That is the honest trade, and each term is a dial:
`parallaxQuantDeg` is the first knob to turn if the render count ever needs
to come down, at the cost of parallax stepping visibly. In absolute terms
both are far inside budget — the smoke asserts renders/sec against
`sampleHz × fighters` and the measured window sits at about a fifth of it.

## 4. The anime look

The Guilty Gear Xrd recipe, sized to this game. Each item is a module in
`toon.js`/`outline.js` and a knob in the workbench:

- **Two-band ramp.** Lit and shade, one hard terminator, no gradient. Shade
  color is not darkened base — it is a **painted shadow palette** per
  material (cool-shifted, per the sprite art's own shading), delivered as a
  second flat texture or a per-material shade tint.
- **Shade-bias (ILM) map.** The single technique that separates "toon
  shader" from "drawn character": a grayscale map that biases the terminator
  per texel — force the underside of the jaw, hair clumps and cloth folds
  into shade early, keep the face plane lit late. This is where an artist
  hand-places the shadows an animator would draw. Delivered as a texture
  channel; the mannequin gets a procedural neutral one.
- **Edited normals.** Anime faces do not survive geometric normals: normals
  on the face are transferred from a smoothed proxy sphere so the terminator
  sweeps the face as one clean arc, and hair normals are combed along clump
  direction. A delivery criterion (bake into the .glb), checked in the
  workbench under a sweeping light.
- **Ink outlines.** Inverted-hull pass: back-face shell, width in screen
  pixels (constant regardless of blit scale), colored near-black tinted by
  the material beneath. Per-vertex width in a vertex-color channel so lines
  taper (thick jaw/silhouette, hairline interior). Interior detail lines are
  *painted in the texture*, not post-processed — cheaper, calmer, more
  "drawn".
- **On-twos sampling.** Clip time quantised to 1/12–1/15 s before posing —
  motion holds and snaps like limited animation. Attack clips are sampled so
  the **contact beat is always a sampled frame** (never stepped over): the
  beat lands exactly when the hitbox goes live, honouring the timing
  contract. Engine-side motion (trails, squash, camera) stays at 60 — the
  contrast between stepped character and smooth world is the Xrd signature.
- **Smears.** On heavies and specials, at the 1–2 samples before the beat,
  swap or augment limbs with authored smear shapes (stretched duplicate
  geometry in the clip, standard anime practice) rather than motion blur.
  Optional per clip; the archetype libraries are where they pay off most.
- **Rim light.** A thin stage-colored rim on the shaded side, driven by the
  stage `tint` (§7) — it is what seats a character against a dark painted
  background. Routed as a material term, not `ctx.shadow*`.
- **Eyes and face.** Camera-facing highlight sprite in the eyes, brows
  rendered through hair (depth-test trick, standard anime rule), mouth as
  texture swap keyed to a small set of states (idle, hurt, ult, win). Small,
  cheap, and half of "looks like the show".

Every knob defaults from one place (`render3d/src/toon.js` constants) and is
overridable per material in the .glb's extras — art-directed in the
workbench, never hard-coded per fighter in engine code.

## 5. Models — the delivery spec, and what makes one good

**The billboard delivery spec applies verbatim** (billboards/docs/
asset-requests.md: .glb, metres, Y-up facing +Z, T-pose, Mixamo naming,
`Prop_*` bones, `Chain_*` physics bones, ≤30k/60k tris, ≤4 influences,
baseColor-only ≤2048) — one commissioned rig serves both backends, and any
rig already approved for billboards is a valid `3d` intake candidate on the
day this backend exists. This plan **adds** to the spec:

- **Shade-bias map** (§4) — grayscale, may share the baseColor's UV set,
  packed as the baseColor alpha or a second texture.
- **Outline width** — vertex color channel R, 0–1, default 0.5.
- **Edited normals** — baked in; the workbench's sweeping-light check is the
  review gate.
- **Shadow palette** — per-material shade tint in glTF extras (fallback: a
  global cool shift).
- **Mouth/eye variants** — texture swap regions listed in extras (optional;
  fighters ship without them).

What separates a good model here, in order of importance:

1. **Silhouette equals sprite silhouette.** Gameplay stays sprite-derived
   (the billboard decision, kept): hurtboxes, reach and height all come from
   the sprite measurements, so a model that reads wider or longer-limbed than
   its sprites is *lying about gameplay*. The workbench ghost overlay is the
   gate; the sprite set is the storyboard, `sprites/docs/pose-brief.md` the
   standing rules.
2. **Big flat shapes.** Toon shading punishes surface noise: geometry should
   carry form in large planes (hair as clumps, cloth as folds an animator
   would draw, no sculpted micro-detail). A lower-poly model with deliberate
   planes toon-shades better than a dense one.
3. **Color from the canon reference**, `assets/reference/canon/<char>_idle.png`
   — flat fills at the sprite palette, no baked light, no gradients. The ramp
   supplies all shading.
4. **Face first.** Review every model's face under the sweeping light before
   anything else; a face whose terminator breaks into triangles fails no
   matter how good the body is.

**Sourcing.** Same posture as every art round: the request specifies the
deliverable, not the tool. Viable routes — commissioned/hand-built in
Blender against the canon sheet; AI image-to-3D (seeded with the canon
reference + a turnaround board composited from the sprite set by a new
`tools/build_model_reference.py`) followed by retopo, re-rig to the standard
skeleton and a toon repaint; VRoid-style base bodies re-dressed for the
uniform-wearing half of the roster. Routes can mix per fighter; the intake
validator and workbench judge the .glb, not its origin. Non-standard bodies
(Hanami, Dagon, Kurourushi, Mahoraga, Panda, Mechamaru) are hand-rig
territory and scheduled last, exactly as the billboard rounds order them.

## 6. Animation — the clip contract, and what makes clips good

The billboard clip contract applies verbatim: named exactly as the 26 state
keys, timed to the game clock (durations and contact beats from `states.js`
— the engine never stretches a clip), loops loop, aim-neutral strikes, **no
baked engine motion**, and the three sharing tiers that make the economics
work — library (14 locomotion/defense states, authored once, retargeted),
archetype normals (unarmed / blade / polearm / hammer / bulk / caster),
identity clips per fighter (charge, three specials, ult, win). Roughly 250
clips roster-wide, same budget, same file. Because both backends read the
same clips, every clip authored for billboards upgrades automatically from
posed holds to live motion the day its fighter enters this backend.

What live playback adds to "good":

- **Pose-to-pose, held.** Author like limited animation: strong key poses
  held, fast breakdowns between them — not mocap-smooth arcs. On-twos
  sampling flatters exactly this and flattens the difference between a
  60-key clip and a 8-key one, so spend keys on *poses*, not inbetweens.
  Every key pose should pass the sprite storyboard test: same read, same
  stance, same extension as the named reference sprite.
- **Anticipation inside the startup.** The contact beat is fixed by combat;
  the wind-up before it is free authorship. A heavy that coils for its full
  startup and snaps to extension **at** the beat both reads better and
  telegraphs honestly — the animation and the frame data agree.
- **Follow-through after the beat**, settling into a hold by clip end so
  one-shots freeze on a strong final pose (the engine clamps just short of
  the end, per `clipTime`).
- **Feet planted via IK at pose time**, not baked: the engine runs a simple
  two-bone foot IK to the ground line for grounded states, killing retarget
  foot-slide across the roster's 150–220 cm span — the named risk of the
  shared library, answered in engine rather than per-fighter.
- **Additive breath layer** (shoulders only, engine-side, per §4's rules) on
  idle/crouch/shield holds, so held states are alive without clips baking
  breathing that would double motion.js's bob.

## 7. Leveraging 2.5D — what only this backend can do

Each of these is engine-side (`pose.js` / `scene.js`), costs no extra
deliveries beyond the spec above, ships independently, and is feature-gated
so billboards/sprites are never asked to answer for it:

- **Real turnarounds — the end of the mirror flip.** Sprites and billboards
  mirror to face left; asymmetric costumes flip (Gojo's parting, Maki's
  polearm grip, every wraps-side detail). This backend *yaws the rig*: facing
  left is the model turned 180°, and a facing change is a 3–4 sample turn
  animation blended in pose space. The roster's designs are finally always
  correct — the single most visible payoff of live 3D and the one to demo
  first.
- **Micro-parallax by stage position.** The per-character camera yaws
  ±6–8° as a function of the fighter's x relative to the camera's — a
  fighter at the left edge is seen slightly from the right. Both fighters'
  renders agree with one implied viewpoint, platforms' painted perspective
  still reads, and the flat world quietly gains depth. One dial; clamped
  small so silhouettes (gameplay!) never change meaningfully.
- **Strikes that aim, bodies that answer.** The billboard aim contract
  (pitch across the spine toward the target at pose time) runs live here,
  every frame of the swing. Its counterpart on defense: **hit-direction
  flinch** — hurt/tumble poses lean a few degrees away from the last hit's
  direction, so knockback reads in the body, not just the trajectory.
- **Head look-at.** Neck/head track the nearest opponent a few degrees in
  idle, run and charge (never during attacks — the clip owns the head then).
  Fighters watch each other across the stage; matches gain intent for free.
- **Lit by the room.** The scene light rig is derived per stage: key color
  from the stage `tint`, rim from the background's dominant hue (sampled
  once at load), plus event lighting — domain casts re-key the light to the
  domain palette, ults flare the caster's rim, Shibuya's curtain window
  warms everyone. The 2D art defines the room; the 3D characters finally
  stand *in* it.
- **Contact shadows from the model.** A soft blob shadow shaped by the
  actual pose (rendered top-down at low res), replacing the generic ellipse
  under modelled fighters — feet connect to platforms, jumps visibly leave
  the ground.
- **Foreshortening as spectacle.** Identity clips may break the flat plane
  *toward the lens*: an ult wind-up that pulls the fist to camera, a win
  pose shot with a slow 20° orbit of the character camera, a charge stance
  leaning in. Allowed only where combat reads nothing (charge, ult startup
  frozen frames, win) and flagged per clip in extras, so spectacle never
  blurs a hitbox.
- **Cheap costume/state variants.** A glTF material variant was the billboard
  rule, written when `hanami_alt` was its example; that example is gone (his
  tree design retired with round 17A) but the mechanism is what live materials
  extend — Yuji's Sukuna markings during ult, Yuta glowing at full meter — as
  material swaps keyed to state the sim already exposes. Note the sprite
  manifest's `alternates` block these were once shaped after no longer exists:
  a variant is per-material now, with no 2D counterpart.

## 8. Phases

Named D-rounds, mirroring the B-rounds' discipline. D0 needs no art.

- **D0 — the pipe, proven on the mannequin.** Backend entry + registry,
  shared vendor hoist, scene/pose/blit against the billboard mannequin and
  its default pose set (`?render=3d`). Live playback, on-twos
  stepping, foot IK, supersampled blit, per-character fallthrough. Exit:
  full-match smoke green with a live grey mannequin fighting sprite
  fighters; pixel-probe and context-state smokes ported from B0; render
  cost logged under budget.
- **D1 — look development on the mannequin, then the pilot.** Toon ramp,
  outlines, rim, on-twos polish on the mannequin first (the look is
  art-directable before any character exists); then the pilot fighter —
  **Yuji, reusing the B1 rig** if delivered, else D1 commissions him once
  for both backends — with shade-bias map, edited normals, face pass. Exit:
  Yuji live-animated and anime-shaded beside 26 sprite fighters without
  clashing; the style call ("does this sit in the game?") answered after
  one rig, not twenty-eight.
- **D2 — the 2.5D dividends.** Turnarounds, micro-parallax, aim + flinch,
  look-at, stage light rig, contact shadows — each behind its own dial,
  each demoable on the pilot. Exit: a side-by-side capture of
  `?render=sprite` vs `?render=3d` that sells the project.
- **D3 — roster scale-out.** Shared library + archetype clips retargeted
  live (the billboard economics, unchanged), fighters shipping individually
  as approvals clear; standard humanoids first, bespoke bodies last.
- **D4 — spectacle.** Smears, foreshortened identity moments, material
  variants, event lighting, win-pose orbits. Behind the workbench's eye,
  never blocking a fighter shipping.

## 9. Workbench, testing, risks

**Workbench** (`/render3d/workbench/`): the billboard workbench's shape — state
picker, scrubbable animTime, sprite ghost at matched scale, per-clip
approval — plus the look-dev panel this backend needs: sweeping-light
normal check, ramp/rim/outline dials with per-material override editing,
stage light presets, on-twos toggle, aim crosshair, turnaround scrub.
Approval stays all-or-nothing per fighter.

**Testing**: the URL-driven suite pattern holds — every smoke runs with
`?render=3d`. Added: a determinism smoke (same seed, same pose tokens →
identical pixels, protecting the trail cache), the states-coverage check
against `render3d/src/states.js`, and a perf smoke asserting renders per
second stays ≤ samples-per-second × fighters (the on-twos cache doing its
job).

**Risks, named now:**

- **Style clash is the project risk**, same as billboards, sharper here
  because live motion draws the eye. Answered in D1 on one rig, on the
  mannequin's schedule, before the roster spends anything.
- **On-twos vs game feel.** Stepped character motion under 60 Hz knockback
  could read laggy. The contact-beat-always-sampled rule covers attacks;
  if hurt/tumble stepping reads wrong, those states drop to on-ones — a
  per-state dial from day one, not a rework.
- **Two backends, one asset truth.** The moment specs drift, a rig works in
  one backend and not the other. Mitigation is structural: one delivery
  spec file, one states.js, one intake validator extended (not forked),
  and the D-spec additions written as *additions* in the same document.
- **Face quality at generated-model prices.** AI-generated meshes fail at
  faces first. The face-first review rule plus per-route mixing (generated
  body, hand-finished head) keeps the gate honest without banning the
  cheap route.
