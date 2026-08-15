# The roster — why each mech's kit is the way it is

The design source of truth for MECH BRAWLER's 17 fighters. Every kit here is
seeded from what that mech IS in Mech Mayhem — its real stats, its real moves
with their real numbers, its capability flags, and the design-intent comments
in robotworld's roster — then REBUILT for a platform fighter. Mech Mayhem is a
3D arena game: it has crosshair aiming, ammo crates, stamina sprinting and
free-roam hover. None of those survive contact with a 2.5D stage and a stock
count. What survives is each mech's IDENTITY: titanus still moves people like
nobody else, cranky is still a wall with the best guard in the game, jerry
still owns the air, and nullbot still corrupts you one hit at a time.

Numbers in *(parentheses)* cite the Mech Mayhem source values the design is
derived from. Implementation status lives in docs/mech-conversion-plan.md, not
here — this document says what SHOULD be true.

---

## The shared systems

### Energy, and the Ultimate

The meter is **ENERGY** — the reactor bar under each health readout. It fills
the way the meter always has in this engine: landing hits, eating hits, a
small trickle for aggression. **A full bar unlocks the ULTIMATE, on LB**, and
spends all of it. Ultimates play the role Domain Expansions did: the cinematic
centrepiece you build a stock around, announced with a banner, big enough to
change the arena while it runs. There is no second full-bar option — the
domain/ultimate choice collapses into one button, one decision: WHEN.

*(Mech Mayhem earns ults from golden fountains scattered around its open
arenas. A pickup hunt is the wrong economy for a stage two screens wide — the
JJK meter economy stays, renamed. The fountain's one good idea — that an ult
is a scheduled event both players can see coming — survives in the full-bar
glow on the HUD.)*

### Summons are ultimates, and they come in small numbers

Where a Mech Mayhem ult spawned a horde *(fenrir's WILD HUNT: 20 wolves;
jerry's FLEA CIRCUS: 20 copies; rhino's STAMPEDE: 10)*, the brawler version
spawns **2-4** — each one bigger, more legible, and worth tracking. A platform
fighter's screen is small and every body on it must be readable as a threat.

### The air game: jets, not flights

Every mech gets one air jump. For the light frames it is a **JET BURN** — the
same input, a different feel: a sustained half-second of thrust with boost
flare from the rig's own `boost` anchors, a shallower arc, and steering
during the burn. Heavier frames get a plain mechanical hop, and past weight
0.8 *(titanus, colossus, rhino, glacier, cranky, konga, tritone)* the
somersault animation is a stiff TUCK rather than a spin, exactly as Mech
Mayhem stages it. Flight is a double-jump with a different feel — never free
flight.

Jet duration/feel scales with the MM weight stat *(hover fuel = 1.5 +
(1−weight)×1.9s upstream — viper burns longest, the 1.0-weight slabs barely
lift)*.

### The plunge

Mech Mayhem's aerial heavy is a PLUNGE: force downward, detonate on landing,
fall speed feeds the damage. That becomes the shared **air down-heavy** for
the whole roster — every mech has a committed fastfall bomb, priced by their
weight. It replaces nothing; it is the answer to "what does a 9-metre robot
do in the air": come down.

### Charge heavies

Side heavies charge, as smashes always have. **TITANUS and COLOSSUS charge
everything** — their light strings are hold-to-release haymakers too
*(punchHold/heavyHold, the only two mechs with the capability)*, they may
WALK while charging the light, and their charge glow runs up the arms
(`chargeGlow: 'arms'`). Nobody else charges lights. This is the whole
heavyweight identity: you can see the hit coming and it still works.

### Statuses

The status set, each introduced by exactly one mech and reused by arenas:

| status | source mech | effect |
|---|---|---|
| **BURN** | inferno | damage over time, ~3s (*combo finisher only: 18 over 3s*) |
| **GLITCH** | nullbot | stacking corruption; at 6 stacks a 1.2s CRASH stun, then the count clears |
| **FROST** | glacier | movement + fall-speed slow (*slow 0.45*), visible ice rime |
| **SHOCK** | tempest | brief hitstun extension, arc FX |
| **GUNK** | frogger, jerry | the waterlog movement tax this engine already has, recoloured — heavier jumps, slower dashes |
| **VENOM** | viper (ult only) | damage over time + a beat of paralysis on application |

### Guards, and the one mech who breaks them

Shields work as they always have. Per-mech shield strength comes from MM's
`blockMult` (0.04-0.20): **cranky's guard is the best in the game
(0.04)** and viper/wraith share the worst (0.20). **SAURION is the only
guard-breaker** *(guardBreak 0.6, spent by his pounce)* — his Sickle Pounce
shatters a raised shield. That is roster-defining and stays unique.

### Weight, plating and size

MM's three durability numbers (hp 780-1320, armor 0-0.26, weight 0.3-1.0)
fold into this engine's **weight** (launch resistance), with the top plate
(armor ≥ 0.18: titanus, colossus, cranky, glacier, rhino, tritone) also
flinch-proof against jabs while walking. Relative sizing is REAL: heights come
from the export's measured geometry *(saurion 5.41 units, the shortest, to
jerry 8.14, the tallest)*, compressed by the engine's existing height curve so
the ordering reads without the extremes breaking hurtboxes.

---

## The kits

Format per mech: identity · frame · then the moves. **N/S/D** = special
neutral/side/down on B. **LB** = ultimate at full energy. The MM ranged weapon
almost always becomes N — it is the signature gun, and a gun wants the neutral
slot. Light strings, tilts, aerials and dash attacks are listed only where
they carry identity; the shared framework (jab chain, side/up/down tilt,
aerials) covers the rest.

---

### TITANUS — The Iron Avalanche 👊
*Slow as a glacier, hits like the end of the world.* Brass-gold `#bd9226`,
glow `#ffa832`. The heaviest tier: weight 1.0, armor plate, worst air game.
Power 10 / Speed 3 / Defense 9.

- **Light string** — hold-to-charge haymakers *(punchHold, dmg 46/50/68,
  knock 16/18/30 — triple the roster's light knockback)*. He may walk while
  winding up; release lunges him a half-step through the blow. The jab that
  out-reaches other mechs' heavies.
- **Side heavy** — the overhead POUND *(105 dmg, knock 38)*, chargeable to
  2.4s, arms glowing as it banks.
- **N — Rocket Fist** *(dmg 55, speed 46, cd 2.4)*: the fist leaves as REAL
  geometry from the muzzle anchor and re-docks. Two fists; firing both puts
  the gun on a long recover while they fly home. His only projectile, and it
  hits like a truck.
- **S — Skyline Slam** *(grabThrow: dmg 88, throw 32)*: command grab. Seize,
  hoist clean overhead, HURL flat across the arena — a kill throw at the edge.
- **D — Bulwark Stomp**: a short ground quake around him, knock-up, armored
  during. The answer to being crowded.
- **LB — METEOR BREAKER** *(dmg 62×14, radius 16)*: reaches to the sky and a
  meteor shower hammers the zone in front, each rock leaving the ground
  burning. `meteor` director.
- **Passive — Siege Plating**: no flinch from jabs while charging anything.

### VULCAN — The Lead Storm 🔫
*Believes every problem is insufficient ammunition.* Bone-white `#cfc9bd`,
oxide red, orange visor. Mid frame, wide chest, short arms — the worst melee
reach *(2.9)* buys the best trigger discipline. Power 7 / Speed 5 / Defense 5.

- **N — Gatling Burst** *(dmg 9/round, projectile speed 90, the fastest)*: a
  held spray — a stream of tracer while B is down, barrels visibly spinning
  up, swapping arms every couple of seconds *(channelSwap 2)*. Chips, pushes,
  never kills: it exists to make you approach.
- **S — Micro-Missile Volley** *(dmg 22×6, homing)*: both shoulder pods
  ripple-fire six seekers that arc onto the target.
- **D — Flak Fan**: an upward spread burst — his anti-air, ugly to jump into.
- **Side heavy** — a two-handed barrel club: he swings the guns because they
  are the heaviest thing he owns.
- **LB — BULLET HURRICANE** *(dmg 2.6×100 over 9s)*: a hundred rounds spiral
  out and FALL INTO ORBIT around him — a storm of lead that rides along as he
  moves and folds onto whoever strays close. `vortex` director; the orbit
  inherits his spin, so the last rounds fling out fast.
- **Passive — Spin-Up**: consecutive Gatling seconds tighten its spread.

### VIPER — The Whispering Fang 🗡️
*Strikes from angles geometry teachers refuse to acknowledge.* Violet
`#4a3566`, acid-green glow `#5aff2e`. The glass cannon: fastest *(13.5)*,
lightest *(0.3)*, zero armor, worst guard. Fences side-on, digitigrade.
Power 6 / Speed 10 / Defense 2.

- **Light string** — sword forms off the forearm energy daggers
  *(viperSlash1/2, viperStab)* — never a punch that happens to hold a sword.
  Lowest knockback in the game; her strings are for opening, not ending.
- **Side heavy** — the CORKSCREW DRILL *(viperDrill: coil, then fly flat with
  both blades speared forward, barrel-rolling through the target)*. Her kill
  move, and a horizontal recovery in a pinch.
- **N — Fang Throw** *(dmg 32, cd 0.8)*: a thrown forearm dagger — the blade
  visibly leaves her arm and regrows *(REGROW 0.18s + 0.5s)*. Fast, flat,
  spammable.
- **S — Blade Cyclone** *(dmg 20 multi-hit)*: the IG-11 special — legs keep
  WALKING while everything above the waist spins free, a striding whirlwind
  that saws through whatever it overlaps.
- **D — Phantom Step**: a blink through the opponent to their far side with a
  backstab window on arrival. `shadowPort` handler.
- **LB — SERPENT STORM** *(paralyze 2.4, venom 8×3s)*: she coils, springs
  skyward, and the brood leaps out — a fan of energy serpents floods the
  stage floor; the first fang PINS, the rest pile on. VENOM + a beat of
  paralysis.
- **Passive — Assassin's Read**: +15% damage striking from behind.

### RHINO — The Unstoppable Object 🐂
*One horn. One direction. Zero brakes.* Grey steel `#5c6066`, rust, hot-red
glow. Heavy bruiser with the second-best guard *(blockMult 0.05)*.
Power 9 / Speed 4 / Defense 7.

- **Side heavy** — the horn, planted through a half-step brace
  *(chargeLean)*. Launches at 24 knock.
- **N — Shoulder Cannon** *(dmg 56, splash 3, cd 1.3)*: a hand cannon per
  fist, alternating. Slow shells with real splash — a mid-range poke.
- **S — BULL RUSH** *(dmg 75, knock 26, held up to ~2s)*: drops to all fours
  and GALLOPS while B is held — frame pitched hard over the horn, fists
  pumping. Ends the moment it connects: one clean launch. Cornering is bad on
  purpose; it is a lane, not a homing missile.
- **D — Bring a Wall**: a counter-brace. If struck during the window he
  shoulder-checks through the attacker *("bring a wall that works")*.
- **LB — STAMPEDE** *(dmg 70, knock 26)*: THREE of him, shoulder to shoulder
  *(capped from MM's ten)*, thunder across the whole stage floor — a wall of
  rhino that must be jumped, not blocked. `rampage` director.
- **Passive — Plated**: no flinch from jabs while walking.

### TEMPEST — The Voltage Virtuoso ⚡
*Every battle is a concert; the crowd is usually on fire.* Deep blue
`#2a3560`, electric cyan `#3fd8ff`. Fast, fragile showman; sparks crawl
between his stacks at rest *(arcTaunt, stackFx)*.
Power 7 / Speed 8 / Defense 3.

- **Side heavy** — the TRAVELLING TORNADO *(tempestTornado: dmg 42 per beat
  ×2, real forward drive while whirling, arms out)*. A heavy that moves —
  his approach and his kill move in one.
- **N — Arc Bolt** *(dmg 40, chains 8 units)*: lightning that JUMPS — hits
  its mark and chains to a nearby second body. Doubles teams; punishes
  clustering.
- **S — Static Overload** *(dmg 70, radius 8)*: places a storm cell a short
  way ahead — cloud gathers, then bolts hammer DOWN into the zone. A trap you
  herd people into.
- **D — Feedback Coil**: an electric counter — the riposte is a point-blank
  discharge with SHOCK.
- **LB — THUNDERFALL** *(dmg 13, radius 26, 3.4s)*: the sky goes dark over
  most of the stage and the weather ANSWERS — bolts hammer everyone caught in
  the gloom. `tempest` director (yes, it was already named that).
- **Passive — Grounded Rod**: energy gain +25% while a foe is in SHOCK.

### FENRIR — The Last Wild Thing 🐺
*Runs with no pack, answers to no handler.* Silver `#b4b9c0`, moon-cyan glow.
A digitigrade runner that drops to all fours at speed *(quad gait)* — his run
animation IS the gallop. Power 7 / Speed 9 / Defense 3.

- **Side heavy** — the SPIKE LEAP *(fenrirSpike: leap first, the spiked mane
  flares DURING flight, peaking exactly at impact)*.
- **N — Rend Wave** *(dmg 36, cd 1.0)*: a crescent of torn air off the claws
  — his poke, medium speed, good arc.
- **S — Lunar Pounce** *(dmg 65, leap 14, cd shortest in MM at 5.5)*: a flat
  predator's lunge — fast, low, the gap-closer the rest of the kit hunts
  behind.
- **D — Howl**: a rallying cry — brief self speed-up, and nearby foes get a
  flinch of hesitation. The pack answers: +energy per foe caught in it.
- **LB — WILD HUNT** *(4.5s per wolf)*: rifts tear open and THREE pack-mates
  pour out *(capped from twenty)*, each running down the nearest enemy; a
  wolf that lands its bite is satisfied and leaves. `summon` director.
- **Passive — Predator's Rhythm**: landing a dash attack refunds half the
  dash and a tick of energy.

### COLOSSUS — The Patient Thunder 💣
*Plays the long game: every shell placed three moves ahead.* Sand `#a08a64`,
gold glow. The other charge heavyweight — titanus' doctrine with artillery
patience. Slowest but cranky. Power 9 / Speed 2 / Defense 9.

- **Light string / heavies** — the titanus charge contract *(punchHold +
  heavyHold, same clips, dmg 42/46/62 and 100)*; his GLB stages the pound as
  a thunderclap, which reads even better in profile.
- **N — Mortar Lob** *(dmg 68 — the biggest single shell, splash 5.5, cd
  1.7)*: a high arcing shell that lands where you are ABOUT to be. The
  slowest, meanest projectile in the game.
- **S — Skyline Toss** *(grabThrow: dmg 85, throw 36)*: the command grab,
  thrown UP-and-out — his sets up his own mortar.
- **D — Bunker Down**: plants; heavy armor and a shield-strength boost for a
  beat. The patient answer to pressure.
- **LB — COLOSSAL FORM** *(scale ×4 upstream, ×2.2 here, 9s)*: no shell this
  time — HE is the ordnance. He grows and simply WALKS THROUGH the fight,
  flattening what he steps on. `install` director with a scale term.
- **Passive — Siege Plating**: as titanus.

### WRAITH — The Hollow Echo 🎯
*Officially, you are perfectly safe.* Near-black `#232228`, scope-red glow.
Zero armor, worst guard, shortest melee reach — everything is spent on the
rifle and the theatre. Power 8 / Speed 7 / Defense 2.

- **Side heavy** — WING LASERS *(wraithLasers: the tattered cloak fans open
  into a wing-wall, then the tips fire)*. A heavy that is half projectile.
- **N — Sniper Round**: a charged piercing shot down the rifle line — slow to
  aim, flat, hits through bodies. Hold to steady; the laser sight is the
  telegraph. *(His MM bats move to S.)*
- **S — Night Swarm** *(dmg 26×3, slow)*: three bats that drift and home
  lazily — screen control while he lines up the rifle.
- **D — Ghost Protocol** *(dmg 60, 5s upstream)*: projects a white spectre
  that glides forward hurting what it passes through; RELEASE teleports him
  INTO it. The mind-game button — `shadowPort` with a payload.
- **LB — DEATH SWARM** *(7s)*: his taunt, cashed in — he looms to 1.6×, the
  giant peels off as a fading shell, and the flock becomes a REAL gyre that
  wheels around him and takes turns STOOPING on whoever he hates. `vortex`
  director + the grow-and-peel cinematic.
- **Passive — 800 Metres**: Sniper Round damage grows with distance flown.

### INFERNO — The Joyful Furnace 🔥
*Finds fire genuinely hilarious.* Scorched red `#8a3626`, flame-orange glow.
Mid-heavy brawler whose burners never stop venting *(stackFx: four live
burners — two chimneys, two hand torches)*. Power 8 / Speed 4 / Defense 6.

- **Light string** — torch-hand combos; **the finisher SETS YOU ALIGHT**
  *(burn 18 over 3s, finisher only — a reward for landing the whole string)*.
- **N — Dragon's Breath** *(dmg 6.5/tick, range 16 — a long narrow jet)*:
  held flame. The cone is a wall; walking into it is the mistake.
- **S — Napalm Carpet** *(dmg 14, 4 patches, 5s)*: lobbed patches of burning
  ground — stage control that stays.
- **D — Vent Burst**: dumps the burners straight down — a point-blank fire
  nova that pops him a half-jump up. Recovery and get-off-me in one.
- **LB — FIRE TORNADO** *(dmg 130 total, 7s)*: conjures a WANDERING fire
  funnel that hunts the nearest enemy, growing as it goes; whoever it
  catches rides it into the sky. `vortex` director, mobile.
- **Passive — Slow Burn**: BURN he applies ticks 30% longer.

### GLACIER — The Cold Shoulder ❄️
*Devastating in combat, insufferable at parties.* Pale ice-blue `#9fb2c2`,
glow `#7ce0ff`. Heavy zoner; ice-lance in the LEFT hand *(fires from the
mirrored clip — the barrage leaves the weapon, not the empty claw)*.
Power 8 / Speed 3 / Defense 8.

- **N — Icicle Barrage** *(dmg 13×6, speed 48, cd 1.15)*: a fan of shards
  off the lance. His main conversation.
- **S — Cryo Beam** *(dmg 12, slow 0.45, 1.8s)*: a held beam that FROSTS —
  the slow is the payload; a frosted foe can't escape the next barrage.
- **D — Ice Wall**: raises a pillar of ice ahead — blocks projectiles, bodies
  and recoveries; shatters after a few hits. The zoner's architecture.
- **Side heavy** — the lance, planted: a two-handed frozen spike with tipper
  geometry.
- **LB — ABSOLUTE ZERO** *(dmg 9, radius 14)*: flash-freezes the stage floor
  around him white; everyone else on the sheet frosts over, takes cold
  damage, and SKATES — traction gone, drifting helplessly on the glass.
  `eruption` director + a floor-state the arena keeps for the duration.
- **Passive — Cold Shoulder**: melee attackers who hit his shield take a
  stack of FROST.

### CRANKY — The Abyssal Bulwark 🦀
*Shell first, questions never.* Rust-orange shell `#a64a28`, blue-steel
cannons, quad blue eyes. Hexapod crab: slowest mech alive *(5.4)*, highest
armor, **the best guard in the game** *(blockMult 0.04)*, and the longest
pincers *(reach 4.6/4.7 — the reach-over-legs identity is explicit upstream:
"if he needs help it is his REACH that wants it, not his legs")*.
Power 8 / Speed 3 / Defense 10.

- **Light string** — pincer strikes at outrageous range; the pincers gape
  through the wind-up and SNAP at the hit.
- **Side heavy** — the PINCER CLAP *(clawSnap, dmg 100)* — he steps INTO it
  *(heavyDrive: the clap's travel is lateral, so the step is what brings the
  claws to you)*.
- **N — Hydro Hose** *(dmg 7/tick, range 20)*: held water pressure — less a
  gun than a push. Shoves bodies off platforms and stuffs approaches.
- **S — Geyser** *(dmg 62, launch 15, cd 7)*: a bubbling patch telegraphs
  UNDER the target, then a water column ERUPTS — his anti-air lives in the
  floor, evadable on reaction.
- **D — Shell Up**: full counter. The best guard in the game, weaponised —
  reflects projectiles during the window.
- **LB — TSUNAMI** *(dmg 135, width 30)*: the sea answers — a wall of water
  rises behind him and rolls the full stage length. Jump it or ride it into
  the blast zone. `beam` director, horizontal.
- **Passive — Hard Shell + Top-Heavy**: shield takes 45% less damage — but a
  big enough launch flips him ONTO HIS BACK *(rollover)*, a longer knockdown
  than anyone else's. The one crack in the wall.

### SAURION — The Apex Prototype 🦖
*It ate the lab, filed itself as CEO, and went hunting.* Gunmetal-black
`#33343a`, red-eye glow `#ff2418`. The shortest mech *(5.41 units)*, second
fastest, fights with his FEET. Power 7 / Speed 10 / Defense 3.

- **Light string** — sickle toe-claw KICKS *(saurionKick1/2 + claw rakes)*.
- **Side heavy** — the lunging BITE *(saurionBite: coils onto his haunches
  and springs the whole frame forward, dmg 80)*.
- **N — Quill Fan** *(dmg 20×3, spread)*: a fan of black blade-feathers off
  both forearms. His own plumage — the fastest-recovering projectile here.
- **S — SICKLE POUNCE** *(dmg 62 + bleed, the longest leap in MM at 22)*:
  the bird-of-prey kill-leap — and **the only shield-breaker in the game**
  *(guardBreak 0.6)*. Land ON TOP of them and he latches — perched, feet
  clamped, hammering pecks *(biteLatch)* — land on dirt and it is just a
  crouch. High risk, roster-defining reward.
- **D — Tail Lash**: a low sweeping trip around him — the get-off-me his
  pounce-first gameplan needs.
- **LB — RAPTOR PACK** *(3 eggs, 18s)*: he LAYS A CLUTCH — three eggs warp
  in, roll like the heavy shells they are, and HATCH one at a time into
  pack-mates. **The eggs are counterplay: the enemy can break one before it
  opens, and saurion can kick one out of danger.** `summon` director with the
  egg staging kept — it is the best idea in the upstream ult.
- **Passive — Predator's Break**: the pounce's shield-shatter, plus +10%
  damage against launched foes.

### FROGGER — The Gunk Gladiator 🐸
*Jumps like gravity is a suggestion, lands like a lawsuit.* Lime `#7cb420`,
glow `#aef23c`. Four-armed bounce-frame: second-highest jump *(19)*, full
frog squat crouch *(duck 1.0 — the deepest in the game)*.
Power 6 / Speed 8 / Defense 5.

- **Movement** — the crouch is nearly a disappearance; his crouch hurtbox is
  the smallest on the roster. Airborne, the cannon-arms sweep back like a
  diving frog's legs.
- **N — Slime Slinger** *(dmg 38, splash, GUNK)*: a lobbed glob; splash
  gunks — heavier jumps, slower dashes.
- **S — Quad Gunk Barrage** *(dmg 24×5, radius 8)*: all four guns lob a
  sticky mortar carpet at once.
- **D — Spring Coil**: crouch-charge a SUPER LEAP — release for a towering
  jump with a damaging landing splash. Charge feeds height; his recovery and
  his mixup.
- **Side heavy** — a four-armed double clap, all cannons punching forward.
- **LB — SONIC CROAK** *(dmg 140 — the single biggest ult hit in MM, radius
  30, paralyze 2.2)*: jaw drops open and the CROAK comes out — a resonant
  blast that locks every nearby servo solid, then tears the stored resonance
  loose all at once. `shout` director.
- **Passive — Low Profile**: crouching under things is a lifestyle; crouch
  transitions are 30% faster.

### JERRY — The Tide-Bringer 🦐
*A colony pretending to be a mech.* Coral-pink `#b9816b`, red bead eyes. The
TALLEST frame *(8.14 units)* on grasshopper legs: **jump 30, the highest in
the game by a clear margin**, with a visible crouch-windup *(jumpWindup
0.18s)*. An arthropod that walks on the WORLD upstream *(climb)* — here that
becomes the roster's best wall game. Power 6 / Speed 8 / Defense 4.

- **Movement** — the spring: a windup, then a leap that clears the top
  platform from a standstill. `tuckOnly` in the air — the big shell curls,
  never cartwheels. **Wall-cling**: he may cling to stage walls for a beat
  and wall-jump — the climber, translated.
- **Light string** — overhand claw RAKES *(jerryRakeR/L/2: chamber over the
  shell, slam down-and-forward; the third brings BOTH claws down)*.
- **Side heavy** — the BARRAGE *(jerryBarrage: eight fast strikes that
  pummel IN PLACE — knock 3, launch 0, deliberately)*: the anti-launch
  heavy; damage without the mercy of distance.
- **N — Bilge Spit** *(dmg 18, GUNK, ticks)*: a lead glob with trailing
  wads — long range, gunks on hit.
- **S — Brine Swarm** *(dmg 26)*: coughs up three hopping shrimp-mines that
  bounce forward and pop on contact. Projectiles, not minions.
- **D — Anchor Drop**: airborne slam straight down (his plunge, available
  early); grounded, a low claw sweep.
- **LB — FLEA CIRCUS** *(6s)*: FOUR of him *(capped from twenty)* spring off
  and RICOCHET around the stage like fleas, biting whatever they land on,
  while the real jerry keeps fighting. `summon` director, chaos flavour.
- **Passive — Colony**: the swarm feeds back — each mine or flea hit banks
  bonus energy *(the upstream flea-trickle vestige, made a feature)*.

### NULLBOT — The Fatal Exception 👾
*Where it walks, textures tear and the scoreboard reads NaN.* Void-black
`#17131e`, twin red eyes, cyan corruption `#27f6ff`. Tall and lean; the
punches look ordinary — **the impacts corrupt**.
Power 8 / Speed 7 / Defense 4.

- **THE GLITCH STACK (passive)** — every landed hit applies GLITCH. **At 6
  stacks the victim CRASHES: 1.2s engulfed in corruption, stunned**, then
  the count clears. The whole kit is stack delivery *(upstream: 10 stacks,
  3s crash — tuned down for a faster game)*.
- **Side heavy** — the BACKHAND *(nullBackhand: dmg 84, knock 30 — a
  contemptuous one-hand dismissal with real kill power)*.
- **N — Null Pointer** *(dmg 30, cd 0.75)*: a de-rez bolt off either claw.
  Applies GLITCH — the ranged stack-builder.
- **S — SEGFAULT** *(dmg 55, dash 14)*: he de-rezzes into a smear of
  corrupted frames and tears THROUGH everything on the line — a pass-through
  dash that glitches everyone it intersects.
- **D — Stack Overflow**: detonates all GLITCH stacks on nearby foes for
  burst damage — cashing out early instead of waiting for the crash.
- **LB — SYSTEM CRASH** *(7s)*: the ARENA stops rendering right — ground,
  sky and billboards re-decode in wrong-colour streaks, and every so often
  the floor FAILS under an opponent: they drop through the world and re-enter
  from the sky, hard. `eruption` director + a stage-wide visual state.
- **Passive** — the glitch stack, above.

### KONGA — The Silverback Siege 🦍
*"You brought armor. I brought both arms."* Dark fur `#33302e`, orange
ordnance. Knuckle-walker: **the longest real reach on the roster** *(measured
limb extension 4.43)* on the shortest legs. One of two mechs with a real
FACE — it bellows on the big hits. Power 10 / Speed 5 / Defense 7.

- **Light string** — ape haymakers *(bigPunch1/2 + light3 — his exclusive
  clips)*, enormous arcs.
- **Side heavy** — the two-fisted OVERHEAD DRIVE *(kongaSlam, dmg 98, launch
  10, quake FX)*.
- **N — Shoulder Salvo** *(dmg 13×6, splash)*: both pods empty in a ripple —
  a rolling barrage that exists mainly to make you walk into the fists.
- **S — SKULL DRIVER** *(dmg 96)*: the piledriver. One hand by the head for
  anyone he can palm — the body hangs INVERTED and the head is what lands —
  both hands for a peer. Either way they finish on their back: the long
  knockdown. `commandGrab`.
- **D — War Drums**: drums the chest — a shockwave pulse at his feet and a
  tick of energy per beat. Hold to keep drumming; he may WALK while
  drumming.
- **LB — APEX POUND** *(10s, wave speed 30)*: the hunt. He drums and WALKS —
  the only mobile ultimate — and every beat sends a SHOCKWAVE through the
  floor. Standing bodies get swept; **airborne bodies are simply missed —
  jump the wave, that is the counterplay**. A fist landing on someone already
  down hits for triple *(slamDmg)*: the wave is not the damage, it is the
  setup. *"Running away from an ape with long arms only works while you are
  on your feet."* `rampage` director.
- **Passive — Long Arms + Climber**: the reach is real (metrics), and he
  wall-clings/wall-jumps like jerry — an ape hangs, head up.

### TRITONE — The Walking Siege 🦕
*Three horns, two cannons, one direction.* Olive-drab `#62684a`, orange
glow. Ceratopsian quadruped: highest hp in MM *(1320)*, lowest jump, cannot
really be moved — **the highest launch resistance in the game**. His toss has
MM's highest launch *(13)*. Power 9 / Speed 4 / Defense 9.

- **Light string** — gore jabs with the head *(tritoneGore/GoreL — the neck
  aims the horns, never the chassis)*, the second-longest light reach.
- **Side heavy** — the TOSS *(tritoneToss: horns catch and throw UP, launch
  13 — the game's biggest vertical launch)*: his kill move is a launcher,
  and his up-heavy is the same animal.
- **N — Flank Cannons** *(dmg 42, speed 62, splash)*: both cannons traverse
  for a visible half-beat, then fire together. The aim delay is the tell;
  the shells are the fastest heavy ordnance in the game.
- **S — GORE CHARGE** *(dmg 88, launch 12, HELD)*: head down, frill planted,
  and he RUNS while B is held — steering badly on purpose *("six tonnes at a
  gallop can be aimed; it cannot be threaded")*. The horns CATCH the first
  body and CARRY it; release (or the wall) is the throw. A dash tap
  mid-charge SURGES — and the impact scales with arrival speed. Momentum is
  the damage.
- **D — Frill Bulwark**: braces behind the frill — a front-facing counter
  that reflects projectiles. The display organ FLARES as the tell.
- **LB — SIEGE PROTOCOL** *(96 shells, 6.5s)*: he plants all four legs, the
  frill crown opens, and both cannons come off their mounts and HOSE THE
  SKY in opposite-phase sweeps — nothing aimed at anybody — then the whole
  cloud wakes up *(seekTime 0.62)* and comes down HUNTING. Two beats you can
  watch: a fountain, and a rain of it. `nailstorm` director.
- **Passive — Four Columns**: cannot be flipped, tripped or dragged by
  gunk; jab flinch immunity while walking.

---

## Clip mapping notes (for phase 3)

The 26-state contract resolves per mech in the render3d manifest. The rules
of thumb:

- `idle` ← MM `intro`-tail or a held frame of `walk`; `run` ← `run`; `walk`
  ← `walk`. Locomotion personality (gaits) is baked into each mech's own
  exported cycles — a gallop, a scuttle, a knuckle-walk arrive for free.
- `light` ← the mech's light clips (`viperSlash1`, `jerryRakeR`,
  `saurionKick1`, `bigPunch1`…); `sideHeavy` ← the bespoke heavy
  (`clawSnap`, `kongaSlam`, `tritoneToss`, `fenrirSpike`, `viperDrill`,
  `tempestTornado`, `wraithLasers`, `jerryBarrage`, `nullBackhand`,
  `poundSlam`…).
- `specialNeutral` ← `shoot`/`shootL`/channel loops/`fistLaunch`/
  `saurionQuillFan`/`kongaLob`/`tritoneBrace`. `specialSide` ← movement
  clips (`lunge`, `pounceLeap`, `chargeLean`, `viperWhirl`, `flurry`).
  `ult` ← `castRaise`/`hurricaneSpin`/`groundPound` per mech.
- `hurt` ← `hitFlinch`; `launched` ← `launched`; `prone` ← `knockdown`;
  `getup` is the stand-up half of `getup`; `dodge` ← `ball`; `shield` ←
  `block`; `ledge` ← `hangGrab`; `jump/fall/land` ← `ball`-family +
  `land`/`landReach`; `win` ← `victory`; `dizzy` ← `hitFlinch` slowed.
- Every mech has all 17 universal clips, so **no state is ever empty** —
  bespoke coverage varies (viper's six custom clips to rhino's zero) and the
  manifest's inheritClips fills the rest.

## What deliberately did NOT survive

- **Ammo and crates** — cooldowns price every gun; there is no pickup loop.
- **Crosshair aiming and sniper mode** — a 2.5D fighter aims by facing.
  Wraith's identity moves into the charged Sniper Round.
- **Stamina sprinting** — dashes and runs use the brawler's own economy.
- **Free-roam surface walking** — jerry and konga keep a wall-cling +
  wall-jump; nobody walks on the ceiling.
- **Fountains** — see energy, above.
- **Taunt-button set pieces** — wraith's grow-and-peel and glacier's ice
  block move INTO their ult/flavor moments; the taunt button itself stays a
  taunt.
