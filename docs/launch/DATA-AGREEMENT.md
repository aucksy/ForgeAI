# ForgeAI data agreement for gyms (source of /data-agreement.html)

Approved by the owner "as written" on 24 Oct 2026 (tracker #59), from
docs/launch/DRAFT-2026-10-24-server-copy-and-gym-terms.md Part 2. The admin app's "Create my gym"
tick box and the one-time terms card link to it ("I agree to the ForgeAI terms and the data
agreement"). The version below must match TERMS_VERSION in apps/dashboard/src/crm/auth/terms.ts
(test/crm/legalPages.test.ts checks it). Build the page with `python scripts/legal_pages.py`.
Changed from the draft: point 3 says names and addresses are hidden too (the owner chose that on
24 Oct 2026, and the import now does it); the lawyer notes moved to the end; "[30] days" is 30 days;
the internal file path in point 5 is left out.

---

## ForgeAI data agreement for gyms

**Version 2026-10-24.** Between ForgeAI, run by [OWNER NAME], Jaipur, India ("we"), and the gym
whose owner ticks "I agree" ("you"). It is part of the ForgeAI terms.

**1. Your records are yours.** Your members' details, memberships, payments, receipts,
check-ins, shop orders, staff and messages are your gym's records. Under India's data law
(DPDP Act 2023) **you are the Data Fiduciary** for them and **we are your Data Processor**.

**2. What we do with them.** We store and process them only to run ForgeAI for your gym, and
only as the app's features and your staff's actions direct. We do not sell them, show ads with
them, use them for our own marketing, or share them with other gyms. We may count them in
totals that name no gym or person (for example, how many check-ins ForgeAI handled).

**3. Who else handles them (our service providers).**
- **Supabase**: our database, in Mumbai, India.
- **Cloudflare**: delivers the admin app and passes requests to the database; it also keeps our
  feedback box and daily AI-use counts.
- **Google Gemini, then Anthropic Claude if Gemini fails**: only when your owner imports a member
  list and presses **Ask AI**. They see the column names and the first 5 rows of the file. Names,
  addresses, mobile numbers, emails, PAN and ID numbers, and any run of 7 or more digits are
  hidden first, twice (in your browser and again on our server): a column of names or addresses
  shows only "[name]" or "[address]". Plan names, amounts and dates in those 5 rows are **not**
  hidden. The AI only answers which column is which; we keep nothing from the file. These
  companies are outside India.

We tell you before we add a new provider that sees your records.

**4. Security.** Data travels encrypted. Each gym can reach only its own records. Staff sign in
with single-use codes, and only people the owner adds can sign in. Every receipt records who took
the money. The admin app keeps a copy of your records on each device a staff member signs in on,
so the desk works without internet; signing that device out deletes the copy.

**5. If something leaks.** We tell you in writing **within 24 hours** of finding out: what
happened, what data, what we did, and what comes next. We help you send the Data Protection Board
your first notice straight away and the full report within 72 hours, and tell the members
affected.

**6. Your duties.**
- Tell your members that you keep their records in ForgeAI (a short notice you can copy is in our
  privacy notice), and have a lawful reason or their consent to keep them.
- Keep the records accurate, and correct them when a member asks.
- Add only people who need access, and remove staff who leave (Settings → people).
- Use members' details only for your gym's work.
- Tell us at once if a phone or computer with the app is lost, or data looks exposed.
- Only import a member list you are allowed to use.

**7. Members' own requests.** If a member asks you to see, correct or erase their details, you
handle it. We help when you ask. If a member asks us, we pass it to you.

**8. Getting your data out.** At any time, the owner can download everything: **Settings → Your
data → Download all your gym's data** (an Excel file and a full copy). If that does not work for
you, we send you the same within 7 days of asking.

**9. Deleting your gym.** The owner asks in **Settings → Your data → Delete our gym from ForgeAI**,
or by email. We call the gym's own number to confirm, remind you to download first, then delete
every member, payment, check-in and shop order of your gym from our server **within 30 days** of
the request. Backup copies expire within 7 more days. We keep the request itself, and the record
that you accepted this agreement, for 2 years, as proof.

**10. Members' own saved workouts are not your records.** A member who signs in with Google can
save their own workouts, body weight and measurements on ForgeAI. That copy belongs to the member;
**ForgeAI** is responsible for it, not your gym. You, your trainers and your desk cannot see it,
and deleting your gym does not delete it.

**11. Our record of your acceptance.** When your owner ticks "I agree", we keep: the gym, who
ticked it (their name as signed in), when, which version, whether it was at "Create my gym" or at
a later sign-in, and a one-way scrambled form of the internet address it came from. That
scrambled form can still be traced back, so we protect it like any other personal data.

**12. Term and ending.** This agreement runs while your gym uses ForgeAI. You can stop at any
time and ask us to delete your gym (point 9). We may end it with 30 days' written notice, or at
once for serious misuse; you can still download your data during the notice.
Points 5, 9 and 10 continue after it ends, until your records are deleted.

**13. Liability.** ForgeAI is a beta.

**14. Changes.** We tell the owner in the admin app before a new version applies, and ask the
owner to accept it again. The version date is at the top.

**15. Law.** Indian law; courts in Jaipur. Contact: [OWNER NAME], [CONTACT EMAIL].

---

## Open points for the lawyer (from the draft; not on the page)
1. Is an online tick box with this record enough for a DPDP s.8(2) processor contract?
2. Point 2: the anonymous totals.
3. Point 3: confirm Gemini's and Anthropic's API terms do not use this data for training, and that
   our Gemini key is on a paid project.
4. Point 3: the notice period before a new provider.
5. Point 9: keeping the request and the acceptance record for 2 years.
6. Point 12: 30 days' notice, and ending at once for serious misuse.
7. Point 13: the liability cap belongs in the pilot agreement (launch plan D3); not set here.
