# Sign-in codes by WhatsApp: set-up

**What it does.** A gym owner or desk person who forgot their PIN taps "Forgot your PIN? Get a code on
WhatsApp" on the sign-in screen, gets a 6-digit code on WhatsApp from MettleUp's number
(+91 86905 60741), types it, and picks a new PIN. A new gym owner gets the same kind of code at "Set up a
new gym", which proves the number is real, so one number gets one free trial.

**Today it is switched off.** The screens look exactly as before until the steps below are done.

## Your 3 steps (about 10 minutes)

1. **Make a "system user"** (a robot account that can send messages for MettleUp).
   In Meta Business Settings (business.facebook.com/settings) for "Aakash Pahuja's Business":
   Users -> System users -> Add -> name it `mettleup-sender`, role **Admin**.
   Then "Assign assets": give it the app **MettleUp** (full control) and the WhatsApp account
   **MettleUp** (full control).
2. **Make a permanent token** for that system user: "Generate new token" -> app **MettleUp** ->
   expiry **Never** -> tick the two permissions **whatsapp_business_messaging** and
   **whatsapp_business_management** -> Generate. Copy the token (it is shown once).
3. **Put two secrets in GitHub** (github.com/aucksy/ForgeAI -> Settings -> Secrets and variables ->
   Actions -> New repository secret):
   - `WHATSAPP_TOKEN` = the token from step 2
   - `WHATSAPP_PIN` = any 6 digits you choose (it protects the number; keep it somewhere safe)

Also still open on Meta's side (from 6 Nov): "Business info missing" on the WhatsApp payment
settings (legal name, address, business purpose). Messages cannot be paid for until it is filled in.

Then **tell Claude**: "WhatsApp secrets are in".

## What Claude does after that

1. Runs the GitHub workflow **WhatsApp set-up** (Actions tab): it registers the number with WhatsApp,
   prints the number's and the `login_code` template's status, and puts the token into the MettleUp
   Worker. The token and PIN are never printed.
   If Cloudflare refuses (the stored Cloudflare token is read-only), Claude makes a Cloudflare token
   with "Workers Scripts: Edit" in your Cloudflare account, or puts the secret in directly.
2. Makes a random code secret and puts the SAME value in two places: the Worker secret
   `PHONE_CODE_SECRET`, and the gym server row `phone_code_settings` (after your yes to apply
   migration 0061).
3. With your yes: applies the gym server change `supabase/migrations/0061_phone_codes.sql` and the
   Worker's table `deploy/panel/migrations/0012_phone_codes.sql`, then deploys the admin app and Worker.
4. Tests it with one real code to your phone, then switches on the new-gym check
   (`signup_check_required = true`) once a sign-up works end to end.

## Money limits (on the server, cannot be skipped by the app)

- One number: at most 1 code a minute, 3 an hour, 5 a day.
- One internet address: at most 10 codes an hour.
- Everyone together: at most 200 codes a day (`PHONE_CODE_DAILY_CAP` in deploy/panel/wrangler.jsonc).
  When reached, sending stops until midnight India time, the screens hide the WhatsApp option, and
  the Worker log says "DAILY CAP REACHED".
- Only Indian mobile numbers (+91, 10 digits, starting 6 to 9).
- Forgot PIN sends only to numbers that belong to an owner or desk person. Everyone sees the same
  answer ("If this number has an account, a code is on its way"), so nobody can find out who has an
  account.

## Switches

- Off at once: Worker var `PHONE_CODES` = `off` (deploy/panel/wrangler.jsonc), then deploy.
- Daily cap: `PHONE_CODE_DAILY_CAP`.
- New-gym check required or not: `update phone_code_settings set signup_check_required = true|false;`
  (gym server SQL editor). Note: while it is on, the cloud phone tests that make gyms without a code
  get "PHONE_CHECK".

## "Verify with WhatsApp" (8 Nov 2026): the person sends US the code

Meta blocks every message we send (131042), but messages people send to us are free and still arrive. So the
panel can ask the person to send "MettleUp code 123456" to our business number instead (deploy/panel/phoneInbound.js,
apps/dashboard/src/crm/auth/WhatsAppVerify.tsx). It gives the same proof as before; the gym server needs no change.
LIVE since 8 Nov 2026 (owner yes, R-405). How it was switched on (all live steps, in this order):

1. D1: `npx wrangler d1 execute forgeai-web --remote --file migrations/0013_phone_inbound.sql` (from deploy/panel).
2. Secret `WHATSAPP_APP_SECRET` (Meta app -> App settings -> Basic -> App secret): `npx wrangler secret put
   WHATSAPP_APP_SECRET`. Required: without Meta's signature anybody could post a fake "message from your number".
   `PHONE_CODE_SECRET` must exist too (it does if the old way was set up).
3. Meta app -> WhatsApp -> Configuration -> Webhook fields: subscribe to `messages` (the callback is already
   https://app.mettleup.fit/api/whatsapp/hook).
4. wrangler.jsonc var `WHATSAPP_INBOUND_NUMBER` = the business number people send to (digits, 91 + 10 digits), then
   deploy the panel Worker. `/api/phone-code/status` then answers `{available: true, mode: "inbound"}`.
Off again: empty `WHATSAPP_INBOUND_NUMBER` (the old "we send a code" way comes back if its token works), or
`PHONE_CODES` = `off` for both.
