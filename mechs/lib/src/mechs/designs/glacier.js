// Auto-split from designs.js — one mech per file. Shared sculpting
// vocabulary lives in ../parts.js; see docs/IMAGE_TO_MECH.md.
import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { cyl, taperBox, beveledPlate, shieldOutline, rhombOutline, roundedBox, bulgeLathe, facetBulge } from '../parts.js';
import { decalTexture, skinMaterial } from '../../core/pbrtex.js';
import { baseFrame, standardArm, standardLeg, raptorLeg, addAnchor } from '../factory.js';
import { addJoint } from './common.js';


// ============================================================
// 12. GLACIER — frost-fortress heavy, matched to the canonical
//     concept: MechWarrior bulk in pale ice-blue with white frost.
//     Giant slab pauldrons (GLACIER / 08 decals) crowned with
//     clusters of translucent ice crystals, a low head embedded
//     between the shoulders with a twin-bar cyan visor, hex-plated
//     chest with a snowflake emblem, and a right forearm that is a
//     long multi-segment CRYO CANNON: facet drums, a translucent
//     coil core in metal rings, dark collar, and three frost prongs
//     around a recessed glow muzzle.
// ============================================================
export function glacier(A, D, J, anchors, def) {
  const s = D.scale;
  const W = D.torsoW;   // master width unit (~2.04)
  const chH = D.torsoH;
  const hs = D.headSize;
  const F = D.foreArmLen;

  const plateMat = (skin, decal) => {
    const tex = decalTexture({ seed: def.seed + (skin === 'accent' ? 5 : 0), ...def.skin[skin] }, decal);
    return new THREE.MeshStandardMaterial({
      map: tex.map, normalMap: tex.normalMap,
      roughnessMap: tex.rmMap, metalnessMap: tex.rmMap,
      roughness: 1, metalness: 1,
    });
  };

  // ---- translucent ice: physical glass-like material, NOT emissive
  // (glow discipline: cyan lives in visor / coil / slits only)
  const icePhys = new THREE.MeshPhysicalMaterial({
    color: 0xcfeaff, transmission: 0.5, transparent: true, opacity: 0.8,
    roughness: 0.12, metalness: 0.0, thickness: 0.4,
    emissive: 0x7ce0ff, emissiveIntensity: 0.06, flatShading: true,
  });
  // fainter variant for the frost-breath mist under the face vents
  const mistMat = new THREE.MeshPhysicalMaterial({
    color: 0xdff2ff, transmission: 0.6, transparent: true, opacity: 0.38,
    roughness: 0.3, metalness: 0.0, depthWrite: false, flatShading: true,
  });

  // crystal cluster: 6-sided cones merged into one mesh per call.
  // spots: [x, y, z, tiltX, tiltZ, scale] — base sits at the spot, tip up.
  const iceCluster = (joint, spots, mat = icePhys) => {
    const geos = [];
    for (const [x, y, z, tx, tz, sc] of spots) {
      const g = new THREE.ConeGeometry(0.15 * s * sc, 1.05 * s * sc, 6);
      g.translate(0, 0.52 * s * sc, 0);
      g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(tx, sc * 2.7, tz)));
      g.translate(x, y, z);
      geos.push(g.toNonIndexed());
    }
    A.custom(joint, mat, BufferGeometryUtils.mergeGeometries(geos, false), {});
  };

  // regular hexagon outline, point-up, optionally squashed in Y
  const hexOutline = (r, sy = 1) => {
    const pts = [];
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 2 + (i * Math.PI) / 3;
      pts.push([Math.cos(a) * r, Math.sin(a) * r * sy]);
    }
    return pts;
  };

  // hand-drawn snowflake emblem plate (titanus hazardMat precedent)
  const snowMat = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#93a8b8';
    ctx.fillRect(0, 0, 256, 256);
    // subtle panel noise so it doesn't read flat
    for (let i = 0; i < 220; i++) {
      const g = 130 + Math.random() * 60;
      ctx.fillStyle = `rgba(${g | 0},${(g + 12) | 0},${(g + 22) | 0},${0.08 + Math.random() * 0.18})`;
      ctx.fillRect(Math.random() * 256, Math.random() * 256, 2 + Math.random() * 7, 2 + Math.random() * 5);
    }
    ctx.strokeStyle = '#f2fbff';
    ctx.lineCap = 'round';
    ctx.globalAlpha = 0.88;
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
      const ux = Math.cos(a), uy = Math.sin(a);
      const px = (t) => 128 + ux * t, py = (t) => 128 + uy * t;
      ctx.lineWidth = 9;
      ctx.beginPath(); ctx.moveTo(px(8), py(8)); ctx.lineTo(px(92), py(92)); ctx.stroke();
      ctx.lineWidth = 6;
      for (const [d, b] of [[42, 26], [66, 18]]) {
        for (const sgn of [-1, 1]) {
          const ba = a + sgn * 0.62;
          ctx.beginPath();
          ctx.moveTo(px(d), py(d));
          ctx.lineTo(px(d) + Math.cos(ba) * b, py(d) + Math.sin(ba) * b);
          ctx.stroke();
        }
      }
    }
    ctx.globalAlpha = 1;
    // weather the emblem back
    ctx.globalCompositeOperation = 'destination-over';
    ctx.globalCompositeOperation = 'source-over';
    for (let i = 0; i < 90; i++) {
      const g = 120 + Math.random() * 50;
      ctx.fillStyle = `rgba(${g | 0},${(g + 10) | 0},${(g + 20) | 0},${0.15 + Math.random() * 0.25})`;
      ctx.fillRect(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 4, 1 + Math.random() * 3);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5, metalness: 0.32 });
  })();

  // ================= WAIST / PELVIS: heavy, layered, thick skirts =================
  A.lathe('hips', 'frame', [[0.62 * s, W * 0.3], [0.28 * s, W * 0.23], [-0.05 * s, W * 0.28]], {
    scaleX: 1.3 });
  for (let i = 0; i < 2; i++) {
    A.tube('hips', 'dark', W * (0.24 - i * 0.012), W * (0.25 - i * 0.012), 0.09 * s, {
      p: [0, 0.14 * s + i * 0.19 * s, 0] });
  }
  // hex pelvis block, wide
  A.facet('hips', 'primary', W * 0.38, W * 0.48, W * 0.33, 0.95 * s, {
    sides: 6, scaleZ: 0.8, p: [0, -0.44 * s, 0] });
  // layered front skirt: big accent under-plate + primary over-plate
  A.plate('hips', 'accent', shieldOutline(W * 0.5, 0.95 * s, { taper: 0.66 }), 0.1 * s, {
    p: [0, -0.56 * s, W * 0.33], r: [0.14, 0, 0], round: 0.16 });
  A.plate('hips', 'primary', shieldOutline(W * 0.36, 0.7 * s, { taper: 0.7 }), 0.1 * s, {
    p: [0, -0.5 * s, W * 0.41], r: [0.14, 0, 0], round: 0.18 });
  // thick double side skirts
  for (const sx of [-1, 1]) {
    A.plate('hips', 'primary', shieldOutline(W * 0.4, 0.85 * s, { taper: 0.68 }), 0.09 * s, {
      p: [sx * W * 0.46, -0.5 * s, 0], r: [0.08, sx * Math.PI / 2, sx * 0.14], round: 0.18 });
    A.plate('hips', 'accent', shieldOutline(W * 0.3, 0.6 * s, { taper: 0.7 }), 0.08 * s, {
      p: [sx * W * 0.55, -0.46 * s, 0.05 * s], r: [0.08, sx * Math.PI / 2, sx * 0.2], round: 0.2 });
  }
  // rear skirt
  A.plate('hips', 'accent', shieldOutline(W * 0.44, 0.7 * s, { taper: 0.72 }), 0.09 * s, {
    p: [0, -0.52 * s, -W * 0.3], r: [-0.1, Math.PI, 0], round: 0.18 });

  // ================= TORSO: broad hunched fortress chest =================
  // second-widest in the roster — wide through the whole upper half
  A.lathe('torso', 'primary', [
    [chH * 0.1, W * 0.31],
    [chH * 0.38, W * 0.5],
    [chH * 0.66, W * 0.58],
    [chH * 0.94, W * 0.53],
    [chH * 1.1, W * 0.28],
  ], { scaleX: 1.42, scaleZ: 0.85, seg: 28 });
  // sloped hex armor plates over the pecs (roof-angled)
  for (const sx of [-1, 1]) {
    A.plate('torso', 'primary', hexOutline(W * 0.32, 0.82), 0.12 * s, {
      p: [sx * W * 0.36, chH * 0.82, W * 0.4], r: [-0.46, sx * 0.28, sx * 0.08], round: 0.14 });
    A.plate('torso', 'accent', hexOutline(W * 0.18, 0.85), 0.08 * s, {
      p: [sx * W * 0.56, chH * 0.62, W * 0.32], r: [-0.15, sx * 0.6, 0], round: 0.16 });
  }
  // central hex plate with the snowflake emblem
  A.custom('torso', snowMat,
    beveledPlate(hexOutline(W * 0.245, 0.95), 0.12 * s, { round: 0.12 }), {
      p: [0, chH * 0.56, W * 0.5], r: [-0.12, 0, 0] });
  // trapezius capsules bridging chest into the pauldrons
  for (const sx of [-1, 1]) {
    A.capsule('torso', 'frame', W * 0.13, W * 0.34, {
      p: [sx * W * 0.5, chH * 0.98, 0], r: [0, 0, sx * 1.05], s: [1, 1, 0.8] });
  }
  // tall collar the head sinks into
  A.tube('torso', 'frame', W * 0.24, W * 0.28, 0.26 * s, { p: [0, chH * 1.06, 0] });
  // abdomen rings with cyan glow slits
  for (let i = 0; i < 2; i++) {
    const ay = chH * (0.08 - i * 0.1);
    A.tube('torso', 'dark', W * (0.22 - i * 0.02), W * (0.24 - i * 0.02), 0.1 * s, { p: [0, ay, 0] });
    A.sharpBox('torso', 'glowSoft', [W * 0.24, 0.035 * s, 0.05 * s], {
      p: [0, ay, W * (0.25 - i * 0.02)] });
  }
  for (const sx of [-1, 1]) {
    A.piston('torso', 'brass', [sx * W * 0.19, chH * -0.04, W * 0.12],
      [sx * W * 0.42, chH * 0.3, W * 0.2], 0.05 * s);
  }
  // back: cryo plant housing + radiator vents + coolant drums + crystal growth
  A.facet('torso', 'accent', W * 0.44, W * 0.5, W * 0.4, chH * 0.6, {
    sides: 8, scaleZ: 0.5, p: [0, chH * 0.5, -W * 0.44] });
  A.vents('torso', 'dark', 5, W * 0.62, chH * 0.26, 0.06 * s, { p: [0, chH * 0.48, -W * 0.65] });
  for (const sx of [-1, 1]) {
    A.capsule('torso', 'metal', 0.15 * s, 0.48 * s, {
      p: [sx * W * 0.3, chH * 0.94, -W * 0.42], r: [0, 0, Math.PI / 2] });
  }
  iceCluster('torso', [
    [-0.42 * s, chH * 1.0, -W * 0.34, -0.55, 0.3, 0.7],
    [0.36 * s, chH * 1.04, -W * 0.36, -0.5, -0.35, 0.58],
    [0.02 * s, chH * 0.96, -W * 0.42, -0.75, 0.05, 0.46],
    [-0.16 * s, chH * 1.06, -W * 0.3, -0.35, 0.5, 0.34],
    [0.2 * s, chH * 0.9, -W * 0.44, -0.6, -0.15, 0.3],
  ]);

  // ================= HEAD: low, embedded, twin-bar cyan visor =================
  const hy = hs * 0.16; // barely any neck — skull sits in the collar
  const hz = hs * 0.3;  // whole face pushed forward clear of the chest rim
  A.tube('head', 'frame', hs * 0.5, hs * 0.58, hs * 0.4, { p: [0, hy * 0.5, 0] });
  // armored faceted skull
  A.facet('head', 'primary', hs * 0.82, hs * 1.0, hs * 0.5, hs * 1.3, {
    sides: 8, scaleZ: 1.1, p: [0, hy + hs * 0.62, hz] });
  // face assembly: dark recess, two horizontal glow bars, center grill
  A.sharpBox('head', 'dark', [hs * 1.5, hs * 0.72, hs * 0.24], { p: [0, hy + hs * 0.58, hz + hs * 0.78] });
  A.sharpBox('head', 'glow', [hs * 1.3, hs * 0.16, hs * 0.12], { p: [0, hy + hs * 0.84, hz + hs * 0.92] });
  A.sharpBox('head', 'glow', [hs * 1.1, hs * 0.13, hs * 0.12], { p: [0, hy + hs * 0.34, hz + hs * 0.9] });
  A.vents('head', 'dark', 4, hs * 0.9, hs * 0.18, hs * 0.14, { p: [0, hy + hs * 0.59, hz + hs * 0.88] });
  // heavy brow ledge over the visor
  A.plate('head', 'primary', rhombOutline(hs * 1.9, hs * 0.62, { cut: 0.26 }), hs * 0.6, {
    p: [0, hy + hs * 1.14, hz + hs * 0.42], r: [-0.35, 0, 0], round: 0.15 });
  // crown cap + chin guard
  A.plate('head', 'accent', rhombOutline(hs * 1.4, hs * 0.5, { cut: 0.3 }), hs * 0.4, {
    p: [0, hy + hs * 1.32, hz - hs * 0.15], r: [-0.1, 0, 0], round: 0.2 });
  A.plate('head', 'frame', shieldOutline(hs * 1.2, hs * 0.6, { taper: 0.7 }), hs * 0.3, {
    p: [0, hy + hs * 0.03, hz + hs * 0.5], r: [0.35, 0, 0], round: 0.2 });
  // small antenna off the right crown
  A.antenna('head', 'metal', 'glowSoft', hs * 1.0, {
    p: [hs * 0.62, hy + hs * 0.9, hz - hs * 0.6], r: [-0.15, 0, -0.22] });
  // frost breath: tiny translucent cones drifting down from the face vents
  iceCluster('head', [
    [-hs * 0.18, hy + hs * 0.42, hz + hs * 0.95, 2.55, 0.2, 0.16],
    [hs * 0.1, hy + hs * 0.38, hz + hs * 0.98, 2.7, -0.15, 0.13],
    [hs * 0.28, hy + hs * 0.44, hz + hs * 0.92, 2.45, 0.3, 0.1],
  ], mistMat);

  // ================= ARMS =================
  for (const side of ['L', 'R']) {
    const sx = side === 'L' ? -1 : 1;
    const sh = 'shoulder' + side, el = 'elbow' + side, ha = 'hand' + side;
    J[sh].position.x = sx * (D.shoulderW + 0.55 * s); // enormous shoulder span

    A.ball(sh, 'frame', 0.32 * s, {});
    // ---- giant slab pauldron: near-vertical beveled outer plates
    A.plate(sh, 'primary', shieldOutline(1.4 * s, 1.55 * s, { taper: 0.72 }), 0.55 * s, {
      p: [sx * 0.26 * s, 0.14 * s, 0], r: [0, sx * Math.PI / 2, sx * 0.06], round: 0.12 });
    // top cap slab, slightly roofed outward
    A.plate(sh, 'primary', shieldOutline(1.15 * s, 1.05 * s, { taper: 0.75 }), 0.18 * s, {
      p: [sx * 0.3 * s, 0.56 * s, 0], r: [-Math.PI / 2, 0, -sx * 0.12], round: 0.14 });
    // dark trim band under the slab
    A.plate(sh, 'dark', shieldOutline(1.2 * s, 1.3 * s, { taper: 0.7 }), 0.6 * s, {
      p: [sx * 0.2 * s, 0.04 * s, 0], r: [0, sx * Math.PI / 2, sx * 0.06], round: 0.14 });
    // outer face decal: GLACIER on the left slab, 08 on the right
    A.custom(sh, plateMat('primary', side === 'L'
      ? { text: 'GLACIER', textY: 0.46, textScale: 0.165, color: '#2e3c48' }
      : { text: '08', textY: 0.5, textScale: 0.4, color: '#2e3c48' }),
    beveledPlate(shieldOutline(1.16 * s, 1.28 * s, { taper: 0.74 }), 0.09 * s, { round: 0.12 }), {
      p: [sx * 0.58 * s, 0.12 * s, 0], r: [0, sx * Math.PI / 2, sx * 0.06] });
    // ---- crystal crown: 6 translucent shards, tallest ~0.8x head height
    iceCluster(sh, [
      [sx * 0.2 * s, 0.62 * s, -0.12 * s, -0.12, -sx * 0.42, 1.2],
      [sx * 0.46 * s, 0.58 * s, 0.18 * s, 0.18, -sx * 0.68, 0.82],
      [-sx * 0.02 * s, 0.64 * s, 0.24 * s, 0.26, -sx * 0.2, 0.62],
      [sx * 0.54 * s, 0.56 * s, -0.28 * s, -0.3, -sx * 0.8, 0.58],
      [sx * 0.06 * s, 0.64 * s, -0.36 * s, -0.4, -sx * 0.3, 0.46],
      [-sx * 0.16 * s, 0.6 * s, 0.04 * s, 0.05, -sx * 0.1, 0.36],
    ]);

    // thick upper arm
    A.lathe(sh, 'primary', [
      [-D.upperArmLen * 1.0, 0.24 * s],
      [-D.upperArmLen * 0.55, 0.31 * s],
      [-D.upperArmLen * 0.1, 0.25 * s],
    ], { p: [sx * 0.04 * s, 0, 0], seg: 16 });
    // elbow drum
    A.part(el, 'metal', new THREE.CylinderGeometry(0.21 * s, 0.21 * s, 0.46 * s, 12), {
      r: [0, 0, Math.PI / 2] });

    if (side === 'L') {
      // ---- heavy layered arm + big articulated gauntlet fist
      A.facet(el, 'primary', 0.38 * s, 0.52 * s, 0.42 * s, F * 1.0, {
        sides: 6, scaleZ: 1.05, p: [0, -F * 0.52, 0] });
      A.plate(el, 'accent', hexOutline(0.34 * s, 1.25), 0.08 * s, {
        p: [0, -F * 0.5, 0.48 * s], round: 0.16 });
      A.plate(el, 'primary', hexOutline(0.3 * s, 1.2), 0.07 * s, {
        p: [sx * 0.5 * s, -F * 0.52, 0], r: [0, sx * Math.PI / 2, 0], round: 0.16 });
      A.ring(el, 'dark', 0.46 * s, 0.045 * s, { p: [0, -F * 0.86, 0], r: [Math.PI / 2, 0, 0] });
      A.piston(el, 'brass', [sx * 0.3 * s, -0.08 * s, -0.24 * s],
        [sx * 0.3 * s, -F * 0.66, -0.3 * s], 0.05 * s);
      // gauntlet: wrist collar, big rounded core, segmented block fingers, thumb
      const fw = 0.48 * s;
      A.tube(ha, 'frame', 0.34 * s, 0.38 * s, 0.3 * s, { p: [0, 0.1 * s, 0] });
      A.part(ha, 'frame', roundedBox(fw * 1.9, fw * 1.55, fw * 1.7, fw * 0.38), {
        p: [0, -fw * 0.78, fw * 0.08] });
      for (let i = 0; i < 4; i++) {
        A.part(ha, 'frame', roundedBox(fw * 0.4, fw * 0.55, fw * 0.6, fw * 0.13), {
          p: [(i - 1.5) * fw * 0.44, -fw * 0.98, fw * 0.9] });
        A.part(ha, 'dark', roundedBox(fw * 0.32, fw * 0.34, fw * 0.24, fw * 0.09), {
          p: [(i - 1.5) * fw * 0.44, -fw * 1.36, fw * 0.93] });
      }
      A.part(ha, 'frame', roundedBox(fw * 0.44, fw * 0.66, fw * 0.5, fw * 0.14), {
        p: [sx * fw * 1.0, -fw * 0.68, fw * 0.3], r: [0.35, 0, sx * 0.35] });
      // layered plates over the hand back
      A.plate(ha, 'primary', hexOutline(fw * 0.62, 0.9), 0.08 * s, {
        p: [0, -fw * 0.3, fw * 0.85], r: [0.3, 0, 0], round: 0.16 });
      A.plate(ha, 'accent', hexOutline(fw * 0.5, 0.9), 0.07 * s, {
        p: [0, -fw * 0.5, -fw * 0.8], r: [-0.2, 0, 0], round: 0.18 });
    } else {
      // ============ CRYO CANNON: the whole right forearm ============
      J[ha].position.y = -(F + 0.3 * s); // longer than a normal forearm
      // drum section 1: fat 8-sided facet housing off the elbow
      A.facet(el, 'accent', 0.44 * s, 0.56 * s, 0.46 * s, F * 0.46, {
        sides: 8, p: [0, -F * 0.26, 0] });
      A.ring(el, 'dark', 0.44 * s, 0.05 * s, { p: [0, -F * 0.5, 0], r: [Math.PI / 2, 0, 0] });
      // drum section 2
      A.facet(el, 'primary', 0.42 * s, 0.5 * s, 0.4 * s, F * 0.4, {
        sides: 8, p: [0, -F * 0.72, 0] });
      A.ring(el, 'metal', 0.4 * s, 0.045 * s, { p: [0, -F * 0.93, 0], r: [Math.PI / 2, 0, 0] });
      // side hex plates + pistons on the first drum
      for (const px of [-1, 1]) {
        A.plate(el, 'primary', hexOutline(0.3 * s, 1.15), 0.07 * s, {
          p: [px * 0.5 * s, -F * 0.28, 0], r: [0, px * Math.PI / 2, 0], round: 0.16 });
        A.piston(el, 'brass', [px * 0.3 * s, -0.06 * s, -0.28 * s],
          [px * 0.28 * s, -F * 0.5, -0.36 * s], 0.05 * s);
      }
      // frost buildup hugging the housing
      iceCluster(el, [
        [0.3 * s, -F * 0.3, 0.28 * s, 0.6, -0.4, 0.32],
        [0.38 * s, -F * 0.46, 0.12 * s, 0.75, -0.6, 0.24],
        [-0.26 * s, -F * 0.38, 0.26 * s, 0.6, 0.5, 0.2],
      ]);

      // ---- coil core on the hand joint: glowing tube in a clear sleeve,
      //      wrapped by four metal rings
      A.tube(ha, 'glowSoft', 0.16 * s, 0.16 * s, 0.6 * s, { p: [0, 0.02 * s, 0] });
      A.custom(ha, icePhys, cyl(0.26 * s, 0.26 * s, 0.56 * s, 14), { p: [0, 0.02 * s, 0] });
      for (let i = 0; i < 4; i++) {
        A.ring(ha, 'metal', 0.28 * s, 0.035 * s, {
          p: [0, 0.24 * s - i * 0.15 * s, 0], r: [Math.PI / 2, 0, 0] });
      }
      // dark collar
      A.tube(ha, 'dark', 0.34 * s, 0.3 * s, 0.3 * s, { p: [0, -0.42 * s, 0] });
      // muzzle block: recessed glow ring + core between the prongs
      A.facet(ha, 'metal', 0.32 * s, 0.36 * s, 0.26 * s, 0.34 * s, { sides: 8, p: [0, -0.72 * s, 0] });
      A.tube(ha, 'dark', 0.18 * s, 0.18 * s, 0.2 * s, { p: [0, -0.92 * s, 0] });
      A.ring(ha, 'glowSoft', 0.2 * s, 0.032 * s, { p: [0, -0.94 * s, 0], r: [Math.PI / 2, 0, 0] });
      A.ball(ha, 'glow', 0.075 * s, { p: [0, -1.0 * s, 0], seg: 10 });
      // three long frost prongs (~0.5 forearm length) raking past the muzzle
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 + Math.PI / 2;
        const dir = new THREE.Vector3(Math.cos(a) * 0.16, -1, Math.sin(a) * 0.16).normalize();
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
        const e = new THREE.Euler().setFromQuaternion(q);
        A.spike(ha, 'metal', 0.06 * s, F * 0.5, {
          p: [Math.cos(a) * 0.3 * s + dir.x * F * 0.2, -0.8 * s + dir.y * F * 0.2,
            Math.sin(a) * 0.3 * s + dir.z * F * 0.2],
          r: [e.x, e.y, e.z], seg: 5 });
      }
    }
  }

  // ================= LEGS: hex-plated towers, huge flat feet =================
  for (const side of ['L', 'R']) {
    const sx = side === 'L' ? -1 : 1;
    const th = 'thigh' + side, kn = 'knee' + side, an = 'ankle' + side;

    A.ball(th, 'frame', 0.3 * s, {});
    A.lathe(th, 'primary', [
      [-D.thighLen * 1.0, 0.28 * s],
      [-D.thighLen * 0.55, 0.4 * s],
      [-D.thighLen * 0.08, 0.31 * s],
    ], { scaleZ: 1.12, seg: 20 });
    // hex armor wraps: outer + front
    A.plate(th, 'accent', hexOutline(0.32 * s, 1.35), 0.08 * s, {
      p: [sx * 0.38 * s, -D.thighLen * 0.48, 0.02 * s], r: [0, sx * Math.PI / 2, 0], round: 0.16 });
    A.plate(th, 'primary', hexOutline(0.28 * s, 1.3), 0.09 * s, {
      p: [0, -D.thighLen * 0.45, 0.36 * s], r: [0.08, 0, 0], round: 0.16 });

    // knee drum + shield
    A.part(kn, 'metal', new THREE.CylinderGeometry(0.23 * s, 0.23 * s, 0.5 * s, 12), {
      r: [0, 0, Math.PI / 2] });
    A.plate(kn, 'accent', shieldOutline(0.54 * s, 0.66 * s, { taper: 0.64 }), 0.1 * s, {
      p: [0, -0.02 * s, 0.34 * s], r: [0.15, 0, 0], round: 0.18 });
    A.piston(kn, 'brass', [0, 0.12 * s, -0.26 * s], [0, -D.shinLen * 0.4, -0.32 * s], 0.05 * s);

    // shin tower
    A.lathe(kn, 'primary', [
      [-D.shinLen * 1.0, 0.28 * s],
      [-D.shinLen * 0.64, 0.4 * s],
      [-D.shinLen * 0.28, 0.44 * s],
      [-D.shinLen * 0.05, 0.29 * s],
    ], { scaleZ: 1.16, seg: 20 });
    // stacked hex/shield front guards
    A.plate(kn, 'primary', hexOutline(0.3 * s, 1.2), 0.09 * s, {
      p: [0, -D.shinLen * 0.4, 0.4 * s], r: [0.05, 0, 0], round: 0.14 });
    A.plate(kn, 'primary', shieldOutline(0.56 * s, 0.66 * s, { taper: 0.72 }), 0.09 * s, {
      p: [0, -D.shinLen * 0.78, 0.36 * s], r: [-0.05, 0, 0], round: 0.16 });
    // '132' station plate on the outer calf
    A.custom(kn, plateMat('accent', { text: '132', textScale: 0.26, textY: 0.48, color: '#eaf6ff', alpha: 0.85 }),
      beveledPlate(rhombOutline(0.5 * s, D.shinLen * 0.52, { cut: 0.26 }), 0.07 * s, { round: 0.14 }), {
        p: [sx * 0.42 * s, -D.shinLen * 0.5, 0], r: [0, sx * Math.PI / 2, 0] });
    // small ice crystals sprouting from the shin tops
    iceCluster(kn, [
      [sx * 0.16 * s, -D.shinLen * 0.24, 0.34 * s, 0.5, -sx * 0.35, 0.3],
      [-sx * 0.06 * s, -D.shinLen * 0.3, 0.38 * s, 0.62, sx * 0.2, 0.2],
    ]);

    // ankle + HUGE flat foot
    A.ball(an, 'frame', 0.2 * s, {});
    A.part(an, 'primary', roundedBox(1.0 * s, 0.26 * s, 1.3 * s, 0.08 * s), {
      p: [0, -0.1 * s, 0.14 * s] });
    for (const tx of [-0.28, 0.28]) {
      A.taper(an, 'frame', [0.3 * s, 0.28 * s, 0.42 * s], 0.8, 0.45, {
        p: [tx * s, -0.14 * s, 0.74 * s], r: [Math.PI / 2.2, 0, 0] });
    }
    A.taper(an, 'frame', [0.76 * s, 0.26 * s, 0.42 * s], 0.8, 0.7, { p: [0, -0.1 * s, -0.46 * s] });
    A.sharpBox(an, 'dark', [1.0 * s, 0.1 * s, 1.62 * s], { p: [0, -0.27 * s, 0.1 * s] });
  }

  // CONTRACT: muzzleR at the cryo-cannon muzzle center between the prongs
  anchors.muzzleR = addAnchor(J.handR, 0, -1.0 * s, 0);
  anchors.core = addAnchor(J.torso, 0, chH * 0.58, W * 0.4);
}
