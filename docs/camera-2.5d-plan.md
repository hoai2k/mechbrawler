# 2.5D Camera — implementation plan

A Smash-style perspective camera for the existing 2D game, enabled with
`?camera=3d` and off by default (`?camera=flat` or no param = today's
renderer, byte-for-byte unchanged). No new art, no sim changes: fighters
stay their current sprites, billboarded into a real 3D scene, and every
platform, hitbox and blast zone keeps its exact 2D behavior. This is the
feature that makes the game read as 2.5D — depth, parallax, a living
camera — and it is designed to ship alone, before any 3D character work.

---

## 1. Mode selection

```js
// main.js, top of init()
const params = new URLSearchParams(location.search);
export const CAMERA_MODE =
  params.get("camera") === "3d" && webglAvailable() ? "3d" : "flat";
```

- `flat` is the default and the fallback. If WebGL context creation fails,
  log a console warning and run flat — never a broken screen.
- The 3D module is **lazy-imported only when the param is set**
  (`await import("./render3d/index.js")`), so the flat path pays zero
  bytes and zero startup cost. This also keeps the no-build-step,
  no-dependency property of the default game literally true: three.js is
  only fetched in 3d mode.
- Later a Settings toggle can write the param and reload; the param stays
  the source of truth so a URL fully describes what a player sees.

## 2. Architecture: two stacked canvases

```
<canvas id="glCanvas">    ← NEW, z-index below, WebGL (three.js, vendored ESM)
<canvas id="gameCanvas">  ← existing, alpha, on top
```

In `3d` mode the scene (backdrop, platforms, fighters, projectiles) renders
on `glCanvas`, and `render.js` skips its own versions of those — but keeps
drawing everything else exactly as today on the transparent top canvas:
particles, strike arcs, popups, banners, domain overlays, vignette, flash,
debug hitboxes. Nothing is ported until the camera itself is proven; the
overlay just needs the projection trick in §5.

New files, all under `src/render3d/`:

| file | owns |
|---|---|
| `index.js` | scene setup, draw entry point, resize, mode fallback |
| `rig.js` | the camera rig (§4): framing, smoothing, shake/kick, drama hooks |
| `billboards.js` | fighter/projectile sprite quads, texture cache from `assets.js` images |
| `stage_geo.js` | extruded platforms, background planes, per-board garnish (§7) |
| `../config_camera.js` | every dial in this doc, in one tunable place |

`three.module.js` is vendored under `vendor/` (or served via an import
map) — official ESM build, no bundler.

## 3. Coordinate mapping

Sim space stays authoritative; the scene is a linear image of it.

```
S = 1/100                            // 100 sim px = 1 world unit
worldX = (x - 640) * S               // stage center at origin
worldY = (568 - y) * S               // +Y up; 568 = typical main-platform top
z = 0                                // the gameplay plane
```

- **Fighters / projectiles**: textured quads on `z = 0`. Size and anchor
  come from the same `frameMeta` data `sprites.js` uses (`renderScale`,
  `bodyBottom`, `ox`, `com`); facing = negative x-scale; `motion.js`
  transforms (lean, squash, tumble) map 1:1 onto quad rotation/scale about
  the same `com` pivot. The result must match the flat renderer's placement
  exactly — verify by toggling modes on a paused frame.
- **Platforms**: boxes centered on the plane, extruded to `depth = 1.4`
  world units (main) / `0.9` (side/top), with the existing
  `drawPlatformShape` colors baked as flat materials + a darker side face.
  Ghost/crumble/accent states (Active Boards) map to material swaps.
- **Background**: the existing stage painting on a large plane at
  `z = -14`, scaled so it over-fills the frustum at max dolly-out (no edges,
  ever). Optionally duplicate it blurred at `z = -22` for a second parallax
  layer — free depth from existing art. Stage `tint` becomes scene fog
  color + a tinted transparent plane at `z = -6`.

## 4. The camera rig

A perspective camera on a dolly, replacing pan/zoom while **reusing
`camera.js`'s existing targeting math** (midpoint + spread of alive
fighters, same clamps, same lerp constants — the feel of the tracking is
already tuned; only the projection changes).

**Lens.** `fov = 30°` vertical (long lens — fighters at screen edges barely
distort, which is what keeps it reading as "2D with depth"), near 0.1,
far 60.

**Framing.** From the sim's `zoomTarget` (unchanged): the flat renderer
shows a `1280/zoom × 720/zoom` window, so the dolly distance that frames
the same window is

```
D = (720/zoom) * S / (2 * tan(fov/2))     // ≈ 13.4 world units at zoom 1
```

Position `(camX, camY + heightBias, D)`, where `camX/camY` are
`cam.x/cam.y` mapped through §3 and `heightBias ≈ +0.4` (camera slightly
above the action, looking marginally down — `pitch ≈ -2°`).

**Yaw — the 2.5D signature.** The camera yaws toward the action as it
tracks: `yaw = clamp((camX - stageCenterX) * 0.9, -4°, +4°)`, smoothed
with the position lerp. Fights near a ledge show that ledge's platform
side-face and the background sliding in parallax; center stage is nearly
head-on. Small numbers on purpose: at ±4° the plane's projection is still
almost affine (matters for §5) and gameplay readability is untouched.

**Lookahead.** Offset the lookAt point by the average alive-fighter
x-velocity, `clamp(avgVx * 0.06, ±0.5)` world units, so fast horizontal
exchanges lead the frame the way a tracked anime shot does.

**Shake / kick.** `cam.shake` → positional noise on the camera's local
x/y (same magnitude source, world-scaled); `cam.kick` → an FOV punch,
`30° → 27.5°` over 60 ms, decaying back over 180 ms. FOV punches are the
single biggest "this is now a real camera" moment for zero extra work —
every existing `cam.kick` call site (heavy hits, ult starts) inherits it.

**Drama hooks** (read existing sim events; no sim edits):

- **Ult cast** (`animState === "ult"` onset): 0.25 s dolly-in to 0.8×D on
  the caster, `roll` to ±2.5° dutch, hold while `ult` plays, ease back.
- **Domain cast**: same dolly-in, then a slow 8 s drift-out while the
  domain overlay owns the screen; roll eases to 0.
- **Match point / GAME** (`endT > 0`, slow-mo already active): dolly to
  frame the winner at 0.7×D with yaw easing to face them head-on — the
  Smash "final blow" shot, driven entirely by state the sim already sets.
- **Respawn**: no special move (the revival platform is high; normal
  framing already includes it).

**Round intro** (`introT > 0`): start at 1.25×D with +6° yaw and ease to
the standard frame as READY…/GO! plays — a one-line touch that makes every
round open like a broadcast.

All constants live in `config_camera.js` with the same
comment-every-dial style as `config_tuning.js`.

## 5. The overlay projection (key integration detail)

Everything still drawn on the 2D canvas (particles, arcs, popups, debug
hitboxes) positions itself in **sim coordinates** via `applyCamera(ctx)`.
In 3d mode, replace that transform with the projection of the gameplay
plane: project three sim-space points (origin, +x, +y on `z = 0`) through
the three.js camera to screen space, and set the affine transform that maps
them:

```js
ctx.setTransform(a, b, c, d, e, f)   // fitted from the 3 projected points
```

Because everything the overlay draws sits on `z = 0` and yaw/pitch are
clamped tiny (§4), the affine fit is visually exact (error < 1 px at ±4°).
This one function means **zero changes** to particles, popups, strike
arcs, hitbox debug — they land on the fighters in 3D automatically.
Screen-space draws (banners, HUD, vignette, flash) don't even need that;
they already draw outside `applyCamera`.

`rig.worldToScreen(x, y)` is also exported for anything DOM-positioned.

## 6. Draw flow in 3d mode

```
loop (unchanged) → draw(ctx):
  if CAMERA_MODE === "3d":
    rig.update(state.camera, state)        // consumes same cam.x/y/zoom/shake/kick
    render3d.draw(state)                   // WebGL: bg, platforms, fighter quads, projectiles
    ctx.clearRect(...)                     // top canvas
    applyCameraProjected(ctx)              // §5 transform
    ...existing entity/particle/arc/popup/debug draws, unchanged...
    releaseCamera(ctx)
    ...existing screen-space draws, unchanged...
  else:
    ...today's draw(), untouched...
```

`updateCamera()` in `camera.js` keeps running unmodified in both modes —
the rig is a *consumer* of `state.camera`, never a replacement, so blast
zones, HUD logic and the flat fallback all keep one source of truth.

## 7. Making it shine per board

Two layers of per-stage flavor, both cheap because the scene is now 3D:

**(a) A camera personality per board** — 3–4 numbers in
`config_camera.js` (`yawRange`, `heightBias`, `baseFovNudge`,
`damping`), defaulting to the global rig. **(b) Gimmick-reactive moves**
— `stage_fx.js` entities already know when their hazard fires; give the
rig a tiny event queue (`rig.cue(name, strength)`) they can poke, feature-
detected so flat mode ignores it. Suggested treatments:

| Board | Camera treatment |
|---|---|
| **Training Bridge** | The neutral baseline — tune the global rig here. Falling-leaf garnish cards at `z = +1.5` drifting past the lens sell depth on the calmest board. |
| **Quiet Hall** | Silence bell seal: slow 4 s push-in to 0.93×D with yaw → 0 — a held breath; snap back on release. |
| **Flooded Gate** | Surge wave: camera leads the wave — 0.3 s lateral drift in the sweep direction + 1.5° roll, like footage shot from a boat. |
| **Shibuya Night** | Curtain window: FOV widens 30°→33° for the 8 s frenzy, plus stronger lookahead; the busiest skyline gets the busiest lens. Extra parallax layer from the neon bg pays off most here. |
| **Curse Maw** | Fang snap at an edge: 60 ms punch-in *toward that edge* (yaw bias to the fang's side), synced with the existing telegraph. |
| **Garden Steps** | Persistent +2.5° yaw baseline so the left→right terraces visibly stack in depth — the stage whose *layout* the 3D camera flatters most. Bloom heal: 0.5 s gentle drift toward the flower. |
| **Lantern Corridor** | Foreground lantern silhouette cards at `z = +2` parallaxing past the camera — an instant depth showcase. Lantern fall: micro-shake on impact. |
| **Sunken Crossing** | Halve the rig's damping so the camera itself glides and overshoots slightly — the slick floor communicated through the lens. |
| **Neon Split** | Center wall up: yaw eases to ±3° *around* the wall so its face catches light; crossing hit: FOV punch. |
| **Bone Sanctum** | Platform rattle before phasing: 1:1 micro-shake synced to the rattle; phased platforms drop to a ghost material — depth makes their absence legible. |
| **Bridge Duel** | The drifting main platform is the anchor: blend 40% of the platform's drift into `camX` so the world visibly slides under the fight — the drift finally *reads*. |
| **Academy Hall** | Bell layout-glide: 0.8 s ease-out to 1.15×D so the whole reshuffle is seen, then re-frame. The one board where a deliberate pull-back is the feature. |
| **Mist Pier** | Fog bank: dolly *in* to 0.9×D while visibility is low — claustrophobia instead of blindness. Fog itself stays the existing `drawTop` overlay (it must cover fighters). |
| **Crosswalk Rush** | The showcase board: run traffic streaks as emissive cards at `z = +1` — between camera and fighters — with the existing ground-level telegraphs. Traffic passing *in front of* the fight is the single best "this is 3D now" moment in the game. |
| **Cursed Teeth** | Inhale suction: slow 0.95×D pull toward the maw center for the duration, released with a small kick — the camera is being inhaled too. |
| **River Gate** | Crosswind: sustained 1–1.5° roll with the wind direction, flipping when it flips; wind made visible with zero particles. |
| **School Wing** | Curse blob pop: 40 ms micro-punch. Otherwise neutral — quiet boards need quiet cameras. |
| **Empty City** | Crumble: rubble-card debris falling at `z = +0.5..+1.5` (toward the lens) + shake; reform gets a soft focus pull (FOV 30→29→30). |
| **Billboard Roof** | Lightning strike: 1-frame white bloom on the glCanvas + the strongest shake in the game; billboard garnish cards at `z = -3` flicker with the pre-strike flashes. |
| **Domain Core** | Low gravity: raise `heightBias` to +0.7, damping ×0.7 — floatier fights get a floatier frame. Orbiting side platforms extruded thicker (2.0) so their motion carves visible arcs in depth. |

Garnish cards (leaves, lanterns, traffic, rubble, billboards) are flat
textured quads off the gameplay plane — cut from the existing background
art or drawn procedurally like the current stage FX. None are required;
each is an independent polish commit.

## 8. Implementation order

1. **Scaffold** — url param, lazy import, `glCanvas`, vendored three.js,
   WebGL-fail fallback. Flat mode provably byte-identical (it never loads
   the module).
2. **Static scene** — mapping (§3), platforms, background plane, a fixed
   camera at D. Verify against flat with a split-screen screenshot.
3. **Billboards** — fighter/projectile quads driven by the existing
   sprite/anim/motion data; placement parity check vs flat renderer.
4. **Rig** — framing/dolly/yaw/lookahead/shake/kick (§4). This is the
   milestone where the feature exists.
5. **Overlay projection** (§5) — particles/arcs/popups/debug land
   correctly; hitbox debug overlay is the acceptance test.
6. **Drama hooks** — intro, ult, domain, GAME shots.
7. **Board personalities + cues** (§7), one board per commit, `rig.cue()`
   feature-detected from `stage_fx.js`.
8. **Garnish cards** for the flagship boards (Crosswalk Rush, Lantern
   Corridor, Training Bridge first).

Each step leaves both modes shippable.

## 9. Testing & performance

- **Parity**: a debug key (extend the `Backquote` handler) freezes the
  sim and swaps modes on the same frame; fighter feet, hitbox rects and
  popup positions must coincide.
- **Smoke**: `tools/smoke_stages.mjs` pattern extends to a
  `smoke_camera.mjs` that runs the rig headless against scripted fighter
  paths and asserts framing invariants (all fighters inside the frustum
  with margin; D within clamps; yaw/roll within bounds; no NaNs after
  KO/respawn/domain transitions).
- **Budget**: scene is ~a dozen boxes, ~10 quads, 2 planes, 1 light —
  trivially 60 fps on integrated GPUs. Texture memory is the only real
  cost: billboard textures reuse the already-loaded sprite images
  (uploaded per frame-image on first use, cached; ~4 fighters × ~60 poses
  worst case ≈ well under sprite RAM already in use).
- **Resize/DPR**: mirror `resizeCanvas()` for `glCanvas`
  (`renderer.setSize`, `setPixelRatio(min(dpr, 2))`), aspect fixed by
  letterboxing exactly as the CSS already does for the 2D canvas.

## 10. Out of scope (deliberately)

3D character models, toon shading, porting particles/FX into the scene,
menu/HUD changes, any sim change. This plan is complete when the current
sprite game, unmodified in feel, plays inside a living Smash-style camera
behind `?camera=3d` — and everything in the bigger 2.5D plan
(docs/2.5d-plan.md) builds on the scene this creates.
