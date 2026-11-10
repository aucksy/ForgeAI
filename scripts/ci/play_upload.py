#!/usr/bin/env python3
"""Upload a released MettleUp AAB to Google Play's TESTING tracks (R-125). Never production.

  play_upload.py --tag v0.57.0 --aab mettleup-v0.57.0.aab [--dry-run]

Run by .github/workflows/play-upload.yml after a v* tag's release is published (or by hand).
  1. Works out the versionCode from the tag (the release workflow's own formula) and the release
     notes from the app's What's new entry for that version (apps/mobile/src/lib/whatsNew.ts,
     plain text, at most 500 characters: whole lines only).
  2. Opens a Play edit; uploads the AAB unless Play already has that versionCode; checks the
     uploaded bundle's versionCode is the expected one.
  3. Puts it on each track (internal, then alpha = "Closed testing - Alpha") as one "completed"
     release with the notes. A track that already carries this versionCode (or a newer one) is
     skipped with a log line, so running it twice changes nothing.
  4. Commits the edit (sent for review where Play does that). A problem with the CLOSED track (in
     review, blocked, missing) is logged as a warning and the internal track still goes out.
  --dry-run: everything except the commit: Play validates the edit, then it is thrown away.

  play_upload.py --wear --tag v0.60.0 --aab mettleup-v0.60.0-wear.aab [--dry-run]
R-167 (28 Oct 2026): the WATCH app's bundle (the Wear OS form factor of the same Play app) to the
Wear OS internal testing track, "wear:internal". 29 Oct 2026: Google's docs say "wear:qa", but Play's
own track list for this app shows "wear:internal" and answered "Track not found: wear:qa" (v0.60.0
release run 40838435757), so the live list wins. Its versionCode is the watch's own
(release_checks.wear_version_code_for). In --wear mode only "wear:" tracks are accepted, and the
phone mode refuses every form-factor track, so neither run can touch the other's releases.
Production (any form factor) is always refused.

R-444 (10 Nov 2026, fresh-eyes review): the watch also goes to the Wear OS CLOSED testing track, so a
member on the phone's closed test ("alpha") gets the watch build too (else the phone's "Your watch app
has an update" card pointed at a Play Store with no watch update). Wear OS closed tracks are made by
hand in Play Console ("Test and release > Closed testing", form factor "Wear OS only") with custom
names, so --tracks takes the stand-in "wear:closed": after listing Play's tracks it becomes the Wear OS
closed track named like the phone's ("wear:alpha") or, failing that, the only custom Wear OS track. None
(the case on 10 Nov 2026: Play Console showed no Wear OS closed track) or several unnamed ones: a
warning, and wear:internal still goes out. Like the phone's closed track, a problem there never stops
internal.
"""
import argparse
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from play_common import PACKAGE, fail, finish_edit, http_error_text, log, service, warn  # noqa: E402
from release_checks import version_code_for, wear_version_code_for  # noqa: E402

NOTES_LIMIT = 500
FALLBACK_NOTES = "Small fixes and improvements."
INTERNAL = "internal"
CLOSED = "alpha"
PRODUCTION = "production"
WEAR_PREFIX = "wear:"
WEAR_INTERNAL = "wear:internal"
# Play's own track list for com.mettleup.app (29 Oct 2026): wear:production, wear:beta, wear:internal. Google's
# docs name the internal one "wear:qa", but Play answered "Track not found: wear:qa", so the live list wins.
# Closed tracks are made by hand in Play Console with custom names, so any other "wear:" name must already
# be listed on Play.
WEAR_BUILTIN = {"wear:internal", "wear:beta"}
# R-444: "the Wear OS closed testing track, whatever Play calls it" (resolved after listing the tracks).
WEAR_CLOSED = "wear:closed"
# Names Play gives its own Wear OS tracks (open, internal, production; "qa" in Google's docs): never a closed one.
WEAR_NOT_CLOSED = {"wear:internal", "wear:beta", "wear:qa", "wear:production"}
# Names that look right but are NOT this app's Wear OS internal track on Play.
WEAR_LOOKALIKES = {"wear:qa", "wear:internal-testing", "wear:internaltesting", "wear:test"}


def is_production(name):
    """'production' or a form factor's production track ('wear:production'). PURE."""
    return name == PRODUCTION or name.endswith(":" + PRODUCTION)


def check_tracks(tracks, wear):
    """The tracks this run may touch, or ValueError. PURE.
    Phone run: plain tracks only (internal, alpha...). Watch run (--wear): 'wear:' tracks only.
    Never a production track."""
    if not tracks:
        raise ValueError("no track given")
    for t in tracks:
        if is_production(t):
            raise ValueError(f"refusing to touch the production track '{t}'")
        if wear and not t.startswith(WEAR_PREFIX):
            raise ValueError(f"the watch bundle goes only to Wear OS tracks ('wear:...'), not '{t}'")
        if wear and t.lower() in WEAR_LOOKALIKES:
            raise ValueError(f"'{t}' is not a Play track name: Play names the Wear OS internal testing track "
                             f"'{WEAR_INTERNAL}' (Play's own track list for this app)")
        if not wear and ":" in t:
            raise ValueError(f"the phone bundle never goes to a form-factor track ('{t}')")
    return tracks

def wear_closed_track(listed):
    """(track or None, why) for the stand-in 'wear:closed', from the names of every track Play lists. PURE.
    The Wear OS closed track named like the phone's closed one wins; else the only custom Wear OS track."""
    custom = sorted(n for n in listed if is_wear_closed(n))
    same = WEAR_PREFIX + CLOSED
    if same in custom:
        return same, f"Wear OS closed testing track '{same}' (named like the phone's '{CLOSED}')"
    if len(custom) == 1:
        return custom[0], f"Wear OS closed testing track '{custom[0]}' (the only one on Play)"
    if not custom:
        return None, ("Play has no Wear OS closed testing track, so members on the phone's closed test get no "
                      "watch update from Play (the watch went to wear:internal only). Create one in Play Console: "
                      "Test and release > Closed testing > form factor 'Wear OS only' > Create track, with the "
                      "same testers as 'Closed testing - Alpha'.")
    return None, (f"Play lists several Wear OS closed testing tracks {custom} and none is '{same}': not guessing. "
                  f"Name the one that matches the phone's closed test '{same}'.")


def is_wear_closed(name):
    """A custom (closed testing) Wear OS track name, as Play lists it. PURE."""
    return name.startswith(WEAR_PREFIX) and name not in WEAR_NOT_CLOSED and name != WEAR_CLOSED


def resolve_tracks(tracks, listed):
    """(tracks to set, closed-track names, warning or None): 'wear:closed' becomes Play's real Wear OS
    closed track, or is dropped with a warning. Order kept, no repeats. PURE."""
    closed = {CLOSED}
    note = None
    out = []
    for t in tracks:
        if t == WEAR_CLOSED:
            real, why = wear_closed_track(listed)
            if real is None:
                note = why
                continue
            closed.add(real)
            t = real
        if t not in out:
            out.append(t)
    return out, closed, note


_STR = r"'(?:[^'\\\n]|\\.)*'|\"(?:[^\"\\\n]|\\.)*\""


def _unquote(lit):
    """A one-line JS/TS string literal ('...' or "...") to its text."""
    body = lit[1:-1]
    simple = {"n": " ", "t": " ", "'": "'", '"': '"', "\\": "\\"}

    def rep(m):
        c = m.group(1)
        if c.startswith("u"):
            return chr(int(c[1:], 16))
        return simple.get(c, c)

    return re.sub(r"\\(u[0-9a-fA-F]{4}|.)", rep, body)


def whats_new_lines(ts_source, version):
    """The `text` of every line in WHATS_NEW_LOG's entry for `version`, in order ([] when none). PURE."""
    start = ts_source.find("WHATS_NEW_LOG")
    if start < 0:
        raise ValueError("WHATS_NEW_LOG not found in the What's new file")
    # Drop // and /* */ comments (a comment may say "text: '...'"), keeping string literals intact.
    src = re.sub(r"(" + _STR + r")|//[^\n]*|/\*.*?\*/", lambda m: m.group(1) or "", ts_source[start:], flags=re.S)
    marks = list(re.finditer(r"\bversion:\s*(" + _STR + r")", src))
    for i, m in enumerate(marks):
        if _unquote(m.group(1)) != version:
            continue
        end = marks[i + 1].start() if i + 1 < len(marks) else len(src)
        block = src[m.end():end]
        return [_unquote(t.group(1)).strip() for t in re.finditer(r"\btext:\s*(" + _STR + r")", block)]
    return []


def release_notes(lines, limit=NOTES_LIMIT):
    """Play's "What's new" text: one "• line" per line, whole lines only, within `limit`. PURE.
    None when there is nothing to say."""
    lines = [" ".join(t.split()) for t in lines if t and t.strip()]
    out = []
    for t in lines:
        candidate = "\n".join(out + [f"• {t}"])
        if len(candidate) > limit:
            break
        out.append(f"• {t}")
    if not out and lines:
        return lines[0][: limit - 1].rstrip() + "…"
    return "\n".join(out) or None


def _codes(release):
    return [int(c) for c in release.get("versionCodes") or []]


def track_decision(track, code):
    """('skip' | 'add', reason) for putting versionCode `code` on this track (a Play Track dict). PURE.
    Skips when the track already carries it (any status) or already serves a NEWER build."""
    name = track.get("track", "?")
    releases = track.get("releases") or []
    for r in releases:
        if code in _codes(r):
            return "skip", f"track '{name}' already has versionCode {code} (status {r.get('status')}): skipping"
    newer = sorted(c for r in releases if r.get("status") in ("completed", "inProgress", "halted")
                   for c in _codes(r) if c > code)
    if newer:
        return "skip", f"track '{name}' already serves newer versionCode {newer[-1]}: not putting {code} under it"
    return "add", f"track '{name}': adding versionCode {code}"


def describe_track(track):
    """One line: what a track holds now. PURE."""
    rels = track.get("releases") or []
    if not rels:
        return f"{track.get('track')}: empty"
    parts = [f"{r.get('name') or '?'} {_codes(r)} {r.get('status')}" for r in rels]
    return f"{track.get('track')}: " + "; ".join(parts)


def new_release(version, code, notes, language):
    return {
        "name": version,
        "versionCodes": [str(code)],
        "status": "completed",
        "releaseNotes": [{"language": language, "text": notes}],
    }


def upload_and_assign(api, aab, version, code, notes, tracks, language, dry_run):
    """One edit: bundle (if Play lacks it) + the tracks. Returns (result, tracks actually updated)."""
    from googleapiclient.errors import HttpError
    from googleapiclient.http import MediaFileUpload

    edits = api.edits()
    edit_id = edits.insert(packageName=PACKAGE, body={}).execute()["id"]
    log(f"Opened edit {edit_id}")
    try:
        details = edits.details().get(packageName=PACKAGE, editId=edit_id).execute()
        log(f"Listing default language: {details.get('defaultLanguage')}")
    except HttpError as e:
        warn(f"Could not read the app details: {http_error_text(e)}")

    have = {int(b["versionCode"]) for b in
            (edits.bundles().list(packageName=PACKAGE, editId=edit_id).execute().get("bundles") or [])}
    if code in have:
        log(f"Play already has a bundle with versionCode {code}: not uploading it again.")
    else:
        size = os.path.getsize(aab) / 1e6
        log(f"Uploading {os.path.basename(aab)} ({size:.1f} MB)...")
        media = MediaFileUpload(aab, mimetype="application/octet-stream", resumable=True, chunksize=8 * 1024 * 1024)
        got = edits.bundles().upload(packageName=PACKAGE, editId=edit_id, media_body=media).execute()
        if int(got["versionCode"]) != code:
            edits.delete(packageName=PACKAGE, editId=edit_id).execute()
            fail(f"The AAB says versionCode {got['versionCode']}, the tag says {code}. Nothing changed on Play.")
        log(f"Uploaded: versionCode {got['versionCode']}, sha256 {got.get('sha256')}")

    all_tracks = edits.tracks().list(packageName=PACKAGE, editId=edit_id).execute().get("tracks") or []
    log("Tracks on Play now:")
    for t in all_tracks:
        log(f"  {describe_track(t)}")
    by_name = {t["track"]: t for t in all_tracks}

    # R-444: the stand-in "wear:closed" becomes Play's real Wear OS closed track (or is dropped, with a warning).
    tracks, closed, note = resolve_tracks(tracks, by_name)
    if note:
        warn(note)
    for t in sorted(closed - {CLOSED}):
        log(f"wear:closed = '{t}' (Wear OS closed testing)")

    changed = []
    for name in tracks:
        if is_production(name):
            fail("Refusing to touch the production track.")
        track = by_name.get(name)
        if track is None and name in WEAR_BUILTIN:
            # A built-in Wear OS track may not be listed until its first release: set it all the same.
            log(f"Track '{name}' is not listed yet (tracks: {sorted(by_name)}); creating its first release.")
            track = {"track": name, "releases": []}
        elif track is None and name.startswith(WEAR_PREFIX):
            # A custom (closed) Wear OS track must exist on Play first: a typo must not pass quietly.
            edits.delete(packageName=PACKAGE, editId=edit_id).execute()
            fail(f"Track '{name}' does not exist on Play (tracks: {sorted(by_name)}). Play's Wear OS internal "
                 f"testing track is '{WEAR_INTERNAL}'. Nothing changed on Play.")
        if track is None:
            msg = f"Track '{name}' does not exist on Play (tracks: {sorted(by_name)})."
            if name == CLOSED:
                warn(msg + " Skipping the closed test.")
                continue
            fail(msg)
        action, why = track_decision(track, code)
        log(why)
        if action == "skip":
            continue
        body = {"track": name, "releases": [new_release(version, code, notes, language)]}
        try:
            edits.tracks().update(packageName=PACKAGE, editId=edit_id, track=name, body=body).execute()
            changed.append(name)
            log(f"Set on '{name}': {version} ({code}) completed")
        except HttpError as e:
            if name in closed:
                warn(f"Could not set the closed track '{name}' (in review or blocked?): {http_error_text(e)}. "
                     "Internal testing still goes out.")
                continue
            raise

    if not changed:
        if dry_run:  # still prove the validate call (and its permission) works
            finish_edit(api, edit_id, True, "nothing to change")
        else:
            log("Nothing to change on any track. Discarding the edit (no bundle is left behind).")
            edits.delete(packageName=PACKAGE, editId=edit_id).execute()
        return "nothing-to-do", changed
    what = f"versionCode {code} on {', '.join(changed)}"
    try:
        return finish_edit(api, edit_id, dry_run, what), changed
    except HttpError as e:
        if closed & set(changed):
            warn(f"Play refused the edit with the closed track in it: {http_error_text(e)}")
            return "retry-without-closed", changed
        raise


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--tag", required=True, help="the release tag, e.g. v0.57.0")
    ap.add_argument("--aab", required=True, help="the release's mettleup-<tag>.aab")
    ap.add_argument("--whats-new", default="apps/mobile/src/lib/whatsNew.ts")
    ap.add_argument("--tracks", default=None, help=f"default {INTERNAL},{CLOSED}; with --wear {WEAR_INTERNAL},{WEAR_CLOSED}")
    ap.add_argument("--wear", action="store_true", help="the WATCH app's bundle (Wear OS tracks, the watch's versionCode)")
    ap.add_argument("--language", default="en-US")
    ap.add_argument("--dry-run", action="store_true", help="validate the edit, never commit it")
    a = ap.parse_args()

    if not re.fullmatch(r"v\d+\.\d+\.\d+", a.tag):
        fail(f"'{a.tag}' is not a release tag like v0.57.0.")
    version = a.tag[1:]
    code = wear_version_code_for(version) if a.wear else version_code_for(version)
    with open(a.whats_new, encoding="utf-8") as f:
        lines = whats_new_lines(f.read(), version)
    notes = release_notes(lines)
    kept = notes.count("\n") + 1 if notes and notes.startswith("• ") else len(lines[:1])
    if kept < len(lines):
        log(f"What's new has {len(lines)} lines for {version}; the first {kept} fit Play's {NOTES_LIMIT} characters.")
    if not notes:
        warn(f"No What's new lines for {version}; using '{FALLBACK_NOTES}'.")
        notes = FALLBACK_NOTES
    default_tracks = f"{WEAR_INTERNAL},{WEAR_CLOSED}" if a.wear else f"{INTERNAL},{CLOSED}"
    try:
        tracks = check_tracks([t.strip() for t in (a.tracks or default_tracks).split(",") if t.strip()], a.wear)
    except ValueError as e:
        fail(str(e))
    what = "watch (Wear OS)" if a.wear else "phone"
    log(f"MettleUp {version} {what} = versionCode {code}; tracks {tracks}; {'DRY RUN' if a.dry_run else 'LIVE'}")
    log(f"Release notes ({len(notes)} chars, {a.language}):\n{notes}")

    api = service()
    result, changed = upload_and_assign(api, a.aab, version, code, notes, tracks, a.language, a.dry_run)
    if result == "retry-without-closed":
        rest = [t for t in tracks if t not in (CLOSED, WEAR_CLOSED) and not is_wear_closed(t)]
        log(f"Trying again with {rest} only.")
        result, changed = upload_and_assign(api, a.aab, version, code, notes, rest, a.language, a.dry_run)
    log(f"RESULT: {result}; tracks changed: {changed or 'none'}")


if __name__ == "__main__":
    main()
