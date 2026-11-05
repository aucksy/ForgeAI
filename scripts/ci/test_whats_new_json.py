#!/usr/bin/env python3
"""Self-tests for whats_new_json.py (R-336). Run: python3 -m unittest discover -s scripts/ci -p 'test_*.py'"""
import json
import os
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import whats_new_json as wn  # noqa: E402

ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
WHATS_NEW = os.path.join(ROOT, "apps", "mobile", "src", "lib", "whatsNew.ts")

SAMPLE = """
export const WHATS_NEW_LOG: readonly WhatsNewEntry[] = [
  {
    version: '0.9.1',
    date: '1 Nov',
    lines: [
      { text: 'One.' },
      // { text: 'not a line' },
      { text: "Two,   with  spaces.", go: { label: 'Open', href: '/workout' } },
      { text: 'Three.' },
      { text: 'Four.' },
    ],
  },
  { version: '0.9.0', date: '1 Oct', lines: [{ text: 'Older.' }] },
];
"""


class WhatsNewJsonTest(unittest.TestCase):
    def test_first_three_lines_of_that_version(self):
        self.assertEqual(wn.whats_new_payload(SAMPLE, "0.9.1"), {"version": "0.9.1", "lines": ["One.", "Two, with spaces.", "Three."]})
        self.assertEqual(wn.whats_new_payload(SAMPLE, "0.9.0"), {"version": "0.9.0", "lines": ["Older."]})
        self.assertEqual(wn.whats_new_payload(SAMPLE, "1.0.0"), {"version": "1.0.0", "lines": []})

    def test_writes_the_file_from_a_tag(self):
        with tempfile.TemporaryDirectory() as d:
            src = os.path.join(d, "w.ts")
            out = os.path.join(d, "whats-new.json")
            with open(src, "w", encoding="utf-8") as f:
                f.write(SAMPLE)
            self.assertEqual(wn.main(["x", "v0.9.1", src, out]), 0)
            with open(out, encoding="utf-8") as f:
                self.assertEqual(json.load(f)["lines"][0], "One.")
            self.assertEqual(wn.main(["x", "latest", src, out]), 2)

    def test_the_real_file_reads(self):
        with open(WHATS_NEW, encoding="utf-8") as f:
            src = f.read()
        p = wn.whats_new_payload(src, "0.72.0")
        self.assertTrue(1 <= len(p["lines"]) <= 3)


if __name__ == "__main__":
    unittest.main()
