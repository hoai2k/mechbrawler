// Does every control in the effect workbench actually REACH THE PICTURE?
//
// The tool's whole promise is that the number you drag is the number the game
// uses: it edits through the game's own accessors (`sharedAdjust`, `sharedHit`,
// `sharedFaceLeft`) rather than through a copy of them, so what you see is what
// ships. A control that silently resolves to something else breaks that promise
// in the one way nobody notices — the slider moves, the panel updates, and the
// drawing does not change.
//
// That is exactly how Mirror shipped broken. `getImage` answered "is this art
// drawn facing left?" by reading the workbench's in-memory store and the config
// file FIELD BY FIELD (`store[key]?.faceLeft ?? EFFECT_PLACEMENT[key]?.faceLeft`)
// while every other field resolved by whole ENTRY. Unticking the box dropped the
// field — which is how the store records "not set" — and the `??` then answered
// with the config's `true`. For the fifteen drawings config_effects.js already
// flips, the box was one-way: mirrored, and no way back.
//
// So this smoke does not read state. It drives each control and DIFFS THE
// CANVAS, which is the only evidence that survives a wrong resolution:
//
//   1. every parameter moves pixels — Size, X, Y, Rotate, Mirror
//   2. Mirror moves them BOTH WAYS, on a drawing the config already flips
//      (effect:mortar_shell — the regression above, exactly)
//   3. the launch cross sits where combat.js spawns the shot: the mech's
//      muzzle point, not the kit's raw reference offsets
//   4. neither workbench logs a page error, at desk or phone size
//
// Usage: node tools/smoke_workbench.mjs [baseUrl]
import { chromium } from "playwright";

const BASE = process.argv[2] || "http://127.0.0.1:5174";

// The drawing the Mirror regression was found on: a kit-thrown shell that
// config_effects.js flips, on a mech half again the reference height, so it
// exercises the mirror fall-through AND the muzzle scaling in one card.
const CARD = "effect:mortar_shell";

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-proxy-server"],
});

let failed = 0;
const check = (ok, msg) => { if (!ok) failed++; console.log(`${ok ? "ok  " : "FAIL"} ${msg}`); };

const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 200)); });

await page.goto(`${BASE}/workbench/?fx=${encodeURIComponent(CARD)}`);
// The rig is tens of megabytes and the plates load on demand; the viewer paints
// a placeholder until both land, and a diff taken against a placeholder proves
// nothing.
await page.waitForFunction(() => document.querySelector("#viewCanvas")?.width > 0, null, { timeout: 30000 });
await page.waitForTimeout(9000);

/** A cheap signature of what the viewer is currently showing. Sampled rather
 *  than hashed whole: a full-canvas readback of a 1400×800 DPR-2 canvas is
 *  megabytes per call, and any real change to the drawing moves more than one
 *  of these rows. */
const signature = () => page.evaluate(() => {
  const c = document.getElementById("viewCanvas");
  const g = c.getContext("2d");
  let acc = 0;
  for (let i = 1; i <= 12; i++) {
    const d = g.getImageData(0, Math.floor(c.height * i / 13), c.width, 1).data;
    for (let x = 0; x < d.length; x += 16) acc = (acc * 31 + d[x] + d[x + 3] * 7) % 4294967296;
  }
  return acc;
});

/** Move one slider in the parameter panel and report whether the viewer moved
 *  with it. `value` is set on the input directly — dragging a range with the
 *  mouse is a test of Playwright, not of the tool. */
async function slide(field, value) {
  const before = await signature();
  await page.evaluate(([f, v]) => {
    const input = document.querySelector(`.ctrl[data-field="${f}"] input`);
    input.value = String(v);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }, [field, value]);
  await page.waitForTimeout(600);
  return (await signature()) !== before;
}

async function toggleMirror() {
  const before = await signature();
  await page.click(".ctrl--check input");
  await page.waitForTimeout(600);
  return (await signature()) !== before;
}

check(await slide("renderScale", 2.2), "Size moves the drawing");
check(await slide("renderScale", 1), "Size returns");
check(await slide("dx", 120), "X moves the drawing");
check(await slide("dx", 0), "X returns");
check(await slide("dy", -90), "Y moves the drawing");
check(await slide("dy", 0), "Y returns");
check(await slide("rotationDeg", 75), "Rotate turns the drawing");
check(await slide("rotationDeg", 0), "Rotate returns");

// The regression, both ways. `effect:mortar_shell` ships `faceLeft: true`, so
// the first toggle UNTICKS it — the direction that used to do nothing at all.
check(await toggleMirror(), "Mirror off flips the drawing back");
check(await toggleMirror(), "Mirror on flips it again");

// And the resolution underneath it: an entry with no `faceLeft` must read as
// not mirrored even though config_effects.js says otherwise for this key.
const mirrorResolves = await page.evaluate(async () => {
  const shared = await import("/src/shared_sprites.js");
  const assets = await import("/src/assets.js");
  const key = "effect:mortar_shell";
  const store = { [key]: {} };                 // the shape the workbench stores "off" as
  assets.__setSpriteManifest({ otherSprites: store });
  shared.clearSharedRegistry();
  const off = shared.sharedFaceLeft(key);
  store[key] = { faceLeft: true };
  const on = shared.sharedFaceLeft(key);
  return { off, on };
});
check(mirrorResolves.off === false && mirrorResolves.on === true,
  `an entry without faceLeft reads as NOT mirrored (off=${mirrorResolves.off}, on=${mirrorResolves.on})`);

// The launch cross has to sit where combat.js actually spawns the shot: the
// muzzle point for this body, not the kit's reference offsets. The two differ
// by the mech's height ratio — up to 16px across a roster drawn 125px to 165px
// tall, and exactly 0px for whoever happens to be reference height, which is
// how a viewer reading the raw pair looked right often enough to survive.
const spawn = await page.evaluate(async () => {
  const { muzzlePoint } = await import("/src/body_points.js");
  const { headHeightTarget } = await import("/src/heights.js");
  const { sharedSpriteInfo } = await import("/src/shared_sprites.js");
  const info = sharedSpriteInfo("effect:mortar_shell");
  const who = document.querySelector(".facts")?.textContent || "";
  const charKey = "colossus";
  const m = muzzlePoint(charKey, headHeightTarget(charKey), info.launch.forward, info.launch.y);
  return { raw: info.launch, muzzle: m, facts: who };
});
const scaled = Math.abs(spawn.muzzle.x - spawn.raw.forward) > 1;
check(scaled, `the muzzle is scaled onto the body (kit ${Math.round(spawn.raw.forward)}px → ${Math.round(spawn.muzzle.x)}px forward)`);
check(spawn.facts.includes(`${Math.round(spawn.muzzle.x)}px forward`),
  "the panel reports the spawn point the game uses, not the kit's raw offsets");
check(/muzzle/i.test(spawn.facts),
  "the panel says whether that muzzle was verified for this mech");

// NO DRAWING IS LEFT WITH A DEAD CONTROL. `nudge: false` on a draw site means
// the handler paints that art itself and never reads `sharedAdjust`, so X/Y and
// Rotate are stored and inert — the panel greys them and says which handler is
// responsible. Ten of the fifty-seven were in that state; their handlers read
// the nudge now, so the honest count is zero, and this is what stops the table
// drifting back out of step with the handlers it describes.
const inert = await page.evaluate(async () => {
  const { sharedSpriteKeys } = await import("/src/assets.js");
  const { sharedSpriteInfo } = await import("/src/shared_sprites.js");
  return sharedSpriteKeys()
    .filter((k) => k.startsWith("effect:") || k.startsWith("stagefx:"))
    .filter((k) => sharedSpriteInfo(k)?.nudge === false || sharedSpriteInfo(k)?.sizable === false);
});
check(inert.length === 0, `every drawing's controls reach the game${inert.length ? `: inert on ${inert.join(", ")}` : ""}`);

// And one of the ten, driven: a trap's art is painted by makeTrap rather than
// by the projectile list, which is exactly the family that used to ignore this.
await page.goto(`${BASE}/workbench/?fx=${encodeURIComponent("effect:ice_wall")}`);
await page.waitForFunction(() => document.querySelector("#viewCanvas")?.width > 0, null, { timeout: 30000 });
await page.waitForTimeout(9000);
check(await slide("dx", 90), "a handler-painted drawing takes an X nudge");
check(await slide("rotationDeg", 40), "a handler-painted drawing takes a tilt");

// The pose tool, and both tools at phone size: a layout that throws on boot is
// the one failure that makes every other check meaningless.
await page.goto(`${BASE}/workbench/?edit=pose`);
await page.waitForTimeout(6000);
check(!!(await page.$("#poseCanvas")), "the pose workbench boots");

const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
phone.on("pageerror", (e) => errors.push(`phone: ${String(e).slice(0, 200)}`));
for (const url of [`${BASE}/workbench/`, `${BASE}/workbench/?edit=pose`]) {
  await phone.goto(url);
  await phone.waitForTimeout(6000);
  const m = await phone.evaluate(() => ({
    bar: getComputedStyle(document.querySelector(".mbar")).display,
    overflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
  }));
  check(m.bar !== "none", `${url} — the phone layout's menu bar is up`);
  check(m.overflow, `${url} — nothing overflows the phone's width`);
}

check(errors.length === 0, `no page errors${errors.length ? `: ${errors.slice(0, 3).join(" | ")}` : ""}`);

await browser.close();
console.log(failed ? `${failed} failure(s)` : "the workbench controls all reach the picture");
process.exit(failed ? 1 : 0);
