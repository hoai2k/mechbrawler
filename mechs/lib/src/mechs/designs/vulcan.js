// Auto-split from designs.js — one mech per file. Shared sculpting
// vocabulary lives in ../parts.js; see docs/IMAGE_TO_MECH.md.
import * as THREE from 'three';
import { cyl, taperBox, beveledPlate, shieldOutline, rhombOutline, roundedBox, bulgeLathe, facetBulge } from '../parts.js';
import { decalTexture, skinMaterial } from '../../core/pbrtex.js';
import { baseFrame, standardArm, standardLeg, raptorLeg, addAnchor } from '../factory.js';
import { addJoint } from './common.js';


// ============================================================
// 2. VULCAN — sculpted rebuild from the canonical concept image.
//    Rounded, machined forms throughout: bulging chest mass over a
//    pinched waist, barrel thighs, rhomboid faceted forearm housings,
//    beveled shield plates for knees/skirts, twin six-barrel gatlings,
//    quad missile towers with red lenses, crested head, orange visor.
// ============================================================
export function vulcan(A, D, J, anchors, def) {
  const s = D.scale;
  const W = D.torsoW; // ~2.0 for VULCAN — the master width unit

  const plateMat = (decal) => {
    const tex = decalTexture({ seed: def.seed + 5, ...def.skin.accent }, decal);
    return new THREE.MeshStandardMaterial({
      map: tex.map, normalMap: tex.normalMap,
      roughnessMap: tex.rmMap, metalnessMap: tex.rmMap,
      roughness: 1, metalness: 1,
    });
  };

  // ================= WAIST / PELVIS =================
  // pinched articulated waist column rising out of the hip block
  A.lathe('hips', 'frame', [[0.55 * s, W * 0.3], [0.25 * s, W * 0.21], [-0.05 * s, W * 0.26]], {
    scaleX: 1.25 });
  for (let i = 0; i < 3; i++) { // vertebra rings
    A.tube('hips', 'dark', W * (0.23 - i * 0.01), W * (0.24 - i * 0.01), 0.07 * s, {
      p: [0, 0.14 * s + i * 0.16 * s, 0] });
  }
  // hip block: chamfered hex flare
  A.facet('hips', 'primary', W * 0.34, W * 0.42, W * 0.3, 0.85 * s, {
    sides: 6, scaleZ: 0.78, p: [0, -0.42 * s, 0] });
  // red front skirt shield + white side skirts (beveled plates)
  A.plate('hips', 'accent', shieldOutline(W * 0.42, 0.85 * s, { taper: 0.6 }), 0.09 * s, {
    p: [0, -0.55 * s, W * 0.34], r: [0.14, 0, 0] });
  for (const sx of [-1, 1]) {
    A.plate('hips', 'primary', shieldOutline(W * 0.34, 0.7 * s, { taper: 0.65 }), 0.08 * s, {
      p: [sx * W * 0.42, -0.5 * s, 0], r: [0.1, sx * Math.PI / 2, sx * 0.12] });
  }
  A.sharpBox('hips', 'dark', [W * 0.3, 0.3 * s, W * 0.24], { p: [0, -0.6 * s, -W * 0.18] });

  // ================= TORSO: bulging chest over the waist =================
  const chH = D.torsoH;
  // main chest mass — smooth wide bulge, widest just under the shoulders
  A.lathe('torso', 'primary', [
    [chH * 0.14, W * 0.30],
    [chH * 0.38, W * 0.52],
    [chH * 0.66, W * 0.62],
    [chH * 0.9, W * 0.55],
    [chH * 1.04, W * 0.34],
  ], { scaleX: 1.42, scaleZ: 0.74, seg: 28 });
  // pec pontoons: rounded masses angled over the upper chest
  for (const sx of [-1, 1]) {
    A.capsule('torso', 'primary', W * 0.17, W * 0.3, {
      p: [sx * W * 0.36, chH * 0.86, W * 0.28],
      r: [0.5, 0, sx * -1.15], s: [1, 1, 0.72] });
    // intake vent slit under each pontoon
    A.vents('torso', 'dark', 3, W * 0.26, 0.09 * s, 0.05 * s, {
      p: [sx * W * 0.38, chH * 0.66, W * 0.42], r: [0.3, 0, 0] });
  }
  // red center chest shield with VULCAN decal (beveled plate, dedicated skin)
  A.custom('torso', plateMat({
    text: 'VULCAN', textY: 0.34, textScale: 0.17,
    emblem: true, emblemY: 0.62, emblemScale: 0.14, color: '#e8e2d4',
  }), beveledPlate(shieldOutline(W * 0.56, chH * 0.62, { taper: 0.68 }), 0.1 * s, { round: 0.1 }), {
    p: [0, chH * 0.52, W * 0.46], r: [-0.06, 0, 0] });
  // collar ring
  A.tube('torso', 'frame', W * 0.17, W * 0.2, 0.16 * s, { p: [0, chH * 1.0, 0] });
  // exposed abdomen ribs bridging chest to waist
  for (let i = 0; i < 2; i++) {
    A.tube('torso', 'dark', W * (0.2 - i * 0.02), W * (0.22 - i * 0.02), 0.09 * s, {
      p: [0, chH * (0.06 - i * 0.09), 0] });
  }
  // brass waist pistons angling out to the chest
  for (const sx of [-1, 1]) {
    A.piston('torso', 'brass', [sx * W * 0.18, chH * -0.05, W * 0.12],
      [sx * W * 0.4, chH * 0.3, W * 0.2], 0.045 * s);
  }
  // back pack: chamfered block + radiators + coolant drums
  A.facet('torso', 'accent', W * 0.42, W * 0.48, W * 0.4, chH * 0.6, {
    sides: 8, scaleZ: 0.5, p: [0, chH * 0.55, -W * 0.42] });
  A.vents('torso', 'dark', 6, W * 0.66, chH * 0.3, 0.06 * s, {
    p: [0, chH * 0.55, -W * 0.62] });
  for (const sx of [-1, 1]) {
    A.capsule('torso', 'metal', 0.14 * s, 0.4 * s, {
      p: [sx * W * 0.3, chH * 0.92, -W * 0.4], r: [0, 0, Math.PI / 2] });
  }

  // ================= MISSILE TOWERS =================
  for (const sx of [-1, 1]) {
    const tx = sx * W * 0.74, ty = chH * 1.12, tz = -0.06 * s;
    // support cone from the shoulder line up into the pod
    A.lathe('torso', 'frame', [[ty - 0.85 * s - chH, 0], [0, W * 0.14], [0.4 * s, W * 0.2]].map(
      ([y, r]) => [y, r]), { p: [tx, ty - 0.72 * s, tz], scaleX: 1.2 });
    // pod: chamfered octagonal block
    A.facet('torso', 'primary', W * 0.32, W * 0.38, W * 0.33, 0.82 * s, {
      sides: 8, scaleZ: 0.95, p: [tx, ty, tz] });
    // red beveled cap
    A.plate('torso', 'accent', rhombOutline(W * 0.62, W * 0.56, { cut: 0.24 }), 0.16 * s, {
      p: [tx, ty + 0.5 * s, tz], r: [Math.PI / 2, 0, 0], round: 0.08 });
    // dark inset face + 2x2 tubes with red lenses
    A.plate('torso', 'dark', rhombOutline(W * 0.44, W * 0.44, { cut: 0.22 }), 0.05 * s, {
      p: [tx, ty + 0.02 * s, tz + W * 0.28] });
    for (let i = 0; i < 4; i++) {
      const ox = (i % 2 - 0.5) * 0.3 * s, oy = (Math.floor(i / 2) - 0.5) * 0.3 * s;
      A.tube('torso', 'metal', 0.105 * s, 0.115 * s, 0.16 * s, {
        p: [tx + ox, ty + 0.02 * s + oy, tz + W * 0.3], r: [Math.PI / 2, 0, 0] });
      A.ball('torso', 'glow2', 0.066 * s, { p: [tx + ox, ty + 0.02 * s + oy, tz + W * 0.33], seg: 10 });
    }
    // dark under-trim
    A.facet('torso', 'dark', W * 0.3, W * 0.33, W * 0.31, 0.16 * s, {
      sides: 8, scaleZ: 0.9, p: [tx, ty - 0.48 * s, tz] });
    // brass conduit up the inner face
    A.tube('torso', 'brass', 0.045 * s, 0.045 * s, 0.9 * s, {
      p: [tx - sx * W * 0.3, ty - 0.2 * s, tz - 0.1 * s], r: [0.25, 0, sx * 0.15] });
  }

  // ================= HEAD =================
  const hy = D.headSize * 0.95;
  A.tube('head', 'frame', D.headSize * 0.4, D.headSize * 0.48, D.headSize * 0.6, {
    p: [0, hy * 0.28, 0] });
  // rounded dome skull
  A.lathe('head', 'primary', [
    [-D.headSize * 0.55, D.headSize * 0.7],
    [D.headSize * 0.12, D.headSize * 0.8],
    [D.headSize * 0.62, D.headSize * 0.55],
    [D.headSize * 0.78, D.headSize * 0.22],
  ], { p: [0, hy + D.headSize * 0.66, 0.06 * s], scaleZ: 1.12, seg: 20 });
  // orange visor: wrapping three-segment strip
  A.sharpBox('head', 'glow', [D.headSize * 0.95, D.headSize * 0.24, 0.07 * s], {
    p: [0, hy + D.headSize * 0.62, D.headSize * 0.82] });
  for (const sx of [-1, 1]) {
    A.sharpBox('head', 'glow', [D.headSize * 0.4, D.headSize * 0.2, 0.06 * s], {
      p: [sx * D.headSize * 0.62, hy + D.headSize * 0.62, D.headSize * 0.6], r: [0, sx * 0.7, 0] });
  }
  // brow plate (rhomboid)
  A.plate('head', 'frame', rhombOutline(D.headSize * 1.5, D.headSize * 0.5, { cut: 0.3 }), D.headSize * 0.5, {
    p: [0, hy + D.headSize * 1.0, -D.headSize * 0.1], r: [-0.18, 0, 0], round: 0.2 });
  // chin grill
  A.vents('head', 'dark', 3, D.headSize * 0.6, D.headSize * 0.16, 0.05 * s, {
    p: [0, hy + D.headSize * 0.28, D.headSize * 0.66] });
  // red crest: center blade + swept antlers
  A.blade('head', 'accent', D.headSize * 1.5, D.headSize * 0.42, 0.06 * s, {
    p: [0, hy + D.headSize * 1.62, -D.headSize * 0.08], r: [-0.42, 0, 0], taper: 0.16 });
  for (const sx of [-1, 1]) {
    A.blade('head', 'accent', D.headSize * 1.15, D.headSize * 0.3, 0.05 * s, {
      p: [sx * D.headSize * 0.52, hy + D.headSize * 1.38, 0],
      r: [-0.6, 0, sx * 0.55], taper: 0.2 });
  }

  // ================= ARMS =================
  for (const side of ['L', 'R']) {
    const sx = side === 'L' ? -1 : 1;
    const sh = 'shoulder' + side, el = 'elbow' + side, ha = 'hand' + side;
    // widen the shoulder joints clear of the bulged chest silhouette
    J[sh].position.x = sx * (D.shoulderW + 0.3 * s);

    // hemispherical pauldron shell over a joint ball
    A.ball(sh, 'frame', 0.3 * s, {});
    A.lathe(sh, 'primary', [
      [-0.15 * s, W * 0.3],
      [0.22 * s, W * 0.26],
      [0.4 * s, W * 0.1],
    ], { p: [sx * 0.14 * s, 0.06 * s, 0], scaleZ: 0.92, seg: 20 });
    A.plate(sh, 'accent', rhombOutline(W * 0.4, W * 0.3, { cut: 0.3 }), 0.06 * s, {
      p: [sx * W * 0.3, 0.16 * s, 0], r: [0, sx * Math.PI / 2, 0], round: 0.15 });
    // bulged upper arm
    A.lathe(sh, 'primary', [
      [-D.upperArmLen * 0.95, 0.2 * s],
      [-D.upperArmLen * 0.55, 0.26 * s],
      [-D.upperArmLen * 0.15, 0.21 * s],
    ], { p: [sx * 0.04 * s, 0, 0], seg: 16 });
    // elbow ring
    A.part(el, 'metal', new THREE.CylinderGeometry(0.17 * s, 0.17 * s, 0.36 * s, 12), {
      r: [0, 0, Math.PI / 2] });
    // forearm: massive faceted rhomboid housing (red) w/ white spine plate
    A.facet(el, 'accent', 0.34 * s, 0.52 * s, 0.4 * s, D.foreArmLen * 1.05, {
      sides: 8, scaleZ: 1.06, p: [0, -D.foreArmLen * 0.52, 0] });
    A.plate(el, 'primary', rhombOutline(D.foreArmLen * 0.85, 0.5 * s, { cut: 0.28 }), 0.08 * s, {
      p: [0, -D.foreArmLen * 0.55, 0.5 * s], r: [0, 0, Math.PI / 2], round: 0.12 });
    A.piston(el, 'brass', [sx * 0.3 * s, -0.05 * s, -0.2 * s], [sx * 0.34 * s, -D.foreArmLen * 0.62, -0.26 * s], 0.045 * s);
    // wrist collar + gatling cluster on spinner joint
    A.tube(ha, 'frame', 0.4 * s, 0.46 * s, 0.5 * s, { p: [0, -0.05 * s, 0.08 * s], r: [Math.PI / 2, 0, 0] });
    A.ring(ha, 'brass', 0.4 * s, 0.05 * s, { p: [0, -0.05 * s, 0.34 * s] });
    const gat = addJoint(J, 'gatling' + side, ha, 0, -0.05 * s, 0.4 * s);
    A.barrelCluster('gatling' + side, 'metal', 6, 0.24 * s, 0.078 * s, 1.7 * s, { p: [0, 0, 0.72 * s] });
    A.tube('gatling' + side, 'metal', 0.085 * s, 0.085 * s, 1.8 * s, { p: [0, 0, 0.72 * s], r: [Math.PI / 2, 0, 0] });
    A.ring('gatling' + side, 'dark', 0.27 * s, 0.06 * s, { p: [0, 0, 1.5 * s] });
    A.ring('gatling' + side, 'frame', 0.29 * s, 0.06 * s, { p: [0, 0, 0.34 * s] });
  }
  J.gatling = J.gatlingR;

  // ================= LEGS =================
  for (const side of ['L', 'R']) {
    const sx = side === 'L' ? -1 : 1;
    const th = 'thigh' + side, kn = 'knee' + side, an = 'ankle' + side;

    // hip joint ball + barrel thigh (elliptical bulge)
    A.ball(th, 'frame', 0.27 * s, {});
    A.lathe(th, 'primary', [
      [-D.thighLen * 1.0, 0.24 * s],
      [-D.thighLen * 0.55, 0.34 * s],
      [-D.thighLen * 0.1, 0.27 * s],
    ], { scaleZ: 1.12, seg: 20 });
    // red rhomboid outer-thigh plate
    A.plate(th, 'accent', rhombOutline(0.42 * s, D.thighLen * 0.7, { cut: 0.26 }), 0.07 * s, {
      p: [sx * 0.32 * s, -D.thighLen * 0.5, 0.02 * s], r: [0, sx * Math.PI / 2, 0], round: 0.12 });

    // knee: joint sphere + red beveled knee shield
    A.ball(kn, 'metal', 0.2 * s, {});
    A.plate(kn, 'accent', shieldOutline(0.44 * s, 0.6 * s, { taper: 0.62 }), 0.1 * s, {
      p: [0, -0.02 * s, 0.3 * s], r: [0.15, 0, 0], round: 0.14 });
    A.piston(kn, 'brass', [0, 0.12 * s, -0.24 * s], [0, -D.shinLen * 0.42, -0.3 * s], 0.05 * s);

    // calf: faceted bulge, fuller at the top rear
    A.lathe(kn, 'primary', [
      [-D.shinLen * 1.0, 0.24 * s],
      [-D.shinLen * 0.68, 0.34 * s],
      [-D.shinLen * 0.3, 0.37 * s],
      [-D.shinLen * 0.05, 0.26 * s],
    ], { scaleZ: 1.16, seg: 20 });
    // stacked front shin guards (beveled shields)
    A.plate(kn, 'primary', shieldOutline(0.46 * s, 0.62 * s, { taper: 0.75 }), 0.09 * s, {
      p: [0, -D.shinLen * 0.42, 0.34 * s], r: [0.06, 0, 0], round: 0.12 });
    A.plate(kn, 'primary', shieldOutline(0.52 * s, 0.66 * s, { taper: 0.72 }), 0.09 * s, {
      p: [0, -D.shinLen * 0.8, 0.32 * s], r: [-0.06, 0, 0], round: 0.12 });
    // red outer calf plate with 07X marking
    A.custom(kn, plateMat({ text: '07X', textScale: 0.3, textY: 0.5, color: '#d8d2c4', alpha: 0.8 }),
      beveledPlate(rhombOutline(0.52 * s, D.shinLen * 0.62, { cut: 0.26 }), 0.07 * s, { round: 0.12 }), {
        p: [sx * 0.36 * s, -D.shinLen * 0.5, 0], r: [0, sx * Math.PI / 2, 0] });

    // ankle + broad rounded feet: two toe wedges + heel
    A.ball(an, 'frame', 0.18 * s, {});
    for (const tx of [-0.16, 0.16]) {
      A.part(an, 'primary', roundedBox(0.3 * s, 0.26 * s, 0.62 * s, 0.07 * s), {
        p: [tx * s, -0.14 * s, 0.3 * s], r: [-0.08, tx * 0.35, 0] });
    }
    A.facet(an, 'frame', 0.2 * s, 0.24 * s, 0.16 * s, 0.3 * s, {
      sides: 6, p: [0, -0.14 * s, -0.18 * s], r: [Math.PI / 2.4, 0, 0] });
    A.sharpBox(an, 'dark', [0.52 * s, 0.1 * s, 0.9 * s], { p: [0, -0.26 * s, 0.12 * s] });
  }

  anchors.muzzleR = addAnchor(J.gatlingR, 0, 0, 1.5 * s);
  anchors.muzzleL = addAnchor(J.gatlingL, 0, 0, 1.5 * s);
  anchors.podL = addAnchor(J.torso, -W * 0.74, chH * 1.18, 0.5 * s);
  anchors.podR = addAnchor(J.torso, W * 0.74, chH * 1.18, 0.5 * s);
  anchors.core = addAnchor(J.torso, 0, chH * 0.5, W * 0.4);
}
