// Auto-split from designs.js — one mech per file. Shared sculpting
// vocabulary lives in ../parts.js; see docs/IMAGE_TO_MECH.md.
import * as THREE from 'three';
import { cyl, taperBox, beveledPlate, shieldOutline, rhombOutline, roundedBox, bulgeLathe, facetBulge } from '../parts.js';
import { decalTexture, skinMaterial } from '../../core/pbrtex.js';
import { baseFrame, standardArm, standardLeg, raptorLeg, addAnchor } from '../factory.js';
import { addJoint } from './common.js';


// ============================================================
// 10. WRAITH — the reaper, matched to the canonical concept.
//     Gaunt near-black silhouette: a tall pointed cowl over a black
//     void face with ONE red eye, a huge tattered cloak of layered
//     blade-strips swallowing the torso (shin-length at the back),
//     a skeletal V-chest with exposed spine/ribs, wiry actuator
//     arms with claw fingers, blade-thin digitigrade legs, and an
//     enormous rail rifle carried vertically at the right hand —
//     nearly the mech's full height (the aim clip raises it level).
// ============================================================
export function wraith(A, D, J, anchors, def) {
  const s = D.scale;
  const W = D.torsoW;
  const chH = D.torsoH;
  const hs = D.headSize;
  const ua = D.upperArmLen, fa = D.foreArmLen;

  const plateMat = (decal) => {
    const tex = decalTexture({ seed: def.seed + 5, ...def.skin.accent }, decal);
    return new THREE.MeshStandardMaterial({
      map: tex.map, normalMap: tex.normalMap,
      roughnessMap: tex.rmMap, metalnessMap: tex.rmMap,
      roughness: 1, metalness: 1,
    });
  };

  // ================= WAIST / PELVIS: pinched, skeletal =================
  A.lathe('hips', 'frame', [[-0.12 * s, W * 0.22], [0.22 * s, W * 0.14], [0.55 * s, W * 0.2]], {
    scaleX: 1.12, seg: 16 });
  for (let i = 0; i < 3; i++) { // exposed spine rings continue down the waist
    A.tube('hips', 'dark', W * (0.16 - i * 0.008), W * (0.17 - i * 0.008), 0.05 * s, {
      p: [0, (0.06 + i * 0.15) * s, 0] });
  }
  A.facet('hips', 'primary', W * 0.24, W * 0.3, W * 0.2, 0.62 * s, {
    sides: 6, scaleZ: 0.72, p: [0, -0.36 * s, 0] });
  // narrow front fang plate — the only skirt (the cloak owns the rest)
  A.plate('hips', 'accent', shieldOutline(W * 0.26, 0.72 * s, { taper: 0.5 }), 0.055 * s, {
    p: [0, -0.48 * s, W * 0.22], r: [0.16, 0, 0], round: 0.12 });
  A.facet('hips', 'dark', W * 0.14, W * 0.18, W * 0.12, 0.36 * s, {
    sides: 6, scaleZ: 0.7, p: [0, -0.42 * s, -W * 0.18] });

  // ================= TORSO: skeletal V-chest, spine + rib arcs =================
  // gaunt core mass (kept narrow — the cloak provides the width)
  A.lathe('torso', 'primary', [
    [chH * 0.06, W * 0.2],
    [chH * 0.4, W * 0.34],
    [chH * 0.72, W * 0.42],
    [chH * 0.96, W * 0.36],
    [chH * 1.08, W * 0.16],
  ], { scaleX: 1.05, scaleZ: 0.56, seg: 20 });
  // V chest plates: two angled slabs meeting at the sternum
  for (const sx of [-1, 1]) {
    A.plate('torso', 'primary', rhombOutline(W * 0.34, chH * 0.52, { cut: 0.3 }), 0.06 * s, {
      p: [sx * W * 0.185, chH * 0.68, W * 0.225], r: [-0.1, sx * 0.28, sx * 0.42], round: 0.12 });
    // collar-bone seams (faint)
    A.sharpBox('torso', 'glowSoft', [0.018 * s, chH * 0.2, 0.018 * s], {
      p: [sx * W * 0.2, chH * 0.72, W * 0.26], r: [-0.08, 0, sx * 0.4] });
  }
  // red sternum seam in the V gap (kept faint — silhouette carries the mech)
  A.sharpBox('torso', 'glowSoft', [0.02 * s, chH * 0.3, 0.02 * s], {
    p: [0, chH * 0.66, W * 0.265], r: [-0.06, 0, 0] });
  // exposed dark spine rings under the chest
  for (let i = 0; i < 3; i++) {
    A.tube('torso', 'dark', W * (0.155 - i * 0.014), W * (0.17 - i * 0.014), 0.055 * s, {
      p: [0, chH * (0.14 - i * 0.1), 0] });
  }
  // rib arcs: thin elliptical tori half-sunk into the lower chest
  for (let i = 0; i < 3; i++) {
    A.ring('torso', 'dark', W * (0.34 - i * 0.03), 0.022 * s, {
      p: [0, chH * (0.42 - i * 0.11), 0.01 * s], r: [Math.PI / 2, 0, 0],
      s: [1, 1, 0.62], seg: 24 });
  }
  // brass spine pistons up the back
  for (const sx of [-1, 1]) {
    A.piston('torso', 'brass', [sx * W * 0.1, chH * 0.0, -W * 0.05],
      [sx * W * 0.22, chH * 0.34, -W * 0.09], 0.028 * s);
  }
  // collar ring
  A.tube('torso', 'frame', W * 0.11, W * 0.14, 0.12 * s, { p: [0, chH * 1.04, 0] });

  // ================= CLOAK: the dominant element =================
  // shoulder yoke the strips hang from
  A.plate('torso', 'frame', rhombOutline(W * 1.0, chH * 0.22, { cut: 0.25 }), 0.08 * s, {
    p: [0, chH * 0.96, -W * 0.26], r: [0.3, 0, 0], round: 0.15 });
  for (const sx of [-1, 1]) { // yoke shoulder hooks
    A.plate('torso', 'frame', rhombOutline(W * 0.3, chH * 0.14, { cut: 0.3 }), 0.06 * s, {
      p: [sx * W * 0.52, chH * 0.94, -W * 0.12], r: [0.2, sx * 0.8, sx * 0.15], round: 0.15 });
  }
  wraithCloak(A, D, J, anchors);
  // side wrap strips framing the V-chest from the front
  for (const sx of [-1, 1]) {
    A.blade('torso', 'accent', 2.5 * s, 0.3 * s, 0.035 * s, {
      p: [sx * W * 0.56, chH * 0.92 - 1.2 * s, 0.02 * s],
      r: [Math.PI + 0.04, 0, -sx * 0.34], taper: 0.22 });
    A.blade('torso', 'primary', 1.9 * s, 0.26 * s, 0.03 * s, {
      p: [sx * W * 0.5, chH * 0.86 - 0.9 * s, 0.09 * s],
      r: [Math.PI + 0.02, 0, -sx * 0.26], taper: 0.3 });
  }

  // ================= HEAD: tall pointed cowl, one red eye =================
  const hy = hs * 0.9;
  A.tube('head', 'frame', hs * 0.24, hs * 0.32, hs * 0.8, { p: [0, hy * 0.3, 0] });
  // black void face: dark ball, ONE deep-set red eye — nothing else
  A.ball('head', 'dark', hs * 0.52, { p: [0, hy + hs * 0.42, 0], seg: 16 });
  A.ball('head', 'glow', hs * 0.11, { p: [0, hy + hs * 0.48, hs * 0.42], seg: 10 });
  // the DEATH GAZE ult fires from the eye itself
  anchors.eye = addAnchor(J.head, 0, hy + hs * 0.48, hs * 0.42);
  // cowl shell: open-front partial lathe, rising steeply
  const hoodProfile = [
    [-hs * 0.7, hs * 0.82],
    [hs * 0.05, hs * 0.92],
    [hs * 0.75, hs * 0.7],
    [hs * 1.5, hs * 0.26],
  ].map(([y, r]) => new THREE.Vector2(r, y));
  const hoodPts = new THREE.SplineCurve(hoodProfile).getPoints(18)
    .map((p) => new THREE.Vector2(Math.max(0.001, p.x), p.y));
  const hoodOuter = new THREE.LatheGeometry(hoodPts, 24, 0.95, Math.PI * 2 - 1.9);
  hoodOuter.scale(0.95, 1, 1.08);
  hoodOuter.computeVertexNormals();
  const hoodInner = hoodOuter.clone();
  hoodInner.scale(-0.93, 0.96, 0.93); // mirrored + shrunk: visible dark lining
  hoodInner.computeVertexNormals();
  A.part('head', 'primary', hoodOuter, { p: [0, hy + hs * 0.4, -hs * 0.08] });
  A.part('head', 'primary', hoodInner, { p: [0, hy + hs * 0.4, -hs * 0.08] });
  // sharp peak: 4-sided pyramid capping the cowl, hooked slightly forward
  A.spike('head', 'primary', hs * 0.42, hs * 1.6, {
    p: [0, hy + hs * 2.25, -hs * 0.1], r: [0.18, Math.PI / 4, 0], seg: 4 });
  A.spike('head', 'accent', hs * 0.22, hs * 0.9, {
    p: [0, hy + hs * 2.85, hs * 0.08], r: [0.3, Math.PI / 4, 0], seg: 4 });
  // angled cowl-edge plates hugging the sides of the face opening
  for (const sx of [-1, 1]) {
    A.plate('head', 'primary', rhombOutline(hs * 0.5, hs * 1.3, { cut: 0.32 }), hs * 0.08, {
      p: [sx * hs * 0.6, hy + hs * 0.55, hs * 0.42],
      r: [-0.12, sx * 0.55, sx * 0.1], round: 0.15 });
  }
  // cowl drapes falling outward toward the shoulders + rear drape
  for (const sx of [-1, 1]) {
    A.blade('head', 'primary', hs * 1.9, hs * 0.6, 0.045 * s, {
      p: [sx * hs * 0.85, hy - hs * 0.35, -hs * 0.12],
      r: [Math.PI + 0.06, 0, -sx * 0.42], taper: 0.35 });
    A.blade('head', 'accent', hs * 1.3, hs * 0.42, 0.035 * s, {
      p: [sx * hs * 0.68, hy - hs * 0.1, hs * 0.16],
      r: [Math.PI + 0.04, 0, -sx * 0.3], taper: 0.4 });
  }
  A.blade('head', 'primary', hs * 1.7, hs * 0.7, 0.045 * s, {
    p: [0, hy - hs * 0.25, -hs * 0.72], r: [Math.PI + 0.22, 0, 0], taper: 0.35 });

  // ================= ARMS: skeletal actuators, claw fingers =================
  for (const side of ['L', 'R']) {
    const sx = side === 'L' ? -1 : 1;
    const sh = 'shoulder' + side, el = 'elbow' + side, ha = 'hand' + side;

    A.ball(sh, 'frame', 0.16 * s, {});
    // slim shoulder cap tucked under the cloak yoke
    A.lathe(sh, 'primary', [
      [-0.1 * s, 0.23 * s],
      [0.08 * s, 0.2 * s],
      [0.24 * s, 0.05 * s],
    ], { p: [sx * 0.05 * s, 0.05 * s, 0], scaleZ: 0.85, seg: 14 });
    // upper arm: bone core + exposed actuator tubes
    A.tube(sh, 'frame', 0.075 * s, 0.09 * s, ua * 0.92, { p: [0, -ua * 0.5, 0] });
    A.tube(sh, 'metal', 0.032 * s, 0.032 * s, ua * 0.74, { p: [sx * 0.02 * s, -ua * 0.48, 0.1 * s], seg: 8 });
    A.tube(sh, 'dark', 0.028 * s, 0.028 * s, ua * 0.7, { p: [sx * 0.09 * s, -ua * 0.46, -0.06 * s], seg: 8 });
    A.plate(sh, 'primary', rhombOutline(0.2 * s, ua * 0.5, { cut: 0.3 }), 0.035 * s, {
      p: [sx * 0.13 * s, -ua * 0.45, 0.02 * s], r: [0, sx * Math.PI / 2, 0], round: 0.15 });
    A.part(el, 'metal', cyl(0.095 * s, 0.095 * s, 0.22 * s, 10), { r: [0, 0, Math.PI / 2] });
    // forearm: slim housing, actuator tube, one faint seam
    A.facet(el, 'primary', 0.11 * s, 0.155 * s, 0.12 * s, fa * 0.9, {
      sides: 6, scaleZ: 1.1, p: [0, -fa * 0.5, 0] });
    A.tube(el, 'metal', 0.03 * s, 0.03 * s, fa * 0.62, { p: [sx * 0.1 * s, -fa * 0.45, 0.08 * s], seg: 8 });
    A.sharpBox(el, 'glowSoft', [0.018 * s, fa * 0.36, 0.018 * s], {
      p: [sx * 0.14 * s, -fa * 0.5, 0.03 * s] });
    A.piston(el, 'brass', [sx * -0.07 * s, -0.06 * s, -0.1 * s],
      [sx * -0.09 * s, -fa * 0.55, -0.13 * s], 0.024 * s);
    // slender hand + long articulated claw fingers (two segments each)
    A.facet(ha, 'frame', 0.09 * s, 0.12 * s, 0.08 * s, 0.24 * s, { sides: 6, p: [0, -0.06 * s, 0] });
    for (let i = -1; i <= 1; i++) {
      A.sharpBox(ha, 'dark', [0.032 * s, 0.17 * s, 0.038 * s], {
        p: [i * 0.06 * s, -0.24 * s, 0.05 * s], r: [-0.5, 0, i * 0.08] });
      A.spike(ha, 'metal', 0.024 * s, 0.24 * s, {
        p: [i * 0.06 * s, -0.4 * s, 0.1 * s], r: [Math.PI - 0.12, 0, i * 0.08], seg: 5 });
    }
    A.sharpBox(ha, 'dark', [0.03 * s, 0.13 * s, 0.036 * s], {
      p: [sx * 0.1 * s, -0.16 * s, 0.02 * s], r: [-0.3, 0, sx * 0.6] });
    A.spike(ha, 'metal', 0.022 * s, 0.18 * s, {
      p: [sx * 0.14 * s, -0.27 * s, 0.05 * s], r: [Math.PI - 0.1, 0, sx * 0.55], seg: 5 });
  }

  // ================= RAIL RIFLE: carried vertically, full height =================
  // Long axis along local Y: muzzle DOWN at rest (alongside the shin),
  // swings level when the aim clip pitches the arm forward.
  addJoint(J, 'rifle', 'handR', 0.2 * s, -0.05 * s, 0.16 * s);
  // grip wedge bridging to the hand
  A.taper('rifle', 'dark', [0.08 * s, 0.24 * s, 0.11 * s], 0.7, 0.8, {
    p: [-0.06 * s, 0.02 * s, -0.12 * s], r: [0.4, 0, -0.25] });
  // tall receiver block
  A.facet('rifle', 'primary', 0.13 * s, 0.17 * s, 0.13 * s, 1.9 * s, {
    sides: 8, scaleX: 0.75, scaleZ: 1.25, p: [0, 1.5 * s, 0] });
  // receiver charge-seam glow strip (front face at rest, underside when aimed)
  A.sharpBox('rifle', 'glowSoft', [0.02 * s, 1.3 * s, 0.02 * s], { p: [0, 1.45 * s, 0.19 * s] });
  // stock: spar + butt pad capping the top
  A.facet('rifle', 'frame', 0.06 * s, 0.09 * s, 0.07 * s, 0.55 * s, {
    sides: 6, scaleZ: 1.4, p: [0, 2.72 * s, -0.04 * s] });
  A.plate('rifle', 'primary', rhombOutline(0.26 * s, 0.5 * s, { cut: 0.3 }), 0.07 * s, {
    p: [0, 3.16 * s, -0.04 * s], r: [Math.PI / 2, 0, 0], round: 0.15 });
  // scrapped-unit stencil on the receiver flank
  A.custom('rifle', plateMat({ text: 'WR-110', textY: 0.55, textScale: 0.22, color: '#8a9099', alpha: 0.55 }),
    beveledPlate(rhombOutline(1.1 * s, 0.2 * s, { cut: 0.25 }), 0.03 * s, { round: 0.15 }), {
      p: [0.14 * s, 1.6 * s, 0], r: [0, Math.PI / 2, Math.PI / 2] });
  // charge cell + glow ring behind the grip
  A.facet('rifle', 'dark', 0.06 * s, 0.09 * s, 0.07 * s, 0.3 * s, {
    sides: 6, p: [0, 0.42 * s, -0.2 * s], r: [Math.PI / 2, 0, 0] });
  A.ring('rifle', 'glowSoft', 0.065 * s, 0.016 * s, { p: [0, 0.42 * s, -0.34 * s] });
  // scope riding the +Z face (top face when aimed)
  A.tube('rifle', 'frame', 0.058 * s, 0.058 * s, 0.85 * s, { p: [0, 1.72 * s, 0.3 * s] });
  A.ring('rifle', 'dark', 0.062 * s, 0.018 * s, { p: [0, 2.12 * s, 0.3 * s], r: [Math.PI / 2, 0, 0] });
  A.ring('rifle', 'dark', 0.062 * s, 0.018 * s, { p: [0, 1.34 * s, 0.3 * s], r: [Math.PI / 2, 0, 0] });
  A.ball('rifle', 'glow', 0.038 * s, { p: [0, 2.16 * s, 0.3 * s], seg: 8 });
  A.sharpBox('rifle', 'dark', [0.032 * s, 0.1 * s, 0.06 * s], { p: [0, 1.5 * s, 0.22 * s] });
  A.sharpBox('rifle', 'dark', [0.032 * s, 0.1 * s, 0.06 * s], { p: [0, 2.0 * s, 0.22 * s] });
  // barrel shroud where the rails leave the receiver
  A.tube('rifle', 'frame', 0.095 * s, 0.075 * s, 0.66 * s, { p: [0, 0.24 * s, 0] });
  // triple rails + red charge seam
  for (const rx of [-1, 1]) {
    A.tube('rifle', 'dark', 0.038 * s, 0.038 * s, 2.1 * s, {
      p: [rx * 0.052 * s, -0.95 * s, 0], seg: 8 });
  }
  A.tube('rifle', 'dark', 0.032 * s, 0.032 * s, 2.0 * s, { p: [0, -0.9 * s, -0.07 * s], seg: 8 });
  A.sharpBox('rifle', 'glowSoft', [0.02 * s, 2.0 * s, 0.02 * s], { p: [0, -0.9 * s, 0.042 * s] });
  // rail spacer rings
  for (const ry of [-0.55, -1.15, -1.7]) {
    A.ring('rifle', 'dark', 0.072 * s, 0.02 * s, { p: [0, ry * s, -0.01 * s], r: [Math.PI / 2, 0, 0] });
  }
  // muzzle brake + glow choke at the very tip
  A.facet('rifle', 'dark', 0.036 * s, 0.08 * s, 0.048 * s, 0.32 * s, {
    sides: 6, p: [0, -2.1 * s, -0.01 * s] });
  A.ring('rifle', 'glow', 0.062 * s, 0.014 * s, { p: [0, -2.02 * s, -0.01 * s], r: [Math.PI / 2, 0, 0] });

  // ================= LEGS: blade-thin digitigrade =================
  for (const side of ['L', 'R']) {
    const sx = side === 'L' ? -1 : 1;
    const th = 'thigh' + side, kn = 'knee' + side, an = 'ankle' + side;
    const tl = D.thighLen, sl = D.shinLen;

    A.ball(th, 'frame', 0.17 * s, {});
    // lean thigh (rest pose angles it forward)
    A.lathe(th, 'primary', [
      [-tl * 1.0, 0.12 * s],
      [-tl * 0.6, 0.2 * s],
      [-tl * 0.15, 0.16 * s],
    ], { scaleZ: 1.25, seg: 16, p: [0, 0, 0.03 * s] });
    A.plate(th, 'accent', rhombOutline(0.24 * s, tl * 0.5, { cut: 0.3 }), 0.04 * s, {
      p: [sx * 0.19 * s, -tl * 0.45, 0.03 * s], r: [0, sx * Math.PI / 2, 0], round: 0.15 });
    A.piston(th, 'brass', [0, -tl * 0.18, -0.13 * s], [0, -tl * 0.85, -0.16 * s], 0.026 * s);

    // exposed knee actuators
    A.ball(kn, 'metal', 0.11 * s, {});
    A.piston(kn, 'metal', [sx * 0.07 * s, 0.06 * s, 0.1 * s], [sx * 0.055 * s, -sl * 0.32, 0.12 * s], 0.02 * s);
    A.plate(kn, 'accent', shieldOutline(0.2 * s, 0.3 * s, { taper: 0.6 }), 0.045 * s, {
      p: [0, -0.03 * s, 0.13 * s], r: [0.2, 0, 0], round: 0.15 });
    // blade-like shin: wiry calf + front and rear blade edges
    A.lathe(kn, 'primary', [
      [-sl * 1.0, 0.075 * s],
      [-sl * 0.68, 0.125 * s],
      [-sl * 0.34, 0.15 * s],
      [-sl * 0.06, 0.1 * s],
    ], { scaleZ: 1.2, seg: 14 });
    A.blade(kn, 'primary', sl * 0.78, 0.1 * s, 0.028 * s, {
      p: [0, -sl * 0.52, 0.155 * s], r: [0.06, 0, 0], taper: 0.2 });
    A.blade(kn, 'dark', 0.58 * s, 0.13 * s, 0.03 * s, {
      p: [0, -sl * 0.48, -0.14 * s], r: [Math.PI - 0.3, 0, 0], taper: 0.15 });

    // spiked two-claw toes + rear spur, sole grounded
    A.ball(an, 'frame', 0.105 * s, {});
    A.taper(an, 'frame', [0.2 * s, 0.24 * s, 0.36 * s], 0.65, 0.5, { p: [0, -0.2 * s, 0.06 * s] });
    for (const tx of [-1, 1]) {
      A.spike(an, 'dark', 0.052 * s, 0.5 * s, {
        p: [tx * 0.085 * s, -0.2 * s, 0.27 * s], r: [2.0, 0, tx * 0.2], seg: 6 });
    }
    A.spike(an, 'dark', 0.042 * s, 0.32 * s, {
      p: [0, -0.16 * s, -0.14 * s], r: [-2.1, 0, 0], seg: 6 });
  }

  anchors.muzzleR = addAnchor(J.rifle, 0, -2.28 * s, -0.01 * s);
  anchors.scope = addAnchor(J.rifle, 0, 1.72 * s, 0.3 * s);
  // core sits deep in the chest so the red light rims the cloak instead of
  // blowing out the sternum gap
  anchors.core = addAnchor(J.torso, 0, chH * 0.5, -W * 0.1);
}

// The tattered cloak + its combat rig, extracted so the GLB wraith can wear
// the SAME cape (glbanim builds it onto the GLB's virtual torso joint for the
// wing-laser heavy). Creates the cloak/cloakL/cloakR joints heavyFlare /
// heavyRaise drive, three layers of jagged blade-strips, and the wing0..5
// laser-emitter anchors heavyImpactFx fires from.
export function wraithCloak(A, D, J, anchors) {
  const s = D.scale;
  const W = D.torsoW;
  const chH = D.torsoH;
  // jagged blade-strips: a = angle around the back (0 = straight back).
  // Hang from the yoke, tilt backward, roll bottoms outward (skirt flare).
  // The whole cloak lives on its own 'cloak' joint so combat can SPREAD it
  // wide and tall like wings (wraith's heavy scales the group) — and each
  // HALF lives on a cloakL/cloakR child joint so the heavy can roll the two
  // wings outward and UP, fanning the spikes open above his head.
  addJoint(J, 'cloak', 'torso', 0, chH * 0.92, -W * 0.3);
  addJoint(J, 'cloakL', 'cloak', 0, 0, 0);
  addJoint(J, 'cloakR', 'cloak', 0, 0, 0);
  const strip = (mat, a, L, R, yTop, tilt, wid, th, taper) => {
    const dirY = Math.cos(tilt), dirZ = Math.sin(tilt);
    const wing = a < -0.05 ? 'cloakL' : a > 0.05 ? 'cloakR' : 'cloak';
    A.blade(wing, mat, L, wid, th, {
      p: [Math.sin(a) * R * (1 + 0.1 * L / s), yTop - chH * 0.92 - dirY * L * 0.5,
        -Math.cos(a) * R * 0.9 + W * 0.3 - dirZ * L * 0.5],
      r: [Math.PI + tilt, 0, -a * 0.3], taper });
  };
  const jag = (i, k) => 0.82 + 0.18 * (((i * 7 + k * 3) % 4) / 3); // varied lengths
  for (let i = 0; i < 11; i++) { // outer layer — near-black, shin-length at center
    const a = (i / 10 - 0.5) * 4.1;
    strip('accent', a, (3.6 - Math.abs(a) * 0.44) * jag(i, 1) * s, W * 0.5,
      chH * 1.0, 0.09 + 0.24 * Math.cos(a * 0.5), 0.4 * s, 0.035 * s, 0.2);
  }
  for (let i = 0; i < 9; i++) { // mid layer
    const a = (i / 8 - 0.5) * 3.3;
    strip('primary', a, (2.8 - Math.abs(a) * 0.34) * jag(i, 2) * s, W * 0.43,
      chH * 0.92, 0.06 + 0.2 * Math.cos(a * 0.5), 0.34 * s, 0.032 * s, 0.28);
  }
  for (let i = 0; i < 6; i++) { // inner underlayer
    const a = (i / 5 - 0.5) * 2.5;
    strip('dark', a, (2.0 - Math.abs(a) * 0.26) * jag(i, 3) * s, W * 0.36,
      chH * 0.84, 0.05 + 0.16 * Math.cos(a * 0.5), 0.3 * s, 0.03 * s, 0.34);
  }
  // wing emitters spread across the cloak span — parented to the wing-half
  // joints so when the heavy fans the wings up, the laser origins ride up
  // with the raised spikes
  for (let k = 0; k < 6; k++) {
    const a = (k / 5 - 0.5) * 3.6;
    anchors['wing' + k] = addAnchor(a < 0 ? J.cloakL : J.cloakR,
      Math.sin(a) * W * 0.72, -1.5 * s, -Math.cos(a) * W * 0.42);
  }
}
