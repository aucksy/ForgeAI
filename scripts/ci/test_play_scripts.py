#!/usr/bin/env python3
"""Self-tests for the pure parts of the Play scripts (play_upload.py, play_listing.py).

Run: python3 -m unittest discover -s scripts/ci -p 'test_*.py'   (or pytest scripts/ci)
No Google library is needed: the scripts import those inside the functions that call Play.
"""
import json
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
        # Play's own track list for this app (29 Oct 2026); Play refused the docs' "wear:qa" as not found.
        self.assertEqual(pu.WEAR_INTERNAL, "wear:internal")
        self.assertEqual(pu.check_tracks([pu.WEAR_INTERNAL], wear=True), ["wear:internal"])

    def test_watch_run_takes_wear_tracks_only(self):
        for bad in (["internal"], ["alpha"], ["wear:internal", "internal"]):
            with self.assertRaises(ValueError, msg=bad):
                pu.check_tracks(bad, wear=True)

    def test_watch_lookalike_track_names_fail_loudly(self):
        # A phone-style name for the Wear OS internal track is refused before anything reaches Play.
        for bad in ("wear:qa", "wear:QA", "wear:test"):
            with self.assertRaises(ValueError, msg=bad) as ctx:
                pu.check_tracks([bad], wear=True)
            self.assertIn("wear:internal", str(ctx.exception))
        self.assertIn("wear:internal", pu.WEAR_BUILTIN)
        self.assertNotIn("wear:qa", pu.WEAR_BUILTIN)
        self.assertNotIn("wear:production", pu.WEAR_BUILTIN)

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

    def test_workflow_uploads_the_watch_bundle_to_the_phones_testing_tracks(self):
        # R-444: the watch goes to the same tracks as the phone (internal + closed), never production.
        # R-494b (from 0.78.0): both also go to open testing (phone "beta", watch "wear:beta").
        with open(os.path.join(ROOT, ".github", "workflows", "play-upload.yml"), encoding="utf-8") as f:
            wf = f.read()
        self.assertIn('--pattern "mettleup-$TAG-wear.aab"', wf)
        self.assertIn("--wear", wf)
        self.assertIn("--tracks wear:internal,wear:closed,wear:beta)", wf)
        self.assertIn("--tracks internal,alpha,beta)", wf)
        self.assertNotIn("wear:qa", wf)
        self.assertNotIn("wear:production", wf)
        self.assertNotIn("production)", wf)


class OpenTestingTrack(unittest.TestCase):
    """R-494b (owner, 14 Nov 2026): every version also goes to open testing, never production; an open-track
    problem never stops internal or closed testing."""

    def test_names(self):
        self.assertEqual(pu.OPEN, "beta")
        self.assertEqual(pu.WEAR_OPEN, "wear:beta")
        self.assertIn(pu.WEAR_OPEN, pu.WEAR_BUILTIN)
        self.assertFalse(pu.is_production(pu.OPEN))
        self.assertFalse(pu.is_production(pu.WEAR_OPEN))

    def test_each_run_accepts_its_own_open_track_only(self):
        self.assertEqual(pu.check_tracks(["internal", "alpha", "beta"], wear=False), ["internal", "alpha", "beta"])
        self.assertEqual(pu.check_tracks(["wear:internal", "wear:closed", "wear:beta"], wear=True),
                         ["wear:internal", "wear:closed", "wear:beta"])
        with self.assertRaises(ValueError):
            pu.check_tracks(["internal", "wear:beta"], wear=False)
        with self.assertRaises(ValueError):
            pu.check_tracks(["wear:internal", "beta"], wear=True)

    def test_the_open_track_is_not_taken_for_the_watch_closed_track(self):
        tracks, closed, _ = pu.resolve_tracks(["wear:internal", "wear:closed", "wear:beta"],
                                              ["wear:internal", "wear:beta", "wear:alpha"])
        self.assertEqual(tracks, ["wear:internal", "wear:alpha", "wear:beta"])
        self.assertNotIn("wear:beta", closed)

    def test_a_refused_edit_drops_open_testing_first_then_closed(self):
        closed = {pu.CLOSED}
        first = pu.retry_without(["internal", "alpha", "beta"], ["internal", "alpha", "beta"], closed)
        self.assertEqual(first, ["internal", "alpha"])
        self.assertEqual(pu.retry_without(first, first, closed), ["internal"])
        self.assertIsNone(pu.retry_without(["internal"], ["internal"], closed))

    def test_watch_retry_keeps_internal(self):
        closed = {pu.CLOSED, "wear:alpha"}
        tracks = ["wear:internal", "wear:alpha", "wear:beta"]
        first = pu.retry_without(tracks, tracks, closed)
        self.assertEqual(first, ["wear:internal", "wear:alpha"])
        self.assertEqual(pu.retry_without(first, first, closed), ["wear:internal"])

    def test_a_retry_naming_the_real_closed_track_keeps_it_optional(self):
        tracks, closed, _ = pu.resolve_tracks(["wear:internal", "wear:alpha"], ["wear:internal", "wear:alpha"])
        self.assertEqual(tracks, ["wear:internal", "wear:alpha"])
        self.assertIn("wear:alpha", closed)
        self.assertEqual(pu.retry_without(tracks, tracks, closed), ["wear:internal"])

    def test_defaults_include_open_testing_and_never_production(self):
        with open(os.path.join(ROOT, "scripts", "ci", "play_upload.py"), encoding="utf-8") as f:
            src = f.read()
        self.assertIn('default_tracks = f"{WEAR_INTERNAL},{WEAR_CLOSED},{WEAR_OPEN}" if a.wear else '
                      'f"{INTERNAL},{CLOSED},{OPEN}"', src)
        self.assertNotIn("PRODUCTION}", src.split("default_tracks =")[1].split("\n")[0])


class WearClosedTrack(unittest.TestCase):
    """R-444: 'wear:closed' becomes the Wear OS closed testing track Play lists (custom name), or is dropped."""

    def test_the_stand_in_passes_the_watch_check_and_never_the_phone_one(self):
        self.assertEqual(pu.check_tracks(["wear:internal", pu.WEAR_CLOSED], wear=True), ["wear:internal", "wear:closed"])
        with self.assertRaises(ValueError):
            pu.check_tracks(["internal", pu.WEAR_CLOSED], wear=False)

    def test_named_like_the_phones_closed_track_wins(self):
        listed = ["internal", "alpha", "wear:internal", "wear:beta", "wear:production", "wear:friends", "wear:alpha"]
        self.assertEqual(pu.wear_closed_track(listed)[0], "wear:alpha")

    def test_the_only_custom_wear_track(self):
        self.assertEqual(pu.wear_closed_track(["alpha", "wear:internal", "wear:closed-testing"])[0], "wear:closed-testing")

    def test_none_on_play_is_a_warning_and_internal_still_goes(self):
        listed = ["internal", "alpha", "production", "wear:internal", "wear:beta", "wear:production"]
        real, why = pu.wear_closed_track(listed)
        self.assertIsNone(real)
        self.assertIn("no Wear OS closed testing track", why)
        tracks, closed, note = pu.resolve_tracks(["wear:internal", "wear:closed"], listed)
        self.assertEqual(tracks, ["wear:internal"])
        self.assertEqual(note, why)
        self.assertEqual(closed, {pu.CLOSED})

    def test_several_unnamed_is_not_guessed(self):
        real, why = pu.wear_closed_track(["wear:a", "wear:b", "wear:internal"])
        self.assertIsNone(real)
        self.assertIn("not guessing", why)

    def test_never_open_testing_internal_or_production(self):
        for name in ("wear:beta", "wear:internal", "wear:production", "wear:qa", "alpha", "internal", "production"):
            self.assertFalse(pu.is_wear_closed(name), name)
            self.assertIsNone(pu.wear_closed_track([name])[0], name)

    def test_resolved_track_is_closed_and_order_kept(self):
        tracks, closed, note = pu.resolve_tracks(["wear:internal", "wear:closed"], ["wear:internal", "wear:alpha"])
        self.assertEqual(tracks, ["wear:internal", "wear:alpha"])
        self.assertIn("wear:alpha", closed)
        self.assertIsNone(note)

    def test_the_watch_run_defaults_to_both(self):
        with open(os.path.join(ROOT, "scripts", "ci", "play_upload.py"), encoding="utf-8") as f:
            src = f.read()
        self.assertIn('default_tracks = f"{WEAR_INTERNAL},{WEAR_CLOSED},', src)


class ReviewRefusals(unittest.TestCase):
    def test_review_refusals_are_recognised(self):
        from play_common import needs_not_sent_for_review as n
        self.assertTrue(n("HTTP 400 Changes cannot be sent for review automatically. Please set the query "
                          "parameter changesNotSentForReview to true."))
        self.assertTrue(n("HTTP 400 There are changes in review for this app."))
        self.assertFalse(n("HTTP 403 The caller does not have permission"))
        self.assertFalse(n("HTTP 400 APK specifies a version code that has already been used."))


class ScreenshotOrder(unittest.TestCase):
    def test_all_eight_in_order(self):
        self.assertEqual(pl.SCREENSHOT_ORDER, [1, 2, 3, 4, 5, 6, 7, 8])
        names = [os.path.basename(p) for p in pl.screenshot_paths()]
        self.assertEqual(names, [f"shot-0{n}.png" for n in range(1, 9)])

    def test_panorama_pair_comes_first_side_by_side(self):
        # R-252: the owner wants the barbell artwork across shots 1 and 2.
        self.assertEqual(pl.SCREENSHOT_ORDER[:2], [1, 2])
        with open(os.path.join(pl.STORE, "captions.json"), encoding="utf-8") as fh:
            self.assertEqual(json.load(fh)["panorama"], [1, 2])

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
