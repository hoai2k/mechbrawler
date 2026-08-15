// Smoke-test the blast zones from every state that moves a fighter.
//
// Written for a bug that could hang a match forever: `updateFighter` integrates
// position in four different branches and only the last one checked the blast
// zones. A fighter knocked flat by Reggie's sedan (`knockdown: true`) and sent
// off the side left the stage while prone, and prone only counts down on the
// floor — so they fell past the bottom of the world at terminal velocity with
// nothing to stop them. No KO, no stock lost, and `alive.length` never dropped
// to 1, so the round never ended.
//
// Each case here drops a fighter out of bounds in one of those states and
// asserts the ring-out lands. Add a state that moves a fighter, add a case.
//
// Needs `playwright` and a Chromium binary — set CHROMIUM_PATH if yours is
// elsewhere. Start the game first (node server.mjs), then:
//   node tools/smoke_blastzone.mjs [baseUrl]
import { chromium } from "playwright";
import { pressStart } from "./smoke_boot.mjs";

const BASE = process.argv[2] || "http://127.0.0.1:5174";

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-proxy-server"],
});
const page = await browser.newPage();

const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

// Same allowance smoke_combat makes: summons, technique effects and domain
// backdrops are fetched optionally and fall back to something procedural, so a
// fighter can ship ahead of their art. The 404 is still logged, and counting it
// as a page error would fail this run for art nobody has drawn yet — which has
// nothing to do with blast zones.
const OPTIONAL_ART = [
  "/assets/sprites/summons/",
  "/assets/sprites/effects/",
  "/assets/backgrounds/domains/",
];
const undelivered = new Set();
page.on("response", (r) => {
  if (r.status() === 404 && OPTIONAL_ART.some((prefix) => r.url().includes(prefix))) {
    undelivered.add(r.url().replace(/^https?:\/\/[^/]+/, ""));
  }
});

await page.goto(`${BASE}/index.html?camera=flat`, { waitUntil: "load" });
await pressStart(page);
await page.waitForSelector('[data-character="gojo"]', { timeout: 60000 });
await page.click('[data-character="gojo"]');
await page.waitForTimeout(400);
await page.click("#startButton");
await page.waitForSelector(".stage-card", { timeout: 5000 });
await page.locator(".stage-card").nth(0).click();

for (let waited = 0; ; waited += 120) {
  const ready = await page.evaluate(async () => {
    const { state } = await import("/src/state.js");
    return state.phase === "playing" && state.fighters.length > 0;
  });
  if (ready) break;
  if (waited > 90000) throw new Error("match never started");
  await page.waitForTimeout(120);
}

// Each case names a state and the fields that put a fighter into it. The
// victim is thrown well past the side blast zone and given downward speed, the
// way a sideways launch off the stage actually leaves them.
const CASES = [
  { name: "prone (knocked flat, e.g. Reggie's sedan)", set: { prone: 1.1, hitstun: 0 } },
  { name: "prone with hitstun still running", set: { prone: 1.1, hitstun: 0.4 } },
  { name: "dizzy (shield break)", set: { dizzy: 2.0 } },
  { name: "tumbling, no special state", set: {} },
];

let failures = 0;

for (const c of CASES) {
  const result = await page.evaluate(async ({ set }) => {
    const { state } = await import("/src/state.js");
    const victim = state.fighters[1] || state.fighters[0];
    const before = victim.stocks;

    // Off the side and falling. `x` alone would do it, but a real launch
    // carries downward speed too and that is the case that hung.
    victim.x = 1600;
    victim.y = 300;
    victim.vx = 600;
    victim.vy = 400;
    victim.grounded = false;
    victim.invuln = 0;
    victim.hitPause = 0;
    victim.respawnTimer = 0;
    victim.ledge = null;
    victim.action = null;
    victim.prone = 0;
    victim.dizzy = 0;
    victim.hitstun = 0;
    Object.assign(victim, set);

    // Two seconds of real time is many hundreds of frames — long enough that a
    // fighter who is going to ring out has, and short enough to stay a smoke
    // test. The respawn that follows is what proves the round can continue.
    const deadline = performance.now() + 2000;
    while (performance.now() < deadline) {
      if (victim.stocks < before || victim.dead) break;
      await new Promise((r) => requestAnimationFrame(r));
    }
    return { before, after: victim.stocks, dead: victim.dead, y: Math.round(victim.y) };
  }, c);

  const rungOut = result.dead || result.after < result.before;
  console.log(`${rungOut ? "ok  " : "FAIL"} ${c.name}`
    + `   stocks ${result.before} -> ${result.after}`
    + (rungOut ? "" : `, still falling at y=${result.y}`));
  if (!rungOut) failures++;

  // Put the fighter back on the stage so the next case starts from a match
  // that is still running rather than one that has already ended.
  await page.evaluate(async () => {
    const { state } = await import("/src/state.js");
    for (const f of state.fighters) {
      f.stocks = Math.max(f.stocks, 3);
      f.dead = false;
      f.respawnTimer = 0;
      f.prone = 0; f.dizzy = 0; f.hitstun = 0;
      f.x = 640; f.y = 300; f.vx = 0; f.vy = 0;
    }
  });
  await page.waitForTimeout(200);
}

const realErrors = errors.filter(
  (e) => !(/Failed to load resource/.test(e) && undelivered.size));
if (realErrors.length) {
  failures++;
  console.log(`FAIL page errors\n  ${realErrors.slice(0, 5).join("\n  ")}`);
} else {
  console.log("ok   no page errors"
    + (undelivered.size ? `   (${undelivered.size} optional asset(s) not delivered yet)` : ""));
}

await browser.close();
console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exit(failures ? 1 : 0);
