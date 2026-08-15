// Auto-split from designs.js — one mech per file. Shared sculpting
// vocabulary lives in ../parts.js; see docs/IMAGE_TO_MECH.md.
import * as THREE from 'three';
import { cyl, taperBox, beveledPlate, shieldOutline, rhombOutline, roundedBox, bulgeLathe, facetBulge } from '../parts.js';
import { decalTexture, skinMaterial } from '../../core/pbrtex.js';
import { baseFrame, standardArm, standardLeg, raptorLeg, addAnchor } from '../factory.js';
import { addJoint } from './common.js';


// ============================================================
// 9. COLOSSUS — rebuilt to the canonical concept image: a headless
//    hunched artillery fortress. Amber visor slit sunk into the
//    torso under a shallow armored dome (no protruding head), twin
//    VERY long banded mortar tubes rising off the back in a V on
//    the aiming joint, ammo-pouch grid + tally-marked hatches on
//    the chest, drum pauldrons with COLOSSUS/01 and skull decals,
//    massive drum forearms with three-finger fists, stacked leg
//    armor and huge multi-toe feet. Rivet studs everywhere.
// ============================================================
export function colossus(A, D, J, anchors, def) {
  const s = D.scale;
  const W = D.torsoW;   // ~2.28 — widest torso in the roster
  const chH = D.torsoH;
  const hs = D.headSize;
  const hunch = 0.1;    // forward pitch baked into the chest mass

  const plateMat = (skin, decal) => {
    const tex = decalTexture({ seed: def.seed + (skin === 'accent' ? 5 : 0), ...def.skin[skin] }, decal);
    return new THREE.MeshStandardMaterial({
      map: tex.map, normalMap: tex.normalMap,
      roughnessMap: tex.rmMap, metalnessMap: tex.rmMap,
      roughness: 1, metalness: 1,
    });
  };
  // rivet stud row helper — small balls along plate edges
  const studs = (joint, pts) => {
    for (const p of pts) A.ball(joint, 'metal', 0.038 * s, { p, seg: 6 });
  };
  // N-gon outline for circular drum-face decal plates
  const circleOutline = (r, n = 16) => Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return [Math.cos(a) * r, Math.sin(a) * r];
  });
  // weathered amber/black hazard chevrons (drum + skirt accents)
  const hazardMat = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#c99b2c';
    ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = '#26241f';
    for (let x = -256; x < 512; x += 84) {
      ctx.beginPath();
      ctx.moveTo(x, 256); ctx.lineTo(x + 84, 0); ctx.lineTo(x + 126, 0); ctx.lineTo(x + 42, 256);
      ctx.closePath(); ctx.fill();
    }
    for (let i = 0; i < 300; i++) {
      const g = 40 + Math.random() * 80;
      ctx.fillStyle = `rgba(${g | 0},${g | 0},${g | 0},${0.12 + Math.random() * 0.3})`;
      ctx.fillRect(Math.random() * 256, Math.random() * 256, 2 + Math.random() * 7, 2 + Math.random() * 4);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.58, metalness: 0.35 });
  })();
  // stenciled skull emblem for the right pauldron drum face
  const skullMat = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#46423b';
    ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = '#d3c194';
    // crossbones behind
    ctx.save();
    ctx.translate(128, 150);
    for (const a of [-0.7, 0.7]) {
      ctx.save(); ctx.rotate(a);
      ctx.fillRect(-84, -9, 168, 18);
      ctx.beginPath(); ctx.arc(-84, -8, 11, 0, 7); ctx.arc(-84, 8, 11, 0, 7);
      ctx.arc(84, -8, 11, 0, 7); ctx.arc(84, 8, 11, 0, 7); ctx.fill();
      ctx.restore();
    }
    ctx.restore();
    // cranium + jaw
    ctx.beginPath(); ctx.arc(128, 102, 56, 0, 7); ctx.fill();
    ctx.fillRect(100, 128, 56, 36);
    // sockets, nose, teeth gaps
    ctx.fillStyle = '#46423b';
    ctx.beginPath(); ctx.arc(107, 98, 15, 0, 7); ctx.arc(149, 98, 15, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.moveTo(128, 116); ctx.lineTo(120, 134); ctx.lineTo(136, 134); ctx.closePath(); ctx.fill();
    for (let i = 0; i < 4; i++) ctx.fillRect(107 + i * 13, 136, 4, 28);
    // chips & grime, like the rest of the hull
    for (let i = 0; i < 280; i++) {
      const g = 30 + Math.random() * 70;
      ctx.fillStyle = `rgba(${g | 0},${g | 0},${g | 0},${0.1 + Math.random() * 0.3})`;
      ctx.fillRect(Math.random() * 256, Math.random() * 256, 2 + Math.random() * 6, 2 + Math.random() * 4);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, metalness: 0.4 });
  })();

  // ================= WAIST / HIPS: hatch block + heavy skirts =================
  A.lathe('hips', 'frame', [[0.62 * s, W * 0.28], [0.3 * s, W * 0.22], [-0.05 * s, W * 0.28]], {
    scaleX: 1.3 });
  for (let i = 0; i < 3; i++) {
    A.tube('hips', 'dark', W * (0.24 - i * 0.013), W * (0.25 - i * 0.013), 0.08 * s, {
      p: [0, 0.12 * s + i * 0.17 * s, 0] });
  }
  A.facet('hips', 'primary', W * 0.4, W * 0.48, W * 0.36, 1.0 * s, {
    sides: 8, scaleZ: 0.8, p: [0, -0.45 * s, 0] });
  // heavy central hatch block: beveled plate + warning triangle decal
  A.custom('hips', plateMat('accent', {
    text: '▲', textY: 0.42, textScale: 0.3, color: '#c99b2c', alpha: 0.8,
  }), beveledPlate(shieldOutline(W * 0.42, 1.0 * s, { taper: 0.68 }), 0.15 * s, { round: 0.1 }), {
    p: [0, -0.55 * s, W * 0.36], r: [0.12, 0, 0] });
  // hook studs on the hatch corners + a tow ring
  studs('hips', [
    [-W * 0.16, -0.18 * s, W * 0.43], [W * 0.16, -0.18 * s, W * 0.43],
    [-W * 0.14, -0.95 * s, W * 0.4], [W * 0.14, -0.95 * s, W * 0.4],
  ]);
  A.ring('hips', 'metal', 0.09 * s, 0.03 * s, { p: [0, -0.14 * s, W * 0.45], r: [0.5, 0, 0] });
  // thick layered side skirts
  for (const sx of [-1, 1]) {
    A.plate('hips', 'primary', shieldOutline(W * 0.4, 0.92 * s, { taper: 0.7 }), 0.11 * s, {
      p: [sx * W * 0.46, -0.5 * s, 0.04 * s], r: [0.08, sx * Math.PI / 2, sx * 0.1] });
    A.plate('hips', 'accent', shieldOutline(W * 0.3, 0.7 * s, { taper: 0.72 }), 0.09 * s, {
      p: [sx * W * 0.52, -0.62 * s, -0.16 * s], r: [0.05, sx * Math.PI / 2, sx * 0.16] });
    studs('hips', [
      [sx * W * 0.5, -0.16 * s, 0.24 * s], [sx * W * 0.5, -0.16 * s, -0.16 * s]]);
  }
  A.plate('hips', 'accent', shieldOutline(W * 0.42, 0.75 * s, { taper: 0.7 }), 0.09 * s, {
    p: [0, -0.55 * s, -W * 0.32], r: [-0.1, Math.PI, 0] });

  // ================= TORSO: broad hunched fortress =================
  A.lathe('torso', 'primary', [
    [chH * 0.05, W * 0.34],
    [chH * 0.32, W * 0.54],
    [chH * 0.6, W * 0.62],
    [chH * 0.86, W * 0.6],
    [chH * 1.02, W * 0.46],
    [chH * 1.14, W * 0.24],
  ], { scaleX: 1.5, scaleZ: 0.72, seg: 30, r: [hunch, 0, 0] });
  // AMMO POUCH GRID: sloped backing plate + 4x3 rounded pouches + straps
  const gY = chH * 0.55, gZ = W * 0.415;
  A.plate('torso', 'accent', rhombOutline(W * 0.98, chH * 0.56, { cut: 0.16 }), 0.12 * s, {
    p: [0, gY, gZ], r: [hunch + 0.04, 0, 0], round: 0.08 });
  for (let row = 0; row < 3; row++) {
    const dy = (row - 1) * 0.4 * s;
    const py = gY + dy, pz = gZ + 0.1 * s + dy * Math.sin(hunch + 0.04);
    // strap rail behind each pouch row
    A.sharpBox('torso', 'dark', [W * 0.82, 0.07 * s, 0.06 * s], {
      p: [0, py + 0.12 * s, pz - 0.02 * s], r: [hunch, 0, 0] });
    for (let col = 0; col < 4; col++) {
      A.capsule('torso', 'primary', 0.125 * s, 0.13 * s, {
        p: [(col - 1.5) * 0.44 * s, py, pz], r: [hunch, 0, 0], s: [1, 1, 0.62] });
    }
  }
  studs('torso', [
    [-W * 0.42, gY + chH * 0.24, gZ + 0.05 * s], [W * 0.42, gY + chH * 0.24, gZ + 0.05 * s],
    [-W * 0.45, gY - chH * 0.24, gZ - 0.02 * s], [W * 0.45, gY - chH * 0.24, gZ - 0.02 * s],
  ]);
  // twin hatch plates under the pouches, hand-scrawled kill tallies
  for (const sx of [-1, 1]) {
    A.custom('torso', plateMat('primary', {
      text: sx < 0 ? 'IIII IIII' : 'IIII II', textY: 0.5, textScale: 0.14,
      color: '#2e2a24', alpha: 0.8,
    }), beveledPlate(shieldOutline(W * 0.34, 0.62 * s, { taper: 0.86 }), 0.09 * s, { round: 0.12 }), {
      p: [sx * W * 0.23, chH * 0.13, W * 0.4], r: [0.02, 0, 0] });
  }
  // flank louvers, waist pistons, coolant drums
  for (const sx of [-1, 1]) {
    A.vents('torso', 'dark', 4, W * 0.28, 0.14 * s, 0.05 * s, {
      p: [sx * W * 0.56, chH * 0.62, W * 0.28], r: [0, sx * 0.55, 0] });
    A.piston('torso', 'brass', [sx * W * 0.2, chH * -0.02, W * 0.12],
      [sx * W * 0.44, chH * 0.28, W * 0.2], 0.05 * s);
    A.capsule('torso', 'metal', 0.16 * s, 0.5 * s, { p: [sx * W * 0.56, chH * 0.28, -W * 0.28] });
  }
  // abdomen rings
  for (let i = 0; i < 2; i++) {
    A.tube('torso', 'dark', W * (0.22 - i * 0.02), W * (0.24 - i * 0.02), 0.1 * s, {
      p: [0, chH * (0.05 - i * 0.08), 0] });
  }
  // back housing under the mortar deck
  A.facet('torso', 'accent', W * 0.44, W * 0.5, W * 0.4, chH * 0.66, {
    sides: 8, scaleZ: 0.52, p: [0, chH * 0.48, -W * 0.36] });
  A.vents('torso', 'dark', 6, W * 0.62, chH * 0.26, 0.06 * s, { p: [0, chH * 0.44, -W * 0.56] });

  // ================= "HEAD": visor slit sunk into the torso =================
  // No protruding head — a wide lens strip under a brow ledge and a shallow
  // dome cap, all barely rising above the chest silhouette.
  A.taper('head', 'frame', [hs * 2.5, hs * 0.8, hs * 1.7], 0.92, 0.7, {
    p: [0, hs * 0.32, 0.35 * s] });
  A.sharpBox('head', 'dark', [hs * 2.1, hs * 0.5, hs * 0.2], { p: [0, hs * 0.34, 0.35 * s + hs * 0.82] });
  A.sharpBox('head', 'glow', [hs * 1.85, hs * 0.2, hs * 0.12], { p: [0, hs * 0.34, 0.35 * s + hs * 0.94] });
  // armored brow ledge overhanging the lens
  A.plate('head', 'primary', rhombOutline(hs * 2.7, hs * 0.72, { cut: 0.24 }), hs * 0.6, {
    p: [0, hs * 0.78, 0.35 * s + hs * 0.42], r: [-0.34, 0, 0], round: 0.15 });
  // shallow dome cap flowing back into the torso top
  A.lathe('head', 'primary', [
    [-hs * 0.15, hs * 1.42],
    [hs * 0.32, hs * 1.2],
    [hs * 0.62, hs * 0.55],
  ], { p: [0, hs * 0.66, 0.12 * s], scaleZ: 1.15, seg: 20 });
  A.vents('head', 'dark', 3, hs * 0.9, hs * 0.12, 0.05 * s, { p: [0, hs * 1.16, 0.3 * s], r: [-0.5, 0, 0] });
  A.antenna('head', 'metal', 'glowSoft', hs * 1.1, { p: [-hs * 0.9, hs * 0.9, -hs * 0.5] });

  // ================= MORTARS: twin giant tubes rising in a V =================
  addJoint(J, 'mortars', 'torso', 0, chH * 0.9, -D.torsoD * 0.42);
  const out = 0.52;   // ~30 deg outward from vertical — the signature V
  const lean = 0.1;   // slight backward lean; animator pitches when firing
  const tubeL = 2.8 * s; // ~1.6x torso height
  const dX = Math.sin(out), dYv = Math.cos(out) * Math.cos(lean), dZv = -Math.cos(out) * Math.sin(lean);
  const B = [0.5 * s, -0.05 * s, 0.05 * s]; // per-side tube base (x mirrored)
  for (const sx of [-1, 1]) {
    const bx = sx * B[0];
    const rot = [-lean, 0, -sx * out];
    const at = (f) => [bx + sx * dX * tubeL * f, B[1] + dYv * tubeL * f, B[2] + dZv * tubeL * f];
    // trunnion cross-shaft + breech block + breech cap
    A.part('mortars', 'frame', new THREE.CylinderGeometry(0.22 * s, 0.22 * s, 0.6 * s, 12), {
      p: [bx, -0.02 * s, 0.02 * s], r: [0, 0, Math.PI / 2] });
    A.facet('mortars', 'accent', 0.3 * s, 0.38 * s, 0.32 * s, 0.85 * s, {
      sides: 8, p: at(0.12), r: rot });
    A.ball('mortars', 'dark', 0.24 * s, { p: at(-0.045), seg: 12 });
    // the long tan tube, thicker at the breech
    A.tube('mortars', 'primary', 0.235 * s, 0.3 * s, tubeL * 0.92, { p: at(0.48), r: rot });
    // banded segment collars every ~20%
    for (const f of [0.24, 0.43, 0.62, 0.8]) {
      A.tube('mortars', 'dark', 0.305 * s - f * 0.05 * s, 0.305 * s - f * 0.05 * s, 0.11 * s, {
        p: at(f), r: rot });
    }
    // dark flared muzzle + amber lip
    A.tube('mortars', 'dark', 0.35 * s, 0.25 * s, 0.42 * s, { p: at(0.93), r: rot });
    A.tube('mortars', 'glowSoft', 0.215 * s, 0.215 * s, 0.05 * s, { p: at(0.985), r: rot });
    // brass recuperator piston hugging the lower tube
    const p1 = [bx - sx * 0.33 * s, B[1] - 0.02 * s, B[2] - 0.16 * s];
    A.piston('mortars', 'brass', p1,
      [p1[0] + sx * dX * 1.25 * s, p1[1] + dYv * 1.25 * s, p1[2] + dZv * 1.25 * s], 0.05 * s);
    // ammo drum slung under the breech
    A.capsule('mortars', 'accent', 0.19 * s, 0.42 * s, {
      p: [sx * 0.3 * s, -0.34 * s, -0.24 * s], r: [0, 0, Math.PI / 2] });
  }
  // cross brace tying the two tubes low in the V
  A.capsule('mortars', 'frame', 0.09 * s, 1.15 * s, {
    p: [0, B[1] + dYv * tubeL * 0.18, B[2] + dZv * tubeL * 0.18], r: [0, 0, Math.PI / 2] });
  // muzzle anchors exactly at the tube mouths (on J.mortars — pitch with it)
  anchors.muzzleR = addAnchor(J.mortars, B[0] + dX * tubeL, B[1] + dYv * tubeL, B[2] + dZv * tubeL);
  anchors.muzzleL = addAnchor(J.mortars, -B[0] - dX * tubeL, B[1] + dYv * tubeL, B[2] + dZv * tubeL);

  // ================= ARMS: drum pauldrons, drum forearms, 3-finger fists =================
  for (const side of ['L', 'R']) {
    const sx = side === 'L' ? -1 : 1;
    const sh = 'shoulder' + side, el = 'elbow' + side, ha = 'hand' + side;
    J[sh].position.x = sx * (D.shoulderW + 0.45 * s);

    A.ball(sh, 'frame', 0.34 * s, {});
    // giant drum pauldron lying on its side (axis X), capped
    A.part(sh, 'primary', cyl(0.58 * s, 0.58 * s, 0.95 * s, 18), {
      p: [sx * 0.14 * s, 0.18 * s, 0], r: [0, 0, Math.PI / 2] });
    for (const ex of [-0.42, 0.42]) {
      A.part(sh, 'dark', cyl(0.61 * s, 0.61 * s, 0.1 * s, 18), {
        p: [sx * 0.14 * s + ex * s, 0.18 * s, 0], r: [0, 0, Math.PI / 2] });
    }
    A.part(sh, 'frame', cyl(0.5 * s, 0.5 * s, 0.09 * s, 18), {
      p: [sx * (0.14 + 0.5) * s, 0.18 * s, 0], r: [0, 0, Math.PI / 2] });
    // drum face decals: COLOSSUS + 01 hub on the left, skull on the right
    if (side === 'L') {
      A.custom(sh, plateMat('accent', {
        text: 'COLOSSUS', textY: 0.24, textScale: 0.1, color: '#d3c194', alpha: 0.85,
      }), beveledPlate(circleOutline(0.46 * s), 0.05 * s, { round: 0.05 }), {
        p: [sx * 0.68 * s, 0.18 * s, 0], r: [0, sx * Math.PI / 2, 0] });
      A.custom(sh, plateMat('accent', {
        text: '01', textY: 0.52, textScale: 0.42, color: '#d3c194', alpha: 0.9,
      }), beveledPlate(circleOutline(0.28 * s), 0.05 * s, { round: 0.05 }), {
        p: [sx * 0.74 * s, 0.14 * s, 0], r: [0, sx * Math.PI / 2, 0] });
    } else {
      A.custom(sh, skullMat, beveledPlate(circleOutline(0.44 * s), 0.05 * s, { round: 0.05 }), {
        p: [sx * 0.68 * s, 0.18 * s, 0], r: [0, sx * Math.PI / 2, 0] });
    }
    // hazard chevron chin strap on the drum front
    A.custom(sh, hazardMat,
      beveledPlate(rhombOutline(0.8 * s, 0.26 * s, { cut: 0.2 }), 0.05 * s, { round: 0.15 }), {
        p: [sx * 0.14 * s, 0.02 * s, 0.56 * s], r: [0.28, 0, 0] });
    // rivet ring on the outer drum rim
    studs(sh, Array.from({ length: 8 }, (_, i) => {
      const a = (i / 8) * Math.PI * 2;
      return [sx * 0.62 * s, 0.18 * s + Math.cos(a) * 0.52 * s, Math.sin(a) * 0.52 * s];
    }));
    // layered upper arm: bulge + two armor wraps
    A.lathe(sh, 'frame', [
      [-D.upperArmLen * 0.98, 0.24 * s],
      [-D.upperArmLen * 0.55, 0.31 * s],
      [-D.upperArmLen * 0.1, 0.26 * s],
    ], { p: [sx * 0.04 * s, 0, 0], seg: 16 });
    A.tube(sh, 'primary', 0.35 * s, 0.39 * s, 0.4 * s, { p: [sx * 0.04 * s, -D.upperArmLen * 0.42, 0] });
    A.tube(sh, 'primary', 0.33 * s, 0.37 * s, 0.36 * s, { p: [sx * 0.04 * s, -D.upperArmLen * 0.74, 0] });
    // elbow drum
    A.part(el, 'metal', new THREE.CylinderGeometry(0.2 * s, 0.2 * s, 0.5 * s, 12), {
      r: [0, 0, Math.PI / 2] });
    // big faceted forearm drum + front guard + twin actuator pistons
    A.facet(el, 'primary', 0.42 * s, 0.58 * s, 0.46 * s, D.foreArmLen * 1.06, {
      sides: 8, scaleZ: 1.04, p: [0, -D.foreArmLen * 0.5, 0] });
    A.plate(el, 'accent', shieldOutline(0.6 * s, D.foreArmLen * 0.8, { taper: 0.84 }), 0.09 * s, {
      p: [0, -D.foreArmLen * 0.52, 0.52 * s], r: [0.03, 0, 0], round: 0.12 });
    A.piston(el, 'brass', [sx * 0.34 * s, -0.06 * s, -0.26 * s],
      [sx * 0.32 * s, -D.foreArmLen * 0.66, -0.32 * s], 0.055 * s);
    A.piston(el, 'metal', [-sx * 0.3 * s, -0.08 * s, -0.28 * s],
      [-sx * 0.28 * s, -D.foreArmLen * 0.56, -0.34 * s], 0.04 * s);
    A.ring(el, 'dark', 0.5 * s, 0.045 * s, { p: [0, -D.foreArmLen * 0.9, 0], r: [Math.PI / 2, 0, 0] });
    studs(el, [[0, -D.foreArmLen * 0.2, 0.56 * s], [0, -D.foreArmLen * 0.84, 0.5 * s]]);

    // GIANT three-finger fist: chunky segmented fingers + thumb
    const fw = 0.5 * s;
    A.tube(ha, 'frame', 0.36 * s, 0.42 * s, 0.32 * s, { p: [0, 0.1 * s, 0] });
    A.part(ha, 'frame', roundedBox(fw * 1.95, fw * 1.5, fw * 1.65, fw * 0.4), {
      p: [0, -fw * 0.75, fw * 0.08] });
    A.plate(ha, 'primary', rhombOutline(fw * 1.5, fw * 0.9, { cut: 0.28 }), 0.08 * s, {
      p: [0, -fw * 0.3, fw * 0.85], r: [0.3, 0, 0], round: 0.18 });
    for (const fx of [-1, 0, 1]) {
      A.part(ha, 'frame', roundedBox(fw * 0.5, fw * 0.62, fw * 0.66, fw * 0.15), {
        p: [fx * fw * 0.58, -fw * 0.98, fw * 0.85] });
      A.part(ha, 'dark', roundedBox(fw * 0.42, fw * 0.52, fw * 0.3, fw * 0.1), {
        p: [fx * fw * 0.58, -fw * 1.42, fw * 0.9] });
    }
    A.part(ha, 'frame', roundedBox(fw * 0.5, fw * 0.72, fw * 0.52, fw * 0.15), {
      p: [sx * fw * 1.05, -fw * 0.68, fw * 0.3], r: [0.35, 0, sx * 0.38] });
    A.part(ha, 'dark', roundedBox(fw * 0.38, fw * 0.36, fw * 0.28, fw * 0.1), {
      p: [sx * fw * 1.22, -fw * 1.0, fw * 0.42], r: [0.35, 0, sx * 0.38] });
  }

  // ================= LEGS: stacked slabs, knee drums, tower shins, huge feet =================
  for (const side of ['L', 'R']) {
    const sx = side === 'L' ? -1 : 1;
    const th = 'thigh' + side, kn = 'knee' + side, an = 'ankle' + side;

    A.ball(th, 'frame', 0.3 * s, {});
    A.lathe(th, 'primary', [
      [-D.thighLen * 1.0, 0.3 * s],
      [-D.thighLen * 0.55, 0.44 * s],
      [-D.thighLen * 0.08, 0.34 * s],
    ], { scaleZ: 1.06, seg: 20 });
    // stacked overlapping thigh slabs on the front
    A.plate(th, 'primary', shieldOutline(0.62 * s, D.thighLen * 0.42, { taper: 0.82 }), 0.09 * s, {
      p: [0, -D.thighLen * 0.3, 0.38 * s], r: [0.1, 0, 0], round: 0.14 });
    A.plate(th, 'accent', shieldOutline(0.56 * s, D.thighLen * 0.42, { taper: 0.78 }), 0.09 * s, {
      p: [0, -D.thighLen * 0.62, 0.38 * s], r: [0.04, 0, 0], round: 0.14 });
    A.plate(th, 'accent', rhombOutline(0.52 * s, D.thighLen * 0.6, { cut: 0.26 }), 0.07 * s, {
      p: [sx * 0.42 * s, -D.thighLen * 0.5, 0.02 * s], r: [0, sx * Math.PI / 2, 0], round: 0.12 });
    studs(th, [[0, -D.thighLen * 0.18, 0.44 * s], [0, -D.thighLen * 0.5, 0.42 * s]]);

    // knee drum + shield
    A.part(kn, 'metal', new THREE.CylinderGeometry(0.26 * s, 0.26 * s, 0.56 * s, 14), {
      r: [0, 0, Math.PI / 2] });
    A.plate(kn, 'accent', shieldOutline(0.56 * s, 0.68 * s, { taper: 0.62 }), 0.1 * s, {
      p: [0, -0.02 * s, 0.36 * s], r: [0.15, 0, 0], round: 0.14 });
    A.piston(kn, 'brass', [0, 0.14 * s, -0.3 * s], [0, -D.shinLen * 0.4, -0.36 * s], 0.055 * s);

    // wide shin tower + layered guards, hazard band at the bottom
    A.facet(kn, 'primary', 0.42 * s, 0.52 * s, 0.46 * s, D.shinLen * 1.0, {
      sides: 8, scaleZ: 1.1, p: [0, -D.shinLen * 0.5, 0] });
    A.plate(kn, 'primary', shieldOutline(0.58 * s, 0.62 * s, { taper: 0.78 }), 0.09 * s, {
      p: [0, -D.shinLen * 0.34, 0.44 * s], r: [0.05, 0, 0], round: 0.12 });
    A.plate(kn, 'accent', shieldOutline(0.62 * s, 0.62 * s, { taper: 0.75 }), 0.09 * s, {
      p: [0, -D.shinLen * 0.58, 0.42 * s], r: [0, 0, 0], round: 0.12 });
    A.custom(kn, hazardMat,
      beveledPlate(shieldOutline(0.66 * s, 0.66 * s, { taper: 0.72 }), 0.09 * s, { round: 0.12 }), {
        p: [0, -D.shinLen * 0.82, 0.4 * s], r: [-0.05, 0, 0] });
    A.plate(kn, 'primary', rhombOutline(0.5 * s, D.shinLen * 0.55, { cut: 0.26 }), 0.07 * s, {
      p: [sx * 0.5 * s, -D.shinLen * 0.5, 0], r: [0, sx * Math.PI / 2, 0], round: 0.12 });
    studs(kn, [[0, -D.shinLen * 0.22, 0.5 * s], [0, -D.shinLen * 0.46, 0.48 * s]]);

    // ankle + HUGE flat multi-toe foot (wider than the thighs)
    A.ball(an, 'frame', 0.22 * s, {});
    A.part(an, 'primary', roundedBox(1.1 * s, 0.28 * s, 1.15 * s, 0.09 * s), {
      p: [0, -0.1 * s, 0.08 * s] });
    for (const tx of [-0.42, -0.14, 0.14, 0.42]) {
      A.part(an, 'primary', roundedBox(0.25 * s, 0.26 * s, 0.55 * s, 0.07 * s), {
        p: [tx * s, -0.13 * s, 0.66 * s], r: [-0.05, tx * 0.3, 0] });
      A.part(an, 'dark', roundedBox(0.22 * s, 0.18 * s, 0.16 * s, 0.05 * s), {
        p: [tx * s * 1.06, -0.17 * s, 0.92 * s], r: [-0.05, tx * 0.3, 0] });
    }
    A.taper(an, 'frame', [0.8 * s, 0.26 * s, 0.4 * s], 0.8, 0.65, { p: [0, -0.1 * s, -0.42 * s] });
    A.sharpBox(an, 'dark', [1.08 * s, 0.12 * s, 1.55 * s], { p: [0, -0.26 * s, 0.12 * s] });
    studs(an, [
      [-0.44 * s, 0.02 * s, 0.45 * s], [0.44 * s, 0.02 * s, 0.45 * s],
      [-0.44 * s, 0.02 * s, -0.2 * s], [0.44 * s, 0.02 * s, -0.2 * s]]);
  }

  anchors.core = addAnchor(J.torso, 0, chH * 0.55, W * 0.45);
}
