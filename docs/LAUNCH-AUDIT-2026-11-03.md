# Launch readiness audit, 3 Nov 2026

Three independent read-only reviews before the first gym trial (R-315). Raw findings below; status is tracked in PROGRESS.md.

# Member app + watch audit (3 Nov night)
1 BLOCKER first check-in needs desk approval, 60/h cap; no "approved" alert. Fix: desk "Approve all" / auto-approve when number+name match gym list; push "You're confirmed. Scan again."
2 HIGH membership hidden until first check-in. Fix: link number typed at setup once desk confirms.
3 HIGH no-account members never nudged to back up. Fix: card after 3rd workout, dismiss 30 days.
4 MED-HIGH floating feedback button covers buttons (Find a plan, check-in arrow, finish card). Fix: off by default for real members.
5 HIGH-RISK watch logging unproven on a real watch; FGS form.
6 MED finish "Your first workout" + "Last time" contradiction (maybe fixed) - verify.
7 LOW-MED "Last: 23 Oct · Push 1A" header -> "Previous:".
8 LOW wrong gym link page -> "We couldn't find this gym" + Scan poster / Type a gym code.
9 LOW em dashes and checkmarks in check-in words.
Ideas: Approve all (S); start routine from watch (M); plan-ends banner on Workout tab (S); check-in -> Start next routine (S); WOD widget (S-M); missed-you opens next routine (S); share card w/ gym logo F146 (M); bring a friend F147 (M).

# Gym owner side audit (3 Nov night)
1 BLOCKER no backup (same as ops #1); "Create my gym" promises data is safe.
2 BLOCKER (owner tasks) GGMS export not received; pilot agreement unsigned; gym visit not done.
3 HIGH no down alert / free server pauses after 7 quiet days (verify existing 10-min outage check).
4 HIGH fee reminder says "pay on UPI" with no UPI ID. Fix: Gym UPI ID setting + upi:// pay link with amount in fee/renewal/receipt messages.
5 HIGH unproven: expired member can check in via QR. Fix: Today card "Came in on an expired plan or with dues today" + WhatsApp.
6 MED Today screen ~12 phone screens; Money to collect at bottom. Fix: hide finished setup cards; move Talk-to + Money-to-collect under tiles.
7 MED forgotten PIN locks owner out. Fix: HQ one-time reset code + support contact.
8 MED enquiries lack source / trial visit / lost reason. Fix: 3 optional fields + joined % by source.
9 LOW data download under Danger zone. Move up + last downloaded date.
10 LOW Hinglish only on first-day screens. 11 LOW staff device holds full data. 12 LOW owner mobile not verified. 13 LOW F102, F115.
Ideas: UPI pay link (S); came-in-expired list (S); early-renewal nudge (S); annual upsell in renewal msg (S); PT upsell list (S); promised-by date on part payments (M); enquiry source report (M); Monday WhatsApp summary (S).
Market: reliability (backups, support, fixed price, correct totals) beats features.

# Website / onboarding / ops audit (3 Nov night)
1 BLOCKER no gym-data backup (free Supabase; promised nightly backup to Cloudflare R2 never built; restore drill blocked). Fix: nightly dump job to R2 + one practice restore on staging. Engineer alone ~half day.
2 BLOCKER members can't get app from Play (personal account: 12 testers x 14 days closed test before production). GitHub APK has a different signature from Play -> uninstall needed. Fix: recruit 12+ testers to closed track now; route gym members via closed-test link. Needs owner Play account (I can drive his Chrome).
3 HIGH gyms.mettleup.fit has no privacy/terms/data agreement links, no contact. Fix: footer w/ Privacy, Terms, Data agreement, contact@mettleup.fit (engineer alone; WhatsApp number needs owner).
4 HIGH paused gym told "Call MettleUp" with no number; lost PIN = email + hand reset. Fix: show contact email everywhere (number needs owner).
5 HIGH unproven: daily crash check may lack Cloudflare key secret -> no crash alerts. Check last run log.
6 MED AI help waits for Anthropic credit ~12 Nov; trial WhatsApp support group TODO (owner).
7 MED Play Data safety may not cover server-saved workouts/measurements; Play description "workouts stay on your phone" outdated; no standalone account-deletion web page. Needs owner yes on privacy wording.
8 MED Cloudflare free 100k req/day unmeasured; check after week 1.
9 LOW trial start works; GGMS import untested on real export; gym page lists "gym sees member progress" as Coming though trainer view shipped; Hindi switch unchecked; any mobile can create a gym (no OTP).
10 LOW launch plan doc stale; 2FA + key backup checks open (owner).
