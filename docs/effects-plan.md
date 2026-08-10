# Effects plan — making attacks read as their element

The audit behind this plan: every fighter's specials and ultimate were compared
against what their technique looks like in the anime, and against what the
engine actually draws. The finding, in one sentence: **the engine's structure is
good, but its feedback is element-blind** — a magma burst, a blood lance and a
steel polearm all land as the same theme-coloured circle burst, the single
most-used special type (`dashStrike`, 12 fighters' side specials) draws nothing
but dust, and the show's flashiest effect (Black Flash) is twelve particles.

Every number this plan introduces lives in **`src/config_fx.js`**, in the same
spirit as `config_tuning.js`: safe to edit without reading the consuming code,
nothing load-bearing, the worst a bad value does is look wrong.

## Progress

| Checkpoint | Status | What lands |
|---|---|---|
| **CP1** | **done** | This plan; three bug fixes (Todo's missing BLACK FLASH label, projectile glow fading to hardcoded blue, dead `rainbow_dragon` effect load) |
| **CP2** | **done** | New particle primitives (`flame`, `crackle`, `droplet`, `flutter`, `smoke`, `streak`); `src/fx.js` element recipes; element-aware hit sparks incl. the no-cursed-energy rule for Maki/Toji/Panda; `dashStrike` launch FX + afterimage boost; `src/config_fx.js` |
| **CP3** | **done** | Projectile trails (faded position history) + per-element in-flight emitters (embers off Fuga, droplets off Piercing Blood, feathers off crows…) |
| **CP4** | **done** | Black Flash full treatment (red/black crackle forks, contact flash, red vignette, music duck) + controller rumble (`src/rumble.js`) |
| **CP5** | **done** | Per-character one-offs: Maki's ult, Sukuna's Dismantle lattice, Nanami's 7:3 seam, Todo's swap silhouettes, Gojo's Blue pull / Red disc / Infinity shimmer, Yuta's heal motes, Nobara's glowing marks, Inumaki's neutral arcs, Mahito's soul ripple, Choso's boom cone, Mei Mei's feathers, Yuji's first-hit thud, Gakuganji's clipped aura |
| **CP6** | **done** | Channel-loop SFX wiring; element/signature SFX round requested, delivered and wired in (`docs/audio-requests-history.md`, Round 9) |

Each checkpoint merges to `main` on its own, so the game is playable at every
row of that table.

## The audit, in brief

### Engine-level findings

1. **`dashStrike` spawns `dust(10)` and nothing else** (`specials.js`) — it does
   not even read `p.color`. Twelve side specials share it: Hakari, Maki, Panda,
   Todo, Momo, Nanami, Toji, Sukuna, Mahito, Mei Mei, Uro, Yuji.
2. **Hit sparks are element-blind** (`combat.js` presentation block): every
   connect is a theme-colour `burst` + white `sparkLine` regardless of what hit.
   This also breaks a canon rule — **Maki, Toji and Panda have no cursed
   energy**, and their hits must read as steel/impact, not as an energy burst.
3. **The particle system has five primitives, all additive falling circles.**
   The roster's elements need rising flames, jagged crackle forks, glossy
   droplets, fluttering feathers/petals/paper, non-additive smoke, and
   velocity-aligned streaks.
4. **Projectiles have no trails** — fighters get afterimages, projectiles are a
   lone sprite with a shadow-blur.
5. **Black Flash** (Yuji's passive, two crit finishers) is a 12-particle
   sparkline. Canon: crimson core, black lightning fractures, space distortion,
   the world desaturating for a beat.
6. **Channelled states are visually silent** — Yuta's RCT heal is one ring for
   a 1.4 s channel; counter stances, Momo's updraft and smash charges hold
   almost nothing.

### Canon visual language (per element)

| Element | Palette / shape | Who |
|---|---|---|
| fire | white→orange→deep red, rising, ash smoke | Jogo (whole kit), Sukuna's Fuga, burn status |
| blood | glossy near-black crimson, heavy droplets | Choso, Sukuna's Cleave, bleed status |
| steel | white/grey glints and speed-line streaks, dust, **no glow** | Maki, Toji, Panda, Nanami's blade |
| wind | near-colourless pale green-white crescents, debris | Momo |
| sound | concentric rings, distortion, amber for Gakuganji | Inumaki, Gakuganji |
| shadow | matte black pools, indigo-violet | Megumi |
| soul | cold grey-lilac ripples | Mahito |
| energy | per-character CE colour (the default) | everyone else |

Named CE colours the anime establishes: Gojo ice-blue/white, Yuta pale
blue-white, Sukuna crimson-black, Mahito grey-lilac, Geto purple-black, Megumi
indigo-violet, Nobara warm red-orange, Yuji faint dark blue-grey. Everyone else
reads as the generic smoky black-indigo, which the theme colours already
approximate.

## What each checkpoint does

### CP1 — bugs

- `characters.js`: Todo's ult declares `label: "BLACK FLASH"` but not
  `crit`/`critLabel`, and the flurry director only prints the finisher label
  from `p.crit` — so his advertised Black Flash finisher never appears. (In the
  flurry director `p.crit` is presentation-only; no damage change.)
- `render.js`: the procedural projectile fallback fades to a hardcoded
  `rgba(80,120,255,0)` — blue — whatever `p.color` is.
- `assets.js`: `rainbow_dragon` sits in `EFFECT_KEYS` (a required load) but
  nothing references `effect:rainbow_dragon`; Geto's dragon is
  `summon:rainbow_dragon`. The file stays on disk; the dead mandatory fetch
  goes.

### CP2 — the element system

New primitives in `particles.js`, generalising the particle record rather than
adding parallel arrays: a particle may carry `ramp` (colour-over-life),
`additive: false`, `shape: "streak" | "fork"`, `buoyancy` (negative effective
gravity), `wobble` (sinusoidal drift), `grow` (size growth instead of decay).

`src/fx.js` owns the **element recipes**: `hitFx(element, x, y, dir, power)`
called from the `applyHit` presentation block instead of the flat
burst+sparkLine, and small helpers the later checkpoints share. Which element a
hit uses resolves as: the move's own `fxElement` → the character's `fxElement`
(new field in `characters.js`) → `"energy"` (exactly today's look). Recipes and
all their counts/colours live in `config_fx.js`.

`dashStrike` gains a launch burst of velocity-aligned streaks in `p.color`
(steel-coloured for the no-CE trio) and a temporary afterimage boost
(`f.fxTrailT`, read by `trailStrength` in `motion.js`).

### CP3 — projectile trails and emitters

Each projectile keeps a short position history drawn as a faded trail behind
the sprite, and an element emitter sheds particles in flight: embers off
`fuga`/`ember`, droplets off `piercing_blood`/`blood_orb`, black feathers off
`crow`, wind streaks off `wind_scythe`, motes off Geto's curses. Trail length,
alpha and per-element emit rates in `config_fx.js`; `fxElement` tags go on the
relevant special/ult params in `characters.js`.

### CP4 — Black Flash and rumble

Black Flash (the passive proc in `combat.js`, and the two crit finishers): red
and black `crackle` forks from the contact point, a one-frame white contact
flash, a dark-red vignette overlay (~0.25 s, drawn in `render.js`, state on
`state.vignette`), and a music duck for the beat (`audio.js`). The two crit
finishers reuse the vignette at lower strength.

`src/rumble.js`: `rumblePad(player, strong, weak, ms)` on top of the Gamepad
API's `vibrationActuator` (feature-detected, no-op where unsupported), rumbling
**only the affected player's pad**. Wired to: being hit (scaled from the same
values hitlag uses), landing a hit (weaker echo), shield break, parry, launch,
KO, Black Flash (double pulse), the ult cinematic, and the big impacts (meteor,
sedan). Master toggle and per-event magnitudes in `config_fx.js`.

### CP5 — per-character one-offs

The table from the audit: each is a small, local change in `specials.js`,
`ultimates.js`, `combat.js` or `render.js`, reading its numbers from
`config_fx.js` where there is anything worth tuning. The no-CE rule shapes
Maki's ultimate: speed-lines, dust shockwave and doubled afterimages — power as
absence of glow.

Two audit items resolved themselves in CP2 and are not separate changes here:
Mahito's soul ripple is his `fxElement: "soul"` hit recipe, and Yuji's
Divergent Fist first hit already sparks through the normal hit path — the echo
carrying the louder burst is the intended read. Three installs that had no
aura art (Maki, Panda's Gorilla Mode, Yuji's Grit) now point at
`aura_jade` / `aura_slate` / `aura_indigo`, shipped as procedural placeholders
and requested properly — as round 12D at the time, carried over to **13E**
when round 12 closed with its three sprite parts delivered.

### CP6 — sound

Code: channelled states get quiet loops from existing files (`energyCharge`),
Black Flash's duck lands with CP4. Assets: a round of its own, since delivered
and recorded in `docs/audio-requests-history.md` (Round 9) — an element layer
keyed to the same `fxElement` field (`hit_fire`, `hit_blood`, `hit_steel`,
`hit_wind`, `hit_sound`, `hit_shadow`, `hit_soul`; the names here were the
working ones, not the delivered ones), and the signature one-shots (Todo's clap,
Gakuganji's real power chord, crow caws, paper rustle, Mahito's wet reshape,
Nanami's glass-crack seam).

## Non-goals

- No gameplay changes: nothing here alters hitboxes, damage, knockback or
  timings. `p.crit` on Todo's ult is presentation-only in the flurry director.
- No new required art. Everything draws with code and existing sprites; new
  audio is requested through the normal pipeline, and the game sounds the same
  until it lands.
- Distortion/refraction shaders (canon Infinity, Uro) are out of scope for a
  2D canvas renderer at 60 fps; approximations use shimmer rings and particles.
