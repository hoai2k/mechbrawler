// ---------------------------------------------------------------------------
// Ultimate transformations — a fighter becoming something else for a while,
// rather than summoning it as a separate entity.
//
// A transformation swaps the fighter's whole sprite set for another actor's
// (SPRITE_ACTORS in characters.js) for the duration of an install, and applies
// that actor's stat modifiers. The fighter keeps their own kit and controls;
// only the body changes.
//
// Each entry is gated on `enabled` AND on its art actually being present, so a
// transform whose sprites have not been delivered silently keeps the old
// behaviour instead of drawing nothing. Flip `enabled` once the poses are in
// assets/sprites/<actor>/ and registered in manifest.json — see
// transformReady() in ultimates.js for the check.
// ---------------------------------------------------------------------------

import { RUN_CYCLE_FRAMES } from "./characters.js";

// Every pose a transformed fighter can be asked to draw. A set missing any of
// these would pop holes mid-fight, so the readiness check demands all of them.
export const TRANSFORM_POSES = [
  "idle_a", "idle_b", "run_a", "run_b", "dash", "jump_rise", "fall", "land",
  // (run_a/run_b may instead be satisfied by the four-frame run cycle — see
  // TRANSFORM_POSE_ALTERNATIVES below.)
  "hurt", "crouch_a", "crouch_b", "crouch_attack_a", "crouch_attack_b",
  "guard", "ledge_hang", "dodge_roll", "dodge_air",
  "attack_light_a", "attack_light_b", "attack_heavy", "attack_up", "attack_down",
  "attack_air", "charge", "special_neutral", "special_side", "special_down",
  "ult_a", "ult_b", "dizzy", "victory",
];

// The four-frame run cycle (round 12) supersedes the `run_a`/`run_b` pair. A
// set redrawn after that round delivers the cycle and not the pair, and must
// not fail the readiness check for lacking art it was told not to draw — so a
// pose listed here counts as present when every frame of its alternative is.
// The wind-up/strike pairs supersede the single `attack_heavy` / `attack_air`
// the same way, and for the same reason: a set redrawn after round 11 delivers
// the pair and never the single, so expecting the single would report a
// complete set as incomplete — and, in the workbench, list a pose nobody should
// go and draw. Mahoraga is the first set in that position.
export const TRANSFORM_POSE_ALTERNATIVES = {
  run_a: RUN_CYCLE_FRAMES,
  run_b: RUN_CYCLE_FRAMES,
  attack_heavy: ["attack_heavy_a", "attack_heavy_b"],
  attack_air: ["attack_air_a", "attack_air_b"],
};

export const TRANSFORMS = {
  // Megumi's ultimate. Canon-wise the Ten Shadows user does not become
  // Mahoraga — but as a fighting-game ultimate, wearing the shikigami reads
  // far better than watching one walk around beside you, and it puts the
  // player in control of the payoff instead of spectating it.
  mahoraga: {
    // Whose ultimate this is. The loader reads it to fetch the actor's art
    // alongside that fighter's, because a transform into a sprite set nobody
    // downloaded draws nothing and the fighter disappears for the duration.
    fighter: "megumi",
    // OFF. Megumi no longer becomes Mahoraga — the shikigami is SUMMONED and
    // driven by its own AI as a character in its own right (the `brawler`
    // behavior in summons.js, configured on Megumi's ultimate in
    // characters.js). Wearing him took Megumi off the board and turned the
    // ultimate into a costume change; summoning him puts two fighters on
    // Megumi's side, which is what the Ten Shadows technique actually is.
    //
    // The entry stays as the worked example of the transform machinery, which
    // is still live (transformReady in ultimates.js) and is what the next
    // fighter with a second body will use. Megumi's ultimate no longer reads
    // it; the actor's art is fetched through the kit's `p.actor` instead
    // (actorsFor in characters.js).
    enabled: false,
    actor: "mahoraga",
    label: "MAHORAGA",
    color: "#e8ecf8",
    // Modifiers applied for the duration, on top of the ultimate's own params.
    install: {
      dmgMul: 1.35,
      speedMul: 0.88,
      dmgTakenMul: 0.7,
      armor: true,
    },
  },
};

/** Actors a fighter can turn into, so their art can be loaded with the
 *  fighter's own. Only transforms that are switched ON count: a disabled one
 *  never runs, and fetching its set would be a download for nothing. */
export function transformActorsFor(fighterKey) {
  return Object.values(TRANSFORMS)
    .filter((t) => t.enabled && t.fighter === fighterKey)
    .map((t) => t.actor);
}
