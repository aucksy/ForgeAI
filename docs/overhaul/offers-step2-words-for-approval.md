# Workout offer (#49 step 2): words for the owner to approve — DRAFT, 23 Oct 2026

Nothing here is live. The published privacy pages (`docs/launch/PRIVACY-NOTICE.md`, `-HI.md`) are
NOT changed. When the owner approves, these lines go into them with a new "Last updated" date, in
the same release that switches the offer on.

## 1. The consent screen (member app, before "Join the offer")

Shown in English, as the app is. The gym's own name and the offer's numbers fill the blanks
(example: RAM'S FITNESS, 10 workouts, 30 days, 3 days). The words live in ONE file,
`apps/mobile/src/shop/offerWords.ts`, and carry a version (`offer-consent-v1`) that the gym keeps
with each member's "yes", so it can prove which words the member agreed to. If a word changes, the
version changes.

> **Join: 10 workouts, 3 extra days**
>
> How it works: on a day you check in at RAM'S FITNESS, log a workout of at least 20 minutes with
> 6 or more sets in ForgeAI. Log 10 of them within 30 days of joining, and 3 days are added to your
> membership.
>
> What the gym gets: only the dates of those workouts. Never your exercises, weights, sets, body
> weight or photos.
>
> Who sees it: the owner and front desk of RAM'S FITNESS.
>
> Stop any time: Gym tab → Workout offer → Leave the offer. The dates are deleted and nothing more
> is sent.
>
> Questions or complaints: ask at RAM'S FITNESS's front desk. If it is not solved, you can complain
> to the Data Protection Board of India.
>
> Not joining changes nothing about your membership.
>
> [ Join the offer ]  [ Not now ]

No ticked box. The contact line says "ask at the front desk" because the contact blank in #37 is
still open; when #37 is decided, that line can name the contact.

Hindi version, for a later Hindi app (not built in the app now):

> **ऑफ़र से जुड़ें: 10 वर्कआउट, 3 दिन ज़्यादा**
> कैसे: जिस दिन आप RAM'S FITNESS में चेक-इन करें, उस दिन ForgeAI में कम से कम 20 मिनट और 6 या
> ज़्यादा सेट का वर्कआउट लॉग करें। जुड़ने के 30 दिन में ऐसे 10 वर्कआउट होने पर आपकी मेंबरशिप में
> 3 दिन जुड़ जाएँगे।
> जिम को क्या मिलेगा: सिर्फ़ उन वर्कआउट की तारीख़ें। आपकी एक्सरसाइज़, वज़न, सेट, शरीर का वज़न या
> फ़ोटो कभी नहीं।
> कौन देखेगा: RAM'S FITNESS के मालिक और फ़्रंट डेस्क।
> कभी भी बंद करें: Gym टैब → Workout offer → Leave the offer। तारीख़ें मिटा दी जाएँगी और आगे कुछ
> नहीं भेजा जाएगा।
> सवाल या शिकायत: RAM'S FITNESS के फ़्रंट डेस्क पर पूछें। हल न हो तो डेटा प्रोटेक्शन बोर्ड ऑफ
> इंडिया से शिकायत कर सकते हैं।
> न जुड़ने से आपकी मेंबरशिप में कुछ नहीं बदलता।
> [ ऑफ़र से जुड़ें ]  [ अभी नहीं ]

## 2. Privacy notice lines (English and Hindi)

**Line 1 — under "Who is responsible", added to the "Your workouts" bullet:**
- EN: If you join your gym's workout offer, the app sends your gym only the dates of the workouts
  that count, and only while you are in the offer. Your gym is responsible for its offers and
  rewards; ForgeAI keeps the dates for the gym.
- HI: अगर आप जिम के वर्कआउट ऑफ़र से जुड़ते हैं, तो ऐप जिम को सिर्फ़ गिने गए वर्कआउट की तारीख़ें
  भेजता है, और सिर्फ़ तब तक जब तक आप ऑफ़र में हैं। ऑफ़र और इनाम की ज़िम्मेदारी जिम की है; ForgeAI
  जिम के लिए तारीख़ें रखता है।

**Line 2 — a new row in "What we keep on our server":**
- EN: Workout offers you join: the offer, when you joined or left, the words you agreed to, the
  dates of workouts that counted (only days you checked in), and the reward | To give you the
  reward | Dates: deleted when you leave the offer or the gym, or 90 days after the offer ends. The
  reward stays on your membership record. When you joined and left: 1 year after the offer ends.
- HI: आपके जुड़े वर्कआउट ऑफ़र: ऑफ़र, जुड़ने या छोड़ने का समय, जिन शब्दों पर आपने हाँ कहा, गिने गए
  वर्कआउट की तारीख़ें (सिर्फ़ चेक-इन वाले दिन), और इनाम। तारीख़ें: ऑफ़र या जिम छोड़ने पर, या ऑफ़र
  ख़त्म होने के 90 दिन बाद मिटा दी जाती हैं। इनाम मेंबरशिप रिकॉर्ड पर रहता है। जुड़ने और छोड़ने का
  समय: ऑफ़र ख़त्म होने के 1 साल बाद तक।

**Line 3 — under "Your rights" (how to withdraw):**
- EN: To stop sharing workout dates, open the Gym tab, then Workout offer, then Leave the offer.
  Leaving the gym in the app does the same.
- HI: वर्कआउट की तारीख़ें भेजना बंद करने के लिए Gym टैब → Workout offer → Leave the offer दबाएँ। ऐप
  में जिम छोड़ने से भी यही होता है।

**Line 4 — "Last updated", plus a note in the app before the change applies:**
- EN: Last updated: <release date>. What changed: the optional workout offer (dates of counted
  workouts, only if you join).
- HI: आख़िरी बदलाव: <release date>। क्या बदला: वैकल्पिक वर्कआउट ऑफ़र (गिने गए वर्कआउट की तारीख़ें,
  सिर्फ़ अगर आप जुड़ते हैं)।

## 3. How it matches what was built
- Dates leave the phone only after "Join the offer", only the dates, and stop at once on "Leave the
  offer" (the phone forgets its consent first, so nothing is sent even without internet).
- The gym's server keeps a date only when its own register shows a check-in that day, inside the
  member's 30 days, and never a date in the future. It counts on its own; a number sent by the phone
  is never used.
- Dates are deleted on Leave the offer, on leaving the gym, and 90 days after the offer ends. The
  join/leave log (proof of consent) is kept 1 year after the offer ends.
- The free days are not a sale: no receipt and no GST. They show on the member's plan as "Extended
  free by 3 days (reward)". The owner can take a reward back while the plan's last day is unchanged.
