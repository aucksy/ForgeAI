#!/usr/bin/env python3
"""Shared bits for the Google Play scripts (play_upload.py, play_listing.py).

Keyless: the workflow's google-github-actions/auth step (Workload Identity Federation, no key file)
writes a short-lived credentials file and points GOOGLE_APPLICATION_CREDENTIALS at it; google.auth
picks it up and acts as the service account mettleup-play@forgeai-d7eea. The Google libraries are
imported inside the functions, so the pure parts of the scripts (and their self-tests) need only the
standard library.
"""
import sys

PACKAGE = "com.mettleup.app"
SCOPE = "https://www.googleapis.com/auth/androidpublisher"


def log(msg):
    print(msg, flush=True)


def warn(msg):
    print(f"::warning::{msg}", flush=True)


def fail(msg):
    print(f"::error::{msg}", flush=True)
    sys.exit(1)


def service():
    """The Android Publisher v3 client, with long timeouts (an AAB is ~60 MB)."""
    import google.auth
    import google_auth_httplib2
    import httplib2
    from googleapiclient.discovery import build

    creds, _ = google.auth.default(scopes=[SCOPE])
    raw = httplib2.Http(timeout=900)
    # A resumable upload answers each chunk with 308 "Resume Incomplete"; httplib2 would follow it as a
    # redirect and crash (RedirectMissingLocation). googleapiclient's own build_http() drops 308 the same way.
    raw.redirect_codes = raw.redirect_codes - {308}
    http = google_auth_httplib2.AuthorizedHttp(creds, http=raw)
    return build("androidpublisher", "v3", http=http, cache_discovery=False)


def http_error_text(e):
    """A readable line from a googleapiclient HttpError (or any exception)."""
    status = getattr(getattr(e, "resp", None), "status", "")
    content = getattr(e, "content", b"")
    if isinstance(content, bytes):
        content = content.decode("utf-8", "replace")
    detail = " ".join(str(content or e).split())
    return f"HTTP {status} {detail}"[:1500].strip()


def needs_not_sent_for_review(error_text):
    """True when Play refused a commit because of review: it cannot send the edit for review by
    itself (it then names the changesNotSentForReview flag), or earlier changes are still IN review
    (ERROR_IF_IN_REVIEW). Both are fixed by committing without sending for review. PURE."""
    t = error_text.lower()
    return "changesnotsentforreview" in t or "in review" in t or "being reviewed" in t


def finish_edit(api, edit_id, dry_run, what):
    """Dry run: validate the edit, then throw it away. Otherwise commit it and send it for review.

    Never cancels a review already running (Play's default would: CANCEL_IN_REVIEW_AND_SUBMIT restarts
    the closed test's review from zero). When Play is still reviewing earlier changes, or will not send
    this edit for review itself, the edit is committed WITHOUT sending it, and the log says the owner
    must press "Send changes for review" in Play Console."""
    from googleapiclient.errors import HttpError

    edits = api.edits()
    if dry_run:
        try:
            edits.validate(packageName=PACKAGE, editId=edit_id).execute()
            log(f"DRY RUN: Play VALIDATED the edit ({what}). Not committed; discarding it.")
        finally:
            try:
                edits.delete(packageName=PACKAGE, editId=edit_id).execute()
            except HttpError as e:
                warn(f"Could not discard the dry-run edit (it expires by itself): {http_error_text(e)}")
        return "validated"
    try:
        edits.commit(packageName=PACKAGE, editId=edit_id, changesInReviewBehavior="ERROR_IF_IN_REVIEW").execute()
        log(f"COMMITTED the edit ({what}).")
        return "committed"
    except HttpError as e:
        text = http_error_text(e)
        if not needs_not_sent_for_review(text):
            raise
        log(f"Play would not send this for review now ({text}). Committing without sending it.")
        # Still ERROR_IF_IN_REVIEW: if Play can only take this edit by cancelling a running review, it
        # refuses and this run fails loudly instead.
        edits.commit(packageName=PACKAGE, editId=edit_id, changesNotSentForReview=True,
                     changesInReviewBehavior="ERROR_IF_IN_REVIEW").execute()
        warn(f"COMMITTED ({what}) but NOT sent for review (Play is reviewing earlier changes, or will not "
             "send it by itself): in Play Console → Publishing overview, press 'Send changes for review'.")
        return "committed-not-sent-for-review"
