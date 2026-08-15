// JERRY — the tide-bringer, matched to docs/canonical/mech_jerry.png:
// a giant robo-SHRIMP. Huge bulging segmented carapace torso-head in
// weathered coral pink over a black mech frame, pointed rostrum snout
// aimed down-forward with red bead eyes and long whip antennae, a nest of
// MANY small pink claw-arms wriggling under the chest, two enormous
// shoulder cannon pods (dark bores, red glow — live shrimp-fleas crawling
// out of the muzzles), and four wide-splayed grasshopper legs: thick
// coral femurs angling down-out to high knees, long segmented black
// tibias with spur rows down to small clawed feet. Rusty, riveted, wet.
import * as THREE from 'three';
import { beveledPlate, shieldOutline, rhombOutline, sphere, cone } from '../parts.js';
import { decalTexture } from '../../core/pbrtex.js';
import { baseFrame, standardArm, addAnchor } from '../factory.js';
import { addJoint } from './common.js';

export function jerry(A, D, J, anchors, def) {
  const s = D.scale;
  const W = D.torsoW;
  const chH = D.torsoH;

  const plateMat = (decal) => {
    const tex = decalTexture({ seed: def.seed + 3, ...def.skin.primary }, decal);
    return new THREE.MeshStandardMaterial({
      map: tex.map, normalMap: tex.normalMap,
      roughnessMap: tex.rmMap, metalnessMap: tex.rmMap,
      roughness: 1, metalness: 1,
    });
  };
  // olive-drab band material for the shell seam rings (canonical greenish seams)
  const olive = new THREE.MeshStandardMaterial({ color: 0x8a8a5c, roughness: 0.62, metalness: 0.4 });
  // place a +Y tube EXACTLY between two local points (for antennae / struts)
  const _q = new THREE.Quaternion();
  const _e = new THREE.Euler();
  const strut = (joint, mat, r0, r1, from, to) => {
    const d = new THREE.Vector3(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
    const len = d.length();
    _q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize());
    _e.setFromQuaternion(_q);
    A.tube(joint, mat, r0, r1, len, {
      p: [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2],
      r: [_e.x, _e.y, _e.z],
    });
  };

  // a tiny robo-shrimp critter (the living ammo, peeking out of a muzzle)
  const critter = (joint, x, y, z, sc, ry = 0) => {
    A.capsule(joint, 'primary', 0.09 * s * sc, 0.16 * s * sc, {
      p: [x, y, z], r: [Math.PI / 2 - 0.4, ry, 0] });
    A.blade(joint, 'primary', 0.14 * s * sc, 0.08 * s * sc, 0.02 * s * sc, {
      p: [x, y - 0.05 * s * sc, z - 0.14 * s * sc], r: [-1.0, ry, 0], taper: 0.3 });
    A.ball(joint, 'glow', 0.02 * s * sc, { p: [x + 0.04 * s * sc, y + 0.06 * s * sc, z + 0.1 * s * sc], seg: 6 });
    for (let i = 0; i < 3; i++) {
      A.spike(joint, 'dark', 0.008 * s * sc, 0.08 * s * sc, {
        p: [x + (i - 1) * 0.03 * s * sc, y - 0.08 * s * sc, z + 0.02 * s * sc], r: [Math.PI - 0.4, 0, (i - 1) * 0.5], seg: 4 });
    }
  };

  // ================= FRAME =================
  baseFrame(A, D);
  // dark segmented under-belly bridging pelvis to shell
  for (let i = 0; i < 3; i++) {
    A.tube('hips', 'dark', W * (0.3 - i * 0.03), W * (0.34 - i * 0.03), 0.14 * s, {
      p: [0, (0.34 - i * 0.16) * s, 0.04 * s], seg: 14 });
  }

  // ================= BULGING CARAPACE TORSO-HEAD =================
  // one huge shrimp-shell egg: widest just above mid, tapering to the crown.
  // Stepped profile jogs read as overlapping shell segments.
  A.lathe('torso', 'primary', [
    [chH * -0.05, W * 0.46],
    [chH * 0.16, W * 0.60],
    [chH * 0.17, W * 0.63],
    [chH * 0.42, W * 0.68],
    [chH * 0.43, W * 0.71],
    [chH * 0.70, W * 0.66],
    [chH * 0.71, W * 0.68],
    [chH * 0.95, W * 0.52],
    [chH * 1.12, W * 0.28],
    [chH * 1.2, 0.06 * s],
  ], { seg: 24, scaleZ: 0.88 });
  // olive seam bands at the segment steps
  for (const [y, r] of [[0.17, 0.62], [0.43, 0.70], [0.71, 0.67]]) {
    A.custom('torso', olive, new THREE.TorusGeometry(W * r * 0.985, 0.045 * s, 6, 24), {
      p: [0, chH * y, 0], r: [Math.PI / 2, 0, 0], s: [1, 0.88, 1] });
  }
  // shingled back plates running down the spine (shrimp abdomen hint)
  for (let i = 0; i < 4; i++) {
    A.plate('torso', 'primary', shieldOutline(W * (0.56 - i * 0.08), 0.62 * s, { taper: 0.72 }), 0.07 * s, {
      p: [0, chH * (0.92 - i * 0.22), -W * (0.5 + i * 0.045)], r: [-1.15 - i * 0.1, 0, 0], round: 0.12 });
  }
  // crown spikelets
  for (let i = 0; i < 3; i++) {
    A.spike('torso', 'dark', 0.035 * s, (0.3 - i * 0.06) * s, {
      p: [0, chH * (1.16 - i * 0.03), (0.12 - i * 0.18) * s], seg: 5 });
  }
  // JERRY decal + chevron sigil, front-center of the shell
  A.custom('torso', plateMat({ text: 'JERRY', textY: 0.34, textScale: 0.2, emblem: true, emblemY: 0.66, emblemScale: 0.14, color: '#e8e0d6' }),
    beveledPlate(shieldOutline(W * 0.5, 0.92 * s, { taper: 0.85 }), 0.05 * s, { round: 0.12 }), {
      p: [0, chH * 0.72, W * 0.56], r: [0.42, 0, 0] });
  // rivet dots down the front seams
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      A.ball('torso', 'metal', 0.03 * s, { p: [sx * W * 0.3, chH * (0.9 - i * 0.18), W * (0.52 - i * 0.015)], seg: 6 });
    }
  }

  // ================= SHRIMP HEAD: ROSTRUM + EYES + ANTENNAE =================
  const hy = 0.02 * s, hz = 0.42 * s;
  // brow cowl over the face
  A.taper('head', 'primary', [W * 0.56, 0.34 * s, 0.6 * s], 0.7, 0.75, {
    p: [0, hy + 0.16 * s, hz], r: [0.35, 0, 0] });
  // pointed rostrum: long serrated wedge aimed down-forward — the beak that
  // makes the whole face read shrimp
  A.blade('head', 'primary', 1.5 * s, 0.46 * s, 0.2 * s, {
    p: [0, hy - 0.42 * s, hz + 0.5 * s], r: [Math.PI / 2 + 0.85, 0, 0], taper: 0.08 });
  for (let i = 0; i < 3; i++) { // serration teeth on top of the rostrum
    A.spike('head', 'metal', 0.025 * s, 0.09 * s, {
      p: [0, hy - 0.1 * s - i * 0.16 * s, hz + 0.42 * s + i * 0.13 * s], r: [0.5, 0, 0], seg: 4 });
  }
  // red bead eyes on short stalks
  for (const sx of [-1, 1]) {
    A.tube('head', 'dark', 0.045 * s, 0.055 * s, 0.14 * s, {
      p: [sx * W * 0.24, hy + 0.05 * s, hz + 0.3 * s], r: [1.1, 0, sx * 0.5] });
    A.ball('head', 'glow', 0.085 * s, { p: [sx * W * 0.28, hy + 0.02 * s, hz + 0.38 * s], seg: 10 });
  }
  // mandible fringe: rows of little dark grabbers under the rostrum
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      A.spike('head', 'dark', 0.03 * s, (0.22 - i * 0.04) * s, {
        p: [sx * (0.1 + i * 0.08) * s, hy - 0.3 * s, hz + 0.24 * s - i * 0.06 * s],
        r: [Math.PI - 0.5, 0, sx * (0.3 + i * 0.25)], seg: 4 });
    }
  }
  // ANTENNAE on their own joints — long coral whips sweeping up and back,
  // twitched nervously by the animator. Segments are aimed point-to-point.
  for (const side of ['L', 'R']) {
    const sx = side === 'L' ? -1 : 1;
    const ant = addJoint(J, 'ant' + side, 'head', sx * W * 0.14, hy + 0.28 * s, hz + 0.24 * s);
    const p0 = [0, 0, 0];
    const p1 = [sx * 0.45 * s, 0.7 * s, -0.6 * s];
    const p2 = [sx * 1.05 * s, 1.05 * s, -1.75 * s];
    strut('ant' + side, 'primary', 0.024 * s, 0.04 * s, p0, p1);
    strut('ant' + side, 'primary', 0.012 * s, 0.024 * s, p1, p2);
    A.ball('ant' + side, 'dark', 0.045 * s, { p: p1, seg: 6 });
    ant.rotation.set(-0.2, 0, sx * 0.25);
    // short whisker pair drooping forward-down under the rostrum (static)
    A.tube('head', 'primary', 0.014 * s, 0.022 * s, 1.1 * s, {
      p: [sx * 0.12 * s, hy - 0.5 * s, hz + 0.62 * s], r: [Math.PI / 2 - 0.45, 0, sx * 0.3] });
  }

  // ================= THE ARM NEST (many small claw-arms) =================
  // three pairs of little segmented arms wriggling under the chest —
  // each on its own joint so the animator ripples them in a wave
  for (let i = 0; i < 3; i++) {
    for (const side of ['L', 'R']) {
      const sx = side === 'L' ? -1 : 1;
      const nm = 'armS' + i + side;
      // rooted proud of the shell surface so the nest is VISIBLE
      addJoint(J, nm, 'torso', sx * W * (0.5 - i * 0.04), chH * (0.3 - i * 0.15), W * (0.52 - i * 0.02));
      const len = (0.52 - i * 0.06) * s;
      // upper segment: out-down
      A.capsule(nm, 'primary', 0.055 * s, len * 0.5, {
        p: [sx * len * 0.22, -len * 0.28, 0.05 * s], r: [0.3, 0, sx * 0.75] });
      A.ball(nm, 'dark', 0.06 * s, { p: [sx * len * 0.44, -len * 0.5, 0.1 * s], seg: 8 });
      // forearm: in-down-forward
      A.capsule(nm, 'primary', 0.045 * s, len * 0.45, {
        p: [sx * len * 0.38, -len * 0.78, 0.2 * s], r: [0.9, 0, -sx * 0.3] });
      // mini pincer
      A.spike(nm, 'metal', 0.03 * s, 0.16 * s, {
        p: [sx * len * 0.3, -len * 0.98, 0.34 * s], r: [Math.PI / 2 + 0.4, 0, sx * 0.3], seg: 4 });
      A.spike(nm, 'metal', 0.025 * s, 0.13 * s, {
        p: [sx * len * 0.36, -len * 0.98, 0.32 * s], r: [Math.PI / 2 - 0.3, 0, sx * 0.3], seg: 4 });
    }
  }
  // two fixed belly gun stubs between the nest rows
  for (const sx of [-1, 1]) {
    A.tube('torso', 'dark', 0.07 * s, 0.09 * s, 0.5 * s, {
      p: [sx * W * 0.16, chH * 0.02, W * 0.34], r: [Math.PI / 2 - 0.2, 0, 0] });
    A.ring('torso', 'glow', 0.075 * s, 0.02 * s, { p: [sx * W * 0.16, chH * -0.02, W * 0.55], r: [0.2, 0, 0] });
  }

  // ================= MAIN ARMS -> SHRIMP CANNON PODS =================
  for (const side of ['L', 'R']) {
    const sx = side === 'L' ? -1 : 1;
    standardArm(A, D, side, { fist: false, foreArmor: false, bulk: 0.85 });
    const el = 'elbow' + side;
    // the forearm IS a huge cannon pod aimed forward
    const bl = 1.7 * s;
    A.facet(el, 'primary', 0.34 * s, 0.42 * s, 0.3 * s, 0.7 * s, {
      sides: 8, p: [0, -0.2 * s, 0], r: [Math.PI / 2, 0, 0] });
    A.tube(el, 'primary', 0.26 * s, 0.3 * s, bl * 0.72, { p: [0, -0.16 * s, bl * 0.3], r: [Math.PI / 2, 0, 0] });
    // riveted band + olive ring
    A.custom(el, olive, new THREE.TorusGeometry(0.295 * s, 0.028 * s, 6, 18), { p: [0, -0.16 * s, bl * 0.34] });
    A.ring(el, 'metal', 0.29 * s, 0.024 * s, { p: [0, -0.16 * s, bl * 0.52] });
    // dark muzzle housing + RED glowing bore
    A.tube(el, 'dark', 0.24 * s, 0.27 * s, 0.34 * s, { p: [0, -0.16 * s, bl * 0.72], r: [Math.PI / 2, 0, 0] });
    A.ring(el, 'glow', 0.17 * s, 0.045 * s, { p: [0, -0.16 * s, bl * 0.86] });
    A.custom(el, new THREE.MeshStandardMaterial({ color: 0x0c0a08, roughness: 0.9 }),
      new THREE.CylinderGeometry(0.16 * s, 0.16 * s, 0.1 * s, 14), {
        p: [0, -0.16 * s, bl * 0.84], r: [Math.PI / 2, 0, 0] });
    // a live flea CRAWLING OUT of the muzzle — the ammo is alive
    critter(el, sx * 0.08 * s, -0.04 * s, bl * 0.82, 1.1, sx * 0.5);
    anchors['muzzle' + side] = addAnchor(J[el], 0, -0.16 * s, bl * 0.9);
  }

  // ================= GRASSHOPPER LEGS =================
  for (const side of ['L', 'R']) {
    const sx = side === 'L' ? -1 : 1;
    const th = 'thigh' + side, kn = 'knee' + side, an = 'ankle' + side;
    // hip ball
    A.ball(th, 'frame', 0.24 * s, {});
    // THICK coral femur with armor plate + sigil decal
    A.tube(th, 'frame', 0.14 * s, 0.17 * s, D.thighLen, { p: [0, -D.thighLen / 2, 0] });
    A.taper(th, 'primary', [0.52 * s, D.thighLen * 0.92, 0.5 * s], 0.72, 0.82, {
      p: [sx * 0.02 * s, -D.thighLen * 0.46, 0.02 * s] });
    A.custom(th, plateMat({ emblem: true, emblemScale: 0.3, color: '#e8e0d6' }),
      beveledPlate(rhombOutline(0.3 * s, 0.44 * s, { cut: 0.3 }), 0.04 * s, { round: 0.12 }), {
        p: [sx * 0.24 * s, -D.thighLen * 0.4, 0.03 * s], r: [0, sx * Math.PI / 2, 0] });
    // spring piston along the femur's back edge
    A.piston(th, 'metal', [sx * 0.1 * s, -0.12 * s, -0.18 * s],
      [sx * 0.06 * s, -D.thighLen * 0.9, -0.14 * s], 0.045 * s);
    // big knee knuckle
    A.part(kn, 'metal', new THREE.CylinderGeometry(0.19 * s, 0.19 * s, 0.34 * s, 10), {
      r: [0, 0, Math.PI / 2] });
    A.taper(kn, 'primary', [0.32 * s, 0.4 * s, 0.3 * s], 0.7, 0.7, { p: [0, -0.02 * s, 0.2 * s] });
    // long SEGMENTED tibia: alternating dark/coral tube sections
    for (let i = 0; i < 3; i++) {
      A.tube(kn, i % 2 ? 'primary' : 'dark', (0.15 - i * 0.02) * s, (0.17 - i * 0.02) * s, D.shinLen * 0.36, {
        p: [0, -D.shinLen * (0.18 + i * 0.32), 0.02 * s] });
      A.ring(kn, 'metal', (0.17 - i * 0.02) * s, 0.022 * s, {
        p: [0, -D.shinLen * (0.34 + i * 0.32), 0.02 * s], r: [Math.PI / 2, 0, 0] });
    }
    // grasshopper spur row down the tibia's back edge
    for (let i = 0; i < 4; i++) {
      A.spike(kn, 'metal', 0.028 * s, (0.16 - i * 0.02) * s, {
        p: [0, -D.shinLen * (0.25 + i * 0.2), -0.14 * s], r: [Math.PI - 0.5, 0, 0], seg: 4 });
    }
    // small clawed foot: pointed toe pair + heel spur
    A.taper(an, 'frame', [0.3 * s, 0.2 * s, 0.5 * s], 0.7, 0.5, { p: [0, -0.12 * s, 0.12 * s] });
    for (const tx of [-1, 1]) {
      A.spike(an, 'metal', 0.05 * s, 0.34 * s, {
        p: [tx * 0.09 * s, -0.16 * s, 0.3 * s], r: [Math.PI / 2 - 0.25, 0, tx * 0.12], seg: 5 });
    }
    A.spike(an, 'dark', 0.045 * s, 0.22 * s, { p: [0, -0.1 * s, -0.2 * s], r: [Math.PI + 0.6, 0, 0], seg: 5 });
  }

  // ================= REAR DECOR LEG PAIR (the 4-legged read) =================
  // aimed point-to-point so femur, knee and tibia actually connect
  for (const side of ['L', 'R']) {
    const sx = side === 'L' ? -1 : 1;
    const nm = 'legD' + side;
    addJoint(J, nm, 'hips', sx * (D.hipW * 0.7), 0.15 * s, -0.5 * s);
    const kneePt = [sx * 1.35 * s, 0.55 * s, -0.85 * s];   // high outboard knee
    const footPt = [sx * 1.7 * s, -(D.hipHeight + 0.1 * s), -1.25 * s];
    strut(nm, 'primary', 0.1 * s, 0.13 * s, [0, 0, 0], kneePt);
    A.ball(nm, 'dark', 0.13 * s, { p: kneePt, seg: 8 });
    strut(nm, 'dark', 0.045 * s, 0.075 * s, kneePt, footPt);
    A.spike(nm, 'metal', 0.05 * s, 0.28 * s, {
      p: footPt, r: [Math.PI, 0, 0], seg: 5 });
  }

  anchors.core = addAnchor(J.torso, 0, chH * 0.4, W * 0.5);
}

