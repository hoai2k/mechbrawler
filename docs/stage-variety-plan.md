# Stage Variety — Implementation Plan & Progress

Working doc for implementing [stage-variety-ideas.md](stage-variety-ideas.md).
**Update the checklist as work lands** so a fresh session can resume from here.

Branch: `claude/board-gameplay-variety-audit-9kifjf` → merge to `main` when done.

## Decisions (locked with the user)

- One Settings toggle: **"Active Boards"** (`state.activeBoards`, default **on**).
  Off = every board reverts to today's static layout: no hazards, no motion,
  no modifiers. (Simpler than the ideas doc's split of feel-vs-hazard.)
- All hazard/gimmick visuals are **procedural canvas drawings first**; optional
  polish sprites are requested as **round 9D** in asset-requests.md and, when
  they land, load as `optional` in assets.js with the procedural draw as
  fallback. The game must never require them.
- Domain Expansion already degrades cleanly without its 9C art (verified:
  `assets.js` loads `domain:*` as optional; `drawDomainBackdrop`,
  `effect:shrine`, `summon:rika` uses are all null-guarded). No work needed
  beyond keeping it that way.

## Architecture

- `src/stage_fx.js` (NEW) — everything stage-specific:
  - `STAGE_FX` registry: `stageKey -> makeFx(stage)` returning an entity
    (`{ owner: null, update(dt), draw(ctx), drawTop?(ctx) }`) pushed into
    `state.entities` by `initStageFx()` from `resetMatch()` when
    `state.activeBoards` is on.
  - Shared helpers: `stageHit()` (respects invuln/shield, light fixed knockback,
    never spikes), telegraph drawing, per-fighter hazard i-frames, platform
    move-with-carry (shifts grounded riders and ledge-hangers), phasing.
- `state.stageMods = { gravityMul, frictionPow }` — set by `initStageFx()`
  (neutral `{1,1}` when toggle is off). `state.hazardZones = []` — active
  telegraphed danger zones `{x, w, until}` that the CPU reacts to.
- `src/fighter.js` — gravity × `stageMods.gravityMul`; ground friction uses
  `Math.pow(st.friction, stageMods.frictionPow × (plat.frictionPow ?? 1))`;
  `resolvePlatforms` skips `plat.ghost` platforms.
- `src/render.js` — `drawPlatformShape` honors `p.ghost` (skeletal outline),
  `p.shakeMag` (crumble tremor), `p.accent` (stroke color); entities get an
  optional `drawTop(ctx)` pass after fighters (needed for Mist Pier fog).
- `src/ai.js` — in `makePlan`: standing inside an active `hazardZones` entry →
  jump/move out. One rule, all stages.
- UI: `index.html` settings button + `ui.js` wiring + `TEXT.settings` string.
- Docs: game-mechanics §6 rewritten; asset-requests round **9D** added.

## Per-stage gimmicks (from the ideas doc)

| # | Stage | Gimmick | Status |
|---|---|---|---|
| 1 | trainingBridge | none — baseline; cosmetic falling leaves | ☑ |
| 2 | quietHall | silence bell: every ~25s, 4s all-specials seal | ☑ |
| 3 | floodedGate | surge wave sweeps main platform, pushes (no dmg) | ☑ |
| 4 | shibuyaNight | curtain: 8s window, meter builds much faster | ☑ |
| 5 | curseMaw | fangs snap up at both main-platform edges (7%) | ☑ |
| 6 | gardenSteps | terraced layout + blooming flower heals 8% | ☑ |
| 7 | lanternCorridor | falling lantern → burn patch ~2.5s | ☑ |
| 8 | sunkenCrossing | slick surface (frictionPow ≈ 0.35) | ☑ |
| 9 | neonSplit | center energy wall 5s, 6% to cross | ☑ |
| 10 | boneSanctum | side/top platforms rattle → phase intangible | ☑ |
| 11 | bridgeDuel | whole main platform drifts ±70px (8s period) | ☑ |
| 12 | academyHall | bell: platforms glide between preset layouts | ☑ |
| 13 | mistPier | fog bank hides fighters as silhouettes 6s | ☑ |
| 14 | crosswalkRush | telegraphed traffic streaks at ground level (5%) | ☑ |
| 15 | cursedTeeth | falling fangs (shadow telegraph) + inhale suction | ☑ |
| 16 | riverGate | alternating crosswind drifts airborne fighters | ☑ |
| 17 | schoolWing | weak curse blob: pop for +8 meter, or 4% touch | ☑ |
| 18 | emptyCity | top platform crumbles under weight, reforms 5s | ☑ |
| 19 | billboardRoof | lightning strikes top platform after flashes (8%) | ☑ |
| 20 | domainCore | gravity 0.88× + orbiting side platforms | ☑ |

## Task checklist

- [x] Merge ideas doc to main; write this plan; merge plan to main
- [x] Framework: stage_fx.js scaffold, initStageFx, stageMods, hazardZones,
      toggle in state.js, fighter.js gravity/friction/ghost, render.js hooks
- [x] Settings toggle "Active Boards" (index.html + ui.js + config_menus.js)
- [x] Stages 1–10 gimmicks
- [x] Stages 11–20 gimmicks (incl. gardenSteps layout edit in stages.js)
- [x] AI hazard-zone reaction
- [x] Asset requests round 9D + optional loads in assets.js with fallbacks
- [x] Docs: game-mechanics.md §6 update; tick the table above
- [x] Verified: `node tools/check_imports.mjs` clean, plus a real headless
      Playwright run (`tools/smoke_stages.mjs`) — all 20 boards played with
      their gimmick live, no page errors, hazards landed on the CPU, toggle
      Off restored static boards, and the 11 console 404s were exactly the
      optional 9C domain backgrounds + 9D stage sprites (fallback path).
- [x] Commit, push, **merge to main**

## Guardrails (from the ideas doc — enforce in code review)

Hazard damage 4–8%, fixed light knockback angled inward/upward, never a spike,
≥1s telegraph, one gimmick per stage, main-platform ledges always work, KO
impossible from a hazard alone.

---

# Phase 2 — Platform configurations (follow-up request)

Goal: break the uniform "2 side + 1 top" structure. Every board keeps its main
(lowest) platform at its current height; above it sit **2–6** other platforms
in one of a fixed set of archetypes (no random variation).

## Reach budget (measured)

Jump impulses are 710–800 (`characters.js`) at gravity 2350
(`constants.js`): single-jump rise **107–136 px**, single + air jump
**~198–250 px** (air jump = 92% power). The game's existing tier gap (main →
side) is 140 px — already a double-jump step for everyone. Rules derived:

- **Vertical step between adjacent tiers: ≤ 140 px** (≤ 180 absolute max).
- **Highest platform y ≥ 235**, so a full single jump from it (max 136 px)
  stays below the top of the board (y = 0). Blast top is −420 — far away.
- Every platform must be reachable via a chain of such steps with horizontal
  overlap/adjacency (checked by `tools/audit_stage_reach.mjs`).
- Main platforms keep their current y (566–584); spawn/respawn x (250–1030)
  always has the main below it.

## Archetype set (researched against Smash stage design)

| Archetype | Model | Shape |
|---|---|---|
| Crossroads | Battlefield | 2 side + 1 top triangle (the classic) |
| Arena | Pokémon Stadium | 2 platforms, open sky above — juggles and KOs off the top |
| Skyline | Big Battlefield | 5 platforms in 3 tiers — vertical playground |
| Ribcage | Dracula's Castle | 6 platforms in 3 tiers (paired with phasing so ~1–2 are out at a time) |
| Staircase | Yoshi's Island | ascending terraces |
| Islands | Fountain of Dreams | 3 small refuge platforms at varied heights |
| Gallery | Hyrule Temple corridor | a row of same-height rafters (a "second floor") |
| Twin towers | Frigate Orpheon | 2 stacks left/right, nothing across the middle |
| Overpass | Halberd deck | one wide bridge platform + small high perches |
| Tower | Luigi's Mansion | a centre stack climbing off wide low ledges |
| Orbit field | Smashville ×4 | several small moving platforms (moving ⇒ more of them) |

## Per-stage assignment

| Stage | Archetype | Others | Why |
|---|---|---|---|
| trainingBridge | Crossroads (unchanged) | 3 | stays the declared neutral board |
| quietHall | Arena (2 wide rafters, y 438) | 2 | open sky suits the pure-melee hush |
| floodedGate | Islands (2 low + 1 high, small) | 3 | refuge rocks above the surge |
| shibuyaNight | Skyline (3 tiers to y 240) | 5 | the city climbs |
| curseMaw | Arena ("molars", y 442) | 2 | more air = more room to dodge chomps |
| gardenSteps | Staircase (kept) | 3 | already themed |
| lanternCorridor | Gallery (3 rafters, y 428) | 3 | lanterns land ON the rafters now |
| sunkenCrossing | Arena (2 × w300 lanes) | 2 | long slides need open floor |
| neonSplit | Twin towers (2+2, clear centre) | 4 | the bolt owns the middle |
| boneSanctum | Ribcage (6, three tiers) | 6 | more bones to phase |
| bridgeDuel | Arena (2 torii roofs) | 2 | duel purity over a moving floor |
| academyHall | Transforming (now 4 plats, 4 layouts) | 4 | moving ⇒ more platforms |
| mistPier | Islands (2 docks + lantern post) | 3 | low, memorable shapes for the fog |
| crosswalkRush | Overpass (w520 bridge + 2 signs) | 3 | the pedestrian bridge over traffic |
| cursedTeeth | Crossroads (tight centre funnel) | 3 | fangs fall through the funnel |
| riverGate | Islands (asymmetric, spread) | 3 | wind matters between far platforms |
| schoolWing | Twin towers (balconies 2+2) | 4 | windows and walkways |
| emptyCity | Ruins: 2 low + **2 crumbling rooftops** | 4 | decay, doubled |
| billboardRoof | Tower (2 ledges + mid + strike top) | 4 | lightning wants a summit |
| domainCore | Orbit field (4 orbiting shards) | 4 | moving ⇒ more platforms |

## Phase 2 checklist

- [x] stages.js: new layouts per the table
- [x] stage_fx.js: academyHall 4-platform layouts; emptyCity multi-rooftop
      crumble; domainCore even orbit phases for N platforms; lantern &
      falling fang land on the topmost surface under their x (rafters!)
- [x] tools/audit_stage_reach.mjs: static reachability + height-cap audit
      (it caught two real flaws pre-fix: Crosswalk's overpass was a 168px
      hop, and River Gate's mid platform was only reachable from above)
- [x] Verify: audit 0 errors/0 warnings; full smoke suite green on all 20
      boards; screenshots confirm skyline/ribcage/overpass/tower/orbits
- [x] Docs (game-mechanics §6 note) + merge to main
