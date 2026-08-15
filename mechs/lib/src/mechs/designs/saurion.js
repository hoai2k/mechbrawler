// SAURION — unit MX-7, the apex prototype, matched to
// docs/canonical/mech_saurion.png: gunmetal-black Utahraptor frame with a
// long armored raptor skull (layered snout plates, exposed chrome grin,
// red eye each side under an angry brow), a mohawk crest of robotic blade-
// feathers running from the crown down the neck, a short mane over the
// shoulders, wing-fan feather rows on both forearms, a body-length tail
// carrying a DOUBLE row of blade-feathers to its tip, huge raised chrome
// sickle toe-claws, red core strip + seam glows, white corp decals.
import * as THREE from 'three';
import { beveledPlate, shieldOutline, rhombOutline } from '../parts.js';
import { decalTexture } from '../../core/pbrtex.js';
import { baseFrame, standardArm, addAnchor } from '../factory.js';
import { addJoint } from './common.js';

export function saurion(A, D, J, anchors, def) {
  const s = D.scale;
  const W = D.torsoW;
  const chH = D.torsoH;
  const hs = D.headSize;
  const ua = D.upperArmLen, fa = D.foreArmLen;

  const plateMat = (decal) => {
    const tex = decalTexture({ seed: def.seed + 3, ...def.skin.primary }, decal);
    return new THREE.MeshStandardMaterial({
      map: tex.map, normalMap: tex.normalMap,
      roughnessMap: tex.rmMap, metalnessMap: tex.rmMap,
      roughness: 1, metalness: 1,
    });
  };

  // One robotic blade-feather — the signature vocabulary, reused everywhere.
  // Blades are center-origin with the tip along local +Y, so offset the
  // center along the rotated axis to put the feather's ROOT at p.
  const _eu = new THREE.Euler();
  const _dir = new THREE.Vector3();
  const feather = (joint, L, wide, p, r, taper = 0.08, mat = 'frame') => {
    _dir.set(0, 1, 0).applyEuler(_eu.set(r[0], r[1], r[2]));
    A.blade(joint, mat, L, wide, 0.032 * s, {
      p: [p[0] + _dir.x * L * 0.38, p[1] + _dir.y * L * 0.38, p[2] + _dir.z * L * 0.38],
      r, taper });
  };

  // ================= FRAME / CHEST =================
  baseFrame(A, D);
  // hunched predatory chest: angular layered plates pushed forward
  A.taper('torso', 'primary', [W * 1.05, chH * 0.82, W * 0.74], 0.68, 0.78, {
    p: [0, chH * 0.5, W * 0.1], r: [0.26, 0, 0] });
  // pec slabs each side of the sternum
  for (const sx of [-1, 1]) {
    A.plate('torso', 'primary', rhombOutline(W * 0.42, chH * 0.42, { cut: 0.3 }), 0.08 * s, {
      p: [sx * W * 0.26, chH * 0.62, W * 0.34], r: [-0.34, sx * 0.28, sx * 0.42], round: 0.12 });
    A.plate('torso', 'accent', rhombOutline(W * 0.34, chH * 0.3, { cut: 0.3 }), 0.06 * s, {
      p: [sx * W * 0.22, chH * 0.4, W * 0.37], r: [-0.2, sx * 0.24, sx * 0.36], round: 0.12 });
    // rib glow seams between the plates
    A.sharpBox('torso', 'glow', [0.035 * s, chH * 0.22, 0.04 * s], {
      p: [sx * W * 0.15, chH * 0.52, W * 0.4], r: [0.24, 0, sx * 0.3] });
    A.vents('torso', 'dark', 3, W * 0.2, 0.07 * s, 0.04 * s, {
      p: [sx * W * 0.35, chH * 0.28, W * 0.3], r: [0.3, 0, 0] });
  }
  // abdomen: dark segmented under-suit down to the pelvis
  for (let i = 0; i < 3; i++) {
    A.tube('torso', 'dark', W * (0.24 - i * 0.02), W * (0.27 - i * 0.02), 0.09 * s, {
      p: [0, chH * (0.12 - i * 0.1), W * 0.06], r: [0.2, 0, 0] });
  }
  // RED core strip down the sternum + small glow pods
  A.sharpBox('torso', 'glow', [0.09 * s, chH * 0.4, 0.05 * s], {
    p: [0, chH * 0.6, W * 0.43], r: [0.3, 0, 0] });
  A.sharpBox('torso', 'glowSoft', [0.16 * s, chH * 0.1, 0.045 * s], {
    p: [0, chH * 0.28, W * 0.42], r: [0.18, 0, 0] });
  // corp decal: skull-chevron emblem + SAURION nameplate on the chest
  A.custom('torso', plateMat({ text: 'SAURION', textScale: 0.14, textY: 0.66, emblem: true, color: '#e6e8ea' }),
    beveledPlate(shieldOutline(W * 0.42, chH * 0.46, { taper: 0.62 }), 0.05 * s, { round: 0.08 }), {
      p: [0, chH * 0.42, W * 0.45], r: [0.3, 0, 0] });
  // spine hump plate behind the neck root
  A.taper('torso', 'primary', [W * 0.72, chH * 0.36, W * 0.62], 0.66, 0.66, {
    p: [0, chH * 0.96, -W * 0.1], r: [-0.32, 0, 0] });

  // ================= NECK =================
  // arched dark neck segments pushing the head up-forward, raptor-style
  for (let i = 0; i < 5; i++) {
    A.tube('torso', i % 2 ? 'dark' : 'frame', (0.25 - i * 0.02) * s, (0.28 - i * 0.02) * s, 0.36 * s, {
      p: [0, chH * (0.94 + i * 0.08), W * (0.06 + i * 0.15)], r: [1.05 - i * 0.08, 0, 0] });
  }
  // crest feathers continuing down the BACK of the neck onto the hump
  for (let i = 0; i < 6; i++) {
    const t = i / 5;
    feather('torso', (1.15 - t * 0.3) * s, (0.2 - t * 0.04) * s,
      [0, chH * (1.14 - t * 0.2), W * (0.1 - t * 0.2)],
      [-0.95 - t * 0.4, 0, 0], 0.06);
  }

  // ================= SHOULDER MANE + "77" PAULDRONS =================
  // short mane: rows of blade-feathers radiating up-back over the shoulders
  for (let i = 0; i < 7; i++) {
    const a = (i / 6 - 0.5) * Math.PI * 0.95;
    feather('torso', (1.15 - Math.abs(a) * 0.3) * s, 0.2 * s,
      [Math.sin(a) * W * 0.42, chH * 0.9, (-Math.cos(a) * 0.36 + 0.02) * W],
      [-0.8 - Math.abs(a) * 0.2, 0, -a * 0.7], 0.06);
  }
  for (let i = 0; i < 6; i++) {
    const a = (i / 5 - 0.5) * Math.PI * 0.85;
    feather('torso', (0.85 - Math.abs(a) * 0.22) * s, 0.17 * s,
      [Math.sin(a) * W * 0.34, chH * 0.96, (-Math.cos(a) * 0.28 + 0.02) * W],
      [-1.0 - Math.abs(a) * 0.18, 0, -a * 0.66], 0.1);
  }
  for (const side of ['L', 'R']) {
    const sx = side === 'L' ? -1 : 1;
    const sh = 'shoulder' + side;
    // compact angular pauldron cap
    A.taper(sh, 'primary', [0.5 * s, 0.3 * s, 0.52 * s], 0.7, 0.8, {
      p: [sx * 0.06 * s, 0.16 * s, 0], r: [0, 0, sx * 0.22] });
    // white "77" unit decal on the outer face
    A.custom(sh, plateMat({ text: '77', textY: 0.52, textScale: 0.4, color: '#e6e8ea', alpha: 0.88 }),
      beveledPlate(rhombOutline(0.34 * s, 0.3 * s, { cut: 0.3 }), 0.05 * s, { round: 0.15 }), {
        p: [sx * 0.27 * s, 0.1 * s, 0.02 * s], r: [0, sx * Math.PI / 2, 0] });
    // feather sprays spilling off the back of each shoulder
    for (let k = 0; k < 3; k++) {
      feather(sh, (0.75 - k * 0.14) * s, 0.15 * s,
        [sx * 0.14 * s, 0.1 * s - k * 0.08 * s, -0.16 * s],
        [-0.7 - k * 0.3, 0, sx * (0.8 + k * 0.25)], 0.08);
    }
  }

  // ================= RAPTOR HEAD =================
  const hy = 0.1 * s, hz = 0.72 * s;  // skull root, thrust forward of the joint
  const hb = hs * 1.42;               // skull unit — big enough to read
  // cranium: angular wedge with temple plates
  A.taper('head', 'primary', [hb * 1.35, hb * 1.1, hb * 1.5], 0.62, 0.8, {
    p: [0, hy + hb * 0.1, hz], r: [0.08, 0, 0] });
  for (const sx of [-1, 1]) {
    A.plate('head', 'primary', rhombOutline(hb * 0.9, hb * 0.6, { cut: 0.3 }), hb * 0.1, {
      p: [sx * hb * 0.56, hy + hb * 0.2, hz + hb * 0.05], r: [0, sx * (Math.PI / 2 - 0.16), -sx * 0.18], round: 0.15 });
  }
  // LONG armored snout: layered plates shingled toward the tip
  A.taper('head', 'primary', [hb * 0.88, hb * 0.62, hb * 2.3], 0.55, 0.62, {
    p: [0, hy - hb * 0.02, hz + hb * 1.65], r: [0.05, 0, 0] });
  A.plate('head', 'primary', rhombOutline(hb * 0.6, hb * 1.0, { cut: 0.3 }), hb * 0.1, {
    p: [0, hy + hb * 0.26, hz + hb * 1.2], r: [-Math.PI / 2 + 0.1, 0, 0], round: 0.18 });
  A.plate('head', 'accent', rhombOutline(hb * 0.44, hb * 0.8, { cut: 0.3 }), hb * 0.08, {
    p: [0, hy + hb * 0.16, hz + hb * 2.0], r: [-Math.PI / 2 + 0.16, 0, 0], round: 0.18 });
  // snout tip + nostril vents
  A.taper('head', 'accent', [hb * 0.5, hb * 0.42, hb * 0.5], 0.6, 0.5, {
    p: [0, hy - hb * 0.08, hz + hb * 2.72], r: [0.14, 0, 0] });
  A.vents('head', 'dark', 2, hb * 0.26, hb * 0.07, 0.03 * s, {
    p: [0, hy + hb * 0.06, hz + hb * 2.62], r: [-0.5, 0, 0] });
  // red accent slits along the snout sides (canonical has red snout lights)
  for (const sx of [-1, 1]) {
    A.sharpBox('head', 'glowSoft', [0.03 * s, hb * 0.07, hb * 0.55], {
      p: [sx * hb * 0.36, hy + hb * 0.02, hz + hb * 1.5], r: [0, 0, 0] });
  }
  // dark upper jaw rim the teeth hang from — the exposed grin line
  A.taper('head', 'dark', [hb * 0.78, hb * 0.22, hb * 2.1], 0.55, 0.65, {
    p: [0, hy - hb * 0.32, hz + hb * 1.55] });
  // OPEN lower jaw, swung down in a snarl
  A.taper('head', 'accent', [hb * 0.64, hb * 0.34, hb * 1.85], 0.5, 0.55, {
    p: [0, hy - hb * 0.72, hz + hb * 1.28], r: [0.34, 0, 0] });
  A.plate('head', 'dark', rhombOutline(hb * 0.4, hb * 1.2, { cut: 0.3 }), hb * 0.07, {
    p: [0, hy - hb * 0.86, hz + hb * 1.3], r: [-Math.PI / 2 + 0.34, 0, 0], round: 0.2 });
  // chrome teeth — two full rows each side, upper hanging / lower rising
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 6; i++) {
      const f = i / 5;
      A.spike('head', 'metal', (0.036 - f * 0.01) * s, (0.15 - f * 0.045) * s, {
        p: [sx * hb * (0.34 - f * 0.14), hy - hb * 0.4, hz + hb * (0.85 + f * 1.6)],
        r: [Math.PI - 0.06, 0, 0], seg: 5 });
    }
    for (let i = 0; i < 5; i++) {
      const f = i / 4;
      A.spike('head', 'metal', (0.03 - f * 0.008) * s, (0.12 - f * 0.035) * s, {
        p: [sx * hb * (0.26 - f * 0.1), hy - hb * (0.68 - f * 0.24), hz + hb * (0.85 + f * 1.35)],
        r: [0.32, 0, 0], seg: 5 });
    }
    // RED eye in a dark socket under an angry brow blade
    A.ball('head', 'dark', 0.1 * s, { p: [sx * hb * 0.52, hy + hb * 0.1, hz + hb * 0.62], seg: 10 });
    A.ball('head', 'glow', 0.065 * s, { p: [sx * hb * 0.56, hy + hb * 0.1, hz + hb * 0.68] });
    A.blade('head', 'primary', hb * 0.85, hb * 0.32, 0.055 * s, {
      p: [sx * hb * 0.5, hy + hb * 0.34, hz + hb * 0.85], r: [Math.PI / 2 + 0.28, 0, sx * 0.16], taper: 0.3 });
    // cheek guard plate
    A.plate('head', 'accent', rhombOutline(hb * 0.5, hb * 0.36, { cut: 0.3 }), hb * 0.07, {
      p: [sx * hb * 0.42, hy - hb * 0.12, hz + hb * 0.55], r: [0, sx * (Math.PI / 2 - 0.2), 0], round: 0.2 });
  }
  // MOHAWK CREST: dense staggered rows of wide blade-feathers from the
  // crown sweeping back down the neck, plus flanking quill rows
  for (let i = 0; i < 8; i++) {
    const t = i / 7;
    feather('head', (1.5 - t * 0.55) * s, (0.26 - t * 0.06) * s,
      [0, hy + hb * (0.58 - t * 1.0), hz + hb * (0.35 - t * 1.7)],
      [-0.55 - t * 0.9, 0, 0], 0.04);
  }
  for (let i = 0; i < 7; i++) {
    const t = i / 6;
    feather('head', (1.1 - t * 0.4) * s, (0.19 - t * 0.04) * s,
      [0, hy + hb * (0.52 - t * 0.95), hz + hb * (0.55 - t * 1.7)],
      [-0.78 - t * 0.85, 0, 0], 0.1, 'dark');
  }
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 5; i++) {
      const t = i / 4;
      feather('head', (1.0 - t * 0.35) * s, 0.16 * s,
        [sx * hb * 0.32, hy + hb * (0.44 - t * 0.9), hz + hb * (0.3 - t * 1.5)],
        [-0.62 - t * 0.75, 0, -sx * (0.4 + t * 0.15)], 0.08);
    }
  }

  // ================= ARMS: CLAWS + WING-FAN FEATHER ROWS =================
  for (const side of ['L', 'R']) {
    const sx = side === 'L' ? -1 : 1;
    const el = 'elbow' + side, ha = 'hand' + side;
    standardArm(A, D, side, { fist: false, bulk: 0.82 });
    // dark knuckle block + three long chrome claws per hand
    A.taper(ha, 'dark', [0.26 * s, 0.24 * s, 0.24 * s], 0.7, 0.8, { p: [0, -0.1 * s, 0.04 * s] });
    for (let i = -1; i <= 1; i++) {
      A.sharpBox(ha, 'dark', [0.06 * s, 0.14 * s, 0.06 * s], {
        p: [i * 0.09 * s, -0.22 * s, 0.08 * s], r: [-0.3, 0, i * 0.08] });
      A.spike(ha, 'metal', 0.042 * s, 0.62 * s, {
        p: [i * 0.1 * s, -0.46 * s, 0.16 * s], r: [Math.PI - 0.32, 0, i * 0.12], seg: 6 });
    }
    // WING FAN: feather row down the back edge of the forearm, longest at
    // the wrist — sweeping down and back like a folded wing
    for (let i = 0; i < 5; i++) {
      const f = i / 4;
      feather(el, (0.55 + f * 0.5) * s, (0.13 + f * 0.04) * s,
        [sx * 0.12 * s, -fa * (0.18 + f * 0.7), -0.14 * s],
        [Math.PI + 0.55 - f * 0.2, 0, sx * (0.35 - f * 0.1)], 0.06);
    }
    // short upper covert row layered over the fan roots
    for (let i = 0; i < 3; i++) {
      const f = i / 2;
      feather(el, 0.4 * s, 0.11 * s,
        [sx * 0.14 * s, -fa * (0.25 + f * 0.55), -0.1 * s],
        [Math.PI + 0.75 - f * 0.15, 0, sx * 0.5], 0.12);
    }
    // red elbow glow stud
    A.sharpBox(el, 'glowSoft', [0.05 * s, 0.05 * s, 0.05 * s], { p: [sx * 0.16 * s, -0.04 * s, 0.08 * s] });
  }

  // ================= LEGS: THICK THIGHS, PISTON SHINS, SICKLE CLAWS =================
  for (const side of ['L', 'R']) {
    const sx = side === 'L' ? -1 : 1;
    const th = 'thigh' + side, kn = 'knee' + side, an = 'ankle' + side;
    const tl = D.thighLen, sl = D.shinLen;

    A.ball(th, 'frame', 0.24 * s, {});
    // heavily bulged haunch thigh
    A.lathe(th, 'primary', [
      [-tl * 1.0, 0.15 * s],
      [-tl * 0.55, 0.3 * s],
      [-tl * 0.14, 0.23 * s],
    ], { scaleZ: 1.3, seg: 18, p: [0, 0, 0.05 * s] });
    A.plate(th, 'accent', rhombOutline(0.34 * s, tl * 0.5, { cut: 0.28 }), 0.05 * s, {
      p: [sx * 0.27 * s, -tl * 0.42, 0.06 * s], r: [0, sx * Math.PI / 2, 0], round: 0.15 });
    // red thigh seam glow
    A.sharpBox(th, 'glow', [0.035 * s, tl * 0.42, 0.035 * s], {
      p: [sx * 0.2 * s, -tl * 0.5, 0.24 * s] });

    A.part(kn, 'metal', new THREE.CylinderGeometry(0.15 * s, 0.15 * s, 0.3 * s, 10), {
      r: [0, 0, Math.PI / 2] });
    A.plate(kn, 'accent', shieldOutline(0.28 * s, 0.36 * s, { taper: 0.6 }), 0.055 * s, {
      p: [0, -0.02 * s, 0.17 * s], r: [0.2, 0, 0], round: 0.15 });
    // EXPOSED PISTON SHIN: slim frame bone + calf plate + twin pistons
    A.tube(kn, 'frame', 0.1 * s, 0.13 * s, sl, { p: [0, -sl / 2, 0] });
    A.taper(kn, 'primary', [0.26 * s, sl * 0.6, 0.3 * s], 1.25, 1.1, {
      p: [0, -sl * 0.45, -0.06 * s] });
    A.piston(kn, 'metal', [sx * 0.1 * s, -0.1 * s, 0.1 * s], [sx * 0.08 * s, -sl * 0.88, 0.13 * s], 0.035 * s);
    A.piston(kn, 'brass', [-sx * 0.08 * s, -sl * 0.2, 0.12 * s], [-sx * 0.06 * s, -sl * 0.92, 0.1 * s], 0.028 * s);
    // hock blade fin at the back of the shin
    A.blade(kn, 'metal', 0.5 * s, 0.13 * s, 0.035 * s, {
      p: [0, -sl * 0.35, -0.18 * s], r: [Math.PI - 0.3, 0, 0], taper: 0.1 });
    // red shin seam
    A.sharpBox(kn, 'glowSoft', [0.03 * s, sl * 0.3, 0.03 * s], { p: [0, -sl * 0.5, 0.15 * s] });

    // FOOT — sole ≈ −0.32·s below the ankle joint (grounding contract)
    A.ball(an, 'frame', 0.13 * s, {});
    A.taper(an, 'frame', [0.34 * s, 0.24 * s, 0.55 * s], 0.75, 0.55, { p: [0, -0.2 * s, 0.12 * s] });
    // two forward ground toes with chrome claw tips
    for (const tx of [-1, 1]) {
      A.sharpBox(an, 'dark', [0.1 * s, 0.12 * s, 0.3 * s], {
        p: [tx * 0.12 * s, -0.26 * s, 0.36 * s], r: [0.08, tx * 0.12, 0] });
      A.spike(an, 'metal', 0.055 * s, 0.34 * s, {
        p: [tx * 0.15 * s, -0.26 * s, 0.58 * s], r: [Math.PI / 2 - 0.12, 0, tx * 0.12], seg: 6 });
    }
    // HUGE raised chrome SICKLE toe-claw (the killing claw): two angled
    // cone segments faking the curve, held up off the ground, inner side
    const ix = -sx * 0.05 * s;
    A.sharpBox(an, 'dark', [0.12 * s, 0.16 * s, 0.18 * s], { p: [ix, -0.12 * s, 0.26 * s], r: [0.6, 0, 0] });
    A.spike(an, 'metal', 0.16 * s, 0.95 * s, { p: [ix, 0.16 * s, 0.52 * s], r: [0.85, 0, 0], seg: 7 });
    A.spike(an, 'metal', 0.1 * s, 0.8 * s, { p: [ix, 0.6 * s, 1.0 * s], r: [1.5, 0, 0], seg: 7 });
    // rear dew spur
    A.spike(an, 'metal', 0.05 * s, 0.3 * s, { p: [0, -0.14 * s, -0.2 * s], r: [-2.2, 0, 0], seg: 6 });
  }

  // ================= TAIL: 3-JOINT CHAIN, DOUBLE FEATHER ROWS =================
  // ≈ body length; the animator runs a travelling S-wave down tail0→2, so
  // every blade is parented to its segment joint and rides the wave.
  // joint POSITIONS carry a rising S (the animator owns the rotations):
  // the tail leaves the hips level and sweeps UP toward the tip.
  const segLen = [1.3 * s, 1.2 * s, 1.1 * s];
  const segRise = [0.14 * s, 0.26 * s];
  addJoint(J, 'tail0', 'hips', 0, 0.3 * s, -0.5 * s);
  addJoint(J, 'tail1', 'tail0', 0, segRise[0], -segLen[0]);
  addJoint(J, 'tail2', 'tail1', 0, segRise[1], -segLen[1]);
  ['tail0', 'tail1', 'tail2'].forEach((tj, ti) => {
    const r0 = (0.26 - ti * 0.065) * s;
    const dy = ti < 2 ? segRise[ti] : 0.3 * s;
    const tilt = Math.atan2(dy, segLen[ti]); // aim the core at the next joint
    // smooth tapering segment core
    A.capsule(tj, 'primary', r0, segLen[ti] * 0.75, {
      p: [0, dy * 0.5, -segLen[ti] * 0.5], r: [Math.PI / 2 + tilt, 0, 0], s: [1, 1, 0.85] });
    A.ring(tj, 'dark', r0 * 0.95, 0.03 * s, { p: [0, 0, -0.03 * s] });
    // armored scale plates shingled along the top
    for (let k = 0; k < 3; k++) {
      const f = k / 2;
      A.plate(tj, 'accent', rhombOutline((0.34 - ti * 0.06) * s, (0.36 - ti * 0.05) * s, { cut: 0.28 }), 0.035 * s, {
        p: [0, r0 * 0.55 + dy * f, -segLen[ti] * (0.16 + f * 0.6)], r: [Math.PI / 2 + tilt + 0.2, 0, 0], round: 0.15 });
    }
    // DOUBLE ROW of blade-feathers to the tip: a tall guard row sweeping
    // up-back (reads in profile) over a side row splaying out-back
    const n = 4;
    for (let i = 0; i <= n; i++) {
      const f = i / n;
      const z = -segLen[ti] * (0.1 + f * 0.78);
      const y = dy * (0.1 + f * 0.8);
      const grow = ti === 2 ? 1 + f * 0.4 : 1; // the tip fan flares
      for (const sx of [-1, 1]) {
        feather(tj, (0.95 - ti * 0.08) * grow * s, 0.2 * s,
          [sx * r0 * 0.35, y + r0 * 0.45, z],
          [-0.55 - f * 0.35 - ti * 0.15, 0, -sx * 0.3], 0.04);
        feather(tj, (0.62 - ti * 0.05) * grow * s, 0.14 * s,
          [sx * r0 * 0.55, y + r0 * 0.25, z + 0.04 * s],
          [-0.5 - ti * 0.1, sx * 0.5, -sx * 0.95], 0.1);
      }
    }
    // red glow sliver along the top ridge
    A.sharpBox(tj, 'glowSoft', [0.03 * s, 0.03 * s, segLen[ti] * 0.5], {
      p: [0, r0 * 0.72 + dy * 0.4, -segLen[ti] * 0.45], r: [tilt, 0, 0] });
    if (ti === 1) { // "MX-7 SAURION" plate on the tail side
      A.custom(tj, plateMat({ text: 'MX-7 SAURION', textScale: 0.13, textY: 0.52, color: '#e6e8ea' }),
        beveledPlate(rhombOutline(0.85 * s, 0.34 * s, { cut: 0.25 }), 0.04 * s, { round: 0.12 }), {
          p: [0.19 * s, -0.02 * s, -segLen[ti] * 0.5], r: [0, Math.PI / 2, 0] });
    }
  });
  // tail tip: chrome spear + final fan of feathers, swept up
  A.spike('tail2', 'metal', 0.07 * s, 0.65 * s, {
    p: [0, 0.34 * s, -segLen[2] - 0.22 * s], r: [-Math.PI / 2 + 0.32, 0, 0], seg: 6 });
  for (const sx of [-1, 1]) {
    feather('tail2', 0.95 * s, 0.2 * s, [sx * 0.05 * s, 0.34 * s, -segLen[2] * 0.98],
      [-1.15, 0, -sx * 0.35], 0.04);
    feather('tail2', 0.75 * s, 0.16 * s, [sx * 0.07 * s, 0.3 * s, -segLen[2] * 0.9],
      [-0.75, sx * 0.55, -sx * 0.7], 0.08);
  }

  // razor plumes fire from the open jaws
  anchors.muzzleR = addAnchor(J.head, 0, hy - hb * 0.35, hz + hb * 2.4);
  anchors.core = addAnchor(J.torso, 0, chH * 0.6, W * 0.46);
}
