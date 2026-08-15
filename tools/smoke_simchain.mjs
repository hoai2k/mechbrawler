// Smoke the simulated chain (props.js simulateChains): Mei Mei's braids must
// TRAIL her head, not move with it.
//
// That distinction is the whole reason `simulate: true` exists, and it is
// exactly what a screenshot cannot show: a braid frozen mid-swing looks the
// same whichever layer put it there. So this drives the real solver — snap the
// head through a turn, step the integrator, and measure. A pendulum keyed off
// the pose clock scores zero on every check here: it would arrive instantly,
// never overshoot, and never settle.
//
// Needs `playwright` and Chromium; start the game first (node server.mjs),
// then: node tools/smoke_simchain.mjs [baseUrl]
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
  const { simulateChains, simulates, CHARACTER_CHAINS } =
    await import("/render3d/src/props.js");

  const gltf = await new GLTFLoader().loadAsync("/render3d/assets/meimei/meimei.glb");
  const root = gltf.scene;
  root.updateMatrixWorld(true);

  const head = root.getObjectByName("Head");
  const rootBone = root.getObjectByName("Chain_braid_0");
  const tipBone = root.getObjectByName("Chain_braid_3");

  // The braid's direction IN THE HEAD'S OWN FRAME.
  //
  // World position is the wrong thing to measure: the braid is attached, so
  // when the head turns, its anchor translates and the whole braid must go
  // with it — that is not lag, that is being attached, and a rigid braid does
  // it too. What separates simulated from rigid is the ANGLE: a rigid braid
  // holds one head-local direction forever, while a lagging one is knocked
  // off it by a turn and then swings back.
  const localDir = () => {
    root.updateMatrixWorld(true);
    const a = new THREE.Vector3().setFromMatrixPosition(rootBone.matrixWorld);
    const b = new THREE.Vector3().setFromMatrixPosition(tipBone.matrixWorld);
    const world = b.sub(a);
    const inv = new THREE.Quaternion().copy(head.getWorldQuaternion(new THREE.Quaternion())).invert();
    return world.applyQuaternion(inv).normalize();
  };
  const step = (dt = 1 / 60) => simulateChains(THREE, root, dt, "meimei");
  const deg = (u, w) => THREE.MathUtils.radToDeg(Math.acos(
    Math.max(-1, Math.min(1, u.dot(w)))));

  // Settle at rest so the run starts from a known, quiet state.
  for (let i = 0; i < 240; i++) step();
  const rest = localDir();

  // Snap the head through a hard turn and watch ONE frame.
  head.rotation.z += Math.PI / 2;
  root.updateMatrixWorld(true);
  step();
  const knockedOff = deg(localDir(), rest);
  const a = localDir();
  step();
  const movingEarly = deg(localDir(), a);

  // Hold still, then TURN THE HEAD BACK before asking whether it came home.
  //
  // A simulated braid hangs where gravity and the bone's rest direction
  // balance, so its settled HEAD-LOCAL direction depends on how the head is
  // oriented — with the head still rotated 90°, "down" sits somewhere else in
  // its frame and the braid is right to settle somewhere else too. Comparing
  // that against a direction measured before the turn charges the solver for
  // gravity: it read 6.4° on Mei Mei's rebuilt braid, which is sag, not drift.
  // Restoring the orientation removes the variable, and the answer is then
  // geometry-independent — a braid that came home reads ~0° whatever its
  // length or rest angle.
  for (let i = 0; i < 400; i++) step();
  head.rotation.z -= Math.PI / 2;
  root.updateMatrixWorld(true);
  for (let i = 0; i < 400; i++) step();
  const recovered = deg(localDir(), rest);
  // ...and stop moving.
  const d = localDir();
  step();
  const movingLate = deg(localDir(), d);

  return {
    declared: !!CHARACTER_CHAINS.meimei?.some((x) => x.simulate),
    simulates: simulates("meimei"),
    notSimulated: simulates("uro"),
    knockedOff, recovered, movingEarly, movingLate,
  };
});

check(r.declared, "mei mei's braid declares simulate: true");
check(r.simulates === true, "the renderers can see that she simulates");
check(r.notSimulated === false, "a fighter with a plain sway does not");
// THE claim, and the only one that separates this from a rigid braid or a
// pose-clock pendulum: a hard turn knocks the braid OFF the direction the
// skeleton holds it in — it is left behind in world space — and it then
// swings back on its own. A rigid braid is never knocked off at all.
check(r.knockedOff > 15, "a hard turn leaves the braid behind",
  `${r.knockedOff.toFixed(1)}° off its rest direction one frame later`);
check(r.recovered < 5, "and it swings back to where the head holds it",
  `${r.recovered.toFixed(1)}° off after settling`);
check(r.movingLate < r.movingEarly * 0.25, "...coming to rest rather than ringing",
  `${r.movingEarly.toFixed(2)}°/frame -> ${r.movingLate.toFixed(3)}`);

await browser.close();
console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exit(failures ? 1 : 0);
