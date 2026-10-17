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
**Decide:** Pick one
- A: First way (recommended)
- B: Second way

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

    def test_choices(self):
        e2 = page.parse(SAMPLE)["entries"][0]
        self.assertEqual(e2["decides"], [{"q": "Pick one", "opts": [
            {"key": "A", "text": "First way", "rec": True}, {"key": "B", "text": "Second way", "rec": False}]}])
        self.assertNotIn("**Decide:**", e2["body"])
        decided = page.parse(SAMPLE.replace("**You asked:** b", "**DECIDED (17 Oct):** A"))["entries"][0]
        self.assertEqual(decided["decides"], [])

    def test_the_page_carries_its_own_template_and_markers_appear_once(self):
        self.assertEqual(page.TEMPLATE.count("__TPL__"), 1)
        self.assertEqual(page.TEMPLATE.count("__DATA__"), 1)
        html = page.fill(page.TEMPLATE, {"entries": [], "answers": {}})
        # The code lines are filled; the saved template copy (one JSON line) keeps its markers.
        import re
        self.assertIsNone(re.search(r"^const TPL = __TPL__;$", html, re.M))
        self.assertIsNone(re.search(r"^const DATA = __DATA__;$", html, re.M))
        self.assertIn("const TPL = ", html)

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
        self.assertIn("\\u003c/script> stays text", html)
        self.assertNotIn("</script> stays text", html)
        self.assertTrue(html.startswith("<title>Owner Inbox</title>"))


if __name__ == "__main__":
    unittest.main()
