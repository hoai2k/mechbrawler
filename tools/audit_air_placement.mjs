// How every pose's drawing sits inside the hurtbox the game tests for it.
//
// Vertical placement is `bodyBottom`, and on a grounded pose it has an obvious
// meaning: the foot line, solved by auto_tune from the lowest drawn pixel. In
// the air there is no floor, so that rule was solving for a contact that does
// not exist — it pinned every jump, fall, air dodge and aerial by whatever
// pixel happened to hang lowest (a trailing toe, a tucked heel) to the ground
// line, and the workbench then refused to move it. Both of those are fixed;
// this is how you find the frames the old behaviour left badly placed.
//
// What it measures, per frame, in world pixels at the size the game draws:
//
//   over    how far the drawing rises ABOVE the top of its hurtbox
//   under   how far the box extends BELOW the lowest drawn pixel
//   slack   headroom inside the box with no body in it — the pose floating low
//
// A pose is not required to fill its box. A tucked air dodge is legitimately
// shorter than a standing fighter and the box does not shrink for it. What the
// numbers are for is the COMPARISON: a fighter whose `dodge_air` leaves 45 px
// of empty box above their head, when the rest of the roster leaves 5, is a
// pose that was placed by the old rule and never looked at.
//
// The eye decides; this says where to point it. Open one with
//   http://localhost:5174/workbench/?char=<char>&frame=<pose>
// turn on the Hurtbox overlay, and use Vertical position.
//
// Needs `playwright` and a Chromium binary. Start the server first
// (node server.mjs), then: node tools/audit_air_placement.mjs [--all] [baseUrl]
import { chromium } from "playwright";

const args = process.argv.slice(2);
const showAll = args.includes("--all");
const BASE = args.find((a) => a.startsWith("http")) || "http://127.0.0.1:5174";

// Flag a pose whose empty headroom is this far past the median for its own
// pose key across the roster. Per-key rather than absolute: `dodge_air` is a
// tuck and sits lower than `fall` on everybody, so a flat threshold would
// either report the whole column or none of it.
const SLACK_OUTLIER = 12;

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-proxy-server"],
});
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

await page.goto(`${BASE}/workbench/`, { waitUntil: "domcontentloaded" });
await page.waitForFunction(
  () => /loaded/.test(document.getElementById("loadState")?.textContent || ""),
  null, { timeout: 120000 },
).catch(() => {});

const rows = await page.evaluate(async () => {
  const { spriteManifest, frameMeta } = await import("/src/assets.js");
  const { frameFootY, statesUsingFrame, isAirborneOnly, isAnchorPlaced } = await import("/src/sprites.js");
  const { bodyMetrics } = await import("/src/silhouette.js");
  const { CHARACTERS, SPRITE_ACTORS } = await import("/src/characters.js");
  const { HURTBOX } = await import("/src/constants.js");
  const actors = { ...CHARACTERS, ...SPRITE_ACTORS };

  // Mirrors hurtbox() in combat.js. Returns how far the box rises above the
  // foot line and how tall it is — the two differ only for a ledge hang.
  const boxFor = (states, bm) => {
    const has = (...n) => states.some((s) => n.includes(s));
    const H = bm.height, W = bm.width;
    if (has("ledge")) return { top: H * HURTBOX.ledgeTop, h: H * HURTBOX.ledgeH, kind: "ledge" };
    if (has("prone")) return { top: H * HURTBOX.proneH, h: H * HURTBOX.proneH, kind: "prone" };
    if (has("crouch", "crouchAttack")) return { top: H * bm.crouch, h: H * bm.crouch, kind: "crouch" };
    if (has("hurt")) return { top: H * HURTBOX.hurtH, h: H * HURTBOX.hurtH, kind: "hitstun" };
    return { top: H * HURTBOX.standH, h: H * HURTBOX.standH, kind: "stand" };
  };

  const out = [];
  for (const [char, frames] of Object.entries(spriteManifest.characters)) {
    const actor = actors[char];
    if (!actor) continue;
    const bm = bodyMetrics(char);
    for (const key of Object.keys(frames)) {
      const m = frameMeta(char, key);
      if (!m || !Number.isFinite(m.bodyTop) || !Number.isFinite(m.h)) continue;
      const states = statesUsingFrame(char, key);
      if (!states.length) continue;
      const s = actor.scale * (m.renderScale || 1);
      const foot = frameFootY(m), oy = m.oy ?? 0;
      // World y with the foot line at 0 and up negative, as the renderer draws.
      const top = (oy + m.bodyTop - foot) * s;
      const bot = (oy + m.h - foot) * s;
      const box = boxFor(states, bm);
      out.push({
        char, key, states: states.join("+"), kind: box.kind,
        airborne: isAirborneOnly(char, key), anchored: isAnchorPlaced(char, key),
        over: +Math.max(0, -box.top - -top).toFixed(1),
        under: +Math.max(0, bot - 0).toFixed(1),
        slack: +Math.max(0, top - -box.top).toFixed(1),
      });
    }
  }
  return out;
});

await browser.close();
if (errors.length) {
  console.log(`page errors:\n  ${errors.slice(0, 3).join("\n  ")}`);
  process.exit(1);
}

const median = (v) => {
  const a = [...v].sort((x, y) => x - y);
  return a.length ? a[Math.floor(a.length / 2)] : 0;
};

// A ledge pose is hung from its grip anchor, so bodyBottom does not place it
// and there is nothing here to act on. Reported as skipped rather than dropped
// silently, so the count adds up.
const anchored = rows.filter((r) => r.anchored);
const live = rows.filter((r) => !r.anchored);

const byKey = new Map();
for (const r of live) {
  if (!byKey.has(r.key)) byKey.set(r.key, []);
  byKey.get(r.key).push(r);
}

const flagged = [];
for (const [, group] of byKey) {
  const med = median(group.map((r) => r.slack));
  for (const r of group) {
    r.excess = +(r.slack - med).toFixed(1);
    if (r.excess >= SLACK_OUTLIER) flagged.push(r);
  }
}
flagged.sort((a, b) => b.excess - a.excess);

console.log(`${live.length} placed frame(s) measured, ${anchored.length} skipped `
  + `(hung from an anchor, so bodyBottom does not place them)\n`);

console.log("empty headroom inside the hurtbox, by pose — median across the roster");
const air = [...byKey.entries()].filter(([, g]) => g[0].airborne);
const ground = [...byKey.entries()].filter(([, g]) => !g[0].airborne);
for (const [label, set] of [["airborne", air], ["grounded", ground]]) {
  if (!set.length) continue;
  console.log(`  ${label}`);
  for (const [key, g] of set.sort((a, b) => median(b[1].map((r) => r.slack)) - median(a[1].map((r) => r.slack)))) {
    const sl = median(g.map((r) => r.slack));
    if (label === "grounded" && sl < 1) continue;    // the quiet majority
    console.log(`    ${key.padEnd(16)} n=${String(g.length).padStart(3)}  slack ${sl.toFixed(1).padStart(6)} px`);
  }
}

if (!flagged.length) {
  console.log(`\nno pose sits more than ${SLACK_OUTLIER} px lower in its box than its own pose key does across the roster`);
} else {
  console.log(`\n${flagged.length} pose(s) floating low in their own hurtbox `
    + `— ${SLACK_OUTLIER}px+ more empty headroom than that pose has elsewhere on the roster:\n`);
  for (const r of showAll ? flagged : flagged.slice(0, 25)) {
    console.log(`  ${r.char.padEnd(11)} ${r.key.padEnd(15)} +${String(r.excess).padStart(5)} px  `
      + `(${r.slack} px empty above the body, box: ${r.kind})`);
  }
  if (!showAll && flagged.length > 25) console.log(`  … and ${flagged.length - 25} more (--all)`);
}
