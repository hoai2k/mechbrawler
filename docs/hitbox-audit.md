# Hitbox, range and sprite-size audit

Measured against the code, and read against how *Super Smash Bros.* (mostly
Ultimate) solves the same three problems.

> **Status: implemented.** Everything in the worklist at the end of this
> document has shipped except items 10 and 12 (hurtbox extension on
> non-disjointed attacks; clank/rebound on grounded trades), which are still
> proposals. **§5 at the bottom records what the numbers are now** and how to
> re-measure them.
>
> The survey below is kept in its original form, in the past tense where the
> code has moved on, because the measurements are the argument. Run
> `node tools/audit_hitboxes.mjs` for the live figures — it is the same audit
> against the running code, and it fails loudly if any of it regresses.

**How the numbers were taken.** Hitbox extents come from `moves.js`
(`REACH_SCALE = 0.62`, plus each move's `ox`/`w`). Art extents come from the
alpha bounding box of every character's attack frames in
`sprites/assets/manifest.json`, put through the same scale solve `heights.js`
runs (`heightSpans` / `headHeights` → `scale`), so they are in the same world
pixels the hitboxes are. Hurtboxes come from `hurtbox()` in `combat.js`.

---

## 0. The three-line summary

1. **Hitboxes reach about 2.1× as far as the art**, and the size of that lie
   varies 1.55×–2.89× *per character* — so the same 20 px of spacing is a hit on
   Yuta and a whiff on Reggie, for no reason a player can see.
2. **Range variance is essentially zero** (1.13× across the whole roster) and it
   is **uncorrelated with everything it should trade against** — startup
   correlates at −0.08, damage at 0.18, run speed at *+0.24* (the wrong sign).
   Smash's central balance axis is missing.
3. **Vertical is a single flat number for everyone.** One 64×108 hurtbox for a
   153 px Momo, a 192 px Hanami and a 222 px Mahoraga; every attack's vertical
   offsets are absolute constants unscaled by character size; and a hard
   `vy -= 120` on every launch makes low launch angles physically impossible.

---

## 1. Matching hitboxes and ranges to sprites

### What Smash does

Smash's hitboxes are **bone-attached**. Each one is a sphere (interpolated into
a capsule between frames) parented to a joint in the skeleton with a local
offset, so when the animation swings the arm, the hitbox goes with it — the
authoring unit is "a sphere at the end of the sword", not "a rectangle in front
of the character". The consequence is that a hitbox *cannot* drift from the
pose, because it is bolted to the pose.

Hurtboxes work the same way: a stack of capsules on the same bones. That is why
a crouching Fox genuinely ducks under things, and why an extended jab arm is
itself a hurtbox you can be hit out of.

The gap between the art and the hitbox is where **disjoint** lives, and Smash is
deliberate about it: a sword hitbox extends past the blade only slightly, and
the moves that reach well past the model (Ike, Shulk, Corrin) are *paid for* in
startup and endlag. The art always leads the box, never trails it by 2×.

### What this game does

Melee hitboxes are axis-aligned rectangles at a fixed offset from the fighter's
foot line, spawned by `spawnMelee` and evaluated by `hitboxRect`:

```js
const x = facing === 1 ? o.x + hb.ox : o.x - hb.ox - hb.w;
return { x, y: o.y + hb.oy, w: hb.w, h: hb.h };
```

They follow the owner's `x` but not the animation at all — one static box for
the whole active window. `moves.js` already knows about the mismatch:

```js
const REACH_SCALE = 0.62;          // pulls v1 reach numbers back toward the art
export const VISIBLE_ART_REACH = 94;
```

and `strikeArcs` draws a crescent of energy out to the hitbox's real edge to
cover it. That arc is a good idea and it is doing real work. It is also the only
thing holding the seam together.

### Measured: art forward extent vs. hitbox tip

Forward extent is the furthest painted pixel ahead of the fighter's centre line,
taken as the max over `attack_light_a/b` and `attack_heavy_a/b`. Hitbox tip is
`ox + w` for the side heavy.

| Fighter | Art reach | Heavy tip | Gap | Ratio |
|---|---|---|---|---|
| reggie | 60 | 173 | 113 | **2.89×** |
| gakuganji | 61 | 171 | 110 | 2.81× |
| todo | 65 | 172 | 107 | 2.64× |
| gojo | 68 | 169 | 102 | 2.51× |
| meimei | 70 | 176 | 106 | 2.52× |
| sukuna | 72 | 177 | 104 | 2.44× |
| inumaki | 66 | 166 | 99 | 2.50× |
| nobara | 71 | 169 | 99 | 2.40× |
| jogo | 71 | 169 | 98 | 2.38× |
| uro | 73 | 168 | 96 | 2.32× |
| toji | 84 | 187 | 103 | 2.23× |
| mahito | 78 | 171 | 92 | 2.17× |
| yuji | 79 | 171 | 91 | 2.15× |
| hakari | 79 | 168 | 89 | 2.14× |
| megumi | 81 | 171 | 90 | 2.11× |
| geto | 83 | 173 | 90 | 2.09× |
| nanami | 84 | 173 | 89 | 2.05× |
| panda | 92 | 176 | 84 | 1.91× |
| choso | 93 | 172 | 79 | 1.85× |
| maki | 102 | 184 | 82 | 1.81× |
| momo | 102 | 174 | 72 | 1.71× |
| hanami | 107 | 178 | 71 | 1.66× |
| yuta | 113 | 176 | 62 | **1.55×** |

Art reach spans **60–113 px (1.89×)**. Hitbox tips span **166–187 px (1.13×)**.
The two are effectively uncorrelated, so the invisible margin is between 62 and
113 px depending on who you picked.

`VISIBLE_ART_REACH = 94` is a single global constant standing in for that
column. It is right for nobody: too generous for 15 of 23 fighters, too mean for
5. The sprite workbench draws its range targets from the same number, so both
tools agree on a figure that is wrong per character.

### Recommendations

**1a. Measure art reach per character and per pose, offline, like everything
else.** `tools/bake_anchors.py` already measures `bodyTop`, `bodyBottom` and
`com` into the manifest. Add `reachX` — the furthest forward opaque column of
each attack frame, in cell space. It is the same alpha-bbox pass that produced
the table above, and it costs one extra field per frame.

Then `VISIBLE_ART_REACH` becomes a function, not a constant:

```js
export function artReach(charKey, frameKey) {
  const meta = frameMeta(charKey, frameKey);
  return (meta.reachX - CELL_W / 2) * scaleOf(charKey) * (meta.renderScale || 1);
}
```

**1b. Derive `reach` from the art instead of authoring it by hand.** Right now
`reach` is a hand-typed number per character in `characters.js` and
`REACH_SCALE = 0.62` is a global fudge that pulls all of them toward the
sprites at once. Invert it — make the *hitbox* a function of the measured art
plus an explicit, per-move grace margin:

```js
// moves.js
const GRACE = { jab: 18, side: 24, sideHeavy: 34, air: 22 };
function reachOf(char, variant) {
  return artReach(char.key, attackFrame(char, variant)) + GRACE[variant];
}
```

This is the single highest-value change in the document. It makes the
lie **constant** (~25 px of forgiveness for everyone) instead of varying 62–113
px, it makes range a *property of the art* so redrawing a pose retunes the move,
and it deletes `REACH_SCALE` — a global multiplier nobody can reason about.

The cost is that range stops being a free balance dial. See §2: that is a
feature.

**1c. Let the hitbox move through the swing.** A static rectangle for the whole
active window is why the box has to be so wide in the first place — it has to
cover everywhere the arm *will* be. Give `spawnMelee` an optional end offset and
lerp:

```js
// in updateHitboxes, before building the rect
const t = clamp(hb.age / hb.dur, 0, 1);
const ox = hb.ox + (hb.ox2 ?? hb.ox - hb.ox) * t;
```

A jab that starts at `ox: 42, w: 60` and travels to `ox: 96` covers the same
ground as today's `ox: 42, w: 114` box, but only where the fist actually is at
that instant. `STRIKE_ARC.reachIn` / `reachFrom` already animate the *arc*
outward over the active window — this makes the box agree with the picture the
arc is already drawing.

**1d. Grow the hurtbox into a non-disjointed attack.** Today `hurtbox()` is
identical whether you are standing still or three frames into a haymaker, so
every attack in the game is a free disjoint: there is no such thing as being hit
out of a punch by a longer punch. In Smash this is exactly the risk that makes
range meaningful.

Tag each character's melee as `disjoint: true` (Maki's naginata, Toji's spear,
Nanami's blade, Mei Mei's axe, Gakuganji's guitar, Momo's broom) or false (every
fist user), and for the false ones widen the hurtbox forward by ~60% of the
hitbox's reach during the active window. Weapon users keep the clean disjoint —
which is then a real, legible characteristic instead of flavour text.

**1e. Keep the strike arc regardless.** It is the right call and it should stay.
But once 1a–1c land, its job changes from "explain a 100 px lie" to "sell a 25
px one", and `STRIKE_ARC.echoes` (currently 3 faint copies dragging the eye
across the gap) can probably drop to 1–2.

---

## 2. Balancing variance in hitboxes and ranges

### What Smash does

Range is Smash's **primary** balance axis, and it is priced. Marth's f-smash
reaches roughly three times as far as Kirby's; Ike out-ranges Fox by a wide
margin. Every one of those characters pays in one or more of:

- **startup** — long-range moves come out slower;
- **endlag** — and are far more punishable on whiff;
- **sweetspot geometry** — Marth's tipper does its real damage only at the last
  few pixels of the blade, so the range is conditional on spacing correctly;
- **mobility** — Ike, Ganondorf, and the other big-disjoint characters are slow;
- **kit shape** — swordfighters historically have no projectile, or a bad one.

And critically: **the variance is enormous.** Character identity in Smash *is*
the range/speed/weight triangle. A roster where everyone reaches the same
distance has no spacing game.

### What this game does

| Metric | Roster spread |
|---|---|
| Heavy hitbox tip | 166 → 187 px (**1.13×**) |
| Light hitbox tip | 150 → 174 px (1.16×) |
| Heavy damage | 14 → 18 (1.29×) |
| Run speed | 356 → 468 (1.31×) |
| Weight | 0.88 → 1.28 (1.45×) |

Range is the *flattest* stat in the game, and it is the one that should be the
sharpest.

Worse, it does not trade against anything. Correlations across the 23 fighters,
using side-heavy tip vs. startup (`0.15 / p.speed`), damage, run speed, weight
and canon height:

| Pair | r | Should be |
|---|---|---|
| reach ↔ startup | **−0.08** | strongly positive |
| reach ↔ damage | 0.18 | ~0 or negative |
| reach ↔ run speed | **+0.24** | negative |
| reach ↔ weight | 0.16 | either |
| reach ↔ canon height | 0.21 | positive |

A correlation of −0.08 between reach and startup means longer-ranged moves come
out very slightly *faster*. There is no spacing trade in the game at all.

The clearest symptom is **Toji**: longest reach on the roster (187 px tip),
joint-fastest heavy startup (143 ms), second-fastest run speed (465), average
weight. He is not slightly ahead on the range axis — he has no drawback on it.
Maki is the same shape one notch down. Meanwhile Inumaki has the shortest reach
(166) at *median* startup and below-median damage, paying for range he does not
have.

Note also that reach barely tracks canon height (r = 0.21): Momo, 150 cm and the
smallest fighter drawn, has a 174 px tip — longer than Gojo (169) and Panda
(176 at 200 cm, essentially the same).

### Recommendations

**2a. Widen the spread deliberately, to about 1.5×.** Not Smash's 3× — this is a
brawler with a 1280-wide stage and a much denser roster — but 1.13× is
indistinguishable from "no variance". Target roughly 140 px (shortest) to 210 px
(longest) on the heavy tip. If §1b lands, most of this falls out of the art for
free: art reach already spans 1.89×, which is close to the target spread on its
own. **The art already has the variance the mechanics threw away.**

**2b. Price range in startup and endlag, explicitly.** Make the trade a formula
rather than a hope, so it cannot silently drift:

```js
// moves.js — startup and recovery scale with how far the move reaches
const REACH_REF = 175;                       // roster median tip
const priced = (base, tip) => base * (1 + (tip - REACH_REF) / REACH_REF * 0.55);
delay:   priced(0.15, tip) / s,
recover: priced(0.30, tip),
```

At 0.55 elasticity, a 210 px tip costs ~11% more startup and endlag than a 140
px one — modest, but it makes the sign correct, and the constant is one number
to tune. Then audit the residual: any character sitting well above the line on
both reach *and* speed (Toji today) is a deliberate top-tier decision, not an
accident.

**2c. Generalise `critBand` into a proper sweetspot system.** This is the
highest-leverage item in §2, because the hook already exists. Nanami's
`critBand: { center: 132, tolerance: 30 }` is a tipper — a distance band where
the hit is stronger — and `applyHit` already implements it:

```js
if (hit.critBand && Math.abs(dx - hit.critBand.center) <= hit.critBand.tolerance) crit = true;
```

Right now it is one character's gimmick applied uniformly (×1.36 dmg, ×1.22 kb).
Promote it to a per-move field that can specify its own multipliers, and use it
as the *standard* way long-range moves are paid for:

```js
critBand: { center: 168, tolerance: 22, dmg: 1.4, kb: 1.3, sourDmg: 0.7, sourKb: 0.6 }
```

A long-reaching weapon then hits hard only at the tip and weakly up close —
which is Marth exactly, and it makes range a skill expression rather than a
stat. Nanami's 7:3 flavour survives intact; it just stops being the only one.

**2d. Add hitbox clank / rebound on grounded trades.** Smash rebounds two
grounded attacks whose damage is within 9% of each other. Nothing here handles
two hitboxes overlapping — both simply land, so trading is always mutual and
range never gets tested head-on. A clank check in `updateHitboxes` (both owners
grounded, both boxes overlapping, damage within ~15%, both bounce and go to
recovery) makes the range battle actually resolve.

**2e. Stop conflating "reach" with "hitbox height".** `moves.js` scales *every*
dimension of a move off the same `reach` number: `w: r(p.reach)`, and for
up-tilt `oy: -196, w: r(p.reach) * 0.9, h: 130`. A long-reaching character
therefore also gets a *wider up-tilt*, which is not what "reach" means and quietly
compounds the imbalance. Split the profile into `reach` (forward) and `sweep`
(vertical/lateral coverage) so the two can be tuned apart.

---

## 3. Vertical sizing and attack angles

This is the weakest of the three areas and has the most headroom.

### 3.1 One hurtbox for a roster that spans 1.45×

```js
export function hurtbox(f) {
  if (f.ledge)                 return { x: f.x - 30, y: f.y -  82, w:  60, h:  84 };
  if (f.prone > 0 && ...)      return { x: f.x - 54, y: f.y -  44, w: 108, h:  44 };
  if (f.crouching)             return { x: f.x - 36, y: f.y -  68, w:  72, h:  68 };
  return                              { x: f.x - 32, y: f.y - 108, w:  64, h: 108 };
}
```

No reference to `f.char` anywhere. Measured against what is actually drawn:

| Fighter | Drawn height | Idle width | Hurtbox | Head above hurtbox |
|---|---|---|---|---|
| mahoraga | 222.0 | 234 | 64×108 | **114 px** |
| hanami | 191.9 | 99 | 64×108 | 84 px |
| panda | 180.8 | 92 | 64×108 | 73 px |
| gojo | 175.3 | 54 | 64×108 | 67 px |
| jogo | 169.8 | 121 | 64×108 | 62 px |
| yuji | 165.9 | 51 | 64×108 | 58 px |
| momo | 153.2 | 70 | 64×108 | 45 px |

Two separate problems fall out of this.

**Vertically, the hurtbox covers only 58–70% of every fighter.** The head and
upper chest — 45 to 84 px of painted character — are not hittable by anything.
This is not a subtle miss: it is the top third of the sprite. A move aimed at
head height passes cleanly through the head. `docs/character-heights.md` names
the constraint honestly ("hurtboxes are one size for everyone... a fighter drawn
much larger or smaller than their hurtbox reads as hitting through thin air")
and answers it by *compressing the art* toward the box (`HEIGHT_COMPRESSION =
0.6`). That is backwards — it is throwing away the roster's silhouette variety
to protect a constant.

Mahoraga is the extreme: an install draws a 222 px shikigami at `h = 210` in
`drawFighters` while the fighter underneath keeps the 108 px box. Half of
Mahoraga is scenery.

**Horizontally, the 64 px box is wrong in both directions.** Jogo's idle
silhouette is 121 px wide and Hanami's is 99 — attacks visibly pass through
them. Gojo's is 54 and Yuji's is 51 — they get hit through empty air on either
side.

**Recommendation 3a — derive the hurtbox from the character, and get rid of
`HEIGHT_COMPRESSION`.** The manifest already carries everything needed
(`bodyTop`, `bodyBottom`, per-frame alpha bounds, and the solved `scale`):

```js
export function hurtbox(f) {
  const H = headHeightTarget(f.spriteChar || f.charKey);  // real drawn height
  const W = bodyWidth(f.spriteChar || f.charKey);          // measured, banded
  if (f.ledge)      return { x: f.x - W*0.47, y: f.y - H*0.76, w: W*0.94, h: H*0.78 };
  if (f.prone > 0)  return { x: f.x - H*0.31, y: f.y - H*0.25, w: H*0.62, h: H*0.25 };
  if (f.crouching)  return { x: f.x - W*0.56, y: f.y - H*0.62, w: W*1.12, h: H*0.62 };
  return            { x: f.x - W*0.50,        y: f.y - H*0.86, w: W,      h: H*0.86 };
}
```

`0.86` rather than `1.0` because the very top of an anime silhouette is hair,
and Smash does not put a hurtbox in hair either. Band the width into three or
four buckets (58 / 68 / 80 / 96) rather than using the raw measurement, so a
sprite touch-up cannot silently change a matchup. Once the hurtbox tracks the
art, `HEIGHT_COMPRESSION` has nothing to protect and can go to 1.0 — the roster
gets its real 1.47× height spread back, which is free character identity.

Cache the result per character at load, in the same pass `applyAllHeightScales()`
already runs.

**Recommendation 3b — a hurt state should have a hurt hurtbox.** The crouch and
prone cases prove the pattern is welcome; the measured `hurt` pose is 159 px
tall and 100 px wide (versus 175×73 idle) — a fighter doubled over by a hit is
lower and wider than one standing, and the box does not know.

### 3.2 Attack vertical offsets are absolute, not scaled

Every `oy` in `moves.js` is a hard constant: jab `-92`, up-tilt `-196`, up-smash
`-226`, down-air `-8`. None is multiplied by the character's size.

Consequences, given the 153–192 px height spread:

- Momo (153 px) up-smash spans −226…−66. Her head is at −153. The top **73 px of
  her own up-smash floats above her head** — a third of the box is drawn nowhere
  near her art.
- Hanami (192 px) gets the same box, which lands correctly at head-and-above.
- Jab at `oy: -92` sits at 60% of Momo's body (chest) and 48% of Hanami's
  (stomach). The same "jab" is a different attack depending on who throws it.

**Recommendation 3c.** Scale vertical geometry by the character's height ratio,
exactly as `heights.js` already scales the art:

```js
// moves.js
const vy = (px, char) => px * (headHeightTarget(char.key) / HEIGHT_BASE_PX);
...
ox: -r(p.reach) * 0.5, oy: vy(-226, char), w: r(p.reach), h: vy(160, char),
```

This is a small diff with a large readability payoff, and it is a prerequisite
for 3a — once hurtboxes are per-character, hitboxes that are not will produce
new mismatches.

### 3.3 Launch angles: `-120` makes low angles impossible

```js
target.vy = -Math.sin(Math.abs(angle)) * kb - 120;
target.grounded = false;
```

Every non-spike hit adds a flat 120 px/s of upward velocity on top of the angle,
and every hit sets `grounded = false`.

Work the numbers on a down-tilt (`angle: 0.14` — a deliberate 8° near-horizontal
poke, `baseKb: 250`) landing on a fresh opponent at ~10%:

- `kb ≈ (250 + 10 × 5.0) / 1.0 = 300`
- `vx = cos(0.14) × 300 = 297`
- `vy = −sin(0.14) × 300 − 120 = −42 − 120 = −162`
- effective launch angle: **atan(162/297) = 29°**, not 8°.

The authored angle is overwhelmed by the constant. At low knockback the `-120`
*is* the launch. Which means:

- **There is no such thing as a low, horizontal hit** — every angle below ~30°
  collapses to ~30°.
- **There is no such thing as a grounded hit.** `grounded = false`
  unconditionally, so the victim is always airborne after being struck. That
  removes an entire layer Smash relies on: jab-locks, tech-chasing, low-percent
  grounded strings, and the whole reason down-tilt exists as a move category.
- **`angle` is the least effective dial in the file.** Light angles span
  0.24–0.34 rad (14–19°) across the roster — a distinction the `-120` erases
  entirely.

**Recommendation 3d — replace the flat `-120` with a pop only where it is
needed.** Its real job is to unstick a launched fighter from the floor so
collision does not immediately re-ground them. Do that conditionally:

```js
const vy = angle < 0 ? Math.sin(-angle) * kb : -Math.sin(Math.abs(angle)) * kb;
const launched = Math.abs(vy) > GROUND_RELEASE;   // ~140
target.vy = vy;
if (launched) target.grounded = false;
else if (target.grounded) { target.vy = 0; target.vx *= 1.15; }  // slide, stay down
```

A hit that is not strong enough to lift you leaves you grounded and sliding, and
the authored angle survives. This one change makes every low-angle move in the
game mean what it says.

**Recommendation 3e — implement the Sakurai angle.** Smash's angle 361 launches
grounded targets nearly horizontally and airborne targets at ~44°, and it is the
angle on most jabs, tilts and multi-hits. It is what makes those moves combo at
low percent and push out at high percent without needing two separate moves. It
is about six lines here:

```js
// combat.js — resolve before diAngle
function resolveAngle(hit, target, kb) {
  if (hit.angle !== SAKURAI) return hit.angle;
  if (!target.grounded) return 0.77;                 // ~44°
  return kb < SAKURAI_KB_THRESHOLD ? 0.0 : 0.44;     // slide low, then pop
}
```

Then set `angle: SAKURAI` on the jab chain, the light side tilt and the down
tilt in `moves.js`, and those three moves immediately behave like Smash's
equivalents at both ends of the percent range.

### 3.4 Only four attack directions, from digital input

`fighter.js` picks a variant from four booleans:

```js
variant = input.down ? "downAir" : input.up ? "upAir" : "air";
```

Meanwhile the right stick is already read and plumbed (`ownerStick`,
`input.aimX/aimY`) — it steers projectiles and summons. Nothing angles a melee
attack.

**Recommendation 3f — angleable smashes.** Smash lets you tilt a forward smash
up or down, which is most of the vertical mixup in the grounded game. There is a
clean version here that costs one field: when `f.charging` is a side heavy and
the stick is held off-horizontal at release, rotate the hitbox's offset and its
launch angle:

```js
const tilt = clamp(-input.aimY ?? dirY, -1, 1) * SMASH_TILT;   // ~0.35 rad
move.oy += Math.sin(tilt) * -move.ox;
move.angle += tilt * 0.6;
```

Three attacks (up / neutral / down f-smash) out of one, and the strike arc
follows for free because `strikeArcs` reads the box.

### 3.5 Platform gaps are inconsistent with vertical reach

Stage platforms sit 116–144 px above the main floor depending on the stage
(`stages.js`: Training Bridge 568→424 = 144; Shibuya Night 566→452 = 114).

Up-smash reaches `oy: -226`, so its box spans −226…−66 from the attacker's feet.
An opponent standing on a platform `g` px up has a hurtbox from `−g−108` to `−g`:

- `g = 114` → hurtbox −222…−114, box −226…−66 → **overlaps, hits through.**
- `g = 144` → hurtbox −252…−144, box −226…−66 → **no overlap, cannot hit.**

So whether up-smash is a platform-pressure tool is decided per stage, by
accident. Smash tunes Battlefield's platform height very deliberately against
specific up-tilts — the point is that it is a *decision*.

**Recommendation 3g.** Pick a rule and enforce it in `stages.js`: either
standardise the low platform tier to one height (~120 px) so up-smash always
threatens it and up-tilt never does, or keep the variety and make it a stated
stage characteristic. Either is fine; the current state is neither. Note this
gets worse, not better, once 3a and 3c land — per-character vertical reach will
mean some fighters can pressure a platform and others cannot, which is *good*
only if the platform heights themselves are intentional.

### 3.6 Smaller vertical notes

- **Spikes against grounded targets silently invert.** `if (angle < 0 &&
  !target.grounded)` — a meteor that connects with someone standing on the floor
  falls through to the `else` branch and launches them *upward*. Smash grounds
  them into a bounce instead. At minimum this should be its own case.
- **Hitstun caps at 1.35 s** (already flagged in `combat-feel.md` item 7). With
  DI shipped, the cap can go — DI is the counterplay, and the cap is what makes
  high-percent launches feel oddly brief.
- **The ledge hurtbox is 60×84 against a 238 px ledge-hang pose.** The pose is
  anchored by its grip hand rather than its feet, so this is a different
  coordinate problem from the rest, but the box is currently unrelated to the art
  by a factor of nearly 3.
- **The debug view is good and under-used.** `state.debugHitboxes` (toggled in
  `main.js`) draws hitboxes and hurtboxes over the fighters. Everything in this
  document is checkable by eye with that toggle on — worth mentioning in the
  audit guide, and worth extending to draw the *art* bbox alongside the boxes
  once §1a bakes it.

---

## 4. Suggested order of work

Ordered by value-per-diff, and dependency-correct:

| # | Change | Section | Size |
|---|---|---|---|
| 1 | Flat `-120` → conditional ground release; grounded hits stay grounded | 3d | small |
| 2 | Sakurai angle on jab / side tilt / down tilt | 3e | small |
| 3 | Scale attack `oy`/`h` by character height | 3c | small |
| 4 | Bake `reachX` per attack frame in `bake_anchors.py` | 1a | medium |
| 5 | Derive `reach` from measured art + per-move grace; delete `REACH_SCALE` | 1b | medium |
| 6 | Per-character hurtbox from manifest; `HEIGHT_COMPRESSION` → 1.0 | 3a | medium |
| 7 | Price reach into startup/endlag; re-audit outliers (Toji, Maki, Inumaki) | 2b | medium |
| 8 | Generalise `critBand` into sweetspot/sourspot | 2c | medium |
| 9 | Travelling hitboxes (`ox` → `ox2` lerp) | 1c | medium |
| 10 | Hurtbox extension on non-disjointed attacks | 1d | large |
| 11 | Angleable smashes off the right stick | 3f | medium |
| 12 | Clank / rebound on grounded trades | 2d | medium |
| 13 | Standardise platform tier heights | 3g | small |

Items 1–3 are each under ~20 lines and change how the game feels immediately.
Items 4–6 are the structural fix and should go in as one arc, because 6 without
5 will make the art/box mismatch *more* visible, not less.

---

## 5. What shipped, and what the numbers are now

Everything above except items 10 and 12. Run `node tools/audit_hitboxes.mjs` for
the live figures; `node tools/smoke_combat.mjs` plays a real CPU match and checks
the result. Both fail loudly rather than printing a wrong number quietly.

### The new chain

```
sprite art
  -> tools/bake_anchors.py     bodyLeft/bodyRight  how far a frame REACHES
                               coreLeft/coreRight  how wide the BODY is
  -> src/silhouette.js         reach / width / height / crouch, per character
  -> src/moves.js              hitboxes  = art reach + MELEE_GRACE
     src/combat.js             hurtboxes = measured body × HURTBOX fractions
```

`REACH_SCALE` and the per-character `reach` numbers in `characters.js` are gone.
`VISIBLE_ART_REACH` is now `visibleArtReach(char)` — a measurement, not a
constant.

### Resilience, because the art is in flux

The point of the rework is that art drives gameplay, and the risk of it is that
art *churn* drives gameplay. Five things stop that (`src/silhouette.js`):

1. **Aggregates, never one frame.** Reach is the second-furthest of a
   character's swing poses — the furthest is discarded, because the furthest
   frame is exactly the one most likely to be an outlier. Width is a median.
2. **Placed art only.** A frame is skipped unless the manifest's `edited` map
   shows it has been through the workbench's placement pass. A freshly delivered
   sprite sits at the intake pipeline's *guess* at its scale, and measuring off
   that would hand a character a range that changes the moment somebody opens
   the workbench. A fighter with no placed art at all is measured off the raw
   delivery and flagged `placed: false`.
3. **Banding.** Results round to 6 px (reach) and 4 px (width). Art has to move
   meaningfully before the simulation notices at all.
4. **Guards.** Everything is clamped to a fraction of the character's own
   height, so a broken export cannot produce a fighter who reaches across the
   stage.
5. **Fallbacks.** No measurable art falls back to the roster median, scaled to
   that fighter's height. A new character plays correctly before anyone has
   touched their sprites.

Width additionally trusts the art only `BODY.widthTrust` (0.45) of the way.
Heights can be read straight off the art because they were solved against a
common target; widths never were, and measured across the roster they span
0.21–0.50 of height — which is drawing style, not character. Round 14B is the
art that would let that number go up.

### The numbers

| | Before | Now |
|---|---|---|
| Grace margin (hitbox past the art) | 62–113 px, varying per character | **34 px, identical for everyone** |
| Heavy tip | 166–187 px (1.13× spread) | 100–142 px (**1.42×**) |
| reach ↔ startup correlation | −0.08 | **+0.89** |
| Hurtbox | 64×108 for the whole roster | 48–72 × 127–172, per character |
| Hurtbox vertical coverage | 58–70% of the drawn figure | **86%**, everywhere |
| Drawn height spread | 1.25× (compressed 0.6) | 1.36× (compression 1.0, clamps do the work) |
| Effective low-angle launch | ~29° minimum, always airborne | authored angle, grounded hits stay grounded |

Melee is about 30% tighter than it was. That is the correction, not a side
effect: the old boxes reached roughly twice as far as the art, and a punch now
connects at about two body-widths rather than three.

### New behaviour worth knowing about

- **Travelling hitboxes.** A forward box's far edge extends across the opening
  of its active window (`swingExtent`, `moves.js`) instead of existing at full
  length from frame one. The strike arc calls the same function, so the crescent
  is not an impression of the swing — it is where the swing has got to.
- **Sweetspots.** Nanami's `critBand` is now the general mechanism, and a
  character drawn reaching >1.12× the roster median earns a tip band
  automatically: strong at the very end of the arc, weak inside it. Currently
  Panda, Yuta and Hanami, plus Nanami's authored 7:3.
- **The Sakurai angle** (`SAKURAI` in `constants.js`) on the jab chain and down
  tilt — near-horizontal on a grounded target at low knockback, ~44° once the
  hit is strong enough to lift them.
- **Angled side smashes.** Hold the right stick off horizontal on release
  (`SMASH_TILT`); the box swings about the fighter and the launch angle follows.
- **The strike arc reads three things**: distance (radius, as before), strength
  (thickness, brightness and trail length, from damage and charge), and angle (a
  short arrow at the leading edge along the launch vector). Plus a bright ring
  at the sweetspot where a move has one.
- **The crouch box is measured**, not assumed. Most of the roster's crouch art
  does not currently duck, so most of the roster does not currently duck. Round
  13A/13B is the art that changes that, and it changes the mechanic with it.
- **The CPU's melee spacing is derived** (`meleeRange` in `ai.js`). The authored
  `profile.range` numbers were calibrated against the old fixed hitboxes; a CPU
  still using them for melee would stand exactly out of its own range.

### Still open

- **Item 10** — hurtbox extension on non-disjointed attacks. Every attack is
  still a free disjoint: there is no such thing as being hit out of a punch by a
  longer punch. This is the largest remaining gap and the one that would make
  reach a genuine risk rather than only a reward.
- **Item 12** — clank / rebound on grounded trades.
- **Item 13** — platform tier heights. The audit tool now reports which gaps
  each fighter can contest (41 by everyone, 17 by the tall ones only, 9 by
  nobody), so the mix is at least visible. It is not yet a decision.
- **Art.** Round 14 in [asset-requests.md](asset-requests.md) is what the
  measurements ask for: the reach numbers are now gameplay, and several
  fighters' committed swings do not extend.
