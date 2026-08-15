// THE ANIMATION THE GAME PLAYS, BUILT FROM THE POSE LIBRARIES.
//
// This is the step everything upstream was for. `clip_schedule.js` already says
// which drawings a state shows and exactly when — the state's own fps, the
// same numbers `states.js` derives its durations from — and the libraries
// already say what each of those drawings IS as a human pose. Put them
// together and a fighter's animation is the interpolation between their own
// scheduled poses, the strategy `clip_schedule.js` opens by stating and
// which nothing until now could actually deliver.
//
// WHICH POSE A FRAME GETS, in order:
//
//   1. the per-frame MATCHED pose, if one exists for that frame name
//   2. the BASELINE pose for what the frame is, which every frame has
//
// So a fighter nobody has read still animates — from the baseline, keyed off
// the pose brief that commissioned their art — and a frame somebody HAS looked
// at gets the better answer. That is the whole point of keeping two libraries.
//
// WHY THE POSES CANNOT GO STRAIGHT INTO A CLIP. A clip track holds a bone's
// own LOCAL rotation; the libraries are written in the fighter's frame against
// a T-pose. A delivered rig is neither T-posed nor world-aligned, so the tables
// have to be applied to that rig and read back out per character — which is
// what pose_library.js does, and why this needs a loaded rig rather than being
// a pure function of the tables.
//
// The engine contract is unchanged and still enforced by clips.js: the CONTACT
// BEAT is an exact sample, a looping clip's last key equals its first, and no
// engine motion is baked in — bob, squash and travel belong to motion.js.

import { poseSchedule } from "./clip_schedule.js";
import { STATES, clipNameFor } from "./states.js";
import { buildClipFromKeys } from "./clips.js";
import { BATTLE_POSES } from "./battle_poses.js";
import { baselinePose, intentFor } from "./baseline_poses.js";
import { WALK_POSES, walkKeys } from "./walk_cycle.js";
import { RUN_POSES, runKeys } from "./run_cycle.js";
import {
  boneIndex, bindOf, applyLibraryPose, bakeLocalEulers,
} from "./pose_library.js";

/**
 * THE IDLE IS NOT BUILT FROM THE LIBRARIES, and it is the only state that is
 * not.
 *
 * Every other state is a proposal being tried out. The idle is not: it is the
 * one pose with an obvious right answer — a fighter standing next to their own
 * idle sprite either matches it or does not — and it has been dialled in,
 * per character, in the workbench's idle review, against that sprite. It is
 * also what everything else is judged against, because it is the pose a player
 * spends most of the match looking at. Replacing it with a generic orthodox
 * guard would throw away the one place the roster has already been reviewed
 * fighter by fighter, and would move the yardstick at the same time as the
 * things being measured against it.
 */
export const NOT_FROM_LIBRARY = new Set(["idle"]);

/**
 * States whose clip is a HAND-AUTHORED CYCLE rather than an interpolation of
 * that fighter's drawings.
 *
 * The sheet is the right source for a state the artists drew, and the wrong
 * one for a gait. A walk sheet is two contacts, and a body scissoring between
 * two contacts with no passing position between them floats rather than walks;
 * a run sheet is four frames that are a reach and a pass, mirrored, with
 * neither the strike nor the float between them. Both are good sprite cycles
 * and both are half a cycle for a rig, because a sprite cuts between drawings
 * and an interpolation shows every instant in between. A pose costs a drawing
 * in 2D and eight joint angles here, so the phases a sheet cannot afford are
 * free — see walk_cycle.js and run_cycle.js.
 *
 * Anything listed here ignores its sprite frames completely. That is a
 * deliberate divergence between the two renderers and should stay a short list:
 * the gaits earn it because they are cycles and a cycle needs its four phases.
 */
const AUTHORED_CYCLES = {
  walk: { poses: WALK_POSES, keys: walkKeys },
  run: { poses: RUN_POSES, keys: runKeys },
};

/** Matched first, baseline behind it. Never null: the baseline is total. */
export function poseForFrame(frame) {
  const matched = BATTLE_POSES[frame];
  if (matched) return { pose: matched, from: "matched" };
  const b = baselinePose(frame);
  return { pose: b.pose, from: `baseline:${b.intent}` };
}

/**
 * Bake every pose a character's sheet uses into that rig's own local rotations.
 *
 * Done once per character and cached by the caller: posing a rig is cheap but
 * not free, and the same forty poses are wanted by every clip that character
 * has.
 */
export function bakeCharacterPoses(THREE, root, frames, extraPoses = null) {
  const bones = boneIndex(root);
  if (!bones.size) return null;
  const bind = bindOf(bones);
  const baked = new Map();
  for (const frame of frames) {
    const { pose, from } = poseForFrame(frame);
    applyLibraryPose(THREE, root, bones, bind, pose);
    baked.set(frame, { pose: bakeLocalEulers(THREE, bones), from });
  }
  // Authored cycle poses go through the same bake: they are written in the
  // same fighter-frame convention as the libraries, so they need the same
  // trip through this rig to become its own local rotations.
  for (const [name, pose] of Object.entries(extraPoses || {})) {
    applyLibraryPose(THREE, root, bones, bind, pose);
    baked.set(name, { pose: bakeLocalEulers(THREE, bones), from: "authored" });
  }
  // Leave the rig as we found it — the caller may be about to render with it.
  for (const [bone, q] of bind) bone.quaternion.copy(q);
  root.updateMatrixWorld(true);
  return baked;
}

/**
 * The clip for one state, or null when the state has no art to schedule from.
 *
 * A one-frame state still gets a clip: it becomes a single held key, which is
 * what a state whose sprite does not move should look like.
 */
export function buildStateClip(THREE, charKey, state, baked) {
  const name = clipNameFor(state);
  const spec = STATES[name] || STATES[state];

  // An authored cycle needs no sheet and reads none: its keys are already a
  // schedule, and the poses were baked with the rest.
  const cycle = AUTHORED_CYCLES[name];
  if (cycle) {
    const duration = spec?.duration ?? 1;
    const keys = cycle.keys(duration)
      .map((k) => ({ t: k.t, ease: k.ease, frame: k.poseName, pose: baked.get(k.poseName)?.pose }))
      .filter((k) => k.pose);
    if (!keys.length) return null;
    return buildClipFromKeys(THREE, name, keys, {
      duration, beat: spec?.beat, loop: !!spec?.loop,
    });
  }

  const schedule = poseSchedule(charKey, state);
  if (!schedule.length) return null;
  const keys = [];
  for (const entry of schedule) {
    const hit = baked.get(entry.frame);
    if (!hit) continue;
    keys.push({ t: entry.t, ease: entry.ease, frame: entry.frame, pose: hit.pose });
  }
  if (!keys.length) return null;
  const duration = spec?.duration ?? keys[keys.length - 1].t;
  // A looping clip has to come back to where it started, or the cycle jumps on
  // the wrap. The sprite loop does it by showing frame 0 again; the clip does
  // it by repeating the first key at the end.
  if (spec?.loop && keys.length > 1 && keys[keys.length - 1].t < duration) {
    keys.push({ ...keys[0], t: duration, ease: keys[0].ease });
  }
  // FOLLOW-THROUGH. A one-shot attack's duration now runs past its last
  // drawing (states.js), and what fills the tail is a settle back toward the
  // first key — the wind-up, which is that fighter's own coiled guard, so an
  // air attack settles to an air pose and a naginata swing to a naginata
  // ready. Without this the clip clamped on the extended strike and the
  // fighter held a frozen full extension through their whole recovery.
  if (!spec?.loop && spec?.beat !== undefined
      && keys[keys.length - 1].t < duration - 1e-3) {
    keys.push({ ...keys[0], t: duration, ease: "out" });
  }
  return buildClipFromKeys(THREE, name, keys, {
    duration, beat: spec?.beat, loop: !!spec?.loop,
  });
}

/**
 * Every clip a character can play, built from their sheet and the libraries.
 *
 * Returns a Map keyed the way `loader.js` keys clips — by CLIP name, not by
 * state — so a state that borrows another's animation finds it, and a report
 * of where each frame's pose came from, which is what makes the coverage
 * legible rather than a claim.
 */
export function buildCharacterClips(THREE, charKey, root, states) {
  const frames = new Set();
  const wanted = [];
  const extraPoses = {};
  for (const state of states) {
    const cycle = AUTHORED_CYCLES[clipNameFor(state)];
    if (cycle) {
      Object.assign(extraPoses, cycle.poses);
      wanted.push(state);
      continue;
    }
    const schedule = poseSchedule(charKey, state);
    if (!schedule.length) continue;
    for (const e of schedule) frames.add(e.frame);
    wanted.push(state);
  }
  if (!frames.size && !Object.keys(extraPoses).length) {
    return { clips: new Map(), sources: new Map() };
  }
  const baked = bakeCharacterPoses(THREE, root, frames, extraPoses);
  if (!baked) return { clips: new Map(), sources: new Map() };

  const clips = new Map();
  for (const state of wanted) {
    if (NOT_FROM_LIBRARY.has(clipNameFor(state))) continue;
    const clip = buildStateClip(THREE, charKey, state, baked);
    if (clip) clips.set(clipNameFor(state), clip);
  }
  const sources = new Map([...baked].map(([f, v]) => [f, v.from]));
  return { clips, sources };
}

/** What the libraries cover for a character, for a report rather than a claim. */
export function coverageFor(charKey, states) {
  const seen = new Map();
  for (const state of states) {
    for (const e of poseSchedule(charKey, state)) {
      if (!seen.has(e.frame)) {
        seen.set(e.frame, { from: poseForFrame(e.frame).from, intent: intentFor(e.frame) });
      }
    }
  }
  return seen;
}
