# R-631 word list (W): DRAFT for the owner's yes

Summary. Changed entries per group (one entry = one sentence, or one short block that must change together): Privacy notice 38 (English with its Hindi twin; 4 are Hindi-only, 4 are held), Data agreement 10, Terms 4 (1 held), Delete-account page 9, Websites 14 (2 held), Help answers 5, Store listing 1, App screens 20. Total 101.
Still [UNKNOWN] in data-flows.json or the code (these sentences cannot go live until the fact is read): Sarvam's data terms, keep-for and location; how long Groq keeps a recording; Anthropic's keep-for and whether it trains on the text; how long Supabase's own backups keep a deleted account; where Cloudflare keeps the web database (D1), and how long D1 Time Travel and Workers logs keep data; how long Meta keeps its copy of WhatsApp messages; how long join-form enquiries and free-trial numbers are kept, and how they are deleted; whether the member summary row (with body weight and calories) is stored for gym members today; whether the database-login read log is switched on live; the tax keep period for payment records (D9 says 8 years, to be confirmed); Hevy's own privacy terms; how MettleUp reaches a phone-number account holder after a leak; where a member can turn "Include photos in my backup" off (the page has no link).
Held lines (true only when a switch goes on; slice B ships them behind that switch): door entry machines (D7), gym web pages and their AI helper (GYM_PAGES, PAGE_AI), members paying the gym online (PAY_LIVE, D10).
Sources: every NEW line is checked against docs/legal/data-flows.json (row id given in brackets) and, where the list is thin, the code named. House style: member-words skill (plain, complete sentences, first-time reader).

Notes for the reader:
- "Row" = the row id in docs/legal/data-flows.json. "D" = decision in docs/designs/R-631.md section 4. "FN-..." = finding in docs/system-map/findings.jsonl.
- The two tables in the notice ("Who else gets your data", "How long we keep it") are generated from the list in slice B. The rows below are the words those tables will show, for approval; the generator must produce exactly these.
- The live notice keeps naming the owner and the contact address as it does today. This file names neither (public repo).
- Hindi notice text is Devanagari, like today's Hindi notice. The member app has no Hindi strings, so app lines are English only. Websites use Devanagari in their data-hi twins, so their Hindi is Devanagari too.
- Where the R-630 batch changes the same sentence (sharing switches off by default at joining, the under-18 rules), this file keeps today's truth from the list and marks the clash. See "Places the design may be wrong" at the end.

---

## 1. Privacy notice (docs/legal/privacy.body.html, docs/legal/privacy-hi.body.html)

**P1. Top date line, both languages.**
- OLD: "Last updated: 27 Nov 2026. What changed is at the end." / "आखिरी बदलाव: 27 नवंबर 2026।"
- NEW: "Last updated: [release date]. What changed is at the end." / "आखिरी बदलाव: [release date]।"
- Answers: 3b (one notice version for R-630 and R-631).

**P2. "In short", first bullet.**
- OLD EN: "What you log stays on your phone, unless you sign in with Google to keep a copy, or you are in a gym."
- OLD HI: "आप ऐप में जो लिखते हैं, वह आपके फोन पर ही रहता है। यह सिर्फ़ दो हालात में बाहर जाता है: जब आप उसकी कॉपी रखने के लिए Google से साइन इन करें, या जब आप किसी जिम में हों।"
- NEW EN: "What you log is kept on your phone. A copy also goes to your MettleUp account if you sign in with your phone number or with Google, some of it goes to your gym if you join one, and Android copies it to your phone's own Google backup if that backup is on in Android settings."
- NEW HI: "आप ऐप में जो लिखते हैं, वह आपके फोन पर रहता है। अगर आप अपने फोन नंबर या Google से साइन इन करें, तो उसकी एक कॉपी आपके MettleUp खाते में भी जाती है। अगर आप किसी जिम से जुड़ें, तो उसका कुछ हिस्सा आपके जिम के पास जाता है। और अगर Android की सेटिंग में आपके फोन का Google बैकअप चालू है, तो Android उसकी कॉपी उस बैकअप में रखता है।"
- Answers: D5, FN-L4-phone-components-2-02, FN-L4-web-pages-02. Rows: phone-local-db, member-account-copy, phone-number-account, android-backup-cloud.

**P3. "In short", Hindi only: the EU bullet is missing.**
- OLD HI: (none)
- NEW HI: "क्या आप EU, EEA या UK में रहते हैं? आपके अतिरिक्त अधिकार, और आपके डेटा के हर इस्तेमाल का कानूनी कारण, ऊपर अंग्रेज़ी सूचना के सेक्शन 12 में हैं। वह सेक्शन सिर्फ़ अंग्रेज़ी में है।"
- Answers: D13 (B).

**P4. Section 3 "What stays on your phone", first paragraph.**
- OLD EN: "Everything you log stays on your phone unless this notice says otherwise. That means your workouts, routines, notes, body weight, measurements and profile. Your progress photos never leave your phone."
- OLD HI: "आप ऐप में जो कुछ भी लिखते हैं, वह आपके फोन पर ही रहता है, जब तक यह सूचना कुछ और न कहे। यानी आपके वर्कआउट, रूटीन, नोट्स, शरीर का वज़न, नाप और प्रोफ़ाइल। आपकी प्रोग्रेस फोटो कभी आपके फोन से बाहर नहीं जातीं।"
- NEW EN: "Everything you log is kept on your phone: your workouts, routines, notes, body weight, measurements and profile. This notice tells you each time a copy goes somewhere else."
- NEW HI: "आप ऐप में जो कुछ भी लिखते हैं, वह आपके फोन पर रहता है: आपके वर्कआउट, रूटीन, नोट्स, शरीर का वज़न, नाप और प्रोफ़ाइल। जब भी इसकी कॉपी कहीं और जाती है, यह सूचना आपको बताती है।"
- Answers: D5, FN-L4-phone-components-2-02. Row: phone-local-db.

**P5. Section 3, new paragraph: Android's own backup.**
- OLD: (none)
- NEW EN: "**Android's own backup.** If backup is on in your phone's Android settings, Android copies the app's workout database and settings to your Google account. That backup belongs to your Google account. Google decides how long it keeps it, and MettleUp cannot see it or delete it. To stop it, turn off backup in Android settings, or delete the backup in your Google account."
- NEW HI: "**Android का अपना बैकअप।** अगर आपके फोन की Android सेटिंग में बैकअप चालू है, तो Android ऐप का वर्कआउट डेटाबेस और सेटिंग आपके Google खाते में कॉपी करता है। वह बैकअप आपके Google खाते का है। उसे कितने समय तक रखना है, यह Google तय करता है, और MettleUp उसे न देख सकता है, न मिटा सकता है। इसे रोकने के लिए Android सेटिंग में बैकअप बंद करें, या अपने Google खाते में वह बैकअप मिटा दें।"
- Answers: D5 (A), FN-L4-phone-components-2-02. Row: android-backup-cloud.

**P6. Section 3, new paragraph: progress photos.**
- OLD: (the sentence "Your progress photos never leave your phone." in P4)
- NEW EN: "**Progress photos** stay on your phone, and MettleUp's server never gets them. Two things can copy them. If you turned on "Include photos in my backup", your newest photos, up to 15 MB, go into that Google backup too; turning it off deletes those copies. When you move to a new phone with Android's "Copy apps and data", every photo goes straight to the new phone. [UNKNOWN: where a member can turn "Include photos in my backup" off today: the page that holds the switch has no link in the app.]"
- NEW HI: "**प्रोग्रेस फोटो** आपके फोन पर रहती हैं, और MettleUp के सर्वर को वे कभी नहीं मिलतीं। दो चीज़ें उनकी कॉपी बना सकती हैं। अगर आपने "Include photos in my backup" चालू किया है, तो आपकी सबसे नई फोटो, 15 MB तक, उसी Google बैकअप में भी जाती हैं; इसे बंद करने पर वे कॉपी मिट जाती हैं। जब आप Android के "Copy apps and data" से नए फोन पर जाते हैं, तो हर फोटो सीधे नए फोन पर चली जाती है। [UNKNOWN: वही जो अंग्रेज़ी में है।]"
- Answers: D5 (A), FN-A5-phone-screens-2-1b-01. Rows: phone-progress-photos, android-backup-photos, android-device-transfer.

**P7. Section 4A heading and first line.**
- OLD EN: "A. If you sign in with Google" / "Signing in is your choice. You sign in with "Continue with Google", on the welcome screen or in Settings → Your data → Backup and restore."
- OLD HI: "A. अगर आप Google से साइन इन करते हैं" / "साइन इन करना आपकी मर्ज़ी है। आप "Continue with Google" से साइन इन करते हैं, शुरुआती स्क्रीन पर या Settings → Your data → Backup and restore में।"
- NEW EN: "A. If you sign in" / "Signing in is your choice. You sign in on the welcome screen or in Settings → Your data → Backup and restore, with "Continue with your phone number" or with Google."
- NEW HI: "A. अगर आप साइन इन करते हैं" / "साइन इन करना आपकी मर्ज़ी है। आप शुरुआती स्क्रीन पर या Settings → Your data → Backup and restore में साइन इन करते हैं, "Continue with your phone number" से या Google से।"
- Answers: FN-L4-web-pages-02 (phone accounts described wherever Google ones are, section 3a). Row: phone-number-account.

**P8. Section 4A, new bullet after "From Google".**
- OLD: (none)
- NEW EN: "**From your phone number:** you prove the number with one WhatsApp message (section 4D). Your account then keeps only a coded form of the number and of your first name, never the number itself. The coded form finds your saved workouts when you sign in again."
- NEW HI: "**आपके फोन नंबर से:** आप एक WhatsApp संदेश भेजकर साबित करते हैं कि नंबर आपका है (सेक्शन 4D)। इसके बाद आपका खाता नंबर और आपके पहले नाम का सिर्फ़ कोड में बदला हुआ रूप रखता है, नंबर ख़ुद कभी नहीं। दोबारा साइन इन करने पर यही कोड आपके सेव किए वर्कआउट ढूँढता है।"
- Answers: FN-L4-web-pages-02. Row: phone-number-account (code: supabase/migrations/0099_phone_account.sql keeps the number and first name only as HMAC codes).

**P9. Section 4A, the member summary (new flow found by slice A).**
- OLD: "Who can see it: only you. Your gym and other members cannot." (true for the copy itself)
- NEW EN: "[UNKNOWN: whether the one-row summary the signed-in phone uploads (display name, last active, workouts in 7 and 30 days, streaks, body weight, today's calories and protein) is stored for gym members today. If it is, this bullet must say: "If you signed in and your account is linked to a gym, a short summary also goes to that gym's owner and trainers: your display name, when you were last active, your workout counts and streaks, your body weight, and today's calories and protein." That would break six "never your body weight" sentences on screens, so the better fix may be to stop the upload.]"
- NEW HI: "[UNKNOWN: वही जो अंग्रेज़ी में है।]"
- Answers: [F] slice A. Row: member-summary (why: unknown).

**P10. Section 4B, "Find my gym" bullet.**
- OLD EN: "Find my gym: if you check your mobile number in the app, we look for it on the member lists of gyms that use MettleUp, only to show you your own gym. The number is checked once and is not kept for this."
- OLD HI: (missing)
- NEW EN: "Find my gym: if you check your mobile number in the app, we look for it, with your first name, on the member lists of gyms that use MettleUp, only to show you your own gym. We record for 30 days that a check happened (when, and how many gyms matched), without the number. If you then join that gym, the number is saved on your link to it, as when you type it at a check-in."
- NEW HI: "Find my gym: अगर आप ऐप में अपना मोबाइल नंबर जाँचते हैं, तो हम उसे आपके पहले नाम के साथ MettleUp इस्तेमाल करने वाले जिमों की मेंबर-सूचियों में ढूँढते हैं, सिर्फ़ आपको आपका अपना जिम दिखाने के लिए। जाँच हुई, यह (कब, और कितने जिम मिले) हम 30 दिन तक दर्ज रखते हैं, नंबर के बिना। अगर आप फिर उस जिम से जुड़ते हैं, तो नंबर जिम से आपके जुड़ाव पर सेव हो जाता है, वैसे ही जैसे चेक-इन पर टाइप करने पर।"
- Answers: FN-L4-phone-screens-1-01, FN-L4-phone-onboarding-db-01. Rows: find-my-gym, gym-membership-link (code: apps/mobile/src/onboarding/phoneSignInApi.ts and findGymApi.claimIfJoined hand the proof in after a join).

**P11. Section 4B, "Tell my gym" bullet, Hindi only (missing today).**
- OLD HI: (missing)
- NEW HI: "Tell my gym: अगर आप अपने जिम का नाम और शहर टाइप करते हैं, तो हम सिर्फ़ ये दोनों रखते हैं, ताकि हमारी टीम उस जिम से संपर्क कर सके। हम आपका नंबर कभी किसी को नहीं देते।"
- Answers: FN-A3-notes-claude-2-01 family (Hindi twin missing; 3d "an English sentence fixed while its Hindi twin stays false").

**P12. Section 4B, "Trainer summary" bullet.**
- OLD EN: "...It also holds up to 30 workouts from the last 3 months: each one's date and name, and each exercise's best set and number of sets. ..."
- OLD HI: "...इसमें पिछले 3 महीनों के ज़्यादा से ज़्यादा 30 वर्कआउट भी होते हैं: हर एक की तारीख़ और नाम, और हर एक्सरसाइज़ का सबसे अच्छा सेट और कितने सेट हुए। ..."
- NEW EN: "...It also holds your workouts since you joined that gym, up to 400 from the last 12 months: each one's date and name, and each exercise's best set and number of sets. ..."
- NEW HI: "...इसमें उस जिम से जुड़ने के बाद के आपके वर्कआउट भी होते हैं, पिछले 12 महीनों के ज़्यादा से ज़्यादा 400: हर एक की तारीख़ और नाम, और हर एक्सरसाइज़ का सबसे अच्छा सेट और कितने सेट हुए। ..."
- Answers: D8 (A), FN-L4-phone-shop-2-01, FN-L4-server-database-3-01. Row: trainer-summary.

**P13. Section 4B, new bullet: WhatsApp messages from the gym's desk.**
- OLD: (none)
- NEW EN: "**WhatsApp from your gym:** your gym's staff can send you WhatsApp messages from their own WhatsApp, for example fee reminders, pay links or invites. These messages go through WhatsApp (Meta), and your gym is in charge of them."
- NEW HI: "**आपके जिम से WhatsApp:** आपके जिम का स्टाफ़ अपने WhatsApp से आपको WhatsApp संदेश भेज सकता है, जैसे फ़ीस की याद, भुगतान का लिंक या इनवाइट। ये संदेश WhatsApp (Meta) से होकर जाते हैं, और इनकी ज़िम्मेदारी आपके जिम की है।"
- Answers: [F] slice A. Row: desk-whatsapp-messages.

**P14. Section 4B, messages-to-gym bullet, Hindi only (missing since 12 Nov).**
- OLD HI: (missing)
- NEW HI: "Gym टैब से आप अपने जिम को जो संदेश भेजते हैं (सवाल, फीडबैक, शिकायत) और जिम के जवाब, आख़िरी संदेश के 180 दिन बाद तक रखे जाते हैं, और जिम छोड़ने पर मिटा दिए जाते हैं। बिना नाम भेजा गया फीडबैक जिम को बिना नाम के दिखता है।"
- Answers: FN-A3-notes-claude-2-01 family. Row: member-messages-to-gym.

**P15. Section 4B, "Paying your gym online" bullet (HELD).**
- OLD EN: "Paying your gym online: if your gym asks you to pay in the app, you pay through your gym's own payment company (Razorpay, Cashfree, PayU or PhonePe). ..."
- NEW EN and HI: no word change, but per D10 (A) the bullet shows only while online payments are live (PAY_LIVE on). Today the flow is test mode, so slice B takes it out of the notice until then, together with the payment-company row in section 5 (P26). When it returns, add one sentence: "Our web server keeps the record of each online payment for [UNKNOWN: the tax keep period; D9 A says 8 years, to be confirmed by the owner or his CA], then deletes it."
- Answers: D10 (A), D9 (A). Row: member-pays-gym-online (live_or_test: test; keep_for: unknown).

**P16. Section 4B or a new 4B row: door entry machines (HELD until the gate goes live).**
- OLD: (none)
- NEW EN: "**Entry machines at the door:** if your gym uses one, each door punch goes to your gym's records: your member number, the time, and how you were checked. Gym staff see them. They are kept for 13 months, then deleted."
- NEW HI: "**दरवाज़े पर एंट्री मशीन:** अगर आपका जिम ऐसी मशीन इस्तेमाल करता है, तो दरवाज़े पर हर पंच आपके जिम के रिकॉर्ड में जाता है: आपका मेंबर नंबर, समय, और आपकी जाँच कैसे हुई। जिम का स्टाफ़ इन्हें देखता है। इन्हें 13 महीने तक रखा जाता है, फिर मिटा दिया जाता है।"
- Answers: D7 (A), FN-L4-panel-pay-machines-02, FN-L4-server-database-2-04. Row: entry-machine-punches (not deployed; keep_for becomes 13 months only when D7 A is built).

**P17. Section 4D, "Help and feedback" bullet.**
- OLD EN: "...we get your message, the app and its version, your phone model, the screen you were on and your gym's code. We also get a random number for this install and a coded form of your internet (IP) address, used only to stop misuse. We do not get your name or mobile number, unless you type them."
- NEW EN: "...we get your message, the app and its version, your phone model, how pop-ups from your gym are set on this phone, the screen you were on and your gym's code. We also get a random number for this install, used to stop misuse and to fetch the answers and replies to your questions, and a coded form of your internet (IP) address, used only to stop misuse. If you allow pop-ups, we keep your phone's push address with your question until we reply, so the reply can pop up. If you are in a gym, the app also sends your gym member key, so your gym's AI credits pay for an instant answer; your gym sees only how many questions were asked. We do not get your name or mobile number, unless you type them."
- NEW HI: "...हमें आपका संदेश, ऐप और उसका वर्ज़न, आपके फोन का मॉडल, इस फोन पर आपके जिम के पॉप-अप की सेटिंग, आप जिस स्क्रीन पर थे, और आपके जिम का कोड मिलता है। हमें इस इंस्टॉल का एक रैंडम नंबर भी मिलता है, जो गलत इस्तेमाल रोकने और आपके सवालों के जवाब लाने के लिए है, और आपके इंटरनेट (IP) पते का कोड में बदला हुआ रूप, जो सिर्फ़ गलत इस्तेमाल रोकने के लिए है। अगर आपने पॉप-अप की इजाज़त दी है, तो हम जवाब देने तक आपके फोन का पुश पता आपके सवाल के साथ रखते हैं, ताकि जवाब पॉप-अप में आए। अगर आप किसी जिम में हैं, तो ऐप आपकी जिम मेंबर-कुंजी भी भेजता है, ताकि तुरंत जवाब का ख़र्च आपके जिम के AI क्रेडिट से जाए; आपका जिम सिर्फ़ यह देखता है कि कितने सवाल पूछे गए। हमें आपका नाम या मोबाइल नंबर नहीं मिलता, जब तक आप उन्हें ख़ुद टाइप न करें।"
- Answers: FN-A5-phone-components-2-1-01, FN-A5-phone-lib-core-1-02. Rows: help-feedback, ai-question-counts (code: apps/mobile/src/lib/feedback.ts body; supabase/migrations/0078_ai_questions.sql).

**P18. Section 4D, new sentence in "Help questions": the HQ English helper.**
- OLD: (none)
- NEW EN: "When our team writes a reply to your question, it may ask Google Gemini to word the reply clearly. Gemini then sees our draft, which can quote your question. We keep only a monthly count of this."
- NEW HI: "जब हमारी टीम आपके सवाल का जवाब लिखती है, तो वह जवाब को साफ़ शब्दों में लिखने के लिए Google Gemini की मदद ले सकती है। तब Gemini हमारा ड्राफ़्ट देखता है, जिसमें आपका सवाल लिखा हो सकता है। हम इसकी सिर्फ़ महीने की गिनती रखते हैं।"
- Answers: D6 (A), FN-L4-hq-app-01. Row: hq-english-helper.

**P19. Section 4D and 4E, "Anthropic does not use it to train its AI" (two places, both languages).**
- OLD EN: "Anthropic does not use it to train its AI." / "Anthropic does not use any of this to train its AI."
- NEW: "[UNKNOWN: the list does not hold this fact. Keep the sentence only after Anthropic's commercial terms are read and quoted in rows help-answers-claude and ai-assistant-claude.]"
- Answers: section 8 "words state unchecked facts". Rows: help-answers-claude, ai-assistant-claude (keep_for: unknown).

**P20. Section 4D, "Spoken feedback" bullet.**
- OLD EN: "...your recording goes through our server to Groq, which turns it into text. Neither we nor Groq keep the recording. ..."
- OLD HI: "...आपकी रिकॉर्डिंग हमारे सर्वर से होकर Groq के पास जाती है, जो उसे टेक्स्ट में बदलता है। न हम रिकॉर्डिंग रखते हैं, न Groq। ..."
- NEW EN: "...your recording goes through our server to Groq, in the USA, which turns it into text. We do not keep the recording. [UNKNOWN: how long Groq keeps it.] ..."
- NEW HI: "...आपकी रिकॉर्डिंग हमारे सर्वर से होकर अमेरिका (USA) में Groq के पास जाती है, जो उसे टेक्स्ट में बदलता है। हम रिकॉर्डिंग नहीं रखते। [UNKNOWN: Groq उसे कितने समय तक रखता है।] ..."
- Answers: D1 (A, read terms before words). Row: voice-groq (Groq keep_for: unknown).

**P21. Section 4D, "Sign in with your phone number" bullet.**
- OLD EN: "Sign in with your phone number: when you check your mobile number in the app, we look for it on the member and staff lists of gyms that use MettleUp, only to show you your own gym and your role there. You prove the number by sending us one WhatsApp message; we do not keep the number for this."
- OLD HI: "फोन नंबर से साइन इन: ... आप हमें एक WhatsApp संदेश भेजकर साबित करते हैं कि नंबर आपका है; इसके लिए हम नंबर नहीं रखते।"
- NEW EN: "Sign in with your phone number: you prove the number by sending one WhatsApp message to MettleUp's number. WhatsApp (Meta) tells us which number sent it. We keep only a coded form of the number and of the code, for 2 days. Our number may send one reply in that chat, to say whether the check worked; we send you nothing else. The proven number then signs you in to your MettleUp account (section 4A), and we look for it on the member and staff lists of gyms that use MettleUp, only to show you your own gym and your role there."
- NEW HI: "फोन नंबर से साइन इन: आप MettleUp के नंबर पर एक WhatsApp संदेश भेजकर साबित करते हैं कि नंबर आपका है। WhatsApp (Meta) हमें बताता है कि वह किस नंबर से आया। हम नंबर और कोड का सिर्फ़ कोड में बदला हुआ रूप 2 दिन तक रखते हैं। हमारा नंबर उसी चैट में एक जवाब भेज सकता है, यह बताने के लिए कि जाँच हुई या नहीं; इसके अलावा हम आपको कुछ नहीं भेजते। फिर साबित हुआ नंबर आपको आपके MettleUp खाते में साइन इन करता है (सेक्शन 4A), और हम उसे MettleUp इस्तेमाल करने वाले जिमों की मेंबर और स्टाफ़ सूचियों में ढूँढते हैं, सिर्फ़ आपको आपका अपना जिम और वहाँ आपकी भूमिका दिखाने के लिए।"
- Answers: FN-L4-phone-onboarding-db-02, FN-L4-phone-onboarding-db-01. Rows: whatsapp-number-check, phone-number-account (code: deploy/panel/phoneInbound.js REPLY).

**P22. Section 4E, AI Assistant bullet: the spoken-request sentence (EN), and the whole bullet (HI, missing today).**
- OLD EN: "A spoken request goes through our server to Groq, which turns it into text; neither we nor Groq keep the recording."
- OLD HI: (the whole AI Assistant bullet is missing)
- NEW EN: "A spoken request goes through our server to a speech-to-text company: Sarvam, when we have set it up, otherwise Groq, in the USA. We do not keep the recording. [UNKNOWN: how long Sarvam and Groq keep it, and where Sarvam works. D1 A: read Sarvam's data terms first.]"
- NEW HI (whole bullet): "**AI असिस्टेंट (सिर्फ़ जिम मालिकों के लिए):** मालिक जो टाइप करता है या बोलता है, वह Anthropic के Claude AI के पास जाता है, ताकि वह रिक्वेस्ट समझकर कोई संदेश या बदलाव तैयार कर सके। इसके साथ आज की तारीख़, जिम का नाम, उसके प्लान के नाम, अवधि और दाम, बैच के नाम और ट्रेनरों के पहले नाम जाते हैं। रिक्वेस्ट में लिखे मोबाइल नंबर, ईमेल पते और लंबे कार्ड या खाता नंबर भेजने से पहले छिपा दिए जाते हैं। किसी मेंबर का नाम सिर्फ़ तब जाता है, जब मालिक उसे बोले। AI को मेंबरों के रिकॉर्ड नहीं मिलते: एडमिन ऐप उन्हें ख़ुद ढूँढता है। जब मालिक किसी संदेश के शब्द बदलने को कहता है, तो Claude वह संदेश पढ़ता है। जब मालिक वर्कआउट प्लान लिखने को कहता है, तो Claude को मालिक का चुना लक्ष्य, लेवल, हफ़्ते के दिन और वर्कआउट की लंबाई मिलती है, फ़ोकस और उपकरण पर उसके छोटे नोट (वह जो चोट बताए वह भी, मोबाइल नंबर और ईमेल छिपाकर), और जिम की एक्सरसाइज़ के नाम; मेंबर का नाम या रिकॉर्ड कभी नहीं। बोली गई रिक्वेस्ट हमारे सर्वर से होकर बोली को टेक्स्ट में बदलने वाली एक कंपनी के पास जाती है: Sarvam, जब हमने उसे चालू किया हो, वरना अमेरिका (USA) में Groq। हम रिकॉर्डिंग नहीं रखते। [UNKNOWN: Sarvam और Groq उसे कितने समय तक रखते हैं, और Sarvam कहाँ काम करता है।] हम हर रिक्वेस्ट, मालिक ने उसके साथ क्या किया, और उसमें लगे क्रेडिट 400 दिन तक रखते हैं, ताकि मालिक उन्हें एडमिन ऐप में देख सके। 400 दिन बाद रिक्वेस्ट और उसके शब्द मिटा दिए जाते हैं; हमारे हिसाब के लिए सिर्फ़ इस्तेमाल हुए क्रेडिट की गिनती रहती है।"
- Answers: D1 (A), FN-L4-server-panel-worker-01 (S1), FN-A3-notes-claude-2-01. Rows: assist-voice-sarvam, voice-groq, ai-assistant-claude.

**P23. Section 4E, new bullet: alerts in the admin app.**
- OLD: (none)
- NEW EN: "Alerts: if you allow notifications in your browser, the admin app's alerts (a line about a member, for example who paid online) reach you through your browser maker's push service. The alert is coded, so the push service sees only scrambled bytes. Alerts are kept for up to 30 days."
- NEW HI: "अलर्ट: अगर आप अपने ब्राउज़र में नोटिफ़िकेशन की इजाज़त देते हैं, तो एडमिन ऐप के अलर्ट (किसी मेंबर के बारे में एक लाइन, जैसे किसने ऑनलाइन भुगतान किया) आपके ब्राउज़र बनाने वाली कंपनी की पुश सर्विस से होकर आप तक पहुँचते हैं। अलर्ट कोड में बदला होता है, इसलिए पुश सर्विस को सिर्फ़ बिखरे हुए बाइट दिखते हैं। अलर्ट ज़्यादा से ज़्यादा 30 दिन तक रखे जाते हैं।"
- Answers: [F] slice A. Row: staff-alerts-web-push.

**P24. Section 4E, support-access bullet.**
- OLD EN: "MettleUp support looks at a gym's records only in a short window. Usually the gym's owner opens it, for 1 hour. In an emergency, such as a fault that stops the desk, we open it for up to 1 hour and write down why. We can only read the records, never change them. Every look is recorded, and the owner can see each one in the admin app."
- NEW EN: "MettleUp support looks at a gym's records only in a short window, and can only read them, never change them. Usually the gym's owner opens it, for 1 hour. We can also open it ourselves, for up to 1 hour, for one of three reasons we write down: an emergency (such as a fault that stops the desk), the owner being locked out, or another reason we type. Every look opened through MettleUp HQ is recorded, and the owner sees each one, with its reason, in the admin app. Two kinds of look happen outside that window. The person who runs MettleUp's Cloudflare account can read the nightly copy of the database (section 11), and such a look is not recorded. Reads made with the main database login are copied into a record, and the owner sees the ones that touched his gym. [UNKNOWN: whether that read record is switched on live (its key SUPABASE_LOGS_TOKEN).]"
- NEW HI: "MettleUp सपोर्ट किसी जिम के रिकॉर्ड सिर्फ़ थोड़े समय के लिए मिली पहुँच में देखता है, और उन्हें सिर्फ़ पढ़ सकता है, कभी बदल नहीं सकता। आमतौर पर जिम का मालिक इसे 1 घंटे के लिए खोलता है। हम इसे ख़ुद भी ज़्यादा से ज़्यादा 1 घंटे के लिए खोल सकते हैं, तीन में से एक कारण से, जिसे हम लिख लेते हैं: कोई इमरजेंसी (जैसे कोई खराबी जो डेस्क का काम रोक दे), मालिक का साइन इन न कर पाना, या कोई दूसरा कारण जो हम टाइप करते हैं। MettleUp HQ से खुली हर पहुँच दर्ज होती है, और मालिक एडमिन ऐप में हर एक को उसके कारण के साथ देखता है। दो तरह से इस पहुँच के बाहर भी देखा जा सकता है। जो व्यक्ति MettleUp का Cloudflare खाता चलाता है, वह डेटाबेस की हर रात की कॉपी पढ़ सकता है (सेक्शन 11), और ऐसा देखना दर्ज नहीं होता। मुख्य डेटाबेस के लॉगिन से किया गया हर पढ़ना एक रिकॉर्ड में कॉपी होता है, और मालिक उनमें से वे देखता है जो उसके जिम को छूते हैं। [UNKNOWN: वही जो अंग्रेज़ी में है।]"
- Answers: D4 (A), FN-A3-inbox-3-06, FN-A3-website-1-01. Rows: hq-support-access, nightly-backup-copy, hq-direct-read-log.

**P25. Section 4E, new bullet: the free-trial number check.**
- OLD: (none)
- NEW EN: "Free trial: when a gym starts its free trial, we keep the mobile number used, so each number gets one free trial. [UNKNOWN: how long these numbers are kept and how they are deleted; the code has no clean-up for them.]"
- NEW HI: "फ़्री ट्रायल: जब कोई जिम अपना फ़्री ट्रायल शुरू करता है, तो हम इस्तेमाल हुआ मोबाइल नंबर रखते हैं, ताकि हर नंबर को एक ही फ़्री ट्रायल मिले। [UNKNOWN: वही जो अंग्रेज़ी में है।]"
- Answers: FN-L4-server-database-3-02. Row: join-online (keep_for and how_deleted: unknown).

**P26. Section 4F, new bullet: a gym's online join page.**
- OLD: (none)
- NEW EN: "A gym's online join page sends your name and mobile number to that gym, as an enquiry. MettleUp stores it for the gym. [UNKNOWN: how long it is kept; the code has no clean-up for it.]"
- NEW HI: "किसी जिम का ऑनलाइन जुड़ने वाला पेज आपका नाम और मोबाइल नंबर उस जिम को एक पूछताछ (enquiry) के रूप में भेजता है। MettleUp इसे जिम के लिए रखता है। [UNKNOWN: वही जो अंग्रेज़ी में है।]"
- Answers: FN-L4-server-database-3-02. Row: join-online.

**P27. Section 4F, the "remember on your device" sentence.**
- OLD EN: "A page may remember your light or dark choice, on your device only."
- OLD HI: "कोई पेज आपकी लाइट या डार्क पसंद याद रख सकता है, सिर्फ़ आपके डिवाइस पर।"
- NEW EN: "Pages may keep a few things on your device only: your light or dark choice and your language. A gym's join page also keeps what you typed until you close the tab, so a slow connection does not lose it."
- NEW HI: "पेज कुछ चीज़ें सिर्फ़ आपके डिवाइस पर रख सकते हैं: आपकी लाइट या डार्क पसंद और आपकी भाषा। किसी जिम का जुड़ने वाला पेज आपका टाइप किया हुआ टैब बंद करने तक रखता है, ताकि धीमे इंटरनेट में वह खो न जाए।"
- HELD addition (with GYM_PAGES and PAGE_AI): "A gym's own web page keeps your chat with its helper on your device for 90 days. On a shared phone, the next person can see it."
- Answers: FN-L4-web-pages-p2-02. Rows: none hold browser storage for join-online today: the list should get a row (see the end).

**P28. Section 4F, gym web pages (HELD with GYM_PAGES and PAGE_AI).**
- OLD: (none)
- NEW EN: "A gym's own web page: anyone can see it. If you leave your name and number on it, they go to that gym. If you chat with the page's helper, Anthropic's Claude AI reads the chat to answer."
- NEW HI: "किसी जिम का अपना वेब पेज: इसे कोई भी देख सकता है। अगर आप उस पर अपना नाम और नंबर छोड़ते हैं, तो वे उस जिम के पास जाते हैं। अगर आप पेज के हेल्पर से चैट करते हैं, तो जवाब देने के लिए Anthropic का Claude AI वह चैट पढ़ता है।"
- Answers: FN-L4-server-database-3-02, FN-B-words-web-pages-02. Row: gym-web-pages (off).

**P29. Section 5, the intro, and a second short table.**
- OLD EN: "...These companies help us run MettleUp. They may use the data only to do that work for us:"
- NEW EN: keep that sentence above the first table, and add after it: "**Other places your phone or browser contacts.** These companies are not working for us. Your phone or browser contacts them directly, under their own terms:" followed by the second table (P31).
- NEW HI: "**और जगहें, जिनसे आपका फोन या ब्राउज़र सीधे जुड़ता है।** ये कंपनियाँ हमारे लिए काम नहीं करतीं। आपका फोन या ब्राउज़र इनसे सीधे जुड़ता है, उनकी अपनी शर्तों पर:"
- Answers: [F] slice A (GitHub downloads, Hevy, push service are not MettleUp's processors).

**P30. Section 5 first table, changed and new rows (generated from the list).** Columns: Company | What it does for us | What it gets | Where.
- Cloudflare (changed): "Runs our websites and web server, and passes the apps' requests to the database. Keeps our small web database: feedback, help questions, crash reports, website forms, phone checks and online payment requests. Keeps a copy of our main database each night, for 7 days. Counts visits to mettleup.fit and gyms.mettleup.fit." | "What passes through, and what it keeps" | "Many countries, including India" — HI twin of the same.
- Google (changed): "...Gemini helps with a gym's member-list import, and helps our team word replies to help questions. Google Drive is used only to bring back an old Drive backup." | adds "our draft reply, which can quote your help question" | unchanged.
- Anthropic (Claude), HI only (changed to match EN): "मदद के सवालों के जवाब लिखता है। मेंबर-सूची इम्पोर्ट के लिए दूसरा विकल्प। AI असिस्टेंट की रिक्वेस्ट समझता है, संदेशों के ड्राफ़्ट दोबारा लिखता है, और जिम की एक्सरसाइज़ से वर्कआउट प्लान लिखता है।" | "मदद का संदेश; मेंबर-सूची का नमूना, निजी जानकारी छिपाकर; मालिक की रिक्वेस्ट, मोबाइल नंबर और ईमेल छिपाकर; जिम के प्लान, बैच और ट्रेनरों के पहले नाम; वर्कआउट प्लान के लिए लक्ष्य, लेवल, दिन और मालिक के छोटे नोट, और जिम की एक्सरसाइज़ के नाम" | "अमेरिका"
- Groq (changed): "Turns spoken feedback, and a gym owner's spoken AI Assistant requests when Sarvam is not set up, into text" | "The recording. [UNKNOWN: how long Groq keeps it.]" | "USA" — HI: "बोलकर दिए गए फीडबैक को, और जब Sarvam चालू न हो तो जिम मालिक की बोली गई AI असिस्टेंट रिक्वेस्ट को, टेक्स्ट में बदलता है" | "रिकॉर्डिंग। [UNKNOWN]" | "अमेरिका"
- Sarvam (new): "Turns a gym owner's spoken AI Assistant requests into text, when we have set it up" | "The recording. [UNKNOWN: how long Sarvam keeps it.]" | "[UNKNOWN: where]" — HI: "जब हमने इसे चालू किया हो, तब जिम मालिक की बोली गई AI असिस्टेंट रिक्वेस्ट को टेक्स्ट में बदलता है" | "रिकॉर्डिंग। [UNKNOWN]" | "[UNKNOWN]"
- Meta (WhatsApp) (changed): "Number checks for gym owners, staff and members who sign in with their number. Also carries the WhatsApp messages your gym sends you from its own phone." | "The message and the number that sent it; one reply from our number. Meta keeps its own copy [UNKNOWN: for how long]." | "Many countries"
- Supabase (changed "What it gets"): "Everything we keep on our server, and its own backups of it [UNKNOWN: how long those backups are kept]" | "Mumbai, India"
- Answers: D1, D3, D6, D12-adjacent, FN-L4-server-panel-worker-01, FN-L4-hq-app-01, FN-A3-notes-claude-2-01. Rows: cloudflare-workers, cloudflare-d1, nightly-backup-copy, cloudflare-web-analytics, hq-english-helper, ai-assistant-claude, voice-groq, assist-voice-sarvam, whatsapp-number-check, meta-whatsapp-copy, desk-whatsapp-messages, supabase-main-database, supabase-backups.
- "Your gym's payment company" row: HELD with PAY_LIVE (P15, D10 A).

**P31. Section 5 second table (new): other places your phone or browser contacts.** Columns: Company | When | What it sees.
- GitHub: "When you open an exercise with a how-to clip, the app downloads the clip from GitHub. A copy of the app not installed from Google Play also checks GitHub for updates." | "Your phone's internet address, and which file it downloads" — HI: "जब आप how-to क्लिप वाली कोई एक्सरसाइज़ खोलते हैं, तो ऐप वह क्लिप GitHub से डाउनलोड करता है। जो ऐप Google Play से इंस्टॉल नहीं हुआ, वह अपडेट के लिए भी GitHub देखता है।" | "आपके फोन का इंटरनेट पता, और कौन-सी फ़ाइल डाउनलोड हुई"
- Hevy: "Only if you paste a Hevy share link: the app opens Hevy's page in the background to read the routine. Nothing you logged is sent." | "Your phone's internet address and device details" — HI: "सिर्फ़ तब, जब आप Hevy का शेयर लिंक पेस्ट करें: रूटीन पढ़ने के लिए ऐप पीछे से Hevy का पेज खोलता है। आपका लिखा कुछ भी नहीं भेजा जाता।" | "आपके फोन का इंटरनेट पता और डिवाइस की जानकारी". [UNKNOWN: Hevy's privacy page is not read yet; the row's source link is unknown.]
- Your browser's push service (staff only): "Carries admin-app alerts to a browser where you allowed notifications" | "Only coded bytes" — HI: "जिस ब्राउज़र में आपने नोटिफ़िकेशन की इजाज़त दी, वहाँ एडमिन ऐप के अलर्ट पहुँचाती है" | "सिर्फ़ कोड में बदले बाइट"
- Google (Android backup): "If backup is on in Android settings, Android copies the app's data to your Google account (section 3)" | "Your workout database and settings; your newest progress photos if you turned that on" — HI twin.
- Answers: FN-L4-phone-tracker-engine-01, FN-L4-phone-tracker-services-2-01, D5, [F] slice A. Rows: exercise-clips-download, app-update-check, hevy-link-reader, staff-alerts-web-push, android-backup-cloud, android-backup-photos.

**P32. Section 6 "How long we keep it", changed and new rows (generated).**
- "Voice recordings" (changed): "We do not keep them. The daily counts: 7 days. [UNKNOWN: how long Groq and Sarvam keep them.]" — HI: "हम इन्हें नहीं रखते। रोज़ की गिनती: 7 दिन। [UNKNOWN]"
- "Sign-in records and technical logs" (changed): split into "Sign-in records: 7 days until 12 May 2027. From 13 May 2027, 1 year, as the law then requires." and "Technical logs: Supabase's database log, about 1 day. Cloudflare's server logs: [UNKNOWN: set by Cloudflare's plan]."
- "Nightly backup copies" (changed): "Our nightly copies: 7 days. Copies the companies keep themselves: Supabase's backups [UNKNOWN], Cloudflare's copy of the web database [UNKNOWN], Meta's copy of WhatsApp messages [UNKNOWN]."
- New: "Find my gym check record: 30 days" / "Alerts in the admin app: up to 30 days" / "AI Assistant requests: 400 days, then only the count of credits used" / "Records of reads with the main database login: 2 years" / "Your phone's own Google backup: Google decides; MettleUp cannot delete it" / "Join-page enquiries and free-trial numbers: [UNKNOWN]" / HELD "Door punches: 13 months" / HELD "Online payment records on our web server: [UNKNOWN: tax period, D9]".
- Each with its HI twin, same numbers.
- Answers: D1, D7, D9, D5, FN-L4-server-database-3-02. Rows: voice-groq, assist-voice-sarvam, staff-sign-in, supabase-logs, workers-logs, nightly-backup-copy, supabase-backups, d1-time-travel, meta-whatsapp-copy, find-my-gym, staff-alerts-web-push, ai-assistant-claude, hq-direct-read-log, android-backup-cloud, join-online, entry-machine-punches, member-pays-gym-online.

**P33. Section 7 "Delete your data", items 1 and 2.**
- OLD EN item 1 end: "This removes everything the app holds on this phone, including progress photos."
- NEW EN item 1 end: "This removes everything the app holds on this phone, including progress photos. It does not delete your phone's own Google backup: delete that in Android settings or your Google account."
- NEW HI item 1 end: "इससे ऐप का इस फोन पर रखा सब कुछ हट जाता है, प्रोग्रेस फोटो समेत। आपके फोन का अपना Google बैकअप इससे नहीं मिटता: उसे Android सेटिंग या अपने Google खाते में मिटाएँ।"
- OLD EN item 2: "...Both are deleted from our server at once; backup copies expire within 7 days. No app any more? Follow the steps at mettleup.fit/delete-account, or email us from your Google email address. If your Google account is also used for another MettleUp sign-in, we delete your saved workouts but keep that other sign-in working."
- NEW EN item 2: "...Both are deleted from our server at once, and our nightly copies expire within 7 days. [UNKNOWN: how long Supabase's own backups keep them.] No app any more? Go to mettleup.fit/delete-account. If you signed in with your phone number, that page deletes your account after you prove the number with WhatsApp. If you signed in with Google, email us from that Google address. If your account is also your sign-in at a gym (as owner or trainer), or is linked to a gym, we delete your saved workouts but keep the sign-in, your profile and the short summary your gym sees. What your gym has stays until you leave the gym (item 3)."
- NEW HI item 2: "...दोनों हमारे सर्वर से तुरंत डिलीट हो जाते हैं, और हमारी हर रात की कॉपी 7 दिन के अंदर ख़त्म हो जाती हैं। [UNKNOWN: Supabase के अपने बैकअप इन्हें कितने समय रखते हैं।] ऐप अब फोन में नहीं है? mettleup.fit/delete-account पर जाएँ। अगर आपने फोन नंबर से साइन इन किया था, तो वह पेज WhatsApp से नंबर साबित करने के बाद आपका खाता डिलीट कर देता है। अगर आपने Google से साइन इन किया था, तो उसी Google पते से हमें ईमेल करें। अगर आपका खाता किसी जिम में आपका साइन इन भी है (मालिक या ट्रेनर के रूप में), या किसी जिम से जुड़ा है, तो हम आपके सेव किए वर्कआउट डिलीट कर देते हैं, पर साइन इन, आपकी प्रोफ़ाइल और आपके जिम को दिखने वाला छोटा सार रखते हैं। आपके जिम के पास जो है, वह जिम छोड़ने तक रहता है (पॉइंट 3)।"
- Answers: D11 (A), D5, FN-L4-web-pages-02, FN-L4-phone-cloud-backup-ai-01. Rows: member-account-copy, phone-number-account, android-backup-cloud, supabase-backups (code: supabase/migrations/0032_member_cloud.sql member_account_delete keeps the account when the profile has a role or a gym).

**P34. Section 10, the support sentence and the leak paragraph.**
- OLD EN: "MettleUp support can look only in a recorded window (section 4E)."
- NEW EN: "MettleUp support looks only in a recorded window, apart from the two cases in section 4E."
- NEW HI: "MettleUp सपोर्ट सिर्फ़ दर्ज होने वाली पहुँच में देखता है, सेक्शन 4E में लिखे दो हालात को छोड़कर।"
- OLD EN: "If your data leaks, we tell you without delay, in the app or by message. We tell you what happened, what it means for you and what you can do. We report it to the Data Protection Board as the law requires. If it involves a gym's records, we also tell that gym within 24 hours."
- NEW EN: "If your data leaks: for your gym's records about you (section 2), we tell your gym within 24 hours and help it; your gym then tells you and the Data Protection Board. For data we are in charge of, such as your MettleUp account and saved copy, we report it to the Data Protection Board as the law requires, and we tell you directly: by email if you signed in with Google. [UNKNOWN: how we reach you if you signed in with a phone number; that account holds no number and no real email, and our WhatsApp number cannot start a message today.] We say what happened, what it means for you and what you can do."
- NEW HI: "अगर आपका डेटा लीक हो जाए: आपके बारे में आपके जिम के रिकॉर्ड के लिए (सेक्शन 2), हम 24 घंटे के अंदर आपके जिम को बताते हैं और उसकी मदद करते हैं; फिर आपका जिम आपको और डेटा संरक्षण बोर्ड को बताता है। जिस डेटा की ज़िम्मेदारी हमारी है, जैसे आपका MettleUp खाता और सेव की गई कॉपी, उसकी रिपोर्ट हम कानून के अनुसार डेटा संरक्षण बोर्ड को करते हैं, और आपको सीधे बताते हैं: अगर आपने Google से साइन इन किया है, तो ईमेल से। [UNKNOWN: वही जो अंग्रेज़ी में है।] हम बताते हैं कि क्या हुआ, आपके लिए इसका क्या मतलब है, और आप क्या कर सकते हैं।"
- Answers: D12 (A), FN-L4-server-hq-gate-workers-04, D4 (A).

**P35. Section 11 "Where your data is kept" (and the same sentence in section 12 "Data sent outside the EU and UK", EN only).**
- OLD EN: "Our main database is in Mumbai, India. Some of the companies in section 5 work outside India, mostly in the USA. ..."
- NEW EN: "Our main database is in Mumbai, India. Each night, a full copy of it goes to Cloudflare for 7 days, and Cloudflare keeps that copy in many countries. Our small web database (feedback, help questions, crash reports, website forms, phone checks and online payment requests) is also with Cloudflare. [UNKNOWN: in which country or countries Cloudflare keeps the web database.] Some of the companies in section 5 work outside India, mostly in the USA. ..."
- NEW HI: "हमारा मुख्य डेटाबेस मुंबई, भारत में है। हर रात उसकी एक पूरी कॉपी 7 दिन के लिए Cloudflare के पास जाती है, और Cloudflare वह कॉपी कई देशों में रखता है। हमारा छोटा वेब डेटाबेस (फीडबैक, मदद के सवाल, क्रैश रिपोर्ट, वेबसाइट के फ़ॉर्म, फोन की जाँच और ऑनलाइन भुगतान की रिक्वेस्ट) भी Cloudflare के पास है। [UNKNOWN: वही जो अंग्रेज़ी में है।] सेक्शन 5 की कुछ कंपनियाँ भारत के बाहर काम करती हैं, ज़्यादातर अमेरिका (USA) में। ..."
- Answers: D3 (A), FN-B-words-web-pages-01. Rows: supabase-main-database, nightly-backup-copy, cloudflare-d1.

**P36. Section 12 (EN only), "Health data" and "How to ask".**
- OLD: "We keep them on our server only if you sign in with Google to keep a copy."
- NEW: "We keep them on our server only if you sign in, with your phone number or Google, to keep a copy."
- OLD: "Your progress photos never leave your phone, so we never get them."
- NEW: "We never get your progress photos on our server. They can be in your phone's own Google backup, if you turned on "Include photos in my backup" (section 3)."
- OLD: "If you never signed in, your data is only on your phone, and you can see and erase it there (section 7)."
- NEW: "If you never signed in, MettleUp's server holds no account for you. Your data is on your phone, in your phone's own Google backup if that is on, and, if you joined a gym, in that gym's records (section 2). You can see and erase what is on your phone there (section 7)."
- Answers: D5, FN-L4-web-pages-02, FN-A5-phone-screens-2-1b-01.

**P37. Section 12 Hindi stand-in (D13 B), as the last Hindi section before "Changes".**
- OLD HI: (none)
- NEW HI: "<h2>EU, EEA या UK में रहने वालों के लिए</h2><p>यह सेक्शन सिर्फ़ अंग्रेज़ी में है: ऊपर अंग्रेज़ी सूचना का सेक्शन 12 देखें। उसमें आपके अतिरिक्त अधिकार, आपके डेटा के हर इस्तेमाल का कानूनी कारण, और भारत के बाहर भेजे गए डेटा की सुरक्षा लिखी है।</p>"
- Answers: D13 (B).

**P38. Section 13 "Changes", the newest "What changed" entry (both languages; HI also gets the missing 13 Nov and 12 Nov entries).**
- NEW EN: "Last updated: [release date]. What changed: this notice now names every place your data goes. New: your phone's own Google backup and progress photos; signing in with your phone number; what Help and feedback sends; WhatsApp messages from your gym's desk; admin-app alerts; GitHub clip downloads and Hevy links; Sarvam for spoken AI Assistant requests; Google Gemini for our team's replies; how MettleUp support and our nightly copy can be read; where each copy is kept. Corrected: the trainer summary now holds up to 12 months of workouts; Find my gym also uses your first name; our WhatsApp number sends one reply after a check; deleting your account without the app now works for a phone-number account; who tells you about a leak."
- NEW HI: "आखिरी बदलाव: [release date]। क्या बदला: यह सूचना अब हर वह जगह बताती है, जहाँ आपका डेटा जाता है। नया: आपके फोन का अपना Google बैकअप और प्रोग्रेस फोटो; फोन नंबर से साइन इन; Help and feedback क्या भेजता है; आपके जिम के डेस्क से WhatsApp संदेश; एडमिन ऐप के अलर्ट; GitHub से क्लिप डाउनलोड और Hevy लिंक; बोली गई AI असिस्टेंट रिक्वेस्ट के लिए Sarvam; हमारी टीम के जवाबों के लिए Google Gemini; MettleUp सपोर्ट और हमारी हर रात की कॉपी को कैसे पढ़ा जा सकता है; हर कॉपी कहाँ रखी जाती है। सुधारा गया: ट्रेनर के लिए सार में अब 12 महीने तक के वर्कआउट होते हैं; Find my gym आपका पहला नाम भी इस्तेमाल करता है; जाँच के बाद हमारा WhatsApp नंबर एक जवाब भेजता है; फोन नंबर वाला खाता अब ऐप के बिना भी डिलीट हो सकता है; लीक होने पर आपको कौन बताता है। उससे पहले, 13 नवंबर 2026: जिम मालिकों के लिए AI असिस्टेंट जोड़ा गया (Claude और Groq को क्या जाता है)। 12 नवंबर 2026: सेक्शन 4B में Find my gym और Tell my gym, और जिम को भेजे संदेश कितने समय रखे जाते हैं।"
- Answers: 3b (the "What changed" list the app links to), FN-L4-web-pages-p2-03.

Count check for this group: P1-P38 = 38 entries. Held: P15, P16, P27 (its gym-page part) and P28. Hindi-only: P3, P11, P14, P37. Housekeeping: P1, P38.

---

## 2. Data agreement (docs/legal/data-agreement.body.html)

**DA1. Version line.** OLD: "Version 2026-11-10." NEW: "Version [the one owner version shared with R-630]." Answers: 3c.

**DA2. Section 3, the Cloudflare item.**
- OLD: "Cloudflare: runs the admin app and passes requests to the database. It keeps a backup copy of the database each night for 7 days."
- NEW: "Cloudflare: runs the admin app and passes requests to the database. It keeps a backup copy of the database each night for 7 days, stored in many countries. It also holds our small web database, which includes your members' online payment requests and your website forms. [UNKNOWN: where Cloudflare keeps that web database.]"
- Answers: D3, 3c. Rows: nightly-backup-copy, cloudflare-d1.

**DA3. Section 3, new item: Anthropic Claude.**
- NEW: "Anthropic Claude: reads what the owner types or says to the AI Assistant, with mobile numbers and emails hidden, together with your plan names and prices, batch names and trainers' first names. A member's name goes only if the owner says it. Claude also answers help questions. Anthropic is in the USA."
- Answers: 3c, FN-L4-server-panel-worker-01 family. Row: ai-assistant-claude, help-answers-claude.

**DA4. Section 3, new item: speech to text.**
- NEW: "Sarvam, or Groq when Sarvam is not set up: turn the owner's spoken AI Assistant requests into text. We keep no recording. [UNKNOWN: how long Sarvam and Groq keep it, and where Sarvam works.]"
- Answers: D1 (A), FN-L4-server-panel-worker-01. Rows: assist-voice-sarvam, voice-groq.

**DA5. Section 3, the Google Gemini item: add the HQ helper.**
- OLD: "Google Gemini, then Anthropic Claude if Gemini fails: only when you import a member list. ..."
- NEW: keep it, and add: "Google Gemini also helps our team word replies to help questions. It sees our draft, which can quote the question."
- Answers: D6 (A). Row: hq-english-helper.

**DA6. Section 3, the Meta item, and a new push item.**
- OLD: "Meta (WhatsApp): checks the mobile number of an owner or staff member who verifies by WhatsApp."
- NEW: "Meta (WhatsApp): checks the mobile number of an owner, staff member or member who verifies by WhatsApp. Messages your desk sends from its own WhatsApp also go through Meta." and new: "Your staff's browser push service: carries the admin app's alerts to a browser where staff allowed notifications. It sees only coded bytes."
- Answers: 3c, [F] slice A. Rows: whatsapp-number-check, desk-whatsapp-messages, staff-alerts-web-push.

**DA7. Section 4, "Support access" paragraph.**
- OLD: "We look at your records only in a window that you open (in Settings, for 1 hour). In an emergency, such as a fault that stops your desk, we open it for up to 1 hour and write down why. We can only read, never change. Every look is recorded, and you can see each one in the admin app."
- NEW: "We look at your records only in a window, read only, for up to 1 hour. Usually you open it (in Settings). We can also open it ourselves, for one of three reasons we write down: an emergency (such as a fault that stops your desk), you being locked out, or another reason we type. Every look opened through MettleUp HQ is recorded, and you see each one, with its reason, in the admin app. The person who runs MettleUp's Cloudflare account can also read the nightly copy of the database, and that look is not recorded."
- Answers: D4 (A), FN-A3-inbox-3-06, FN-A3-website-1-01. Rows: hq-support-access, nightly-backup-copy.

**DA8. Section 9, "Deleting your gym".**
- OLD: "...Backup copies expire within 7 more days. ..."
- NEW: "...Our nightly copies expire within 7 more days. [UNKNOWN: how long Supabase's own backups keep them.] Within the same 30 days we delete your payment company keys, UPI details and payment events from our web server. We keep only the tax records of payments, for [UNKNOWN: the tax keep period; D9 A says 8 years, to be confirmed], then delete them. ..."
- Answers: D9 (A). Rows: member-pays-gym-online, supabase-backups.

**DA9. Section 10, first sentence.**
- OLD: "A member who signs in with Google can save their own workouts, body weight and measurements on MettleUp."
- NEW: "A member who signs in, with their phone number or Google, can save their own workouts, body weight and measurements on MettleUp."
- Answers: FN-L4-web-pages-02 family. Row: phone-number-account.

**DA10. "Short notice for your members".**
- OLD: "[Gym name] keeps your membership, payments, receipts and visits in MettleUp, a gym software with servers in Mumbai, India."
- NEW: "[Gym name] keeps your membership, payments, receipts and visits in MettleUp, a gym software. MettleUp's main database is in Mumbai, India, and a nightly copy is kept with Cloudflare, which stores it in many countries."
- Also a What's new item for owners (3c): "If you copied MettleUp's short notice for your members before [release date], please replace it. The old one said "servers in Mumbai, India". The new one also names the nightly copy. Copy it again from the data agreement."
- Answers: D3 (A), FN-B-words-web-pages-01, 3c.

HELD (D7): new point "Door entry machines: if you use one, its door punches are kept for 13 months, then deleted. Your reports show door entries from the last 13 months." Not counted.
Also the "Last updated / What changed" line: "Last updated: [release date]. What changed: we now name every company that sees your records (Anthropic, Sarvam, Groq, Google, Cloudflare, Supabase, Meta, your staff's browser push service), when MettleUp support and our nightly copy can be read, and what happens to payment records when you leave." (housekeeping, not counted.)

---

## 3. Terms (docs/legal/terms.body.html)

**T1. Part A section 5, first bullet.**
- OLD: "Signing in with Google is optional. If you do not sign in, your workouts are only on your phone, so keep your phone backed up."
- NEW: "Signing in, with your phone number or Google, is optional. If you do not sign in, MettleUp's server has no copy of your workouts. They are on your phone, and in your phone's own Google backup if that is on in Android settings."
- Answers: D5, FN-L4-web-pages-02.

**T2. Part A section 5, third bullet.**
- OLD: "Keep your phone and your Google account safe."
- NEW: "Keep your phone, your phone number and your Google account safe."
- Answers: phone-number-account (a recycled number reaches only a new, empty account, so the number is now a key).

**T3. Part B section 8, last sentence.**
- OLD: "We keep your connection keys locked and never show them again."
- NEW: "We keep your connection keys locked and never show them again. If your gym leaves MettleUp, we delete them within 30 days of your request."
- Answers: D9 (A). Row: member-pays-gym-online. Ships with the D9 build.

**T4. Part B, new section "Your gym's web page" (HELD with GYM_PAGES).**
- NEW: "MettleUp can give your gym a public web page with your fees, timings, photos and the words you add. Anyone on the internet can see it. It is on unless you switch it off, and you can unpublish it at any time in the admin app. Upload only photos you are allowed to use; for a photo that shows a member, ask the member first. MettleUp can hide a page that breaks these terms."
- Answers: FN-L4-panel-logic-2-p2-01. Row: gym-web-pages (off).

Also the "Last updated" line (housekeeping).

---

## 4. Delete-account page (apps/dashboard/public/delete-account.html)

**DL1. Second paragraph.**
- OLD: "You only have an account if you tapped Continue with Google in the app. If you never did, nothing is saved on our server: your workouts are only on your phone, and there is nothing for us to delete."
- NEW: "You have a MettleUp account if you tapped "Continue with your phone number" or "Continue with Google" in the app. If you never did, MettleUp keeps no account and no copy of your workouts. Your workouts are on your phone, and in your phone's own Google backup if that is on in Android settings. If you joined a gym in the app, see "What is kept" below."
- Answers: D11, D5, FN-L4-web-pages-02.

**DL2. "No app any more? Email us" section (heading and body).**
- OLD heading: "No app any more? Email us" / body: "Email contact@... from the Google email address you signed in with, and ask us to delete your account. We do it within 30 days and reply when it is done."
- NEW heading: "No app any more?"
- NEW body, phone: "**If you signed in with your phone number:** type the number and your first name below, then tap "Check with WhatsApp". WhatsApp opens with a message to MettleUp ready. Send it from that number, come back to this page, and tap "Delete my account". The page shows "Deleted" when it is done. This deletes the newest account on that number. If an older account on the same number is yours, email us with proof that it is yours; we check it by hand and reply within 30 days."
- NEW body, Google: "**If you signed in with Google:** email us from the Google email address you signed in with, and ask us to delete your account. We do it within 30 days and reply when it is done."
- Answers: D11 (A), FN-L4-web-pages-02. Row: phone-number-account. NOTE: the approved D11 says "WhatsApp sends a code to that number". These words use the member's own message instead, because MettleUp's number cannot start a WhatsApp message today (see the end). Button names are placeholders until slice B builds the form.

**DL3. "Delete it in the app", the result sentence.**
- OLD: "We delete your account and everything saved on our server at once. The workouts on your phone stay. To remove them too, uninstall the app."
- NEW: "We delete your account and the copy of your workouts saved with it, at once. The workouts on your phone stay. To remove them too, uninstall the app. What you shared with a gym stays until you leave the gym (below)."
- Answers: FN-L4-phone-cloud-backup-ai-01. Row: member-account-copy.

**DL4. "What we delete", the last bullet.**
- OLD: "Your profile, and the email, name and picture link we got from Google."
- NEW: "Your profile. For a Google account, also the email, name and picture link we got from Google. For a phone-number account, also the coded form of your number and first name."
- Answers: D11. Row: phone-number-account.

**DL5. "What we delete", the photo bullet.**
- OLD: "The dates of your progress photos. The photos themselves stay on your phone, because we never save them on our server."
- NEW: "The dates of your progress photos. The photos themselves stay on your phone, because we never save them on our server. If you turned on "Include photos in my backup", your phone's Google backup may hold copies too; delete them in Android settings."
- Answers: D5, FN-A5-phone-screens-2-1b-01. Row: android-backup-photos.

**DL6. "What is kept", backup copies.**
- OLD: "Backup copies: we remove every backup copy of your data within 7 days of deletion."
- NEW: "Backup copies: our nightly copies of your data expire within 7 days of deletion. [UNKNOWN: how long Supabase's own backups keep it.] Your phone's own Google backup belongs to your Google account: delete it in Android settings."
- Answers: D5, section 8 unchecked facts. Rows: nightly-backup-copy, supabase-backups, android-backup-cloud.

**DL7. "What is kept", the gym sign-in bullet.**
- OLD: "If you also run or work at a gym with the same Google account (as an owner or trainer): we delete your saved workouts but keep that sign-in, so the gym's app keeps working."
- NEW: "If your account is also your sign-in at a gym (as an owner or trainer), or is linked to a gym: we delete your saved workouts but keep the sign-in, your profile and the short summary your gym sees, so the gym's app keeps working."
- Answers: FN-L4-phone-cloud-backup-ai-01 (code: member_account_delete in 0032).

**DL8. "What is kept", the trainer bullet.**
- OLD: "Your trainers' weekly summary of your workouts is deleted when you turn off Share my workouts with my trainers or leave the gym."
- NEW: "What the app sent your gym: your leaderboard numbers, the summary for your trainers (up to 12 months of workouts), machine use and workouts shared with gym mates are deleted when you leave the gym in the app. The trainer summary and gym-mate workouts are also deleted at once when you turn them off."
- Answers: D8, FN-L4-phone-cloud-backup-ai-01. Rows: leaderboard, trainer-summary, machine-use, gym-mates.

**DL9. "Last updated" line.**
- NEW: "Last updated: [release date]. What changed: a phone-number account can now be deleted from this page; this page now says what your gym keeps, and about your phone's own Google backup."
- Answers: D11.

---

## 5. Websites (apps/dashboard/public/home/index.html, member-site/index.html, join-online.html; deploy/panel/gymPage.js)

**W1. Home, "Your member data is safe and private" box, first item (title and line).**
- OLD: "Kept in India" / "Your member data is stored in India." — HI: "भारत में स्टोर रहता है" / "आपके मेंबरों का डेटा भारत में ही स्टोर रहता है।"
- NEW: "Main data in India" / "Your member data is kept in Mumbai, India. A nightly copy is kept with Cloudflare, which stores it in many countries." — HI: "मुख्य डेटा भारत में" / "आपके मेंबरों का डेटा मुंबई, भारत में रहता है। हर रात की एक कॉपी Cloudflare के पास रहती है, जो उसे कई देशों में रखता है।"
- Answers: D3 (A), FN-B-words-web-pages-01.

**W2. Same box, second item.**
- OLD: "Closed to our staff" / "They cannot open your member list unless you let them in for 1 hour." — HI: "हमारे स्टाफ के लिए एक्सेस बंद" / "वे आपकी मेंबर लिस्ट नहीं खोल सकते, जब तक आप उन्हें 1 घंटे के लिए एक्सेस न दें।"
- NEW: "Our staff look only with a record" / "MettleUp support opens your records for up to 1 hour, read only: when you let them in, or for a reason they write down, such as an emergency or you being locked out." — HI: "हमारा स्टाफ़ सिर्फ़ रिकॉर्ड के साथ देखता है" / "MettleUp सपोर्ट आपके रिकॉर्ड ज़्यादा से ज़्यादा 1 घंटे के लिए, सिर्फ़ पढ़ने के लिए खोलता है: जब आप उन्हें एक्सेस दें, या किसी लिखे हुए कारण से, जैसे इमरजेंसी या आपका साइन इन न कर पाना।"
- Answers: D4 (A), FN-A3-inbox-3-06, FN-A3-website-1-01.

**W3. Same box, third item.**
- OLD: "You see every look" / "Every time someone looks, you see it." — HI: "हर व्यू आपको दिखता है" / "जब भी कोई देखेगा, आपको दिख जाएगा।"
- NEW: "You see every support look" / "Every time MettleUp support opens your records, you see it, with the reason. The one exception is our nightly copy: the person who runs our Cloudflare account can read it, without a record." — HI: "सपोर्ट का हर व्यू आपको दिखता है" / "जब भी MettleUp सपोर्ट आपके रिकॉर्ड खोलता है, आपको वह कारण के साथ दिखता है। बस एक अपवाद है, हमारी हर रात की कॉपी: जो व्यक्ति हमारा Cloudflare खाता चलाता है, वह उसे बिना रिकॉर्ड के पढ़ सकता है।"
- Answers: D4 (A). Rows: hq-support-access, nightly-backup-copy.

**W4. Home, member-app details, small print.**
- OLD: "Workouts stay on the member's phone (or in their own MettleUp backup, if they sign in). Data kept in India (Mumbai)." — HI: "वर्कआउट मेंबर के फोन पर रहते हैं (या, अगर वे साइन इन करें, उनके अपने MettleUp बैकअप में)। डेटा भारत (मुंबई) में।"
- NEW: "Workouts stay on the member's phone, and in their own MettleUp backup if they sign in. Main data is kept in India (Mumbai), with a nightly copy at Cloudflare in many countries." — HI: "वर्कआउट मेंबर के फोन पर रहते हैं, और अगर वे साइन इन करें तो उनके अपने MettleUp बैकअप में भी। मुख्य डेटा भारत (मुंबई) में रहता है, और हर रात की एक कॉपी कई देशों में Cloudflare के पास।"
- Answers: D3 (A), FN-B-words-web-pages-01.

**W5. Home, messages card heading.**
- OLD: "Free messages to everyone" — HI: "सबको फ़्री मैसेज"
- NEW: "Free messages to your app members" — HI: "ऐप वाले मेंबरों को फ़्री मैसेज"
- Answers: FN-A3-website-1-05.

**W6. Home, messages card body.**
- OLD: "Write it once. It reaches every member's app inbox. See how many read it." — HI: "एक बार लिखें। हर मेंबर के ऐप इनबॉक्स में पहुँचेगा। देखें कितनों ने पढ़ा।"
- NEW: "Write it once. It reaches the app inbox of every member who joined your gym in the MettleUp app. See how many read it. For members without the app, use WhatsApp." — HI: "एक बार लिखें। यह हर उस मेंबर के ऐप इनबॉक्स में पहुँचेगा, जो MettleUp ऐप में आपके जिम से जुड़ा है। देखें कितनों ने पढ़ा। जिन मेंबरों के पास ऐप नहीं है, उनके लिए WhatsApp इस्तेमाल करें।"
- Answers: FN-A3-website-1-05.

**W7. Home, AI Assistant demo button and the messages demo row.**
- OLD: "Send to 212 members · 1 credit" and "Sent to 212 members read by 64"
- NEW: "Send to your app members · 1 credit" and "Sent in the app · read by 64" (no Hindi twin in the file today).
- Answers: FN-A3-website-1-05 (212 is the whole imported list elsewhere on the page).

**W8. Home, founding-gym box.**
- OLD: "Start your free 3 months first, and tell us before they end. When the AI Assistant comes, you also get 100 free AI credits every month." — HI: "पहले अपने फ़्री 3 महीने स्टार्ट करें, और उनके खत्म होने से पहले हमें बताएं। AI असिस्टेंट आने पर आपको हर महीने 100 AI क्रेडिट फ़्री मिलेंगे।"
- NEW: "Start your free 3 months first, and tell us before they end. You also get 100 free AI credits every month for the AI Assistant." — HI: "पहले अपने फ़्री 3 महीने स्टार्ट करें, और उनके खत्म होने से पहले हमें बताएं। आपको AI असिस्टेंट के लिए हर महीने 100 AI क्रेडिट फ़्री भी मिलते हैं।"
- Answers: FN-A3-website-1-06 (the assistant is live: its help article has no "unreleased" line; About lists 100 a month).

**W9. Member site, top ticks.**
- OLD: "Backup to your own Google Drive" — HI: "आपकी अपनी Google Drive में बैकअप"
- NEW: "Backup to your MettleUp account" — HI: "आपके MettleUp खाते में बैकअप"
- Answers: FN-A3-website-2-01.

**W10. Member site, "safe" list.**
- OLD: "Back up to your own Google Drive, and get it all back on a new phone." — HI: "अपनी Google Drive में बैकअप लीजिए और नए फ़ोन पर सब वापस पाइए।"
- NEW: "Sign in with your phone number, and your workouts come back on a new phone." — HI: "अपने फ़ोन नंबर से साइन इन कीजिए, और नए फ़ोन पर आपके वर्कआउट वापस आ जाते हैं।"
- Answers: FN-A3-website-2-01. Row: phone-number-account.

**W11. Join-online page, privacy line (EN and HI in the file).**
- OLD: "Only {gym} sees your details." — HI: "आपकी जानकारी सिर्फ़ {gym} देखेगा।"
- NEW: "Your details go to {gym}. MettleUp stores them for the gym." — HI: "आपकी जानकारी {gym} के पास जाती है। MettleUp इसे जिम के लिए रखता है।"
- Answers: FN-B-words-web-pages-02. Rows: join-online, supabase-main-database. (The payment company is not named while online payment is test mode, D10.)

**W12. Join-online page, "already a member" note.**
- OLD: "Renew at the gym desk, or in the MettleUp app: Gym → "My gym" → "Renew my plan"." — HI: "जिम के काउंटर पर रिन्यू करें, या MettleUp ऐप में: Gym → "My gym" → "Renew my plan"।"
- NEW: "Renew at the gym desk. In the MettleUp app you can also ask the desk to renew: Gym → "My gym" → "Renew my plan"." — HI: "जिम के काउंटर पर रिन्यू करें। MettleUp ऐप में आप काउंटर से रिन्यू करने के लिए कह भी सकते हैं: Gym → "My gym" → "Renew my plan"।"
- Answers: FN-A3-website-2-07.

**W13. Gym page, question box consent (HELD with GYM_PAGES).**
- OLD: "Send my name, number and question to {gym} so they can reply to me. Only this gym sees them."
- NEW: "Send my name, number and question to {gym} so they can reply to me. MettleUp stores them for the gym."
- Answers: FN-B-words-web-pages-02. Row: gym-web-pages.

**W14. Gym page, AI helper consent (HELD with PAGE_AI).**
- OLD: "Send my name, my number and this chat to {gym}, so they can call me or send me a WhatsApp message. Only this gym sees them."
- NEW: "Send my name, my number and this chat to {gym}, so they can call me or send me a WhatsApp message. MettleUp stores them for the gym. The helper's answers come from Anthropic's Claude AI, which read this chat."
- Answers: FN-B-words-web-pages-02. Row: gym-web-pages.

Not changed, on purpose:
- FN-A3-website-2-04 (member site "free" lines): true while MettleUp Plus is off. Slice D ties these lines to MEMBER_PAYMENTS_LIVE; the words themselves belong to R-633. 0 sentences.
- FN-A3-inbox-4-04 (switching offer): adding it would promise something HQ cannot give yet (no way to set a longer free period). 0 sentences; owner decision outside this card.
- D2 (A), Google fonts: once the fonts are served from our own site, no sentence is needed. If D2 were B, section 4F would need one.

---

## 6. Help answers (deploy/panel/helpArticles.js)

**H1. Article "backup-and-restore".**
- OLD: "Your MettleUp account is your backup. Open Profile, tap Settings, then "Backup and restore", and tap "Continue with Google". Your workouts, routines and body weight are then saved by themselves. On a new phone, sign in with the same Google account and tap "Bring back my workouts". ..."
- NEW: "Your MettleUp account is your backup. Open Profile, tap Settings, then "Backup and restore", and tap "Continue with your phone number" (or "Use Google instead"). Your workouts, routines and body weight are then saved by themselves. On a new phone, sign in the same way, and your workouts come back. If they do not, tap "Bring back my workouts". ... Android may also keep its own copy of the app in your Google account, if backup is on in your phone's Android settings. That copy is Google's, and MettleUp cannot see it."
- Answers: D5, FN-L4-web-pages-02 family. Rows: phone-number-account, android-backup-cloud.

**H2. Article "body / measurements / progress photos", last sentence.**
- OLD: "Your photos are private."
- NEW: "Your photos stay on this phone, and MettleUp's server never gets them. Android's backup includes them only if you turned on "Include photos in my backup"."
- Answers: D5, FN-A5-phone-screens-2-1b-01. Row: android-backup-photos.

**H3. Article "member-progress-card" (owners).**
- OLD: "...and their recent workouts with each exercise's best set."
- NEW: "...and their workouts from the last 12 months (up to 400), with each exercise's best set."
- Answers: D8 (A). Row: trainer-summary.

**H4. Article "ai-assistant" (owners), new sentence after the microphone line.**
- NEW: "When you speak, the recording goes to a speech-to-text company (Sarvam or Groq), and the text goes to Anthropic's Claude AI. MettleUp does not keep the recording."
- Answers: D1 (A), FN-L4-server-panel-worker-01. Rows: assist-voice-sarvam, voice-groq, ai-assistant-claude.

**H5. Article "send-feedback", the owners' line.**
- OLD: "Owners: "MettleUp access", lower on that page, lets MettleUp support read your records for one hour, and lists every time they looked."
- NEW: "Owners: "MettleUp access", lower on that page, lets MettleUp support read your records for one hour. It lists every time MettleUp support looked, with the reason, including the times MettleUp opened access itself."
- Answers: D4 (A). Row: hq-support-access.

Plus the [F] rule for text written while the app runs: the help AI and the owner Assistant prompts get one line, "Privacy facts come only from the privacy notice and the help articles; never state where data goes or how long it is kept from memory." (prompt text, not shown to users; not counted).

---

## 7. Store listing (branding/mettleup/store/listing-draft.txt)

**S1. FULL27.**
- OLD: "• Back up to Google Drive, or save one backup file you can keep."
- NEW: "• Sign in with your phone number to back up your workouts to your MettleUp account, or save one backup file you can keep."
- Answers: FN-A3-website-1-04. Row: phone-number-account, google-drive-restore (restore only).
- Release step ([F]): run the listing workflow with descriptions; tick Play's Data safety form against the generated file (9g).

---

## 8. App screens

Member app (English only; no Hindi strings exist in apps/mobile/src):

**A1. Workout tab safekeep card, apps/mobile/src/lib/safekeepNudge.ts, SAFEKEEP_WORDS.body.**
- OLD: "Your workouts are only on this phone. Confirm your phone number once, and MettleUp keeps them safe in your account."
- NEW: "Your workouts are on this phone, and in your phone's own Google backup if that is on in Android settings. Confirm your phone number once, and MettleUp also keeps them safe in your account."
- Answers: D5 (A), FN-L4-phone-components-2-02. Row: android-backup-cloud.

**A2. Under-18 sheet, apps/mobile/src/cloud/under18Ask.ts, UNDER18_SHEET.body.**
- OLD: "If you are under 18, MettleUp deletes everything it keeps about you on its server, and your workouts stay only on this phone."
- NEW: "If you are under 18, MettleUp deletes your MettleUp account and saved workouts, and what the app sent your gym: your leaderboard numbers, the summary for your trainers and the code for your gym's pop-ups. Your gym keeps its own member record of you. Your workouts stay on this phone, and in your phone's own Google backup if that is on."
- Answers: D5, R-630 hand-over ([F]). Code: supabase/migrations/0101_member_under18.sql deletes member_items, member_summary, profiles, the account, gym_progress_summaries, gym_member_days, gym_member_board, member_push_tokens; machine use, gym-mate workouts and pop-up notes are NOT deleted, so "everything" is false today.

**A3. Under-18 backup line, apps/mobile/src/cloud/ageRule.ts, under18DeleteWords('deleted').**
- OLD: "Deleted. MettleUp no longer keeps your workouts or account. Your gym still keeps its own member record of you. Your workouts are only on this phone."
- NEW: "Deleted. MettleUp no longer keeps your account or saved workouts. Your gym still keeps its own member record of you. Your workouts are on this phone, and in your phone's own Google backup if that is on."
- Answers: D5. Row: android-backup-cloud, gym-mates (still kept).

**A4. Phone account WhatsApp step, apps/mobile/src/cloud/phoneAccount.ts, PHONE_ACCOUNT_WORDS.how.**
- OLD: "WhatsApp opens with a message to MettleUp ready. Send it, then come back to this app. You pay nothing, and we never message you."
- NEW: "WhatsApp opens with a message to MettleUp ready. Send it, then come back to this app. You pay nothing. MettleUp's number may send one reply in that chat, to say whether it worked; it never messages you otherwise."
- Answers: FN-L4-phone-onboarding-db-02. Row: whatsapp-number-check (code: deploy/panel/phoneInbound.js REPLY).

**A5. Welcome phone sign-in WhatsApp step, apps/mobile/src/onboarding/phoneSignIn.ts, SIGN_IN.how.**
- OLD: "WhatsApp opens with a message to MettleUp ready. Send it, then come back to this app, and your number is checked. You pay nothing, and we never message you."
- NEW: "WhatsApp opens with a message to MettleUp ready. Send it, then come back to this app, and your number is checked. You pay nothing. MettleUp's number may send one reply in that chat, to say whether it worked; it never messages you otherwise."
- Answers: FN-L4-phone-onboarding-db-02.

**A6. Find my gym WhatsApp step, apps/mobile/src/shop/findGym.ts, FIND_GYM.how.**
- OLD: "WhatsApp opens with a short message to MettleUp. Send it, then come back to this app. You pay nothing, and we never message you."
- NEW: "WhatsApp opens with a short message to MettleUp. Send it, then come back to this app. You pay nothing. MettleUp's number may send one reply in that chat, to say whether it worked; it never messages you otherwise."
- Answers: FN-L4-phone-shop-1-02.

**A7. Welcome phone sign-in privacy line, phoneSignIn.ts, SIGN_IN.privacy.**
- OLD: "We only use your number to find your gym. Your number is checked once and is not kept for this."
- NEW: "We use your number to find your gym and to sign you in to your MettleUp account. Your account keeps only a coded form of the number. If you join your gym, the number is saved on your link to it."
- Answers: FN-L4-phone-onboarding-db-01. Rows: phone-number-account, gym-membership-link.

**A8. Find my gym privacy line, findGym.ts, FIND_GYM.privacy.**
- OLD: "Your number is checked once and is not kept for this."
- NEW: "We use your number and first name only to look for your gym. We keep a coded form of the number for 2 days, to finish the check. If you join your gym, the number is saved on your link to it."
- Answers: FN-L4-phone-screens-1-01, FN-L4-phone-onboarding-db-01. Rows: find-my-gym, whatsapp-number-check.

**A9. Find my gym intro, findGym.ts, FIND_GYM.intro.**
- OLD: "We check your number against the member lists of gyms that use MettleUp. We only show you your own gym."
- NEW: "We check your number and first name against the member lists of gyms that use MettleUp. We only show you your own gym."
- Answers: FN-L4-phone-screens-1-01.

**A10. "What my gym can see" intro, apps/mobile/src/shop/boardWords.ts, BOARD_WORDS.seesIntro.**
- OLD: "...MettleUp never sends which exercises you did, your body weight, photos or notes."
- NEW: use the seesIntroMachines text in every case: "...MettleUp never sends your body weight, photos or notes." (The screen then shows one variant only, the cautious one, also while the trainer view is still loading.)
- Answers: FN-L4-phone-screens-2-01, 3d "the cautious variant until the state is read". [UNKNOWN: P9 member summary; if it stores body weight for gym members, this line is false too.]

**A11. Workout offer consent, apps/mobile/src/shop/offerWords.ts, consentWords paragraph 2.**
- OLD: "What the gym gets: only the dates of those workouts. Never your exercises, weights, sets, body weight or photos."
- NEW: "What the gym gets from this offer: only the dates of those workouts. The offer never sends your exercises, weights, sets, body weight or photos. Other sharing you have on, such as with your trainers, is listed in Settings → Your gym → "What my gym can see"."
- Answers: FN-L4-phone-shop-2-02.

**A12. Delete account sheet, apps/mobile/src/cloud/accountWords.ts, deleteBody.**
- OLD: "This deletes your account and everything saved on MettleUp's server. The workouts on this phone stay."
- NEW: "This deletes your account and the copy of your workouts saved on MettleUp's server. The workouts on this phone stay. What the app sent your gym stays until you leave the gym."
- Answers: FN-L4-phone-cloud-backup-ai-01.

**A13. After delete, accountWords.ts, deleted.**
- OLD: "Your account and everything saved on MettleUp are deleted. Your workouts are still on this phone."
- NEW: "Your account and your saved workouts on MettleUp are deleted. Your workouts are still on this phone. To delete what your gym has, leave the gym in Settings → Your gym."
- Answers: FN-L4-phone-cloud-backup-ai-01.

**A14. After delete, account kept, accountWords.ts, deletedKeptSignIn.**
- OLD: "Everything saved on MettleUp is deleted. Your Google sign-in stays, because your gym also uses it. Your workouts are still on this phone."
- NEW: "Your saved workouts on MettleUp are deleted. Your sign-in, your profile and the short summary your gym sees stay, because your account is linked to a gym. Your workouts are still on this phone."
- Answers: FN-L4-phone-cloud-backup-ai-01 (code: 0032 member_account_delete; also correct for a phone-number account, which has no "Google sign-in").

**A15. Photo backup switch, apps/mobile/src/components/settings/PhotoBackupCard.tsx, the "off" caption.**
- OLD: "Off: photos stay on this phone only. To keep one anywhere else, open it and tap "Save to phone gallery"."
- NEW: "Off: your photos are not in Android's backup to your Google account. Moving to a new phone with Android's "Copy apps and data" still brings them across. To keep one anywhere else, open it and tap "Save to phone gallery"."
- Answers: D5 (A), 3d. Row: android-device-transfer. NOTE: this page has no link in the app today (see the end).

**A16. Home: one-time "notice changed" line (new, 3b).**
- NEW: "We updated the privacy notice." with the link "What changed"; and a close button "Got it".
- Answers: 3b, FN-L4-web-pages-p2-03.

**A17. Home: the trainer line for current members (new, 3b, D8).**
- NEW: "Your gym's trainers can now see up to 12 months of your workouts (up to 400), not only the last 3 months. They see each workout's date and name, and each exercise's best set. They never see your body weight, photos or notes." Button: "Change what my trainer sees" (opens "Share my workouts with my trainers").
- Answers: D8 (A). Row: trainer-summary. [See P9: if the member summary stores body weight, the last sentence is false.]

**A18. Home: the old-version line (new, 3b).**
- NEW: "Please update MettleUp from Google Play. This version shows some privacy details that are no longer right."
- Answers: 3b (lowest version with true words).

**A19. "What changed" list on R-630's re-ask sheet and behind the A16 link (new, 3b).**
- NEW, one line each: "Your trainers can see up to 12 months of your workouts." / "Android's own backup can copy your workouts to your Google account, if that backup is on." / "You can sign in with your phone number, and delete that account without the app." / "Our WhatsApp number sends one reply after a number check." / "We name every company that gets your data, and where each copy is kept."
- Answers: 3b, D5, D8, D11.

Admin app (English; apps/dashboard/src/crm/lang/hinglish.ts has no entry for these lines today, so they stay English):

**A20. Settings, gym not online, apps/dashboard/src/crm/ui/screens/Settings.tsx (three strings).**
- OLD 1: "Your gym is saved in this browser only. Put it online to keep it safe and open it on any phone or computer."
- NEW 1: "Your members and payments are saved in this browser only. If you turned on the shop, your gym's name, code, products and app members' orders are on MettleUp's server. Put your gym online to keep everything safe and open it on any phone or computer."
- OLD 2: "Saved in this browser only. A demo gym is never put online."
- NEW 2: "Demo members and payments are saved in this browser only. The demo gym's shop part is on MettleUp's server."
- OLD 3: "Saved in this browser only. Put your gym online (above) to keep it safe and open it anywhere."
- NEW 3: "Members and payments are saved in this browser only. Put your gym online (above) to keep them safe and open them anywhere."
- Answers: FN-L4-panel-screens-2-02. Rows: admin-browser-copy, gym-creation, shop-orders.

Group counts: member app A1-A19 = 19, admin app A20 = 1 (three strings). Total 20.

---

## Places the design may be wrong (for the owner, not for slice B to decide)

1. **D11 (A) cannot work as written.** It has WhatsApp send a code to the member's number. MettleUp's WhatsApp number cannot start a message today: Meta blocks every message we send (code 131042, deploy/panel/phoneInbound.js header), which is why every number check is "the person sends us one message". DL2 above uses that inbound check instead. It needs no new Meta approval.
2. **D12 (A) has no channel for phone-number accounts.** "MettleUp tells members directly where it holds their account": a phone-number account stores no number and no real email (0099), and our WhatsApp cannot start a message. Only Google accounts can be reached (by email). P34 marks this [UNKNOWN]. Choices: say "by email if you signed in with Google" only, or build an in-app notice.
3. **D5 (A) points members at a switch they cannot reach.** "Include photos in my backup" lives on /settings/phone-backup, which no row in the app opens since R-320 (only QA deep links reach it; helpArticles.js says so). A member who turned it on before 4 Nov cannot turn it off. The list's switch column ("Profile, Backup") is also out of date. Needs a reachable row, or D5 (B) for photos.
4. **The member summary is not a words-only fix.** Slice A's [F] adds it to W, but it holds body weight and today's calories and protein, readable by the gym's owner and trainers (policy summary_staff_read). Naming it would make at least six live sentences false ("never your body weight": seesIntro, trainer caption, notice 4A and 4B, help articles). Its purpose is "unknown: left from the first version". The better fix is to stop the upload (a flow decision), then no new words are needed.
5. **R-630 3e clashes with the list.** R-630 makes trainer sharing, machine use and gym pop-ups OFF at joining (one box, empty). data-flows.json and the notice table say ON. The two cards release together with one notice version, so the list must change in R-630's build before the 4B table "On or off?" words are final. This file uses today's truth (ON).
6. **R-630's under-18 sheet says "deletes everything".** Today's delete (0101) leaves machine use, gym-mate workouts and pop-up notes. A2 is written to today's truth; if R-630 adds those deletes, A2 can say "everything" again.
7. **D10 (A) taken literally removes a published disclosure.** Members paying the gym online is test mode (PAY_LIVE off), so D10 A takes the "Paying your gym online" bullet and the payment-company row out of the notice until it is live (P15). That is consistent, but it shrinks the notice; confirm that is what was meant.
8. **Section 5's intro makes every listed company our helper.** GitHub downloads, Hevy, the browser push service and Android's backup are not working for MettleUp. P29 adds a second table so the notice does not call them our processors.
9. **Existing sentences the list does not back.** "Anthropic does not use it to train its AI", "Neither we nor Groq keep the recording", "technical logs: 7 days" and "backup copies expire within 7 days" (Supabase's own backups) state facts the list holds as unknown. They are rewritten or marked [UNKNOWN] above (P19, P20, P32, P33, DL6).

## Gaps in data-flows.json itself (slice A follow-ups)

- No row for browser storage on the join-online page (typed form kept until the tab closes; the chosen language) or the gym page chat (90 days on the device). P27 needs one.
- phone-number-account says "the first name"; the code keeps it only as a 16-character HMAC (name_key). The row should say "a coded form of the first name".
- android-backup-photos: the switch column names a place no member can reach (point 3).
- help-feedback does not list the push address, the gym member key or the pop-up setting (P17 adds them from apps/mobile/src/lib/feedback.ts).
- whatsapp-number-check: "MettleUp's number writes back after the check" is a best try only; while Meta's block lasts the reply may not arrive. The words say "may send one reply", which is true either way.
