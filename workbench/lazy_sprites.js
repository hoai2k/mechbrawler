// Per-character sprite streaming for the two workbenches.
//
// The workbenches used to wait on the game's entire sprite library — ~450 MB
// across 23 fighters — before drawing anything, to edit one pose of one
// character. They now load the manifest (which carries every number the panels
// display) and then only the art for the character on screen: the selected pose
// first so there is something to look at, then the rest of that character's
// frames behind it.
//
// Switching characters abandons the previous character's tail. Its frames stay
// in the image cache, so switching back is instant, but no bandwidth is spent
// finishing a set nobody is looking at.

import { loadFrame, frameKeys, getImage } from "../src/assets.js";

// Fewer than the game's six, so a pose clicked mid-stream still has connections
// available to jump the queue with.
const TAIL_PARALLEL = 4;

export function frameLoaded(charKey, frameKey) {
  return !!getImage(`sprite:${charKey}:${frameKey}`);
}

/** A loader bound to one set of callbacks.
 *
 *  onFirst(charKey, frameKey)  the pose you asked for is on screen
 *  onFrame(charKey, frameKey)  any other frame arrived
 *  onDone(charKey)             the whole character is in memory
 */
export function makeCharLoader({ onFirst, onFrame, onDone } = {}) {
  let token = 0;        // bumped on every start(); stale work checks against it
  let charKey = null;
  let queue = [];       // frames of the current character not yet fetched
  let firstPending = false;

  const isStale = (mine) => mine !== token;

  async function tail(mine) {
    const worker = async () => {
      while (queue.length && !isStale(mine)) {
        const key = queue.shift();
        await loadFrame(charKey, key);
        if (isStale(mine)) return;
        onFrame?.(charKey, key);
      }
    };
    await Promise.all(Array.from({ length: TAIL_PARALLEL }, worker));
    if (!isStale(mine)) onDone?.(charKey);
  }

  return {
    /** Begin (or restart) streaming a character, `firstFrame` before the rest. */
    async start(nextChar, firstFrame) {
      const mine = ++token;
      charKey = nextChar;
      const keys = frameKeys(nextChar);
      const first = keys.includes(firstFrame) ? firstFrame : keys[0];
      queue = keys.filter((k) => k !== first);
      if (!first) { firstPending = false; onDone?.(nextChar); return; }

      firstPending = !frameLoaded(nextChar, first);
      await loadFrame(nextChar, first);
      if (isStale(mine)) return;
      firstPending = false;
      onFirst?.(nextChar, first);
      await tail(mine);
    },

    /** A pose was selected before its art arrived: fetch it out of order rather
     *  than waiting for the queue to reach it. */
    async prioritize(frameKey) {
      if (!charKey || frameLoaded(charKey, frameKey)) return;
      const mine = token;
      const at = queue.indexOf(frameKey);
      if (at >= 0) queue.splice(at, 1);
      firstPending = true;
      await loadFrame(charKey, frameKey);
      if (isStale(mine)) return;
      firstPending = false;
      onFirst?.(charKey, frameKey);
    },

    /** True while the pose on screen has no art yet — what the spinner shows. */
    get waiting() {
      return firstPending;
    },

    /** How much of the current character is still streaming, for the status
     *  line. Counts only the tail: the selected pose has its own spinner. */
    get remaining() {
      return queue.length;
    },
  };
}
