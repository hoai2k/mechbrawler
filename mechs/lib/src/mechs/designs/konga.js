// Auto-split from designs.js — one mech per file. Shared sculpting
// vocabulary lives in ../parts.js; see docs/IMAGE_TO_MECH.md.
import * as THREE from 'three';
import { cyl, taperBox, beveledPlate, shieldOutline, rhombOutline, roundedBox, bulgeLathe, facetBulge } from '../parts.js';
import { decalTexture, skinMaterial } from '../../core/pbrtex.js';
import { baseFrame, standardArm, standardLeg, addAnchor } from '../factory.js';
import { addJoint } from './common.js';


// ============================================================
// 18. KONGA — the cyborg mountain gorilla, built to the canonical
//     concept. A colossal shaggy charcoal silverback hunched into a
//     knuckle-walking stance: barrel chest, sloped shaggy shoulders,
//     a real ORGANIC gorilla face (heavy brow ridge over deep-set
//     amber eyes, broad flat nose, a jaw that opens) under a
//     pronounced sagittal crest.
//     Bolted on top: a rust-orange + steel-blue riveted harness rig
//     across the chest and over both shoulders, and TWO box
//     missile-pod launchers on articulated arms rising behind the
//     shoulders — rectangular, 3x3 grids of tube muzzles facing
//     forward, rust armor with blue accent panels.
//     The RIGHT arm is a full cybernetic graft: segmented steel
//     plating in blue and red, exposed pistons and cable looms, a
//     big mechanical five-finger hand. The LEFT arm stays organic —
//     shaggy muscle under bolted forearm bands, a fleshy knuckle
//     fist. Short bowed legs with armor bands, big flat feet.
//
//     Engine-driven extras: jaw + browL/browR (face acting) and
//     podL/podR (the launchers pitch and aim).
// ============================================================
export function konga(A, D, J, anchors, def) {
  const s = D.scale;
  const W = D.torsoW;      // chest half-width unit
  const chH = D.torsoH;
  const hs = D.headSize;
  const ua = D.upperArmLen, fa = D.foreArmLen;
  const tl = D.thighLen, sl = D.shinLen;
  const lean = 0.3;        // knuckle-walk hunch of the whole chest mass

  // rivet-stud helper: small steel balls along the harness plates
  const studs = (joint, pts, r = 0.05 * s) => {
    for (const p of pts) A.ball(joint, 'metal', r, { p, seg: 8 });
  };
  // shaggy fur clump: a squashed lathe blob, used to break every silhouette
  const shag = (joint, rad, len, p, r, mat = 'primary') => {
    A.lathe(joint, mat, [
      [-len * 0.5, rad * 0.28],
      [-len * 0.16, rad * 1.0],
      [len * 0.22, rad * 0.86],
      [len * 0.5, rad * 0.2],
    ], { p, r, scaleX: 1.15, scaleZ: 0.9, seg: 12 });
  };

  // ================= WAIST / PELVIS =================
  A.lathe('hips', 'frame', [[0.5 * s, W * 0.3], [0.2 * s, W * 0.24], [-0.1 * s, W * 0.3]], {
    scaleX: 1.24, scaleZ: 1.05 });
  A.lathe('hips', 'primary', [
    [-0.62 * s, W * 0.3],
    [-0.24 * s, W * 0.52],
    [0.2 * s, W * 0.5],
    [0.5 * s, W * 0.3],
  ], { scaleX: 1.2, scaleZ: 1.0, seg: 20 });
  // shaggy haunch tufts over the hips
  for (const sx of [-1, 1]) {
    shag('hips', 0.34 * s, 0.8 * s, [sx * W * 0.44, -0.2 * s, -0.1 * s], [0.2, 0, sx * 0.5]);
  }
  // dark belly underplate + a single riveted waist band
  A.sharpBox('hips', 'dark', [W * 0.62, 0.24 * s, W * 0.5], { p: [0, -0.5 * s, 0.05 * s] });
  A.tube('hips', 'accent', W * 0.5, W * 0.52, 0.16 * s, { p: [0, 0.16 * s, 0], seg: 18 });
  studs('hips', [[0, 0.16 * s, W * 0.52], [-W * 0.38, 0.16 * s, W * 0.34], [W * 0.38, 0.16 * s, W * 0.34]]);

  // ================= TORSO: huge muscled shaggy chest =================
  // head slung low and forward out of the hunch (anchors follow the joint)
  J.head.position.set(0, chH * 0.9, 0.52 * s);
  A.lathe('torso', 'primary', [
    [chH * 0.0, W * 0.42],
    [chH * 0.3, W * 0.66],
    [chH * 0.6, W * 0.78],
    [chH * 0.86, W * 0.66],
    [chH * 1.02, W * 0.3],
  ], { p: [0, 0, 0.02 * s], r: [lean, 0, 0], scaleX: 1.34, scaleZ: 0.92, seg: 26 });
  // pectoral slabs — big rounded muscle masses under the fur
  for (const sx of [-1, 1]) {
    A.capsule('torso', 'primary', W * 0.26, W * 0.34, {
      p: [sx * W * 0.36, chH * 0.62, W * 0.5], r: [0.5, 0, sx * -1.15], s: [1, 1, 0.78] });
    // shaggy shoulder mantle rolling out over each arm socket
    shag('torso', 0.62 * s, 1.3 * s, [sx * W * 0.86, chH * 0.82, -0.06 * s], [0.1, 0, sx * 0.95]);
    shag('torso', 0.44 * s, 0.9 * s, [sx * W * 0.5, chH * 0.98, -W * 0.4], [-0.4, 0, sx * 0.6]);
  }
  // shaggy back hump behind the neck
  shag('torso', 0.72 * s, 1.5 * s, [0, chH * 0.96, -W * 0.5], [Math.PI / 2 - 0.35, 0, Math.PI / 2]);

  // ---- HARNESS RIG: rust-orange + steel plates strapped over the chest ----
  // two shoulder straps meeting in a riveted chest boss
  for (const sx of [-1, 1]) {
    A.plate('torso', 'accent', rhombOutline(W * 0.34, chH * 0.95, { cut: 0.24 }), 0.1 * s, {
      p: [sx * W * 0.42, chH * 0.62, W * 0.52], r: [lean - 0.1, sx * 0.34, sx * 0.46], round: 0.1 });
    A.plate('torso', 'frame', rhombOutline(W * 0.2, chH * 0.5, { cut: 0.26 }), 0.07 * s, {
      p: [sx * W * 0.58, chH * 0.9, W * 0.24], r: [0.1, sx * 1.0, sx * 0.3], round: 0.12 });
    studs('torso', [
      [sx * W * 0.3, chH * 0.9, W * 0.56], [sx * W * 0.46, chH * 0.66, W * 0.55],
      [sx * W * 0.56, chH * 0.4, W * 0.48],
    ], 0.045 * s);
    // steel-blue accent slab riding each strap
    A.plate('torso', 'metal', rhombOutline(W * 0.18, chH * 0.34, { cut: 0.3 }), 0.05 * s, {
      p: [sx * W * 0.4, chH * 0.74, W * 0.62], r: [lean - 0.1, sx * 0.34, sx * 0.46], round: 0.14 });
  }
  // central chest boss + belly strap across the ribs
  A.plate('torso', 'accent', shieldOutline(W * 0.62, chH * 0.6, { taper: 0.7 }), 0.13 * s, {
    p: [0, chH * 0.4, W * 0.6], r: [lean - 0.06, 0, 0], round: 0.1 });
  A.plate('torso', 'frame', shieldOutline(W * 0.34, chH * 0.34, { taper: 0.7 }), 0.07 * s, {
    p: [0, chH * 0.4, W * 0.68], r: [lean - 0.06, 0, 0], round: 0.12 });
  A.sharpBox('torso', 'glowSoft', [W * 0.2, 0.035 * s, 0.035 * s], { p: [0, chH * 0.3, W * 0.7] });
  studs('torso', [
    [-W * 0.24, chH * 0.58, W * 0.66], [W * 0.24, chH * 0.58, W * 0.66],
    [-W * 0.22, chH * 0.2, W * 0.66], [W * 0.22, chH * 0.2, W * 0.66],
  ]);
  A.tube('torso', 'accent', W * 0.56, W * 0.58, 0.18 * s, {
    p: [0, chH * 0.14, 0.04 * s], r: [lean, 0, 0], seg: 20 });
  // dark collar ring + cable loom running up the right side of the neck
  A.tube('torso', 'dark', W * 0.3, W * 0.34, 0.24 * s, { p: [0, chH * 0.92, 0.3 * s], r: [lean + 0.18, 0, 0] });
  for (let i = 0; i < 3; i++) {
    A.piston('torso', 'metal', [W * (0.24 + i * 0.06), chH * 0.5, W * 0.2],
      [W * (0.3 + i * 0.05), chH * 0.94, -W * 0.1], 0.035 * s);
  }

  // ================= MISSILE PODS: two boxes on articulated arms ==========
  // The launcher joints so the engine can pitch/aim them; every scrap of
  // box geometry hangs off these, only the support stalk stays on the torso.
  const podY = chH * 1.06, podZ = -W * 0.52;
  addJoint(J, 'podL', 'torso', -W * 0.62, podY, podZ);
  addJoint(J, 'podR', 'torso', W * 0.62, podY, podZ);
  const bw = W * 0.62, bh = W * 0.54, bd = W * 0.42;   // launcher box
  const boxY = 0.72 * s;                               // box sits above the joint
  for (const side of ['L', 'R']) {
    const sx = side === 'L' ? -1 : 1;
    const pod = 'pod' + side;
    // support stalk climbing off the back (torso-side, so the pod can swing)
    A.tube('torso', 'frame', 0.12 * s, 0.16 * s, 0.8 * s, {
      p: [sx * W * 0.62, podY - 0.4 * s, podZ + 0.06 * s], r: [-0.2, 0, -sx * 0.08] });
    // pod-side: yoke arm, elbow drum, then the box itself
    A.ball(pod, 'frame', 0.16 * s, {});
    A.tube(pod, 'metal', 0.1 * s, 0.12 * s, 0.5 * s, { p: [0, 0.26 * s, 0], r: [0.14, 0, 0] });
    A.part(pod, 'metal', cyl(0.13 * s, 0.13 * s, 0.34 * s, 10), {
      p: [0, boxY - bh * 0.5, -bd * 0.36], r: [0, 0, Math.PI / 2] });
    A.piston(pod, 'metal', [sx * 0.1 * s, 0.06 * s, -0.06 * s],
      [sx * 0.12 * s, boxY - bh * 0.5, -bd * 0.3], 0.035 * s);
    // rust-orange armored launcher box + dark inner cell block
    A.part(pod, 'accent', roundedBox(bw, bh, bd, 0.06 * s), { p: [0, boxY, 0] });
    A.sharpBox(pod, 'dark', [bw * 0.82, bh * 0.82, bd * 0.9], { p: [0, boxY, 0.03 * s] });
    // steel-blue accent panels top and outboard, riveted edge bands
    A.plate(pod, 'metal', rhombOutline(bw * 0.78, bd * 0.6, { cut: 0.24 }), 0.05 * s, {
      p: [0, boxY + bh * 0.52, -bd * 0.04], r: [Math.PI / 2, 0, 0], round: 0.12 });
    A.plate(pod, 'metal', rhombOutline(bd * 0.7, bh * 0.6, { cut: 0.26 }), 0.05 * s, {
      p: [sx * bw * 0.52, boxY, 0], r: [0, sx * Math.PI / 2, 0], round: 0.12 });
    A.sharpBox(pod, 'frame', [bw * 1.04, 0.08 * s, bd * 1.04], { p: [0, boxY - bh * 0.44, 0] });
    A.sharpBox(pod, 'frame', [bw * 1.04, 0.08 * s, bd * 1.04], { p: [0, boxY + bh * 0.42, 0] });
    studs(pod, [
      [-bw * 0.42, boxY - bh * 0.44, bd * 0.5], [bw * 0.42, boxY - bh * 0.44, bd * 0.5],
      [-bw * 0.42, boxY + bh * 0.42, bd * 0.5], [bw * 0.42, boxY + bh * 0.42, bd * 0.5],
    ], 0.04 * s);
    // blue status light on the outboard face
    A.ball(pod, 'glow', 0.05 * s, { p: [sx * bw * 0.5, boxY - bh * 0.3, bd * 0.3], seg: 8 });
    // 3x3 GRID of tube muzzles facing forward (+Z)
    const fz = bd * 0.5;
    for (let r = -1; r <= 1; r++) {
      for (let c = -1; c <= 1; c++) {
        A.tube(pod, 'frame', 0.085 * s, 0.085 * s, 0.2 * s, {
          p: [c * bw * 0.28, boxY + r * bh * 0.28, fz - 0.02 * s], r: [Math.PI / 2, 0, 0], seg: 10 });
        A.tube(pod, 'dark', 0.062 * s, 0.062 * s, 0.26 * s, {
          p: [c * bw * 0.28, boxY + r * bh * 0.28, fz - 0.06 * s], r: [Math.PI / 2, 0, 0], seg: 10 });
      }
    }
    // muzzle-mouth anchor: +Z points straight out of the tubes
    anchors[pod] = addAnchor(J[pod], 0, boxY, fz + 0.12 * s);
  }
  // the right launcher doubles as the default ranged origin
  anchors.muzzleR = addAnchor(J.podR, 0, boxY, bd * 0.5 + 0.12 * s);

  // ================= HEAD: organic gorilla face =================
  const hh = hs * 1.45;    // gorilla skull reads big — its own unit
  // thick shaggy neck column bridging into the shoulders
  A.tube('head', 'frame', hh * 0.46, hh * 0.62, hh * 0.7, { p: [0, -hh * 0.1, -hh * 0.2], r: [0.3, 0, 0] });
  shag('head', 0.5 * s, 1.0 * s, [0, hh * 0.12, -hh * 0.5], [Math.PI / 2 - 0.3, 0, Math.PI / 2]);
  // cranium: tall domed skull, narrow across the temples, deep front-to-back
  A.lathe('head', 'primary', [
    [-hh * 0.5, hh * 0.62],
    [hh * 0.1, hh * 0.8],
    [hh * 0.62, hh * 0.6],
    [hh * 0.88, hh * 0.18],
  ], { p: [0, hh * 0.5, -hh * 0.06], scaleX: 0.98, scaleZ: 1.2, seg: 20 });
  // SAGITTAL CREST — the ridge of muscle running fore-aft over the crown
  A.blade('head', 'primary', hh * 0.44, hh * 1.15, 0.1 * s, {
    p: [0, hh * 1.28, -hh * 0.12], r: [0, Math.PI / 2, 0], taper: 0.3 });
  shag('head', 0.2 * s, 0.9 * s, [0, hh * 1.4, -hh * 0.16], [Math.PI / 2, 0, Math.PI / 2]);
  // cheek flanges + ears tucked flat against the skull
  for (const sx of [-1, 1]) {
    A.lathe('head', 'primary', [
      [-hh * 0.3, hh * 0.16], [0, hh * 0.34], [hh * 0.34, hh * 0.2],
    ], { p: [sx * hh * 0.66, hh * 0.5, hh * 0.16], r: [0, 0, sx * 0.3], scaleZ: 1.1, seg: 12 });
    A.plate('head', 'dark', rhombOutline(hh * 0.24, hh * 0.3, { cut: 0.3 }), hh * 0.05, {
      p: [sx * hh * 0.8, hh * 0.62, -hh * 0.12], r: [0, sx * Math.PI / 2, 0], round: 0.25 });
  }
  // the cybernetic temple graft on the RIGHT side of the face (concept)
  A.plate('head', 'metal', rhombOutline(hh * 0.44, hh * 0.5, { cut: 0.3 }), hh * 0.08, {
    p: [hh * 0.72, hh * 0.72, hh * 0.04], r: [0, Math.PI / 2 - 0.2, 0.2], round: 0.16 });
  A.ball('head', 'glow', hh * 0.06, { p: [hh * 0.78, hh * 0.86, hh * 0.16], seg: 8 });

  // ---- BROW RIDGES on their own joints so they can furrow / raise ----
  addJoint(J, 'browL', 'head', -hh * 0.4, hh * 0.86, hh * 0.44);
  addJoint(J, 'browR', 'head', hh * 0.4, hh * 0.86, hh * 0.44);
  for (const side of ['L', 'R']) {
    const sx = side === 'L' ? -1 : 1;
    const br = 'brow' + side;
    // heavy bony shelf, angled down and outward over the eye
    A.taper(br, 'primary', [hh * 0.62, hh * 0.26, hh * 0.34], 0.7, 0.6, {
      p: [0, 0, 0], r: [-0.3, sx * 0.16, sx * 0.1] });
    A.plate(br, 'primary', rhombOutline(hh * 0.56, hh * 0.2, { cut: 0.34 }), hh * 0.12, {
      p: [0, hh * 0.04, hh * 0.1], r: [-0.42, sx * 0.16, sx * 0.08], round: 0.24 });
    shag(br, 0.12 * s, 0.42 * s, [0, hh * 0.16, -hh * 0.02], [0, 0, Math.PI / 2 + sx * 0.2]);
  }
  // deep-set amber eyes, sunk back under the shelves
  for (const sx of [-1, 1]) {
    A.ball('head', 'dark', hh * 0.16, { p: [sx * hh * 0.38, hh * 0.74, hh * 0.4], seg: 10 });
    A.ball('head', 'glow', hh * 0.1, { p: [sx * hh * 0.38, hh * 0.74, hh * 0.46], seg: 10 });
  }
  // muzzle: broad upper jaw block pushed forward, low and heavy
  A.facet('head', 'primary', hh * 0.5, hh * 0.6, hh * 0.44, hh * 0.8, {
    sides: 8, scaleX: 1.25, scaleZ: 0.9, p: [0, hh * 0.42, hh * 0.62], r: [Math.PI / 2 + 0.1, 0, 0] });
  // BROAD FLAT NOSE: two nostril pits in a wide dark pad
  A.plate('head', 'dark', rhombOutline(hh * 0.58, hh * 0.36, { cut: 0.3 }), hh * 0.08, {
    p: [0, hh * 0.5, hh * 0.94], r: [-0.12, 0, 0], round: 0.3 });
  for (const sx of [-1, 1]) {
    A.ball('head', 'dark', hh * 0.08, { p: [sx * hh * 0.14, hh * 0.44, hh * 0.98], seg: 8 });
  }
  // upper lip shelf the jaw closes against
  A.sharpBox('head', 'dark', [hh * 0.62, hh * 0.1, hh * 0.3], { p: [0, hh * 0.24, hh * 0.78] });

  // ---- JAW on its own joint: +rotation.x swings the mouth OPEN downward ----
  addJoint(J, 'jaw', 'head', 0, hh * 0.3, hh * 0.28);
  // everything below hangs FORWARD of the pivot, so a positive pitch drops it
  A.facet('jaw', 'primary', hh * 0.34, hh * 0.44, hh * 0.36, hh * 0.6, {
    sides: 6, scaleX: 1.2, scaleZ: 0.9, p: [0, -hh * 0.16, hh * 0.36], r: [Math.PI / 2, 0, 0] });
  A.plate('jaw', 'primary', shieldOutline(hh * 0.6, hh * 0.42, { taper: 0.72 }), hh * 0.12, {
    p: [0, -hh * 0.2, hh * 0.6], r: [0.24, 0, 0], round: 0.24 });
  A.sharpBox('jaw', 'dark', [hh * 0.56, hh * 0.08, hh * 0.26], { p: [0, -hh * 0.02, hh * 0.52] });
  // blunt tusks at the corners of the mouth
  for (const sx of [-1, 1]) {
    A.spike('jaw', 'metal', hh * 0.055, hh * 0.2, {
      p: [sx * hh * 0.2, hh * 0.04, hh * 0.62], r: [-0.2, 0, 0], seg: 6 });
  }
  shag('jaw', 0.16 * s, 0.5 * s, [0, -hh * 0.34, hh * 0.34], [0, 0, Math.PI / 2]);

  // ================= ARMS: LEFT organic / RIGHT full cybernetic ===========
  for (const side of ['L', 'R']) {
    const sx = side === 'L' ? -1 : 1;
    const cyber = side === 'R';
    const sh = 'shoulder' + side, el = 'elbow' + side, ha = 'hand' + side;
    // gorilla arms hang WIDE off a very broad chest
    J[sh].position.x = sx * (D.shoulderW + 0.42 * s);

    A.ball(sh, 'frame', 0.36 * s, {});
    if (cyber) {
      // segmented steel deltoid: stacked pauldron plates + blue cap
      A.pauldron(sh, 'metal', 1.02 * s, 0.86 * s, 0.96 * s, { p: [sx * 0.14 * s, 0.24 * s, 0], side: sx });
      A.lathe(sh, 'accent', [
        [0.04 * s, 0.5 * s], [0.34 * s, 0.42 * s], [0.56 * s, 0.14 * s],
      ], { p: [sx * 0.12 * s, 0.18 * s, 0], scaleZ: 0.95, seg: 18 });
      A.ring(sh, 'metal', 0.4 * s, 0.05 * s, { p: [sx * 0.1 * s, -0.05 * s, 0], r: [0, 0, Math.PI / 2] });
    } else {
      // organic shoulder: shaggy muscle mass with one bolted strap
      shag(sh, 0.62 * s, 1.2 * s, [sx * 0.12 * s, 0.06 * s, 0], [0.1, 0, sx * 0.25]);
      A.plate(sh, 'accent', rhombOutline(0.66 * s, 0.4 * s, { cut: 0.26 }), 0.07 * s, {
        p: [sx * 0.5 * s, 0.16 * s, 0.06 * s], r: [0, sx * Math.PI / 2, sx * 0.1], round: 0.12 });
      studs(sh, [[sx * 0.54 * s, 0.16 * s, 0.24 * s], [sx * 0.54 * s, 0.16 * s, -0.16 * s]], 0.045 * s);
    }

    // ---- upper arm: both are THICK (arms far heavier than the legs) ----
    A.lathe(sh, cyber ? 'frame' : 'primary', [
      [-ua * 1.0, 0.3 * s],
      [-ua * 0.58, 0.46 * s],
      [-ua * 0.12, 0.4 * s],
    ], { p: [sx * 0.06 * s, 0, 0], scaleZ: 1.05, seg: 18 });
    if (cyber) {
      // blue/red plate segments + a cable loom down the back of the arm
      A.plate(sh, 'metal', rhombOutline(0.5 * s, ua * 0.62, { cut: 0.26 }), 0.09 * s, {
        p: [sx * 0.42 * s, -ua * 0.5, 0.06 * s], r: [0, sx * Math.PI / 2, 0], round: 0.12 });
      A.plate(sh, 'accent', shieldOutline(0.56 * s, ua * 0.5, { taper: 0.76 }), 0.08 * s, {
        p: [0, -ua * 0.48, 0.42 * s], r: [0.06, 0, 0], round: 0.12 });
      A.piston(sh, 'metal', [sx * 0.16 * s, -0.1 * s, -0.28 * s], [sx * 0.2 * s, -ua * 0.82, -0.3 * s], 0.05 * s);
      A.piston(sh, 'metal', [sx * 0.34 * s, -0.12 * s, -0.22 * s], [sx * 0.36 * s, -ua * 0.78, -0.24 * s], 0.04 * s);
    } else {
      shag(sh, 0.46 * s, ua * 0.9, [sx * 0.1 * s, -ua * 0.5, 0], [0, 0, sx * 0.06]);
    }

    // ---- elbow + forearm ----
    A.part(el, 'metal', cyl(0.24 * s, 0.24 * s, 0.5 * s, 12), { r: [0, 0, Math.PI / 2] });
    if (cyber) {
      A.ring(el, 'metal', 0.26 * s, 0.05 * s, { r: [0, 0, Math.PI / 2] });
      A.facet(el, 'frame', 0.42 * s, 0.52 * s, 0.44 * s, fa * 1.0, {
        sides: 8, scaleZ: 1.05, p: [0, -fa * 0.5, 0] });
      // stacked blue outer plate + red inner plate + segment bands
      A.plate(el, 'metal', rhombOutline(0.56 * s, fa * 0.7, { cut: 0.26 }), 0.09 * s, {
        p: [sx * 0.44 * s, -fa * 0.5, 0.04 * s], r: [0, sx * Math.PI / 2, 0], round: 0.12 });
      A.plate(el, 'accent', shieldOutline(0.5 * s, fa * 0.6, { taper: 0.74 }), 0.08 * s, {
        p: [0, -fa * 0.52, 0.46 * s], r: [0, 0, 0], round: 0.12 });
      for (let i = 0; i < 3; i++) {
        A.tube(el, 'dark', 0.44 * s, 0.46 * s, 0.08 * s, { p: [0, -fa * (0.2 + i * 0.28), 0], seg: 14 });
      }
      A.piston(el, 'metal', [sx * 0.2 * s, -0.14 * s, -0.3 * s], [sx * 0.22 * s, -fa * 0.8, -0.3 * s], 0.045 * s);
      A.sharpBox(el, 'glowSoft', [0.035 * s, fa * 0.3, 0.035 * s], { p: [0, -fa * 0.5, -0.44 * s] });
    } else {
      // organic forearm: shaggy bulge with bolted armor BANDS around it
      A.lathe(el, 'primary', [
        [-fa * 1.0, 0.34 * s],
        [-fa * 0.62, 0.5 * s],
        [-fa * 0.2, 0.44 * s],
      ], { scaleZ: 1.06, seg: 18 });
      shag(el, 0.44 * s, fa * 0.8, [0, -fa * 0.5, 0], [0, 0, 0]);
      for (let i = 0; i < 3; i++) {
        const by = -fa * (0.24 + i * 0.26);
        A.tube(el, 'accent', 0.47 * s, 0.49 * s, 0.16 * s, { p: [0, by, 0], seg: 16 });
        studs(el, [[sx * 0.48 * s, by, 0.1 * s], [-sx * 0.44 * s, by, 0.16 * s]], 0.04 * s);
      }
    }

    // ---- hands: mechanical five-finger claw (R) vs fleshy knuckle fist (L) --
    if (cyber) {
      A.facet(ha, 'frame', 0.3 * s, 0.4 * s, 0.34 * s, 0.5 * s, { sides: 6, p: [0, -0.16 * s, 0.04 * s] });
      A.plate(ha, 'metal', rhombOutline(0.44 * s, 0.4 * s, { cut: 0.3 }), 0.07 * s, {
        p: [sx * 0.3 * s, -0.16 * s, 0.02 * s], r: [0, sx * Math.PI / 2, 0], round: 0.14 });
      // four segmented fingers + a splayed thumb
      for (let i = 0; i < 4; i++) {
        const fx = (i - 1.5) * 0.19 * s;
        for (let k = 0; k < 3; k++) {
          A.sharpBox(ha, k % 2 ? 'dark' : 'metal', [0.15 * s, 0.19 * s, 0.17 * s], {
            p: [fx, -0.46 * s - k * 0.2 * s, 0.16 * s + k * 0.05 * s], r: [-0.16 - k * 0.1, 0, 0] });
        }
        A.spike(ha, 'metal', 0.07 * s, 0.2 * s, {
          p: [fx, -1.06 * s, 0.32 * s], r: [Math.PI - 0.3, 0, 0], seg: 6 });
      }
      for (let k = 0; k < 2; k++) {
        A.sharpBox(ha, k ? 'dark' : 'metal', [0.15 * s, 0.2 * s, 0.17 * s], {
          p: [sx * 0.36 * s, -0.3 * s - k * 0.2 * s, 0.06 * s], r: [-0.1, 0, sx * (0.5 + k * 0.2)] });
      }
    } else {
      // fleshy knuckle fist — curled, walking on its knuckles
      const fw = 0.46 * s;
      A.ball(ha, 'primary', fw * 0.9, { p: [0, -fw * 0.5, 0], seg: 12 });
      A.part(ha, 'primary', roundedBox(fw * 1.9, fw * 1.7, fw * 1.8, fw * 0.4), {
        p: [0, -fw * 0.95, fw * 0.05] });
      for (let i = 0; i < 4; i++) { // the four heavy walking knuckles
        A.ball(ha, 'dark', fw * 0.3, { p: [(i - 1.5) * fw * 0.44, -fw * 1.5, fw * 0.6], seg: 10 });
      }
      A.capsule(ha, 'primary', fw * 0.26, fw * 0.34, {
        p: [sx * fw * 0.95, -fw * 0.75, fw * 0.3], r: [0.5, 0, sx * 0.45] });
      shag(ha, 0.3 * s, 0.6 * s, [0, -fw * 0.2, -fw * 0.2], [0.4, 0, 0]);
    }
    anchors['fist' + side] = addAnchor(J[ha], 0, cyber ? -0.95 * s : -0.7 * s, 0.28 * s);
  }

  // ================= LEGS: short, bowed, banded, big flat feet ============
  for (const side of ['L', 'R']) {
    const sx = side === 'L' ? -1 : 1;
    const th = 'thigh' + side, kn = 'knee' + side, an = 'ankle' + side;
    J[th].position.x = sx * (D.hipW + 0.22 * s); // wide bowed stance

    A.ball(th, 'frame', 0.32 * s, {});
    // stout bowed thigh — mass carried on the OUTSIDE of the curve
    A.lathe(th, 'primary', [
      [-tl * 1.0, 0.3 * s],
      [-tl * 0.6, 0.46 * s],
      [-tl * 0.12, 0.4 * s],
    ], { p: [sx * 0.08 * s, 0, 0.02 * s], r: [0, 0, -sx * 0.14], scaleZ: 1.12, seg: 18 });
    shag(th, 0.42 * s, tl * 0.9, [sx * 0.12 * s, -tl * 0.5, -0.04 * s], [0, 0, -sx * 0.14]);
    // riveted armor band around the thigh
    A.tube(th, 'accent', 0.44 * s, 0.46 * s, 0.16 * s, { p: [0, -tl * 0.7, 0], seg: 16 });
    studs(th, [[sx * 0.44 * s, -tl * 0.7, 0.06 * s], [0, -tl * 0.7, 0.44 * s]], 0.04 * s);

    A.part(kn, 'metal', cyl(0.22 * s, 0.22 * s, 0.44 * s, 12), { r: [0, 0, Math.PI / 2] });
    A.plate(kn, 'frame', shieldOutline(0.46 * s, 0.5 * s, { taper: 0.66 }), 0.09 * s, {
      p: [0, -0.02 * s, 0.34 * s], r: [0.16, 0, 0], round: 0.14 });
    // short thick shin, bowed back out to the ankle
    A.lathe(kn, 'primary', [
      [-sl * 1.0, 0.3 * s],
      [-sl * 0.62, 0.44 * s],
      [-sl * 0.2, 0.42 * s],
    ], { p: [0, 0, 0], r: [0, 0, sx * 0.1], scaleZ: 1.1, seg: 18 });
    shag(kn, 0.38 * s, sl * 0.8, [0, -sl * 0.5, -0.04 * s], [0, 0, sx * 0.1]);
    A.tube(kn, 'accent', 0.42 * s, 0.44 * s, 0.15 * s, { p: [0, -sl * 0.5, 0], seg: 16 });
    studs(kn, [[sx * 0.42 * s, -sl * 0.5, 0.06 * s], [0, -sl * 0.5, 0.42 * s]], 0.04 * s);

    // big flat ape foot: broad sole, five stubby toes, splayed big toe
    A.ball(an, 'frame', 0.2 * s, {});
    A.part(an, 'primary', roundedBox(0.82 * s, 0.26 * s, 1.05 * s, 0.1 * s), {
      p: [0, -0.14 * s, 0.14 * s] });
    A.sharpBox(an, 'dark', [0.8 * s, 0.1 * s, 1.1 * s], { p: [0, -0.27 * s, 0.14 * s] });
    for (let i = 0; i < 4; i++) {
      A.capsule(an, 'primary', 0.09 * s, 0.1 * s, {
        p: [(i - 1.5) * 0.16 * s - sx * 0.06 * s, -0.16 * s, 0.66 * s], r: [Math.PI / 2, 0, 0] });
    }
    A.capsule(an, 'primary', 0.12 * s, 0.14 * s, {
      p: [sx * 0.34 * s, -0.16 * s, 0.5 * s], r: [Math.PI / 2, 0, sx * 0.4] });
    // heel pad + ankle band
    A.facet(an, 'frame', 0.24 * s, 0.28 * s, 0.2 * s, 0.3 * s, {
      sides: 6, p: [0, -0.14 * s, -0.32 * s], r: [Math.PI / 2.3, 0, 0] });
    A.tube(an, 'accent', 0.26 * s, 0.28 * s, 0.12 * s, { p: [0, 0.06 * s, 0], seg: 14 });
  }

  // reactor core buried in the chest, behind the harness boss
  anchors.core = addAnchor(J.torso, 0, chH * 0.44, W * 0.2);
}
