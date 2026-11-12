"""Tests for the phone-test scroll lint (flow_scroll_lint.py) and the "flows to check" list (flows_to_check.py),
12 Nov 2026. Seconds; no emulator, no network."""
import os
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import flow_scroll_lint as L  # noqa: E402
import flows_to_check as F  # noqa: E402

HAS_YAML = L.yaml is not None
WORDS = {"Share to an AI app", "Ask an AI", "Saving your workout", "Later"}
LOWER = {w.lower(): w for w in WORDS}

FLOW = """appId: com.mettleup.app
---
- assertVisible: "Share to an AI app"
- runFlow:
    file: sub-see.yaml
    env:
      FIND: "Ask an AI"
- assertVisible: "Ask an AI"
# in-view: the pop-up opens at the top
- assertVisible: "^Ask an AI$"
- extendedWaitUntil:
    visible: "Share to an AI app"
    timeout: 20000
- extendedWaitUntil:
    visible: "Saving your workout"
    timeout: 20000
- tapOn: "Ask an AI"
- assertVisible: "Later"
- assertVisible: "Not a word of the app"
"""


@unittest.skipUnless(HAS_YAML, "pyyaml is not installed")
class Lint(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.path = Path(self.dir.name) / "f.yaml"
        self.path.write_text(FLOW, encoding="utf-8", newline="\n")

    def tearDown(self):
        self.dir.cleanup()

    def found(self):
        return [(f.line, f.cmd, f.target) for f in L.flow_findings(self.path, WORDS, set(), LOWER, ["Later"])]

    def test_bare_checks_on_a_scrolling_page_are_found(self):
        self.assertEqual(self.found(), [
            (3, "assertVisible", "Share to an AI app"),
            (11, "extendedWaitUntil", "Share to an AI app"),
            (14, "extendedWaitUntil", "Saving your workout"),
            (17, "tapOn", "Ask an AI"),
        ])  # after the helper, the in-view mark, a pinned word and a word of no page: nothing

    def test_fix_puts_the_helper_in_and_keeps_what_each_check_proves(self):
        found = L.flow_findings(self.path, WORDS, set(), LOWER, ["Later"])
        self.assertEqual(L.fix_flow(self.path, found, ("assertVisible", "extendedWaitUntil")), 2)
        text = self.path.read_text(encoding="utf-8")
        # The assert became the helper (scroll only when not in view, then the same assert).
        self.assertTrue(text.startswith("appId: com.mettleup.app\n---\n- runFlow:\n    file: sub-see.yaml\n"
                                        "    env:\n      FIND: 'Share to an AI app'\n"))
        # A long wait keeps its wait, optional now, and the helper proves the thing is there after it.
        self.assertIn("    timeout: 20000\n    optional: true\n- runFlow:\n    file: sub-see.yaml", text)
        # A message that goes away again ("Saving ...") stays a plain wait.
        self.assertIn('    visible: "Saving your workout"\n    timeout: 20000\n- tapOn', text)
        self.assertEqual([c for _, c, _ in self.found()], ["extendedWaitUntil", "tapOn"])
        self.assertEqual(L.fix_flow(self.path, L.flow_findings(self.path, WORDS, set(), LOWER, []), ("tapOn",)), 1)
        self.assertIn("      FIND: 'Ask an AI'\n- tapOn: \"Ask an AI\"", self.path.read_text(encoding="utf-8"))

    def test_a_flow_that_does_not_parse_is_named(self):
        # Run 43205679411: one "\." in a double-quoted line failed a whole 73-minute piece ("Parsing Failed").
        bad = Path(self.dir.name) / "bad.yaml"
        bad.write_text('appId: x\n---\n- assertVisible: "^22\\.5 kg$"\n', encoding="utf-8", newline="\n")
        L.BROKEN.clear()
        self.assertEqual(L.flow_findings(bad, WORDS, set(), LOWER, []), [])
        self.assertIn("bad.yaml", L.BROKEN)
        self.assertTrue(L.BROKEN["bad.yaml"].startswith("line 3: "))
        L.flow_findings(self.path, WORDS, set(), LOWER, [])
        self.assertEqual(list(L.BROKEN), ["bad.yaml"])  # a good flow is never named
        L.BROKEN.clear()

    def test_the_helper_never_weakens_a_check(self):
        text = (L.QA / "sub-see.yaml").read_text(encoding="utf-8")
        self.assertTrue(text.rstrip().endswith('- assertVisible: "${FIND}"'))
        self.assertNotIn("notVisible", text.split("---", 1)[1])
        self.assertNotIn("env:", text.split("---", 1)[1])  # no default value (trap 22)

    def test_the_repo_passes_and_the_screens_file_is_current(self):
        self.assertEqual(L.main(["flow_scroll_lint.py"]), 0)


class Matching(unittest.TestCase):
    def test_core_and_loose_regexes(self):
        self.assertEqual(L.core("^Ask an AI$"), "Ask an AI")
        self.assertIsNone(L.core("Log a set|Finish"))
        self.assertTrue(L.too_loose("(?i).*(recent|files).*"))
        self.assertFalse(L.too_loose("(?i).*share to an ai app.*"))

    def test_route_of(self):
        self.assertEqual(F.route_of("apps/mobile/src/app/(tabs)/profile.tsx"), "profile")
        self.assertEqual(F.route_of("apps/mobile/src/app/settings/index.tsx"), "settings")
        self.assertIsNone(F.route_of("apps/mobile/src/app/workout/[id].tsx"))
        self.assertIsNone(F.route_of("apps/mobile/src/components/Thing.tsx"))

    def test_a_chain_part_pulls_the_parts_it_leans_on(self):
        pmap = {"x.yaml": {"j"}, "y.yaml": {"u401", "uat"}, "z.yaml": {"d"}}
        got = F.pick_parts({"x.yaml": [], "y.yaml": [], "z.yaml": []}, pmap)
        self.assertEqual(set(got), set(F.CHAIN[: F.CHAIN.index("j") + 1]) | {"u401"})

    def test_a_changed_sub_flow_reaches_every_flow_that_runs_it(self):
        reached = F.flows_reached(["apps/mobile/qa/sub-see.yaml", "apps/mobile/qa/scrollable-screens.yaml"])
        self.assertEqual(reached.get("sub-see.yaml"), "changed itself")
        self.assertGreater(len(reached), 50)
        self.assertNotIn("scrollable-screens.yaml", reached)
        self.assertTrue(all(w == "changed itself" or w == "runs the changed sub-flow sub-see.yaml"
                            for w in reached.values()))

    def test_every_part_the_runner_names_is_a_real_part(self):
        known = set(F.expected_order()) | {"uat"}
        parts = {p for ps in F.part_map().values() for p in ps}
        self.assertEqual(sorted(parts - known), [])


if __name__ == "__main__":
    unittest.main()
