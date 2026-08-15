# The arenas — 12 stages, and why each hazard behaves the way it does

The design source of truth for MECH BRAWLER's stages. Each arena is one of
Mech Mayhem's 12 themes, painted (intake/arenas/*.png — all twelve share one
camera grammar: low camera, an empty floor across the bottom third, scenery
banked left and right, the hero landmark dead centre; every painting already
contains an unobstructed fight line). The hazard designs are seeded from what
is genuinely dangerous in that MM arena — its explosives, its lava, its
cranes — restaged for a platform fighter where a hazard must be a TELEGRAPHED
EVENT you play around, not ambient attrition.

Rules every hazard obeys (inherited from this engine's stage_fx doctrine):

1. **Telegraph first.** Nothing hits without a visible+audible wind-up of at
   least 0.8s. The telegraph is diegetic — a warning lamp, a bubbling patch,
   a crane traverse — never a UI marker.
2. **Fair to both.** Hazards key off position, never off who is winning.
3. **A camera cue on the big beat** (cameraCue), so the presentation lands.
4. **Ambient FX are constant, hazards are periodic.** Embers always drift;
   the ladle pours every ~20s. The rhythm is learnable.
5. Hazard damage is meaningful but never lethal from full health; the KILL
   is always the blast zone, the hazard is the setup.

Stage geometry vocabulary: `main` platform (the floor), `plats` (floating
platforms), blast zones per side. Backgrounds are the paintings; the floor
line sits where each painting's empty foreground is.

Music: per-arena tracks from Mech Mayhem (assets/music/boards/<name> N.mp3),
2-3 takes each, shuffled without repeats. Ironworks Foundry has no arena
track upstream and runs the general battle rotation (Steel Titans / Titan
Clash / Titan Forge loops). Menu theme: Bohemian Cello Flame Hybrid Suite.
The title screen is silent except the neon buzz.

---

### 1. NEON DISTRICT — the flagship
*Downtown at midnight. The signs stay lit even while the towers come down.*
**Painting:** rain-wet street canyon, magenta/cyan billboards, a torii gate
mid-distance, and a monorail viaduct spanning the upper third.
**Palette/light:** magenta rim `#ff4dd8` + cyan accents `#53e8ff` on
blue-black; the sign colours ARE the light.
**Layout:** wide flat main (the street); one long thin platform at
mid-height — THE MONORAIL TRACK — spanning most of the stage; the torii
crossbeam as a small high platform centre.
**Hazard — THE TRAIN.** Every ~22s a maglev train crosses the track
platform. Telegraph: the track lights ripple in the travel direction + a
station chime (2 beats, ~1.6s), then the train crosses in ~0.9s. Anyone ON
the track platform is hit (30 dmg, hard horizontal knock in travel
direction); anyone below is safe — the track is the dangerous high ground.
Alternates direction. Camera cue on the pass.
**Ambient:** drifting neon motes, billboard flicker synced to the title-tube
logic, rain-streak specular on the floor.
**Music:** Neon District 1/2.

### 2. IRONWORKS FOUNDRY
*Steam, brass and molten light.*
**Painting:** furnace drum pouring molten metal at left, chain hoists
hanging centre, a molten runner behind a handrail at the back, catwalk tiers.
**Palette/light:** amber-orange key, ember rim; the brightest warm stage.
**Layout:** main floor; two catwalk platforms left-high and right-mid; a
hanging HOOK PLATFORM centre that sways gently (bobber motion).
**Hazard — THE POUR.** Every ~20s the furnace tips and pours onto a marked
strip of the left floor. Telegraph: the tap-hole glows white, a klaxon +
rising pour-light (1.2s), then molten metal sheets down for 1.5s — standing
in the strip: 12 dmg/tick + BURN, soft (does not interrupt), exactly MM's
lava rule: it only burns the GROUNDED — jumping the pour is the answer.
Leaves a glowing floor patch that cools over 4s.
**Secondary:** the hook platform drops 6px under weight then rises — a
platform with suspension.
**Ambient:** embers rise, steam vents huff, distant hammer rhythm.
**Music:** general battle rotation (foundry has no own track upstream).

### 3. UPTOWN PLAZA — the tournament stage
*Glass towers, blue skies, excellent demolition insurance.*
**Painting:** midday civic plaza, bandshell + fountain centre, tree-lined.
**Palette/light:** the bright one — white sun, sky blue, no glow grime.
**Layout:** classic tournament trine: flat main, two symmetric side
platforms, one centre-high. NO hazard. Every roster needs its Final
Destination; this is it, and it is the daylight stage that shows the mechs'
real paint.
**Ambient:** fountain jets, drifting leaves off the trees, birds at round
start.
**Music:** Uptown Plaza 1/2.

### 4. HARBOR DOCKS
*Cranes, containers, salt air — nowhere for a 40-ton mech to hide.*
**Painting:** sunset terminal; container stacks left/right, two gantry
cranes, a moored trawler, the sun on the water.
**Palette/light:** violet-to-orange sunset; blue rim off the water.
**Layout:** main quay; container-stack platforms at two heights on each
side (staircase silhouettes); the crane SPREADER as a slowly traversing
platform across the top.
**Hazard — THE CRANE.** The spreader platform traverses the full stage
width on a ~14s cycle, pausing at each end. Every third pass it CARRIES A
CONTAINER: telegraph is the container visibly hanging + a horn blast; over
the middle it DROPS it (crush: 26 dmg, strong spike downward) onto a marked
floor shadow, and the container remains as a destructible cover block
(3 hits) before breaking up. The dropped-container-as-temporary-terrain is
the identity of the stage.
**Ambient:** gull cries, water glints, the trawler bobs.
**Music:** Harbor Docks 1/2/3.

### 5. SKY TERRACE
*A rooftop above the cloud deck. Mind the drop. Actually — use the drop.*
**Painting:** morning helipad, HVAC banks with cyan trim, glass rail, two
spires piercing an endless cloud sea.
**Palette/light:** brightest blues; white key, cyan trim glow.
**Layout:** helipad main; HVAC banks as low side platforms; two small deck
platforms high left/right. The SIDE blast zones are close — this is the
small, fast, scrappy stage.
**Hazard — THE WIND.** Every ~25s a gust crosses the terrace: telegraph is
the glass rail singing + cloud deck streaming + 1.5s of wind-streak FX,
then 2.5s of steady horizontal push (~12% of run speed, stronger airborne).
Both players see the direction the whole time. It never kills on its own —
it re-prices every edge guard while it blows.
**Ambient:** cloud deck below drifts; gondola rig sways on its cables.
**Music:** Sky Terrace 1/2.

### 6. SCRAPYARD 7
*Where old mechs go to rest. Tonight the pile grows either way.*
**Painting:** ochre dusk canyon of crushed cars, magnet crane dead centre,
the colossal buried mech hand rising from the debris.
**Palette/light:** sepia haze, the lowest-chroma stage; amber rim.
**Layout:** main dirt floor; the BURIED HAND's fingers are the platforms —
three at stepped heights (index/middle/thumb). Scrap ridge walls slope at
both edges.
**Hazard — THE MAGNET.** The crane magnet traverses above on a ~18s cycle.
Telegraph: it stops over a fighter's zone, hums, and its glow builds
(1.2s) — then SNAPS downward-pull for 0.8s: anyone in the column is yanked
upward (a reverse-spike: pulled 140px up, held a beat, dropped). Being
pulled mid-recovery is death off the top; on the ground it is an unforced
juggle state. Then it swings away with whatever scrap it caught and drops a
CAR HUSK on a marked spot (12 dmg, leaves brief debris cover).
**Ambient:** sand-wind drift +X, crusher thumps, rust creaks.
**Music:** Scrapyard 7 1/2.

### 7. CRYSTAL QUARRY
*A mining pit lined with resonant crystal. Every impact rings like a bell.*
**Painting:** night pit, benched terraces ringing the frame, a hero cluster
of violet crystals lit from within, headframe on the rim, floodlights.
**Palette/light:** indigo + violet `#b46bff`; floodlight pools of white.
**Layout:** pit-floor main; terrace bench platforms stepping up both sides
(asymmetric: two left, one right); a crystal outcrop platform centre-right.
**Hazard — THE BLASTING ROUND.** Mining charges on a ~24s cycle: three
marked drill-spots glow amber in sequence (klaxon + blinking LED, 1.5s
each), then detonate one-two-three (22 dmg each, radial launch). The
SEQUENCE is readable — the third spot is safe until the second fires —
so the round is a positional dance, not a scramble. Detonations RING the
crystals: for 3s after, all hit sounds chime (pure flavour).
**Ambient:** violet motes, floodlight cones sweep slowly.
**Music:** Crystal Quarry 1/2.

### 8. VOLCANIC FORGE
*Built on a live caldera. The floor is not lava — but it is adjacent.*
**Painting:** night caldera, black basalt spire walls, a rock arch right,
a lava lake behind, glowing fissures branching across the floor.
**Palette/light:** the hottest grade — red-black, orange fissure glow,
exposure highest of the set.
**Layout:** basalt main with the painting's fissure lines painted across
it; a basalt-column platform left, the rock ARCH as a platform right (with
the pass-through beneath it).
**Hazard — THE FISSURES.** The floor's fissure network runs on a ~19s
cycle: cracks brighten and hiss (1.4s telegraph), then FLAME JETS erupt
along one of three fissure branches for 1.2s (14 dmg + BURN, launches
lightly upward). Which branch is armed is visible from the glow. Grounded
only — the air is safe, exactly the MM lava rule.
**Secondary:** every ~45s the lava lake at the back SURGES: the whole floor
edge glows and both edge zones vent steam — a 3s period where edge-hugging
is taxed (6 dmg/tick at the last 60px of each side).
**Ambient:** embers, ash flecks, deep caldera rumble.
**Music:** Volcanic Forge 1/2.

### 9. FROZEN OUTPOST
*Research station K-9. Ambient temperature: hostile.*
**Painting:** aurora night; radome + quonsets left, antenna masts right,
icebreaker locked in the floe centre-back, moon and stars.
**Palette/light:** navy + ice blue, aurora green `#2ee89a` accents; the
aurora curtain slowly breathes across the sky.
**Layout:** frozen plain main; pipeline-run platforms left and right (the
trestle lines from the painting); the icebreaker's bow as a high centre
platform.
**Hazard — THE FLOE.** The centre third of the main floor is SEA ICE. On a
~26s cycle it groans and web-cracks (2s telegraph, cracks spread visibly),
then BREAKS: a 3s hole into black water (falling in: 10 dmg, GUNK-like
slow, and a scramble-out hop; it is not a pit KO). Then it refreezes shiny.
Fighting on the refrozen patch is normal — MM's ice is paint, not slip, and
that stays true here except during glacier's own ult.
**Ambient:** snowfall, aurora shimmer, the station's window lights.
**Music:** Frozen Outpost 1/2.

### 10. DESERT RUINS
*The columns held for 3,000 years. Held.*
**Painting:** golden-hour dig site; pylon gate right with turquoise inlay,
colonnade left, half-buried sphinx centre, blowing sand.
**Palette/light:** sandstone golds, dusty blue sky, turquoise `#2ee6c8`
accent — the warm daylight stage that is not a tournament flat.
**Layout:** processional-way main; the colonnade LINTEL as a left platform;
the sphinx's back and head as centre platforms; the gate top as a high
right platform.
**Hazard — THE COLLAPSE.** The colonnade is structural: heavy hits near its
two standing columns damage them (visible cracks, three stages). When one
breaks — telegraph: grinding, dust, a 1s lean — the LINTEL FALLS (28 dmg
crush along its length), and the left platform is GONE for the rest of the
match. The stage can be permanently simplified by fighting recklessly in
the wrong place, which is the ruins' whole story. Columns respawn between
stocks, rebuilt "by the dig crew" during the KO pause.
**Secondary:** periodic sand gusts (visual + faint push, half the terrace
wind, ~35s cycle).
**Ambient:** streaming sand past the sphinx, heat shimmer.
**Music:** Desert Ruins 1/2/3.

### 11. JUNGLE TEMPLE
*The canopy hides an arena the old kings built.*
**Painting:** misty canopy interior; stepped pyramid with roof-comb centre,
buttressed trunks framing, liana curtains right, stone idols flanking.
**Palette/light:** deep greens, god-rays, bio-glow accent `#62ff9a`.
**Layout:** flagstone main; the pyramid's TIERS as centre platforms (two
levels); a bough platform high left; liana curtain at right edge.
**Hazard — THE CANOPY.** The lianas are LIVE: on a ~20s cycle a vine
curtain sweeps across the right half (telegraph: leaves shower + the vines
draw back taut, 1.2s), then WHIPS across (16 dmg, strong horizontal knock
toward centre — it throws you INTO the fight, never off the stage).
**Secondary:** spore bursts from the ferns when stomped (pure FX), and
every ~40s the god-rays shift, re-lighting the stage (ambience only).
**Ambient:** falling leaves, insect drone, temple drips.
**Music:** Jungle Temple 1/2.

### 12. ORBITAL PLATFORM
*Station VALKYRIE's landing deck. Artificial gravity, genuine consequences.*
**Painting:** open flight deck; robotic arm left, shuttle + tanks right,
the blue planet limb filling the horizon, amber deck chevrons.
**Palette/light:** space black + steel, cyan trim, the planet's blue glow
as fill; stars.
**Layout:** deck main; the robotic ARM's forearm as a slow-moving platform
(it drifts through three positions on a ~16s loop, pausing at each); the
shuttle's fuselage as a right platform.
**Hazard — LOW GRAVITY + THE DEBRIS PASS.** This is the one arena that
changes physics: gravity 12% lower for everyone (MM never implemented its
"artificial gravity" — we do, because a fighter can). Jumps are moonier,
juggles float, the plunge is scarier. And every ~30s station debris
crosses the sky lane: telegraph is a proximity alarm + tracking brackets
on two entry points (1.5s), then two satellite chunks streak through the
upper platform zone (20 dmg, spike trajectory). The high ground is
periodically artillery country.
**Ambient:** slow starfield drift, solar wing tracking, the planet's
terminator creeping.
**Music:** Orbital Platform 1/2.

---

## The hazard systems, shared

- **Crush / drop objects** (harbor container, scrapyard husk, ruins lintel):
  one spawner in stage_fx with per-stage payloads; dropped objects may leave
  temporary destructible cover.
- **Floor events** (foundry pour, volcano fissures, frozen floe): grounded-
  only damage, soft hits, burn/slow statuses from the shared status set.
- **Traversal hazards** (neon train, harbor spreader, orbital arm): moving
  platforms with a schedule; the train is the only one that hits.
- **Field effects** (terrace wind, orbital gravity, ruins gusts): global
  physics modifiers with full-duration visible FX.
- **Pull** (scrapyard magnet): the one vertical-displacement hazard.
- Camera cues fire on: train pass, ladle pour, container drop, magnet grab,
  blast sequence start, fissure eruption, floe break, lintel fall, vine
  whip, debris pass. The 3D camera already listens (camera_mode cues).

## What deliberately did NOT survive from MM

- **Toroidal wrap, free-roam bounds, building destruction** — this is a
  platform fighter; stages are framed, not tiled. Building collapse
  survives only as the ruins' authored column mechanic.
- **Ambient attrition lava/mud fields** — MM's always-on floor hazards
  become PERIODIC events with telegraphs; only their grounded-only rule
  and their statuses carry over.
- **Explosive barrel scatter** — the chain-reaction fireworks fold into
  authored hazard beats (quarry charges) instead of random furniture.
- **Ammo crates and fountains** — no pickups, as decided in characters.md.
