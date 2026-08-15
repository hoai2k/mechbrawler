# Image requests — MECH BRAWLER

**STATUS: EVERYTHING BELOW HAS BEEN DELIVERED. Nothing on this page is
outstanding.** All 61 plates — 33 power effects, 9 status/shared, 16 arena
hazards, 3 UI — arrived in `assets/intake/`, were landed by
`tools/effects_intake.py`, and are in `assets/sprites/effects/` and
`assets/ui/`. The sections are kept verbatim rather than deleted, because a
later redraw of one plate has to agree with the brief the others were drawn to;
what changed is this header.

**Where each one ended up**, and what is still owed on the code side, is
[the delivery record](#the-delivery--what-landed-and-what-is-still-owed) at the
foot of this file. The tool for placing any of it is the **effect workbench**
(`workbench/`, `node server.mjs` then `/workbench/`): every drawing in the game
beside the mech that throws it, at the size the game paints it.

---

The list of images to GENERATE for the mech conversion. Everything the
game needs that cannot be sourced from robotworld's assets or drawn
procedurally. Delivered files land in `intake/` (arena backgrounds and mech
cards already arrived — thank you); effect sprites go to
`intake/effects/<name>.png` unless noted.

**STATUS — the full effect round is DELIVERED and WIRED (plan task K9).**
All 58 effect sprites (§1–§3) plus `stock_chip`, `vs_flash` and
`wordmark_mech_brawler` (§4) arrived in `assets/intake/`, were downscaled to
game scale (`assets/sprites/effects/`, `assets/ui/`) and wired into the kits,
statuses, hazards and UI. The painted wordmark won its side-by-side against
the CSS neon title and now IS the title (index.html). The delivered tables
below are kept for the record of what each sprite is; the only OPEN requests
are the two in §5 at the bottom.

Notes from the wiring pass: `shock_arc` and `venom_drip` are registered and
load, but their statuses (SHOCK, VENOM) are still `TODO(engine)` in
characters.js — they get consumers when those statuses land.

Style baseline for every request: **bright neon arcade** — the palette of the
intake arena paintings (deep blue-black grounds, hot cyan/magenta/amber
accents), clean silhouettes that read at 15% screen height, glow baked in,
**transparent background (PNG)** for every sprite. The old game's effects
were smoky and dark; these should read like signage. When in doubt, brighter.

Sizes: effect sprites ~512px on the long side unless noted; they are drawn
scaled down, so detail beyond silhouette + glow is wasted.

## 1 — Power effects (per mech) — DELIVERED

One sprite per named effect. Side view or shallow ¾ unless noted — these
composite into a side-on fight.

| file | for | what to draw |
|---|---|---|
| `rocket_fist.png` | TITANUS N | a brass-gold armoured fist, fingers forward, rocket flare behind the wrist, amber `#ffa832` exhaust |
| `meteor_rock.png` | TITANUS LB | a burning meteor chunk, amber-hot core, falling at ~60° |
| `gatling_tracer.png` | VULCAN N | a short hot tracer streak, orange-white, motion-stretched |
| `micro_missile.png` | VULCAN S | a stubby missile with a red-orange trail, slight upward arc |
| `fang_dagger.png` | VIPER N | a thrown energy dagger, acid green `#5aff2e`, spinning glint |
| `energy_serpent.png` | VIPER LB | a sinuous acid-green serpent of light, mid-slither, mouth open |
| `cannon_shell.png` | RHINO N | a fat glowing shell with a red tracer tail |
| `arc_bolt.png` | TEMPEST N | a jagged lightning bolt segment, electric cyan `#3fd8ff`, white core |
| `storm_cell.png` | TEMPEST S | a compact black-blue thundercloud, lit from inside, cyan underglow |
| `rend_wave.png` | FENRIR N | a crescent claw-wave of torn silver-cyan air, three slash lines |
| `mortar_shell.png` | COLOSSUS N | a high-arc artillery shell, gold band, faint gold trail |
| `sniper_beam.png` | WRAITH N | a hairline scope-red `#ff2030` beam with a bright muzzle bloom |
| `bat_wisp.png` | WRAITH S/LB | a small angular bat silhouette of red-black smoke, glowing eyes |
| `flame_jet.png` | INFERNO N | a horizontal dragon-breath cone, orange core to red edge, crisp tip |
| `napalm_patch.png` | INFERNO S | a low pool of burning ground, licking flames, orange on black |
| `icicle_shard.png` | GLACIER N | a crystalline ice dart, pale blue `#7ce0ff`, faceted glint |
| `ice_wall.png` | GLACIER D | a chest-high slab of rough ice, backlit cyan, cracked face |
| `water_jet.png` | CRANKY N | a pressurised horizontal water stream with spray fringe |
| `geyser_column.png` | CRANKY S | a vertical water column with a droplet crown, blue-white, tall (768px) |
| `tsunami_wall.png` | CRANKY LB | a cresting wave wall, moving left-to-right, foam lip, deep teal body (1024px wide) |
| `quill_feather.png` | SAURION N | a black blade-feather, chrome edge, red sheen |
| `raptor_egg.png` | SAURION LB | a matte-black armoured egg, red seam-glow, big as a crouched mech |
| `slime_glob.png` | FROGGER N | a lime `#aef23c` gel glob mid-flight, wobble deformation, drips |
| `gunk_splat.png` | FROGGER/JERRY | a sticky ground splat of lime gel, stretchy strands |
| `croak_ring.png` | FROGGER LB | a concentric resonance ring, lime-white, distortion fringe |
| `goo_wad.png` | JERRY N | a black-brown bilge glob with red gleam, trailing droplets |
| `shrimp_mine.png` | JERRY S | a tiny coral-pink robo-shrimp, curled, red bead eyes, hopping pose |
| `null_bolt.png` | NULLBOT N | a de-rez bolt: a shard of corrupted pixels, red core, cyan fringe |
| `glitch_shard.png` | NULLBOT status | a small square of display corruption, wrong-colour strobe (3-frame strip welcome) |
| `salvo_rocket.png` | KONGA N | a small shoulder rocket, orange, tight smoke trail |
| `shockwave_arc.png` | KONGA LB | a ground shockwave front: a low dust-and-energy arc, amber |
| `siege_shell.png` | TRITONE N/LB | a heavy cannon shell with orange tracer, slight spin |
| `frill_flare.png` | TRITONE D | a luminous frill fan, olive-orange rim light, spread wide |

## 2 — Status + shared FX — DELIVERED

| file | what |
|---|---|
| `burn_flame.png` | a small clinging flame lick, orange, loopable pair welcome |
| `frost_rime.png` | an ice-crust overlay patch, pale blue crystals, transparent centre |
| `shock_arc.png` | a short crawling electric arc, cyan-white |
| `venom_drip.png` | an acid-green droplet with a small splash |
| `energy_flare.png` | the ENERGY-full HUD flare: a reactor starburst, white-hot core with cyan-magenta bloom |
| `shield_dome.png` | the guard bubble: a hex-tessellated energy dome, cyan, edge-bright — replaces the old smooth bubble |
| `shield_burst.png` | the same dome shattering: hex shards flying, orange break flash |
| `jet_flame.png` | a boost-jet cone for the double-jump burn, blue-white core, loopable pair welcome |
| `ko_burst.png` | the blast-zone KO: a radial neon burst, white core, magenta-cyan petals |

## 3 — Arena hazard effects — DELIVERED

The 12 arenas each get one signature hazard; these are the sprites they need.
Marked ~ where the hazard design may still shift — silhouettes are safe to
generate now, they will be used somewhere even if the mechanic moves.

| file | arena | what |
|---|---|---|
| `ladle_pour.png` | foundry | a tilting crucible pouring molten metal, white-orange stream |
| `magma_gout.png` | volcano | a vertical lava burst with ember spray |
| `ice_floe.png` | frozen | a floating slab of glacial ice, top-lit aurora tint |
| `crane_hook.png` | harbor | a container-crane hook + chain on a swing arc |
| `cargo_container.png` | harbor | a shipping container, corner-lit, cyan signage |
| `monorail_train.png` | neon | a sleek maglev nose with lit windows, motion-blurred, magenta-cyan livery (1024px) |
| `debris_sat.png` | orbital | a tumbling satellite chunk, solar-panel glint |
| `blast_charge.png` | quarry | a mining charge: stacked red sticks, blinking LED, warning ring |
| `vine_whip.png` | jungle | a luminous overgrown cable-vine, teal-green bioglow |
| `spore_cloud.png` | jungle | a drifting puff of glowing spores |
| `magnet_crane.png` | scrapyard | a scrap-magnet disc on a cable, hum glow underneath |
| `car_husk.png` | scrapyard | a crushed car body, rust + neon paint remnant |
| `wind_streak.png` | skyterrace | a horizontal gust ribbon, white-cyan, semi-transparent |
| `billboard_ad.png`~ | uptown | a holographic ad panel, glitching between two frames |
| `drone_taxi.png`~ | uptown | a small passing air-taxi silhouette, lit windows |
| `collapse_dust.png` | ruins | a column-collapse dust bloom, moon-grey with cyan edge |

## 4 — UI garnish — wordmark/vs/stock DELIVERED; the rest are §5

| file | what |
|---|---|
| `wordmark_mech_brawler.png` | OPTIONAL — the title is CSS neon text first; a painted neon-sign wordmark "MECH BRAWLER" (two-line, tube-letter style, cyan+magenta, unlit variant welcome as a pair) upgrades it if it looks better |
| `vs_flash.png` | the VS splash slash: a diagonal neon energy tear |
| `stock_chip.png` | a small mech-head silhouette chip for the stock counter, works at 24px |

## 5 — OPEN requests (the outstanding-art surface)

| file | what |
|---|---|
| `favicon_mech.png` | the site favicons + touch icons (favicon.ico, favicon-16/32, apple-touch-icon, android-chrome-192/512) still carry the old JJK logo mark — a square neon mech-head glyph on `#05070c`, readable at 16px, replaces the whole set |
| `victory_backdrop.jpg` | `assets/backgrounds/victory.jpg` (the results-screen backdrop, 2048×1152) is still the JJK painting — a neon hangar / winner's podium scene in the arena palette replaces it |

## Notes for the generator

- Character cards and arena backgrounds are DONE (intake/cards, intake/arenas).
- Nothing here needs animation frames unless marked "strip/pair welcome" —
  the engine spins, scales and fades single sprites itself.
- The old JJK request docs (asset-requests, audio-requests, their histories,
  and render3d's D-round docs) described a different game and are deleted;
  this file plus docs/music (robotworld's soundtrack, already sourced) is the
  complete outstanding-art surface.

---

## The delivery — what landed, and what is still owed

All 61 plates arrived keyed (RGBA, transparent field) and near-trimmed, which
is why landing them was one pass rather than the JJK base's nine-step sprite
intake. `python3 tools/effects_intake.py --apply` trimmed each plate to its own
alpha, capped the long edge at 1024, and copied it to
`assets/sprites/effects/` (or `assets/ui/` for the three UI plates).

Trimming is the load-bearing step: every drawing gets a hand-tuned `dx`/`dy`
nudge in `src/config_effects.js`, and that nudge should be correcting where the
ART sits, not paying off a hundred pixels of empty plate. A trimmed plate starts
near zero, which is why that file is nearly empty.

### Wired into the game

| what | how |
|---|---|
| **the power effects** | 32 distinct drawings, named by the move that throws them in `src/characters.js` (`sprite` / `sprites` + `spriteH`) across 42 kit slots. Every mech's gun, and most specials and ultimates, now draw their own art instead of a theme-coloured circle. `frost_rime` went to Glacier's Cold Snap rather than to a status, and `shockwave_arc` and `frill_flare` are landed but unassigned — Konga's rampage ultimate and Tritone's counter both paint themselves and read no `p.sprite` |
| **statuses** | `burn_flame` clings to a burning mech and `venom_drip` to a poisoned one (`drawStatusArt`, `src/render.js`) |
| **guard** | `shield_dome` replaces the smooth guard bubble, sized off the shield meter; `shield_burst` plays on a shield break |
| **movement** | `jet_flame` burns under the mech on the air jump — these are jets, not flight |
| **KO** | `ko_burst` on a blast-zone knockout, clamped to the same point as the particles |
| **energy** | `energy_flare` lights behind the inherent-energy bar while the pool is full (CSS, `styles.css`) |
| **3 arena hazards** | `monorail_train` (neon), `ladle_pour` (foundry), `magma_gout` (volcano), drawn OVER the procedural hazard rather than instead of it — the plate gives the hazard a face and the tuned timing survives |
| **3 UI plates** | `wordmark_mech_brawler` replaces the JJK logo on the select screen, `vs_flash` the JJK versus badge, `stock_chip` the stock dots (as a CSS mask, so it still takes each fighter's colour) |

### Delivered, loaded, not yet hung

Thirteen hazard plates are landed, registered and placeable in the workbench,
and their boards still paint themselves. Each is one edit to that hazard's
`draw` in `src/stage_fx.js`, using the `hazardArt` helper the three above use;
the workbench is where the number that edit needs gets decided.

`ice_floe`, `crane_hook`, `cargo_container`, `debris_sat`, `blast_charge`,
`vine_whip`, `spore_cloud`, `magnet_crane`, `car_husk`, `wind_streak`,
`billboard_ad`, `drone_taxi`, `collapse_dust`.

`shock_arc` is the one plate with no home at all: it was requested against an
electric status, and no move in the mech roster applies one. Wiring it would
mean inventing the status rather than drawing it, so it waits for a kit that
wants it.

### What this delivery turned up

- **The `ranged` slot was outside the shared-sprite walk.** K1 moved every
  mech's gun out of `specials.neutral` into its own top-level field, and
  `applySharedSpriteScales` and the workbench registry both still walked only
  `specials` and `ultimate`. Every gun in the game was therefore unsizable and
  reported as unused. Fixed in `src/shared_sprites.js`.
- **`nailstorm` hard-coded `effect:nail`**, a JJK drawing, in the volley it
  spawns — so Tritone's SIEGE PROTOCOL fired cursed-energy nails. It now takes
  `p.volleySprite`, defaulting to `effect:siege_shell`.
- **The select screen was still showing the JJK logo**, alt text and all.
