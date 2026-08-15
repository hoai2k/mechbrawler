// The composition smoke: `?camera=3d` × every `?render=` backend.
//
// This test exists because the two features shipped independently and broke
// each other in a way neither side's smokes could see. `?render=` decides how
// a CHARACTER becomes pixels; `?camera=` decides the lens they exist in. Both
// were correct alone. Set together, the camera asked the render backend for a
// pose, got an opaque model token (`r3d:idle@0.5`) it could not turn into a
// texture, and drew NO FIGHTER AT ALL — a blank where a fighter should be,
// with no error anywhere. Nothing failed; the flags were simply never set at
// the same time in any test.
//
// So each combination is asserted to draw a body by the mechanism that is
// NATIVE to that backend, not merely to "draw something":
//
//   ?render=sprite      sprite cards        quads, no models, no posed cards
//   ?render=billboard   posed-model cards   posedCards > 0
//   ?render=3d          real rig geometry   models > 0
//
// The model modes ask for `&mannequin=all`. They used to get it for free,
// because mannequins were the default while no rig existed; with Yuji
// delivered (round B1) the default is real-rigs-only, and this test needs
// EVERY fighter in the match to have a body so the count is deterministic
// whoever the CPU picks. The mannequin is the proof body built for exactly
// that, so asking for it explicitly is the honest fix rather than pinning the
// roster to the one delivered character.
//
// Counting matters more than pixels here: every one of these paths ends in a
// fighter-shaped thing on screen, so a pixel probe cannot tell which mechanism
// produced it — and "it fell back to sprites" is exactly the failure this is
// meant to catch.
//
// Needs playwright + Chromium (CHROMIUM_PATH to override) and the game served:
//   node server.mjs   then:  node tools/smoke_camera_render.mjs [baseUrl]

import { chromium } from "playwright";
import { pressStart } from "./smoke_boot.mjs";

const BASE = process.argv[2] || "http://127.0.0.1:5174";

let failures = 0;
const check = (ok, label, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${detail ? `   ${detail}` : ""}`);
};

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-proxy-server"],
});

/** Boot into a settled match. The phase blips through `playing` with a stale
 *  fighter list during round setup, so a single-shot wait samples during the
 *  asset load that follows — and a model backend needs that time to fetch its
 *  engine, so an early sample reads as "the models never drew". */
async function bootAndSettle(page, query) {
  await page.goto(`${BASE}/index.html${query}`);
  await pressStart(page);
  await page.waitForFunction(async () =>
    (await import("/src/state.js")).state.phase === "menu", { timeout: 120000 });
  await page.click('[data-character="gojo"]');
  await page.waitForTimeout(300);
  await page.click("#startButton");
  await page.waitForSelector(".stage-card", { timeout: 5000 });
  await page.locator(".stage-card").nth(0).click();
  let stable = 0;
  let last = -1;
  for (let waited = 0; stable < 3; waited += 500) {
    if (waited > 180000) throw new Error("match never settled");
    await page.waitForTimeout(500);
    const s = await page.evaluate(async () => {
      const { state } = await import("/src/state.js");
      return { phase: state.phase, n: state.fighters.length, t: state.matchTime || 0 };
    });
    stable = (s.phase === "playing" && s.n > 0 && s.t > 3 && s.t > last) ? stable + 1 : 0;
    last = s.t;
  }
  // A model backend loads ~2 MB of engine plus its rigs after the match
  // starts; wait for it to actually be ready before reading counts.
  await page.waitForFunction(() => {
    const p = new URLSearchParams(location.search).get("render") || "sprite";
    if (p === "3d" || p === "render3d") return window.__render3d?.ready === true;
    if (p === "billboard" || p === "billboards") return window.__billboards?.ready === true;
    return true;
  }, { timeout: 60000 });
  await page.waitForTimeout(800); // a few frames drawn with everything ready
}

const CASES = [
  { query: "?camera=3d", label: "sprite + camera",
    want: (s) => s.quads > 0 && s.models === 0 && s.posedCards === 0,
    describe: "sprite cards" },
  { query: "?render=billboard&camera=3d&mannequin=all", label: "billboard + camera",
    want: (s) => s.posedCards > 0 && s.models === 0,
    describe: "posed-model cards" },
  { query: "?render=3d&camera=3d&mannequin=all", label: "3d + camera",
    want: (s) => s.models > 0,
    describe: "real rig geometry in the scene" },
];

for (const c of CASES) {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error" && !/404|Failed to load resource/.test(m.text())) errors.push(m.text());
  });

  await bootAndSettle(page, c.query);
  const s = await page.evaluate(async () =>
    (await import("/src/camera3d/index.js")).debugStats());

  check(c.want(s), `${c.label}: draws bodies as ${c.describe}`,
    `quads=${s.quads} posedCards=${s.posedCards} models=${s.models}${s.cardBail ? ` bail=${s.cardBail}` : ""}`);
  // Whatever the mechanism, SOMETHING has to be on screen per fighter — this
  // is the assertion that would have caught the original blank-fighter bug.
  const bodies = s.models + s.posedCards + s.quads;
  check(bodies >= 2, `${c.label}: the scene is not empty`, `${bodies} drawables`);
  check(errors.length === 0, `${c.label}: no page errors`, errors.slice(0, 2).join(" | "));
  await page.close();
}

await browser.close();
console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exit(failures ? 1 : 0);
