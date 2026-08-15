// Two controllers in the menu: seats, join, and independent cursors.
//
// The bug this is built around could not be seen without two physical pads,
// which is why it shipped. `navigator.getGamepads()` returns a SPARSE array —
// a pad is invisible to the page until its owner touches it — so two pads
// plugged in with only the second one used report as `[null, pad]`. The old
// code compacted that list and handed out seats by position, which put player
// 2's pad in player 1's seat: their stick drove player 1's cursor, their own
// cursor never appeared, and the seating only corrected itself once player 1
// touched their pad and pushed the list back into shape. From the second
// player's chair that reads as "my controller does nothing until they move".
//
// Everything here drives fake pads through a stubbed `getGamepads`, so it needs
// no hardware and runs in CI. What it cannot check is the shape of the real
// browser's list — that assumption (sparse, holes where untouched pads are) is
// the thing the fix is built on, and it is stated here so a future reader can
// challenge it.
//
// Needs `playwright` and a running server: node tools/smoke_controllers.mjs
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

/** A page with `count` fake pads, `hidden` of which are held back the way an
 *  untouched pad is — as holes at the FRONT of the list. */
async function padPage({ pads = 2, hideFirst = false } = {}) {
  const page = await browser.newPage();
  page.on("pageerror", (e) => { failures++; console.log("FAIL page error", String(e)); });
  await page.addInitScript(([n, hide]) => {
    const mk = (index) => ({
      index, id: `fake pad ${index}`, connected: true, mapping: "standard",
      axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
    });
    window.__pads = Array.from({ length: n }, (_, i) => mk(i));
    window.__hideFirst = hide;
    navigator.getGamepads = () =>
      (window.__hideFirst ? [null, ...window.__pads.slice(1)] : window.__pads);
  }, [pads, hideFirst]);
  await page.goto(`${BASE}/index.html?camera=flat`, { waitUntil: "load" });
  await pressStart(page);
  await page.waitForSelector('[data-character="gojo"]', { timeout: 60000 });
  await page.waitForTimeout(600);
  return page;
}

const seats = (page) => page.evaluate(async () => {
  const { state } = await import("/src/state.js");
  return {
    players: state.playerCount,
    mode: state.mode,
    cursors: [...document.querySelectorAll(".char-card")]
      .filter((c) => c.className.includes("pad-focus-p"))
      .map((c) => `p${c.className.match(/pad-focus-p(\d)/)[1]}=${c.dataset.character}`)
      .sort().join(" "),
  };
});

/** Push a pad's stick and let go — one deliberate menu input. */
async function push(page, padIndex, axis, value, ms = 420) {
  await page.evaluate(([p, a, v]) => { window.__pads[p].axes[a] = v; }, [padIndex, axis, value]);
  await page.waitForTimeout(ms);
  await page.evaluate(([p, a]) => { window.__pads[p].axes[a] = 0; }, [padIndex, axis]);
  await page.waitForTimeout(150);
}

// ---- 1. Two pads connected, nobody has done anything yet.
{
  const page = await padPage({ pads: 2 });
  const s = await seats(page);
  check(s.players === 2, "two pads seat two players without either one acting", `playerCount ${s.players}`);
  check(s.mode === "local", "…and the second slot stops being a CPU", `mode ${s.mode}`);
  check(/p1=/.test(s.cursors) && /p2=/.test(s.cursors),
    "…and both cursors are on the roster", s.cursors);
  await page.close();
}

// ---- 2. Player 2 moves FIRST. This is the reported symptom.
{
  const page = await padPage({ pads: 2 });
  const before = await seats(page);
  await push(page, 1, 1, 0.9);   // pad 2 pushes down; pad 1 never moves
  const after = await seats(page);
  const p2Before = before.cursors.match(/p2=(\S+)/)?.[1];
  const p2After = after.cursors.match(/p2=(\S+)/)?.[1];
  const p1Before = before.cursors.match(/p1=(\S+)/)?.[1];
  const p1After = after.cursors.match(/p1=(\S+)/)?.[1];
  check(p2After && p2After !== p2Before,
    "player 2 can move before player 1 has touched their pad", `${p2Before} -> ${p2After}`);
  check(p1After === p1Before,
    "…and it moves THEIR cursor, not player 1's", `p1 stayed on ${p1After}`);
  await page.close();
}

// ---- 3. The sparse list: player 1's pad is still untouched, so the browser
//         shows a hole where it sits. Player 2's pad must not inherit seat 1.
{
  const page = await padPage({ pads: 2, hideFirst: true });
  const alone = await seats(page);
  check(alone.players === 1, "one visible pad is one player", `playerCount ${alone.players}`);
  // Player 1 finally touches theirs and the list fills in behind the pad that
  // was already seated. Seats must not shuffle.
  await page.evaluate(() => { window.__hideFirst = false; });
  await page.waitForTimeout(400);
  const both = await seats(page);
  check(both.players === 2, "the pad that appears later joins as a second player", `playerCount ${both.players}`);
  check(both.mode === "local", "…and switches the match out of CPU mode", `mode ${both.mode}`);

  // The pad seated FIRST (index 1 here, because index 0 was hidden) keeps
  // seat 1 even though it is no longer first in the browser's list.
  const start = await seats(page);
  await push(page, 1, 0, 0.9);
  const moved = await seats(page);
  const p1 = (s) => s.cursors.match(/p1=(\S+)/)?.[1];
  const p2 = (s) => s.cursors.match(/p2=(\S+)/)?.[1];
  check(p1(moved) !== p1(start), "the first-seen pad keeps seat 1 when the list reshuffles",
    `${p1(start)} -> ${p1(moved)}`);
  check(p2(moved) === p2(start), "…and the late pad keeps seat 2", `p2 stayed on ${p2(moved)}`);
  await page.close();
}

console.log(failures ? `\n${failures} check(s) failed` : "\nall controller checks passed");
await browser.close();
process.exit(failures ? 1 : 0);
