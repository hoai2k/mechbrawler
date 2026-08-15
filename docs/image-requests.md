# Image requests — MECH BRAWLER

The open list of images to GENERATE for the mech conversion. Everything the
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
