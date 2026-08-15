// Auto-split from designs.js — one mech per file. Shared sculpting
// vocabulary lives in ../parts.js; see docs/IMAGE_TO_MECH.md.
import * as THREE from 'three';
import { cyl, taperBox, beveledPlate, shieldOutline, rhombOutline, roundedBox, bulgeLathe, facetBulge } from '../parts.js';
import { decalTexture, skinMaterial } from '../../core/pbrtex.js';
import { baseFrame, standardArm, standardLeg, raptorLeg, addAnchor } from '../factory.js';
import { addJoint } from './common.js';


// ============================================================
// 1. TITANUS — sculpted rebuild from the canonical concept image.
//    Gorilla mass rhythm: enormous arms with faceted forearm drums and
//    huge segmented fists hanging to knee height, sloped hazard-striped
//    slab pauldrons, hard chest→waist taper over a banded vertebra
//    waist, amber reactor core with radial petals, twin rectangular
//    radiator towers behind a small sunken T-visor head, treaded feet.
// ============================================================
export function titanus(A, D, J, anchors, def) {
  const s = D.scale;
  const W = D.torsoW;   // master width unit (~2.16)
  const chH = D.torsoH;
  const hs = D.headSize;

  const plateMat = (skin, decal) => {
    const tex = decalTexture({ seed: def.seed + (skin === 'accent' ? 5 : 0), ...def.skin[skin] }, decal);
    return new THREE.MeshStandardMaterial({
      map: tex.map, normalMap: tex.normalMap,
      roughnessMap: tex.rmMap, metalnessMap: tex.rmMap,
      roughness: 1, metalness: 1,
    });
  };
  // black/yellow diagonal hazard chevrons, hand-weathered (pauldron fronts)
  const hazardMat = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#d7a624';
    ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = '#1c1d22';
    for (let x = -256; x < 512; x += 84) {
      ctx.beginPath();
      ctx.moveTo(x, 256); ctx.lineTo(x + 84, 0); ctx.lineTo(x + 126, 0); ctx.lineTo(x + 42, 256);
      ctx.closePath(); ctx.fill();
    }
    for (let i = 0; i < 260; i++) { // chips & grime
      const g = 30 + Math.random() * 70;
      ctx.fillStyle = `rgba(${g | 0},${g | 0},${g | 0},${0.1 + Math.random() * 0.3})`;
      ctx.fillRect(Math.random() * 256, Math.random() * 256, 2 + Math.random() * 6, 2 + Math.random() * 4);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55, metalness: 0.35 });
  })();
  // roof-slab rotation: flatten a plate (normal up), then roll the outer
  // edge down around world Z — the sloped pauldron look from the concept.
  const slabRot = (tilt) => {
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), tilt)
      .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2));
    const e = new THREE.Euler().setFromQuaternion(q);
    return [e.x, e.y, e.z];
  };

  // ================= WAIST / PELVIS =================
  // narrow articulated banded waist — chunky dark vertebra rings
  A.lathe('hips', 'frame', [[0.68 * s, W * 0.29], [0.3 * s, W * 0.23], [-0.05 * s, W * 0.28]], {
    scaleX: 1.2 });
  for (let i = 0; i < 4; i++) {
    A.tube('hips', 'dark', W * (0.26 - i * 0.015), W * (0.27 - i * 0.015), 0.09 * s, {
      p: [0, 0.02 * s + i * 0.16 * s, 0] });
  }
  // pelvis block: chamfered hex flare
  A.facet('hips', 'primary', W * 0.36, W * 0.46, W * 0.32, 0.95 * s, {
    sides: 6, scaleZ: 0.76, p: [0, -0.44 * s, 0] });
  // front crotch plate: small TITANUS decal + hazard band
  A.custom('hips', plateMat('primary', {
    text: 'TITANUS', textY: 0.42, textScale: 0.115, color: '#26282e', stripes: true,
  }), beveledPlate(shieldOutline(W * 0.46, 0.95 * s, { taper: 0.62 }), 0.1 * s, { round: 0.1 }), {
    p: [0, -0.58 * s, W * 0.35], r: [0.14, 0, 0] });
  for (const sx of [-1, 1]) {
    A.plate('hips', 'primary', shieldOutline(W * 0.36, 0.8 * s, { taper: 0.66 }), 0.09 * s, {
      p: [sx * W * 0.45, -0.52 * s, 0], r: [0.08, sx * Math.PI / 2, sx * 0.14] });
  }
  A.plate('hips', 'accent', shieldOutline(W * 0.4, 0.7 * s, { taper: 0.7 }), 0.08 * s, {
    p: [0, -0.55 * s, -W * 0.3], r: [-0.1, Math.PI, 0] });

  // ================= TORSO: broad chest tapering hard to the waist =================
  A.lathe('torso', 'primary', [
    [chH * 0.1, W * 0.29],
    [chH * 0.4, W * 0.54],
    [chH * 0.68, W * 0.63],
    [chH * 0.92, W * 0.57],
    [chH * 1.06, W * 0.34],
  ], { scaleX: 1.5, scaleZ: 0.78, seg: 28 });
  // trapezius capsules bridging chest to the slab pauldrons
  for (const sx of [-1, 1]) {
    A.capsule('torso', 'frame', W * 0.13, W * 0.32, {
      p: [sx * W * 0.46, chH * 0.94, 0], r: [0, 0, sx * 1.05], s: [1, 1, 0.8] });
  }
  // amber reactor core dead-center: glow lens + steel ring + radial dark petals
  const coreY = chH * 0.56, coreZ = W * 0.485;
  A.ring('torso', 'metal', 0.17 * s, 0.05 * s, { p: [0, coreY, coreZ + 0.06 * s] });
  A.ball('torso', 'glow', 0.11 * s, { p: [0, coreY, coreZ + 0.05 * s], seg: 14 });
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
    A.taper('torso', 'dark', [0.17 * s, 0.44 * s, 0.07 * s], 0.45, 0.8, {
      p: [Math.cos(a) * 0.44 * s, coreY + Math.sin(a) * 0.44 * s, coreZ + 0.01 * s],
      r: [0, 0, a - Math.PI / 2] });
  }
  // angled side intakes
  for (const sx of [-1, 1]) {
    A.vents('torso', 'dark', 3, W * 0.3, 0.1 * s, 0.05 * s, {
      p: [sx * W * 0.52, chH * 0.62, W * 0.28], r: [0, sx * 0.7, 0] });
  }
  // collar + chunky abdomen rings + brass waist pistons
  A.tube('torso', 'frame', W * 0.18, W * 0.21, 0.18 * s, { p: [0, chH * 1.02, 0] });
  for (let i = 0; i < 2; i++) {
    A.tube('torso', 'dark', W * (0.23 - i * 0.02), W * (0.25 - i * 0.02), 0.1 * s, {
      p: [0, chH * (0.06 - i * 0.09), 0] });
  }
  for (const sx of [-1, 1]) {
    A.piston('torso', 'brass', [sx * W * 0.2, chH * -0.04, W * 0.1],
      [sx * W * 0.42, chH * 0.3, W * 0.18], 0.05 * s);
  }
  // back plant: low housing + TWIN RECTANGULAR RADIATOR TOWERS
  A.facet('torso', 'accent', W * 0.44, W * 0.5, W * 0.4, chH * 0.5, {
    sides: 8, scaleZ: 0.5, p: [0, chH * 0.42, -W * 0.42] });
  A.sharpBox('torso', 'dark', [W * 0.6, 0.16 * s, 0.2 * s], {
    p: [0, chH * 1.0, -W * 0.44] }); // cross beam between towers
  for (const sx of [-1, 1]) {
    const tx = sx * W * 0.36, tz = -W * 0.44;
    // chamfered rectangular column (4-sided facet, flat face forward)
    A.facet('torso', 'frame', 0.36 * s, 0.4 * s, 0.32 * s, 2.3 * s, {
      sides: 4, scaleZ: 0.72, p: [tx, chH * 0.7, tz] });
    // yellow cap
    A.facet('torso', 'primary', 0.34 * s, 0.36 * s, 0.26 * s, 0.32 * s, {
      sides: 4, scaleZ: 0.72, p: [tx, chH * 0.7 + 1.3 * s, tz] });
    // vent grille bands on the front face + amber slit
    A.vents('torso', 'dark', 3, 0.4 * s, 0.62 * s, 0.06 * s, { p: [tx, chH * 0.52, tz + 0.27 * s] });
    A.vents('torso', 'dark', 3, 0.4 * s, 0.62 * s, 0.06 * s, { p: [tx, chH * 0.95, tz + 0.27 * s] });
    A.sharpBox('torso', 'glowSoft', [0.3 * s, 0.08 * s, 0.06 * s], {
      p: [tx, chH * 0.7 + 1.08 * s, tz + 0.27 * s] });
    // rear grille
    A.vents('torso', 'dark', 3, 0.4 * s, 1.1 * s, 0.06 * s, { p: [tx, chH * 0.72, tz - 0.27 * s] });
  }

  // ================= HEAD: small, blocky, sunken; amber T-visor =================
  const hy = hs * 0.42;
  A.tube('head', 'frame', hs * 0.45, hs * 0.52, hs * 0.6, { p: [0, hy * 0.3, 0] });
  A.taper('head', 'frame', [hs * 1.6, hs * 0.6, hs * 1.45], 1.12, 1.05, {
    p: [0, hy + hs * 0.32, 0] });
  A.taper('head', 'primary', [hs * 1.8, hs * 0.75, hs * 1.55], 0.8, 0.78, {
    p: [0, hy + hs * 0.95, -hs * 0.05] });
  // dark visor recess + amber T slit
  A.sharpBox('head', 'dark', [hs * 1.45, hs * 0.6, hs * 0.16], { p: [0, hy + hs * 0.5, hs * 0.7] });
  A.sharpBox('head', 'glow', [hs * 1.3, hs * 0.18, hs * 0.1], { p: [0, hy + hs * 0.64, hs * 0.78] });
  A.sharpBox('head', 'glow', [hs * 0.28, hs * 0.46, hs * 0.1], { p: [0, hy + hs * 0.37, hs * 0.78] });
  // heavy dark brow + chin vents
  A.plate('head', 'dark', rhombOutline(hs * 1.8, hs * 0.5, { cut: 0.26 }), hs * 0.5, {
    p: [0, hy + hs * 1.08, hs * 0.4], r: [-0.25, 0, 0], round: 0.15 });
  A.vents('head', 'dark', 3, hs * 0.8, hs * 0.13, 0.05 * s, { p: [0, hy + hs * 0.02, hs * 0.72] });

  // ================= ARMS: the soul of the machine =================
  for (const side of ['L', 'R']) {
    const sx = side === 'L' ? -1 : 1;
    const sh = 'shoulder' + side, el = 'elbow' + side, ha = 'hand' + side;
    J[sh].position.x = sx * (D.shoulderW + 0.42 * s);
    J[ha].position.y = -(D.foreArmLen + 0.28 * s); // long gorilla hang

    // joint ball + under-shell
    A.ball(sh, 'frame', 0.34 * s, {});
    A.lathe(sh, 'frame', [[-0.2 * s, W * 0.24], [0.12 * s, W * 0.22], [0.3 * s, W * 0.1]], {
      p: [sx * 0.08 * s, 0.02 * s, 0], seg: 16 });
    // huge sloped slab pauldron: two stacked beveled roof plates
    const tilt = -sx * 0.55;
    A.plate(sh, 'primary', shieldOutline(1.55 * s, 1.6 * s, { taper: 0.72 }), 0.16 * s, {
      p: [sx * 0.18 * s, 0.42 * s, -0.04 * s], r: slabRot(tilt), round: 0.12 });
    A.plate(sh, 'primary', shieldOutline(1.15 * s, 1.2 * s, { taper: 0.7 }), 0.14 * s, {
      p: [sx * 0.32 * s, 0.6 * s, -0.04 * s], r: slabRot(tilt), round: 0.12 });
    // hazard chevron front face, sloped to match the slab
    A.custom(sh, hazardMat,
      beveledPlate(rhombOutline(1.15 * s, 0.55 * s, { cut: 0.24 }), 0.07 * s, { round: 0.12 }), {
        p: [sx * 0.18 * s, 0.24 * s, 0.62 * s], r: [0, 0, tilt] });
    // outer side decal: TITANUS on the left, emblem on the right
    A.custom(sh, plateMat('accent', side === 'L'
      ? { text: 'TITANUS', textY: 0.52, textScale: 0.14, color: '#e8c56a' }
      : { emblem: true, emblemY: 0.42, emblemScale: 0.26, color: '#e8c56a' }),
    beveledPlate(rhombOutline(1.0 * s, 0.6 * s, { cut: 0.28 }), 0.07 * s, { round: 0.15 }), {
      p: [sx * 0.86 * s, 0.28 * s, 0], r: [0, sx * Math.PI / 2, -sx * 0.18] });

    // thick upper arm: gunmetal core + layered yellow plate wraps
    A.lathe(sh, 'frame', [
      [-D.upperArmLen * 1.0, 0.28 * s],
      [-D.upperArmLen * 0.5, 0.36 * s],
      [-D.upperArmLen * 0.05, 0.3 * s],
    ], { p: [sx * 0.03 * s, 0, 0], seg: 16 });
    A.tube(sh, 'primary', 0.4 * s, 0.44 * s, 0.46 * s, { p: [sx * 0.03 * s, -D.upperArmLen * 0.4, 0] });
    A.tube(sh, 'primary', 0.37 * s, 0.42 * s, 0.42 * s, { p: [sx * 0.03 * s, -D.upperArmLen * 0.74, 0] });
    // elbow drum
    A.part(el, 'metal', new THREE.CylinderGeometry(0.24 * s, 0.24 * s, 0.56 * s, 12), {
      r: [0, 0, Math.PI / 2] });
    // massive faceted forearm drum (bigger than the thighs)
    A.facet(el, 'primary', 0.48 * s, 0.66 * s, 0.52 * s, D.foreArmLen * 1.12, {
      sides: 8, scaleZ: 1.0, p: [0, -D.foreArmLen * 0.5, 0] });
    A.plate(el, 'accent', rhombOutline(D.foreArmLen * 0.8, 0.56 * s, { cut: 0.26 }), 0.08 * s, {
      p: [0, -D.foreArmLen * 0.52, 0.6 * s], r: [0, 0, Math.PI / 2], round: 0.12 });
    A.vents(el, 'dark', 3, 0.46 * s, 0.09 * s, 0.05 * s, { p: [0, -D.foreArmLen * 0.12, 0.56 * s] });
    A.piston(el, 'brass', [sx * 0.38 * s, -0.08 * s, -0.28 * s],
      [sx * 0.36 * s, -D.foreArmLen * 0.66, -0.36 * s], 0.055 * s);
    A.ring(el, 'dark', 0.56 * s, 0.045 * s, { p: [0, -D.foreArmLen * 0.92, 0], r: [Math.PI / 2, 0, 0] });

    // HUGE segmented fist: rounded core block + knuckle blocks + thumb,
    // gunmetal with yellow top plates
    const fw = 0.54 * s;
    A.tube(ha, 'frame', 0.42 * s, 0.48 * s, 0.4 * s, { p: [0, 0.16 * s, 0] });
    A.part(ha, 'frame', roundedBox(fw * 1.95, fw * 1.65, fw * 1.8, fw * 0.4), {
      p: [0, -fw * 0.8, fw * 0.05] });
    for (let i = 0; i < 4; i++) {
      A.part(ha, 'frame', roundedBox(fw * 0.42, fw * 0.58, fw * 0.62, fw * 0.14), {
        p: [(i - 1.5) * fw * 0.46, -fw * 1.02, fw * 0.92] });
      A.part(ha, 'dark', roundedBox(fw * 0.34, fw * 0.34, fw * 0.24, fw * 0.09), {
        p: [(i - 1.5) * fw * 0.46, -fw * 1.42, fw * 0.95] });
    }
    A.part(ha, 'frame', roundedBox(fw * 0.46, fw * 0.7, fw * 0.52, fw * 0.15), {
      p: [sx * fw * 1.04, -fw * 0.72, fw * 0.32], r: [0.35, 0, sx * 0.35] });
    A.plate(ha, 'primary', rhombOutline(fw * 1.55, fw * 0.95, { cut: 0.28 }), 0.08 * s, {
      p: [0, -fw * 0.28, fw * 0.88], r: [0.35, 0, 0], round: 0.18 });
    A.plate(ha, 'primary', rhombOutline(fw * 1.35, fw * 0.9, { cut: 0.3 }), 0.07 * s, {
      p: [0, -fw * 0.45, -fw * 0.82], r: [-0.2, 0, 0], round: 0.18 });
  }

  // ================= LEGS: stocky, layered, huge treaded feet =================
  for (const side of ['L', 'R']) {
    const sx = side === 'L' ? -1 : 1;
    const th = 'thigh' + side, kn = 'knee' + side, an = 'ankle' + side;

    A.ball(th, 'frame', 0.3 * s, {});
    A.lathe(th, 'primary', [
      [-D.thighLen * 1.0, 0.28 * s],
      [-D.thighLen * 0.55, 0.4 * s],
      [-D.thighLen * 0.08, 0.32 * s],
    ], { scaleZ: 1.1, seg: 20 });
    A.plate(th, 'accent', rhombOutline(0.48 * s, D.thighLen * 0.62, { cut: 0.26 }), 0.07 * s, {
      p: [sx * 0.38 * s, -D.thighLen * 0.5, 0.02 * s], r: [0, sx * Math.PI / 2, 0], round: 0.12 });
    A.plate(th, 'primary', shieldOutline(0.5 * s, D.thighLen * 0.55, { taper: 0.72 }), 0.08 * s, {
      p: [0, -D.thighLen * 0.45, 0.36 * s], r: [0.08, 0, 0], round: 0.14 });

    // knee joint drum + shield
    A.part(kn, 'metal', new THREE.CylinderGeometry(0.24 * s, 0.24 * s, 0.52 * s, 12), {
      r: [0, 0, Math.PI / 2] });
    A.plate(kn, 'accent', shieldOutline(0.52 * s, 0.66 * s, { taper: 0.62 }), 0.1 * s, {
      p: [0, -0.02 * s, 0.34 * s], r: [0.15, 0, 0], round: 0.14 });
    A.piston(kn, 'brass', [0, 0.14 * s, -0.26 * s], [0, -D.shinLen * 0.4, -0.33 * s], 0.055 * s);

    // calf bulge + stacked front guards
    A.lathe(kn, 'primary', [
      [-D.shinLen * 1.0, 0.28 * s],
      [-D.shinLen * 0.66, 0.4 * s],
      [-D.shinLen * 0.3, 0.44 * s],
      [-D.shinLen * 0.05, 0.29 * s],
    ], { scaleZ: 1.15, seg: 20 });
    A.plate(kn, 'primary', shieldOutline(0.52 * s, 0.62 * s, { taper: 0.76 }), 0.09 * s, {
      p: [0, -D.shinLen * 0.38, 0.4 * s], r: [0.05, 0, 0], round: 0.12 });
    // hazard-striped lower shin guard
    A.custom(kn, plateMat('primary', { stripes: true }),
      beveledPlate(shieldOutline(0.58 * s, 0.72 * s, { taper: 0.72 }), 0.09 * s, { round: 0.12 }), {
        p: [0, -D.shinLen * 0.78, 0.37 * s], r: [-0.05, 0, 0] });
    // '11' unit plate on the outer calf
    A.custom(kn, plateMat('accent', { text: '11', textScale: 0.32, textY: 0.48, color: '#e8c56a', alpha: 0.85 }),
      beveledPlate(rhombOutline(0.52 * s, D.shinLen * 0.55, { cut: 0.26 }), 0.07 * s, { round: 0.12 }), {
        p: [sx * 0.42 * s, -D.shinLen * 0.5, 0], r: [0, sx * Math.PI / 2, 0] });

    // ankle + HUGE flat treaded foot
    A.ball(an, 'frame', 0.22 * s, {});
    A.part(an, 'primary', roundedBox(0.95 * s, 0.24 * s, 1.15 * s, 0.08 * s), {
      p: [0, -0.1 * s, 0.14 * s] });
    for (const tx of [-0.3, 0, 0.3]) {
      A.taper(an, 'frame', [0.27 * s, 0.3 * s, 0.4 * s], 0.8, 0.45, {
        p: [tx * s, -0.16 * s, 0.68 * s], r: [Math.PI / 2.2, 0, 0] });
    }
    A.taper(an, 'frame', [0.72 * s, 0.26 * s, 0.45 * s], 0.8, 0.7, { p: [0, -0.1 * s, -0.44 * s] });
    A.sharpBox(an, 'dark', [0.95 * s, 0.1 * s, 1.5 * s], { p: [0, -0.27 * s, 0.12 * s] });
    for (let i = 0; i < 4; i++) {
      A.sharpBox(an, 'dark', [0.98 * s, 0.05 * s, 0.15 * s], {
        p: [0, -0.295 * s, -0.38 * s + i * 0.34 * s] });
    }
  }

  // rocket fists fire from the knuckles
  anchors.muzzleR = addAnchor(J.handR, 0, -0.56 * s, 0.6 * s);
  anchors.muzzleL = addAnchor(J.handL, 0, -0.56 * s, 0.6 * s);
  anchors.core = addAnchor(J.torso, 0, coreY, W * 0.3); // light sits inside the chest
}
