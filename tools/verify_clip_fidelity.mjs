// DOES THE EXPORT SAY WHAT MECH MAYHEM SAYS? — bone by bone, frame by frame.
//
// Every pose in this game comes from a Mech Mayhem clip, sampled through MM's
// own animator by `tools/export-mech.mjs` in the robotworld repo. That sampling
// is the one seam where the two games can disagree without anyone noticing:
// the export writes glTF tracks, this game plays them with a plain
// AnimationMixer, and if a track is missing the mixer does not complain — it
// just leaves that bone wherever it was, and the mech tears itself apart.
//
// So this compares the two directly. It drives MM's own dev server, builds the
// mech, plays the clip through the REAL animator, and records every bone's
// world position at a set of times. Then it loads our exported .glb, plays the
// same clip at the same times with a bare mixer, and diffs.
//
// A clip is faithful when every bone lands in the same place. The units are
// the game's own (a mech is ~9 tall), so a 0.05 tolerance is a millimetre on a
// body that size.
//
//   robotworld:   npx vite --port 5175        (MM's dev server)
//   mechbrawler:  node server.mjs
//   node tools/verify_clip_fidelity.mjs [--glb <dir>] [mechId…]
//
// `--glb` points at the exported .glb directory to test (default `mechs/`).
import { chromium } from "playwright";

const MM = process.env.MM_BASE || "http://127.0.0.1:5175";
const US = process.env.BASE || "http://127.0.0.1:5174";
const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf("--" + n); return i < 0 ? d : args[i + 1]; };
const GLB_DIR = flag("glb", "/mechs");
const ids = args.filter((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--"));
const TOL = Number(flag("tol", "0.05"));
// Where in each clip to compare. Fractions of its duration, so a 0.2s jab and
// a 2s ultimate are both sampled across their whole shape.
const FRACTIONS = [0, 0.25, 0.5, 0.75, 0.99];

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium",
  args: ["--no-proxy-server", "--use-gl=angle", "--use-angle=swiftshader", "--no-sandbox"],
});

// ---------------------------------------------------------------- MM's truth
const mmPage = await browser.newPage();
const mmErrors = [];
mmPage.on("pageerror", (e) => mmErrors.push(String(e).slice(0, 200)));
await mmPage.goto(`${MM}/?export=__probe`, { waitUntil: "domcontentloaded" });

async function truthFor(id, fractions) {
  return mmPage.evaluate(async ({ id, fractions }) => {
    const THREE = await import("/node_modules/three/build/three.module.js")
      .catch(() => import("three"));
    const { buildGlbForTool, bakeMechScene } = await import("/src/mechs/gltf.js");
    const { ROSTER } = await import("/src/mechs/roster.js");
    const { profileFor } = await import("/src/mechs/glbanim.js");
    const { mechClips } = await import("/workbench/adapters/mechclips.js");
    const def = ROSTER.find((m) => m.id === id);
    if (!def) return { error: `no roster entry for ${id}` };
    const { mech } = await buildGlbForTool(def);
    if (!mech?.isGLB) return { error: "build fell back to procedural" };
    // THE SAME RENAME MAP THE EXPORT USES. A build bone is not called what the
    // exported one is called — the bake renames `bone_36` to `fistL` — so
    // matching the two skeletons by name without this compares a fist against
    // whatever else happened to be called that, and reports a body-height of
    // error on a rig that is perfectly fine.
    const baked = await bakeMechScene(id);
    const renames = baked?.renames || {};
    const animator = mech.premadeAnimator;
    const names = mechClips(def, mech.animProfile || profileFor(id));
    // The same neutral the exporter settles into — anything else compares a
    // converged pose against a sliding one.
    const CTX = { grounded: true, speed: 0, maxSpeed: 1, vy: 0, alwaysReady: true };
    const FPS = 30;
    const settle = () => {
      animator.stop(0);
      for (let i = 0; i < 90; i++) {
        animator.update(1 / FPS, CTX); mech.postAnimate(); mech.group.updateMatrixWorld(true);
      }
    };
    const out = {};
    for (const name of names) {
      settle();
      const dur = animator.play(name, { fade: 0 });
      if (!dur || !isFinite(dur) || dur <= 0) continue;
      const want = fractions.map((f) => f * dur);
      const takes = [];
      let t = 0, next = 0;
      for (let i = 0; i < Math.ceil(dur * FPS) + 2 && next < want.length; i++) {
        animator.update(i === 0 ? 1e-4 : 1 / FPS, CTX);
        mech.postAnimate();
        mech.group.updateMatrixWorld(true);
        t = i / FPS;
        while (next < want.length && t >= want[next] - 1e-6) {
          const pose = {};
          mech.group.traverse((o) => {
            if (!o.isBone) return;
            const name = renames[o.name] || o.name;
            const v = new THREE.Vector3();
            o.getWorldPosition(v);
            pose[name] = [v.x, v.y, v.z];
          });
          takes.push({ t, pose });
          next++;
        }
      }
      animator.stop(0);
      out[name] = { dur, takes };
    }

    // THE GAITS AND THE HELD POSES, sampled the way the exporter samples them
    // — they are not clips in MM at all. `walk`/`run` are the procedural
    // locomotion layer at a fixed ground speed, and jump/hover/crouch/idle are
    // animator layers keyed off the frame context. Leaving them out of this
    // comparison would leave out the states a fighter spends most of its life
    // in, which is exactly where a mismatch is most visible.
    const { moveSpeedFor } = await import("/src/combat/fighter.js");
    const top = moveSpeedFor(def);
    const grab = (t) => {
      const pose = {};
      mech.group.traverse((o) => {
        if (!o.isBone) return;
        const name = renames[o.name] || o.name;
        const v = new THREE.Vector3();
        o.getWorldPosition(v);
        pose[name] = [v.x, v.y, v.z];
      });
      return { t, pose };
    };
    for (const [label, speed] of [["walk", top * 0.45], ["run", top]]) {
      const ctx = { speed, maxSpeed: top, grounded: true, vy: 0, alwaysReady: true };
      animator.stop(0);
      for (let i = 0; i < 400; i++) {
        animator.update(1 / FPS, ctx); mech.postAnimate(); mech.group.updateMatrixWorld(true);
      }
      // One full cycle, by PHASE — the exporter's own loop condition, so the
      // two clips cover the same ground even though neither is time-based.
      const start = animator.phase;
      const takes = [grab(0)];
      let t = 0;
      for (let g = 0; g < 2000; g++) {
        animator.update(1 / FPS, ctx); mech.postAnimate(); mech.group.updateMatrixWorld(true);
        t += 1 / FPS;
        takes.push(grab(t));
        let turned = animator.phase - start;
        while (turned < 0) turned += Math.PI * 2;
        if (turned >= Math.PI * 2 - 1e-3) break;
      }
      // Keep the same fractions the action clips use.
      const dur = t;
      const picked = fractions.map((f) => {
        const want = f * dur;
        return takes.reduce((a, b) => Math.abs(b.t - want) < Math.abs(a.t - want) ? b : a);
      });
      out[label] = { dur, takes: picked };
    }
    const duck = def.stats?.duck ?? 0.55;
    for (const [label, pctx] of [
      ["jumpRise", { grounded: false, vy: 8 }],
      ["jumpFall", { grounded: false, vy: -8 }],
      ["hover", { grounded: false, hovering: true, speed: top, maxSpeed: top }],
      ["crouch", { grounded: true, duck }],
      ["battleIdle", { grounded: true, speed: 0, vy: 0 }],
    ]) {
      animator.stop(0);
      const ctx = { grounded: true, speed: 0, maxSpeed: 1, vy: 0, alwaysReady: true, ...pctx };
      for (let i = 0; i < 90; i++) {
        animator.update(1 / FPS, ctx); mech.postAnimate(); mech.group.updateMatrixWorld(true);
      }
      // A held pose: one sample is the whole clip.
      out[label] = { dur: 0.5, takes: [grab(0)] };
    }
    // The mech's world scale: MM builds at native size, the export folds the
    // game transform in, so the two are only comparable through this.
    const s = new THREE.Vector3();
    mech.group.getWorldScale(s);
    return { clips: out, scale: s.toArray() };
  }, { id, fractions });
}

// ------------------------------------------------------------- our .glb
const usPage = await browser.newPage();
const usErrors = [];
usPage.on("pageerror", (e) => usErrors.push(String(e).slice(0, 200)));
await usPage.goto(`${US}/index.html?camera=flat`, { waitUntil: "domcontentloaded" });

async function oursFor(id, dir, want) {
  return usPage.evaluate(async ({ id, dir, want }) => {
    const THREE = await import("/vendor/three/three.module.js");
    const { GLTFLoader } = await import("/vendor/three/loaders/GLTFLoader.js");
    const gltf = await new GLTFLoader().loadAsync(`${dir}/${id}.glb`);
    const root = gltf.scene;
    const out = {};
    for (const [name, times] of Object.entries(want)) {
      const clip = gltf.animations.find((c) => c.name === name);
      if (!clip) { out[name] = { missing: true }; continue; }
      const mixer = new THREE.AnimationMixer(root);
      mixer.clipAction(clip).reset().play();
      const takes = [];
      for (const t of times) {
        mixer.setTime(Math.min(t, clip.duration - 1e-4));
        root.updateMatrixWorld(true);
        const pose = {};
        root.traverse((o) => {
          if (!o.isBone) return;
          const v = new THREE.Vector3();
          o.getWorldPosition(v);
          pose[o.name] = [v.x, v.y, v.z];
        });
        takes.push({ t, pose });
      }
      mixer.stopAllAction();
      out[name] = { dur: clip.duration, takes,
                    bones: new Set(clip.tracks.map((tr) => tr.name.split(".")[0])).size };
    }
    return out;
  }, { id, dir, want });
}

const roster = ids.length ? ids : await usPage.evaluate(async () =>
  (await import("/src/characters.js")).CHARACTER_KEYS);

let failures = 0, checked = 0;
const summary = [];
for (const id of roster) {
  const truth = await truthFor(id, FRACTIONS);
  if (truth.error) { console.log(`${id}: ${truth.error}`); failures++; continue; }
  // MM builds at native scale; the export folds the game transform in, so the
  // comparison is of SHAPE — every bone divided by the body's own height.
  const want = {};
  for (const [name, c] of Object.entries(truth.clips)) want[name] = c.takes.map((t) => t.t);
  const ours = await oursFor(id, GLB_DIR, want);

  const bad = [];
  let worstAll = 0;
  for (const [name, c] of Object.entries(truth.clips)) {
    const mine = ours[name];
    if (!mine || mine.missing) { bad.push({ name, note: "clip missing from the .glb" }); continue; }
    // Two things have to be divided out before a difference means anything,
    // and both are DELIBERATE parts of the export rather than faults:
    //
    //   SCALE  MM builds at native size; the export folds the game transform
    //          in, so a mech is ~9 units here and ~3 there. Everything is
    //          measured in body-heights (hips->head) to make the two comparable.
    //   YAW    the export folds a yaw so the model faces +z ("yawOffsetFolded"
    //          in the sidecar). The whole skeleton turns with it.
    //
    // The yaw is fitted rather than read from the sidecar, by the standard
    // planar Procrustes solution — the angle that best rotates our bones onto
    // MM's about Y. Fitting it means this tool cannot be fooled by a fold it
    // was told about; a body that is genuinely turned the wrong way still
    // fails, because one angle cannot align a skeleton that disagrees.
    const span = (pose) => {
      const h = pose.head || pose.torso, p = pose.hips;
      return h && p ? Math.hypot(h[0]-p[0], h[1]-p[1], h[2]-p[2]) : 1;
    };
    let worst = 0, worstBone = "", worstT = 0;
    for (let i = 0; i < c.takes.length && i < mine.takes.length; i++) {
      const A = c.takes[i].pose, B = mine.takes[i].pose;
      const sa = span(A), sb = span(B);
      const oa = A.hips || [0,0,0], ob = B.hips || [0,0,0];
      const rel = (P, o, s, bone) =>
        [(P[bone][0]-o[0])/s, (P[bone][1]-o[1])/s, (P[bone][2]-o[2])/s];
      const shared = Object.keys(B).filter((b) => A[b]);
      // Best-fit yaw: maximise sum(a . R(theta) b) -> theta = atan2(S, C).
      let S = 0, C = 0;
      for (const bone of shared) {
        const a = rel(A, oa, sa, bone), b = rel(B, ob, sb, bone);
        C += a[0]*b[0] + a[2]*b[2];
        S += a[0]*b[2] - a[2]*b[0];
      }
      const th = Math.atan2(S, C), cs = Math.cos(th), sn = Math.sin(th);
      for (const bone of shared) {
        const a = rel(A, oa, sa, bone), b = rel(B, ob, sb, bone);
        // rotate b about Y by th
        const bx = b[0]*cs + b[2]*sn, bz = -b[0]*sn + b[2]*cs;
        const d = Math.hypot(a[0]-bx, a[1]-b[1], a[2]-bz);
        if (d > worst) { worst = d; worstBone = bone; worstT = c.takes[i].t; }
      }
    }
    checked++;
    worstAll = Math.max(worstAll, worst);
    if (worst > TOL) bad.push({ name, worst, worstBone, worstT, bones: mine.bones });
  }
  summary.push({ id, bad: bad.length, of: Object.keys(truth.clips).length, worst: worstAll });
  console.log(`\n${id}: ${Object.keys(truth.clips).length} clips, `
    + `${bad.length} disagree with Mech Mayhem (worst ${worstAll.toFixed(3)} body-heights)`);
  for (const bset of bad.slice(0, 12)) {
    console.log(bset.note ? `  FAIL ${bset.name.padEnd(16)} ${bset.note}`
      : `  FAIL ${bset.name.padEnd(16)} ${bset.worst.toFixed(3)} @ ${bset.worstBone} (t=${bset.worstT.toFixed(2)}s, ${bset.bones} bones tracked)`);
  }
  failures += bad.length;
}

console.log(`\n---- ${checked} clips compared, ${failures} disagree (tolerance ${TOL}) ----`);
for (const s of summary) {
  console.log(`  ${s.id.padEnd(10)} ${String(s.bad).padStart(3)}/${s.of}   worst ${s.worst.toFixed(3)}`);
}
if (mmErrors.length) console.log("MM page errors:", mmErrors.slice(0, 3));
if (usErrors.length) console.log("our page errors:", usErrors.slice(0, 3));
await browser.close();
process.exit(failures ? 1 : 0);
