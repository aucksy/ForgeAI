# R — AI import: a gym moves its old data in by itself (22 Oct 2026)

Owner's request, research only. Nothing is built yet.

> "In the long run, I cannot be the one personally helping gym owners on board, and the biggest
> friction will be ... exporting the data ... enable AI in their admin panel import ... a flexible
> and modifiable database. So if the AI detects new fields, new type of data, then we should be able
> to just real time add those fields in the data for that gym owner and keep the data import or
> migration completely smooth."

## The short answer

- **Yes, build it. It is mainstream abroad and missing in India.** HubSpot, Flatfile, Dromo and
  OneSchema all guess columns with AI. Gym software abroad does migrations by hand, often for a fee.
  Indian rivals offer a fixed "Bulk Upload" template. Nobody reads a photo of a paper register.
- **New fields: add them as data, not as database columns.** A gym's records are already stored as
  one flexible JSON row each. A new field ("Locker no.", "Blood group") becomes one entry in that
  gym's field list plus a value inside each member's row. That is instant, affects only that gym,
  and needs **no change to the gym database at all**. Adding real columns per gym in a shared
  database is risky and is not done by serious multi-tenant products (reasons in section 3).
- **The AI only points; tested code reads.** For a spreadsheet the AI sees only the column names and
  5 example rows (mobile numbers hidden). It says "column F is the expiry date, column K is a new
  field: Locker no." Our existing, tested code then reads every date, mobile and rupee amount. The
  AI never types member data into the gym. For photos of registers it must read the page, so each
  page is read twice and every disagreement is shown to the owner.
- **Cost is tiny.** About **₹0.40 per spreadsheet** and about **₹1–2.50 per register page** at
  today's Google prices (estimate; must be measured on real files first). A whole paper register of
  400 members is roughly ₹40.
- **First version:** spreadsheets only, AI column guessing, new member fields, plan-name matching,
  owner only. No gym-database change.

---

## 1. What we already have (from the code)

The import screen (Members → Import) is already strong. From `ImportMembers.tsx`,
`logic/importMembers.ts`, `importTerms.ts`, `sheets.ts`, `undoImport.ts`:

- Reads .xlsx, old .xls, CSV, tab text, and "Excel" files that are really web pages. Several sheets:
  it picks the one that looks most like a member list; the owner can switch.
- Finds the row with the column names (a register often starts with the gym's name).
- Guesses each column from **its name** (English, Hinglish and Hindi word lists) and then **from what
  is in it** (mobiles, emails, gender, dates, money).
- Reads Indian dates (15/08/2026, 15-Aug-26, Excel date numbers) and notices a month-first sheet.
- Mobiles go through the same rules as the add-member form. Money reads "Rs. 1,500/-", "1.5k",
  "1.2 lakh".
- Plans with dates become **real memberships**, and money paid becomes **real receipts**, with
  dues. A payments list (one row per payment) is understood.
- Duplicates: same mobile **and** same first name is the same person; a family sharing one mobile is
  two people.
- Shows every row's fate before saving. Saves in batches. A skipped-rows file to fix in Excel.
- **"Undo this import"** for the owner. Records typed in by hand can never be deleted by it.
- 16 fixed fields. **Any other column is dropped** unless the owner points it at Notes. This is the
  gap the owner is describing.

So the AI work is an upgrade on top of a tested base, not a rebuild.

## 2. How others do it, and what users complain about

### Gym software (mostly done by people, not software)

| Product | How migration works | Source |
|---|---|---|
| Glofox / ABC | Their team imports your Excel. "Member data only" or "members + payment data". Advises moving only current members. Start 1–2 months before the old contract ends. | Glofox help, blog |
| Mindbody | CSV exports. A paid export service for bigger data (competitors report about $500; not confirmed). Access ends 30 days after cancelling. | Mindbody blog, Spark |
| PushPress | "Migration Assistant": upload active members, then add plans, anniversary dates, past check-ins. Minimum: first name, last name, email. Appointments are not migrated. | PushPress help |
| GymMaster | Self-upload needs **column names that exactly match their template**. A paid data-transfer team for 150+ memberships. | GymMaster help |
| Wellyx | Says migration is free and done by their team (third-party listing). | Zoftware |
| Leaving PushPress for WodBoard | Plans are matched **by exact name**; edit nothing in the file. | WodBoard help |
| Indian rivals (OkGym, GymBook) | "Bulk Upload" with their own template (our earlier research). | Audit/crm-research |

Our earlier research (R1) found PushPress's free hands-on migration is the best-loved switching
story abroad. The owner cannot be that person for every Indian gym. Self-serve AI is the way to
offer the same thing without him.

### General import tools (where AI mapping is mature)

| Tool | What it does that matters to us |
|---|---|
| HubSpot | Matches headers by language. **"Create new property"** right in the mapping step. You pick the key that finds existing records (email or record ID). Errors shown at mapping. **No native undo.** |
| Insycle (HubSpot add-on) | AI suggests the mapping **from column names only, never record data**. A privacy-minded design we partly copy. |
| Flatfile | Learns from past choices; says it predicts over 90% of mappings. Then a review table with live validation. |
| Dromo | AI matching that copes with synonyms and other languages. When unsure, it hands the column to a person instead of failing. |
| OneSchema | 50+ checks and fixes. Bad rows are reported as errors, not silently "fixed". Custom columns per customer. |
| Osmos | AI that tidies messy files, PDFs and old-system exports. |
| Airtable | Detects field types from values. Merges on a field you choose. 25,000 rows / 5 MB cap. |
| Notion | "Merge with CSV" with a preview of how columns map. |

### What users complain about (and our answer)

1. **Rigid templates** that reject their file (GymMaster) → accept any layout; the AI and our rules
   work out the columns.
2. **Paying to export or migrate** (Mindbody, Glofox payment exports, GymMaster) → free and self-serve.
3. **An import overwrote good data and there is no undo.** HubSpot's "undo import" request has been
   open for years; a third-party blog says restore exists only on Enterprise → we never overwrite
   (only fill blanks) and we already have undo.
4. **Duplicates after a merge** (Airtable community) → mobile + first name, inside the file and
   against the gym.
5. **Plans must match by exact name** (WodBoard) → AI suggests the match, owner confirms.
6. **History lost or left manual** (paused plans, discounts, appointments) → bring plans, payments,
   dues, notes and extra fields; say plainly what does not come over.

India is easier in one way: no stored cards to move (cash and UPI). It is harder in another: paper,
Hinglish, and home-made sheets.

## 3. Storing new fields per gym (the database question)

How the gym's data is stored today: one table, `crm_records`. Each member, plan, membership, payment,
visit is one row with the record as a JSON object (`data`). The admin app loads the whole gym into
the browser, and sends back only the rows an action changed (`crm_pull` / `crm_push`). The server
checks the gym, the version, who may do what, and that a record is under 20,000 bytes. It does
**not** check which fields a member has.

Three ways to add "Locker no." for one gym:

| Option | What it means | Verdict |
|---|---|---|
| **A. Real database columns, added live per gym** (`ALTER TABLE`) | The table is shared by every gym, so a column added for one gym exists for all. Adding a column locks the whole table (PostgreSQL takes its strongest lock, `ACCESS EXCLUSIVE`) while every gym is writing. A table can never have more than 1,600 columns, for the whole platform. Two gyms' "Locker" (number vs text) collide. The admin app would need database-changing rights, which is a serious security hole. A table per gym instead means thousands of tables and every future change run thousands of times. | **No.** |
| **B. A separate value table** (one row per gym + member + field + value, "EAV") | Very flexible, but every value is text, reads need many joins, and big tenants get slow (a PostgreSQL mailing-list report). It also does not fit our sync, which moves whole records. | **No.** |
| **C. JSON inside the record + a field list per gym** | The member row gets `extra: { locker: "12" }`. The gym gets a list saying "locker = Locker no., text". This is what our records already are. Salesforce works the same way in principle: fields are described as data (metadata), not as real columns. | **Yes.** |

Why C fits us:

- **No database change, ever, to add a field.** Adding a field is adding data. It is instant and
  touches only that gym.
- **Sync, offline desk copy, undo and export work unchanged.** The extra values ride inside the
  member record, so they travel wherever the member goes.
- **Security is unchanged.** `crm_records` has row-level security on and all direct access revoked;
  every read and write goes through the key-checked functions that pin the gym. New fields inherit
  that automatically. Real columns would need new grants each time.
- **Search and filter** run in the browser, where the whole gym already sits (a few thousand members
  at most). No index is needed. If the server ever must search one field (say the member app shows
  "Your locker"), PostgreSQL can index just that one key inside the JSON, which is a small, additive
  change made once.
- Limits to respect: the 20,000-byte cap per record (keep extras small; long text goes to Notes),
  and PostgreSQL's advice to keep JSON documents a manageable size.

Where the gym's field list lives: inside the gym's own details record (the "gym" row), which only the
owner can change on the server already (Staff get OWNER_ONLY). That needs code changes in the admin
app (it currently keeps only name, phone, address and GSTIN from that row) but **no server change**.
If the list ever outgrows that row, a dedicated record kind can come later (a small migration).

## 4. The AI part

### Which model, and why

| Job | Recommended | Price today (Google's page, per million tokens) | Why |
|---|---|---|---|
| Work out the columns of a spreadsheet | **Gemini 3.1 Flash-Lite** | $0.25 in / $1.50 out | Small text job; cheapest current Gemini. |
| Read a photo or PDF of a register | **Gemini 3.8 Flash** (test Sarvam Vision too) | $0.75 in / $3.75 out, **doubling on 1 Jan 2027** to $1.50 / $7.50 | Handwriting and Hindi need the stronger reader. |
| Second opinion on a page the two reads disagree on | Gemini 3.1 Pro (preview) | $2.00 in / $12.00 out | Rare, only for disputed pages. |

- **Go to Google directly with a paid key, not through OpenRouter.** On the paid tier Google says it
  does not use prompts or answers to improve its products, and a Data Processing Addendum applies.
  The free tier does use them, so **the free tier must never see member data**. OpenRouter adds
  another company to the chain and routes between providers; keep it only for comparing models in
  tests. (Lesson: never drive Gemini's website with a bot; API only.)
- **Hindi evidence.** A June 2026 study of 10 readers on real Hindi scans: Gemini 2.5 Flash scored
  best (86.3), Claude 82.2, GPT-5.5 only 58.5; nine of ten fell apart on real scans. It tested
  printed text, not handwriting. Sarvam (an Indian company) reports its Vision 2.1 at 87.4 against
  Gemini 3.6 Flash at 79.4 on its own Indic test, which includes handwriting; price and hosting are
  not stated. **Before choosing the photo reader, run 10 real register photos through both.**
- **Use a separate ForgeAI key** (its own Google Cloud project), not BragBuddy's or VastuFirst's,
  so billing and data terms stay separate.
- Ask for the answer in a fixed JSON shape (Gemini's response schema). Keep "thinking" low: a past
  lesson showed a cheap model thinking hard cost more than an expensive one.

### Where the AI call runs

In the panel's Worker (`deploy/panel/worker.js`), a new path such as `/api/import-ai`. The Worker
already answers `/api/*`. The Google key is a Worker secret. **It is never in the browser.**

1. The browser reads the file itself (as today) and sends only what the AI needs.
2. The Worker checks the sign-in key with the gym server (`staff_me`) and refuses anyone but an owner.
3. It checks a daily limit per gym, calls Google, and returns the JSON answer.
4. It logs only counts and cost, never member data. It stores nothing from the file.

Waiting for Google does not count against the Worker's CPU limit. On Cloudflare's free plan the CPU
limit is 10 ms per request; passing a photo through should fit, but it must be measured. If it does
not, the paid Workers plan ($5 a month) lifts it to 30 seconds.

### Sending member data to an AI company (India's DPDP Act 2023)

- The **gym is the data fiduciary** for its members. **ForgeAI is its data processor**, and Google
  becomes a sub-processor. The Act lets a fiduciary use a processor only under a valid contract
  (section 8(2)), and the gym must tell members what data is used and why (section 5).
- Transfers abroad are allowed unless the government blacklists a country (section 16). Reports say
  no country has been listed.
- Dates: the Rules were notified on 13 Nov 2025. The main duties (notice, consent, security, breach
  reporting) start **13 May 2027**. A plan to shorten that to 12 months was reported in early 2026; I
  found no confirmation it happened.
- What that means in practice:
  1. **Send as little as possible.** For spreadsheets: column names plus 5 example values per column,
     with mobiles and emails masked in the browser first ("98XXXXXX12"). For photos the page has to go.
  2. **Ask the owner every time**, in one plain line, with a "do it myself" button that never sends
     anything. The manual import keeps working without AI.
  3. **Never send** body photos or ID numbers (Aadhaar, PAN).
  4. Name Google as a sub-processor in ForgeAI's privacy policy and gym terms.
- Draft wording (for the owner to approve, ideally checked by a lawyer before May 2027):
  - Spreadsheet: *"Let AI read this file? ForgeAI sends the column names and 5 example rows (mobile
    numbers hidden) to Google's Gemini AI to work out which column is which. Google does not use it to
    improve its AI. Nothing is saved until you check the list and tap Add."* [Use AI] [I'll do it myself]
  - Photo: *"ForgeAI sends this photo to Google's Gemini AI to read it. Google does not use it to
    improve its AI. Only send pages you are allowed to share."* [Read the photo] [Cancel]
  - For the gym's own notice to members: *"Your details are kept in our gym software, ForgeAI. ForgeAI
    uses trusted service providers, including Google for reading our old records, only to run our
    gym's records."*

### Keeping the AI from inventing data

- **Spreadsheets: the AI never returns member values.** It returns only "which column is what",
  "which plan name is which plan", and for short coded columns a value list ("सुबह 6-8" → "Morning
  6-8", "M" → Male). Our tested code reads every cell. A column the AI is unsure about is left
  unplaced, with its suggestion shown, never guessed in.
- **Our own word lists go first** (free, instant, tested). The AI only fills what they left. If the
  AI disagrees with a placement our rules made, it is shown as a suggestion, not applied.
- **Photos: read twice, compare cell by cell.** A past lesson (VastuFirst): the same photo read twice
  gave 20 rooms once and 14 the next, and the short read looked just as confident. Cells that differ,
  or rows found in only one read, are marked for the owner. The AI must write "unclear" instead of
  guessing. Mobiles must be 10 digits starting 6–9. If the page has a total, the sum of the read
  amounts must match it. Research agrees: check an AI-read table with fixed rules against the source,
  not by asking another AI to judge it (AI judges invent errors too).
- **Nothing is saved until the owner taps Add**, and Undo works after.

---

## 5. The recommended design, step by step (what the owner sees and does)

1. **Members → Import.** "Pick a file" (Excel, CSV; later PDF), "Take photos of your register"
   (later), "Paste a WhatsApp list" (later).
2. **The file opens in the browser.** Our built-in guess runs first, as today.
3. **If any column is left unplaced** (or the owner taps "Let AI check"), a card shows the one-line
   privacy note with [Use AI] / [I'll do it myself]. "Don't ask again for this gym" is an option.
4. **"Which column is which"** (today's screen, upgraded). Each column shows where it goes; AI
   guesses carry a small "AI" tag and a one-line reason ("dates mostly in the future → Valid till").
   The owner can change any.
5. **"New details we found"** card: columns that fit no built-in field, e.g. *Locker no. (text,
   e.g. 12, 14, B-3)*, *Blood group (choice: A+, B+, O+)*, *Weight (number, kg)*. Each has a tick
   (on when the AI is confident and the column is mostly filled), an editable name, and the type.
   Junk columns (serial numbers, blanks, totals, ID numbers) are listed as "Not imported" with why.
6. **"Plans in your file"** card: each different plan name with its count, and the AI's suggestion:
   *"3 Months + PT" (42 members) → new plan, 3 months, PT add-on noted* / *"Qtrly" → your plan
   "Quarterly"* / *"Student offer" → not sure, keep as written*. The owner confirms.
7. **"Check the list"** (today's screen): every row's fate, problems in red, warnings in amber, and now
   the extra details per row. Old expired members are set to come in as past (archived) members;
   one switch changes that.
8. **Add.** Progress bar, summary, skipped-rows file, Undo.
9. **Afterwards** the new fields appear on every member page and in the add/edit form, so the desk
   keeps filling them in.

Photos (later): the owner photographs each page; each page is read twice; the page sits on the left,
the table on the right; disputed cells are yellow; the owner fixes them and taps "Page checked". The
checked table then goes through steps 4–8 exactly like a spreadsheet.

## 6. The data design (how extra fields are stored and shown)

**The gym's field list** (inside the gym's details record; owner only):

```
customFields: [
  { key: "x_locker", label: "Locker no.", type: "text", on: "member",
    choices: null, unit: null, showInList: false, hidden: false,
    addedBy: "import-lq3k9", addedAt: 1761100000000 }
]
```

**Each member** (inside the member record):

```
extra: { "x_locker": "12", "x_blood": "B+", "x_weight": 72.5 }
extraFrom: { "x_locker": "import-lq3k9" }   // which import filled a value, so Undo can clear it
```

Rules:

- **Types:** text, number (with a unit), date, yes/no, choice, mobile, money. Values are stored
  already read (dates as YYYY-MM-DD, money in paise). A column that is mostly not its type becomes
  text, so nothing is lost.
- **The key never changes.** Renaming changes only the label. Hiding a field keeps its values (like a
  plan made inactive). Nothing is ever deleted except by Undo of the import that added it.
- **Built-in fields always win.** The AI must use Mobile, Batch, Notes etc. when they fit.
- **Limits:** 40 fields per gym, 300 letters per value, the whole `extra` under about 6 KB per member
  (the server refuses records over 20,000 bytes).
- **Labels are English** (the admin app is English only, owner rule 16 Oct). A Hindi header gets an
  English label, with the original shown in brackets on the mapping screen. Member names and values
  stay exactly as written.
- **Who:** only the owner adds, renames or hides fields (the server already allows only the owner to
  change the gym record). Staff see and fill values.
- **Undo:** today Undo removes the members, plans, memberships and receipts an import created, but
  not blanks it filled into existing members. With `extraFrom` it can also clear the extra values it
  filled, if nobody changed them since.

**Where they show:**

- Member page: a "More details" card.
- Add / edit member form: a "More details" section at the bottom.
- Members list: the owner can pick up to 2 fields to show as a tag and filter by (e.g. Locker no.,
  Trainer).
- Search covers text fields. The gym's Excel export includes them as columns.
- Settings → "Your extra fields": rename, change type (with a preview), hide, reorder, merge two
  ("Locker" + "Locker No.").

**What does not change:** the gym database, its security rules, sync, the offline desk copy.

## 7. Challenges and their solutions

| Challenge | Solution |
|---|---|
| Messy headers ("Mob.", "D.O.J", "जमा", blank) | Our word lists first; the AI for what is left, from the header plus 5 examples; owner confirms with "AI" tags. |
| Column names not on row 1; two header rows; merged cells | Today: the first 10 rows are scanned. The AI also returns the header row and "join rows 2+3". A merged cell's value is copied down only for a grouping column, shown before saving. |
| Several sheets (Active, Expired, Payments, one sheet per month) | Today: the best sheet is picked. Later: the AI labels each sheet (members / payments / attendance / ignore) and they import together, joined by mobile. |
| Totals rows, section titles inside data ("--- EXPIRED ---") | Rows with no mobile and a total word are skipped. A section title can set a value for the rows under it, shown first. |
| Same member twice (in the file, across sheets, already in the gym) | Today: mobile + first name. A family on one mobile stays two people. Existing members: only blanks are filled, never overwritten. |
| Mobile as the key (missing, landline, 9 digits, two numbers) | Mobile stays required; bad rows go to the skipped-rows file. A second number goes to a "Second mobile" field instead of Notes. |
| "Mr. Ramesh", "Smt. Sunita", names in Hindi script | **Found in the code (not run):** the member app links a member by mobile plus first name. An imported "Mr. Ramesh Gupta" has first name "Mr", so his later app sign-up as "Ramesh" would be refused. Strip titles (Mr, Mrs, Smt, Shri, Dr) on import. For Hindi-script names, the desk needs a way to confirm the link. |
| Plans that don't match ours ("3 Months + PT", "Qtrly", "Couple 6M") | Today: length read from the name. The AI suggests "same as your plan X" or "new plan, N months"; owner confirms. |
| Partial payments and dues | Today: price, paid and balance worked out; a payments list repeats a member; no made-up dues. Unreadable money is kept as text in Notes. |
| Expired members | Come in as past (archived) members with their old plan, ready for win-back messages. One switch skips them instead. |
| Dates (day/month order, Excel numbers, "15th Aug", 2-digit years) | Today: handled and tested. The AI never converts dates. Add Hindi month names (जनवरी…). |
| Money ("₹1,500/-", "1.5k", "FOC", "cash 1000 upi 500") | Today's reader; anything unreadable is kept word for word and flagged. |
| Very large files | The browser reads the file; the AI sees only the column summary, so file size does not drive AI cost. Today's caps (5 MB, 2,000 rows) can rise later with saving in batches. Photos: one page per call, up to 30 pages per run. |
| The same file imported twice | Today: existing mobiles are skipped and plans already present are not added again. Add a file fingerprint: "You imported this file on 12 Oct. Import again?" |
| Undo | Today: owner-only Undo. Add: clear extra values the import filled in (`extraFrom`). |
| The AI is wrong | It only suggests; our code reads values; unsure columns stay unplaced; every row is previewed; nothing saved before Add; Undo after. |
| The AI invents data (photos) | Two reads compared cell by cell; "unclear" instead of guesses; mobile and total checks; owner checks each page beside the photo. |
| Too many junk fields | The AI must pick existing field, new field, Notes or "not imported"; new fields only with the owner's tick; 40-field cap; similar names merged. |
| Hindi / Hinglish values | Short coded columns get a value list for the owner to confirm. Names are never translated. |
| ID numbers (Aadhaar, PAN) in old files | Detected and not imported by default (data minimisation). |
| Measurements (weight, height, fat %) | First version: number fields with a unit, latest value only. History needs its own record kind later. |
| Trainers | A "Trainer" column becomes a choice field (or the trainer on a PT plan). No staff logins are created from a file. |
| Check-in history (one row per visit, or a P/A grid by date) | Later. Visits already allow source "import". The AI spots the grid layout; our code converts it. |
| Body photos | Never through the AI import. A separate, consent-based feature later. |
| Members who later join the member app | Phones are saved as +91XXXXXXXXXX, the form the app matches. Fix the title problem above. Extra fields stay on the gym side unless the owner later marks one "show to member". |
| Offline desk copy | Extra fields live inside the member record, so they are in the saved copy automatically. The AI step needs internet, and says so; the manual path still works. |
| Staff importing | Staff can add members as today. AI import and new fields are owner-only (as plans and payments already are). |
| Cost runaway or misuse | Owner sign-in checked by the Worker; daily cap per gym; usage logged as counts. |
| The record size cap (20,000 bytes) | Extra values capped per member; long text goes to Notes. |
| Old-software exports we have never seen | Remember a mapping per column layout (a "recipe"): the second gym with the same Fitness Force export needs no AI call. Only the column layout is remembered, never data. |

## 8. The smallest first version

1. **Spreadsheets only** (.xlsx, .xls, .csv), the readers we already have.
2. **AI column guessing** through the Worker with Gemini 3.1 Flash-Lite, only when our rules leave
   columns unplaced or the owner asks. It sends headers plus 5 masked examples per column.
3. **New member fields**: field list in the gym record, values in `extra`; types text, number, date,
   yes/no, choice; shown on the member page, the form and the export.
4. **Plan-name matching** suggestions in the same AI call.
5. **Owner only**, the privacy line each time, a daily cap, usage counted.
6. Strip titles from names (Mr, Smt…), so app linking works.
7. **No change to the gym database.** The Worker gets one secret (the key) and one small usage table
   in its own Cloudflare database (D1).
8. **Proof before release:** 15–20 real files (the owner's gym sheet, any Fitness Force / Wellyx /
   other exports collected in fieldwork, a few home-made sheets), each mapped by hand once; the AI's
   guesses scored against that; the real cost of each call recorded from Google's usage numbers.

## 9. Later steps

1. **Photos and PDFs of registers** (read twice, side-by-side check), after a Gemini vs Sarvam test
   on 10 real register photos. Then **WhatsApp list paste**.
2. **Several sheets in one run** (members + payments + attendance), month-wise sheets, check-in grids.
3. **Shared recipes** for known old-software exports.
4. **Extra fields on plans and payments**; **measurement history** and trainers as their own records
   (needs gym-database changes then).
5. **Show-to-member fields** in the member app (e.g. "Your locker: 12").
6. **Body photos**, separately, with member consent, never through the AI import.

## 10. Cost per import

Today's Google prices; ₹94.6 per dollar (22 Oct 2026). **Token counts are estimates**: prices have
moved before (VastuFirst's reader cost three times the figure in its docs), so measure 5 real calls
before quoting anything to gyms.

| Import | Model | Tokens (in / out) | Cost |
|---|---|---|---|
| One spreadsheet sheet (columns + plan names) | 3.1 Flash-Lite | ~4,000 / ~2,000 | **~₹0.40** |
| Same, stronger model | 3.8 Flash | same | ~₹1.00 now, ~₹2 from 1 Jan 2027 |
| One register page, read twice | 3.1 Flash-Lite | ~3,700 / ~2,700 per read | ~₹0.95 |
| One register page, read twice | 3.8 Flash | same | **~₹2.45** now, ~₹4.90 from 1 Jan 2027 |
| A disputed page, one extra read | 3.1 Pro | same | ~₹3.80 |

Typical gyms:

- **Excel of 400 members, 2 sheets:** about **₹1**.
- **Paper register of 400 members** (16 pages of 25 rows, 3.8 Flash, a quarter of pages re-read by
  Pro): about **₹55** now, about ₹95 after January 2027.
- **50 new gyms a month**, mixed: under **₹2,000 a month**. Against a planned ₹1,499 a month per gym,
  this is small.
- Worst case: if the model "thinks" three times longer than estimated, a photo page costs ~₹7.

Possible extra: Cloudflare's paid Workers plan ($5 a month) only if the free plan's CPU limit is hit.

## 11. Decisions only the owner can make

1. **AI cost.**
   - A: Free to gyms, with a daily cap per gym (20 spreadsheet reads, 60 photo pages) and a monthly
     alert at ₹2,000 **(recommended)**.
   - B: Free for the first import only, then counted against the AI add-on.
   - Also: a separate Google AI key for ForgeAI with a prepaid top-up (e.g. ₹1,000) **(recommended)**,
     not BragBuddy's or VastuFirst's key.
2. **Sending member data to Google, and the wording.**
   - A: Ask the owner each time; spreadsheets send only column names plus 5 masked examples; photos
     send the page; never body photos or ID numbers **(recommended)**.
   - B: Spreadsheets only, no photos ever.
   - C: No AI; our built-in rules only.
   - Also approve the draft wording in section 4, and adding Google as a sub-processor to ForgeAI's
     privacy policy and gym terms. A lawyer's check before 13 May 2027 is advisable.
3. **Live database change.**
   - The first version needs **no change to the gym database**. It needs one secret in the Worker and
     one small usage table in the Worker's own database (D1). Yes or no.
   - Later steps (measurement history, show-to-member fields, body photos) will need gym-database
     changes; each will be asked for separately.
4. **ID numbers in old files** (Aadhaar, PAN).
   - A: Do not import them **(recommended)**.
   - B: Keep the last 4 digits only.

## 12. What I could not check

- Export formats of Indian gym software (Fitness Force, Zenoti, SmartGym, Wellyx): the web search
  budget ran out. Collect 5 real exports during fieldwork; they become the test set.
- Gemini's accuracy on **handwritten** Hindi: no published number found. The 10-photo test decides it.
- Sarvam Vision's price and where it keeps data: not on its blog post.
- Whether the panel's Worker is on Cloudflare's free or paid plan.

---

## Sources

Gym software
- Glofox, migrating from Mindbody and other software: https://support.glofox.com/hc/en-us/articles/46456394306580
- Glofox, switching to ABC Glofox: https://www.glofox.com/blog/switching-gym-software-migrating-to-abc-glofox/
- GymFlow, exporting from Glofox (export fee): https://support.gymflow.io/articles/6696590-exporting-your-data-from-glofox
- WodBoard, migrating from Glofox: https://help.wodboard.com/article/32-migrating-from-glofox
- WodBoard, migrating from PushPress: https://help.wodboard.com/article/49-migrating-from-pushpress
- PushPress, migration from another platform: https://help.pushpress.com/en/articles/911359-core-migration-from-another-platform
- PushPress, migration FAQs: https://help.pushpress.com/en/articles/9865431-core-migration-faqs
- Mindbody, contracts, cancellation and data: https://www.mindbodyonline.com/business/education/blog/mindbody-contracts-cancellation-data
- Spark Membership, exporting from Mindbody: https://help.sparkmembership.com/en/articles/5124676-exporting-from-mindbody
- GymMaster, prospect upload tool: https://help.gymmaster.com/311633-Mass-Prospect-Data-Upload-Tool
- GymMaster, data transfers: https://gymmaster.com/data-transfers
- Wellyx listing (free migration claim): https://zoftwarehub.com/en-ae/products/wellyx/zoftware-analysis
- Gymdesk, how to switch gym software (moving stored cards is the big risk abroad): https://gymdesk.com/blog/how-to-switch-gym-software

Import tools
- HubSpot, import objects: https://knowledge.hubspot.com/import-and-export/import-objects
- HubSpot, import records for a single object (create new property): https://knowledge.hubspot.com/import-and-export/import-records-for-a-single-object
- HubSpot Ideas, an "undo import" button: https://community.hubspot.com/t5/HubSpot-Ideas/An-quot-undo-import-quot-button/idi-p/442792
- HubSpot community, roll back changes made by import: https://community.hubspot.com/t5/HubSpot-Ideas/Roll-back-the-property-changes-undo-made-by-Import/m-p/3139
- SaaS Assure, HubSpot import risks: https://www.saasassure.com/blog/hubspot-import-risks
- Insycle, Magical Import (AI from column names only): https://support.insycle.com/hc/en-us/articles/6587330945431
- Flatfile, mapping data: https://support.flatfile.com/articles/8569925090-mapping-data
- Flatfile docs overview: https://flatfile.com/docs/overview
- Dromo, AI column matching: https://dromo.io/blog/improving-data-import-accuracy-with-dromos-ai-powered-column-matching
- OneSchema, transforms and validations: https://www.oneschema.co/blog/transforms-advanced-validations
- OneSchema, sheet transforms: https://docs.oneschema.co/docs/sheet-transforms
- Osmos (G2): https://www.g2.com/products/osmos/discuss
- Airtable, CSV import extension: https://support.airtable.com/docs/csv-import-extension
- Airtable community, duplicates on import: https://community.airtable.com/t5/base-design/import-csv-duplicates-insert/m-p/194243
- Notion CSV import guide: https://thebricks.com/resources/how-to-import-csv-into-notion

Database
- PostgreSQL, JSON types and indexing: https://www.postgresql.org/docs/current/datatype-json.html
- PostgreSQL, ALTER TABLE (locks): https://www.postgresql.org/docs/current/sql-altertable.html
- PostgreSQL, limits (1,600 columns): https://www.postgresql.org/docs/current/limits.html
- PostgreSQL mailing list, EAV designs for multi-tenant apps: https://www.postgresql.org/message-id/CAH7-FAsLYDK3Jy9GN3%3DhY6w%3D2N%3D0CkGW9KmMgKafPx3PGOEDqw%40mail.gmail.com
- Salesforce, platform multitenant architecture: https://architect.salesforce.com/fundamentals/platform-multitenant-architecture
- Salesforce, multitenancy and metadata: https://developer.salesforce.com/docs/platform/salesforce-large-data-volumes-bp/guide/ldv-deployments-concepts-multitenancy-and-metadata.html

AI
- Gemini API pricing (read 22 Oct 2026): https://ai.google.dev/gemini-api/docs/pricing
- Gemini API terms (paid vs unpaid data use): https://ai.google.dev/gemini-api/terms
- Gemini media resolution (tokens per image): https://ai.google.dev/gemini-api/docs/media-resolution
- Gemini document processing (PDF limits, 258 tokens a page): https://ai.google.dev/gemini-api/docs/document-processing
- Gemini structured output: https://ai.google.dev/gemini-api/docs/json-mode
- OpenRouter model list and prices (read 22 Oct 2026): https://openrouter.ai/api/v1/models
- "Can OCR-VLMs read Devanagari?" (June 2026): https://arxiv.org/abs/2606.29213
- Sarvam Vision 2.1 (24 Sep 2026): https://www.sarvam.ai/blogs/sarvam-vision-2-1
- TEN, checking LLM table extraction: https://arxiv.org/pdf/2508.09324
- Reducto, LLM judges of table OCR are unreliable: https://reducto.ai/engineering/posts/llm-judges-table-ocr-false-positives/
- Cloudflare Workers limits: https://developers.cloudflare.com/workers/platform/limits/
- Exchange rate, USD to INR on 22 Oct 2026: https://open.er-api.com/v6/latest/USD

Privacy (India)
- PIB, DPDP Rules 2025 notification: https://static.pib.gov.in/WriteReadData/specificdocs/documents/2025/nov/doc20251117695301.pdf
- AZB & Partners, phased rollout: https://www.azbpartners.com/bank/indias-digital-personal-data-protection-act-phased-rollout-and-key-compliance-milestones/
- King Stubb & Kasiva, 2026 compliance deadlines: https://ksandk.com/data-protection-and-data-privacy/dpdp-act-rules-2026-compliance-deadline/
- King Stubb & Kasiva, data shared with vendors (section 8(2)): https://ksandk.com/data-protection-and-data-privacy/how-should-companies-handle-data-shared-with-vendors-under-dpdp-act/
- Securiti, cross-border transfers under the DPDPA: https://securiti.ai/cross-border-data-transfer-requirements-under-india-dpdpa
- Bar & Bench, cross-border rules not yet live: https://www.barandbench.com/columns/the-dpdp-cross-border-transfer-rules-arent-live-yet-so-why-are-contracts-being-redrafted-as-if-they-are
- S.S. Rana, plan to shorten the timeline: https://ssrana.in/articles/meity-plans-to-cut-short-dpdp-compliance-timeline-and-notify-cross-border-restrictions-for-sdfs/

From our own code and notes
- `apps/dashboard/src/crm/ui/screens/ImportMembers.tsx`, `logic/importMembers.ts`, `logic/importTerms.ts`,
  `logic/sheets.ts`, `logic/undoImport.ts`, `data/cloud.ts`, `data/local.ts`
- `supabase/migrations/0010_signin_and_records.sql` (records, pull/push), `0017_undo_import.sql`,
  `0018_staff_and_owner_rules.sql` (gym record owner-only), `0023_member_membership.sql` (first-name match)
- `deploy/panel/worker.js`, `deploy/panel/wrangler.jsonc`
- `docs/overhaul/research/R1-findings.txt` (PushPress free migration; Indian pricing)
- Brain lessons: gemini-cost-from-ai-studio-usage, cheap-model-thinks-itself-expensive,
  vastufirst-reader-behaviour-and-cost (read twice; prices move), never-bot-drive-gemini-web
