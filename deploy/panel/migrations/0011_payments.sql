-- APPLIED LIVE 5 Nov 2026 (owner's yes, R-331) with `wrangler d1 execute --file` (not via `migrations apply`, because 0009 has no yes yet; re-runnable: IF NOT EXISTS only).
-- (was not applied) - needs the owner's yes. Cloudflare D1 `forgeai-web` (our web server's own small
-- database), NOT the gym server.
-- Apply with: npx wrangler d1 migrations apply forgeai-web --remote   (from deploy/panel)
--
-- F79 online payments (R-328, 4 Nov 2026). ADDITIVE only: three new tables. Until this is applied the
-- Worker answers "not switched on yet" to every /api/pay call (pay.js), and both apps hide the online
-- parts (the desk's UPI QR needs none of this and works at once).
--
-- Money never passes through MettleUp: a gym connects ITS OWN payment-company account; we keep that
-- account's keys sealed (AES-GCM, Worker secret PAYMENTS_MASTER_KEY) and ask the company "make a link"
-- and "was it paid". No member names or phone numbers are kept here: a request holds the gym's own
-- member id, an amount and a short label.

-- One row per gym and company. `creds` is sealed JSON (keys, or OAuth tokens); never sent to an app.
CREATE TABLE IF NOT EXISTS pay_connections (
  gym_id       TEXT NOT NULL,
  provider     TEXT NOT NULL,              -- razorpay | cashfree | payu | phonepe
  mode         TEXT NOT NULL DEFAULT 'test', -- test (sandbox, no real money) | live
  via          TEXT NOT NULL DEFAULT 'keys', -- keys (pasted) | oauth ("Connect Razorpay")
  creds        TEXT NOT NULL,              -- sealed: payCrypto.seal
  hint         TEXT NOT NULL DEFAULT '',   -- last 4 characters of the key id, for the screen
  account      TEXT NOT NULL DEFAULT '',   -- the company's account id (OAuth), to find the gym from a webhook
  hook         TEXT NOT NULL,              -- random id in this gym's webhook address
  status       TEXT NOT NULL DEFAULT 'on', -- on | off
  off_reason   TEXT NOT NULL DEFAULT '',   -- '' | disconnected | revoked | bad_keys
  connected_at TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  PRIMARY KEY (gym_id, provider)
);
CREATE UNIQUE INDEX IF NOT EXISTS pay_connections_hook ON pay_connections (hook);
CREATE INDEX IF NOT EXISTS pay_connections_account ON pay_connections (provider, account);

-- One row per "please pay" the desk (or a member, for a shop order) made.
CREATE TABLE IF NOT EXISTS pay_requests (
  id          TEXT PRIMARY KEY,            -- pr_..., the reference the company sees
  gym_id      TEXT NOT NULL,
  kind        TEXT NOT NULL,               -- fee (a membership's dues) | shop (an app shop order)
  member_id   TEXT NOT NULL DEFAULT '',    -- fee: the gym's own member id
  app_member  TEXT NOT NULL DEFAULT '',    -- shop: the app member who ordered
  ref         TEXT NOT NULL DEFAULT '',    -- fee: membership id | shop: order id
  amount_p    INTEGER NOT NULL,            -- paise
  label       TEXT NOT NULL DEFAULT '',    -- "Monthly plan" | "Order 12"
  note        TEXT NOT NULL DEFAULT '',    -- receipt number or order number the payer sees
  upi         TEXT NOT NULL DEFAULT '',    -- the gym's UPI ID (for the QR), '' = none
  payee       TEXT NOT NULL DEFAULT '',    -- the gym's name for the UPI app
  provider    TEXT NOT NULL DEFAULT '',    -- '' = UPI only (the desk taps Paid)
  mode        TEXT NOT NULL DEFAULT '',    -- test | live, copied from the connection
  link_id     TEXT NOT NULL DEFAULT '',
  link_url    TEXT NOT NULL DEFAULT '',
  link_n      INTEGER NOT NULL DEFAULT 1,  -- a remade link (PhonePe's last an hour) is pr_x-2, pr_x-3...
  status      TEXT NOT NULL DEFAULT 'open', -- open | paid | cancelled | expired
  failed_at   TEXT NOT NULL DEFAULT '',    -- last failed try (the member can try again)
  payment_id  TEXT NOT NULL DEFAULT '',    -- the company's payment id once paid
  paid_p      INTEGER NOT NULL DEFAULT 0,
  method      TEXT NOT NULL DEFAULT '',    -- upi | card | bank | other
  paid_at     TEXT NOT NULL DEFAULT '',
  late        INTEGER NOT NULL DEFAULT 0,  -- 1 = paid after the link was cancelled or ran out
  claim       TEXT NOT NULL DEFAULT '',    -- the desk making the receipt now (a 5-minute hold)
  claim_until TEXT NOT NULL DEFAULT '',
  receipt_no  TEXT NOT NULL DEFAULT '',
  recorded_at TEXT NOT NULL DEFAULT '',    -- the receipt is in the gym's records
  checked_at  TEXT NOT NULL DEFAULT '',    -- last time we asked the company
  created_at  TEXT NOT NULL,
  expires_at  TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS pay_requests_gym ON pay_requests (gym_id, status, created_at);
CREATE INDEX IF NOT EXISTS pay_requests_link ON pay_requests (provider, link_id);
CREATE INDEX IF NOT EXISTS pay_requests_member ON pay_requests (gym_id, member_id, status);
CREATE INDEX IF NOT EXISTS pay_requests_open ON pay_requests (status, provider, checked_at);

-- The gym's UPI ID and name, copied here by the admin app (it lives in the gym's own records), so a
-- member's app can show the gym's UPI QR for a shop order.
CREATE TABLE IF NOT EXISTS pay_gyms (
  gym_id     TEXT PRIMARY KEY,
  upi        TEXT NOT NULL DEFAULT '',
  payee      TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);

-- One row per company payment id: what makes "paid" happen once, however many times it is reported
-- (the desk's check, the scheduled check and the webhook can all see the same payment).
CREATE TABLE IF NOT EXISTS pay_events (
  provider   TEXT NOT NULL,
  payment_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  at         TEXT NOT NULL,
  PRIMARY KEY (provider, payment_id)
);
