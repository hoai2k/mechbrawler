# tools/ — checkers, smoke tests and pipelines

No build step anywhere: every tool runs directly with `node` (or `python3` for
the Blender/audio pipelines). The Playwright smoke tests need the game served
first: `node server.mjs` (port 5174), and a Chromium binary (`CHROMIUM_PATH`
if yours is elsewhere).

## Static checkers (no server needed)

- `check_imports.mjs` — every named import across src/ resolves.
- `check_kits.mjs` — every kit `type` in characters.js has a handler; every
  `passive.id` is read by something (or listed as TODO).
- `check_controls.mjs` — the control map is consistent.
- `check_music.mjs` — config_music.js matches the files in assets/music
  (`--write` refreshes it).
- `check_audio_mix.mjs`, `normalize_sfx.py --check` — SFX bank consistency.
- `check_voice.mjs` — spoken-line lengths match the mp3s (JJK-era; shrinks
  with K2's SFX replacement).
- `check_battle_poses.mjs` — the render3d pose libraries still name real
  bones, cover the expected frames and hold reachable angles.
- `check_doc_links.py` — no dead relative links in docs/.
- `check_model_facing.mjs`, `check_model_normals.mjs`,
  `audit_model_health.py` — GLB sanity.
- `audit_hitboxes.mjs`, `audit_stage_reach.mjs` — kit reach vs. stage
  geometry.
- `build_move_list.mjs` — regenerates docs/move-list.md from characters.js
  (`--check` gates staleness).

## Smoke tests (server on :5174)

- `smoke_boot.mjs` — boots to the title with no console errors.
- `smoke_stages.mjs` — every arena loads and runs.
- `smoke_combat.mjs` — every fighter's kit fires in a real match.
- `smoke_blastzone.mjs`, `smoke_ledge.mjs` — KO and ledge behaviour.
- `smoke_camera.mjs`, `smoke_camera3d.mjs`, `smoke_camera_render.mjs`,
  `smoke_ground3d.mjs`, `smoke_render3d.mjs`, `smoke_render_backend.mjs` —
  the 2.5D/3D camera and render backends.
- `smoke_controllers.mjs`, `smoke_select_layout.mjs` — input and menus.
- `smoke_workbench.mjs` — every control in the effect workbench reaches the
  picture (Size, X, Y, Rotate, Mirror), the launch cross sits on the muzzle
  combat.js spawns from, and both workbenches boot clean at desk and phone
  size. Mirror shipped silently one-way once; this is the guard.

## Pipelines

- `mech_intake.mjs` — mechs/*.glb into render3d's manifest (see
  mechs/PROVENANCE.md; `mechs/` is generated, never hand-edited).
- `sfx_intake.mjs`, `generate_sfx.py`, `generate_voice.py` — audio intake and
  generation (K2 rewires these to the Mech Mayhem bank).
- `derive_attack_envelopes.mjs` — measures per-mech attack reach from the
  rigs into src/config_model_reach.js (pending a mech re-run; the table is
  empty since the JJK rigs were deleted).
- `derive_muzzles.mjs` — measures where each mech's shot leaves it from the
  `anchor_muzzle*` nodes MM's exporter ships, into src/config_model_muzzles.js.
  `--check` (no browser) fails while that file is stale; `npm run check` runs
  it. Anchors that land behind the centre line or under the floor are rejected
  and named, not shipped — see docs/mm-exporter-notes.md.
- `blender_*.py`, `bake_*.py`, `*_model_*` — Blender/GLB surgery utilities.

The JJK-era rigs (voice-take audits, the audio workbench bench, sprite-era
hair/morph/two-hand/braid smokes, the staged-fighter sweep) were deleted in
the mech conversion (plan task K4) along with the systems they tested.
