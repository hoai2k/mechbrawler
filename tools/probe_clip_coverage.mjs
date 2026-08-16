// IS A CLIP A FUNCTION OF ITSELF? — the probe for pose residue.
//
// A glTF clip drives only the bones it carries tracks for. Every other bone
// keeps whatever the last clip left there, because that is all an
// AnimationMixer can do. So the question this asks is the one that matters for
// correctness: pose the SAME state at the SAME time, having come from two
// different previous states, and does the skeleton land in the same place?
//
// If it does not, the state's clip is not self-contained, the bones that
// differ are the ones it has no tracks for, and what the player sees is the
// previous action's legs (or arms, or head) welded onto this one.
//
//   node server.mjs
//   node tools/probe_clip_coverage.mjs [charKey…]      # default: every mech
//
// Prints, per state, the worst bone displacement between the two histories.
import { chromium } from "playwright";

const BASE = process.env.BASE || "http://127.0.0.1:5174";
// The histories a state is reached from in a real match, and worth testing
// because their clips cover very different bone sets.
const FROM = ["idle", "run", "dodge_roll"];
// Every state a fighter can be driven into by pressing a button. Locomotion is
// excluded: it is reached from itself constantly and is the baseline here.
const STATES = [
  "light", "airLight", "sideHeavy", "upHeavy", "downHeavy", "crouchAttack",
  "dashAttack", "specialNeutral", "specialSide", "specialDown", "ult",
  "charge", "shield", "grabReach", "throwFwd", "hurt", "win",
];

const args = process.argv.slice(2).filter((a) => !a.startsWith("-"));
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium",
  args: ["--no-proxy-server", "--use-gl=angle", "--use-angle=swiftshader"],
});
const page = await browser.newPage();
page.on("pageerror", (e) => console.log("  page error:", String(e).slice(0, 160)));

await page.goto(`${BASE}/index.html?camera=flat`, { waitUntil: "domcontentloaded" });
await page.waitForFunction(async () =>
  (await import("/src/state.js")).state.phase === "title", null, { timeout: 60000 });

const keys = args.length ? args : await page.evaluate(async () =>
  (await import("/src/characters.js")).CHARACTER_KEYS);

let worstOverall = 0;
const rows = [];
for (const charKey of keys) {
  const res = await page.evaluate(async ({ charKey, FROM, STATES }) => {
    const rigs = await import("/render3d/src/loader.js");
    const pose = await import("/render3d/src/pose.js");
    const three = await import("/vendor/three/three.module.js");
    const { GLTFLoader } = await import("/vendor/three/loaders/GLTFLoader.js");
    // The backend's boot is async and the title screen comes up before it
    // lands — ask for a rig too early and every one comes back missing,
    // because the loader has not read its manifest yet.
    const t0 = Date.now();
    while (Date.now() - t0 < 120000
      && !Object.keys(rigs.rigManifest()?.characters || {}).length) {
      await new Promise((r) => setTimeout(r, 250));
    }
    await rigs.ensureRig(charKey, GLTFLoader);
    const rig = rigs.getRig(charKey);
    if (!rig) return { error: "no rig" };

    // Where every bone ends up after posing `state` at `t`, having first posed
    // `from`. World positions, so a rotation high in the chain still shows.
    const poseAt = (state, t) => {
      const clip = rigs.resolveClip(charKey, state)?.clip;
      if (!clip) return null;
      pose.poseRig(rig, state, t, clip, {});
      rig.root.updateMatrixWorld(true);
      const out = new Map();
      rig.root.traverse((o) => {
        if (!o.isBone) return;
        const v = new three.Vector3();
        o.getWorldPosition(v);
        out.set(o.name, v);
      });
      return out;
    };

    const coverage = (state) => {
      const clip = rigs.resolveClip(charKey, state)?.clip;
      if (!clip) return null;
      const names = new Set();
      for (const tr of clip.tracks) names.add(tr.name.split(".")[0]);
      return { clip: clip.name, bones: names.size };
    };

    let bones = 0;
    rig.root.traverse((o) => { if (o.isBone) bones++; });

    const out = [];
    for (const state of STATES) {
      const t = 0.12;
      const takes = [];
      for (const from of FROM) {
        poseAt(from, 0.3);                 // the history
        const take = poseAt(state, t);     // ...then the state under test
        if (take) takes.push(take);
      }
      if (takes.length < 2) { out.push({ state, worst: 0, worstBone: "-", skipped: true }); continue; }
      let worst = 0, worstBone = "";
      for (const [name, v] of takes[0]) {
        for (let i = 1; i < takes.length; i++) {
          const d = v.distanceTo(takes[i].get(name));
          if (d > worst) { worst = d; worstBone = name; }
        }
      }
      out.push({ state, worst, worstBone, ...(coverage(state) || {}) });
    }
    return { bones, out };
  }, { charKey, FROM, STATES });

  if (res.error) { console.log(`${charKey}: ${res.error}`); continue; }
  const bad = res.out.filter((r) => r.worst > 0.002);
  const worst = Math.max(...res.out.map((r) => r.worst));
  worstOverall = Math.max(worstOverall, worst);
  rows.push({ charKey, bones: res.bones, bad: bad.length, of: res.out.length, worst });
  console.log(`\n${charKey}  (${res.bones} bones)`);
  for (const r of res.out) {
    const flag = r.worst > 0.002 ? "DRIFT" : "ok   ";
    console.log(`  ${flag} ${r.state.padEnd(15)} ${r.clip ? r.clip.padEnd(14) : "".padEnd(14)}`
      + ` tracks ${String(r.bones ?? "?").padStart(2)}/${res.bones}`
      + `   worst ${r.worst.toFixed(4)} @ ${r.worstBone}`);
  }
}

console.log("\n---- summary (a state drifts when its clip does not cover the skeleton) ----");
for (const r of rows) {
  console.log(`  ${r.charKey.padEnd(10)} ${String(r.bad).padStart(2)}/${r.of} states drift`
    + `   worst ${r.worst.toFixed(4)} world units`);
}
await browser.close();
process.exit(worstOverall > 0.002 ? 1 : 0);
