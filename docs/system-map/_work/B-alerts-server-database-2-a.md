# B-alerts-server-database-2-a checkpoint (lens 11 + gap-2, server/database-2, migrations 0034-0062)

## Alert paths found (grep push/notify/whatsapp/alert over 0034-0062)
- 0038 gym messages + workout offers -> push_jobs -> HQ Worker sends Firebase pop-ups to saved push addresses.
- 0042 quiet rule: 3rd+ message of an India day gets no pop-up; daily cap 10.
- 0047/0048 challenge winners get a group gym message (rides 0038, counts toward quiet rule and cap).
- 0053 trainer reply -> push_jobs 'trainer_reply' to that member's phones.
- 0054 personal notes: plan request decided, report asked for, order ready/cancelled -> hq_push_direct_next.
- 0061 WhatsApp code made and sent by the panel Worker (not this area). 0034 one-time codes are handed over by owner/HQ, no send.
- 0044, 0045, 0048 typed number, 0056, 0060: server sends nothing; the desk/HQ sees them only in screens (panel bell is another area).

## Items
- L11.1 done. Findings 01 (quiet rule swallows urgent notices), 04 (MettleUp payment rejected: owner not told). Reused night pop-ups, sender-stops, done-means-gone.
- H2.1 done. Conditions for a member pop-up: app installed, joined the gym (gym_members, not left, key unchanged), "Messages from my gym" on, phone notifications allowed, a push address saved and refreshed in 60 days, not quiet (3rd+ of day), sender running and job under 6 hours late, phone maker rules. Report request also: the gym list number proven at the door, unique on the list, same first name. Pay-me: same three plus confirmed number.
- H2.2 done: server keeps no per-member or per-message pop-up reach; a job with no phones is logged "sent" (02). Report request answer to desk shows no reach (03).
- H2.3 done: 02, 03; reused FN-B-alerts-phone-shop-2-a-01.
- H2.4 done (field-fill.csv): Crispy Curves 2 list members, 2 app members, check-in number on 1 of 2, app link 0 of 2. Report request pop-up reaches at most 1 of 2 members; "your gym asked you to pay" at most 1 of 2; gym messages at most 2 of 2 app members but push addresses are not in field-fill: real pop-up reach not countable.
- H2.5 done: needs a real-phone check: gym message + trainer reply + order ready pop-up on OPPO/Xiaomi/Samsung with battery saver on and screen off; does a quiet (3rd) message stay silent on an app older than 0.60.0 (it will pop up: 0042 says so).
- lens-cover ok; merge --dry 6 of 6 passed. Code lines read: about 900.
