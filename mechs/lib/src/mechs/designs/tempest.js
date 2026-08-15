// Auto-split from designs.js — one mech per file. Shared sculpting
// vocabulary lives in ../parts.js; see docs/IMAGE_TO_MECH.md.
import * as THREE from 'three';
import { cyl, taperBox, beveledPlate, shieldOutline, rhombOutline, roundedBox, bulgeLathe, facetBulge } from '../parts.js';
import { decalTexture, skinMaterial } from '../../core/pbrtex.js';
import { baseFrame, standardArm, standardLeg, raptorLeg, addAnchor } from '../factory.js';
import { addJoint } from './common.js';


// ============================================================
// 7. TEMPEST — hex-tech storm knight, rebuilt to the canonical
//    concept image. Mid-heavy navy build: faceted angular helm
//    with a glowing lightning-bolt crest, oversized beveled
//    multi-plate pauldrons (TEMPEST / 07 decals) backed by tesla
//    spires of stacked discs (glow tips = coil anchors), V-core
//    chest with jagged glow strips, bulky forearms wrapped in
//    THREE cyan ring bands, dark claw hands, swept calf fin
//    blades, glow toe slits. Broad shoulders, tight waist.
// ============================================================
export function tempest(A, D, J, anchors, def) {
  const s = D.scale;
  const W = D.torsoW;
  const chH = D.torsoH;
  const hs = D.headSize;
  const ua = D.upperArmLen, fa = D.foreArmLen;

  const plateMat = (decal) => {
    const tex = decalTexture({ seed: def.seed, ...def.skin.primary }, decal);
    return new THREE.MeshStandardMaterial({
      map: tex.map, normalMap: tex.normalMap,
      roughnessMap: tex.rmMap, metalnessMap: tex.rmMap,
      roughness: 1, metalness: 1,
    });
  };
  // roof-slab rotation: flatten a plate (normal up), then roll the outer
  // edge down around world Z — beveled sloped-pauldron orientation.
  const slabRot = (tilt) => {
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), tilt)
      .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2));
    const e = new THREE.Euler().setFromQuaternion(q);
    return [e.x, e.y, e.z];
  };

  // ================= WAIST / PELVIS =================
  // tight waist pinch under the broad chest + vertebra rings
  A.lathe('hips', 'frame', [[-0.1 * s, W * 0.26], [0.24 * s, W * 0.18], [0.55 * s, W * 0.24]], {
    scaleX: 1.25, seg: 18 });
  for (let i = 0; i < 2; i++) {
    A.tube('hips', 'dark', W * 0.19, W * 0.2, 0.06 * s, { p: [0, (0.1 + i * 0.17) * s, 0] });
  }
  A.facet('hips', 'primary', W * 0.3, W * 0.4, W * 0.27, 0.82 * s, {
    sides: 6, scaleZ: 0.8, p: [0, -0.42 * s, 0] });
  // front skirt + cyan edge sliver
  A.plate('hips', 'primary', shieldOutline(W * 0.3, 0.7 * s, { taper: 0.6 }), 0.07 * s, {
    p: [0, -0.46 * s, W * 0.27], r: [0.15, 0, 0], round: 0.12 });
  A.plate('hips', 'accent', shieldOutline(W * 0.13, 0.4 * s, { taper: 0.58 }), 0.03 * s, {
    p: [0, -0.56 * s, W * 0.31], r: [0.15, 0, 0], round: 0.2 });
  for (const sx of [-1, 1]) {
    A.plate('hips', 'primary', shieldOutline(W * 0.3, 0.62 * s, { taper: 0.64 }), 0.07 * s, {
      p: [sx * W * 0.38, -0.44 * s, 0], r: [0.06, sx * Math.PI / 2, sx * 0.16], round: 0.12 });
  }
  A.facet('hips', 'dark', W * 0.17, W * 0.21, W * 0.15, 0.42 * s, {
    sides: 6, scaleZ: 0.7, p: [0, -0.42 * s, -W * 0.2] });

  // ================= TORSO: broad storm-knight chest =================
  A.lathe('torso', 'primary', [
    [chH * 0.1, W * 0.3],
    [chH * 0.38, W * 0.52],
    [chH * 0.68, W * 0.6],
    [chH * 0.92, W * 0.52],
    [chH * 1.06, W * 0.3],
  ], { scaleX: 1.42, scaleZ: 0.74, seg: 28 });
  // layered angular pec plates + accent slivers
  for (const sx of [-1, 1]) {
    A.plate('torso', 'primary', rhombOutline(W * 0.54, chH * 0.34, { cut: 0.32 }), 0.09 * s, {
      p: [sx * W * 0.3, chH * 0.82, W * 0.32], r: [0.32, sx * 0.14, sx * -0.04], round: 0.12 });
    A.plate('torso', 'accent', rhombOutline(W * 0.3, chH * 0.08, { cut: 0.3 }), 0.04 * s, {
      p: [sx * W * 0.3, chH * 0.7, W * 0.37], r: [0.22, sx * 0.14, sx * -0.04], round: 0.2 });
    // glow slit vents flanking the core + dark side intakes
    A.sharpBox('torso', 'glowSoft', [0.035 * s, chH * 0.26, 0.035 * s], {
      p: [sx * W * 0.25, chH * 0.52, W * 0.36], r: [-0.06, 0, sx * 0.1] });
    A.vents('torso', 'dark', 3, W * 0.2, chH * 0.16, 0.05 * s, {
      p: [sx * W * 0.44, chH * 0.52, W * 0.24], r: [0, sx * 0.6, 0] });
  }
  // V-shaped core housing: angled frame walls + cyan core + jagged strips
  for (const sx of [-1, 1]) {
    A.sharpBox('torso', 'frame', [W * 0.1, chH * 0.4, 0.12 * s], {
      p: [sx * W * 0.13, chH * 0.56, W * 0.34], r: [-0.08, 0, sx * 0.35] });
  }
  A.sharpBox('torso', 'glow', [W * 0.15, chH * 0.18, 0.06 * s], {
    p: [0, chH * 0.63, W * 0.36] });
  for (let i = 0; i < 3; i++) { // small lightning inside the V
    A.sharpBox('torso', 'glow', [0.032 * s, chH * 0.085, 0.03 * s], {
      p: [(i % 2 ? -0.015 : 0.015) * W, chH * (0.36 + i * 0.075), W * 0.38],
      r: [0, 0, i % 2 ? -0.55 : 0.55] });
  }
  // winged emblem decal below the core
  A.custom('torso', plateMat({ emblem: true, emblemY: 0.42, emblemScale: 0.22, color: '#cfeeff', alpha: 0.85 }),
    beveledPlate(shieldOutline(W * 0.32, chH * 0.22, { taper: 0.6 }), 0.06 * s, { round: 0.12 }), {
      p: [0, chH * 0.2, W * 0.32], r: [-0.14, 0, 0] });
  // collar + abdomen rings
  A.tube('torso', 'frame', W * 0.14, W * 0.17, 0.14 * s, { p: [0, chH * 1.02, 0] });
  for (let i = 0; i < 2; i++) {
    A.tube('torso', 'dark', W * (0.2 - i * 0.02), W * (0.22 - i * 0.02), 0.08 * s, {
      p: [0, chH * (0.04 - i * 0.1), 0] });
  }
  // back capacitor pack: chamfered housing + coolant drums + fin
  A.facet('torso', 'accent', W * 0.34, W * 0.4, W * 0.32, chH * 0.52, {
    sides: 8, scaleZ: 0.55, p: [0, chH * 0.52, -W * 0.36] });
  A.vents('torso', 'dark', 5, W * 0.46, chH * 0.2, 0.05 * s, {
    p: [0, chH * 0.48, -W * 0.58] });
  for (const sx of [-1, 1]) {
    A.capsule('torso', 'metal', 0.09 * s, 0.3 * s, {
      p: [sx * W * 0.24, chH * 0.86, -W * 0.36], r: [0, 0, Math.PI / 2] });
  }
  A.blade('torso', 'accent', 0.6 * s, 0.2 * s, 0.04 * s, {
    p: [0, chH * 0.96, -W * 0.46], r: [-0.7, 0, 0], taper: 0.15 });
  for (const sx of [-1, 1]) {
    A.piston('torso', 'brass', [sx * W * 0.15, chH * -0.02, -W * 0.07],
      [sx * W * 0.32, chH * 0.32, -W * 0.12], 0.035 * s);
  }

  // ================= HEAD: sharp faceted helm + lightning-bolt crest =================
  const hy = hs * 0.95;
  A.tube('head', 'frame', hs * 0.32, hs * 0.4, hs * 0.8, { p: [0, hy * 0.28, 0] });
  // angular chamfered skull: jaw block + tapered crown
  A.taper('head', 'frame', [hs * 1.3, hs * 0.7, hs * 1.3], 1.12, 1.0, {
    p: [0, hy + hs * 0.16, 0] });
  A.taper('head', 'primary', [hs * 1.5, hs * 0.85, hs * 1.45], 0.62, 0.7, {
    p: [0, hy + hs * 0.82, -hs * 0.06] });
  // cheek blades
  for (const sx of [-1, 1]) {
    A.plate('head', 'primary', rhombOutline(hs * 0.9, hs * 0.5, { cut: 0.3 }), hs * 0.16, {
      p: [sx * hs * 0.64, hy + hs * 0.4, hs * 0.08], r: [0, sx * Math.PI / 2, sx * 0.26], round: 0.15 });
  }
  // dark visor recess + glowing V-visor meeting in a point
  A.sharpBox('head', 'dark', [hs * 1.16, hs * 0.46, hs * 0.2], { p: [0, hy + hs * 0.56, hs * 0.56] });
  for (const sx of [-1, 1]) {
    A.sharpBox('head', 'glow', [hs * 0.52, hs * 0.13, hs * 0.12], {
      p: [sx * hs * 0.26, hy + hs * 0.6, hs * 0.66], r: [0, sx * -0.16, sx * 0.38] });
  }
  A.sharpBox('head', 'glow', [hs * 0.11, hs * 0.11, hs * 0.1], {
    p: [0, hy + hs * 0.49, hs * 0.68], r: [0, 0, Math.PI / 4] });
  A.vents('head', 'dark', 3, hs * 0.44, hs * 0.11, 0.04 * s, {
    p: [0, hy + hs * 0.2, hs * 0.64] });
  // brow ridge over the visor
  A.plate('head', 'primary', rhombOutline(hs * 1.2, hs * 0.36, { cut: 0.28 }), hs * 0.3, {
    p: [0, hy + hs * 0.9, hs * 0.34], r: [-0.32, 0, 0], round: 0.18 });
  // crown LIGHTNING-BOLT CREST: three glow plates zigzagged into a Z,
  // ~1.3 head heights tall, backed by a thin dark spine
  const crY = hy + hs * 1.1;
  A.blade('head', 'frame', hs * 1.45, hs * 0.24, 0.05 * s, {
    p: [0, crY + hs * 0.62, -hs * 0.24], r: [-0.12, 0, 0], taper: 0.3 });
  for (let i = 0; i < 3; i++) {
    A.sharpBox('head', 'glow', [hs * 0.16, hs * 0.56, 0.035 * s], {
      p: [0, crY + (0.2 + i * 0.44) * hs, -hs * 0.12],
      r: [-0.1, 0, i % 2 ? -0.48 : 0.48] });
  }

  // ================= ARMS: big pauldrons, spires, ring-band forearms =================
  for (const side of ['L', 'R']) {
    const sx = side === 'L' ? -1 : 1;
    const sh = 'shoulder' + side, el = 'elbow' + side, ha = 'hand' + side;
    J[sh].position.x = sx * (D.shoulderW + 0.28 * s);

    A.ball(sh, 'frame', 0.26 * s, {});
    // LARGE beveled multi-plate pauldron (roof slabs), bigger than the head
    const tilt = -sx * 0.42;
    A.plate(sh, 'primary', shieldOutline(1.18 * s, 1.1 * s, { taper: 0.66 }), 0.14 * s, {
      p: [sx * 0.12 * s, 0.32 * s, 0], r: slabRot(tilt), round: 0.1 });
    A.plate(sh, 'primary', shieldOutline(0.9 * s, 0.84 * s, { taper: 0.64 }), 0.13 * s, {
      p: [sx * 0.26 * s, 0.5 * s, 0], r: slabRot(tilt), round: 0.1 });
    // cyan front edge sliver
    A.plate(sh, 'accent', rhombOutline(0.7 * s, 0.14 * s, { cut: 0.2 }), 0.045 * s, {
      p: [sx * 0.14 * s, 0.24 * s, 0.42 * s], r: [0, 0, tilt], round: 0.25 });
    // pointed outer tip + small downward spike
    A.spike(sh, 'primary', 0.1 * s, 0.34 * s, {
      p: [sx * 0.68 * s, 0.14 * s, 0], r: [0, 0, -sx * 1.9] });
    A.spike(sh, 'dark', 0.05 * s, 0.24 * s, {
      p: [sx * 0.58 * s, -0.04 * s, 0], r: [0, 0, Math.PI] });
    // pauldron decal: TEMPEST on the right face, 07 on the left
    A.custom(sh, plateMat(side === 'R'
      ? { text: 'TEMPEST', textY: 0.55, textScale: 0.155, color: '#cfeeff', alpha: 0.9 }
      : { text: '07', textY: 0.56, textScale: 0.36, color: '#cfeeff', alpha: 0.9 }),
    beveledPlate(rhombOutline(0.66 * s, 0.44 * s, { cut: 0.28 }), 0.05 * s, { round: 0.15 }), {
      p: [sx * 0.62 * s, 0.36 * s, 0], r: [0, sx * Math.PI / 2, -sx * 0.35] });

    // ===== TESLA SPIRE behind/above the pauldron: stacked tapering discs =====
    const cx = sx * 0.14 * s, cz = -0.3 * s;
    A.facet(sh, 'metal', 0.16 * s, 0.18 * s, 0.13 * s, 0.18 * s, {
      sides: 8, p: [cx, 0.42 * s, cz] });
    A.tube(sh, 'metal', 0.04 * s, 0.05 * s, 0.62 * s, { p: [cx, 0.79 * s, cz] });
    for (let i = 0; i < 5; i++) {
      A.tube(sh, 'metal', (0.15 - i * 0.021) * s, (0.15 - i * 0.021) * s, 0.04 * s, {
        p: [cx, (0.55 + i * 0.125) * s, cz] });
    }
    A.ring(sh, 'brass', 0.065 * s, 0.018 * s, { p: [cx, 1.1 * s, cz], r: [Math.PI / 2, 0, 0] });
    A.ball(sh, 'glowSoft', 0.075 * s, { p: [cx, 1.16 * s, cz] });

    // sturdy upper arm with a plate wrap
    A.lathe(sh, 'frame', [
      [-ua * 0.98, 0.14 * s],
      [-ua * 0.5, 0.2 * s],
      [-ua * 0.1, 0.16 * s],
    ], { seg: 14 });
    A.tube(sh, 'primary', 0.22 * s, 0.25 * s, ua * 0.32, { p: [sx * 0.02 * s, -ua * 0.42, 0] });
    A.part(el, 'metal', cyl(0.14 * s, 0.14 * s, 0.3 * s, 10), { r: [0, 0, Math.PI / 2] });
    // bulky forearm drum wrapped by THREE glowing cyan ring bands
    A.facet(el, 'primary', 0.22 * s, 0.3 * s, 0.2 * s, fa * 1.0, {
      sides: 8, scaleZ: 1.05, p: [0, -fa * 0.5, 0] });
    for (let i = 0; i < 3; i++) {
      A.ring(el, 'glowSoft', (0.31 - i * 0.014) * s, 0.026 * s, {
        p: [0, -fa * (0.3 + i * 0.2), 0], r: [Math.PI / 2, 0, 0], seg: 24 });
      A.ring(el, 'dark', (0.325 - i * 0.014) * s, 0.014 * s, {
        p: [0, -fa * (0.34 + i * 0.2), 0], r: [Math.PI / 2, 0, 0], seg: 24 });
    }
    A.piston(el, 'brass', [sx * 0.13 * s, -0.08 * s, -0.2 * s],
      [sx * 0.15 * s, -fa * 0.6, -0.25 * s], 0.032 * s);
    if (side === 'R') { // T-07 forearm decal
      A.custom(el, plateMat({ text: 'T-07', textY: 0.5, textScale: 0.24, color: '#cfeeff', alpha: 0.85 }),
        beveledPlate(rhombOutline(0.34 * s, fa * 0.42, { cut: 0.26 }), 0.045 * s, { round: 0.12 }), {
          p: [sx * 0.31 * s, -fa * 0.52, 0], r: [0, sx * Math.PI / 2, 0] });
    }
    // articulated dark claw hand
    A.facet(ha, 'frame', 0.14 * s, 0.17 * s, 0.12 * s, 0.3 * s, { sides: 6, p: [0, -0.08 * s, 0] });
    A.sharpBox(ha, 'glowSoft', [0.16 * s, 0.04 * s, 0.04 * s], { p: [0, -0.18 * s, 0.1 * s] });
    for (let i = -1; i <= 1; i++) {
      A.taper(ha, 'dark', [0.06 * s, 0.26 * s, 0.05 * s], 0.25, 0.5, {
        p: [i * 0.08 * s, -0.3 * s, 0.08 * s], r: [Math.PI - 0.5, 0, 0] });
    }
    A.taper(ha, 'dark', [0.055 * s, 0.2 * s, 0.05 * s], 0.3, 0.5, {
      p: [sx * 0.14 * s, -0.24 * s, 0.02 * s], r: [Math.PI - 0.4, 0, -sx * 0.4] });
  }

  // ================= LEGS: sturdy plantigrade, fin-blade calves =================
  for (const side of ['L', 'R']) {
    const sx = side === 'L' ? -1 : 1;
    const th = 'thigh' + side, kn = 'knee' + side, an = 'ankle' + side;
    const tl = D.thighLen, sl = D.shinLen;

    A.ball(th, 'frame', 0.22 * s, {});
    // layered thigh: bulge + front plate + cyan glow slit + T-07 decal
    A.lathe(th, 'primary', [
      [-tl * 1.0, 0.18 * s],
      [-tl * 0.55, 0.28 * s],
      [-tl * 0.1, 0.22 * s],
    ], { scaleZ: 1.12, seg: 18 });
    A.plate(th, 'primary', shieldOutline(0.36 * s, tl * 0.5, { taper: 0.7 }), 0.06 * s, {
      p: [0, -tl * 0.42, 0.26 * s], r: [0.1, 0, 0], round: 0.14 });
    A.sharpBox(th, 'glowSoft', [0.03 * s, tl * 0.26, 0.03 * s], {
      p: [0, -tl * 0.42, 0.31 * s] });
    A.custom(th, plateMat({ text: 'T-07', textY: 0.5, textScale: 0.22, color: '#cfeeff', alpha: 0.8 }),
      beveledPlate(rhombOutline(0.36 * s, tl * 0.44, { cut: 0.28 }), 0.05 * s, { round: 0.12 }), {
        p: [sx * 0.29 * s, -tl * 0.5, 0], r: [0, sx * Math.PI / 2, 0] });

    // knee ball + shield + piston
    A.ball(kn, 'metal', 0.15 * s, {});
    A.plate(kn, 'accent', shieldOutline(0.32 * s, 0.44 * s, { taper: 0.62 }), 0.07 * s, {
      p: [0, -0.02 * s, 0.2 * s], r: [0.15, 0, 0], round: 0.14 });
    A.piston(kn, 'brass', [0, 0.1 * s, -0.18 * s], [0, -sl * 0.4, -0.22 * s], 0.035 * s);

    // calf swell + shin guard + side pod
    A.lathe(kn, 'primary', [
      [-sl * 1.0, 0.15 * s],
      [-sl * 0.64, 0.24 * s],
      [-sl * 0.3, 0.27 * s],
      [-sl * 0.05, 0.18 * s],
    ], { scaleZ: 1.15, seg: 18 });
    A.plate(kn, 'primary', shieldOutline(0.3 * s, sl * 0.5, { taper: 0.72 }), 0.06 * s, {
      p: [0, -sl * 0.52, 0.23 * s], r: [0.02, 0, 0], round: 0.14 });
    A.facet(kn, 'frame', 0.1 * s, 0.13 * s, 0.09 * s, 0.4 * s, {
      sides: 6, p: [sx * 0.28 * s, -sl * 0.38, -0.05 * s] });
    // SWEPT FIN BLADES on the outer calf near the ankle (blade skates)
    A.blade(kn, 'primary', 0.5 * s, 0.17 * s, 0.05 * s, {
      p: [sx * 0.28 * s, -sl * 0.7, -0.1 * s], r: [Math.PI + 0.75, 0, sx * 0.12], taper: 0.15 });
    A.blade(kn, 'accent', 0.62 * s, 0.2 * s, 0.04 * s, {
      p: [sx * 0.24 * s, -sl * 0.8, -0.16 * s], r: [Math.PI + 0.85, 0, sx * 0.1], taper: 0.12 });

    // armored foot with a glow toe slit
    A.ball(an, 'frame', 0.15 * s, {});
    A.part(an, 'primary', roundedBox(0.34 * s, 0.24 * s, 0.6 * s, 0.06 * s), {
      p: [0, -0.16 * s, 0.16 * s], r: [-0.06, 0, 0] });
    A.plate(an, 'accent', shieldOutline(0.26 * s, 0.28 * s, { taper: 0.7 }), 0.05 * s, {
      p: [0, -0.08 * s, 0.4 * s], r: [0.55, 0, 0], round: 0.2 });
    A.sharpBox(an, 'glowSoft', [0.18 * s, 0.05 * s, 0.03 * s], { p: [0, -0.2 * s, 0.47 * s] });
    A.facet(an, 'frame', 0.14 * s, 0.17 * s, 0.12 * s, 0.28 * s, {
      sides: 6, p: [0, -0.15 * s, -0.18 * s], r: [Math.PI / 2.2, 0, 0] });
    A.sharpBox(an, 'dark', [0.34 * s, 0.08 * s, 0.76 * s], { p: [0, -0.28 * s, 0.08 * s] });
  }

  anchors.muzzleR = addAnchor(J.handR, 0, -0.22 * s, 0.42 * s);
  anchors.coilL = addAnchor(J.shoulderL, -0.14 * s, 1.16 * s, -0.3 * s);
  anchors.coilR = addAnchor(J.shoulderR, 0.14 * s, 1.16 * s, -0.3 * s);
  anchors.core = addAnchor(J.torso, 0, chH * 0.62, W * 0.3);
}
