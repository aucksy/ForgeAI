"""Unit tests for pairwise.py (UAT WP14)."""
import itertools
import unittest

import pairwise


class PairwiseTest(unittest.TestCase):
    def test_every_pair_is_covered(self):
        rows = pairwise.generate()
        covered = set().union(*(pairwise.pairs_of(r) for r in rows))
        self.assertEqual(covered, pairwise.all_pairs(pairwise.FACTORS))

    def test_far_fewer_runs_than_every_combination(self):
        rows = pairwise.generate()
        every = len(list(itertools.product(*pairwise.FACTORS.values())))
        # Lower bound: the two biggest factors (3 x 3 values) need 9 rows.
        self.assertGreaterEqual(len(rows), 9)
        self.assertLessEqual(len(rows), 14)
        self.assertLess(len(rows), every)

    def test_same_rows_every_time(self):
        self.assertEqual(pairwise.generate(), pairwise.generate())

    def test_every_value_is_a_known_one(self):
        for r in pairwise.generate():
            for k, v in r.items():
                self.assertIn(v, pairwise.FACTORS[k])

    def test_env_input_leaves_out_the_android_version(self):
        row = {"api": "35", "font": "2.0", "width": "360", "net": "flaky", "tz": "ist", "saver": "on"}
        self.assertEqual(pairwise.env_input(row), "font=2.0,width=360,net=flaky,tz=ist,saver=on")

    def test_a_tiny_case_by_hand(self):
        rows = pairwise.generate({"a": ["1", "2"], "b": ["x", "y"], "c": ["p", "q"]})
        self.assertEqual(len(rows), 4)  # 2x2 per pair needs 4 rows, all three pairs fit in them


if __name__ == "__main__":
    unittest.main()
