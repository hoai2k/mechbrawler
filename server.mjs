import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const port = process.env.PORT || 5174;

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ico": "image/x-icon",
  ".webmanifest": "application/manifest+json",
};

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    let path = normalize(decodeURIComponent(url.pathname)).replace(/^([.]{2}[/\\])+/, "");
    // serve index.html for any directory path (/, /workbench/, ...)
    if (path.endsWith("/") || path.endsWith("\\")) path += "index.html";
    const file = await readFile(join(root, path));
    const cache = /\.(png|jpg|jpeg|webp|mp3|wav)$/i.test(path) ? "max-age=3600" : "no-cache";
    res.writeHead(200, {
      "Content-Type": TYPES[extname(path).toLowerCase()] || "application/octet-stream",
      "Cache-Control": cache,
    });
    res.end(file);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}).listen(port, () => {
  console.log(`JJK Brawler II running at http://127.0.0.1:${port}`);
});
