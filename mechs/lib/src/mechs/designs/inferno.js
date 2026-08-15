// Auto-split from designs.js — one mech per file. Shared sculpting
// vocabulary lives in ../parts.js; see docs/IMAGE_TO_MECH.md.
import * as THREE from 'three';
import { cyl, taperBox, beveledPlate, shieldOutline, rhombOutline, roundedBox, bulgeLathe, facetBulge } from '../parts.js';
import { decalTexture, skinMaterial } from '../../core/pbrtex.js';
import { baseFrame, standardArm, standardLeg, raptorLeg, addAnchor } from '../factory.js';
import { addJoint } from './common.js';


// ============================================================
// 11. INFERNO — grinning furnace juggernaut, rebuilt to the
//     canonical concept image. Warhammer-esque and hyper-worn:
//     rounded helm with fierce glowing eyes and a huge grinning
//     mouth grill, INFERNO nameplate over a torso-dominating
//     riveted furnace grill (fire raging behind dark slats), twin
//     boiler tanks riding high on the back (domes show over the
//     shoulders), boxy hazard-striped pauldrons topped by chimneys
//     with licking flames, flamethrower bell nozzles on both arms
//     (muzzleL/R at the tips), rivet-studded massive legs.
// ============================================================
export function inferno(A, D, J, anchors, def) {
  const s = D.scale;
  const W = D.torsoW;   // ~1.88 master width unit
  const chH = D.torsoH;
  const hs = D.headSize;
  const ua = D.upperArmLen, fa = D.foreArmLen;

  // dedicated decal skin (unmerged custom plates keep exact UVs)
  const plateMat = (decal, recipe, seedOff = 0) => {
    const tex = decalTexture({ seed: def.seed + seedOff, ...recipe }, decal);
    return new THREE.MeshStandardMaterial({
      map: tex.map, normalMap: tex.normalMap,
      roughnessMap: tex.rmMap, metalnessMap: tex.rmMap,
      roughness: 1, metalness: 1,
    });
  };
  // scorched orange/black diagonal hazard chevrons, hand-weathered
  const hazardMat = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#c9861c';
    ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = '#1c1a18';
    for (let x = -256; x < 512; x += 84) {
      ctx.beginPath();
      ctx.moveTo(x, 256); ctx.lineTo(x + 84, 0); ctx.lineTo(x + 126, 0); ctx.lineTo(x + 42, 256);
      ctx.closePath(); ctx.fill();
    }
    for (let i = 0; i < 300; i++) { // heavy soot + chips
      const g = 25 + Math.random() * 65;
      ctx.fillStyle = `rgba(${g | 0},${(g * 0.9) | 0},${(g * 0.8) | 0},${0.12 + Math.random() * 0.32})`;
      ctx.fillRect(Math.random() * 256, Math.random() * 256, 2 + Math.random() * 7, 2 + Math.random() * 5);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, metalness: 0.35 });
  })();

  // ================= WAIST / PELVIS =================
  // heavy waist column + vertebra rings
  A.lathe('hips', 'frame', [[0.55 * s, W * 0.3], [0.26 * s, W * 0.23], [-0.05 * s, W * 0.28]], {
    scaleX: 1.25 });
  for (let i = 0; i < 2; i++) {
    A.tube('hips', 'dark', W * (0.25 - i * 0.01), W * (0.26 - i * 0.01), 0.07 * s, {
      p: [0, 0.16 * s + i * 0.18 * s, 0] });
  }
  // hip block: chamfered hex slab
  A.facet('hips', 'primary', W * 0.34, W * 0.44, W * 0.3, 0.9 * s, {
    sides: 6, scaleZ: 0.8, p: [0, -0.44 * s, 0] });
  // hazard-banded front tabard
  A.custom('hips', plateMat({ stripes: true, alpha: 0.9 }, def.skin.primary),
    beveledPlate(shieldOutline(W * 0.42, 0.9 * s, { taper: 0.66 }), 0.1 * s, { round: 0.12 }), {
      p: [0, -0.56 * s, W * 0.33], r: [0.15, 0, 0] });
  // heavy side skirts + rear plate + pistons
  for (const sx of [-1, 1]) {
    A.plate('hips', 'primary', shieldOutline(W * 0.36, 0.78 * s, { taper: 0.7 }), 0.09 * s, {
      p: [sx * W * 0.44, -0.52 * s, 0], r: [0.08, sx * Math.PI / 2, sx * 0.14], round: 0.12 });
    A.piston('hips', 'brass', [sx * W * 0.3, 0.1 * s, -W * 0.14],
      [sx * W * 0.42, -0.5 * s, -W * 0.18], 0.05 * s);
  }
  A.sharpBox('hips', 'dark', [W * 0.32, 0.34 * s, W * 0.24], { p: [0, -0.6 * s, -W * 0.18] });

  // ================= TORSO: nameplate over a huge furnace grill =================
  A.lathe('torso', 'primary', [
    [chH * 0.10, W * 0.32],
    [chH * 0.36, W * 0.55],
    [chH * 0.62, W * 0.63],
    [chH * 0.90, W * 0.55],
    [chH * 1.04, W * 0.34],
  ], { scaleX: 1.45, scaleZ: 0.8, seg: 28 });
  // INFERNO nameplate band across the upper chest
  A.custom('torso', plateMat({
    text: 'INFERNO', textY: 0.56, textScale: 0.21, color: '#f2dcc0', alpha: 0.95,
  }, def.skin.accent, 5), beveledPlate(rhombOutline(W * 0.72, chH * 0.17, { cut: 0.13 }), 0.07 * s, { round: 0.2 }), {
    p: [0, chH * 0.86, W * 0.46], r: [0.24, 0, 0] });
  // HUGE FURNACE GRILL: riveted dark frame ring > inset > glow plate > slats
  A.plate('torso', 'accent', rhombOutline(W * 0.86, chH * 0.54, { cut: 0.2 }), 0.1 * s, {
    p: [0, chH * 0.46, W * 0.5], round: 0.1 });
  A.plate('torso', 'dark', rhombOutline(W * 0.68, chH * 0.44, { cut: 0.2 }), 0.05 * s, {
    p: [0, chH * 0.46, W * 0.55] });
  A.sharpBox('torso', 'glow', [W * 0.58, chH * 0.36, 0.06 * s], {
    p: [0, chH * 0.46, W * 0.57] });
  A.vents('torso', 'dark', 6, W * 0.62, chH * 0.4, 0.09 * s, {
    p: [0, chH * 0.46, W * 0.6] });
  // rivet heads around the frame
  for (const [rx, ry] of [[-0.36, 0.24], [0, 0.28], [0.36, 0.24], [-0.42, 0], [0.42, 0], [-0.36, -0.24], [0, -0.28], [0.36, -0.24]]) {
    A.ball('torso', 'brass', 0.05 * s, { p: [rx * W, chH * 0.46 + ry * chH, W * 0.56], seg: 8 });
  }
  // small round indicator lights flanking the grill
  for (const sx of [-1, 1]) {
    A.ring('torso', 'dark', 0.065 * s, 0.022 * s, { p: [sx * W * 0.52, chH * 0.68, W * 0.36] });
    A.ball('torso', 'glowSoft', 0.05 * s, { p: [sx * W * 0.52, chH * 0.68, W * 0.37], seg: 10 });
    // clavicle intakes
    A.vents('torso', 'dark', 3, W * 0.24, 0.1 * s, 0.05 * s, {
      p: [sx * W * 0.42, chH * 0.94, W * 0.3], r: [0.4, 0, sx * -0.3] });
  }
  // collar + abdomen rings + brass waist pistons
  A.tube('torso', 'frame', W * 0.17, W * 0.2, 0.16 * s, { p: [0, chH * 1.0, 0] });
  for (let i = 0; i < 2; i++) {
    A.tube('torso', 'dark', W * (0.21 - i * 0.02), W * (0.23 - i * 0.02), 0.09 * s, {
      p: [0, chH * (0.05 - i * 0.09), 0] });
  }
  for (const sx of [-1, 1]) {
    A.piston('torso', 'brass', [sx * W * 0.18, chH * -0.05, W * 0.12],
      [sx * W * 0.4, chH * 0.28, W * 0.2], 0.05 * s);
  }

  // ================= BACK: twin BOILER TANKS riding high =================
  A.plate('torso', 'dark', rhombOutline(W * 0.78, chH * 0.6, { cut: 0.3 }), 0.06 * s, {
    p: [0, chH * 0.55, -D.torsoD * 0.44] });
  for (const sx of [-1, 1]) {
    const tx = sx * W * 0.34, tz = -D.torsoD * 0.6;
    // rounded tank: dome shows over the shoulder from the front
    A.capsule('torso', 'accent', 0.37 * s, 0.9 * s, { p: [tx, chH * 0.8, tz] });
    A.ring('torso', 'dark', 0.38 * s, 0.035 * s, {
      p: [tx, chH * 0.66, tz], r: [Math.PI / 2, 0, 0], seg: 24 });
    A.ring('torso', 'dark', 0.38 * s, 0.035 * s, {
      p: [tx, chH * 0.96, tz], r: [Math.PI / 2, 0, 0], seg: 24 });
    // brass valve dome on top + feed pipe running to the arm
    A.lathe('torso', 'brass', [[0, 0.13 * s], [0.09 * s, 0.1 * s], [0.2 * s, 0.035 * s]], {
      p: [tx, chH * 0.8 + 0.83 * s, tz] });
    A.piston('torso', 'brass', [tx, chH * 0.8 + 0.7 * s, tz + 0.22 * s],
      [sx * W * 0.56, chH * 0.86, -0.2 * s], 0.045 * s);
    A.piston('torso', 'dark', [tx, chH * 0.4, tz],
      [sx * W * 0.2, chH * 0.16, -D.torsoD * 0.3], 0.04 * s);
    // hazard-diamond decal on the outer face
    const dia = 0.19 * s;
    A.custom('torso', hazardMat,
      beveledPlate([[0, dia], [dia, 0], [0, -dia], [-dia, 0]], 0.03 * s, { round: 0.1 }), {
        p: [tx + sx * 0.37 * s, chH * 0.8, tz], r: [0, sx * Math.PI / 2, 0] });
    // tank base cap
    A.ring('torso', 'dark', 0.3 * s, 0.05 * s, {
      p: [tx, chH * 0.34, tz], r: [Math.PI / 2, 0, 0], seg: 24 });
  }

  // ================= HEAD: jack-o-lantern furnace grin =================
  const hy = hs * 0.95;
  A.tube('head', 'frame', hs * 0.45, hs * 0.52, hs * 0.5, { p: [0, hy * 0.26, 0] });
  // rounded armored helm
  A.lathe('head', 'primary', [
    [-hs * 0.5, hs * 0.78],
    [hs * 0.05, hs * 0.88],
    [hs * 0.55, hs * 0.68],
    [hs * 0.78, hs * 0.28],
  ], { p: [0, hy + hs * 0.55, 0.0], scaleZ: 1.02, seg: 20 });
  // wide dark jaw/face plate, proud of the dome
  A.plate('head', 'dark', shieldOutline(hs * 1.6, hs * 1.4, { taper: 0.82, tip: 0.2 }), 0.07 * s, {
    p: [0, hy + hs * 0.5, hs * 0.86], r: [-0.05, 0, 0], round: 0.15 });
  // fierce angled glowing eyes
  for (const sx of [-1, 1]) {
    A.sharpBox('head', 'glow', [hs * 0.42, hs * 0.18, hs * 0.1], {
      p: [sx * hs * 0.36, hy + hs * 0.9, hs * 1.18], r: [0, 0, sx * 0.35] });
  }
  // huge GRINNING MOUTH GRILL: glow plate + vertical teeth slats + curled corners
  A.sharpBox('head', 'glow', [hs * 1.24, hs * 0.46, hs * 0.09], {
    p: [0, hy + hs * 0.3, hs * 1.16] });
  A.vents('head', 'dark', 6, hs * 1.3, hs * 0.56, hs * 0.09, {
    p: [0, hy + hs * 0.3, hs * 1.24] });
  for (const sx of [-1, 1]) {
    A.sharpBox('head', 'glow', [hs * 0.3, hs * 0.14, hs * 0.09], {
      p: [sx * hs * 0.7, hy + hs * 0.54, hs * 1.12], r: [0, 0, sx * 0.7] });
  }
  // rivets around the mask + crest ridge + crown antenna
  for (const [rx, ry] of [[-0.62, 1.0], [0.62, 1.0], [-0.7, 0.55], [0.7, 0.55]]) {
    A.ball('head', 'brass', hs * 0.07, { p: [rx * hs, hy + ry * hs, hs * 1.0], seg: 8 });
  }
  A.plate('head', 'accent', rhombOutline(hs * 1.3, hs * 0.38, { cut: 0.3 }), hs * 0.5, {
    p: [0, hy + hs * 1.1, -hs * 0.05], r: [-0.15, 0, 0], round: 0.2 });
  A.antenna('head', 'metal', 'glowSoft', hs * 0.9, { p: [hs * 0.5, hy + hs * 1.1, -hs * 0.25] });

  // ================= ARMS: chimney pauldrons + flamethrower bells =================
  for (const side of ['L', 'R']) {
    const sx = side === 'L' ? -1 : 1;
    const sh = 'shoulder' + side, el = 'elbow' + side, ha = 'hand' + side;
    J[sh].position.x = sx * (D.shoulderW + 0.3 * s);

    A.ball(sh, 'frame', 0.32 * s, {});
    // boxy slab pauldron: layered taper boxes over a dark under-rim
    A.sharpBox(sh, 'dark', [1.04 * s, 0.14 * s, 1.06 * s], {
      p: [sx * 0.1 * s, 0.1 * s, 0], r: [0, 0, -sx * 0.1] });
    A.taper(sh, 'primary', [1.05 * s, 0.55 * s, 1.1 * s], 0.8, 0.85, {
      p: [sx * 0.1 * s, 0.36 * s, 0], r: [0, 0, -sx * 0.1] });
    A.taper(sh, 'primary', [0.85 * s, 0.28 * s, 0.9 * s], 0.85, 0.9, {
      p: [sx * 0.15 * s, 0.62 * s, 0], r: [0, 0, -sx * 0.12] });
    // hazard-stripe edge band on the front face
    A.custom(sh, hazardMat,
      beveledPlate(rhombOutline(0.82 * s, 0.2 * s, { cut: 0.12 }), 0.05 * s, { round: 0.25 }), {
        p: [sx * 0.1 * s, 0.24 * s, 0.52 * s], r: [0, 0, -sx * 0.1] });
    // outer decal: 09 on the left pauldron, flame emblem on the right
    A.custom(sh, plateMat(side === 'L'
      ? { text: '09', textY: 0.56, textScale: 0.4, color: '#e8b25a', alpha: 0.9 }
      : { emblem: true, emblemY: 0.5, emblemScale: 0.3, color: '#e8b25a', alpha: 0.9 },
    def.skin.primary), beveledPlate(rhombOutline(0.72 * s, 0.6 * s, { cut: 0.26 }), 0.06 * s, { round: 0.12 }), {
      p: [sx * 0.62 * s, 0.34 * s, 0], r: [0, sx * Math.PI / 2, -sx * 0.1] });
    // CHIMNEY on top with a licking flame (stacked glow cones)
    const cx = sx * 0.16 * s;
    A.tube(sh, 'dark', 0.09 * s, 0.12 * s, 0.55 * s, { p: [cx, 0.95 * s, -0.18 * s] });
    A.ring(sh, 'dark', 0.115 * s, 0.03 * s, { p: [cx, 1.14 * s, -0.18 * s], r: [Math.PI / 2, 0, 0] });
    A.tube(sh, 'metal', 0.095 * s, 0.095 * s, 0.06 * s, { p: [cx, 1.21 * s, -0.18 * s] });
    A.spike(sh, 'glow', 0.07 * s, 0.22 * s, { p: [cx, 1.33 * s, -0.18 * s], r: [0, 0, 0.12] });
    A.spike(sh, 'glow', 0.045 * s, 0.16 * s, { p: [cx + 0.05 * s, 1.37 * s, -0.16 * s], r: [0, 0, -0.35] });
    A.spike(sh, 'glowSoft', 0.03 * s, 0.13 * s, { p: [cx - 0.04 * s, 1.39 * s, -0.2 * s], r: [0, 0, 0.3] });

    // heavy segmented upper arm: core + layered plate wraps
    A.lathe(sh, 'frame', [
      [-ua * 0.98, 0.22 * s],
      [-ua * 0.5, 0.28 * s],
      [-ua * 0.08, 0.24 * s],
    ], { p: [sx * 0.03 * s, 0, 0], seg: 16 });
    A.tube(sh, 'primary', 0.31 * s, 0.34 * s, 0.34 * s, { p: [sx * 0.03 * s, -ua * 0.38, 0] });
    A.tube(sh, 'primary', 0.29 * s, 0.33 * s, 0.3 * s, { p: [sx * 0.03 * s, -ua * 0.68, 0] });
    // elbow drum
    A.part(el, 'metal', new THREE.CylinderGeometry(0.2 * s, 0.2 * s, 0.44 * s, 12), {
      r: [0, 0, Math.PI / 2] });
    // faceted forearm drum + spine plate + piston + fuel hoses
    A.facet(el, 'accent', 0.32 * s, 0.45 * s, 0.36 * s, fa * 1.02, {
      sides: 8, scaleZ: 1.05, p: [0, -fa * 0.52, 0] });
    A.plate(el, 'primary', rhombOutline(fa * 0.75, 0.4 * s, { cut: 0.28 }), 0.07 * s, {
      p: [0, -fa * 0.55, 0.44 * s], r: [0, 0, Math.PI / 2], round: 0.12 });
    A.piston(el, 'brass', [sx * 0.28 * s, -0.08 * s, -0.2 * s],
      [sx * 0.3 * s, -fa * 0.68, -0.26 * s], 0.045 * s);
    A.piston(el, 'dark', [sx * 0.12 * s, -fa * 0.15, -0.38 * s],
      [sx * 0.08 * s, -fa * 0.85, -0.32 * s], 0.03 * s);
    A.piston(el, 'dark', [-sx * 0.3 * s, -fa * 0.2, -0.16 * s],
      [-sx * 0.26 * s, -fa * 0.9, -0.1 * s], 0.028 * s);
    // flamethrower assembly: collar > housing > dark flared bell >
    // inner glow disc > pilot-flame cone
    A.tube(ha, 'frame', 0.3 * s, 0.34 * s, 0.4 * s, { p: [0, -0.05 * s, 0.1 * s], r: [Math.PI / 2, 0, 0] });
    A.ring(ha, 'brass', 0.29 * s, 0.035 * s, { p: [0, -0.05 * s, 0.3 * s] });
    A.facet(ha, 'primary', 0.2 * s, 0.27 * s, 0.18 * s, 0.5 * s, {
      sides: 8, p: [0, -0.05 * s, 0.52 * s], r: [Math.PI / 2, 0, 0] });
    A.tube(ha, 'dark', 0.24 * s, 0.125 * s, 0.42 * s, { p: [0, -0.05 * s, 0.96 * s], r: [Math.PI / 2, 0, 0] });
    A.ring(ha, 'dark', 0.235 * s, 0.03 * s, { p: [0, -0.05 * s, 1.17 * s] });
    A.tube(ha, 'glow', 0.13 * s, 0.13 * s, 0.06 * s, { p: [0, -0.05 * s, 1.12 * s], r: [Math.PI / 2, 0, 0] });
    A.spike(ha, 'glowSoft', 0.06 * s, 0.2 * s, { p: [0, -0.05 * s, 1.26 * s], r: [Math.PI / 2, 0, 0] });
    // pilot igniter nub under the bell
    A.ball(ha, 'glowSoft', 0.045 * s, { p: [0, -0.28 * s, 1.0 * s], seg: 8 });
  }

  // ================= LEGS: massive, layered, rivet-studded =================
  for (const side of ['L', 'R']) {
    const sx = side === 'L' ? -1 : 1;
    const th = 'thigh' + side, kn = 'knee' + side, an = 'ankle' + side;

    // hip ball + barrel thigh + front plate with rivet-stud edges
    A.ball(th, 'frame', 0.3 * s, {});
    A.lathe(th, 'primary', [
      [-D.thighLen * 1.0, 0.27 * s],
      [-D.thighLen * 0.52, 0.37 * s],
      [-D.thighLen * 0.08, 0.3 * s],
    ], { scaleZ: 1.15, seg: 20 });
    A.plate(th, 'primary', shieldOutline(0.44 * s, D.thighLen * 0.5, { taper: 0.72 }), 0.08 * s, {
      p: [0, -D.thighLen * 0.45, 0.3 * s], r: [0.08, 0, 0], round: 0.14 });
    for (let i = 0; i < 3; i++) {
      for (const rx of [-1, 1]) {
        A.ball(th, 'metal', 0.042 * s, {
          p: [rx * 0.17 * s, -D.thighLen * (0.28 + i * 0.15), 0.36 * s], seg: 8 });
      }
    }
    // flame emblem decal on the outer thigh
    A.custom(th, plateMat({ emblem: true, emblemY: 0.45, emblemScale: 0.26, color: '#e8b25a', alpha: 0.85 },
      def.skin.accent, 5), beveledPlate(rhombOutline(0.44 * s, D.thighLen * 0.52, { cut: 0.26 }), 0.06 * s, { round: 0.12 }), {
      p: [sx * 0.37 * s, -D.thighLen * 0.5, 0.02 * s], r: [0, sx * Math.PI / 2, 0] });

    // knee: joint sphere + beveled shield + piston
    A.ball(kn, 'metal', 0.22 * s, {});
    A.plate(kn, 'accent', shieldOutline(0.5 * s, 0.68 * s, { taper: 0.62 }), 0.11 * s, {
      p: [0, -0.02 * s, 0.32 * s], r: [0.14, 0, 0], round: 0.14 });
    A.piston(kn, 'brass', [0, 0.12 * s, -0.26 * s], [0, -D.shinLen * 0.42, -0.32 * s], 0.05 * s);

    // massive calf swell + shin guard + HAZARD STRIPE BAND + lower guard
    A.lathe(kn, 'primary', [
      [-D.shinLen * 1.0, 0.27 * s],
      [-D.shinLen * 0.66, 0.4 * s],
      [-D.shinLen * 0.3, 0.43 * s],
      [-D.shinLen * 0.04, 0.3 * s],
    ], { scaleZ: 1.2, seg: 20 });
    A.plate(kn, 'primary', shieldOutline(0.5 * s, 0.6 * s, { taper: 0.76 }), 0.09 * s, {
      p: [0, -D.shinLen * 0.4, 0.4 * s], r: [0.06, 0, 0], round: 0.12 });
    A.custom(kn, hazardMat,
      beveledPlate(rhombOutline(0.54 * s, 0.24 * s, { cut: 0.12 }), 0.06 * s, { round: 0.25 }), {
        p: [0, -D.shinLen * 0.64, 0.43 * s] });
    A.plate(kn, 'primary', shieldOutline(0.56 * s, 0.56 * s, { taper: 0.72 }), 0.09 * s, {
      p: [0, -D.shinLen * 0.87, 0.38 * s], r: [-0.06, 0, 0], round: 0.12 });
    for (const rx of [-1, 1]) { // shin guard rivets
      A.ball(kn, 'metal', 0.045 * s, { p: [rx * 0.19 * s, -D.shinLen * 0.4, 0.47 * s], seg: 8 });
      A.ball(kn, 'metal', 0.045 * s, { p: [rx * 0.2 * s, -D.shinLen * 0.87, 0.44 * s], seg: 8 });
    }
    A.vents(kn, 'dark', 3, 0.36 * s, 0.1 * s, 0.05 * s, {
      p: [0, -D.shinLen * 0.5, -0.48 * s] });

    // HUGE stomper feet: twin toes + dark sole + hex heel
    A.ball(an, 'frame', 0.19 * s, {});
    for (const tx of [-0.21, 0.21]) {
      A.part(an, 'primary', roundedBox(0.4 * s, 0.3 * s, 0.76 * s, 0.08 * s), {
        p: [tx * s, -0.13 * s, 0.34 * s], r: [-0.08, tx * 0.28, 0] });
    }
    A.plate(an, 'accent', shieldOutline(0.6 * s, 0.36 * s, { taper: 0.85 }), 0.06 * s, {
      p: [0, -0.04 * s, 0.7 * s], r: [0.6, 0, 0], round: 0.2 });
    A.facet(an, 'frame', 0.24 * s, 0.29 * s, 0.19 * s, 0.36 * s, {
      sides: 6, p: [0, -0.14 * s, -0.24 * s], r: [Math.PI / 2.4, 0, 0] });
    A.sharpBox(an, 'dark', [0.7 * s, 0.11 * s, 1.12 * s], { p: [0, -0.27 * s, 0.14 * s] });
  }

  anchors.muzzleR = addAnchor(J.handR, 0, -0.05 * s, 1.3 * s);
  anchors.muzzleL = addAnchor(J.handL, 0, -0.05 * s, 1.3 * s);
  anchors.core = addAnchor(J.torso, 0, chH * 0.46, W * 0.5);
}
