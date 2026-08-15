// The audio workbench: does it show the whole voice, and draw the fighter?
//
// Written after a cache-key change quietly broke every sprite on the page. The
// canvas fell back to "art still loading…", which is what a slow load looks
// like, so the bench looked busy rather than broken and stayed that way through
// a commit. A pixel count is the only assertion that can tell those two apart.
//
// It also guards the coverage rule that gives the page its point: every voice
// group in the game has to be reachable from it. Two of the six were not, for
// as long as the cast list was built from spoken lines alone — and the two that
// were missing had alternate takes nobody could audition.
//
// Needs `playwright` and a Chromium binary (set CHROMIUM_PATH if yours is
// elsewhere). Start the game first (node server.mjs), then:
//   node tools/smoke_audio_bench.mjs [baseUrl]
import { chromium } from "playwright";

const BASE = process.argv[2] || "http://127.0.0.1:5174";
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-proxy-server"],
});

let failed = 0;
function ok(pass, label, detail = "") {
  if (!pass) failed++;
  console.log(`${pass ? "ok  " : "FAIL"} ${label}${detail ? `   ${detail}` : ""}`);
}

const page = await browser.newPage({ acceptDownloads: true });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));
page.on("console", (m) => {
  if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(m.text().slice(0, 160));
});

await page.goto(`${BASE}/workbench/?edit=audio`, { waitUntil: "load" });
await page.waitForTimeout(4000);

// ---- every voice group in the game is reachable from the cast list
const reach = await page.evaluate(async () => {
  const audio = await import("/src/audio.js");
  const cfg = await import("/src/config_audio.js");
  const chars = await import("/src/characters.js");
  const cast = [...document.querySelectorAll("#castList button")]
    .map((b) => b.innerText.split("\n")[0].trim());
  const byName = Object.fromEntries(
    Object.entries(chars.CHARACTERS).map(([k, c]) => [c.name, k]));
  const castKeys = cast.map((n) => byName[n]).filter(Boolean);
  const groups = new Set(Object.values(audio.GRUNT_GROUPS));
  const reached = new Set(castKeys.map((k) => audio.GRUNT_GROUPS[k]).filter(Boolean));
  return {
    cast,
    all: [...groups],
    missing: [...groups].filter((g) => !reached.has(g)),
    kos: Object.values(audio.KO_FOR_GROUP).filter((k) => !cfg.SFX[k]),
  };
});
ok(reach.missing.length === 0, "every voice group is reachable from the cast",
   reach.missing.length ? `unreachable: ${reach.missing.join(", ")}` : `${reach.all.length} groups, ${reach.cast.length} in the list`);
ok(reach.kos.length === 0, "every KO cry is registered", reach.kos.join(", "));

// ---- the fighter actually draws
//
// The canvas is never empty — it prints a placeholder when it cannot draw — so
// this counts opaque pixels rather than asking whether anything was painted.
// A line of text is a few hundred; a fighter is thousands.
for (const who of ["gojo", "maki", "nanami"]) {
  await page.goto(`${BASE}/workbench/?edit=audio&char=${who}`, { waitUntil: "load" });
  await page.waitForTimeout(4500);
  const px = await page.evaluate(() => {
    const c = document.querySelector("#stage");
    const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 8) n++;
    return n;
  });
  ok(px > 3000, `${who}'s idle draws on the stage`, `${px} opaque pixels`);
}

// ---- a group's files are individually playable, and the pick is exportable
await page.goto(`${BASE}/workbench/?edit=audio&char=gojo`, { waitUntil: "load" });
await page.waitForTimeout(4000);
const shape = await page.evaluate(() => ({
  files: document.querySelectorAll(".track.file").length,
  radios: document.querySelectorAll('.track.file input[type="radio"]').length,
  checks: document.querySelectorAll('.track.file .tick--keep input[type="checkbox"]').length,
  bins: document.querySelectorAll('.track.file .tick--bin input').length,
  movers: document.querySelectorAll('.track.file .tick--move input').length,
  choosers: document.querySelectorAll(".track.chooser").length,
}));
ok(shape.files >= 6 && shape.choosers >= 2, "one row per recording, with a chooser each",
   JSON.stringify(shape));
ok(shape.radios >= 2, "a single-file sound picks exclusively", `${shape.radios} radios`);
ok(shape.checks >= 3, "a group keeps any subset", `${shape.checks} checkboxes`);

// Change one of each kind, then export.
ok(shape.bins === shape.files && shape.movers === shape.files,
   "every recording can be binned or moved", `${shape.bins} delete, ${shape.movers} move`);

// One of each decision: pick a take, drop a take, bin a take, move a take.
await page.locator('.track.file input[type="radio"]').nth(1).click();
await page.locator('.track.file .tick--keep input[type="checkbox"]').nth(1).click();
await page.locator('.track.file .tick--bin input').nth(2).click();
const moveRow = page.locator('.track.file').nth(3);
await moveRow.locator('.tick--move input').click();
await moveRow.locator('select').selectOption({ index: 1 });
await page.waitForTimeout(300);
const [download] = await Promise.all([
  page.waitForEvent("download"),
  page.click("#exportBtn"),
]);
const doc = JSON.parse(await (await download.createReadStream()).setEncoding("utf8").toArray().then((c) => c.join("")));
ok(download.suggestedFilename().endsWith(".json"), "export downloads a JSON file",
   download.suggestedFilename());
ok(doc.changes.length === 2, "export carries both changes", `${doc.changes.length} change(s)`);
ok(doc.deletions.length === 1, "export carries the deletion", doc.deletions.join(", "));
ok(doc.reassignments.length === 1 && doc.reassignments[0].from && doc.reassignments[0].to,
   "a move says where it came from and where it goes",
   doc.reassignments[0] ? `${doc.reassignments[0].file}: ${doc.reassignments[0].from} -> ${doc.reassignments[0].to}` : "");
const line = doc.changes.find((c) => c.spokenLine);
ok(!!line && typeof line.spokenLine.measuredLength === "number",
   "a spoken line's export measures the new take's real length",
   line ? `${line.spokenLine.currentLength}s -> ${line.spokenLine.measuredLength}s` : "");
const group = doc.changes.find((c) => Array.isArray(c.chosen));
ok(!!group && group.dropped.length === 1, "a group's export says what was dropped",
   group ? group.dropped.join(", ") : "");

// ---- only a spoken line is exclusive
//
// The regression this guards: `exclusive` was decided by how many files a sound
// currently held, so a grunt group pruned down to one take started rendering a
// radio button — the page quietly refusing to let anybody grow the bank back,
// on half the voice groups at once. A bank is a bank however few files are in
// it; only a spoken line, whose length is frame data, can hold exactly one.
for (const who of ["gojo", "jogo", "panda"]) {
  await page.goto(`${BASE}/workbench/?edit=audio&char=${who}`, { waitUntil: "load" });
  await page.waitForTimeout(3500);
  const kinds = await page.evaluate(() => {
    const out = { line: new Set(), other: new Set() };
    for (const g of document.querySelectorAll(".track-group")) {
      const spoken = g.querySelector("h3").textContent === "Spoken lines";
      for (const row of g.querySelectorAll(".track.file")) {
        const t = row.querySelector(".tick--keep input")?.type;
        if (t) out[spoken ? "line" : "other"].add(t);
      }
    }
    return { line: [...out.line], other: [...out.other] };
  });
  ok(!kinds.other.includes("radio"),
     `${who}: no wordless or technique sound is exclusive`, `controls: ${kinds.other.join(",") || "none"}`);
  ok(!kinds.line.includes("checkbox"),
     `${who}: every spoken line still picks exclusively`, `controls: ${kinds.line.join(",") || "none"}`);
}

// ---- a fighter's technique sounds are listed, and every one is registered
await page.goto(`${BASE}/workbench/?edit=audio&char=gakuganji`, { waitUntil: "load" });
await page.waitForTimeout(4000);
const fx = await page.evaluate(async () => {
  const cfg = await import("/src/config_audio.js");
  const group = [...document.querySelectorAll(".track-group")]
    .find((g) => g.querySelector("h3").textContent === "Techniques");
  const keys = group
    ? [...group.querySelectorAll(".track[data-sfx]")].map((r) => r.dataset.sfx)
    : [];
  return { keys, unregistered: keys.filter((k) => !cfg.SFX[k]) };
});
ok(fx.keys.includes("powerChord"), "Gakuganji's power chord is on the page", fx.keys.join(", "));
ok(fx.unregistered.length === 0, "every technique sound named is registered", fx.unregistered.join(", "));

// ---- playing a technique with art puts that art on the stage, then takes it away
const stagePixels = () => page.evaluate(() => {
  const c = document.querySelector("#stage");
  const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
  let n = 0;
  for (let i = 3; i < d.length; i += 4) if (d[i] > 8) n++;
  return n;
});
const idleOnly = await stagePixels();
await page.evaluate(() => {
  const g = [...document.querySelectorAll(".track-group")]
    .find((x) => x.querySelector("h3").textContent === "Techniques");
  g.querySelector(".track button").click();
});
await page.waitForTimeout(400);
const withArt = await stagePixels();
await page.waitForTimeout(2600);
const afterArt = await stagePixels();
ok(withArt > idleOnly * 1.15, "the move's art appears while its sound plays",
   `${idleOnly} -> ${withArt} opaque pixels`);
ok(afterArt < withArt * 0.95, "and clears again a couple of seconds later",
   `${withArt} -> ${afterArt}`);

// ---- a technique sound's alternates are auditionable, and cannot be "moved"
//
// The move control files a take into a different VOICE bank. That is a real
// decision for a grunt and a meaningless one for a guitar lick, which has
// nowhere to go — offering it would invite an export nobody could apply.
await page.goto(`${BASE}/workbench/?edit=audio&char=gakuganji`, { waitUntil: "load" });
await page.waitForTimeout(4000);
const chord = await page.evaluate(() => {
  const row = document.querySelector('.track[data-sfx="powerChord"]');
  const group = row?.parentElement;
  const files = [...(group?.querySelectorAll(".track.file") || [])];
  return {
    alts: group ? group.querySelectorAll(".track.alt").length : 0,
    files: files.length,
    keeps: files.filter((r) => r.querySelector(".tick--keep input")?.type === "checkbox").length,
    movesOffered: files.filter((r) => {
      const l = r.querySelector(".tick--move");
      return l && !l.hidden;
    }).length,
  };
});
ok(chord.alts >= 3 && chord.files >= 6, "the power chord's alternates are on the page",
   JSON.stringify(chord));
ok(chord.keeps === chord.files, "and every one of them keeps rather than picks",
   `${chord.keeps}/${chord.files} checkboxes`);
ok(chord.movesOffered === 0, "and none of them offers to move into a voice bank",
   `${chord.movesOffered} move control(s) shown`);

// A grunt still can be moved — the control is narrowed, not removed.
await page.goto(`${BASE}/workbench/?edit=audio&char=gojo`, { waitUntil: "load" });
await page.waitForTimeout(3500);
const gruntMoves = await page.evaluate(() => {
  const row = document.querySelector('.track[data-sfx="gruntYoungMale"]');
  return [...(row?.parentElement.querySelectorAll(".track.file .tick--move") || [])]
    .filter((l) => !l.hidden).length;
});
ok(gruntMoves > 0, "a voice take can still be moved between banks", `${gruntMoves} offered`);

// ---- two rows for one move are two different sounds, and say so
//
// Gakuganji's Power Chord produces two rows: the chord he plays (`powerChord`)
// and the generic `sound` layer under its impact (`hitSound`). They both used
// to be labelled "Power Chord", which invited the reasonable and wrong belief
// that editing one edits both — wrong twice over, because the second is also
// SHARED with Inumaki's "Don't Move".
await page.goto(`${BASE}/workbench/?edit=audio&char=gakuganji`, { waitUntil: "load" });
await page.waitForTimeout(3500);
const rows = await page.evaluate(() => {
  const g = [...document.querySelectorAll(".track-group")]
    .find((x) => x.querySelector("h3").textContent === "Techniques");
  return [...g.querySelectorAll(".track[data-sfx]")].map((r) => ({
    key: r.dataset.sfx,
    label: r.querySelector(".label").textContent.trim(),
    shared: r.querySelector(".tag--shared")?.getAttribute("title") || null,
  }));
});
const labels = rows.map((r) => r.label);
ok(new Set(labels).size === labels.length, "no two technique rows carry the same label",
   labels.join(" | "));
const layer = rows.find((r) => r.key === "hitSound");
ok(!!layer && /Inumaki/.test(layer.shared || ""),
   "a sound another fighter also plays says whose", layer ? layer.shared : "(no layer row)");
const solo = rows.find((r) => r.key === "powerChord");
ok(!!solo && solo.shared === null, "and a sound nobody else plays does not");

ok(errors.length === 0, "no page errors", errors.slice(0, 2).join(" | "));

await browser.close();
console.log(failed ? `\n${failed} check(s) failed` : "\nthe audio bench shows every voice, draws its fighter and exports its verdict");
process.exit(failed ? 1 : 0);
