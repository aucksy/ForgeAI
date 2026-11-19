# A7-templates-1 checkpoint

Candidates: promises.txt lines 1440 to 1559 (120). Output: docs/system-map/_work/out/A7-templates-1.jsonl

T = apps/dashboard/src/crm/logic/messageTemplates.ts, W = apps/dashboard/src/crm/logic/whatsapp.ts

## Finished units
- unit 1 done: promises.txt 1440-1524 (T, the ready messages) -> rows 01 to 46
- unit 2 done: promises.txt 1525-1559 (W, the one-to-one WhatsApp messages) -> rows 47 to 64
- ALL 120 candidates handled: 64 rows, 56 "not a promise" lines. Nothing left.

## Rule used for titles
A message title got a row when it states a fact or a benefit (closed on a day, under repair, an amount off, free days,
a price, a saving, a start day). A title that only names the topic is a heading: not a promise.

## Not a promise
- not a promise: T:111, a list choice ("a power cut"), a fragment dropped into the Closed today sentence
- not a promise: T:112, a list choice ("a water problem")
- not a promise: T:112, a list choice (Hindi, water problem)
- not a promise: T:113, a list choice (Hindi, repair work)
- not a promise: T:118, a list choice, a request to members ("put the weights back after use")
- not a promise: T:118, the same choice in Hindi
- not a promise: T:119, a list choice, a request to members ("wear clean shoes")
- not a promise: T:119, the same choice in Hindi
- not a promise: T:120, a list choice, a request to members ("bring a towel")
- not a promise: T:120, the same choice in Hindi
- not a promise: T:140, the ready message's name in the owner's list ("Closed for a festival")
- not a promise: T:143, a box label the owner sees ("Open again on")
- not a promise: T:143, a box label ("Open again at")
- not a promise: T:159, a box label ("Open again on")
- not a promise: T:159, a box label ("Open again at")
- not a promise: T:179, a box label ("Sunday opens at (optional)")
- not a promise: T:180, a box label ("Sunday closes at (optional)")
- not a promise: T:187, a title that only names the topic (Hindi, "new gym timings from {from}"); the body has row 09
- not a promise: T:199, a title that only names the topic (Hindi, "{festival} timings"); the body has row 11
- not a promise: T:204, the ready message's name in the owner's list ("Machine under repair")
- not a promise: T:224, a title that only names the topic ("New {batch} batch"); the body has row 16
- not a promise: T:225, the same title in Hindi; the body has row 17
- not a promise: T:233, grey example words inside an empty box ("strength and fat loss")
- not a promise: T:240, the ready message's name in the owner's list ("A request to everyone")
- not a promise: T:244, a title that only names the topic ("A request to everyone")
- not a promise: T:244, a request to members, it promises nothing ("Please {rule}. It keeps the gym clean and safe for all.")
- not a promise: T:245, the same title in Hindi
- not a promise: T:245, the same request in Hindi
- not a promise: T:254, a box label ("Join or renew by")
- not a promise: T:283, the ready message's name in the owner's list ("Bring a friend")
- not a promise: T:286, a box label ("Free days for the member")
- not a promise: T:286, a box label ("Discount for the friend")
- not a promise: T:299, the ready message's name in the owner's list ("Couple and family")
- not a promise: T:304, a title that only names the topic ("Couple and family offer"); the body has row 32
- not a promise: T:308, the same title in Hindi; the body has row 33
- not a promise: T:318, a box label ("Price a month (₹)")
- not a promise: T:331, the ready message's name in the owner's list ("Longer plan saves money"); the sent words have rows 38 to 41
- not a promise: T:367, grey example words inside an empty box ("a free month")
- not a promise: T:378, the ready message's name in the owner's list ("Haven't seen you")
- not a promise: W:97, a greeting (Hindi "Namaste {n} ji,")
- not a promise: W:146, the message's name in the owner's list ("Haven't seen you")
- not a promise: W:148, the message's name in the owner's list ("Years with us")
- not a promise: W:172, a wish and an invitation with no fact in it ("we miss you at the gym. Renew and come back any day."); the version with the end date has row 51
- not a promise: W:178, a birthday wish
- not a promise: W:179, a birthday wish
- not a promise: W:184, a greeting ("welcome to {name}!")
- not a promise: W:184, a greeting ("welcome to the gym!")
- not a promise: W:186, a sign-off ("See you at the gym.")
- not a promise: W:193, the frame that joins rows 53 to 55 into one line; no fact of its own
- not a promise: W:199, a fragment ("at the gym") dropped into row 56
- not a promise: W:207, a fragment (Hindi "your {plan} plan") dropped into rows 58 to 60
- not a promise: W:224, a wish and an invitation with no fact in it (Hindi twin of W:172); the version with the end date has row 59
- not a promise: W:230, a birthday wish (Hindi)
- not a promise: W:231, a birthday wish (Hindi)
- not a promise: W:237, a sign-off (Hindi "see you at the gym")
- not a promise: W:243, the frame that joins rows 61 to 63 into one line; no fact of its own

## Could not check
- Whether any sale or renewal screen applies a typed offer (discount, free days for renewing early, student price, family
  discount, the friend's discount) or ends it on its date: searched logic/ by word only; sale screens not read (size limit).
- The automatic reminder path for "Years with us" (apps/dashboard/src/crm/logic/autoReminders.ts:83): not read.
- How the send-later choice treats the fixed word "today" in "Gym closed today" (MessagesSection.tsx:171): not read.
- Whether a ready message also reaches the member's phone app as a notice, or only WhatsApp: not read.
- No test was run; every "test checks" line is from reading the test file.

## Size
About 1,260 file lines read of 1,500. 64 rows written of 120 allowed.
