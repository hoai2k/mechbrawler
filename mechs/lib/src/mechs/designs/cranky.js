// CRANKY — the abyssal crab bulwark, matched to docs/canonical/mech_cranky.png:
// ENORMOUS domed rust-orange carapace (clearly wider than tall) overhanging
// the body like a roof, spike antennae on the crown, NO raised head — the
// face is embedded under the shell brow: two 2×2 clusters of round blue LED
// eyes flanking a chrome grill mouth framed by dark pipe mandibles. TWO
// GIANT serrated crab pincers carried low in front (orange shell outer,
// dark mech inner jaw, chrome saw-teeth on both fingers; the lower finger
// rides the animated jawL/jawR joints and gapes/snaps). Twin blue-steel
// water cannons atop the shell, each fed by a riveted caged blue tank with
// brass bands and hoses. Wide-stance crab legs with orange armor caps plus
// decorative segmented side legs arching out from under the shell.
import * as THREE from 'three';
import { beveledPlate, shieldOutline, rhombOutline } from '../parts.js';
import { decalTexture } from '../../core/pbrtex.js';
import { baseFrame, standardArm, standardLeg, addAnchor } from '../factory.js';
import { addJoint } from './common.js';

export function cranky(A, D, J, anchors, def) {
  const s = D.scale;
  const W = D.torsoW;
  const chH = D.torsoH;

  const plateMat = (decal) => {
    const tex = decalTexture({ seed: def.seed + 3, ...def.skin.primary }, decal);
    return new THREE.MeshStandardMaterial({
      map: tex.map, normalMap: tex.normalMap,
      roughnessMap: tex.rmMap, metalnessMap: tex.rmMap,
      roughness: 1, metalness: 1,
    });
  };
  // euler that points a +Y-axis part from `from` toward `to`
  const aim = (from, to) => {
    const dir = new THREE.Vector3(to[0] - from[0], to[1] - from[1], to[2] - from[2]).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    const e = new THREE.Euler().setFromQuaternion(q);
    return [e.x, e.y, e.z];
  };

  // ================= PELVIS / UNDERBELLY =================
  baseFrame(A, D);
  // wide flat crab underbelly bridging pelvis to the shell
  A.facet('hips', 'frame', W * 0.42, W * 0.5, W * 0.4, 0.7 * s, {
    sides: 8, scaleZ: 0.72, p: [0, -0.2 * s, 0] });
  A.plate('hips', 'primary', shieldOutline(W * 0.5, 0.72 * s, { taper: 0.7 }), 0.08 * s, {
    p: [0, -0.42 * s, W * 0.3], r: [0.3, 0, 0], round: 0.14 });

  // ================= CARAPACE SHELL — the dominant mass =================
  // huge dome, clearly wider than tall, overhanging front/sides like a roof
  A.lathe('torso', 'primary', [
    [chH * -0.12, W * 0.52],
    [chH * 0.00, W * 0.68],
    [chH * 0.24, W * 0.74],
    [chH * 0.52, W * 0.66],
    [chH * 0.78, W * 0.46],
    [chH * 0.98, W * 0.21],
    [chH * 1.06, 0.05 * s],
  ], { seg: 26, scaleX: 1.32, scaleZ: 0.8 });
  // dark under-shell rim so the roof visibly overhangs
  A.ring('torso', 'dark', W * 0.65, 0.13 * s, {
    p: [0, chH * -0.09, 0], r: [Math.PI / 2, 0, 0], s: [1.3, 0.8, 1] });
  // overlapping brim skirt plates hanging off the rim
  for (const a of [-2.4, -1.6, -0.8, 0, 0.8, 1.6, 2.4]) {
    A.plate('torso', 'primary', shieldOutline(W * 0.32, 0.78 * s, { taper: 0.62 }), 0.08 * s, {
      p: [Math.sin(a) * W * 0.82, chH * 0.03, Math.cos(a) * W * 0.54],
      r: [0.95, a, 0], round: 0.12 });
  }
  // panel seam ridge running over the crown, front to back
  A.box('torso', 'primary', [0.22 * s, 0.14 * s, W * 1.0], { p: [0, chH * 0.9, -0.1 * s] });

  // nameplate: "CRANKY" + crab-claw sigil chevron, front-center of the dome
  A.custom('torso', plateMat({
    text: 'CRANKY', textY: 0.36, textScale: 0.19, color: '#e8dcc2',
    emblem: true, emblemY: 0.64, emblemScale: 0.16 }),
  beveledPlate(shieldOutline(W * 0.62, 1.15 * s, { taper: 0.86 }), 0.05 * s, { round: 0.12 }), {
    p: [0, chH * 0.58, W * 0.5], r: [0.62, 0, 0] });
  // "07" unit number on the right of the dome
  A.custom('torso', plateMat({ text: '07', textScale: 0.36, textY: 0.52, color: '#e8dcc2' }),
    beveledPlate(rhombOutline(W * 0.24, 0.5 * s, { cut: 0.26 }), 0.04 * s, { round: 0.12 }), {
      p: [W * 0.52, chH * 0.54, W * 0.36], r: [0.55, 0.6, 0] });

  // crown spike antennae row (front to back) + two tall spires
  for (let i = 0; i < 4; i++) {
    A.spike('torso', 'dark', 0.055 * s, 0.4 * s, {
      p: [0, chH * (1.02 - i * 0.045), (0.42 - i * 0.36) * s], seg: 6 });
  }
  for (const sx of [-1, 1]) {
    A.tube('torso', 'dark', 0.028 * s, 0.05 * s, 0.9 * s, {
      p: [sx * 0.72 * s, chH * 0.86 + 0.45 * s, -0.6 * s] });
    A.spike('torso', 'dark', 0.03 * s, 0.35 * s, {
      p: [sx * 0.72 * s, chH * 0.86 + 1.05 * s, -0.6 * s], seg: 6 });
  }

  // ================= EMBEDDED FACE under the shell brow =================
  const faceZ = W * 0.56;
  // brow plate jutting over the face
  A.plate('torso', 'primary', shieldOutline(W * 0.62, 0.66 * s, { taper: 0.78 }), 0.09 * s, {
    p: [0, chH * 0.45, W * 0.6], r: [1.05, 0, 0], round: 0.14 });
  // dark face housing recessed beneath it
  A.taper('torso', 'dark', [W * 0.5, chH * 0.36, 0.55 * s], 0.85, 0.7, {
    p: [0, chH * 0.2, faceZ - 0.22 * s] });
  // chrome grill mouth (vertical slats)
  A.sharpBox('torso', 'dark', [W * 0.2, chH * 0.24, 0.1 * s], { p: [0, chH * 0.17, faceZ + 0.02 * s] });
  A.vents('torso', 'metal', 6, W * 0.16, chH * 0.19, 0.06 * s, { p: [0, chH * 0.17, faceZ + 0.08 * s] });
  // two 2×2 clusters of round blue LED eyes flanking the mouth
  for (const sx of [-1, 1]) {
    A.box('torso', 'frame', [0.34 * s, 0.34 * s, 0.12 * s], { p: [sx * W * 0.19, chH * 0.24, faceZ] });
    for (const ex of [-1, 1]) for (const ey of [-1, 1]) {
      A.ball('torso', 'glow', 0.052 * s, {
        p: [sx * W * 0.19 + ex * 0.078 * s, chH * 0.24 + ey * 0.078 * s, faceZ + 0.075 * s], seg: 10 });
    }
  }
  // dark pipe mandibles framing the face, elbow balls at the joints
  for (const sx of [-1, 1]) {
    A.tube('torso', 'dark', 0.07 * s, 0.075 * s, chH * 0.3, {
      p: [sx * W * 0.32, chH * 0.26, faceZ - 0.06 * s], r: [0.35, 0, sx * 0.55] });
    A.ball('torso', 'dark', 0.09 * s, { p: [sx * W * 0.38, chH * 0.13, faceZ - 0.01 * s] });
    A.tube('torso', 'dark', 0.06 * s, 0.065 * s, chH * 0.2, {
      p: [sx * W * 0.36, chH * 0.045, faceZ + 0.03 * s], r: [-0.4, 0, -sx * 0.5] });
  }

  // ================= SHOULDER WATER CANNONS + RIVETED TANKS =================
  for (const side of ['L', 'R']) {
    const sx = side === 'L' ? -1 : 1;
    const yaw = 0.42; // barrels splay outward like the image
    const dir = [sx * Math.sin(yaw), 0, Math.cos(yaw)];
    const bx = sx * W * 0.56, by = chH * 0.86, bz = -0.4 * s;
    const bl = 2.0 * s;
    const at = (f) => [bx + dir[0] * bl * f, by, bz + dir[2] * bl * f];
    // mount cradle sunk into the shell
    A.taper('torso', 'dark', [0.46 * s, 0.55 * s, 0.55 * s], 0.8, 0.8, { p: [bx, by - 0.2 * s, bz + 0.2 * s] });
    // blue-steel barrel, banded segments
    A.tube('torso', 'accent', 0.16 * s, 0.2 * s, bl, { p: at(0.42), r: [Math.PI / 2, 0, -sx * yaw] });
    for (const f of [0.2, 0.45, 0.7]) {
      A.ring('torso', 'metal', 0.195 * s, 0.032 * s, { p: at(f), r: [0, sx * yaw, 0] });
    }
    // glowing blue muzzle ring + dark bore
    A.ring('torso', 'glow', 0.17 * s, 0.045 * s, { p: at(0.94), r: [0, sx * yaw, 0] });
    A.tube('torso', 'dark', 0.11 * s, 0.11 * s, 0.24 * s, { p: at(0.96), r: [Math.PI / 2, 0, -sx * yaw] });
    const tip = at(1.02);
    anchors['muzzle' + side] = addAnchor(J.torso, tip[0], tip[1], tip[2]);

    // riveted blue tank behind the cannon: brass bands + cage bars + hoses
    const tx = bx + sx * 0.12 * s, ty = by + 0.3 * s, tz = bz - 0.6 * s;
    A.capsule('torso', 'accent', 0.36 * s, 0.46 * s, { p: [tx, ty, tz] });
    for (const t of [-0.19, 0.17]) {
      A.ring('torso', 'brass', 0.36 * s, 0.036 * s, { p: [tx, ty + t * s, tz], r: [Math.PI / 2, 0, 0] });
    }
    for (let k = 0; k < 4; k++) { // cage bars
      const a = (k / 4) * Math.PI * 2 + 0.4;
      A.tube('torso', 'dark', 0.026 * s, 0.026 * s, 0.72 * s, {
        p: [tx + Math.cos(a) * 0.36 * s, ty, tz + Math.sin(a) * 0.36 * s] });
    }
    A.ball('torso', 'brass', 0.09 * s, { p: [tx, ty + 0.5 * s, tz] }); // top valve
    // hoses: tank top -> down to the barrel breech
    A.piston('torso', 'dark', [tx, ty + 0.4 * s, tz], [bx + sx * 0.16 * s, by + 0.14 * s, bz + 0.1 * s], 0.045 * s);
    A.piston('torso', 'dark', [tx - sx * 0.18 * s, ty + 0.2 * s, tz - 0.1 * s], [bx, by - 0.05 * s, bz - 0.15 * s], 0.038 * s);
  }

  // ================= ARMS -> GIANT SERRATED PINCERS =================
  // Shoulders drop lower + forward so the arms emerge from under the brim.
  for (const side of ['L', 'R']) {
    const sx = side === 'L' ? -1 : 1;
    J['shoulder' + side].position.y = chH * 0.6;
    J['shoulder' + side].position.z = 0.18 * s;
    standardArm(A, D, side, { fist: false, foreArmor: false, bulk: 1.1 });
    const el = 'elbow' + side, ha = 'hand' + side;
    // segmented dark forearm with orange facet cap
    A.facet(el, 'primary', 0.3 * s, 0.38 * s, 0.32 * s, D.foreArmLen * 0.8, {
      sides: 8, p: [0, -D.foreArmLen * 0.5, 0] });
    A.ring(el, 'dark', 0.34 * s, 0.045 * s, { p: [0, -D.foreArmLen * 0.88, 0], r: [Math.PI / 2, 0, 0] });

    // claw base frame: tips the whole pincer forward-down and toes it inward
    const cb = 'clawBase' + side;
    addJoint(J, cb, ha, 0, -0.06 * s, 0.08 * s);
    J[cb].rotation.set(0.12, -sx * 0.1, 0);
    A.ball(cb, 'frame', 0.32 * s, {});

    // PROPODUS: fat orange claw-hand bulb, dark inner cheek
    A.capsule(cb, 'primary', 0.52 * s, 0.55 * s, {
      p: [sx * 0.03 * s, 0.02 * s, 0.42 * s], r: [Math.PI / 2, 0, 0], s: [1, 1, 1.15] });
    A.capsule(cb, 'frame', 0.34 * s, 0.46 * s, {
      p: [-sx * 0.14 * s, -0.04 * s, 0.58 * s], r: [Math.PI / 2, 0, 0] });
    // carapace plate over the top of the bulb
    A.plate(cb, 'primary', shieldOutline(0.9 * s, 1.05 * s, { taper: 0.68 }), 0.1 * s, {
      p: [sx * 0.04 * s, 0.4 * s, 0.5 * s], r: [-1.35, 0, 0], round: 0.16 });

    // FIXED UPPER FINGER: orange shell, curving down at the tip
    A.blade(cb, 'primary', 1.3 * s, 0.66 * s, 0.42 * s, {
      p: [sx * 0.02 * s, 0.2 * s, 1.25 * s], r: [Math.PI / 2 + 0.22, 0, 0], taper: 0.28 });
    A.spike(cb, 'primary', 0.19 * s, 0.75 * s, {
      p: [sx * 0.02 * s, 0.0 * s, 1.95 * s], r: [Math.PI / 2 + 0.5, 0, 0], seg: 8 });
    // chrome saw-teeth along the upper finger's underside
    for (let i = 0; i < 5; i++) {
      A.spike(cb, 'metal', 0.07 * s, 0.24 * s, {
        p: [sx * 0.02 * s, 0.02 * s - i * 0.015 * s, (0.78 + i * 0.22) * s], r: [Math.PI, 0, 0], seg: 4 });
    }

    // HINGED LOWER FINGER on the animated jaw joint. The hinge frame is
    // rolled 180° so the animator's rotation.x = -gape swings the finger
    // DOWN-open at rest and snaps it up shut on strikes.
    const hinge = 'clawHinge' + side;
    addJoint(J, hinge, cb, sx * 0.02 * s, -0.24 * s, 0.6 * s);
    J[hinge].rotation.z = Math.PI;
    const jaw = 'jaw' + side;
    addJoint(J, jaw, hinge, 0, 0, 0);
    A.ball(jaw, 'dark', 0.16 * s, {}); // hinge pin
    // dark mech inner jaw, curving up (local -Y) to meet the fixed finger
    A.blade(jaw, 'frame', 1.2 * s, 0.56 * s, 0.36 * s, {
      p: [0, 0.02 * s, 0.56 * s], r: [Math.PI / 2 + 0.25, 0, 0], taper: 0.3 });
    A.spike(jaw, 'frame', 0.17 * s, 0.65 * s, {
      p: [0, -0.18 * s, 1.2 * s], r: [Math.PI / 2 + 0.55, 0, 0], seg: 8 });
    // orange shell cap on the outer (world-lower) face
    A.plate(jaw, 'primary', shieldOutline(0.6 * s, 1.05 * s, { taper: 0.6 }), 0.08 * s, {
      p: [0, 0.22 * s, 0.56 * s], r: [-1.32, 0, 0], round: 0.16 });
    // chrome saw-teeth along the gap side (local -Y = world up)
    for (let i = 0; i < 4; i++) {
      A.spike(jaw, 'metal', 0.06 * s, 0.2 * s, {
        p: [0, -0.12 * s - i * 0.02 * s, (0.3 + i * 0.22) * s], r: [Math.PI, 0, 0], seg: 4 });
    }
    // glowing hydraulic seam at the knuckle
    A.box(cb, 'glowSoft', [0.05 * s, 0.05 * s, 0.3 * s], { p: [sx * 0.3 * s, 0.08 * s, 0.45 * s] });

    anchors['claw' + side] = addAnchor(J[cb], 0, -0.05 * s, 1.7 * s);
  }

  // ================= LEGS: dark steel joints, orange caps, gripper feet ====
  for (const side of ['L', 'R']) {
    const sx = side === 'L' ? -1 : 1;
    standardLeg(A, D, side, { bulk: 1.1 });
    // orange armor caps on the upper segments
    A.plate('thigh' + side, 'primary', shieldOutline(0.56 * s, D.thighLen * 0.62, { taper: 0.7 }), 0.08 * s, {
      p: [sx * 0.3 * s, -D.thighLen * 0.42, 0.1 * s], r: [0.08, sx * 1.0, 0], round: 0.14 });
    A.plate('knee' + side, 'primary', shieldOutline(0.72 * s, 1.2 * s, { taper: 0.66 }), 0.1 * s, {
      p: [0, -0.14 * s, 0.62 * s], r: [0.12, 0, 0], round: 0.14 });
    A.plate('knee' + side, 'primary', shieldOutline(0.58 * s, 0.75 * s, { taper: 0.72 }), 0.08 * s, {
      p: [0, -D.shinLen * 0.62, 0.44 * s], r: [0.02, 0, 0], round: 0.14 });
    // flat gripper foot: wide sole plate + splayed toe wedges
    A.sharpBox('ankle' + side, 'dark', [0.85 * s, 0.13 * s, 1.0 * s], { p: [0, -0.26 * s, 0.12 * s] });
    for (const tx of [-0.26, 0.26]) {
      A.taper('ankle' + side, 'frame', [0.24 * s, 0.24 * s, 0.4 * s], 0.7, 0.4, {
        p: [tx * s, -0.2 * s, 0.55 * s], r: [Math.PI / 2.3, 0, 0] });
    }
    A.taper('ankle' + side, 'frame', [0.4 * s, 0.2 * s, 0.3 * s], 0.8, 0.6, { p: [0, -0.2 * s, -0.35 * s] });
  }

  // ================= DECORATIVE SIDE CRAB LEGS =================
  // two segmented struts per side arching up-out from under the shell then
  // down toward the ground — static geometry on the hips, no rig changes
  for (const sx of [-1, 1]) {
    for (const zoff of [0.45 * s, -0.5 * s]) {
      const hip = [sx * (D.hipW + 0.2 * s), 0.55 * s, zoff];
      const knee = [sx * (D.hipW + 1.55 * s), 0.9 * s, zoff * 1.5];
      const tip = [sx * (D.hipW + 2.45 * s), -2.55 * s, zoff * 1.9];
      A.ball('hips', 'frame', 0.17 * s, { p: hip });
      A.piston('hips', 'dark', hip, knee, 0.11 * s);
      A.ball('hips', 'dark', 0.17 * s, { p: knee });
      A.piston('hips', 'dark', knee, tip, 0.085 * s);
      A.spike('hips', 'dark', 0.08 * s, 0.32 * s, {
        p: tip.map((v, i) => v + [0, -0.12 * s, 0][i]), r: [Math.PI, 0, 0], seg: 6 });
      // orange armor cap plates on the upper segments
      const m1 = hip.map((v, i) => (v + knee[i]) / 2);
      A.capsule('hips', 'primary', 0.17 * s, 0.9 * s, { p: m1, r: aim(hip, knee) });
      const m2 = knee.map((v, i) => v * 0.65 + tip[i] * 0.35);
      A.capsule('hips', 'primary', 0.13 * s, 0.8 * s, { p: m2, r: aim(knee, tip) });
    }
  }

  anchors.core = addAnchor(J.torso, 0, chH * 0.3, faceZ - 0.2 * s);
}
