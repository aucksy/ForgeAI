# If data leaks or the server is broken into — first-hour plan (launch plan D7)

India's DPDP Rules 2025: the gym (responsible for its members' data) must tell the Data Protection
Board "without delay" and send a full report within 72 hours, and tell affected members. We handle
the data for the gym, so **we tell the gym within 24 hours** (pilot agreement).

## First hour (Claude, or whoever sees it first)
1. Write down the time it was found and how.
2. Stop it: revoke the leaked key or sign-in (Supabase: rotate keys; admin app: "Sign out everywhere";
   remove the staff person), or pause the admin app (Cloudflare: roll back or take the route down).
3. Keep the evidence: do not delete logs or rows. Copy the Supabase logs for the time window.
4. Tell the owner (Aakash) by phone or WhatsApp.

## Within 24 hours (Aakash + Claude)
5. Find out: what data, whose, how many people, from when to when, is it still happening.
6. Tell the gym owner in writing: what happened, what data, what we did, what happens next, a contact.
7. Fix the cause; prove it with a test; release.

## Within 72 hours (the gym, with our help)
8. The gym sends the Board its first notice (straight away) and the full report (by 72 hours).
9. The gym tells affected members (in the app, WhatsApp or SMS): what happened, possible effects,
   what they can do, the complaints contact.

## Afterwards
10. A short written note: cause, fix, what changes so it cannot happen again. Keep it at least a year.
