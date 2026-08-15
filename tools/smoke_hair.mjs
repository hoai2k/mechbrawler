// Smoke the hair chain (blender_conform.py extract_skin_chain + props.js
// swayChains): Uro's mane must be its OWN geometry on its OWN bones, moving
// separately from her skull.
//
// This cannot be checked by eye at 384 px — hair welded to the head still
// looks like hair, it just never lags. And it cannot be checked in Blender,
// because the sway is an engine layer driven by the pose clock. So this loads
// the delivered rig, sways it at two different times, and measures how far
// hair vertices travel versus how far the head travels. A rig whose hair is
// still skull skin scores zero on the first and passes nothing.
//
// Needs `playwright` and Chromium; start the game first (node server.mjs),
// then: node tools/smoke_hair.mjs [baseUrl]
import { chromium } from "playwright";

const BASE = process.argv[2] || "http://127.0.0.1:5174";

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-proxy-server", "--enable-unsafe-swiftshader"],
});

let failures = 0;
const check = (ok, label, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${detail ? `   ${detail}` : ""}`);
};

const page = await browser.newPage();
page.on("pageerror", (e) => console.log("PAGEERROR", String(e).slice(0, 300)));
await page.goto(`${BASE}/index.html`, { waitUntil: "load" });

const r = await page.evaluate(async () => {
  const THREE = await import("/vendor/three/three.module.js");
  const { GLTFLoader } = await import("/vendor/three/loaders/GLTFLoader.js");
  const { swayChains, chainsOf, CHARACTER_CHAINS } = await import("/render3d/src/props.js");

  const gltf = await new GLTFLoader().loadAsync("/render3d/assets/uro/uro.glb");
  const root = gltf.scene;
  root.updateMatrixWorld(true);

  // Skinned vertex positions, evaluated by hand from the bone matrices — the
  // GPU does this at draw time and never hands it back, so the CPU has to
  // redo it to measure anything.
  const mesh = (() => { let m = null; root.traverse((o) => { if (o.isSkinnedMesh && !m) m = o; }); return m; })();
  const pos = mesh.geometry.attributes.position;
  const skinIndex = mesh.geometry.attributes.skinIndex;
  const skinWeight = mesh.geometry.attributes.skinWeight;
  const names = mesh.skeleton.bones.map((b) => b.name);
  const hairJoints = new Set(names.map((n, i) => (/^Chain_hair_/.test(n) ? i : -1)).filter((i) => i >= 0));
  const headJoint = names.indexOf("Head");

  // Sample vertices dominated by hair bones, and by Head, so the two can be
  // compared under the same sway.
  const pick = (want) => {
    const out = [];
    for (let i = 0; i < pos.count && out.length < 200; i += 7) {
      let best = -1, bw = 0;
      for (let k = 0; k < 4; k++) {
        const w = skinWeight.getComponent(i, k);
        if (w > bw) { bw = w; best = skinIndex.getComponent(i, k); }
      }
      if (bw >= 0.5 && want(best)) out.push(i);
    }
    return out;
  };
  const hairVerts = pick((j) => hairJoints.has(j));
  const headVerts = pick((j) => j === headJoint);

  const skinned = (verts) => {
    const v = new THREE.Vector3(), t = new THREE.Vector3(), acc = new THREE.Vector3();
    const m = new THREE.Matrix4();
    return verts.map((i) => {
      v.fromBufferAttribute(pos, i);
      acc.set(0, 0, 0);
      for (let k = 0; k < 4; k++) {
        const w = skinWeight.getComponent(i, k);
        if (!w) continue;
        const j = skinIndex.getComponent(i, k);
        m.multiplyMatrices(mesh.skeleton.bones[j].matrixWorld, mesh.skeleton.boneInverses[j]);
        acc.addScaledVector(t.copy(v).applyMatrix4(m), w);
      }
      return acc.clone();
    });
  };
  const spread = (a, b) => {
    let max = 0;
    for (let i = 0; i < a.length; i++) max = Math.max(max, a[i].distanceTo(b[i]));
    return max;
  };

  swayChains(root, 0.0, "uro");
  root.updateMatrixWorld(true);
  const hairA = skinned(hairVerts), headA = skinned(headVerts);
  swayChains(root, 0.9, "uro");
  root.updateMatrixWorld(true);
  const hairB = skinned(hairVerts), headB = skinned(headVerts);

  return {
    declared: !!CHARACTER_CHAINS.uro?.some((c) => c.name === "hair" && c.fromSkin),
    chains: [...chainsOf(root).entries()],
    hairVerts: hairVerts.length,
    headVerts: headVerts.length,
    hairMoved: spread(hairA, hairB),
    headMoved: spread(headA, headB),
    // Yuji has no chains at all: the layer must not invent any.
    yujiChains: (await (async () => {
      const g = await new GLTFLoader().loadAsync("/render3d/assets/yuji/yuji.glb");
      return [...chainsOf(g.scene).keys()];
    })()),
  };
});

check(r.declared, "uro's roster declares a skin-extracted hair chain");
check(r.chains.some(([n, c]) => n === "hair" && c === 3),
  "the delivered rig carries the hair chain bones", JSON.stringify(r.chains));
check(r.hairVerts > 50, "hair geometry is bound to those bones, not the skull",
  `${r.hairVerts} sampled hair verts`);
check(r.headVerts > 20, "and the skull still has its own skin",
  `${r.headVerts} sampled head verts`);
check(r.hairMoved > 0.02, "the sway actually moves the hair",
  `${(r.hairMoved * 100).toFixed(1)} cm`);
check(r.headMoved < 0.001, "...and leaves the head alone",
  `${(r.headMoved * 1000).toFixed(2)} mm`);
check(r.yujiChains.length === 0, "a fighter with no chains grows none",
  JSON.stringify(r.yujiChains));

await browser.close();
console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exit(failures ? 1 : 0);
