// DOES THE JAB ACTUALLY LAND? — the light attack, from press to strike.
//
// Two mechs bank their jab instead of throwing it (titanus and colossus —
// `charge.light` in characters.js): the button held cocks a fist, and letting
// go throws it. That is three states in a row — the bank, the strike, the
// return — and a wrong clip in the middle is invisible in a still. The mech
// simply winds up forever, which is exactly how it was reported.
//
// So this drives the fighter's own state machine rather than the renderer:
// hold the light button for half a second, release, and print the animation
// key on every frame it changes. What the player sees is that sequence.
//
//   node server.mjs
//   node tools/probe_light_chain.mjs [mechKey]        # default titanus
//
// Expected, for a mech that banks:  chargeLight -> light -> (locomotion)
// and for everyone else:            light -> (locomotion)
import { chromium } from "playwright";
import { pressStart, pickAnyFighter } from "../tools/smoke_boot.mjs";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args:["--use-gl=angle","--use-angle=swiftshader"] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
p.on("pageerror", e => console.log("[err]", String(e).slice(0,180)));
await p.goto("http://127.0.0.1:5174/index.html?camera=flat", { waitUntil: "domcontentloaded" });
await pressStart(p);
const WANT = process.argv[2] || "titanus";
await p.evaluate(async (k) => {
  const { state } = await import("/src/state.js");
  state.selection[1] = k;
}, WANT);
await pickAnyFighter(p);
await p.evaluate(async (k) => {
  const { state } = await import("/src/state.js");
  state.selection[1] = k; state.roster[1] = k;
}, WANT);
await p.click("#startButton");
await p.waitForSelector(".stage-card", { timeout: 15000 });
await p.locator(".stage-card").nth(0).click();
await p.waitForFunction(async () => {
  const { state } = await import("/src/state.js");
  return state.phase === "playing" && state.fighters.length > 0;
}, null, { timeout: 120000 });
const out = await p.evaluate(async (want) => {
  const { state } = await import("/src/state.js");
  const { updateFighter } = await import("/src/fighter.js");
  const { CHARACTERS } = await import("/src/characters.js");
  const f = state.fighters[0];
  // stand this fighter up as the mech under test
  const log = [];
  const { blankInput } = await import("/src/input.js");
  const blank = () => blankInput();
  const step = (input, n) => {
    for (let i = 0; i < n; i++) {
      updateFighter(f, 1/60, input);
      log.push({ f: log.length, anim: f.animKey,
        charging: f.charging ? f.charging.variant : null,
        action: f.action ? (f.action.anim || "?") : null });
    }
  };
  // The press EDGE opens the bank; the HELD flag keeps it open (fighter.js
  // reads lightP / lightHeld, never a bare `light`).
  const first = blank(); first.lightP = true; first.lightHeld = true;
  step(first, 1);
  const held = blank(); held.lightHeld = true;
  step(held, 29);                 // ~0.5s with the button down
  step(blank(), 45);              // released — the punch
  return { charKey: f.charKey, log };
}, null);
const banks = out.log.some((r) => r.anim === "chargeLight");
console.log(`mech: ${out.charKey}${banks ? "  (banks its jab)" : ""}`);
let last = null;
for (const r of out.log) {
  const k = `${r.anim}|${r.charging}|${r.action}`;
  if (k !== last) { console.log(`  frame ${String(r.f).padStart(2)}  anim=${String(r.anim).padEnd(12)} charging=${String(r.charging).padEnd(6)} action=${r.action}`); last = k; }
}
await b.close();

// The failure this exists to catch: a bank that never becomes a strike.
const keys = [...new Set(out.log.map((r) => r.anim))];
const struck = out.log.some((r) => r.anim === "light" && r.action === "light");
console.log(struck ? "\nok   the strike plays" : "\nFAIL the jab never became a strike");
if (!struck) process.exit(1);
