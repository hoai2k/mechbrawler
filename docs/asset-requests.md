# Asset Requests — open requests

Everything in this file is **outstanding**. Delivered rounds are recorded in
[asset-requests-history.md](asset-requests-history.md) — including the round
numbers, so a commit or code comment citing "round 5 art" still resolves.

**Current status: rounds 1–16 delivered. Round 17 is delivered except its card
set. Round 18 is open.**

**Round 18 is the one to add to** — 17D is being drawn against, so anything found
from here goes into 18.

**The approval queue is empty.** Rounds 14, 16 and 17 all landed through the
[approval step](../assets/intake/README.md#the-confirm-step) — a delivery is in
the repo before it is in the game, and each pose is a decision waiting in the
sprite workbench — and every one of those decisions has now been made. What a
player sees is what was approved, Hanami's canon set included.

**Kurourushi is shipped.** His 36-pose set, his hero card, his simplified tile
and both his summons landed with round 15; the set was placed and approved pose
by pose, and his key now sits in the Curses group in `src/config_menus.js`, so
`STAGED_CHARACTER_KEYS` in `src/characters.js` is empty for the first time since
round 15. The roster is 27 fighters. What his placement pass found is **18B**
below.

The roster is complete and **every fighter now has one sprite per action** —
round 11 finished the conversion that round 5 started, so the 4×5 sprite sheet
is retired and no action anywhere plays a grid cell. Nothing outstanding blocks
play.

Read **[pose-brief.md](pose-brief.md)** before drawing a fighter. It is the
standing brief — what every pose has to be, the four criteria the engine
measures, and the faults that have each cost the roster a re-request — and it is
cumulative, so it is the reason a new set should arrive better than the last one.
This file asks for particular art; that file says what the art has to be.

Read **[the canonical reference image](#the-canonical-reference-image--one-per-fighter)**
below before drawing anything: it names the one image each fighter is matched
against, and it applies to every request in this file. (Summons have no
canonical reference: 16A matches the existing still, and 16B is new design.)

---

## Where to deliver

**Upload art to `assets/intake/`, never to `assets/sprites/`.**

```
assets/intake/<character>/<pose_key>.png    sprites
assets/intake/effects/<name>.png            technique effects
assets/intake/summons/<name>.png            summon minions
assets/intake/cards/<key>_card.jpg          hero cards
assets/intake/backgrounds/<name>.jpg        stage / domain backgrounds
```

`assets/sprites/` holds **finished runtime art only** — keyed, trimmed, alpha,
registered in `manifest.json`. Generated art arrives as an untrimmed plate on a
flat colour field with no alpha, so a raw file landing there makes the game try
to draw a 1024×1536 background as a sprite. Every round so far has arrived that
way, so this is the normal case rather than a mistake — it just has to go
through the pipeline first.

`assets/intake/` is tracked by git (only `_processed/` is ignored) so uploading
into it works. Raw files live there until processed, then move to
`assets/reference/round<N>/` as the permanent archive. See
[assets/intake/README.md](../assets/intake/README.md) for the full flow.

---

## Delivery spec

PNG, **one subject per file**, no text, no watermark, no border, no grids.
(Hero cards are the exception: JPEG, full-bleed background — see round 9A in
the [asset-requests-history.md](asset-requests-history.md).)

- **Background:** a **flat key screen**, solid magenta `#FF00FF` — except
  warm-palette characters (Sukuna, Nobara, Momo, Hakari, Yuji, Choso, Uro and
  Gakuganji), which need mid-grey `#808080`. A magenta key eats pink and red
  tones.

  Our generator **cannot output a true alpha channel** — every delivery is an
  opaque plate on a flat colour field, which is why the repo talks about green,
  magenta and grey screens rather than transparency. So the key screen is not a
  fallback, it is the format, and the transparency in `assets/sprites/` is
  something `tools/intake.py` cuts on import. That makes the *quality of the
  screen* the thing that decides whether a sprite comes out clean: pick a
  screen colour that appears nowhere in the character, keep it perfectly flat
  and unlit, and do not let it bounce colour onto hair or cloth edges. Round 9F
  was a whole request that existed because a screen leaked.
- **Facing:** draw everything **facing RIGHT**. If your generator prefers left,
  say so and it gets batch-mirrored on import.
- **Framing:** full body inside the frame with margin on **all four sides**.
  Nothing may touch the canvas edge.
- **Resolution:** character body **at least 600 px tall**.
- **One zoom per character.** Draw every pose of a character at the same figure
  scale — do not redraw each pose to fill its canvas. Standing poses should
  measure within a few percent of each other; low poses (crouch, roll, run) are
  genuinely shorter. This is the single most expensive thing to fix later: it is
  only catchable by eye, and a mismatch between two frames of the same idle
  makes the character visibly pulse while standing still.
- **Opacity:** bodies 100% opaque; only genuine effects (glow, mist, sound
  waves) may be translucent.

Style suffix — append to every sprite prompt:

> clean Japanese anime key-art style matching the Jujutsu Kaisen TV anime,
> crisp dark lineart, cel shading with soft gradient accents, vibrant colors,
> high detail, full body, no text

Prompt formula: `[CHARACTER BLOCK]`, `[POSE LINE]`, facing right,
`[STYLE SUFFIX]`.

### Directional effects point LEFT

The projectile renderer mirrors a sprite when it travels right, so art drawn
pointing right flies backwards with its blunt end leading. Draw travelling
effects (beams, lances, diving creatures) **pointing left**; `chain.png` and
`crow.png` are the correct references.

---

## Character blocks

Used verbatim as `[CHARACTER BLOCK]` in every prompt below, so a character's
design stays identical across their card, their sprites and any new art.

Use verbatim — these are the established designs, checked against the current
sheets.

**Check the block against the show before drawing.** The authority is the
character's **(Anime)** full-body render on
[jujutsu-kaisen.fandom.com](https://jujutsu-kaisen.fandom.com), not the block
text and not the art already in the repo. Three blocks below (`uro`, `reggie`,
`gakuganji`) described characters who look nothing like their anime designs,
which is what round **9E** fixed; those three rows were rewritten from the
reference and their old wording is dead. Downloaded copies
of the references live in
[`assets/reference/canon/`](../assets/reference/canon/), with the source URLs
and a recipe for fetching more in that directory's README.

| Character | Block |
|---|---|
| gojo | "Satoru Gojo from Jujutsu Kaisen, tall slim young man with spiky white hair and a black blindfold over his eyes, wearing a black high-collared jujutsu uniform with dark trousers and black boots" |
| yuta | "Yuta Okkotsu from Jujutsu Kaisen, slim young man with messy black hair, wearing an all-white long-sleeve school uniform with white trousers, a katana at his hip" |
| hakari | "Kinji Hakari from Jujutsu Kaisen, tall young man with slicked-back blond hair and an undercut, wearing a black school jacket hanging open over his bare chest, dark trousers" |
| maki | "Maki Zen'in from Jujutsu Kaisen, athletic young woman with dark green hair in a high ponytail and rectangular glasses, navy school uniform tunic over dark leggings, carrying a long naginata polearm" |
| megumi | "Megumi Fushiguro from Jujutsu Kaisen, young man with spiky black hair, wearing a dark navy high-collared jujutsu uniform with dark trousers and brown boots" |
| nobara | "Nobara Kugisaki from Jujutsu Kaisen, young woman with short auburn-orange bob hair, navy school uniform dress with a belt, dark tights and brown boots, small hammer in hand" |
| inumaki | "Toge Inumaki from Jujutsu Kaisen, slim young man with light grey-blond hair, wearing a dark navy high-collared school uniform zipped up over his mouth, white sneakers" |
| panda | "Panda from Jujutsu Kaisen, a large anthropomorphic panda with black and white fur, muscular build, a small teal cursed-energy core visible on his shoulder" |
| todo | "Aoi Todo from Jujutsu Kaisen, very large muscular man with black hair in a short topknot and thick eyebrows, wearing a dark navy jacket over a maroon shirt with dark trousers" |
| momo | "Momo Nishimiya from Jujutsu Kaisen, petite young woman with shoulder-length auburn hair and a large dark witch hat, dark navy Kyoto uniform dress, riding or holding a wooden broom" |
| nanami | "Kento Nanami from Jujutsu Kaisen, tall blond man with a straight bob and tinted rectangular glasses, wearing a tan-beige suit with a patterned tie, carrying a blunt-tipped cleaver sword" |
| toji | "Toji Fushiguro from Jujutsu Kaisen, tall muscular man with short black hair and a vertical scar at the corner of his mouth, fitted black short-sleeve T-shirt and loose dark charcoal trousers with a dark sash" |
| sukuna | "Ryomen Sukuna the King of Curses from Jujutsu Kaisen, bare-chested muscular man with spiky salmon-pink hair, four eyes, black tattoo band markings across his face, chest and arms, dark loose trousers with a black sash" *(grey key)* |
| mahito | "Mahito from Jujutsu Kaisen, slim young man with pale blue-grey patchwork skin covered in stitched seams, long grey-blue hair in a loose bun, dark sleeveless vest and dark trousers" |
| geto | "Suguru Geto from Jujutsu Kaisen, tall man with long black hair in a topknot, wearing a black traditional robe with gold trim over dark clothing" |
| jogo | "Jogo from Jujutsu Kaisen, a volcano-headed cursed spirit with a single large eye, cracked earthen skin, wearing a yellow-and-black spotted fur mantle over dark trousers" |
| hanami | "Hanami from Jujutsu Kaisen, tall powerfully built cursed spirit with a lean muscular pale bone-cream body marked by thick black brushstroke stripes down the face, arms, chest and abdomen, a rigid mask-like face with hollow black eye sockets, pale slit pupils and a wide fixed grin of large square teeth, a crown of thick tan antler horns curving up and back over the scalp, the entire right shoulder and arm wrapped in heavy white cloth bound close to the body with stitched seams where it meets the chest, a white cloth sash knotted at the waist with the ends hanging, wide baggy black hakama trousers gathered at the ankles, barefoot with broad clawed feet and long dark claws on both hands" *(grey key)* |
| yuji | "Yuji Itadori from Jujutsu Kaisen, athletic teenage boy with short spiky salmon-pink hair and brown eyes, wearing a dark navy high-collared jujutsu school uniform jacket over a red hoodie, matching dark trousers and white sneakers" *(grey key)* |
| choso | "Choso from Jujutsu Kaisen, pale serious young man with long black hair tied into two high loose buns with strands framing his face, a dark horizontal marking across the bridge of his nose, wearing a loose black robe-like tunic with pale trim, wide sleeves, dark trousers and simple shoes" *(grey key)* |
| meimei | "Mei Mei from Jujutsu Kaisen, tall elegant woman with very long silver-lavender hair worn in thick loose braids, calm confident expression, wearing a fitted black high-collared long-sleeved dress with gold buttons and dark tights, carrying a large single-headed battle axe" |
| uro | "Takako Uro from Jujutsu Kaisen, lean athletic woman with a fierce confident grin, pale violet-pink hair sweeping upward and outward in wild flame-like curling points, sharp violet eyes with heavy dark eyeliner, large gold cylindrical drop earrings, a black choker and a black band on each wrist, her only covering a wrap of pale-cyan cloud vapour clinging across her chest and hips with soft drifting edges, bare arms and legs, barefoot with violet-painted nails" *(grey key)* |
| reggie | "Reggie Star from Jujutsu Kaisen, tall lean man with straight shoulder-length blond hair parted at the side, heavy-lidded tired eyes and a narrow pointed chin beard, wearing a shaggy knee-length tunic and matching shoulder cape built from layered rows of torn white paper receipts with small pale mint-green printed tabs, bare arms and bare lower legs, barefoot" |
| mechamaru | "Ultimate Mechamaru from Jujutsu Kaisen, a tall humanoid cursed-corpse puppet with a smooth clay-brown carved head, two round glowing green lens eyes and a small third lens on the forehead, a fixed grin of bared square teeth, a thick white puffy scarf around the neck, wearing a dark navy high-collared jujutsu uniform tunic with a white sash and very wide baggy navy trousers, bare carved wooden hands and bare wooden feet" |
| yuki | "Yuki Tsukumo from Jujutsu Kaisen, tall athletic young woman with very long straight blonde hair falling past her waist with two tufts framing her face and brown eyes, wearing a sleeveless dark indigo mandarin-collar top with gold frog clasps at the shoulder, a grey buttoned corset belt at the waist, high-waisted light blue jeans and brown ankle boots" |
| dagon | "Dagon from Jujutsu Kaisen, a tall broad hunched humanoid cursed spirit with deep red outer limbs and a tan inner chest and belly, a black midsection, a smooth red octopus-like head with blank pale eyes and a beard of thick red tentacles hanging from the jaw, black bat-like wings folded at the lower back, four heavy clawed fingers per hand and broad two-toed feet" *(grey key)* |
| kurourushi | "Kurourushi from Jujutsu Kaisen, a tall cockroach cursed spirit draped head to floor in a smooth glossy black shroud, a maroon insect face with eight red-and-orange eyes in uneven pairs and a wide grin of human teeth behind layered jaws, six very long thin purple antennae sweeping out from the head, dark chitinous insect legs splayed out at the base of the shroud, wielding a long dark cursed sword with six firing barrels along its spine" *(grey key)* |
| mahoraga | "Mahoraga from Jujutsu Kaisen, the Divine General shikigami — a towering pale-white humanoid with grey sculpted musculature, a long segmented tail, and a fanned crest of white blade-like spines sweeping back from his head. **A brass eight-spoked karma wheel is mounted on the headdress behind his skull, with a ball at the end of each spoke** — it is part of his head and turns with it. Bandaged wrap and beads at the throat, a torn dark charcoal skirt over a pale sash, purple-grey wraps at wrists and ankles, barefoot, carrying a long pale bone-textured sword" |
| gakuganji | "Yoshinobu Gakuganji from Jujutsu Kaisen, stern hunched elderly man, bald on top with long straight white hair falling past his shoulders at the sides, a long thin white beard and drooping moustache, deeply wrinkled face with hooded eyes and gold hoop earrings, wearing a cream-white kimono top under a black band T-shirt with the kimono sleeves hanging loose, wide dark-purple hakama trousers, white tabi socks and wooden geta sandals, a crimson-red Flying-V electric guitar slung across his chest on a strap" *(grey key)* |

*(The 17 above are the launch roster; the six below shipped in round 7. The
`uro`, `reggie` and `gakuganji` rows were rewritten from the anime reference in
round 9 — see **9E**; art made against their old wording is being replaced. The
four `mechamaru` / `yuki` / `dagon` / `kurourushi` rows are round 15 and were
written from the wiki's **(Anime)** renders, archived in
[`assets/reference/canon/`](../assets/reference/canon/) — they are the only
blocks with no delivered art behind them, so the render IS the authority for
them.)*


---
## The canonical reference image — one per fighter

Every request in this file says "match the existing set", and every round so far
has had to work out what that means by opening files. This is the answer, once,
for all of them: **a fighter's `idle_a` is their canonical image.**

Open it before drawing anything else for that fighter, and match its **costume,
proportions, age, palette, line weight and shading**. Where `idle_a` and an
older sheet cell disagree — and they do, in places — `idle_a` wins. It is the
newest full-body art, it is the pose the sprite workbench benchmarks size
against, and it is what the player looks at most.

A rendered copy of each is checked in at
[`assets/reference/canon/`](../assets/reference/canon/), alongside
**`roster_idle.png`** — all twenty-three at matched figure scale on a common
floor line. Look at that one first: it is the only view that shows whether a fighter is
drawn a head too tall, which is the mistake no single-character reference can
catch. The copies are regenerated by `tools/build_canon_reference.py`, so they
keep resolving after a sprite is replaced.

| Fighter | Key | Canonical image |
|---|---|---|
| Choso | `choso` | `assets/reference/canon/choso_idle.png` |
| Yoshinobu Gakuganji | `gakuganji` | `assets/reference/canon/gakuganji_idle.png` |
| Geto | `geto` | `assets/reference/canon/geto_idle.png` |
| Gojo | `gojo` | `assets/reference/canon/gojo_idle.png` |
| Hakari | `hakari` | `assets/reference/canon/hakari_idle.png` |
| Hanami ⚠ | `hanami` | `assets/reference/canon/hanami_anime.png` — **not** his `idle_a`, see below |
| Inumaki | `inumaki` | `assets/reference/canon/inumaki_idle.png` |
| Jogo | `jogo` | `assets/reference/canon/jogo_idle.png` |
| Mahito | `mahito` | `assets/reference/canon/mahito_idle.png` |
| Maki | `maki` | `assets/reference/canon/maki_idle.png` |
| Megumi | `megumi` | `assets/reference/canon/megumi_idle.png` |
| Mei Mei | `meimei` | `assets/reference/canon/meimei_idle.png` |
| Momo | `momo` | `assets/reference/canon/momo_idle.png` |
| Nanami | `nanami` | `assets/reference/canon/nanami_idle.png` |
| Nobara | `nobara` | `assets/reference/canon/nobara_idle.png` |
| Panda | `panda` | `assets/reference/canon/panda_idle.png` |
| Reggie Star | `reggie` | `assets/reference/canon/reggie_idle.png` |
| Sukuna | `sukuna` | `assets/reference/canon/sukuna_idle.png` |
| Todo | `todo` | `assets/reference/canon/todo_idle.png` |
| Toji | `toji` | `assets/reference/canon/toji_idle.png` |
| Takako Uro | `uro` | `assets/reference/canon/uro_idle.png` |
| Yuji | `yuji` | `assets/reference/canon/yuji_idle.png` |
| Yuta | `yuta` | `assets/reference/canon/yuta_idle.png` |

**Gakuganji, Reggie Star and Uro used to be exceptions** — their old art was a
different character, so their `idle_a` was exactly what must *not* be matched.
Round 9E replaced all three from the **(Anime)** full-body renders on
[jujutsu-kaisen.fandom.com](https://jujutsu-kaisen.fandom.com), archived in
[`assets/reference/canon/`](../assets/reference/canon/), and their new `idle_a`
is canonical like everyone else's — the table above includes them. The
`<char>_anime.png` wiki renders that seeded those redraws stay in the
directory for design questions, but **prefer the `<char>_idle.png` files when
they exist**: they carry the figure scale, line weight and shading the
delivered set actually has.

**The four round-15 fighters have no `idle_a` at all**, which is the one case
this rule cannot cover: there is nothing to match yet. Their canon is the wiki's
**(Anime)** full-body render, checked in beside everyone else's:

| Fighter | Key | Canonical image |
|---|---|---|
| Dagon | `dagon` | `assets/reference/canon/dagon_anime.png` |
| Kurourushi | `kurourushi` | `assets/reference/canon/kurourushi_anime.png` |
| Mechamaru | `mechamaru` | `assets/reference/canon/mechamaru_anime.png` (plus `mechamaru_absolute_anime.png` for Mode: Absolute) |
| Yuki Tsukumo | `yuki` | `assets/reference/canon/yuki_anime.png` |

**Draw each one's `idle_a` first and place it before drawing anything else for
them** — every other pose of that fighter is then matched against their own
idle, exactly like the rest of the roster, and round 7's hardest lesson was that
a new character has no frame to inherit placement from (see
[asset-requests-history.md](asset-requests-history.md#round-7--six-new-fighters)).

**⚠ Hanami is the fourth case, found while round 17 was being written** —
his canon is `assets/reference/canon/hanami_anime.png`, not his `idle_a`. Every
sprite he has draws a **bark-and-foliage tree body**: grey-brown wood grain,
branch spurs off the shoulders, leaves, a flower growing out of a cracked wooden
face. Canon Hanami is a **lean pale humanoid curse** — bone-cream skin under
heavy black stripe markings, a rigid grinning mask-face crowned with tan antler
horns, one arm and shoulder bound in white cloth, black hakama, bare clawed
feet. They are not the same character, so `hanami_idle.png` is exactly what must
*not* be matched, the way the other three were before 9E. His block above was
rewritten from the render at the same time; the old wording is dead.
[17A](asset-requests-history.md#17a-a-full-hanami-set--36-sprites) is the redraw. When its new idle is
picked, re-run `tools/build_canon_reference.py` and `hanami_idle.png` becomes
the authority again like everyone else's.

**Mahoraga's canon is the shikigami render, not his `idle_a`** —
`assets/reference/canon/mahoraga_canon.png`, the full-body art the game already
ships. Round 11A redrew him from it, so his delivered set now agrees with it;
the render stays the authority for his design because it is what the set was
drawn against.

He also has a character block now, which he did not until round 13 came back
with **the karma wheel missing from three poses**. He was the only sprite set in
the game without one, so his prompts carried no design text at all and the
design lived entirely in a reference image — which works when somebody opens it
and fails silently when they do not. A reference image is not a substitute for
the block; it is what the block is checked against.

---

## Repo work, not a request: the two alpha fixes

`hakari/dodge_air` and `toji/dodge_air` both carry unkeyed grey behind the
figure — a drawn shadow in almost exactly the mid-grey `#808080` of their key
screen. Intake cuts the key by flooding in from the border, and a *shaded* grey
is not the flat key colour, so it survives the cut and hangs in the air behind
them every time they air-dodge.

**Neither is an asset request.** The drawings are good and their placement is
correct; the file is what is wrong, and that is repo work. They are flagged
`wantsImprovement: "alpha"` so the workbench shows them and
`tools/list_replacements.py` tracks them, and they are listed here only so a
round's numbers are not mistaken for the whole outstanding list.

If a redelivery is ever easier than a cut, the spec is the standard one with a
single addition: **no drawn shadow of any kind** — the game casts its own.

---

# Round 17 — 40 of 41 sprites and 1 of 28 cards delivered

**Everything except 17D has landed**, and its art is in the repo awaiting
approval. What is left in this round is the simplified card set.

| Part | Scope | State |
|---|---|---|
| 17A | A full Hanami set — 36 sprites | **Delivered.** Redrawn to canon; awaiting approval pose by pose |
| 17B | Mahoraga's three light/crouch poses — 3 sprites | **Delivered**, awaiting approval — the karma wheel is present this time |
| 17C | Two caught while placing round 13 — 2 sprites | **Delivered**, awaiting approval |
| 17D | A simplified card for every fighter — 27 images | **Open**, below |
| 17E | Hanami's hero card, redrawn to canon — 1 image | **Delivered and in the game.** A card has no approval step |

The three keys outside 17A's 36 — `attack_air`, `run_a` and `run_b` — were not
drawn. They are standby fallbacks nothing reaches, so Hanami's set is answered;
they are noted in
[the history entry](asset-requests-history.md#round-17--hanami-to-canon-mahoraga-and-the-last-two-round-13-catches)
in case the set is ever redrawn whole again.

**17D is drawn against the new Hanami.** His block was rewritten for 17A and his
tile is the pale humanoid curse, not the tree — the hero card the tile has to
agree with is already in the game.

## 17D. A simplified card for every fighter — 27 images

### Why

**The hero cards do not survive being made small.** Each one is a full-bleed
640×820 illustration with a painted scene behind the fighter — Gojo on a neon
skyline, Panda outside a shrine at dusk, Nanami against tower blocks at golden
hour. At hero size, on the right of the select screen, that is exactly right and
it should stay.

The same file is also the **roster tile**, and there it is doing a different
job: the player is scanning two dozen thumbnails for the one they want, and the
scene is noise. It is already costing something. `styles.css` carries a
per-card brightness table — `--card-lift`, defaulting to 1.18, with a heavier
tier for Nanami, Toji, Geto, Reggie, Mei Mei and Gakuganji and a saturation-only
case for Panda — that exists solely because the art was not all painted at the
same key and the tiles read murky next to each other. That table is a patch on
using scene illustrations as icons.

**And it gets worse with every fighter added.** `layoutCharacterGrid()` fits the
roster by walking depths and then *cropping*: `ROSTER_ASPECTS` runs
`3/4 → 1/1 → 5/4 → 3/2 → 2/1`, and the tile is `object-fit: cover` anchored to
the **top**. A bigger roster reaches the wide end of that list sooner, so the
tile becomes a **letterbox strip off the top of a portrait** — and `object-position: top`
means it keeps the head and throws the body away. `MIN_CARD_WIDTH` is 96 px, so
at the far end each fighter is a 96 px-wide band of a painting.

Round 15 takes the roster from 23 to 27, which is the point of asking now rather
than later. This request is the art that is drawn for that job from the start.

### What this is not

- **Not a replacement.** Every existing `assets/cards/<key>_card.jpg` stays
  exactly where it is and keeps being the hero card. Nothing is flagged, nothing
  is deleted, and `assets/reference/cards_previous/` is untouched.
- **Not wired up.** The game does not read the new directory and this section
  does not ask for the code that would. It is art banked ahead of a roster big
  enough to need it — the switch is a one-line change in `buildCharacterCard()`
  when that day comes, and it can be made per-surface (tiles simplified, hero
  card and in-match portrait still the painting).
- **Not a redesign.** Same character, same costume, same palette family as their
  hero card, so the two read as the same fighter seen at two distances.

### The brief

**A portrait icon, not a scene.** One fighter, chest-up, filling the frame, on a
plain background. Think a roster icon in a fighting game's character select, or
an app icon of a person: legible at a glance, legible at a glance *small*, and
distinguishable from twenty-six others at the same size.

| | |
|---|---|
| **Crop** | Head and shoulders to mid-chest. The head is large in the frame — roughly the top half of the image — and centred horizontally |
| **Background** | Flat or a single soft vertical gradient in the fighter's theme colour (the `theme` field in `src/characters.js`). No scenery, no buildings, no sky, no props behind the figure, no logo, no text |
| **Lighting** | Even and front-lit. Bright enough to need **no** `--card-lift` correction: the whole point is that all 27 come back at the same key and the brightness table can be deleted |
| **Detail** | Fewer, larger shapes than the hero card. Simplify folds, hair strands and pattern; keep the two or three things that identify the fighter and drop the rest |
| **Silhouette** | Readable as a shape. Squint at it: Gojo's blindfold, Nanami's glasses, Maki's ponytail and glasses, Todo's topknot, Momo's hat, Jogo's volcano head should still be the thing you see |
| **Format** | JPEG, **640 × 820** (3:4), same as the hero cards, so the two are interchangeable in every slot |

**Two crops must both work, because the fitter chooses between them at runtime.**
Before delivering, check each image twice:

1. **Full 3:4** — the shallow-roster case.
2. **The top half only, at 2:1** — the crowded-roster case, which is what
   `object-fit: cover` with `object-position: top` produces at the wide end of
   `ROSTER_ASPECTS`. The fighter must still be recognisable, which in practice
   means **the whole head sits inside the top 45% of the image** and nothing that
   identifies them lives below the shoulders.

**Keep the bottom sixth quiet.** The name plate is drawn over it — white caps on
a dark gradient — so anything with detail down there is covered up.

### Prompt formula

`[CHARACTER BLOCK]`, head-and-shoulders portrait icon facing the viewer, chest-up
crop, head filling the upper half of the frame, flat `[THEME COLOUR]` background
with no scenery or props, even front lighting, simplified shapes and reduced
detail, `[STYLE SUFFIX]`.

Character blocks are in [Character blocks](#character-blocks) above and are used
verbatim, exactly as for sprites — **including Hanami's, which was rewritten for
[17A](asset-requests-history.md#17a-a-full-hanami-set--36-sprites)**. His tile is the pale humanoid curse,
not the tree.

`[THEME COLOUR]` is the fighter's `theme` in `src/characters.js` — the colour the
game already uses for their HUD accent and hit flashes, so a tile painted on it
matches what happens when they land a hit.

| Group | Fighter | Key | Theme |
|---|---|---|---|
| Students | Yuji | `yuji` | `#ff8264` |
| | Nobara | `nobara` | `#d86a4a` |
| | Megumi | `megumi` | `#7c8cff` |
| | Yuta | `yuta` | `#9fc7ff` |
| | Maki | `maki` | `#69d0a8` |
| | Inumaki | `inumaki` | `#d7d9e7` |
| | Panda | `panda` | `#8ea0b8` |
| | Todo | `todo` | `#b66cff` |
| | Momo | `momo` | `#b7b8ff` |
| Faculty | Gojo | `gojo` | `#62dcff` |
| | Nanami | `nanami` | `#ffd35a` |
| | Mei Mei | `meimei` | `#d8b95c` |
| | Gakuganji | `gakuganji` | `#d89b3f` |
| Other Sorcerers | Hakari | `hakari` | `#ff62cf` |
| | Toji | `toji` | `#a8aeb8` |
| | Uro | `uro` | `#8fd7e8` |
| | Reggie Star | `reggie` | `#86d67c` |
| Curses and Curse Users | Mahito | `mahito` | `#b56cff` |
| | Jogo | `jogo` | `#ff7a2f` |
| | Hanami ⚠ | `hanami` | `#9bb36b` |
| | Geto | `geto` | `#7d58d8` |
| | Choso | `choso` | `#c22e4a` |
| | Sukuna | `sukuna` | `#ff4c55` |
| **Staged (round 15)** | Mechamaru | `mechamaru` | `#63c7b0` |
| | Yuki Tsukumo | `yuki` | `#ffb703` |
| | Dagon | `dagon` | `#2f8fd8` |
| | Kurourushi | `kurourushi` | `#8f3b4e` |

**The last four depend on round 15.** They have no delivered art at all, so
their tile is drawn from the same wiki render as their hero card in
[15D](asset-requests-history.md#15d-kurourushis-hero-card--1-image) — and it is worth drawing the two together,
since the questions are the same and the answer to one settles the other. If
15A's sprite sets have landed by then, prefer the delivered `idle_a` as every
other fighter's tile does.

Four themes are close enough to a neighbour's to be worth checking side by side
before delivering — Todo `#b66cff` against Mahito `#b56cff` are all but
identical, and Mei Mei `#d8b95c` against Gakuganji `#d89b3f` are near. The
background is a supporting cue, not the identifier; if two tiles come back
reading as the same card, it is the *figure* that has to carry the difference.

**Mahoraga is deliberately not in it** — he is a `SPRITE_ACTOR`, nobody selects
him, and he has no hero card either.

### Where it goes

Deliver to:

```
assets/intake/cards/simple/<key>_tile.jpg
```

and it lands at:

```
assets/cards/simple/<key>_tile.jpg
```

**`_tile`, not `_card`, and the reason is not cosmetic.** The per-card
brightness rules in `styles.css` are written as filename suffix matches
(`img[src$="nanami_card.jpg"]`), which would match `simple/nanami_card.jpg` just
as happily as the hero card. A simplified card that silently inherited a 1.34×
lift meant for a murky painting would arrive blown out, and it would take a
while to work out why. A distinct suffix makes that impossible.

Cards take the short path through the pipeline — no keying, no measuring, no
manifest entry — so landing these is a move and nothing else.

---

# Round 18 — open

**Round 18 is the round to add to.** 14, 15, 16 and 17 are all being drawn
against, so anything caught from here lands here.

- **18A** — thirteen caught while placing the round-15 sets (13 sprites)
- **18B** — four caught while placing Kurourushi (4 sprites, 1 alpha fix)

**17 sprites, none of it blocking** — every pose named here is in the game today
and playable; each is a redraw of art that works but does not do its job.

## 18A. Caught while placing the round-15 sets — 13 sprites

The three new fighters arrived with complete 36-pose sets drawn against
[pose-brief.md](pose-brief.md). These are what the placement passes found — a
pose reads differently at real size against a real stage than it does on a
review board — plus the brief's headline criterion, which all three missed.

| Fighter | Key | Pose | Kind | What is wrong |
|---|---|---|---|---|
| Yuki Tsukumo | `yuki` | `attack_heavy_b` | Pose | The hook extends **9%** of standing height past her idle where the brief asks for a third — the shortest heavy on the roster. She is a boxer with no weapon, so the whole body has to be behind it: hips through, shoulder past the lead foot. **Her `ult_b` is standing in** meanwhile, so she has a heavy that reaches while this is redrawn. |
| Dagon | `dagon` | `attack_heavy_b` | Pose | Extends **16%**. The claws should finish out past the wings. |
| Mechamaru | `mechamaru` | `attack_heavy_b` | Pose | Extends **20%**. The forearm blade should be the furthest thing forward in the frame. |
| Mechamaru | `mechamaru` | `run_reach_a` | Quality | **Delivered as a contact sheet** — four small figures of the run cycle on one canvas rather than one pose. Nothing in it is separable at full resolution and none of the four clears the 600 px body minimum alone, so it was never imported: he runs on the other three cycle frames until this lands. |
| Dagon | `dagon` | `run_reach_a` | Pose | **Reaches with the arm instead of the leg.** The reach frame is the full stride — the leading heel is the thing out in front, arms only counterbalance it. |
| Dagon | `dagon` | `run_reach_b` | Pose | The same, on the other lead. |
| Yuki Tsukumo | `yuki` | `run_reach_a` | Pose | The same fault again — reaching with the arm. |
| Yuki Tsukumo | `yuki` | `run_reach_b` | Pose | The same, on the other lead. |
| Dagon | `dagon` | `crouch_b` | Pose | Drops **21%** of standing height where the brief asks for a quarter, and reads *taller* than `crouch_a` beside it. The pair is one held crouch a breath apart, not a descent. |
| Dagon | `dagon` | `attack_light_a` | Pose | Not a wind-up. `_a` is the coil before the strike — weight on the back foot, striking hand drawn back — and this reads as a second strike. |
| Mechamaru | `mechamaru` | `crouch_attack_b` | Pose | The forearm blade never reaches full extension. `_b` is the strike; the blade should be the furthest thing forward, out past the knee. |
| Dagon | `dagon` | `crouch_attack_b` | Pose | Flagged during the placement pass. |
| Yuki Tsukumo | `yuki` | `crouch_attack_b` | Pose | Flagged during the placement pass. |

The reach numbers are measured the way the engine measures reach: the forward
edge of the art past the centre of the body's core columns (`bodyRight` against
`coreLeft`/`coreRight`), as a fraction of the idle's own height. They are
comparable within a fighter regardless of placement, because every pose of a set
is drawn at one zoom.

**Three faults repeated across fighters, which is what a missing rule looks
like** rather than three bad drawings: the heavy that does not extend (all
three), the reach frame that reaches with the arm (two), and the `ledge_hang`
with the ledge drawn into it (two). All three are now stated in the pose brief,
so Kurourushi's set will not be asked for without them.

### Fixed in the repo instead of requested

Three of the faults found in this pass were **file** faults rather than drawing
faults, and were fixed here rather than sent back:

- **Dagon's `ult_a` had four arms.** The extra one lay over background for most
  of its length and its own ink line gave the cut a natural boundary at the
  shoulder, so it came out with nothing repainted.
- **`dagon/ledge_hang` and `mechamaru/ledge_hang` had the ledge drawn in.** The
  bar was a flat grey slab across the top of the plate with the hands gripping
  over it, so removing it leaves the hands closed on nothing — which is the
  pose as asked for. The stage supplies the edge.

Each frame was re-measured afterwards (`bodyTop`, the body and core spans, the
centre of mass) so reach and width read off the art that is actually there. The
untouched originals are in `assets/reference/round15/`. That is the whole
difference between an `improvement` flag and a `replacement` flag: these were
recoverable in the file, and Yuta's cut-off sword in 17C was not.


---

## 18B. Caught while placing Kurourushi — 4 sprites

Kurourushi's set was the last of the round-15 four to be placed, and it went
through with all 36 poses approved. Four of the delivered drawings were flagged
`quality` in the same pass, and this is the part that makes them non-blocking:
**each of the four poses is drawn today by another frame of his own set**,
chosen in the workbench rather than left broken. He plays complete. What is
missing is that four poses share art with four others, so a fight shows the same
silhouette in two places.

| Key | Pose | Kind | What is wrong | Standing in |
|---|---|---|---|---|
| `attack_heavy_b` | `sideHeavy` | Quality | **The blade is drawn back over the shoulder** — this is the wind-up, not the strike. `_b` is the contact frame, and nothing in it extends forward past the robe. | `attack_light_b` — the only frame in the set with the blade fully out |
| `attack_light_b` | `light` | Quality | Rejected in the same pass, and then promoted into the heavy slot above because it was the better of the two. The light now needs its own drawing. | the archived round-15 `attack_air_b` |
| `crouch_attack_b` | `crouchAttack` | Quality | A low sprawl with the blade along the ground, which is very close to what `dash` shows. `_b` is the strike out of the crouch — the blade forward and clear of the body. | the archived round-15 `dash` |
| `dash` | `dash` | Quality | Flagged during the placement pass. | the archived round-15 `dodge_roll` |

**The heavy fault is the fourth one this round.** Yuki, Dagon and Mechamaru all
delivered an `attack_heavy_b` that does not extend (18A), and Kurourushi's does
not extend either — his for a different reason, being a wind-up rather than a
short strike, but the frame on screen is the same problem: the heavy does not
read as the biggest thing the fighter does. The rule is in
[pose-brief.md](pose-brief.md); this is the evidence it needs to stay there.

### Repo work, not a request: `kurourushi/ledge_hang`

The ledge is drawn into the plate — a slab under the hands, the same fault
`dagon/ledge_hang` and `mechamaru/ledge_hang` had in round 15 and the reason the
rule went into the brief. It is flagged `wantsImprovement: "alpha"` with the
note "Remove the ledge", so the workbench shows it and
`tools/list_replacements.py` tracks it. As with the other two, the hands are
closed on the bar and cutting it leaves them closed on nothing, which is the
pose as asked for — **the stage supplies the edge.** No redelivery needed.
