// THE WORKBENCH ROUTER — two tools, one address.
//
// Both live at /workbench/ and `?edit=` picks between them: no query is the
// EFFECT workbench (the one that was here first, so a bookmark still lands
// where it did), `?edit=pose` is the POSE workbench. One address because they
// share a renderer boot, a stylesheet and rig_view.js, and because the dev
// server resolves a directory to its index.html — a second folder would be a
// second copy of all three.
//
// The tools are dynamically imported, so the one you did not ask for is never
// fetched, parsed or booted.

const TOOLS = {
  "": () => import("./effects.js"),
  pose: () => import("./pose.js"),
};

async function main() {
  const which = (new URLSearchParams(location.search).get("edit") || "").toLowerCase();
  const load = TOOLS[which] || TOOLS[""];
  const root = document.getElementById("app");
  try {
    const mod = await load();
    document.title = which === "pose"
      ? "Pose workbench — Mech Brawler" : "Effect workbench — Mech Brawler";
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
