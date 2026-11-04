# R-319 item 8: alerts that reach a phone when the page is closed (plan, not built)

Owner, 4 Nov 2026 (R-319 item 8): every waiting action gets a notice, one consistent system. What was
built on 4 Nov, and what this plan adds.

## Built now

| Where | What shows | When it rings |
|---|---|---|
| Gym admin panel | "Needs you" card at the top of Today, red number on Today in the menu, "(3) MettleUp for Gyms" in the tab title | A short sound and a browser pop-up for anything NEW, while the panel is open in a tab (also a background tab). The browser asks permission only after "Turn on alerts" is tapped. |
| HQ (owner) | "Needs you" page and menu number: help questions waiting for a reply, new leads, new gyms (14 days), new feedback; the count in the tab title | Sound and pop-up for anything new while HQ is open, after "Turn on alerts". |
| Member phone | Pop-ups through the gym server's push sender: plan request approved or declined, the gym asked for the workout report, shop order ready or cancelled by the gym (migration 0054), and "The MettleUp team replied" for help questions | Whenever the phone saved a push address with its gym. |

## Not built: alerts with the page closed (staff phones and the owner)

Both the admin panel and HQ are web pages. To ring a phone when the page is closed, the browser's
Web Push is needed:

1. **Keys.** One VAPID key pair (made once, free). The public key goes in the page; the private key is a
   Worker secret (`VAPID_PRIVATE_KEY`) on the HQ Worker.
2. **Subscribe.** "Turn on alerts" also calls `serviceWorker.pushManager.subscribe(...)` and posts the
   subscription (endpoint + two keys) to the server:
   - admin panel: a new gym-server table `staff_push_subs (gym_id, person_id, endpoint, p256dh, auth, made_at)`
     through an owner-key function (a new Supabase migration, additive);
   - HQ: a D1 table `hq_push_subs` behind the HQ login.
3. **Send.** The HQ Worker's minute Cron (deploy/hq/push.js already runs every minute) reads what is new
   (pending plan requests, check-in numbers, new orders per gym; new leads, help questions for HQ) and
   sends a Web Push to each subscription. Web Push needs the message encrypted (RFC 8291, aes128gcm) and
   signed (VAPID JWT, ES256) — both work with Web Crypto inside a Worker, about 150 lines, no library.
   Dead subscriptions (404/410) are deleted.
4. **Show.** The service workers (apps/dashboard/public/sw.js, apps/hq/public/sw.js) get a `push`
   handler (`showNotification`) and a `notificationclick` handler that opens Today or HQ's Needs you.
5. **iPhone.** Web Push works on iPhone only when the page is added to the Home Screen (iOS 16.4+).
   The "Install the admin app" card already asks for that; the alerts line must say so.

**Size:** about 2 days with tests (migration + 2 D1 tables + sender + 2 service workers + UI).
**Cost:** nothing (Web Push is free; no new service).
**Why not now:** it touches the live gym database (a new migration to apply), two Workers to deploy and
the service workers every staff phone caches; it needs the owner's yes for the live steps. The in-page
alerts cover the desk, which keeps the panel open all day.

## Checks for what was built

- Admin panel, Today, with a gym that has a pending plan request (0044) or check-in number (0048): the
  card lists it, the Today menu item has the number, the tab title starts "(1)". "Turn on alerts", allow;
  make a new request from the app; within a minute the sound and pop-up come.
- HQ, Needs you: a member question the AI could not answer shows "Needs reply"; type a reply, Send reply;
  the member's Help and feedback shows "Reply from the MettleUp team" with "New" (needs the panel D1
  migration 0009 applied, and HQ + panel Workers deployed).
- Member phone pop-ups: need migration 0054 applied on the gym server (owner's yes), then the HQ Worker
  deployed.
