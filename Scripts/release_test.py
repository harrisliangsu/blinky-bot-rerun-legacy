#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Checks the release notes. No Mac required. Symlink checks live in plan.test.mjs."""

from __future__ import annotations

import importlib.util
import os
import subprocess
import sys
import unittest
from pathlib import Path

RELEASE = Path(__file__).resolve().parent


def load(name: str, filename: str):
    spec = importlib.util.spec_from_file_location(name, RELEASE / filename)
    if spec is None or spec.loader is None:
        raise RuntimeError(filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


changelog = load("changelog", "changelog.py")
release_notes = load("release_notes", "release-notes.py")


class ChangelogTest(unittest.TestCase):
    def test_english_and_chinese_entries_exist(self) -> None:
        english = changelog.entry("0.1.0")
        chinese = changelog.entry("0.1.0", changelog.CHANGELOG_ZH)
        self.assertIsNotNone(english)
        self.assertIsNotNone(chinese)
        assert english is not None and chinese is not None
        self.assertIn("Mac app", english)
        self.assertIn("AGPL-3.0-only", english)
        self.assertIn("Mac 应用", chinese)
        self.assertIn("AGPL-3.0-only", chinese)

    def test_missing_version_is_none(self) -> None:
        self.assertIsNone(changelog.entry("9.9.9"))

    def test_html_escapes_and_formats(self) -> None:
        html = changelog.as_html("- **Title.** Use `code` and <tag>. See [docs](https://example.com/a).")
        self.assertIn("<ul>", html)
        self.assertIn("<strong>Title.</strong>", html)
        self.assertIn("<code>code</code>", html)
        self.assertIn("&lt;tag&gt;", html)
        self.assertIn('href="https://example.com/a"', html)
        self.assertNotIn("<tag>", html)

    def test_cli_rejects_a_missing_entry(self) -> None:
        result = subprocess.run(
            [sys.executable, str(RELEASE / "changelog.py"), "9.9.9"],
            capture_output=True,
            text=True,
        )
        self.assertEqual(result.returncode, 1)
        self.assertIn("CHANGELOG.md", result.stderr)


class ReleaseNotesTest(unittest.TestCase):
    def test_bilingual_body_for_first_release(self) -> None:
        os.environ["GITHUB_REPOSITORY"] = "harrisliangsu/blinky-bot"
        body = release_notes.build("0.1.0")
        self.assertIn("BlinkyBot 0.1.0", body)
        self.assertIn("BlinkyBot-0.1.0.dmg", body)
        self.assertIn("BlinkyBot-0.1.0.zip", body)
        self.assertIn("AGPL-3.0-only", body)
        self.assertIn("Apple Silicon", body)
        self.assertIn("首次安装", body)
        self.assertIn("First install", body)
        self.assertIn("https://github.com/harrisliangsu/blinky-bot/releases/tag/v0.1.0", body)
        self.assertNotIn("Pulse", body)
        self.assertNotIn("Sparkle", body)
        self.assertIsNone(release_notes.previous_version("0.1.0"))

    def test_cli_prints_the_body(self) -> None:
        env = {**os.environ, "GITHUB_REPOSITORY": "harrisliangsu/blinky-bot"}
        result = subprocess.run(
            [sys.executable, str(RELEASE / "release-notes.py"), "0.1.0"],
            capture_output=True,
            text=True,
            env=env,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("## 安装", result.stdout)
        self.assertIn("## Install", result.stdout)


if __name__ == "__main__":
    unittest.main()
