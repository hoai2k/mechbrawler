#!/usr/bin/env bash
# Take one fighter from canon art to an approved model on both backends.
#
#     export TRIPO_API_KEY=tsk_...
#     export BLENDER=/path/to/blender
#     tools/build_model.sh gojo            # generate, then everything after
#     tools/build_model.sh gojo --local    # skip generation, reuse _raw.glb
#
# A fighter whose weapon would be fused into their body by the generator is
# drawn and generated EMPTY-HANDED, with the weapon generated alone; drop it at
# render3d/intake/<char>/_prop.glb and this joins the two after conform
# (tools/blender_attach_prop.py). Nothing else in the run changes.
#
# Every step here already existed; what did not exist was the ORDER, which is
# not obvious and is wrong in two places if you guess it:
#
#   * IMPORT RUNS TWICE. blender_author_clips.py scales its hip drops by the
#     fighter's height, and it reads that height from the MANIFEST — because
#     measuring the rig in rest reports nonsense on a bind pose that differs
#     from rest (2.73 m for a 1.73 m fighter). So the model has to be imported
#     once, unclipped, purely to record its height, before clips can be
#     authored against it.
#
#   * --face-fix IS ALWAYS PASSED. It is conditional inside the tool now
#     (measured off the rig's own spine), so passing it can only correct a
#     backwards rig, never turn a correct one around. Guessing per character
#     is how a fighter ships showing the camera their back.
#
# Failure stops the run: a half-imported fighter that still says `approved`
# is worse than one that never imported.
set -euo pipefail

CHAR="${1:-}"
[ -n "$CHAR" ] || { echo "usage: build_model.sh <char> [--local]"; exit 2; }
LOCAL=""
[ "${2:-}" = "--local" ] && LOCAL=1

cd "$(dirname "$0")/.."
BLENDER="${BLENDER:-blender}"
# ONE INTAKE. The billboard backend now draws render3d's rigs, so there is one
# place a rig lands and one manifest recording it (tools/billboard_intake.mjs
# says the same thing at more length). This script used to walk both.
RAW="render3d/intake/$CHAR/_raw.glb"
PROP="render3d/intake/$CHAR/_prop.glb"
GLB="render3d/intake/$CHAR/$CHAR.glb"

step() { printf '\n=== %s: %s\n' "$CHAR" "$1"; }

if [ -z "$LOCAL" ]; then
  step "generate + rig (Tripo)"
  node tools/tripo_generate.mjs "$CHAR"
else
  [ -f "$RAW" ] || { echo "no $RAW to reuse"; exit 1; }
fi

# Blender's output goes to a file and is filtered afterwards, NOT piped
# straight into grep. Piping hides the exit status behind grep's, and `|| true`
# on top of that hid it twice: a conform that died on a NameError printed a
# traceback nobody grepped for, left the PREVIOUS .glb sitting where the new
# one should be, and the run went on to "approve" it. A build that reports
# success for a step that crashed is worse than one that stops.
run_blender() {
  local script="$1"; shift
  local log; log=$(mktemp)
  if ! "$BLENDER" --background --python "$script" -- "$@" >"$log" 2>&1; then
    echo "--- $script FAILED:"; tail -25 "$log"; rm -f "$log"; return 1
  fi
  grep -E "renamed|scaled|hook|rescue|hair chain|pruned|palette|STILL MISSING|authoring|did not take|attached|grip|stray|wrote" "$log" || true
  rm -f "$log"
}

# The mtime is taken BEFORE the step and checked after. `set -e` catches a
# conform that exits non-zero, but not a run driven by a loop that swallowed
# the status — and a conform that never wrote leaves the PREVIOUS fighter's
# .glb sitting exactly where the new one should be, so every later step
# succeeds on the old mesh and the run reports an approval for it. Five
# fighters shipped their old bodies with their new weapons attached that way.
# Checking that the output was actually written is one line and ends it.
was=$(stat -c %Y "$GLB" 2>/dev/null || echo 0)
SUPPLIED=()
[ -f "$PROP" ] && SUPPLIED=(--prop-supplied)
step "conform"
run_blender tools/blender_conform.py --in "$RAW" --out "$GLB" --char "$CHAR" "${SUPPLIED[@]}"
[ "$(stat -c %Y "$GLB" 2>/dev/null || echo 0)" != "$was" ] || {
  echo "conform did not write $GLB — the file on disk is the PREVIOUS build"; exit 1; }

# A weapon generated on its own, joined here. Optional by design: only the
# fighters whose weapon a generator would otherwise fuse into an arm are drawn
# empty-handed, and the rest carry their props in the delivery as before.
if [ -f "$PROP" ]; then
  step "attach the separately generated prop"
  run_blender tools/blender_attach_prop.py --rig "$GLB" --prop "$PROP" --char "$CHAR" --out "$GLB"
fi

# Generated meshes arrive torn: where the boards showed nothing — the underside
# of a forearm against the ribs, the back of a hidden thigh — the generator ends
# the surface rather than guessing, and what is left shows the inside of the
# body through it. Every delivery but three had them, so this is the normal case
# and belongs in the run rather than in somebody's memory. Each cap copies its
# position, normal and skin weights from the rim vertex it sits on and invents
# only a texture coordinate, read off the surviving surface around the hole.
step "close the tears in the mesh"
python3 tools/fill_model_holes.py --apply --file "$GLB"

step "import once, for the height the clip author needs"
node tools/billboard_intake.mjs import "$CHAR" >/dev/null

step "author clips"
run_blender tools/blender_author_clips.py --in "$GLB" --out "$GLB" --char "$CHAR" --face-fix

step "validate, import and approve"
node tools/billboard_intake.mjs validate "$CHAR" 2>&1 | grep -E "^(ok|FAIL|warn.*MISSING)" || true
node tools/billboard_intake.mjs import "$CHAR" >/dev/null
node tools/billboard_intake.mjs approve "$CHAR"

printf '\n=== %s: done — review with\n    node tools/shot_workbench.mjs %s idle run sideHeavy\n' "$CHAR" "$CHAR"
