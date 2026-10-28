#!/usr/bin/env python3
"""Self-tests for the pure parts of the Play scripts (play_upload.py, play_listing.py).

Run: python3 -m unittest discover -s scripts/ci -p 'test_*.py'   (or pytest scripts/ci)
No Google library is needed: the scripts import those inside the functions that call Play.
"""
import os
import struct
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import play_listing as pl  # noqa: E402
import play_upload as pu  # noqa: E402

ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
WHATS_NEW = os.path.join(ROOT, "apps", "mobile", "src", "lib", "whatsNew.ts")

SAMPLE_TS = """
export const WHATS_NEW: Record<string, string[]> = {};
export const WHATS_NEW_LOG: readonly WhatsNewEntry[] = [
  {
    version: '0.9.1',
    date: '25 Oct',
    lines: [
      {
        // a comment with text: 'not a line'
        text: 'Tap "Save" to keep it.',
        go: { label: 'Open', href: '/settings/rest' },
      },
      { text: "Your gym's name shows here." },
      { text: 'It\\'s quicker → now.' },
    ],
  },
  {
    version: '0.9.0',
    date: '24 Oct',
    lines: [{ text: 'Older line.' }],
  },
  { version: '0.8.0', date: '1 Oct', lines: [] },
];
"""


def track(name, *releases):
    return {"track": name, "releases": [dict(versionCodes=[str(c) for c in codes], status=s) for codes, s in releases]}


class WhatsNewExtraction(unittest.TestCase):
    def test_lines_of_one_version_in_order(self):
        self.assertEqual(pu.whats_new_lines(SAMPLE_TS, "0.9.1"),
                         ['Tap "Save" to keep it.', "Your gym's name shows here.", "It's quicker → now."])

    def test_stops_at_the_next_version(self):
        self.assertEqual(pu.whats_new_lines(SAMPLE_TS, "0.9.0"), ["Older line."])

    def test_version_without_lines_or_unknown(self):
        self.assertEqual(pu.whats_new_lines(SAMPLE_TS, "0.8.0"), [])
        self.assertEqual(pu.whats_new_lines(SAMPLE_TS, "1.0.0"), [])

    def test_comment_mentioning_text_is_not_a_line(self):
        self.assertNotIn("not a line", " ".join(pu.whats_new_lines(SAMPLE_TS, "0.9.1")))

    def test_real_file_has_notes_for_released_versions(self):
        with open(WHATS_NEW, encoding="utf-8") as f:
            src = f.read()
        for v in ("0.56.1", "0.56.0"):
            lines = pu.whats_new_lines(src, v)
            self.assertTrue(lines, v)
            notes = pu.release_notes(lines)
            self.assertLessEqual(len(notes), 500, v)
            self.assertTrue(notes.startswith("• "), v)
        self.assertIn("Alarms & reminders", pu.release_notes(pu.whats_new_lines(src, "0.56.1")))


class ReleaseNotes(unittest.TestCase):
    def test_bullets_one_per_line(self):
        self.assertEqual(pu.release_notes(["One.", "Two."]), "• One.\n• Two.")

    def test_whole_lines_only_within_the_limit(self):
        lines = ["a" * 200, "b" * 200, "c" * 200]
        notes = pu.release_notes(lines)
        self.assertLessEqual(len(notes), 500)
        self.assertEqual(notes, f"• {'a' * 200}\n• {'b' * 200}")

    def test_exactly_at_the_limit_fits(self):
        line = "x" * 498  # "• " + 498 = 500
        self.assertEqual(len(pu.release_notes([line])), 500)

    def test_one_overlong_line_is_cut_with_an_ellipsis(self):
        notes = pu.release_notes(["y" * 800])
        self.assertEqual(len(notes), 500)
        self.assertTrue(notes.endswith("…"))

    def test_nothing_to_say(self):
        self.assertIsNone(pu.release_notes([]))
        self.assertIsNone(pu.release_notes(["  "]))

    def test_whitespace_is_squashed(self):
        self.assertEqual(pu.release_notes(["a  b\n c"]), "• a b c")

    def test_release_body(self):
        r = pu.new_release("0.57.0", 57000, "• Hi", "en-US")
        self.assertEqual(r["status"], "completed")
        self.assertEqual(r["versionCodes"], ["57000"])
        self.assertEqual(r["releaseNotes"], [{"language": "en-US", "text": "• Hi"}])


class Idempotency(unittest.TestCase):
    def test_empty_track_adds(self):
        self.assertEqual(pu.track_decision({"track": "alpha"}, 56001)[0], "add")
        self.assertEqual(pu.track_decision(track("alpha"), 56001)[0], "add")

    def test_older_release_on_track_adds(self):
        self.assertEqual(pu.track_decision(track("internal", ([56000], "completed")), 56001)[0], "add")

    def test_same_code_skips_whatever_its_status(self):
        for status in ("completed", "draft", "inProgress", "halted"):
            action, why = pu.track_decision(track("internal", ([56001], status)), 56001)
            self.assertEqual(action, "skip", status)
            self.assertIn("already has versionCode 56001", why)

    def test_newer_live_build_is_never_shadowed(self):
        action, why = pu.track_decision(track("alpha", ([57000], "completed")), 56001)
        self.assertEqual(action, "skip")
        self.assertIn("newer versionCode 57000", why)

    def test_newer_draft_does_not_block(self):
        self.assertEqual(pu.track_decision(track("alpha", ([57000], "draft")), 56001)[0], "add")

    def test_version_code_formula_matches_the_release(self):
        self.assertEqual(pu.version_code_for("0.56.1"), 56001)
        self.assertEqual(pu.version_code_for("1.2.3"), 1002003)

    def test_describe_track(self):
        t = {"track": "internal", "releases": [{"name": "0.56.1", "versionCodes": ["56001"], "status": "completed"}]}
        self.assertEqual(pu.describe_track(t), "internal: 0.56.1 [56001] completed")
        self.assertEqual(pu.describe_track({"track": "alpha"}), "alpha: empty")

    def test_production_is_never_a_default_track(self):
        self.assertNotIn(pu.PRODUCTION, (pu.INTERNAL, pu.CLOSED))


class WearTracks(unittest.TestCase):
    """R-167: the watch bundle goes to the Wear OS internal track only; neither run touches the other's."""

    def test_wear_internal_track_name(self):
        # developers.google.com/android-publisher/tracks: "<prefix>:<default name>", Wear OS "wear", internal "qa".
        self.assertEqual(pu.WEAR_INTERNAL, "wear:qa")
        self.assertEqual(pu.check_tracks([pu.WEAR_INTERNAL], wear=True), ["wear:qa"])

    def test_watch_run_takes_wear_tracks_only(self):
        for bad in (["internal"], ["alpha"], ["wear:qa", "internal"]):
            with self.assertRaises(ValueError, msg=bad):
                pu.check_tracks(bad, wear=True)

    def test_phone_run_never_takes_a_form_factor_track(self):
        self.assertEqual(pu.check_tracks(["internal", "alpha"], wear=False), ["internal", "alpha"])
        for bad in (["wear:qa"], ["internal", "wear:beta"], ["tv:qa"]):
            with self.assertRaises(ValueError, msg=bad):
                pu.check_tracks(bad, wear=False)

    def test_production_refused_in_every_form_factor(self):
        for wear, t in ((False, "production"), (True, "wear:production")):
            with self.assertRaises(ValueError):
                pu.check_tracks([t], wear=wear)
        self.assertTrue(pu.is_production("wear:production"))
        self.assertFalse(pu.is_production("wear:qa"))
        with self.assertRaises(ValueError):
            pu.check_tracks([], wear=True)

    def test_watch_version_code(self):
        self.assertEqual(pu.wear_version_code_for("0.60.0"), 1_000_060_000)

    def test_workflow_uploads_the_watch_bundle_to_wear_qa_only(self):
        with open(os.path.join(ROOT, ".github", "workflows", "play-upload.yml"), encoding="utf-8") as f:
            wf = f.read()
        self.assertIn('--pattern "mettleup-$TAG-wear.aab"', wf)
        self.assertIn("--wear", wf)
        self.assertIn("--tracks wear:qa", wf)
        self.assertNotIn("wear:production", wf)


class ReviewRefusals(unittest.TestCase):
    def test_review_refusals_are_recognised(self):
        from play_common import needs_not_sent_for_review as n
        self.assertTrue(n("HTTP 400 Changes cannot be sent for review automatically. Please set the query "
                          "parameter changesNotSentForReview to true."))
        self.assertTrue(n("HTTP 400 There are changes in review for this app."))
        self.assertFalse(n("HTTP 403 The caller does not have permission"))
        self.assertFalse(n("HTTP 400 APK specifies a version code that has already been used."))


class ScreenshotOrder(unittest.TestCase):
    def test_order_without_shot_4(self):
        self.assertEqual(pl.SCREENSHOT_ORDER, [1, 2, 3, 5, 6, 7, 8])
        names = [os.path.basename(p) for p in pl.screenshot_paths()]
        self.assertEqual(names, ["shot-01.png", "shot-02.png", "shot-03.png", "shot-05.png",
                                 "shot-06.png", "shot-07.png", "shot-08.png"])

    def test_panorama_pair_comes_first_side_by_side(self):
        self.assertEqual(pl.SCREENSHOT_ORDER[:2], [1, 2])

    def test_committed_files_pass_plays_rules(self):
        for p in pl.screenshot_paths():
            with open(p, "rb") as f:
                data = f.read()
            self.assertIsNone(pl.screenshot_problem(pl.png_size(data[:24]), len(data)), p)
        for p, size in ((pl.FEATURE_GRAPHIC, (1024, 500)), (pl.ICON, (512, 512))):
            with open(p, "rb") as f:
                self.assertEqual(pl.png_size(f.read(24)), size, p)

    def test_play_order_named_by_sha(self):
        imgs = [{"id": "a", "sha256": "AA"}, {"id": "b", "sha256": "bb"}, {"id": "c", "sha256": "cc"}]
        self.assertEqual(pl.order_by_sha(imgs, {"aa": "shot-01.png", "bb": "shot-02.png"}),
                         ["shot-01.png", "shot-02.png", "unknown image c"])


class ImageRules(unittest.TestCase):
    def test_png_size(self):
        head = b"\x89PNG\r\n\x1a\n" + b"\x00\x00\x00\x0dIHDR" + struct.pack(">II", 1080, 1920)
        self.assertEqual(pl.png_size(head), (1080, 1920))
        self.assertIsNone(pl.png_size(b"GIF89a" + b"\x00" * 30))

    def test_rules(self):
        self.assertIsNone(pl.screenshot_problem((1080, 1920), 1_200_000))
        self.assertIn("320-3840", pl.screenshot_problem((200, 400), 10))
        self.assertIn("twice", pl.screenshot_problem((1000, 2100), 10))
        self.assertIn("8 MB", pl.screenshot_problem((1080, 1920), 9 * 1024 * 1024))
        self.assertEqual(pl.screenshot_problem(None, 10), "not a PNG")


class ListingText(unittest.TestCase):
    def test_parse(self):
        got = pl.parse_listing("TITLE: App: Gym\nSHORT: Short one.\nFULL2: Second.\nFULL1: First: yes.\n\n")
        self.assertEqual(got, {"title": "App: Gym", "shortDescription": "Short one.",
                               "fullDescription": "First: yes.\n\nSecond."})

    def test_limits(self):
        with self.assertRaises(ValueError):
            pl.parse_listing("TITLE: " + "t" * 31 + "\nSHORT: s\nFULL1: f")
        with self.assertRaises(ValueError):
            pl.parse_listing("TITLE: t\nFULL1: f")

    def test_committed_listing_parses(self):
        with open(pl.LISTING_TEXT, encoding="utf-8") as f:
            got = pl.parse_listing(f.read())
        self.assertTrue(got["title"].startswith("MettleUp"))


class ResumableUpload(unittest.TestCase):
    """v0.57.0 (25 Oct 2026): the AAB upload crashed with RedirectMissingLocation because httplib2
    followed Google's 308 "Resume Incomplete" chunk reply as a redirect."""

    def test_308_is_not_followed_as_a_redirect(self):
        try:
            import google.auth
            from unittest import mock
            from google.auth.credentials import AnonymousCredentials
        except ImportError:
            self.skipTest("Google client libraries not installed")
        import play_common
        with mock.patch.object(google.auth, "default", return_value=(AnonymousCredentials(), None)):
            api = play_common.service()
        raw = api._http.http
        self.assertNotIn(308, raw.redirect_codes)
        self.assertIn(301, raw.redirect_codes)


if __name__ == "__main__":
    unittest.main()
