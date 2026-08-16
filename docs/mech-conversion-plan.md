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
- [x] K4. DEEP CLEANUP (extends X2/X3): when new content is fully placed,
        remove ALL assets, docs, history and testing rigs for characters
        and features no longer in the game (JJK sprites/effects/cards/
        backgrounds/voice files, JJK docs, JJK-specific tools).
        DONE: JJK effect/summon sprites, cards (+simple tiles), flat/domain/
        stage backgrounds, ui/logo and JJK docs deleted; domains.js stubbed
        (TODO A4), config_transform/config_summons emptied to machinery,
        shared_sprites' registry dropped, config_model_reach emptied (re-derive
        pending vs mech rigs), dead JJK ult directors deleted; JJK-only tools
        (voice audits, audio bench, hair/morph/twohand/simchain/staged smokes,
        tripo/build_model pipeline) deleted; move-list regenerated,
        game-mechanics rewritten to energy/ultimate terms; npm run check
        repaired. KEPT: assets/sfx + JJK voice tables (K2 owns), victory.jpg +
        favicons (replacements requested in image-requests.md), render3d/docs
        + props.js JJK tables (K3/K5 owner's area), dead specials.js handlers
        (C3/A4 sweep).

- [x] K10. EFFECT ART DELIVERED AND WIRED (the whole of docs/image-requests.md:
        61 plates). `tools/effects_intake.py` lands a delivery — trim to alpha,
        cap the long edge, copy into assets/sprites/effects/ and assets/ui/.
        Kits name their art (`sprite`/`sprites` + `spriteH`, 42 slots);
        statuses, guard dome + shatter, air-jump jet, KO burst and the
        full-energy HUD flare are wired at their draw sites; three arena
        hazards draw their plate over the procedural one; the JJK logo and
        versus badge are replaced and the stock dots are the mech-head chip.
        Placement lives in the NEW src/config_effects.js — the `otherSprites`
        block of the deleted character manifest, as configuration.
        ALSO FIXED, both turned up by the wiring: the `ranged` slot was outside
        the shared-sprite walk (so every mech's gun was unsizable and reported
        unused), and `nailstorm` hard-coded the JJK `effect:nail` in its volley.
        STILL OPEN: 13 hazard plates are loaded and placeable but their boards
        still paint themselves (one `hazardArt` call each, in stage_fx.js), and
        `shock_arc` has no electric status to attach to.

- [x] K11. EFFECT WORKBENCH (`workbench/`, replacing the JJK sprite workbench
        that was deleted with the sprite era). One grid, no character picker
        and no filters: every shared drawing in the game, each on a card that
        renders the REAL RIG at the game's own scale beside it — the mech that
        throws it, or the roster median as a ruler for art nobody throws — with
        the drawing at the height its kit declares, the move's collision shape,
        and the point it launches from. Drag to nudge, scroll to size, Mirror
        to flip, double-click to reset; "Copy config" emits src/config_effects.js.
        Reads through the game's own `sharedAdjust`/`sharedHit`/`sharedAttack`
        so the tool cannot disagree with the renderer about what a number means.
        Reference mechs stand in the BATTLE IDLE by default rather than each
        move's own pose: after K5 idle reads correctly on every rig, but several
        states still render mis-oriented (`ult` on every mech checked, `walk` on
        several). The pose control switches between them, and flipping the
        default is one line once the rest read as cleanly as idle does.

- [x] K5. ANIMATION MAPPING REFINEMENTS (owner, verified vs MM sources —
        jump/crouch are PROCEDURAL in MM, no clips exist anywhere):
        idle = frozen first frame of the mech's own heavy wind-up (battle
        carriage; exported clips carry combatPose) + existing breath layer;
        charge = frozen mid-wind-up of the heavy (poundHold plays unfrozen
        for titanus/colossus); dodge keeps ball (written under dodge_roll
        AND dodge_air — the dodge state aliases to those clip names);
        jump never uses ball. dizzy/hurt stay hitFlinch (MM's struck anim;
        teeter aliases to idle at the clip layer). Input: B DOUBLES RT as
        special; grab moved to D-pad up.
        MID-FLIGHT OWNER CHANGE, applied: MM GLB clips ONLY — the JJK pose
        library and default pose set are dead for mechs (POSE_LIBRARY_CLIPS
        off; a mech state with no glb mapping resolves null and draws the
        placeholder loudly; file deletion is a follow-up). So jump/crouch
        are NOT the generic pose set: jump = landReach frozen at 0.02s
        (airborne-neutral opening frame), crouch = land frozen at 0.14s
        (deepest absorb) — both times picked by eye off rendered frames.
        Mechanism: manifest clips.<state>.freeze <seconds>; resolveClip
        prefers glb over everything and collapses the clip to constant
        tracks at that time (loader.js freezeClip — cached, so the mixer
        action cache and mirror cache keep object identity; breath still
        animates on top of the frozen idle).

- [x] K6. PBR RENDER (owner decision): fighters render with their NATIVE
        baked PBR materials (the export's own metal/rough textures) under
        per-arena lighting with an MM-style grade (ACES-ish exposure,
        bloom-adjacent glow) — parity with how Mech Mayhem draws them. The
        toon/ink pass is NOT deleted: it moves behind `?render=toon` as an
        experiment flag. Root cause of the "wonky" facing screenshots was
        the pose-library priority bug (fixed in K5) + toon re-materialing;
        after K6, verify with side-by-side screenshots vs MM quality.
        IMPLEMENT AFTER K5 (same render3d files: loader applyToonMaterials
        becomes conditional, scene tone mapping per style, outline pass
        gated, brightness X1 folds into this).
        DONE: PBR default (toon.js RENDER_STYLE; `?render=toon` keeps the
        full anime pass), ACESFilmic + exposure 1.05, MM's rig (key 2.4
        warm / hemi 0.8 / rim light 0.85, HOT 1.3 in the stage tint via the
        stageLightTint seam), PMREM'd synthetic room env 0.85 for the
        metals (light_rig.js PBR_LIGHT_RIG); style rides the cache's light
        key. Also fixed under this task: mech grounding — the exports bind
        the mesh ~3.6m above their own skeleton, so standOnGround now knows
        the mech bone names AND folds in a once-per-rig mesh-vs-bone sole
        delta (pose.js meshSoleDelta); before this every mech rendered
        hip-high with its top cropped out of the frame.

- [x] K7. DELETE THE OLD 3D POSE CODE (owner): no JJK pose data may drive
        anything — all posing/animation from MM GLB clips only. K5 (amended
        mid-flight) already stops RESOLUTION through the library (jump/
        crouch become MM-clip freeze frames; POSE_LIBRARY_CLIPS off;
        default-pose fallback warns + placeholder instead of JJK poses).
        K7 then DELETES the files: render3d/src/pose_clips.js,
        battle_poses.js, baseline_poses.js, pose_library.js, walk_cycle.js,
        run_cycle.js, clip_schedule.js, pose_sheets.js, and the
        DEFAULT_CLIPS/mannequin-pose machinery in loader.js (keep the
        mannequin BODY if the placeholder needs it), plus their imports.
        AFTER K5 + K6 land (same files).
        DONE: all eight files deleted, plus tools/check_battle_poses.mjs
        (it existed to check the deleted tables; npm run check updated).
        groundOffset moved into pose.js. The mannequin BODY survives with
        its own spec-built clip set registered as its OWN clips (resolves
        via the "own" step), so `?mannequin=all` and the mannequin smoke
        passes still work; loader's DEFAULT_CLIPS fallback and the
        pose-library build are gone — a mech state with no glb mapping
        resolves null and draws the placeholder loudly.

- [x] K8. SAMPLE MM'S PROCEDURAL JUMP/CROUCH INTO CLIPS (owner confirmed
        they exist — they are ANIMATOR LAYERS, not named clips: the
        airborne rising-tuck/falling-spread + airReach + hover jet pose in
        robotworld src/mechs/animator.js ~line 596, and the duck layer
        ~line 792). Extend robotworld tools/export-mech.mjs (local clone at
        /workspace/hoai2k/robotworld, dev server :5175) to sample four
        synthetic states per mech through the real animator: jumpRise
        (vy>0), jumpFall (vy<0), hover, crouch (duck at that mech's own
        duckDepth). Re-export all 17, re-copy into mechs/ (PROVENANCE
        regen commands updated), regenerate the render3d manifest mapping
        jump<-jumpRise, fall<-jumpFall, crouch<-crouch, and the jet-burn
        air-jump <-hover. Supersedes K5's freeze-frame stopgap for jump/
        crouch (idle/charge freezes stay). AFTER K5 lands.

- [x] K9. WIRE THE DELIVERED ART (owner uploaded the full image-request
        round to assets/intake/: 58 effect sprites + stock_chip, vs_flash,
        wordmark_mech_brawler). Downscale/copy into assets/sprites/effects
        (game path), wire: power-effect sprites onto the kit configs'
        projectile/zone sprite refs (rocket_fist, arc_bolt, icicle_shard,
        raptor_egg, tsunami_wall…), status FX (burn_flame, frost_rime,
        shock_arc, venom_drip, glitch_shard, energy_flare, shield_dome/
        burst, jet_flame, ko_burst), hazard sprites into stage_fx per
        docs/arenas.md (ladle_pour, monorail_train, crane_hook+container,
        magnet_crane+car_husk, blast_charge, ice_floe, vine_whip,
        wind_streak, debris_sat, collapse_dust…), UI (stock chip, VS
        flash; EVALUATE the painted wordmark vs the CSS neon title
        side-by-side and keep whichever reads better, owner said the image
        is optional).
        DONE: all 61 intake pieces downscaled to game scale (effects ≤512
        long side into assets/sprites/effects, UI into assets/ui) and
        registered in assets.js EFFECT_KEYS; 33 power sprites wired onto the
        kits via the `sprite`/`spriteH` convention (ranged/specials/ults;
        shared_sprites now folds scales over the K1 `ranged` slot too, plus
        new waveSprite/eggSprite pairs); statuses+shared via a new
        particles.spriteFlash image particle (ko_burst on ring-out,
        shield_burst on break, burn_flame on burn ticks, frost_rime on
        drench, jet_flame on the air jump) and the shield bubble in
        render.js is now the hex shield_dome art; all 12 arenas draw their
        delivered hazard sprites over/instead of the procedural placeholders
        (stage_fx.js drawFx, procedural kept as streaming fallback); UI:
        stock_chip is the stock counter, vs_flash tears behind the VS
        splash, energy_flare pulses off a full ENERGY meter, and the
        PAINTED WORDMARK WON the side-by-side (kept on a .tube element so
        the flicker keyframes + neon-buzz reader still drive it).
        shock_arc/venom_drip registered, awaiting their TODO(engine)
        statuses; frill_flare rides a new counter-stance flash in
        specials.js. Validated: check_imports, smoke_stages 12/12,
        smoke_combat, match screenshots reviewed by eye.

## Phase 5 — polish and cleanup

- [ ] X1. Brighter grade: toon ramp lift, stage light rigs per arena palette,
        FX palette brightened.
- [ ] X2. Docs rewrite: game-mechanics.md, move list, characters, asset
        pipeline; JJK-specific docs deleted. CLAUDE.md + README rewritten.
- [ ] X3. Asset purge: JJK sprites/cards/backgrounds/music and render3d
        leftovers deleted as their replacements land.
- [x] X4. Tools: smoke tests updated for the new roster/stages (smoke_camera3d,
        smoke_ground3d, smoke_camera's cue/board tables rekeyed to the 12
        arenas; every tool now picks the first roster card instead of naming a
        JJK fighter); JJK-specific checks deleted. Done in the arena polish
        pass — docs/arena-polish-plan.md.
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

- [x] K12. STRAY-JJK SWEEP + TOOLING REPAIR. A pass over every JJK character
        and arena name left in the tree, splitting them into dead code, broken
        tools and historical rationale, and acting on the first two.

        REMOVED (all provably unreachable — no mech kit can trigger any of it):
        the RIKA melee-echo bonus and its `echoDamage` plumbing, the
        `modeToggle` special handler and its "PANDA CORE" popup, the
        `feedHunger` appetite passive and its two call sites. EMPTIED, with the
        reason written where the table used to be, because the machinery is
        generic and still wired: props.js `CHARACTER_PROPS`/`CHARACTER_CHAINS`/
        `CARRY_OVERRIDES`/`CHARACTER_MORPHS` (a mech carries its armament in its
        own mesh), pose.js `PRESENT_DEG`, config_camera.js `BOARD_CAMERA`, and
        camera3d/garnish.js `SYSTEMS`. Fixed: the game's DEFAULT `state.stageKey`
        still named a JJK board; index.html's moves/winner headings still read
        "Gojo"; three styles.css sizing comments justified themselves with names
        no longer on the roster; two docs used JJK examples for live mechanics.
        KEPT DELIBERATELY: the JJK names in render3d's ik.js/pose.js/loader.js/
        rig_fixes.js comments and README, which are measured evidence for why
        the solver is built as it is — the names are labels on data, and losing
        them would lose the reasoning.

        TOOLING, all of it silently broken before this: seven `data-character`
        selectors across six smoke tools named fighters who no longer exist, so
        each sat on a 60s `waitForSelector` and failed on a timeout that blamed
        a character rather than the roster — replaced with `pickAnyFighter`
        (smoke_boot.mjs), because a test that does not care which fighter it
        gets should not name one. `derive_attack_envelopes.mjs` measured NOTHING
        because rigs load lazily and it never asked for them eagerly; it now
        fills config_model_reach.js for all 17 mechs, which turns
        `audit_hitboxes` green for the first time since the conversion.
        `camera3d/index.js debugStats()` threw `ReferenceError: quad is not
        defined` on its first call — it read two bindings deleted with the
        billboard card layer — killing smoke_camera3d outright; the dead flags
        and the assertions on them are gone, and it counts bodies not quads.
        smoke_camera3d/smoke_ground3d point at real arenas now, three of the old
        indices having been past the end of a twelve-arena grid. 15 sounds were
        off the mono/-3 dBFS contract and are normalised — and normalising them
        exposed a second bug in `normalize_sfx.py`, which wrote every file back
        at a fixed 44.1 kHz/128 kb/s: the twelve ambience beds ship at 22 kHz/
        64 kb/s, so fixing their peak DOUBLED all twelve for no audible gain.
        It now preserves each file's own rate and bitrate (+2% instead of
        +100%, ~2.7 MB of download saved). `npm run check` passes end to end.

        STILL OPEN, and now visible rather than silent: the garnish layer and
        the per-board camera personality both need re-keying for the mech
        arenas (empty tables, machinery intact); `smoke_ground3d` reads a
        constant ~73 px foot float on every mech because its probe takes the
        lowest foot BONE as the sole, which is a human-rig assumption — the
        mechs stand correctly on the deck, and the fix is to measure the lowest
        skinned vertex instead.

## Decisions taken

- mechs/lib/ (robotworld's animation runtime) stays REFERENCE ONLY; render3d
  plays the exported glTF clips directly. If a clip proves unplayable as
  glTF, revisit.
- The 26-state clip contract stays. MM clips map onto it; states with no MM
  clip fall back per the manifest's inheritClips, same as before.
- Relative sizing uses the export's real heights, compressed by the existing
  HEIGHT_COMPRESSION curve — same mechanism, new numbers.
