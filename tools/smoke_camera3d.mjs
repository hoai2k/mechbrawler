// Browser smoke for the 2.5D camera mode (`?camera=3d`): the half of the
// feature tools/smoke_camera.mjs cannot reach.
//
// That one runs the rig's MATH headless — framing, clamps, NaN-freedom — with
// no DOM and no WebGL. Everything below the rig needs a real context: the
// scene, the platform boxes, the billboard quads, and the garnish cards, whose
// textures are drawn with a canvas 2D context that does not exist in Node.
//
// The failure this is built around is the QUIET one. A 3D scene that renders
// nothing throws no errors and logs nothing — the page is simply the flat
// canvas over a blank layer, which is exactly what the intended fallback looks
// like. So every board here asserts three things that a silent failure could
// not fake: the mode is actually 3d and did not fall back, the scene drew a
// quad per fighter, and the boards with garnish actually spawned cards.
//
// Needs `playwright` (npm i playwright) and a Chromium binary — set
// CHROMIUM_PATH if yours is elsewhere. Start the game first (node server.mjs),
// then: node tools/smoke_camera3d.mjs [baseUrl]
import { chromium } from "playwright";
import { pressStart } from "./smoke_boot.mjs";

const BASE = process.argv[2] || "http://127.0.0.1:5174";

// [stage key, index in the stage grid, sim seconds to run, garnish expected?]
//
// The clock matters: a board's cards are spawned by its own gimmick, so the
// run has to be long enough to reach one. Crosswalk Rush launches traffic at
// 13.6 s of its 15 s cycle, which is why it runs longest.
const BOARDS = [
  ["trainingBridge", 0, 8, true],    // ambient leaves
  ["lanternCorridor", 6, 8, true],   // ambient lanterns
  ["crosswalkRush", 13, 14.2, true], // traffic, on the hazard's own cue
  ["billboardRoof", 18, 5, true],    // skyline layer, spawned at match start
  ["bridgeDuel", 10, 6, false],      // drift-follow board, no cards
  ["domainCore", 19, 6, false],      // orbiting platforms, no cards
];

// Boards whose cards include scenery that is placed once and then stands for
// the whole match, and how many of those cards there should be.
const STANDING = { crosswalkRush: 1, billboardRoof: 5 };

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  // Software GL: CI has no GPU, and the point here is correctness not speed.
  args: ["--no-proxy-server", "--enable-unsafe-swiftshader"],
});

let failures = 0;
const check = (ok, label, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${detail ? `   ${detail}` : ""}`);
};

const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
let current = "boot";
page.on("pageerror", (e) => errors.push({ stage: current, err: String(e) }));
page.on("console", (m) => {
  // Optional art 404s by design (see `optional()` in src/assets.js), and
  // software GL warns about its own performance; neither is a fault here.
  if (m.type() === "error" && !/404|Failed to load resource/.test(m.text())) {
    errors.push({ stage: current, err: "console: " + m.text() });
  }
});

await page.goto(`${BASE}/index.html?camera=3d`, { waitUntil: "load" });
await pressStart(page);
await page.waitForSelector('[data-character="gojo"]', { timeout: 60000 });

// Before anything else: did the mode actually take? Every check below is
// vacuous if this silently fell back to flat.
const mode = await page.evaluate(async () => (await import("/src/camera_mode.js")).cameraMode);
check(mode === "3d", "?camera=3d is in force (did not fall back to flat)", mode);
if (mode !== "3d") {
  console.log("\nnothing else can be trusted without the 3D scene — stopping");
  await browser.close();
  process.exit(1);
}

const glSize = await page.evaluate(() => {
  const c = document.getElementById("glCanvas");
  return c ? [c.width, c.height] : null;
});
check(!!glSize && glSize[0] > 0 && glSize[1] > 0, "the GL canvas is sized", JSON.stringify(glSize));

async function waitForMatch(timeout = 120000) {
  const deadline = Date.now() + timeout;
  for (;;) {
    const ready = await page.evaluate(async () => {
      const { state } = await import("/src/state.js");
      return state.phase === "playing" && state.fighters.length > 0;
    });
    if (ready) return;
    if (Date.now() > deadline) throw new Error(`match never started (${current})`);
    await page.waitForTimeout(120);
  }
}

/** Wait for the scene to actually draw a few more frames. Not runUntil: that
 *  takes an ABSOLUTE match time, so asking it for half a second inside a match
 *  already four seconds old returns instantly and reads back state no frame
 *  has rendered yet — which is exactly how the aura check below came to pass
 *  or fail on whether a frame happened to land between two evaluate calls. */
async function settleFrames(n = 6) {
  await page.evaluate(async (count) => {
    const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
    for (let i = 0; i < count; i++) await frame();
  }, n);
}

/** Software GL renders slowly and the game loop clamps dt, so the SIM clock
 *  runs well behind the wall clock. Poll matchTime rather than sleeping. */
async function runUntil(simSeconds, timeout = 240000) {
  const deadline = Date.now() + timeout;
  for (;;) {
    const t = await page.evaluate(async () => (await import("/src/state.js")).state.matchTime);
    if (t >= simSeconds) return t;
    if (Date.now() > deadline) return t;
    await page.waitForTimeout(200);
  }
}

for (const [key, index, simSeconds, wantsGarnish] of BOARDS) {
  current = key;
  const before = errors.length;

  await page.click('[data-character="gojo"]');
  await page.waitForTimeout(250);
  await page.click("#startButton");
  await page.waitForSelector(".stage-card", { timeout: 8000 });
  await page.locator(".stage-card").nth(index).click();
  await waitForMatch();

  // Peak rather than final counts: a traffic card lives under a second, so
  // sampling once at the end would miss the very thing being tested.
  const peak = { quads: 0, garnish: 0 };
  const target = await (async () => {
    let t = 0;
    const deadline = Date.now() + 240000;
    for (;;) {
      const s = await page.evaluate(async () => {
        const { state } = await import("/src/state.js");
        const { debugStats } = await import("/src/camera3d/index.js");
        const d = debugStats();
        return { t: state.matchTime, ...d };
      });
      t = s.t;
      peak.quads = Math.max(peak.quads, s.quads);
      peak.garnish = Math.max(peak.garnish, s.garnish);
      if (!s.camera.every(Number.isFinite) || !Number.isFinite(s.fov)) {
        check(false, `${key}: camera stays finite`, JSON.stringify(s.camera));
      }
      if (t >= simSeconds) return t;
      if (Date.now() > deadline) return t;
      await page.waitForTimeout(150);
    }
  })();

  const alive = await page.evaluate(async () => {
    const { state } = await import("/src/state.js");
    return state.fighters.filter((f) => !f.dead && f.respawnTimer <= 0).length;
  });

  check(peak.quads >= alive, `${key}: the scene drew a quad for every fighter`,
    `${peak.quads} quads / ${alive} alive`);
  if (wantsGarnish) {
    check(peak.garnish > 0, `${key}: garnish cards were spawned`, `${peak.garnish} cards`);
  }
  // Standing scenery is placed ONCE per match, so it is the one thing here
  // that can lose a race with the loader and stay lost: the shared art group
  // is a long queue, and Crosswalk Rush's signal gantry has no procedural
  // fallback to cover for it. It was missing from every match for exactly
  // that reason. Counted on its own rather than through the card total, so a
  // passing car cannot stand in for a gantry that never arrived.
  if (STANDING[key]) {
    const standing = await page.evaluate(async (n) => {
      const { debugStats } = await import("/src/camera3d/index.js");
      const deadline = Date.now() + 20000;
      for (;;) {
        if (debugStats().standing >= n) return debugStats().standing;
        if (Date.now() > deadline) return debugStats().standing;
        await new Promise((r) => setTimeout(r, 200));
      }
    }, STANDING[key]);
    check(standing >= STANDING[key], `${key}: standing scenery is placed`,
      `${standing} card(s), wanted ${STANDING[key]}`);
  }
  check(target >= simSeconds, `${key}: reached ${simSeconds}s of match time`, `got ${target.toFixed(1)}s`);
  check(errors.length === before, `${key}: no page errors`,
    errors.slice(before).map((e) => e.err).slice(0, 2).join(" | "));

  // The stage must never cut a hole in a fighter. Both flags below were once
  // the other way round, and the result was a platform slicing a body in half
  // wherever the two crossed — worst on the boards whose platforms move, where
  // the cut line slides across the sprite. Asserted on the live materials
  // because it is one word in each file that brings it back.
  const layer = await page.evaluate(async () =>
    (await import("/src/camera3d/index.js")).debugStats().layering);
  check(layer.billboardDepthTest === false,
    `${key}: fighters paint over the stage instead of depth-testing against it`,
    `depthTest=${layer.billboardDepthTest}`);
  check(layer.platformFaceDepthWrite === false,
    `${key}: the platform face's padded halo writes no depth`,
    `depthWrite=${layer.platformFaceDepthWrite}`);

  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
  await page.click("#pauseMenuButton");
  await page.waitForTimeout(300);
}

// GARNISH.enabled is the switch a player (or a busy board) can turn off. It
// has to clear the sky that is already up, not merely stop spawning into it —
// and putting it back has to bring the cards back without a fresh match.
current = "garnish-toggle";
await page.click('[data-character="gojo"]');
await page.waitForTimeout(250);
await page.click("#startButton");
await page.waitForSelector(".stage-card", { timeout: 8000 });
await page.locator(".stage-card").nth(0).click(); // Training Bridge: ambient leaves
await waitForMatch();
await runUntil(4);
const garnishCycle = await page.evaluate(async () => {
  const { GARNISH } = await import("/src/config_camera.js");
  const { debugStats } = await import("/src/camera3d/index.js");
  const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
  const settle = async () => { for (let i = 0; i < 6; i++) await frame(); };
  await settle();
  const on = debugStats().garnish;
  GARNISH.enabled = false;
  await settle();
  const off = debugStats().garnish;
  GARNISH.enabled = true;
  return { on, off };
});
check(garnishCycle.on > 0, "garnish is on by default", `${garnishCycle.on} cards`);
check(garnishCycle.off === 0, "GARNISH.enabled = false clears the cards already up",
  `${garnishCycle.off} cards left`);

// Garnish must not survive a change of board: a new match starts with a clean
// sky, or Crosswalk Rush's traffic ends up driving through Domain Core.
current = "reset";
await page.keyboard.press("Escape");
await page.waitForTimeout(200);
await page.click("#pauseMenuButton");
await page.waitForTimeout(300);
await page.click('[data-character="gojo"]');
await page.waitForTimeout(250);
await page.click("#startButton");
await page.waitForSelector(".stage-card", { timeout: 8000 });
await page.locator(".stage-card").nth(19).click(); // Domain Core: no cards of its own
await waitForMatch();
await runUntil(1.5);
const leftovers = await page.evaluate(async () =>
  (await import("/src/camera3d/index.js")).debugStats().garnish);
check(leftovers === 0, "garnish is cleared when the board changes", `${leftovers} cards left over`);

// The install aura belongs to the SCENE, not to the overlay canvas.
//
// Flat, render.js paints it between the shadow and the body, so it sits under
// the fighter. In this mode the body is in the WebGL layer and the overlay is
// strictly above it, so leaving the aura on the overlay put it in FRONT of the
// fighter wearing it — a lit fighter reading as a fighter behind frosted
// glass. billboards.js draws it as a quad instead, and that quad is the one
// thing in this scene that has to test depth: only the depth buffer can put a
// transparent quad behind opaque rig geometry.
current = "aura";
await page.evaluate(async () => {
  const { state } = await import("/src/state.js");
  for (const f of state.fighters) {
    f.installs = { duration: 99, life: 99, color: "#ff62cf", label: "PROBE", aura: null };
  }
});
await settleFrames();
const aura = await page.evaluate(async () =>
  (await import("/src/camera3d/index.js")).debugStats());
check(aura.auras > 0, "the install aura is drawn in the scene, not on the overlay",
  `${aura.auras} aura quad(s)`);
check(aura.layering.auraDepthTest === true,
  "the aura quad tests depth, so a fighter with volume occludes it",
  `depthTest=${aura.layering.auraDepthTest}`);

// Entity effects — traps, ultimate waves, hazards — belong in the SCENE too,
// and for the same reason. Flat they draw before the fighters; on the overlay
// they could only ever be in front, and these are the biggest pictures the
// game has: an Encore wave painted there erased the fighter it was cast at and
// the one across the stage with it. src/camera3d/effects.js draws the whole
// layer as one quad behind the bodies.
current = "effect-layer";
await page.evaluate(async () => {
  const { state } = await import("/src/state.js");
  state.entities.push({
    __smoke: true, dead: false, update() {},
    draw(ctx) { ctx.fillStyle = "#ff00ff"; ctx.fillRect(600, 400, 80, 80); },
  });
});
await settleFrames();
const fx = await page.evaluate(async () =>
  (await import("/src/camera3d/index.js")).debugStats().fxLayer);
check(fx === true, "entity effects are drawn into the scene, not onto the overlay",
  `fxLayer=${fx}`);

await browser.close();
console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exit(failures ? 1 : 0);
