// Every picture the menus draw is where the menus think it is, and no thumbnail
// is out of date.
//
// Two failures this catches, both silent in the game:
//
//   - A background delivered into `assets/backgrounds/arenas/` without
//     `tools/make_thumbnails.py` being run after it. The arena card keeps drawing
//     the OLD painting while the match draws the new one, and nothing errors —
//     the stale thumbnail is a perfectly good file.
//   - A stage whose `bgFile` names a painting that is not there. The card falls
//     back to the full path (src/ui.js buildStageGrid) and then 404s that too, so
//     the card is simply blank.
//
// Static: reads src/stages.js and the disk, runs no browser.
//
// Usage: node tools/check_menu_art.mjs
import { execFileSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { STAGES, backgroundFile, thumbFile } = await import(
  pathToFileURL(join(ROOT, "src", "stages.js")).href);

let failed = 0;
const check = (ok, msg, detail = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${msg}${detail ? `   ${detail}` : ""}`);
};

// One tree, not two: every arena has exactly one painting serving both cameras
// (src/stages.js backgroundFile), which is where this differs from upstream.
const missingArt = [];
const missingThumb = [];
const staleThumb = [];
for (const stage of STAGES) {
  const art = join(ROOT, backgroundFile(stage));
  const thumb = join(ROOT, thumbFile(stage));
  if (!existsSync(art)) { missingArt.push(stage.key); continue; }
  if (!existsSync(thumb)) { missingThumb.push(stage.key); continue; }
  if (statSync(thumb).mtimeMs < statSync(art).mtimeMs) staleThumb.push(stage.key);
}
check(!missingArt.length, "every stage's painting is on disk",
  missingArt.length ? missingArt.join(", ") : `${STAGES.length} stages`);
check(!missingThumb.length, "...and every one has a menu thumbnail",
  missingThumb.length ? `missing: ${missingThumb.join(", ")}` : `${STAGES.length} thumbnails`);
check(!staleThumb.length, "...and none of them is older than its painting",
  staleThumb.length ? `stale: ${staleThumb.join(", ")}` : "all current");

// The generator's own sweep, which covers paintings no stage names yet.
//
// SKIPPED rather than failed when the generator cannot run: it needs Pillow, and
// this checker is in `npm run check` where the other Python tools already degrade
// that way. The disk checks above are the ones that matter per stage and they need
// nothing installed — this only adds files no stage has claimed.
try {
  const out = execFileSync("python3", [join(ROOT, "tools", "make_thumbnails.py"), "--check"],
    { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  check(true, "make_thumbnails.py --check agrees", out.trim().split("\n")[0]);
} catch (e) {
  const err = String(e.stderr || "");
  if (/ModuleNotFoundError|No module named|ENOENT/.test(err)) {
    console.log("skip  make_thumbnails.py --check   no Pillow here (pip install Pillow)");
  } else {
    check(false, "make_thumbnails.py --check agrees",
      String(e.stdout || e.message).trim().split("\n").slice(0, 3).join(" / "));
  }
}

console.log(failed
  ? `\n${failed} check(s) failed — run: python3 tools/make_thumbnails.py`
  : "\nall menu art checks passed");
process.exit(failed ? 1 : 0);
