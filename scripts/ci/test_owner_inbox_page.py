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

    def test_read_marker(self):
        # #17: a READ line marks an entry read and never shows in its text.
        read = page.parse(SAMPLE.replace("**Status:** BUILT", "**READ (18 Oct, 9:05 pm, via the page)**\n**Status:** BUILT"))["entries"]
        self.assertEqual([e["read"] for e in read], [False, True])
        self.assertNotIn("READ", read[1]["body"])
        # Only the exact marker counts: a line like "**READ-ONLY files:**" is text, not a read mark.
        other = page.parse(SAMPLE.replace("**Status:** BUILT", "**READ-ONLY files:** x\n**Status:** BUILT"))["entries"][1]
        self.assertFalse(other["read"])
        self.assertIn("READ-ONLY", page.set_read(SAMPLE.replace("**Status:** BUILT", "**READ-ONLY files:** x\n**Status:** BUILT"), 1, None))
        # A heading at the very end of the file, with nothing after it, stays a clean heading.
        bare = "## 3. Last — 1 Oct 2026"
        self.assertEqual(page.set_read(bare, 3, "2 Oct"), bare + "\n**READ (2 Oct, via the page)**\n")

    def test_set_read_adds_after_status_and_removes(self):
        once = page.set_read(SAMPLE, 2, "18 Oct, 9:05 pm")
        self.assertIn("**Status:** RESEARCHED: WAITING FOR YOU\n**READ (18 Oct, 9:05 pm, via the page)**\n**My answer:**", once)
        twice = page.set_read(once, 2, "19 Oct, 8:00 am")
        self.assertEqual(twice.count("**READ"), 1)  # a second tap replaces, never stacks
        self.assertEqual(page.set_read(twice, 2, None), SAMPLE)
        self.assertEqual(page.set_read(SAMPLE, 99, "x"), SAMPLE)  # no such entry: untouched
        # The last entry (no text after its Status line ends the file) works too.
        self.assertTrue(page.set_read(SAMPLE, 1, "18 Oct").endswith("**READ (18 Oct, via the page)**\n"))

    def test_absorb_moves_read_taps_and_returns_answers(self):
        import tempfile
        with tempfile.NamedTemporaryFile("w", suffix=".md", delete=False, encoding="utf-8") as f:
            f.write(page.set_read(SAMPLE, 1, "17 Oct"))
        try:
            data = page.parse(SAMPLE)
            data.update(updated="now", read={"2": "18 Oct, 9:05 pm"}, answers={
                "2": {"picks": [], "note": "</script> a comment", "at": "18 Oct"},
                "1": {"picks": [], "note": "ok", "at": "18 Oct, 9:10 pm"}})  # #1: replied, never tapped "read"
            saved = "<!doctype html><html><body>" + page.fill(page.TEMPLATE, data) + "</body></html>"
            answers = page.absorb(saved, f.name)
            text = open(f.name, encoding="utf-8").read()
        finally:
            os.remove(f.name)
        self.assertEqual(sorted(answers), ["1", "2"])
        self.assertEqual(answers["2"]["note"], "</script> a comment")
        self.assertIn("**READ (18 Oct, 9:05 pm, via the page)**", text)
        # A sent reply counts as read after the rebuild too (the old 17 Oct mark is replaced).
        self.assertIn("**READ (18 Oct, 9:10 pm, via the page)**", text)
        self.assertEqual(text.count("**READ"), 2)

    def test_absorb_mark_as_unread_removes_the_line(self):
        import tempfile
        with tempfile.NamedTemporaryFile("w", suffix=".md", delete=False, encoding="utf-8") as f:
            f.write(page.set_read(SAMPLE, 1, "17 Oct"))
        try:
            data = page.parse(SAMPLE)
            data.update(updated="now", answers={}, read={"1": False})
            page.absorb(page.fill(page.TEMPLATE, data), f.name)
            with open(f.name, encoding="utf-8") as g:
                self.assertEqual(g.read(), SAMPLE)
        finally:
            os.remove(f.name)

    def test_page_data_needs_the_data_line(self):
        with self.assertRaises(ValueError):
            page.page_data("<html>no data</html>")


BACKLOG = """# Owner inbox
## Waiting for your decision (all in one place)

| # | Decision | My pick |
|---|---|---|

---

## Feature backlog
Every feature, built and pending.

### Member app
| Feature | Status | Details |
|---|---|---|
| Workout logging | Live | Log sets, reps and weight. |
| My membership | Next release | Plan and end date in the app. |
| Workout logging | Live | A repeat is ignored. |

### Admin app
| Feature | Status | Details |
|---|---|---|
| Staff salaries | Planned | Pay staff from the app. |
| Webcam photo | Something new | Take a photo at the desk. |

---

## 3. Third idea — 18 Oct 2026
**Chat:** Chat three
**Status:** ANSWERED
"""


class Backlog(unittest.TestCase):
    def test_parse_backlog(self):
        d = page.parse(BACKLOG)
        b = d["backlog"]
        self.assertEqual([f["name"] for f in b], ["Workout logging", "My membership", "Staff salaries", "Webcam photo"])
        self.assertEqual([f["kind"] for f in b], ["done", "built", "planned", "idea"])
        self.assertEqual(b[0]["id"], "member-app/workout-logging")
        self.assertEqual(b[2]["group"], "Admin app")
        # The backlog is not an entry, and entries still parse after it.
        self.assertEqual([e["num"] for e in d["entries"]], [3])

    def test_no_backlog(self):
        self.assertEqual(page.parse(SAMPLE)["backlog"], [])

    def test_page_has_backlog_and_to_read(self):
        html = page.fill(page.TEMPLATE, {**page.parse(BACKLOG), "updated": "x", "answers": {}, "read": {}, "notes": {}})
        self.assertIn('data-f="backlog"', html)
        self.assertIn('data-f="toread"', html)
        self.assertNotIn('id="decisions"', html)
        self.assertIn('"notes":{}', html)
        self.assertIn("Staff salaries", html)


if __name__ == "__main__":
    unittest.main()
