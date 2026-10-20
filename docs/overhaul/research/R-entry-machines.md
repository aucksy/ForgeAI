# Entry machines (biometric attendance + door / turnstile) — research, 17 Oct 2026

Asked for by a client gym. **Planned only, not built** (owner: "don't build, just add to plan").
Belongs to CRM phase P8 (CRM-BUILD.md).

## What the gym wants
A machine at the entrance that lets in paid members and refuses expired ones, with every entry
showing in the admin app's Visits (as the QR self check-in does today).

## Recommended brand: Matrix COSEC (Indian, Vadodara)
Read from Matrix's own "COSEC Devices PUSH API User Guide" (v1, 11 Jul 2019,
https://matrixcomsec.com/wp-content/uploads/2023/08/COSEC_DEVICES_PUSH_API_GUIDE.pdf):

- The device calls OUR server (Settings > Basic Profile > Server Connection > "Third Party
  Server"; URL, port, user, password, encryption). No PC or port forwarding at the gym.
- Flow: `login` -> `poll` every 5-60 s -> `getcmd` / `updatecmd` and `getconfig` / `updateconfig`
  when we have work -> `setevent` for every punch. Device is identified by type + serial (MAC).
- Member record (config-id 10): `user-id`, `name`, `user-active` 0/1, `validity-enable` +
  `validity-date-dd/mm/yyyy`, `user-pin`, `card1/2`. With the end date on the device, an expired
  member is refused **by the device itself, even offline**.
- Commands: enroll credential (face / finger / card / palm), set / get / delete credentials,
  delete user, user photo, open / lock / unlock / normalize door, user count, reboot.
- Events with reasons: 101 User Allowed, 151 Invalid, 157 Disabled user, 158 Blocked user,
  164 Validity date expired (and more in the guide's appendix).
- No licence fee mentioned. Supported: COSEC Door V3, PVR Door, Vega, ARC DC 200, Door FMX, ARGO.

To confirm before building: the exact model (e.g. ARGO FACE200T) has "Third Party Server" mode on
current firmware; get Matrix's latest PUSH API guide; buy ONE device for development (an emulator
cannot stand in).

Fallback brand: ZKTeco / eSSL "ADMS push" (devices push to an `/iclock/...` endpoint). Cheaper,
open, widely used, but less documented for expiry; eSSL's PC software has no public API.

## Three packages (one integration for all: the Matrix reader drives the gate's relay)
Online asking prices outside Jaipur, before GST and fitting; get Jaipur quotes.

| | Budget: smart door | Middle: tripod turnstile | Premium: flap barrier |
|---|---|---|---|
| Parts | ARGO FACE200T ~Rs 17.5-31k + magnetic lock kit ~Rs 1.5-3k | same reader + tripod turnstile ~Rs 50k-1.25L | same reader + flap barrier ~Rs 2.25L+/lane (cheapest listings ~45k) + fitting 10-60k |
| Rough total | Rs 25-40k | Rs 0.8-1.6L | Rs 2.5-4L+ |
| Stops tailgating | No | Mostly | Yes |

Fingerprint alternative: ARGO FOE212 ~Rs 19-28k.

## Jaipur sellers found (not verified as authorised)
Matrix: Axel Networks, DNR Enterprises, Sarthi Systems (IndiaMART). eSSL: Starmesh Telematics
(Godam Industrial Area, 89493-80006), IDS Technology (Panchyawala). ZKTeco: Sarthi Systems
(Radha Vihar, 76655-66663), Lunik IT. No brand has its own Jaipur office; eSSL's Rajasthan sales
contact is on esslsecurity.com/contactus.

## Build outline (when approved)
1. Server endpoints for the device (login, poll, getcmd/updatecmd, getconfig/updateconfig,
   setevent), one gym per device serial; additive migration only.
2. Sell / renew / freeze / cancel in the admin app -> member's `user-active` and validity date
   queued for the gym's devices.
3. Enroll face from the member page; `setevent` -> a visit tagged "Machine" (like "App").
4. Admin app: device list (online / last seen), refused entries with the reason.

## Update 20 Oct 2026: the client gym already has a Realtime machine (OWNER-INBOX #40)
Realtime Biometrics India Pvt Ltd (Delhi, est. 2008). Read from realtimebiometrics.com (sitemap and pages):
- Sells locks and parts: EM lock 600 lbs single leaf, strike lock, RIM lock with RFID remote, drop bolt,
  push / no-touch exit buttons, a multi-door access control solution, and a "T4D access control manager".
  Dealers (e.g. realtimebiometric.in, a dealer site, not Realtime itself) list Realtime A306 tripod and
  EL128 flap barriers.
- Integration offered: (1) cloud API, "Realtime Biometrics API" / "API Realtime": punches stream from
  their cloud; API keys + ERP login at https://apirealtime.com/ErpLogin.aspx, from Realtime support;
  (2) "Biometrics SDK PHP with Mongo": device access from PHP, i.e. most likely on the LAN, so a PC stays
  on at the gym. Avoid it. (3) StaffKhata (their cloud HRMS). There is also a "GYM Realtime" software
  page, with no details.
- A third-party C# server for RS9 / RS10 / RS20 / C121ta / T52 / T60 has the device connect to a web
  server over WebSocket (nikeshniraula.medium.com; github.com/zaagan/realtime-c121ta-server-app).
  So some models push to a server we run, with no gym PC needed.
- A TechJockey review (RS-10, small gym) says the built-in access control blocks lapsed members.
**Unknown, must confirm with Realtime / the dealer:** the client's exact model; whether it pushes to our
own server URL; whether the cloud API can WRITE (add / block a user, set a validity date, open the
door) or only read punches; the API cost. If writes work, reuse the gym's device (saves the Matrix
purchase); otherwise Matrix COSEC stays the pick.

## Update 20 Oct 2026 (2): the client's machine is an RS20, and he wants it to work OFFLINE (R-34)
From the owner's photo of the back: **RS20**, serial RSS 103 005 7249, 12 V DC. Rear pins: RS485 A/B,
WG_IN0/1 (Wiegand in), **NC / COM / NO (lock relay), PUSH (exit button)**, GND, POW.
- **Offline door works by itself:** the relay pins mean an EM lock (+ 12 V lock power supply + exit
  button) wires straight to the RS20. The machine matches the finger itself (listings: 3,000
  fingers, 100,000 logs, "Working mode: Offline/Online", TCP/IP + USB, Wi-Fi on some variants), so
  members get in with no PC and no internet.
- **The gap is blocking expired members offline.** The machine only knows "enrolled or not" unless
  it has a per-user end date (not confirmed for the RS20). Without one, someone has to delete or
  disable the member on the machine. Our software can do that only over the gym's LAN with Realtime's
  SDK.
- **The SDK we saw:** the third-party server github.com/zaagan/realtime-c121ta-server-app uses
  Realtime's Windows ActiveX `FPCLOCK_Svr` (Interop.FPCLOCK_SVRLib.dll): `OpenNetwork(port)` listens
  and the device pushes logs (`OnReceiveGLogData` gives device IP / port). Windows only, logs only in
  that sample. Realtime also lists a PHP SDK (with MongoDB) and a "Data Transfer Utility" (a desktop
  app that copies punches into MSSQL / MySQL / PostgreSQL / MongoDB / Oracle).
- **Likely local design (to confirm):** a small always-on box at the gym (an old Windows laptop or a
  mini PC) runs a "gym bridge". It pulls member changes from our server when online and writes them
  to the RS20 over the LAN (add, delete or disable, end date). It reads entries back into Visits.
  If the internet is down, the door keeps working with the last list; changes catch up later.
- Contact: support@realtimebiometrics.com, phones 88608 86086 / 91886 08860 (from their site).
  **Email sent 20 Oct** from the owner's Gmail (thread 1a1580b122586d86) asking: lock + wiring
  straight to the RS20; offline opening; per-user end date / disable; LAN SDK (add / delete / end
  date / live logs / open door, which OS, documents, fee); firmware or newer model; push to our
  own server URL.

**Update 20 Oct (3):** Realtime's PHP + MongoDB kit was read: see `R-realtime-sdk.md` (the machine
polls an HTTP gateway; per-member enable / disable + From / To dates; OPEN_DOOR). Realtime replied asking
for a phone number; answered by email (written answers please; the owner will call).
