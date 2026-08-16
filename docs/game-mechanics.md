# Mech Brawler — Game Mechanics

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
  with the victim's percent, and `weight` (0.88 Viper → 1.24 Cranky) divides
  the result. The victim is launched at the move's angle (radians; negative angles
  are **spikes** that launch airborne victims downward).

- **Hitstun** scales with knockback: `0.12 + kb × 0.00048` seconds plus any
  stun bonuses, hard-capped at 1.35 s. Launched fighters can't
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
| **Walk** | **Partial stick tilt** (0.28–0.72) → 34–62% of run speed, scaled by how far you push. A keyboard has no axis and always runs |
| Run | Full tilt: per-character top speed (356–468 px/s) and acceleration |
| **Dash** | **Shove the left stick** out from centre (past 0.78 within 0.14 s of leaving the 0.36 rest zone), or double-tap a direction within 0.24 s → a 1.20× burst for 0.07 s (about 5 frames and ~45 px at a 468 px/s run — brief and uncommittal by design) |
| **Dash attack** | Light or heavy while running: the run's own committal attack (§4) |
| **Ledge brake** | Momentum never carries you off a platform, and a WALK never does either — see below |
| Turn lock | Reversing at speed costs 0.08 s of traction — spacing has commitment |
| Jump | Per-character impulse; **short hop** by releasing jump within ~0.09 s |
| Double jump | One air jump at 92% power (Momo gets two — broom flight) |
| Jump buffer / coyote time | 0.15 s buffer, 0.10 s coyote window |
| **Fast fall** | Press down while airborne: fall cap rises 1.62× |
| Crouch | Shrinks the hurtbox; ducks under high projectiles |
| Platform drop | Down + jump drops through side/top platforms (not the main stage) |

**The dash is a stick input, not a button.** How *fast* the stick leaves centre
is what separates a dash from a walk — shove it and you dash, roll it out and
you walk (and how *far* you roll it out picks the walking speed) — which is Smash's smash input and the thing a player coming from that
game tries first. One dash per shove: the stick has to be seen back inside the
rest zone before another can fire, so holding a direction never machine-guns
dashes, and yanking the stick across centre is a dash-turn. It is **analog
only**: a key crosses every threshold in the frame it is pressed, so a keyboard
cannot tell a shove from a walk and keeps the double tap (`DASH_FLICK` in
`src/input.js`).

### Walking off is a decision

**Nothing takes you off a platform by accident.** Two rules, and between them
they cover every way a fighter used to leave the ground without meaning to:

- **Momentum never carries you off.** Let go of the stick and whatever speed
  you had bleeds away *on the platform* — you stop at the lip rather than
  sliding over it. Before this, one frame of dash flick needed 42 px of runway
  to stop in, against 4 px for one frame of walk: the dash starts at full burst
  speed by design, so the shortest tap a player could give it already spent
  more room than a tap looks like it should.
- **The dash is short.** It covers about 45 px, down from ~70: a dash across a
  platform used to arrive at the far lip with speed to spare, which made
  running off the end the default outcome of a dash rather than a decision.
  Measured with `tools/debug/measure_dash.mjs`; the slide a *released* dash
  leaves behind is unchanged at 55 px, because that one is the brake's job.
- **A walk never carries you off either.** Hold a partial tilt into the lip and
  the fighter stops there and stays there, however long you hold it. Push the
  stick to a run and they go straight over.

This is Smash's **teeter** ([SmashWiki](https://www.ssbwiki.com/Teeter)): walk
slowly to the edge there and the character stops, and will not step off until
the stick is pushed past a threshold. It needs an analog walk to hang off,
which is why the walk above had to exist first. It has its own pose now, too —
see the ledge section below.

Everything deliberate is untouched, because everything deliberate is a held
input: running off to chase, dropping to the ledge, edge-cancelling an aerial.
**Knockback is never braked** — being hit off the stage is the game working. So
is a roll or a dash grab that carries its owner over the end: both spend
momentum the player built themselves, over a distance the player can see coming.

**A lunge is braked, though** — dash attacks (see Offense) and the `dashStrike`
specials both. The `dashStrike` specials — Rhino's Bull Rush, Viper's Blade
Cyclone and the rest — set their own travel speed and used to carry
`keepMomentum`, which means *no friction at all*: the fighter crossed 302 px at
a flat 520 px/s with movement locked out, was still doing 426 px/s when the
action ended, and then stopped dead. On screen that is the "sudden slide fast in
one direction" that has nothing to do with the stick, and because the ledge
brake exempted every action, it was also a common way to be launched off the
stage by your own attack. A dash strike is a *lunge* now (`action.lunge`), which
differs from `keepMomentum` twice over: it decays under a gentle drag
(`LUNGE_DRAG`) instead of holding its speed, and the ledge brake stops it at the
lip like any other unheld movement — 302 px becomes 240, ending at 272 px/s.
Holding the direction still takes you over, because that is a decision.
Measured with `tools/debug/measure_lunge.mjs`; guarded in `tools/smoke_ledge.mjs`.

### Ledges
Only the main platform has grabbable ledges. Falling near an edge (after real
airtime — no walk-off regrab loops) catches the fighter onto a hang (brief
invincibility, refreshed double jump); getting hit knocks them off it. From the
hang: climb (toward), **ledge roll** (shield — the longest intangibility),
**ledge jump** (jump), **ledge attack** (attack — climbs and swings), or drop
(down/away). Hanging times out after 2.8 s, and repeatedly retaking the ledge
costs you the intangibility that made it worth doing (below).

**Getting on and off one is a move, not a teleport.** Every one of those used to
be a single-frame jump of 40–110 px, and drawn verbatim that is a body vanishing
and reappearing somewhere else, twice in half a second — the ledge's whole
flicker. Smoothing the *drawing* over the snap fixed the flicker but not the
lie: the fighter still arrived before their body did, and there was no trip for
a pose to play on. So the fighter now **travels**, on the clock, with a pose per
phase and the hurtbox going where the drawing goes:

| | time | drawn as | worst frame |
|---|---|---|---|
| catch | by distance, 450 px/s (0.09–0.40 s) | the fall (or the rise) it came in on, all the way to the ledge, then the hang | 11.2 px |
| climb | 0.40 s (24 f) | 3 f still hanging, 14 f `jump_rise`, 8 f `land` | 7.9 px |
| roll | 0.64 s (38 f) | 4 f hanging, 24 f `dodge_roll`, 10 f `land` | 8.2 px |
| attack | 0.38 s (23 f) | hanging, then `jump_rise` — the swing fires on arrival | 8.0 px |
| jump off | — | no transition at all: push off *from* the hang and let the arc carry | 6.8 px |

None of it waits on new art — the poses are ones every fighter already has.

**How long is a measurement, not a taste.** No frame of a transition may move
the body further than a full-speed **run** does (7.8 px at a 468 px/s run):
below that, nothing in the trip travels faster than a character can travel on
their own feet, so nothing in it can read as a jump. The durations fall out of
that and the distance each one covers. The first pass at this rushed them
(0.13 / 0.20 / 0.26 / 0.14) and peaked at 15–18 px — far better than the 98 px
teleport, still twice a run. Smash is the sanity check on the other side: its
getups are percent-independent and take roughly half a second, so these are
normal for the genre rather than slow.

The **catch** is the one exception, timed by speed rather than duration —
it starts wherever the fighter was when the ledge caught them, so a fixed time
would make a short reach crawl and a long one snap. It is quicker than the
climbs on purpose: this is hands closing on a ledge, and a slow one feels like
the recovery failing. Its cap is set where even the longest possible reach
moves no faster than the **fast fall** it interrupted (15 px/frame).

**Ledge camping is punishable, on Smash's two rules.**

- **Intangibility ends before the getup does.** Each option is covered for the
  first three quarters of its trip and *nothing* after, so the last frames of a
  climb and the whole of the arrival are a punish window — 10 of a climb's 25
  frames are exposed. Getting up in front of somebody who guessed right costs,
  which is what makes ledge play a read rather than a free re-entry.
- **It decays with every regrab, and only the ground resets it.** Full on the
  first grab, ×0.8 after one regrab, ×0.5 after two, **nothing from the third
  on** — Ultimate's rule verbatim
  ([SmashWiki](https://www.ssbwiki.com/Edge)). Measured across four grabs:
  0.50 s → 0.40 → 0.25 → 0. The loop it kills is grab → drop → regrab, which
  never touches the stage; **climbing up clears it**, because climbing up is
  what a ledge is for. At the far end, a fighter on their fourth consecutive
  grab is hittable through the reach itself while unable to act. That is
  severe, and it is meant to be: it is the fourth time in a row they chose the
  ledge over the stage.

Both are guarded, each against a mutation that turns it back off.

Guarded by `tools/smoke_ledge.mjs`, which checks both halves — how far the body
moves in a frame *and* which poses are drawn while it moves, because a body
that slides smoothly while holding its hang pose the whole way is still
wrong.

**Teetering** is the other half, and the answer to when a fighter should *not*
be hanging. The ledge brake stops people dead on the last pixel of a platform
constantly — that is its job — and nothing drew it, so the most common thing
that happens at an edge looked like standing in the middle of the stage.
Stopping within 16 px of the lip for 0.08 s now draws `teeter`: its own pose
where a `teeter` clip exists, and otherwise the idle with a lean out over
the drop and a slow sway back, which is what a teeter is. Somebody who stopped
at the edge has not left it, so it is a stance, not a hang.

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
- **Shield pressure**: heavy attacks carry 1.5–2.2× shield multipliers; a
  move can add flat shield damage on top (`shieldFlat`); some moves (command
  grabs, many ultimates) are **unblockable**.
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
- **Side tilt** — the character's spacing poke. On the ground it is a flick of
  the right stick (the tilt stick), because a light press at a run now has its
  own attack.
- **Up tilt** — light + up: anti-air arc.
- **Down tilt** — light while crouching: low poke, slight launch.
- **Aerials** — neutral / up / **down air** in midair; down airs are
  **spikes** that launch downward — the edge-guard finisher.

### Dash attacks (the run's own attacks)

Attacking out of a dash or a sprint — either attack button — throws a **dash
attack** rather than the standing move. Both carry the run through the swing
(`lunge`, so the slide does not die the moment the action locks) and both are
deliberately committal: the trade for reaching with your momentum behind you is
that you are standing in the recovery afterwards.

| | Light, running | Heavy, running |
|---|---|---|
| Damage | 1.1× the side tilt | 0.95× a smash, uncharged |
| Launch | 330 base / 6.2 growth | 420 base / 8.0 growth |
| Recovery | ~1.7× the side tilt's | ~1.4× the side smash's |
| Lunge | 88 | 124 — the running shoulder-charge |

**The travel is the move's, and it ends when the move does.** These were
`keepMomentum` — no friction at all — with a lunge kick added *on top of* the
run: a light press at a run opened at 902 px/s against a 452 px/s run, held
that flat for the whole 0.6 s, and ended still doing 902. That is 556 px of
swing and 481 px of free coast after it, 1037 px in total across a 784 px
platform, so one light press crossed the stage. It was also backwards — *holding*
the direction travelled less (670 px), because only the held branch clamps to
the run speed. Three changes, and the numbers now run the way round a player
would guess:

- The kick is smaller (150 → 88, 210 → 124), so the move opens at ~1.6× the run
  rather than ~2×, and the swing covers ~60% of what it did.
- It is a **lunge**, so it decays as it goes and the ledge brake stops it at the
  lip like any other unheld movement.
- It **plants** when the action ends, unless the stick is still asking to go
  that way — the travel belongs to the move, the run after it is a decision, and
  taking one used to imply the other.

A mid-speed mech's light dash attack goes 1037 px → 332; the heavy 1028 →
468. Holding
forward still runs out of it (708 px). This follows Smash, which cut most of
this carryover in *Ultimate*: dash attacks there inherited "a large amount of
momentum from the prior dash" in earlier games, and only a few still do
([SmashWiki](https://www.ssbwiki.com/Dash_attack)). Measured with
`tools/debug/measure_dashattack.mjs`; guarded in `tools/smoke_ledge.mjs`.

`keepMomentum` survives on the two actions it was really for — the **roll**,
which sets a constant velocity to cover exactly `ROLL_DIST` (216 px, stopping
43 px later), and the **dash grab**, which spends the run the player built
themselves. Neither picks a speed the player did not.

Both draw the `attack_dash` state: one committed lunge per fighter, serving
the light and the heavy alike because the distinction is one a player reads
from the hit rather than the frame. A mech whose rig maps no dash-attack clip
falls back to its standing strike (`inheritClips` in the render3d manifest).

A smash cannot be charged at a run: a charge is a fighter standing still
deciding to, so the heavy button out of a dash commits to one uncharged swing
instead of stopping the sprint dead. Nothing was lost from the standing game —
the side tilt is still one flick of the right stick away. `tools/audit_hitboxes.mjs`
checks the trade holds for every fighter: a dash attack that recovered faster or
hit softer than the move it replaces would simply retire the standing game.

### Heavy attacks (slow, chargeable, shield-hungry)
- Hold heavy to **charge** up to 0.8 s → up to +55% damage and +25% launch.
- **Side smash** — the KO button. **Up smash** — vertical KO. **Down smash**
  ("quake") — hits both sides along the ground. One **air heavy**.

### Specials & ultimates
Three specials per character (neutral / side+special / down+special) built from
shared primitives — projectiles, ground waves, dash strikes, traps, counters,
command grabs, installs, teleports, feints. Specials have individual cooldowns
(0.8–7 s) and spend the self-recovering **inherent energy** pool on top
(30 by default; see Controls).

### Spoken moves wind up while they are spoken

The engine supports **announced moves**: a move with a spoken line does not
happen on the frame you press the button — the fighter holds the move's pose,
says the line, and the move lands **80% of the way through it**
(`SPOKEN_TIMING` in `src/config_audio.js`, clamped to 0.35–2.2 s). The first
**50% of the line** is an interruptible commitment window: land a hit inside
it and the move never happens and nothing is spent (no cooldown, no meter);
after it the move goes off regardless. Being cut off is legible — the line
stops mid-word, a `CUT OFF` popup appears, and the caster keeps their
resources but loses the tempo.

The delay is frame data, not decoration: it is read from the lengths written
in `SPOKEN_LINES`, never measured from the audio, so a move behaves
identically with the sound off. `node tools/check_voice.mjs` fails if a
written length drifts from its file.

No mech kit carries a spoken line yet — the JJK voice bank is being replaced
(plan task K2) — so today every move fires on the press. The machinery stays
because it is how ultimate call-outs will be staged when the mech voice
lines land.

### Summons, and steering them

Three ultimates put a persistent creature on the stage rather than a hitbox —
Fenrir's **WILD HUNT**, Saurion's **RAPTOR PACK** and Jerry's **FLEA CIRCUS**
(`type: "summon"` in `src/characters.js`, run by `src/summons.js`). Summons
are lifetime-limited, capped per caster, and die with their owner.

**Arriving and leaving is a whole beat of its own.** A summon does not blink
into existence: it forms in the air over its landing point, fades up out of
nothing, and drops in, and only the landing makes it real — until its feet are
down it cannot hit anything and nothing can hit it. Leaving is the same in
reverse. For the last **1.5 s** of its lifetime it **flashes**, slowly at first
and then frantically; then it fades out and dissipates upward. A summon that
was **killed** instead bursts on the spot with no flash and no fade — the
difference between a timer running out and an opponent taking your pack-mate
apart should be visible from across the stage.

**A summon has two boxes, the way a fighter does.** What it can be **hit on**
is the whole drawing — measured off its own resting pose at 85% of the drawn
rectangle (`derivedBox` in `src/summons.js`); a kit can still author the pair,
which is how you say "the drawing cannot be trusted for this". What it hits
**with** is separate and leads: unplaced, it is the leading 44% of the
creature's length. Turn on debug hitboxes to see both: white is what it is hit
on, red is what it hits with. (No mech summon has delivered art yet, so all
three currently draw the procedural energy body at their kit's declared size —
`SUMMON_ART` in `src/config_summons.js` is where art registers when it lands.)

**Hitting one moves it.** A blow **staggers** a summon: shoved along the line
of the attack, thrown off its behaviour for a beat, popped off the floor if
the hit was heavy. It is deliberately *not* a fighter's knockback — clamped to
the stage, no launch angle, no percent scaling — so a summon can be pushed
around and never off.

Each one **hunts on its own** the moment it lands, so casting one costs no
attention. Push the **D-pad** and you take it over instead — it goes where you
point until the pad has been centred for 1.2 s, then resumes hunting. A driven
summon is marked with a white chevron and moves 15% faster than a hunting one.
Steering is movement only — attacks stay automatic — and all of a player's
live summons answer the same pad, so a pack drives as a pack. Grounded
summons get one jump per push of up and fast-fall on down. CPU fighters do
not pilot; their summons always hunt.

**The energy meter** (0–100): builds from dealing damage (×0.5), taking
damage (×0.85), and slowly over time (+1.1/s). At 100, the ultimate button
(LB) spends it all on the mech's **cinematic ultimate** — a meteor, a storm,
an install, a summoned pack. Ultimates are the comeback valve: getting beaten
up funds yours faster. (This attack meter is separate from the smaller
self-recovering **inherent energy** pool that prices ranged shots and
specials.)

## 5. Status effects

| Effect | Source | What it does |
|---|---|---|
| Burn | Inferno's fire kit, lava/acid hazards | % ticks that stack the heat on |
| Bleed | Saurion | % ticks for 3.2 s, only while moving fast |
| Armor | Installs (BUNKER, COLOSSAL FORM), heavy passives | No hitstun/knockback from hits (damage still counts) |
| Drench | Glacier, Cranky, Frogger, Jerry — and water hazards | Soaked: movement down to 84%, follow-up hits land 15% harder |

The engine's wider status vocabulary (snare, silence, gust, marks, poison,
blind…) is still implemented in `src/combat.js` — a kit applies one by naming
it in a move's `effect` — but only the four above are reachable from the
current mech kits and arenas.

## 6. Stages & camera

**12 arenas** (`src/stages.js`): one solid main platform (the lowest surface,
with grabbable ledges) plus drop-through platforms in a deliberate per-arena
archetype, each with its own painted 2048×1152 backdrop
(`assets/backgrounds/arenas/`), palette tint and music track. The full arena
designs — layouts, hazards, timings, telegraphs — live in
[arenas.md](arenas.md); `tools/audit_stage_reach.mjs` enforces the jump-reach
rules. The camera is dynamic Smash-style: it tracks the fighters' midpoint and
zooms with their separation (1.0×–1.18×), shakes with impact, and punches in
on KOs.

### Active Boards

Every arena also has a **gameplay identity** (`src/stage_fx.js`), toggled by
**Settings → Active Boards** (default on; off restores static layouts).
Design rules: hazards deal 4–8% with light, inward/upward knockback (never a
spike), everything dangerous is telegraphed ≥1 s, ledges always work, and a
hazard can never KO by itself. The CPU steps out of telegraphed zones. See
[arenas.md](arenas.md) for the per-arena hazard table.

## 7. Match structure & options

- Stock battle: 1 / 2 / 3 / 5 stocks (default 3).
- Match clock: none / 2:00 / 3:00 / 5:00 / 8:00 (default 5:00).
- **VS CPU** (Easy / Normal / Hard — reaction time, aggression, defense, and a
  damage handicap all scale) or **local multiplayer** — one gamepad per player,
  seated on sight, up to four.
- Pause (Start), Move List in the pause menu, hitbox debug on `` ` ``.

### Presentation styles

Two Settings entries change how the mechs are DRAWN, and nothing else — no
gameplay number moves, so a matchup plays identically whatever they are set to
(`src/render_backend.js` is the seam; `render3d/src/style.js` owns both
preferences and remembers them between sessions).

- **Animation** — *Smooth* (default) or *On Twos*. Smooth samples the clips the
  way Mech Mayhem plays them, at 30 Hz. *On Twos* is JJK Brawler's own frame
  style: clip time quantised to ~13 Hz so motion holds and snaps like limited
  animation drawn on twos, with the contact frame of every attack preserved
  exactly (a strike still shows the instant its hitbox goes live). Takes effect
  on the next frame drawn, mid-match included. `?frames=twos` pins it.
- **Shading** — *Neon Metal* (default) or *Anime Toon*. Neon Metal renders each
  mech's own baked metal/rough materials under an MM-style light rig and ACES
  grade — how these bodies were painted to look. Anime Toon is the engine's
  drawn pass: a two-band ramp with a painted shade tint, and ink outline
  shells. Materials are converted when a rig loads and the light rig is built
  when the scene starts, so this one takes a **page reload** — chosen out of a
  match it reloads immediately, and chosen mid-match it waits and says
  "(on restart)". `?render=toon` pins it.

### The clock, and sudden death

A stock match with no clock cannot be made to end: two players who refuse to
approach each other, or a CPU that has decided to keep its distance, run
forever. The limit is a backstop for that rather than the normal way a match
finishes — every option is longer than a fight that is actually being fought,
and "none" stays available for a friendly match that wants to keep going.

When it runs out the side ahead on **stocks** takes it, and on level stocks the
side that has taken **less damage**. A dead heat on both is played off instead
of being called a draw: the tied fighters get one stock each at 150%, the clock
stops, and the next clean hit ends it.

Both readings are per SIDE rather than per fighter, so a team match is decided
the same way it is won — `standings()` in `src/main.js` groups by `f.team`, and
a free-for-all gives everyone a side of their own so the same comparison
handles both shapes.

### The result screen

Every fighter's match is tallied on the fighter itself (`f.tally`, built in
`makeFighter` so a rematch clears it) and shown in finishing order: damage
dealt and taken, KOs, falls and best combo, ordered by the same stocks-then-
damage comparison the clock uses. In a Battle Royal that ordering is the
placement list — with eight fighters, "Titanus wins" otherwise leaves seven
players with no idea how they did.

A KO is credited to whoever last landed a hit within the previous four seconds.
Walking off the edge on your own therefore scores nobody a KO, which is the
honest reading of a self-destruct.

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
projectiles, summons, hazards — so teammates simply pass through each other.
A free-for-all gives every fighter a team of their own, which makes "different
team" and "different fighter" the same test, and the match ends when one side
is left standing rather than one fighter.

A match seats up to eight fighters (four players and four CPUs). Five or more
switches the HUD to its compact row, and in a team match each panel is tagged
with the side it fights for.

## 8. Controls

<!-- controls-table:start (generated by tools/check_controls.mjs — do not edit) -->
| Action | Gamepad |
|---|---|
| Move | Left stick |
| Jump | A |
| Crouch / fast-fall | Left stick ▼ |
| Light attack | X |
| Heavy attack (hold = charge) | Y |
| Ranged weapon (spends inherent energy) | RB |
| Special | RT or B |
| Dash | Shove the stick, or double-tap |
| Dash attack | Light or heavy, while running |
| Ultimate (at full attack energy) | LB |
| Shield / dodges | LT |
| Taunt | D-pad ▼ |
| Grab (direction throws · Light pummels) | D-pad ▲ |
| Tilt attacks (no run-up) | Right stick |
| Steer summons / aim creature shots | D-pad |
| Pause | Start |
<!-- controls-table:end -->

**This table is generated.** `src/config_controls.js` is the single control map:
`input.js` builds its snapshots from it, the in-game move list builds its pad
diagram and tips from it, and `tools/check_controls.mjs` (part of
`npm run check`) regenerates this table and README's from it and fails if either
has drifted. Change a binding there and everything that describes it follows —
`node tools/check_controls.mjs --fix` writes the tables.

**LB is the ultimate, RB the ranged weapon.** One shoulder each: LB spends a
full Energy bar on the mech's cinematic ultimate, RB fires the mech's gun —
its own kit slot with its own cooldown, priced in **inherent energy**, the
smaller self-recovering pool (`INHERENT_ENERGY` in `src/constants.js`: 100
max, 14/s regen; shots cost 4–22 per weapon, specials 30 by default;
movement, dash and shield are always free). The slim cyan bar under the meter
is that pool.

**The right stick throws tilt attacks.** Flick it and the fighter throws the
tilt in that direction on the spot — a side tilt without the run-up a light
press needs, an up or down tilt without holding a direction, or in the air the
aerial for that direction. Held rather than flicked it still angles a charging
side smash on release; a charging fighter cannot act, so aiming never becomes an
attack. Summon steering moved to the D-pad when the stick took this job.

**Special is B, and dash is a double-tap again.** Special spent one mapping on
the right trigger with dash on B, and it is back where it started: special is
pressed constantly and wants a face button under the thumb, while dash has a
motion — double-tap a direction — that has always worked and never needed a
button of its own.

**The right trigger is a second jump.** Not a new action: jump is the one input
a player wants while the thumb is already on an attack button, and the right
index finger is free at exactly that moment. A binding may name several buttons
(`PAD_BUTTONS` in `src/config_controls.js`); they merge by OR, and the first is
the one the pad diagram calls that action's home.

### Grabs & throws — on by default; `?throw=false` turns them off

The game has Smash's fourth option (`src/flags.js`, `src/grab.js`). **RT is
grab** — the flag takes the trigger back from the second jump, because grab
wants exactly the button a Smash player's index finger expects — and every
generated control surface (this table, the in-game pad diagram, the tips)
follows the flag, so with `?throw=false` nothing anywhere mentions grabbing.
The table above is generated with the flag at its default, which is the shipped
game.

The flag survives the graduation only so the game can be played without grabs
to compare; the mechanic itself is no longer experimental.

What it gives you:

- **Grab — RT, or Light while shielding (the shield grab).** Grounded only,
  a short reach with real startup and long whiff recovery. It completes the
  triangle: attacks lose to shield, **shield loses to grab**, and a whiffed
  grab is the most punishable move in the game.
- **Holding.** The victim is carried in front of the grabber. The hold's length
  scales with their damage (`GRAB` in `src/constants.js`) and drains faster for
  every button the victim mashes — at low damage they *will* break out of a
  lazy hold, shoving free with brief invulnerability while the grabber
  stumbles. Nobody can be re-grabbed for a beat after any release: there are
  deliberately no chain grabs.
- **Pummel — Light while holding.** Small damage on a cooldown; strictly worse
  than throwing unless you can afford the mash race.
- **Throws — a direction while holding.** Forward and back (tossed behind you)
  are the kill throws, up starts juggles, down is the low-knockback combo
  starter. All four route through `applyHit`, so DI, move staling, KO credit
  and the result-screen tally treat a throw exactly like any other hit. The
  three positional throws send about a quarter further than a charged smash
  does below roughly 35% damage; above that the smash's steeper growth passes
  them again, so none of them KOs earlier than a smash except back throw at the
  ledge, which is the classic reason to take somebody's back.
- **A landed hit breaks any grab** — striking the grabber frees their victim,
  and a third party hitting the victim knocks them loose (their pummel is the
  one exception).

The CPU plays along: it grabs shields, mashes out at its difficulty's rate,
and spends its own holds on throws. The grab states (`grab_reach`,
`grab_hold`, `grabbed`, the four throws) alias to clips the mech rigs already
have (`STATE_ALIASES` in `render3d/src/states.js`).

## 9. Hitboxes vs. visuals

Universal attack hitboxes are derived from each mech's `reach` profile
(`src/config_metrics.js`) and scaled so hit ranges land at the visuals plus a
small grace margin (`MELEE_GRACE`, checked by `tools/audit_hitboxes.mjs`).
Model-measured reach envelopes (`src/config_model_reach.js`, generated by
`tools/derive_attack_envelopes.mjs` from the rigs) refine that per mech where
they exist. Hold `` ` `` in a match to see live hitboxes (red) and hurtboxes
(white).
