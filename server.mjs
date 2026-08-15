// The development server. Static files, no build step — `npm start`, or the
// double-clickable launchers next to it.
import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const port = Number(process.env.PORT) || 5174;
const host = process.env.HOST || "127.0.0.1";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".map": "application/json",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".ico": "image/x-icon",
  ".webmanifest": "application/manifest+json",
  // The 2.5D path ships models; without these they arrive as
  // application/octet-stream and the loader has to guess.
  ".glb": "model/gltf-binary",
  ".gltf": "model/gltf+json",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

const MEDIA = /\.(png|jpg|jpeg|webp|gif|mp3|wav|ogg|glb)$/i;
// Source and data: never cached, not even revalidated. `no-cache` plus a
// Last-Modified validator is the polite answer and it was the answer here, but
// it leaves a browser free to serve a stale ES module out of its memory cache
// for the life of a tab — which turns "I edited a file and reloaded" into "the
// tool did not change", and no amount of reloading fixes what a hard-refresh
// has to be remembered for. These files are kilobytes; the media above, which
// is where the gigabytes are, still caches for an hour.
const SOURCE = /\.(html|js|mjs|css|json|map|md|webmanifest)$/i;

/** `Range: bytes=a-b` against a known file size, or null for anything this
 *  server does not intend to honour (multi-range, garbage, out of bounds).
 *
 *  The music element needs this. Answering a media request with a flat 200 and
 *  the whole file leaves the audio unseekable, and Safari in particular is
 *  unhappy being handed a media resource that never advertises range support. */
function parseRange(header, size) {
  const m = /^bytes=(\d*)-(\d*)$/.exec((header || "").trim());
  if (!m) return null;
  const [, rawStart, rawEnd] = m;
  if (rawStart === "" && rawEnd === "") return null;
  // "bytes=-500" is the LAST 500 bytes, not a range starting at zero.
  let start = rawStart === "" ? size - Number(rawEnd) : Number(rawStart);
  let end = rawStart === "" || rawEnd === "" ? size - 1 : Number(rawEnd);
  start = Math.max(0, start);
  end = Math.min(size - 1, end);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) return null;
  return { start, end };
}

const server = createServer(async (req, res) => {
  let path = "/";
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    path = normalize(decodeURIComponent(url.pathname)).replace(/^([.]{2}[/\\])+/, "");
    // serve index.html for any directory path (/, /workbench/, ...)
    if (path.endsWith("/") || path.endsWith("\\")) path += "index.html";

    const full = join(root, path);
    const info = await stat(full);
    if (info.isDirectory()) throw Object.assign(new Error("is a directory"), { code: "EISDIR" });

    const headers = {
      "Content-Type": TYPES[extname(path).toLowerCase()] || "application/octet-stream",
      "Cache-Control": MEDIA.test(path) ? "max-age=3600"
        : SOURCE.test(path) ? "no-store, must-revalidate" : "no-cache",
      // Cheap revalidation for everything else: with "no-cache" the browser
      // asks every time, and without a validator every one of those asks
      // re-sends the whole file.
      "Last-Modified": info.mtime.toUTCString(),
      "Accept-Ranges": "bytes",
    };

    // A conditional request for a no-store file is a copy that should not
    // exist; answering it 304 would hand back exactly the stale source the
    // header is there to prevent.
    if (req.headers["if-modified-since"] && !SOURCE.test(path)) {
      const since = Date.parse(req.headers["if-modified-since"]);
      // Second granularity: the header carries no milliseconds, so a file
      // written mid-second must not read as newer than its own response.
      if (Number.isFinite(since) && Math.floor(info.mtimeMs / 1000) * 1000 <= since) {
        res.writeHead(304, headers);
        res.end();
        return;
      }
    }

    const range = req.headers.range ? parseRange(req.headers.range, info.size) : null;
    if (req.headers.range && !range) {
      res.writeHead(416, { ...headers, "Content-Range": `bytes */${info.size}` });
      res.end();
      return;
    }

    const { start, end } = range || { start: 0, end: info.size - 1 };
    if (range) headers["Content-Range"] = `bytes ${start}-${end}/${info.size}`;
    headers["Content-Length"] = end - start + 1;
    res.writeHead(range ? 206 : 200, headers);
    if (req.method === "HEAD") { res.end(); return; }

    // Streamed rather than read whole: the asset tree runs to gigabytes and the
    // loader pulls six files at once, so buffering each one entirely into
    // memory first was the server's largest cost by a wide margin.
    const stream = createReadStream(full, { start, end });
    stream.on("error", () => res.destroy());
    stream.pipe(res);
  } catch (err) {
    // A missing file is routine and stays quiet. Anything else is a real
    // problem with the request or the tree, and being told about it beats
    // hunting a blank screen — the old catch-all reported every failure,
    // permissions included, as an indistinguishable "Not found".
    if (err.code !== "ENOENT") console.error(`${req.method} ${path} — ${err.code || err.message}`);
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
});

// The audience for this file includes people who got here by double-clicking
// play-mac.command. A raw Node stack trace tells them nothing; the port number
// and the way out tell them everything.
server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`Port ${port} is already in use — the game may already be running at http://${host}:${port}`);
    console.error(`If it is not, start on another port:  PORT=${port + 1} npm start`);
  } else if (err.code === "EACCES") {
    console.error(`Not allowed to listen on port ${port}. Try a port above 1024:  PORT=8080 npm start`);
  } else {
    console.error(`Could not start the server: ${err.message}`);
  }
  process.exit(1);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}

server.listen(port, host, () => {
  console.log(`JJK Brawler II running at http://${host}:${port}`);
});
