// Smoke-test the render backend seam: the game boots on the default backend,
// `?render=` selects one by name, and an unregistered name falls back to the
// default with a warning instead of blanking the page.
//
// The seam (src/render_backend.js) is the one place that decides HOW a
// character becomes pixels, so the failure it has to be protected against is
// the silent one: a selection that quietly does not take, leaving a test that
// passes without having exercised anything. This checks the backend actually in
// force AFTER the game reaches the menu — `selectRenderBackend` runs at the top
// of init(), and anything probed earlier reads the module default and agrees
// with every expectation no matter what the URL said.
//
// Needs `playwright` (npm i playwright) and a Chromium binary — set
// CHROMIUM_PATH if yours is elsewhere. Start the game first (node server.mjs),
// then: node tools/smoke_render_backend.mjs [baseUrl]
import { chromium } from "playwright";
import { pressStart } from "./smoke_boot.mjs";

const BASE = process.argv[2] || "http://127.0.0.1:5174";

// [query string, backend that should end up drawing, must it have warned]
const CASES = [
  ["", "sprite", false],
  ["?render=sprite", "sprite", false],
  // Plural spellings are aliases, not typos — both nouns read naturally as
  // plurals, so neither may cost a fallback warning.
  ["?render=sprites", "sprite", false],
  ["?render=billboards", "billboard", false],
  // The 2.5D path. Registered and playable while stubbed: with no models
  // loaded every character falls through to sprites, so this must select
  // `billboard` AND still boot a working game rather than a blank stage.
  ["?render=billboard", "billboard", false],
  // The live-3D anime path. Same rule as the billboard entry: registered and
  // playable with zero delivered rigs — everyone falls through to sprites.
  ["?render=3d", "3d", false],
  ["?render=render3d", "3d", false],
  ["?render=anime", "3d", false],
  ["?render=nonsense", "sprite", true],
];

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-proxy-server"],
});

let failures = 0;
const check = (ok, label, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${detail ? `   ${detail}` : ""}`);
};

for (const [query, expected, expectWarning] of CASES) {
  const page = await browser.newPage();
  const errors = [], warnings = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
    if (m.type() === "warning") warnings.push(m.text());
  });

  await page.goto(`${BASE}/index.html${query}${query ? "&" : "?"}camera=flat`);
  await pressStart(page);
  // Reaching the menu means init() ran to completion, selection included.
  await page.waitForFunction(async () =>
    (await import("/src/state.js")).state.phase === "menu", { timeout: 120000 });

  const active = await page.evaluate(async () =>
    (await import("/src/render_backend.js")).renderBackendName());

  // Optional art (summon minions, technique effects, stage-fx) 404s by design
  // and falls back to something procedural — see `optional()` in src/assets.js.
  const hard = errors.filter((e) => !/404|Failed to load resource/.test(e));
  const label = query || "(no query)";
  check(active === expected, `"${label}" draws with the ${expected} backend`, `got ${active}`);
  check(hard.length === 0, `"${label}" boots without page errors`, hard.slice(0, 2).join(" | "));

  const warned = warnings.some((w) => w.includes("not registered"));
  if (expectWarning) {
    check(warned, `"${label}" says the name is unknown instead of failing silently`);
  } else {
    check(!warned, `"${label}" boots without a backend warning`);
  }

  await page.close();
}

await browser.close();
console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exit(failures ? 1 : 0);
