# The Mech Mayhem conversion — plan and progress

The one document to read on resume. Each phase lists its tasks with a live
status marker; update the marker when a task moves, in the same commit as the
work, and note the commit hash beside finished tasks. Statuses: `[ ]` not
started · `[~]` in progress · `[x]` done · `[?]` blocked on an answer.

**The goal.** JJK Brawler II's engine and flow, Mech Mayhem's everything else:
17 mechs with their real stats and personalities, 12 arenas with hazards worth
respecting, the flickering-neon presentation, the soundtrack, and a brighter
read on the action than the JJK game had. Rigged GLBs from `mechs/` are the
character art; `intake/` holds the painted arena backgrounds and character
cards. Powers and hazards are DESIGNED for this brawler, seeded from what each
mech and arena is in Mech Mayhem — not transcribed from a 3D arena game that
plays nothing like a platform fighter.

## Ground rules

- Commit per task or tighter; every commit leaves boot + smoke_stages green.
- The old JJK content (roster, kits, stages, music, render3d rigs and clip
  tables) is REPLACED, not kept alongside; delete as each replacement lands.
- `mechs/` is generated — never hand-edited (mechs/PROVENANCE.md).
- New images we cannot make from existing assets go in docs/image-requests.md
  EARLY, so generation runs while code is written.
- Anything ambiguous: ask the owner, keep working elsewhere meanwhile.

## Phase 0 — research and design (everything else hangs off this)

- [x] R1. Character dossier: per mech, what their Mech Mayhem kit IS (stats,
        moves with numbers, capabilities, geometry work) and what it suggests
        in a platform fighter. Sources: mechs/characters.{json,md},
        mechs/GEOMETRY.md, robotworld src/mechs/roster.js.
- [x] R2. Arena dossier: per arena/theme, its look, props, hazards and
        gimmicks upstream. Sources: robotworld src/arena/*, public/levels,
        docs; intake/arenas/*.png for what the paintings show.
- [x] R3. Presentation dossier: how the neon title flicker is done, the menu
        palette, music inventory (src/music + public/sound), sfx, and what
        "brighter" should mean concretely in render3d's toon pass.
- [x] D1. docs/characters.md — the NEW system of powers: per mech, the full
        brawler kit (lights/heavies/dash/air, ranged, special, ult, movement
        quirks), with the reasoning. This is the design source of truth.
- [x] D2. docs/arenas.md — the NEW arena set: per arena, platforms, hazard
        design with timings/telegraphs, music pick, palette note.
- [x] D3. docs/image-requests.md — REWRITTEN for this game: power effects,
        hazard effects, UI garnish we cannot source from robotworld. Old JJK
        request docs and history deleted. DONE EARLY so generation can start.

## Phase 1 — presentation shell

- [x] P1. Title screen: flickering neon MECH BRAWLER wordmark, MM palette
        on the splash.
- [x] P2. Menu palette: JJK flow and layout, MM colours (neon on deep
        blue-black; styles.css theme swap).
- [x] P3. Select screen cards at assets/cards/<id>_card.jpg (grid art done; hero-card polish in X-phase): intake/cards/*.jpg as the hero cards; roster grid
        from the new characters.js.
- [x] P4. Music: replace assets/music with the MM soundtrack; menu theme +
        neon buzz on the splash; per-arena battle tracks per D2.
- [x] P5. README + site chrome (page title, manifest, favicons note).

## Phase 2 — the roster

- [x] C1. characters.js rebuilt (bbe5167) from mechs/characters.json: 17 mechs,
        identity, stats mapped into this engine's terms, relative sizing from
        real export heights, select-screen bars, quotes.
- [x] C2. config_metrics.js filled (hand-derived first pass; derive tool refresh pending): reach/width/crouch/air per mech from the
        export's real geometry.
- [x] C3. Kits (bbe5167; engine TODO worklist below) — moves.js/specials.js/ultimates.js/summons.js/domains.js
        replaced by the D1 design. JJK cursed-energy framing out; mech
        framing in. frameMeta gating replaced by clip-coverage gating —
        fixes the known smoke_combat failure.
- [ ] C4. Voice/quips: characters.json quotes wired to intro/win banter.

## Phase 3 — the mechs on screen (render3d)

- [x] M1. Rig intake (tools/mech_intake.mjs; JJK rigs deleted): mechs/*.glb into render3d's manifest with heightM from
        the export, toon settings; JJK rigs + render3d/assets JJK content
        deleted.
- [x] M2. Clip mapping (clips.<state>.glb + resolveClip extension): MM clip names (light1, bigPunch1, walk, run, ball,
        getup, …) mapped onto the 26-state contract per mech.
- [x] M3. Smooth playback (DIALS.onTwos false): on-twos stepping off; MM animation is smooth.
- [x] M4. Side-view presentation (CAMERA_YAW -60 to -78, both copies): blit camera turned toward profile so
        locomotion reads as travel while attacks still show silhouette.
- [x] M5. Relative sizing (manifest heightM + characters heightCm) (heightM in manifest; characters.js heightCm pending): heightM per mech from the export feeding the
        existing height-compression curve, so the roster keeps its real
        ordering (a 4 m frog next to a 12+ m artillery walker).
- [ ] M6. Anchors: muzzle/boost/core/overhead as FX attachment points for
        the new powers.

## Phase 4 — the arenas

- [x] A1. stages.js rebuilt (12 arenas, arenas/*.jpg plates, per-palette
        tints + `desc` blurbs; one plate serves both cameras — the flat/wide
        split is gone).
- [x] A2. stage_fx.js rebuilt (all 12 D2 hazards with telegraphs, warn
        zones and camera cues; JJK gimmicks deleted; orbital low-grav rides
        the existing `mods.gravityMul` seam; quarry's crystal-chime flavour
        left as a TODO in the file).
- [x] A3. Arena select: cards now show the arena plate + name + hazard
        blurb (stages.js `desc`, wired in ui.js/styles.css). Painted-card art
        swap can still follow if distinct card paintings are wanted.
- [ ] A4. domains.js: replaced per D1's ult design; the JJK domain art
        pipeline deleted.

## Phase 4b — owner directives (added mid-conversion)

- [x] K1. CONTROLS + INHERENT ENERGY (owner spec): LB = Ultimate at full
        attack energy (done). LT = shield/dodge. RB = RANGED attack — a new
        dedicated kit slot (the Mech Mayhem gun, moved out of
        specials.neutral). RT = special (neutral/side/down). X/Y light/
        heavy, A jump/fly, D-pad down = taunt. NEW RESOURCE: "inherent
        energy" — self-recovering over time (Mech Mayhem style); ranged
        shots spend it, specials spend MORE of it; dash/sprint stays free
        (base JJK behaviour). Needs: input mapping, fighter.js ranged
        action + energy pool, characters.js `ranged` slot per mech (gun
        configs), specials.neutral backfilled per mech (a new move or the
        old S/D redistributed), HUD inherent-energy bar, docs/characters.md
        control section updated.
        DONE: RB=ranged (own kit slot + cooldown, specials.js performRanged
        through the same handler path), RT=special, LT=shield, LB=ultimate,
        B=grab, A=jump alone, d-pad down=taunt (anim "win", 1.5s, any input
        cancels); `f.energy` pool (constants.js INHERENT_ENERGY: 100 max,
        14/s regen; ranged `p.energyCost` 4-22 per weapon, specials 30
        default; dash/sprint/shield free); every mech's MM gun moved to a
        top-level `ranged` config and N backfilled with one new
        identity-preserving special (S/D untouched); slim cyan energy bar
        under the HUD meter; CPU fires ranged at range when the pool is high;
        controls tables/moves screen/README/characters.md regenerated.
- [ ] K2. SFX: replace the JJK bank with Mech Mayhem's
        (robotworld public/sfx: 122 files + manifest — generic camelCase,
        <mech>_<event> overrides, amb_<arena> beds, step_<material>).
        Rewrite config_audio SFX table; wire per-mech overrides and arena
        ambience; drop JJK voice groups/spoken lines.
- [ ] K3. FACING RULES (owner spec, refines M4): idle = body slightly
        angled TOWARD camera; run/jump/attack HIT phase = pure left/right
        profile; attack WIND-UP turns toward camera as appropriate (never
        away); alternating-strike chains may alternate toward/away, FIRST
        one toward. Implement as a per-state + per-phase (pre/post beat)
        yaw bias in render3d pose facing.
- [ ] K4. DEEP CLEANUP (extends X2/X3): when new content is fully placed,
        remove ALL assets, docs, history and testing rigs for characters
        and features no longer in the game (JJK sprites/effects/cards/
        backgrounds/voice files, JJK docs, JJK-specific tools).

- [ ] K5. ANIMATION MAPPING REFINEMENTS (owner, verified vs MM sources —
        jump/crouch are PROCEDURAL in MM, no clips exist anywhere):
        idle = frozen first frame of the mech's own heavy wind-up (battle
        carriage; exported clips carry combatPose) + existing breath layer;
        charge = frozen mid-wind-up of the heavy; jump + crouch = drop the
        glb mapping, use render3d's generic pose set (real biped poses on
        the mech rig); dodge keeps ball (each mech's own tuck/spin variant
        — heavies exported stiff tucks, so nobody rolls who shouldn't);
        jump never uses ball. dizzy/teeter/hurt stay hitFlinch (confirmed
        as MM's struck anim). Input: B DOUBLES RT as special; grab moves
        to D-pad up. Needs freeze-frame support in resolveClip (subclip or
        freezeT carried to the sampler) + mech_intake PREFER updates +
        input remap. IMPLEMENT AFTER K3 lands (same render3d files).

## Phase 5 — polish and cleanup

- [ ] X1. Brighter grade: toon ramp lift, stage light rigs per arena palette,
        FX palette brightened.
- [ ] X2. Docs rewrite: game-mechanics.md, move list, characters, asset
        pipeline; JJK-specific docs deleted. CLAUDE.md + README rewritten.
- [ ] X3. Asset purge: JJK sprites/cards/backgrounds/music and render3d
        leftovers deleted as their replacements land.
- [ ] X4. Tools: smoke tests updated for the new roster/stages; JJK-specific
        checks deleted.
- [ ] X5. Final sweep: boot → select → match on 3 arenas → ult → KO with no
        console errors; deploy workflow check.

## Owner questions — ANSWERED

- [x] Q1. Title: **MECH BRAWLER**.
- [x] Q2. Roster: **all 17 at once** (nova/aegis are retired upstream and
        must not be referenced anywhere). Standard changes roster-wide, but
        verify one or two mechs first per effort, then expand.
- [x] Q3. Meter: renamed **ENERGY**. Full energy enables the ULTIMATE, which
        plays like a Domain Expansion did (same LB button, same gameplay
        role). Mech summons live INSIDE ultimates (fenrir's pack, jerry and
        saurion's duplicates) and are capped at 2-4 bodies, not a horde.
        Specials map to B + neutral/directions as needed. Flying mechs:
        flight is a double-jump with a different feel and control, not free
        flight.

## Key research facts (distilled from the dossiers, for resume)

- **Neon title technique (MM)**: per-WORD `<span class="tube">`, hollow via
  `-webkit-text-stroke: 3px` + `color:transparent`, 3-layer text-shadow
  (18px tight, 60px + 120px halos), two co-prime `steps(1,end)` flicker
  keyframes (7.3s/9.1s, delay -2.4s), dips to 0.2-0.45 never 0, stutter
  pairs. Buzz: JS reads getComputedStyle(tube).opacity each frame; crossing
  <0.9 plays a slice of neon_buzz.mp3. Palette: cyan #38e8ff, magenta
  #ff4dd8, amber #ffb43c, red #ff4d5e, green #62ff9a on #05070c; panels
  rgba(8,14,24,.82) edge rgba(96,200,255,.35). JJK styles.css :root tokens
  are the swap point; JJK lacks a magenta token (--accent-3). Keep JJK's
  --slash skew + select-spotlight (its own voice). MM fonts are SYSTEM
  stacks (Bahnschrift/DIN/Oswald 900 italic uppercase) — Barlow Condensed
  900 italic is the match, no new font needed.
- **Toon grade**: render3d uses NoToneMapping deliberately (two-band ramp);
  chase MM's bright-neon in toon.js TOON (shadeThreshold .62, tint
  [.52,.56,.74], rim .28) + stageLightTint boost, NOT tone mapping. MM
  numbers: exposure 1.02-1.10, hemi .6-.75, neon stages = dim sun + HOT
  colored rim 1.25-1.4 (magenta/violet/orange).
- **Music (MM)**: per-arena tracks match by normalized filename ("Neon
  District 2" -> neondistrict). 24 arena files (11 arenas, foundry none),
  6 general battle loops, menu = "Bohemian Cello Flame Hybrid Suite.mp3"
  (public/sound), neon_buzz.mp3 for the title. JJK equivalent: assets/music/
  boards/<Stage Name>.mp3 keyed by exact stage name, config_music.js
  hand-listed, check_music.mjs --write refreshes. No crossfades either side.
- **MM hazards that exist**: lava/acid burn ticks (grounded-only, soft),
  water/oil/mud drag, explosives (95 AoE + chain + fire crater), spikes,
  campfires, building collapse (<45% chunks), bobbing floats, aurora prop.
  NOT implemented upstream: wind, low-grav, ice slip (glacier ability only),
  jump pads, ring-out. Arena ambience beds amb_<theme>.mp3 ×12 in
  robotworld public/sfx.
- **MM sfx bank**: public/sfx 122 files w/ manifest (generic camelCase +
  <mech>_<event> overrides + amb_<arena> + step_<material>), sliced
  multi-take detection, category mix table.

## Decisions taken

- mechs/lib/ (robotworld's animation runtime) stays REFERENCE ONLY; render3d
  plays the exported glTF clips directly. If a clip proves unplayable as
  glTF, revisit.
- The 26-state clip contract stays. MM clips map onto it; states with no MM
  clip fall back per the manifest's inheritClips, same as before.
- Relative sizing uses the export's real heights, compressed by the existing
  HEIGHT_COMPRESSION curve — same mechanism, new numbers.
