// Smoke the body-morph layer (props.js CHARACTER_MORPHS / ik.js applyMorphs):
// Mahito's transfiguration arms. Engine-time bone scaling — nothing about it
// exists in the .glb, so it is checked here against the real rig and solver.
//
// Needs `playwright` and Chromium; start the game first (node server.mjs),
// then: node tools/smoke_morphs.mjs [baseUrl]
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
  const { applyMorphs } = await import("/render3d/src/ik.js");
  const { STATES } = await import("/render3d/src/states.js");

  const gltf = await new GLTFLoader().loadAsync("/render3d/assets/mahito/mahito.glb");
  const root = gltf.scene;
  const scales = () => ({
    rArm: root.getObjectByName("RightArm").scale.x,
    lArm: root.getObjectByName("LeftArm").scale.x,
    rFore: root.getObjectByName("RightForeArm").scale.toArray().map((v) => +v.toFixed(2)),
  });

  const out = {};
  // At the contact beat the swell is fully in.
  out.heavyApplied = applyMorphs(root, "mahito", "sideHeavy", STATES.sideHeavy.beat);
  out.heavy = scales();
  // The blade: anisotropic forearm stretch.
  applyMorphs(root, "mahito", "specialNeutral", STATES.specialNeutral.beat);
  out.blade = scales();
  // Back to a state with no morph: everything must RESET to 1.
  out.idleApplied = applyMorphs(root, "mahito", "idle", 0.1);
  out.idle = scales();
  // Early in the wind-up the swell has not started.
  applyMorphs(root, "mahito", "sideHeavy", 0.01);
  out.windup = scales();
  // A fighter with no morphs is a clean no-op.
  out.noMorph = applyMorphs(root, "yuji", "sideHeavy", STATES.sideHeavy.beat);
  return out;
});

check(r.heavyApplied === true, "sideHeavy at the beat morphs");
check(Math.abs(r.heavy.rArm - 1.55) < 0.01, "the striking arm swells to 1.55",
  `RightArm ${r.heavy.rArm}`);
check(r.heavy.lArm === 1, "the off arm does not", `LeftArm ${r.heavy.lArm}`);
check(r.blade.rFore[1] > 1.8 && r.blade.rFore[0] < 0.75,
  "the blade stretches the forearm long and thin", `RightForeArm ${r.blade.rFore}`);
check(r.idleApplied === false && r.idle.rArm === 1 && r.idle.rFore[1] === 1,
  "a morphless state resets every touched bone", `idle ${JSON.stringify(r.idle)}`);
check(r.windup.rArm === 1, "the swell waits out the early wind-up",
  `RightArm ${r.windup.rArm}`);
check(r.noMorph === false, "fighters with no morphs are a clean no-op");

await browser.close();
console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exit(failures ? 1 : 0);
