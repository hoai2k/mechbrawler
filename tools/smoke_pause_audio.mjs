// A PAUSED MATCH MAKES NO NOISE — measured, not asserted in a comment.
//
// Pausing holds the music where it is (audio.js MATCH_HOLD_PHASES) and the
// screen goes up, but the sound of the FIGHT used to carry straight on
// underneath it: the arena's ambience bed kept looping, the shield and domain
// loops kept humming, and every one-shot that was in flight when the player
// hit pause — an explosion tail, a KO cry, a spoken ultimate — played itself
// out over the overlay. With the music ducked away they were the only thing
// left, so a paused game sounded LOUDER than it had any right to.
//
// What is checked, at the only level that can catch it: the media elements
// themselves. The game creates its one-shots with `new Audio()`, so they are
// never in the DOM and cannot be found by querying for them; this wraps the
// constructor before the page loads and inspects every element the game ever
// made.
//
//   1. a live match sounds: music, the arena bed, hits
//   2. paused, nothing of the fight is sounding — and the MENU still is,
//      because the pause sting, the resume sting and every button on the
//      overlay are ui-category sounds and pause is not a mute button
//   3. resuming brings the arena bed back without a stage change
//
// Needs `playwright` and Chromium (CHROMIUM_PATH to override), and the game
// served first:  node server.mjs   then:  node tools/smoke_pause_audio.mjs

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
  // Without a gesture-free autoplay policy a headless page never gets to make
  // a sound at all, and every assertion below would pass vacuously.
  args: ["--no-proxy-server", "--autoplay-policy=no-user-gesture-required"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

// Before any module runs: keep a handle on every element the game creates.
await page.addInitScript(() => {
  const Real = window.Audio;
  window.__audios = [];
  window.Audio = function (src) {
    const el = new Real(src);
    window.__audios.push(el);
    return el;
  };
  window.Audio.prototype = Real.prototype;
});

/** Every file audibly playing right now, by name. */
const sounding = () => page.evaluate(() =>
  [...(window.__audios || []), ...document.querySelectorAll("audio")]
    .filter((a) => !a.paused && !a.muted && a.volume > 0)
    .map((a) => decodeURIComponent(a.src.split("/").pop())));

const MENU_SOUNDS = new Set(["pause.mp3", "countBeep.mp3", "fightBell.mp3", "powerup.mp3"]);
const isMusic = (name) => !name.endsWith(".mp3") || / /.test(name); // tracks carry spaces

await page.goto(`${BASE}/index.html`);
await pressStart(page);
await page.click('[data-character="titanus"]');
await page.waitForTimeout(300);
await page.click("#startButton");
await page.waitForSelector(".stage-card", { timeout: 15000 });
await page.locator(".stage-card").nth(0).click();

// A settled match: the phase blips through `playing` during round setup.
let stable = 0, last = -1;
for (let waited = 0; stable < 3; waited += 500) {
  if (waited > 180000) throw new Error("match never settled");
  await page.waitForTimeout(500);
  const s = await page.evaluate(async () => {
    const { state } = await import("/src/state.js");
    return { phase: state.phase, n: state.fighters.length, t: state.matchTime || 0 };
  });
  stable = (s.phase === "playing" && s.n > 0 && s.t > 4 && s.t > last) ? stable + 1 : 0;
  last = s.t;
}

const live = await sounding();
check(live.length > 0, "a live match makes a sound at all", live.join(", ") || "silence");
check(live.some((n) => n.startsWith("amb_")), "the arena bed is running", live.join(", "));

await page.keyboard.press("Escape");
await page.waitForTimeout(1200);
const paused = await page.evaluate(async () => {
  const { state } = await import("/src/state.js");
  const audio = await import("/src/audio.js");
  return { phase: state.phase, held: audio.sfxHeldForPause() };
});
check(paused.phase === "paused", "Escape paused the match", paused.phase);
check(paused.held === true, "audio.js knows the fight's sound is held");

const under = await sounding();
const fight = under.filter((n) => !MENU_SOUNDS.has(n) && !isMusic(n));
check(fight.length === 0, "nothing of the fight is sounding under the overlay",
  fight.join(", ") || "silence");

// …and it stays quiet, rather than a loop restarting itself a beat later.
await page.waitForTimeout(2500);
const later = (await sounding()).filter((n) => !MENU_SOUNDS.has(n) && !isMusic(n));
check(later.length === 0, "and it stays quiet while the game sits paused",
  later.join(", ") || "silence");

// The menu is not muted: a button on the pause screen still answers.
await page.evaluate(async () => (await import("/src/audio.js")).playSfx("uiSelect"));
await page.waitForTimeout(200);
const menu = (await sounding()).filter((n) => MENU_SOUNDS.has(n));
check(menu.length > 0, "the pause screen's own buttons still make a sound", menu.join(", "));

await page.keyboard.press("Escape");
await page.waitForTimeout(1500);
const back = await sounding();
check(await page.evaluate(async () =>
  (await import("/src/state.js")).state.phase === "playing"), "Escape resumed the match");
check(back.some((n) => n.startsWith("amb_")),
  "resuming brings the arena bed back", back.join(", ") || "silence");

check(errors.length === 0, "no page errors", errors.slice(0, 2).join(" | "));

await browser.close();
console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exit(failures ? 1 : 0);
