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
| **Walk** | **Partial stick tilt** (0.28–0.72) → 34–62% of run speed, scaled by how far you push. A keyboard has no axis and always runs |
| Run | Full tilt: per-character top speed (356–468 px/s) and acceleration |
| **Dash** | **Shove the left stick** out from centre (past 0.78 within 0.14 s of leaving the 0.36 rest zone), or double-tap a direction within 0.24 s → a 1.20× burst for 0.07 s (about 5 frames and ~45 px on Gojo — brief and uncommittal by design) |
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
specials both. The `dashStrike` specials — Hakari's
Restless Rush and the rest — set their own travel speed and used to carry
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
the body further than a full-speed **run** does (7.8 px at Gojo's 468 px/s):
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
where the art exists (round 22A), and otherwise the idle with a lean out over
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
run: a light press at a run opened at 902 px/s against Maki's 452 px/s run, held
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

Maki's light dash attack goes 1037 px → 332; the heavy 1028 → 468. Holding
forward still runs out of it (708 px). This follows Smash, which cut most of
this carryover in *Ultimate*: dash attacks there inherited "a large amount of
momentum from the prior dash" in earlier games, and only a few still do
([SmashWiki](https://www.ssbwiki.com/Dash_attack)). Measured with
`tools/debug/measure_dashattack.mjs`; guarded in `tools/smoke_ledge.mjs`.

`keepMomentum` survives on the two actions it was really for — the **roll**,
which sets a constant velocity to cover exactly `ROLL_DIST` (216 px, stopping
43 px later), and the **dash grab**, which spends the run the player built
themselves. Neither picks a speed the player did not.

Both draw `attack_dash`, a pose round 20D added to the semantic set: one
committed lunge per fighter, weapon leading, serving the light and the heavy
alike because the distinction is one a player reads from the hit rather than the
frame. A fighter without one falls back to their standing strike, which is what
the whole roster did until the round landed and is what Yuji still does.

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
command grabs, installs, teleports, gambles — plus bespoke signature logic
(Boogie Woogie's swap, Cursed Speech's throat strain, the Gorilla core, etc.).
Specials have individual cooldowns (0.8–7 s) instead of resource costs.

### Spoken moves wind up while they are spoken
Twelve moves in the game are **announced out loud** — Inumaki's three commands
and his ultimate, and the eight Domain Expansions. Those moves do not happen on
the frame you press the button. The fighter holds the move's own pose, says the
line, and the move lands **80% of the way through it** (`SPOKEN_TIMING` in
`src/config_audio.js`; clamped to 0.35–2.2 s, so Gojo's 3.28-second call-out
does not stall the match for its whole length).

This is frame data, not decoration.

**Speaking is a commitment, and the first half of the sentence is where you
answer it.** A spoken move is interruptible — with no invulnerability, Domain
Expansions included — but only for the **first 50% of the line**
(`SPOKEN_TIMING.commit`). Land a hit inside that window and the move never
happens: no barrier, no hitbox, no ultimate. Land one after it and the move
goes off anyway; by then it is already underway, and taking it back would read
as the game reneging on something it had visibly started.

For Gojo's 3.28-second call-out that is a 1.64 s window to punish, against a
move that lands at 2.20 s. For Inumaki's "Don't Move" it is 0.36 s.

**Being cut off is legible in both channels.** The line **stops mid-word**
(faded over 60 ms so it does not click), the fighter makes a short winded grunt
in its place, and a small puff and a `CUT OFF` popup appear at head height. No
screen shake and no flash — the hit that cut them off is the loud part, and the
move that didn't happen should not out-shout it.

**An interrupted move costs nothing.** Nothing is spent until the move actually
goes off:

| Move | Charged when it fires, not when it starts |
|---|---|
| Inumaki's specials | cooldown, and the throat strain toward his *cough* lock |
| Inumaki's ultimate | the full meter bar |
| Domain Expansions | the full meter bar |

So a fighter shouted down mid-sentence keeps their bar and their cooldowns and
can simply try again. What they lose is the tempo and the opening they gave
away — which is the real cost, and the thing that makes announcing a domain a
decision rather than a formality.

Two details follow from that:

- **Once the barrier lands, it cannot be taken back.** The 0.9 s opening pose
  after a domain's call is untouchable and uninterruptible, exactly as it was
  before this existed. The window you can punish is the first half of the
  *call*, not the domain.
- **A second domain cannot start during the first one's call**, even though the
  barrier is not up yet (`state.domainCasting`). An interrupted cast stops
  blocking the instant it is interrupted — the state remembers the action, not
  just the fighter, so there is nothing to clean up on a hit, a KO or a
  respawn.

**Inumaki is where this matters most.** "Blast Away" now has 0.91 s of wind-up
where it used to be instant, and his four moves are his whole kit. He is the
fighter to watch if the fraction ever needs tuning.

**The delay never depends on the audio.** It is read from the line lengths
written in `SPOKEN_LINES`, not measured from the sound, so a move behaves
identically with the sound off, the SFX slider at zero, or the file still
downloading. `node tools/check_voice.mjs` fails if a written length has drifted
from the file it describes — re-rolling a line changes the frame data.

Setting `SPOKEN_TIMING.fraction` to 0 restores the old behaviour, where
everything fired on the same frame as the shout.

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

**A summon has two boxes, the way a fighter does.** What it can be **hit on** is
the whole drawing — measured off its own resting pose at 85% of the drawn
rectangle rather than authored per creature, so a dog drawn 205 px long is a
205 px dog to hit. A kit can still state that box, which is how you say "the
drawing cannot be trusted for this", and seven creatures did: the ones whose art
arrived as a sheet of six figures, where measuring the drawing would have given
a box six creatures wide. Round 20A redrew those sheets, so all seven pairs came
out and **no creature is authored today**.

What it hits **with** is separate, because a dog bites with its head — being
brushed by a passing shikigami's tail should not cost 6.5%. That box is a
rectangle placed on the drawing in the sprite workbench and stored as fractions
of it, so it travels with the art. Unplaced it is the leading 44% of the
creature's length, which is the right end of every quadruped, serpent and hulk
in the pools; a bomber's is its whole body, since it detonates on contact and
what touches you is whichever part arrived first. Turn on debug hitboxes to see
both: white is what it is hit on, red is what it hits with.

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
attention. Push the **D-pad** and you take it over instead — it goes where you point until the stick has been
centred for 1.2 s, then resumes hunting. A driven summon is marked with a white
chevron and moves 15% faster than a hunting one.

Steering is movement only. Attacks stay automatic — chasers bite on contact,
bombers detonate, the support summon keeps firing on its cooldown — so driving
one never means abandoning your own fighter mid-combo. All of a player's live
summons answer the same pad, so Megumi's two dogs drive as a pack.

The vertical axis depends on what the summon is:

| Summon | Up | Down |
|---|---|---|
| Divine Dogs, Rainbow Dragon, Transfigured Human, Mahoraga (grounded) | **Jump** — one per push, lands on platforms like a fighter | Fast-fall |
| Inventory Curse (flyer) | Fly up | Fly down |

Holding up gives one jump, not a hover: the pad has to be released
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
him, with a damage-taken reduction while the shikigami is out — and the
D-pad drives Mahoraga exactly like any other summon if you would rather steer
him yourself. (He used to be a *transformation* Megumi wore, which put the
player in Mahoraga's body but took Megumi off the board. The transform machinery
is still in `config_transform.js` for the next fighter who needs a second body.)

### Steering creature projectiles

Two specials throw creatures rather than persistent summons, and the same pad
flies them: Megumi's **Nue** (neutral) and Geto's **Cursed Spirit Volley**
(neutral). Both are marked `steerable` in their kit config, which does two
things:

- **Aim on release.** Fire with the pad held and the shot launches along it
  instead of straight ahead. Geto's three curses keep their spread
  *perpendicular* to that heading, so an aimed volley fans exactly like a
  forward one, rotated.
- **Fly it after release.** Holding the pad turns the shot's flight path
  toward it at a limited rate (Nue 6.0 rad/s, the volley 4.6). Speed is
  preserved — steering redirects a shot, it never accelerates one.

While you are steering, the shot's own guidance stands down: gravity stops
(so a hand-flown Nue holds its line instead of dropping) and the volley's homing
yields to the pad. Let go and both resume, so an unsteered shot behaves
exactly as it always did.

Aiming is opt-in per press. Nothing changes for a player who never touches the
pad, and CPU shots are unaffected.

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
- Match clock: none / 2:00 / 3:00 / 5:00 / 8:00 (default 5:00).
- **VS CPU** (Easy / Normal / Hard — reaction time, aggression, defense, and a
  damage handicap all scale) or **local multiplayer** — one gamepad per player,
  seated on sight, up to four.
- Pause (Start), Move List in the pause menu, hitbox debug on `` ` ``.

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
placement list — with eight fighters, "Gojo wins" otherwise leaves seven
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
projectiles, summons, domains — so teammates simply pass through each other.
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
| Special | B |
| Dash | Shove the stick, or double-tap |
| Dash attack | Light or heavy, while running |
| Ultimate | RB |
| Domain Expansion | LB |
| Shield / dodges | LT |
| Grab (direction throws · Light pummels) | RT |
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

**LB opens a domain, RB fires the ultimate.** One shoulder each, so neither
super can be reached for and get the other. Domain used to be the whole D-pad,
which spent four buttons on a move only eight fighters have and none has two of
— a fighter who ever does have two picks between them by holding the left stick
up or down with LB (`domainSlotFor` in `src/domains.js`, which the controls
screen reads so the two cannot disagree).

**The domain button opens whatever domain you have.** Eight fighters have a
Domain Expansion at a full bar. Mechamaru and Yuki instead carry the New Shadow
Style's **Simple Domain** — a special, on its own cooldown, costing no meter —
and LB casts that for them, as well as Down+Special. It is a binding, not a
rebalance: nothing about the move changed.

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

The CPU plays along: it grabs shields, mashes out at its difficulty's rate, and
spends its own holds on throws. **The grab set is drawn** — round 20C delivered
`grab_reach`, `grab_hold` and `grabbed` for twenty-six of the twenty-seven, all
of them placing the grip at chest height so a hold reads as one action across
any pairing. Yuji is the exception and still reuses the nearest poses
([20E](asset-requests.md#20e-yujis-four-round-20-poses--4-sprites)), as does
every fighter for the four throws, which play the heavy attack swung that way on
purpose. The 2.5D and live-3D paths alias all seven states to clips they already
have (`STATE_ALIASES` in `render3d/src/states.js`).

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
