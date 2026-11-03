#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""The fixture signer verifies, and it leaves the shipped public key alone."""

from __future__ import annotations

import base64
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import sparkle_sign


class FixtureSignTests(unittest.TestCase):
    def test_signature_matches_the_throwaway_public_key(self) -> None:
        with tempfile.TemporaryDirectory() as raw:
            directory = Path(raw)
            public = sparkle_sign.write_fixture(directory, "http://127.0.0.1:9/BlinkyBot-9.9.9.zip")
            self.assertNotEqual(public, sparkle_sign.REAL_PUBLIC_VALUE)
            archive = directory / "BlinkyBot-9.9.9.zip"
            signature = base64.b64decode(self.signature_from_feed(directory / "appcast.xml"))
            pem = directory / "throwaway-ed25519.pem"
            pub_pem = directory / "pub.pem"
            subprocess.check_call(["openssl", "pkey", "-in", str(pem), "-pubout", "-out", str(pub_pem)], stdout=subprocess.DEVNULL)
            sig_file = directory / "sig"
            sig_file.write_bytes(signature)
            subprocess.check_call(
                ["openssl", "pkeyutl", "-verify", "-pubin", "-inkey", str(pub_pem), "-rawin", "-in", str(archive), "-sigfile", str(sig_file)],
                stdout=subprocess.DEVNULL,
            )
            der = subprocess.check_output(["openssl", "pkey", "-in", str(pem), "-pubout", "-outform", "DER"])
            self.assertEqual(base64.b64encode(der[-32:]).decode("ascii"), public)
            shipped = sparkle_sign.REAL_PUBLIC_KEY.read_text(encoding="utf-8").strip()
            self.assertEqual(shipped, sparkle_sign.REAL_PUBLIC_VALUE)
            self.assertIn("9.9.9", (directory / "appcast.xml").read_text(encoding="utf-8"))

    def test_refuses_the_directory_that_holds_the_shipped_key(self) -> None:
        with self.assertRaises(SystemExit):
            sparkle_sign.write_fixture(sparkle_sign.REAL_PUBLIC_KEY.parent, "http://127.0.0.1/nope.zip")
        self.assertEqual(sparkle_sign.REAL_PUBLIC_KEY.read_text(encoding="utf-8").strip(), sparkle_sign.REAL_PUBLIC_VALUE)

    def signature_from_feed(self, path: Path) -> str:
        for line in path.read_text(encoding="utf-8").splitlines():
            if "edSignature=" in line:
                return line.split('edSignature="', 1)[1].split('"', 1)[0]
        self.fail("feed has no signature")


if __name__ == "__main__":
    unittest.main()
