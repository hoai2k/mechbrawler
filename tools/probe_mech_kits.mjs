#!/usr/bin/env node
// Prove the mech-kit ENGINE work actually fires, in a real running match.
//
// The static checks (check_kits.mjs) prove every kit NAMES something the engine
// has. They cannot tell you whether GLITCH ever reaches six, whether a summon
// ult puts three bodies on the board, or whether a held trigger drains the
// pool — and a feature nobody proved is a feature that does not work.
//
// So this boots the game in headless Chromium, gets a real match running (real
// stage, real platforms, real entity loop), and then drives PAIRS of fighters
// through the mechanics one at a time: build the two fighters, step the same
// simulation main.js steps, and assert on the state afterward. Each scenario
// restores the match's own fighters when it is done.
//
// Needs `playwright` and a Chromium binary — set CHROMIUM_PATH if yours is
// elsewhere. Start the game first (node server.mjs), then:
//     node tools/probe_mech_kits.mjs [baseUrl]
import { chromium } from "playwright";
import { pressStart, pickAnyFighter } from "./smoke_boot.mjs";

const BASE = process.argv[2] || "http://127.0.0.1:5174";

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-proxy-server", "--use-gl=angle", "--use-angle=swiftshader", "--no-sandbox"],
});
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => {
  const t = m.text();
  if (m.type() === "error" && !/Failed to load resource/.test(t)) errors.push(t);
});

await page.goto(`${BASE}/index.html?camera=flat`, { waitUntil: "load" });
await pressStart(page);
await pickAnyFighter(page);
await page.click("#startButton");
await page.waitForSelector(".stage-card", { timeout: 10000 });
await page.locator(".stage-card").nth(0).click();
for (let waited = 0; ; waited += 120) {
  const ready = await page.evaluate(async () =>
    (await import("/src/state.js")).state.phase === "playing" &&
    (await import("/src/state.js")).state.fighters.length > 0);
  if (ready) break;
  if (waited > 90000) throw new Error("match never started");
  await page.waitForTimeout(120);
}

// The harness the scenarios run inside, installed once on the page. `drive`
// builds two fighters, hands them to a body that returns whatever it wants to
// assert on, and puts the match back the way it found it.
await page.evaluate(async () => {
  const { state } = await import("/src/state.js");
  const { makeFighter, updateFighter } = await import("/src/fighter.js");
  const { updateHitboxes, updateProjectiles, stepHitCredit } = await import("/src/combat.js");
  const { blankInput } = await import("/src/input.js");

  window.__probe = {
    state, makeFighter, blankInput,
    /** One simulation step, in main.js's order. `inputs` is per fighter id. */
    step(dt, inputs = {}) {
      for (const f of state.fighters) {
        const input = inputs[f.id] || blankInput();
        f.lastInput = input;
        updateFighter(f, dt, input);
      }
      for (const f of state.fighters) stepHitCredit(f, dt);
      updateHitboxes(dt);
      updateProjectiles(dt);
      for (let i = state.entities.length - 1; i >= 0; i--) {
        const e = state.entities[i];
        if (e.owner && e.owner.hitPause > 0) continue;
        e.update(dt);
        if (e.dead) state.entities.splice(i, 1);
      }
    },
    /** A clean two-fighter board, on the stage's own floor. */
    setup(aKey, bKey, { ax = 500, bx = 640 } = {}) {
      const gy = state.platforms[0]?.y ?? 568;
      const a = makeFighter(1, aKey, ax, 1);
      const b = makeFighter(2, bKey, bx, -1);
      for (const f of [a, b]) {
        f.y = gy; f.grounded = true; f.invuln = 0; f.aiState = null;
      }
      state.fighters.length = 0;
      state.fighters.push(a, b);
      state.hitboxes.length = 0;
      state.projectiles.length = 0;
      state.entities.length = 0;
      return { a, b };
    },
  };
});

const results = [];
async function probe(name, body) {
  const out = await page.evaluate(body).catch((e) => ({ error: String(e) }));
  const ok = !out.error && out.pass;
  results.push({ name, ok, detail: out.error || out.detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}\n      ${out.error || out.detail}`);
}

// --------------------------------------------------------------- 1. statuses

await probe("GLITCH stacks to six and CRASHES the victim", async () => {
  const P = window.__probe;
  const { applyStatus } = await import("/src/combat.js");
  const { a, b } = P.setup("nullbot", "titanus");
  const seen = [];
  for (let i = 0; i < 6; i++) {
    applyStatus("glitch", a, b);
    seen.push(b.statuses.glitch);
  }
  const crashed = b.dizzy > 1.0;
  return {
    pass: seen.slice(0, 5).join(",") === "1,2,3,4,5" && seen[5] === 0 && crashed,
    detail: `stacks ${seen.join(",")} -> dizzy ${b.dizzy.toFixed(2)}s`,
  };
});

await probe("GLITCH is applied by every landed nullbot hit (the passive)", async () => {
  const P = window.__probe;
  const { applyHit } = await import("/src/combat.js");
  const { a, b } = P.setup("nullbot", "titanus");
  applyHit(a, b, { dmg: 4, baseKb: 100, growth: 2, angle: 0.3, label: "probe" }, "melee");
  const one = b.statuses.glitch;
  // …and Stack Overflow cashes them in early rather than waiting for six.
  const { detonateGlitch } = await import("/src/combat.js");
  applyHit(a, b, { dmg: 4, baseKb: 100, growth: 2, angle: 0.3, label: "probe" }, "melee");
  const before = b.damage;
  const burst = detonateGlitch(a, b);
  return {
    pass: one === 1 && b.statuses.glitch === 2 - 2 && burst > 0 && b.damage > before,
    detail: `one hit -> ${one} stack(s); detonate blew 2 for ${burst.toFixed(1)}%`,
  };
});

await probe("SHOCK extends hitstun and shows on the body", async () => {
  const P = window.__probe;
  const { applyHit, applyStatus } = await import("/src/combat.js");
  const hit = { dmg: 6, baseKb: 300, growth: 5, angle: 0.35, label: "probe" };
  const clean = P.setup("tempest", "rhino");
  applyHit(clean.a, clean.b, { ...hit }, "melee");
  const plain = clean.b.hitstun;
  const shocked = P.setup("tempest", "rhino");
  applyStatus("shock", shocked.a, shocked.b);
  const onBody = shocked.b.statuses.shock;
  applyHit(shocked.a, shocked.b, { ...hit }, "melee");
  return {
    pass: onBody > 1 && shocked.b.hitstun > plain + 0.1,
    detail: `hitstun ${plain.toFixed(3)}s -> ${shocked.b.hitstun.toFixed(3)}s, shock ${onBody.toFixed(2)}s on the body`,
  };
});

await probe("FROST slows movement and the fall", async () => {
  const P = window.__probe;
  const { applyStatus } = await import("/src/combat.js");
  const walk = (frosted) => {
    const { a, b } = P.setup("glacier", "viper", { ax: 300, bx: 900 });
    if (frosted) applyStatus("frost", a, b);
    const input = { ...P.blankInput(), right: true, dirX: 1, moveX: 1 };
    const x0 = b.x;
    for (let i = 0; i < 30; i++) P.step(1 / 60, { 2: input });
    return b.x - x0;
  };
  const fall = (frosted) => {
    const { a, b } = P.setup("glacier", "viper", { ax: 300, bx: 900 });
    if (frosted) applyStatus("frost", a, b);
    b.grounded = false;
    b.y -= 900;               // high enough that nothing lands mid-measure
    b.vy = 0;
    for (let i = 0; i < 20; i++) P.step(1 / 60, {});
    return b.vy;
  };
  const plainX = walk(false), coldX = walk(true);
  const plainV = fall(false), coldV = fall(true);
  return {
    pass: coldX < plainX * 0.75 && coldV < plainV * 0.85,
    detail: `half a second of walking: ${plainX.toFixed(0)}px -> ${coldX.toFixed(0)}px; ` +
            `fall speed after a third of a second: ${plainV.toFixed(0)} -> ${coldV.toFixed(0)}px/s`,
  };
});

await probe("VENOM paralyses on application and ticks damage after", async () => {
  const P = window.__probe;
  const { applyStatus } = await import("/src/combat.js");
  const { a, b } = P.setup("viper", "titanus");
  applyStatus("venom", a, b);
  const pinned = b.hitstun;
  const d0 = b.damage;
  for (let i = 0; i < 120; i++) P.step(1 / 60, {});
  return {
    pass: pinned >= 0.5 && b.damage > d0 + 3,
    detail: `pinned ${pinned.toFixed(2)}s, 2s of venom dealt ${(b.damage - d0).toFixed(1)}%`,
  };
});

// -------------------------------------------------------------- 2. the packs

await probe("WILD HUNT puts THREE wolves on the board", async () => {
  const P = window.__probe;
  const { performUltimate } = await import("/src/ultimates.js");
  const { a } = P.setup("fenrir", "titanus", { ax: 400, bx: 800 });
  a.meter = 100;
  performUltimate(a);
  // Read the spread at the moment they land, before three hunters converge on
  // the same target and stack up.
  const wolves = P.state.entities.filter((e) => e.kind === "summon" && !e.dead);
  const spread = new Set(wolves.map((w) => Math.round(w.x / 10))).size;
  for (let i = 0; i < 60; i++) P.step(1 / 60, {});
  const alive = P.state.entities.filter((e) => e.kind === "summon" && !e.dead).length;
  return {
    pass: wolves.length === 3 && spread === 3 && alive === 3,
    detail: `${wolves.length} bodies at x=${wolves.map((w) => Math.round(w.x)).join(", ")}, ` +
            `${alive} still up a second later`,
  };
});

await probe("FLEA CIRCUS puts FOUR of him on the board", async () => {
  const P = window.__probe;
  const { performUltimate } = await import("/src/ultimates.js");
  const { a } = P.setup("jerry", "titanus", { ax: 400, bx: 800 });
  a.meter = 100;
  performUltimate(a);
  for (let i = 0; i < 60; i++) P.step(1 / 60, {});
  const fleas = P.state.entities.filter((e) => e.kind === "summon" && !e.dead);
  return { pass: fleas.length === 4, detail: `${fleas.length} bodies on the board` };
});

await probe("RAPTOR PACK stages three EGGS that hatch one at a time", async () => {
  const P = window.__probe;
  const { performUltimate } = await import("/src/ultimates.js");
  const { a } = P.setup("saurion", "titanus", { ax: 400, bx: 900 });
  a.meter = 100;
  performUltimate(a);
  for (let i = 0; i < 30; i++) P.step(1 / 60, {});
  const eggs = P.state.entities.filter((e) => e.id === "raptorPack:egg" && !e.dead);
  const timeline = [];
  for (let i = 0; i < 360; i++) {
    P.step(1 / 60, {});
    const live = P.state.entities.filter((e) => e.kind === "summon" && e.id === "raptorPack" && !e.dead).length;
    if (!timeline.length || timeline[timeline.length - 1] !== live) timeline.push(live);
  }
  return {
    pass: eggs.length === 3 && timeline.join(",") === "0,1,2,3",
    detail: `${eggs.length} eggs; hatched count over time: ${timeline.join(" -> ")}`,
  };
});

await probe("an egg is BREAKABLE before it opens (the counterplay)", async () => {
  const P = window.__probe;
  const { performUltimate } = await import("/src/ultimates.js");
  const { a, b } = P.setup("saurion", "titanus", { ax: 400, bx: 900 });
  a.meter = 100;
  performUltimate(a);
  for (let i = 0; i < 20; i++) P.step(1 / 60, {});
  const egg = P.state.entities.find((e) => e.id === "raptorPack:egg" && !e.dead);
  let broke = false;
  for (let i = 0; i < 8 && egg; i++) broke = egg.damage(10, b) || broke;
  for (let i = 0; i < 400; i++) P.step(1 / 60, {});
  const hatched = P.state.entities.filter((e) => e.kind === "summon" && e.id === "raptorPack").length;
  return {
    pass: broke && hatched === 2,
    detail: `egg broken: ${broke}; raptors that made it out: ${hatched}/3`,
  };
});

await probe("STAMPEDE is THREE rhinos wide", async () => {
  const P = window.__probe;
  const { performUltimate } = await import("/src/ultimates.js");
  const { a } = P.setup("rhino", "titanus", { ax: 400, bx: 900 });
  a.meter = 100;
  performUltimate(a);
  for (let i = 0; i < 30; i++) P.step(1 / 60, {});
  // The director's own entity drives the real body and has no position of its
  // own; a phantom charger carries its own x.
  const phantoms = P.state.entities.filter((e) => e.hitCd && typeof e.x === "number").length;
  return {
    pass: phantoms === 2,
    detail: `the real body + ${phantoms} phantom chargers = ${phantoms + 1} abreast`,
  };
});

// ------------------------------------------------------------- 3. the charge

await probe("a charged TITANUS light banks, lunges, and hits harder", async () => {
  const P = window.__probe;
  const tap = P.setup("titanus", "rhino", { ax: 500, bx: 585 });
  const press = { ...P.blankInput(), lightP: true, lightHeld: false };
  P.step(1 / 60, { 1: press });
  for (let i = 0; i < 20; i++) P.step(1 / 60, {});
  const tapDmg = tap.b.damage;

  // Started further out on purpose: he WALKS the gap closed while the light
  // banks, which is the half of the contract that cannot be tested standing
  // already inside his own reach.
  const hold = P.setup("titanus", "rhino", { ax: 420, bx: 600 });
  const held = { ...P.blankInput(), lightP: true, lightHeld: true };
  P.step(1 / 60, { 1: held });
  const banked = !!hold.a.charging;
  const x0 = hold.a.x;
  // …and he may WALK while the light winds up.
  const walk = { ...P.blankInput(), lightHeld: true, right: true, dirX: 1, moveX: 0.5 };
  for (let i = 0; i < 40; i++) P.step(1 / 60, { 1: walk });
  const walked = hold.a.x - x0;
  const chargeT = hold.a.charging?.t ?? 0;
  const xRelease = hold.a.x;
  for (let i = 0; i < 24; i++) P.step(1 / 60, {});   // trigger released: the blow
  const travelled = hold.a.x - xRelease;
  return {
    pass: banked && walked > 20 && chargeT > 0.5 && tapDmg > 0 && hold.b.damage > tapDmg && travelled > 8,
    detail: `banked ${chargeT.toFixed(2)}s while walking ${walked.toFixed(0)}px, ` +
            `lunged ${travelled.toFixed(0)}px through the blow, ` +
            `${tapDmg.toFixed(1)}% tapped -> ${hold.b.damage.toFixed(1)}% charged`,
  };
});

await probe("nobody else charges a light", async () => {
  const P = window.__probe;
  const { a } = P.setup("viper", "rhino");
  P.step(1 / 60, { 1: { ...P.blankInput(), lightP: true, lightHeld: true } });
  return {
    pass: !a.charging && a.action?.kind === "attack",
    detail: `viper's light press produced ${a.action?.kind || "nothing"}, charging=${!!a.charging}`,
  };
});

// ------------------------------------------------------------ 4. the channel

await probe("a HELD gatling ticks and drains the pool; releasing stops it", async () => {
  const P = window.__probe;
  const { a } = P.setup("vulcan", "titanus", { ax: 400, bx: 900 });
  const hold = { ...P.blankInput(), rangedP: true, rangedHeld: true };
  P.step(1 / 60, { 1: hold });
  const e0 = a.energy;
  let shots = 0;
  for (let i = 0; i < 60; i++) {
    P.step(1 / 60, { 1: { ...hold, rangedP: false } });
    shots = Math.max(shots, P.state.projectiles.length);
  }
  const ticks = a.channel?.ticks ?? 0;
  const drained = e0 - a.energy;
  // Let go: the stream stops and the weapon goes on cooldown.
  for (let i = 0; i < 6; i++) P.step(1 / 60, {});
  const stopped = !a.channel && a.cooldowns.ranged > 0;
  return {
    pass: ticks >= 6 && drained > 12 && stopped,
    detail: `${ticks} ticks in a second, ${drained.toFixed(0)} energy spent (regen included), ` +
            `${shots} tracers live at once; released -> channel ${a.channel ? "still up" : "closed"}, ` +
            `cooldown ${a.cooldowns.ranged.toFixed(2)}s`,
  };
});

await probe("a channel refuses when the pool runs dry", async () => {
  const P = window.__probe;
  const { a } = P.setup("inferno", "titanus", { ax: 400, bx: 900 });
  a.energy = 6;
  const hold = { ...P.blankInput(), rangedP: true, rangedHeld: true };
  P.step(1 / 60, { 1: hold });
  for (let i = 0; i < 40; i++) P.step(1 / 60, { 1: { ...hold, rangedP: false } });
  return {
    pass: !a.channel && a.energy < 12,
    detail: `flamer cut out with ${a.energy.toFixed(1)} energy left, channel closed: ${!a.channel}`,
  };
});

// ------------------------------------------------------------ 5. the passives

await probe("PLATED: a jab cannot flinch a walking rhino, a smash still can", async () => {
  const P = window.__probe;
  const { applyHit } = await import("/src/combat.js");
  const { a, b } = P.setup("viper", "rhino", { ax: 500, bx: 650 });
  const walk = { ...P.blankInput(), left: true, dirX: -1, moveX: -0.5 };
  for (let i = 0; i < 20; i++) P.step(1 / 60, { 2: walk });
  const walking = b.walking;
  applyHit(a, b, { dmg: 5, baseKb: 300, growth: 5, angle: 0.35, label: "jab" }, "melee");
  const jabStun = b.hitstun;
  b.invuln = 0;   // the plated hit still grants the usual moment of grace
  applyHit(a, b, { dmg: 16, baseKb: 500, growth: 8, angle: 0.4, label: "smash", heavy: true }, "melee");
  return {
    pass: walking && jabStun === 0 && b.hitstun > 0,
    detail: `walking=${walking}: jab left ${jabStun.toFixed(2)}s of hitstun, the heavy left ${b.hitstun.toFixed(2)}s`,
  };
});

await probe("COLD SHOULDER: a fist on glacier's shield leaves you frosted", async () => {
  const P = window.__probe;
  const { applyHit } = await import("/src/combat.js");
  const { a, b } = P.setup("viper", "glacier", { ax: 500, bx: 640 });
  b.shielding = true;
  b.shieldRaisedAt = -10;
  applyHit(a, b, { dmg: 6, baseKb: 300, growth: 5, angle: 0.35, label: "poke" }, "melee");
  return {
    pass: a.statuses.frost > 0,
    detail: `the attacker walked away with ${a.statuses.frost.toFixed(2)}s of FROST`,
  };
});

await probe("PREDATOR'S BREAK: saurion's pounce shatters a raised guard", async () => {
  const P = window.__probe;
  const { applyHit } = await import("/src/combat.js");
  const { a, b } = P.setup("saurion", "titanus", { ax: 500, bx: 640 });
  b.shielding = true;
  b.shieldRaisedAt = -10;
  const before = b.shield;
  applyHit(a, b, { dmg: 12.5, baseKb: 470, growth: 7.4, angle: 0.34, shieldMul: 4, guardBreak: 0.6, label: "Sickle Pounce" }, "melee");
  const after = b.shield;
  // …and prey already off the ground takes more.
  const air = P.setup("saurion", "titanus");
  air.b.grounded = false;
  const d0 = air.b.damage;
  applyHit(air.a, air.b, { dmg: 10, baseKb: 300, growth: 5, angle: 0.4, label: "probe" }, "melee");
  const airDmg = air.b.damage - d0;
  const gnd = P.setup("saurion", "titanus");
  const g0 = gnd.b.damage;
  applyHit(gnd.a, gnd.b, { dmg: 10, baseKb: 300, growth: 5, angle: 0.4, label: "probe" }, "melee");
  const gndDmg = gnd.b.damage - g0;
  return {
    pass: before - after > 60 && airDmg > gndDmg,
    detail: `one pounce took ${(before - after).toFixed(0)} off a full guard; ` +
            `launched foe took ${airDmg.toFixed(1)}% vs ${gndDmg.toFixed(1)}% grounded`,
  };
});

await probe("800 METRES: the sniper round grows with distance flown", async () => {
  const P = window.__probe;
  const { performRanged } = await import("/src/specials.js");
  const shoot = (gap) => {
    const { a, b } = P.setup("wraith", "titanus", { ax: 200, bx: 200 + gap });
    b.damage = 0;
    performRanged(a);
    for (let i = 0; i < 120 && b.damage === 0; i++) P.step(1 / 60, {});
    return b.damage;
  };
  // The round only lives 0.6s at 940 px/s, so "across the stage" for this gun
  // is about 500 px — measure inside the flight it actually has.
  const near = shoot(120);
  const far = shoot(470);
  return {
    pass: near > 0 && far > near * 1.15,
    detail: `point blank ${near.toFixed(1)}% vs across the stage ${far.toFixed(1)}%`,
  };
});

await probe("ASSASSIN'S READ: viper hits harder from behind", async () => {
  const P = window.__probe;
  const { applyHit } = await import("/src/combat.js");
  const hit = { dmg: 10, baseKb: 200, growth: 3, angle: 0.3, label: "probe" };
  const face = P.setup("viper", "titanus", { ax: 500, bx: 600 });
  face.b.facing = -1;                       // looking at her
  const f0 = face.b.damage;
  applyHit(face.a, face.b, { ...hit }, "melee");
  const front = face.b.damage - f0;
  const back = P.setup("viper", "titanus", { ax: 500, bx: 600 });
  back.b.facing = 1;                        // looking away
  const b0 = back.b.damage;
  applyHit(back.a, back.b, { ...hit }, "melee");
  const behind = back.b.damage - b0;
  return {
    pass: behind > front * 1.1,
    detail: `${front.toFixed(1)}% face on vs ${behind.toFixed(1)}% from behind`,
  };
});

await probe("GROUNDED ROD: tempest's meter fills faster on a shocked foe", async () => {
  const P = window.__probe;
  const { applyHit, applyStatus } = await import("/src/combat.js");
  const hit = { dmg: 10, baseKb: 200, growth: 3, angle: 0.3, label: "probe" };
  const dry = P.setup("tempest", "titanus");
  dry.a.meter = 0;
  applyHit(dry.a, dry.b, { ...hit }, "melee");
  const plain = dry.a.meter;
  const wet = P.setup("tempest", "titanus");
  wet.a.meter = 0;
  applyStatus("shock", wet.a, wet.b);
  applyHit(wet.a, wet.b, { ...hit }, "melee");
  return {
    pass: wet.a.meter > plain * 1.2,
    detail: `${plain.toFixed(2)} meter -> ${wet.a.meter.toFixed(2)} against a shocked body`,
  };
});

await probe("PREDATOR'S RHYTHM: a landed dash attack refunds the chase", async () => {
  const P = window.__probe;
  const { applyHit } = await import("/src/combat.js");
  const { a, b } = P.setup("fenrir", "titanus", { ax: 500, bx: 600 });
  a.dashT = 0;
  a.energy = 40;
  applyHit(a, b, { dmg: 8, baseKb: 300, growth: 5, angle: 0.35, dashAttack: true, label: "Dash" }, "melee");
  return {
    pass: a.dashT > 0 && a.energy > 45,
    detail: `dash refunded to ${a.dashT.toFixed(2)}s, energy 40 -> ${a.energy.toFixed(0)}`,
  };
});

await probe("TOP-HEAVY: a real launch rolls cranky onto his back", async () => {
  const P = window.__probe;
  const { applyHit } = await import("/src/combat.js");
  const { a, b } = P.setup("titanus", "cranky", { ax: 500, bx: 620 });
  b.damage = 90;
  applyHit(a, b, { dmg: 18, baseKb: 700, growth: 9, angle: 0.4, heavy: true, label: "Pound" }, "melee");
  return {
    pass: b.prone > 1.2,
    detail: `knocked flat for ${b.prone.toFixed(2)}s (the roster's ordinary knockdown is 1.1s)`,
  };
});

await probe("FOUR COLUMNS: tritone cannot be dragged by gunk", async () => {
  const P = window.__probe;
  const { applyStatus } = await import("/src/combat.js");
  const { a, b } = P.setup("frogger", "tritone");
  applyStatus("drench", a, b);
  return { pass: !b.statuses.drench, detail: `drench on tritone: ${b.statuses.drench}` };
});

await probe("SLOW BURN: inferno's fire lasts longer than anyone else's", async () => {
  const P = window.__probe;
  const { applyStatus } = await import("/src/combat.js");
  const hot = P.setup("inferno", "titanus");
  applyStatus("burn", hot.a, hot.b);
  const mine = hot.b.statuses.burn.t;
  const cold = P.setup("vulcan", "titanus");
  applyStatus("burn", cold.a, cold.b);
  return {
    pass: mine > cold.b.statuses.burn.t * 1.2,
    detail: `${mine.toFixed(2)}s vs the roster's ${cold.b.statuses.burn.t.toFixed(2)}s`,
  };
});

await probe("COLONY: a jerry mine banks more than a jerry fist", async () => {
  const P = window.__probe;
  const { applyHit } = await import("/src/combat.js");
  const hit = { dmg: 10, baseKb: 200, growth: 3, angle: 0.3, label: "probe" };
  const fist = P.setup("jerry", "titanus");
  fist.a.meter = 0; fist.a.energy = 50;
  applyHit(fist.a, fist.b, { ...hit }, "melee");
  const punch = fist.a.meter;
  const mine = P.setup("jerry", "titanus");
  mine.a.meter = 0; mine.a.energy = 50;
  applyHit(mine.a, mine.b, { ...hit }, "projectile");
  return {
    pass: mine.a.meter > punch * 1.2 && mine.a.energy > 50,
    detail: `fist ${punch.toFixed(2)} meter vs mine ${mine.a.meter.toFixed(2)} + ${(mine.a.energy - 50).toFixed(0)} energy`,
  };
});

await probe("SHELL UP reflects a shell instead of eating it", async () => {
  const P = window.__probe;
  const { performSpecial } = await import("/src/specials.js");
  const { spawnProjectile } = await import("/src/combat.js");
  const { a, b } = P.setup("vulcan", "cranky", { ax: 400, bx: 700 });
  performSpecial(b, "down");
  const braced = b.reflect?.t > 0;
  spawnProjectile(a, { speed: 500, r: 20, dur: 2, dmg: 8, base: 200, growth: 4, angle: 0.3, label: "probe" });
  for (let i = 0; i < 30; i++) P.step(1 / 60, {});
  const shell = P.state.projectiles[0];
  return {
    pass: braced && !!shell && shell.owner === b && shell.vx < 0,
    detail: `braced ${braced}; the shell now belongs to ${shell ? (shell.owner === b ? "cranky" : "vulcan") : "nobody"} ` +
            `and is heading ${shell ? (shell.vx < 0 ? "back" : "on") : "nowhere"}`,
  };
});

// -------------------------------------------------------------------- report

// Put the match back on its feet before anyone looks at it again.
await page.evaluate(() => window.__probe.setup("titanus", "rhino"));
await page.waitForTimeout(300);

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} mechanics proved`);
if (errors.length) {
  console.error(`\npage errors:\n  ${errors.slice(0, 8).join("\n  ")}`);
}
if (failed.length || errors.length) process.exit(1);
