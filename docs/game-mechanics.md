# JJK Brawler II — Game Mechanics

This document is the design reference for the battle system. Numbers here match
the implementation (`src/constants.js`, `src/moves.js`, `src/combat.js`,
`src/fighter.js`); if code and doc disagree, the code is newer.

The goal of v2 was a **complete platform-fighter core in the spirit of Super
Smash Bros.**: percent damage with scaling knockback, stocks and blast zones,
a full defensive layer (shield / parry / three kinds of dodge), expressive
movement (dash, short hop, double jump, fast fall, ledge play), a light/heavy
attack split with directional variants, three signature specials per character,
and a meter-funded ultimate for every fighter.

---

## 1. The percent & knockback model

- Fighters accumulate **damage percent** (0–999%). Damage never KOs by itself.
- Every hit computes a **knockback impulse**:

  ```
  kb = (baseKb + victimPercent × growth) / victimWeight
  ```

  `baseKb` is the move's raw launch power, `growth` is how hard the move scales
  with the victim's percent, and `weight` (0.88 Momo → 1.28 Panda) divides the
  result. The victim is launched at the move's angle (radians; negative angles
  are **spikes** that launch airborne victims downward).

- **Hitstun** scales with knockback: `0.12 + kb × 0.00048` seconds plus any
  stun bonuses (Cursed Speech), hard-capped at 1.35 s. Launched fighters can't
  act until it ends.
- **KOs** happen only at blast zones: past the sides (−300 / 1580), the top
  (−420, for vertical KOs), or the bottom (1000). Losing a stock resets percent
  and starts the respawn below.
- **Hitlag** (freeze frames): both fighters freeze for `0.03 + damage × 0.0045`
  seconds on contact (25% longer on heavies) while the victim vibrates — this
  is the "crunch" that makes hits read. The world also gets brief **slow-mo**
  and a camera **zoom kick** on knockouts and heavy launches.

### Respawning (Smash's bargain)

A KO'd fighter is blacked out for **0.65 s** — a marker closes on the spot they
are about to reappear — and then comes back **standing on a revival platform
with control already theirs**. That is the whole point: the only part of a
respawn you cannot play is that first two thirds of a second. Nothing waits for
the platform to expire.

The platform is protection you **spend**, not a wait you serve. It lasts up to
**3 s** and you are invulnerable for every frame of it, but it ends the instant
you do anything with the control you already have — attack, special, ultimate,
jump, shield, press down, or simply walk off its edge. **0.5 s** of grace
invulnerability follows you off it however you left, so stepping down is never
the moment you get hit. It dims and then blinks as its time runs out.

## 2. Movement

| Mechanic | Detail |
|---|---|
| Run | Per-character top speed (356–468 px/s) and acceleration |
| **Dash** | Double-tap a direction within 0.24 s → 1.45× burst for 0.22 s |
| Turn lock | Reversing at speed costs 0.08 s of traction — spacing has commitment |
| Jump | Per-character impulse; **short hop** by releasing jump within ~0.09 s |
| Double jump | One air jump at 92% power (Momo gets two — broom flight) |
| Jump buffer / coyote time | 0.15 s buffer, 0.10 s coyote window |
| **Fast fall** | Press down while airborne: fall cap rises 1.62× |
| Crouch | Shrinks the hurtbox; ducks under high projectiles |
| Platform drop | Down + jump drops through side/top platforms (not the main stage) |

### Ledges
Only the main platform has grabbable ledges. Falling near an edge (after real airtime —
no walk-off regrab loops) snaps the fighter to a hang (brief invincibility,
refreshed double jump); getting hit knocks them off the hang. From the hang:
climb (toward), **ledge roll** (shield — long invulnerable climb), **ledge
jump** (jump), **ledge attack** (attack — climbs and swings), or drop (down/away).
Hanging times out after 2.8 s so ledges can't be camped.

## 3. Defense

- **Shield** (hold): a health bubble (100 HP) that shrinks as it drains.
  Blocking costs `damage × 1.5 × moveShieldMultiplier` shield HP; holding it
  leaks 22 HP/s; it regenerates at 14 HP/s while down. At 0 HP the shield
  **breaks**: 2.2 s dizzy stun — a guaranteed punish and usually a stock.
- **Parry**: a shield raised within **0.12 s** of the hit blocks for free — no
  shield damage, the attacker is frozen for 0.34 s, and the parrier gains
  6 meter. Only a *fresh* raise counts (the shield must have been down for
  0.25 s first), so mashing the button never parries. Blocking a hit does not
  drop the shield: it stays up through shield-stun against multi-hit strings.
- **Shield pressure**: heavy attacks carry 1.5–2.2× shield multipliers; Maki's
  cursed tools (+18 flat) and Toji's Heavenly Restriction arsenal (+14 flat)
  shred shields; some moves (Panda's Drumming Beat, command grabs, many
  ultimates) are **unblockable**.
- **Dodges** (all share a staleness rule — each dodge within 1.4 s of the last
  loses 25% of its invincibility, so wiggling is punishable):
  - **Roll** (shield + side): ~210 px of movement, invincible start.
  - **Spot dodge** (shield + down): stay in place, longest invincibility.
  - **Air dodge** (shield in midair, once per airtime): brief invincibility
    plus directional drift — also a recovery mixup.

## 4. Offense

Every character shares the same **input grammar**; the numbers and effects are
per-character (from their `light`/`heavy` profiles in `src/characters.js`).

### Light attacks (fast, low commitment)
- **Jab combo** — neutral light on the ground: two quick hits into a knockback
  finisher.
- **Side tilt** — light while moving/dashing: the character's spacing poke.
- **Up tilt** — light + up: anti-air arc.
- **Down tilt** — light while crouching: low poke, slight launch.
- **Aerials** — neutral / up / **down air** in midair; down airs are
  **spikes** that launch downward — the edge-guard finisher.

### Heavy attacks (slow, chargeable, shield-hungry)
- Hold heavy to **charge** up to 0.8 s → up to +55% damage and +25% launch.
- **Side smash** — the KO button. **Up smash** — vertical KO. **Down smash**
  ("quake") — hits both sides along the ground. One **air heavy**.

### Specials & ultimates
Three specials per character (neutral / side+special / down+special) built from
shared primitives — projectiles, ground waves, dash strikes, traps, counters,
command grabs, installs, teleports, gambles — plus bespoke signature logic
(Boogie Woogie's swap, Cursed Speech's throat strain, the Gorilla core, etc.).
Specials have individual cooldowns (0.8–7 s) instead of resource costs.

### Summons, and steering them

Five moves put a persistent creature on the stage rather than a hitbox — four
specials (Megumi, Mahito, Geto, Toji) and Megumi's ultimate **Mahoraga**
(brawler — see below). They are lifetime-limited, capped per caster, and die
with their owner.

**Which creature you get is a roll.** A summon special names a **pool** and
draws one entry per cast, never the same one twice running, so the technique is
the move and the creature is the draw. What comes out is named on screen as it
arrives, because with five shikigami on one button the creature is the
information.

| Character | Special | Pool |
|---|---|---|
| Megumi | Ten Shadows: Shikigami | **Divine Dogs** (two chasers, snare bite) · **Great Serpent** (fast, enormous reach, fragile) · **Toad** (holds ground behind him, tongue lash) · **Max Elephant** (slow, huge, very hard to remove) · **Rabbit Escape** (three bombers, chip and clutter) |
| Mahito | Transfigured Souls | **Transfigured Human** (bomber) · **Bloated Hulk** (slow tanky chaser) · **Crawlers** (two fast bombers) · **Spitter** (support) |
| Geto | Cursed Spirit Release | **Rainbow Dragon** (chaser) · **Smallpox Deity** (support, poison) · **Curse Hounds** (two fast chasers) · **Cursed Womb** (bomber) |
| Toji | Open the Inventory | **Inventory Curse** (support, cursed tools) · **Coil Curse** (chaser) · **Husk Curse** (bomber, breaks weapons) |

Entries are not balanced by being identical — each trades something for
something (reach for staying power, weight for numbers), which is the point of
rolling at all.

**Summons animate**, off a small pose set of their own: a breath, a stride, a
strike and a flinch. Anything not yet drawn falls back pose by pose to that
creature's single still (docs/asset-requests.md, round 16), so art lands
incrementally without a code change.

**Arriving and leaving is a whole beat of its own.** A summon does not blink
into existence: it forms in the air over its landing point, fades up out of
nothing, and drops in, and only the landing makes it real — until its feet are
down it cannot hit anything and nothing can hit it. Leaving is the same in
reverse. For the last **1.5 s** of its lifetime it **flashes**, slowly at first
and then frantically, so "this is about to go" is something you read off the
screen rather than count in your head; then it fades out and dissipates upward.

The exception is a summon that was **killed**. That one bursts on the spot with
no flash and no fade — the difference between a timer running out and an
opponent taking your shikigami apart should be visible from across the stage.

**Hitting one moves it.** A summon that took a hit and kept walking looked like
a summon that had not been hit, so a blow now **staggers** it: shoved along the
line of the attack, thrown off its own behaviour for a beat, popped off the
floor if the hit was heavy, and landing with dust like anything else with feet.
How far it goes is per-creature — a Max Elephant barely rocks, a rabbit sails.

It is deliberately *not* a fighter's knockback: the shove is clamped to the
stage, with no launch angle, no percent scaling and no hitstun to combo out of.
A summon can be pushed around and never off — otherwise every summon would be a
free stock for whoever hits hardest, which is exactly what giving them hit
points was meant to avoid.

Each one **hunts on its own** the moment it lands, so casting one costs no
attention. Push the **right stick** (keyboard: `TFGH` for P1, `8/4/5/6` for P2)
and you take it over instead — it goes where you point until the stick has been
centred for 1.2 s, then resumes hunting. A driven summon is marked with a white
chevron and moves 15% faster than a hunting one.

Steering is movement only. Attacks stay automatic — chasers bite on contact,
bombers detonate, the support summon keeps firing on its cooldown — so driving
one never means abandoning your own fighter mid-combo. All of a player's live
summons answer the same stick, so Megumi's two dogs drive as a pack.

The vertical axis depends on what the summon is:

| Summon | Up | Down |
|---|---|---|
| Divine Dogs, Rainbow Dragon, Transfigured Human, Mahoraga (grounded) | **Jump** — one per push, lands on platforms like a fighter | Fast-fall |
| Inventory Curse (flyer) | Fly up | Fly down |

Holding up gives one jump, not a hover: the stick has to return to centre
before the next one. Only piloted summons jump — a hunting one has no way to
judge when it is worth it. A summon released mid-air finishes its arc before
resuming the hunt, and one that walks off the ledge it landed on falls.

CPU fighters do not pilot; their summons always hunt.

### Mahoraga — a summon that plays like a character

Megumi's ultimate is the one summon that is not a creature reacting to contact.
Mahoraga arrives as his own **actor**: he has the full sprite set a fighter has,
and an AI that uses it. He walks in, jumps at people standing above him, and
picks between three real moves with startup, an active window and recovery —

| Move | Shape | Notes |
|---|---|---|
| Swipe | fast poke, 9% | the answer to standing next to him |
| Smash | 0.40 s windup, 17% | slow and loud on purpose: shield it or leave |
| Cleave | anti-air, 13% | nobody answers a shikigami from the platform above |

He has **150 HP** and can be killed like any summon — but the wheel turns: after
**8 hits taken** he **ADAPTS**, and everything after that lands on him for half.
Kill him early or live with him for the full 10 s.

Megumi keeps his own body and his own controls the whole time and fights beside
him, with a damage-taken reduction while the shikigami is out — and the right
stick drives Mahoraga exactly like any other summon if you would rather steer
him yourself. (He used to be a *transformation* Megumi wore, which put the
player in Mahoraga's body but took Megumi off the board. The transform machinery
is still in `config_transform.js` for the next fighter who needs a second body.)

### Steering creature projectiles

Two specials throw creatures rather than persistent summons, and the same stick
flies them: Megumi's **Nue** (neutral) and Geto's **Cursed Spirit Volley**
(neutral). Both are marked `steerable` in their kit config, which does two
things:

- **Aim on release.** Fire with the stick held and the shot launches along the
  stick instead of straight ahead. Geto's three curses keep their spread
  *perpendicular* to that heading, so an aimed volley fans exactly like a
  forward one, rotated.
- **Fly it after release.** Holding the stick turns the shot's flight path
  toward it at a limited rate (Nue 6.0 rad/s, the volley 4.6). Speed is
  preserved — steering redirects a shot, it never accelerates one.

While you are steering, the shot's own guidance stands down: gravity stops
(so a hand-flown Nue holds its line instead of dropping) and the volley's homing
yields to the stick. Let go and both resume, so an unsteered shot behaves
exactly as it always did.

Aiming is opt-in per press. Nothing changes for a player who never touches the
stick, and CPU shots are unaffected.

**Cursed Energy meter** (0–100): builds from dealing damage (×0.5), taking
damage (×0.85), and slowly over time (+1.1/s). At 100, the ultimate button
spends it all on the character's **cinematic ultimate** — a domain, a meteor,
an install transformation, a flurry rush. Ultimates are the comeback valve:
getting beaten up funds yours faster.

A full bar is also exactly what a **Domain Expansion** costs, so the seven
fighters who have one spend every filled bar on a choice: fire the ultimate
now, or open the domain instead. Nobody gets both off one bar.

## 5. Status effects

| Effect | Source | What it does |
|---|---|---|
| Burn | Jogo, Sukuna's Fuga | % ticks for 2.6 s (Jogo's burn 50% hotter) |
| Bleed | Sukuna | % ticks for 3.2 s, only while moving fast |
| Snare | Megumi, Hanami, Inumaki | Movement slowed to 60% |
| Soul Mark | Mahito | +18% damage taken from everything for 3.4 s |
| Nail Mark | Nobara | Stacking marks that Hairpin/Resonance consume |
| Silence | Toji | Specials sealed for 3 s |
| Gust | Momo | Extra pushback and lift |
| Armor | Panda, installs | No hitstun/knockback from hits (damage still counts) |
| Drench | Dagon | Soaked: movement down to 84%, and Dagon's own hits land 15% harder on a soaked target |
| Infest | Kurourushi | Cursed eggs hatch in the wound: % ticks that stack up to three generations, and every tick heals Kurourushi |
| Blind | Kurourushi | Eyes fouled: −12% damage dealt, and dodge invincibility halved |

Maki's Heavenly Restriction makes her **immune** to burn, snare, soul marks,
and cursed speech — a body with no cursed energy to curse. Choso is immune to
bleed and poison; Dagon cannot be soaked and Kurourushi cannot be infested or
blinded, which only ever comes up in a mirror match.

Every status here is reachable in a match: the last three belonged to staged
fighters until Dagon and then Kurourushi shipped, and nothing is staged now.

## 6. Stages & camera

All 20 arenas from v1 return: one solid main platform (the lowest surface,
with grabbable ledges) plus **2–6 drop-through platforms** in a deliberate
per-stage archetype — arenas open to the sky, five-platform skylines, rafter
galleries, twin towers, staircases, a six-bone ribcage, orbit fields (the
full set and the jump-reach rules live in
`docs/stage-variety-plan.md`, enforced by `tools/audit_stage_reach.mjs`).
Each has its own painted backdrop and color grade. The camera is dynamic
Smash-style: it tracks the fighters' midpoint and zooms with their
separation (1.0×–1.18×), shakes with impact, and punches in on KOs.

### Active Boards

Every stage also has a **gameplay identity** (`src/stage_fx.js`), toggled by
**Settings → Active Boards** (default on; off restores the static v1 layouts).
Design rules: hazards deal 4–8% with light, inward/upward knockback (never a
spike), everything dangerous is telegraphed ≥1 s, ledges always work, and a
hazard can never KO by itself. The CPU steps out of telegraphed zones.

| Stage | Identity |
|---|---|
| Training Bridge | None — the fair one (cosmetic leaves only) |
| Quiet Hall | Silence bell: every ~25 s a 4 s hush seals all specials |
| Flooded Gate | Surge wave sweeps the floor; pushes, never damages |
| Shibuya Night | A curtain falls for 8 s: everyone's meter builds fast |
| Curse Maw | Fangs snap up at both floor edges (7%) — centre is safe |
| Garden Steps | Terraced staircase layout; a flower blooms — first touch heals 8% |
| Lantern Corridor | A lantern falls and burns a patch of floor |
| Sunken Crossing | Slick: friction drops sharply, stops become slides |
| Neon Split | A centre energy wall for 5 s; crossing costs 6% |
| Bone Sanctum | Drop-through platforms rattle, then phase intangible |
| Bridge Duel | The whole main platform drifts ±70 px (ledges ride along) |
| Academy Hall | Class bell: platforms glide between four arrangements |
| Mist Pier | Fog hides both fighters as silhouettes for 6 s |
| Crosswalk Rush | Telegraphed light-trail traffic at ground level (5%) |
| Cursed Teeth | Falling fangs on shadow telegraphs + a gentle inhale pull |
| River Gate | Alternating crosswind drifts airborne fighters (petals show it) |
| School Wing | A weak curse wanders: pop it for +8 meter, or it latches (4%) |
| Empty City | The top platform crumbles under weight, reforms in 5 s |
| Billboard Roof | After two flashes, lightning strikes the top platform (8%) |
| Domain Core | 0.88× gravity; side platforms orbit slowly |

## 7. Match structure & options

- Stock battle: 1 / 2 / 3 / 5 stocks (default 3).
- **VS CPU** (Easy / Normal / Hard — reaction time, aggression, defense, and a
  damage handicap all scale) or **2 players local**. Gamepads supported
  (first pad = P1, second = P2).
- Pause (Space/Esc/Start), Move List in the pause menu, hitbox debug on `` ` ``.

### Match modes

Chosen from the **VS badge** in the middle of the fighter select screen
(`src/modes.js` decides what each one builds; the picker itself is in `ui.js`).
Whatever is chosen is named under the badge, and anything but the default also
prints a line under the roster saying how many CPUs are joining. It never says
*which* CPUs — they are drawn when the match starts, avoiding fighters already
in the match so a crowd is a crowd of different faces.

| Mode | What it builds |
|---|---|
| **Vs Battle** (default) | Everyone for themselves — the original match. |
| **Players vs CPUs** | Teams: every human player, against an equal number of random CPUs. |
| **Battle Royal +1 / +2** | One or two extra random CPUs join the free-for-all. |

Teams are one field on the fighter (`f.team`) and one predicate
(`isFoe` in `src/teams.js`), which every damage path funnels through — melee,
projectiles, summons, domains — so teammates simply pass through each other.
A free-for-all gives every fighter a team of their own, which makes "different
team" and "different fighter" the same test, and the match ends when one side
is left standing rather than one fighter.

A match seats up to eight fighters (four players and four CPUs). Five or more
switches the HUD to its compact row, and in a team match each panel is tagged
with the side it fights for.

## 8. Controls

| Action | P1 | P2 | Gamepad |
|---|---|---|---|
| Move | A / D | ◀ / ▶ | Left stick |
| Jump | W | ▲ | A |
| Crouch / fast-fall | S | ▼ | Down |
| Light attack | J | , | X |
| Heavy attack (hold = charge) | K | . | Y |
| Special | L | / | **RT** |
| Dash | Q, or double-tap a direction | \\, or double-tap | **B**, or double-tap |
| Ultimate | I | ' | LB / RB |
| Domain Expansion | U / Y / O | ; / [ / ] | **D-pad, any direction** |
| Shield / dodges | Left Shift | Right Shift | LT |
| Steer summons / aim creature shots | T / F / G / H | 8 / 4 / 5 / 6 | Right stick |
| Pause | Space / Esc | — | Start |

**The D-pad is the domain pad, and every direction opens one.** Movement is the
left stick. A fighter with a single Domain Expansion — which is all of them
today — opens it from any of the four; only a fighter with more than one splits
the pad, up/left for the first and down/right for the second
(`domainSlotFor` in `src/domains.js`, which the controls screen reads so the two
cannot disagree).

**Special is the right trigger and B dashes.** Special used to be B while LT and
RT were both shield, which spent a face button and a trigger on two things that
never needed both. Double-tap still dashes, on pad and keyboard alike — the
button is a second way in, not a replacement.

## 9. Hitboxes vs. visuals

Universal attack hitboxes are derived from each character's `reach` profile and
then scaled to the sprites: the sheet art physically caps visible reach at
~94 px in front of a fighter, so `moves.js` applies `REACH_SCALE` so that hit
ranges land at the visuals plus a small grace margin. Hold `` ` `` in a match to
see live hitboxes (red) and hurtboxes (white).

Sprite placement itself is normalized offline (`tools/extract_sprites.py`):
per-frame foot anchoring, per-frame facing correction (the sheets mix left- and
right-facing art), and hand-curated `renderScale` entries for cells drawn at a
different zoom than the character's standing art.
