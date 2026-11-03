#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Read one version's entry out of CHANGELOG.md or CHANGELOG.zh-CN.md.

GitHub Release notes are bilingual (Chinese first) via release-notes.py.
This script is the single-language reader the release workflow uses to
refuse a tag that has no entry.

Usage:
    Scripts/changelog.py 0.1.0
    Scripts/changelog.py 0.1.0 --zh
    Scripts/changelog.py 0.1.0 --html

The entry is hand-written. Commit subjects are the wrong source: they
describe the diff, not what a person installing the app should know.

Exits 1 when there is no entry.
"""

from __future__ import annotations

import html
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CHANGELOG = ROOT / "CHANGELOG.md"
CHANGELOG_ZH = ROOT / "CHANGELOG.zh-CN.md"


def entry(version: str, path: Path | None = None) -> str | None:
    """The markdown under `## <version>`, up to the next version heading."""
    changelog = path or CHANGELOG
    if not changelog.exists():
        return None

    text = changelog.read_text()
    pattern = rf"^## {re.escape(version)}\s*$(.*?)(?=^## |\Z)"
    match = re.search(pattern, text, re.M | re.S)
    if not match:
        return None

    body = match.group(1).strip()
    return body or None


def as_html(markdown: str) -> str:
    """The small subset the changelog is written in, turned into HTML.

    Bullets, bold, inline code and links. Everything is escaped first, so a
    stray `<` stays text. Kept so a later Sparkle feed can reuse the same
    notes without a new grammar.
    """
    lines: list[str] = []
    for raw in markdown.splitlines():
        line = raw.strip()
        if not line:
            continue

        escaped = html.escape(re.sub(r"^[-*]\s+", "", line))
        addresses: list[str] = []

        def park(match: re.Match[str]) -> str:
            addresses.append(match.group(2))
            return f'<a href="\x00{len(addresses) - 1}\x00">{match.group(1)}</a>'

        escaped = re.sub(r"\[(.+?)\]\((https?://[^)\s]+)\)", park, escaped)
        escaped = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", escaped)
        escaped = re.sub(r"`(.+?)`", r"<code>\1</code>", escaped)
        escaped = re.sub(r"\x00(\d+)\x00", lambda m: addresses[int(m.group(1))], escaped)

        lines.append(f"<li>{escaped}</li>" if line.startswith(("- ", "* ")) else f"<p>{escaped}</p>")

    out: list[str] = []
    inside = False
    for line in lines:
        if line.startswith("<li>") and not inside:
            out.append("<ul>")
            inside = True
        elif not line.startswith("<li>") and inside:
            out.append("</ul>")
            inside = False
        out.append(line)
    if inside:
        out.append("</ul>")

    return "".join(out)


def main() -> None:
    if len(sys.argv) < 2:
        sys.exit(__doc__)

    version = sys.argv[1]
    use_zh = "--zh" in sys.argv
    path = CHANGELOG_ZH if use_zh else CHANGELOG
    found = entry(version, path)
    if not found:
        label = "CHANGELOG.zh-CN.md" if use_zh else "CHANGELOG.md"
        sys.exit(f"{label} has no entry for {version}")

    print(as_html(found) if "--html" in sys.argv else found)


if __name__ == "__main__":
    main()
