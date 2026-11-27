#!/usr/bin/env python3
"""Self-tests for the No Gaps card check (card_check.py). No git, no network: made-up cards and commits.

Run: python3 -m unittest discover -s scripts/ci -p 'test_card_check.py'   (ci.yml runs it)
"""
import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(__file__))
import card_check as cc  # noqa: E402


def card(cid="R-630", lane="full", status="active", done=(), **kw):
    c = {"id": cid, "title": "t", "lane": lane, "family": "a cause", "approved_by": "his words, 27 Nov 2026",
         "status": status, "gates": {g: {"done": g in done, "evidence": "run 123" if g in done else ""}
                                     for g in cc.GATES}}
    c.update(kw)
    return c


class CardProblems(unittest.TestCase):
    def test_good_active_card(self):
        self.assertEqual(cc.card_problems(card()), [])

    def test_bad_id_lane_status_family(self):
        self.assertTrue(cc.card_problems(card(cid="x")))
        self.assertTrue(cc.card_problems(card(lane="huge")))
        self.assertTrue(cc.card_problems(card(status="maybe")))
        self.assertTrue(cc.card_problems(card(family=" ")))

    def test_missing_gate(self):
        c = card()
        del c["gates"]["G6_proven"]
        self.assertTrue(cc.card_problems(c))

    def test_full_needs_his_words(self):
        self.assertTrue(cc.card_problems(card(approved_by="")))
        self.assertEqual(cc.card_problems(card(lane="standard", approved_by="")), [])

    def test_done_needs_every_lane_gate(self):
        d = tempfile.mkdtemp()
        os.makedirs(os.path.join(d, "docs", "designs"))
        open(os.path.join(d, "docs", "designs", "R-630.md"), "w").write("x")
        self.assertEqual(cc.card_problems(card(status="done", done=cc.GATES), d), [])
        self.assertTrue(cc.card_problems(card(status="done", done=cc.GATES[:-1]), d))

    def test_standard_done_skips_goldfish(self):
        done = [g for g in cc.GATES if g != "G2_goldfish"]
        self.assertEqual(cc.card_problems(card(lane="standard", status="done", done=done)), [])

    def test_full_done_needs_design_note(self):
        d = tempfile.mkdtemp()
        out = cc.card_problems(card(status="done", done=cc.GATES), d)
        self.assertTrue(any("designs" in p for p in out))

    def test_code_reading_is_not_proof(self):
        c = card(lane="light", status="done", done=cc.LANE_DONE["light"])
        c["gates"]["G6_proven"]["evidence"] = "code-read: looks right"
        self.assertTrue(any("code reading" in p for p in cc.card_problems(c)))


class Commits(unittest.TestCase):
    def test_new_id_with_app_files_needs_card(self):
        out = cc.commits_needing_cards([("a" * 40, "R-631: fix dues", ["apps/mobile/x.ts"])], {})
        self.assertEqual(len(out), 1)

    def test_old_ids_docs_only_and_carded_pass(self):
        commits = [("b" * 40, "R-629: old work", ["apps/mobile/x.ts"]),
                   ("c" * 40, "R-640: notes", ["docs/CLAUDE-NOTES.md", "README.md"]),
                   ("d" * 40, "R-630: build", ["apps/mobile/x.ts"]),
                   ("e" * 40, "no id here", ["apps/mobile/x.ts"])]
        self.assertEqual(cc.commits_needing_cards(commits, {"R-630": card()}), [])


class Release(unittest.TestCase):
    def test_open_card_blocks_release_unless_dark(self):
        cards = {"R-630": card(), "R-631": card("R-631", status="waiting"),
                 "R-632": card("R-632", dark=True), "R-633": card("R-633", status="done")}
        out = cc.release_problems(cards)
        self.assertEqual([p.split(":")[0] for p in out], ["R-630", "R-631"])


class LoadCards(unittest.TestCase):
    def test_file_name_must_match_id_and_bad_json_is_reported(self):
        d = tempfile.mkdtemp()
        os.makedirs(os.path.join(d, "docs", "changes"))
        json.dump(card("R-630"), open(os.path.join(d, "docs", "changes", "R-631.json"), "w"))
        open(os.path.join(d, "docs", "changes", "R-632.json"), "w").write("{bad")
        _, problems = cc.load_cards(d)
        self.assertTrue(any("must be 'R-631'" in p for p in problems))
        self.assertTrue(any("not valid JSON" in p for p in problems))


if __name__ == "__main__":
    unittest.main()
