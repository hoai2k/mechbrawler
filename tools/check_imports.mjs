#!/usr/bin/env node
// Verify every named import resolves against what the target module exports.
//
// There is no build step here, so nothing type-checks the module graph.
// `node --check` only parses a file — it happily accepts
// `import { GONE } from "./constants.js"` for a constant that was moved or
// renamed. The failure then shows up at runtime as a blank page, which is
// exactly how moving a tuning value out of constants.js broke the action
// workbench without a single syntax error.
//
// Usage:  node tools/check_imports.mjs
// Exits non-zero when something is broken, so it can gate a commit.

import { readFileSync, readdirSync } from "fs";
import { dirname, join, normalize, relative } from "path";
import { fileURLToPath } from "url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIRS = ["src", "workbench"];

const files = DIRS.flatMap((dir) =>
  readdirSync(join(ROOT, dir))
    .filter((f) => f.endsWith(".js") || f.endsWith(".mjs"))
    .map((f) => `${dir}/${f}`)
);

/** Named exports of a module. Covers the two forms this codebase uses:
 *  `export const X` / `export function X` and `export { X, Y as Z }`. */
function namedExports(source) {
  const names = new Set();
  const decl = /export\s+(?:async\s+)?(?:function|const|let|var|class)\s+([A-Za-z_$][\w$]*)/g;
  for (const m of source.matchAll(decl)) names.add(m[1]);
  for (const m of source.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const part of m[1].split(",")) {
      const name = part.trim().split(/\s+as\s+/).pop().trim();
      if (name) names.add(name);
    }
  }
  return names;
}

const sources = new Map(files.map((f) => [f, readFileSync(join(ROOT, f), "utf8")]));
const exported = new Map([...sources].map(([f, src]) => [f, namedExports(src)]));

const problems = [];
for (const [file, source] of sources) {
  for (const m of source.matchAll(/import\s*\{([^}]*)\}\s*from\s*["'](\.[^"']+)["']/g)) {
    const target = normalize(join(dirname(file), m[2])).split("\\").join("/");
    const exp = exported.get(target);
    if (!exp) {
      problems.push(`${file}: cannot resolve "${m[2]}" (${target})`);
      continue;
    }
    for (const part of m[1].split(",")) {
      const name = part.trim().split(/\s+as\s+/)[0].trim();
      if (name && !exp.has(name)) {
        problems.push(`${file}: "${name}" is not exported by ${target}`);
      }
    }
  }
}

for (const p of problems) console.error("  " + p);
console.log(problems.length
  ? `${problems.length} broken import(s) across ${files.length} modules`
  : `all named imports resolve across ${files.length} modules`);
process.exit(problems.length ? 1 : 0);
