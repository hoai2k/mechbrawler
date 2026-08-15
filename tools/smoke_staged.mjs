// Smoke-test the STAGED fighters — the kits that exist in code but are not on
// the roster yet (STAGED_CHARACTER_KEYS in src/characters.js).
//
// They are the one part of the game nothing else can reach. `check_kits.mjs`
// proves every type they name has a handler; the roster smoke tests
// (smoke_combat.mjs) only ever play fighters who are selectable. So a staged
// kit's specials, ultimate and domain are never actually RUN until the day
// their art lands and somebody promotes them — which is the worst possible
// moment to find out a handler throws.
//
// This runs every one of them in a real match: it starts a normal fight, swaps
// the simulation half of a fighter over to each staged kit in turn (their art
// does not exist, so `key` stays pointed at the fighter whose sprites are
// loaded), fires all three specials, the ultimate and the domain, and fails on
// any page error. It then checks the round-15 mechanics that no delivered
// fighter exercises: the three new statuses, Kurourushi's hunger, Dagon's
// soaked-target passive, and Simple Domain against a sure-hit domain.
//
// Needs `playwright` (npm i) and a Chromium binary — set CHROMIUM_PATH if yours
// is elsewhere. Start the game first (node server.mjs), then:
//   node tools/smoke_staged.mjs [baseUrl]
import { chromium } from "playwright";
import { pressStart } from "./smoke_boot.mjs";

const BASE = process.argv[2] || "http://127.0.0.1:5174";

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-proxy-server"],
});
const page = await browser.newPage();

const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });

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

// Through the menus the way a player would, exactly as smoke_combat.mjs does.
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
    return state.phase === "playing" && state.fighters.length > 1;
  });
  if (ready) break;
  if (waited > 90000) throw new Error("match never started");
  await page.waitForTimeout(120);
}

// Nobody swings but this script. With `aiState` cleared the CPUs stop feeding
// input, so a damage delta below means what the check says it means rather than
// whatever the other fighter happened to be doing.
//
// Stocks go up at the same time, and for a subtler reason: the sweep below
// fires four ultimates and a domain at one CPU, which takes their last stock
// somewhere around the third. The match then ENDS — and a finished match stops
// stepping fighters, so every timing check after it reads zero while looking
// exactly like a mechanic that does not work.
await page.evaluate(async () => {
  const { state } = await import("/src/state.js");
  for (const f of state.fighters) {
    f.aiState = null;
    f.stocks = 99;
  }
});

const results = [];
const check = (name, pass, detail) => results.push({ name, pass, detail });

// ------------------------------------------------- every staged kit, every move

const staged = await page.evaluate(async () => {
  const { STAGED_CHARACTER_KEYS } = await import("/src/characters.js");
  return STAGED_CHARACTER_KEYS;
});
if (!staged.length) console.log("no staged fighters — nothing to smoke-test");

for (const key of staged) {
  const fired = [];
  for (const move of ["neutral", "side", "down", "ultimate", "domain"]) {
    const verdict = await page.evaluate(async ([key, move]) => {
      const { state } = await import("/src/state.js");
      const { CHARACTERS } = await import("/src/characters.js");
      const { performSpecial } = await import("/src/specials.js");
      const { performUltimate } = await import("/src/ultimates.js");
      const { performDomain, canOpenDomain } = await import("/src/domains.js");
      const { METER_MAX } = await import("/src/constants.js");
      const f = state.fighters[0];
      // The simulation half only. `key` stays pointed at the fighter whose art
      // is loaded, so silhouette/hitbox measurement has something to measure.
      f.char = { ...CHARACTERS[key], key: f.charKey };
      f.cooldowns = { neutral: 0, side: 0, down: 0 };
      f.meter = METER_MAX;
      f.action = null;
      f.dead = false; f.respawnTimer = 0;
      f.statuses.silence = 0;
      try {
        if (move === "ultimate") performUltimate(f);
        else if (move === "domain") {
          if (!f.char.domains?.length) return "none";
          if (!canOpenDomain(f)) return "unavailable";
          performDomain(f, 0);
        } else performSpecial(f, move);
      } catch (e) {
        return "THREW " + String(e);
      }
      return "ok";
    }, [key, move]);
    fired.push(`${move}=${verdict}`);
    check(`${key} ${move} runs`, verdict === "ok" || verdict === "none", verdict);
    // Let the move actually play out: hitboxes, projectiles, entities, draws.
    await page.waitForTimeout(verdict === "ok" && move === "domain" ? 8000 : 2000);
  }
  console.log(`${key.padEnd(12)} ${fired.join("  ")}`);
}

// ------------------------------------------------------ round-15 mechanics

/** Clear the stage and put both fighters back on the floor, alive, unhurt and
 *  in reach of each other.
 *
 *  Both halves matter. The sweep above fires four ultimates and a domain at the
 *  same poor CPU, so by now one of them is usually mid-respawn — and applyHit
 *  refuses outright for a dead or respawning fighter, which reads here as a
 *  mechanic that does nothing rather than as a check that never ran. It also
 *  leaves a stage full of summons, shikigami and an open domain, all of which
 *  go on hitting: a KO between planting and measuring wipes the victim's
 *  statuses and resets their percent, so an infestation that IS ticking reads
 *  as one that never started. */
const plant = async () => {
  const phase = await page.evaluate(async () => (await import("/src/state.js")).state.phase);
  if (phase !== "playing") throw new Error(`the match is over (phase "${phase}") — nothing is being stepped`);
  return page.evaluate(async () => {
    const { state } = await import("/src/state.js");
    const groundY = state.platforms[0]?.y ?? 568;
    const [a, b] = state.fighters;
    state.entities.length = 0;
    state.projectiles.length = 0;
    state.hitboxes.length = 0;
    state.domain = null;
    state.domainOverlay = null;
    for (const f of state.fighters) {
      f.dead = false; f.respawnTimer = 0; f.invuln = 0; f.hitstun = 0;
      f.vx = 0; f.vy = 0; f.grounded = true; f.y = groundY;
      f.shielding = false; f.prone = 0; f.dizzy = 0; f.counter = null;
      f.installs = null; f.armorT = 0; f.action = null; f.damage = 0;
      f.recentMoves = [];                   // no staling: hits at face value
      f.statuses.infest = null; f.statuses.drench = 0; f.statuses.blind = 0;
    }
    a.x = 560; b.x = 640;
  });
};

// Kurourushi: the eggs hatch, they keep ticking, and the colony feeds its parent.
await plant();
const infest = await page.evaluate(async () => {
  const { state } = await import("/src/state.js");
  const { CHARACTERS } = await import("/src/characters.js");
  const { applyStatus } = await import("/src/combat.js");
  const [a, b] = state.fighters;
  a.char = { ...CHARACTERS.kurourushi, key: a.charKey };
  a.damage = 40;
  b.damage = 0;
  applyStatus("infest", a, b);
  applyStatus("infest", a, b);              // a second cut is a second generation
  return { stacks: b.statuses.infest.stacks, victim: b.damage, parent: a.damage };
});
await page.waitForTimeout(2000);
const infested = await page.evaluate(async () => {
  const { state } = await import("/src/state.js");
  return { victim: state.fighters[1].damage, parent: state.fighters[0].damage };
});
check("infest stacks", infest.stacks === 2, `stacks=${infest.stacks}`);
check("infest ticks", infested.victim > infest.victim,
  `${infest.victim} -> ${infested.victim.toFixed(1)}`);
check("infest feeds its parent", infested.parent < infest.parent,
  `${infest.parent} -> ${infested.parent.toFixed(1)}`);

// Dagon: soaking is a debuff he can read — and he cannot be soaked himself.
await plant();
const water = await page.evaluate(async () => {
  const { state } = await import("/src/state.js");
  const { CHARACTERS } = await import("/src/characters.js");
  const { applyHit, applyStatus } = await import("/src/combat.js");
  const [a, b] = state.fighters;
  a.char = { ...CHARACTERS.dagon, key: a.charKey };
  b.statuses.infest = null;
  const hit = { dmg: 10, baseKb: 0, growth: 0, angle: 0.3, label: "probe", sfx: "punch" };
  b.damage = 0; b.invuln = 0; b.hitstun = 0; b.statuses.drench = 0;
  applyHit(a, b, hit, "script");
  const dry = b.damage;
  b.damage = 0; b.invuln = 0; b.hitstun = 0;
  applyStatus("drench", a, b);
  applyHit(a, b, hit, "script");
  const wet = b.damage;
  applyStatus("drench", b, a);              // he does not drown in his own sea
  applyStatus("blind", b, a);
  return { dry, wet, drenched: b.statuses.drench, selfDrench: a.statuses.drench };
});
check("drench applies", water.drenched > 0, `t=${water.drenched}`);
check("soaked targets take more from Dagon", water.wet > water.dry,
  `dry=${water.dry} wet=${water.wet}`);
check("Dagon cannot be soaked", water.selfDrench === 0, `t=${water.selfDrench}`);

// Simple Domain: a domain's guaranteed hit stops being guaranteed, and only for
// as long as the circle is held.
await plant();
const opened = await page.evaluate(async () => {
  const { state } = await import("/src/state.js");
  const { CHARACTERS } = await import("/src/characters.js");
  const { performDomain } = await import("/src/domains.js");
  const { performSpecial } = await import("/src/specials.js");
  const { METER_MAX } = await import("/src/constants.js");
  const [a, b] = state.fighters;
  a.char = { ...CHARACTERS.dagon, key: a.charKey };
  b.char = { ...CHARACTERS.yuki, key: b.charKey };
  a.meter = METER_MAX;
  a.dead = false; a.respawnTimer = 0;
  b.dead = false; b.respawnTimer = 0;
  b.damage = 0; b.statuses.blind = 0; b.cooldowns = { neutral: 0, side: 0, down: 0 };
  performDomain(a, 0);
  performSpecial(b, "down");                // Simple Domain
  return { held: b.simpleDomain?.t ?? 0, damage: b.damage };
});
await page.waitForTimeout(1300);            // still inside the circle
const guarded = await page.evaluate(async () => {
  const { state } = await import("/src/state.js");
  return state.fighters[1].damage;
});
await page.waitForTimeout(2500);            // circle lapsed, the shoal resumes
const after = await page.evaluate(async () => {
  const { state } = await import("/src/state.js");
  return { damage: state.fighters[1].damage, open: !!state.domain };
});
check("Simple Domain holds for its duration", opened.held > 1, `t=${opened.held}`);
check("no sure-hit lands inside a Simple Domain", guarded === opened.damage,
  `${opened.damage} -> ${guarded}`);
check("sure-hits resume once it lapses", after.open && after.damage > guarded,
  `${guarded} -> ${after.damage.toFixed(1)} (domain open: ${after.open})`);

await browser.close();

// ------------------------------------------------------------------- report

let failed = 0;
for (const r of results) {
  if (!r.pass) failed += 1;
  console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.name}  [${r.detail}]`);
}
const realErrors = errors.filter((e) => !(isResource404(e) && undelivered.size));
if (undelivered.size) {
  console.log(`\n${undelivered.size} optional asset(s) not delivered yet:`);
  for (const u of undelivered) console.log("  " + u);
}
if (realErrors.length) {
  console.error(`\n${realErrors.length} page error(s):`);
  for (const e of [...new Set(realErrors)]) console.error("  " + e);
}
if (failed || realErrors.length) {
  console.error(`\n${failed} failed check(s), ${realErrors.length} page error(s)`);
  process.exit(1);
}
console.log(`\nall ${results.length} checks passed, no page errors`);
