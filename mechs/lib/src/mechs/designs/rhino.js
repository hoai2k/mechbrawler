// Auto-split from designs.js — one mech per file. Shared sculpting
// vocabulary lives in ../parts.js; see docs/IMAGE_TO_MECH.md.
import * as THREE from 'three';
import { cyl, taperBox, beveledPlate, shieldOutline, rhombOutline, roundedBox, bulgeLathe, facetBulge } from '../parts.js';
import { decalTexture, skinMaterial } from '../../core/pbrtex.js';
import { baseFrame, standardArm, standardLeg, raptorLeg, addAnchor } from '../factory.js';
import { addJoint } from './common.js';


// ============================================================
// 6. RHINO — rebuilt to the canonical concept image: spiked siege
//    beast. Signature massive armored carapace DOME high on the
//    back, crowned by two rings of steel spikes, rising behind the
//    head like a halo of armor. Rhino face slung low: chrome
//    two-cone horn + side horns, red eyes under a heavy brow,
//    vertical grill jaw. Pentagon chest housing with a red-lit
//    sigil, enormous spiked pauldrons ("07" / "RHINO"), riveted
//    gunmetal plate everywhere, oxide-red panels, red glow seams.
// ============================================================
export function rhino(A, D, J, anchors, def) {
  const s = D.scale;
  const W = D.torsoW;   // ~1.98
  const chH = D.torsoH;
  const hs = D.headSize;
  const lean = 0.15;    // forward hunch of the chest mass

  const plateMat = (recipe, decal) => {
    const tex = decalTexture(recipe, decal);
    return new THREE.MeshStandardMaterial({
      map: tex.map, normalMap: tex.normalMap,
      roughnessMap: tex.rmMap, metalnessMap: tex.rmMap,
      roughness: 1, metalness: 1,
    });
  };
  const accentRecipe = { seed: def.seed + 5, ...def.skin.accent };
  // near-black battle plate for the lit sigil
  const sigilRecipe = {
    seed: def.seed + 9, base: 0x26262c, base2: 0x1d1d23, metal: 0x8a8f96,
    wear: 0.5, grime: 0.42, panelDepth: 3, roughPaint: 0.5, metalPaint: 0.4,
  };
  // rivet-stud helper: small steel balls along plate edges
  const studs = (joint, pts, r = 0.045 * s) => {
    for (const p of pts) A.ball(joint, 'metal', r, { p, seg: 8 });
  };

  // ================= WAIST / PELVIS =================
  A.lathe('hips', 'frame', [[0.6 * s, W * 0.28], [0.28 * s, W * 0.21], [-0.05 * s, W * 0.27]], {
    scaleX: 1.28 });
  for (let i = 0; i < 2; i++) {
    A.tube('hips', 'dark', W * (0.23 - i * 0.012), W * (0.24 - i * 0.012), 0.08 * s, {
      p: [0, 0.16 * s + i * 0.18 * s, 0] });
  }
  A.facet('hips', 'primary', W * 0.36, W * 0.46, W * 0.31, 0.9 * s, {
    sides: 6, scaleZ: 0.78, p: [0, -0.42 * s, 0] });
  A.plate('hips', 'accent', shieldOutline(W * 0.42, 0.85 * s, { taper: 0.62 }), 0.1 * s, {
    p: [0, -0.56 * s, W * 0.34], r: [0.14, 0, 0] });
  studs('hips', [[-W * 0.14, -0.28 * s, W * 0.37], [W * 0.14, -0.28 * s, W * 0.37]]);
  for (const sx of [-1, 1]) {
    A.plate('hips', 'primary', shieldOutline(W * 0.34, 0.75 * s, { taper: 0.68 }), 0.08 * s, {
      p: [sx * W * 0.47, -0.5 * s, 0], r: [0.08, sx * Math.PI / 2, sx * 0.12] });
    studs('hips', [[sx * W * 0.52, -0.3 * s, 0.16 * s], [sx * W * 0.52, -0.3 * s, -0.16 * s]]);
  }
  A.sharpBox('hips', 'dark', [W * 0.32, 0.32 * s, W * 0.2], { p: [0, -0.55 * s, -W * 0.24] });

  // ================= TORSO: hunched barrel chest, sloped plates ============
  // head slung low & forward out of the hunch (anchors follow the joint)
  J.head.position.set(0, chH * 0.8, 0.6 * s);
  A.lathe('torso', 'primary', [
    [chH * 0.06, W * 0.3],
    [chH * 0.3, W * 0.53],
    [chH * 0.55, W * 0.6],
    [chH * 0.8, W * 0.48],
    [chH * 0.96, W * 0.2],
  ], { p: [0, 0, 0.04 * s], r: [lean, 0, 0], scaleX: 1.3, scaleZ: 0.8, seg: 28 });
  // broad sloped upper-chest plates + rivets + intake slits
  for (const sx of [-1, 1]) {
    A.plate('torso', 'primary', rhombOutline(W * 0.56, chH * 0.36, { cut: 0.3 }), 0.09 * s, {
      p: [sx * W * 0.3, chH * 0.68, W * 0.44], r: [lean + 0.34, sx * 0.32, -sx * 0.1], round: 0.1 });
    studs('torso', [
      [sx * W * 0.16, chH * 0.62, W * 0.52],
      [sx * W * 0.32, chH * 0.58, W * 0.5],
      [sx * W * 0.46, chH * 0.54, W * 0.45],
    ]);
    A.vents('torso', 'dark', 3, W * 0.24, 0.09 * s, 0.05 * s, {
      p: [sx * W * 0.38, chH * 0.5, W * 0.54], r: [lean, 0, 0] });
    // oxide-red flank panel
    A.plate('torso', 'accent', rhombOutline(W * 0.3, chH * 0.4, { cut: 0.3 }), 0.07 * s, {
      p: [sx * W * 0.54, chH * 0.5, W * 0.14], r: [0, sx * 1.1, 0], round: 0.12 });
  }
  // pentagon housing with the red-lit sigil: frame housing, glow backer,
  // dark emblem-decal plate riding proud of it
  const emY = chH * 0.46, emZ = W * 0.55;
  A.plate('torso', 'frame', shieldOutline(W * 0.5, W * 0.52, { taper: 0.72 }), 0.12 * s, {
    p: [0, emY, emZ], r: [lean - 0.02, 0, 0], round: 0.08 });
  A.plate('torso', 'glow', shieldOutline(W * 0.36, W * 0.38, { taper: 0.72 }), 0.045 * s, {
    p: [0, emY - W * 0.01, emZ + 0.075 * s], r: [lean - 0.02, 0, 0], round: 0.1 });
  A.custom('torso', plateMat(sigilRecipe, {
    emblem: true, emblemY: 0.42, emblemScale: 0.3, color: '#ff4a38', alpha: 0.95,
  }), beveledPlate(shieldOutline(W * 0.28, W * 0.3, { taper: 0.72 }), 0.05 * s, { round: 0.1 }), {
    p: [0, emY - W * 0.01, emZ + 0.12 * s], r: [lean - 0.02, 0, 0] });
  studs('torso', [
    [-W * 0.21, emY + W * 0.21, emZ + 0.06 * s], [W * 0.21, emY + W * 0.21, emZ + 0.06 * s],
    [-W * 0.19, emY - W * 0.2, emZ + 0.1 * s], [W * 0.19, emY - W * 0.2, emZ + 0.1 * s],
  ]);
  // thin red glow seams flanking the housing
  for (const sx of [-1, 1]) {
    A.sharpBox('torso', 'glowSoft', [0.03 * s, chH * 0.22, 0.03 * s], {
      p: [sx * W * 0.34, chH * 0.42, W * 0.53], r: [lean, 0, sx * 0.12] });
  }
  // collar guard behind the low head
  A.tube('torso', 'frame', W * 0.26, W * 0.3, 0.26 * s, { p: [0, chH * 0.82, 0.4 * s], r: [lean + 0.15, 0, 0] });
  for (const sx of [-1, 1]) {
    A.piston('torso', 'brass', [sx * W * 0.18, chH * 0.02, W * 0.14],
      [sx * W * 0.38, chH * 0.3, W * 0.32], 0.05 * s);
  }
  // chunky abdomen rings
  for (let i = 0; i < 2; i++) {
    A.tube('torso', 'dark', W * (0.22 - i * 0.02), W * (0.24 - i * 0.02), 0.09 * s, {
      p: [0, chH * (0.06 - i * 0.09), 0] });
  }

  // ================= THE DOME: spiked carapace behind/above the head =======
  const dR = W * 0.6, dH = 0.82 * s;
  const dXs = 1.12, dZs = 0.72;
  const dY = chH * 0.92, dZC = -W * 0.46;
  // dark support drum bridging the back down into the chest
  A.facet('torso', 'frame', W * 0.42, W * 0.46, W * 0.4, 0.7 * s, {
    sides: 8, scaleZ: 0.7, p: [0, chH * 0.72, dZC + 0.12 * s] });
  A.lathe('torso', 'primary', [
    [0, dR * 0.99],
    [dH * 0.3, dR * 0.9],
    [dH * 0.62, dR * 0.68],
    [dH * 0.88, dR * 0.36],
    [dH, dR * 0.05],
  ], { p: [0, dY, dZC], scaleX: dXs, scaleZ: dZs, seg: 26 });
  // dark under-rim band
  A.lathe('torso', 'dark', [[-0.12 * s, dR * 1.0], [0.06 * s, dR * 0.97]], {
    p: [0, dY, dZC], scaleX: dXs, scaleZ: dZs, seg: 26 });
  // crown of steel spikes around the rim + smaller inner ring
  const spikeRing = (n, rr, y, beta, len, rad, off = 0) => {
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + off;
      A.spike('torso', 'metal', rad, len, {
        p: [Math.cos(a) * rr * dXs, dY + y, dZC + Math.sin(a) * rr * dZs],
        r: [0, Math.PI - a, beta], seg: 8 });
    }
  };
  spikeRing(12, dR * 0.9, dH * 0.28, 0.6, 0.6 * s, 0.08 * s);
  spikeRing(8, dR * 0.52, dH * 0.68, 0.32, 0.42 * s, 0.058 * s, Math.PI / 8);
  // rivet studs along the dome rim between the spikes
  for (let k = 0; k < 12; k++) {
    const a = ((k + 0.5) / 12) * Math.PI * 2;
    A.ball('torso', 'metal', 0.05 * s, {
      p: [Math.cos(a) * dR * 0.97 * dXs, dY + dH * 0.12, dZC + Math.sin(a) * dR * 0.97 * dZs], seg: 8 });
  }
  // shoulder-cannon port on the RIGHT flank of the dome (roster ranged move)
  const px = dR * 0.72 * dXs, py = dY + dH * 0.28, pz = dZC + 0.15 * s;
  A.facet('torso', 'frame', 0.16 * s, 0.2 * s, 0.17 * s, 0.5 * s, {
    sides: 8, p: [px, py, pz], r: [Math.PI / 2, 0, 0] });
  A.tube('torso', 'metal', 0.1 * s, 0.12 * s, 0.6 * s, {
    p: [px, py, pz + 0.5 * s], r: [Math.PI / 2, 0, 0] });
  A.tube('torso', 'dark', 0.13 * s, 0.13 * s, 0.12 * s, {
    p: [px, py, pz + 0.8 * s], r: [Math.PI / 2, 0, 0] });
  anchors.muzzleR = addAnchor(J.torso, px, py, pz + 0.9 * s);

  // ================= HEAD: rhino face slung low between the shoulders ======
  const hh = hs * 1.28; // rhino face reads big — scale the whole head up
  const hy = hh * 0.24, zf = hh * 1.3;
  A.tube('head', 'frame', hh * 0.45, hh * 0.55, hh * 0.9, {
    p: [0, hy - hh * 0.1, zf - hh * 0.85], r: [0.5, 0, 0] });
  // broad skull dome
  A.lathe('head', 'primary', [
    [-hh * 0.5, hh * 0.85],
    [hh * 0.05, hh * 0.98],
    [hh * 0.55, hh * 0.68],
    [hh * 0.75, hh * 0.2],
  ], { p: [0, hy + hh * 0.35, zf + hh * 0.05], scaleX: 1.35, scaleZ: 1.25, seg: 20 });
  // broad armored faceplate
  A.plate('head', 'primary', shieldOutline(hh * 2.15, hh * 1.5, { taper: 0.58, tip: 0.32 }), hh * 0.3, {
    p: [0, hy + hh * 0.3, zf + hh * 0.72], r: [-0.12, 0, 0], round: 0.12 });
  studs('head', [
    [-hh * 0.85, hy + hh * 0.85, zf + hh * 0.78], [hh * 0.85, hy + hh * 0.85, zf + hh * 0.78],
  ], 0.04 * s);
  // chamfered snout pushed forward, slightly drooped
  A.facet('head', 'primary', hh * 0.6, hh * 0.72, hh * 0.48, hh * 1.25, {
    sides: 8, scaleX: 1.3, p: [0, hy + hh * 0.02, zf + hh * 1.0], r: [Math.PI / 2 + 0.14, 0, 0] });
  // vertical grill jaw / muzzle guard
  A.vents('head', 'dark', 5, hh * 1.05, hh * 0.46, 0.06 * s, {
    p: [0, hy - hh * 0.34, zf + hh * 1.6], r: [0.14, 0, 0] });
  A.plate('head', 'accent', shieldOutline(hh * 1.45, hh * 0.75, { taper: 0.7 }), hh * 0.26, {
    p: [0, hy - hh * 0.32, zf + hh * 0.72], r: [0.5, 0, 0], round: 0.18 });
  // heavy brow plate + small furious red eyes deep beneath it
  A.plate('head', 'frame', rhombOutline(hh * 2.0, hh * 0.6, { cut: 0.3 }), hh * 0.5, {
    p: [0, hy + hh * 0.75, zf + hh * 0.52], r: [-0.38, 0, 0], round: 0.2 });
  for (const sx of [-1, 1]) {
    A.ball('head', 'glow', hh * 0.13, { p: [sx * hh * 0.64, hy + hh * 0.5, zf + hh * 1.08], seg: 8 });
  }
  // THE HORN — giant chrome, two stacked cones curving upward off the snout
  const hornA = Math.PI / 2.9;
  const hbY = hy + hh * 0.42, hbZ = zf + hh * 1.4;
  const hLen = 1.65 * s;
  const dY2 = Math.cos(hornA), dZ2 = Math.sin(hornA);
  A.spike('head', 'metal', 0.21 * s, hLen, {
    p: [0, hbY + dY2 * hLen * 0.42, hbZ + dZ2 * hLen * 0.42], r: [hornA, 0, 0], seg: 14 });
  A.ring('head', 'brass', 0.19 * s, 0.045 * s, {
    p: [0, hbY + dY2 * 0.14 * s, hbZ + dZ2 * 0.14 * s], r: [hornA - Math.PI / 2, 0, 0] });
  const tipA = hornA - 0.5, tLen = 0.78 * s;
  const tY = hbY + dY2 * hLen * 0.88, tZ = hbZ + dZ2 * hLen * 0.88;
  A.spike('head', 'metal', 0.1 * s, tLen, {
    p: [0, tY + Math.cos(tipA) * tLen * 0.38, tZ + Math.sin(tipA) * tLen * 0.38],
    r: [tipA, 0, 0], seg: 12 });
  // two smaller side horns angled outward
  for (const sx of [-1, 1]) {
    A.spike('head', 'metal', 0.07 * s, 0.55 * s, {
      p: [sx * hh * 0.68, hy + hh * 0.28, zf + hh * 1.05], r: [0.9, 0, -sx * 0.7], seg: 10 });
  }
  // stub horn on the forehead
  A.spike('head', 'metal', 0.09 * s, 0.5 * s, {
    p: [0, hy + hh * 0.88, zf + hh * 0.45], r: [Math.PI / 3.4, 0, 0], seg: 10 });
  anchors.horn = addAnchor(J.head, 0, tY + Math.cos(tipA) * tLen * 0.85, tZ + Math.sin(tipA) * tLen * 0.85);

  // ================= ARMS: huge, spiked =================
  for (const side of ['L', 'R']) {
    const sx = side === 'L' ? -1 : 1;
    const sh = 'shoulder' + side, el = 'elbow' + side, ha = 'hand' + side;
    J[sh].position.x = sx * (D.shoulderW + 0.38 * s);

    A.ball(sh, 'frame', 0.32 * s, {});
    // enormous rounded pauldron shell + facet cap
    A.lathe(sh, 'primary', [
      [-0.34 * s, W * 0.34],
      [0.05 * s, W * 0.36],
      [0.38 * s, W * 0.22],
      [0.52 * s, W * 0.07],
    ], { p: [sx * 0.1 * s, 0.08 * s, -0.02 * s], scaleZ: 0.95, seg: 22 });
    A.facet(sh, 'accent', W * 0.18, W * 0.22, W * 0.1, 0.28 * s, {
      sides: 8, p: [sx * 0.1 * s, 0.52 * s, -0.02 * s] });
    // steel spikes studding the shell
    A.spike(sh, 'metal', 0.085 * s, 0.62 * s, {
      p: [sx * 0.12 * s, 0.66 * s, -0.02 * s], r: [0, 0, -sx * 0.22], seg: 8 });
    A.spike(sh, 'metal', 0.075 * s, 0.5 * s, {
      p: [sx * 0.52 * s, 0.42 * s, -0.02 * s], r: [0, 0, -sx * 0.75], seg: 8 });
    A.spike(sh, 'metal', 0.07 * s, 0.45 * s, {
      p: [sx * 0.2 * s, 0.44 * s, 0.36 * s], r: [0.55, 0, -sx * 0.35], seg: 8 });
    A.spike(sh, 'metal', 0.07 * s, 0.45 * s, {
      p: [sx * 0.2 * s, 0.44 * s, -0.4 * s], r: [-0.55, 0, -sx * 0.35], seg: 8 });
    A.spike(sh, 'metal', 0.055 * s, 0.36 * s, {
      p: [sx * 0.46 * s, 0.28 * s, 0.32 * s], r: [0.45, 0, -sx * 0.65], seg: 8 });
    // rivet studs around the lower rim
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2;
      A.ball(sh, 'metal', 0.045 * s, {
        p: [sx * 0.1 * s + Math.cos(a) * 0.62 * s, -0.04 * s, -0.02 * s + Math.sin(a) * 0.58 * s],
        seg: 8 });
    }
    // oxide-red front panel + unit decal on the outer face
    A.plate(sh, 'accent', rhombOutline(0.72 * s, 0.44 * s, { cut: 0.3 }), 0.06 * s, {
      p: [sx * 0.16 * s, 0.14 * s, 0.52 * s], r: [0.3, 0, -sx * 0.18], round: 0.12 });
    A.custom(sh, plateMat(accentRecipe, side === 'L'
      ? { text: '07', textY: 0.54, textScale: 0.34, color: '#e8ddd0', alpha: 0.85 }
      : { text: 'RHINO', textY: 0.54, textScale: 0.19, color: '#e8ddd0', alpha: 0.85 }),
    beveledPlate(rhombOutline(0.85 * s, 0.55 * s, { cut: 0.26 }), 0.06 * s, { round: 0.12 }), {
      p: [sx * 0.72 * s, 0.16 * s, 0.02 * s], r: [0, sx * Math.PI / 2, -sx * 0.12] });

    // layered plate upper arm
    A.lathe(sh, 'frame', [
      [-D.upperArmLen * 0.98, 0.22 * s],
      [-D.upperArmLen * 0.55, 0.27 * s],
      [-D.upperArmLen * 0.12, 0.23 * s],
    ], { p: [sx * 0.04 * s, 0, 0], seg: 16 });
    A.tube(sh, 'primary', 0.29 * s, 0.33 * s, 0.4 * s, { p: [sx * 0.04 * s, -D.upperArmLen * 0.42, 0] });
    A.tube(sh, 'primary', 0.27 * s, 0.31 * s, 0.36 * s, { p: [sx * 0.04 * s, -D.upperArmLen * 0.74, 0] });
    A.sharpBox(sh, 'glowSoft', [0.03 * s, D.upperArmLen * 0.2, 0.03 * s], {
      p: [sx * 0.04 * s, -D.upperArmLen * 0.58, 0.31 * s] });
    A.part(el, 'metal', new THREE.CylinderGeometry(0.18 * s, 0.18 * s, 0.4 * s, 12), {
      r: [0, 0, Math.PI / 2] });
    // SPIKED ELBOW guard
    A.spike(el, 'metal', 0.07 * s, 0.5 * s, {
      p: [0, 0.0, -0.3 * s], r: [-Math.PI / 2 + 0.35, 0, 0], seg: 8 });
    for (const gx of [-1, 1]) {
      A.spike(el, 'metal', 0.05 * s, 0.32 * s, {
        p: [gx * 0.2 * s, -0.12 * s, -0.28 * s], r: [-Math.PI / 2 + 0.2, 0, gx * 0.35], seg: 8 });
    }
    // faceted forearm drum + accent spine + piston + rivets
    A.facet(el, 'primary', 0.36 * s, 0.5 * s, 0.4 * s, D.foreArmLen * 1.02, {
      sides: 8, scaleZ: 1.05, p: [0, -D.foreArmLen * 0.52, 0] });
    A.plate(el, 'accent', rhombOutline(D.foreArmLen * 0.75, 0.46 * s, { cut: 0.28 }), 0.07 * s, {
      p: [0, -D.foreArmLen * 0.52, 0.46 * s], r: [0, 0, Math.PI / 2], round: 0.12 });
    studs(el, [
      [0, -D.foreArmLen * 0.2, 0.5 * s], [0, -D.foreArmLen * 0.84, 0.5 * s],
      [sx * 0.42 * s, -D.foreArmLen * 0.3, 0.2 * s], [sx * 0.42 * s, -D.foreArmLen * 0.74, 0.2 * s],
    ]);
    A.piston(el, 'brass', [sx * 0.28 * s, -0.08 * s, -0.22 * s],
      [sx * 0.28 * s, -D.foreArmLen * 0.66, -0.28 * s], 0.045 * s);
    // giant knuckled fist with spike studs
    const fw = 0.42 * s;
    A.tube(ha, 'frame', 0.3 * s, 0.34 * s, 0.26 * s, { p: [0, 0.06 * s, 0] });
    A.part(ha, 'frame', roundedBox(fw * 1.8, fw * 1.5, fw * 1.7, fw * 0.42), {
      p: [0, -fw * 0.8, fw * 0.1] });
    for (let i = 0; i < 4; i++) {
      A.spike(ha, 'metal', fw * 0.16, fw * 0.5, {
        p: [(i - 1.5) * fw * 0.42, -fw * 0.85, fw * 1.0], r: [Math.PI / 2, 0, 0], seg: 6 });
    }
    studs(ha, [
      [sx * fw * 0.95, -fw * 1.1, fw * 0.35], [sx * fw * 0.95, -fw * 1.1, -fw * 0.25],
      [0, -fw * 1.5, fw * 0.3],
    ], 0.05 * s);
    A.capsule(ha, 'dark', fw * 0.24, fw * 0.3, {
      p: [sx * fw * 0.92, -fw * 0.55, fw * 0.25], r: [0.5, 0, sx * 0.4] });
  }

  // ================= LEGS: extremely thick, layered, wide stance ===========
  for (const side of ['L', 'R']) {
    const sx = side === 'L' ? -1 : 1;
    const th = 'thigh' + side, kn = 'knee' + side, an = 'ankle' + side;
    J[th].position.x = sx * (D.hipW + 0.14 * s); // wide siege stance

    A.ball(th, 'frame', 0.28 * s, {});
    A.lathe(th, 'primary', [
      [-D.thighLen * 1.0, 0.27 * s],
      [-D.thighLen * 0.55, 0.4 * s],
      [-D.thighLen * 0.08, 0.31 * s],
    ], { scaleZ: 1.12, seg: 20 });
    // layered thigh slabs: outer red + stacked front plates
    A.plate(th, 'accent', rhombOutline(0.5 * s, D.thighLen * 0.55, { cut: 0.26 }), 0.08 * s, {
      p: [sx * 0.38 * s, -D.thighLen * 0.48, 0.02 * s], r: [0, sx * Math.PI / 2, 0], round: 0.12 });
    A.plate(th, 'primary', shieldOutline(0.55 * s, D.thighLen * 0.48, { taper: 0.74 }), 0.09 * s, {
      p: [0, -D.thighLen * 0.34, 0.4 * s], r: [0.1, 0, 0], round: 0.12 });
    A.plate(th, 'primary', shieldOutline(0.5 * s, D.thighLen * 0.4, { taper: 0.7 }), 0.08 * s, {
      p: [0, -D.thighLen * 0.72, 0.38 * s], r: [0.0, 0, 0], round: 0.12 });
    studs(th, [
      [-0.16 * s, -D.thighLen * 0.3, 0.45 * s], [0.16 * s, -D.thighLen * 0.3, 0.45 * s],
      [sx * 0.43 * s, -D.thighLen * 0.28, 0.05 * s], [sx * 0.43 * s, -D.thighLen * 0.68, 0.05 * s],
    ]);

    // heavy knee drum + shield
    A.part(kn, 'metal', new THREE.CylinderGeometry(0.24 * s, 0.24 * s, 0.56 * s, 12), {
      r: [0, 0, Math.PI / 2] });
    A.plate(kn, 'accent', shieldOutline(0.52 * s, 0.62 * s, { taper: 0.64 }), 0.1 * s, {
      p: [0, -0.02 * s, 0.34 * s], r: [0.15, 0, 0], round: 0.14 });
    studs(kn, [[-0.14 * s, 0.14 * s, 0.38 * s], [0.14 * s, 0.14 * s, 0.38 * s]]);
    A.piston(kn, 'brass', [0, 0.12 * s, -0.26 * s], [0, -D.shinLen * 0.4, -0.31 * s], 0.05 * s);

    // massive calf + stacked shin plating + red glow seam
    A.lathe(kn, 'primary', [
      [-D.shinLen * 1.0, 0.27 * s],
      [-D.shinLen * 0.62, 0.4 * s],
      [-D.shinLen * 0.26, 0.44 * s],
      [-D.shinLen * 0.05, 0.3 * s],
    ], { scaleZ: 1.12, seg: 20 });
    A.plate(kn, 'primary', shieldOutline(0.5 * s, 0.6 * s, { taper: 0.74 }), 0.09 * s, {
      p: [0, -D.shinLen * 0.36, 0.38 * s], r: [0.05, 0, 0], round: 0.12 });
    A.plate(kn, 'accent', shieldOutline(0.56 * s, 0.58 * s, { taper: 0.72 }), 0.09 * s, {
      p: [0, -D.shinLen * 0.62, 0.37 * s], r: [0.0, 0, 0], round: 0.12 });
    A.plate(kn, 'primary', shieldOutline(0.6 * s, 0.56 * s, { taper: 0.72 }), 0.08 * s, {
      p: [0, -D.shinLen * 0.86, 0.35 * s], r: [-0.06, 0, 0], round: 0.12 });
    A.sharpBox(kn, 'glowSoft', [0.24 * s, 0.03 * s, 0.03 * s], {
      p: [0, -D.shinLen * 0.5, 0.44 * s] });
    studs(kn, [
      [-0.18 * s, -D.shinLen * 0.28, 0.44 * s], [0.18 * s, -D.shinLen * 0.28, 0.44 * s],
      [-0.2 * s, -D.shinLen * 0.62, 0.44 * s], [0.2 * s, -D.shinLen * 0.62, 0.44 * s],
    ]);

    // huge multi-toe foot: three armored toe wedges + hex heel + dark sole
    A.ball(an, 'frame', 0.18 * s, {});
    A.part(an, 'primary', roundedBox(0.95 * s, 0.3 * s, 0.85 * s, 0.08 * s), {
      p: [0, -0.1 * s, 0.02 * s] });
    for (const tx of [-0.28, 0, 0.28]) {
      A.taper(an, 'frame', [0.28 * s, 0.28 * s, 0.55 * s], 0.7, 0.45, {
        p: [tx * s, -0.15 * s, 0.42 * s], r: [-0.1, tx * 0.4, 0] });
    }
    A.facet(an, 'frame', 0.24 * s, 0.28 * s, 0.18 * s, 0.32 * s, {
      sides: 6, p: [0, -0.12 * s, -0.34 * s], r: [Math.PI / 2.4, 0, 0] });
    A.sharpBox(an, 'dark', [0.92 * s, 0.11 * s, 1.25 * s], { p: [0, -0.265 * s, 0.08 * s] });
  }

  anchors.core = addAnchor(J.torso, 0, chH * 0.5, W * 0.5);
}
