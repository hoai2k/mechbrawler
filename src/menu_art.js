// Warming the art the NEXT menu screen will draw, while the player is still
// looking at this one.
//
// The menus are HTML, so their pictures are <img> tags and the browser fetches
// them when it decides to — which for an overlay that is display:none, or for
// anything marked `loading="lazy"`, is the moment it comes on screen. That is
// exactly when it is too late: the arena grid filled in card by card while the
// player watched, and the roster did the same on a cold cache.
//
// This is the other half of src/assets.js. That file loads what the MATCH needs
// — effects, backdrops, card art — into a canvas image cache. This one loads what
// the MENUS need into the browser's own HTTP cache, by asking for the file and
// throwing the result away: the <img> that renders it later gets a cache hit
// instead of a request. Nothing here holds a decoded image.
//
// Two rules keep it out of the way of the real load:
//
//   - It runs in IDLE time. `requestIdleCallback` only calls back when the
//     browser has nothing better to do, so a warm never competes with the screen
//     the player is actually on.
//   - It is a QUEUE, not a burst. Menu art is a few dozen small files; firing
//     them all at once would take every connection the browser will open to the
//     host and stall the rig and effect loaders behind them.

const WARM_PARALLEL = 3;

// Urls whose request has actually STARTED. Marked on the way out of the queue
// rather than on the way in: re-prioritising throws the queue away, and a url
// marked at queue time would be remembered as fetched while never having been
// asked for — so the roster warmed on the title screen would be dropped by the
// re-prioritise on arriving at the roster, which is the one moment it matters.
const warmed = new Set();
let queue = [];             // urls waiting, most wanted first
let live = 0;               // requests in flight
let scheduled = false;

/** Idle time if the browser offers it, the back of the task queue if not. Safari
 *  has no requestIdleCallback; a timeout there is not the same promise but it is
 *  the same intent, and the concurrency cap does the real work of staying out of
 *  the way. */
const onIdle = (fn) => (typeof requestIdleCallback === "function"
  ? requestIdleCallback(fn, { timeout: 2000 })
  : setTimeout(fn, 120));

function pump() {
  scheduled = false;
  while (live < WARM_PARALLEL && queue.length) {
    const url = queue.shift();
    if (warmed.has(url)) continue;
    warmed.add(url);
    live += 1;
    const img = new Image();
    // A warm is a fetch, not a decode: `fetchPriority=low` tells the browser this
    // may yield to anything the page asks for afterwards, which is what makes an
    // early warm safe to start on the title screen.
    if ("fetchPriority" in img) img.fetchPriority = "low";
    const done = () => {
      live -= 1;
      schedule();
    };
    img.onload = done;
    // Errors are silent ON PURPOSE. Every url here is speculative — a thumbnail
    // that has not been generated yet, a card for a mech that has none — and the
    // screen that actually draws it has its own fallback. A warm that fails must
    // cost nothing but the request.
    img.onerror = done;
    img.src = url;
  }
}

function schedule() {
  if (scheduled || !queue.length || live >= WARM_PARALLEL) return;
  scheduled = true;
  onIdle(pump);
}

/**
 * Ask for these urls during idle time, most wanted first.
 *
 * Call it again with a different list to RE-PRIORITISE: whatever has not started
 * yet is dropped and replaced, so moving from the title screen to the roster does
 * not leave the roster queued behind a screen nobody is going to. Anything
 * already fetched stays fetched — that is what `warmed` is for.
 */
export function warmMenuArt(urls) {
  const fresh = [];
  const seen = new Set();
  for (const url of urls) {
    if (!url || warmed.has(url) || seen.has(url)) continue;
    seen.add(url);
    fresh.push(url);
  }
  queue = fresh;
  schedule();
}

/** For tests and for the load hint: how much has been asked for, and how much is
 *  still waiting. */
export function warmStats() {
  return { requested: warmed.size, queued: queue.length, live };
}
