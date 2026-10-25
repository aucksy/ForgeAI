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
"""
import argparse
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from play_common import PACKAGE, fail, finish_edit, http_error_text, log, service, warn  # noqa: E402
from release_checks import version_code_for  # noqa: E402

NOTES_LIMIT = 500
FALLBACK_NOTES = "Small fixes and improvements."
INTERNAL = "internal"
CLOSED = "alpha"
PRODUCTION = "production"

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

    changed = []
    for name in tracks:
        if name == PRODUCTION:
            fail("Refusing to touch the production track.")
        track = by_name.get(name)
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
            if name == CLOSED:
                warn(f"Could not set the closed track '{name}' (in review or blocked?): {http_error_text(e)}. "
                     "Internal testing still goes out.")
                continue
            raise

    if not changed:
        log("Nothing to change on any track. Discarding the edit (no bundle is left behind).")
        edits.delete(packageName=PACKAGE, editId=edit_id).execute()
        return "nothing-to-do", changed
    what = f"versionCode {code} on {', '.join(changed)}"
    try:
        return finish_edit(api, edit_id, dry_run, what), changed
    except HttpError as e:
        if CLOSED in changed:
            warn(f"Play refused the edit with the closed track in it: {http_error_text(e)}")
            return "retry-without-closed", changed
        raise


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--tag", required=True, help="the release tag, e.g. v0.57.0")
    ap.add_argument("--aab", required=True, help="the release's mettleup-<tag>.aab")
    ap.add_argument("--whats-new", default="apps/mobile/src/lib/whatsNew.ts")
    ap.add_argument("--tracks", default=f"{INTERNAL},{CLOSED}")
    ap.add_argument("--language", default="en-US")
    ap.add_argument("--dry-run", action="store_true", help="validate the edit, never commit it")
    a = ap.parse_args()

    if not re.fullmatch(r"v\d+\.\d+\.\d+", a.tag):
        fail(f"'{a.tag}' is not a release tag like v0.57.0.")
    version = a.tag[1:]
    code = version_code_for(version)
    with open(a.whats_new, encoding="utf-8") as f:
        lines = whats_new_lines(f.read(), version)
    notes = release_notes(lines)
    kept = notes.count("\n") + 1 if notes and notes.startswith("• ") else len(lines[:1])
    if kept < len(lines):
        log(f"What's new has {len(lines)} lines for {version}; the first {kept} fit Play's {NOTES_LIMIT} characters.")
    if not notes:
        warn(f"No What's new lines for {version}; using '{FALLBACK_NOTES}'.")
        notes = FALLBACK_NOTES
    tracks = [t.strip() for t in a.tracks.split(",") if t.strip()]
    log(f"MettleUp {version} = versionCode {code}; tracks {tracks}; {'DRY RUN' if a.dry_run else 'LIVE'}")
    log(f"Release notes ({len(notes)} chars, {a.language}):\n{notes}")

    api = service()
    result, changed = upload_and_assign(api, a.aab, version, code, notes, tracks, a.language, a.dry_run)
    if result == "retry-without-closed":
        rest = [t for t in tracks if t != CLOSED]
        log(f"Trying again with {rest} only.")
        result, changed = upload_and_assign(api, a.aab, version, code, notes, rest, a.language, a.dry_run)
    log(f"RESULT: {result}; tracks changed: {changed or 'none'}")


if __name__ == "__main__":
    main()
