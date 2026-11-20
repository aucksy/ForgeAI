# A5-phone-components-2-3 checkpoint

F-phone-1421: 13 journeys, 14 type lines
F-phone-1422: 12 journeys, 14 type lines
F-phone-1424: 10 journeys, 16 type lines
F-phone-1405: 10 journeys, 16 type lines
F-phone-1428: 10 journeys, 16 type lines
F-phone-1427: 8 journeys, 16 type lines
F-phone-1429: 10 journeys, 16 type lines

All 7 items done. Output: _work/out/A5-phone-components-2-3.jsonl (182 rows: 73 journeys, 108 type lines, 1 finding).

## Entities
- F-phone-1422 (profile) writes only the phone's local SQLite table user_profile (apps/mobile/src/onboarding/db/dataActions.ts:191-193, db/queuedWrites.ts:30-32). No entity in entities.json covers phone-local profile rows, so writes/reads are left empty.
- F-phone-1405, 1427, 1428, 1429: UI frames; the data they act on belongs to the calling screen. No entity linked.

## Seen in passing (not sure enough for a finding)
- Join card "Next" (JoinGymCard.tsx:26-33) calls router.push with no busy guard; a fast double tap may stack the invite screen twice. Not driven.
- UndoBar time-out (UndoBar.tsx:34-42) never fires if the app is closed while the bar shows; whether the delete then holds is up to each calling screen. Not checked per caller.
- UndoBar uses a polite live region only (UndoBar.tsx:60); iOS has no live region, so "Number removed" may not be spoken on iPhone.
- useAnnounce (useAnnounce.ts:12-19) does not re-speak the same error if it never cleared in between (for example two taps on Next with the same short code).
- Body figure chips (ProfileCard.tsx:496) save straight to the tracker settings, without the "Saved" line or "Try again" the other chips get.
- With no stored profile, the profile card stays empty and edits are silently not saved (ProfileCard.tsx:178-180, commitNow returns when no profile).

## Could not check
- Who "pass member" and "prospect" are in practice: journeys follow the code, which treats them the same as a member.
- Invite screen words after "Next" (only the not-found words were read, shop/gym.ts:903-912).
- Exact Undo bar words for set and measure deletes (not read; budget).
