#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Throwaway Sparkle signing for the E2E fixture.

The key is generated in the directory passed on the command line. This script
never reads or writes Scripts/sparkle-public-key.txt or SPARKLE_PRIVATE_KEY.
"""

from __future__ import annotations

import base64
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
REAL_PUBLIC_KEY = ROOT / "Scripts" / "sparkle-public-key.txt"
REAL_PUBLIC_VALUE = "M/xUmNfKp+sEloy822L8X4lVdOLM1pv9srD7fw/bgb8="


def generate_keypair(directory: Path) -> tuple[str, Path]:
    directory.mkdir(parents=True, exist_ok=True)
    pem = directory / "throwaway-ed25519.pem"
    subprocess.check_call(
        ["openssl", "genpkey", "-algorithm", "ED25519", "-out", str(pem)],
        stdout=subprocess.DEVNULL,
    )
    der = subprocess.check_output(["openssl", "pkey", "-in", str(pem), "-pubout", "-outform", "DER"])
    if len(der) < 32:
        sys.exit("Ed25519 public key DER was shorter than 32 bytes.")
    public = base64.b64encode(der[-32:]).decode("ascii")
    if public == REAL_PUBLIC_VALUE:
        sys.exit("Refusing a generated key that matches the shipped SUPublicEDKey.")
    (directory / "throwaway-public-key.txt").write_text(public + "\n", encoding="utf-8")
    return public, pem


def sign_file(archive: Path, pem: Path) -> str:
    signature = archive.with_name(archive.name + ".ed25519")
    subprocess.check_call(
        ["openssl", "pkeyutl", "-sign", "-inkey", str(pem), "-rawin", "-in", str(archive), "-out", str(signature)],
        stdout=subprocess.DEVNULL,
    )
    encoded = base64.b64encode(signature.read_bytes()).decode("ascii")
    signature.unlink()
    return encoded


def appcast(version: str, url: str, signature: str, length: int) -> str:
    return f"""<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0" xmlns:sparkle="http://www.andymatuschak.org/xml-namespaces/sparkle">
    <channel>
        <title>BlinkyBot E2E</title>
        <link>{url}</link>
        <description>Local fixture feed. Not the release feed.</description>
        <language>en</language>
        <item>
            <title>{version}</title>
            <sparkle:version>999</sparkle:version>
            <sparkle:shortVersionString>{version}</sparkle:shortVersionString>
            <sparkle:minimumSystemVersion>14.0</sparkle:minimumSystemVersion>
            <enclosure url="{url}" length="{length}" type="application/octet-stream" sparkle:edSignature="{signature}" />
        </item>
    </channel>
</rss>
"""


def _inside(child: Path, parent: Path) -> bool:
    try:
        child.resolve().relative_to(parent.resolve())
        return True
    except ValueError:
        return False


def guard_output(directory: Path) -> None:
    resolved = directory.resolve()
    if resolved == ROOT.resolve() or _inside(REAL_PUBLIC_KEY, resolved):
        sys.exit(f"Refusing to write a test key under {resolved}.")
    if resolved == REAL_PUBLIC_KEY.parent.resolve():
        sys.exit("Refusing to write a test key next to the shipped public key.")


def write_fixture(directory: Path, feed_url: str, version: str = "9.9.9") -> str:
    guard_output(directory)
    public, pem = generate_keypair(directory)
    archive = directory / f"BlinkyBot-{version}.zip"
    archive.write_bytes(b"PK\x05\x06" + b"\x00" * 18)
    signature = sign_file(archive, pem)
    xml = appcast(version, feed_url, signature, archive.stat().st_size)
    (directory / "appcast.xml").write_text(xml, encoding="utf-8")
    return public


def main() -> None:
    if len(sys.argv) != 3:
        sys.exit("Usage: e2e/sparkle_sign.py <output-dir> <enclosure-url>")
    public = write_fixture(Path(sys.argv[1]), sys.argv[2])
    if REAL_PUBLIC_KEY.read_text(encoding="utf-8").strip() != REAL_PUBLIC_VALUE:
        sys.exit("Scripts/sparkle-public-key.txt changed while preparing the fixture.")
    print(public)


if __name__ == "__main__":
    main()
