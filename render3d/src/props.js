// Props, weapons and physics chains — the parts of a fighter that are not the
// body: Nobara's hammer, Maki's polearm, Mahoraga's wheel, Mei Mei's braid.
//
// THE CONTRACT (mirrored in docs/asset-requests.md): props and chains are part
// of the RIG. A delivered .glb carries its own weapon geometry hung on named
// bones — that has not changed, and nothing downstream needs it to.
//
// What HAS changed is who puts it there. A weapon drawn in a fighter's hand is
// a weapon an image-to-3D generator will fuse INTO the fighter: Momo's broom
// came back as her leg, Maki's polearm and Gakuganji's guitar as part of an
// arm. So a generated fighter is now drawn and generated empty-handed, their
// weapon is generated alone, and tools/blender_attach_prop.py joins the two
// onto the prop bone before intake — arithmetic where it used to be inference.
// The .glb that lands is the same shape of file it always was.
//
// What this module adds is
//
//   * the NAMING those bones must use, so clips and tools can find them:
//       Prop_Main        the weapon hand's prop (sword, hammer, broom…)
//       Prop_Off         an off-hand or second prop
//       Prop_Float       a prop that rides near the body but in nobody's hand
//                        (Mahoraga's wheel, above the head)
//       Chain_<name>_<i> physics chain segments, i = 0 at the root
//        (e.g. Chain_braid_0 … Chain_braid_3 hanging from Head)
//
//   * per-character EXPECTATIONS — which props/chains each fighter's rig must
//     carry, from the roster table in docs/asset-requests.md. The intake tool
//     validates a delivery against this, and the workbench lists it.
//
//   * PLACEHOLDER geometry so the mannequin carries the same props: a fighter
//     whose real weapon changes their silhouette must be proven against a
//     stand-in of that weapon, not against empty hands — clip timing around a
//     two-handed spear is nothing like a punch.
//
// PHYSICS. Chains are secondary motion — braids, tendrils — and they are
// DETERMINISTIC in B0: a time-driven pendulum sway, not an integrated
// simulation. That is a caching decision, not laziness: the pose cache is
// keyed by (state, time, aim), and an integrator carries hidden state that
// would make identical keys draw different pixels. The sway reads as motion
// at game size; if a fighter ever needs true simulation, their rig sets
// `simulate: true` on the chain and pays for it with per-frame renders
// (renderer.js skips the cache for such rigs).

const DEG = Math.PI / 180;

// ------------------------------------------------- per-character expectations
//
// From the roster table (docs/asset-requests.md). A character absent here has
// bare hands and no chains. `kind` picks the placeholder shape for the
// mannequin; a delivered rig brings its own geometry on the same bone.

// `lengthM` and `grip` are what a SEPARATELY generated weapon needs to be
// joined to the body (tools/blender_attach_prop.py): how long the thing really
// is, and where along it the hand sits — as a fraction measured FROM THE HEAVY
// END, because which end is heavy is measurable and which end is the top is
// not. They are also the brief a modeller draws the weapon plate from.
export const CHARACTER_PROPS = {
  yuta:      [{ bone: "Prop_Main", kind: "sword", hand: "RightHand",
                lengthM: 0.95, grip: 0.82 }],
  nanami:    [{ bone: "Prop_Main", kind: "sword", hand: "RightHand",
                lengthM: 0.80, grip: 0.85 }],
  toji:      [{ bone: "Prop_Main", kind: "spear2h", hand: "RightHand",
                lengthM: 1.90, grip: 0.55 }],
  reggie:    [{ bone: "Prop_Main", kind: "umbrella", hand: "RightHand",
                lengthM: 0.95, grip: 0.85 }],
  nobara:    [{ bone: "Prop_Main", kind: "hammer", hand: "RightHand",
                lengthM: 0.35, grip: 0.80 },
              { bone: "Prop_Off", kind: "nail", hand: "LeftHand",
                lengthM: 0.12, grip: 0.60 }],
  // `rescue: "offBone"` — see blender_conform.py rescue_offbone_prop. Her axe
  // hangs at hip height, so the default strategy (find the thing taller than
  // the fighter) cannot see it; what does see it is that the generator bound
  // it to her thigh and hands, leaving it further from those bones than skin
  // ever is. OPT-IN because loose clothing looks identical to that test.
  meimei:    [{ bone: "Prop_Main", kind: "axe", hand: "RightHand",
                rescue: "offBone", lengthM: 1.30, grip: 0.80 }],
  maki:      [{ bone: "Prop_Main", kind: "spear2h", hand: "RightHand",
                lengthM: 1.80, grip: 0.45 }],
  momo:      [{ bone: "Prop_Main", kind: "broom", hand: "RightHand",
                lengthM: 1.40, grip: 0.70 }],
  // `gripAt` re-grips a DELIVERED weapon at runtime — see the note under
  // CARRY_DROP_DEG. He arrived holding the guitar by the headstock, which is
  // the one place on a guitar nobody holds it.
  gakuganji: [{ bone: "Prop_Main", kind: "guitar", hand: "LeftHand",
                lengthM: 1.00, grip: 0.75, gripAt: 0.42 }],
  mahoraga:  [{ bone: "Prop_Float", kind: "wheel", hand: null,
                lengthM: 0.90, grip: 0.50 }],
};

// `fromSkin: true` means the chain is not a hook for a rigger to hang art on
// — the art is ALREADY there, welded to the `from` bone by the generator's
// binder, and the conform pass carves it back out onto these bones
// (blender_conform.py extract_skin_chain). That is the difference between
// hair that is part of the skull and hair that can move: Uro's mane arrived
// as 7500 vertices of Head, so it could only ever do exactly what her head
// did. Declared here because it is a fact about the FIGHTER, like a weapon.
export const CHARACTER_CHAINS = {
  // The braid is the whole point of her silhouette, so it is extracted from
  // the head's skin like Uro's mane — four segments, because a plaited rope
  // that long reads wrong as three: it needs a curve, not a bend.
  // Sway eased off the placeholder's 14: a thin rope shows every degree where
  // a mane absorbs it. Note what this layer CANNOT do — the braids swing out
  // wide on a body-twisting heavy, and they do it in lockstep with the twist
  // rather than trailing it, because the sway is a function of the pose clock
  // and not of the fighter's motion (the caching trade this file opens with).
  // Inertia needs `simulate: true` and per-frame renders.
  // SIMULATED. The pendulum could not do what her braids are for: it is a
  // function of the pose clock, so the braids swung out on a body-twisting
  // heavy in lockstep with the twist instead of trailing it. `simulate: true`
  // hands them to the integrator (simulateChains below) — they lag a turn,
  // overshoot, and settle. It costs her the pose cache; see that function.
  meimei: [{ name: "braid", from: "Head", segments: 4, length: 0.55,
             fromSkin: true, simulate: true,
             stiffness: 0.14, damping: 0.76, gravity: 5.5 }],
  dagon:  [{ name: "tendrilL", from: "Head", segments: 3, length: 0.3, sway: 10 },
           { name: "tendrilR", from: "Head", segments: 3, length: 0.3, sway: 10 }],
  // A mane that reads as its own mass — big, slow and trailing, so it lags
  // the head rather than shadowing it.
  uro:    [{ name: "hair", from: "Head", segments: 3, length: 0.6, sway: 16,
             fromSkin: true }],
};

// ------------------------------------------------------- two-handed weapons
//
// A polearm is not swung one-handed, and nothing in the clip vocabulary knows
// that: the poses drive the striking arm, and the engine's aim/reach solve
// re-targets it, which moves the weapon — so an authored "left hand on the
// shaft" pose would detach the moment a strike aimed anywhere. The off hand
// has to be SOLVED onto the shaft after everything else has moved it
// (applyTwoHandGrip in ik.js), which makes two-handedness a property of the
// PROP, declared here, not a property of any clip.
//
// `spacing` is how far down-shaft the off hand grips from the main hand,
// metres — a naginata grip is roughly two forearms apart.

export const TWO_HANDED_KINDS = {
  spear2h: { spacing: 0.5 },
  // A guitar is two-handed for a different reason than a polearm, and the
  // same solve covers both. Gakuganji's prop hangs off his LEFT hand — the
  // fretting hand, up the neck — so the body and bridge lie DOWN-shaft from
  // it, which is exactly where the strumming hand belongs. Wider spacing
  // than a naginata grip: fretting hand to strumming hand is most of the
  // instrument.
  guitar: { spacing: 0.45 },
};

// ------------------------------------------------------- carrying it about
//
// A WEAPON HAS A FRONT, AND RUNNING WITH IT BACKWARDS READS AS A BUG.
//
// The prop hangs rigidly off its hand bone, so wherever the clip puts that
// hand, the weapon follows at whatever angle the delivery happened to weld it.
// That is right for a strike — the pose IS the presentation — and wrong for
// every state where the fighter is just carrying the thing: Maki sprinted with
// her naginata's blade pointing back over her shoulder and the butt leading,
// Gakuganji's guitar led with its body swung up in front of him, and Momo's
// broom ran brush-first like a lance.
//
// The rule that fixes all three at once is the one a person carrying something
// heavy actually follows: WHILE MOVING, THE HEAVY END TRAILS, AND IT TRAILS
// LOW. A polearm's butt drops behind the hip and the blade leads; a guitar's
// body swings behind; a broom's head drags. `lengthM`/`grip` above already say
// which end is heavy, and fitPropShaft (ik.js) measures which way that is in
// the bone's own frame, so the layer has everything it needs without a second
// table of per-weapon angles.
//
// Only the travelling states (ik.js CARRY_STATES). An attack keeps its
// authored presentation — Momo's broom leading brush-first IS the attack.

// WHERE THE HAND SITS ON THE SHAFT is `grip` above — but `grip` is a BUILD
// parameter: blender_attach_prop.py reads it when it joins the weapon to the
// bone, so it describes a .glb that has already been delivered and changing it
// re-grips nothing that is on disk. `gripAt` is the runtime counterpart: the
// fraction the hand SHOULD be at, and the layer slides the delivered weapon
// along its own measured axis by the difference. Gakuganji came back holding
// his guitar by the headstock — a real grip is at the base of the neck, a
// third of a metre down — and re-gripping it here is a line of data against
// re-exporting the model.

/** Degrees below horizontal the trailing end is carried at. Shallow: past
 *  about forty the weapon drags on the floor on the shorter fighters. */
export const CARRY_DROP_DEG = 28;

/** Per-character overrides. `carry: false` opts a prop out entirely (a prop
 *  that is not held — Mahoraga's floating wheel — has no carry to correct). */
export const CARRY_OVERRIDES = {
  // The wheel rides beside him rather than in a hand; there is no "heavy end
  // trailing" to speak of and aiming it would just make it wobble.
  mahoraga: { carry: false },
};

/** The two-handed prop a fighter carries, or null. `{ bone, spacing }`. */
export function twoHandGrip(charKey) {
  for (const p of CHARACTER_PROPS[charKey] || []) {
    const th = TWO_HANDED_KINDS[p.kind];
    if (th) return { bone: p.bone, spacing: th.spacing, hand: p.hand };
  }
  return null;
}

// ------------------------------------------------------- body morphs
//
// Mahito's Idle Transfiguration: his own body is the weapon, and its SHAPE
// changes per attack — a club arm on the heavies, a drawn-out blade arm on
// the special. No clip can author that (clips carry rotations, not shape),
// and no delivery can bake it (one rig, one bind). So it is an engine layer:
// per-state BONE SCALES, declared here, applied after the clip poses the rig
// (applyMorphs in ik.js). A scaled bone scales everything it carries — skin
// and children — which is exactly what a swelling limb wants; and because
// the scale is a pure function of (state, time) it joins the pose cache
// without poisoning it.
//
// Gameplay parity holds: hurtboxes and reach stay sprite-derived on every
// backend, so the club arm LOOKS enormous and hits exactly like the sprite.
//
// Schema: CHARACTER_MORPHS[char][clipName] = [{ bone, scale }] where scale
// is a scalar (uniform swell) or [x, y, z] in the bone's local frame
// (y runs down the bone on these rigs — the stretch axis for a blade).

export const CHARACTER_MORPHS = {
  mahito: {
    // The heavies land with a club arm: the whole striking arm swollen from
    // the shoulder, hand included.
    sideHeavy:  [{ bone: "RightArm", scale: 1.55 }],
    upHeavy:    [{ bone: "RightArm", scale: 1.55 }],
    downHeavy:  [{ bone: "RightArm", scale: 1.6 }],
    // The special draws the forearm out into a blade: long and thin past the
    // elbow, the hand flattened into the tip.
    specialNeutral: [
      { bone: "RightForeArm", scale: [0.7, 1.9, 0.7] },
      { bone: "RightHand", scale: [0.8, 1.3, 0.5] },
    ],
    // The charge gathers mass in BOTH arms — visibly mid-transfiguration.
    charge: [
      { bone: "RightArm", scale: 1.3 },
      { bone: "LeftArm", scale: 1.3 },
    ],
  },
};

/** Every bone this fighter's morphs ever touch — the reset set. */
export function morphBones(charKey) {
  const states = CHARACTER_MORPHS[charKey];
  if (!states) return null;
  const bones = new Set();
  for (const list of Object.values(states)) for (const m of list) bones.add(m.bone);
  return bones;
}

// ------------------------------------------------------- placeholder shapes
//
// Crude on purpose, like the mannequin itself: enough silhouette to author
// and judge clips against, unmistakably not delivered art. Sizes in metres.
// Each builder returns a Group whose origin is the GRIP (or mount) point.

const SHAPES = {
  sword(THREE, mat) {
    const g = new THREE.Group();
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.75, 0.06), mat);
    blade.position.y = 0.45;
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.03, 0.05), mat);
    guard.position.y = 0.08;
    g.add(blade, guard);
    return g;
  },
  spear2h(THREE, mat) {
    const g = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.035, 1.9, 0.035), mat);
    shaft.position.y = 0.45;
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.25, 6), mat);
    head.position.y = 1.5;
    g.add(shaft, head);
    return g;
  },
  hammer(THREE, mat) {
    const g = new THREE.Group();
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.7, 0.04), mat);
    handle.position.y = 0.28;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.14, 0.14), mat);
    head.position.y = 0.62;
    g.add(handle, head);
    return g;
  },
  nail(THREE, mat) {
    const nail = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.22, 6), mat);
    nail.rotation.x = 90 * DEG;
    return nail;
  },
  axe(THREE, mat) {
    const g = new THREE.Group();
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.1, 0.04), mat);
    handle.position.y = 0.4;
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.3, 0.24), mat);
    blade.position.set(0, 0.85, 0.12);
    g.add(handle, blade);
    return g;
  },
  broom(THREE, mat) {
    const g = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.03, 1.4, 0.03), mat);
    shaft.position.y = 0.35;
    const brush = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.3, 8), mat);
    brush.position.y = -0.25;
    brush.rotation.x = Math.PI;
    g.add(shaft, brush);
    return g;
  },
  guitar(THREE, mat) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.42, 0.09), mat);
    const neck = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.6, 0.04), mat);
    neck.position.y = 0.45;
    g.add(body, neck);
    return g;
  },
  umbrella(THREE, mat) {
    const g = new THREE.Group();
    const rod = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.95, 0.025), mat);
    rod.position.y = 0.35;
    const canopy = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.18, 8), mat);
    canopy.position.y = 0.75;
    g.add(rod, canopy);
    return g;
  },
  wheel(THREE, mat) {
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.025, 6, 18), mat);
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.29, 0.02, 0.02), mat);
    const spoke2 = spoke.clone();
    spoke2.rotation.z = Math.PI / 2;
    const g = new THREE.Group();
    g.add(wheel, spoke, spoke2);
    return g;
  },
};

// ------------------------------------------------------------------ attach

/** Hang a character's expected props and chains on a rig that lacks them —
 *  the mannequin path. Delivered rigs that already carry a named prop bone
 *  keep their own; only the missing ones get placeholders, so a rig delivered
 *  with a real sword is never handed a grey one too. */
export function attachPlaceholders(THREE, root, charKey, height, material) {
  const findBone = (name) => root.getObjectByName(name);

  for (const prop of CHARACTER_PROPS[charKey] || []) {
    if (findBone(prop.bone)) continue;
    const bone = new THREE.Bone();
    bone.name = prop.bone;
    const shape = SHAPES[prop.kind]?.(THREE, material);
    if (shape) bone.add(shape);
    if (prop.bone === "Prop_Float") {
      // Floating props ride above the head — Mahoraga's wheel.
      const head = findBone("Head") || root;
      bone.position.set(0, 0.35, 0);
      head.add(bone);
    } else {
      const hand = findBone(prop.hand) || root;
      // Grip: rest the prop across the palm, blade up.
      bone.rotation.z = prop.hand === "LeftHand" ? 65 * DEG : -65 * DEG;
      hand.add(bone);
    }
  }

  for (const chain of CHARACTER_CHAINS[charKey] || []) {
    if (findBone(`Chain_${chain.name}_0`)) continue;
    const from = findBone(chain.from) || root;
    let parent = from;
    const segLen = chain.length / chain.segments;
    for (let i = 0; i < chain.segments; i++) {
      const bone = new THREE.Bone();
      bone.name = `Chain_${chain.name}_${i}`;
      bone.position.set(0, i === 0 ? -0.02 : -segLen, i === 0 ? -0.06 : 0);
      const seg = new THREE.Mesh(new THREE.BoxGeometry(0.045, segLen * 0.9, 0.045), material);
      seg.position.y = -segLen / 2;
      bone.add(seg);
      parent.add(bone);
      parent = bone;
    }
  }
}

/** Chains a rig carries, by inspection — delivered or placeholder alike. */
export function chainsOf(root) {
  const chains = new Map();
  root.traverse((o) => {
    const m = /^Chain_(.+)_(\d+)$/.exec(o.name || "");
    if (m) chains.set(m[1], Math.max(chains.get(m[1]) || 0, Number(m[2]) + 1));
  });
  return chains;
}

/** Prop bones a rig carries, by inspection. */
export function propsOf(root) {
  const props = [];
  root.traverse((o) => {
    if (/^Prop_/.test(o.name || "")) props.push(o.name);
  });
  return props;
}

/** Deterministic secondary motion: pendulum sway on every chain, driven by
 *  the pose clock so the cache stays honest (same key -> same pixels). Runs
 *  after the mixer poses the body; the chain hangs off whatever the head or
 *  hips are doing, which is what sells it as attached.
 *
 *  Chains declaring `simulate: true` are skipped here — simulateChains owns
 *  them, and running both would fight over the same rotations. */
export function swayChains(root, time, charKey) {
  const spec = CHARACTER_CHAINS[charKey];
  root.traverse((o) => {
    const m = /^Chain_(.+)_(\d+)$/.exec(o.name || "");
    if (!m) return;
    const conf = spec?.find((c) => c.name === m[1]);
    if (conf?.simulate) return;
    const amp = (conf?.sway ?? 10) * DEG;
    const i = Number(m[2]);
    // Later segments lag and swing wider — a whip, not a rod.
    o.rotation.x = Math.sin(time * 2.1 + i * 0.9) * amp * (0.4 + i * 0.35);
    o.rotation.z = Math.cos(time * 1.7 + i * 0.7) * amp * 0.3 * (0.4 + i * 0.35);
  });
}

// ------------------------------------------------------ simulated chains
//
// The escape hatch this file's header promises, taken. The pendulum above is
// a function of the pose clock, which buys a sound pose cache and costs the
// one thing secondary motion is FOR: it cannot lag. Mei Mei's braids swing
// out on a body-twisting heavy in perfect lockstep with the twist, because
// nothing in that formula knows the twist happened — the braid is not
// reacting to her, it is running its own loop next to her.
//
// A chain with `simulate: true` gets a real integrator instead: particles
// with velocity, pulled toward where the skeleton says they should be and
// dragged behind by their own inertia. Turn quickly and the braid arrives
// late; stop and it settles. That is the whole difference.
//
// WHAT IT COSTS, stated plainly, because the header is right that this is a
// caching decision: an integrator carries state, so identical pose keys no
// longer draw identical pixels, so a simulated rig CANNOT use the pose cache
// and re-renders every frame (renderer.js / scene.js check `simulates`).
// That is affordable for one or two fighters and would not be for a roster.
//
// The state lives per ROOT object — which is per rig on the flat path and
// per instance in a 3D scene, so two Mei Meis on screen swing independently.

const chainState = new WeakMap();

/** Does this fighter carry any simulated chain? The renderers ask before
 *  taking the cache path. */
export function simulates(charKey) {
  return (CHARACTER_CHAINS[charKey] || []).some((c) => c.simulate);
}

/**
 * Advance every simulated chain on `root` by `dt` seconds.
 *
 * Verlet particles, one per chain joint, in WORLD space:
 *   * particle 0 is kinematic — it is wherever the skeleton put the chain's
 *     first joint, so the braid stays attached to the skull, always;
 *   * the rest carry velocity, get pulled toward the pose the bones would
 *     hold if they were rigid (`stiffness`), fall under gravity, lose energy
 *     to `damping`, and are finally snapped back to their true bone lengths
 *     so the braid can never stretch;
 *   * each bone is then aimed from its own joint at the next particle.
 *
 * `dt` is clamped: a tab restored after a minute must not integrate a minute
 * of gravity in one step and fling the hair off the model.
 */
export function simulateChains(THREE, root, dt, charKey) {
  const spec = (CHARACTER_CHAINS[charKey] || []).filter((c) => c.simulate);
  if (!spec.length) return false;
  const step = Math.min(Math.max(dt, 1 / 240), 1 / 20);

  let state = chainState.get(root);
  if (!state) chainState.set(root, (state = new Map()));

  for (const conf of spec) {
    const bones = [];
    for (let i = 0; i < conf.segments; i++) {
      const b = root.getObjectByName(`Chain_${conf.name}_${i}`);
      if (!b) break;
      bones.push(b);
    }
    if (!bones.length) continue;

    // Rest pose first: clear the chain's own rotations so the world matrices
    // below describe where the skeleton ALONE would put it. That is the
    // target the springs pull toward, and reading it off a chain still
    // holding last frame's simulated bend would make the whole thing
    // self-referential — it would drift wherever it was already going.
    for (const b of bones) b.quaternion.identity();
    bones[0].parent?.updateWorldMatrix(true, false);
    for (const b of bones) b.updateWorldMatrix(false, false);

    const rest = [];
    for (const b of bones) rest.push(new THREE.Vector3().setFromMatrixPosition(b.matrixWorld));
    // The tip: the last bone's end, one segment on from its own joint.
    const last = bones[bones.length - 1];
    const tipLocal = new THREE.Vector3(0, conf.length / conf.segments, 0);
    rest.push(tipLocal.applyMatrix4(last.matrixWorld));

    let sim = state.get(conf.name);
    if (!sim || sim.p.length !== rest.length) {
      // First frame — start settled, at rest, with no velocity. Starting at
      // the origin instead would fling the braid across the stage on frame
      // one and it would be visibly wrong until it damped out.
      sim = {
        p: rest.map((v) => v.clone()),
        prev: rest.map((v) => v.clone()),
        len: rest.slice(1).map((v, i) => v.distanceTo(rest[i])),
      };
      state.set(conf.name, sim);
    }

    const stiffness = conf.stiffness ?? 0.16;
    const damping = conf.damping ?? 0.72;
    const gravity = conf.gravity ?? 5.0;

    sim.p[0].copy(rest[0]);
    sim.prev[0].copy(rest[0]);
    const v = new THREE.Vector3();
    for (let i = 1; i < sim.p.length; i++) {
      const p = sim.p[i];
      v.subVectors(p, sim.prev[i]).multiplyScalar(damping);
      sim.prev[i].copy(p);
      p.add(v);                                        // inertia
      p.z -= gravity * step * step;                    // hang
      p.lerp(rest[i], stiffness);                      // and follow the skull
    }
    // Length constraints, root outward: the joint above is already correct,
    // so one pass down the chain is enough to keep every segment honest.
    for (let i = 1; i < sim.p.length; i++) {
      const d = v.subVectors(sim.p[i], sim.p[i - 1]);
      const L = d.length();
      if (L > 1e-6) sim.p[i].copy(sim.p[i - 1]).addScaledVector(d, sim.len[i - 1] / L);
    }

    // Particles back to bone rotations: aim each bone from its own joint at
    // the next particle, converting through the parent so it composes with
    // whatever the body is doing.
    const origin = new THREE.Vector3();
    const curDir = new THREE.Vector3();
    const wantDir = new THREE.Vector3();
    const delta = new THREE.Quaternion();
    const world = new THREE.Quaternion();
    const parentWorld = new THREE.Quaternion();
    for (let i = 0; i < bones.length; i++) {
      const b = bones[i];
      b.updateWorldMatrix(false, false);
      origin.setFromMatrixPosition(b.matrixWorld);
      wantDir.subVectors(sim.p[i + 1], origin);
      if (wantDir.lengthSq() < 1e-10) continue;
      wantDir.normalize();
      // Where the bone points now, in world space. Blender exports these
      // chain bones along their own +Y, so that axis carried into world
      // space is the current direction.
      b.getWorldQuaternion(world);
      curDir.set(0, 1, 0).applyQuaternion(world).normalize();
      delta.setFromUnitVectors(curDir, wantDir);
      // local = parentWorld⁻¹ · (delta · boneWorld) — the same conversion
      // ik.js aimBoneAt uses, so it composes with a moving body.
      b.parent.getWorldQuaternion(parentWorld);
      b.quaternion.copy(parentWorld.invert().multiply(delta).multiply(world));
      b.updateWorldMatrix(false, false);
    }
  }
  return true;
}
