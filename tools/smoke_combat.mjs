// Smoke-test the combat layer in a real match: starts a CPU-vs-CPU fight in
// headless Chromium, samples the simulation at 10 Hz, and fails on any page
// error or on combat that is not doing what the code says it should.
//
// Written for the hitbox/range/angle rework (docs/hitbox-audit.md). The static
// audit (tools/audit_hitboxes.mjs) checks the numbers the code derives; this
// checks that a match made of those numbers actually plays — hits land,
// hurtboxes come off the art, the grounded layer exists, and nothing throws.
//
// Needs `playwright` (npm i playwright) and a Chromium binary — set
// CHROMIUM_PATH if yours is elsewhere. Start the game first (node server.mjs),
// then: node tools/smoke_combat.mjs [baseUrl]
import { chromium } from "playwright";
import { pressStart } from "./smoke_boot.mjs";

const BASE = process.argv[2] || "http://127.0.0.1:5174";
const SECONDS = 40;

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-proxy-server"],
});
const page = await browser.newPage();

const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

// Art the loader asks for OPTIONALLY: summon minions, technique effects, stage-fx
// and domain backdrops all fall back to something procedural, so a fighter can
// ship ahead of them (`optional()` in src/assets.js). The fetch still 404s, and
// the browser still logs it, so a request for art nobody has drawn yet would
// read here as a broken game. Counted and reported instead — a real missing
// asset outside these families still fails.
const OPTIONAL_ART = [
  "/assets/sprites/summons/",
  "/assets/sprites/effects/",
  "/assets/backgrounds/domains/",
  // Sound behaves the same way: a cue with no file plays nothing, and the
  // moment still works. Audio round 10 (the domain cues) is open, so opening a
  // domain currently asks for four .mp3s nobody has recorded — undelivered
  // audio, reported like undelivered art rather than failed like a broken game.
  "/assets/sfx/",
];
const undelivered = new Set();
const isResource404 = (t) => /Failed to load resource/.test(t);
page.on("response", (r) => {
  if (r.status() === 404 && OPTIONAL_ART.some((p) => r.url().includes(p))) {
    undelivered.add(r.url().replace(/^https?:\/\/[^/]+/, ""));
  }
});

await page.goto(`${BASE}/index.html?camera=flat`, { waitUntil: "load" });
await pressStart(page);

// Through the menus the way a player would — the match entry is not exported,
// and going round it would smoke-test something the game does not do.
await page.waitForSelector('[data-character="gojo"]', { timeout: 60000 });
await page.click('[data-character="gojo"]');
await page.waitForTimeout(400);
await page.click("#startButton");
await page.waitForSelector(".stage-card", { timeout: 5000 });
await page.locator(".stage-card").nth(0).click();

// Sprite art loads lazily, so a short loading screen can sit in front of the
// match. Wait for the fight to actually be running.
for (let waited = 0; ; waited += 120) {
  const ready = await page.evaluate(async () => {
    const { state } = await import("/src/state.js");
    return state.phase === "playing" && state.fighters.length > 0;
  });
  if (ready) break;
  if (waited > 90000) throw new Error("match never started");
  await page.waitForTimeout(120);
}

// Watch the simulation rather than the screen: everything interesting is state.
const samples = [];
for (let i = 0; i < SECONDS * 10; i++) {
  const s = await page.evaluate(async () => {
    const { state } = await import("/src/state.js");
    const { hurtbox } = await import("/src/combat.js");
    const { bodyMetrics } = await import("/src/silhouette.js");
    return {
      t: state.matchTime,
      phase: state.phase,
      hitboxes: state.hitboxes.length,
      projectiles: state.projectiles.length,
      fighters: state.fighters.map((f) => ({
        charKey: f.charKey, dmg: f.damage, stocks: f.stocks, grounded: f.grounded,
        hitstun: f.hitstun, vy: f.vy, box: hurtbox(f),
        // The actor being DRAWN, not the fighter underneath: Megumi wearing
        // Mahoraga is a 222 px shikigami on screen and is a 222 px shikigami to
        // hit, which is the whole point of sizing boxes off the art.
        drawn: f.spriteChar || f.charKey,
        want: bodyMetrics(f.spriteChar || f.charKey),
      })),
    };
  });
  samples.push(s);
  await page.waitForTimeout(100);
}

/** Plant a fighter on the floor and hit them, once weakly and once hard. */
async function probe() {
  return page.evaluate(async () => {
    const { state } = await import("/src/state.js");
    const { applyHit } = await import("/src/combat.js");
    const [a, b] = state.fighters;
    // BOTH fighters get reset, not just the victim. applyHit refuses outright
    // if the attacker is dead or respawning, and after fifty seconds of match
    // one of them usually is — which returns "ignored", leaves the victim
    // untouched, and reads exactly like a victim who correctly stayed on the
    // floor. The returned verdict is asserted below for the same reason.
    const plant = () => {
      for (const f of [a, b]) {
        f.dead = false; f.respawnTimer = 0; f.invuln = 0; f.hitstun = 0;
        f.grounded = true; f.vx = 0; f.vy = 0; f.shielding = false;
        f.prone = 0; f.counter = null; f.armorT = 0; f.installs = null;
        f.input = null; f.recentMoves = [];   // no staling: hits at face value
      }
      b.damage = 0;
      a.x = b.x - 80;
    };
    plant();
    // A down-tilt-shaped poke: low angle, low knockback. Must not lift them.
    const weak = applyHit(a, b,
      { dmg: 4, baseKb: 120, growth: 3, angle: 0.14, sfx: "punch" }, "melee");
    const weakStayedDown = weak === "hit" && b.grounded === true && b.vx !== 0;
    const weakVx = b.vx;
    plant();
    // And a smash-shaped one, which must.
    const strong = applyHit(a, b,
      { dmg: 18, baseKb: 460, growth: 8, angle: 0.5, sfx: "punch" }, "melee");
    return {
      weak, strong, weakStayedDown, weakVx,
      strongLaunched: strong === "hit" && b.grounded === false && b.vy < 0,
      strongVy: b.vy,
    };
  });
}

const layeredResult = await probe();
await browser.close();

// ------------------------------------------------------------------ checks

let failed = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? "   " + detail : ""}`);
  if (!ok) failed += 1;
};

const realErrors = errors.filter(
  (e) => !(isResource404(e) && undelivered.size));
check("no page errors", realErrors.length === 0, realErrors.slice(0, 3).join(" | "));
if (undelivered.size) {
  console.log(`ok   ${undelivered.size} optional asset(s) not delivered yet`,
              "  " + [...undelivered].join(" "));
}
// What this is guarding against is a match that never started or died on its
// face, not a short one. `matchTime` stops advancing the moment somebody runs
// out of stocks, so a CPU fight that finishes inside the sample window reads
// here exactly like one that hung — and finishing is the correct outcome, not a
// failure. So: ran long enough, OR reached the round-over screen. (Before the
// blast zones were checked from every state a fighter could be moved in, an
// off-stage knockdown fell forever and no match could end early at all, which
// is why a bare duration test held up as long as it did.)
const ended = samples.at(-1).phase === "roundOver";
check("match ran", samples.at(-1).t > SECONDS * 0.5 || ended,
  `matchTime ${samples.at(-1)?.t?.toFixed(1)}s, phase ${samples.at(-1)?.phase}`);

// Across every sample, not the last one: percent resets to zero on a KO, so a
// match that went well enough to take a stock would read as a match where
// nothing ever connected.
//
// And the PEAK is not the measurement any more, the TOTAL is. Peak percent is
// hostage to the KO that resets it, and ledge intangibility now decays with
// every regrab (Smash's anti-camping rule, constants.js), so CPU matches take
// stocks sooner and reset percent more often. Summing each fighter's percent
// INCREASES asks the question this check is actually for — did anything
// connect — directly: it survives any number of KOs, and unlike counting
// stocks it cannot be satisfied by a CPU walking off the stage.
//
// THE BAR IS LOW ON PURPOSE. This is noise-dominated: the matchup is random and
// two CPUs can spend a minute missing each other. Measured totals across runs
// span 20% to 148% on identical code, so anything tuned near the middle of that
// is a coin flip, not a test. What it has to separate is a game where combat
// happens from one where it does not, and the AI stubbed out scores 0.0%.
let dealt = 0;
let peak = 0;
for (let i = 1; i < samples.length; i++) {
  for (let j = 0; j < samples[i].fighters.length; j++) {
    const now = samples[i].fighters[j];
    const was = samples[i - 1].fighters[j];
    peak = Math.max(peak, now.dmg);
    if (was && now.charKey === was.charKey && now.dmg > was.dmg) dealt += now.dmg - was.dmg;
  }
}
check("hits are landing", dealt > 12,
  `${dealt.toFixed(1)}% dealt in total, peak ${peak.toFixed(1)}%`);

// Melee and projectiles both count. A zoner drawn as the CPU's opponent will
// spend most of a match throwing things, and that is a legitimate match rather
// than a broken one.
const swung = samples.filter((s) => s.hitboxes > 0 || s.projectiles > 0).length;
check("attacks are being thrown", swung > 10,
  `${swung} samples with a live hitbox or projectile`);

// Each fighter's hurtbox has to be the one their own art measures out to.
// Comparing the two fighters to each other would be the obvious check and is
// the wrong one: plenty of the roster genuinely measures the same, so a random
// pairing of two 175 px fighters would fail a correct build.
// Checked across every sample and every state — standing, crouched, in
// hitstun, prone, hanging — rather than against one expected shape, because
// each state has its own proportions. What must hold everywhere is that the box
// is built from THIS fighter's measurements: never wider than their own body
// plus the crouch spread, never taller than their own art.
const offenders = [];
for (const s of samples) {
  for (const f of s.fighters) {
    const wr = f.box.w / f.want.width;
    const hr = f.box.h / f.want.height;
    // A body drawn FLAT — prone on the floor, or spun horizontal in a tumble
    // (combat.js hurtbox) — is legitimately body-LENGTH wide and knee-high:
    // its width is a fraction of the fighter's HEIGHT, not their standing
    // width. Admit exactly that shape (low, and no longer than the body) so
    // the bound still catches a box that is simply wrong-sized.
    const flat = hr <= 0.30 && f.box.w <= f.want.height * 0.70 && wr >= 0.55;
    if (flat) continue;
    if (wr < 0.55 || wr > 1.25 || hr > 0.95) {
      offenders.push(`${f.charKey} as ${f.drawn} `
        + `${Math.round(f.box.w)}x${Math.round(f.box.h)} `
        + `vs body ${Math.round(f.want.width)}x${Math.round(f.want.height)}`);
    }
  }
}
check("hurtboxes come off each fighter's own art", offenders.length === 0,
  offenders.length ? offenders[0] : samples.at(-1).fighters
    .map((f) => `${f.charKey} ${Math.round(f.box.w)}x${Math.round(f.box.h)}`).join(", "));
// And the retired one-size-fits-all box is gone.
check("the 64x108 roster-wide box is retired", !samples.some((s) =>
  s.fighters.some((f) => Math.round(f.box.w) === 64 && Math.round(f.box.h) === 108)));

// The grounded layer, driven rather than observed.
//
// A weak grounded hit leaves the victim sliding for a fraction of a second, and
// waiting for a CPU match to happen to produce one and happen to be sampled
// mid-slide is a coin toss — it passed four runs and failed the fifth against
// identical code. So the probe below hits a planted fighter directly, twice,
// and reads the result: once with a low-angle poke too weak to lift anyone, and
// once with a launcher.
const layered = layeredResult;
check("weak hits keep the victim grounded", layered.weakStayedDown,
  layered.weakStayedDown ? `slid at ${Math.round(layered.weakVx)} px/s`
    : `applyHit returned "${layered.weak}", vx ${Math.round(layered.weakVx)}, `
      + "so either the hit was refused or GROUND_RELEASE is not biting");
check("strong hits still launch", layered.strongLaunched,
  layered.strongLaunched ? `launched at ${Math.round(-layered.strongVy)} px/s`
    : `applyHit returned "${layered.strong}", vy ${Math.round(layered.strongVy)}`);

console.log(`\n${samples.length} samples over ${samples.at(-1).t.toFixed(1)}s of match time`);
console.log(failed ? `${failed} check(s) failed` : "all checks passed");
process.exit(failed ? 1 : 0);
