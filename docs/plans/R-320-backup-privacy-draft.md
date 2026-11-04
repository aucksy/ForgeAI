# R-320 — privacy page wording for the backup change (DRAFT, needs the owner's yes)

Owner decision 4 Nov 2026 (R-320, "Backup A"): the MettleUp account (sign in with Google) is the one
backup for every member. Google Drive backup is no longer a choice: phones stop making new Drive
backups; a member can only bring back an OLD Drive backup from Settings → Backup → "Bring back a
Google Drive backup" (until about Feb 2027). "Save a backup" is now called "Download my data".

`apps/dashboard/public/privacy.html` is NOT changed yet. Privacy wording is the owner's call. Once he
says yes, replace the lines below (English and Hindi) and bump the page's "last updated" date.

## 1. Where sign-in is (English line 19, Hindi line 52)

Old (EN): "When you sign in (on the welcome screen, or in Settings → Backup → Keep your workouts on MettleUp), the app saves these on our server:"

New (EN): "When you sign in with Google (on the welcome screen, or in Settings → Backup), the app saves these on our server:"

New (HI): "Google से साइन इन करने पर (शुरुआती स्क्रीन पर, या Settings → Backup में), ऐप हमारे सर्वर पर ये सेव करता है:"

## 2. Google Drive paragraph (English line 28, Hindi line 61)

Old (EN): "Google Drive backup (Settings → Backup) is separate and also optional. Your phone puts a backup file in your own Google Drive. ..."

New (EN): "**Old Google Drive backups.** Earlier versions of the app could put a backup file in your own Google Drive. The app no longer makes new ones. If you have one, Settings → Backup → Bring back a Google Drive backup can read it from your Drive and put your workouts back on this phone. It does not go through our server, and we cannot open it. Google's own privacy terms apply to it. You can delete the file from your Google Drive at any time."

New (HI): "**पुराने Google Drive बैकअप।** ऐप के पुराने वर्ज़न आपकी अपनी Google Drive में एक बैकअप फ़ाइल रख सकते थे। अब ऐप नए बैकअप नहीं बनाता। अगर आपके पास ऐसी फ़ाइल है, तो Settings → Backup → Bring back a Google Drive backup से ऐप उसे आपकी Drive से पढ़कर आपके वर्कआउट इस फोन पर वापस ला सकता है। यह हमारे सर्वर से होकर नहीं जाती, और हम इसे खोल नहीं सकते। इस पर Google की अपनी गोपनीयता शर्तें लागू होती हैं। आप यह फ़ाइल अपनी Google Drive से कभी भी डिलीट कर सकते हैं।"

## 3. New short paragraph after the Drive one: "Download my data"

New (EN): "**Download my data** (Settings → Backup) makes one file with your workouts, routines and body weight. It stays on your phone until you choose where to keep it (Files, Google Drive, WhatsApp). It does not go through our server."

New (HI): "**Download my data** (Settings → Backup) आपके वर्कआउट, रूटीन और शरीर के वज़न की एक फ़ाइल बनाता है। यह आपके फोन पर रहती है, जब तक आप ख़ुद न चुनें कि इसे कहाँ रखना है (Files, Google Drive, WhatsApp)। यह हमारे सर्वर से होकर नहीं जाती।"

## 4. Service providers (English line 31, Hindi line 63)

Old (EN): "Google (sign-in with Google, and Google Drive if you turn on that backup)"
New (EN): "Google (sign-in with Google, and Google Drive only if you bring back an old Drive backup)"

Old (HI): "Google (Google से साइन इन, और Google Drive अगर आप वह बैकअप चालू करें)"
New (HI): "Google (Google से साइन इन, और Google Drive सिर्फ़ तब जब आप पुराना Drive बैकअप वापस लाएँ)"

## Not changing

- What is saved on our server, how long, Sign out and Delete my account: unchanged (the account
  already existed; it is now offered to every member, not only gym members, which the table row
  "Only if you sign in with Google" already covers).
- The "Gym right now" widget shows only the gym's busy word already in the app (no names). No new data.
