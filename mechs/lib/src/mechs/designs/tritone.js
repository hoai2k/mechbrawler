// TRITONE — "The Walking Siege", matched to docs/canonical/mech_tritone.png:
// a cybernetic TRICERATOPS war-platform on four columnar legs. Long low
// body of pebbled grey-brown hide under shingled olive-drab and rust-orange
// armor with orange seam glow; a huge bony neck frill crowned with a dense
// ring of rocket tubes; three bone horns (two long forward-curving brow
// horns, one nose horn) on metal collars; an organic beaked face with a
// hinged jaw, furrowing brows and a live eye under each bony ridge; two
// long multi-barrel flank cannons firing forward PAST the head, fed by
// ammo chains out of the ribs; an armored artillery howdah with an amber
// canopy over the hips; and a long segmented armored tail.
//
// QUADRUPED BODY PLAN: the rig's ARM chain is the FRONT legs
// (shoulder/elbow/hand, "hand" = front foot) and the LEG chain is the REAR
// legs. The torso is re-laid HORIZONTALLY along +Z: everything below is
// placed off a body axis running from the hips (rear) to the chest (front),
// and the front-leg joints are lifted to exactly the height that puts their
// feet on the same ground plane as the rear ones, whatever the roster's
// arm/leg proportions are.
import * as THREE from 'three';
import { rhombOutline, shieldOutline } from '../parts.js';
import { addAnchor } from '../factory.js';
import { addJoint } from './common.js';

export function tritone(A, D, J, anchors, def) {
  const s = D.scale;
  const W = D.torsoW;
  const hs = D.headSize;
  const ua = D.upperArmLen, fa = D.foreArmLen;
  const bulk = D.bulk;

  // ---- body axis -----------------------------------------------------
  // rear ankle height in HIPS space, then the front-leg (shoulder) joint
  // height in TORSO space that lands the front feet on the same plane.
  const rearFootY = -0.1 * s - D.thighLen - D.shinLen;
  const shY = rearFootY - 0.18 * s + ua + fa;
  const BL = 2.3 * s;                       // hips → front-leg reach along +Z
  const bz0 = -0.9 * s, bz1 = BL + 0.5 * s; // body extent (torso space)
  const bLen = bz1 - bz0;
  const RPROF = [0.66, 0.80, 0.87, 0.80, 0.64];   // ribcage radius ×W
  const bodyR = (t) => W * (RPROF[Math.min(4, Math.floor(t * 5))]);
  // the back RISES toward the high shoulder hump, as in the concept
  const bodyY = (t) => 0.1 * s + t * (shY + 0.34 * s - 0.1 * s);

  // cone whose BASE sits at p, axis along the rotated local +Y; returns the
  // TIP, so horn segments chain and anchors land exactly on the point.
  const _eu = new THREE.Euler(), _dir = new THREE.Vector3();
  const coneAt = (joint, mat, r, len, p, rot, seg = 10) => {
    _dir.set(0, 1, 0).applyEuler(_eu.set(rot[0], rot[1], rot[2]));
    A.spike(joint, mat, r, len, {
      p: [p[0] + _dir.x * len * 0.5, p[1] + _dir.y * len * 0.5, p[2] + _dir.z * len * 0.5],
      r: rot, seg });
    return [p[0] + _dir.x * len, p[1] + _dir.y * len, p[2] + _dir.z * len];
  };

  // ================= BODY: hide barrel + shingled armor =================
  for (let i = 0; i < 5; i++) {
    const t = (i + 0.5) / 5;
    const cz = bz0 + bLen * t, cy = bodyY(t);
    const rr = bodyR(t), rPrev = bodyR(Math.max(0, t - 0.2)), rNext = bodyR(Math.min(0.99, t + 0.2));
    // pebbled organic hide core (8-sided so armor plates sit flat on it)
    A.facet('torso', 'frame', (rr + rPrev) * 0.5, rr, (rr + rNext) * 0.5, bLen * 0.235, {
      sides: 8, scaleX: 1.06, scaleZ: 0.92, p: [0, cy, cz], r: [Math.PI / 2, 0, 0] });
    // olive spine plate + rust flank plates shingled back-to-front
    A.plate('torso', 'primary', rhombOutline(rr * 1.15, bLen * 0.26, { cut: 0.3 }), 0.09 * s, {
      p: [0, cy + rr * 0.84, cz], r: [-Math.PI / 2 + 0.08, 0, 0], round: 0.2 });
    for (const sx of [-1, 1]) {
      A.plate('torso', i === 2 || i === 3 ? 'accent' : 'primary',
        rhombOutline(bLen * 0.24, rr * 0.95, { cut: 0.3 }), 0.08 * s, {
          p: [sx * rr * 0.95, cy + rr * 0.12, cz], r: [0, sx * (Math.PI / 2 - 0.1), 0], round: 0.18 });
      // orange seam glow between the plate courses
      A.sharpBox('torso', 'glow', [0.05 * s, rr * 0.8, 0.05 * s], {
        p: [sx * rr * 0.99, cy + rr * 0.1, cz + bLen * 0.12], r: [0, 0, sx * 0.25] });
      // dark belly ribbing under the plate line
      A.tube('torso', 'dark', rr * 0.34, rr * 0.34, bLen * 0.2, {
        p: [sx * rr * 0.42, cy - rr * 0.72, cz], r: [Math.PI / 2, 0, 0], seg: 8 });
    }
  }
  // shoulder hump over the front legs + dark neck root socket
  A.facet('torso', 'primary', W * 0.7, W * 0.78, W * 0.5, 0.9 * s, {
    sides: 8, scaleZ: 1.5, p: [0, bodyY(0.9) + W * 0.5, BL * 0.72] });
  A.tube('torso', 'dark', W * 0.34, W * 0.44, 0.5 * s, {
    p: [0, shY + 0.5 * s, BL + 0.42 * s], r: [1.2, 0, 0] });
  A.vents('torso', 'dark', 4, W * 0.5, 0.16 * s, 0.07 * s, {
    p: [0, bodyY(0.12) + bodyR(0.12) * 0.55, bz0 + 0.24 * s], r: [0.3, 0, 0] });

  // ================= HOWDAH: artillery pod over the hips =================
  const hwY = bodyY(0.3) + bodyR(0.3) * 0.92, hwZ = bz0 + bLen * 0.3;
  A.taper('torso', 'accent', [W * 0.95, 0.28 * s, W * 1.05], 1.0, 1.0, { p: [0, hwY, hwZ] });
  A.taper('torso', 'primary', [W * 0.8, 0.72 * s, W * 0.9], 0.86, 0.82, { p: [0, hwY + 0.5 * s, hwZ] });
  // amber-glass canopy facing forward, in a dark frame
  A.taper('torso', 'dark', [W * 0.62, 0.46 * s, W * 0.5], 0.8, 0.75, {
    p: [0, hwY + 0.94 * s, hwZ + W * 0.28], r: [0.22, 0, 0] });
  A.plate('torso', 'glowSoft', rhombOutline(W * 0.5, 0.42 * s, { cut: 0.22 }), 0.06 * s, {
    p: [0, hwY + 0.96 * s, hwZ + W * 0.46], r: [0.22, 0, 0], round: 0.15 });
  // small top-mounted gun on its ring mount + comms whip
  A.ring('torso', 'metal', 0.2 * s, 0.05 * s, { p: [0, hwY + 1.2 * s, hwZ - W * 0.1], r: [Math.PI / 2, 0, 0] });
  A.sharpBox('torso', 'dark', [0.2 * s, 0.2 * s, 0.3 * s], { p: [0, hwY + 1.32 * s, hwZ - W * 0.05] });
  A.tube('torso', 'metal', 0.05 * s, 0.06 * s, 0.85 * s, {
    p: [0, hwY + 1.34 * s, hwZ + W * 0.26], r: [Math.PI / 2 - 0.1, 0, 0], seg: 8 });
  A.antenna('torso', 'metal', 'glow', 0.9 * s, { p: [W * 0.3, hwY + 1.0 * s, hwZ - W * 0.3], r: [0.1, 0, 0.2] });
  for (const sx of [-1, 1]) { // stowage boxes + hull pistons on the pod flanks
    A.sharpBox('torso', 'dark', [0.18 * s, 0.3 * s, 0.5 * s], { p: [sx * W * 0.44, hwY + 0.4 * s, hwZ] });
    A.piston('torso', 'metal', [sx * W * 0.3, hwY, hwZ - W * 0.3],
      [sx * W * 0.5, hwY - 0.6 * s, hwZ - W * 0.5], 0.05 * s);
  }

  // ================= NECK + SKULL =================
  const hb = hs * 1.55;                       // skull unit
  J.head.position.set(0, shY + 0.78 * s, BL + 0.82 * s);
  for (let i = 0; i < 2; i++) { // thick armored neck collar segments
    A.facet('torso', i ? 'accent' : 'primary', W * (0.44 - i * 0.06), W * (0.48 - i * 0.06),
      W * (0.4 - i * 0.06), 0.42 * s, {
        sides: 8, p: [0, shY + (0.52 + i * 0.2) * s, BL + (0.44 + i * 0.24) * s], r: [1.15, 0, 0] });
  }
  // cranium + heavy cheek flares (the face is hide, the armor rides on it)
  A.facet('head', 'frame', hb * 0.86, hb * 0.95, hb * 0.7, hb * 1.1, {
    sides: 8, scaleX: 1.1, scaleZ: 1.25, p: [0, hb * 0.05, hb * 0.42], r: [Math.PI / 2 - 0.15, 0, 0] });
  for (const sx of [-1, 1]) {
    A.taper('head', 'frame', [hb * 0.5, hb * 0.7, hb * 0.9], 0.7, 0.75, {
      p: [sx * hb * 0.62, -hb * 0.12, hb * 0.5], r: [0, 0, sx * 0.3] });
    A.plate('head', 'primary', rhombOutline(hb * 0.8, hb * 0.55, { cut: 0.3 }), hb * 0.09, {
      p: [sx * hb * 0.78, -hb * 0.05, hb * 0.55], r: [0, sx * (Math.PI / 2 - 0.14), sx * 0.2], round: 0.18 });
    A.sharpBox('head', 'glow', [0.05 * s, hb * 0.05, hb * 0.5], {
      p: [sx * hb * 0.8, hb * 0.24, hb * 0.55] });
  }
  // long upper snout tapering to the hooked beak
  A.facet('head', 'frame', hb * 0.6, hb * 0.52, hb * 0.34, hb * 1.15, {
    sides: 8, scaleX: 1.0, scaleZ: 0.95, p: [0, -hb * 0.16, hb * 1.42], r: [Math.PI / 2 + 0.06, 0, 0] });
  A.plate('head', 'primary', rhombOutline(hb * 0.44, hb * 0.9, { cut: 0.32 }), hb * 0.08, {
    p: [0, hb * 0.14, hb * 1.4], r: [-Math.PI / 2 + 0.12, 0, 0], round: 0.2 });
  A.vents('head', 'dark', 2, hb * 0.3, hb * 0.09, 0.04 * s, {
    p: [0, hb * 0.06, hb * 1.82], r: [-0.4, 0, 0] });
  // upper beak: dark keratin wedge hooking DOWN over the jaw
  A.taper('head', 'dark', [hb * 0.36, hb * 0.42, hb * 0.5], 0.4, 0.55, {
    p: [0, -hb * 0.38, hb * 2.02], r: [0.5, 0, 0] });
  coneAt('head', 'dark', hb * 0.16, hb * 0.44, [0, -hb * 0.5, hb * 2.14], [2.5, 0, 0], 8);

  // ---- JAW: hinged lower beak (jaw.rotation.x opens the mouth) ----
  addJoint(J, 'jaw', 'head', 0, -hb * 0.42, hb * 0.72);
  A.facet('jaw', 'frame', hb * 0.34, hb * 0.4, hb * 0.28, hb * 0.95, {
    sides: 6, scaleX: 1.0, scaleZ: 0.7, p: [0, -hb * 0.08, hb * 0.48], r: [Math.PI / 2 + 0.1, 0, 0] });
  A.plate('jaw', 'primary', rhombOutline(hb * 0.4, hb * 0.6, { cut: 0.3 }), hb * 0.07, {
    p: [0, -hb * 0.3, hb * 0.5], r: [Math.PI / 2 - 0.1, 0, 0], round: 0.2 });
  A.taper('jaw', 'dark', [hb * 0.3, hb * 0.34, hb * 0.42], 0.45, 0.5, {
    p: [0, -hb * 0.05, hb * 1.2], r: [-0.35, 0, 0] });
  for (const sx of [-1, 1]) { // jaw actuators + cheek teeth plates
    A.piston('jaw', 'metal', [sx * hb * 0.3, hb * 0.08, hb * 0.05], [sx * hb * 0.26, -hb * 0.2, hb * 0.7], 0.045 * s);
    A.sharpBox('jaw', 'metal', [hb * 0.06, hb * 0.1, hb * 0.5], { p: [sx * hb * 0.22, hb * 0.06, hb * 0.7] });
  }

  // ---- BROWS + EYES: bony ridges on their own joints, so they furrow ----
  for (const side of ['L', 'R']) {
    const sx = side === 'L' ? -1 : 1;
    const bj = 'brow' + side;
    addJoint(J, bj, 'head', sx * hb * 0.5, hb * 0.32, hb * 0.78);
    A.plate(bj, 'frame', rhombOutline(hb * 0.28, hb * 0.62, { cut: 0.35 }), hb * 0.16, {
      p: [0, 0, 0], r: [-0.35, sx * 0.3, sx * 0.5], round: 0.25 });
    A.plate(bj, 'accent', rhombOutline(hb * 0.2, hb * 0.5, { cut: 0.35 }), hb * 0.07, {
      p: [sx * hb * 0.1, hb * 0.06, hb * 0.06], r: [-0.35, sx * 0.3, sx * 0.5], round: 0.25 });
    // eye in a deep socket under the ridge
    A.ball('head', 'dark', hb * 0.19, { p: [sx * hb * 0.62, hb * 0.04, hb * 0.86], seg: 10 });
    A.ball('head', 'glow', hb * 0.1, { p: [sx * hb * 0.68, hb * 0.04, hb * 0.92] });
  }

  // ================= THREE HORNS =================
  // brow horns: three cone segments straightening upward as they run out,
  // faking the long forward curve; metal collar at each root.
  for (const side of ['L', 'R']) {
    const sx = side === 'L' ? -1 : 1;
    let p = [sx * hb * 0.52, hb * 0.44, hb * 0.72];
    A.tube('head', 'metal', hb * 0.22, hb * 0.26, hb * 0.24, { p: [p[0], p[1] - hb * 0.05, p[2]], r: [1.25, 0, -sx * 0.16], seg: 10 });
    A.ring('head', 'dark', hb * 0.24, hb * 0.05, { p: [p[0], p[1] + hb * 0.05, p[2] + hb * 0.1], r: [1.25, 0, -sx * 0.16] });
    p = coneAt('head', 'metal', hb * 0.21, hb * 1.05, p, [1.3, 0, -sx * 0.2]);
    p = coneAt('head', 'metal', hb * 0.15, hb * 0.95, p, [1.05, 0, -sx * 0.16]);
    p = coneAt('head', 'metal', hb * 0.09, hb * 0.8, p, [0.72, 0, -sx * 0.1]);
    anchors['horn' + side] = addAnchor(J.head, p[0], p[1], p[2]);
  }
  // nose horn: short, stout, tipped up off the snout bridge
  let np = [0, hb * 0.1, hb * 1.5];
  A.tube('head', 'metal', hb * 0.2, hb * 0.24, hb * 0.2, { p: [0, np[1] - hb * 0.04, np[2]], r: [0.35, 0, 0], seg: 10 });
  np = coneAt('head', 'metal', hb * 0.19, hb * 0.62, np, [0.5, 0, 0]);
  np = coneAt('head', 'metal', hb * 0.11, hb * 0.48, np, [0.28, 0, 0]);
  anchors.hornNose = addAnchor(J.head, np[0], np[1], np[2]);

  // ================= FRILL + ROCKET-TUBE CROWN =================
  addJoint(J, 'frill', 'head', 0, hb * 0.42, -hb * 0.2);
  const FW = hb * 3.1, FH = hb * 2.4, tiltF = -0.44;
  const cyF = FH * 0.3, czF = -hb * 0.05;
  // map a point on the (tilted) frill plate into frill-joint space
  const rimAt = (px, py) => [px, cyF + py * Math.cos(tiltF), czF + py * Math.sin(tiltF)];
  // the bony shield itself: wide crown tapering down to the skull
  A.plate('frill', 'frame', shieldOutline(FW, FH, { taper: 0.9, tip: 0.5 }), 0.22 * s, {
    p: [0, cyF, czF], r: [tiltF, 0, 0], round: 0.3 });
  // layered armor patches + orange seams across the shield face
  const patch = rimAt(0, FH * 0.08);
  A.plate('frill', 'primary', shieldOutline(FW * 0.5, FH * 0.62, { taper: 0.85, tip: 0.5 }), 0.1 * s, {
    p: [patch[0], patch[1], patch[2] + 0.16 * s], r: [tiltF, 0, 0], round: 0.25 });
  for (const sx of [-1, 1]) {
    const pp = rimAt(sx * FW * 0.3, FH * 0.34);
    A.plate('frill', 'accent', rhombOutline(FW * 0.2, FH * 0.4, { cut: 0.3 }), 0.09 * s, {
      p: [pp[0], pp[1], pp[2] + 0.14 * s], r: [tiltF, 0, sx * 0.25], round: 0.2 });
    A.sharpBox('frill', 'glow', [0.05 * s, FH * 0.36, 0.05 * s], {
      p: [pp[0] - sx * FW * 0.13, pp[1], pp[2] + 0.16 * s], r: [tiltF, 0, sx * 0.22] });
  }
  // ROCKET TUBES: dense crown of launchers around the frill rim, pointing
  // up and back, splayed outward — the rocket spawn origin lives here.
  const NT = 15;
  for (let i = 0; i < NT; i++) {
    const a = (i / (NT - 1) - 0.5) * 2.7;
    const px = Math.sin(a) * FW * 0.47, py = FH * 0.47 * Math.cos(a);
    const p = rimAt(px, py);
    const rot = [tiltF - 0.3, 0, -a * 0.5];
    const tl = (0.5 + (i % 2) * 0.12) * s;
    _dir.set(0, 1, 0).applyEuler(_eu.set(rot[0], rot[1], rot[2]));
    A.tube('frill', 'dark', 0.1 * s, 0.12 * s, tl, {
      p: [p[0] + _dir.x * tl * 0.45, p[1] + _dir.y * tl * 0.45, p[2] + _dir.z * tl * 0.45],
      r: rot, seg: 9 });
    const mouth = [p[0] + _dir.x * tl * 0.95, p[1] + _dir.y * tl * 0.95, p[2] + _dir.z * tl * 0.95];
    A.ring('frill', 'metal', 0.11 * s, 0.028 * s, { p: mouth, r: [rot[0] + Math.PI / 2, 0, rot[2]] });
    A.ball('frill', i % 3 === 0 ? 'glow' : 'glowSoft', 0.06 * s, { p: mouth, seg: 8 });
    // bony epoccipital knob between the tubes, on the rim itself
    A.ball('frill', 'accent', 0.11 * s, { p: [p[0], p[1], p[2] - 0.1 * s], seg: 8 });
  }
  anchors.frillPods = addAnchor(J.frill, 0, cyF + FH * 0.56, czF - FH * 0.2);

  // ================= FLANK CANNONS =================
  // Long multi-barrel guns just behind the shoulders, barrels reaching past
  // the beak. All geometry hangs on cannonL/R so they can recoil / traverse.
  const CL = 4.25 * s;  // barrel-tip distance — the muzzles clear the beak
  for (const side of ['L', 'R']) {
    const sx = side === 'L' ? -1 : 1;
    const cj = 'cannon' + side;
    addJoint(J, cj, 'torso', sx * W * 0.78, shY + 0.72 * s, BL * 0.42);
    // recoil housing + mantlet
    A.facet(cj, 'primary', 0.36 * s, 0.42 * s, 0.34 * s, 1.15 * s, {
      sides: 8, scaleX: 1.1, p: [0, 0, 0.35 * s], r: [Math.PI / 2, 0, 0] });
    A.plate(cj, 'accent', rhombOutline(0.7 * s, 0.6 * s, { cut: 0.3 }), 0.09 * s, {
      p: [sx * 0.36 * s, 0.02 * s, 0.35 * s], r: [0, sx * Math.PI / 2, 0], round: 0.18 });
    A.sharpBox(cj, 'glow', [0.05 * s, 0.4 * s, 0.06 * s], { p: [sx * 0.4 * s, 0, 0.9 * s] });
    // ammo feed: chain of link boxes running back and down into the ribs
    for (let i = 0; i < 5; i++) {
      A.sharpBox(cj, 'metal', [0.16 * s, 0.14 * s, 0.2 * s], {
        p: [-sx * (0.1 + i * 0.05) * s, -(0.18 + i * 0.14) * s, -(0.1 + i * 0.26) * s], r: [0.3, 0, sx * 0.1] });
    }
    A.tube(cj, 'dark', 0.12 * s, 0.14 * s, 0.9 * s, { p: [-sx * 0.24 * s, -0.5 * s, -0.55 * s], r: [0.9, 0, sx * 0.3], seg: 8 });
    // barrel shroud + cooling rings
    A.tube(cj, 'frame', 0.24 * s, 0.3 * s, CL * 0.5, { p: [0, 0, CL * 0.42], r: [Math.PI / 2, 0, 0], seg: 12 });
    for (let i = 0; i < 4; i++) {
      A.ring(cj, 'dark', 0.28 * s, 0.045 * s, { p: [0, 0, (0.3 + i * 0.28) * CL] });
    }
    A.plate(cj, 'primary', rhombOutline(0.34 * s, CL * 0.4, { cut: 0.3 }), 0.07 * s, {
      p: [0, 0.28 * s, CL * 0.45], r: [-Math.PI / 2, 0, 0], round: 0.18 });
    // muzzle assembly: barrel cluster + brake
    A.barrelCluster(cj, 'metal', 4, 0.13 * s, 0.075 * s, CL * 0.34, { p: [0, 0, CL * 0.82] });
    A.tube(cj, 'dark', 0.2 * s, 0.24 * s, 0.3 * s, { p: [0, 0, CL - 0.14 * s], r: [Math.PI / 2, 0, 0], seg: 12 });
    A.ring(cj, 'metal', 0.2 * s, 0.05 * s, { p: [0, 0, CL - 0.02 * s] });
    // mount arm tying the gun down onto the flank armor
    A.piston(cj, 'metal', [-sx * 0.1 * s, -0.3 * s, 0.2 * s], [-sx * 0.5 * s, -0.9 * s, 0.1 * s], 0.07 * s);
    anchors['muzzle' + side] = addAnchor(J[cj], 0, 0, CL);
  }

  // ================= LEGS: four columnar elephantine pillars =================
  // shared builder — upper column, joint band, lower column, padded foot
  const pillar = (jUp, jLo, jFt, sx, upLen, loLen, rad) => {
    A.ball(jUp, 'frame', rad * 1.1, {});
    A.lathe(jUp, 'frame', [
      [-upLen * 1.02, rad * 0.82],
      [-upLen * 0.5, rad * 1.06],
      [-upLen * 0.08, rad * 1.22],
    ], { seg: 16, scaleZ: 1.08 });
    // stacked armor cuffs down the outside of the column
    for (let i = 0; i < 3; i++) {
      const f = (i + 0.5) / 3;
      A.plate(jUp, i === 1 ? 'accent' : 'primary', rhombOutline(rad * 1.5, upLen * 0.34, { cut: 0.3 }), 0.07 * s, {
        p: [sx * rad * 1.02, -upLen * f, 0.02 * s], r: [0, sx * Math.PI / 2, 0], round: 0.18 });
      A.plate(jUp, 'primary', rhombOutline(rad * 1.3, upLen * 0.3, { cut: 0.3 }), 0.06 * s, {
        p: [0, -upLen * f, rad * 1.02], r: [0, 0, 0], round: 0.18 });
    }
    A.sharpBox(jUp, 'glow', [0.045 * s, upLen * 0.5, 0.045 * s], { p: [-sx * rad * 0.95, -upLen * 0.5, rad * 0.4] });
    // joint band: dark hinge drum + accent cap
    A.part(jLo, 'metal', new THREE.CylinderGeometry(rad * 0.8, rad * 0.8, rad * 1.7, 12), { r: [0, 0, Math.PI / 2] });
    A.ring(jLo, 'dark', rad * 0.85, 0.06 * s, { p: [sx * rad * 0.8, 0, 0], r: [0, Math.PI / 2, 0] });
    A.plate(jLo, 'accent', shieldOutline(rad * 1.5, rad * 1.8, { taper: 0.7 }), 0.08 * s, {
      p: [0, -rad * 0.1, rad * 0.95], r: [0.15, 0, 0], round: 0.18 });
    // lower column
    A.lathe(jLo, 'frame', [
      [-loLen * 1.0, rad * 0.82],
      [-loLen * 0.5, rad * 0.92],
      [-loLen * 0.05, rad * 1.05],
    ], { seg: 16, scaleZ: 1.05 });
    for (let i = 0; i < 2; i++) {
      const f = (i + 0.5) / 2;
      A.plate(jLo, i ? 'accent' : 'primary', rhombOutline(rad * 1.3, loLen * 0.4, { cut: 0.3 }), 0.07 * s, {
        p: [sx * rad * 0.92, -loLen * f, 0.02 * s], r: [0, sx * Math.PI / 2, 0], round: 0.18 });
    }
    A.piston(jLo, 'metal', [-sx * rad * 0.5, -0.1 * s, -rad * 0.7], [-sx * rad * 0.4, -loLen * 0.85, -rad * 0.5], 0.05 * s);
    // FOOT: round hide pad + four blunt toes with bone nails
    // (sole ≈ −0.32·s below the joint — the grounding contract)
    A.lathe(jFt, 'frame', [[-0.3 * s, rad * 0.6], [-0.1 * s, rad * 1.25], [0.12 * s, rad * 1.0]], { seg: 16 });
    A.ring(jFt, 'dark', rad * 1.1, 0.06 * s, { p: [0, -0.02 * s, 0], r: [Math.PI / 2, 0, 0] });
    for (let i = 0; i < 4; i++) {
      const a = (i - 1.5) * 0.42;
      const tx = Math.sin(a) * rad * 0.95, tz = Math.cos(a) * rad * 1.0;
      A.taper(jFt, 'frame', [0.3 * s, 0.26 * s, 0.3 * s], 0.8, 0.9, { p: [tx, -0.2 * s, tz], r: [0.2, a, 0] });
      A.spike(jFt, 'metal', 0.11 * s, 0.24 * s, { p: [tx, -0.3 * s, tz + 0.1 * s], r: [1.9, a, 0], seg: 7 });
    }
  };

  // ---- FRONT legs = the ARM chain (hands are front feet) ----
  const trackF = D.hipW * 1.25;
  for (const side of ['L', 'R']) {
    const sx = side === 'L' ? -1 : 1;
    J['shoulder' + side].position.set(sx * trackF, shY, BL);
    J['elbow' + side].position.set(0, -ua, 0);   // straight columnar limb
    pillar('shoulder' + side, 'elbow' + side, 'hand' + side, sx, ua, fa, 0.42 * s * bulk);
    // heavy shoulder cowl over the front-leg root
    A.plate('shoulder' + side, 'primary', shieldOutline(0.9 * s, 1.1 * s, { taper: 0.72 }), 0.11 * s, {
      p: [sx * 0.42 * s, 0.16 * s, 0.06 * s], r: [0, sx * (Math.PI / 2 - 0.12), sx * 0.1], round: 0.2 });
    A.taper('shoulder' + side, 'accent', [0.7 * s, 0.4 * s, 0.8 * s], 0.8, 0.8, {
      p: [sx * 0.16 * s, 0.24 * s, 0], r: [0, 0, sx * 0.25] });
  }

  // ---- REAR legs = the LEG chain ----
  for (const side of ['L', 'R']) {
    const sx = side === 'L' ? -1 : 1;
    pillar('thigh' + side, 'knee' + side, 'ankle' + side, sx, D.thighLen, D.shinLen, 0.46 * s * bulk);
    // haunch mass blending the rear column into the hip armor
    A.facet('thigh' + side, 'primary', 0.5 * s, 0.72 * s, 0.5 * s, 0.9 * s, {
      sides: 8, scaleZ: 1.1, p: [sx * 0.08 * s, -0.15 * s, -0.05 * s] });
  }

  // ================= HIPS / REAR ARMOR =================
  A.facet('hips', 'frame', W * 0.6, W * 0.66, W * 0.5, 0.9 * s, { sides: 8, scaleX: 1.15, scaleZ: 0.95, p: [0, 0, -0.1 * s] });
  A.plate('hips', 'accent', shieldOutline(W * 0.9, 0.9 * s, { taper: 0.8 }), 0.1 * s, {
    p: [0, 0.1 * s, -W * 0.55], r: [-0.2, Math.PI, 0], round: 0.2 });
  A.vents('hips', 'dark', 4, W * 0.6, 0.2 * s, 0.08 * s, { p: [0, -0.15 * s, -W * 0.6], r: [-0.2, 0, 0] });

  // ================= TAIL: 3-joint segmented armored chain =================
  const tSeg = [1.2 * s, 1.05 * s, 0.9 * s];
  const tDrop = [-0.18 * s, -0.12 * s];
  addJoint(J, 'tail0', 'hips', 0, bodyY(0) + 0.18 * s + 0.2 * s, bz0 + 0.1 * s);
  addJoint(J, 'tail1', 'tail0', 0, tDrop[0], -tSeg[0]);
  addJoint(J, 'tail2', 'tail1', 0, tDrop[1], -tSeg[1]);
  ['tail0', 'tail1', 'tail2'].forEach((tj, ti) => {
    const rTop = (0.48 - ti * 0.12) * s, rBot = (0.36 - ti * 0.12) * s;
    const dy = ti < 2 ? tDrop[ti] : -0.1 * s;
    const tilt = Math.atan2(dy, tSeg[ti]);
    A.facet(tj, 'frame', rBot, (rTop + rBot) * 0.5, rTop, tSeg[ti] * 0.98, {
      sides: 8, scaleX: 1.05, scaleZ: 0.9, p: [0, dy * 0.5, -tSeg[ti] * 0.5], r: [Math.PI / 2 + tilt, 0, 0] });
    A.ring(tj, 'dark', rTop * 0.98, 0.05 * s, { p: [0, 0, -0.04 * s] });
    // shingled armor rings down the segment + orange seam between them
    for (let k = 0; k < 3; k++) {
      const f = (k + 0.4) / 3;
      const rr = rTop + (rBot - rTop) * f;
      A.plate(tj, k === 1 ? 'accent' : 'primary', rhombOutline(rr * 1.5, tSeg[ti] * 0.3, { cut: 0.3 }), 0.06 * s, {
        p: [0, dy * f + rr * 0.85, -tSeg[ti] * f], r: [-Math.PI / 2 + tilt + 0.1, 0, 0], round: 0.2 });
      for (const sx of [-1, 1]) {
        A.plate(tj, 'primary', rhombOutline(tSeg[ti] * 0.28, rr * 1.2, { cut: 0.3 }), 0.055 * s, {
          p: [sx * rr * 0.92, dy * f, -tSeg[ti] * f], r: [tilt, sx * (Math.PI / 2 - 0.08), 0], round: 0.18 });
      }
      A.sharpBox(tj, 'glowSoft', [rTop * 1.1, 0.04 * s, 0.04 * s], {
        p: [0, dy * f + rr * 0.8, -tSeg[ti] * (f + 0.14)], r: [tilt, 0, 0] });
    }
  });
  // plated tapering tip
  A.facet('tail2', 'frame', 0.06 * s, 0.14 * s, 0.22 * s, 0.7 * s, {
    sides: 6, p: [0, -0.14 * s, -tSeg[2] - 0.3 * s], r: [Math.PI / 2 - 0.2, 0, 0] });
  A.plate('tail2', 'accent', rhombOutline(0.3 * s, 0.55 * s, { cut: 0.3 }), 0.05 * s, {
    p: [0, -0.06 * s, -tSeg[2] - 0.28 * s], r: [-Math.PI / 2 - 0.2, 0, 0], round: 0.2 });

  // chest core light, sunk between the front legs
  anchors.core = addAnchor(J.torso, 0, bodyY(0.86) - 0.1 * s, bz0 + bLen * 0.86);
}
