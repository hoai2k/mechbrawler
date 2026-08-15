// FROGGER — the gunk gladiator, matched to docs/canonical/mech_frogger.png:
// lime-green frog mech whose head merges into a wide torso, two HUGE glass
// bug-eye domes on top (lime iris, dark slit pupil, mechanical ring mounts),
// a wide grin mouth-seam over a translucent dripping slime visor, FOUR slime
// guns (big X-pose shoulder cannons + nozzle-gun lower arms with slime-tube
// forearms), black joint frame between lime plates, hazard chevrons, crouched
// springy legs and HUGE webbed 3-toed feet with translucent toe tips.
// Everything oozes.
import * as THREE from 'three';
import { beveledPlate, shieldOutline, sphere, cone, cyl } from '../parts.js';
import { decalTexture } from '../../core/pbrtex.js';
import { baseFrame, standardArm, addAnchor } from '../factory.js';
import { addJoint } from './common.js';

export function frogger(A, D, J, anchors, def) {
  const s = D.scale;
  const W = D.torsoW;
  const chH = D.torsoH;
  const Y = new THREE.Vector3(0, 1, 0);

  const plateMat = (decal) => {
    const tex = decalTexture({ seed: def.seed + 3, ...def.skin.primary }, decal);
    return new THREE.MeshStandardMaterial({
      map: tex.map, normalMap: tex.normalMap,
      roughnessMap: tex.rmMap, metalnessMap: tex.rmMap,
      roughness: 1, metalness: 1,
    });
  };
  // translucent lime smart-slime
  const slime = new THREE.MeshPhysicalMaterial({
    color: 0xa8e438, transmission: 0.5, transparent: true, opacity: 0.85,
    roughness: 0.12, metalness: 0.0, thickness: 0.4,
    emissive: 0x8cd024, emissiveIntensity: 0.5,
  });
  const eyeGlass = new THREE.MeshPhysicalMaterial({
    color: 0x9ecf50, transmission: 0.6, transparent: true, opacity: 0.42,
    roughness: 0.05, metalness: 0.0, thickness: 0.3,
  });
  // hanging slime drip: blob + long tapering runnel + falling bead
  const drip = (joint, x, y, z, sc = 1, len = 1) => {
    A.custom(joint, slime, sphere(0.1 * s * sc, 8), { p: [x, y, z] });
    A.custom(joint, slime, cone(0.055 * s * sc, 0.36 * s * sc * len, 6), {
      p: [x, y - 0.2 * s * sc * len, z], r: [Math.PI, 0, 0] });
    A.custom(joint, slime, sphere(0.034 * s * sc, 6), { p: [x, y - 0.46 * s * sc * len, z] });
  };
  // hazard chevrons: little 45-degree brass/dark ticks in a row along local X
  const chevrons = (joint, n, x, y, z, rot = [0, 0, 0], gap = 0.11) => {
    for (let i = 0; i < n; i++) {
      A.sharpBox(joint, i % 2 ? 'dark' : 'brass', [0.055 * s, 0.13 * s, 0.03 * s], {
        p: [x + (i - (n - 1) / 2) * gap * s, y, z],
        r: [rot[0], rot[1], rot[2] + Math.PI / 4] });
    }
  };

  // ================= FRAME + FROG BODY-HEAD =================
  baseFrame(A, D);
  // the head IS the torso: one huge rounded frog dome, widest at mouth level
  A.lathe('torso', 'primary', [
    [chH * 0.0, W * 0.40], [chH * 0.22, W * 0.55], [chH * 0.5, W * 0.61],
    [chH * 0.78, W * 0.57], [chH * 1.0, W * 0.43], [chH * 1.16, W * 0.19],
    [chH * 1.22, 0.05 * s],
  ], { seg: 24, scaleZ: 0.85 });
  // black frame waist band so the lime doesn't read as one blob
  A.tube('torso', 'dark', W * 0.42, W * 0.44, 0.14 * s, { p: [0, chH * 0.04, 0], seg: 20 });
  A.tube('hips', 'dark', W * 0.3, W * 0.34, 0.12 * s, { p: [0, 0.28 * s, 0], seg: 16 });

  // ================= FACE: grin seam + slime visor =================
  // wide frog grin: dark seam segments tracing the dome, corners curling up
  for (let i = -3; i <= 3; i++) {
    const a = i * 0.3;
    const rx = W * 0.578, rz = W * 0.578 * 0.85;
    A.sharpBox('torso', 'dark', [0.3 * s, 0.055 * s, 0.07 * s], {
      p: [Math.sin(a) * rx, chH * (0.55 + 0.1 * Math.abs(a)), Math.cos(a) * rz],
      r: [0.12, a, -Math.sign(a) * 0.3 * Math.abs(a)] });
  }
  // huge translucent slime visor bubble filling the mouth region
  const visorGeo = sphere(W * 0.38, 20);
  visorGeo.scale(1.15, 0.72, 0.62);
  A.custom('torso', slime, visorGeo, { p: [0, chH * 0.38, W * 0.31] });
  // dark chin seam under the visor
  A.sharpBox('torso', 'dark', [W * 0.6, 0.05 * s, 0.08 * s], {
    p: [0, chH * 0.14, W * 0.44], r: [0.35, 0, 0] });
  // nostril rings on the brow
  for (const sx of [-1, 1]) {
    A.ring('torso', 'dark', 0.05 * s, 0.022 * s, {
      p: [sx * W * 0.15, chH * 0.9, W * 0.47], r: [0.9, 0, 0], seg: 12 });
  }
  // SLIMER decal on the brow between the eyes
  A.custom('torso', plateMat({ text: 'SLIMER', textScale: 0.2, textY: 0.5, color: '#e2f0c8' }),
    beveledPlate(shieldOutline(W * 0.42, 0.36 * s, { taper: 0.92 }), 0.05 * s, { round: 0.12 }), {
      p: [0, chH * 1.0, W * 0.41], r: [0.5, 0, 0] });
  // slime chin bib on the chest, oozing down
  A.custom('torso', slime,
    beveledPlate(shieldOutline(W * 0.52, chH * 0.36, { taper: 0.5 }), 0.09 * s, { round: 0.2 }), {
      p: [0, chH * 0.12, W * 0.4], r: [0.22, 0, 0] });
  drip('torso', -W * 0.18, chH * 0.02, W * 0.42, 1.1, 1.5);
  drip('torso', W * 0.08, chH * -0.02, W * 0.42, 1.4, 1.9);
  drip('torso', W * 0.3, chH * 0.1, W * 0.36, 0.8, 1.1);
  drip('torso', -W * 0.02, chH * 0.24, W * 0.45, 0.7, 0.9);
  // glowing abdomen slits + hazard chevrons on the pelvis
  for (let i = 0; i < 2; i++) {
    A.box('hips', 'glow', [0.3 * s, 0.045 * s, 0.05 * s], { p: [0, (0.05 - i * 0.16) * s, D.torsoD * 0.42] });
  }
  chevrons('hips', 4, 0, -0.38 * s, D.torsoD * 0.44);
  drip('hips', 0.1 * s, -0.5 * s, D.torsoD * 0.34, 0.8, 1.2);

  // ================= HUGE BUG-EYE DOMES ON TOP =================
  for (const sx of [-1, 1]) {
    const ex = sx * W * 0.39, ey = chH * 1.2, ez = 0.21 * s;
    const R = 0.45 * s; // dome radius — the character
    const L = new THREE.Vector3(sx * 0.4, 0.14, 0.92).normalize(); // gaze dir
    const yaw = Math.atan2(L.x, L.z), pitch = -Math.asin(L.y);
    // mechanical mount: dark socket drum + frame ring collar + brass bolts
    A.tube('torso', 'dark', R * 0.78, R * 0.62, 0.34 * s, { p: [ex, ey - 0.3 * s, ez], seg: 14 });
    A.ring('torso', 'frame', R * 0.82, 0.065 * s, { p: [ex, ey - 0.18 * s, ez], r: [Math.PI / 2, 0, 0] });
    A.ring('torso', 'dark', R * 0.9, 0.045 * s, { p: [ex, ey - 0.08 * s, ez], r: [Math.PI / 2, 0, 0] });
    for (let b = 0; b < 4; b++) {
      const ba = b * Math.PI / 2 + 0.4;
      A.ball('torso', 'brass', 0.035 * s, {
        p: [ex + Math.cos(ba) * R * 0.82, ey - 0.18 * s, ez + Math.sin(ba) * R * 0.82], seg: 6 });
    }
    // lime iris under the glass, dark vertical slit pupil on it
    A.custom('torso', new THREE.MeshStandardMaterial({
      color: 0xa6d832, emissive: 0x86c026, emissiveIntensity: 0.4, roughness: 0.3, metalness: 0.1,
    }), sphere(R * 0.62, 16), { p: [ex + L.x * R * 0.42, ey + L.y * R * 0.42, ez + L.z * R * 0.42] });
    A.sharpBox('torso', 'dark', [R * 0.2, R * 0.78, R * 0.14], {
      p: [ex + L.x * R * 0.95, ey + L.y * R * 0.95, ez + L.z * R * 0.95],
      r: [pitch, yaw, 0] });
    // the big glass dome over everything
    A.custom('torso', eyeGlass, sphere(R, 22), { p: [ex, ey + 0.04 * s, ez] });
    drip('torso', ex + sx * R * 0.5, ey - 0.34 * s, ez + R * 0.5, 0.6, 1.0);
  }

  // ================= UPPER CANNON-ARMS (arms 3 + 4, the X pose) =================
  // REAL articulated arms: shoulder2/elbow2 joint chains the animator swings
  // in counter-phase with the lower pair. Geometry bakes the up-and-out X.
  for (const side of ['L', 'R']) {
    const sx = side === 'L' ? -1 : 1;
    const sh = 'shoulder' + side + '2', el2 = 'elbow' + side + '2';
    addJoint(J, sh, 'torso', sx * W * 0.6, chH * 0.9, -0.12 * s);
    addJoint(J, el2, sh, sx * 0.48 * s, 0.3 * s, 0.04 * s);
    // raised shoulder pod over the joint, tilted out, with hazard ticks
    A.facet(sh, 'accent', 0.32 * s, 0.42 * s, 0.26 * s, 0.56 * s, {
      sides: 8, p: [sx * 0.08 * s, 0.16 * s, 0], r: [0, 0, -sx * 0.55] });
    A.plate(sh, 'primary', shieldOutline(0.5 * s, 0.44 * s, { taper: 0.8 }), 0.06 * s, {
      p: [sx * 0.24 * s, 0.28 * s, 0], r: [0, sx * Math.PI / 2, sx * 0.5], round: 0.15 });
    chevrons(sh, 3, sx * 0.06 * s, 0.14 * s, 0.24 * s, [0, 0, -sx * 0.55], 0.1);
    // fat upper strut running up-out to the elbow
    A.piston(sh, 'frame', [0, -0.04 * s, 0], [sx * 0.48 * s, 0.3 * s, 0.04 * s], 0.11 * s);
    A.piston(sh, 'brass', [sx * 0.1 * s, 0.12 * s, 0.1 * s], [sx * 0.44 * s, 0.34 * s, 0.1 * s], 0.04 * s);

    // ---- the BIG slime cannon, angled up-and-out from the elbow ----
    const dir = new THREE.Vector3(sx * 0.9, 0.32, 0.27).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(Y, dir);
    const e = new THREE.Euler().setFromQuaternion(q);
    const rr = [e.x, e.y, e.z];
    const at = (t, dy = 0) => [dir.x * t * s, dir.y * t * s + dy, dir.z * t * s];
    A.ball(el2, 'dark', 0.26 * s, {}); // elbow puck
    // concentric ring-stack breech (canonical's stacked discs)
    for (let k = 0; k < 4; k++) {
      A.tube(el2, k % 2 ? 'primary' : 'dark', (0.4 - k * 0.02) * s, (0.4 - k * 0.02) * s, 0.13 * s, {
        p: at(0.36 + k * 0.17), r: rr, seg: 14 });
    }
    // main lime barrel housing
    A.tube(el2, 'primary', 0.3 * s, 0.33 * s, 0.62 * s, { p: at(1.28), r: rr, seg: 14 });
    // translucent glowing slime core section (fatter, so it reads)
    A.custom(el2, slime, cyl(0.34 * s, 0.34 * s, 0.52 * s, 14), { p: at(1.78), r: rr });
    A.tube(el2, 'frame', 0.36 * s, 0.36 * s, 0.09 * s, { p: at(1.53), r: rr, seg: 14 }); // clamps
    A.tube(el2, 'frame', 0.36 * s, 0.36 * s, 0.09 * s, { p: at(2.03), r: rr, seg: 14 });
    // flared dark muzzle with a glowing throat
    A.tube(el2, 'dark', 0.24 * s, 0.34 * s, 0.36 * s, { p: at(2.24), r: rr, seg: 14 });
    const qz = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
    const ez2 = new THREE.Euler().setFromQuaternion(qz);
    A.ring(el2, 'glowSoft', 0.17 * s, 0.045 * s, { p: at(2.4), r: [ez2.x, ez2.y, ez2.z], seg: 16 });
    // gunk oozing off the muzzle
    const mz = at(2.36);
    drip(el2, mz[0], mz[1] - 0.14 * s, mz[2], 1.2, 1.6);
    drip(el2, mz[0] - sx * 0.16 * s, mz[1] - 0.05 * s, mz[2] + 0.1 * s, 0.7, 1.1);
    const bz = at(1.0);
    drip(el2, bz[0], bz[1] - 0.32 * s, bz[2], 0.8, 1.2);
  }

  // ================= LOWER ARMS: SLIME-TUBE NOZZLE GUNS =================
  for (const side of ['L', 'R']) {
    const sx = side === 'L' ? -1 : 1;
    standardArm(A, D, side, { fist: false, foreArmor: false, bulk: 0.95 });
    // lime upper-arm plate
    A.plate('shoulder' + side, 'primary', shieldOutline(0.36 * s, D.upperArmLen * 0.66, { taper: 0.75 }), 0.055 * s, {
      p: [sx * 0.22 * s, -D.upperArmLen * 0.5, 0], r: [0, sx * Math.PI / 2, 0], round: 0.14 });
    // translucent slime-tube forearm in black frame clamps
    A.custom('elbow' + side, slime, cyl(0.2 * s, 0.23 * s, D.foreArmLen * 0.78, 12), {
      p: [0, -D.foreArmLen * 0.48, 0] });
    for (const fy of [0.14, 0.5, 0.84]) {
      A.tube('elbow' + side, 'dark', 0.245 * s, 0.245 * s, 0.07 * s, {
        p: [0, -D.foreArmLen * fy, 0], seg: 12 });
    }
    // side rails clamping the tube
    for (const rx of [-1, 1]) {
      A.sharpBox('elbow' + side, 'frame', [0.07 * s, D.foreArmLen * 0.8, 0.1 * s], {
        p: [rx * 0.24 * s, -D.foreArmLen * 0.5, 0] });
    }
    drip('elbow' + side, sx * 0.18 * s, -D.foreArmLen * 0.72, 0.12 * s, 0.6, 1.0);
    // nozzle gun hand: dark receiver + flared accent nozzle + glow ring
    const ha = 'hand' + side;
    const phi = Math.PI / 2.3; // mostly forward, slightly down
    A.box(ha, 'dark', [0.3 * s, 0.26 * s, 0.34 * s], { p: [0, -0.08 * s, 0.06 * s] });
    A.tube(ha, 'accent', 0.13 * s, 0.21 * s, 0.62 * s, { p: [0, -0.17 * s, 0.32 * s], r: [phi, 0, 0] });
    A.custom(ha, slime, cyl(0.145 * s, 0.145 * s, 0.2 * s, 10), {
      p: [0, -0.14 * s, 0.44 * s], r: [phi, 0, 0] });
    A.ring(ha, 'glowSoft', 0.1 * s, 0.03 * s, {
      p: [0, -0.11 * s, 0.62 * s], r: [phi - Math.PI / 2, 0, 0], seg: 14 });
    drip(ha, sx * 0.05 * s, -0.24 * s, 0.58 * s, 0.9, 1.3);
    // slime shots leave the LOWER guns
    anchors['muzzle' + side] = addAnchor(J[ha], 0, -0.1 * s, 0.66 * s);
  }

  // ================= LEGS: SPRING CROUCH + HUGE WEBBED FEET =================
  for (const side of ['L', 'R']) {
    const sx = side === 'L' ? -1 : 1;
    const th = 'thigh' + side, kn = 'knee' + side, an = 'ankle' + side;
    // powerful thigh: frame core + fat lime bulge + outer plate
    A.ball(th, 'frame', 0.26 * s, {});
    A.tube(th, 'frame', 0.16 * s, 0.19 * s, D.thighLen, { p: [0, -D.thighLen / 2, 0] });
    A.lathe(th, 'primary', [
      [-D.thighLen * 0.95, 0.24 * s], [-D.thighLen * 0.55, 0.36 * s], [-D.thighLen * 0.12, 0.28 * s],
    ], { scaleZ: 1.15, seg: 16 });
    A.plate(th, 'primary', shieldOutline(0.46 * s, 0.9 * s, { taper: 0.7 }), 0.06 * s, {
      p: [sx * 0.28 * s, -D.thighLen * 0.45, 0.06 * s], r: [0.08, sx * 1.1, 0], round: 0.14 });
    // knee: dark puck + lime cap plate + brass piston
    A.part(kn, 'metal', cyl(0.18 * s, 0.18 * s, 0.34 * s, 10), { r: [0, 0, Math.PI / 2] });
    A.plate(kn, 'primary', shieldOutline(0.4 * s, 0.5 * s, { taper: 0.68 }), 0.08 * s, {
      p: [0, -0.04 * s, 0.26 * s], r: [0.2, 0, 0], round: 0.15 });
    A.piston(kn, 'brass', [0, 0.1 * s, -0.2 * s], [0, -D.shinLen * 0.4, -0.24 * s], 0.045 * s);
    // shin: frame tube + lime calf + translucent slime shin section + chevrons
    A.tube(kn, 'frame', 0.12 * s, 0.15 * s, D.shinLen, { p: [0, -D.shinLen / 2, 0] });
    A.taper(kn, 'primary', [0.34 * s, D.shinLen * 0.62, 0.4 * s], 1.3, 1.2, {
      p: [0, -D.shinLen * 0.38, 0.02 * s] });
    A.custom(kn, slime, cyl(0.15 * s, 0.19 * s, D.shinLen * 0.4, 10), {
      p: [0, -D.shinLen * 0.76, 0.02 * s] });
    A.tube(kn, 'dark', 0.2 * s, 0.2 * s, 0.06 * s, { p: [0, -D.shinLen * 0.6, 0.02 * s], seg: 10 });
    chevrons(kn, 3, 0, -D.shinLen * 0.3, 0.26 * s, [0, 0, 0], 0.1);
    drip(kn, sx * 0.12 * s, -D.shinLen * 0.86, 0.14 * s, 0.55, 0.9);

    // ---- HUGE webbed 3-toed foot ----
    A.ball(an, 'frame', 0.19 * s, {});
    A.taper(an, 'frame', [0.56 * s, 0.22 * s, 0.62 * s], 0.85, 0.7, { p: [0, -0.16 * s, 0.08 * s] });
    A.sharpBox(an, 'dark', [0.42 * s, 0.16 * s, 0.3 * s], { p: [0, -0.2 * s, -0.24 * s] }); // heel
    for (let i = -1; i <= 1; i++) {
      const ta = i * 0.44; // splay
      const dx = Math.sin(ta), dz = Math.cos(ta);
      const bx = i * 0.2 * s, bz = 0.24 * s;
      // long tapering toe (narrow end out-forward)
      A.taper(an, 'primary', [0.27 * s, 0.86 * s, 0.2 * s], 0.5, 0.55, {
        p: [bx + dx * 0.4 * s, -0.2 * s, bz + dz * 0.4 * s], r: [Math.PI / 2 + 0.06, 0, -ta] });
      // knuckle ring
      A.tube(an, 'dark', 0.13 * s, 0.13 * s, 0.08 * s, {
        p: [bx + dx * 0.42 * s, -0.17 * s, bz + dz * 0.42 * s], r: [Math.PI / 2 + 0.06, 0, -ta], seg: 8 });
      // translucent slime toe tip
      A.custom(an, slime, sphere(0.12 * s, 10), {
        p: [bx + dx * 0.86 * s, -0.24 * s, bz + dz * 0.86 * s] });
    }
    // webbing plates between the toes
    for (const wi of [-1, 1]) {
      A.sharpBox(an, 'accent', [0.34 * s, 0.055 * s, 0.5 * s], {
        p: [wi * 0.3 * s, -0.26 * s, 0.52 * s], r: [0, -wi * 0.22, 0] });
    }
  }

  anchors.core = addAnchor(J.torso, 0, chH * 0.35, W * 0.42);
}
