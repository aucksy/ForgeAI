# Realtime machine SDK (PHP + MongoDB gateway): what it shows, for the entry-machine build

Read 20 Oct 2026 for OWNER-INBOX #40 / CLAUDE-NOTES R-34, R-35. Source: Realtime's free download
"Biometrics SDK PHP with Mongo" (https://realtimebiometrics.com/software/biometrics-sdk-php-with-mongo,
Google Drive file 1IBA2D7CE0m2JmX0X9WUkV8tKgLCCR56b, zip 799 KB). The zip itself is NOT committed:
it ships a 1.9 MB request.log, BSON dumps and enrolment photos from Realtime's own test devices
(personal / biometric data). Re-download it when building. Nothing in it was run; it was only read.

## The big finding: the machine calls the server, not the other way round
The gateway is a plain PHP web app (`index.php`). The **machine** sends HTTP POSTs to it and asks for
work. Nothing at the gym has to reach into the machine. The setup guide puts the PC and the machine on
the same Wi-Fi, then sets the gateway address in the machine's network or server settings ("Machine
server URL / configuration" in the troubleshooting list).
- Every request: `POST /index.php`. Headers: `request_code`, `dev_id` (device serial, e.g.
  `RSS202510127023`), `trans_id`, `cmd_return_code`. The raw body is the payload.
- `request_code` values:
  - `receive_cmd`: the machine polls for its next command; the gateway answers with the oldest
    pending one for that `dev_id` (first in, first out).
  - `send_cmd_result`: the machine reports `ok` or an error for a `trans_id`; the command goes
    pending → running → done / error.
  - `realtime_glog`: a punch, sent the moment it happens (user_id, dev_id, io_mode, io_time).
  - `realtime_enroll_data`: enrolment data (a binary template or photo).
- Errors the machine has returned: `error_invalid_param`, `error_not_supported`.
- An HTTP 200 alone does not prove the machine applied a command: wait for `send_cmd_result`.

## Commands seen in the kit (`cmd_code`, with `cmd_param`)
| Command | cmd_param | Use for us |
|---|---|---|
| `SET_USER_PROFILE` | JSON `{user_id, user_name, user_privilege: user/manager/administrator, user_depart_id, user_enabled: "1"/"0", User_Date_Range: "Use"/"Not Use", From_Date, To_Date}` | **Block / unblock a member and set their membership dates on the machine** |
| `SET_USER_VALIDITY` | JSON `{dev_id, user_id, validity_range, validity_from, validity_upto}` | Older way: returned `error_not_supported` on their test firmware. Don't use it. |
| `SET_USER_INFO` | full user block, stored as HEX and sent as raw bytes; carries `user_enabled` | Copy a member's fingerprint to another machine; the "proven" enable/disable path |
| `GET_USER_ID_LIST` / `GET_USER_INFO` | none / `{"user_id": "..."}` | Read who is enrolled on the machine |
| `GET_LOG_DATA` | `{"begin_time": "yyyyMMddHHmmss", "end_time": "..."}` | Catch up on entries made while offline |
| `OPEN_DOOR` | `{"set_Door_comm": "1"}` | "Open the door" button in the admin app |
| `SET_TIME` | `yyyyMMddHHmmss` | Keep the machine clock right (end dates depend on it) |
| `ENROLL_USER_PHOTO` | binary (HEX) | Face models only |

Their own notes: "Do not invent machine commands"; protocol details are "device/firmware specific";
test machine: Realtime Pro 304F+, firmware M61BHv3.16.1118, native TCP port 5005, gateway HTTP
port 8000.

## What this means for ForgeAI (design to confirm on the real RS20)
1. **Offline door:** the machine keeps users, fingerprints, `user_enabled` and the From / To dates
   itself, and drives the lock relay (NC / COM / NO, PUSH exit button on the RS20). If the internet
   or our server is down, members still get in until their To_Date, and expired members are refused
   (if the firmware enforces the dates; to confirm).
2. **No gym PC may be needed:** since the machine calls out over HTTP, the "gateway" can be our own
   server endpoint on the internet. Each sell / renew / freeze / cancel in the admin app queues a
   `SET_USER_PROFILE` for that member, the machine picks it up on its next `receive_cmd`, and every
   `realtime_glog` becomes a Visit tagged "Machine". To confirm: the machine accepts a domain name
   (not just an IP), and whether it can use HTTPS. If it only does plain HTTP to an IP, we put a
   small relay in front of our server, or use a mini PC or old laptop at the gym as the gateway.
3. **Member mapping:** the machine's `user_id` is our member's machine number (like GGMS's enroll
   number). Fingerprints are enrolled at the machine as today; we store only the number, never the
   template.
4. **Server side (additive migration only):** `gym_devices` (gym, dev_id, last_seen), a command queue
   (dev_id, trans_id, cmd_code, cmd_param, status, result), and punches → visits. Security: the device
   sends no secret (only `dev_id`), so accept only known `dev_id`s per gym, rate-limit, and never put
   anything sensitive in a reply. The kit's own admin page has no login, so never copy it as is.

## Still unknown (ask Realtime / try on the machine)
- Does the **RS20** (serial RSS 103 005 7249, older serial format than the kit's `RSS2025…`) run this
  HTTP "server" protocol, or only the older Windows-SDK protocol (FPCLOCK_Svr, TCP)? Where is the
  server IP / port setting in the RS20 menu? Is a firmware update needed?
- Does `SET_USER_PROFILE` with `User_Date_Range: "Use"` make the machine refuse after `To_Date` by
  itself?
- Domain / HTTPS support; any licence fee; the lock model, wiring and price.
Owner check that needs no one: on the RS20, open Menu → Comm / Network and look for a "Server",
"Cloud" or "Push" setting with an IP or URL field. If there is one, it can talk to us directly.
