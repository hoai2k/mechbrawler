"""Author a fighter's animation clips onto their delivered rig, headless.

    blender --background --python tools/blender_author_clips.py -- \
        --in  render3d/assets/yuji/yuji.glb \
        --out billboards/intake/yuji/yuji.glb \
        --char yuji [--face-fix]

WHY POSES ARE DIRECTIONS, NOT ANGLES
------------------------------------
The obvious way to write a pose is Euler angles per bone. It does not survive
contact with a second rig. Angles are relative to a bone's REST orientation,
and rest orientations differ: the B0 mannequin is a T-pose with arms along X,
while the first generated delivery came back in an A-pose with arms hanging
down Z. Replaying the mannequin's angles on that rig swung every arm through
the floor, and every pose that moved a leg came apart.

So a pose here names, for each bone it cares about, the WORLD DIRECTION that
bone should point (head toward tail) in the character's own frame:

    forward = +Y      up = +Z      character's right = +X   (Blender axes)

`aim_bone` then solves the local rotation that achieves it, whatever the rest
pose happens to be. The vocabulary reads like stage directions — "upper arm
forward and a little down, forearm straight forward" is a punch — and the same
pose lands correctly on a T-pose rig, an A-pose rig, and the mannequin.

Bones a pose does not mention stay at rest, so each entry says only what it
changes.

THE CONTRACT, restated because this file is where it is honoured:
  * durations and contact beats come from render3d/src/states.js — combat is
    tuned so a strike lands the instant its hitbox goes live;
  * clips are AIM-NEUTRAL — the engine pitches the spine and solves the
    striking limb onto the target (ik.js), so a clip that bakes its own angle
    fights it;
  * no baked bob, squash, landing dip or roll spin — motion.js layers those on
    top and would double them;
  * looping clips repeat their first pose at the end so the seam does not pop.
"""

import argparse
import math
import os
import re
import sys

import bpy
from mathutils import Matrix, Quaternion, Vector

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STATES_JS = os.path.join(REPO, "render3d", "src", "states.js")
FPS = 30


def load_states():
    src = open(STATES_JS, encoding="utf8").read()
    body = re.search(r"export const STATES = \{(.*?)\n\};", src, re.S)
    if not body:
        sys.exit("could not parse STATES out of render3d/src/states.js")
    out = {}
    for m in re.finditer(r"^  (\w+):\s*\{([^}]*)\}", body.group(1), re.M):
        name, fields = m.group(1), m.group(2)
        dur = re.search(r"duration:\s*([\d.]+)", fields)
        beat = re.search(r"beat:\s*([\d.]+)", fields)
        out[name] = {
            "duration": float(dur.group(1)) if dur else 0.5,
            "beat": float(beat.group(1)) if beat else None,
            "loop": "loop: true" in fields,
        }
    return out


# --------------------------------------------------------------- the poses
#
# Unit-ish direction vectors; they get normalised. Read them as: which way does
# this limb segment point, with the character facing +Y.

def V(x, y, z):
    return Vector((x, y, z)).normalized()

DOWN = V(0, 0, -1)
UP = V(0, 0, 1)
FWD = V(0, 1, 0)

POSES = {
    # ---- neutral -------------------------------------------------------
    "idle_a": {
        "Spine": V(0, 0.05, 1), "Spine1": V(0, 0.03, 1), "Spine2": V(0, 0.02, 1),
        "LeftArm": V(-0.16, 0.02, -0.99), "RightArm": V(0.16, 0.02, -0.99),
        "LeftForeArm": V(-0.10, 0.16, -0.98), "RightForeArm": V(0.10, 0.16, -0.98),
        "LeftUpLeg": V(-0.06, 0, -1), "RightUpLeg": V(0.06, 0, -1),
    },
    "idle_b": {
        "Spine": V(0, 0.09, 1), "Spine1": V(0, 0.05, 1), "Spine2": V(0, 0.01, 1),
        "LeftArm": V(-0.18, 0.03, -0.98), "RightArm": V(0.18, 0.03, -0.98),
        "LeftForeArm": V(-0.11, 0.20, -0.97), "RightForeArm": V(0.11, 0.20, -0.97),
        "LeftUpLeg": V(-0.06, 0, -1), "RightUpLeg": V(0.06, 0, -1),
    },
    # ---- locomotion ----------------------------------------------------
    "run_reach": {
        "Spine": V(0, 0.34, 0.94), "Spine1": V(0, 0.18, 0.98), "Head": V(0, -0.12, 0.99),
        "LeftUpLeg": V(-0.05, 0.80, -0.60), "LeftLeg": V(0, 0.34, -0.94), "LeftFoot": V(0, 0.92, -0.39),
        "RightUpLeg": V(0.05, -0.55, -0.84), "RightLeg": V(0, -0.86, -0.51), "RightFoot": V(0, 0.42, -0.91),
        "LeftArm": V(-0.14, -0.52, -0.84), "LeftForeArm": V(-0.10, -0.30, -0.95),
        "RightArm": V(0.14, 0.50, -0.85), "RightForeArm": V(0.08, 0.72, -0.69),
    },
    "run_pass": {
        "Spine": V(0, 0.34, 0.94), "Spine1": V(0, 0.18, 0.98), "Head": V(0, -0.12, 0.99),
        "LeftUpLeg": V(-0.05, 0.06, -1), "LeftLeg": V(0, -0.55, -0.84), "LeftFoot": V(0, 0.8, -0.6),
        "RightUpLeg": V(0.05, 0.02, -1), "RightLeg": V(0, -0.10, -0.99), "RightFoot": V(0, 0.9, -0.4),
        "LeftArm": V(-0.15, -0.15, -0.98), "LeftForeArm": V(-0.10, 0.10, -0.99),
        "RightArm": V(0.15, 0.15, -0.98), "RightForeArm": V(0.10, 0.35, -0.93),
    },
    "run_reach2": {
        "Spine": V(0, 0.34, 0.94), "Spine1": V(0, 0.18, 0.98), "Head": V(0, -0.12, 0.99),
        "RightUpLeg": V(0.05, 0.80, -0.60), "RightLeg": V(0, 0.34, -0.94), "RightFoot": V(0, 0.92, -0.39),
        "LeftUpLeg": V(-0.05, -0.55, -0.84), "LeftLeg": V(0, -0.86, -0.51), "LeftFoot": V(0, 0.42, -0.91),
        "RightArm": V(0.14, -0.52, -0.84), "RightForeArm": V(0.10, -0.30, -0.95),
        "LeftArm": V(-0.14, 0.50, -0.85), "LeftForeArm": V(-0.08, 0.72, -0.69),
    },
    "dash": {
        "Spine": V(0, 0.46, 0.89), "Spine1": V(0, 0.26, 0.97), "Head": V(0, -0.20, 0.98),
        "LeftUpLeg": V(-0.05, 0.40, -0.92), "LeftLeg": V(0, -0.10, -0.99),
        "RightUpLeg": V(0.05, -0.30, -0.95), "RightLeg": V(0, -0.55, -0.83),
        "LeftArm": V(-0.18, -0.55, -0.81), "RightArm": V(0.18, 0.30, -0.94),
        "RightForeArm": V(0.10, 0.62, -0.78),
    },
    "jump": {
        # Rising: knees drawn up, arms trailing DOWN AND BACK. Overhead arms
        # read as a dive and made jump and fall the same silhouette.
        "Spine": V(0, 0.16, 0.99), "Head": V(0, 0.10, 0.99),
        "LeftUpLeg": V(-0.06, 0.72, -0.69), "LeftLeg": V(0, -0.30, -0.95), "LeftFoot": V(0, 0.86, -0.5),
        "RightUpLeg": V(0.06, 0.30, -0.95), "RightLeg": V(0, -0.52, -0.85),
        "LeftArm": V(-0.22, -0.62, -0.75), "RightArm": V(0.22, -0.62, -0.75),
        "LeftForeArm": V(-0.16, -0.44, -0.88), "RightForeArm": V(0.16, -0.44, -0.88),
    },
    "fall": {
        # Falling: legs trailing and apart, arms out to the sides just above
        # the shoulder — braced, not cheering.
        "Spine": V(0, -0.14, 0.99), "Head": V(0, 0.14, 0.99),
        "LeftUpLeg": V(-0.14, -0.34, -0.93), "LeftLeg": V(0, 0.26, -0.97),
        "RightUpLeg": V(0.14, 0.34, -0.93), "RightLeg": V(0, -0.24, -0.97),
        "LeftArm": V(-0.72, -0.24, 0.65), "RightArm": V(0.72, -0.24, 0.65),
        "LeftForeArm": V(-0.62, -0.10, 0.78), "RightForeArm": V(0.62, -0.10, 0.78),
    },
    "land": {
        # Per the roster's sprite `land`: an ASYMMETRIC absorb — one hand
        # dropped toward the floor, the other back for balance. The symmetric
        # arms-forward version read as a second crouch.
        "Spine": V(0, 0.30, 0.95),
        "LeftUpLeg": V(-0.10, 0.30, -0.95), "LeftLeg": V(0, -0.42, -0.91),
        "RightUpLeg": V(0.10, 0.34, -0.94), "RightLeg": V(0, -0.44, -0.90),
        "LeftArm": V(-0.36, -0.20, -0.91), "LeftForeArm": V(-0.24, 0.10, -0.96),
        "RightArm": V(0.20, 0.50, -0.84), "RightForeArm": V(0.10, 0.58, -0.81),
    },
    "hurt": {
        # Arms THROWN OUT wide (sprite read), not tucked down-back.
        "Spine": V(0, -0.34, 0.94), "Spine1": V(0, -0.22, 0.98), "Head": V(0, -0.45, 0.89),
        "LeftArm": V(-0.66, -0.28, -0.52), "RightArm": V(0.66, -0.28, -0.52),
        "LeftForeArm": V(-0.55, -0.42, -0.55), "RightForeArm": V(0.55, -0.42, -0.55),
        "LeftUpLeg": V(-0.08, -0.18, -0.98), "RightUpLeg": V(0.08, 0.10, -0.99),
    },
    "crouch_a": {
        # As deep as the sprites draw it (pose brief §3: hips at heel height,
        # thighs closer to horizontal than vertical) — thighs driven forward
        # near level, shins near vertical, matched by the larger HIP_DROP.
        "Spine": V(0, 0.44, 0.90), "Spine1": V(0, 0.26, 0.97), "Head": V(0, -0.26, 0.96),
        "LeftUpLeg": V(-0.22, 0.86, -0.46), "LeftLeg": V(0, -0.30, -0.95), "LeftFoot": V(0, 0.95, -0.3),
        "RightUpLeg": V(0.22, 0.86, -0.46), "RightLeg": V(0, -0.30, -0.95), "RightFoot": V(0, 0.95, -0.3),
        "LeftArm": V(-0.30, 0.26, -0.92), "RightArm": V(0.30, 0.26, -0.92),
        "LeftForeArm": V(-0.16, 0.62, -0.77), "RightForeArm": V(0.16, 0.62, -0.77),
    },
    "shield": {
        "Spine": V(0, 0.14, 0.99), "Head": V(0, 0.06, 1),
        "LeftArm": V(-0.42, 0.36, -0.83), "LeftForeArm": V(0.24, 0.52, 0.82),
        "RightArm": V(0.42, 0.36, -0.83), "RightForeArm": V(-0.24, 0.52, 0.82),
        "LeftUpLeg": V(-0.10, 0.14, -0.98), "LeftLeg": V(0, -0.18, -0.98),
        "RightUpLeg": V(0.10, 0.14, -0.98), "RightLeg": V(0, -0.18, -0.98),
    },
    "ledge": {
        "Spine": V(0, 0.06, 1),
        "LeftArm": V(-0.22, 0.10, 0.97), "LeftForeArm": V(-0.10, 0.06, 0.99),
        "RightArm": V(0.30, -0.10, 0.95), "RightForeArm": V(0.16, 0.20, 0.97),
        "LeftUpLeg": V(-0.08, 0.20, -0.98), "LeftLeg": V(0, -0.30, -0.95),
        "RightUpLeg": V(0.08, 0.06, -1), "RightLeg": V(0, -0.14, -0.99),
    },
    "tuck": {
        "Spine": V(0, 0.62, 0.78), "Spine1": V(0, 0.50, 0.87), "Head": V(0, 0.55, 0.84),
        "LeftUpLeg": V(-0.12, 0.86, -0.50), "LeftLeg": V(0, -0.55, -0.84),
        "RightUpLeg": V(0.12, 0.86, -0.50), "RightLeg": V(0, -0.55, -0.84),
        "LeftArm": V(-0.34, 0.55, -0.76), "LeftForeArm": V(-0.10, 0.86, -0.50),
        "RightArm": V(0.34, 0.55, -0.76), "RightForeArm": V(0.10, 0.86, -0.50),
    },
    # The air dodge per the sprite read: a TWIST out of the line of the blow —
    # body turned, knees drawn to one side, limbs pulled in. It shared the
    # roll's ball, and only the roll spins (motion.js), so the two evades were
    # indistinguishable mid-air.
    "air_twist": {
        "Spine": V(0, 0.30, 0.95), "Spine1": V(0, 0.18, 0.98), "Head": V(0, -0.10, 0.99),
        "LeftUpLeg": V(-0.20, 0.74, -0.64), "LeftLeg": V(0, -0.46, -0.89),
        "RightUpLeg": V(0.14, 0.48, -0.87), "RightLeg": V(0, -0.60, -0.80),
        "LeftArm": V(-0.28, 0.36, -0.89), "LeftForeArm": V(-0.10, 0.74, -0.66),
        "RightArm": V(0.28, 0.36, -0.89), "RightForeArm": V(0.10, 0.74, -0.66),
        "_twist": {"Hips": 30, "Spine1": 14, "Spine2": 10},
    },
    # Dizzy per the sprite read: a forward SLUMP — guard gone, arms dangling
    # loose in front, head hanging — swaying side to side. The old upright
    # side-tilt kept the arms at rest and read as an idle with a head-shake.
    "dizzy_a": {
        "Spine": V(0.08, 0.28, 0.96), "Spine1": V(0.04, 0.16, 0.99),
        "Head": V(0.18, 0.30, 0.94),
        "LeftArm": V(-0.18, 0.20, -0.96), "RightArm": V(0.18, 0.22, -0.96),
        "LeftForeArm": V(-0.12, 0.28, -0.95), "RightForeArm": V(0.12, 0.30, -0.95),
    },
    "dizzy_b": {
        "Spine": V(-0.08, 0.24, 0.97), "Spine1": V(-0.04, 0.14, 0.99),
        "Head": V(-0.18, 0.34, 0.92),
        "LeftArm": V(-0.18, 0.22, -0.96), "RightArm": V(0.18, 0.20, -0.96),
        "LeftForeArm": V(-0.12, 0.30, -0.95), "RightForeArm": V(0.12, 0.28, -0.95),
    },
    "prone": {
        # Flat on the back: the whole body lies along the ground plane.
        "Spine": V(0, -0.99, 0.10), "Spine1": V(0, -1, 0.05), "Spine2": V(0, -1, 0),
        "Neck": V(0, -0.96, 0.28), "Head": V(0, -0.96, 0.28),
        "LeftUpLeg": V(-0.10, -0.98, 0.16), "LeftLeg": V(0, -0.99, -0.10),
        "RightUpLeg": V(0.10, -0.98, 0.16), "RightLeg": V(0, -0.99, -0.10),
        "LeftArm": V(-0.60, -0.72, 0.34), "RightArm": V(0.60, -0.72, 0.34),
    },
    "win": {
        "Spine": V(0, -0.06, 1), "Head": V(0, -0.10, 0.99),
        "RightArm": V(0.26, -0.10, 0.96), "RightForeArm": V(0.10, 0.06, 0.99),
        "LeftArm": V(-0.24, 0.10, -0.96), "LeftForeArm": V(-0.14, 0.34, -0.93),
    },
    # ---- strikes -------------------------------------------------------
    #
    # Every strike keys the WHOLE BODY: both legs, both feet, the spine chain,
    # both arms, and a hip/chest twist. The first pass keyed the spine and the
    # striking arm only, which is why the fighter read as a statue with a
    # moving arm — and why the punches did not appear to reach: the upper arm
    # was aimed 29 degrees DOWNWARD, so the fist finished near his own hip
    # instead of out at the opponent's chin.
    #
    # STANCE. He leads with his RIGHT side. The three-quarter camera sits on
    # his right (tools/smoke_facing.mjs measures it), so the striking arm is
    # the NEAR arm and never disappears behind his own torso — the single
    # biggest thing separating a punch that reads from one that does not.
    # Every strike therefore drives off the rear (left) leg, whose heel comes
    # up on contact, and lands on a planted, straightened lead leg.
    "guard": {
        "Spine": V(0, 0.12, 0.99), "Spine1": V(0, 0.06, 1), "Spine2": V(0, 0.03, 1),
        "Head": V(0, 0.10, 0.99),
        "RightUpLeg": V(0.12, 0.34, -0.93), "RightLeg": V(0, -0.18, -0.98), "RightFoot": V(0, 0.94, -0.34),
        "LeftUpLeg": V(-0.16, -0.30, -0.94), "LeftLeg": V(0, -0.34, -0.94), "LeftFoot": V(0, 0.84, -0.54),
        "RightArm": V(0.26, 0.22, -0.94), "RightForeArm": V(0.06, 0.74, -0.67),
        "LeftArm": V(-0.28, 0.06, -0.96), "LeftForeArm": V(-0.02, 0.78, -0.63),
        "_twist": {"Hips": 16, "Spine1": 8, "Spine2": 6},
    },
    "jab_wind": {
        "Spine": V(0, 0.04, 1), "Spine1": V(0, 0.02, 1), "Spine2": V(0, 0, 1),
        "Head": V(0, 0.14, 0.99),
        "RightUpLeg": V(0.12, 0.30, -0.95), "RightLeg": V(0, -0.22, -0.98), "RightFoot": V(0, 0.92, -0.39),
        "LeftUpLeg": V(-0.16, -0.34, -0.93), "LeftLeg": V(0, -0.40, -0.92), "LeftFoot": V(0, 0.80, -0.60),
        "RightArm": V(0.30, -0.10, -0.95), "RightForeArm": V(0.10, 0.62, -0.78),
        "LeftArm": V(-0.28, 0.02, -0.96), "LeftForeArm": V(-0.04, 0.76, -0.65),
        "_twist": {"Hips": 6, "Spine1": -6, "Spine2": -10},
    },
    "jab": {
        # Arm level at shoulder height and straight down the facing: this is
        # the pose the whole reach complaint was about.
        "Spine": V(0, 0.14, 0.99), "Spine1": V(0, 0.08, 1), "Spine2": V(0, 0.06, 1),
        "Head": V(0, 0.20, 0.98),
        "RightUpLeg": V(0.10, 0.44, -0.89), "RightLeg": V(0, -0.06, -1), "RightFoot": V(0, 0.96, -0.28),
        "LeftUpLeg": V(-0.14, -0.46, -0.88), "LeftLeg": V(0, -0.20, -0.98), "LeftFoot": V(0, 0.66, -0.75),
        "RightArm": V(0.10, 0.96, -0.26), "RightForeArm": V(0.02, 1, -0.02),
        "LeftArm": V(-0.26, -0.16, -0.95), "LeftForeArm": V(-0.06, 0.62, -0.78),
        "_twist": {"Hips": 30, "Spine1": 22, "Spine2": 18},
    },
    "hook_wind": {
        "Spine": V(0, -0.06, 1), "Spine1": V(0, -0.04, 1), "Spine2": V(0, -0.02, 1),
        "Head": V(0.06, 0.16, 0.98),
        "RightUpLeg": V(0.14, 0.24, -0.96), "RightLeg": V(0, -0.16, -0.99), "RightFoot": V(0, 0.90, -0.44),
        "LeftUpLeg": V(-0.18, -0.40, -0.90), "LeftLeg": V(0, -0.50, -0.87), "LeftFoot": V(0, 0.74, -0.67),
        "RightArm": V(0.52, -0.40, -0.76), "RightForeArm": V(0.44, -0.16, -0.88),
        "LeftArm": V(-0.26, 0.12, -0.96), "LeftForeArm": V(-0.02, 0.80, -0.60),
        "_twist": {"Hips": -14, "Spine1": -18, "Spine2": -22},
    },
    "hook": {
        # The whole body turns over: 60 degrees of hip rotation between the
        # coil and the contact is where a heavy gets its weight.
        "Spine": V(0, 0.18, 0.98), "Spine1": V(0, 0.10, 0.99), "Spine2": V(0, 0.06, 1),
        "Head": V(0, 0.24, 0.97),
        "RightUpLeg": V(0.08, 0.40, -0.91), "RightLeg": V(0, -0.06, -1), "RightFoot": V(0, 0.96, -0.28),
        "LeftUpLeg": V(-0.14, -0.34, -0.93), "LeftLeg": V(0, -0.20, -0.98), "LeftFoot": V(0, 0.70, -0.71),
        "RightArm": V(0.06, 0.94, -0.34), "RightForeArm": V(-0.24, 0.96, -0.06),
        "LeftArm": V(-0.24, -0.30, -0.92), "LeftForeArm": V(-0.10, 0.40, -0.91),
        "_twist": {"Hips": 26, "Spine1": 20, "Spine2": 16},
    },
    "upper_wind": {
        "Spine": V(0, 0.26, 0.96), "Spine1": V(0, 0.16, 0.99), "Head": V(0, 0.10, 0.99),
        "RightUpLeg": V(0.14, 0.40, -0.90), "RightLeg": V(0, -0.44, -0.90), "RightFoot": V(0, 0.92, -0.40),
        "LeftUpLeg": V(-0.18, -0.20, -0.96), "LeftLeg": V(0, -0.44, -0.90), "LeftFoot": V(0, 0.80, -0.60),
        "RightArm": V(0.34, -0.20, -0.92), "RightForeArm": V(0.16, 0.34, -0.93),
        "LeftArm": V(-0.26, 0.10, -0.96), "LeftForeArm": V(-0.04, 0.76, -0.65),
        "_twist": {"Hips": 0, "Spine1": -12, "Spine2": -16},
    },
    "uppercut": {
        "Spine": V(0, -0.08, 1), "Spine1": V(0, -0.04, 1), "Head": V(0, 0.18, 0.98),
        "RightUpLeg": V(0.10, 0.40, -0.91), "RightLeg": V(0, 0.02, -1), "RightFoot": V(0, 0.98, -0.18),
        "LeftUpLeg": V(-0.14, -0.44, -0.89), "LeftLeg": V(0, -0.10, -0.99), "LeftFoot": V(0, 0.60, -0.80),
        "RightArm": V(0.14, 0.62, 0.77), "RightForeArm": V(0.04, 0.34, 0.94),
        "LeftArm": V(-0.28, -0.20, -0.94), "LeftForeArm": V(-0.08, 0.56, -0.82),
        "_twist": {"Hips": 30, "Spine1": 26, "Spine2": 22},
    },
    "chop_wind": {
        "Spine": V(0, -0.10, 0.99), "Spine1": V(0, -0.06, 1), "Head": V(0, 0.10, 0.99),
        "RightUpLeg": V(0.14, 0.26, -0.95), "RightLeg": V(0, -0.20, -0.98), "RightFoot": V(0, 0.90, -0.44),
        "LeftUpLeg": V(-0.18, -0.34, -0.92), "LeftLeg": V(0, -0.44, -0.90), "LeftFoot": V(0, 0.76, -0.65),
        "RightArm": V(0.26, -0.30, 0.92), "RightForeArm": V(0.16, -0.50, 0.85),
        "LeftArm": V(-0.28, 0.06, -0.96), "LeftForeArm": V(-0.02, 0.78, -0.62),
        "_twist": {"Hips": -10, "Spine1": -16, "Spine2": -20},
    },
    "chop": {
        "Spine": V(0, 0.40, 0.92), "Spine1": V(0, 0.28, 0.96), "Head": V(0, 0.30, 0.95),
        "RightUpLeg": V(0.10, 0.46, -0.88), "RightLeg": V(0, -0.24, -0.97), "RightFoot": V(0, 0.96, -0.28),
        "LeftUpLeg": V(-0.14, -0.44, -0.89), "LeftLeg": V(0, -0.26, -0.96), "LeftFoot": V(0, 0.62, -0.78),
        "RightArm": V(0.12, 0.86, -0.50), "RightForeArm": V(0.02, 0.80, -0.60),
        "LeftArm": V(-0.24, -0.26, -0.93), "LeftForeArm": V(-0.08, 0.44, -0.89),
        "_twist": {"Hips": 26, "Spine1": 22, "Spine2": 18},
    },
    "kick_air": {
        "Spine": V(0, -0.24, 0.97), "Head": V(0, 0.16, 0.99),
        "LeftUpLeg": V(-0.08, 0.86, -0.50), "LeftLeg": V(0, 0.98, -0.16), "LeftFoot": V(0, 0.98, -0.20),
        "RightUpLeg": V(0.10, -0.34, -0.94), "RightLeg": V(0, -0.46, -0.89), "RightFoot": V(0, 0.70, -0.71),
        "LeftArm": V(-0.44, -0.24, -0.86), "LeftForeArm": V(-0.20, -0.40, -0.89),
        "RightArm": V(0.50, 0.14, -0.85), "RightForeArm": V(0.24, 0.56, -0.79),
        "_twist": {"Hips": 14, "Spine1": 10, "Spine2": 8},
    },
    "low_jab": {
        "Spine": V(0, 0.46, 0.89), "Spine1": V(0, 0.30, 0.95), "Head": V(0, 0.16, 0.99),
        "LeftUpLeg": V(-0.22, 0.56, -0.80), "LeftLeg": V(0, -0.66, -0.75), "LeftFoot": V(0, 0.94, -0.34),
        "RightUpLeg": V(0.24, 0.70, -0.67), "RightLeg": V(0, -0.56, -0.83), "RightFoot": V(0, 0.96, -0.28),
        "RightArm": V(0.10, 0.97, -0.22), "RightForeArm": V(0.02, 1, -0.06),
        "LeftArm": V(-0.26, -0.20, -0.94), "LeftForeArm": V(-0.06, 0.56, -0.83),
        "_twist": {"Hips": 22, "Spine1": 18, "Spine2": 14},
    },
    # ---- identity: Yuji's kit -------------------------------------------
    # Divergent Fist — one punch, the cursed energy a beat behind it. Both
    # fists commit; the front one lands and the back one is already loaded.
    "divergent": {
        "Spine": V(0, 0.20, 0.98), "Spine1": V(0, 0.12, 0.99), "Spine2": V(0, 0.08, 1),
        "Head": V(0, 0.22, 0.97),
        "RightUpLeg": V(0.10, 0.50, -0.86), "RightLeg": V(0, 0, -1), "RightFoot": V(0, 0.98, -0.20),
        "LeftUpLeg": V(-0.14, -0.52, -0.84), "LeftLeg": V(0, -0.16, -0.99), "LeftFoot": V(0, 0.58, -0.81),
        "RightArm": V(0.08, 0.98, -0.18), "RightForeArm": V(0.02, 1, 0.02),
        "LeftArm": V(-0.24, -0.36, -0.90), "LeftForeArm": V(-0.06, 0.30, -0.95),
        "_twist": {"Hips": 34, "Spine1": 30, "Spine2": 26},
    },
    # Manji Kick — the sliding low sweep.
    "manji": {
        "Spine": V(0, 0.30, 0.95), "Spine1": V(0, 0.20, 0.98), "Head": V(0, -0.20, 0.98),
        "LeftUpLeg": V(-0.10, 0.94, -0.32), "LeftLeg": V(0, 0.99, -0.10), "LeftFoot": V(0, 0.98, -0.20),
        "RightUpLeg": V(0.22, 0.30, -0.93), "RightLeg": V(0, -0.66, -0.75), "RightFoot": V(0, 0.86, -0.50),
        "LeftArm": V(-0.50, -0.30, -0.81), "LeftForeArm": V(-0.30, -0.10, -0.95),
        "RightArm": V(0.44, 0.24, -0.87), "RightForeArm": V(0.20, 0.62, -0.76),
        "_twist": {"Hips": 20, "Spine1": 14, "Spine2": 10},
    },
    # Unbreakable Grit — plants and refuses to fall.
    "grit": {
        "Spine": V(0, 0.24, 0.97), "Spine1": V(0, 0.16, 0.99), "Head": V(0, -0.10, 0.99),
        "LeftUpLeg": V(-0.30, 0.20, -0.93), "LeftLeg": V(0, -0.24, -0.97),
        "RightUpLeg": V(0.30, 0.20, -0.93), "RightLeg": V(0, -0.24, -0.97),
        "LeftArm": V(-0.44, 0.30, -0.85), "LeftForeArm": V(0.30, 0.46, -0.83),
        "RightArm": V(0.44, 0.30, -0.85), "RightForeArm": V(-0.30, 0.46, -0.83),
    },
    # Black Flash — the wind-up, coiled to the back foot.
    "flash_wind": {
        "Spine": V(0, -0.20, 0.98), "Spine1": V(0, -0.14, 0.99), "Spine2": V(0, -0.10, 0.99),
        "Head": V(0.14, 0.14, 0.98),
        "RightUpLeg": V(0.14, 0.20, -0.97), "RightLeg": V(0, -0.14, -0.99), "RightFoot": V(0, 0.88, -0.48),
        "LeftUpLeg": V(-0.20, -0.44, -0.87), "LeftLeg": V(0, -0.54, -0.84), "LeftFoot": V(0, 0.72, -0.69),
        "RightArm": V(0.56, -0.52, -0.65), "RightForeArm": V(0.40, -0.30, -0.87),
        "LeftArm": V(-0.30, 0.20, -0.93), "LeftForeArm": V(-0.04, 0.80, -0.60),
        "_twist": {"Hips": -18, "Spine1": -22, "Spine2": -26},
    },
    # ...and the strike, everything behind it.
    "flash": {
        "Spine": V(0, 0.24, 0.97), "Spine1": V(0, 0.14, 0.99), "Spine2": V(0, 0.10, 0.99),
        "Head": V(0, 0.24, 0.97),
        "RightUpLeg": V(0.08, 0.44, -0.89), "RightLeg": V(0, -0.04, -1), "RightFoot": V(0, 0.96, -0.26),
        "LeftUpLeg": V(-0.12, -0.40, -0.91), "LeftLeg": V(0, -0.18, -0.98), "LeftFoot": V(0, 0.68, -0.73),
        "RightArm": V(0.08, 0.99, -0.12), "RightForeArm": V(0.02, 1, 0.04),
        "LeftArm": V(-0.24, -0.40, -0.88), "LeftForeArm": V(-0.06, 0.24, -0.97),
        "_twist": {"Hips": 30, "Spine1": 24, "Spine2": 20},
    },
    "charge_a": {
        "Spine": V(0, 0.26, 0.96), "Spine1": V(0, 0.16, 0.99), "Head": V(0, -0.16, 0.99),
        "LeftUpLeg": V(-0.24, 0.30, -0.92), "LeftLeg": V(0, -0.36, -0.93),
        "RightUpLeg": V(0.24, 0.30, -0.92), "RightLeg": V(0, -0.36, -0.93),
        "LeftArm": V(-0.40, -0.24, -0.88), "LeftForeArm": V(-0.16, 0.40, -0.90),
        "RightArm": V(0.40, -0.24, -0.88), "RightForeArm": V(0.16, 0.40, -0.90),
    },
    "charge_b": {
        "Spine": V(0, 0.32, 0.95), "Spine1": V(0, 0.20, 0.98), "Head": V(0, -0.20, 0.98),
        "LeftUpLeg": V(-0.26, 0.36, -0.90), "LeftLeg": V(0, -0.44, -0.90),
        "RightUpLeg": V(0.26, 0.36, -0.90), "RightLeg": V(0, -0.44, -0.90),
        "LeftArm": V(-0.44, -0.30, -0.85), "LeftForeArm": V(-0.20, 0.30, -0.93),
        "RightArm": V(0.44, -0.30, -0.85), "RightForeArm": V(0.20, 0.30, -0.93),
    },
}

# ------------------------------------------------- per-character identity
#
# The vocabulary above is every fighter's baseline. What sells a CHARACTER is
# the handful of poses only they would strike — Megumi's domain hand sign,
# Uro's hand-on-hip disdain, Geto's arms-wide Uzumaki. Those live here, keyed
# by roster key, layered over the shared set:
#
#   CHARACTER_POSES[char]       adds/overrides named poses for that fighter;
#   CHARACTER_STATE_KEYS[char]  re-keys whole states — (duration, beat, K) ->
#                               the same [(time, pose_name)] list state_keys
#                               builds, so an override rewrites a state's
#                               choreography without forking the builder.
#
# A character absent here gets the shared set unchanged, which is the point:
# identity is opt-in per pose, never a copy of the whole vocabulary.
#
# NOTE `ult` doubles as the DOMAIN EXPANSION hold (src/domains.js sets
# animKey = "ult" for the cutscene) and it is a short LOOP — so a domain
# override must be a held signature pose with a subtle pulse, not a wind-up
# that would visibly restart four times a second.

CHARACTER_POSES = {
    "megumi": {
        # Chimera Shadow Garden — the interlaced hand sign, held at the
        # sternum: elbows lifted out, both forearms crossing inward so the
        # hands meet at centre chest, chin dropped to the hands. Symmetric,
        # planted, inward — the opposite of every strike in the shared set.
        "domain_sign": {
            "Spine": V(0, 0.10, 0.99), "Spine1": V(0, 0.06, 1), "Spine2": V(0, 0.03, 1),
            "Head": V(0, 0.26, 0.96),
            "LeftUpLeg": V(-0.15, 0.04, -0.99), "RightUpLeg": V(0.15, 0.04, -0.99),
            "LeftLeg": V(0, -0.08, -1), "RightLeg": V(0, -0.08, -1),
            "RightArm": V(0.38, 0.34, -0.86), "RightForeArm": V(-0.72, 0.48, 0.32),
            "LeftArm": V(-0.38, 0.34, -0.86), "LeftForeArm": V(0.72, 0.48, 0.32),
            "RightHand": V(-0.62, 0.60, 0.24), "LeftHand": V(0.62, 0.60, 0.24),
        },
        # ...and the pulse: the sign pressed a little tighter, head a shade
        # lower. The loop breathes between the two instead of restarting.
        "domain_sign_b": {
            "Spine": V(0, 0.13, 0.99), "Spine1": V(0, 0.08, 1), "Spine2": V(0, 0.04, 1),
            "Head": V(0, 0.30, 0.95),
            "LeftUpLeg": V(-0.15, 0.05, -0.99), "RightUpLeg": V(0.15, 0.05, -0.99),
            "LeftLeg": V(0, -0.09, -1), "RightLeg": V(0, -0.09, -1),
            "RightArm": V(0.34, 0.36, -0.87), "RightForeArm": V(-0.74, 0.46, 0.30),
            "LeftArm": V(-0.34, 0.36, -0.87), "LeftForeArm": V(0.74, 0.46, 0.30),
            "RightHand": V(-0.64, 0.58, 0.22), "LeftHand": V(0.64, 0.58, 0.22),
        },
    },
    "hanami": {
        # A tree that walks: heavier idle — shoulders hunched forward, the
        # long arms hanging wide of the trunk, feet rooted apart.
        "idle_a": {
            "Spine": V(0, 0.20, 0.98), "Spine1": V(0, 0.14, 0.99), "Spine2": V(0, 0.08, 1),
            "Head": V(0, 0.18, 0.98),
            "LeftArm": V(-0.32, 0.06, -0.95), "RightArm": V(0.32, 0.06, -0.95),
            "LeftForeArm": V(-0.24, 0.12, -0.96), "RightForeArm": V(0.24, 0.12, -0.96),
            "LeftUpLeg": V(-0.14, 0, -0.99), "RightUpLeg": V(0.14, 0, -0.99),
        },
        "idle_b": {
            "Spine": V(0, 0.24, 0.97), "Spine1": V(0, 0.16, 0.99), "Spine2": V(0, 0.10, 0.99),
            "Head": V(0, 0.22, 0.97),
            "LeftArm": V(-0.34, 0.08, -0.94), "RightArm": V(0.34, 0.08, -0.94),
            "LeftForeArm": V(-0.26, 0.14, -0.96), "RightForeArm": V(0.26, 0.14, -0.96),
            "LeftUpLeg": V(-0.14, 0, -0.99), "RightUpLeg": V(0.14, 0, -0.99),
        },
    },
    "uro": {
        # Disdain as a stance: weight dropped onto the right hip, right hand
        # resting ON that hip (elbow flared), chin up, head tilted — she is
        # not squaring up to anyone she rates this low.
        "idle_a": {
            "Spine": V(0.07, 0.03, 1), "Spine1": V(0.05, 0.02, 1), "Spine2": V(0.03, 0.01, 1),
            "Head": V(0.12, -0.08, 0.99),
            "RightArm": V(0.56, 0.10, -0.82), "RightForeArm": V(-0.60, 0.28, -0.75),
            "RightHand": V(-0.70, 0.30, -0.65),
            "LeftArm": V(-0.20, 0.02, -0.98), "LeftForeArm": V(-0.12, 0.14, -0.98),
            "RightUpLeg": V(0.08, 0.02, -1), "LeftUpLeg": V(-0.20, 0.08, -0.98),
            "LeftLeg": V(0, -0.12, -0.99),
            "_twist": {"Hips": 10, "Spine1": 6},
        },
        "idle_b": {
            "Spine": V(0.08, 0.05, 1), "Spine1": V(0.06, 0.03, 1), "Spine2": V(0.04, 0.02, 1),
            "Head": V(0.14, -0.06, 0.99),
            "RightArm": V(0.57, 0.11, -0.81), "RightForeArm": V(-0.59, 0.29, -0.75),
            "RightHand": V(-0.70, 0.31, -0.64),
            "LeftArm": V(-0.21, 0.03, -0.98), "LeftForeArm": V(-0.13, 0.16, -0.98),
            "RightUpLeg": V(0.08, 0.02, -1), "LeftUpLeg": V(-0.20, 0.08, -0.98),
            "LeftLeg": V(0, -0.13, -0.99),
            "_twist": {"Hips": 10, "Spine1": 6},
        },
        # Thin Ice Breaker held: one open palm pushed at the sky, the other
        # still on her hip — the sky is HER weapon and one hand is enough.
        "uro_sky": {
            "Spine": V(0, -0.06, 1), "Spine1": V(0, -0.04, 1),
            "Head": V(0.06, -0.20, 0.98),
            "RightArm": V(0.34, 0.30, 0.89), "RightForeArm": V(0.10, 0.36, 0.93),
            "RightHand": V(0.02, 0.55, 0.83),
            "LeftArm": V(-0.54, 0.10, -0.83), "LeftForeArm": V(0.58, 0.28, -0.76),
            "LeftHand": V(0.68, 0.30, -0.66),
            "RightUpLeg": V(0.10, 0.04, -0.99), "LeftUpLeg": V(-0.18, 0.06, -0.98),
            "_twist": {"Hips": -8, "Spine1": -6},
        },
        "uro_sky_b": {
            "Spine": V(0, -0.08, 1), "Spine1": V(0, -0.05, 1),
            "Head": V(0.07, -0.22, 0.97),
            "RightArm": V(0.32, 0.32, 0.89), "RightForeArm": V(0.08, 0.38, 0.92),
            "RightHand": V(0.00, 0.57, 0.82),
            "LeftArm": V(-0.55, 0.11, -0.83), "LeftForeArm": V(0.59, 0.29, -0.75),
            "LeftHand": V(0.68, 0.31, -0.66),
            "RightUpLeg": V(0.10, 0.04, -0.99), "LeftUpLeg": V(-0.18, 0.06, -0.98),
            "_twist": {"Hips": -8, "Spine1": -6},
        },
        # The win is a dismissal, not a celebration: a flicked wave past her
        # own shoulder, face already turned away from the loser.
        "win": {
            "Spine": V(-0.05, -0.04, 1), "Head": V(-0.16, -0.10, 0.98),
            "RightArm": V(0.62, 0.16, 0.77), "RightForeArm": V(0.44, 0.10, 0.89),
            "RightHand": V(0.50, -0.10, 0.86),
            "LeftArm": V(-0.54, 0.10, -0.83), "LeftForeArm": V(0.58, 0.28, -0.76),
            "LeftUpLeg": V(-0.08, 0.02, -1), "RightUpLeg": V(0.16, 0.06, -0.99),
            "_twist": {"Hips": -12, "Spine1": -8},
        },
    },
    "geto": {
        # Maximum: Uzumaki — arms thrown wide and low-palmed, chest open,
        # head back: the curse dump is above him and he is presenting it.
        "uzumaki_a": {
            "Spine": V(0, -0.12, 0.99), "Spine1": V(0, -0.08, 1), "Spine2": V(0, -0.05, 1),
            "Head": V(0, -0.30, 0.95),
            "RightArm": V(0.90, 0.14, 0.42), "RightForeArm": V(0.94, 0.18, 0.30),
            "LeftArm": V(-0.90, 0.14, 0.42), "LeftForeArm": V(-0.94, 0.18, 0.30),
            "LeftUpLeg": V(-0.16, 0.02, -0.99), "RightUpLeg": V(0.16, 0.02, -0.99),
        },
        "uzumaki_b": {
            "Spine": V(0, -0.14, 0.99), "Spine1": V(0, -0.09, 1), "Spine2": V(0, -0.06, 1),
            "Head": V(0, -0.33, 0.94),
            "RightArm": V(0.91, 0.15, 0.39), "RightForeArm": V(0.95, 0.19, 0.27),
            "LeftArm": V(-0.91, 0.15, 0.39), "LeftForeArm": V(-0.95, 0.19, 0.27),
            "LeftUpLeg": V(-0.16, 0.02, -0.99), "RightUpLeg": V(0.16, 0.02, -0.99),
        },
        # He does not scramble; even the idle is composed — upright, heels
        # nearly together under the robes, hands low and still.
        "idle_a": {
            "Spine": V(0, 0.02, 1), "Spine1": V(0, 0.01, 1), "Spine2": V(0, 0, 1),
            "Head": V(0, -0.06, 1),
            "LeftArm": V(-0.14, 0.04, -0.99), "RightArm": V(0.14, 0.04, -0.99),
            "LeftForeArm": V(-0.08, 0.12, -0.99), "RightForeArm": V(0.08, 0.12, -0.99),
            "LeftUpLeg": V(-0.05, 0, -1), "RightUpLeg": V(0.05, 0, -1),
        },
        "idle_b": {
            "Spine": V(0, 0.04, 1), "Spine1": V(0, 0.02, 1), "Spine2": V(0, 0.01, 1),
            "Head": V(0, -0.04, 1),
            "LeftArm": V(-0.15, 0.05, -0.99), "RightArm": V(0.15, 0.05, -0.99),
            "LeftForeArm": V(-0.09, 0.14, -0.99), "RightForeArm": V(0.09, 0.14, -0.99),
            "LeftUpLeg": V(-0.05, 0, -1), "RightUpLeg": V(0.05, 0, -1),
        },
    },
}

CHARACTER_STATE_KEYS = {
    "megumi": {
        # The domain hold: the sign, breathed. Loops seamlessly because the
        # first pose repeats at the end.
        "ult": lambda d, beat, K: K((0, "domain_sign"), (d / 2, "domain_sign_b"), (d, "domain_sign")),
    },
    "uro": {
        "ult": lambda d, beat, K: K((0, "uro_sky"), (d / 2, "uro_sky_b"), (d, "uro_sky")),
    },
    "geto": {
        "ult": lambda d, beat, K: K((0, "uzumaki_a"), (d / 2, "uzumaki_b"), (d, "uzumaki_a")),
    },
}

# The fighter currently being authored — set by main() from --char, read by
# state_keys() and build_action() for the identity lookups above.
CHAR = None

# Hip drop per state, as a fraction of rig height. Applied as a LOCATION delta
# on the hip bone — relative, so it means the same thing on any rig. (The B0
# default set wrote absolute mannequin-space positions here, which is precisely
# why its crouch exploded on a delivered rig.)
HIP_DROP = {
    "crouch": 0.22, "crouchAttack": 0.22, "charge": 0.07,
    "dodge_roll": 0.24, "dodge_air": 0.12, "prone": 0.44,
    "specialSide": 0.16, "land": 0.05,
}

# time (fraction of duration unless a beat is named) -> pose
def state_keys(name, spec):
    d = spec["duration"]
    beat = spec["beat"]
    K = lambda *pairs: list(pairs)
    override = CHARACTER_STATE_KEYS.get(CHAR, {}).get(name)
    if override:
        return override(d, beat, K)
    if name == "idle":   return K((0, "idle_a"), (d / 2, "idle_b"), (d, "idle_a"))
    if name == "run":    return K((0, "run_reach"), (d / 4, "run_pass"), (d / 2, "run_reach2"), (3 * d / 4, "run_pass"), (d, "run_reach"))
    if name == "dash":   return K((0, "dash"), (d, "dash"))
    if name == "jump":   return K((0, "jump"), (d, "jump"))
    if name == "fall":   return K((0, "fall"), (d, "fall"))
    if name == "land":   return K((0, "land"), (d, "land"))
    if name == "hurt":   return K((0, "hurt"), (d, "hurt"))
    if name == "crouch": return K((0, "crouch_a"), (d, "crouch_a"))
    if name == "shield": return K((0, "shield"), (d, "shield"))
    if name == "ledge":  return K((0, "ledge"), (d, "ledge"))
    if name == "dodge_roll": return K((0, "tuck"), (d, "tuck"))
    if name == "dodge_air":  return K((0, "air_twist"), (d, "air_twist"))
    if name == "dizzy":  return K((0, "dizzy_a"), (d / 2, "dizzy_b"), (d, "dizzy_a"))
    if name == "prone":  return K((0, "prone"), (d, "prone"))
    if name == "win":    return K((0, "win"), (d, "win"))
    # STRIKES get four beats, not two. The first pass keyed only a wind-up and
    # the contact, then held the contact to the end of the clip — so every
    # attack froze on its own impact frame with no follow-through, which reads
    # as a pose being switched on rather than a blow being thrown. Now:
    # anticipation -> contact (on the state's declared beat, always) -> a short
    # hold so the hit is legible -> back to guard.
    def strike(wind, hit, hold=0.4):
        return K((0, wind), (beat, hit), (beat + (d - beat) * hold, hit), (d, "guard"))

    if name == "light":         return strike("jab_wind", "jab", 0.42)
    if name == "sideHeavy":     return strike("hook_wind", "hook", 0.40)
    if name == "upHeavy":       return strike("upper_wind", "uppercut", 0.35)
    if name == "downHeavy":     return strike("chop_wind", "chop", 0.35)
    if name == "specialNeutral": return strike("jab_wind", "divergent", 0.50)
    if name == "airLight":      return K((0, "jump"), (beat, "kick_air"), (d, "kick_air"))
    if name == "crouchAttack":  return K((0, "crouch_a"), (beat, "low_jab"),
                                         (beat + (d - beat) * 0.5, "low_jab"), (d, "crouch_a"))
    if name == "specialSide":    return K((0, "crouch_a"), (beat, "manji"),
                                          (beat + (d - beat) * 0.55, "manji"), (d, "guard"))
    if name == "charge":        return K((0, "charge_a"), (d / 2, "charge_b"), (d, "charge_a"))
    if name == "specialDown":    return K((0, "guard"), (beat, "grit"), (d, "grit"))
    if name == "ult":            return K((0, "flash_wind"), (d / 2, "flash"), (d, "flash_wind"))
    return K((0, "idle_a"), (d, "idle_a"))


# ------------------------------------------------------------- the solver

# The character's own frame, derived from the rig rather than assumed. A pose
# vector is written as (right, forward, up) in the fighter's terms; this turns
# it into world space. Deriving it means the vocabulary survives a rig that
# arrives facing any direction — including one that has just been turned 180°
# by the face-fix, which is exactly the case that first got authored backwards.
BASIS = {"right": Vector((1, 0, 0)), "fwd": Vector((0, 1, 0)), "up": Vector((0, 0, 1))}


def rig_forward(arm_obj):
    """The fighter's facing, from the HIPS bone's rest orientation.

    Toes were the first heuristic — toes point where the fighter faces — and
    it held right up to the first non-human delivery: Hanami's tree-root feet
    curl diagonally BACKWARD, so her whole pose set authored 140 degrees off
    and she fought showing the camera her back. The auto-rigger, though, is
    one program with one convention: on every delivery measured (five for
    five, human and not), the SPINE bone's local +X axis is the body's
    forward in world space. Bone orientation comes from the rigger, not the
    mesh, so it cannot be fooled by what the feet look like. (Not the hips:
    the conform pass rebuilds that bone with a normalized identity-ish rest,
    erasing the signal. Spine comes through untouched.)"""
    spine = arm_obj.data.bones.get("Spine") or arm_obj.data.bones.get("mixamorig:Spine")
    if spine:
        m = (arm_obj.matrix_world @ spine.matrix_local).to_3x3()
        fwd = Vector((m[0][0], m[1][0], m[2][0]))  # +X column, world
        fwd.z = 0
        if fwd.length > 1e-4:
            return fwd.normalized()
    # No spine (never seen) — fall back to the toe heuristic.
    for name in ("LeftToeBase", "RightToeBase", "LeftFoot", "RightFoot"):
        b = arm_obj.data.bones.get(name)
        if not b:
            continue
        d = (arm_obj.matrix_world @ b.tail_local) - (arm_obj.matrix_world @ b.head_local)
        d.z = 0
        if d.length > 1e-4:
            return d.normalized()
    return Vector((0, 1, 0))


def derive_basis(arm_obj):
    up = Vector((0, 0, 1))
    fwd = rig_forward(arm_obj)
    BASIS["fwd"] = fwd
    BASIS["up"] = up
    BASIS["right"] = fwd.cross(up).normalized()
    return BASIS


def to_world(v):
    """(right, forward, up) in the character's frame -> world direction."""
    return (BASIS["right"] * v.x + BASIS["fwd"] * v.y + BASIS["up"] * v.z).normalized()


def bone_world_dir(arm_obj, pbone):
    """Current head->tail direction of a pose bone, in world space."""
    mw = arm_obj.matrix_world
    return ((mw @ pbone.tail) - (mw @ pbone.head)).normalized()


def aim_bone(arm_obj, pbone, want_world):
    """Rotate `pbone` so it points along `want_world`, whatever its rest
    orientation. The delta is computed in world space and converted into the
    bone's own local frame, so it composes with the parent chain already
    posed above it (parents are always solved first)."""
    cur = bone_world_dir(arm_obj, pbone)
    if cur.length < 1e-8 or want_world.length < 1e-8:
        return
    want = want_world.normalized()
    dot = max(-1.0, min(1.0, cur.dot(want)))
    if dot > 0.999999:
        return
    axis = cur.cross(want)
    if axis.length < 1e-8:
        # Exactly opposed: any perpendicular axis turns it around.
        axis = cur.orthogonal()
    delta = Quaternion(axis.normalized(), math.acos(dot))

    # world delta -> local. The pose bone's world rotation is the armature's
    # rotation times its own chain; solving in the parent's frame keeps the
    # result independent of everything above it.
    mw = arm_obj.matrix_world.to_quaternion()
    parent_w = mw @ (pbone.parent.matrix.to_quaternion() if pbone.parent else Quaternion())
    rest = pbone.bone.matrix_local.to_quaternion()
    if pbone.parent:
        rest = pbone.parent.bone.matrix_local.to_quaternion().inverted() @ rest
    target_w = delta @ (mw @ pbone.matrix.to_quaternion())
    local = parent_w.inverted() @ target_w
    pbone.rotation_mode = "QUATERNION"
    pbone.rotation_quaternion = rest.inverted() @ local
    # Push the change through so children solve against a posed parent.
    bpy.context.view_layer.update()


def twist_bone(arm_obj, pbone, rad):
    """Rotate `pbone` about the character's UP axis, on top of wherever it is
    aimed.

    Aiming a bone can say which way it POINTS but never how it is ROLLED about
    its own length — and a punch is mostly roll: the hips open, the chest turns
    over, the shoulder is carried forward by the torso rather than reaching on
    its own. Without this the strikes were arms moving in front of a statue,
    which is precisely what they looked like."""
    if not rad:
        return
    delta = Quaternion(BASIS["up"], rad)
    mw = arm_obj.matrix_world.to_quaternion()
    parent_w = mw @ (pbone.parent.matrix.to_quaternion() if pbone.parent else Quaternion())
    rest = pbone.bone.matrix_local.to_quaternion()
    if pbone.parent:
        rest = pbone.parent.bone.matrix_local.to_quaternion().inverted() @ rest
    target_w = delta @ (mw @ pbone.matrix.to_quaternion())
    pbone.rotation_mode = "QUATERNION"
    pbone.rotation_quaternion = rest.inverted() @ (parent_w.inverted() @ target_w)
    bpy.context.view_layer.update()


# Parents before children, so a chain solves top-down. Hips leads: it is never
# aimed (its direction is not a pose) but it IS twisted, and everything below
# has to solve against a turned pelvis.
ORDER = [
    "Hips",
    "Spine", "Spine1", "Spine2", "Neck", "Head",
    "LeftShoulder", "LeftArm", "LeftForeArm", "LeftHand",
    "RightShoulder", "RightArm", "RightForeArm", "RightHand",
    "LeftUpLeg", "LeftLeg", "LeftFoot", "LeftToeBase",
    "RightUpLeg", "RightLeg", "RightFoot", "RightToeBase",
]


def manifest_height(char):
    """The delivered height from whichever model manifest carries this
    character. Both backends record the same figure at import."""
    import json
    for rel in ("render3d/assets/manifest.json",):
        path = os.path.join(REPO, rel)
        if not os.path.exists(path):
            continue
        try:
            entry = json.load(open(path)).get("characters", {}).get(char)
        except Exception:
            continue
        if entry and entry.get("heightM"):
            return float(entry["heightM"])
    return None


def hip_bone(arm_obj):
    for name in ("Hips", "mixamorig:Hips", "Pelvis", "pelvis"):
        pb = arm_obj.pose.bones.get(name)
        if pb:
            return pb
    return None


def apply_pose(arm_obj, pose, hip_drop_m):
    for pb in arm_obj.pose.bones:
        pb.rotation_mode = "QUATERNION"
        pb.rotation_quaternion = Quaternion()
        pb.location = (0, 0, 0)
    bpy.context.view_layer.update()
    hb = hip_bone(arm_obj)
    if hb and hip_drop_m:
        # Down in the hip bone's own space, so it survives any rest orientation.
        mw = arm_obj.matrix_world.to_quaternion()
        world_down = Vector((0, 0, -hip_drop_m))
        local = (mw @ hb.bone.matrix_local.to_quaternion()).inverted() @ world_down
        hb.location = local
    twists = {} if os.environ.get("NO_TWIST") else (pose.get("_twist") or {})
    for name in ORDER:
        pb = arm_obj.pose.bones.get(name)
        if not pb:
            continue
        want = pose.get(name)
        if want:
            aim_bone(arm_obj, pb, to_world(want))
        # Twist AFTER this bone is aimed and BEFORE its children are, so the
        # chain below solves against a turned parent. Children are aimed to
        # absolute directions, so a parent twist moves the body, not the limbs
        # — which is exactly the division of labour wanted.
        if name in twists:
            twist_bone(arm_obj, pb, math.radians(twists[name]))
    bpy.context.view_layer.update()


def build_action(arm_obj, name, spec, height):
    keys = state_keys(name, spec)
    action = bpy.data.actions.new(name)
    action.use_fake_user = True
    arm_obj.animation_data.action = action
    drop = HIP_DROP.get(name, 0) * height
    hb = hip_bone(arm_obj)
    touched = set()
    for t, pose_name in keys:
        pose = CHARACTER_POSES.get(CHAR, {}).get(pose_name) or POSES[pose_name]
        touched |= {k for k in pose.keys() if not k.startswith("_")}
        apply_pose(arm_obj, pose, drop)
        frame = 1 + t * FPS
        for bone_name in ORDER:
            pb = arm_obj.pose.bones.get(bone_name)
            if pb:
                pb.keyframe_insert("rotation_quaternion", frame=frame)
        if hb:
            hb.keyframe_insert("location", frame=frame)
    return action, touched


# ---------------------------------------------------------------- main

def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    ap = argparse.ArgumentParser(prog="blender_author_clips")
    ap.add_argument("--in", dest="src", required=True)
    ap.add_argument("--out", dest="dst", required=True)
    ap.add_argument("--char", required=True)
    ap.add_argument("--face-fix", action="store_true",
                    help="turn the rig 180 degrees so it faces +Z in glTF, per the delivery spec")
    args = ap.parse_args(argv)

    global CHAR
    CHAR = args.char

    states = load_states()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=args.src)
    arm = next((o for o in bpy.context.scene.objects if o.type == "ARMATURE"), None)
    if not arm:
        sys.exit("no armature in the input")

    # RE-AUTHORING. Clear whatever clips came in with the file first.
    #
    # This is not tidiness. Authoring onto an already-authored delivery leaves
    # BOTH sets in the .glb — 52 actions for a 26-state contract — and the
    # importer suffixes duplicate names, so the game silently resolves the OLD
    # clip and every edit appears to do nothing. That cost a full round of
    # "the new poses look identical to the old ones", which is the most
    # expensive shape a bug can take: one that looks like a no-op.
    stale = list(bpy.data.actions)
    if stale:
        print(f"clearing {len(stale)} action(s) already in the file before authoring")
        if arm.animation_data:
            arm.animation_data.action = None
        for act in stale:
            act.use_fake_user = False
            bpy.data.actions.remove(act)

    # Height for the hip-drop scaling. The manifest's figure is the one the
    # game sizes against (it is what intake measured and what headHeightTarget
    # is solved from), so prefer it over measuring here: evaluating the mesh in
    # REST reported 2.73 m for a 1.73 m fighter, because this rig's bind pose
    # and rest pose are not the same and the modifier drags vertices. A hip
    # drop scaled off that would sink every crouch through the floor.
    was = arm.data.pose_position
    arm.data.pose_position = "REST"
    bpy.context.view_layer.update()
    deps = bpy.context.evaluated_depsgraph_get()
    lo = hi = None
    for o in bpy.context.scene.objects:
        if o.type != "MESH":
            continue
        ev = o.evaluated_get(deps)
        m = ev.to_mesh()
        for v in m.vertices:
            p = ev.matrix_world @ v.co
            lo = p.z if lo is None else min(lo, p.z)
            hi = p.z if hi is None else max(hi, p.z)
        ev.to_mesh_clear()
    measured = (hi - lo) if lo is not None else 1.75
    arm.data.pose_position = was
    height = manifest_height(args.char) or measured

    # Which way does the rig face NOW? Measured from the hips rest matrix
    # (rig_forward — the toe heuristic lied on tree feet), and the fix is
    # conditional on it, so --face-fix is safe to pass always: an
    # already-correct rig is left alone instead of being turned backwards.
    if args.face_fix and rig_forward(arm).y > 0:
        # The spec is +Z forward in glTF. Blender exports +Y as -Z, so a rig
        # whose toes point +Y here arrives facing backwards — which is exactly
        # how the first delivery came in, and why it rendered from behind.
        #
        # Done HERE, before a single action exists, because transform_apply
        # refuses on an animated object and reports it as a warning rather than
        # an error: applied after authoring, it silently did nothing and the
        # rig exported still facing backwards. Baking it into the data (rather
        # than leaving a rotation on the node) also matters downstream — the IK
        # builds its target in the rig root's frame, so a body rotated relative
        # to that root would reach backwards.
        bpy.ops.object.select_all(action="DESELECT")
        arm.select_set(True)
        for c in arm.children:
            c.select_set(True)
        bpy.context.view_layer.objects.active = arm
        # Through the matrix, not rotation_euler: the glTF importer leaves
        # objects in QUATERNION rotation mode, where writing rotation_euler is
        # silently ignored — which is how the first attempt "succeeded" and
        # changed nothing.
        turn = Matrix.Rotation(math.pi, 4, "Z")
        arm.matrix_world = turn @ arm.matrix_world
        for c in arm.children:
            if c.parent is arm:
                continue  # rides the parent
            c.matrix_world = turn @ c.matrix_world
        bpy.context.view_layer.update()
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
        if rig_forward(arm).y > 0:
            sys.exit("face-fix did not take: the rig still faces +Y (would export facing -Z)")

    derive_basis(arm)

    if not arm.animation_data:
        arm.animation_data_create()

    f = BASIS["fwd"]
    report = [f"authoring {args.char}: {height:.2f} m (manifest), forward=({f.x:+.2f},{f.y:+.2f},{f.z:+.2f})"]
    for name, spec in states.items():
        if name == "dodge":
            continue  # alias; never authored (states.js)
        action, touched = build_action(arm, name, spec, height)
        beat = f", beat {spec['beat']}s" if spec["beat"] else ""
        report.append(f"  {name:<15} {len(state_keys(name, spec))} keys, {spec['duration']}s{beat}, {len(touched)} bones")

    # Clear the pose so the exported rest is the rest.
    for pb in arm.pose.bones:
        pb.rotation_quaternion = Quaternion()
        pb.location = (0, 0, 0)
    arm.animation_data.action = None

    os.makedirs(os.path.dirname(os.path.abspath(args.dst)), exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    arm.select_set(True)
    for c in arm.children:
        c.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=args.dst, use_selection=True, export_format="GLB",
        export_animations=True, export_animation_mode="ACTIONS",
        export_yup=True, export_apply=False,
    )
    print("\n".join(report))
    print(f"wrote {args.dst}")


if __name__ == "__main__":
    main()
