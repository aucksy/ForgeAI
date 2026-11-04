# R-319 — privacy page draft (items 1 and 11)

**Status: DRAFT for the owner's yes. Nothing here is live.** `apps/dashboard/public/privacy.html` is NOT
edited. When the owner approves the wording, paste the two English paragraphs into the list under
"Your gym's records about you" (after the "workout offer" paragraph), and the two Hindi paragraphs into the
same place in the Hindi half. Then bump the page's "Last updated" date in both halves.

Why it is needed: today the page says nothing about trainers seeing workouts (F109, 0050) or about
questions to a trainer (R-319 item 1, 0053). Both go live only with migration 0053 (applying 0050 live
needs this text too).

## English

**1. What your trainers see (new paragraph).**

> Only while "Share my workouts with my trainers" is on (Settings → Your gym → What my gym can see; it is on
> unless you turn it off), the app sends your gym: how many workouts you did and how many kg you lifted each
> week for the last 12 weeks, your best lifts, your new heaviest weights, the day of your last workout, and up
> to 30 workouts from the last 3 months (each one's date, name, and each exercise's best set and number of
> sets). Never your body weight, photos, notes, food or mobile number. Your gym's owner and the trainer your
> gym gave you can see it, on your page in the gym's admin app; the front desk cannot, unless the owner made
> them a trainer. Turn the switch off and the gym's copy is deleted at once. The gym's copy is also deleted
> when you leave the gym, or when your app has not sent anything for 90 days. Your gym is responsible for how
> its staff use it; MettleUp keeps it for the gym.

**2. Questions to a trainer (new paragraph).**

> If you use "Ask a trainer" (Gym tab), the app sends your question to your gym, with your name. Only the
> person you pick can read it and reply: a trainer, or the gym's owner. If you pick "Any trainer", every
> trainer and the owner can read it. The reply is kept with your question. Your gym keeps your questions and
> replies for up to 180 days, and deletes them when you leave the gym. You can take back a question that has
> no reply yet. Your gym is responsible for its replies; MettleUp keeps the questions for the gym.

## हिन्दी (Hindi)

**1. आपके ट्रेनर क्या देखते हैं (नया पैराग्राफ़)।**

> सिर्फ़ तब तक जब तक "Share my workouts with my trainers" चालू है (Settings → Your gym → What my gym can
> see; यह चालू रहता है जब तक आप इसे बंद न करें), ऐप आपके जिम को भेजता है: पिछले 12 हफ़्तों में हर हफ़्ते
> कितने वर्कआउट किए और कितने kg उठाए, आपकी सबसे अच्छी लिफ़्ट, आपके नए सबसे भारी वज़न, आख़िरी वर्कआउट का
> दिन, और पिछले 3 महीनों के ज़्यादा से ज़्यादा 30 वर्कआउट (हर एक की तारीख़, नाम, और हर एक्सरसाइज़ का सबसे
> अच्छा सेट और सेट की गिनती)। आपके शरीर का वज़न, फ़ोटो, नोट्स, खाना या मोबाइल नंबर कभी नहीं। जिम के मालिक
> और जिम ने जो ट्रेनर आपको दिया है, वे इसे जिम के एडमिन ऐप में आपके पेज पर देख सकते हैं; डेस्क नहीं देख
> सकता, जब तक मालिक उन्हें ट्रेनर न बनाए। स्विच बंद करते ही जिम की कॉपी तुरंत डिलीट हो जाती है। जिम छोड़ने
> पर, या 90 दिन तक ऐप से कुछ न आने पर भी जिम की कॉपी डिलीट हो जाती है। स्टाफ़ इसका कैसे इस्तेमाल करे, इसकी
> ज़िम्मेदारी आपके जिम की है; MettleUp इसे जिम के लिए रखता है।

**2. ट्रेनर से सवाल (नया पैराग्राफ़)।**

> अगर आप "Ask a trainer" (Gym टैब) इस्तेमाल करते हैं, तो ऐप आपका सवाल आपके नाम के साथ आपके जिम को भेजता
> है। सिर्फ़ वही व्यक्ति इसे पढ़ और जवाब दे सकता है जिसे आप चुनते हैं: कोई ट्रेनर, या जिम का मालिक। अगर आप
> "Any trainer" चुनते हैं, तो हर ट्रेनर और मालिक इसे पढ़ सकते हैं। जवाब आपके सवाल के साथ रखा जाता है। आपका
> जिम आपके सवाल और जवाब ज़्यादा से ज़्यादा 180 दिन रखता है, और आपके जिम छोड़ने पर उन्हें डिलीट कर देता है।
> जिस सवाल का जवाब अभी नहीं आया, उसे आप वापस ले सकते हैं। जवाबों की ज़िम्मेदारी आपके जिम की है; MettleUp
> सवालों को जिम के लिए रखता है।

## Facts checked against the code (4 Nov 2026)

- Summary: `apps/mobile/src/shop/trainerShare.ts` (12 weeks, 5 best sets, records of 30 days, last day).
- Recent workouts: `apps/mobile/src/shop/trainerRecent.ts` (30 workouts, 92 days, 20 exercises, best set + set count).
- Who sees progress: `owner_member_progress` (owner, or the member's own ticked trainer); desk refused (TRAINER_ONLY).
- 90 days: `owner_member_progress` deletes rows not refreshed for 90 days; switch off deletes at once (0050).
- Questions: `_tq_visible` (picked person only; "Any trainer" = owner + every ticked trainer); 180-day clean-up
  in `owner_questions` / `member_questions`; deleted on leaving (trigger `gym_members_questions_left`).
- The switch's caption in the app says the same in one line (`TRAINER_WORDS.shareCaptionRecent`).
