"""Tests for qa_shards.py: the split whole phone run (owner decision 17 Oct 2026, OWNER-INBOX #14)."""
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import qa_shards  # noqa: E402


def write(root, shard, text):
    os.makedirs(os.path.join(root, shard), exist_ok=True)
    with open(os.path.join(root, shard, "shard-done.txt"), "w", encoding="utf-8") as f:
        f.write(text)


class Shards(unittest.TestCase):
    def test_the_shards_hold_exactly_the_whole_run(self):
        self.assertEqual(qa_shards.problems(), [])
        got = [p for _, parts in qa_shards.SHARDS for p in parts.split() if p != "none"]
        self.assertEqual(sorted(got), sorted(qa_shards.expected()))

    def test_chains_stay_together_in_the_scripts_order(self):
        old, uat, _ = qa_shards.script_lists()
        shard_of = {p: name for name, parts in qa_shards.SHARDS for p in parts.split()}
        # A..R is one chain (runs 39015325103 / 39015326627: J..R from the demo alone failed).
        self.assertEqual({shard_of[p] for p in old[: old.index("r") + 1]}, {"1-history-routines"})
        # BR .. M passed from the demo alone; M (it reinstalls the app) runs last of the old parts there.
        self.assertEqual({shard_of[p] for p in old[old.index("br"):]}, {"2-gym-backup"})
        # The UAT parts and W start fresh; in shard 2 they run after M, as in the whole run.
        self.assertTrue(all(shard_of[p] != "1-history-routines" for p in uat + ["w"]))

    def test_a_part_missing_or_twice_is_caught(self):
        drop = [(n, p.replace(" m", "")) for n, p in qa_shards.SHARDS]
        self.assertIn("part m is in the whole run but in no shard", qa_shards.problems(drop))
        twice = qa_shards.SHARDS + [("5-x", "w")]
        self.assertIn("part w is in more than one shard", qa_shards.problems(twice))
        alien = qa_shards.SHARDS + [("5-x", "zz")]
        self.assertIn("part zz is in a shard but not in the whole run", qa_shards.problems(alien))

    def test_matrix_whole_run_canary_shards_extras_with_w(self):
        m = qa_shards.matrix("", "dnd,mk")["include"]
        self.assertEqual(m[0], {"shard": "0-canary", "parts": "", "only": qa_shards.CANARY, "extra": ""})
        shards = [row for row in m if row["only"] == ""]
        # No "uat" asked for: the extras-only shards 5 and 6 have nothing to run and are left out.
        self.assertEqual([r["shard"] for r in shards], ["1-history-routines", "2-gym-backup", "3-uat-a", "4-workout"])
        with_w = [row for row in m if "w" in row["parts"].split()]
        self.assertEqual(len(with_w), 1)
        self.assertEqual(with_w[0]["extra"], "dnd mk")
        self.assertTrue(all(row["extra"] == "" for row in shards if row is not with_w[0]))

    def test_matrix_splits_the_uat_chain(self):
        m = {r["shard"]: r for r in qa_shards.matrix("", "uat,dnd")["include"]}
        self.assertEqual(m["4-workout"]["extra"], "dnd uatc")
        self.assertEqual(m["5-uat-b"]["parts"], "none")
        got = (m["5-uat-b"]["extra"] + " " + m["6-uat-c"]["extra"]).split()
        self.assertEqual(sorted(got), sorted(qa_shards.uat_parts()))

    def test_matrix_affected_piece(self):
        m = qa_shards.matrix("", "", affected="u401,u438,u336")["include"]
        self.assertEqual(m[1], {"shard": "0-affected", "parts": "", "only": "u401 u438 u336", "extra": ""})
        many = ",".join(qa_shards.expected()[: qa_shards.AFFECTED_MAX + 1])
        self.assertFalse(any(r["shard"] == "0-affected" for r in qa_shards.matrix("", "", affected=many)["include"]))
        self.assertFalse(any(r["shard"] == "0-affected" for r in qa_shards.matrix("", "")["include"]))

    def test_matrix_partial_run_is_one_piece(self):
        m = qa_shards.matrix("uf, uk", "")["include"]
        self.assertEqual(m, [{"shard": "partial", "parts": "", "only": "uf uk", "extra": ""}])

    def test_check_passes_only_when_every_shard_finished_green(self):
        with tempfile.TemporaryDirectory() as root:
            for name, parts in qa_shards.SHARDS:
                if parts != "none":
                    write(root, name, "parts=%s\nextra=\nstatus=0\n" % parts)
            self.assertEqual(qa_shards.check(root), [])
            name, parts = qa_shards.SHARDS[1]
            write(root, name, "parts=%s\nextra=\nstatus=1\n" % parts)
            self.assertTrue(any("ended with a failure" in e for e in qa_shards.check(root)))
            os.remove(os.path.join(root, name, "shard-done.txt"))
            errs = qa_shards.check(root)
            self.assertTrue(any("has no shard-done.txt" in e for e in errs))
            self.assertTrue(any(e.startswith("parts never run: ") and " m" in " " + e for e in errs))

    def test_check_catches_a_shard_that_ran_other_parts(self):
        with tempfile.TemporaryDirectory() as root:
            for name, parts in qa_shards.SHARDS:
                if parts != "none":
                    write(root, name, "parts=%s\nextra=\nstatus=0\n" % parts)
            name, parts = qa_shards.SHARDS[0]
            write(root, name, "parts=%s\nextra=\nstatus=0\n" % parts.replace(" i2", ""))
            errs = qa_shards.check(root)
            self.assertTrue(any("shard 1-history-routines ran" in e for e in errs))
            self.assertTrue(any(e == "parts never run: i2" for e in errs))

    def test_check_wants_the_split_uat_extras(self):
        ex = qa_shards.shard_extras("uat")
        with tempfile.TemporaryDirectory() as root:
            for name, parts in qa_shards.SHARDS:
                write(root, name, "parts=%s\nextra=%s\nstatus=0\n" % (parts, ex[name]))
            self.assertEqual(qa_shards.check(root, extra="uat"), [])
            write(root, "6-uat-c", "parts=none\nextra=u401\nstatus=0\n")
            self.assertTrue(any("shard 6-uat-c ran the extras" in e for e in qa_shards.check(root, extra="uat")))
            os.remove(os.path.join(root, "5-uat-b", "shard-done.txt"))
            self.assertTrue(any("5-uat-b" in e for e in qa_shards.check(root, extra="uat")))

    def test_the_uat_split_covers_the_chain(self):
        split = [p for v in qa_shards.UAT_SPLIT.values() for p in v.split() if p != "uatc"]
        self.assertEqual(sorted(split), sorted(qa_shards.uat_parts()))
        self.assertEqual(len(split), len(set(split)))

    def test_the_runner_knows_shards(self):
        text = open(qa_shards.SCRIPT, encoding="utf-8").read()
        self.assertIn('QA_SHARD_LIST=$(qa_list "${QA_SHARD:-}")', text)
        self.assertIn("shard-done.txt", text)
        # A shard is part of a whole run: a missing server function still FAILS it (U-G4).
        self.assertIn('if [ -z "$QA_ONLY_LIST" ]; then\n    status=1', text)

    def test_the_workflow_builds_once_and_checks_every_shard(self):
        wf = open(os.path.join(qa_shards.ROOT, ".github", "workflows", "qa-device.yml"), encoding="utf-8").read()
        self.assertEqual(wf.count("./gradlew assembleRelease"), 1)
        self.assertIn("fail-fast: true", wf)
        self.assertIn("cancel-in-progress: true", wf)
        self.assertIn("QA_FAILFAST=", wf)
        self.assertIn("needs.build.outputs.sha256", wf)
        self.assertIn('python3 scripts/ci/qa_shards.py check qa-out "${{ inputs.extra }}"', wf)
        self.assertIn('QA_SHARD="${{ matrix.parts }}"', wf)


if __name__ == "__main__":
    unittest.main()
