# Canonical image specs — the visual read of all 12 concept images

The user-supplied canonical concept images are the source of truth for each
mech's look. **Commit the PNGs here as `<mechId>-front.png`** (they exist in
the design conversation; an AI session cannot save chat images itself).
Until/alongside that, this file records the detailed image-derived spec each
rebuild was built from — palettes are already baked into `roster.js` skin
recipes, geometry into `src/mechs/designs/<id>.js`. If a design ever needs
re-doing, work from the image if present, else from this spec.

Shared traits across all 12 images: full-body front view on plain gray
studio background, realistic PBR materials, panel lines, per-mech unit
decals (names/numbers/emblems), one or two emissive accent colors.

---

## titanus — mustard/crane-yellow over gunmetal, amber glow (0xffa832)
Gorilla mass rhythm: enormous arms, segmented multi-knuckle fists hanging to
knee height (each ≈1.5× head width), forearm drums thicker than thighs.
Sloped slab pauldrons (~30° out-down) with black/yellow hazard chevrons;
"TITANUS" decal on left pauldron side, emblem right. Broad chest tapering to
a narrow banded waist (dark vertebra rings) over a pelvis block with small
TITANUS crotch plate. Round amber reactor lens dead-center chest, ringed by
8 radial dark armor petals. Small sunken blocky head, wide amber T/Y-visor,
barely above the chest line. Twin RECTANGULAR radiator towers (vent grilles)
rising behind the head. Stocky legs, stacked shin guards, huge flat treaded
feet. Wear: 0.7, chips everywhere, heavy grime.

## vulcan — bone-white + oxide red over gunmetal, orange visor (0xff8c30), red lenses (0xff2822)
Heavy fire-support: broad chest with white slabs and red center plate
("VULCAN" + chevron emblem). Twin six-barrel GATLING FOREARMS (chrome
cluster + center barrel, brass wrist rings, dark muzzle ring). Quad missile
TOWERS flanking a small crested head: each an oct-facet column, red cap,
2×2 launch tubes with red lens spheres. Head: small white face, orange
visor strip, red crest (center blade + swept side antlers). Red hip skirt,
layered white shin guards, red outer calf plates with "07X", broad two-toe
feet. Wear: 0.4-0.48.

## viper — purple (0x4a3566) + black, neon green (0x5aff2e) — Eva-01 energy
Everything tapers to points. Arrowhead helm: pointed chin, green V-visor,
TWO tall vertical crown horn-blades (~1.5 head heights) + side spikes.
Layered pointed pauldrons swept up-out; "07" left, "02" right. Angular
layered chest over black under-suit, green glow slits between layers,
"VIPER" + snake emblem decals. Hard-pinched black waist, segmented abdomen.
Slim arms; LONG GREEN ENERGY DAGGERS mounted UNDER each forearm pointing
down-forward past the clawed black hands (~2.2× forearm length, on the
bladeL/R joints). Long digitigrade legs, knee spikes, "07" thigh plate,
3-toed claw feet with steel talons + dew claw.

## rhino — dark gunmetal (0x5c6066) + oxide red (0x8c3a32), red glow (0xff2a20)
Spiked siege beast, wrecked and riveted (wear 0.72+, rivet studs along all
plate edges). Signature: massive rounded armored CARAPACE DOME behind/above
the head (~1.3× torso width) ringed by a crown of steel spikes (10-14 up/out
+ inner ring of smaller ones). Rhino faceplate low between shoulders: big
central CHROME HORN (stacked cones, slight up-curve) + two smaller side
horns, red glowing eyes under heavy brow, vertical grill jaw. Chest pentagon
housing with RED GLOWING rhino-skull sigil. Enormous rounded spiked
pauldrons: "07" decal left, "RHINO" right, red panels. Huge layered arms,
spiked elbows, giant studded fists. Extremely thick layered legs, wide
stance, red glow seams at plate joins.

## tempest — deep navy (0x2a3560) hex-panel + dark steel, cyan glow (0x3fd8ff)
Storm knight (mid-heavy, bulkier than a "dancer"). Angular helm with cyan
V-visor and a tall glowing LIGHTNING-BOLT CREST (zigzag blade ~1.3 head
heights). Large angular pauldrons with pointed drooping outer tips:
"TEMPEST" decal right, "07" left; TESLA SPIRES (stacked tapering discs,
glow tip) rising behind each. Chest: V-housing with cyan core + jagged glow
strips (lightning) inside, glow slit vents flanking, winged emblem decal.
Bulky forearms each wrapped by THREE GLOWING CYAN RINGS; dark claw hands;
"T-07" decals on forearm/thighs. Layered legs with glow slits, swept fin
blades on outer calves near ankles, armored feet with glow toe slit.

## fenrir — bright bare-silver (0xb4b9c0) + dark steel, ice-blue glow (0x6cd8ff)
Full werewolf, mostly raw polished metal (metalPaint 0.62). Detailed wolf
head (~1.4× head unit): faceted cranium, long snarling snout, OPEN jaw with
upper+lower steel fangs, black nose, fierce ice-blue slanted eyes, tall
two-layer ears. Big spiked MANE RUFF framing head to shoulders (2-3
overlapping rows of long blade-spikes). V-tapered muscle-like chest plates,
exposed dark neck/abdomen mechanics with blue accents, wolf emblem decal;
"09" left pauldron, "12" right (compact pauldrons — mane dominates).
Muscular arms; hands with LONG curved steel talons (~0.5 forearm length).
Digitigrade muscular legs, blade shin guards, 3-clawed feet + dew claw.
Long thick armored tail (scale plates) ending in a large curved BLADE tip,
low S-curve, ~1.6× torso height.

## colossus — desert tan (0xa08a64) + dark gunmetal, amber glow (0xffc23c)
Headless walking fortress (MechWarrior Atlas/Catapult energy). Amber VISOR
SLIT embedded top-center torso under a shallow armored dome + antenna — no
neck/head silhouette. TWIN GIANT CANNON TUBES on the back in a V (up-out
~30°, each ~1.6× torso height, banded segments, dark flared muzzles) on the
pitching `mortars` joint. Chest front: GRID OF AMMO POUCHES (rows of rounded
capsules, 4×3-4) like sandbags; below, heavy hatches with hand-scrawled
TALLY-MARK graffiti decals. Huge drum pauldrons: "COLOSSUS 01" left, skull
emblem right. Massive arms, giant three-finger fists. Heavy central waist
hatch with warning triangle + hooks; thick side skirts. Enormous layered
legs, feet wider than thighs. Wear 0.66 + grime; hazard accents.

## wraith — near-black (0x232228), sparse red glow (0xff2030)
Gaunt reaper. Tall POINTED HOOD cowl rising to a sharp peak, draping to the
shoulders; black void face inside with ONE small red eye. Dominant element:
huge TATTERED CLOAK of jagged layered blade-strips from a shoulder yoke down
to shin height, 2-3 layers deep, swallowing the torso (front shows only a
narrow V-chest between cloak edges). Skeletal torso: V-chest plate, red
seams, exposed spine rings + rib arcs, pinched waist. Skeletal arms with
long articulated finger claws. ENORMOUS railgun (near mech height) held
vertically in the right hand: twin/triple rails with spacer rings, tall
receiver, stock, scope, red charge seam ("WR-110" stencil). Extremely thin
digitigrade legs, blade shins, spiked two-claw toes + rear spur.

## inferno — rust red (0x8a3626) + blackened steel, orange glow (0xff8a1e)
Grinning furnace juggernaut, the most worn of all (wear 0.75, grime 0.7).
Rounded helm whose face is a fiery jack-o-lantern: orange glowing eyes +
huge GRINNING MOUTH GRILL (dark teeth slats over orange glow). "INFERNO"
nameplate band above a HUGE riveted FURNACE GRILL dominating the chest:
heavy dark frame, 5-7 vertical bars over raging fire glow. Two big rounded
BOILER TANKS on the back (black, band rings, hazard-diamond decals), domes
visible over the shoulders, feed pipes to the arms. Boxy slab pauldrons
(hazard edges, "09" left, flame-skull emblem right) each topped by a CHIMNEY
pipe with small flames licking out. Heavy segmented arms with pistons/hoses
ending in flamethrower bells with pilot flames. Massive riveted legs, thigh
emblems, hazard shin bands, huge stompers.

## glacier — pale ice-blue (0x9fb2c2) with WHITE FROST patches, gunmetal frame, cyan glow (0x7ce0ff)
Frost fortress (second-widest after colossus). Giant slab pauldrons:
"GLACIER" decal left, "08" right, each CROWNED with clusters of large
translucent ICE CRYSTALS (4-6 cones, tallest ~0.8 head height); more small
crystals on upper back. Low embedded head: cyan visor of two horizontal glow
bars with a dark center grill, heavy brow, frost-mist breath from face
vents, small antenna. RIGHT forearm = long multi-segment CRYO CANNON:
stacked drum segments, translucent glowing COIL CORE section wrapped in
metal rings, dark collar, 2-3 long frost prongs around a recessed glow
muzzle (reaches mid-shin). Left arm: heavy gauntlet fist. Broad frosted
hex-plate chest with snowflake emblem; cyan abdomen slits; thick skirts;
enormous hex-plated legs and huge flat feet. Crystals translucent, NOT
emissive; wear 0.5 with light frost mottling (white base2 patches).

## cranky — rust-orange crab shell (0xa64a28 patchy over dark steel), blue-steel cannons (0x46759e), blue LED glow (0x4fc3ff)
Full crab. Enormous domed carapace shell (wider than tall) with heavy patchy
corrosion — orange paint flaking to dark steel; "CRANKY" + crab sigil center,
"07" right, small spike antennae row on the crown. NO raised head: face is
embedded under the shell brow — two clusters of FOUR round blue LED eyes
flanking a vertical grill mouth, framed by dark pipe "mandibles". TWO GIANT
serrated crab claws carried low in front (orange shell outer, dark mech
inner, chrome saw-tooth serrations along both jaws, claw ≈ torso height).
Shoulder-mounted WATER CANNONS ×2 atop the shell: blue-steel barrels with
banded segments and glowing blue muzzle rings, each fed by a blue riveted
TANK (brass bands, hoses) behind it. Wide stance segmented crab legs (dark
steel joints, orange armor caps on upper segments), flat gripper feet.
Squat, hunched silhouette; wear 0.78, drips/streak grime. Sea-worn.

## saurion — gunmetal-black raptor (0x33343a/0x17181c), red glow (0xff2418), white decals
Utahraptor frame, predatory S-pose. Long armored SNOUT with chrome steel
teeth in an exposed grin, single RED eye each side under an angry brow;
MOHAWK CREST of layered blade-feathers (metal quills) from crown down the
neck. Feather-blade rows: short mane over shoulders/upper back, wing-fan
rows along both forearms, and a DOUBLE ROW fanning the whole tail to its
tip. Long tail (≈ body length) with "MX-7 SAURION" plate mid-tail. Chest:
angular plates with a RED glowing core strip + seam glows; white decals
"77" both shoulders, skull-triangle corp logo + "SAURION" on chest.
Arms mid-length with THREE long chrome claws each. Digitigrade legs, thick
thighs, exposed piston shins, huge raised SICKLE TOE-CLAW (chrome) on each
foot + two ground toes. Whole body gunmetal black, red accent lights.

## frogger — lime green (0x7cb420) + translucent slime (glow 0xaef23c), black frame (0x262b20)
Frog-mech. Head merged into wide torso: two HUGE glass-dome BUG EYES on top
(lime iris, dark pupil, mechanical ring mounts), wide grin mouth-line seam,
and a TRANSLUCENT SLIME VISOR/chin — lime resin with DRIPS running off the
chin and chest (translucent, glowing slightly). "SLIMER" decal on brow.
FOUR ARMS: upper pair = big SLIME CANNONS on raised shoulder pods (angled
up-out, translucent glowing barrel cores, slime dripping from muzzles);
lower pair = articulated arms whose forearms are translucent slime tubes
ending in nozzle guns (also dripping). Black mech joints/frame between lime
armor plates; small hazard chevrons. Powerful crouched digitigrade legs w/
translucent slime shin sections; HUGE webbed 3-toed feet (translucent toe
tips). Glossy, clean-ish (wear 0.42), everything oozing lime gunk.

## JERRY — mech_jerry.png (The Tide-Bringer)
Giant robo-SHRIMP on grasshopper legs. Read: huge bulging segmented
carapace torso-head in weathered coral pink (0xb9816b / 0xa5583c, wear
~0.66) over black mech frame (0x35291f); olive seam bands at the shell
segment steps; white JERRY nameplate + chevron sigil front-center; pointed
serrated rostrum aimed down-forward; red bead eyes on stalks; two long
whip antennae sweeping up-back (+ short whiskers under the rostrum); a
NEST of six little segmented claw-arms wriggling under the chest; two
enormous forearm cannon pods with dark bores + red glow rings and live
robo-shrimp fleas crawling out of the muzzles; four-legged read: two
thick coral grasshopper femurs with spring pistons + long segmented
spur-rowed tibias to small clawed feet, plus a rear pair of thin strut
legs. Powers: flea pods (living ammo that hops erratically, attaches,
bites 3s, pops), Brine Swarm (6-flea burst), TIDAL PLAGUE (spring-crouch
mega-leap, landing quake + ring of 10 fleas). Signature motion: nervous
antenna snaps, arm-nest ripple (flares when firing), sharp head cocks,
rear-strut creep; jump is crouch-then-launch (jumpWindup 0.18, jump 24).

## NULLBOT — mech_null.png (The Fatal Exception)
A living system error. Read: TALL gaunt frame (legs+arms long, waist
pinched) in layered VOID-BLACK jagged shard-armor with a faint violet
sheen (0x14111a / 0x0b0910, low wear, dark 0x2e2a38 metal); silhouette is
all spikes — crown of swept horns on an angular skull, TWIN burning red
eyes (0xff1f2a), spike-stacked pauldrons, crooked spine-fan mantle off the
back, serrated forearm/calf fins, long clawed fingers and taloned feet.
Sternum bears the RED NULL SIGIL: a glowing ring with a blade slashed
through it (Ø). All over the shell, small rectangles of the body "fail to
render": multicolor data-corruption chips (cyan/magenta/red/green/blue)
flickering at wrong angles — in-engine these are glow2 shard plates
strobed by the animator plus glitchFleck particles off random joints.
Powers: every landed punch/backhand/bolt corrupts a PART of the victim
(glitch stack, kept all round; 10th stack = 3s total-corruption stun at
2x damage, then clears); Null Pointer (tumbling voxel-knot bolt),
SEGFAULT (de-rez dash-through), SYSTEM CRASH (corruption nova, +3 stacks),
finisher = grab, engulf in glitches, punch the CAMERA → 3s SYSTEM FAILURE
bluescreen (docs/canonical/null_bluescreen_of_death.png).
