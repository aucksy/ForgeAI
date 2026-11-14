-- NOT APPLIED - needs the owner's yes ("No LIVE database changes without my yes"). Cloudflare D1 `forgeai-web` (our
-- web server's own small database), NOT the gym server. Re-runnable: IF NOT EXISTS only.
-- Apply with: npx wrangler d1 execute forgeai-web --remote --file migrations/0016_pay_switches.sql   (from deploy/panel)
--
-- R-528 (14 Nov 2026): pay online on the join page and the gym's web page, with the owner's two switches. ADDITIVE only:
-- two new tables. Until this is applied:
--   - the join page and the gym page say "Pay at the desk" (joinPay.js: no switches table = online pay is not offered);
--   - the member app takes payments as before (the app switch reads as ON);
--   - Settings -> Payments shows both switches greyed, "Not switched on yet".
--
-- No member names or phone numbers are kept here.

-- The owner's two switches, one row per gym (no row = both ON, the default once a payment account is set up).
CREATE TABLE IF NOT EXISTS pay_switches (
  gym_id     TEXT PRIMARY KEY,
  app_on     INTEGER NOT NULL DEFAULT 1,  -- 1 = "Take payments in the member app"
  web_on     INTEGER NOT NULL DEFAULT 1,  -- 1 = "Take payments on your web page and join link"
  updated_at TEXT NOT NULL
);

-- A person who joined online and paid by the gym's plain UPI ID tapped "I have paid". Nobody confirms a plain UPI
-- payment by itself, so the desk sees "Check your bank before approving". One row per payment request (pay_requests.id).
CREATE TABLE IF NOT EXISTS pay_said (
  request_id TEXT PRIMARY KEY,
  at         TEXT NOT NULL
);
