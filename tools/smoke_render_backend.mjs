// Smoke-test the render-backend seam: the two PRESENTATION STYLES the Settings
// screen offers, and the very different ways they take effect.
//
// This file used to test a backend REGISTRY — `?render=sprite|billboard|3d`,
// with an unknown name falling back to sprites. That registry retired with the
// sprite and billboard paths (src/render_backend.js says why), and `?render=`
// means something else now. What is left on the seam is worth exactly the same
// protection, because both failures are silent ones:
//
//   ANIMATION FRAME STYLE ("smooth" | "twos", `?frames=`). Live. The dial has
//   to move AND the pose cache has to be dropped — a switch that only moved the
//   dial would keep serving the old style's cached renders until they aged out
//   by LRU, which looks like the setting not working, intermittently.
//
//   SHADING STYLE ("pbr" | "toon", `?render=`). Fixed for the page's life:
//   materials are converted at rig load, the light rig and tone mapping are
//   chosen at scene init. So the button stores the choice and RELOADS — unless
//   a match is running, when it defers and says so. The silent failure here is
//   a click that appears to do nothing.
//
// Both preferences persist (localStorage) and both are outranked by their URL
// flag, so a comparison link pins a style without disturbing the setting.
//
// Needs `playwright` (npm i playwright) and a Chromium binary — set
// CHROMIUM_PATH if yours is elsewhere. Start the game first (node server.mjs),
// then: node tools/smoke_render_backend.mjs [baseUrl]
import { chromium } from "playwright";
import { pressStart, pickAnyFighter } from "./smoke_boot.mjs";

const BASE = process.argv[2] || "http://127.0.0.1:5174";

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium",
  args: ["--no-proxy-server"],
});

let failures = 0;
const check = (ok, label, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${detail ? `   ${detail}` : ""}`);
};

// Optional art (summon minions, technique effects, arena garnish) 404s by
// design and falls back to something procedural — see `optional()` in
// src/assets.js. Everything else is a real page error.
const hardErrors = (errors) => errors.filter((e) => !/404|Failed to load resource/.test(e));

function watch(page) {
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  return errors;
}

const styles = (page) => page.evaluate(async () => {
  const rb = await import("/src/render_backend.js");
  return { render: rb.renderStyle(), frames: rb.frameStyle() };
});

const openSettings = async (page) => {
  await page.click("#settingsButton");
  await page.waitForSelector("#settingsRenderButton", { state: "visible" });
};

// ---------------------------------------------------------------- the flags

for (const [query, expected] of [
  ["", { render: "pbr", frames: "smooth" }],
  ["?render=toon", { render: "toon", frames: "smooth" }],
  ["?frames=twos", { render: "pbr", frames: "twos" }],
  ["?render=toon&frames=twos", { render: "toon", frames: "twos" }],
  // Nonsense falls back to the default rather than to a broken page — no
  // warning owed, because a style flag is a debugging convenience, not a name
  // the game promises to know.
  ["?render=nonsense&frames=nonsense", { render: "pbr", frames: "smooth" }],
]) {
  const page = await browser.newPage();
  const errors = watch(page);
  await page.goto(`${BASE}/index.html${query}${query ? "&" : "?"}camera=flat`);
  await pressStart(page);
  await page.waitForFunction(async () =>
    (await import("/src/state.js")).state.phase === "menu", { timeout: 120000 });

  const got = await styles(page);
  const label = query || "(no query)";
  check(got.render === expected.render && got.frames === expected.frames,
    `"${label}" boots in ${expected.render} / ${expected.frames}`,
    `got ${got.render} / ${got.frames}`);
  check(hardErrors(errors).length === 0, `"${label}" boots without page errors`,
    hardErrors(errors).slice(0, 2).join(" | "));
  await page.close();
}

// ------------------------------------------------- the frame style, in place

{
  const page = await browser.newPage();
  const errors = watch(page);
  await page.goto(`${BASE}/index.html?camera=flat`);
  await pressStart(page);
  await openSettings(page);

  const before = await page.textContent("#settingsFramesButton");
  await page.click("#settingsFramesButton");
  const dial = await page.evaluate(async () =>
    (await import("/render3d/src/pose.js")).DIALS.onTwos);
  const after = await page.textContent("#settingsFramesButton");
  check(before.includes("Smooth") && after.includes("On Twos"),
    "the animation button walks Smooth -> On Twos", `${before} -> ${after}`);
  check(dial === true, "and the pose dial really moved", `DIALS.onTwos=${dial}`);
  check((await styles(page)).frames === "twos", "as the seam reports it");
  check(await page.evaluate(() => localStorage.getItem("mechbrawler.frameStyle")) === "twos",
    "and it is remembered for next time");

  await page.click("#settingsFramesButton");
  check((await styles(page)).frames === "smooth", "and it walks back");
  check(hardErrors(errors).length === 0, "no page errors around a frame-style switch",
    hardErrors(errors).slice(0, 2).join(" | "));
  await page.close();
}

// -------------------------------------------- the shading style, on a reload

{
  const page = await browser.newPage();
  const errors = watch(page);
  await page.goto(`${BASE}/index.html?camera=flat`);
  await pressStart(page);
  await openSettings(page);
  await page.evaluate(() => { window.__preReload = true; });
  await page.click("#settingsRenderButton");
  await page.waitForFunction(() => window.__preReload === undefined, null, { timeout: 30000 })
    .catch(() => {});
  check(await page.evaluate(() => window.__preReload === undefined),
    "choosing a shading style out of a match reloads the page");
  await pressStart(page);
  check((await styles(page)).render === "toon", "and the page comes back up in toon");

  // The stored preference must not out-shout an explicit flag, or a
  // comparison link stops comparing what it says it does.
  await page.goto(`${BASE}/index.html?render=pbr&camera=flat`);
  await pressStart(page);
  check((await styles(page)).render === "pbr", "?render= still outranks the setting");
  check(hardErrors(errors).length === 0, "no page errors around a shading switch",
    hardErrors(errors).slice(0, 2).join(" | "));
  await page.close();
}

// ------------------------------------------ the shading style, during a match

{
  const page = await browser.newPage();
  const errors = watch(page);
  await page.goto(`${BASE}/index.html?camera=flat`);
  await pressStart(page);
  await pickAnyFighter(page);
  await page.click("#startButton");
  await page.waitForSelector(".stage-card", { timeout: 10000 });
  await page.locator(".stage-card").nth(0).click();
  await page.waitForFunction(async () => {
    const { state } = await import("/src/state.js");
    return state.phase === "playing" && state.fighters.length > 0;
  }, null, { timeout: 120000 });

  await page.evaluate(() => { window.__preReload = true; });
  await page.keyboard.press("Escape");
  await page.waitForFunction(async () =>
    (await import("/src/state.js")).state.phase === "paused", null, { timeout: 10000 });
  await openSettings(page);
  await page.click("#settingsRenderButton");
  await page.waitForTimeout(500);

  check(await page.evaluate(() => window.__preReload === true),
    "a shading change mid-match does NOT drop the match");
  const label = await page.textContent("#settingsRenderButton");
  check(/on restart/i.test(label), "and the button says it is waiting for a restart", label);
  check(await page.evaluate(() => localStorage.getItem("mechbrawler.renderStyle")) === "toon",
    "while the choice itself is already stored");
  check((await styles(page)).render === "pbr", "and this page keeps drawing what it loaded");
  check(hardErrors(errors).length === 0, "no page errors around the deferred switch",
    hardErrors(errors).slice(0, 2).join(" | "));
  await page.close();
}

await browser.close();
console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exit(failures ? 1 : 0);
