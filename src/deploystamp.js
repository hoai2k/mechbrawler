// "Is the page I am looking at the commit I just pushed?"
//
// Until now that question had no answer from inside the browser, and the two
// ways it goes wrong look identical from a chair: the deploy has not run yet,
// or the deploy ran and a cache is still handing you the old file. Both present
// as "my change isn't there", and the usual response — reload, doubt the
// change, doubt the merge — treats the wrong one.
//
// So the deploy writes `version.json` at the repo root (see the "Stamp the
// build" step in .github/workflows/deploy-pages.yml) and this puts it in the
// header bar: which commit is published, how long ago, and a link to the run.
// Compare the SHA to the one you pushed and you know which of the two you have.
//
// Fetched with a cache-buster AND no-store, deliberately. Pages sends a
// ten-minute max-age on everything including this file, so a plain fetch could
// report a ten-minute-old deploy as current — which is exactly the failure this
// is meant to detect. A URL nobody has fetched cannot be served from any cache.
//
// Locally there is no version.json (it is generated in CI and gitignored), and
// that absence is itself the useful reading: you are on the dev server, looking
// at the files on disk. It says so rather than staying blank.

const STAMP_URL = new URL("../version.json", import.meta.url);

function ago(iso) {
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return "";
  const secs = Math.max(0, (Date.now() - then) / 1000);
  if (secs < 90) return "just now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 36) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

function mount() {
  const bar = document.querySelector(".bar");
  if (!bar) return null;
  const el = document.createElement("a");
  el.className = "deploy-stamp";
  el.target = "_blank";
  el.rel = "noopener";
  el.textContent = "checking deploy…";
  // The Actions page is the right destination before we know the run, and the
  // right fallback if the fetch fails: it answers the same question, slower.
  el.href = "https://github.com/hoai2k/jjkbrawler/actions/workflows/deploy-pages.yml";
  bar.appendChild(el);
  return el;
}

const el = mount();
if (el) {
  try {
    const res = await fetch(`${STAMP_URL}?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) throw new Error(String(res.status));
    const v = await res.json();
    el.textContent = `deployed ${v.short} · ${ago(v.deployed)}`;
    el.title =
      `${v.title || ""}\n${v.sha}\ndeployed ${v.deployed}` +
      `\n\nIf this is not the commit you are looking for, the deploy has not landed yet.` +
      `\nIf it IS, and the page still looks old, a cache is holding a file — reload with ?bust=1.`;
    if (v.run) el.href = v.run;
    el.dataset.sha = v.sha || "";
  } catch {
    // 404 on the dev server is the normal case, not a fault.
    el.textContent = "local build";
    el.title = "No version.json — these files are being served from disk, not from a deploy.";
    el.classList.add("deploy-stamp--local");
  }
}
