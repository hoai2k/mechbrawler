// Smoke the two-handed weapon layer (render3d/src/ik.js applyTwoHandGrip):
// the off hand must land ON the shaft, not near it, not on the old clip pose.
//
// This layer cannot be checked in Blender — it is an engine-time solve, run
// after aim and reach have moved the weapon, so nothing about it exists in
// the .glb. And a screenshot cannot check it either: at 384 px a hand
// floating 20 cm off the shaft still reads as "roughly holding it". So this
// loads the REAL delivered rig and the REAL solver in a page, poses the
// actual clip, and measures hand-to-shaft distance in metres, before and
// after — the before matters, because a solve that starts on target proves
// nothing.
//
// Needs `playwright` and Chromium; start the game first (node server.mjs),
// then: node tools/smoke_twohand.mjs [baseUrl]
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
  const { applyTwoHandGrip, fitPropShaft, makeScratch } =
    await import("/render3d/src/ik.js");
  const { STATES } = await import("/render3d/src/states.js");
  const { twoHandGrip } = await import("/render3d/src/props.js");

  const gltf = await new GLTFLoader().loadAsync("/render3d/assets/maki/maki.glb");
  const root = gltf.scene;
  const mixer = new THREE.AnimationMixer(root);

  const measure = () => {
    root.updateMatrixWorld(true);
    const bone = root.getObjectByName("Prop_Main");
    const shaft = fitPropShaft(THREE, root, "Prop_Main");
    if (!bone || !shaft) return null;
    const a = new THREE.Vector3().setFromMatrixPosition(bone.matrixWorld);
    const b = shaft.dir.clone().multiplyScalar(shaft.extent)
      .applyMatrix4(bone.matrixWorld);
    const hand = new THREE.Vector3();
    root.getObjectByName("LeftHand").getWorldPosition(hand);
    const main = new THREE.Vector3();
    root.getObjectByName("RightHand").getWorldPosition(main);
    // point-to-segment distance
    const ab = b.clone().sub(a);
    const t = Math.max(0, Math.min(1, hand.clone().sub(a).dot(ab) / ab.lengthSq()));
    const on = a.clone().addScaledVector(ab, t);
    return {
      toShaft: hand.distanceTo(on),
      spacing: hand.distanceTo(main),
      extent: shaft.extent,
    };
  };

  const poseAt = (clipName, t) => {
    mixer.stopAllAction();
    const clip = gltf.animations.find((c) => c.name === clipName);
    if (!clip) return false;
    const action = mixer.clipAction(clip);
    action.play();
    mixer.setTime(Math.min(t, clip.duration - 1e-3));
    root.updateMatrixWorld(true);
    return true;
  };

  const out = { grip: twoHandGrip("maki"), noProp: twoHandGrip("yuji"), cases: {} };
  for (const clipName of ["sideHeavy", "charge"]) {
    const spec = STATES[clipName];
    if (!poseAt(clipName, spec.beat ?? spec.duration / 2)) continue;
    const before = measure();
    const applied = applyTwoHandGrip(THREE, root, "maki", clipName,
      spec.beat ?? spec.duration / 2, makeScratch(THREE));
    const after = measure();
    out.cases[clipName] = { before, applied, after };
  }
  // A fighter with no two-handed prop must be a clean no-op.
  poseAt("sideHeavy", STATES.sideHeavy.beat);
  out.noPropApplied = applyTwoHandGrip(THREE, root, "yuji", "sideHeavy",
    STATES.sideHeavy.beat, makeScratch(THREE));
  return out;
});

check(!!r.grip && r.grip.bone === "Prop_Main",
  "maki's roster declares a two-handed prop", JSON.stringify(r.grip));
check(r.noProp === null, "yuji's does not");
check(r.noPropApplied === false, "no-prop fighters are a clean no-op");

for (const [name, c] of Object.entries(r.cases)) {
  check(!!c.before, `${name}: the shaft is measurable from the rig`,
    c.before ? `extent ${c.before.extent.toFixed(2)} m` : "no shaft");
  if (!c.before || !c.after) continue;
  check(c.applied === true, `${name}: the solve ran`);
  // The clip alone leaves the off hand well off the shaft — if it did not,
  // this test would pass vacuously and catch nothing when the layer breaks.
  check(c.before.toShaft > 0.10,
    `${name}: the clip alone does NOT put the off hand on the shaft`,
    `before: ${(c.before.toShaft * 100).toFixed(1)} cm`);
  check(c.after.toShaft < 0.08,
    `${name}: solved off hand lands on the shaft`,
    `after: ${(c.after.toShaft * 100).toFixed(1)} cm`);
  check(c.after.spacing > 0.25 && c.after.spacing < 0.65,
    `${name}: the hands grip a sane span apart`,
    `${(c.after.spacing * 100).toFixed(0)} cm`);
}

await browser.close();
console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exit(failures ? 1 : 0);
