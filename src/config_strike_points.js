// HUMAN-VERIFIED STRIKE POINTS — where each move actually lands, as checked
// by a person against that fighter's own drawing.
//
// Written by the verification bench: `/workbench/?edit=verification`, task
// set "strike-points". The bench exports a JSON payload; paste its
// `STRIKE_POINTS` block in here and commit it. This file is the ONE place a
// human decision about a strike point lives, which is why it is hand-editable
// where src/config_model_reach.js (a measurement) is generated.
//
// Anything absent falls back to the model measurement, then to a derived
// point — see src/strike_points.js for the order and the coordinate frame
// (x forward from the centre line, y in canvas convention so up is negative).
//
// An entry here OVERRIDES the model for good: it is a person saying the
// measurement was wrong, and re-baking the models must not silently undo
// that. If a rebuilt model makes an override obsolete, delete the entry.

export const STRIKE_POINTS = {
  // "gojo": { light: { x: 35, y: -95 }, sideHeavy: { x: 42, y: -98 } },
};

/** Who checked what, and when — so the audit can report coverage and a
 *  reviewer can see which decisions predate a model rebuild. Keyed the same
 *  way; `at` is an ISO date, `by` free text. */
export const STRIKE_POINT_META = {
  // "gojo": { light: { at: "2026-08-15", by: "hoai2k", note: "fist, not glove tip" } },
};
