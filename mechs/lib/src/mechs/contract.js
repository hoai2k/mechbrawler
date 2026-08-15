// THE CONTRACT (MECH_ART_GUIDE §5) as executable data.
//
// Combat and the animator drive per-mech "extra" joints/anchors behind
// `if (J.x)` guards, so a rebuilt design that forgets one doesn't crash —
// the mech just silently loses firepower or personality (vulcan's gatlings
// stop spinning, wraith's railgun fires from the hand, ...). This module
// turns the guide's prose table into a check that runs on every mech build
// and warns loudly instead of staying silent.
//
// Two routes, two strictness levels:
//   • procedural (designs/<id>.js ran): everything listed is required.
//   • GLB (design() never runs, so design-created extras can't exist):
//     only universal anchors plus each mech's `glbAnchors` (reinstated via
//     the manifest `muzzles` block) are required; the rest is reported as
//     a KNOWN loss so the gap is visible, not a violation. glbanim.js
//     documents which losses are accepted vs compensated.
//
// When you add an engine-driven joint/anchor to a design, add it here in
// the same commit — this table is the single place that knows what combat
// depends on.

// Anchors every mech must expose on BOTH routes. factory.js and gltf.js
// both auto-create fallbacks for these, so a violation here means someone
// broke the factories, not a design.
const UNIVERSAL_ANCHORS = ['muzzleR', 'muzzleL', 'core'];

// Per-mech extras. Fields (all optional):
//   joints     — engine-driven joints the design must create (procedural)
//   anchors    — named anchors the design must place (procedural)
//   glbAnchors — subset of `anchors` the GLB manifest reinstates (via
//                `muzzles` extras), therefore required on GLB builds too
//   glbBones   — subset of `joints` a custom rig reinstates as BONES of the
//                same name (rigs/<id>.rig.js), animated by the mech's glbanim
//                profile; counted as present on GLB builds while they exist
//   materials  — named material slots the engine animates (both routes;
//                GLB route must reinstate them via GLB_DRESS)
export const CONTRACT = {
  titanus: {},
  vulcan: {
    joints: ['gatlingL', 'gatlingR'],   // animator spins while firing
    anchors: ['podL', 'podR'],          // missile special ripple-fires both
    glbAnchors: ['podL', 'podR'],       // manifest muzzles: podL/podR
  },
  viper: {
    joints: ['bladeL', 'bladeR'],       // animator flares on attack
    anchors: ['bladeL', 'bladeR'],
    // the custom rig carries each dagger as a REAL bone off its forearm, and
    // the manifest hangs a blade-tip anchor on it. Both are load-bearing: the
    // bone is what Fighter.regrowWeapon collapses when that dagger is thrown,
    // the anchor is what draws the blade trail.
    glbBones: ['bladeL', 'bladeR'],
    glbAnchors: ['bladeL', 'bladeR'],
  },
  rhino: {
    anchors: ['horn'],                  // reserved (guide: preserve anyway)
  },
  tempest: {
    anchors: ['coilL', 'coilR'],        // static-field lightning FX origin
  },
  fenrir: {
    joints: ['tail0', 'tail1', 'tail2'], // animator wags the chain
    glbBones: ['tail0', 'tail1', 'tail2'], // GLB: same names in rigs/fenrir.rig.js,
                                        // wagged by the glbanim fenrir profile
    anchors: ['clawL', 'clawR'],
  },
  colossus: {
    joints: ['mortars'],                // animator pitches when firing
  },
  wraith: {
    joints: ['rifle'],                  // the railgun, carried in the gun hand
    glbBones: ['rifle'],                // GLB: same name in rigs/wraith.rig.js —
                                        // the gun is a rigid body on handL there,
                                        // and its muzzle/scope anchors ride it
    // eye: DEATH SWARM flare origin. The GLB reinstates both through its
    // manifest `muzzles` extras (pinned to the `eye` / `scope` rig bones) —
    // not listed under glbAnchors so the legacy `alt` build, which has
    // neither, still reports them as known losses rather than violations.
    anchors: ['scope', 'eye'],
  },
  inferno: {},                          // dual flamethrowers: universal muzzles suffice
  glacier: {},
  cranky: {
    joints: ['jawL', 'jawR'],           // pincer gape/snap
  },
  saurion: {
    joints: ['tail0', 'tail1', 'tail2'], // raptor tail S-wave
  },
  frogger: {
    // second arm pair (cannon arms) — animator counter-swings them
    joints: ['shoulderL2', 'shoulderR2', 'elbowL2', 'elbowR2'],
  },
  jerry: {
    joints: [
      'antL', 'antR',                   // nervous antenna snaps
      'armS0L', 'armS1L', 'armS2L',     // claw-arm nest ripple
      'armS0R', 'armS1R', 'armS2R',
      'legDL', 'legDR',                 // rear strut-leg creep
    ],
  },
  nullbot: {
    materials: ['glow2'],               // corruption-shard strobe (GLB: via GLB_DRESS)
  },
  konga: {
    // jaw/brow are the FACE layer (mechs/face.js); pods are the launchers the
    // ranged attack and the ult both fire from, and the animator aims.
    joints: ['jaw', 'browL', 'browR', 'podL', 'podR'],
    // the GLB reinstates all five as real bones of the same name
    // (rigs/konga.rig.js), so SIGNATURES.konga drives them on both routes
    glbBones: ['jaw', 'browL', 'browR', 'podL', 'podR'],
    anchors: ['podL', 'podR', 'fistL', 'fistR'],
    glbAnchors: ['podL', 'podR'],       // manifest `muzzles` reinstates these
  },
  tritone: {
    // frill flares on the brace; the tail chain rides the gait's tail layer;
    // the cannons traverse and recoil.
    joints: ['jaw', 'browL', 'browR', 'frill', 'tail0', 'tail1', 'tail2', 'cannonL', 'cannonR'],
    // all nine exist as bones of the same name in rigs/tritone.rig.js
    glbBones: ['jaw', 'browL', 'browR', 'frill', 'tail0', 'tail1', 'tail2', 'cannonL', 'cannonR'],
    anchors: ['hornL', 'hornR', 'hornNose', 'frillPods'],
    glbAnchors: ['frillPods'],          // manifest `muzzles` reinstates this
  },
};

/**
 * Check a built mech (output of buildMech / buildGlbMech) against the
 * contract. Returns { violations, glbLosses } — violations are real breaks
 * that need fixing; glbLosses are design extras a GLB body is known not to
 * have (design() never runs on that route) and are informational.
 */
export function validateMech(mech) {
  const c = CONTRACT[mech.def.id] || {};
  const violations = [];
  const glbLosses = [];
  for (const a of UNIVERSAL_ANCHORS) {
    if (!mech.anchors[a]) violations.push(`anchor '${a}' missing (universal)`);
  }
  for (const j of c.joints || []) {
    if (mech.joints[j]) continue;
    // A GLB can REINSTATE a design joint as a custom-rig bone of the same
    // name, animated by its glbanim profile's post hook instead of by the
    // retarget (fenrir's tail wag). That's compensated, not lost — but only
    // while the bone is actually in the rig, so it still reports if someone
    // deletes it.
    if (mech.isGLB && c.glbBones?.includes(j) && mech.rigBones?.[j]) continue;
    (mech.isGLB ? glbLosses : violations).push(`joint '${j}' missing`);
  }
  const glbRequired = new Set(c.glbAnchors || []);
  for (const a of c.anchors || []) {
    if (mech.anchors[a]) continue;
    (mech.isGLB && !glbRequired.has(a) ? glbLosses : violations).push(`anchor '${a}' missing`);
  }
  for (const m of c.materials || []) {
    if (!mech.materials?.[m]) violations.push(`material slot '${m}' missing`);
  }
  return { violations, glbLosses };
}

// One warn per (mech, route) per session — mechs are rebuilt every round
// and the message would otherwise spam the console.
const _warned = new Set();

/**
 * validateMech + console.warn, deduped. Called from the build factories so
 * every mode (battle, showcase, soak) surfaces contract breaks for free.
 * Known GLB losses are logged once at debug level, violations at warn.
 */
export function warnContract(mech) {
  const key = mech.def.id + (mech.isGLB ? ':glb' : ':proc');
  if (_warned.has(key)) return;
  _warned.add(key);
  const { violations, glbLosses } = validateMech(mech);
  if (violations.length) {
    console.warn(`[contract] ${mech.def.id}${mech.isGLB ? ' (GLB)' : ''}: ` + violations.join('; ')
      + ' — see MECH_ART_GUIDE §5 / src/mechs/contract.js');
  }
  if (glbLosses.length) {
    console.debug(`[contract] ${mech.def.id} (GLB) known losses: ` + glbLosses.join('; '));
  }
}
