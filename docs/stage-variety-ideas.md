# Stage Variety — Audit & Design Proposals

Status: **proposal, not implemented.** This doc audits the 20 boards as they
exist today and proposes one signature gameplay identity per board, themed off
its name and backdrop art, in the spirit of Super Smash Bros. stage variety.
Every proposal keeps the board fully playable: the main platform keeps its
grabbable ledges, blast zones don't move, and nothing on a stage can KO a
player by itself.

---

## 1. Audit: what the boards are today

Every stage in `src/stages.js` is the same recipe: **one solid main platform +
two drop-through side platforms + one drop-through top platform**, with only
small (±10%) jitter in positions and widths. The only per-stage differences
that reach the player are the backdrop painting, a full-screen color tint, and
the battle music. Stage choice has **zero gameplay impact** today.

Measured spread across all 20 layouts:

| Property | Min | Max | Notes |
|---|---|---|---|
| Main platform width | 660 (Bridge Duel) | 920 (Academy Hall) | ~28% spread — barely felt |
| Main platform y | 566 | 584 | 18 px — invisible |
| Side platform width | 170 | 270 | |
| Top platform y | 292 | 350 | the only spread you can half-feel |
| Asymmetric layouts | 2 | | Cursed Teeth & River Gate have offset side heights |

So the audit conclusion is simple: the boards are skins. The good news is the
engine is well set up to change that:

- `resetMatch()` **copies** platforms per match (`stage.platforms.map(p => ({...p}))`),
  so platforms can move/mutate mid-match without touching stage data.
- `state.entities` runs scripted objects with `update()`/`draw()` every frame —
  a ready-made home for stage hazard controllers (KO cleanup skips them if
  `owner` is null).
- Status effects already exist for everything hazards need: **burn** (fire
  patches), **snare** (vines/water), **gust** (wind/suction).
- Friction is already per-fighter (`st.friction`) and applied in one place —
  a per-platform surface multiplier is a few lines.
- Ledge grabbing reads platform positions live, so a *moving* main platform
  keeps working ledges for free.

---

## 2. Shared framework (build once, use everywhere)

Small engine additions that all stage identities below are assembled from:

1. **Stage modifiers** — optional per-stage fields: `gravityMul`,
   `frictionMul` (global), per-platform `friction`, per-platform `color`.
2. **Platform motion** — per-platform optional `path` (horizontal drift,
   vertical bob, or point-to-point glide). Fighters standing on a moving
   platform are carried (`f.x += plat.dx`). Vertical motion kept slow
   (< 60 px/s) so the existing land check (`prevY <= plat.y + 4`) stays sound.
3. **Platform phasing** — per-platform `solidT` cycle: platform fades to a
   ghost outline (intangible) and back. Never applies to the main platform.
4. **Stage hazard entities** — a per-stage `makeHazards()` that pushes
   controller entities into `state.entities` at match start. Hazard hits use a
   shared helper: light damage (4–8%), gentle fixed knockback, **never a spike
   angle**, and a mandatory ≥ 1 s telegraph (glow / warning arrows / sound).
5. **Hazards toggle** — a `Stage hazards: On/Off` option next to the stocks
   setting (Smash's "hazards off" switch). Off = today's static layouts, so
   nothing is ever forced on a player. Passive feel modifiers (ice, wind,
   gravity) stay on; scripted hazards turn off.
6. **AI survivability** — hazards are periodic and telegraphed; the CPU gets
   one cheap rule: shield/jump when standing inside an active telegraph zone.

---

## 3. The 20 boards

Grouped by theme family so sibling stages get *contrasting* identities.
Effort: **S** = data/modifier only, **M** = platform motion/phasing,
**L** = scripted hazard entity.

### Baseline

**1. Training Bridge** — *the fair one* — Effort: S
The tutorial garden bridge stays (nearly) vanilla on purpose: this is the
game's Final-Destination-style neutral pick, and the stage select should say
so ("No tricks. Just you."). Only cosmetic falling leaves. Every game needs
the board players pick when they want zero interference.

### Traditional / wooden interiors

**2. Quiet Hall** — *the silence bell* — Effort: L
An empty dojo where noise feels forbidden. Every ~25 s a bell tone rings and
the hall "hushes" for 4 s: lanterns dim, the tint deepens, and **all specials
are sealed** (the existing Silence status, applied to everyone). Pure-melee
windows flip the matchup rhythm — projectile characters must close in, brawlers
get their moment. Fully symmetric, so it's fair by construction.

**7. Lantern Corridor** — *falling lanterns* — Effort: L
The hanging lanterns sway with the camera. Every ~18 s one lantern (random
spot, marked by a swinging-faster telegraph + creak) drops, shatters, and
leaves a **small burn patch** for ~2.5 s (existing burn status, weak tick).
The corridor's warm tint flares briefly with each fire. Teaches spacing
around a zone without ever being lethal.

**12. Academy Hall** — *class change* — Effort: M
Jujutsu High's grand hall runs on a timetable. Every ~30 s a school bell
rings and the three drop-through platforms **glide to a new arrangement**
(3–4 preset layouts: standard, staircase-left, staircase-right, twin-low).
Pokémon-Stadium-style transformation, but gentle — platforms glide over 1.5 s
and are solid the whole way. The main platform never changes.

**17. School Wing** — *something in the windows* — Effort: L
The night-time corridor is infested. Every ~20 s a **weak cursed spirit**
(one small blob, neutral to both players) crawls out of a window and wanders
the platforms. Hitting it pops it for **+8 meter** — a contested reward — but
if it touches a fighter first it latches for 4% and a light pushback. One at
a time, dies on its own after 8 s. Turns dead time into a scramble.

### Water

**3. Flooded Gate** — *the surge* — Effort: L
The half-sunken torii sits in floodwater. Every ~20 s the water gathers
(rippling glow + rising sound) and a **knee-high surge wave** sweeps across
the main platform, pushing grounded fighters along (existing gust status —
push, no damage). Jump it, or ride it into a worse position. Side/top
platforms are safe ground — the wave makes the high ground matter.

**8. Sunken Crossing** — *the mirror* — Effort: S
A flooded street reflecting the sky — the whole stage is **slick**. Global
friction multiplier ~0.55: runs slide, stops drift, dashes carry. It's the
game's "ice stage" without needing snow, and the reflective backdrop already
sells it. (Feel modifier, so it stays on even with hazards off.)

**13. Mist Pier** — *the fog rolls in* — Effort: M
Every ~30 s a mist bank drifts across the pier for ~6 s: fighters fade to
**dim silhouettes**, name tags and HUD stay, lantern glows and attack flashes
still read. Both players are equally blind, spacing goes by sound and memory.
Purely visual (no physics change), very cheap, huge atmosphere.

**16. River Gate** — *the river breeze* — Effort: S
Sunset river crossing with a **gentle crosswind** that alternates direction
every ~15 s. Airborne fighters drift ~40 px/s with it; grounded movement is
untouched. Drifting petals show the current direction at all times. Subtly
reshapes edge-guards and recoveries each swing — the Smash "wind stage" at
its mildest.

### Urban / night city

**4. Shibuya Night** — *the curtain falls* — Effort: M
The incident stage. Every ~30 s a dark **curtain** (translucent dome tint)
descends for ~8 s: the backdrop deepens to void-purple and **cursed energy
runs dense — everyone's meter gains ×2**. Ultimates and domains come out
faster on this board than anywhere else, which is exactly the Shibuya story.

**9. Neon Split** — *the split* — Effort: L
The alley's giant energy bolt periodically re-strikes: warning crackle along
the stage's center line (~1.5 s), then a **vertical energy wall splits the
stage for 5 s** — crossing it costs 6% and a light pop-up (no wall physics,
just a thin hazard hitbox). Whoever holds the better side when the split hits
earns tempo; a well-timed dodge crosses clean.

**14. Crosswalk Rush** — *traffic* — Effort: L
Don't stand in the road. Every ~15 s the crossing signal chirps, warning
arrows flash along the main platform, and a **stream of light-trail
"traffic"** races across at ground level for ~1.5 s (5%, light upward knock —
the F-Zero stage rule). Platforms above are the sidewalk. The whole stage
breathes in walk/don't-walk cycles.

**18. Empty City** — *decay* — Effort: M
The abandoned overpass is structurally shot: the **top platform crumbles
under weight** — stand on it and it shakes, tilts (visual), and after ~1.2 s
gives way (fades intangible), reforming 5 s later. Side platforms are sound.
The classic weight-sensitive platform: aerial superiority is on a timer here.

**19. Billboard Roof** — *the storm* — Effort: L
The thunderstorm in the art becomes real. On a ~22 s cycle the clouds flash
twice (telegraph), then **lightning strikes the top platform** (8%, knock
toward center — never outward). The top platform is the strongest position on
the board *between* strikes and a trap during them. Billboards flicker with
each strike for free spectacle.

### Curse / monster

**5. Curse Maw** — *it bites* — Effort: L
You are fighting *on its jaw*. Every ~20 s the maw hungers: the outer thirds
of the main platform glow tooth-blue (~1.2 s), then **fangs snap up** at both
edges (7%, pop-up launch). Center stage is always safe — the whole stage
pushes toward mid-stage brawls, and ledge-campers get chewed.

**15. Cursed Teeth** — *it swallows* — Effort: L
The sibling maw, inverted: threats come from **above and inward**. Fangs
occasionally drop from the ceiling (shadow telegraph on the ground, 6% where
they land, shatter on impact), and every ~25 s the stage **inhales** — 2 s of
gentle suction toward center (gust status). Curse Maw punishes the edges;
Cursed Teeth stirs the center. Same family, opposite pressure.

**10. Bone Sanctum** — *brittle bones* — Effort: M
The ribcage cathedral's platforms are old bone: side and top platforms
**phase on a rattling cycle** — each rattles for 1 s (telegraph), turns
skeletal-transparent and intangible for 3 s, then re-knits. Offset phases so
something is always solid. Platform play becomes a timing read; the main
floor never phases.

**11. Bridge Duel** — *the swaying bridge* — Effort: M
A moonlit duel on a suspension bridge that never sits still: the **entire
main platform drifts slowly left and right** (~±70 px, 8 s period — ledges
move with it, which the engine already handles). Side/top platforms are fixed
torii rooftops, so the stage slowly shears under your feet — Smashville's
moving platform, scaled up to the floor itself.

### Mystic

**6. Garden Steps** — *the blooming* — Effort: M/L
The temple garden gives as well as takes. Platforms get re-seated into a
proper **staircase terrace** (the art is literally steps — the one layout
change in this whole doc). Every ~25 s a flower blooms on a random platform
(sprout telegraph, ~1 s): first fighter to touch it **heals 8%**. The only
healing in the game, rationed and contested — a reason to fight *for ground*
rather than for position.

**20. Domain Core** — *inside a domain* — Effort: S/M
Reality is negotiable here. **Gravity 0.88×** (floatier jumps, longer
juggles, later fast-falls) and the two side platforms **orbit slowly** in
small ellipses around the core. The whole board feels like fighting inside
someone's Domain Expansion — the same fight, under someone else's rules.

---

## 4. Rollout plan (if approved)

Three phases, each shippable on its own:

1. **Phase 1 — feel modifiers (S items):** framework fields + Sunken
   Crossing (slick), River Gate (breeze), Domain Core (low-grav), Training
   Bridge (declared baseline). No hazard entities, no AI changes.
2. **Phase 2 — platform motion (M items):** carry + phasing + glide: Bridge
   Duel, Bone Sanctum, Empty City, Academy Hall, Mist Pier fog, Shibuya
   curtain, Garden Steps terrace, Domain Core orbits.
3. **Phase 3 — scripted hazards (L items):** hazard helper + hazards toggle +
   telegraph rule + CPU telegraph-dodge: the remaining boards.

Balance guardrails throughout: hazard damage 4–8%, fixed light knockback
angled inward or upward (never a spike, never toward a blast zone), ≥ 1 s
telegraphs, one identity per stage, main-platform ledges always grabbable,
and the hazards toggle for players who want none of it.
