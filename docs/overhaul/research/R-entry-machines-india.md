# Entry machines Indian gyms already own: one ready-made link for MettleUp. Research, 6 Nov 2026

Builds on `R-entry-machines.md` (Matrix COSEC PUSH, ZKTeco/eSSL ADMS, the client's Realtime RS20),
`R-realtime-sdk.md` and `R-face-camera.md`. Reading and web search only: nothing bought, installed or contacted.
"(guess)" marks my own judgement. Numbers in [brackets] point to Sources at the end.

## Summary for the product manager

- Most small Indian gyms have one of three kinds of machine: **eSSL** or **ZKTeco** (these two work the same way), **Realtime**, or **Matrix COSEC**. Hikvision is now cheap and showing up more often. Everything else is a long tail.
- The question for each machine is simple: **can it call our server over the internet by itself?** If it can, the gym needs no PC. The owner types our web address into the machine once, and it's done.
- **eSSL / ZKTeco ("ADMS" setting):** yes, on most models sold in the last few years. There's plenty of free sample code, so we can build and test this without buying anything. It's the biggest group. **Build it first.**
- **Realtime:** newer models also call a web address (we read their kit in October). It can block a member by date. **Build it second.** We need the client's RS20 to prove it.
- **Matrix COSEC:** calls our server and is the best documented. The machine itself refuses expired members, even with the internet down. Gym software like Okfit already treats Matrix as its "fully supported" brand. **Build it third**, and recommend it to gyms that want a proper door.
- **Hikvision:** cheap (~Rs 5,000 face machines), but it only sends us entries. Adding or blocking members from the cloud needs a closed, partner-only protocol. Later, if at all.
- **Coverage (guess):** the first two drivers cover about 65-75% of gym machines. Add Matrix and it's about 75-85%.
- **Machines that can't call out** (old models): the fallback is an old Android phone or a ~Rs 3-4k mini box at the desk that copies data between the machine and us. Or tell the gym to buy a supported machine. An eSSL X990 costs about Rs 6,500-11,000.
- **Expiry on the machine itself:** Matrix and Realtime can store an end date. Plain eSSL/ZKTeco attendance models probably can't (to confirm), so for them we delete the member from the machine the moment the plan lapses.

## Brand table

| Brand | Protocol family | Pushes to our cloud, no PC? | Can hold an expiry date on the device? | Source |
|---|---|---|---|---|
| ZKTeco | ZK ADMS push (`/iclock`) | Yes, models with "ADMS" / "Cloud Server Setting" | AC (access-control) firmware: yes, start/end on the user (to confirm in spec). T&A firmware: no, so delete or disable instead (guess) | [1][2][3] |
| eSSL | Same as ZKTeco (ADMS) | Yes: X990, MB160, K990, uFace 302, iFace 102, AiFace Mars/Magnum/Neptune listed as ADMS | Same as ZKTeco | [4][5][6] |
| Identix (eSSL range, e.g. K21 Pro) | ADMS (guess) | Listing says "Push Data Support" | Probably no (guess) | [7] |
| Biomax / BioMax | Mostly ZK-style (guess), model by model | Unknown; older models supported by CAMS' relay | Unknown | [8][9] |
| Realtime (RS10/RS20/T502, Pro 304F+) | Realtime HTTP push (`request_code` gateway) | Yes on newer firmware; older ones use a Windows SDK | Yes: `SET_USER_PROFILE` From/To date + enable/disable | R-realtime-sdk.md, [10] |
| Matrix COSEC (ARGO, Door V3, Vega, PVR) | COSEC PUSH API | Yes ("Third Party Server") | Yes: `validity-date`; device refuses offline | R-entry-machines.md |
| Hikvision (DS-K1T3xx MinMoe / Value) | ISAPI (LAN) + HTTP listening (events out) + ISUP/EHome (cloud, closed) | Entries only (HTTP listening). Full control only via ISUP or Hik-Partner Pro | Yes over ISAPI (`Valid.beginTime/endTime`), but ISAPI needs LAN reach | [11][12][13][14] |
| CP Plus | Unknown (guess: Hikvision- or ZK-like OEM, varies) | Unknown | Unknown | none found |
| Suprema (BioStation, FaceStation) | BioStar 2 server API | Needs a BioStar 2 server (PC or cloud VM), not the device directly | Yes: `start_datetime` / `expiry_datetime` | [15] |
| Anviz | CrossChex Cloud | Via Anviz's cloud: punches by webhook or pull API, enabled by Anviz staff | Unknown via API | [16][17] |
| Mantra | Own cloud (MINOP / Pravesh) | No public device API found | Unknown | [18] |
| Secureye, Timewatch, Godrej, Honeywell | Unknown; no public protocol found | Unknown | Unknown | [19] |
| CAMS (Chennai, sells a "GymBio34") | CAMS Web API (their cloud) | Yes, to CAMS; they relay to you (paid) | Unknown | [9][20] |

## 1. Which brands Indian gyms use

There are no market-share figures for gyms. The best evidence is which brands Indian gym-software vendors chose to support:

- **Easy Gym Software:** "ZKTeco, eSSL and leading biometric devices" [21].
- **VIOFIT / Torzil** listings: ZKTeco, eSSL, BioMax [22].
- **Okfit:** Matrix is "fully integrated" (no manual entry, shows the member photo). eSSL is "partially integrated", X990 only, with manual entry and a time lag [6][23].
- **FitnessForce:** its help desk documents only eSSL X990 and eSSL iClock [24].
- **GymSmart** (Capterra): integrations list "RealTime" and "eSSL" [25].
- **CAMS** sells a gym access box (GymBio34) and says its relay covers ZKTeco, eSSL, Suprema, Hikvision, Anviz, BioMax [9][20].
- I found no device list for GGMS, Gymshim or WellnessLiving India. GGMS only says "biometric integration" [26].

eSSL vs ZKTeco: no source states an OEM deal. But eSSL sells the same model names as ZKTeco (X990, MB160, K990, uFace, iFace, F22 sold as both "ESSL F-22" and "F22 ZKTeco") [27], and cloud services treat eSSL models as ZKTeco ADMS devices [4][5]. For our purposes they are one family (guess: eSSL rebadges ZKTeco hardware and firmware).

Rough share of machines in small Indian gyms (guess, from the vendor lists above, the many IndiaMART eSSL listings and the client's Realtime): eSSL + ZKTeco + Identix ~55-65%, Realtime ~10-15%, Matrix ~5-10%, Hikvision ~5-10% and growing, BioMax/Mantra/Secureye/others ~10-15%.

## 2. Protocol families

### A. ZKTeco / eSSL ADMS push ("iclock", PUSH SDK)
- **How it talks:** the machine calls us over HTTP. It starts with `GET /iclock/cdata` (handshake), sends punches as `POST /iclock/cdata?table=ATTLOG`, polls for work with `GET /iclock/getrequest`, and reports results to `POST /iclock/devicecmd` [2][3]. No gym PC is needed. The machine only needs internet [5].
- **Two firmware types:** ZKTeco's own note splits PUSH into **T&A (attendance) push** and **AC (access-control) push**, and the server must know which one it's talking to. T&A push covers the iClock, K, MB, uFace, X series and SpeedFace-V5. AC push covers inBio/C3 Pro, ProFace X, SpeedFace-V5, F18-S, F19-S and new F21 [1].
- **Spec and code:** ZKTeco's PUSH SDK documents are shared by dealers, not openly published [1][28]. Open-source servers exist in Go (s0x90/zkteco-adms, tested on SpeedFace-V5L and ZAM180) [3], .NET (BNet.ZKTecoADMS) [2] and several Laravel packages [29].
- **What it can do:**
  - Real-time punches: yes.
  - Add or remove a member: yes. Use `DATA UPDATE USERINFO PIN=…` and `DATA DELETE USERINFO PIN=…`. The older `USER ADD`/`USER DEL` were rejected by real devices (-1002), and -1004 means "not supported on this model" [3].
  - Open the door: yes (a door-unlock command is used by the Laravel package and Axxon's integration [29][30]).
  - Expiry held on the device: on AC firmware the user record has start/end times (from memory of the AC push spec, **to confirm**). On T&A firmware nothing found, so the server must delete or disable the member when the plan lapses (guess). The machine then lets that member in only while offline before the delete arrives.
  - Remote fingerprint/face enrolment: no source found. Assume members enrol at the machine (guess). Templates can be copied from one machine to another.
- **Limits:** many firmwares send to the root path `/iclock`, so a path prefix won't work and we need our own sub-domain [29]. Plain HTTP is common. HTTPS exists only on some firmware [28][31]. The device sends no secret, only its serial number, so we accept only serials a gym has registered.

### B. ZKTeco pull SDK (TCP 4370, "zkemkeeper")
LAN only: something at the gym has to connect to the machine. Fine for old machines, but only through a relay at the desk (section 5). Open-source: pyzk and its Rust port can read logs, add users and unlock the door [32].

### C. Realtime HTTP gateway
Covered in `R-realtime-sdk.md`. The machine POSTs to our URL with headers `request_code` (`receive_cmd`, `realtime_glog`, `send_cmd_result`) and `dev_id`. Commands are `SET_USER_PROFILE` (enable/disable + From/To dates), `GET_LOG_DATA`, `OPEN_DOOR` and `SET_TIME`. Older models use a Windows ActiveX SDK [10]. Realtime also has a cloud API at apirealtime.com: punches only, and whether it can write is unconfirmed (R-entry-machines.md). **Open:** whether the RS20 firmware has the server setting, and whether it accepts a domain name and HTTPS.

### D. Matrix COSEC PUSH API
Covered in `R-entry-machines.md`. The machine logs in to our server, polls, and posts each event. The member record has `user-active` and a validity date, so the device refuses expired members by itself even offline (event 164). We can trigger remote enrolment and open the door. Best spec of all the families. Matrix is also the brand a gym-software rival (Okfit) calls "fully integrated" [23].

### E. Hikvision
- **ISAPI (HTTP REST on the device):** full user control on the LAN. `POST /ISAPI/AccessControl/UserInfo/Record` with `Valid {enable, beginTime, endTime}`, plus delete and door control [12]. Our cloud can't reach it without a relay.
- **HTTP listening (event push):** the terminal POSTs each access event to a URL we set. Added to MinMoe firmware 3.2.30 [11][14]. One forum report says it resends forever when "Save Picture When Auth" is on [33]. **Entries in only.**
- **ISUP 5.0 / EHome (cloud):** the device registers with a cloud server (TCP 7660 for registration, 7332 for alarms) and needs an 8-32 character key [13][34]. The spec sits behind Hikvision's partner portal (TPP, NDA). The only kit is a C SDK, and no open-source server was found [35]. Hik-Partner Pro OpenAPI is the vendor-cloud route, also partner-only [36].
- **Verdict:** possible, but slow to get. Phase 1 can be "entries in via HTTP listening"; member sync needs a relay box or ISUP (guess).

### F. Suprema BioStar 2
REST API on a BioStar 2 server. Users carry `start_datetime` / `expiry_datetime` [15]. The server software must run somewhere (a PC, or a cloud VM with a VPN to the devices). Rare in small gyms (guess). Skip.

### G. Anviz CrossChex Cloud
Machines connect to Anviz's cloud. Third parties get punches by webhook or a pull API, but Anviz staff must turn developer mode on per account. Newer firmware removed manual cloud-URL entry [16][17]. Rare in India (guess). Skip.

### H. eSSL eTimeTrackLite
Its normal use is PC software reading machines on the LAN. There is a web edition (eTimetrackLite Web, v11.9) that receives device push on a server [37]. It's eSSL's own server, with no public API for us. Not needed: we take the same ADMS push directly.

## 3. Coverage math (guess)

- Driver A (eSSL/ZKTeco ADMS): ~55-65% of machines are in this family, and ~80% of those are push-capable models made in the last ~6 years (guess). That's about **45-50%** working with no extra box.
- Driver C (Realtime): ~10-15% of machines, and maybe half are push-capable. About **5-8%**.
- Driver D (Matrix): ~5-10%, nearly all push-capable. About **5-8%**.
- A + C + D with no box: **~55-65%**. Adding the desk relay (section 5) for old ZK/eSSL/Hikvision pull-only machines brings it to **~75-85%**.
- Hikvision events-only adds ~5% for "entries show up", without blocking expired members.

## 4. Testing without buying

- **ZK ADMS:** no public simulator was found [38]. But the protocol is plain HTTP text, and the open-source servers include curl examples of a device handshake and ATTLOG push [29]. We write our own fake device (a short script) that replays those requests, and test against the s0x90 Go library's behaviour notes [3]. Before launch, buy one cheap real unit: **eSSL X990, about Rs 6,500-11,000** [39], or an eSSL K21 Pro at ~Rs 4,600 if it really has ADMS (out of stock at the one listing) [7]. Buy an AC-firmware ZKTeco unit later if we want on-device expiry.
- **Realtime:** use the client's RS20 (R-realtime-sdk.md). Their PHP kit lets us replay requests from its sample `request.log`.
- **Matrix:** no simulator. Needs a real ARGO (~Rs 17.5-31k, R-entry-machines.md). Build only when a gym with Matrix signs up, or when we sell Matrix packages.
- **Hikvision:** a DS-K1T320MFWX costs about **Rs 4,750-5,300** [40]. It's the cheapest device here and good for testing HTTP-listening events.

## 5. The "little fiddling" per family

- **eSSL / ZKTeco:** Menu > COMM > ADMS (or "Cloud Server Setting"). Settings: Enable Domain Name ON, Server Address = our sub-domain, Server Port = 80 (or 8080), Enable Proxy Server OFF [6][5]. Some firmware only takes an IP address, so we'd need a fixed IP or a domain-capable model [41]. HTTPS: turn on only if the firmware offers it (port 443) [31]. Then the owner types the serial number from Menu > System Info into MettleUp. Cloudflare accepts plain HTTP on ports 80, 8080, 8880, 2052, 2082, 2086 and 2095 [42], so our Worker can answer devices that can't do HTTPS. That needs "Always Use HTTPS" off on that sub-domain only (guess, to test).
- **Realtime:** Menu > Comm/Network > server URL/IP + port (R-realtime-sdk.md; exact path on the RS20 to confirm).
- **Matrix:** Settings > Basic Profile > Server Connection > Third Party Server: URL, port, user, password (R-entry-machines.md).
- **Hikvision:** web page of the device > Network > Advanced > HTTP Listening (host IP/URL, port, path) (guess on the exact path) [11][14].
- **Can't push (old firmware, pull-only):**
  1. An **old Android phone at the desk** on the gym Wi-Fi, running a MettleUp "bridge" app. It talks to the machine on port 4370 (ZK) or ISAPI (Hikvision), and to our cloud over the internet. Free if the gym has a spare phone, but it must stay plugged in and on Wi-Fi (guess).
  2. A **Raspberry-Pi-class mini box** (~Rs 3-6k with case and power supply, guess) running the same bridge. Steadier than a phone.
  3. A **firmware update** from the dealer to add ADMS (sometimes possible on eSSL/ZK, guess).
  4. Or **swap the machine** for a supported one (section 6).

## 6. Recommended design

**One "entry machine" interface in MettleUp:**
- **Events in:** `entry(device, member_no, time, allowed/refused, reason)` becomes a Visit tagged "Machine". `device_seen(device, time)` drives the online/offline display.
- **Member rules out:** `upsert_member(member_no, name, active, valid_from, valid_to)`, `remove_member(member_no)`, `open_door(device)`, `set_time(device)`, `fetch_missed_entries(device, from, to)`.
- **Per device:** a command queue (pending > sent > done/error, retried until confirmed), the gym it belongs to, its family, its serial, and a capability list (`can_hold_expiry`, `can_open_door`, `can_enroll_remotely`).
- **Business rule:** where the device can hold an end date, send it with every sale, renewal or freeze. Where it can't, a nightly job (plus one at the moment a plan lapses) sends `remove_member` or disable, and `upsert_member` again on renewal. Fingerprints stay on the machine, so removal on a T&A model may delete the template too. Check this; prefer "disable" if the firmware allows it (guess).
- **One driver per family**, each translating the interface into that machine's own language, behind one endpoint per family on its own sub-domain (ADMS needs the root `/iclock` path).

**Build order:**
1. ZK/eSSL ADMS (largest share, open code, a Rs 6-11k test unit).
2. Realtime (the client's gym, proven on the RS20).
3. Matrix COSEC (best for doors, sold as our premium package).
4. Hikvision events-only.
5. The desk bridge (Android) for pull-only machines.

**What to tell a gym whose machine isn't supported:**
- "Your machine can't talk to the internet by itself. Either keep an old phone plugged in at the desk with our bridge app, or swap the machine."
- Cheapest swap: **eSSL X990** (fingerprint + card, ADMS, ~Rs 6.5-11k) [39], or an eSSL AiFace Mars for face (~Rs 13-17k; ADMS on that model to confirm) [43].
- For a proper door that refuses expired members even with the internet down: **Matrix COSEC ARGO** (~Rs 17.5k+, R-entry-machines.md).

**Open items to confirm:**
- ZK AC-push user start/end fields, and whether T&A firmware has any per-user validity. This needs the official PUSH SDK PDF from a ZKTeco/eSSL dealer.
- RS20 server setting.
- Whether eSSL X990/K21 accept a domain name and port 80 via Cloudflare.
- The Hikvision ISUP partner terms.

## Sources
1. ZKTeco PUSH SDK introduction (Word doc, Tecnosinergia help centre): https://tecnosinergia.zendesk.com/hc/es/article_attachments/4418453804187
2. BNet.ZKTecoADMS (NuGet): https://www.nuget.org/packages/BNet.ZKTecoADMS
3. s0x90/zkteco-adms (Go): https://github.com/s0x90/zkteco-adms
4. ClockIt eSSL ADMS devices: https://get.clockit.io/essl and https://get.clockit.io/en/essl/mb160
5. ClockIt ADMS overview: https://get.clockit.io/features/biometric-time-clock-system/adms-biometric-time-clock-integration
6. Okfit, configure eSSL X990: https://okfit.tawk.help/article/how-to-configure-essl-x990
7. eSSL K21 Pro listing: https://fgtechstore.com/product/essl-k21-pro/
8. CAMS forum, ZKTeco push: https://forum.camsbiometrics.com/?p=256
9. CAMS Web API 3.0: https://www.camsbiometrics.com/application/biometric-web-api.html
10. Realtime SDK page: https://realtimebiometrics.com/software/biometrics-sdk-php-with-mongo ; github.com/zaagan/realtime-c121ta-server-app
11. Hikvision DS-K1T671 release notes v3.2.30: https://us-legacy.hikvision.com/en/system/files_force/manual/ds-k1t671_series_minmoe_terminal_release_notes_v3.2.30_build230330.pdf?download=1
12. Hikvision ISAPI best practices (UserInfo, Valid): https://github.com/uchkunr/hikvision-best-practices
13. Hikvision Configure ISUP: https://enpinfo.hikvision.com/hkwsen/unzip/20230410194813_20373_doc/GUID-486047D9-64D6-4E5E-B816-442AEFEFD8FD.html
14. hikvision-isapi Laravel (HTTP host): https://github.com/Shaykhnazar/hikvision-isapi
15. Suprema BioStar 2 user create/update: https://support.supremainc.com/en/support/solutions/articles/24000051373--biostar-2-api-three-important-information-about-user-creation-and-user-update-via-biostar-2-new-loc
16. Anviz community, sync to third party: https://community.anviz.com/t/how-to-synchronize-the-time-attendance-data-to-the-third-party-systems/491
17. Anviz community, CrossChex Cloud with Django: https://community.anviz.com/t/cross-chex-cloud-integration-django-python/892
18. Mantra attendance solutions: https://mantratec.com/Solutions/Attendance-Management-System
19. Secureye biometric page: https://www.secureye.com/products/biometric
20. CAMS GymBio34: https://camsbiometrics.com/product/cams-gym-access-control-face-fingerprint-gymbio34.html
21. Easy Gym Software: https://easygymsoftware.com/gym-management-software
22. VIOFIT (SourceForge): https://sourceforge.net/software/product/VIOFIT/ ; Torzil: https://www.capterra.in/software/1239230/Torzil-Gym-Fitness-Studio-Management-Software
23. Okfit biometric page: https://okfit.in/biometric-gym-management-software
24. FitnessForce eSSL install: https://fitnessforce.freshdesk.com/support/solutions/articles/13000076627-bio-metric-essl-installation
25. GymSmart (Capterra): https://www.capterra.in/software/1240388/GymSmart
26. GGMS (SoftwareSuggest): https://www.softwaresuggest.com/ggms-gym-management
27. Tech Mart India (eSSL F-22 / ZKTeco F22): https://m.indiamart.com/techmartindia/standalone-device-and-reader.html
28. ZKTeco PUSH SDK general introduction PDF: https://cdn.tvc.mx/media/92189/General-Introduction-of-PUSH-SDK-Protocol.pdf
29. Laravel ADMS packages: https://packagist.org/packages/dewanlab/laravel-zkteco-adms-core ; https://packagist.org/packages/tanemrahman/zkteco-adms
30. Axxon, ZKTeco PUSH doors: https://docs.axxonsoft.com/confluence/x/GwUIC
31. CAMS, HTTPS on devices: https://forum.camsbiometrics.com/how-to-configure-https-communication-in-third-party-devices/
32. Rust zkteco crate (pyzk port): https://docs.rs/crate/zkteco/latest ; pyzk: https://github.com/fananimi/pyzk
33. IPCamTalk, HTTP listener retry: https://www.ipcamtalk.net/threads/hikvision-ds-k1t321mfwx-http-listener-keeps-retrying-forever-when-save-picture-when-auth-is-enabled-%E2%80%94-has-anyone-solved-this.85577/
34. Hikvision HikCentral port matrix: https://pinfo.hikvision.com/hkwsen/unzip/20230511205434_28997_doc/HikCentral%20Professional_Communication%20Matrix_V2.4.1_20230511.pdf
35. Hikvision 3rd-party integration overview: https://www.hikvision.com/content/dam/hikvision/vn/webinar/Thang3_Hikvision_Tich_Hop_He_Thong_Overview-of-3rd-Party-Integration.pdf
36. Hik-Partner Pro OpenAPI: https://partner.hikvision.com/HPCIntegration
37. eTimetrackLite Web manual: https://www.etimetracklite.com/downloads/eTimetrackliteWeb_Manual.pdf
38. tanemrahman/zkteco-adms (curl device examples): https://packagist.org/packages/tanemrahman/zkteco-adms
39. eSSL X990 prices: https://m.indiamart.com/proddetail/essl-x990-standalone-biometric-fingerprint-time-attendance-system-21134150933.html ; https://www.moglix.com/essl-x990-3-inch-biometric-fingerprint-machine/mp/msn75dqvnpyd92
40. Hikvision DS-K1T320MFWX prices: https://golchhacomputer.com/product/3545-hikvision-biometric-k1t320mfwx-face-wifi-with-finger ; https://megajaipur.com/hikvision-k1t320mfwx-face-access-terminal-attendance-biometric-p8140
41. Viindoo, ADMS device setup: https://viindoo.com/documentation/17.0/applications/human-resources/attendances/operations/biometric-attendance-device-intergration_with_cloud_server.html
42. Cloudflare network ports: https://developers.cloudflare.com/fundamentals/reference/network-ports/
43. eSSL AiFace Mars listings: https://m.indiamart.com/proddetail/essl-aiface-mars-facial-access-control-and-time-attendance-terminal-2856939117855.html ; https://ampletrails.com/essl-aiface-mars-price-specs-face-attendance-guide/e-learning-blog
