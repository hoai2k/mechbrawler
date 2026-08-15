# Level Design Review — platform geometry vs. fighter size

A pass over the 20 boards in `src/stages.js`, measuring platform sizes and
counts against the fighters that stand on them, with Smash Bros.' stage
variety as the reference point. Follow-up to the Phase 2 archetype work in
[stage-variety-plan.md](stage-variety-plan.md) — this review takes the
archetypes as given and asks whether the *proportions* serve them.

**Status: implemented** (same branch, follow-up commit), with the user's two
additions: G1 landed as (a) *and* a mild (b) — `HEIGHT_BASE_PX` 175.3 → 149
and every jump impulse +10% (710–800 → 780–880, single rise 129–165 px) — and
the camera got Smash-style dynamic framing (`camera.js`): the alive fighters'
padded bounding box picks the zoom, up to 1.32× on close fights so the smaller
roster still reads large, padded 280 px above vs 120 below so top space wins
and the main platform sits low in the frame. Everything in §4 landed as
written, plus: Garden Steps' risers restretched to 110/90/90 and Billboard
Roof rebuilt as a real tower (ledges 470 → mid 370 → summit 262) under the new
jump envelope; Bone Sanctum's ribs restretched to 118/110/110 steps; spawns
now land on the lowest platform under their x (Battlefield-style) so narrow
mains can't drop an outer spawn into the void. The per-board "optional" items
landed too (Quiet Hall's rafter lean, Curse Maw's molars moved outward, School
Wing's 130/170 balconies). The one thing deliberately NOT done is the
split-main board — G6's Phase 3 candidate, which needs per-stage spawn logic
first. The sections below are the original review as written.

## 1. The measured baseline

Everything below is read from `constants.js`, `config_tuning.js`,
`characters.js`, `silhouette.js` and `stages.js`.

| Quantity | Value |
|---|---|
| World | 1280 × 720, fixed (`WORLD`) |
| Blast zones | left −300, right 1580, top −420, bottom 1000 |
| Fighter standing height | 147–200 px (`HEIGHT_BASE_PX` 175.3 × ratio 0.84–1.14) |
| Fighter body width | ~0.38 × height ⇒ ~56–76 px typical |
| Run speed | 402–468 px/s; air speed 305–380 px/s |
| Single jump rise | 107–136 px (impulse 710–800 at gravity 2350) |
| Single + air jump | ~198–250 px |
| Main platforms | w 660–920, h 42, y 566–584 |
| Drop-through platforms | w 150–340 (one 520), h 20–22 |
| Tier steps | 80–140 px (cap ≤140, `audit_stage_reach.mjs`) |
| Highest-platform cap | y ≥ 235 |

Two derived ratios drive most of what follows:

- **A main platform is ~4–5.5 body-heights long.** Battlefield's floor is
  ~12–14 Mario-heights; even small Smash stages run 8+. These boards are,
  in Smash terms, all *small* stages — a deliberately denser brawler.
  That's a legitimate identity, but it narrows the range of situations:
  neutral resets, camping space, and long dash-dances barely exist.
- **No fighter can single-jump their own height** (max rise 136 px vs.
  shortest fighter 147 px), and the tier-step cap (140 px) is *below*
  standing height. Every layered board therefore stacks platforms closer
  together than a body: a fighter on the main pokes head-and-shoulders
  through the side-platform layer, and on Bone Sanctum's 80 px steps more
  than half the body overlaps the tier above. In Smash a platform hop is
  1.5–2 character heights of clearance; here layers interpenetrate.

## 2. Global recommendations

Ordered by leverage.

### G1. Fix the vertical scale — one lever, three options

The compressed vertical band (main ~570 → cap 235 ≈ 335 px, barely two
body-heights of layered play) is the single biggest divergence from
Smash-style dynamics: juggles, platform tech-chases, and top-KO setups all
live in vertical space this game doesn't have. Pick **one**:

- **(a) Shrink fighters ~15%** (`HEIGHT_BASE_PX` 175.3 → ~149). Every board
  gets longer *and* airier at once with zero stage edits: mains become
  ~5.3–6.5 body-heights, tier steps land at ~parity with body height, and
  the fixed camera framing is untouched. Cheapest, most uniform win;
  cost is a slightly less "big sprites" look.
- **(b) Raise jumps ~15–20%** (impulses 710–800 → ~820–920, single rise
  ~145–180 px) and lift the tier-step cap to ~180 px. Boards then *earn*
  their spacing — side platforms could sit 160–180 below-cap steps apart
  instead of 110–140. Requires re-running `audit_stage_reach.mjs` with new
  constants and re-spacing most layered boards.
- **(c) Accept the dense-brawler identity** and instead push *horizontal*
  variety harder (G2). Valid, but then several 3-tier boards (Bone
  Sanctum, Shibuya Night) should shed a tier, because layers under one
  body-height apart mostly add clutter, not situations.

Recommendation: **(a)**, possibly paired with a mild version of (b).

### G2. Widen the size *range* of mains, not every main

Mains span only 660–920 px — every board is "medium." Smash's variety comes
from the spread (Final Destination vs. Fountain vs. tiny duel stages):

- **Small end:** Bridge Duel 660 → **~560** (x 360). It's the declared duel
  board and it drifts ±70; a genuinely small, scary main makes it the
  "Yoshi's Story" of the set.
- **Big end:** push one or two crowd boards to near-full span: Academy Hall
  920 → **~980** (x 150), Sunken Crossing 900 → **~960**. These are the
  boards Battle Royal (8 spawns across x 320–960, ~91 px apart —
  shoulder-to-shoulder at 56–76 px body widths) most needs.
- Consider steering crowd modes (5+ fighters) toward the wide-main boards,
  or widening `CROWD_SPAN` on them.

### G3. Minimum length for *contested* platforms: ~3 body widths (≈210 px)

A platform two fighters actually fight on needs room for two ~70 px bodies
plus spacing. Several boards sit under that line where the archetype says
"fight here":

- Bump: Bone Sanctum tops 170 → 200; Cursed Teeth top 170 → 195;
  Flooded Gate islands 180 → 200; Lantern Corridor rafters 190 → 210
  (lanterns land on them — you want to *stand* there); Neon Split uppers
  180 → 200.
- Keep sub-180 **only** where "perch, not arena" is the point: Crosswalk
  Rush signs (150), Billboard Roof strike-top approach ledges, Mist Pier
  lantern post (150), School Wing upper balconies (150). Those are the
  Islands/Overpass identity and should stay cramped.

### G4. Thickness: thin the drop-throughs, keep the mains

Drop-throughs are 20–22 px ≈ 11–15% of body height — in Smash's ballpark,
so nothing is *wrong*. But because tiers sit so close (G1), a fighter
attacking through a platform from below is common, and a thinner sliver
reads better and shaves hitbox occlusion. Suggest **14–16 px** for all
`side`/`top` platforms (pure `h` edit, no reach implications — the audit
cares about the top surface y). Mains stay 42: they're the ground and
should read heavy.

### G5. Protect the open sky

The Arena boards (Quiet Hall, Curse Maw, Sunken Crossing, Bridge Duel) are
the only ones with real air above the fight, and they play differently
because of it — that *is* Smash's Pokémon Stadium value. Two guardrails:

- Don't add tops to Arena boards in future passes.
- On 3-tier boards, the y ≥ 235 cap leaves under one jump of air above the
  summit. If G1(a)/(b) lands, revisit the cap (e.g. 265 with smaller
  fighters) so the top platform isn't pressed against the ceiling.

### G6. More asymmetry and one exotic ground shape

Garden Steps and River Gate are the only asymmetric boards; Smash leans on
asymmetry for stage-positioning stories (strong side / weak side). Cheap
additions within current engine support:

- **Empty City:** offset the two rooftop pairs (e.g. left pair one tier
  lower than the right) — ruins are naturally uneven, and the crumble
  gimmick gets a directional flavor.
- **Mist Pier:** docks at slightly different heights (462 / 440) — piers
  sag; the fog gimmick rewards memorizing an uneven silhouette.
- **The one genuinely new shape:** a board whose main has a *gap* (two
  grounds, a center pit — Frigate/temple energy). This is the largest
  unexplored dynamic: center KOs, pit-edge scrambles, two-ledge recovery
  choices per side. Engine caveat: spawn/respawn logic assumes one main
  under x 250–1030 (`mainPlatform`, `spawnXs`), so it needs a per-stage
  spawn override before any board can try it. Flagging as a candidate for
  a Phase 3, not a quick edit.

### G7. Billboard Roof's 80 px "ledges" are curbs, not platforms

The 150-wide side ledges at y 500 sit 80 px above the 580 main — under half
a body. A fighter standing beside one overlaps it entirely; as platforms
they add ambiguity (accidental drop-through inputs, ledge-grab noise near
the main's real ledges) without adding a position. Either raise them to
~470 (a real 110 px first step toward the tower) or drop them and let the
tower be main → mid (440) → top (310), which is already a clean climb.

## 3. Per-board notes

Boards not listed are proportionally sound for their archetype
(Training Bridge, Shibuya Night, Garden Steps, Sunken Crossing, Neon Split
towers-spacing, Academy Hall, Crosswalk Rush, River Gate, Domain Core).

| Board | Observation | Suggestion |
|---|---|---|
| Quiet Hall | Arena rafters 270 wide are fine, but both at y 438 makes the board mirror-flat for a "hush" theme that could feel off-balance | optional: drop one rafter to 452 for a subtle lean |
| Flooded Gate | islands 180 are refuges the surge pushes you toward — slightly too small to *hold* under pressure | 180 → 200 (G3) |
| Curse Maw | molars 220 @ 442 good; theme could bite harder — molars could sit closer to the fangs' edges | optional: move molars outward ~40 px so camping them means standing over the chomp zone |
| Lantern Corridor | rafters 190 with 115 px gaps; lanterns land on them | 190 → 210; gaps stay ≥ 95 px (>1 body width, still droppable) |
| Bone Sanctum | 6 plats over 80 px steps — densest board; bodies span two tiers at once | if G1 lands, restretch steps to ~110/110; else consider 5 plats (drop one top rib) |
| Bridge Duel | smallest main (660) *and* drifting — best identity in the set, could commit harder | 660 → 560 (G2); torii roofs overhanging the void are great, keep |
| Mist Pier | symmetric docks under fog | stagger dock heights (G6) |
| Cursed Teeth | top 170 is the funnel fangs fall through — fighting on it is the risk/reward | 170 → 195 so two fighters *can* contest it |
| School Wing | balconies 150 @ 330 are perches — fine — but both towers identical | optional: make one tower's upper balcony 130/other 170 for a strong-side |
| Empty City | crumbling rooftops symmetric | offset pairs (G6) |
| Billboard Roof | 80 px curb-ledges | raise to ~470 or remove (G7) |

## 4. Numeric quick-win summary (if implemented)

All `stages.js`-only, audit-safe under current physics:

- Thin all `side`/`top` platforms: `h: 22/20` → `h: 15` (G4)
- Bridge Duel main: `x: 310, w: 660` → `x: 360, w: 560`
- Academy Hall main: `x: 180, w: 920` → `x: 150, w: 980`
- Sunken Crossing main: `x: 190, w: 900` → `x: 160, w: 960`
- G3 length bumps: boneSanctum tops 170→200, cursedTeeth top 170→195,
  floodedGate sides 180→200, lanternCorridor rafters 190→210,
  neonSplit uppers 180→200
- Billboard Roof: side ledges `y: 500` → `y: 470` (or delete)
- Mist Pier: right dock `y: 462` → `y: 440`; Empty City: left rooftop pair
  down one half-step (`y: 326` → `y: 360`, left low plat `y: 446` → `y: 470`)

The bigger levers — fighter scale (G1a), jump impulses + step cap (G1b),
split-main spawn support (G6) — touch `config_tuning.js`, `characters.js`,
`constants.js` and `tools/audit_stage_reach.mjs`, and should be their own
pass with the reach audit and `tools/smoke_stages.mjs` re-run.
