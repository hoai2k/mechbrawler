// Auto-split from designs.js — one mech per file. Shared sculpting
// vocabulary lives in ../parts.js; see docs/IMAGE_TO_MECH.md.
import * as THREE from 'three';
import { cyl, taperBox, beveledPlate, shieldOutline, rhombOutline, roundedBox, bulgeLathe, facetBulge } from '../parts.js';
import { decalTexture, skinMaterial } from '../../core/pbrtex.js';
import { baseFrame, standardArm, standardLeg, raptorLeg, addAnchor } from '../factory.js';
import { addJoint } from './common.js';


// ============================================================
// 4. VIPER — rebuilt to the canonical concept image.
//    Eva-01 energy: everything tapers to a point. Sharp arrowhead
//    helm with a green V-visor and two tall swept horn-blades,
//    layered pointed pauldrons sweeping up-and-out ("07"/"02"),
//    angular purple plates over a black under-suit with green glow
//    slits, pinched segmented black waist, twin green energy
//    daggers hanging under the forearms (bladeL/R flare joints),
//    long digitigrade legs with knee spikes and steel talons.
// ============================================================
export function viper(A, D, J, anchors, def) {
  const s = D.scale;
  const W = D.torsoW;
  const chH = D.torsoH;
  const hs = D.headSize;
  const ua = D.upperArmLen, fa = D.foreArmLen;

  const plateMat = (decal) => {
    const tex = decalTexture({ seed: def.seed + 5, ...def.skin.primary }, decal);
    return new THREE.MeshStandardMaterial({
      map: tex.map, normalMap: tex.normalMap,
      roughnessMap: tex.rmMap, metalnessMap: tex.rmMap,
      roughness: 1, metalness: 1,
    });
  };
  // roof-slab rotation for pauldron blade-plates: flatten (normal up) then
  // roll around Z so the pointed outer edge sweeps UP-and-out.
  const slabRot = (tilt) => {
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), tilt)
      .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2));
    const e = new THREE.Euler().setFromQuaternion(q);
    return [e.x, e.y, e.z];
  };

  // ================= WAIST / PELVIS: sharp black pinch =================
  // pinched under-suit column
  A.lathe('hips', 'dark', [[-0.12 * s, W * 0.22], [0.24 * s, W * 0.14], [0.55 * s, W * 0.2]], {
    scaleX: 1.18, seg: 18 });
  // segmented abdomen facets bridging down into the waist
  for (let i = 0; i < 3; i++) {
    A.facet('hips', 'frame', W * (0.155 - i * 0.008), W * (0.185 - i * 0.008), W * (0.15 - i * 0.008),
      0.1 * s, { sides: 6, scaleZ: 0.82, p: [0, (0.06 + i * 0.15) * s, 0] });
  }
  // hip flare: slim chamfered hex block
  A.facet('hips', 'primary', W * 0.26, W * 0.34, W * 0.22, 0.72 * s, {
    sides: 6, scaleZ: 0.75, p: [0, -0.38 * s, 0] });
  // narrow front skirt fang + thin green trace
  A.plate('hips', 'accent', shieldOutline(W * 0.3, 0.82 * s, { taper: 0.45 }), 0.07 * s, {
    p: [0, -0.52 * s, W * 0.25], r: [0.16, 0, 0], round: 0.1 });
  A.sharpBox('hips', 'glowSoft', [0.026 * s, 0.34 * s, 0.024 * s], {
    p: [0, -0.58 * s, W * 0.3], r: [0.16, 0, 0] });
  // swept pointed side skirt blades
  for (const sx of [-1, 1]) {
    A.plate('hips', 'primary', rhombOutline(0.34 * s, 0.74 * s, { cut: 0.45 }), 0.055 * s, {
      p: [sx * W * 0.34, -0.44 * s, 0], r: [0.05, sx * Math.PI / 2, sx * 0.22], round: 0.1 });
  }
  // rear vent block
  A.facet('hips', 'dark', W * 0.16, W * 0.2, W * 0.13, 0.4 * s, {
    sides: 6, scaleZ: 0.7, p: [0, -0.45 * s, -W * 0.2] });

  // ================= TORSO: purple plates over a black under-suit ==========
  // black under-suit core
  A.lathe('torso', 'accent', [
    [chH * 0.06, W * 0.26],
    [chH * 0.4, W * 0.43],
    [chH * 0.72, W * 0.49],
    [chH * 0.98, W * 0.41],
    [chH * 1.1, W * 0.18],
  ], { scaleX: 1.14, scaleZ: 0.64, seg: 24 });
  // segmented abdomen facets (stacked, tapering into the waist pinch)
  for (let i = 0; i < 3; i++) {
    A.facet('torso', 'dark', W * (0.2 - i * 0.018), W * (0.23 - i * 0.018), W * (0.185 - i * 0.018),
      0.1 * s, { sides: 6, scaleZ: 0.76, p: [0, chH * (0.12 - i * 0.09), 0] });
  }
  // angular layered pec plates, angled like a V, outer edges swept back
  for (const sx of [-1, 1]) {
    A.plate('torso', 'primary', rhombOutline(W * 0.6, chH * 0.34, { cut: 0.42 }), 0.075 * s, {
      p: [sx * W * 0.21, chH * 0.82, W * 0.24], r: [-0.16, sx * 0.24, sx * 0.2], round: 0.08 });
    // green glow slit riding the plate's lower edge
    A.sharpBox('torso', 'glowSoft', [W * 0.3, 0.03 * s, 0.03 * s], {
      p: [sx * W * 0.2, chH * 0.65, W * 0.27], r: [0, sx * 0.2, sx * 0.16] });
    // second armor layer under the pecs
    A.plate('torso', 'primary', rhombOutline(W * 0.42, chH * 0.24, { cut: 0.42 }), 0.06 * s, {
      p: [sx * W * 0.24, chH * 0.55, W * 0.245], r: [-0.04, sx * 0.3, sx * 0.12], round: 0.08 });
  }
  // vertical center glow seam between the plate halves
  A.sharpBox('torso', 'glowSoft', [0.026 * s, chH * 0.3, 0.03 * s], {
    p: [0, chH * 0.72, W * 0.3] });
  // center chest plate + VIPER nameplate w/ snake-fang emblem
  A.plate('torso', 'primary', shieldOutline(W * 0.5, chH * 0.42, { taper: 0.48 }), 0.07 * s, {
    p: [0, chH * 0.4, W * 0.26], r: [-0.05, 0, 0], round: 0.1 });
  A.custom('torso', plateMat({
    text: 'VIPER', textY: 0.64, textScale: 0.15, color: '#a6f07c', alpha: 0.85,
    emblem: true, emblemY: 0.3, emblemScale: 0.12,
  }), beveledPlate(shieldOutline(W * 0.36, chH * 0.34, { taper: 0.52 }), 0.06 * s, { round: 0.1 }), {
    p: [0, chH * 0.42, W * 0.32], r: [-0.05, 0, 0] });
  // collar ring
  A.tube('torso', 'frame', W * 0.13, W * 0.16, 0.14 * s, { p: [0, chH * 1.03, 0] });
  // dorsal fin row down the spine (swept back, pointed)
  for (let i = 0; i < 3; i++) {
    A.blade('torso', 'accent', (0.56 - i * 0.09) * s, 0.18 * s, 0.04 * s, {
      p: [0, chH * (0.96 - i * 0.24), -W * (0.34 - i * 0.02)],
      r: [-0.85, 0, 0], taper: 0.08 });
  }
  A.blade('torso', 'glowSoft', 0.38 * s, 0.06 * s, 0.03 * s, {
    p: [0, chH * 1.0, -W * 0.37], r: [-0.85, 0, 0], taper: 0.08 });
  // compact back housing + vents
  A.facet('torso', 'accent', W * 0.28, W * 0.34, W * 0.24, chH * 0.48, {
    sides: 6, scaleZ: 0.55, p: [0, chH * 0.52, -W * 0.3] });
  A.vents('torso', 'dark', 4, W * 0.38, chH * 0.18, 0.05 * s, {
    p: [0, chH * 0.5, -W * 0.47] });
  // brass waist pistons
  for (const sx of [-1, 1]) {
    A.piston('torso', 'brass', [sx * W * 0.13, chH * -0.02, -W * 0.06],
      [sx * W * 0.28, chH * 0.32, -W * 0.1], 0.035 * s);
  }

  // ================= HEAD: sharp arrowhead helm =================
  const hy = hs * 1.15;
  A.tube('head', 'frame', hs * 0.3, hs * 0.4, hs * 1.0, { p: [0, hy * 0.3, 0] });
  // faceted cranium, tapering to a crown ridge
  A.facet('head', 'primary', hs * 0.8, hs * 0.97, hs * 0.22, hs * 1.5, {
    sides: 6, scaleZ: 1.3, p: [0, hy + hs * 0.7, -hs * 0.04] });
  // chin wedge: hard taper down to a point
  A.taper('head', 'primary', [hs * 1.1, hs * 1.0, hs * 1.4], 0.08, 0.24, {
    p: [0, hy + hs * 0.06, hs * 0.2], r: [Math.PI, 0, 0] });
  // green V-visor: two angled strips meeting forward in a low point
  for (const sx of [-1, 1]) {
    A.sharpBox('head', 'glow', [hs * 0.68, hs * 0.14, 0.055 * s], {
      p: [sx * hs * 0.26, hy + hs * 0.58, hs * 1.06], r: [0.05, sx * 0.5, sx * 0.2] });
  }
  // angled brow plates hooding the visor
  for (const sx of [-1, 1]) {
    A.plate('head', 'frame', rhombOutline(hs * 0.95, hs * 0.4, { cut: 0.35 }), hs * 0.22, {
      p: [sx * hs * 0.28, hy + hs * 1.02, hs * 0.92], r: [-0.42, sx * 0.3, sx * 0.14], round: 0.15 });
  }
  // chin fangs
  for (const sx of [-1, 1]) {
    A.spike('head', 'metal', 0.03 * s, 0.18 * s, {
      p: [sx * hs * 0.24, hy - hs * 0.2, hs * 0.62], r: [Math.PI - 0.2, 0, 0], seg: 5 });
  }
  // TWO TALL horn-blades rising off the crown, swept back + flared out
  const hornRot = (sx, sweep, flare) => {
    const q = new THREE.Quaternion()
      .setFromAxisAngle(new THREE.Vector3(0, 0, 1), -sx * flare)
      .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), sweep))
      .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2));
    const e = new THREE.Euler().setFromQuaternion(q);
    return [e.x, e.y, e.z];
  };
  for (const sx of [-1, 1]) {
    A.blade('head', 'primary', hs * 2.7, hs * 0.6, 0.085 * s, {
      p: [sx * hs * 0.36, hy + hs * 1.9, -hs * 0.2], r: hornRot(sx, -0.3, 0.12), taper: 0.02 });
    A.blade('head', 'accent', hs * 1.9, hs * 0.28, 0.1 * s, {
      p: [sx * hs * 0.36, hy + hs * 1.5, -hs * 0.04], r: hornRot(sx, -0.3, 0.12), taper: 0.05 });
  }
  // two shorter side spikes, flared out
  for (const sx of [-1, 1]) {
    A.spike('head', 'dark', 0.045 * s, hs * 1.3, {
      p: [sx * hs * 0.66, hy + hs * 0.9, -hs * 0.05], r: [-0.15, 0, -sx * 0.6], seg: 5 });
  }

  // ================= ARMS: slim, dagger-bearing =================
  for (const side of ['L', 'R']) {
    const sx = side === 'L' ? -1 : 1;
    const sh = 'shoulder' + side, el = 'elbow' + side, ha = 'hand' + side;

    A.ball(sh, 'frame', 0.19 * s, {});
    // layered POINTED pauldron: dark base + stacked purple blade-plates
    A.plate(sh, 'dark', rhombOutline(1.06 * s, 0.62 * s, { cut: 0.42 }), 0.05 * s, {
      p: [sx * 0.1 * s, 0.13 * s, 0], r: slabRot(sx * 0.4), round: 0.06 });
    for (let i = 0; i < 3; i++) {
      A.plate(sh, 'primary', rhombOutline((0.98 - i * 0.17) * s, (0.54 - i * 0.07) * s, { cut: 0.42 }),
        0.055 * s, {
          p: [sx * (0.14 + i * 0.09) * s, (0.2 + i * 0.13) * s, 0],
          r: slabRot(sx * (0.46 + i * 0.09)), round: 0.06 });
    }
    // unit decal riding the top plate: 07 left / 02 right
    A.custom(sh, plateMat({
      text: side === 'L' ? '07' : '02', textY: 0.56, textScale: 0.34, color: '#a6f07c', alpha: 0.85,
    }), beveledPlate(rhombOutline(0.46 * s, 0.32 * s, { cut: 0.35 }), 0.035 * s, { round: 0.1 }), {
      p: [sx * 0.34 * s, 0.48 * s, 0], r: slabRot(sx * 0.64) });
    // slim upper arm bulge + accent sliver
    A.lathe(sh, 'frame', [
      [-ua * 0.98, 0.11 * s],
      [-ua * 0.5, 0.165 * s],
      [-ua * 0.1, 0.13 * s],
    ], { seg: 12 });
    A.plate(sh, 'accent', rhombOutline(0.2 * s, ua * 0.5, { cut: 0.3 }), 0.045 * s, {
      p: [sx * 0.16 * s, -ua * 0.5, 0], r: [0, sx * Math.PI / 2, 0], round: 0.15 });
    // elbow ring
    A.part(el, 'metal', cyl(0.12 * s, 0.12 * s, 0.26 * s, 10), { r: [0, 0, Math.PI / 2] });
    // forearm: slim six-sided black housing with a green seam
    A.facet(el, 'accent', 0.15 * s, 0.21 * s, 0.16 * s, fa * 0.95, {
      sides: 6, scaleZ: 1.15, p: [0, -fa * 0.5, 0] });
    A.sharpBox(el, 'glowSoft', [0.026 * s, fa * 0.45, 0.026 * s], {
      p: [sx * 0.19 * s, -fa * 0.5, 0.045 * s] });
    A.piston(el, 'brass', [sx * -0.09 * s, -0.08 * s, -0.13 * s],
      [sx * -0.11 * s, -fa * 0.58, -0.17 * s], 0.03 * s);
    // hand: black claw, thin finger spikes
    A.facet(ha, 'dark', 0.1 * s, 0.14 * s, 0.09 * s, 0.3 * s, { sides: 6, p: [0, -0.08 * s, 0] });
    for (let i = -1; i <= 1; i++) {
      A.spike(ha, 'dark', 0.03 * s, 0.24 * s, {
        p: [i * 0.075 * s, -0.26 * s, 0.05 * s], r: [Math.PI - 0.25, 0, i * 0.12], seg: 5 });
    }
    A.spike(ha, 'dark', 0.028 * s, 0.18 * s, {
      p: [sx * 0.1 * s, -0.2 * s, 0.02 * s], r: [Math.PI - 0.2, 0, sx * 0.4], seg: 5 });

    // ===== energy dagger under the forearm, on its flare joint =====
    // (animator lerps rotation.x: 0.35 at rest — hanging — and 0 in combat)
    addJoint(J, 'blade' + side, ha, 0, -0.02 * s, 0.12 * s);
    J['blade' + side].rotation.z = sx * 0.08; // slight outward cant
    const bj = 'blade' + side;
    const ba = 0.9; // blade axis: this far forward of straight down
    const dy = -Math.cos(ba), dz = Math.sin(ba);
    const bp = (t, ox = 0, oy = 0, oz = 0) => [ox, -0.0 * s + dy * t * s + oy, 0.0 * s + dz * t * s + oz];
    // black spine holder hugging the wrist line
    A.facet(bj, 'dark', 0.07 * s, 0.105 * s, 0.055 * s, 0.55 * s, {
      sides: 6, p: bp(0.16), r: [Math.PI - ba, 0, 0] });
    A.ring(bj, 'brass', 0.085 * s, 0.02 * s, { p: bp(0.4), r: [Math.PI / 2 - ba, 0, 0] });
    // green emitter gem
    A.ball(bj, 'glow', 0.05 * s, { p: bp(0.44), seg: 10 });
    // long tapered green energy blade
    A.blade(bj, 'glow', 1.95 * s, 0.2 * s, 0.03 * s, {
      p: bp(1.42), r: [Math.PI - ba, Math.PI / 2, 0], taper: 0.04 });
    // thin dark spine along the back edge
    A.blade(bj, 'dark', 1.5 * s, 0.075 * s, 0.045 * s, {
      p: bp(1.1, 0, -dz * 0.095 * s, dy * 0.095 * s), r: [Math.PI - ba, Math.PI / 2, 0], taper: 0.06 });
  }

  // ================= LEGS: digitigrade raptor =================
  for (const side of ['L', 'R']) {
    const sx = side === 'L' ? -1 : 1;
    const th = 'thigh' + side, kn = 'knee' + side, an = 'ankle' + side;
    const tl = D.thighLen, sl = D.shinLen;

    // bulged purple thigh (rest pose angles it forward)
    A.ball(th, 'frame', 0.2 * s, {});
    A.lathe(th, 'primary', [
      [-tl * 1.0, 0.13 * s],
      [-tl * 0.58, 0.235 * s],
      [-tl * 0.12, 0.18 * s],
    ], { scaleZ: 1.28, seg: 18, p: [0, 0, 0.03 * s] });
    // "07" decal plate on the outer thigh
    A.custom(th, plateMat({ text: '07', textY: 0.52, textScale: 0.34, color: '#a6f07c', alpha: 0.8 }),
      beveledPlate(rhombOutline(0.3 * s, tl * 0.42, { cut: 0.3 }), 0.05 * s, { round: 0.12 }), {
        p: [sx * 0.24 * s, -tl * 0.45, 0.04 * s], r: [0, sx * Math.PI / 2, 0] });
    A.piston(th, 'brass', [0, -tl * 0.18, -0.15 * s], [0, -tl * 0.85, -0.19 * s], 0.032 * s);

    // knee: joint ball + pointed knee spikes
    A.ball(kn, 'metal', 0.12 * s, {});
    A.spike(kn, 'metal', 0.045 * s, 0.42 * s, {
      p: [0, 0.02 * s, 0.16 * s], r: [Math.PI / 2 - 0.35, 0, 0], seg: 5 });
    A.spike(kn, 'dark', 0.035 * s, 0.28 * s, {
      p: [0, -0.14 * s, 0.15 * s], r: [Math.PI / 2 - 0.12, 0, 0], seg: 5 });

    // slim black calf + green glow slits + rear fin
    A.lathe(kn, 'accent', [
      [-sl * 1.0, 0.085 * s],
      [-sl * 0.66, 0.14 * s],
      [-sl * 0.32, 0.165 * s],
      [-sl * 0.06, 0.11 * s],
    ], { scaleZ: 1.25, seg: 16 });
    for (const gx of [-1, 1]) {
      A.sharpBox(kn, 'glowSoft', [0.024 * s, sl * 0.36, 0.024 * s], {
        p: [gx * 0.12 * s, -sl * 0.5, 0.1 * s] });
    }
    A.blade(kn, 'accent', 0.66 * s, 0.15 * s, 0.035 * s, {
      p: [0, -sl * 0.5, -0.16 * s], r: [Math.PI - 0.3, 0, 0], taper: 0.1 });
    A.plate(kn, 'dark', shieldOutline(0.18 * s, sl * 0.46, { taper: 0.6 }), 0.045 * s, {
      p: [0, -sl * 0.56, 0.14 * s], r: [0.04, 0, 0], round: 0.15 });

    // clawed raptor foot: sole pad + three steel talons + rear dew claw
    A.ball(an, 'frame', 0.12 * s, {});
    A.taper(an, 'frame', [0.24 * s, 0.24 * s, 0.44 * s], 0.7, 0.5, { p: [0, -0.2 * s, 0.08 * s] });
    for (let i = -1; i <= 1; i++) {
      A.spike(an, 'metal', 0.05 * s, 0.5 * s, {
        p: [i * 0.1 * s, -0.2 * s, 0.3 * s], r: [2.0, 0, i * 0.25], seg: 6 });
    }
    A.spike(an, 'metal', 0.042 * s, 0.32 * s, {
      p: [0, -0.16 * s, -0.16 * s], r: [-2.1, 0, 0], seg: 6 });
  }

  anchors.muzzleR = addAnchor(J.handR, 0, -0.15 * s, 0.45 * s);
  // blade tips (dagger axis: 0.9 rad forward of straight down)
  anchors.bladeL = addAnchor(J.bladeL, 0, -Math.cos(0.9) * 2.4 * s, Math.sin(0.9) * 2.4 * s);
  anchors.bladeR = addAnchor(J.bladeR, 0, -Math.cos(0.9) * 2.4 * s, Math.sin(0.9) * 2.4 * s);
}
