// Regression tests for the sprite workbench's two independent questions about
// a pose, which have been confused before:
//
//   the yellow dot   = changed SINCE THE PAGE LOADED  (drives Export, the
//                      change count, and Reset character)
//   the view filter  = already dealt with BEFORE the page loaded
//
// The bug this exists to prevent: marking a pose "needs replacement" was read
// as a saved edit, so the pose dropped out of the "no saved edits" work list
// the instant it was flagged — and because Export only looked at the frames the
// current view happened to show, it then reported "no changes yet" and silently
// dropped the flag.
//
// Needs `playwright` (npm i playwright) and a Chromium binary — set
// CHROMIUM_PATH if yours is elsewhere. Start the game first (node server.mjs),
// then: node tools/smoke_workbench.mjs [baseUrl]
import { chromium } from "playwright";

const BASE = process.argv[2] || "http://127.0.0.1:5174";
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-proxy-server"],
});
const page = await browser.newPage({ acceptDownloads: true });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
page.on("console", (m) => {
  if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(m.text().slice(0, 200));
});

let fails = 0;
const check = (ok, label, extra = "") => {
  if (!ok) fails++;
  console.log(`${ok ? "OK  " : "FAIL"} ${label}${extra ? "  " + extra : ""}`);
};
async function until(fn, arg, timeout = 60000) {
  const deadline = Date.now() + timeout;
  for (;;) {
    if (await page.evaluate(fn, arg)) return true;
    if (Date.now() > deadline) return false;
    await page.waitForTimeout(100);
  }
}

// Which character and which view, chosen from the data rather than written
// down once. This used to be a hard-coded `maki` on the "no saved edits" view,
// and it went red the day her last two poses were placed. The roster has since
// been placed ENTIRELY — every pose the game draws now carries saved edits — so
// "find an untuned pose" is a precondition the project has outgrown, and a test
// that fails because the work it stands on got finished will keep failing.
//
// What is actually under test is that flagging a pose keeps it in the list,
// marks it, and exports. That holds in any view. So: prefer the unedited view
// while anyone is still outstanding, because that is where the original bug
// lived, and fall back to the full list once nobody is.
await page.goto(`${BASE}/workbench/`, { waitUntil: "domcontentloaded" });
await until(() => /assets loaded/.test(document.getElementById("loadState").textContent), null, 120000);
const PICK = await page.evaluate(async () => {
  const { spriteManifest } = await import("/src/assets.js");
  const { statesUsingFrame } = await import("/src/sprites.js");
  // Both conditions the view applies: the pose has to be one the game DRAWS,
  // and untouched. A standby fallback nothing reaches is untouched forever and
  // is filtered out of every "used" view, so counting it would pick a
  // character whose work list is empty.
  const drawn = (c, k) => statesUsingFrame(c, k).length > 0;
  // The same rule the "No saved edits (to do)" view applies (rememberSaved in
  // workbench.js): a pose leaves the to-do list when somebody has DECIDED about
  // it, and flagging it for a redraw is a decision. Testing a looser rule here
  // picks a character whose list the workbench then renders empty — which is
  // what happened once every round-15 pose was either placed or flagged.
  const untouched = (m) => !Object.keys(m.edited || {}).length && !m.surfacedReviewed
    && !m.needsReplacement && !m.wantsImprovement;
  let anyUsed = null;
  for (const [char, frames] of Object.entries(spriteManifest.characters)) {
    const used = Object.entries(frames).filter(([k]) => drawn(char, k));
    if (used.length >= 2 && !anyUsed) anyUsed = { char, view: "all" };
    if (used.filter(([, m]) => untouched(m)).length >= 2) return { char, view: "unedited" };
  }
  return anyUsed;
});
check(!!PICK, "found a character to stand this test on", PICK ? PICK.char : "none");

// Staged fighters are editable here. They are off the select screen precisely
// because their art is unfinished, which makes them the set this tool exists
// for — a delivery has to be approvable before the fighter ships, not after.
const staged = await page.evaluate(async () => {
  const { STAGED_CHARACTER_KEYS } = await import("/src/characters.js");
  const opts = [...document.querySelectorAll("#charSel option")].map((o) => o.value);
  return { keys: STAGED_CHARACTER_KEYS, missing: STAGED_CHARACTER_KEYS.filter((k) => !opts.includes(k)) };
});
check(!staged.keys.length || !staged.missing.length,
  "every staged fighter is in the character dropdown",
  staged.keys.length ? `${staged.keys.join(", ")}${staged.missing.length ? " — missing " + staged.missing.join(", ") : ""}`
                     : "none staged");

await page.goto(`${BASE}/workbench/?char=${PICK.char}`, { waitUntil: "domcontentloaded" });
await until((c) => document.querySelector("#charSel")?.value === c, PICK.char);
await until(() => /assets loaded/.test(document.getElementById("loadState").textContent), null, 120000);

await page.selectOption("#viewSel", PICK.view);
await page.waitForTimeout(250);
// Only poses the game draws: the "all" fallback includes retired grid cells,
// and a cell nothing animates behaves differently from a live pose.
const before = await page.evaluate(async (char) => {
  const { statesUsingFrame } = await import("/src/sprites.js");
  return [...document.querySelectorAll("#poseList button")]
    .map((b) => b.textContent)
    .filter((t) => statesUsingFrame(char, (t.match(/[a-z0-9_]+$/) || [t])[0]).length > 0);
}, PICK.char);
check(before.length > 1,
  `the work list has poses to work on (${PICK.char}, "${PICK.view}" view)`,
  `${before.length} shown`);
const target = before[before.length - 1];
await page.evaluate((t) => [...document.querySelectorAll("#poseList button")]
  .find((b) => b.textContent === t).click(), target);
await page.waitForTimeout(200);

// Flag it as needing new art, with a reason.
await page.check("#replaceBox");
await page.waitForTimeout(150);
const kinds = await page.evaluate(() =>
  [...document.querySelectorAll("#replaceKind option")].map((o) => o.value).filter(Boolean));
if (kinds.includes("pose")) await page.selectOption("#replaceKind", "pose");
await page.waitForTimeout(250);

const after = await page.evaluate((t) => {
  const btns = [...document.querySelectorAll("#poseList button")];
  const el = btns.find((b) => b.textContent === t);
  return {
    present: !!el,
    dirty: !!el?.classList.contains("dirty"),
    flagged: !!el?.classList.contains("flagged"),
    warned: !!el?.querySelector(".pose-warn"),
    name: el?.textContent,
    count: btns.length,
    dirtyCount: document.getElementById("dirtyCount").textContent,
  };
}, target);

check(after.present, `flagging "${target}" leaves it in the work list`,
  `list went ${before.length} -> ${after.count}`);
check(after.dirty, "the yellow dot appears on it");
check(after.flagged, "it is also marked as flagged for redraw");
check(after.warned, "and carries the caution mark saying new art is on order");
check(after.name === target,
  "which is a mark, not a rename — the cell still answers to its pose name",
  JSON.stringify(after.name));
check(!/none/i.test(after.dirtyCount), "the change count sees it", JSON.stringify(after.dirtyCount));

// Export must emit it — the original symptom was "no changes yet".
const [download] = await Promise.all([
  page.waitForEvent("download", { timeout: 15000 }).catch(() => null),
  page.click("#exportBtn"),
]);
const text = await page.inputValue("#exportOut");
check(!/no changes yet/.test(text), "Export does not claim there are no changes");
check(!!download, "Export downloads a file", download ? download.suggestedFilename() : "no download");
let payload = null;
try { payload = JSON.parse(text); } catch { /* reported below */ }
check(payload?.adjustments?.[target]?.needsReplacement !== undefined,
  "the exported JSON carries the replacement flag",
  JSON.stringify(payload?.adjustments?.[target] ?? text.slice(0, 60)));

// An edit hidden by the current filter must still export. Switch to a view the
// flagged pose is absent from and confirm it survives.
await page.selectOption("#viewSel", "edited");
await page.waitForTimeout(250);
const hidden = await page.evaluate((t) =>
  ![...document.querySelectorAll("#poseList button")].some((b) => b.textContent === t), target);
await page.click("#exportBtn");
await page.waitForTimeout(300);
const text2 = await page.inputValue("#exportOut");
let payload2 = null;
try { payload2 = JSON.parse(text2); } catch { /* reported below */ }
check(payload2?.adjustments?.[target]?.needsReplacement !== undefined,
  "an edit the current view hides still exports",
  hidden ? "(pose was hidden by the filter)" : "(pose was still visible — weak test)");

// Reset character must clear it too, from any view.
await page.click("#resetChar");
await page.waitForTimeout(300);
const reset = await page.evaluate(() => document.getElementById("dirtyCount").textContent);
check(/none/i.test(reset), "Reset character clears edits the view was hiding", JSON.stringify(reset));

// ---- the placement controls: a slider paired with a typeable number, no nudges
// PICK.view, not a hard-coded "unedited": the arrow-key walk below needs more
// than one pose in the list to have anywhere to walk to, and on a character
// whose set is fully placed that view holds at most one.
await page.selectOption("#viewSel", PICK.view);
await page.waitForTimeout(250);
await page.evaluate(() => document.querySelectorAll("#poseList button")[0].click());
await page.waitForTimeout(200);
check(await page.evaluate(() => !document.querySelector("[data-scale],[data-off],[data-ground]")),
  "the +/- nudge buttons are gone");
check(await page.evaluate(() => {
  const g = [...document.querySelectorAll(".panel .group")]
    .map((el) => el.querySelector("label")?.textContent.trim() ?? "");
  const at = (re) => g.findIndex((t) => re.test(t));
  return at(/^Size/) < at(/^Anchors/) && at(/^Ground/) < at(/^Anchors/) && at(/^Horizontal/) < at(/^Anchors/);
}), "Size / Horizontal / Ground sit above Anchors");
await page.evaluate(() => {
  const n = document.getElementById("scaleNum");
  n.value = "80"; n.dispatchEvent(new Event("change", { bubbles: true }));
});
await page.waitForTimeout(200);
check(Math.abs(await page.evaluate(() => parseFloat(document.getElementById("scaleRange").value)) - 0.8) < 0.01,
  "typing into the number box moves the slider");
await page.evaluate(() => {
  const n = document.getElementById("scaleNum");
  n.value = "not a number"; n.dispatchEvent(new Event("change", { bubbles: true }));
});
await page.waitForTimeout(200);
check(Math.abs(await page.evaluate(() => parseFloat(document.getElementById("scaleRange").value)) - 0.8) < 0.01,
  "junk in the number box is rejected rather than applied");

// ---- arrows walk the pose GRID, and no longer nudge placement
const gridStart = await page.evaluate(() => {
  document.querySelectorAll("#poseList button")[0].click();
  return document.querySelector("#poseList button.sel")?.textContent;
});
await page.waitForTimeout(200);
const offBefore = await page.evaluate(() => parseFloat(document.getElementById("offsetRange").value));
const walk = [];
for (const key of ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"]) {
  await page.evaluate(() => document.body.focus());
  await page.keyboard.press(key);
  await page.waitForTimeout(160);
  walk.push(await page.evaluate(() => document.querySelector("#poseList button.sel")?.textContent));
}
check(new Set(walk).size > 1 && walk[walk.length - 1] === gridStart,
  "arrows walk the pose grid and right/down/left/up returns", `${gridStart} -> ${walk.join(" -> ")}`);
check(await page.evaluate(() => parseFloat(document.getElementById("offsetRange").value)) === offBefore,
  "arrows no longer move the sprite");

// ---- the improvement request: a fix to the FILE, filed apart from a redraw
await page.check("#improveBox");
await page.waitForTimeout(150);
await page.selectOption("#improveKind", "crop");
await page.waitForTimeout(250);
check(await page.evaluate(() => {
  const el = document.querySelector("#poseList button.sel");
  return !!el?.classList.contains("wanted") && !!el?.classList.contains("dirty");
}), "an improvement request marks the pose and raises the dot");
await page.click("#exportBtn");
await page.waitForTimeout(300);
let improved = null;
try { improved = JSON.parse(await page.inputValue("#exportOut")); } catch { /* reported below */ }
check(Object.values(improved?.adjustments ?? {}).some((v) => v.wantsImprovement === "crop"),
  "it exports as wantsImprovement, separately from needsReplacement");

// ---- a review flag belongs to the DRAWING, not to the pose
//
// A pose with variants can be pointed at a different drawing. "This drawing is
// malformed" is a verdict on one file, so it has to stay banked against that
// file: if it followed the pose instead, switching would hand the flag to art
// nobody passed it on, and the drawing that earned it would come back clean.
//
// The pose is chosen from the manifest, not written down. It used to be
// `hanami/dodge_air`, picked because Hanami is the only character with a
// second art set — and it went red the day his whole set was redrawn, because
// a pose with a replacement waiting has its own drawing selected and the
// option this asserted against was no longer the current one. What the test
// needs is any pose with two settled drawings.
const VAR = await page.evaluate(async () => {
  const { spriteManifest } = await import("/src/assets.js");
  for (const [char, poses] of Object.entries(spriteManifest.variants || {})) {
    for (const [frame, entry] of Object.entries(poses)) {
      const meta = spriteManifest.characters?.[char]?.[frame];
      if (!meta || meta.awaitingApproval) continue;         // mid-delivery
      const others = (entry.options || []).filter((o) => o.file !== meta.file);
      if (others.length) return { char, frame, own: meta.file, other: others[0].file };
    }
  }
  return null;
});
check(!!VAR, "found a pose with two settled drawings to test the flag against",
  VAR ? `${VAR.char}/${VAR.frame}` : "none — every pose with variants is mid-delivery");

await page.goto(`${BASE}/workbench/?char=${VAR.char}&frame=${VAR.frame}`, { waitUntil: "domcontentloaded" });
await until(() => /assets loaded/.test(document.getElementById("loadState").textContent), null, 120000);
await page.waitForTimeout(400);

// The chevron lives in the POSE LIST, so the pose has to be in the list — and
// the default view is "no saved edits", which drops a pose the moment one is
// applied to it. Widen the view rather than depending on Hanami's dodge_air
// never having been tuned.
await page.selectOption("#viewSel", "all");
await page.waitForTimeout(300);

await page.check("#replaceBox");
await page.waitForTimeout(150);
await page.selectOption("#replaceKind", "quality");
await page.waitForTimeout(250);

await page.locator(`.pose-cell [data-frame="${VAR.frame}"], .pose-cell button.sel ~ .pose-variant`)
  .first().click({ force: true })
  .catch(async () => { await page.locator(".pose-variant").first().click({ force: true }); });
await page.waitForTimeout(250);
const alt = VAR.other;
const offered = await page.locator(".variant-menu button", { hasText: alt }).count();
check(offered > 0, "the pose offers its other drawing", `${offered} match(es)`);
await page.locator(".variant-menu button", { hasText: alt }).first().click();
await page.waitForTimeout(1200);

await page.click("#exportBtn");
await page.waitForTimeout(300);
let swapped = null;
try { swapped = JSON.parse(await page.inputValue("#exportOut")); } catch { /* reported below */ }
const forHanami = (Array.isArray(swapped) ? swapped : [swapped])
  .find((p) => p?.character === VAR.char);
const banked = Object.fromEntries(
  (forHanami?.variantPlacement?.[VAR.frame] ?? []).map((o) => [o.file, o.needsReplacement ?? false]));
check(forHanami?.variantChoice?.[VAR.frame] === alt,
  "the pose switched to the other drawing", JSON.stringify(forHanami?.variantChoice));
check(banked[VAR.own] === "quality",
  "the flag stays with the drawing it was passed on", JSON.stringify(banked));
// `false` rather than absent: the export always states a drawing's tag, so
// clearing one travels as clearly as setting one.
check(!banked[alt], "the drawing switched to does not inherit it", JSON.stringify(banked[alt]));
// Either shape means "no request on the pose": omitted when the pose had no
// committed flag to begin with, and an explicit `false` when it had one and the
// drawing switched to does not carry it — the export states a clearing rather
// than leaving the old flag standing. Asserting `undefined` would be asserting
// that Hanami's dodge_air happens to start unflagged, which is a fact about the
// manifest on the day the test was written, not about the behaviour.
check(!forHanami?.adjustments?.[VAR.frame]?.needsReplacement,
  "and it is not left behind on the pose",
  JSON.stringify(forHanami?.adjustments?.[VAR.frame]?.needsReplacement));

// ---- the Mirror box tells the truth about the drawing that is on screen
//
// `nativeLeft` marks frames whose art was DRAWN facing left. It was measured
// against the art the pose shipped with, so it must not answer for an alternate
// selected later — that art came through an intake that mirrors everything to
// face right. When it did, switching to an alternate left the canvas mirrored
// while the Mirror box, reading the manifest entry where the switch had just
// cleared the value, showed unmirrored: a state no setting of the box could
// reproduce. Ticking it wrote a value the renderer was already using; only
// UN-ticking moved the sprite, which is the wrong way round.
const shot = async () => (await page.locator("#stage").screenshot()).toString("base64");
// yuta/r4c1: in `nativeLeft`, and has an alternate to switch to. Hanami's
// r4c0 used to serve here and no longer exists as a pose of its own — the
// sheet cells that drove an action are now offered as alternates ON that
// action, which is the whole point of the case below.
await page.goto(`${BASE}/workbench/?char=yuta&frame=r4c1`, { waitUntil: "domcontentloaded" });
await until(() => /assets loaded/.test(document.getElementById("loadState").textContent), null, 120000);
await page.selectOption("#viewSel", "all");
await page.waitForTimeout(600);
const sel = page.locator(".pose-cell").filter({ has: page.locator("button.sel") }).first();
await sel.locator(".pose-variant").click({ force: true });
await page.waitForTimeout(250);
await page.locator(".variant-menu button", { hasText: "yuta/alt/r4c1.png" }).first().click();
await page.waitForTimeout(1500);

const afterSwitch = await shot();
check(!(await page.isChecked("#mirrorBox")),
  "an alternate does not inherit the delivered drawing's nativeLeft guess");
await page.check("#mirrorBox");
await page.waitForTimeout(500);
check((await shot()) !== afterSwitch, "ticking Mirror moves the sprite on the first click");
await page.uncheck("#mirrorBox");
await page.waitForTimeout(500);
check((await shot()) === afterSwitch, "un-ticking it returns exactly where it started");

// ---- a sprite the game does not draw appears in one view only
//
// "All sprites" is the view that shows everything; every other view is a
// question about the working set. `edited` never asked, so a retired sheet cell
// still carrying the tuning it was given while it was in use showed up as work
// that had been done — the poses most likely to appear being exactly the ones a
// re-point had just taken out of the game.
await page.goto(`${BASE}/workbench/?char=geto`, { waitUntil: "domcontentloaded" });
await until(() => /assets loaded/.test(document.getElementById("loadState").textContent), null, 120000);
const cells = async () => page.evaluate(() =>
  [...document.querySelectorAll("#poseList button:not(.pose-variant)")]
    .filter((b) => /r\dc\d/.test(b.textContent)).length);
for (const view of ["unedited", "edited", "used"]) {
  await page.selectOption("#viewSel", view);
  await page.waitForTimeout(400);
  check((await cells()) === 0, `"${view}" hides the sheet cells nothing draws`);
}
await page.selectOption("#viewSel", "all");
await page.waitForTimeout(400);
check((await cells()) > 0, `"All sprites" still shows them`, `${await cells()} cell(s)`);

// ---- the centre of mass is offered only where something turns about it
//
// Most poses lean, sway, swing or tumble, and all of that turns about the com.
// The specials, the ultimate and the victory pose do not — they run on action
// kinds fighterTransform never tests — so placing an anchor on them is work
// with no effect, and the row is hidden with the reason in its place.
await page.goto(`${BASE}/workbench/?char=yuji&frame=special_side`, { waitUntil: "domcontentloaded" });
await until(() => /assets loaded/.test(document.getElementById("loadState").textContent), null, 120000);
await page.waitForTimeout(400);

const anchors = () => page.evaluate(() => ({
  rows: document.querySelectorAll("#anchorRows .anchor-row").length,
  note: document.getElementById("anchorNote").textContent,
  offerHidden: document.getElementById("anchorForceRow").hidden,
}));
let anc = await anchors();
check(anc.rows === 0, "a pose the game never turns hides its centre of mass", JSON.stringify(anc));
check(!!anc.note && !anc.offerHidden, "and says why, with the override beside it", JSON.stringify(anc.note));

await page.check("#anchorForce");
await page.waitForTimeout(250);
anc = await anchors();
check(anc.rows === 1, "'Place it anyway' brings it back", JSON.stringify(anc));
await page.uncheck("#anchorForce");
await page.waitForTimeout(250);

await page.goto(`${BASE}/workbench/?char=yuji&frame=idle_a`, { waitUntil: "domcontentloaded" });
await until(() => /assets loaded/.test(document.getElementById("loadState").textContent), null, 120000);
await page.waitForTimeout(400);
anc = await anchors();
check(anc.rows >= 1 && anc.offerHidden, "a pose that does turn shows it without asking", JSON.stringify(anc));

// ---- rotation: a baked tilt about that same centre of mass
const canvasHash = () => page.evaluate(() => {
  const c = document.querySelector("canvas");
  const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
  let h = 0;
  for (let i = 0; i < d.length; i += 997) h = (h * 31 + d[i]) >>> 0;
  return h;
});
await page.goto(`${BASE}/workbench/?char=yuji&frame=special_side`, { waitUntil: "domcontentloaded" });
await until(() => /assets loaded/.test(document.getElementById("loadState").textContent), null, 120000);
await page.waitForTimeout(500);
const square = await canvasHash();
await page.evaluate(() => {
  const n = document.getElementById("rotationNum");
  n.value = "15"; n.dispatchEvent(new Event("change", { bubbles: true }));
});
await page.waitForTimeout(500);
check(await canvasHash() !== square, "a rotation redraws the pose tilted");
check(/15/.test(await page.evaluate(() => document.getElementById("rotationVal").textContent)),
  "the readout states the angle");
// The tilt turns about the com, so the anchor stops being decorative the
// moment one is set — even on a pose nothing else turns.
check((await anchors()).rows === 1, "setting a rotation un-hides the centre of mass");

await page.click("#exportBtn");
await page.waitForTimeout(300);
let tilted = null;
try { tilted = JSON.parse(await page.inputValue("#exportOut")); } catch { /* reported below */ }
const forYuji = (Array.isArray(tilted) ? tilted : [tilted]).find((p) => p?.character === "yuji");
check(forYuji?.adjustments?.special_side?.rotationDeg === 15,
  "and it exports as rotationDeg in degrees",
  JSON.stringify(forYuji?.adjustments?.special_side));

// ---- the cross-character updated list
//
// The dropdown's fourth kind of entry: not a character but a work list of poses
// intake wrote new art over on top of previous work. What it contains depends on
// what the last round overwrote — nothing to assert there — so what is checked
// is that it is offered, that it stands on its own (the per-character view
// filter is a different question and is locked while it is open), and that it
// says so plainly when there is nothing outstanding.
await page.goto(`${BASE}/workbench/?char=maki`, { waitUntil: "domcontentloaded" });
await until(() => /assets loaded/.test(document.getElementById("loadState").textContent), null, 120000);
await page.waitForTimeout(300);
check(await page.evaluate(() =>
  [...document.querySelectorAll("#charSel option")].some((o) => o.value === "__recent"
    && /Recently Updated/.test(o.textContent))),
  "the character list offers the recently-updated poses");

await page.selectOption("#charSel", "__recent");
await page.waitForTimeout(600);
const updated = await page.evaluate(() => ({
  locked: document.getElementById("viewSel").disabled,
  count: document.getElementById("poseCount").textContent,
  poses: document.querySelectorAll("#poseList button").length,
  note: document.querySelector("#poseList .note")?.textContent ?? "",
  list: new URL(location.href).searchParams.get("list"),
  frame: document.getElementById("frameTag").textContent,
}));
check(updated.locked, "it locks the per-character view filter, which does not apply");
// Matched against the empty-state note's opening words rather than a word from
// the middle of it: the list being genuinely empty is now the normal end state
// of a round, so this branch runs often and must not depend on the wording of a
// sentence that gets edited.
check(updated.poses > 0 || /Nothing is waiting/.test(updated.note),
  "it lists the updated poses, or says there are none", JSON.stringify(updated.count));
check(updated.list === "updated", "the address bar remembers which list you are in");
check(/\w+\/\w+/.test(updated.frame), "a pose is on the canvas either way", updated.frame);
// Every pose on it names its own character: the list mixes them, so the pose
// name alone would be the same cell twice over.
if (updated.poses) {
  check(await page.evaluate(() =>
    [...document.querySelectorAll("#poseList button .pose-file")].every((i) => /·/.test(i.textContent))),
    "each entry says which character it belongs to");
  check(await page.evaluate(() => !document.getElementById("updatedGroup").hidden),
    "and the panel explains what the round overwrote");
}

check(!errors.length, "no page errors", errors.slice(0, 2).join(" | "));
await browser.close();
console.log(fails ? `\n${fails} check(s) failed` : "\nAll checks pass");
process.exit(fails ? 1 : 0);
