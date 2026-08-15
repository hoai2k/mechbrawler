// WHICH POSES A STATE PASSES THROUGH, and when — the schedule a clip is built
// from.
//
// This replaces `sprite_poses.js`, and the change of input is the whole story.
//
// THE OLD SHAPE. A fighter's animation was defined as the interpolation between
// their own sprite drawings: a state's sheet named its frames and an fps, and
// this module turned that into `[{ frame, t, ease }]` for pose_clips.js to pose
// the rig through. It was a genuinely good idea for a game made of drawings —
// it made "animate this fighter" bounded ("match these 36 poses") and it kept
// the model from having a second opinion about how its own character stands.
//
// WHY IT CANNOT SURVIVE THE MECHS. There are no drawings. A mech arrives as a
// rigged GLB and a table of keyframes, and there is no sheet to read a schedule
// out of. Keeping the old module pointed at an empty manifest would not degrade
// gracefully; it would return `[]` for every state and every mech would stand
// in its bind pose.
//
// THE NEW SHAPE. A mech DECLARES its schedule, in the same authoring vocabulary
// robotworld's `src/mechs/animations.js` already uses: named poses at times, in
// seconds, within the state's duration. That is the content contract — a mech's
// animation is data it ships with, not something inferred from other art it
// happens to have.
//
//   POSE_SHEETS[charKey][state] = { fps, frames: ["windup", "strike", ...] }
//
// `fps` and a flat frame list, rather than explicit times, because the timing
// contract in states.js is already expressed that way: a state's `duration` is
// derived from an fps, so frame `i` belongs at `i / fps` and the two tables
// agree by construction. A mech that wants irregular spacing gives explicit
// `t` values instead (see `normalise` below); both forms are accepted.
//
// WHAT IS NOT HERE. The poses themselves. This module schedules names; what a
// name MEANS as a body is `battle_poses.js` / `baseline_poses.js`, and how the
// rig gets there is `pose_clips.js`. Keeping the three separate is what lets a
// mech reuse a shared pose vocabulary while scheduling it its own way — a
// heavyweight and a skirmisher can both name `strike` and hold it for very
// different lengths of time.

import { STATES, CLIP_STATES } from "./states.js";
import { POSE_SHEETS } from "./pose_sheets.js";

/**
 * When each of a state's poses is reached, in clip seconds.
 *
 * Returns [] for a state the mech does not schedule — the caller keeps
 * whatever the delivered GLB clip does, which is the right answer for a mech
 * that shipped real animation for that state and needs no synthesis.
 */
export function poseSchedule(charKey, state) {
  // The state's OWN schedule — never resolved through clipNameFor. A state
  // that borrows another's clip still has its own poses (a dash attack may
  // play the light strike's animation while passing through its own frames),
  // and asking for the clip's name would hand back the wrong schedule.
  const spec = STATES[state];
  const sheet = POSE_SHEETS[charKey]?.[state];
  const frames = sheet?.frames?.filter(Boolean) || [];
  if (!frames.length) return [];

  const times = normalise(sheet, frames, spec);
  if (!times) return [];

  // The CONTACT pose of an attack: the last one scheduled at or before the
  // beat. The segments either side of it travel differently — see `ease`.
  let contactT = null;
  if (spec?.beat !== undefined) {
    contactT = times[0];
    for (const t of times) if (t <= spec.beat + 1e-4) contactT = t;
  }

  return frames.map((frame, i) => ({
    frame,
    i,
    t: times[i],
    fps: sheet.fps,
    // How the pose travels OUT of this key. A drawing cuts; a model has to
    // travel, and how it travels is the one animation decision a pose list
    // cannot make — so it is a per-pose setting with a sane default.
    //
    // Attacks are two different motions either side of the contact. INTO the
    // contact is the strike: it accelerates out of the coil ("in" — slow
    // leaving the wind-up, explosive arriving), which is what gives a punch
    // anticipation. OUT of the contact is follow-through: fast off the hit,
    // settling ("out"). Everything that is not an attack just eases.
    ease: contactT === null ? "ease" : (times[i] < contactT ? "in" : "out"),
  }));
}

/**
 * Frame times in clip seconds, from either accepted form.
 *
 * Everything is clamped into the clip's duration: a schedule that outruns its
 * state would otherwise place keys past the end, where nothing samples them
 * and the pose simply never appears.
 */
function normalise(sheet, frames, spec) {
  if (Array.isArray(sheet.t)) {
    if (sheet.t.length !== frames.length) return null;
    const dur = spec?.duration ?? Math.max(...sheet.t);
    return sheet.t.map((t) => Math.min(+Number(t).toFixed(4), dur));
  }
  if (!sheet.fps) return null;
  const dur = spec?.duration ?? frames.length / sheet.fps;
  return frames.map((_, i) => Math.min(+(i / sheet.fps).toFixed(4), dur));
}

/**
 * Every pose this mech can be drawn in, once each, in state order.
 *
 * A pose shared by several states appears ONCE, under the first state that
 * reaches it, with the rest listed beside it. Posing it twice is posing it
 * twice; there is one pose, so there is one entry.
 */
export function poseCatalogue(charKey) {
  const seen = new Map();
  for (const state of CLIP_STATES) {
    for (const entry of poseSchedule(charKey, state)) {
      const held = seen.get(entry.frame);
      if (held) { held.alsoIn.push(state); continue; }
      seen.set(entry.frame, { ...entry, state, alsoIn: [] });
    }
  }
  return [...seen.values()];
}

/** Where `frame` sits for this mech — its state, its time, its siblings.
 *  Null when nothing schedules it. */
export function poseEntry(charKey, frame) {
  return poseCatalogue(charKey).find((p) => p.frame === frame) || null;
}
