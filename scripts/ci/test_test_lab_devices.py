"""Tests for test_lab_devices.py (UAT WP15): which phones the Test Lab robot crawl uses."""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import test_lab_devices as tl  # noqa: E402


def m(id, brand, form, versions, ff="PHONE", tags=None):
    return {"id": id, "brand": brand, "manufacturer": brand, "name": id, "form": form, "formFactor": ff,
            "supportedVersionIds": [str(v) for v in versions], "tags": tags or []}


MODELS = [
    m("a14", "Samsung", "PHYSICAL", [33, 34]),
    m("s23", "Samsung", "PHYSICAL", [34, 35]),
    m("redmi", "Redmi", "PHYSICAL", [31, 33]),
    m("pixel8", "Google", "PHYSICAL", [34, 35, "Baklava"]),
    m("tab", "Samsung", "PHYSICAL", [35], ff="TABLET"),
    m("old", "vivo", "PHYSICAL", [23, 24]),          # below MIN_API: no usable Android
    m("gone", "OPPO", "PHYSICAL", [33], tags=["deprecated=33"]),
    m("nokia", "HMD", "PHYSICAL", [33]),              # brand not on the list
    m("SmallPhone.arm", "Generic", "VIRTUAL", [26, 28, 30]),
    m("MediumPhone.arm", "Generic", "VIRTUAL", [30, 34]),
]


class Pick(unittest.TestCase):
    def test_one_real_phone_per_brand_in_order_newest_android(self):
        got = tl.pick(MODELS)
        self.assertEqual([c for c in got if c[2] == "PHYSICAL"],
                         [("s23", 35, "PHYSICAL"), ("redmi", 33, "PHYSICAL"), ("pixel8", 35, "PHYSICAL")])

    def test_two_virtual_phones_oldest_and_newest_android(self):
        got = [c for c in tl.pick(MODELS) if c[2] == "VIRTUAL"]
        self.assertEqual(got, [("SmallPhone.arm", 26, "VIRTUAL"), ("MediumPhone.arm", 34, "VIRTUAL")])

    def test_stays_inside_the_free_plan(self):
        got = tl.pick(MODELS * 3, physical=5, virtual=2)
        self.assertLessEqual(sum(1 for c in got if c[2] == "PHYSICAL"), 5)
        self.assertLessEqual(sum(1 for c in got if c[2] == "VIRTUAL"), 10)
        self.assertEqual(tl.pick(MODELS, physical=1, virtual=0), [("s23", 35, "PHYSICAL")])

    def test_device_argument(self):
        self.assertEqual(tl.device_arg("s23", 35), "model=s23,version=35,locale=en_IN,orientation=portrait")


if __name__ == "__main__":
    unittest.main()
