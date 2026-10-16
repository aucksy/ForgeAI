#!/usr/bin/env python3
"""Self-tests for the release's phone-test gate (phone_gate.py): which runs count, and that BOTH
phones (the default emulator and the owner's phone) must have passed.

Run: python3 -m unittest discover -s scripts/ci -p 'test_*.py'   (release-apk.yml runs it)

No network: the GitHub API is replaced by a small table of made-up runs and commits.
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import phone_gate as pg  # noqa: E402

DEFAULT = "Device QA (Android emulator)"
DEFAULT_EXTRA = "Device QA (Android emulator, + mk)"
OWNER = "Device QA (owner phone, api 34)"
OWNER_EXTRA = "Device QA (owner phone, api 34, + mk)"
PARTIAL_OWNER = "Device QA (partial a,b, api 34, profile owner)"
PARTIAL_API = "Device QA (partial whole run, api 36, profile default)"


class RunKind(unittest.TestCase):
    def test_whole_default_runs(self):
        self.assertEqual(pg.run_kind(DEFAULT), "default")
        self.assertEqual(pg.run_kind(DEFAULT_EXTRA), "default")

    def test_whole_owner_runs(self):
        self.assertEqual(pg.run_kind(OWNER), "owner")
        self.assertEqual(pg.run_kind(OWNER_EXTRA), "owner")

    def test_partial_runs_never_count(self):
        self.assertIsNone(pg.run_kind(PARTIAL_OWNER))
        self.assertIsNone(pg.run_kind(PARTIAL_API))
        # The old name of a whole owner run (before 16 Oct 2026) was a partial one.
        self.assertIsNone(pg.run_kind("Device QA (partial whole run, api 34, profile owner, + mk)"))


class Gate(unittest.TestCase):
    """main() against a fake API: commits A (tested) <- B (tag)."""

    def setUp(self):
        self.runs = {}      # sha -> [display_title, ...] of passing runs
        self.paper = True   # whether A -> B is paperwork only
        self.saved = (pg.api, pg.only_paperwork, pg.ci_ok, pg.say)
        pg.lines.clear()

        def api(path):
            if "/actions/workflows/" in path and "head_sha=" in path:
                sha = path.split("head_sha=")[1].split("&")[0]
                return {"workflow_runs": [
                    {"id": i, "html_url": f"u{i}", "conclusion": "success", "head_sha": sha, "display_title": t}
                    for i, t in enumerate(self.runs.get(sha, []), 1)]}
            if "/commits/" in path:
                sha = path.rsplit("/", 1)[1]
                return {"parents": [{"sha": "A"}]} if sha == "B" else {"parents": []}
            raise AssertionError(path)

        pg.api = api
        pg.only_paperwork = lambda base, head: self.paper
        pg.ci_ok = lambda sha: True
        pg.say = lambda m: pg.lines.append(m)
        env = {"GITHUB_SHA": "B", "GITHUB_REF_TYPE": "branch", "GITHUB_EVENT_NAME": "push", "SKIP_PHONE_GATE": "false"}
        self.env_before = {k: os.environ.get(k) for k in env}
        os.environ.update(env)

    def tearDown(self):
        pg.api, pg.only_paperwork, pg.ci_ok, pg.say = self.saved
        for k, v in self.env_before.items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v

    TITLE = {"default": DEFAULT, "owner": OWNER_EXTRA}

    def test_every_required_phone_on_the_commit_passes(self):
        self.runs = {"B": [DEFAULT, OWNER]}
        self.assertEqual(pg.main(), 0)

    def test_the_owner_phone_is_required(self):
        self.assertEqual(pg.PHONES, ("default", "owner"))

    def test_a_missing_required_phone_blocks(self):
        for kind in pg.PHONES:
            others = [self.TITLE[k] for k in pg.PHONES if k != kind]
            self.runs = {"B": others}
            pg.lines.clear()
            self.assertEqual(pg.main(), 1, kind)
            self.assertTrue(any(f"profile` = {kind}" in l for l in pg.lines), kind)

    def test_partial_runs_do_not_count(self):
        self.runs = {"B": [PARTIAL_OWNER, PARTIAL_API]}
        self.assertEqual(pg.main(), 1)

    def test_each_phone_may_be_covered_by_a_paperwork_parent(self):
        self.runs = {"B": [DEFAULT], "A": [OWNER]}
        self.assertEqual(pg.main(), 0)

    def test_parent_pass_does_not_cover_an_app_change(self):
        self.runs = {"A": [DEFAULT, OWNER]}
        self.paper = False
        self.assertEqual(pg.main(), 1)

if __name__ == "__main__":
    unittest.main()
