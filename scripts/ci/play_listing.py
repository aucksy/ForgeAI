#!/usr/bin/env python3
"""Upload MettleUp's Play store pictures IN ORDER (R-125), and optionally the listing text.

  play_listing.py [--with-text] [--dry-run]

Run by .github/workflows/play-listing.yml (manual). In one Play edit:
  1. deletes every en-US phone screenshot, then uploads branding/mettleup/store/out/shot-0N.png in
     SCREENSHOT_ORDER (Play shows them in upload order; shots 1 and 2 are the barbell panorama pair
     and must sit side by side, first). Shot 4 is left out: its caption ("Your trainer's plan,
     ready") does not match its screen.
  2. replaces the feature graphic (1024x500) and the icon (512x512).
  3. --with-text: title, short and full description from branding/mettleup/store/listing-draft.txt.
  4. reads the screenshots back, names each by its SHA-256, and stops (nothing committed) unless the
     order Play reports is exactly the one uploaded; then commits. After the commit, a fresh read
     of the live listing logs the final order.
  --dry-run: everything except the commit (Play validates the edit, then it is thrown away).
"""
import argparse
import hashlib
import os
import struct
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from play_common import PACKAGE, fail, finish_edit, log, service  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
STORE = os.path.join(ROOT, "branding", "mettleup", "store")
SCREENSHOT_ORDER = [1, 2, 3, 5, 6, 7, 8]  # shot 4 excluded: its caption doesn't match its screen
FEATURE_GRAPHIC = os.path.join(STORE, "feature-graphic-1024x500.png")
ICON = os.path.join(STORE, "play-icon-512.png")
LISTING_TEXT = os.path.join(STORE, "listing-draft.txt")
LIMITS = {"title": 30, "shortDescription": 80, "fullDescription": 4000}


def screenshot_paths(order=SCREENSHOT_ORDER, store=STORE):
    """The phone screenshots to upload, in Play order. PURE."""
    return [os.path.join(store, "out", f"shot-{n:02d}.png") for n in order]


def png_size(data):
    """(width, height) from a PNG's header bytes, or None when it is not a PNG. PURE."""
    if len(data) < 24 or data[:8] != b"\x89PNG\r\n\x1a\n" or data[12:16] != b"IHDR":
        return None
    return struct.unpack(">II", data[16:24])


def screenshot_problem(size, nbytes):
    """Play's phone-screenshot rules: PNG/JPEG, each side 320-3840 px, long side at most twice the
    short one, at most 8 MB. Returns the problem in words, or None. PURE."""
    if size is None:
        return "not a PNG"
    w, h = size
    if min(w, h) < 320 or max(w, h) > 3840:
        return f"{w}x{h}: each side must be 320-3840 px"
    if max(w, h) > 2 * min(w, h):
        return f"{w}x{h}: the long side may be at most twice the short side"
    if nbytes > 8 * 1024 * 1024:
        return f"{nbytes} bytes: over 8 MB"
    return None


def parse_listing(text):
    """listing-draft.txt (TITLE: / SHORT: / FULL1: ... lines) to Play's listing fields. PURE.
    The FULL paragraphs are joined with a blank line, in their number order."""
    fields, full = {}, []
    for raw in text.splitlines():
        key, sep, value = raw.partition(":")
        if not sep:
            continue
        key, value = key.strip().upper(), value.strip()
        if key == "TITLE":
            fields["title"] = value
        elif key == "SHORT":
            fields["shortDescription"] = value
        elif key.startswith("FULL") and key[4:].isdigit():
            full.append((int(key[4:]), value))
    if full:
        fields["fullDescription"] = "\n\n".join(v for _, v in sorted(full))
    for k, limit in LIMITS.items():
        if k not in fields or not fields[k]:
            raise ValueError(f"listing text has no {k}")
        if len(fields[k]) > limit:
            raise ValueError(f"{k} is {len(fields[k])} characters; Play allows {limit}")
    return fields


def order_by_sha(images, names_by_sha):
    """Names (or 'unknown <id>') of Play's images, in Play's order. PURE."""
    return [names_by_sha.get((im.get("sha256") or "").lower(), f"unknown image {im.get('id')}") for im in images]


def sha256_of(path):
    with open(path, "rb") as f:
        return hashlib.sha256(f.read()).hexdigest()


def check_files(paths):
    for p in paths:
        if not os.path.isfile(p):
            fail(f"Missing store picture: {p}")
        with open(p, "rb") as f:
            data = f.read()
        problem = screenshot_problem(png_size(data[:24]), len(data))
        if problem:
            fail(f"{os.path.basename(p)}: {problem}")


def replace_images(edits, edit_id, language, image_type, paths):
    from googleapiclient.http import MediaFileUpload

    edits.images().deleteall(packageName=PACKAGE, editId=edit_id, language=language, imageType=image_type).execute()
    for p in paths:
        media = MediaFileUpload(p, mimetype="image/png", resumable=False)
        got = edits.images().upload(packageName=PACKAGE, editId=edit_id, language=language,
                                    imageType=image_type, media_body=media).execute()
        log(f"  {image_type}: uploaded {os.path.basename(p)} (sha256 {got.get('image', {}).get('sha256', '?')[:12]}...)")


def play_order(edits, edit_id, language, names_by_sha):
    imgs = edits.images().list(packageName=PACKAGE, editId=edit_id, language=language,
                               imageType="phoneScreenshots").execute().get("images") or []
    return order_by_sha(imgs, names_by_sha)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--language", default="en-US")
    ap.add_argument("--with-text", action="store_true", help="also set title / short / full description")
    ap.add_argument("--listing-file", default=LISTING_TEXT)
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()

    shots = screenshot_paths()
    check_files(shots)
    for p in (FEATURE_GRAPHIC, ICON):
        if not os.path.isfile(p):
            fail(f"Missing store picture: {p}")
    names = {sha256_of(p): os.path.basename(p) for p in shots}
    expected = [os.path.basename(p) for p in shots]
    text = None
    if a.with_text:
        with open(a.listing_file, encoding="utf-8") as f:
            text = parse_listing(f.read())
    log(f"Uploading screenshots in this order: {expected}{' + listing text' if text else ''}; "
        f"{'DRY RUN' if a.dry_run else 'LIVE'}")

    api = service()
    edits = api.edits()
    edit_id = edits.insert(packageName=PACKAGE, body={}).execute()["id"]
    log(f"Opened edit {edit_id}")
    details = edits.details().get(packageName=PACKAGE, editId=edit_id).execute()
    log(f"Listing default language: {details.get('defaultLanguage')}")
    log(f"Screenshots on Play before: {play_order(edits, edit_id, a.language, names)}")

    if text:
        edits.listings().patch(packageName=PACKAGE, editId=edit_id, language=a.language, body=text).execute()
        log(f"Listing text set: title '{text['title']}', short {len(text['shortDescription'])} chars, "
            f"full {len(text['fullDescription'])} chars")
    replace_images(edits, edit_id, a.language, "phoneScreenshots", shots)
    replace_images(edits, edit_id, a.language, "featureGraphic", [FEATURE_GRAPHIC])
    replace_images(edits, edit_id, a.language, "icon", [ICON])

    got = play_order(edits, edit_id, a.language, names)
    log(f"Screenshots in the edit: {got}")
    if got != expected:
        edits.delete(packageName=PACKAGE, editId=edit_id).execute()
        fail(f"Play reports {got}, expected {expected}. Edit discarded; nothing changed on Play.")

    result = finish_edit(api, edit_id, a.dry_run, "store pictures" + (" + text" if text else ""))
    if result != "validated":
        check = edits.insert(packageName=PACKAGE, body={}).execute()["id"]
        try:
            log(f"FINAL screenshot order on Play: {play_order(edits, check, a.language, names)}")
        finally:
            edits.delete(packageName=PACKAGE, editId=check).execute()
    log(f"RESULT: {result}")


if __name__ == "__main__":
    main()
