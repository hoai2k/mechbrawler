// One mech per file — shared sculpting vocabulary lives in ../parts.js;
// see docs/IMAGE_TO_MECH.md and docs/MECH_ART_GUIDE.md.
import * as THREE from 'three';
import { cyl, shieldOutline, rhombOutline } from '../parts.js';
import { addAnchor } from '../factory.js';

// ============================================================
// 17. NULLBOT — the fatal exception, matched to the canonical
//     concept (docs/canonical/mech_null.png): a TALL void-black
//     frame built from layered jagged shards. Crown-horned head
//     with TWIN red eyes, a red null-sigil (a slashed ring, Ø)
//     burning in the sternum, spike-stacked pauldrons, long
//     skeletal arms ending in claws, blade-edged legs — and small
//     corruption shards (glow2) bolted all over the shell at wrong
//     angles, which the animator strobes like a failing display
//     while runtime FX pop multicolor data-flecks off the body.
// ============================================================
export function nullbot(A, D, J, anchors, def) {
  const s = D.scale;
  const W = D.torsoW;
  const chH = D.torsoH;
  const hs = D.headSize;
  const ua = D.upperArmLen, fa = D.foreArmLen;

  // corruption shard: a thin glowing chip pinned at a deliberately WRONG
  // angle, as if a rectangle of the mech failed to render in place
  const shard = (joint, mat, w, h, p, r) => {
    A.sharpBox(joint, mat, [w, h, 0.022 * s], { p, r });
  };

  // ================= PELVIS: pinched, bladed =================
  A.lathe('hips', 'frame', [
    [-0.14 * s, W * 0.24], [0.18 * s, W * 0.15], [0.5 * s, W * 0.22],
  ], { scaleX: 1.1, seg: 16 });
  A.facet('hips', 'primary', W * 0.26, W * 0.31, W * 0.2, 0.6 * s, {
    sides: 6, scaleZ: 0.7, p: [0, -0.32 * s, 0] });
  // jagged skirt shards off the hip corners, tips down (kept off the
  // centerline so the pelvis doesn't read as a bundle of slats)
  for (const [a, L] of [[-1.1, 0.85], [-0.55, 1.05], [0.55, 1.05], [1.1, 0.85], [Math.PI, 0.95]]) {
    A.blade('hips', 'accent', L * s, 0.24 * s, 0.03 * s, {
      p: [Math.sin(a) * W * 0.38, -0.42 * s - L * 0.3 * s, Math.cos(a) * W * 0.3],
      r: [Math.PI + (Math.cos(a) >= 0 ? 0.14 : -0.14), a * 0.4, -a * 0.26], taper: 0.16 });
  }
  A.tube('hips', 'dark', W * 0.17, W * 0.19, 0.07 * s, { p: [0, 0.12 * s, 0] });

  // ================= TORSO: gaunt V-core under layered shards =================
  A.lathe('torso', 'primary', [
    [chH * 0.04, W * 0.2],
    [chH * 0.34, W * 0.3],
    [chH * 0.68, W * 0.42],
    [chH * 0.94, W * 0.44],
    [chH * 1.08, W * 0.18],
  ], { scaleX: 1.02, scaleZ: 0.58, seg: 20 });
  // angled chest slabs meeting at the sternum (the V), edges knife-sharp
  for (const sx of [-1, 1]) {
    A.plate('torso', 'primary', rhombOutline(W * 0.36, chH * 0.55, { cut: 0.32 }), 0.06 * s, {
      p: [sx * W * 0.19, chH * 0.66, W * 0.23], r: [-0.1, sx * 0.3, sx * 0.5], round: 0.1 });
    // short jagged trim erupting along the collar line (kept tight to the
    // chest — the big spikes belong to the pauldrons)
    for (let i = 0; i < 2; i++) {
      A.blade('torso', i % 2 ? 'accent' : 'primary', (0.34 + i * 0.12) * s, 0.13 * s, 0.026 * s, {
        p: [sx * W * (0.26 + i * 0.1), chH * (0.98 + i * 0.03), W * (0.1 - i * 0.05)],
        r: [-0.42 - i * 0.2, sx * 0.3, sx * (0.4 + i * 0.24)], taper: 0.14 });
    }
  }
  // exposed dark spine rings at the waist gap
  for (let i = 0; i < 3; i++) {
    A.tube('torso', 'dark', W * (0.16 - i * 0.013), W * (0.175 - i * 0.013), 0.055 * s, {
      p: [0, chH * (0.16 - i * 0.09), 0] });
  }
  // ---- THE NULL SIGIL: a red ring with a blade slashed through it,
  // burning PROUD of the chest plates on a recessed dark socket ----
  A.facet('torso', 'dark', W * 0.26, W * 0.28, W * 0.24, 0.1 * s, {
    sides: 8, p: [0, chH * 0.62, W * 0.26], r: [Math.PI / 2, 0, 0] });
  A.ring('torso', 'glow', W * 0.18, 0.035 * s, {
    p: [0, chH * 0.62, W * 0.34], seg: 28 });
  A.sharpBox('torso', 'glow', [0.045 * s, W * 0.56, 0.035 * s], {
    p: [0, chH * 0.62, W * 0.34], r: [0, 0, 0.42] });
  A.ball('torso', 'glowSoft', W * 0.07, { p: [0, chH * 0.62, W * 0.3], seg: 10 });
  // back: a low swept fan of crooked black spines — raked BACKWARD off the
  // shoulder blades so they read as a mantle, not a halo
  for (const [x, L, rz] of [[-0.28, 0.95, 0.42], [-0.1, 1.25, 0.16], [0.12, 1.3, -0.12], [0.3, 1.0, -0.4]]) {
    A.blade('torso', 'accent', L * s, 0.17 * s, 0.03 * s, {
      p: [x * W, chH * 0.82 + L * 0.26 * s, -W * (0.3 + Math.abs(x) * 0.2)],
      r: [-0.72, 0, rz], taper: 0.1 });
  }
  A.tube('torso', 'frame', W * 0.12, W * 0.15, 0.12 * s, { p: [0, chH * 1.05, 0] });
  // corruption shards: SMALL glowing chips at broken angles, hugging the
  // plate lines (the runtime particle FX supply the drama; these just mark
  // where the shell is failing)
  shard('torso', 'glow2', 0.2 * s, 0.06 * s, [W * 0.4, chH * 0.5, W * 0.12], [0.1, 0.9, 0.5]);
  shard('torso', 'glow2', 0.1 * s, 0.1 * s, [-W * 0.38, chH * 0.76, W * 0.16], [-0.3, -0.6, 0.2]);
  shard('torso', 'glow2', 0.14 * s, 0.05 * s, [-W * 0.3, chH * 0.28, W * 0.16], [0.2, 0.4, -0.5]);

  // ================= HEAD: horned crown, twin red eyes =================
  const hy = hs * 0.7;
  A.tube('head', 'frame', hs * 0.22, hs * 0.3, hs * 0.7, { p: [0, hy * 0.25, 0] });
  // angular skull: chamfered wedge with a BLACK void face plate up front
  A.facet('head', 'primary', hs * 0.6, hs * 0.76, hs * 0.36, hs * 1.3, {
    sides: 6, scaleZ: 0.95, p: [0, hy + hs * 0.5, -hs * 0.06] });
  A.taper('head', 'dark', [hs * 0.92, hs * 1.0, hs * 0.5], 0.72, 0.6, {
    p: [0, hy + hs * 0.5, hs * 0.28] });
  // brow ridge shading the eyes
  A.sharpBox('head', 'accent', [hs * 1.02, hs * 0.16, hs * 0.34], {
    p: [0, hy + hs * 0.86, hs * 0.32], r: [0.3, 0, 0] });
  // TWIN red eyes — narrow, burning, unmistakable
  for (const sx of [-1, 1]) {
    A.ball('head', 'glow', hs * 0.13, { p: [sx * hs * 0.26, hy + hs * 0.58, hs * 0.5], seg: 8 });
    A.sharpBox('head', 'glowSoft', [hs * 0.2, hs * 0.04, hs * 0.06], {
      p: [sx * hs * 0.28, hy + hs * 0.46, hs * 0.52], r: [0, 0, sx * 0.32] });
  }
  // pointed chin guard
  A.spike('head', 'accent', hs * 0.2, hs * 0.55, {
    p: [0, hy + hs * 0.05, hs * 0.34], r: [Math.PI - 0.42, 0, 0], seg: 4 });
  // the CROWN: two big swept ear-horns + a short center peak — clean and
  // wicked, not a sunburst
  for (const sx of [-1, 1]) {
    A.spike('head', 'primary', hs * 0.24, hs * 1.6, {
      p: [sx * hs * 0.72, hy + hs * 1.35, 0], r: [-0.1, 0, sx * 0.6], seg: 5 });
    A.spike('head', 'accent', hs * 0.1, hs * 0.75, {
      p: [sx * hs * 0.34, hy + hs * 1.38, -hs * 0.08], r: [-0.16, 0, sx * 0.2], seg: 4 });
  }
  A.spike('head', 'primary', hs * 0.12, hs * 0.9, {
    p: [0, hy + hs * 1.5, -hs * 0.14], r: [-0.22, 0, 0], seg: 4 });

  // ================= ARMS: long, skeletal, clawed =================
  for (const side of ['L', 'R']) {
    const sx = side === 'L' ? -1 : 1;
    const sh = 'shoulder' + side, el = 'elbow' + side, ha = 'hand' + side;

    A.ball(sh, 'frame', 0.18 * s, {});
    // pauldron: a big layered shell hugging the shoulder, crowned by a
    // rank of UPSWEPT spikes fanning outward — the concept's dominant mass
    A.lathe(sh, 'primary', [
      [-0.2 * s, 0.34 * s], [0.04 * s, 0.4 * s], [0.3 * s, 0.14 * s],
    ], { p: [sx * 0.1 * s, 0.1 * s, 0], scaleZ: 0.92, seg: 14 });
    A.plate(sh, 'accent', rhombOutline(0.5 * s, 0.4 * s, { cut: 0.3 }), 0.05 * s, {
      p: [sx * 0.3 * s, 0.1 * s, 0], r: [0, sx * Math.PI / 2, sx * 0.3], round: 0.12 });
    for (let i = 0; i < 3; i++) {
      const L = (0.85 + i * 0.35) * s;
      A.spike(sh, i % 2 ? 'accent' : 'primary', (0.11 + i * 0.02) * s, L, {
        p: [sx * (0.1 + i * 0.16) * s, 0.34 * s + L * 0.34, -0.02 * s - i * 0.05 * s],
        r: [-0.08 - i * 0.07, 0, sx * (0.18 + i * 0.3)], seg: 4 });
    }
    A.spike(sh, 'accent', 0.07 * s, 0.7 * s, { // one raked back
      p: [sx * 0.22 * s, 0.36 * s, -0.22 * s], r: [-0.6, 0, sx * 0.45], seg: 4 });
    shard(sh, 'glow2', 0.16 * s, 0.06 * s, [sx * 0.34 * s, 0.16 * s, 0.12 * s], [0.2, sx * 0.8, sx * 0.5]);
    // upper arm: bone core + exposed dark actuator
    A.tube(sh, 'frame', 0.08 * s, 0.1 * s, ua * 0.94, { p: [0, -ua * 0.5, 0] });
    A.tube(sh, 'dark', 0.032 * s, 0.032 * s, ua * 0.7, {
      p: [sx * 0.03 * s, -ua * 0.48, 0.1 * s], seg: 8 });
    A.plate(sh, 'accent', rhombOutline(0.22 * s, ua * 0.55, { cut: 0.3 }), 0.04 * s, {
      p: [sx * 0.14 * s, -ua * 0.5, 0], r: [0, sx * Math.PI / 2, 0], round: 0.12 });
    A.part(el, 'dark', cyl(0.1 * s, 0.1 * s, 0.24 * s, 10), { r: [0, 0, Math.PI / 2] });
    // elbow spur — a short wicked backward spike
    A.spike(el, 'accent', 0.05 * s, 0.32 * s, {
      p: [0, 0.02 * s, -0.15 * s], r: [-2.2, 0, 0], seg: 4 });
    // forearm: chamfered housing with a serrated outer fin
    A.facet(el, 'primary', 0.12 * s, 0.17 * s, 0.13 * s, fa * 0.92, {
      sides: 6, scaleZ: 1.1, p: [0, -fa * 0.5, 0] });
    for (let i = 0; i < 3; i++) {
      A.blade(el, 'accent', (0.42 - i * 0.08) * s, 0.1 * s, 0.024 * s, {
        p: [sx * 0.17 * s, -fa * (0.3 + i * 0.24), -0.02 * s],
        r: [Math.PI + 0.5, 0, sx * 0.5], taper: 0.15 });
    }
    shard(el, 'glow2', 0.16 * s, 0.055 * s, [sx * 0.16 * s, -fa * 0.55, 0.1 * s], [0.15, sx * 0.8, 0.5]);
    // hand: slim palm + four long DARK claw fingers and a thumb spike
    A.facet(ha, 'frame', 0.1 * s, 0.13 * s, 0.09 * s, 0.26 * s, { sides: 6, p: [0, -0.07 * s, 0] });
    for (let i = -1; i <= 2; i++) {
      const fxr = i - 0.5;
      A.sharpBox(ha, 'dark', [0.034 * s, 0.18 * s, 0.04 * s], {
        p: [fxr * 0.055 * s, -0.26 * s, 0.05 * s], r: [-0.5, 0, fxr * 0.06] });
      A.spike(ha, 'accent', 0.026 * s, 0.3 * s, {
        p: [fxr * 0.055 * s, -0.44 * s, 0.11 * s], r: [Math.PI - 0.14, 0, fxr * 0.06], seg: 5 });
    }
    A.sharpBox(ha, 'dark', [0.032 * s, 0.14 * s, 0.038 * s], {
      p: [sx * 0.11 * s, -0.17 * s, 0.02 * s], r: [-0.3, 0, sx * 0.65] });
    A.spike(ha, 'accent', 0.024 * s, 0.2 * s, {
      p: [sx * 0.16 * s, -0.28 * s, 0.05 * s], r: [Math.PI - 0.12, 0, sx * 0.6], seg: 5 });
  }

  // ================= LEGS: long blade-edged stalkers =================
  for (const side of ['L', 'R']) {
    const sx = side === 'L' ? -1 : 1;
    const th = 'thigh' + side, kn = 'knee' + side, an = 'ankle' + side;
    const tl = D.thighLen, sl = D.shinLen;

    A.ball(th, 'frame', 0.19 * s, {});
    A.lathe(th, 'primary', [
      [-tl * 1.0, 0.13 * s], [-tl * 0.55, 0.22 * s], [-tl * 0.1, 0.17 * s],
    ], { scaleZ: 1.2, seg: 16, p: [0, 0, 0.02 * s] });
    // outer thigh shard
    A.blade(th, 'accent', tl * 0.8, 0.2 * s, 0.03 * s, {
      p: [sx * 0.22 * s, -tl * 0.45, 0], r: [Math.PI + 0.08, 0, sx * 0.2], taper: 0.2 });
    A.plate(th, 'primary', shieldOutline(0.3 * s, tl * 0.6, { taper: 0.6 }), 0.045 * s, {
      p: [0, -tl * 0.42, 0.17 * s], r: [0.1, 0, 0], round: 0.12 });
    shard(th, 'glow2', 0.16 * s, 0.055 * s, [sx * 0.2 * s, -tl * 0.7, 0.08 * s], [0.3, sx * 1.1, 0.4]);

    A.part(kn, 'dark', cyl(0.12 * s, 0.12 * s, 0.3 * s, 10), { r: [0, 0, Math.PI / 2] });
    // knee spike punching forward
    A.spike(kn, 'accent', 0.07 * s, 0.42 * s, {
      p: [0, -0.02 * s, 0.2 * s], r: [Math.PI / 2.3, 0, 0], seg: 4 });
    // shin: lean core with a serrated front blade line
    A.lathe(kn, 'primary', [
      [-sl * 1.0, 0.09 * s], [-sl * 0.62, 0.15 * s], [-sl * 0.2, 0.12 * s],
    ], { scaleZ: 1.25, seg: 14 });
    A.blade(kn, 'primary', sl * 0.8, 0.12 * s, 0.03 * s, {
      p: [0, -sl * 0.5, 0.17 * s], r: [0.08, 0, 0], taper: 0.16 });
    for (let i = 0; i < 2; i++) { // rear calf spurs
      A.blade(kn, 'accent', (0.5 - i * 0.14) * s, 0.11 * s, 0.026 * s, {
        p: [0, -sl * (0.35 + i * 0.3), -0.15 * s], r: [Math.PI - 0.42, 0, 0], taper: 0.14 });
    }
    shard(kn, 'glow2', 0.17 * s, 0.05 * s, [sx * 0.13 * s, -sl * 0.6, 0.1 * s], [0.2, sx * 0.9, -0.5]);

    // clawed foot: armored bridge + two toe talons and a heel spur
    A.ball(an, 'frame', 0.11 * s, {});
    A.taper(an, 'primary', [0.24 * s, 0.24 * s, 0.42 * s], 0.6, 0.5, { p: [0, -0.14 * s, 0.1 * s] });
    for (const tx of [-1, 1]) {
      A.spike(an, 'dark', 0.055 * s, 0.5 * s, {
        p: [tx * 0.09 * s, -0.2 * s, 0.3 * s], r: [2.0, 0, tx * 0.16], seg: 5 });
    }
    A.spike(an, 'dark', 0.045 * s, 0.3 * s, {
      p: [0, -0.15 * s, -0.16 * s], r: [-2.1, 0, 0], seg: 5 });
  }

  // ================= ANCHORS =================
  // bolts fire out of the right palm (the claws present them)
  anchors.muzzleR = addAnchor(J.handR, 0, -0.3 * s, 0.3 * s);
  anchors.muzzleL = addAnchor(J.handL, 0, -0.3 * s, 0.3 * s);
  // core light burns behind the null sigil
  anchors.core = addAnchor(J.torso, 0, chH * 0.62, W * 0.12);
}

// GLB dress pass: when NULLBOT is replaced by a rigged model from
// public/models/manifest.json, the sculpted glow2 corruption shards above
// don't exist — so this pins the same failing-display chips onto the
// virtual joints over the model's shell and registers their material as
// materials.glow2, which keeps the animator strobe contract (§5) alive.
// A glitch lamp tracks the strobe so the flicker throws light on the body.
export function nullbotGlbDress(mech) {
  const { joints: J, dims: D, def } = mech;
  const s = D.scale;
  const W = D.torsoW, chH = D.torsoH;
  const fa = D.foreArmLen, tl = D.thighLen, sl = D.shinLen;
  const mat = new THREE.MeshStandardMaterial({
    color: def.colors.glow2, emissive: def.colors.glow2, emissiveIntensity: 2.4,
    roughness: 0.4, metalness: 0.1,
  });
  mech.materials.glow2 = mat;
  const shard = (joint, w, h, p, r) => {
    if (!J[joint]) return;
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.022 * s), mat);
    m.position.set(...p);
    m.rotation.set(...r);
    J[joint].add(m);
  };
  // same broken-angle chip layout as the sculpted shell
  shard('torso', 0.2 * s, 0.06 * s, [W * 0.4, chH * 0.5, W * 0.12], [0.1, 0.9, 0.5]);
  shard('torso', 0.1 * s, 0.1 * s, [-W * 0.38, chH * 0.76, W * 0.16], [-0.3, -0.6, 0.2]);
  shard('torso', 0.14 * s, 0.05 * s, [-W * 0.3, chH * 0.28, W * 0.16], [0.2, 0.4, -0.5]);
  for (const side of ['L', 'R']) {
    const sx = side === 'L' ? -1 : 1;
    shard('shoulder' + side, 0.16 * s, 0.06 * s, [sx * 0.34 * s, 0.16 * s, 0.12 * s], [0.2, sx * 0.8, sx * 0.5]);
    shard('elbow' + side, 0.16 * s, 0.055 * s, [sx * 0.16 * s, -fa * 0.55, 0.1 * s], [0.15, sx * 0.8, 0.5]);
    shard('thigh' + side, 0.16 * s, 0.055 * s, [sx * 0.2 * s, -tl * 0.7, 0.08 * s], [0.3, sx * 1.1, 0.4]);
    shard('knee' + side, 0.17 * s, 0.05 * s, [sx * 0.13 * s, -sl * 0.6, 0.1 * s], [0.2, sx * 0.9, -0.5]);
  }
  const lamp = new THREE.PointLight(def.colors.glow2, 5, 8 * s, 2);
  lamp.position.set(0, chH * 0.6, W * 0.35);
  J.torso.add(lamp);
  mech.postDress = () => {
    lamp.intensity = 2.2 * mat.emissiveIntensity;
    lamp.color.copy(mat.emissive);
  };
}
