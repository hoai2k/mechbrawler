#!/usr/bin/env python3
"""Every relative link and anchor in the repo's markdown resolves.

Written after a restructure moved `asset-pipeline.md` and `pose-brief.md` into
`sprites/docs/` and the workbench into `sprites/workbench/`, which silently
broke eleven links across four files — including the one line in
`docs/asset-requests.md` that tells an artist to read the pose brief before
drawing anything. Nothing failed; the links just went nowhere, and the only
reason they were found is that somebody happened to check.

Docs are the interface to everybody who is not reading the code, so a dead link
in them is a real defect and this is cheap to run:

    python3 tools/check_doc_links.py

Checks two things and deliberately nothing else:

  * a relative link points at a file that exists
  * a `#fragment` into a markdown file matches a heading — or an explicit
    `<a id="...">` — in it

External links are not fetched (that would fail on a plane), and image links
are checked as files like any other.
"""
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, ".."))

# Directories with nothing hand-written in them, or vendored copies whose links
# are somebody else's problem.
SKIP_DIRS = {".git", "node_modules", "vendor", "assets", "sprites/assets"}

LINK = re.compile(r"\[[^\]]*\]\(([^)\s]+)\)")
# Markdown allows an explicit anchor that no heading corresponds to, and
# docs/move-list.md — which is generated — uses one per fighter so its roster
# table can link to short `#yuji` targets instead of to the full heading text.
# Missing these reports 27 failures on a file that is entirely correct.
HTML_ANCHOR = re.compile(r"""<a\s+(?:id|name)=["']([^"']+)["']""", re.I)


def slug(heading):
    """GitHub's anchor rule: lowercase, drop punctuation, spaces to hyphens.

    Note it does NOT collapse runs of spaces, which is why a heading with an
    em dash ("Round 18 — delivered") anchors as `round-18--delivered` with two
    hyphens. Getting that wrong reports false failures on every heading in the
    request docs, which all use em dashes.
    """
    h = heading.strip().lstrip("#").strip().lower().replace("`", "")
    return re.sub(r"[^\w\s-]", "", h).replace(" ", "-")


def markdown_files():
    for base, dirs, names in os.walk(ROOT):
        rel = os.path.relpath(base, ROOT)
        rel = "" if rel == "." else rel
        dirs[:] = [d for d in dirs
                   if d not in SKIP_DIRS and os.path.join(rel, d) not in SKIP_DIRS]
        for name in names:
            if name.endswith(".md"):
                yield os.path.join(base, name)


def headings(path):
    """Every anchor a link in this file can legitimately target."""
    out = set()
    fenced = False
    for line in open(path, encoding="utf-8", errors="replace"):
        if line.startswith("```"):
            fenced = not fenced
        elif not fenced:
            if line.startswith("#"):
                out.add(slug(line))
            out.update(HTML_ANCHOR.findall(line))
    return out


def main():
    files = sorted(markdown_files())
    anchors = {f: headings(f) for f in files}
    problems = []
    for path in files:
        base = os.path.dirname(path)
        text = open(path, encoding="utf-8", errors="replace").read()
        for match in LINK.finditer(text):
            target = match.group(1)
            if target.startswith(("http://", "https://", "mailto:", "#!")):
                continue
            file_part, _, frag = target.partition("#")
            # A query string is part of the URL, not of the path. The workbench
            # router reads `/workbench/?edit=audio`, so eight honest links in
            # README.md and docs/audio-requests.md were reported as missing
            # files that were sitting right there.
            file_part = file_part.partition("?")[0]
            resolved = path if not file_part else os.path.normpath(os.path.join(base, file_part))
            if file_part and not os.path.exists(resolved):
                problems.append((path, target, "no such file"))
                continue
            # Only markdown has headings to point into; a fragment on anything
            # else (a source file on GitHub, say) is not ours to verify.
            if frag and resolved in anchors and frag not in anchors[resolved]:
                problems.append((path, target, "no such heading"))

    for path, target, why in problems:
        print(f"FAIL {os.path.relpath(path, ROOT)}   {target}   ({why})")
    print(f"\n{len(files)} markdown file(s) checked; "
          f"{len(problems) or 'no'} broken link(s)")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
