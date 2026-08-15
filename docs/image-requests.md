# Image Requests — every image still to draw

**This is the one image-request document.** Every render mode's requests are
here, in their own section, whatever pipeline they feed. If you are drawing
or generating anything 2D for this project, this file is the list, and the
per-mode documents point here rather than keeping their own.

**It is generated** by `node tools/build_image_requests.mjs` from the
documents that author each round, plus the manifests and the files on disk.
Do not edit it; edit the source round and re-run. `--check` fails when it is
stale, and also when a source has an open round the tool did not recognise —
that second one is the guard, because a round written in an unexpected shape
is exactly how 172 images once went missing from this list.

**31 images outstanding.**

- **The sprite game** — 31 images, round 22
- **The live-3D anime path** — 0 images

## Rules that hold everywhere here

- **The canon reference is the subject.** A fighter's own `<char>_idle.png`
  under `assets/reference/canon/` carries their costume, proportions, palette,
  line weight and shading. The drawing is that character, not an
  interpretation of them.
- **The character block goes in the prompt verbatim.** All of them are at the
  bottom of this file.
- **Any subset is useful.** Everything here lands per fighter or per file, and
  anything undelivered keeps whatever the engine does today. Nothing in this
  file blocks play.

**The modes want opposite deliveries, and it is the one thing worth not
getting wrong.** Sprite rounds are keyed plates — flat magenta `#FF00FF` or
grey `#808080` screen, one subject, margin on all four sides, trimmed at
intake. The 3D inputs are the reverse: a turnaround wants clean white or
transparency, a swatch sheet wants labels, and nothing about them is keyed or
trimmed. Applying either mode's rules to the other produces a file its
pipeline cannot use. Each section states its own.

---

# The sprite game

Art for the game as a player sees it: `?render=sprite`, the default, and
the path all 27 fighters actually ship on. Keyed plates, delivered to
`assets/intake/`, trimmed and measured on import.

**31 images, round 22.** Authored in
[docs/asset-requests.md](asset-requests.md) and reproduced whole below.

- **22A** — Balanced on the lip: the teeter (27 sprites)
- **20E** — Yuji's four Round 20 poses (4 sprites)

## 22A. Balanced on the lip: the teeter — 27 sprites

**One new pose key, `teeter`, for every fighter.** Nothing is blocked by it:
until it lands the state draws the fighter's own IDLE frames with a procedural
lean supplied by `src/motion.js`, so the read exists today and the drawing
upgrades it.

**What it is for.** The ledge brake (`brakeAtLedge` in `src/fighter.js`) stops
a fighter dead on the last pixel of a platform whenever momentum would have
carried them off — that is its entire job, and it happens constantly. Nothing
drew it, so the most common thing that happens at an edge looked exactly like
standing in the middle of the stage. It is also the answer to when a fighter
should NOT be hanging: someone who stopped at the edge has not left it, and a
ledge hang would be telling the player they fell when they did not.

**The brief.** A standing pose, weight shifted BACK from the drop, arms out for
balance, front foot at or just over the lip, head turned down toward the fall.
Not alarmed — this roster does not panic — but caught: the moment after
realising the ground ran out. It reads at a glance against the idle beside it,
which is the test: a player should be able to tell from the silhouette that
they are on the edge.

**Facing.** Drawn facing RIGHT like every other pose, with the drop on the
right. The engine mirrors it for the left-hand lip and leans it the correct way
either side (`teeterLean` in `src/config_tuning.js`), so one drawing serves
both edges.

| pose key | count |
|---|---|
| `teeter` | 27 (one per fighter) |

**Not requested, deliberately: a ledge-climb pose.** Getting on and off a ledge
is now an animated transition rather than a teleport (`beginLedgeMove` in
`src/fighter.js`), and it is built from poses the roster already has — the fall
carries onto the ledge, the climb rises on `jump_rise` and arrives on `land`,
the roll uses `dodge_roll`. A bespoke `ledge_climb` would be an upgrade to
that, not a dependency, and 27 more sprites is not worth spending before the
reused ones have been seen in motion.

# Round 20 — delivered

**All four requests are in.** The last of them was Yuji's own four poses, which
landed as [20E](asset-requests.md#20e-yujis-four-round-20-poses--4-sprites) and are in the game:
his grab now reads as a grab and his dash attack as a lunge, like everybody
else's. Nothing in round 20 is outstanding.

- **~~44 of the 114 summon plates hold six creatures instead of one~~** —
  delivered. All forty-four came back as one figure each,
  `tools/check_summon_plates.py` passes on the whole tree of 114, and the seven
  authored hit boxes that were standing in for an unmeasurable plate came out
  with them.
- **~~Twenty backgrounds, re-extended from the paintings 18E replaced~~** —
  delivered, all twenty at 3200×1800, and in the game. Each one carries its
  source painting's composition rather than a fresh take on the brief, which is
  the whole thing 18E got wrong and the only thing this round was asking for.
  See [the history entry](asset-requests-history.md#20b-twenty-backgrounds-re-extended--delivered).
- **~~The grab poses~~** and **~~the dash attack pose~~** — delivered, 26
  fighters of 27 each, plus Mahoraga. Both are in the game: every one is a new
  pose key, so nothing was replaced and nothing waited for an approval. A grab
  now reads as a grab and a dash attack as a lunge, on everybody except Yuji.
- **~~Yuji's four~~** — [20E](asset-requests.md#20e-yujis-four-round-20-poses--4-sprites),
  delivered. 20C and 20D each asked for 27, one per fighter, and each arrived
  as 27 files with Mahoraga in Yuji's place; this was the correction, and it
  came back as the four missing drawings. Imported, anchored, and seeded a
  pose read each — the seeder had to learn that the REFERENCE character can
  gain frames too, since it was skipping him wholesale and he was then the one
  fighter with unread art.

Round 18 is closed and everything in it landed.

**Round 18 was delivered complete** — 28 sprites and 14 near-field cards, every
section of it, plus the five render3d image inputs (DI1–DI4). Its record, and
the reasoning behind each request in it, is now in
[the history](asset-requests-history.md#round-18--delivered).

**Round 20 is the open round.** (19 is skipped as a request number: it was used
for the *intake* of round 18, so `assets/reference/round19/` holds the delivered
plates and no request ever carried that number. Reusing it would make "round 19"
mean two different things.) Anything found from here — a placement pass, an
approval rejection, a manifest audit — lands in 20 beside 20B.

## Also outstanding, but work here rather than art

Four things, and none of them is a drawing anybody owes us:

- **25 poses are waiting in the approval queue.** Round 18's sprites are in the
  repo but not in the game: each is a decision in the sprite workbench, and
  until it is made the pose keeps drawing what it drew before. This is the
  [approval step](../assets/intake/README.md#the-confirm-step) working as
  intended, not a backlog. `mechamaru/run_reach_a` is the one exception — it
  filled an empty pose rather than replacing a drawn one, so it went straight
  in and completed his run cycle.
- **The two alpha fixes** above — `hakari/dodge_air` and `toji/dodge_air` — are
  repo work on delivered files, not art anybody owes us.
- **Six variant options point at art that was retired.** `hanami_alt/` was
  folded away when the alternate-art-set machinery went ([8843a0f]) and its
  drawings moved to `assets/reference/hanami_alt/`, but six options in
  `manifest["variants"]["hanami"]` still name the old path — a chevron offering
  a file that is not there. It is also what `tools/canonicalise_sprites.py`
  refuses on, so the step that puts canonical names back on approved art cannot
  run until those six entries are dropped or repointed. Round 20's own sprites
  did not need it — a new pose key lands at its canonical name — but round 18's
  approvals do.
- **Rejections from the approval pass** will become round 20. A pose rejected
  at approval is pointed at another frame so the game keeps drawing something,
  which raises no flag; [18G](asset-requests-history.md#18g-seven-a-pose-is-drawing-somebody-elses-art--7-sprites)
  is what that costs when nobody checks, and the manifest audit that found it is
  how the count at the top of this file is now derived.

---

---

## 20E. Yuji's four Round 20 poses — 4 sprites

**Delivered.** All four landed, keyed and measured through `tools/intake.py`,
imported with `tools/intake_import.py`, anchored, and given a seeded pose read
apiece — those four are marked `seed`, not `source`, so the joint-reads bench
knows they are a starting point rather than a read of the art.

**The remainder of 20C and 20D, and the whole of it is one fighter.** Both
rounds asked for one file per fighter, both arrived as twenty-seven files, and
both of those twenty-seven were Mahoraga rather than Yuji. Mahoraga is animated
out of a character sprite set and has an intake directory like everyone else,
but he is a summon and is not on `CHARACTER_KEYS`; his four are landed and
welcome, and they are not a fighter's. So the count was right twice and the
roster was wrong twice, which is now a row in
[pose-brief.md § 5](../sprites/docs/pose-brief.md#5-the-faults-that-keep-coming-back)
and a `ROSTER COVERAGE` line that `tools/intake.py` prints on every delivery.

**Nothing is blocked.** Yuji draws exactly what the whole roster drew before
round 20: `grabReach` falls back to his first light-attack frame, `grabHold` to
`charge`, `grabbed` to `hurt`, and both dash attacks to his standing strike
(`src/characters.js`). He is the one fighter whose grab still reads as a frozen
jab, which is precisely the thing 20C was written to end.

| File | Pose line |
|---|---|
| `assets/intake/yuji/grab_reach.png` | "a committed forward lunge with one open, grasping hand leading — reaching to seize, not to strike — the other arm up as a guard" |
| `assets/intake/yuji/grab_hold.png` | "gripping an unseen opponent at arm's length by the collar: front hand closed in a fist at chest height, weight planted, body coiled to heave" |
| `assets/intake/yuji/grabbed.png` | "seized and struggling: body arched back from the collar, feet scrabbling, both hands prying at an unseen grip at their own chest" |
| `assets/intake/yuji/attack_dash.png` | "sprinting forward and striking at the same moment, body low and driving, weight thrown ahead of the leading foot, back leg extended behind, striking arm fully extended forward along the direction of the run, trailing arm swept back, at the instant of impact" |

The two grab poses have to answer the same grip-point rule the other twenty-six
already do — **fist and prying hands both at chest height on the leading edge of
the body** — because the game draws Yuji's `grab_hold` against somebody else's
`grabbed` at a fixed gap, so his is not judged on its own. Open any delivered
pair (`sprites/assets/gojo/grab_hold.png` beside
`sprites/assets/nobara/grabbed.png`) and match the height.

Otherwise the standard spec: grey key screen (Yuji is on the warm-palette list),
facing right, one zoom matched to his own `idle_a`, at least 600 px of body, one
subject per file. His character block and canonical reference are above, and
[pose-brief.md](../sprites/docs/pose-brief.md) has all four pose lines in the
set they now belong to.

---

---

# The live-3D anime path

2D images the `?render=3d` pipeline consumes: inputs that models are
GENERATED from, and textures the anime pass reads at runtime. They serve
`?render=billboard` too, which reads the same rigs. These are NOT keyed
plates — each round states its own delivery.

**0 images.** Authored in
[render3d/docs/image-requests.md](../render3d/docs/image-requests.md) and reproduced whole below.

- **DI1** — model-generation turnaround boards (the Tripo inputs) (0 images)
- **DI2** — face sheets (the face-first gate's reference) (0 images)
- **DI3** — shade palette swatches (0 images)
- **DI4** — shared face textures (0 images)
- **DI5** — regeneration seeds (0 images)

## Round DI1 — model-generation turnaround boards (the Tripo inputs)

One board per fighter being modelled in the current D-round, sized for
image-to-3D seeding: **a single 2048×1024+ PNG, clean white or transparent
background**, containing the fighter in a neutral standing pose from
**front, 3/4-front, side, and back** at consistent scale and eye-line, flat
colors from the canon palette, **no dramatic lighting, no perspective, no
overlapping limbs** (arms slightly away from the body — near-A-pose reads
best for reconstruction). Face visible and on-model in the front view; the
back view must answer every question the sprites never had to (hair back,
uniform back, prop stowage).

A first-draft board can be composited from existing art:
`python tools/build_model_reference.py <char>` assembles the canon reference
plus the fighter's key sprites into a labelled board at
`render3d/docs/reference/<char>_board.png`. That composite is a brief for a
human or a seed for generation — **the request here is for the drawn
turnaround**, because sprites only ever show the one ¾ view and mirror the
rest, which is exactly what a 3D model cannot be built from.

**THE WHOLE FIGURE MUST FIT, WITH MARGIN.** Every view complete inside the
canvas — the crown of the head, any horns, hair or headgear, and the feet — with
clear white on all four sides. Twelve of the first twenty boards were refused
for exactly this: the figures were scaled to fill the frame and the tops of
their heads went off it, which on a model-generation seed is the one thing that
cannot be worked around. A smaller figure with air around it beats a large one
that is cut. `tools/import_render3d_images.py` measures this at import and
refuses a board whose head runs off the edge.

**Deliverable: 1 board per fighter.** Twelve are outstanding — the list is in
the refusal note above, and in
[docs/image-requests.md](../docs/image-requests.md), which resolves it
against what is on disk.

### DI1: who is still owed one — 0 of 28

A fighter whose rig has already been delivered is NOT listed: a turnaround board's only job is to be the thing a model is generated from, and theirs exists.

**Nothing outstanding.** Every fighter has one.

## Round DI2 — face sheets (the face-first gate's reference)

AI-generated meshes fail at faces first (plan §9), and the workbench's
sweeping-light check needs something to judge AGAINST. Per fighter: one
sheet, front + ¾ + profile of the **head only**, at least 512px per view,
canon palette, neutral expression — the drawn truth of the jawline, the eye
shapes, the hair clumping and parting side. Hair clump direction matters:
the modeller combs the normals along it (D-spec addition 3).

**Deliverable: 1 sheet per fighter, same gating as DI1.**

### DI2: who is still owed one — 0 of 28

Listed for delivered rigs too — this is what the face-first review gate reads AGAINST, so it is wanted whether or not the model exists.

**Nothing outstanding.** Every fighter has one.

## Round DI3 — shade palette swatches

The two-band ramp paints shadows from a palette, not from darkness
(render3d/src/toon.js `shadeTint`, overridable per material). Per fighter:
one small swatch sheet pairing each major material region (skin, hair,
uniform top, uniform bottom, props) with its **lit fill and its painted
shadow color**, taken from or consistent with the fighter's own sprite
shading. This is a color decision, not a texture: the numbers land in the
.glb's material extras (or the manifest's `toon` block) at intake, and the
sheet is what review holds them against.

**Deliverable: 1 swatch sheet per fighter, same gating as DI1. Format free —
a labelled PNG grid is fine.**

### DI3: who is still owed one — 0 of 28

Listed for delivered rigs too: these numbers land in the rig's material extras at intake, and not one delivered rig carries a `toon` block today — all of them are running on engine defaults.

**Nothing outstanding.** Every fighter has one.

## Round DI4 — shared face textures *(one-time, roster-wide)*

The eyes-and-face rules (plan §4) run on small shared textures rather than
per-fighter art:

- `eye_highlight.png` — the camera-facing catchlight sprite: soft-edged
  white/near-white shapes on transparency, 128×128, one primary highlight +
  one small secondary. One texture serves the roster; per-fighter tinting is
  engine-side.
- `<char>_mouth_sheet.png` *(optional, per fighter, unblocking)* — a 4-cell
  strip (idle / hurt / ult-shout / win-grin) matching the fighter's face
  sheet style, 256×256 per cell, for the mouth texture-swap regions the
  D-spec lists in extras. No fighter ships blocked on this; the neutral
  modelled mouth is the default.

**Deliverable: 1 shared highlight texture now; mouth sheets ride whichever
D-round their fighter ships in.**

### DI4: who is still owed one — 0 of 28

The shared eye-highlight texture is delivered; these are the optional per-fighter mouth sheets. Nothing ships blocked on one.

**Nothing outstanding.** Every fighter has one.

## Round DI5 — regeneration seeds *(delivered — read the verdict before generating)*

**All nine landed and all nine pass**: five turnaround boards (`gakuganji`,
`maki`, `meimei`, `momo`, `uro`) and four weapon plates (everyone but Uro, who
carries none). The edge check refused nothing and warned about nothing — the
crowns, the hat tips and the feet are all inside the canvas with margin, which
is the fault that produced Mei Mei's horns.

Checked by eye against every rule below:

| | Verdict |
|---|---|
| Crown and feet in frame | **yes**, all five, with margin — Momo's hat tips included |
| Weapons out of the boards | **yes** — all four are drawn empty-handed |
| Weapon plates | **yes** — broom, polearm, axe, guitar, four views each, alone on white |
| Daylight between the legs | **yes** on Maki and Uro; Momo and Mei Mei stand closer but keep a gap; Gakuganji's legs are inside hakama at any pose |
| Hanging hair drawn along its length | **yes** — Mei Mei's braid reads as its own shape in the side and back views, which is what the chain extraction needs |

**Two notes to weigh before spending credits, neither a blocker:**

1. **Arms hang at the sides rather than in an A-pose.** DI1 asks for them
   slightly away from the body and these are closer than that — wrists near
   the hips on Maki, Momo and Mei Mei. The roster's existing models were
   generated from boards drawn the same way and their arms measure fine
   (0.80–0.99 balance for twenty of them), so this is a known-survivable
   deviation rather than a repeat of the fusion fault. It is also the most
   likely explanation for the three fighters that measure 0.55–0.71.

2. **Hands are relaxed-open, not curled.** The hand is a single bone and
   cannot close later, so a weapon joined to a flat palm reads as passing
   through it. Mei Mei's axe and Maki's polearm are the ones this shows on.
   Worth a redraw of the hands ONLY if the joined result looks wrong — which
   is now a thing that can be checked in an afternoon rather than guessed at,
   because the join is arithmetic.

**Uro's crown flag was partly the metric's fault.** Her board makes it plain
that the hair standing 29% of her stature above her head is her design, not
generated damage. Her legs at 55% of a normal leg still stand, and so does the
scale the Idle Review kept fighting.

### DI5: who is still owed one — 0 of 28

Named by MEASUREMENT, not by eye: tools/audit_model_health.py weighs the mesh bound to each limb against the roster's median and reports what cannot be true of a body. A fighter leaves this list when a replacement board lands — not when their model is regenerated, since regenerating from the same board is what produced the fault.

**Nothing outstanding.** Every fighter has one.

---

# The character blocks

Used **verbatim** as `[CHARACTER BLOCK]` in every prompt above — this is how
a fighter stays the same character across their sprites, their card and
their turnaround. Reproduced from
[asset-requests.md](asset-requests.md#character-blocks), which owns them.

**Where the block and the canon reference disagree, the reference wins.**
Every fighter now has a `<char>_idle.png`, regenerated from their approved
idle, and it carries the figure scale, palette and shading the delivered set
actually has — which block text cannot. The wiki's (Anime) render answers
design questions the reference leaves open, and is where the blocks came
from: three were rewritten in round 9E because they described characters who
looked nothing like their anime designs, and Uro's again in round 18 after an
ambiguous sentence was drawn the wrong way twice.

| Key | Block |
|---|---|
| `yuji` | "Yuji Itadori from Jujutsu Kaisen, athletic teenage boy with short spiky salmon-pink hair and brown eyes, wearing a dark navy high-collared jujutsu school uniform jacket over a red hoodie, matching dark trousers and white sneakers" |
| `todo` | "Aoi Todo from Jujutsu Kaisen, very large muscular man with black hair in a short topknot and thick eyebrows, wearing a dark navy jacket over a maroon shirt with dark trousers" |
| `yuki` | "Yuki Tsukumo from Jujutsu Kaisen, tall athletic young woman with very long straight blonde hair falling past her waist with two tufts framing her face and brown eyes, wearing a sleeveless dark indigo mandarin-collar top with gold frog clasps at the shoulder, a grey buttoned corset belt at the waist, high-waisted light blue jeans and brown ankle boots" |
| `uro` | "Takako Uro from Jujutsu Kaisen, lean athletic woman with a fierce confident grin, pale violet-pink hair sweeping upward and outward in wild flame-like curling points, sharp violet eyes with heavy dark eyeliner, large gold cylindrical drop earrings, a black choker and a black band on each wrist, her only covering **two separate bands of pale-cyan cloud vapour with soft drifting edges — one wrapped across the chest, one at the hips — with the midriff BARE between them and never a single garment joining the two**, bare arms and legs, barefoot with violet-painted nails" |
| `mahito` | "Mahito from Jujutsu Kaisen, slim young man with pale blue-grey patchwork skin covered in stitched seams, long grey-blue hair in a loose bun, dark sleeveless vest and dark trousers" |
| `sukuna` | "Ryomen Sukuna the King of Curses from Jujutsu Kaisen, bare-chested muscular man with spiky salmon-pink hair, four eyes, black tattoo band markings across his face, chest and arms, dark loose trousers with a black sash" |
| `choso` | "Choso from Jujutsu Kaisen, pale serious young man with long black hair tied into two high loose buns with strands framing his face, a dark horizontal marking across the bridge of his nose, wearing a loose black robe-like tunic with pale trim, wide sleeves, dark trousers and simple shoes" |
| `hakari` | "Kinji Hakari from Jujutsu Kaisen, tall young man with slicked-back blond hair and an undercut, wearing a black school jacket hanging open over his bare chest, dark trousers" |
| `yuta` | "Yuta Okkotsu from Jujutsu Kaisen, slim young man with messy black hair, wearing an all-white long-sleeve school uniform with white trousers, a katana at his hip" |
| `nanami` | "Kento Nanami from Jujutsu Kaisen, tall blond man with a straight bob and tinted rectangular glasses, wearing a tan-beige suit with a patterned tie, carrying a blunt-tipped cleaver sword" |
| `toji` | "Toji Fushiguro from Jujutsu Kaisen, tall muscular man with short black hair and a vertical scar at the corner of his mouth, fitted black short-sleeve T-shirt and loose dark charcoal trousers with a dark sash" |
| `reggie` | "Reggie Star from Jujutsu Kaisen, tall lean man with straight shoulder-length blond hair parted at the side, heavy-lidded tired eyes and a narrow pointed chin beard, wearing a shaggy knee-length tunic and matching shoulder cape built from layered rows of torn white paper receipts with small pale mint-green printed tabs, bare arms and bare lower legs, barefoot" |
| `nobara` | "Nobara Kugisaki from Jujutsu Kaisen, young woman with short auburn-orange bob hair, navy school uniform dress with a belt, dark tights and brown boots, small hammer in hand" |
| `meimei` | "Mei Mei from Jujutsu Kaisen, tall elegant woman with very long silver-lavender hair worn in thick loose braids, calm confident expression, wearing a fitted black high-collared long-sleeved dress with gold buttons and dark tights, carrying a large single-headed battle axe" |
| `maki` | "Maki Zen'in from Jujutsu Kaisen, athletic young woman with dark green hair in a high ponytail and rectangular glasses, navy school uniform tunic over dark leggings, carrying a long naginata polearm" |
| `momo` | "Momo Nishimiya from Jujutsu Kaisen, petite young woman with shoulder-length auburn hair and a large dark witch hat, dark navy Kyoto uniform dress, riding or holding a wooden broom" |
| `gojo` | "Satoru Gojo from Jujutsu Kaisen, tall slim young man with spiky white hair and a black blindfold over his eyes, wearing a black high-collared jujutsu uniform with dark trousers and black boots" |
| `megumi` | "Megumi Fushiguro from Jujutsu Kaisen, young man with spiky black hair, wearing a dark navy high-collared jujutsu uniform with dark trousers and brown boots" |
| `inumaki` | "Toge Inumaki from Jujutsu Kaisen, slim young man with light grey-blond hair, wearing a dark navy high-collared school uniform zipped up over his mouth, white sneakers" |
| `mechamaru` | "Ultimate Mechamaru from Jujutsu Kaisen, a tall humanoid cursed-corpse puppet with a smooth clay-brown carved head, two round glowing green lens eyes and a small third lens on the forehead, a fixed grin of bared square teeth, a thick white puffy scarf around the neck, wearing a dark navy high-collared jujutsu uniform tunic with a white sash and very wide baggy navy trousers, bare carved wooden hands and bare wooden feet" |
| `gakuganji` | "Yoshinobu Gakuganji from Jujutsu Kaisen, stern hunched elderly man, bald on top with long straight white hair falling past his shoulders at the sides, a long thin white beard and drooping moustache, deeply wrinkled face with hooded eyes and gold hoop earrings, wearing a cream-white kimono top under a black band T-shirt with the kimono sleeves hanging loose, wide dark-purple hakama trousers, white tabi socks and wooden geta sandals, a crimson-red Flying-V electric guitar slung across his chest on a strap" |
| `geto` | "Suguru Geto from Jujutsu Kaisen, tall man with long black hair in a topknot, wearing a black traditional robe with gold trim over dark clothing" |
| `jogo` | "Jogo from Jujutsu Kaisen, a volcano-headed cursed spirit with a single large eye, cracked earthen skin, wearing a yellow-and-black spotted fur mantle over dark trousers" |
| `panda` | "Panda from Jujutsu Kaisen, a large anthropomorphic panda with black and white fur, muscular build, a small teal cursed-energy core visible on his shoulder" |
| `hanami` | "Hanami from Jujutsu Kaisen, tall powerfully built cursed spirit with a lean muscular pale bone-cream body marked by thick black brushstroke stripes down the face, arms, chest and abdomen, a rigid mask-like face with hollow black eye sockets, pale slit pupils and a wide fixed grin of large square teeth, a crown of thick tan antler horns curving up and back over the scalp, the entire right shoulder and arm wrapped in heavy white cloth bound close to the body with stitched seams where it meets the chest, a white cloth sash knotted at the waist with the ends hanging, wide baggy black hakama trousers gathered at the ankles, barefoot with broad clawed feet and long dark claws on both hands" |
| `dagon` | "Dagon from Jujutsu Kaisen, a tall broad hunched humanoid cursed spirit with deep red outer limbs and a tan inner chest and belly, a black midsection, a smooth red octopus-like head with blank pale eyes and a beard of thick red tentacles hanging from the jaw, black bat-like wings folded at the lower back, four heavy clawed fingers per hand and broad two-toed feet" |
| `kurourushi` | "Kurourushi from Jujutsu Kaisen, a tall cockroach cursed spirit draped head to floor in a smooth glossy black shroud, a maroon insect face with eight red-and-orange eyes in uneven pairs and a wide grin of human teeth behind layered jaws, six very long thin purple antennae sweeping out from the head, dark chitinous insect legs splayed out at the base of the shroud, wielding a long dark cursed sword with six firing barrels along its spine" |
| `mahoraga` | "Mahoraga from Jujutsu Kaisen, the Divine General shikigami — a towering pale-white humanoid with grey sculpted musculature, a long segmented tail, and a fanned crest of white blade-like spines sweeping back from his head. **A brass eight-spoked karma wheel is mounted on the headdress behind his skull, with a ball at the end of each spoke** — it is part of his head and turns with it. Bandaged wrap and beads at the throat, a torn dark charcoal skirt over a pale sash, purple-grey wraps at wrists and ankles, barefoot, carrying a long pale bone-textured sword" |

---

# Outstanding by manifest, not by request

The other half of the question, and a narrower one: poses whose art EXISTS
and is wrong. A workbench flag says so directly; a pose drawing a file that
is not its own says so silently, which is how seven of them stayed invisible
until round 18G. Neither can see a pose that was never drawn — that is what
the rounds above are for.

**6 flagged, 12 drawing somebody else's art.**

| Fighter | Pose | Why |
|---|---|---|
| uro | `attack_light_a` | quality |
| dagon | `attack_light_a` | pose |
| dagon | `crouch_attack_b` | pose |
| dagon | `crouch_b` | pose |
| dagon | `run_reach_a` | pose |
| dagon | `run_reach_b` | pose |
| hanami | `attack_light_b` | drawing `special_neutral` |
| sukuna | `attack_light_b` | drawing `r3c0` |
| yuta | `attack_heavy_b` | drawing `attack_dash` |
| yuta | `attack_light_a` | drawing `attack_air_a` |
| yuta | `attack_light_b` | drawing `attack_air_b` |
| uro | `attack_light_a` | drawing `attack_light_b` |
| uro | `attack_light_b` | drawing `attack_light_a` |
| yuki | `attack_heavy_b` | drawing `ult_b` |
| kurourushi | `attack_heavy_b` | drawing `attack_light_b` |
| kurourushi | `attack_light_b` | drawing `attack_air_b_2` |
| kurourushi | `crouch_attack_b` | drawing `dash_2` |
| kurourushi | `dash` | drawing `dodge_roll_2` |

Separately, **2 improvement requests** — the art works and is just
not as good as it should be. Nothing is blocked by one, and the standing
ones are alpha fixes to delivered files, which is repo work rather than a
request.
