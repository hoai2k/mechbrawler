# Character heights — how big each fighter is drawn

## The problem

Every fighter's rendered size used to be a hand-set `scale` in `characters.js`,
sitting at 0.57-0.60 for the whole roster with no relation to anything. Gojo,
canonically the tallest sorcerer alive at 190 cm, was drawn **third smallest**.
Momo, who is tiny, was drawn taller than him. The sprite workbench's head-height
target was a measurement of whatever size the art happened to be — and for the
six most recent fighters it was missing entirely, so the control read `0`.

Size now comes from canon height.

## The chain

```
heightCm            characters.js   the real figure in cm, or null if unpublished
  -> heightRatio()  heights.js      compressed against Gojo, then clamped
  -> headHeightTarget()             rendered head height, in game pixels
  -> CHARACTERS[key].scale          what drawCharFrame is handed
```

`scale` is **derived**. The literals still in `characters.js` are a pre-load
fallback only — editing them does nothing. Change `heightCm`, or override the
target in the workbench.

The target names **the top of the head**, and it is met exactly: the scale is
solved against `bodyTop`, the topmost opaque row of the idle art measured
offline by `tools/bake_anchors.py`. Measured across the roster, every idle's
painted top lands within 0.6 game pixels of its bar.

Because the idle's foot line is part of that span, moving the idle's **ground
contact** re-solves the scale and the head stays where it was — the sprite grows
or shrinks downward from a fixed head position rather than sliding off the bar.
The same applies to the idle's size control. Neither is true of any other pose:
only the idle drives the character's size.

Solving happens in `loadCoreAssets()`, because it needs the manifest's body
measurements — and it is in the *core* load, before any sprite has been
fetched, so a fighter is already the right size the first time they are drawn
however late their art arrives. The game and both workbenches all go through it,
so they cannot disagree about how tall a fighter is.

## Why heights are compressed

At true relative scale the roster spans 150-220 cm, a 1.47x range. Hurtboxes are
**one size for everyone** (`hurtbox()` in `combat.js`), so a fighter drawn much
larger or smaller than their hurtbox reads as hitting, or being hit, through thin
air. `HEIGHT_COMPRESSION` (0.6) keeps the ordering — the tallest is still visibly
the tallest — while holding the spread to about 1.25x. `HEIGHT_MIN_RATIO` /
`HEIGHT_MAX_RATIO` are a guard against a future outlier rather than something the
current roster reaches.

`HEIGHT_BASE_PX` (175.3) is what a fighter at ratio 1.0 renders at. It was chosen
so the roster's *average* drawn height is unchanged from before heights were
canon: fighters redistribute around it, the game does not globally resize.

All four dials are in `src/config_tuning.js`.

## The roster

Gojo is the reference at 1.000. "Ratio" is after compression.

| Fighter | Canon | Ratio | Rendered | Source |
|---|---|---|---|---|
| Hanami | 220 cm | 1.095 | 191.9 px | widely cited |
| Panda | 200 cm | 1.032 | 180.8 px | official |
| Geto | 190.5 cm | 1.002 | 175.6 px | widely cited |
| **Gojo** | **190 cm** | **1.000** | **175.3 px** | **official — reference** |
| Todo | 190 cm | 1.000 | 175.3 px | official |
| Toji | 187 cm | 0.991 | 173.6 px | widely cited |
| Hakari | ~185 cm | 0.984 | 172.5 px | estimated |
| Nanami | 184 cm | 0.981 | 172.0 px | official |
| Choso | 181 cm | 0.972 | 170.3 px | widely cited |
| Jogo | 180 cm | 0.968 | 169.8 px | widely cited |
| Mahito | 179.1 cm | 0.966 | 169.3 px | widely cited |
| Yuta | 175.3 cm | 0.954 | 167.2 px | widely cited |
| Megumi | 175 cm | 0.953 | 167.0 px | official |
| Yuji | 173 cm | 0.946 | 165.9 px | official |
| Sukuna | 172.7 cm | 0.945 | 165.7 px | widely cited (vessel) |
| Maki | 170 cm | 0.937 | 164.2 px | official |
| Inumaki | 164 cm | 0.918 | 160.9 px | official |
| Nobara | 160 cm | 0.905 | 158.7 px | official |
| Momo | ~150 cm | 0.874 | 153.2 px | estimated |
| Mei Mei | — | 1.000 | 175.3 px | **unpublished** |
| Uro | — | 1.000 | 175.3 px | **unpublished** |
| Reggie | — | 1.000 | 175.3 px | **unpublished** |
| Gakuganji | — | 1.000 | 175.3 px | **unpublished** |

**Confidence, honestly.** *Official* means a databook/profile figure repeated
consistently across sources. *Widely cited* means every height list agrees but
the figure never came from a databook — the suspiciously precise ones (172.7,
179.1, 190.5) are panel-measured fan estimates. *Estimated* means only a relative
statement exists ("taller than Yuji", "very short"). *Unpublished* means no
height exists for that character anywhere; they sit at the reference height,
which is a neutral default rather than a claim.

Two of those four are worth a look: **Gakuganji** is an elderly man usually drawn
well short of Gojo, and **Mei Mei** is an average-height adult woman. The
reference default is almost certainly too tall for both. It is a one-number fix —
give them a `heightCm` and everything downstream follows.

## Editing

**By canon:** set `heightCm` in `characters.js`. Everything follows.

**By eye:** the sprite workbench's **Character height** slider. It writes an
override into `headHeights` in the manifest, which wins over the canon-derived
value, and rescales every one of that fighter's frames live. *Reset to canon
height* removes the override. Export and apply through the usual flow.

`headHeights` in the manifest is an **override map**: empty by default, holding
only fighters whose size was set by hand.
