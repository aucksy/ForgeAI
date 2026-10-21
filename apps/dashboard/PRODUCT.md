# ForgeAI — product truth

Written 21 Oct 2026 by Claude from the repo's own records (docs/LAUNCH-PLAN.md, docs/OWNER-INBOX.md
feature backlog, CLAUDE.md) and the owner's words that day. Nothing here was asked in an interview:
the owner's standing rule is "don't stop to ask what you can decide". Inferred lines are marked.

## What it is
Gym software for small Indian gyms (Jaipur first), in two halves that talk to each other:
- **The member app** (Android, free for members): a full workout tracker of the Hevy / Strong class —
  last time's numbers beside every set, "kg to beat" targets, personal records the moment they fall,
  charts, body map, progress photos, weekly goal and milestones, monthly report — wearing the
  member's gym's own logo and colours. The trainer's plans arrive in it; the gym shop and the gym's
  messages live in it; check-in is a QR scan.
- **The admin app** (web, phone or computer at the desk): members, plans, renewals, dues, receipts
  with 5% GST, attendance, at-risk members, enquiries, expenses, staff roles, Excel import, the shop's
  orders and stock, messages to members, workout plans to send.

## Positioning (owner, 21 Oct 2026)
The unique selling point is the **member app**: members see their own progress, so they keep coming
and don't quit. Then the **gym shop** (the owner earns from supplements and gear sold in the app) and
**messages to members** (offers and news straight into every member's phone). Renewals, dues and GST
receipts are table stakes every rival has; they support the story, they never lead it.

## Audience for marketing
Owners of independent gyms in India (50-600 members), often running on a register book, Excel or
GGMS; they live on WhatsApp and decide on a phone. Desk staff and trainers are secondary readers.
(Inferred from the launch plan's research, 21 Oct.)

## Proof available today
- Real screens of both apps (the demo gym's made-up data).
- Live: the member app's tracker features, gym branding, trainer plans, QR check-in, gym shop,
  in-app gym messages inbox, My membership, at-risk list.
- Coming (must be labelled as coming, never as live): message pop-ups on the phone's lock screen
  (needs a Firebase project), member progress visible to the gym, Hindi member app, AI coach, food
  log, paying in the app, entry machine.
- No customers, testimonials, retention numbers or prices yet (#30). None may be invented.

## Brand commitments
- Name "ForgeAI" (a new brand name is being researched; keep the name easy to swap).
- Product colours: near-black ground, orange accent (#FF8A3D / #FFA043); fonts Sora (display) and
  Manrope (body) in both apps. Members never see the words "volume", "PR" or "session".
- English and Hindi for marketing.

## Platform
web (the landing page), served by the forgeai-panel Cloudflare Worker; security policy allows only
the site's own scripts, Google Fonts, inline styles.
