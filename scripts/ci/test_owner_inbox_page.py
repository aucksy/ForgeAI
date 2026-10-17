"""Tests for owner_inbox_page.py (docs/OWNER-INBOX.md #15): the page holds every entry and decision."""
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import owner_inbox_page as page  # noqa: E402

SAMPLE = """# Owner inbox
## Waiting for your decision (all in one place)

| # | Decision | My pick |
|---|---|---|
| 2 | Pick A or B | A |

---

## 2. Second idea — 17 Oct 2026
**Chat:** Chat two — https://claude.ai/code/session_x
**You asked:** b
**Status:** RESEARCHED: WAITING FOR YOU
**My answer:** </script> stays text

## 1. First idea — 16 Oct 2026
**Chat:** Chat one
**Status:** BUILT, NOT RELEASED (commit abc)
"""


class Page(unittest.TestCase):
    def test_parse(self):
        d = page.parse(SAMPLE)
        self.assertEqual(d["decisions"], [["2", "Pick A or B", "A"]])
        self.assertEqual([e["num"] for e in d["entries"]], [2, 1])
        e2, e1 = d["entries"]
        self.assertEqual((e2["chat"], e2["chatUrl"], e2["kind"]), ("Chat two", "https://claude.ai/code/session_x", "waiting"))
        self.assertEqual((e1["chat"], e1["chatUrl"], e1["kind"]), ("Chat one", "", "built"))
        self.assertNotIn("**Chat:**", e2["body"])
        self.assertNotIn("**Status:**", e2["body"])

    def test_the_real_inbox_has_a_chat_on_every_entry(self):
        d = page.parse(open(page.INBOX, encoding="utf-8").read())
        self.assertTrue(d["entries"])
        self.assertTrue(all(e["chat"] != "Unknown chat" for e in d["entries"]))
        nums = [e["num"] for e in d["entries"]]
        self.assertEqual(nums, sorted(nums, reverse=True))

    def test_build_never_closes_its_own_script(self):
        import tempfile
        with tempfile.NamedTemporaryFile("w", suffix=".md", delete=False, encoding="utf-8") as f:
            f.write(SAMPLE)
        try:
            html = page.build(f.name)
        finally:
            os.remove(f.name)
        self.assertIn("<\\/script> stays text", html)
        self.assertTrue(html.startswith("<title>Owner Inbox</title>"))


if __name__ == "__main__":
    unittest.main()
