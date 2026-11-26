# B-words-panel-auth-data checkpoint

## Progress
- L10.1 done (lens 10): finding 02 (Hinglish gaps); reused FN-A8-server-database-2-1-01 ("Wait 15 minutes" while the lock can last 1 hour), FN-A5-panel-auth-data-1-03, FN-L14-panel-auth-data-03.
- H10.1-H10.16 done (gap-10): findings 01, 03, 04; reused FN-B-words-panel-shop-01, FN-A5-panel-ui-shell-1-01, FN-L4-panel-logic-2-01, FN-B-alerts-panel-auth-data-a-01, FN-A3-notes-claude-1-01 (0097 direct-read record still "NOT APPLIED LIVE"), FN-L3-panel-auth-data-01/-02.
- Checked and true: sign-in code 30 min (0018:482), WhatsApp code 10 min (deploy/panel/phoneCode.js:35), Sign out everywhere clears the PIN (0034:320-334), staff 10% discount cap on the server (0019:111), "send with today's date" button exists (ui/offline.tsx:168), More lists Staff & sign-in.
- lens-cover ok; merge --dry 6 rows, 0 rejected.
- Code lines read: about 1,100 (under 3,000).

## Hindi read-aloud list (Hinglish lines in this area, from lang/hinglish.ts)
All 111 t() lines in SignInForms, ForgotPin, WhatsAppVerify, PeopleScreen and PinForms have a Hinglish entry (none missing). Main ones to read aloud:
- PIN bhool gaye? WhatsApp par code lo (lang/hinglish.ts:148)
- Naya code bhejo / Wapas sign in par jao (lang/hinglish.ts:170-171)
- WhatsApp par code lo / WhatsApp se check karo (lang/hinglish.ts:176-178)
- Doosra number daalo / WhatsApp dobara kholo (lang/hinglish.ts:195-205)
- Naya PIN rakho aur sign in karo / WhatsApp par code bhejo (lang/hinglish.ts:168-169)
- Iske badle sign in karo / Gym ban raha hai... / Gym banao (lang/hinglish.ts:230-232)
- Kisi ko jodo / Jodo (lang/hinglish.ts:1478-1479)
- Terms line: "Main MettleUp ke {terms} aur {agreement} se sehmat hoon." (auth/TermsGate.tsx:31)
No banned-word list was given in the brief; none checked.
DONE.
