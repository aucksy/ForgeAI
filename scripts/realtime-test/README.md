# Realtime machine test (about 30 minutes)

**Goal:** find out whether the gym's Realtime RS20 can talk to our software, before we build the
real thing. Your laptop pretends to be our server, and we watch what the machine does.

## What you need
- The RS20 and its 12 V power adapter. A lock is NOT needed: when the door opens, you hear the machine's
  switch click.
- Your laptop with Node (already installed) and this project (`git pull` first).
- One Wi-Fi network both can join. Or a LAN cable from the machine to the same router as the laptop.
- The machine's admin menu (the admin finger or password).

## Steps
1. On the laptop, in this folder, run: `node listener.mjs`
   It prints a line like *"set the server address to one of: 192.168.1.23 and port 8000"*. Keep that
   window open. If Windows asks whether to allow Node on the network, choose **Allow (Private)**.
2. On the machine: Menu → **Comm** (or Network) → join the same Wi-Fi (or LAN).
3. Same menu: look for **Server**, **Cloud**, **Web server**, **Push** or **ADMS**. Enter the laptop's
   address and port 8000 from step 1, and switch it on. **Take a photo of this screen.**
4. Wait up to a minute. In the laptop window, look for **"FIRST CONTACT"**.
   - If it appears, the machine CAN talk to our software. Go on to step 5.
   - If nothing appears within 3 minutes, or the menu has no server setting: stop. Send me the photos
     of the Comm menu screens. (That means the RS20 needs a firmware update or a newer model. That's a
     question for Realtime.)
5. Try these, typing in the laptop window and pressing Enter (each takes a few seconds):
   - `time`: sets the machine clock.
   - `users`: lists the user numbers on the machine.
   - `open`: the door switch should click.
   - Enrol a **new test user** on the machine (any number, e.g. 99, name "Test"). Then scan that finger.
     An **ENTRY** line should appear.
   - `dates 00000099 Test 2026-10-01 2026-10-02` (an end date in the PAST). Scan the test finger again.
     Does the machine refuse it? This is the most important check.
   - `dates 00000099 Test 2026-10-01 2027-12-31` (end date in the future). Scan again: let in?
   - `block 00000099 Test`, scan (refused?), then `unblock 00000099 Test`, scan (let in?).
6. Type `quit`. Send me the file **realtime-test-log.txt** from this folder, plus your photos.

**Careful:** use `block`, `unblock` and `dates` only on the test user. On a real member or the admin,
they would overwrite that person's settings on the machine. The log can contain members' names: send
it only to me, don't post it anywhere.
