// Does the character-select roster actually SPEND the room the menu gives it?
//
// The fitter (layoutCharacterGrid in src/ui.js) picks how deep the roster
// stacks and how hard the art is cropped. Its old overflow test asked
// #menuOverlay whether scrollHeight exceeded clientHeight — which cannot work,
// because the overlay is a centred flex column and centred content that
// overflows spills out of BOTH ends, so only half of it is ever counted. Every
// candidate read as overflowing, the search fell through to its last-resort
// layout at every window size, and the roster shipped as a thin band of 2/1
// letterboxes across the bottom of an otherwise empty screen.
//
// So this measures the thing that went wrong, not the code that went wrong:
// how much of the roster's height budget the roster occupies, and how flat the
// cards ended up. Both are properties a player can see.
//
// Usage: node tools/smoke_select_layout.mjs [baseUrl]
import { chromium } from "playwright";
import { pressStart } from "./smoke_boot.mjs";

const BASE = process.argv[2] || "http://127.0.0.1:5174";

// The roster should take most of what is left over once the title, the matchup
// bar and the status lines have had their say. Well under this and the cards
// are small for no reason.
const MIN_FILL = 0.72;
// A card flatter than this is a letterbox: the art is cropped past the point
// where a fighter is recognisable at a glance.
const MIN_SHAPE = 0.6;

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-proxy-server"],
});

let failed = 0;
const check = (ok, msg) => { if (!ok) failed++; console.log(`${ok ? "ok  " : "FAIL"} ${msg}`); };

for (const [w, h] of [[1280, 720], [1920, 1080], [2560, 1440]]) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  page.on("pageerror", (e) => console.log("page error:", String(e).slice(0, 200)));
  await page.goto(`${BASE}/index.html?camera=flat`);
  await pressStart(page);
  await page.waitForTimeout(900);

  const m = await page.evaluate(() => {
    const overlay = document.querySelector("#menuOverlay");
    const grid = document.querySelector(".character-grid");
    const card = document.querySelector(".char-card");
    const cs = getComputedStyle(overlay);
    const gap = parseFloat(cs.rowGap) || 0;
    // The same budget the fitter works to: the overlay less everything in it
    // that is not the roster.
    let others = 0;
    let items = 0;
    for (const child of overlay.children) {
      if (getComputedStyle(child).position === "absolute") continue;
      const height = child === grid ? 0 : child.getBoundingClientRect().height;
      if (child !== grid && !height) continue;
      others += height;
      items += 1;
    }
    const pad = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
    const budget = overlay.clientHeight - pad - others - gap * Math.max(items - 1, 0);
    const box = card.getBoundingClientRect();
    // And nothing may be pushed off either end of a centred column.
    const flow = [...overlay.children].filter((c) => getComputedStyle(c).position !== "absolute"
      && c.getBoundingClientRect().height);
    const top = Math.min(...flow.map((c) => c.getBoundingClientRect().top));
    const bottom = Math.max(...flow.map((c) => c.getBoundingClientRect().bottom));
    const ovBox = overlay.getBoundingClientRect();
    return {
      budget: Math.round(budget),
      used: Math.round(grid.getBoundingClientRect().height),
      cardW: Math.round(box.width), cardH: Math.round(box.height),
      rows: getComputedStyle(grid).getPropertyValue("--rows").trim(),
      aspect: grid.style.getPropertyValue("--card-aspect").trim(),
      spillTop: Math.round(ovBox.top + (parseFloat(cs.paddingTop) || 0) - top),
      spillBottom: Math.round(bottom - (ovBox.bottom - (parseFloat(cs.paddingBottom) || 0))),
    };
  });

  const fill = m.used / m.budget;
  const shape = m.cardH / m.cardW;
  const at = `${w}x${h}`;
  check(fill >= MIN_FILL,
    `${at}: the roster fills its height budget — ${m.used}/${m.budget}px `
    + `(${Math.round(fill * 100)}%), ${m.rows} rows at ${m.aspect}`);
  check(shape >= MIN_SHAPE,
    `${at}: the cards are not letterboxed — ${m.cardW}x${m.cardH} (${shape.toFixed(2)})`);
  check(m.spillTop <= 2 && m.spillBottom <= 2,
    `${at}: nothing spills out of the menu — ${m.spillTop}px over the top, ${m.spillBottom}px past the bottom`);
  await page.close();
}

await browser.close();
console.log(failed ? `\n${failed} check(s) failed` : "\nall checks passed");
process.exit(failed ? 1 : 0);
