# DRAFT (24 Oct 2026): saved-workouts privacy lines + gym data agreement

**Status: DRAFT for the owner's yes. Nothing here is live.** No existing file was changed.
When approved, Part 1 goes into PRIVACY-NOTICE.md / PRIVACY-NOTICE-HI.md (and the public
privacy.html), and Part 2 becomes the page the admin app's "data agreement" link opens.

Every claim below was checked against the code on 24 Oct 2026:
- what is saved: migration 0032 header + the phone's packer (`apps/mobile/src/cloud/pack.ts`);
- who can read it: 0032 has no gym rule on `member_items`, so only the signed-in member reads it;
- deleting: `member_account_delete` deletes at once (not "within N days"); the button is
  **Settings → Backup → Delete my account** in the member app (not "Your data");
- the terms record: 0033 header; the AI import: `deploy/panel/aiMatch.js` + `aiImport.ts`;
- gym export / delete: `GymDataActions.tsx` (the delete button already promises 30 days) and
  GYM-DELETE.md; backups: the live notice already promises "backups expire within 7 more days".

Law used: DPDP Act 2023 s.8 (a Data Fiduciary may use a Data Processor only under a contract; it
must make the processor erase data when the purpose ends), DPDP Rules 2025 (notified 13 Nov 2025;
notice, security, breach and erasure duties start 18 months later, about 13 May 2027; breach: the
Data Fiduciary tells the Board and each affected person "without delay" and sends a full report
within 72 hours; the Rules set no deadline for a processor, so the contract must set one), and the
IT (SPDI) Rules 2011 until then (body measurements may count as "physiological" sensitive data).

---

# Part 1. Privacy notice change

## 1A. English (for PRIVACY-NOTICE.md)

### Change 1. In "Who is responsible for what", replace the third bullet

**Replace:**
> - **Your workouts** (exercises, sets, weights, body weight, progress photos) stay **on your phone**.
>   We do not receive them and your gym does not see them. Nothing about your body or health leaves
>   your phone unless you turn on a feature that clearly asks you first.
>   If you join your gym's workout offer, ... ForgeAI keeps the dates for the gym.

**With:**
> - **Your workouts** (exercises, sets, weights, body weight, measurements, progress photos) stay
>   **on your phone** unless you sign in with Google. Your gym does not see them either way.
> - **If you sign in with Google**, ForgeAI saves a copy of your workouts on our server so you can
>   get them back on a new phone. **ForgeAI** is responsible for that copy, not your gym. Only you
>   can see it. See "Your saved workouts" below.
> - If you join your gym's workout offer, the app sends your gym only the dates of the workouts
>   that count, and only while you are in the offer. Your gym is responsible for its offers and
>   rewards; ForgeAI keeps the dates for the gym.

### Change 2. In the table "What we keep on our server", add these two rows after the "Feedback" row

| Data | Why | How long |
|---|---|---|
| Only if you sign in with Google: your saved workouts and the other items listed under "Your saved workouts" | So you can get them back on a new phone | Until you delete your account. Deleted from our server at once when you do; backup copies expire within 7 more days |
| Only if you sign in with Google: your ForgeAI account (your Google email address, and the name and picture link Google shares) | So only you can open your saved workouts | Until you delete your account (one exception, explained below) |

### Change 3. Add a new section after "What we keep on our server, why, and for how long"

> ### Your saved workouts (only if you sign in with Google)
> Signing in is your choice. If you never tap **Continue with Google**, none of this is sent and
> your workouts stay only on your phone.
>
> **What we save.** When you sign in (on the welcome screen, or in Settings → Backup → Keep your
> workouts on ForgeAI), the app saves these on our server:
> - your workouts, with each exercise and set (weight, reps, time);
> - your routine folders and routines, and the exercises you made yourself;
> - your rest-timer lengths and where your personal records start;
> - your body weight and body measurements, with their dates;
> - the **dates** of your progress photos. The photos themselves stay on your phone;
> - your profile: name, age, height, goal, experience, gym name, member-since date, food targets,
>   units, language, bio and link. **Never your phone number.**
>
> From Google we get your email address and, if Google shares them, your name and picture link.
>
> **Why.** Only so you can get your workouts back on a new phone, or after reinstalling the app,
> by signing in again. We do not sell it, show ads with it, or use it to profile you.
>
> **Who can see it.** Only you, when you are signed in. **Your gym cannot**: not the owner, the
> trainers or the desk. Other members cannot. ForgeAI's people do not look at it, except when
> needed to keep the service running or fix a fault, or when the law makes us.
> [LAWYER CHECK: is "except when needed to keep the service running" narrow enough?]
>
> **Where.** In our main database in Mumbai, India (Supabase). Google handles the sign-in.
>
> **How long.** Until you delete your account. When you delete a workout or another item in the
> app, it is deleted on our server too. We keep only an empty marker (no workout details) so
> another phone of yours does not bring it back.
> [LAWYER CHECK: no automatic deletion of accounts nobody uses. Is "until you delete it" enough?]
>
> **Sign out** (Settings → Backup → Sign out): the app stops saving new workouts. What is already
> saved stays until you delete your account.
>
> **Delete it** (Settings → Backup → **Delete my account**): this deletes everything saved on our
> server and your ForgeAI account, at once. The workouts on your phone stay. One exception: if
> you also use the same Google account to sign in for a gym (for example as a trainer or owner),
> we delete your saved workouts but keep that sign-in, so the gym's app keeps working. Backup
> copies at our provider expire within 7 more days. You can also ask us by email
> ([CONTACT EMAIL]); we do it within 30 days.
>
> **Google Drive backup** (Settings → Backup) is separate and also optional. Your phone puts a
> backup file in your own Google Drive. It does not go through our server, and we cannot open it.
> Google's own privacy terms apply to it.

### Change 4. Replace the "Where it is kept" paragraph's provider sentence

**Replace:**
> Some service providers may process limited data outside India: Cloudflare (delivers the desk app
> and passes both apps' requests on to our database), Google Play and GitHub (app downloads) [and
> Sentry (crash reports), once added].

**With:**
> Some service providers may process limited data outside India: Cloudflare (delivers the desk app
> and passes both apps' requests on to our database), Google (sign-in with Google, and Google Drive
> if you turn on that backup), Google Play and GitHub (app downloads), and, only when your gym's
> owner imports an old member list and presses **Ask AI**, Google Gemini or Anthropic Claude (they
> see the list's column names and 5 example rows, with mobile numbers, emails and ID numbers
> hidden) [and Sentry (crash reports), once added].

### Change 5. Replace the sentence about AI under the table

**Replace:**
> If we ever add AI features that use your data, we ask you first.

**With:**
> The only AI feature today is your gym owner's optional member-list import (see "Where it is
> kept"). It only works out which column is which; the AI sends back no member details. If we
> ever add an AI feature that uses your own workouts, we ask you first.

[LAWYER CHECK: the import sends names, addresses, plan names, amounts and dates of up to 5 rows to
a US company. The gym decides to do this; is the gym's own notice enough for its members?]

### Change 6. In "Your rights", add one bullet after "ask us to erase it"

> - **delete your saved workouts and account** yourself at any time: Settings → Backup → Delete
>   my account;

### Change 7. In "Security and breaches", add at the end

> For your saved workouts, ForgeAI is responsible, so we report a breach to the Data Protection
> Board ourselves and tell you directly.

### Change 8. Replace the "Last updated" line

> Last updated: [DATE OF GO-LIVE]. What changed: you can now sign in with Google to save your
> workouts on our server (optional; only you can see them); the AI import and Google sign-in are
> now listed under "Where it is kept".

---

## 1B. Hindi (for PRIVACY-NOTICE-HI.md, same changes, same order)

### बदलाव 1. "कौन किसके लिए ज़िम्मेदार है" में तीसरा बिंदु बदलें

**हटाएँ:** "**आपके वर्कआउट** (एक्सरसाइज़, सेट, वज़न, शरीर का वज़न, फोटो) **आपके फोन पर ही** रहते हैं। ...
ForgeAI जिम के लिए तारीख़ें रखता है।"

**इसकी जगह लिखें:**
> - **आपके वर्कआउट** (एक्सरसाइज़, सेट, वज़न, शरीर का वज़न, नाप, फोटो) **आपके फोन पर ही** रहते हैं,
>   जब तक आप Google से साइन इन नहीं करते। जिम इन्हें किसी भी हाल में नहीं देखता।
> - **अगर आप Google से साइन इन करते हैं**, तो ForgeAI आपके वर्कआउट की एक कॉपी अपने सर्वर पर सेव
>   करता है, ताकि नए फोन पर वे वापस मिल सकें। इस कॉपी की ज़िम्मेदारी **ForgeAI** की है, जिम की नहीं।
>   इसे सिर्फ़ आप देख सकते हैं। नीचे "आपके सेव किए गए वर्कआउट" देखें।
> - अगर आप जिम के वर्कआउट ऑफ़र से जुड़ते हैं, तो ऐप जिम को सिर्फ़ गिने गए वर्कआउट की तारीख़ें भेजता
>   है, और सिर्फ़ तब तक जब तक आप ऑफ़र में हैं। ऑफ़र और इनाम की ज़िम्मेदारी जिम की है; ForgeAI जिम
>   के लिए तारीख़ें रखता है।

### बदलाव 2. "हम सर्वर पर क्या रखते हैं" में फीडबैक वाले बिंदु के बाद जोड़ें
> - सिर्फ़ Google से साइन इन करने पर: आपके सेव किए गए वर्कआउट (नीचे की सूची): जब तक आप अपना खाता
>   डिलीट नहीं करते। डिलीट करते ही सर्वर से तुरंत मिटा दिए जाते हैं; बैकअप कॉपी 7 दिन के अंदर ख़त्म हो जाती है।
> - सिर्फ़ Google से साइन इन करने पर: आपका ForgeAI खाता (आपका Google ईमेल, और Google जो नाम और
>   फोटो लिंक देता है): जब तक आप खाता डिलीट नहीं करते (एक अपवाद नीचे लिखा है)।

### बदलाव 3. "हम सर्वर पर क्या रखते हैं" के बाद नया हिस्सा जोड़ें
> **आपके सेव किए गए वर्कआउट (सिर्फ़ Google से साइन इन करने पर)**
> साइन इन करना आपकी मर्ज़ी है। अगर आप कभी **Continue with Google** नहीं दबाते, तो इसमें से कुछ
> नहीं भेजा जाता और आपके वर्कआउट सिर्फ़ आपके फोन पर रहते हैं।
>
> **हम क्या सेव करते हैं।** साइन इन करने पर (शुरुआती स्क्रीन पर, या Settings → Backup → Keep your
> workouts on ForgeAI में), ऐप हमारे सर्वर पर ये सेव करता है:
> - आपके वर्कआउट, हर एक्सरसाइज़ और सेट के साथ (वज़न, रेप्स, समय);
> - आपके रूटीन फ़ोल्डर और रूटीन, और आपकी बनाई एक्सरसाइज़;
> - आराम के टाइमर की लंबाई, और आपके पर्सनल रिकॉर्ड कहाँ से शुरू होते हैं;
> - आपके शरीर का वज़न और शरीर के नाप, तारीख़ के साथ;
> - आपकी प्रोग्रेस फोटो की **तारीख़ें**। फोटो ख़ुद आपके फोन पर ही रहती हैं;
> - आपकी प्रोफ़ाइल: नाम, उम्र, लंबाई, लक्ष्य, अनुभव, जिम का नाम, कब से सदस्य, खाने के लक्ष्य, यूनिट,
>   भाषा, बायो और लिंक। **आपका फोन नंबर कभी नहीं।**
>
> Google से हमें आपका ईमेल मिलता है, और अगर Google दे तो आपका नाम और फोटो लिंक।
>
> **क्यों।** सिर्फ़ इसलिए कि नए फोन पर, या ऐप दोबारा इंस्टॉल करने पर, फिर से साइन इन करके आपको अपने
> वर्कआउट वापस मिल जाएँ। हम इसे बेचते नहीं, इससे विज्ञापन नहीं दिखाते, इससे आपकी प्रोफ़ाइलिंग नहीं करते।
>
> **कौन देख सकता है।** सिर्फ़ आप, साइन इन होने पर। **आपका जिम नहीं देख सकता**: न मालिक, न ट्रेनर,
> न डेस्क। दूसरे सदस्य भी नहीं। ForgeAI के लोग इसे नहीं देखते, सिवाय तब जब सेवा चलाने या कोई खराबी
> ठीक करने के लिए ज़रूरी हो, या कानून ऐसा कहे।
>
> **कहाँ।** हमारे मुख्य डेटाबेस में, **मुंबई, भारत** (Supabase)। साइन इन Google संभालता है।
>
> **कितने समय तक।** जब तक आप अपना खाता डिलीट नहीं करते। ऐप में कोई वर्कआउट या दूसरी चीज़ डिलीट करने
> पर वह हमारे सर्वर से भी डिलीट हो जाती है। हम सिर्फ़ एक ख़ाली निशान रखते हैं (उसमें वर्कआउट की कोई
> जानकारी नहीं), ताकि आपका कोई दूसरा फोन उसे वापस न ले आए।
>
> **साइन आउट** (Settings → Backup → Sign out): ऐप नए वर्कआउट सेव करना बंद कर देता है। जो पहले से सेव
> है, वह खाता डिलीट करने तक रहता है।
>
> **डिलीट करें** (Settings → Backup → **Delete my account**): इससे हमारे सर्वर पर सेव सब कुछ और आपका
> ForgeAI खाता तुरंत डिलीट हो जाता है। आपके फोन के वर्कआउट रहते हैं। एक अपवाद: अगर आप इसी Google खाते
> से किसी जिम के लिए भी साइन इन करते हैं (जैसे ट्रेनर या मालिक के तौर पर), तो हम आपके सेव किए वर्कआउट
> डिलीट करते हैं पर वह साइन इन रखते हैं, ताकि जिम का ऐप चलता रहे। हमारी सेवा देने वाली कंपनी की बैकअप
> कॉपी 7 दिन के अंदर ख़त्म हो जाती है। आप ईमेल ([CONTACT EMAIL]) से भी कह सकते हैं; हम 30 दिन के अंदर
> डिलीट करते हैं।
>
> **Google Drive बैकअप** (Settings → Backup) अलग है और यह भी आपकी मर्ज़ी है। आपका फोन आपकी अपनी Google
> Drive में एक बैकअप फ़ाइल रखता है। यह हमारे सर्वर से होकर नहीं जाती, और हम इसे खोल नहीं सकते। इस पर
> Google की अपनी गोपनीयता शर्तें लागू होती हैं।

### बदलाव 4. "कहाँ रखा जाता है" में कंपनियों वाला वाक्य बदलें
**हटाएँ:** "कुछ सेवा देने वाली कंपनियाँ (Cloudflare, Google Play, GitHub) सीमित डेटा भारत के बाहर संभाल
सकती हैं, सिर्फ अपनी सेवा देने के लिए।"

**इसकी जगह लिखें:**
> कुछ सेवा देने वाली कंपनियाँ सीमित डेटा भारत के बाहर संभाल सकती हैं, सिर्फ़ अपनी सेवा देने के लिए:
> Cloudflare, Google (Google से साइन इन, और Google Drive अगर आप वह बैकअप चालू करें), Google Play,
> GitHub, और सिर्फ़ तब जब आपके जिम का मालिक पुरानी सदस्य-सूची इम्पोर्ट करते समय **Ask AI** दबाए, Google
> Gemini या Anthropic Claude (वे सूची के कॉलम के नाम और 5 नमूना पंक्तियाँ देखते हैं; मोबाइल नंबर, ईमेल
> और ID नंबर छिपे रहते हैं)।

### बदलाव 5. "हम आपका डेटा बेचते नहीं..." वाली पंक्ति के बाद जोड़ें
> आज AI सिर्फ़ एक जगह है: जिम मालिक की वैकल्पिक सदस्य-सूची इम्पोर्ट। AI सिर्फ़ बताता है कि कौन-सा कॉलम
> क्या है; वह सदस्यों की कोई जानकारी वापस नहीं भेजता। अगर हम कभी आपके अपने वर्कआउट पर AI लगाएँगे, तो
> पहले आपसे पूछेंगे।

### बदलाव 6. "आपके अधिकार" में "मिटाने को कह सकते हैं" के बाद जोड़ें
> अपने सेव किए वर्कआउट और खाता कभी भी ख़ुद डिलीट कर सकते हैं (Settings → Backup → Delete my account);

### बदलाव 7. "सुरक्षा" के आख़िर में जोड़ें
> आपके सेव किए वर्कआउट की ज़िम्मेदारी ForgeAI की है, इसलिए उनके लीक होने पर हम ख़ुद बोर्ड को रिपोर्ट
> करते हैं और आपको सीधे बताते हैं।

### बदलाव 8. "बदलाव" की आख़िरी पंक्ति बदलें
> आख़िरी बदलाव: [DATE OF GO-LIVE]। क्या बदला: अब आप Google से साइन इन करके अपने वर्कआउट हमारे सर्वर पर
> सेव कर सकते हैं (वैकल्पिक; सिर्फ़ आप देख सकते हैं); AI इम्पोर्ट और Google साइन इन अब "कहाँ रखा जाता
> है" में लिखे हैं।

[LAWYER CHECK: have a native Hindi reader check the Hindi before it goes live.]

---

## 1C. Knock-on lines elsewhere (would otherwise contradict the new notice)

- **TERMS.md, part A, point 7** says "Your workouts stay on your phone, so keep your phone backed
  up." Replace with: "Your workouts stay on your phone unless you sign in with Google to save
  them on ForgeAI. Keep your phone backed up either way."
- **TERMS.md, part A, point 9** ("not liable ... for workout data kept only on your phone"): keep,
  and add: "We try to keep your saved workouts safe, but the app is a beta: keep your own backup."
  [LAWYER CHECK]
- **The sign-in card in the member app** says it saves "your workouts, routines and body weight".
  It does not mention body measurements or the profile (age, height), and it has no link to this
  notice. For consent to count as "informed", the card should name those too and link here.
  [LAWYER CHECK: SPDI Rules 2011 may treat body measurements as sensitive data needing consent.]
- **BREACH-PLAN.md** covers only the gym's records (we tell the gym in 24 hours). For the saved
  workouts ForgeAI is responsible itself, so the plan needs a line: we tell the Board and the
  affected members ourselves, first notice without delay, full report within 72 hours.

---

# Part 2. Gym data agreement (the page behind "the data agreement" link)

> Note for the owner: the admin app's tick box says "I agree to the ForgeAI terms and the data
> agreement", but today **the "data agreement" link opens the privacy notice**, not a separate
> page. Either this agreement goes on its own page and the link is changed, or it goes at the
> bottom of terms.html. The version shown must say **Version 2026-10-24**, to match what the
> server records.

## ForgeAI data agreement for gyms

**Version 2026-10-24.** Between ForgeAI, run by [OWNER NAME], Jaipur, India ("we"), and the gym
whose owner ticks "I agree" ("you"). It is part of the ForgeAI terms. [LAWYER CHECK: is an online
tick box with this record enough for a DPDP s.8(2) processor contract?]

**1. Your records are yours.** Your members' details, memberships, payments, receipts,
check-ins, shop orders, staff and messages are your gym's records. Under India's data law
(DPDP Act 2023) **you are the Data Fiduciary** for them and **we are your Data Processor**.

**2. What we do with them.** We store and process them only to run ForgeAI for your gym, and
only as the app's features and your staff's actions direct. We do not sell them, show ads with
them, use them for our own marketing, or share them with other gyms. We may count them in
totals that name no gym or person (for example, how many check-ins ForgeAI handled).
[LAWYER CHECK]

**3. Who else handles them (our service providers).**
- **Supabase**: our database, in Mumbai, India.
- **Cloudflare**: delivers the admin app and passes requests to the database; it also keeps our
  feedback box and daily AI-use counts.
- **Google Gemini, then Anthropic Claude if Gemini fails**: only when your owner imports a member
  list and presses **Ask AI**. They see the column names and the first 5 rows of the file. Mobile
  numbers, emails, PAN and ID numbers, and any run of 7 or more digits are hidden first, twice
  (in your browser and again on our server). Names, addresses, plan names, amounts and dates in
  those 5 rows are **not** hidden. The AI only answers which column is which; we keep nothing from
  the file. These companies are outside India. [LAWYER CHECK: confirm their API terms do not use
  this data for training, and that our Gemini key is on a paid project.]

We tell you before we add a new provider that sees your records. [LAWYER CHECK: notice period]

**4. Security.** Data travels encrypted. Each gym can reach only its own records. Staff sign in
with single-use codes, and only people the owner adds can sign in. Every receipt records who took
the money. The admin app keeps a copy of your records on each device a staff member signs in on,
so the desk works without internet; signing that device out deletes the copy.

**5. If something leaks.** We tell you in writing **within 24 hours** of finding out: what
happened, what data, what we did, and what comes next. We help you send the Data Protection Board
your first notice straight away and the full report within 72 hours, and tell the members
affected (see docs/launch/BREACH-PLAN.md).

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
that you accepted this agreement, for 2 years, as proof. [LAWYER CHECK: 2 years]

**10. Members' own saved workouts are not your records.** A member who signs in with Google can
save their own workouts, body weight and measurements on ForgeAI. That copy belongs to the member;
**ForgeAI** is responsible for it, not your gym. You, your trainers and your desk cannot see it,
and deleting your gym does not delete it.

**11. Our record of your acceptance.** When your owner ticks "I agree", we keep: the gym, who
ticked it (their name as signed in), when, which version, whether it was at "Create my gym" or at
a later sign-in, and a one-way scrambled form of the internet address it came from. That
scrambled form can still be traced back, so we protect it like any other personal data.

**12. Term and ending.** This agreement runs while your gym uses ForgeAI. You can stop at any
time and ask us to delete your gym (point 9). We may end it with [30] days' written notice, or at
once for serious misuse; you can still download your data during the notice. [LAWYER CHECK]
Points 5, 9 and 10 continue after it ends, until your records are deleted.

**13. Liability.** ForgeAI is a beta. [LAWYER CHECK: the liability cap belongs in the pilot
agreement (launch plan D3); not set here.]

**14. Changes.** We tell the owner in the admin app before a new version applies, and ask the
owner to accept it again. The version date is at the top.

**15. Law.** Indian law; courts in Jaipur. Contact: [OWNER NAME], [CONTACT EMAIL].

---

# Part 3. Summary for the owner

1. **Privacy notice**: says plainly that if a member signs in with Google, their workouts, body
   weight, measurements, photo dates and profile (never the phone number) are saved on our server
   in Mumbai, only they can see it, their gym cannot, and "Delete my account" removes it at once.
2. **Gym data agreement**: says the gym owns its records and we only handle them to run ForgeAI.
   It covers no selling or ads, our providers (the AI import is named truthfully), a 24-hour breach
   notice, the gym's duties, download any time, deletion within 30 days, and that a member's own
   saved workouts are the member's, not the gym's.
3. Both drafts note what is not finished: the "data agreement" link still opens the privacy page,
   and the sign-in card, the terms and the breach plan need matching lines.

**Points you must decide**
- **Backups: 7 days or 90?** Your brief said 90. The live notice and the delete flow already
  promise 7. The drafts use 7 so nothing contradicts. Changing to 90 means changing the live notice.
- **Deleting saved workouts: "at once" or "within 30 days"?** The app deletes at once, so the draft
  says that. Email requests get 30 days. Also: should an account nobody uses be deleted after
  some years? Today nothing does that.
- **How much notice before ForgeAI ends a gym's agreement** (draft says 30 days). Also, should the
  AI import keep sending member names and addresses from 5 rows? Today it does, and the agreement
  says so.

Sources for the law check:
- [Storyboard18: final DPDP Rules notified, staggered rollout](https://www.storyboard18.com/digital/breaking-govt-notifies-final-dpdp-rules-sets-staggered-rollout-with-key-obligations-for-data-fiduciaries-84201.htm)
- [Mondaq: DPDP Rules 2025 notified](https://www.mondaq.com/india/data-protection/1708164/digital-personal-data-protection-rules-2025-notified)
- [Hogan Lovells: DPDP Act brought into force](https://www.hoganlovells.com/en/publications/indias-digital-personal-data-protection-act-2023-brought-into-force-)
- [BDO India: The DPDP Rules](https://www.bdo.in/getmedia/87552494-85d2-4edb-95da-0f118fdb3052/The-DPDP-Rules_BDO-India_2025.pdf)
