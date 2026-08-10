// Writes docs/move-list.md from the kits themselves.
//
// The move list is the one document that is pure data — every name, every
// description and every cooldown in it already exists in src/characters.js,
// and a hand-maintained copy would be wrong within a round. So it is generated:
//
//   node tools/build_move_list.mjs
//
// Run it after touching any kit. `--check` re-generates into memory and fails
// if the committed file differs, which is the form CI would want.
//
// characters.md is the companion and is NOT generated: it explains why a kit is
// the way it is, which is a thing a person writes.

import { writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "docs/move-list.md");

const { CHARACTERS, STAGED_CHARACTER_KEYS } = await import("../src/characters.js");
const { CHARACTER_GROUPS } = await import("../src/config_menus.js");

const SLOTS = [
  ["neutral", "Neutral special"],
  ["side", "Side special"],
  ["down", "Down special"],
];

/** Markdown-safe cell text: pipes would split the column, newlines the row. */
const cell = (s) => String(s ?? "—").replace(/\|/g, "\\|").replace(/\s*\n\s*/g, " ").trim();

/** The creatures a summon special can roll, where it rolls one
 *  (config_summons.js). Named in the detail block because "which creature"
 *  is the move for those four kits. */
function poolNames(move) {
  return (move?.p?.pool || []).map((entry) => entry.name).filter(Boolean);
}

function moveLine(move) {
  if (!move) return "—";
  return `**${move.name}** — ${move.desc || "no description"}`;
}

/** GitHub builds heading anchors from the heading text, which here contains
 *  quotes and em dashes and would give the roster table something fragile to
 *  link at. An explicit anchor keeps the link the character's key. */
const anchor = (key) => `<a id="${key}"></a>`;

const rows = [];
const blocks = [];

for (const group of CHARACTER_GROUPS) {
  for (const key of group.members) {
    const c = CHARACTERS[key];
    if (!c) continue;
    const domain = c.domains?.[0];
    rows.push([
      `[${c.name}](#${key})`,
      group.label,
      ...SLOTS.map(([slot]) => c.specials[slot]?.name ?? "—"),
      c.ultimate?.name ?? "—",
      domain?.name ?? "—",
    ]);

    const lines = [];
    lines.push(anchor(key));
    lines.push("");
    lines.push(`### ${c.fullName} — "${c.epithet}"`);
    lines.push("");
    lines.push(`*${group.label} · \`${key}\` · theme \`${c.theme}\`*`);
    lines.push("");
    for (const [slot, label] of SLOTS) {
      const move = c.specials[slot];
      const cd = move?.cooldown ? ` *(${move.cooldown}s cooldown)*` : "";
      lines.push(`- ${label}${cd} — ${moveLine(move)}`);
      const pool = poolNames(move);
      if (pool.length) {
        lines.push(`  - *Rolls one per cast:* ${pool.join(" · ")}`);
      }
    }
    lines.push(`- Ultimate — ${moveLine(c.ultimate)}`);
    for (const d of c.domains || []) {
      lines.push(`- Domain Expansion — ${moveLine(d)}`);
      if (d.howTo) lines.push(`  - *How it plays:* ${d.howTo}`);
    }
    lines.push(`- Passive — **${c.passive.name}** — ${c.passive.desc}`);
    blocks.push(lines.join("\n"));
  }
}

const withDomains = rows.filter((r) => r.at(-1) !== "—").length;
const staged = STAGED_CHARACTER_KEYS.length;

const head = `# JJK Brawler II — Move List

Every fighter's three specials, their ultimate and their Domain Expansion.

**This file is generated** from \`src/characters.js\` by
\`tools/build_move_list.mjs\` — do not edit it by hand, edit the kit and
re-run. Its companions are [characters.md](characters.md), which explains *why*
each kit is the way it is, and [game-mechanics.md](game-mechanics.md), which
explains the systems the moves are built from.

**${rows.length} fighters**${staged ? `, ${staged} of them staged and not yet selectable` : ""} — every one with three specials and an
ultimate, and **${withDomains}** of them with a Domain Expansion as well.

An ultimate and a Domain Expansion each cost the **whole** meter bar, so a
fighter who has both is choosing between them every time the bar fills. Specials
are free and run on individual cooldowns instead.

## The whole roster

| Fighter | Group | Neutral special | Side special | Down special | Ultimate | Domain Expansion |
|---|---|---|---|---|---|---|
${rows.map((r) => `| ${r.map(cell).join(" | ")} |`).join("\n")}

## Every kit in full
`;

const doc = `${head}\n${blocks.join("\n\n")}\n`;

if (process.argv.includes("--check")) {
  const current = readFileSync(OUT, "utf8");
  if (current !== doc) {
    console.error("docs/move-list.md is out of date — run: node tools/build_move_list.mjs");
    process.exit(1);
  }
  console.log(`docs/move-list.md is up to date (${rows.length} fighters)`);
} else {
  writeFileSync(OUT, doc);
  console.log(`wrote docs/move-list.md — ${rows.length} fighters, ${withDomains} domains`);
}
