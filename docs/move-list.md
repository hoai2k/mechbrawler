# Mech Brawler — Move List

Every mech's ranged weapon, three specials and ultimate.

**This file is generated** from `src/characters.js` by
`tools/build_move_list.mjs` — do not edit it by hand, edit the kit and
re-run. Its companions are [characters.md](characters.md), which explains *why*
each kit is the way it is, and [game-mechanics.md](game-mechanics.md), which
explains the systems the moves are built from.

**17 mechs** — every one with a ranged weapon (RB), three specials and an
ultimate.

The ultimate costs the **whole** Energy bar. Ranged shots and specials spend
the self-recovering INHERENT ENERGY pool (shots are priced per weapon;
specials default to 30) and run on individual cooldowns on top of it.

## The whole roster

| Mech | Group | Ranged (RB) | Neutral special | Side special | Down special | Ultimate |
|---|---|---|---|---|---|---|
| [Titanus](#titanus) | Power | Rocket Fist | Breaker Fist | Skyline Slam | Bulwark Stomp | METEOR BREAKER |
| [Colossus](#colossus) | Power | Mortar Lob | Fire Mission | Skyline Toss | Bunker Down | COLOSSAL FORM |
| [Rhino](#rhino) | Power | Shoulder Cannon | Horn Break | Bull Rush | Bring a Wall | STAMPEDE |
| [Konga](#konga) | Power | Shoulder Salvo | Armspan Sweep | Skull Driver | War Drums | APEX POUND |
| [Tritone](#tritone) | Power | Flank Cannons | Seismic Bellow | Gore Charge | Frill Bulwark | SIEGE PROTOCOL |
| [Viper](#viper) | Speed | Fang Throw | Serpent Feint | Blade Cyclone | Phantom Step | SERPENT STORM |
| [Saurion](#saurion) | Speed | Quill Fan | Raptor Feint | Sickle Pounce | Tail Lash | RAPTOR PACK |
| [Fenrir](#fenrir) | Speed | Rend Wave | Savage Flurry | Lunar Pounce | Howl | WILD HUNT |
| [Tempest](#tempest) | Speed | Arc Bolt | Power Chord | Static Overload | Feedback Coil | THUNDERFALL |
| [Wraith](#wraith) | Speed | Sniper Round | Deadman's Mark | Night Swarm | Ghost Protocol | DEATH SWARM |
| [Frogger](#frogger) | Speed | Slime Slinger | Tongue Lash | Quad Gunk Barrage | Spring Coil | SONIC CROAK |
| [Jerry](#jerry) | Speed | Bilge Spit | Breach | Brine Swarm | Anchor Drop | FLEA CIRCUS |
| [Vulcan](#vulcan) | Tech | Gatling Burst | Frag Shell | Micro-Missile Volley | Flak Fan | BULLET HURRICANE |
| [Inferno](#inferno) | Tech | Dragon's Breath | Backdraft Hook | Napalm Carpet | Vent Burst | FIRE TORNADO |
| [Glacier](#glacier) | Tech | Icicle Barrage | Cold Snap | Cryo Beam | Ice Wall | ABSOLUTE ZERO |
| [Cranky](#cranky) | Tech | Hydro Hose | Pincer Grip | Geyser | Shell Up | TSUNAMI |
| [Nullbot](#nullbot) | Tech | Null Pointer | Exception Handler | SEGFAULT | Stack Overflow | SYSTEM CRASH |

## Every kit in full

<a id="titanus"></a>

### Titanus — "The Iron Avalanche"

*Power · `titanus` · theme `#ffa832`*

- Ranged (RB) *(2.4s cooldown, 18 energy)* — **Rocket Fist** — A fist leaves the arm as real ordnance, hits like a truck, and flies home to re-dock.
- Neutral special *(3.5s cooldown)* — **Breaker Fist** — One haymaker, two impacts — the fist lands, and a beat later the shock of it lands again.
- Side special *(5s cooldown)* — **Skyline Slam** — Seize, hoist clean overhead, and hurl them flat across the arena — a kill throw at the edge.
- Down special *(4s cooldown)* — **Bulwark Stomp** — A short ground quake around him that knocks the crowd up and off.
- Ultimate — **METEOR BREAKER** — He reaches to the sky and it answers — a meteor hammers the zone in front and leaves the ground burning.
- Passive — **Siege Plating** — Armor plate over everything: jabs cannot flinch him while a charge is banking.

<a id="colossus"></a>

### Colossus — "The Patient Thunder"

*Power · `colossus` · theme `#ffc23c`*

- Ranged (RB) *(1.7s cooldown, 22 energy)* — **Mortar Lob** — A high arcing shell that lands where you are about to be — the slowest, meanest projectile in the game.
- Neutral special *(4s cooldown)* — **Fire Mission** — He designates a stretch of ground three moves ahead — then the shells arrive on it.
- Side special *(5s cooldown)* — **Skyline Toss** — The command grab, thrown up-and-out — he sets up his own mortar.
- Down special *(4.5s cooldown)* — **Bunker Down** — Plants: heavy armor and a thicker guard for a beat — the patient answer to pressure.
- Ultimate — **COLOSSAL FORM** — No shell this time — he is the ordnance. He grows and simply walks through the fight.
- Passive — **Siege Plating** — Armor plate over everything: jabs cannot flinch him while a charge is banking.

<a id="rhino"></a>

### Rhino — "The Unstoppable Object"

*Power · `rhino` · theme `#ff2a20`*

- Ranged (RB) *(1.3s cooldown, 14 energy)* — **Shoulder Cannon** — A hand cannon per fist, alternating — slow shells with real splash, a mid-range poke.
- Neutral special *(3.5s cooldown)* — **Horn Break** — A braced upward rip of the horn — whatever it catches leaves the ground.
- Side special *(4.1s cooldown)* — **Bull Rush** — Drops to all fours and gallops down the lane — one clean launch the moment it connects.
- Down special *(4s cooldown)* — **Bring a Wall** — A counter-brace: struck during the window, he shoulder-checks straight through the attacker.
- Ultimate — **STAMPEDE** — Three of him, shoulder to shoulder, thunder across the whole stage floor — a wall of rhino you jump, not block.
- Passive — **Plated** — Top-grade plate: jabs cannot flinch him while he walks.

<a id="konga"></a>

### Konga — "The Silverback Siege"

*Power · `konga` · theme `#ffa432`*

- Ranged (RB) *(2.1s cooldown, 12 energy)* — **Shoulder Salvo** — Both pods empty in a ripple — a rolling barrage that exists mainly to make you walk into the fists.
- Neutral special *(3.5s cooldown)* — **Armspan Sweep** — Both arms at full extension, swept through everything at head height — the reach is the weapon.
- Side special *(5s cooldown)* — **Skull Driver** — The piledriver — the body hangs inverted and the head is what lands. They finish on their back.
- Down special *(3.5s cooldown)* — **War Drums** — Drums the chest — a shockwave pulse at his feet, and the jungle takes notice.
- Ultimate — **APEX POUND** — The hunt: every beat sends a shockwave through the floor. Airborne bodies are simply missed — jump the wave.
- Passive — **Long Arms + Climber** — The longest real reach on the roster, and an ape hangs — wall-cling and wall-jump, head up.

<a id="tritone"></a>

### Tritone — "The Walking Siege"

*Power · `tritone` · theme `#ff8a24`*

- Ranged (RB) *(1.6s cooldown, 16 energy)* — **Flank Cannons** — Both cannons traverse for a visible half-beat, then fire together — the fastest heavy ordnance in the game.
- Neutral special *(3.5s cooldown)* — **Seismic Bellow** — The frill flares and six tonnes of chest answers — a bellow that staggers everything in front of it.
- Side special *(4.4s cooldown)* — **Gore Charge** — Head down, frill planted, and he runs — the horns catch the first body and momentum is the damage.
- Down special *(4s cooldown)* — **Frill Bulwark** — Braces behind the frill — a front-facing counter that reflects shells; the display organ flares as the tell.
- Ultimate — **SIEGE PROTOCOL** — All four legs plant, both cannons hose the sky in opposite-phase sweeps — then the whole cloud wakes up and comes down hunting.
- Passive — **Four Columns** — Four legs, no lever: he cannot be flipped, tripped, or dragged, and jabs do not flinch him while he walks.

<a id="viper"></a>

### Viper — "The Whispering Fang"

*Speed · `viper` · theme `#5aff2e`*

- Ranged (RB) *(0.8s cooldown, 6 energy)* — **Fang Throw** — A thrown forearm dagger — the blade visibly leaves her arm and regrows. Fast, flat, spammable.
- Neutral special *(3.5s cooldown)* — **Serpent Feint** — She flows backward off the line, then springs through it blades-first — the retreat was the attack.
- Side special *(3.75s cooldown)* — **Blade Cyclone** — Everything above the waist spins free while the legs keep walking — a striding whirlwind of blades.
- Down special *(3.5s cooldown)* — **Phantom Step** — A blink through the opponent to their far side, with a backstab window on arrival.
- Ultimate — **SERPENT STORM** — She coils, springs skyward, and the brood floods the stage floor — the first fang pins, the rest pile on.
- Passive — **Assassin's Read** — Angles nobody teaches: +15% damage striking from behind.

<a id="saurion"></a>

### Saurion — "The Apex Prototype"

*Speed · `saurion` · theme `#ff2418`*

- Ranged (RB) *(0.9s cooldown, 7 energy)* — **Quill Fan** — A fan of black blade-feathers off both forearms — his own plumage, quickest gun in the game.
- Neutral special *(3.5s cooldown)* — **Raptor Feint** — He breaks off the line, coils onto his haunches — and arrives back through it claws-first.
- Side special *(3.75s cooldown)* — **Sickle Pounce** — The bird-of-prey kill-leap — and the only shield-breaker in the game.
- Down special *(3.5s cooldown)* — **Tail Lash** — A low sweeping trip around him — the get-off-me his pounce-first gameplan needs.
- Ultimate — **RAPTOR PACK** — He lays a clutch — eggs warp in, roll like the heavy shells they are, and hatch into pack-mates.
- Passive — **Predator's Break** — Guards mean nothing to the pounce, and prey already in the air takes 10% more.

<a id="fenrir"></a>

### Fenrir — "The Last Wild Thing"

*Speed · `fenrir` · theme `#6cd8ff`*

- Ranged (RB) *(1s cooldown, 8 energy)* — **Rend Wave** — A crescent of torn air off the claws — his poke, medium speed, good arc.
- Neutral special *(3.5s cooldown)* — **Savage Flurry** — Both claws, no ceremony — a tearing flurry for whatever the pounce just caught.
- Side special *(3.5s cooldown)* — **Lunar Pounce** — A flat predator's lunge — fast, low, the gap-closer the rest of the kit hunts behind.
- Down special *(4s cooldown)* — **Howl** — A rallying cry — nearby foes get a flinch of hesitation, and the pack answers.
- Ultimate — **WILD HUNT** — Rifts tear open and the pack pours out, running down the nearest enemy — a wolf that lands its bite is satisfied and leaves.
- Passive — **Predator's Rhythm** — The chase pays for itself: a landed dash attack refunds half the dash and a tick of energy.

<a id="tempest"></a>

### Tempest — "The Voltage Virtuoso"

*Speed · `tempest` · theme `#3fd8ff`*

- Ranged (RB) *(0.9s cooldown, 8 energy)* — **Arc Bolt** — Lightning that jumps — it finds its mark and wants a second body nearby.
- Neutral special *(3.5s cooldown)* — **Power Chord** — He strikes a chord off his own stacks and the front row takes it in the chest.
- Side special *(4.4s cooldown)* — **Static Overload** — Places a storm cell a short way ahead — the cloud gathers, then bolts hammer down into the zone.
- Down special *(3.5s cooldown)* — **Feedback Coil** — An electric counter — the riposte is a point-blank discharge.
- Ultimate — **THUNDERFALL** — The sky goes dark over most of the stage and the weather answers — bolts hammer everyone caught in the gloom.
- Passive — **Grounded Rod** — The storm feeds the showman: +25% energy gain while a foe is shocked.

<a id="wraith"></a>

### Wraith — "The Hollow Echo"

*Speed · `wraith` · theme `#ff2030`*

- Ranged (RB) *(1.5s cooldown, 16 energy)* — **Sniper Round** — A piercing shot down the rifle line — slow to aim, flat, hits through bodies.
- Neutral special *(3.5s cooldown)* — **Deadman's Mark** — He marks the spot you are standing on. Officially, nothing happens there. Move.
- Side special *(3.5s cooldown)* — **Night Swarm** — Three bats that drift and home lazily — screen control while he lines up the rifle.
- Down special *(5.6s cooldown)* — **Ghost Protocol** — He is somewhere else — a smear of spectre, and the rifle already re-settled.
- Ultimate — **DEATH SWARM** — The flock becomes a real gyre that wheels around him and takes turns stooping on whoever he hates.
- Passive — **800 Metres** — The round is patient: Sniper Round damage grows with distance flown.

<a id="frogger"></a>

### Frogger — "The Gunk Gladiator"

*Speed · `frogger` · theme `#aef23c`*

- Ranged (RB) *(0.85s cooldown, 7 energy)* — **Slime Slinger** — A lobbed glob; the splash gunks — heavier jumps, slower dashes.
- Neutral special *(4.5s cooldown)* — **Tongue Lash** — The tongue snaps out, sticks, and hauls them through the gunk on the way back.
- Side special *(4.1s cooldown)* — **Quad Gunk Barrage** — All four guns lob a sticky mortar carpet at once.
- Down special *(3.5s cooldown)* — **Spring Coil** — The full frog squat, released — a towering leap off a damaging launch splash.
- Ultimate — **SONIC CROAK** — The jaw drops open and the croak comes out — a resonant blast that locks every nearby servo solid.
- Passive — **Low Profile** — Crouching under things is a lifestyle: the deepest squat in the game, entered 30% faster.

<a id="jerry"></a>

### Jerry — "The Tide-Bringer"

*Speed · `jerry` · theme `#ff2818`*

- Ranged (RB) *(1.1s cooldown, 6 energy)* — **Bilge Spit** — A lead glob with trailing wads — long range, gunks on hit.
- Neutral special *(3.5s cooldown)* — **Breach** — The legs fire and the tide comes with him — a towering shell-first leap off a bursting column.
- Side special *(4.7s cooldown)* — **Brine Swarm** — Coughs up three hopping shrimp-mines that bounce forward and pop on contact.
- Down special *(3.5s cooldown)* — **Anchor Drop** — Grounded, a low claw sweep; the shell comes down like the anchor it is.
- Ultimate — **FLEA CIRCUS** — Copies of him spring off and ricochet around the stage like fleas, biting whatever they land on, while the real Jerry keeps fighting.
- Passive — **Colony** — The swarm feeds back: every mine and flea hit banks bonus energy for the whole.

<a id="vulcan"></a>

### Vulcan — "The Lead Storm"

*Tech · `vulcan` · theme `#ff8c30`*

- Ranged (RB) *(0.75s cooldown, 4 energy)* — **Gatling Burst** — A held spray of tracer that chips, pushes, and never kills — it exists to make you approach.
- Neutral special *(3.5s cooldown)* — **Frag Shell** — A fat grenade lobbed over the tracer line — every problem is insufficient ammunition.
- Side special *(4.1s cooldown)* — **Micro-Missile Volley** — Both shoulder pods ripple-fire six seekers that arc onto the target.
- Down special *(3.5s cooldown)* — **Flak Fan** — An upward spread burst — his anti-air, ugly to jump into.
- Ultimate — **BULLET HURRICANE** — A hundred rounds fall into orbit around him — a storm of lead that folds onto whoever strays close.
- Passive — **Spin-Up** — The barrels remember: consecutive Gatling seconds tighten its spread.

<a id="inferno"></a>

### Inferno — "The Joyful Furnace"

*Tech · `inferno` · theme `#ff8a1e`*

- Ranged (RB) *(0.75s cooldown, 5 energy)* — **Dragon's Breath** — A long narrow jet of held flame — the cone is a wall; walking into it is the mistake.
- Neutral special *(3.5s cooldown)* — **Backdraft Hook** — A short furnace-hot hook — the punch is fine; it is the fire that stays.
- Side special *(4.7s cooldown)* — **Napalm Carpet** — Lobbed patches of burning ground — stage control that stays.
- Down special *(3.5s cooldown)* — **Vent Burst** — Dumps the burners straight down — a point-blank fire nova that pops him a half-jump up.
- Ultimate — **FIRE TORNADO** — A wandering fire funnel hunts the nearest enemy, growing as it goes; whoever it catches rides it into the sky.
- Passive — **Slow Burn** — Fire he starts does not want to go out: his burns tick harder for their whole life.

<a id="glacier"></a>

### Glacier — "The Cold Shoulder"

*Tech · `glacier` · theme `#7ce0ff`*

- Ranged (RB) *(1.15s cooldown, 9 energy)* — **Icicle Barrage** — A fan of shards off the left-hand lance — his main conversation.
- Neutral special *(3.5s cooldown)* — **Cold Snap** — The air around him flash-freezes — a point-blank nova for anyone rude enough to get close.
- Side special *(5s cooldown)* — **Cryo Beam** — A held beam that frosts — the slow is the payload; a frosted foe can't escape the next barrage.
- Down special *(4.5s cooldown)* — **Ice Wall** — Raises a pillar of ice ahead — architecture that objects to approaches.
- Ultimate — **ABSOLUTE ZERO** — The stage floor flash-freezes white — everyone else on the sheet frosts over and skates, traction gone.
- Passive — **Cold Shoulder** — Touch at your own risk: melee attackers who strike his shield are frosted.

<a id="cranky"></a>

### Cranky — "The Abyssal Bulwark"

*Tech · `cranky` · theme `#4fc3ff`*

- Ranged (RB) *(0.75s cooldown, 4 energy)* — **Hydro Hose** — Held water pressure — less a gun than a push. Shoves bodies off platforms and stuffs approaches.
- Neutral special *(4.5s cooldown)* — **Pincer Grip** — The claw closes from further away than anything should — seized, squeezed, and flung.
- Side special *(4.4s cooldown)* — **Geyser** — A bubbling patch telegraphs under the target, then a water column erupts — his anti-air lives in the floor.
- Down special *(4s cooldown)* — **Shell Up** — Full counter — the best guard in the game, weaponised, and shells bounce off it.
- Ultimate — **TSUNAMI** — The sea answers — a wall of water rises behind him and rolls the full stage length. Jump it or ride it out.
- Passive — **Hard Shell + Top-Heavy** — The shell takes 45% less shield damage — but a big enough launch flips him onto his back.

<a id="nullbot"></a>

### Nullbot — "The Fatal Exception"

*Tech · `nullbot` · theme `#ff1f2a`*

- Ranged (RB) *(0.75s cooldown, 5 energy)* — **Null Pointer** — A de-rez bolt off either claw — the ranged stack-builder.
- Neutral special *(4s cooldown)* — **Exception Handler** — He stops rendering for a beat — strike the glitch and the exception is thrown back at you.
- Side special *(4.1s cooldown)* — **SEGFAULT** — He de-rezzes into a smear of corrupted frames and tears through everything on the line.
- Down special *(3.5s cooldown)* — **Stack Overflow** — Cashes the corruption out early instead of waiting for the crash.
- Ultimate — **SYSTEM CRASH** — The arena stops rendering right — and every so often the floor fails under an opponent.
- Passive — **The Glitch Stack** — Every landed hit corrupts; at six stacks the victim CRASHES — 1.2s of stun — and the count clears.
