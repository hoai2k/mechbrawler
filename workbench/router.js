// THE WORKBENCH ROUTER — four tools, one address.
//
// All of them live at /workbench/ and `?edit=` picks between them: no query is
// the EFFECT workbench (the one that was here first, so a bookmark still lands
// where it did), `?edit=pose` is the POSE workbench, `?edit=cards` is the CARD
// workbench, `?edit=toon` is the TOON workbench. One address because they share
// a stylesheet — and three of them a renderer boot and rig_view.js — and
// because the dev server resolves a directory to its index.html, so a second
// folder would be a second copy of all of it.
//
// The tools are dynamically imported, so the one you did not ask for is never
// fetched, parsed or booted. The card tool pulls no renderer at all, which is
// why it opens instantly next to the others.

const TOOLS = {
  "": () => import("./effects.js"),
  pose: () => import("./pose.js"),
  cards: () => import("./cards.js"),
  toon: () => import("./toon.js"),
};

const TITLES = {
  "": "Effect workbench",
  pose: "Pose workbench",
  cards: "Card workbench",
  toon: "Toon workbench",
};

/** Tools that only mean anything under a particular render style. The style is
 *  FIXED FOR THE PAGE'S LIFE (render3d/src/style.js): materials are converted
 *  once at rig load and the light rig and tone mapping are chosen once at
 *  scene init. So the correction has to happen HERE, before a single renderer
 *  module is imported — a tool that noticed afterwards could only apologise. */
const NEEDS_STYLE = { toon: "toon" };

async function main() {
  const q = new URLSearchParams(location.search);
  const which = (q.get("edit") || "").toLowerCase();

  const style = NEEDS_STYLE[which];
  if (style && (q.get("render") || "").toLowerCase() !== style) {
    const url = new URL(location.href);
    url.searchParams.set("render", style);
    location.replace(url);
    return;
  }

  const load = TOOLS[which] || TOOLS[""];
  const root = document.getElementById("app");
  try {
    const mod = await load();
    document.title = `${TITLES[which] || TITLES[""]} — Mech Brawler`;
    await mod.boot(root);
  } catch (err) {
    // A tool that fails to boot must SAY so on the page: this is a workbench,
    // and a blank one reads as "the thing you were inspecting is broken"
    // rather than "the inspector is".
    root.innerHTML = `<div class="boot-fail">
        <h1>The workbench failed to start.</h1>
        <p><code>${err.message}</code></p>
        <p class="muted">The console has the stack. The game itself is unaffected — this page shares modules with it but drives nothing.</p>
      </div>`;
    console.error(err);
  }
}

main();
