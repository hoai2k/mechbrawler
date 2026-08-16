// Getting a headless page from `index.html` to the fighter select.
//
// The game opens on a title splash (`setPhase("title")` in src/main.js) and
// stays there until somebody presses start — and, when there is music to wake,
// the FIRST press only turns the cabinet on (attract mode, ui.js leaveTitle),
// so it can take two. Every browser tool that drives a match has to get past
// that, and every one of them was written before the splash existed: they
// waited on `[data-character="…"]` or on `state.phase === "menu"` and hung on
// a screen that was never going to change by itself.
//
// One helper rather than the same three lines in fifteen files, and it reads
// the PHASE rather than counting clicks, so it keeps working whether the wake
// press is owed or not.

/** Click through the title splash until the fighter select is actually up.
 *
 *  Polls rather than waiting once on a phase, because the phase passes through
 *  more than one state that is not `title` on the way there: a fresh page
 *  starts on state.js's default, then `loading` while the core art comes down,
 *  and only then `title`. A single "is it title yet" read races that and can
 *  answer before the splash exists. The exit condition is the thing every
 *  caller actually wants — a clickable fighter card — so this also returns
 *  cleanly on a build with no splash at all. */
export async function pressStart(page, { timeout = 120000 } = {}) {
  const deadline = Date.now() + timeout;
  const grid = page.locator(".char-card").first();
  while (Date.now() < deadline) {
    if (await grid.isVisible().catch(() => false)) return;
    const phase = await page.evaluate(async () =>
      (await import("/src/state.js")).state.phase).catch(() => null);
    if (phase === "title") await page.click("#titleOverlay").catch(() => {});
    await page.waitForTimeout(250);
  }
  throw new Error("the title splash never handed over to the fighter select");
}

/**
 * Pick a fighter — any fighter — and leave the select screen ready to start.
 *
 * WHY THIS EXISTS RATHER THAN A NAME. Six tools reached the select screen and
 * clicked `[data-character="gojo"]`, and one clicked `nobara`. None of them
 * cared who: they wanted a match running so they could measure a blast zone, a
 * ledge grab, a camera, a controller. The roster then became seventeen mechs,
 * those seven selectors stopped matching anything, and each tool sat on its
 * `waitForSelector` for a full minute and failed on a timeout that named a
 * character rather than the problem.
 *
 * A test that does not care which fighter it gets should not name one. This
 * takes the first card in the grid, so the next roster change cannot break it
 * the same way. A tool that DOES care — smoke_combat wants a heavyweight — goes
 * on naming its mech, and should.
 */
export async function pickAnyFighter(page, { timeout = 120000 } = {}) {
  const card = page.locator(".char-card").first();
  await card.waitFor({ state: "visible", timeout });
  await card.click();
  // The select screen animates the pick in before the start button commits it;
  // every caller used to sleep here, so it belongs with the click.
  await page.waitForTimeout(400);
}
