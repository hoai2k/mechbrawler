# Arena polish plan — identity, variety, garnish, and the 3D camera

Status: **proposal + progress tracker**. Update the checklist as work lands so a
fresh session can resume from here. This is the mech-arena successor to the
JJK-era stage-variety and 2.5D-camera passes; the same process, applied to the
12 arenas in `docs/arenas.md`.

## 0. Audit — what we have and what is dead

The 2D gameplay layer is essentially **complete**:

- `src/stages.js` — all 12 arenas, genuinely varied layouts (mains 640–900 px
  wide, 2–5 non-main platforms, symmetric/asymmetric mix), per-arena `tint`,
  `orbital` uses `mods: { gravityMul: 0.88 }`.
- `src/stage_fx.js` (1577 lines) — **all 12 hazards from `docs/arenas.md` are
  implemented**, with telegraphs, `warnZone` AI hints, `cameraCue` beats, and
  delivered art (all 16 `stagefx:` sprites in `assets/sprites/effects/`).
- `tools/audit_stage_reach.mjs` and `tools/smoke_stages.mjs` are current and
  green.

The gap is the **per-arena personality layer above the sim** — everything the
JJK repo did in its polish passes is present as machinery here but keyed to
stage names that no longer exist:

| Dead / missing | Where | Impact |
|---|---|---|
| `BOARD_CAMERA` rows are 6 JJK keys | `src/config_camera.js:99` | Per-board camera dials (`yawBias`, `dampingMul`, `heightBias`, `fovNudge`, `lookaheadMul`, `driftFollow`) all work and are **unreachable on every arena** |
| `SYSTEMS` in garnish are 5 JJK keys | `src/camera3d/garnish.js:322` | 629 lines of working card machinery (quad pool, physics, cue hooks, `GARNISH` toggle) spawn **nothing** on any arena |
| 14 garnish PNGs orphaned | `assets/sprites/garnish/` | cars, hoardings, lanterns, leaves, rubble, signal gantry — several map onto mech arenas near-verbatim |
| 6 of 13 camera cues never fired | `config_camera.js` `CUES` | `hush, bloom, wallYaw, layout, fog, inhale` implemented, unused |
| One global intro shot | `camera3d/rig.js` `DRAMA` | identical intro dolly/yaw on all 12 boards |
| One global blast-zone rect | `src/constants.js:10` | Sky Terrace's designed "close side blast zones" (`docs/arenas.md` §5) **not implemented** |
| No per-platform behaviour fields | `src/stages.js` | sway (foundry hook), traverse (harbor spreader), waypoint drift (orbital arm) are all imperative code in `stage_fx.js`; `kind` only has 3 values |
| Ambient layers thin or absent | `stage_fx.js` | harbor and scrapyard have **no ambient at all**; quarry's is thin. Every arena hand-rolls raw-canvas particles; `src/fx.js` (`embers, smoke, flames, glints, specks, flutter, crackle…`) is imported nowhere in `stage_fx.js` |
| `frictionPow` plumbed, never set | `state.stageMods` | a ready-made hook, unused |
| Stale smoke tools | `tools/smoke_camera3d.mjs`, `tools/smoke_ground3d.mjs` | test JJK stage keys; currently meaningless (plan item X4) |
| Missing docs referenced from live code | `camera_mode.js:1`, `config_camera.js:1`, `garnish.js`, `audit_stage_reach.mjs:2` | cite `docs/2.5d-camera-plan.md` / `docs/stage-variety-plan.md`, which don't exist — this doc replaces both references |
| Minor | `stage_fx.js:313` | neon calls `hazardArt` directly with a hardcoded `h`, bypassing `drawFx` |
| Pending upstream | plan item K2 | `assets/sfx/amb_<arena>.mp3` beds exist ×12 — verify they actually play |

**One-line verdict:** the arenas *play* differently but they are all *shot,
dressed and lit* the same. The polish pass is the personality layer.

## Guardrails (enforce in review, repeated on purpose)

Inherited from `docs/arenas.md` and the JJK garnish doctrine:

1. Hazard telegraphs stay ≥0.8 s, diegetic, position-keyed, never lethal from
   full health. **This pass adds no new hazards** — one identity per stage is
   already spent.
2. **Garnish never touches the simulation** — no hitbox, no ledge, invisible
   to the AI.
3. **Readability wins** — anything crossing in front of the fight is fast,
   near-transparent, or confined to a band the fight doesn't occupy. Card
   z ≠ 0 does not land where the same sim y lands at z = 0 — author foreground
   cards high.
4. Procedural visuals first; every new sprite loads as `optional()` with a
   canvas fallback. The game must never require delivered art.
5. Every commit leaves boot + `tools/smoke_stages.mjs` +
   `tools/audit_stage_reach.mjs` green.
6. `GARNISH.enabled` and Active Boards remain the escape hatches: off must
   clear cards already up, not just stop spawning.

## 1. The 12 identities — camera, cues, garnish, ambient

Format per arena: *identity tag* · **camera dials** (`BOARD_CAMERA`) · **new
cue beats** · **garnish** (existing textures named; new art is optional
upgrades) · **ambient upgrades** (wiring `fx.js`). Effort grade S (data only) /
M (garnish system) / L (garnish + new behaviour or asset).

### 1. NEON DISTRICT — *the flagship: wet, electric, crowded* (L)
- **Camera:** `yawBias: 1.5` (the street canyon stacks in depth),
  `lookaheadMul: 1.2` (the train re-prices the mid-lane).
- **Cues:** billboard flicker rides `lightning`-style flicker locally, not a
  new cue; the train keeps `surge`.
- **Garnish:** hoardings `hoarding_a/b/c` **behind** (z −5.5…−3.4,
  `flicker` on the train's `surge` cue — the whole district reacts to the
  pass); street vehicles `car_sedan/van/bike` streaking the lower band on the
  same `surge` cue, alpha ≤0.85, roofline below fighter heads;
  `signal_gantry` as standing scenery. Foreground rain-streak cards during
  ambient rain (fast, near-transparent, additive).
- **Ambient:** keep neon motes; add floor specular glints (`fx.glints`).

### 2. IRONWORKS FOUNDRY — *the warm one* (M)
- **Camera:** `heightBias: 0.5` (catwalk tiers), `driftFollow: 0.3` on the
  swaying hook so the lens breathes with it.
- **Cues:** fire `bloom` on the pour's white-hot tap-hole telegraph (heat
  blooms the lens before the metal falls); pour keeps `rattle`.
- **Garnish:** ember cards rising **in front**, additive, small and fast;
  chain-hook silhouettes behind; steam puffs off the vents (procedural
  texture, optional art `garnish/steam_puff`).
- **Ambient:** replace hand-rolled embers with `fx.embers` + `fx.smoke`;
  distant hammer rhythm synced to a subtle screen pulse.

### 3. UPTOWN PLAZA — *the fair one* (S)
- **Camera:** **deliberately default dials** — the tournament stage should
  feel like the reference shot. Only `fovNudge: 0.5` for daylight air.
- **Cues:** none. This is also the smoke test's **negative garnish-count
  control candidate** — keep garnish minimal and assert its low count.
- **Garnish:** drifting `leaf_gold`/`leaf_green` (sparse; near cards bigger,
  faster, fainter); the existing drone taxi stays a stage_fx plate.
- **Ambient:** fountain spray via `fx.spray`/`droplets`.

### 4. HARBOR DOCKS — *cranes, salt air, temporary terrain* (L)
- **Camera:** `driftFollow: 0.4` on the spreader traverse, `yawBias: −1.5`
  (sunset side), `lookaheadMul: 1.2`.
- **Cues:** container drop keeps `punch`; horn telegraph adds nothing new.
- **Garnish:** gull cards crossing high (new optional art `garnish/gull`,
  procedural chevron fallback); water-glint additive cards behind the quay;
  container-stack silhouettes behind for depth.
- **Ambient:** **currently none — build it**: gull cries timed to the garnish
  passes, water glints (`fx.glints`), trawler bob.

### 5. SKY TERRACE — *small, fast, scrappy* (M)
- **Blast zones:** the flagship Phase-2 data item — per-stage `blast`
  override: sides pulled in ~120 px each (see §3).
- **Camera:** `fovNudge: 1` (thin air), `dampingMul: 0.8` (twitchy little
  stage), wind cue already fires.
- **Cues:** existing `wind`.
- **Garnish:** cloud wisps streaming **in front** only during the gust, on the
  same `wind` cue as the hazard (front and back halves of one event); slow
  cloud-deck cards far behind between gusts.
- **Ambient:** keep streaks; add glass-rail glints.

### 6. SCRAPYARD 7 — *the pile grows either way* (M)
- **Camera:** `yawBias: 2` (the buried hand's fingers stack in depth),
  `dampingMul: 0.9`.
- **Cues:** magnet keeps `rattle`/`fangSnap`/`punch`.
- **Garnish:** `rubble_a/b/c` tumbling toward the lens on the magnet's SNAP
  (`fangSnap` cue, `gravity: 900` cards — the proven Empty City recipe);
  sepia dust motes drifting +X.
- **Ambient:** **currently none — build it**: sand-wind `fx.specks` drifting
  +X, crusher-thump low shake on a long cycle, rust-creak flavour.

### 7. CRYSTAL QUARRY — *every impact rings like a bell* (M)
- **Camera:** `heightBias: 0.55` (terraced pit), `dampingMul: 1.1` (stately).
- **Cues:** fire `hush` for the LED arming sequence (the pit holds its
  breath), then the existing `punch` per detonation — the one-two-three
  reads on the lens as silence → hits.
- **Garnish:** crystal-glint additive cards behind (slow flicker); floodlight
  cone sweep as a wide additive card far behind; post-blast dust via
  `rubble_*` at low alpha.
- **Ambient:** violet motes via `fx.glints`; floodlight sweep — both designed
  in arenas.md, both currently missing.

### 8. VOLCANIC FORGE — *the floor is lava-adjacent* (M)
- **Camera:** `fovNudge: 0.8`, `heightBias: 0.35` (hug the fissured floor).
- **Cues:** fire `inhale` on the lake-surge telegraph (the caldera draws
  breath, dolly pulls with it) — the surge's `banner` + `frenzy` stay for the
  vent itself. Fissure jets keep `surge`.
- **Garnish:** ember columns in front (fast, additive, confined to the edge
  bands); ash flecks drifting behind; lava-lake glow card far behind that
  brightens with the 45 s surge cycle.
- **Ambient:** replace hand-rolled embers/ash with `fx.embers` + `fx.flames`
  low on the fissures + `fx.smoke`.

### 9. FROZEN OUTPOST — *ambient temperature: hostile* (M)
- **Camera:** `dampingMul: 1.25` (glacial calm between beats),
  `lookaheadMul: 0.9`.
- **Cues:** fire `fog` while the floe hole is open (steam off black water,
  dolly-in claustrophobia); the break keeps `rattle`.
- **Garnish:** the aurora as a wide additive curtain card far behind,
  slow-breathing alpha; near-lens snowfall cards (bigger, faster, fainter);
  station window-light glints behind.
- **Ambient:** snowfall via `fx.flutter` (slow) + `fx.specks`.

### 10. DESERT RUINS — *the columns held. Held.* (M)
- **Camera:** `yawBias: −2` (the colonnade rakes into depth on the left).
- **Cues:** fire `layout` when the lintel falls — the cue built for "the
  stage just permanently changed" — on top of the existing `rattle` +
  `lightning`.
- **Garnish:** sand streamers crossing on the gust cycle (same `wind` cue as
  the stage_fx gusts); `rubble_a/b/c` kicked toward the lens on the collapse;
  heat-shimmer wobble card behind the sphinx.
- **Ambient:** streaming sand via `fx.specks` +X, heat shimmer.

### 11. JUNGLE TEMPLE — *the canopy hides an arena* (M)
- **Camera:** `heightBias: 0.6` (pyramid tiers + canopy), `yawBias: 1`.
- **Cues:** fire `bloom` on the ~40 s god-ray relight (the light itself is
  the event); vine whip keeps `surge`.
- **Garnish:** `leaf_green` cards near the lens (the proven Training Bridge
  recipe: near ones bigger, faster, fainter); god-ray planes far behind,
  additive, re-angled on the `bloom` beat; firefly motes at dusk depth.
- **Ambient:** falling leaves via `fx.flutter`, spore `fx.specks` on stomp
  (already partly there), insect drone.

### 12. ORBITAL PLATFORM — *artificial gravity, genuine consequences* (M)
- **Camera:** `heightBias: 0.7`, `dampingMul: 0.7` — the proven low-g float
  recipe (JJK Domain Core used exactly these dials for its 0.88 gravity).
- **Cues:** debris pass keeps `lightning`.
- **Garnish:** slow starfield drift cards far behind; the planet's terminator
  as a near-static wide card; solar-wing silhouette behind, slowly tracking;
  small debris glints crossing on the `lightning` cue with the hazard.
- **Ambient:** thruster-flicker specks off the shuttle, star twinkle.

## 2. Per-stage intro framing (all 12, S each)

`DRAMA`'s intro is one global dolly/yaw. Add an optional `intro` sub-object to
`BOARD_CAMERA` rows — `{ dolly?, yaw?, height?, time? }`, falling back to the
global `DRAMA` values — and author one line per arena so each painting gets
its establishing shot: neon rakes down the street canyon (`yaw 10`), uptown
is a high clean crane-down, volcano starts tight and hot (`dolly 1.1`),
orbital starts wide against the planet (`dolly 1.5, time 2.0`), etc. Data
only; the rig already runs the envelope.

## 3. Shared plumbing (build once, before any per-arena content)

1. **Rekey `BOARD_CAMERA`** to the 12 arena keys; delete the JJK rows; fix the
   stale JJK prose in the `CUES` comments. Add the `intro` sub-object support
   in `rig.js` (§2).
2. **Per-stage blast zones.** Add optional `blast: { left?, right?, top?,
   bottom? }` to `stages.js` entries, merged over `constants.BLAST` at match
   start (`state.blast`); update every consumer (`fighter.js`,
   `tools/smoke_blastzone.mjs`, camera clamps if any). Sky Terrace is the
   only designed user today; the plumbing makes it a data decision forever.
3. **Declarative platform behaviours.** Promote the three imperative motion
   patterns in `stage_fx.js` into optional platform fields interpreted by one
   shared updater: `sway: { amp, rate, dip? }` (foundry hook),
   `traverse: { x1, x2, period, pause }` (harbor spreader),
   `waypoints: { points, period }` (orbital arm). `movePlatform` stays the
   mover. Hazard *hit* logic stays in stage_fx; only the motion becomes data.
   New arenas (or reworks) then vary configuration without new code.
4. **Per-arena ambient table.** Add `STAGE_AMBIENT` to `src/config_fx.js`
   (per-arena: emitter list from `fx.js`, density, palette, drift vector).
   One shared ambient runner in `stage_fx.js` replaces the bespoke inline
   canvas loops arena by arena as each is polished; hand-rolled loops with
   real character (neon's billboard-synced motes) may stay.
5. **Garnish rekey + scaffold.** Empty `SYSTEMS` rows for the 12 arena keys;
   confirm `sharedArtSettled()` / `setup(ctx, settled)` still gate standing
   scenery correctly (the Crosswalk race-condition fix pattern).
6. Fix `stage_fx.js:313` (neon → `drawFx`), remove the vestigial `_flat`
   parameter of `backgroundFile`, and point the four dangling doc references
   at this file. Decide `frictionPow`: keep as an available hook (documented),
   not silently dead.
7. **Verify K2**: arena ambience beds `assets/sfx/amb_<arena>.mp3` actually
   play; wire if not (they are the audio half of every ambient identity).

## 4. Tools (fix before trusting anything above)

- `tools/smoke_camera3d.mjs` — rekey `BOARDS` to mech arenas with per-board
  garnish expectations **including negatives** (uptown ≈ minimal) and a
  `STANDING` count for placed-once scenery (neon gantry, orbital solar wing);
  keep the `GARNISH.enabled=false` clears-the-sky assertion and the
  `debugStats()` live-material checks.
- `tools/smoke_ground3d.mjs` — rekey to `[uptown, skyterrace]` (one main at
  sim y≈570, one small board), same 6 px foot-plant tolerance.
- `tools/smoke_blastzone.mjs` — extend for per-stage `blast` overrides.
- `tools/smoke_stages.mjs` — already iterates all boards; add a fast-forward
  past each stage's *new* cue beats so a cue-storm regression can't hide.
- `tools/audit_stage_reach.mjs` — unchanged; update its doc reference.

## 5. Rollout — phases and checklist

Order (the proven sequence: shared framework → boards in batches → tools →
docs → merge). Each phase is separately shippable and merges to `main` green.

**Phase A — plumbing + camera personality (S-heavy, biggest win/line)**
- [x] A1 Rekey `BOARD_CAMERA`, author dials for all 12 (§1), fix CUES prose
- [x] A2 Intro framing: `intro` sub-object in rig + 12 rows (§2)
- [x] A3 Per-stage blast zones + Sky Terrace values; smoke_blastzone updated
- [x] A4 New cue beats wired in stage_fx: foundry `bloom`, quarry `hush`,
      volcano `inhale`, frozen `fog`, ruins `layout`, jungle `bloom` (the
      god-ray shift itself was also built — it existed only on paper)
- [x] A5 Small fixes: neon `drawFx`, `_flat` removal, doc references, stale
      default `stageKey`, JJK character selectors across all smoke tools
- [x] A6 Tools rekeyed: smoke_camera3d, smoke_ground3d, smoke_camera cue/board
      tables (plan item X4)

**Phases B + C — garnish, all boards** (landed together: the systems share
their textures, so splitting bought nothing)
- [x] B1/C1 `SYSTEMS` rows for 11 arenas (uptown deliberately none — the
      daylight reference and the smoke test's negative control), reusing all
      14 delivered textures + 10 new procedural ones
- [x] B2 Asset request round (docs/image-requests.md): gull, cloud wisp,
      aurora curtain, god-ray shaft — optional upgrades over the procedural
      fallbacks, art hooks already wired
- [x] B3/C2 smoke_camera3d garnish counts (incl. uptown negative and the
      neon/frozen standing-scenery counts)

**Phase D — ambient completion + audio**
- [x] D1 The three bare boards built their ambient layers: harbor (gulls,
      water glints), scrapyard (sand-wind, crusher thumps), quarry (violet
      motes, floodlight sweep) — written in stage_fx's house idiom rather
      than a config table; a shared `STAGE_AMBIENT` runner stays open as a
      refactor if a second consumer ever wants the data
- [ ] D2 Declarative platform behaviours (sway/traverse/waypoints) — refactor,
      no behaviour change; smoke_stages green proves it
- [x] D3 K2 ambience beds verified: audio.js already plays `amb_<stageKey>`
      per arena (config_audio.js registers all 12)
- [x] D4 Docs: `docs/arenas.md` gained its presentation-layer table;
      `docs/mech-conversion-plan.md` X4 ticked; image requests split into a
      live list + history archive (docs/image-requests{,-history}.md)

Definition of done per phase: boot clean, `smoke_stages` + `audit_stage_reach`
+ rekeyed 3D smokes green, committed on the feature branch, merged to `main`,
Pages deploy confirmed.
