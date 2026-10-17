"""notif.py reads a notification's flags in both dumpsys forms (UAT WP14).

Android 14 prints `flags=0x8`; Android 15+ prints `flags=ONLY_ALERT_ONCE` (names joined by |).
The name form once read as "no flags", so every rest card on API 35/36 failed "swipe-away".
"""
import importlib.util
import pathlib
import unittest

_path = pathlib.Path(__file__).resolve().parents[2] / "apps" / "mobile" / "qa" / "notif.py"
_spec = importlib.util.spec_from_file_location("notif", _path)
notif = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(notif)


class FlagsOfTest(unittest.TestCase):
    def test_hex_form(self):
        self.assertEqual(notif.flags_of("Notification(channel=x flags=0x8 color=0x0)"), 0x8)

    def test_name_form(self):
        self.assertEqual(notif.flags_of("Notification(channel=x defaults=0 flags=ONLY_ALERT_ONCE color=0xff)"), 0x8)
        self.assertEqual(notif.flags_of("flags=ONGOING_EVENT|LOCAL_ONLY|GROUP_SUMMARY"), 0x2 | 0x100 | 0x200)

    def test_decimal_and_missing(self):
        self.assertEqual(notif.flags_of("flags=16 x"), 16)
        self.assertEqual(notif.flags_of("no flags here"), -1)

    def test_unknown_name_adds_nothing(self):
        self.assertEqual(notif.flags_of("flags=SOMETHING_NEW|NO_CLEAR"), 0x20)

    def test_audio_attributes_flags_are_not_read_first_in_a_header(self):
        # The header comes first; AudioAttributes "flags=0x800" sits much later in a record.
        self.assertEqual(notif.flags_of("Notification(flags=AUTO_CANCEL) ... mAttributes= AudioAttributes: flags=0x800"), 0x10)


if __name__ == "__main__":
    unittest.main()
