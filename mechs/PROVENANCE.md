# Where this directory came from

Everything here is GENERATED from the `hoai2k/robotworld` repo (Mech Mayhem).
Nothing in it was authored by hand in this repo, and nothing in it should be
edited here — an edit would be silently discarded the next time the bundle is
regenerated.

## Regenerating

`public/models/export/` is gitignored in robotworld (214 MB of derived files),
so this bundle cannot be fetched from git. It is built by three tools, in
order, against a running dev server:

```
cd <robotworld>
npm install
npx vite --port 5175 --host 127.0.0.1        # leave running

PORT=5175 node tools/export-mech.mjs --all   # the .glb + .json per mech
PORT=5175 node tools/export-bundle.mjs       # lib/, mechkit.js, index.json
PORT=5175 node tools/export-chars.mjs        # characters.json/.md, art/

PORT=5175 node tools/exportcheck.mjs --all   # verify before copying
```

Then copy `public/models/export/.` over this directory.

`export-mech.mjs` also samples Mech Mayhem's PROCEDURAL jump/crouch layers into
real clips (they are animator layers keyed off the frame context, not named
clips — `src/mechs/animator.js`): every mech carries five sampled pose clips —
`jumpRise` (airborne rising tuck, vy>0), `jumpFall` (falling spread, vy<0),
`hover` (jet-flight pose at full speed ratio), `crouch` (the duck layer at
that mech's own `stats.duck` depth), each 0.5s held — and `battleIdle` (1s):
the ready combat stance, the readyK carriage layer fully engaged with the
idle breath/sway alive on top. Per-mech personality is baked in (konga's
`airReach` arms-up, frogger's deep squat).

Generated from robotworld `ad1e65d` (+ the pose-clip sampling extension to
`tools/export-mech.mjs`/`src/dev/export.js`), and all 17 exports passed `exportcheck`
at that revision: 0.00% size difference against the game build, 0° facing,
15/15 game joints present by name, every anchor on the right bone, and every
clip moving bones rather than merely existing.

## Why the export rather than the raw game models

The shipped `public/models/mech_*.glb` in robotworld are **not** usable on
their own, and this is the trap worth naming:

- their transform (yaw offset x model scale x height scale) lives in a runtime
  manifest, not in the file, so a raw import faces the wrong way at the wrong
  size;
- their anchors are built at runtime from that same manifest and exist in no
  file at all;
- **`animations: 0`** — every shipped GLB is unanimated, because robotworld's
  animation library is procedural. The clips are generated at runtime.

The export folds all three in: the transform is baked into vertices and bone
rest offsets, anchors are real `anchor_<name>` nodes parented to the bone they
ride, and every clip is sampled at 30fps through robotworld's real animator and
written as glTF keyframe tracks. That is why this directory is 252 MB and the
raw models are a fraction of it, and why the raw models are the wrong input.

## What is in here

```
<id>.glb          the mech: geometry, materials, skeleton, anchors, animation
<id>.json         its anchors and clips, without opening the glb
index.json        all 17 mechs at a glance, for picking one at runtime
characters.json   stats, every attack with real numbers, personality, and the
                  engine CAPABILITIES each body needs
characters.md     the same as a readable dossier
GEOMETRY.md       behaviour a model cannot carry — the rocket fist, seam cuts,
                  burners, surface walking — i.e. what this engine must build
mechkit.js        a small three.js runtime; imports nothing, you hand it THREE
lib/              robotworld's real animation system, 53 modules, deps: three
art/<id>/         badge, poster, thumbnail, four-view turnaround, action pose
```

The roster is 17: colossus, cranky, fenrir, frogger, glacier, inferno, jerry,
konga, nullbot, rhino, saurion, tempest, titanus, tritone, viper, vulcan,
wraith. (aegis and nova were retired upstream and are not exported.)

## How this relates to render3d/

It does not, yet. `render3d/assets/` still holds the JJK rigs and its own
manifest; this directory is the incoming content that replaces them. Bridging
the two — the render3d manifest entry, the pose schedules in
`render3d/src/pose_sheets.js`, and the metrics in `src/config_metrics.js` —
is the character content-contract work, and `docs/content-contract.md` is where
that mapping will be written down.

Note that `lib/` is robotworld's animation system, which overlaps with what
`render3d/src/` already does. Both should not survive. Which one wins is a real
decision and not a foregone one: render3d is already wired into this game's
combat and camera, while `lib/` is what these clips were authored against.
