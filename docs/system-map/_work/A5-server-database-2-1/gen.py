import json, re, sys, os
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))  # docs/system-map
OUT = os.path.join(ROOT, '_work', 'out', 'A5-server-database-2-1.jsonl')
rows = []
counter = {}
stats = {}

def slug(r):
    return re.sub(r'[^a-z0-9]+', '-', r.lower()).strip('-')

def J(f, role, t, start, steps, writes=(), reads=(), prom=()):
    counter[f] = counter.get(f, 0) + 1
    st = [{"n": i + 1, "action": a, "user_sees": list(s), "must_not": list(m)} for i, (a, s, m) in enumerate(steps)]
    rows.append({"kind": "journey", "id": "J-%s-%02d" % (f, counter[f]), "feature": f, "role": role, "type": t,
                 "generated": False, "start": start, "steps": st, "writes": list(writes), "reads": list(reads),
                 "promise_ids": list(prom), "tests": [], "coverage": "unknown", "last_result": None})
    stats.setdefault(f, [0, 0])[0] += 1

def T(f, role, t, applies, variants=(), at=0, ent="none", why="none", note="none"):
    rows.append({"kind": "jtype", "id": "JT-%s-%s-%d" % (f, slug(role), t), "feature": f, "role": role, "type": t,
                 "applies": applies, "why_not": why if applies == "no" else "none", "variants": list(variants) if applies == "yes" else [],
                 "at_step": at if applies == "yes" else 0, "entity": ent if applies == "yes" else "none", "note": note})
    stats.setdefault(f, [0, 0])[1] += 1

def Y(f, role, t, variants, at, ent, note):
    T(f, role, t, "yes", variants, at, ent, "none", note)

def N(f, role, t, why):
    T(f, role, t, "no", why=why)

# ======================================================================= F-server-400 PIN sign-in
F = 'F-server-400'
PINP = ['P-A7-legal-2-02', 'P-A7-whats-new-1-98', 'P-A7-pilot-09']
for role in ['owner', 'staff']:
    if role == 'owner':
        J(F, role, 1, "Admin app sign-in page; the owner has a PIN already",
          [("Type the mobile number and the 6-digit PIN, tap 'Sign in'", ["The gym opens on Today"], ["Another gym of the same mobile opened when its PIN differs", "The PIN shown back in any box or message"]),
           ("Open Settings, 'Change my PIN', type the current PIN and a new one twice, tap 'Save new PIN'", ["Line '· PIN set'"], ["The old PIN still signs in afterwards", "The new PIN set in one branch only when the owner has branches"])],
          writes=['E-gym-staff-pins', 'E-gym-sessions'], reads=['E-gym-staff'], prom=PINP)
        J(F, role, 2, "Sign-in page; owner has forgotten the PIN and has a one-time code (from WhatsApp or another signed-in device)",
          [("Type the mobile number and the one-time code in the PIN box, tap 'Sign in'", ["The gym opens", "Offer 'Choose a new PIN?'"], ["The code accepted a second time", "The code refused because a PIN exists"]),
           ("Within 15 minutes choose a new 6-digit PIN, tap 'Save my PIN'", ["'· PIN set'", "No box asking for the old PIN"], ["The old PIN asked for within 15 minutes of a code sign-in"])],
          writes=['E-gym-staff-pins', 'E-gym-signin-codes', 'E-gym-sessions'], reads=['E-gym-staff'], prom=['P-A7-pilot-09', 'P-A7-whats-new-1-51'])
        J(F, role, 3, "Sign-in page; someone types wrong PINs for the owner's mobile",
          [("Type a wrong PIN 4 times", ["A wrong-PIN line with the tries left"], ["The tries-left number going up"]),
           ("Type a wrong PIN a 5th time", ["'Too many tries right now. Wait a little, then try again.'"], ["A 6th try checked", "The right PIN signing in while locked"]),
           ("Later the same day get locked a 3rd time", ["The lock lasts 1 hour, not 15 minutes"], ["The lock never growing"]),
           ("In Settings try the weak PIN 123456 as a new PIN", ["The PIN refused as easy to guess"], ["123456 or the last 6 digits of the mobile saved"])],
          writes=['E-gym-staff-pins'], reads=['E-gym-staff'], prom=['P-A7-legal-2-03'])
        J(F, role, 6, "Owner with two branches and no PIN yet ('· No PIN yet')",
          [("Set a PIN in branch A ('Choose a 6-digit PIN', 'Save my PIN')", ["'· PIN set'"], ["Branch B still shows '· No PIN yet'"]),
           ("Sign out and sign in with the same PIN; open branch B", ["Branch B opens with the same PIN"], ["A second PIN needed for branch B"]),
           ("Change the PIN, then try the old one", ["The old PIN refused as wrong"], ["Both PINs working"])],
          writes=['E-gym-staff-pins'], reads=['E-gym-staff', 'E-gyms'], prom=PINP)
        J(F, role, 12, "Owner opens Staff & sign-in to see who has a PIN",
          [("Look at each person's row", ["'· PIN set' or '· No PIN yet'", "A lock time when a PIN is locked"], ["Any PIN or part of a PIN shown", "Another gym's people listed"]),
           ("Ask the server for this device's PIN status", ["Only: has a PIN, when set, whether the current one is needed, lock time"], ["The PIN or its coded form sent to the device"])],
          reads=['E-gym-staff-pins', 'E-gym-staff', 'E-gym-sessions'], prom=['P-A7-legal-2-02', 'P-A7-legal-2-03'])
    else:
        J(F, role, 1, "A new front-desk person got a one-time code from the owner",
          [("Type the mobile number and the code, tap 'Sign in'", ["The gym opens", "'Choose a 6-digit PIN'"], ["The owner's own screens shown to the desk"]),
           ("Choose a PIN, tap 'Save my PIN'", ["'· PIN set'"], ["The PIN set for the owner instead"]),
           ("Next day sign in with mobile and PIN", ["The gym opens"], ["A new code needed every day"])],
          writes=['E-gym-staff-pins', 'E-gym-sessions', 'E-gym-signin-codes'], reads=['E-gym-staff'], prom=PINP)
        J(F, role, 2, "Desk person reopens the admin app on a device already signed in",
          [("Open the admin app", ["The gym opens without asking for the PIN", "The demo-gym flag is false for a real gym"], ["The sign-in page shown while the session is live", "Another gym's name"])],
          writes=['E-gym-sessions'], reads=['E-gym-sessions', 'E-gym-staff', 'E-gyms'], prom=[])
        J(F, role, 3, "Desk person changes the PIN in Settings",
          [("Type a new PIN equal to the last 6 digits of the own mobile", ["The PIN refused as easy to guess"], ["The weak PIN saved"]),
           ("Type a wrong current PIN 5 times", ["Wrong-PIN line with tries left, then a lock message"], ["The PIN changed without the right current PIN"])],
          writes=['E-gym-staff-pins'], reads=['E-gym-staff'], prom=['P-A7-legal-2-03'])
        J(F, role, 6, "Desk person has a PIN; the owner removes them from Staff & sign-in",
          [("Owner removes the person", ["The person gone from the list"], ["The person still listed"]),
           ("The removed person types mobile and old PIN", ["A wrong-PIN answer"], ["The old PIN still opening the gym"])],
          writes=['E-gym-staff-pins', 'E-gym-staff'], reads=['E-gym-staff'], prom=['P-A7-pilot-09'])
        J(F, role, 12, "Desk person opens Settings",
          [("Look at the PIN card", ["Only the own PIN state"], ["Any other person's PIN state or phone shown to the desk"])],
          reads=['E-gym-staff-pins'], prom=['P-A7-legal-2-02'])
    Y(F, role, 4, ['T4-one'], 1, 'E-gym-staff-pins', "The same mobile is staff in two gyms with the same PIN: the gym of the device seen last opens")
    N(F, role, 5, "Locks and code windows count minutes from now, not calendar days")
    Y(F, role, 7, ['T7-doubletap', 'T7-offline'], 1, 'E-gym-staff-pins', "A double tap on 'Sign in' with a wrong PIN may use two of the 5 tries")
    Y(F, role, 8, ['T8-language'], 2, 'none', "Hinglish words: 'Naya PIN save karo', '6-digit PIN chuno'")
    Y(F, role, 9, ['T9-360', 'T9-bigfont', 'T9-hinglish'], 1, 'none', "PIN box and the forgot-PIN link at 360 px and big font")
    Y(F, role, 10, ['T10-olddata'], 1, 'E-gym-staff-pins', "People from before PINs have none and must still sign in with a code")
    Y(F, role, 11, ['T11-twopanels'], 2, 'E-gym-sessions', "PIN changed on the phone; the laptop session stays signed in")

# ======================================================================= F-server-401 sign out everywhere, HQ reset
F = 'F-server-401'
J(F, 'owner', 1, "Staff & sign-in; a desk person who lost the phone",
  [("Tap 'Sign out everywhere' on the person's row and confirm", ["The person's devices count goes to 0", "Their row shows '· No PIN yet'"], ["The owner's own device signed out", "The person's old PIN still working"]),
   ("The person tries the old PIN on any device", ["A wrong-PIN answer"], ["The gym opens"])],
  writes=['E-gym-sessions', 'E-gym-staff-pins'], reads=['E-gym-staff'], prom=['P-A7-pilot-09'])
J(F, 'owner', 2, "Staff & sign-in; the owner's own row, signed in on a laptop and a phone",
  [("Tap 'Sign out other devices', answer 'Sign out your other devices?'", ["The other devices signed out", "This device stays signed in"], ["This device signed out", "The owner left with no PIN and no word about it"])],
  writes=['E-gym-sessions', 'E-gym-staff-pins'], reads=['E-gym-staff'], prom=[])
J(F, 'owner', 3, "A desk person, or a person already removed",
  [("A desk key asks to sign a person out", ["The request refused"], ["The desk signing out the owner"]),
   ("Owner signs out a person removed a moment ago on another device", ["A 'gone' answer"], ["An error with code words"])],
  reads=['E-gym-staff'], prom=[])
J(F, 'owner', 6, "A desk person was signed out everywhere",
  [("The person signs in with a new code from the owner", ["Gym opens", "'Choose a 6-digit PIN'"], ["The old PIN asked for"]),
   ("Owner signs them out everywhere again", ["Devices 0 and '· No PIN yet' again"], ["The second sign-out doing nothing"])],
  writes=['E-gym-sessions', 'E-gym-staff-pins', 'E-gym-signin-codes'], reads=['E-gym-staff'], prom=['P-A7-pilot-09'])
J(F, 'owner', 12, "Owner looks at Staff & sign-in",
  [("Read each person's row", ["Name, phone, role, devices count, last seen, PIN state"], ["People of another gym", "Device names or places of another person shown to the desk"])],
  reads=['E-gym-staff', 'E-gym-sessions'], prom=['P-A7-pilot-09'])
for role in ['owner']:
    N(F, role, 4, "One person per action; no list, text or money")
    N(F, role, 5, "No dates: sign-out ends sessions at once")
    Y(F, role, 7, ['T7-doubletap', 'T7-twostaff'], 1, 'E-gym-sessions', "Two owners signing the same person out at once; double tap")
    Y(F, role, 8, ['T8-language'], 1, 'none', "Hinglish row words 'Aapka PIN, aur sign out'")
    Y(F, role, 9, ['T9-360', 'T9-bigfont'], 1, 'none', "Row buttons fit at 360 px")
    N(F, role, 10, "Server action with nothing kept on the device between versions")
    Y(F, role, 11, ['T11-twopanels'], 1, 'E-gym-sessions', "The signed-out person's laptop must drop to sign-in on its next call")
R = 'HQ admin'
J(F, R, 1, "HQ app, a gym whose owner cannot sign in; HQ has called the gym's own number",
  [("Open the gym, tick 'I called the gym's own number and the owner confirmed', reset the owner sign-in", ["Owner's name, phone and a new 6-digit code with its end time"], ["A code made without the tick", "The owner's old PIN still working"]),
   ("Read the code to the owner; owner signs in and sets a new PIN", ["Owner's gym opens, then '· PIN set'"], ["The code working for another gym"])],
  writes=['E-gym-staff-pins', 'E-gym-signin-codes'], reads=['E-gym-staff', 'E-gyms'], prom=['P-A7-pilot-09'])
J(F, R, 2, "HQ app, a gym with two owners",
  [("Reset without picking an owner", ["Asked to pick the owner"], ["The code made for a random owner"]),
   ("Pick one owner, reset", ["That owner's code"], ["The other owner's PIN cleared"])],
  writes=['E-gym-staff-pins', 'E-gym-signin-codes'], reads=['E-gym-staff'], prom=[])
J(F, R, 3, "HQ app reset with mistakes",
  [("Reset without the tick", ["Refused: confirm the call first"], ["A code made"]),
   ("Reset the same gym a 6th time in one hour", ["Refused: too many"], ["A 6th code made"]),
   ("A gym-panel key calls the HQ reset", ["Refused"], ["Any code returned"])],
  reads=['E-gyms'], prom=[])
J(F, R, 6, "Owner was reset once today",
  [("Owner signs in with the code and sets a PIN", ["'· PIN set'"], ["Code usable again after use"]),
   ("HQ resets again", ["New code; the new PIN cleared too"], ["The PIN set after the first reset still working"])],
  writes=['E-gym-staff-pins', 'E-gym-signin-codes'], reads=['E-gym-staff'], prom=[])
J(F, R, 12, "HQ app after a reset",
  [("Look at the HQ log line of the reset", ["Who did it, when, 'called the gym and the owner confirmed', the last 4 digits of the owner phone"], ["The full phone or the code kept in the log"])],
  reads=['E-gyms'], prom=['P-A7-pilot-09'])
N(F, R, 4, "One owner per reset; no list, text or money")
N(F, R, 5, "The 5-an-hour limit is a rolling hour, not a calendar date")
Y(F, R, 7, ['T7-doubletap'], 1, 'E-gym-signin-codes', "A double tap makes two codes and uses two of the 5 an hour")
N(F, R, 8, "No user setting changes the reset; the HQ app's own settings were not read")
Y(F, R, 9, ['T9-laptop'], 1, 'none', "HQ app used on a laptop")
N(F, R, 10, "Server action with nothing kept on the device between versions")
Y(F, R, 11, ['T11-twopanels'], 2, 'E-gym-sessions', "The reset does not end the owner's live sessions; a lost phone stays signed in until the owner signs it out")

# ======================================================================= F-server-402 measurements
F = 'F-server-402'
for role in ['owner', 'staff', 'trainer']:
    who = {'owner': 'Owner', 'staff': 'Desk person', 'trainer': 'Trainer'}[role]
    J(F, role, 1, who + " at the desk with a member on the gym's list (Pro plan)",
      [("Open the member, open Measurements, type today's body weight and waist, save", ["The entry at the top of the list with the date and '" + ("the person's name" if role != 'owner' else "the owner's name") + "' as who measured"], ["The entry saved for another member", "Who measured taken from the device instead of the sign-in"]),
       ("The member opens Progress, Body in the app", ["The entry 'From <gym>'"], ["The desk note shown to the member"])],
      writes=['E-gym-body-measurements'], reads=['E-crm-records', 'E-gym-staff'], prom=['P-A7-panel-3-66'])
    if role == 'owner':
        N(F, role, 2, "One way in on the server: the member's Measurements in the admin app; editing is covered as state")
    else:
        N(F, role, 2, "Same single way in as the owner (J-F-server-402-01)")
    J(F, role, 3, who + " saves bad measurements",
      [("Save a second entry for the same member and day", ["Told that day already has an entry; edit it instead"], ["Two entries for one day"]),
       ("Save with every box empty, or with a date tomorrow", ["Refused with a plain line"], ["An empty or future entry saved"]),
       ("Save when the gym's plan does not include trainer plans (switch on)", ["A Pro-only refusal"], ["The entry saved on a Basic plan"])],
      reads=['E-crm-records', 'E-app-config'], prom=[])
    J(F, role, 6, who + " fixes a mistyped entry",
      [("Edit the entry's weight, save", ["'Measurements updated.'"], ["Who measured changed to the editor without a word"]),
       ("Delete the entry", ["'Measurements deleted.'"], ["The entry still in the member's app after its next read"])],
      writes=['E-gym-body-measurements'], reads=['E-crm-records'], prom=['P-A7-phone-watch-1-15'])
    if role == 'owner':
        J(F, role, 12, "Owner writes a desk note on a measurement",
          [("Add a note 'knee pain', save", ["'Desk note (only your gym sees it)'"], ["The note in the member's app", "Another gym able to read the entry"])],
          writes=['E-gym-body-measurements'], reads=['E-gym-body-measurements'], prom=['P-A7-panel-3-66'])
    else:
        N(F, role, 12, "Same data and reach as the owner's privacy journey (J-F-server-402-04)")
    Y(F, role, 4, ['T4-long', 'T4-many'], 1, 'E-gym-body-measurements', "Note cut at 200 letters is refused; the member app gets at most 500 entries")
    Y(F, role, 5, ['T5-midnight'], 1, 'E-gym-body-measurements', "'Today' is the India date: a 00:10 entry must not count as tomorrow")
    Y(F, role, 7, ['T7-doubletap', 'T7-twostaff'], 1, 'E-gym-body-measurements', "Two saves of the same day: the second must say the day is taken")
    Y(F, role, 8, ['T8-units', 'T8-language'], 1, 'E-gym-body-measurements', "Stored in kg and cm; a lb or inch setting must convert")
    Y(F, role, 9, ['T9-360', 'T9-bigfont'], 1, 'none', "Nine tape boxes at 360 px")
    N(F, role, 10, "Server rows only; the member app's read is the member's line")
    Y(F, role, 11, ['T11-apppanel'], 2, 'E-gym-body-measurements', "Desk entry shows in the member app within its next read")
R = 'member'
J(F, R, 1, "Member app joined to the gym, matched at a check-in; the desk measured them",
  [("Open Progress, Body", ["The gym's entry marked 'From <gym>' with weight and tape numbers"], ["The desk note shown", "Another member's numbers"])],
  reads=['E-gym-body-measurements', 'E-gym-members', 'E-crm-records'], prom=['P-A7-panel-3-66'])
N(F, R, 2, "Only one way in: Progress, Body")
J(F, R, 3, "Member whose number is shared with another member on the gym's list",
  [("Open Progress, Body", ["No gym entries; the own entries only"], ["Entries of the other member with the same number"]),
   ("A member who left the gym opens Body", ["Own entries only"], ["The old gym's entries still read"])],
  reads=['E-gym-members', 'E-crm-records'], prom=[])
J(F, R, 6, "Gym deletes a mistyped entry",
  [("Member opens Body again", ["The entry gone"], ["The deleted entry kept on the phone"]),
   ("Member taps a gym entry", ["'Ask your gym to change the ones they recorded.'"], ["The member editing the gym's entry"])],
  reads=['E-gym-body-measurements'], prom=['P-A7-phone-watch-1-15'])
J(F, R, 12, "Member's own entries on the phone",
  [("Member logs own weight in the app", ["The entry on the phone"], ["The member's own entries sent to the gym"])],
  reads=['E-gym-body-measurements'], prom=['P-A7-phone-watch-2-28'])
Y(F, R, 4, ['T4-many'], 1, 'E-gym-body-measurements', "At most 500 gym entries reach the phone")
N(F, R, 5, "Entries are dated by the desk; the read has no time edge")
Y(F, R, 7, ['T7-offline'], 1, 'E-gym-body-measurements', "Offline: last read shown")
Y(F, R, 8, ['T8-units'], 1, 'E-gym-body-measurements', "kg/cm from the gym shown in the member's units")
Y(F, R, 9, ['T9-360', 'T9-dark', 'T9-bigfont'], 1, 'none', "Body chart with gym entries")
Y(F, R, 10, ['T10-olddata'], 1, 'E-gym-body-measurements', "Old app versions without the gym entries part")
Y(F, R, 11, ['T11-apppanel'], 1, 'E-gym-body-measurements', "Same numbers as the desk")

# ======================================================================= F-server-403 diet plans
F = 'F-server-403'
DP = ['P-A7-whats-new-1-96', 'P-A7-whats-new-2-99']
for role in ['owner', 'staff', 'trainer']:
    who = {'owner': 'Owner', 'staff': 'Desk person', 'trainer': 'Trainer'}[role]
    J(F, role, 1, who + " on 'Diet plans' (Pro plan)",
      [("Make a plan: name, goal, 4 meals with times and food lines", ["The plan form with meals"], ["A meal saved with no food line"]),
       ("Pick two members by name, tap 'Send to their app'", ["The plan in the list with who made it"], ["The plan sent to members not picked"]),
       ("A picked member opens Gym tab, 'Diet plan'", ["The meals and the trainer's name"], ["Another gym's plan"])],
      writes=['E-gym-diet-plans'], reads=['E-crm-records', 'E-gym-staff'], prom=DP)
    if role == 'owner':
        J(F, role, 2, "Owner sends a plan to everyone on a membership plan",
          [("Pick the 'Monthly' membership plan instead of names, send", ["The plan saved"], ["Members whose membership ended or was cancelled getting it"]),
           ("A member on Monthly covering today opens 'Diet plan'", ["The plan"], ["A member on another plan seeing it"])],
          writes=['E-gym-diet-plans'], reads=['E-crm-records'], prom=DP)
    else:
        N(F, role, 2, "Same two ways in as the owner (by name, by plan: J-F-server-403-02)")
    J(F, role, 3, who + " saves a bad plan",
      [("Save with no name", ["'Give the diet a name.'"], ["A plan with no name saved"]),
       ("Save with calories 500 or a meal with no food", ["Refused with a plain line"], ["An unreadable plan sent"]),
       ("Save a new plan when the gym's plan lacks trainer plans (switch on)", ["A Pro-only refusal"], ["The plan saved"])],
      reads=['E-app-config'], prom=[])
    J(F, role, 6, who + " withdraws a plan",
      [("Withdraw the plan", ["The plan marked withdrawn, still in the list"], ["The plan deleted"]),
       ("Try to change the withdrawn plan", ["Told to make a copy instead"], ["The withdrawn plan sent again"]),
       ("The member opens 'Diet plan'", ["The plan gone"], ["The withdrawn plan still shown after the next read"])],
      writes=['E-gym-diet-plans'], reads=['E-gym-diet-plans'], prom=DP)
    if role == 'owner':
        J(F, role, 12, "Owner sends a plan to one member",
          [("Another member opens 'Diet plan'", ["Only plans sent to them"], ["Plans meant for others", "The list of who got the plan"])],
          reads=['E-gym-diet-plans'], prom=DP)
    else:
        N(F, role, 12, "Same reach as the owner's privacy journey")
    Y(F, role, 4, ['T4-long', 'T4-hinglish', 'T4-emoji', 'T4-many'], 1, 'E-gym-diet-plans', "Food lines up to 120 letters, notes 1000; up to 2000 members picked")
    Y(F, role, 5, ['T5-endstoday', 'T5-midnight'], 2, 'E-gym-diet-plans', "By-plan sending uses memberships covering today (India date)")
    Y(F, role, 7, ['T7-doubletap', 'T7-twostaff'], 2, 'E-gym-diet-plans', "Double tap on a new plan makes two plans")
    Y(F, role, 8, ['T8-language'], 1, 'none', "Hinglish 'Diet plan save karo'")
    Y(F, role, 9, ['T9-360', 'T9-bigfont'], 1, 'none', "Meal rows and food boxes at 360 px")
    N(F, role, 10, "Server rows only; nothing saved on the device between versions")
    Y(F, role, 11, ['T11-apppanel'], 3, 'E-gym-diet-plans', "Saved plan reaches the member app on its next read")
R = 'member'
J(F, R, 1, "Member matched to the gym's list; a plan was sent by name",
  [("Open Gym tab, tap 'Diet plan'", ["Plan title, meals with times, food lines, notes, who made it"], ["A plan for another member"])],
  reads=['E-gym-diet-plans', 'E-crm-records', 'E-gym-members'], prom=DP)
J(F, R, 2, "Member on the membership plan the trainer sent to",
  [("Open 'Diet plan'", ["The plan sent to that membership plan"], ["Nothing shown although the membership covers today"])],
  reads=['E-gym-diet-plans', 'E-crm-records'], prom=DP)
J(F, R, 3, "Member not matched (no check-in yet, or name differs)",
  [("Open 'Diet plan'", ["A plain line saying the gym must match them first"], ["A blank screen", "Someone else's plan"])],
  reads=['E-gym-members', 'E-crm-records'], prom=[])
J(F, R, 6, "Member's membership ended yesterday; a plan came by membership plan",
  [("Open 'Diet plan'", ["The plan gone"], ["The plan still shown"]),
   ("Member renews; open again", ["The plan back"], ["Renewal not picked up"])],
  reads=['E-gym-diet-plans', 'E-crm-records'], prom=[])
J(F, R, 12, "Member reads a plan",
  [("Look at who made it", ["The trainer's name only"], ["The list of other members the plan was sent to"])],
  reads=['E-gym-diet-plans'], prom=DP)
Y(F, R, 4, ['T4-long', 'T4-hinglish', 'T4-emoji'], 1, 'E-gym-diet-plans', "Long Hinglish food lines")
Y(F, R, 5, ['T5-endstoday', 'T5-midnight'], 1, 'E-crm-records', "Plan ending today still covers today")
Y(F, R, 7, ['T7-offline'], 1, 'E-gym-diet-plans', "Offline: last plans shown")
N(F, R, 8, "No setting changes the plan text")
Y(F, R, 9, ['T9-360', 'T9-bigfont', 'T9-dark'], 1, 'none', "Long meals at big font")
Y(F, R, 10, ['T10-olddata'], 1, 'E-gym-diet-plans', "Old app without the Diet plan screen")
Y(F, R, 11, ['T11-apppanel'], 1, 'E-gym-diet-plans', "Panel edit shows on the phone")

# ======================================================================= F-server-404 gym timings
F = 'F-server-404'
TP = ['P-A7-panel-2-30', 'P-A7-panel-3-54', 'P-A7-whats-new-1-21']
J(F, 'owner', 1, "Owner opens 'Gym timings'",
  [("Set Mon to Sat 06:00-11:00 and 17:00-22:00, Sunday closed, save", ["'Saved ✓'", "'Members see them in the MettleUp app (Gym tab) within 10 minutes.'"], ["Sunday saved as open", "The hours of another branch changed"]),
   ("A member opens 'Gym timings' in the app", ["The same hours"], ["Old hours after 10 minutes"])],
  writes=['E-gym-timings'], reads=['E-gym-staff'], prom=TP)
J(F, 'owner', 2, "Owner adds a special day",
  [("Add Sun 8 Nov closed with note 'Diwali', save", ["'Saved ✓'"], ["The special day lost on save"]),
   ("Member app on that date", ["'Closed Sun 8 Nov · Diwali'"], ["Normal Sunday hours on that date"])],
  writes=['E-gym-timings'], prom=TP)
J(F, 'owner', 3, "Owner types bad hours",
  [("Mark all seven days closed, save", ["Refused: at least one day must be open"], ["Saved with every day closed"]),
   ("Evening 22:00 to 07:00 (past 06:00), save", ["Refused as a likely am/pm slip"], ["Saved"]),
   ("Two ranges that overlap", ["Refused"], ["Saved"])],
  reads=['E-gym-timings'], prom=[])
J(F, 'owner', 6, "Owner has saved timings and an old special day",
  [("Save again a week after the special day", ["The old special day dropped"], ["Yesterday's late hours dropped too early"]),
   ("Remove the timings", ["'Gym timings removed. Members no longer see them.'"], ["Members still seeing them"])],
  writes=['E-gym-timings'], prom=TP)
J(F, 'owner', 12, "Who can see the timings",
  [("A member of this gym opens them", ["The hours"], ["Who last changed them shown to members"]),
   ("A desk person opens them", ["Read-only hours and who changed them"], ["A save button for the desk"])],
  reads=['E-gym-timings'], prom=['P-A7-panel-3-54', 'P-A7-help-1-31'])
N(F, 'owner', 4, "Fixed shape (7 days, 2 ranges); text fields covered by the 120/40-letter limits in the negative journey")
Y(F, 'owner', 5, ['T5-midnight'], 1, 'E-gym-timings', "A range closing at 00:00 or past midnight; special days kept from yesterday by India date")
Y(F, 'owner', 7, ['T7-twostaff', 'T7-doubletap'], 1, 'E-gym-timings', "Two owners saving: last save wins without warning")
Y(F, 'owner', 8, ['T8-language'], 1, 'none', "Day names and hours in Hinglish")
Y(F, 'owner', 9, ['T9-360', 'T9-bigfont'], 1, 'none', "Seven day rows with two ranges at 360 px")
N(F, 'owner', 10, "Server rows only")
Y(F, 'owner', 11, ['T11-apppanel'], 2, 'E-gym-timings', "Member sees within 10 minutes")
R = 'staff'
J(F, R, 1, "Desk person opens 'Gym timings'",
  [("Read the hours", ["The hours and who last changed them"], ["Empty page when hours exist"])],
  reads=['E-gym-timings'], prom=['P-A7-panel-3-54'])
N(F, R, 2, "Only one way in for the desk: the read-only page")
J(F, R, 3, "Desk person tries to change the hours",
  [("Change and save", ["'Only the owner can change the gym timings.'"], ["The change saved"])],
  reads=['E-gym-timings'], prom=['P-A7-panel-3-54'])
J(F, R, 6, "Owner changes the hours while the desk page is open",
  [("Desk reopens the page", ["The new hours and the owner's name"], ["The old hours after reopening"])],
  reads=['E-gym-timings'], prom=[])
N(F, R, 12, "Same reach as the owner's privacy journey (J-F-server-404-05)")
N(F, R, 4, "Read-only view of a fixed shape")
N(F, R, 5, "Read-only view; time rules belong to the owner's save")
Y(F, R, 7, ['T7-offline'], 1, 'E-gym-timings', "Offline read")
Y(F, R, 8, ['T8-language'], 1, 'none', "Hinglish")
Y(F, R, 9, ['T9-360'], 1, 'none', "Read-only rows at 360 px")
N(F, R, 10, "Server rows only")
Y(F, R, 11, ['T11-twopanels'], 1, 'E-gym-timings', "Owner saves on laptop; desk phone shows it")
R = 'member'
J(F, R, 1, "Member app joined to the gym; the gym set hours",
  [("Open Gym tab, 'Gym timings'", ["'Open now · closes 10:00 pm'", "The week's hours"], ["Another gym's hours"])],
  reads=['E-gym-timings', 'E-gym-members', 'E-gyms'], prom=['P-A7-panel-2-30'])
J(F, R, 2, "A special day set by the gym",
  [("Open the hours on that day", ["'Closed Sun 8 Nov · Diwali'"], ["Normal hours"])],
  reads=['E-gym-timings'], prom=[])
J(F, R, 3, "Gym has no timings, or the member left",
  [("Open 'Gym timings'", ["No hours card, or a plain line"], ["A blank card", "An error with code words"])],
  reads=['E-gym-timings'], prom=[])
J(F, R, 6, "Owner removed the hours",
  [("Open again after 10 minutes", ["No hours"], ["The removed hours"])],
  reads=['E-gym-timings'], prom=['P-A7-panel-2-30'])
J(F, R, 12, "Member reads the hours",
  [("Look at the card", ["Hours and the gym note"], ["Who changed them"])],
  reads=['E-gym-timings'], prom=[])
N(F, R, 4, "Fixed shape")
Y(F, R, 5, ['T5-midnight', 'T5-zone'], 1, 'E-gym-timings', "'Open now' at 23:59 and past-midnight ranges; phone in another zone")
Y(F, R, 7, ['T7-offline'], 1, 'E-gym-timings', "Offline: last hours")
Y(F, R, 8, ['T8-language'], 1, 'none', "12/24 hour and Hinglish")
Y(F, R, 9, ['T9-360', 'T9-bigfont'], 1, 'none', "Two ranges per day at big font")
Y(F, R, 10, ['T10-olddata'], 1, 'E-gym-timings', "Old app without the hours card")
Y(F, R, 11, ['T11-apppanel'], 1, 'E-gym-timings', "Same hours both sides")

# ======================================================================= F-server-405 leaderboard
F = 'F-server-405'
LP = ['P-A7-panel-2-23', 'P-A7-whats-new-2-90', 'P-A7-legal-2-29']
R = 'member'
J(F, R, 1, "Member app joined to the gym, with workouts in the last 30 days",
  [("Finish a workout; the app sends the day totals", ["Nothing new on screen"], ["Exercises, sets or body weight sent"]),
   ("Open Gym tab, 'Ranking'", ["Top 10 by workouts", "'A member' for those who did not switch their name on", "Your own place and number"], ["Members who left in the list", "A member with 0 listed"])],
  writes=['E-gym-member-days', 'E-gym-member-board'], reads=['E-gym-member-days', 'E-gym-member-board', 'E-gym-members'], prom=LP)
J(F, R, 2, "Member turns on the name switch and views kg",
  [("Turn on 'Show my name on my gym's leaderboard'", ["Own row shows 'Rahul S.'"], ["Full surname shown"]),
   ("Switch the list to kg lifted", ["Top 10 by kg"], ["Workout counts under the kg heading"])],
  writes=['E-gym-member-board'], reads=['E-gym-member-days'], prom=['P-A7-panel-2-23', 'P-A7-phone-watch-2-53'])
J(F, R, 3, "Odd numbers from a phone",
  [("A day with 5 workouts is sent", ["That day not counted"], ["5 workouts counted"]),
   ("The gym is paused by HQ; open Ranking", ["A plain line"], ["A crash"]),
   ("A member who left opens Ranking", ["The gym list gone"], ["The old gym's list"])],
  writes=['E-gym-member-days'], reads=['E-gym-members'], prom=['P-A7-legal-2-29'])
J(F, R, 6, "The owner hides the member, then the member leaves",
  [("Open Ranking after being hidden", ["Own number and place still shown"], ["Own row in anyone's top 10"]),
   ("Leave the gym", ["Numbers deleted"], ["Numbers kept on the server"])],
  writes=['E-gym-member-days', 'E-gym-member-board'], reads=['E-gym-member-board'], prom=['P-A7-legal-2-29', 'P-A7-legal-2-39'])
J(F, R, 12, "Another member looks at the list",
  [("Read the top 10", ["First name and initial only for those who switched on"], ["Phone numbers", "A full name", "Any name of a member who kept the switch off"])],
  reads=['E-gym-member-board'], prom=['P-A7-panel-2-23', 'P-A7-phone-watch-2-53'])
Y(F, R, 4, ['T4-zero', 'T4-one', 'T4-long', 'T4-hinglish'], 2, 'E-gym-member-board', "Titles like 'Dr' skipped; one-word names; empty gym")
Y(F, R, 5, ['T5-midnight', 'T5-month1'], 1, 'E-gym-member-days', "30-day window by India date; a workout at 23:59")
Y(F, R, 7, ['T7-offline', 'T7-closed'], 1, 'E-gym-member-days', "A second send within 15 seconds is ignored even with new days")
Y(F, R, 8, ['T8-units'], 2, 'E-gym-member-days', "kg lifted stored in kg; lb users")
Y(F, R, 9, ['T9-360', 'T9-bigfont'], 1, 'none', "'Ranking' fits at big font")
Y(F, R, 10, ['T10-olddata'], 1, 'E-gym-member-days', "Old app sends no days")
Y(F, R, 11, ['T11-apppanel'], 1, 'E-gym-member-days', "Panel list matches the app's")
R = 'owner'
J(F, R, 1, "Owner opens Challenges, 'Leaderboard · last 30 days'",
  [("Read both lists", ["Full names, phone and value; hidden members marked"], ["Members who left", "Only switched-on names shown to the owner"])],
  reads=['E-gym-member-days', 'E-gym-member-board', 'E-gym-members'], prom=['P-A7-panel-2-23'])
N(F, R, 2, "One way in: the leaderboard on the Challenges page")
J(F, R, 3, "Owner hides a member who just left",
  [("Tap 'Hide from the leaderboard'", ["Refused"], ["A row made for a member who left"])],
  reads=['E-gym-members'], prom=[])
J(F, R, 6, "Owner hides then unhides",
  [("Tap 'Hide {name} from the leaderboard'", ["The member in 'Leaderboard se chhupaye gaye' / hidden list"], ["The member still in members' top 10"]),
   ("Unhide", ["Back in members' lists"], ["Stuck hidden"])],
  writes=['E-gym-member-board'], reads=['E-gym-member-board'], prom=[])
J(F, R, 12, "Owner reads the board",
  [("Look at a member who kept the name off", ["Full name to the gym"], ["That name shown in the member app"])],
  reads=['E-gym-member-board'], prom=['P-A7-panel-2-23'])
Y(F, R, 4, ['T4-zero', 'T4-many'], 1, 'E-gym-member-days', "Ties share a rank; 500 members")
Y(F, R, 5, ['T5-midnight'], 1, 'E-gym-member-days', "Window by India date")
Y(F, R, 7, ['T7-doubletap'], 1, 'E-gym-member-board', "Hide tapped twice")
Y(F, R, 8, ['T8-language', 'T8-units'], 1, 'none', "Hinglish 'Leaderboard · pichhle 30 din'")
Y(F, R, 9, ['T9-360'], 1, 'none', "Long names with phone")
N(F, R, 10, "Server rows only")
Y(F, R, 11, ['T11-apppanel'], 1, 'E-gym-member-board', "Hide shows in the app on its next read")
R = 'staff'
J(F, R, 1, "Desk person opens the leaderboard",
  [("Read both lists", ["Names, phone, values"], ["Hide buttons that work"])],
  reads=['E-gym-member-days', 'E-gym-member-board'], prom=[])
N(F, R, 2, "Same single way in as the owner")
J(F, R, 3, "Desk person tries to hide a member",
  [("Tap hide", ["Owner-only refusal"], ["The member hidden"])],
  reads=['E-gym-member-board'], prom=[])
J(F, R, 6, "Owner hid a member",
  [("Desk reopens the list", ["The member marked hidden"], ["No mark"])],
  reads=['E-gym-member-board'], prom=[])
N(F, R, 12, "Same reach as the owner's privacy journey")
N(F, R, 4, "Read-only view; edge data covered on the owner's line")
N(F, R, 5, "Read-only view; window covered on the owner's line")
Y(F, R, 7, ['T7-offline'], 1, 'E-gym-member-days', "Offline read")
Y(F, R, 8, ['T8-language'], 1, 'none', "Hinglish")
Y(F, R, 9, ['T9-360'], 1, 'none', "Lists at 360 px")
N(F, R, 10, "Server rows only")
Y(F, R, 11, ['T11-twopanels'], 1, 'E-gym-member-board', "Owner hides on laptop; desk phone shows it")

# ======================================================================= F-server-406 challenge
F = 'F-server-406'
CP = ['P-A7-help-1-27', 'P-A7-whats-new-1-94', 'P-A7-help-1-26']
R = 'owner'
J(F, R, 1, "Owner on 'Challenges' (Pro plan), no challenge this month",
  [("Fill title, workouts, goal 12, dates 1 to 30, 3 free days, tap 'Challenge shuru karo' (Start)", ["The challenge listed as upcoming or running"], ["Two challenges on the same days"]),
   ("Members open Ranking", ["The challenge card with the goal"], ["Old goal after 10 minutes"])],
  writes=['E-gym-challenges'], reads=['E-gym-challenges'], prom=CP)
J(F, R, 2, "The challenge ended; winners wait for the owner",
  [("Open Challenges", ["Each winner with name, phone, value and a give or skip choice"], ["Free days added before the owner chose"]),
   ("Tap 'Give all {n} their free days'", ["'The free days were added to each winner’s plan by themselves.' or 'The free days will be added soon.'"], ["Days added twice", "A winner who left given days"]),
   ("Skip one winner", ["That winner marked skipped; no message"], ["A message sent to the skipped winner"])],
  writes=['E-gym-challenge-hits', 'E-crm-records', 'E-gym-messages'], reads=['E-gym-challenge-hits'], prom=['P-A7-panel-2-20', 'P-A7-panel-2-21', 'P-A7-panel-1-57'])
J(F, R, 3, "Owner makes mistakes",
  [("Start date yesterday, or 5 days long", ["Refused"], ["Saved"]),
   ("Overlap with an existing challenge", ["Refused: overlap"], ["Saved"]),
   ("Change a running challenge", ["'A challenge that has started can only be cancelled.'"], ["Goal changed mid-way"]),
   ("Start one when the gym's plan lacks challenges (switch on)", ["'Challenges are not switched on for your gym yet'"], ["Saved"])],
  reads=['E-gym-challenges', 'E-app-config'], prom=['P-A7-panel-1-61', 'P-A7-help-1-27'])
J(F, R, 6, "A running challenge",
  [("Cancel it", ["'Challenge cancelled. Members no longer see it.'"], ["Winners kept for a cancelled one"]),
   ("Try to cancel one that is over", ["Refused"], ["Its winners wiped"])],
  writes=['E-gym-challenges'], reads=['E-gym-challenges'], prom=[])
J(F, R, 12, "Owner reads the winners of a finished challenge",
  [("Look at a winner who left the gym", ["Name and value, no phone"], ["The phone of a member who left"])],
  reads=['E-gym-challenge-hits'], prom=['P-A7-legal-2-29'])
Y(F, R, 4, ['T4-zero', 'T4-long', 'T4-emoji', 'T4-planedge'], 2, 'E-gym-challenge-hits', "Winner with no plan today or later: 'by hand'")
Y(F, R, 5, ['T5-midnight', 'T5-month1', 'T5-endstoday'], 2, 'E-gym-challenge-hits', "Winners copied on the first read after the last India day")
Y(F, R, 7, ['T7-doubletap', 'T7-twostaff'], 2, 'E-gym-challenge-hits', "Give tapped twice must add days once")
Y(F, R, 8, ['T8-language', 'T8-units'], 1, 'none', "kg goals; Hinglish words")
Y(F, R, 9, ['T9-360', 'T9-bigfont'], 2, 'none', "Winner rows with two buttons")
Y(F, R, 10, ['T10-olddata'], 2, 'E-gym-challenge-hits', "Winners kept before rewards existed have no reward state")
Y(F, R, 11, ['T11-apppanel'], 2, 'E-gym-challenge-hits', "Member's plan end date moves in both apps")
R = 'member'
J(F, R, 1, "Member in a running challenge",
  [("Open Ranking", ["Challenge card: title, goal, my value, how many hit it"], ["Other members' names on the card"]),
   ("Reach the goal", ["'You hit the goal: {prizeDays} free ...'"], ["The prize promised before the challenge ended without saying it is after"])],
  writes=['E-gym-member-days'], reads=['E-gym-challenges', 'E-gym-member-days'], prom=['P-A7-phone-watch-2-26'])
J(F, R, 2, "Owner gave the free days",
  [("Open the gym message 'You won the gym challenge'", ["'... 3 free days were added to your membership.' or 'Ask at the front desk to add them'"], ["Two messages for one win"])],
  reads=['E-gym-messages', 'E-crm-records'], prom=['P-A7-panel-2-21'])
J(F, R, 3, "Phone sends old days after the challenge ended",
  [("Open Ranking", ["My value just under the goal; not a winner"], ["A late winner"])],
  writes=['E-gym-member-days'], reads=['E-gym-challenge-hits'], prom=[])
J(F, R, 6, "Challenge cancelled; then a finished one older than 7 days",
  [("Open Ranking", ["No challenge card"], ["The cancelled challenge"])],
  reads=['E-gym-challenges'], prom=[])
J(F, R, 12, "Member's card",
  [("Read the card", ["Only a count of who hit the goal"], ["Winners' names or phones"])],
  reads=['E-gym-challenge-hits'], prom=[])
Y(F, R, 4, ['T4-zero', 'T4-planedge'], 1, 'E-gym-challenges', "Goal 0 kg impossible; plan ending inside the challenge")
Y(F, R, 5, ['T5-midnight', 'T5-month1'], 1, 'E-gym-challenges', "Last day at 23:59 India time")
Y(F, R, 7, ['T7-offline'], 1, 'E-gym-member-days', "Days pushed late")
Y(F, R, 8, ['T8-units'], 1, 'E-gym-member-days', "kg challenges for lb users")
Y(F, R, 9, ['T9-360', 'T9-bigfont'], 1, 'none', "Card at big font")
Y(F, R, 10, ['T10-olddata'], 1, 'E-gym-challenges', "Old app without the card")
Y(F, R, 11, ['T11-apppanel'], 1, 'E-gym-challenge-hits', "Same winner both sides")
R = 'system'
J(F, R, 1, "First read of Challenges after a challenge's last India day",
  [("Copy who reached the goal", ["Each winner line 'confirm' when free days are set, else 'none'"], ["Members who left copied", "Copy run twice"])],
  writes=['E-gym-challenge-hits', 'E-gym-challenges'], reads=['E-gym-member-days', 'E-gym-members'], prom=[])
J(F, R, 2, "The first read after the end comes from a member's Ranking",
  [("Member opens Ranking", ["The same copy made"], ["A different winner list from the owner's read"])],
  writes=['E-gym-challenge-hits'], reads=['E-gym-member-days'], prom=[])
J(F, R, 3, "Winner cannot be matched, has no plan, or left",
  [("Owner gives the reward", ["Line 'by hand' with reason no_match, no_plan or left"], ["Days invented on no plan", "A message to a member who left"])],
  writes=['E-gym-challenge-hits', 'E-gym-messages'], reads=['E-crm-records', 'E-gym-members'], prom=['P-A7-panel-2-20'])
J(F, R, 6, "Gym paused by HQ when the owner gives",
  [("Give", ["Lines stay pending"], ["Days added while paused"]),
   ("HQ turns the gym back on; next Challenges read", ["Days added once; plan note '+3 days (Reward - Gym challenge)'"], ["Days added twice"])],
  writes=['E-gym-challenge-hits', 'E-crm-records', 'E-gym-messages'], reads=['E-gyms'], prom=['P-A7-panel-2-21'])
N(F, R, 12, "Who sees the winners is the owner's and member's privacy journeys")
Y(F, R, 4, ['T4-planedge'], 1, 'E-crm-records', "Plan that ends today is extended")
Y(F, R, 5, ['T5-midnight'], 1, 'E-gym-challenge-hits', "Copy only after the India last day")
Y(F, R, 7, ['T7-twostaff'], 1, 'E-gym-challenge-hits', "Owner and member reads at once: lock keeps one copy")
N(F, R, 8, "No user setting")
N(F, R, 9, "No screen")
Y(F, R, 10, ['T10-olddata'], 1, 'E-gym-challenge-hits', "Lines from before rewards stay untouched")
N(F, R, 11, "No device")

# ======================================================================= F-server-407 push
F = 'F-server-407'
PP = ['P-A7-templates-2-37', 'P-A7-templates-2-36', 'P-A7-whats-new-2-78']
R = 'member'
J(F, R, 1, "Member app joined to the gym, notifications allowed",
  [("Turn on 'Messages from my gym' in Settings, Your gym", ["'Get a pop-up when {name} sends news, like a holiday, new timings or an offer. It can take a few minutes to reach you.'"], ["The switch on but no address saved"]),
   ("The gym sends a message", ["A pop-up with the gym's name and the message title"], ["Two pop-ups for one message"])],
  writes=['E-member-push-tokens'], reads=['E-gym-messages'], prom=['P-A7-templates-2-37'])
J(F, R, 2, "The gym starts a workout offer, or a trainer answers the member's question",
  [("Offer saved by the gym", ["A pop-up with the offer title"], ["A pop-up for a stopped offer"]),
   ("Trainer answers", ["A pop-up with the trainer's first name and the answer"], ["The answer sent to other members' phones"])],
  reads=['E-gym-offers', 'E-trainer-questions'], prom=[])
J(F, R, 3, "Notifications blocked, or switch off",
  [("Block notifications for MettleUp", ["'No message from your gym can pop up. Turn them on in your phone's settings.'"], ["Pop-ups still arriving"]),
   ("Turn the switch off", ["No pop-ups"], ["Address kept on the server"])],
  writes=['E-member-push-tokens'], prom=['P-A7-templates-2-36'])
J(F, R, 6, "Member leaves the gym",
  [("Leave the gym", ["No more pop-ups from that gym"], ["A pop-up from the old gym"]),
   ("Join on a 6th phone", ["The oldest phone stops getting pop-ups"], ["More than 5 addresses kept"])],
  writes=['E-member-push-tokens'], reads=['E-gym-members'], prom=[])
J(F, R, 12, "Member reads a group message meant for others",
  [("A message sent to one group", ["Pop-up only on phones of that group"], ["Pop-up on phones outside the group"])],
  reads=['E-gym-messages'], prom=['P-A7-templates-2-37'])
Y(F, R, 4, ['T4-long', 'T4-hinglish', 'T4-emoji'], 2, 'E-gym-messages', "Long Hindi message titles in a pop-up")
Y(F, R, 5, ['T5-midnight'], 2, 'E-push-jobs', "A timed message due at midnight; the first-2-a-day quiet rule resets by day")
Y(F, R, 7, ['T7-locked', 'T7-closed'], 2, 'E-member-push-tokens', "Phone locked or app closed: pop-up must still come")
Y(F, R, 8, ['T8-alerts', 'T8-permission'], 1, 'E-member-push-tokens', "Switch and Android permission")
N(F, R, 9, "The pop-up is drawn by the phone; no layout of ours")
Y(F, R, 10, ['T10-olddata'], 1, 'E-member-push-tokens', "Addresses saved by an old app version")
Y(F, R, 11, ['T11-apppanel', 'T11-watch'], 2, 'E-member-push-tokens', "Panel sends; phone and watch show the pop-up")
R = 'system'
J(F, R, 1, "Owner sends a message from the admin app",
  [("Message saved", ["One push job made, due at the send time"], ["The send failing because the job failed"])],
  writes=['E-push-jobs'], reads=['E-gym-messages'], prom=[])
J(F, R, 2, "Owner saves a workout offer; a trainer answers",
  [("Offer saved", ["One push job of kind offer"], ["Two jobs for one offer"])],
  writes=['E-push-jobs'], reads=['E-gym-offers', 'E-trainer-questions'], prom=[])
J(F, R, 3, "Message taken back before it went; sender 7 hours late",
  [("Sender asks for the next job", ["The job closed as withdrawn or late; nothing sent"], ["A withdrawn message popped up"])],
  writes=['E-push-jobs'], reads=['E-gym-messages'], prom=[])
J(F, R, 6, "A big gym with 1000 addresses",
  [("Sender takes 40 at a time", ["The job moves on each time; done when the last batch is short"], ["A phone sent twice", "A phone skipped"]),
   ("30 days later", ["Finished job deleted"], ["Jobs kept forever"])],
  writes=['E-push-jobs'], reads=['E-member-push-tokens'], prom=[])
N(F, R, 12, "Who gets which pop-up is in the HQ admin privacy journey")
Y(F, R, 4, ['T4-many', 'T4-zero'], 1, 'E-push-jobs', "No addresses: job closes at once")
Y(F, R, 5, ['T5-midnight'], 1, 'E-push-jobs', "Timed message due exactly now")
Y(F, R, 7, ['T7-twostaff'], 1, 'E-push-jobs', "Two senders at once (skip locked)")
N(F, R, 8, "No user setting on the server side")
N(F, R, 9, "No screen")
Y(F, R, 10, ['T10-olddata'], 1, 'E-push-jobs', "Jobs made before trainer replies existed")
N(F, R, 11, "No device")
R = 'HQ admin'
J(F, R, 1, "HQ push sender runs every minute",
  [("Ask for the next job", ["Gym name, title, body and up to 40 addresses"], ["Addresses of members who left"]),
   ("Send through Firebase; report dead addresses", ["Dead addresses deleted"], ["Dead addresses kept"])],
  writes=['E-push-jobs', 'E-member-push-tokens'], reads=['E-push-jobs', 'E-member-push-tokens', 'E-gym-messages'], prom=[])
J(F, R, 2, "Admin app asks the sender to run at once after a send",
  [("Sender runs at once", ["The pop-up within seconds"], ["Wait of a full minute"])],
  reads=['E-push-jobs'], prom=[])
J(F, R, 3, "A gym key or anon key calls the sender functions",
  [("Call the next-job function", ["Refused"], ["Addresses returned"]),
   ("Report 1001 dead addresses", ["Refused: too many"], ["Deleted"])],
  prom=[])
J(F, R, 6, "Sender dies mid-way",
  [("Restart", ["The job carries on after the last batch"], ["The same batch again"])],
  writes=['E-push-jobs'], prom=[])
J(F, R, 12, "Sender reads a group message",
  [("Ask for the job", ["Only addresses of the group's members"], ["Workout data or names with the addresses"])],
  reads=['E-member-push-tokens', 'E-gym-messages'], prom=['P-A7-templates-2-37'])
Y(F, R, 4, ['T4-many'], 1, 'E-push-jobs', "500 per call cap")
N(F, R, 5, "Late cut-off is 6 hours rolling")
Y(F, R, 7, ['T7-twostaff'], 1, 'E-push-jobs', "Two sender runs")
N(F, R, 8, "No user setting")
N(F, R, 9, "No screen (Worker)")
N(F, R, 10, "Worker and server change together; nothing on a device")
N(F, R, 11, "No device")

# ======================================================================= F-server-408 busy
F = 'F-server-408'
R = 'member'
J(F, R, 1, "Member app joined to a gym with 8 weeks of timed check-ins",
  [("Open Gym tab, 'How busy the gym is' card", ["'Quiet right now' or 'Busy'", "Bars for the usual week", "'Quietest later today: 2 pm to 4 pm'"], ["Names or check-in times of anyone", "An exact small number"])],
  reads=['E-crm-records', 'E-gym-timings', 'E-gym-members'], prom=['P-A7-pilot-74'])
J(F, R, 2, "Gym closed this hour by its weekly hours",
  [("Open the card at 23:30", ["'Closed right now'"], ["'Quiet right now' at a closed hour"])],
  reads=['E-gym-timings'], prom=[])
J(F, R, 3, "New gym with under 40 timed check-ins, or member left",
  [("Open Gym tab", ["No busy card (still learning)"], ["A busy level from 3 check-ins"]),
   ("Member who left opens it", ["Nothing from the old gym"], ["Old gym's levels"])],
  reads=['E-crm-records'], prom=['P-A7-pilot-74'])
J(F, R, 6, "Gym adds weekly hours; old paper register imported",
  [("Open the card", ["Closed hours show no bar", "Imported visits (no time) not counted"], ["Bars for closed hours"])],
  reads=['E-gym-timings', 'E-crm-records'], prom=[])
J(F, R, 12, "Only a few people came",
  [("Open the card at a quiet hour", ["A level only; no count under 5", "Hours with fewer than 3 check-ins show 0"], ["A number that tells one person was there"])],
  reads=['E-crm-records'], prom=['P-A7-pilot-74'])
Y(F, R, 4, ['T4-zero', 'T4-many'], 1, 'E-crm-records', "No check-ins; very many")
Y(F, R, 5, ['T5-midnight', 'T5-monday', 'T5-zone'], 1, 'E-crm-records', "Weekday and hour by India time; past-midnight ranges")
Y(F, R, 7, ['T7-offline'], 1, 'E-crm-records', "Offline: last level with its age")
N(F, R, 8, "No setting changes the levels")
Y(F, R, 9, ['T9-360', 'T9-dark'], 1, 'none', "Week bars at 360 px and dark")
Y(F, R, 10, ['T10-olddata'], 1, 'E-crm-records', "Old app without the card")
N(F, R, 11, "Read-only on one phone")

# ======================================================================= findings
rows.append({"kind": "finding", "id": "FN-A5-server-database-2-1-01", "date": "2026-11-20", "lens": "A5", "surface": "server", "area": "server/database-2",
  "refs": ["J-F-server-400-03"], "severity": "S3",
  "title": "Wrong tries when changing a PIN lock it for only 15 minutes every time",
  "what": "Since the November security fix, wrong PINs on the sign-in page lock for longer each time in a day (15 minutes, then 1 hour). Wrong current PINs typed while changing the PIN in Settings still lock for a fixed 15 minutes and do not count toward the longer lock.",
  "expected": "Wrong current PINs in Settings count toward the same growing lock as the sign-in page.",
  "evidence": ["supabase/migrations/0034_signin_pin.sql:262-268", "supabase/migrations/0048_security_fixes.sql:271-281", "supabase/migrations/0048_security_fixes.sql:338-348"],
  "proof": "code-read", "root_cause_key": "pin-change-lock-never-grows", "who": "owners and desk staff", "how_often": "every time someone guesses the current PIN while changing it",
  "fix_line": "Use the same growing lock when changing a PIN", "fix_size": "small", "needs_him": False, "verified": "pending", "status": "open"})
rows.append({"kind": "finding", "id": "FN-A5-server-database-2-1-02", "date": "2026-11-20", "lens": "A5", "surface": "server", "area": "server/database-2",
  "refs": ["J-F-server-405-01"], "severity": "S3",
  "title": "A leaderboard update sent within 15 seconds of the last one is thrown away, even with new workouts",
  "what": "When a phone sends its day totals less than 15 seconds after its last send, with the name switch unchanged, the server answers OK and keeps nothing, even if a new workout was added. The design note says only a send that changes nothing should be ignored. The owner hiding a member also restarts the 15 seconds.",
  "expected": "A send with new numbers is always kept; only an identical send inside 15 seconds is skipped.",
  "evidence": ["supabase/migrations/0037_leaderboard.sql:20-21", "supabase/migrations/0037_leaderboard.sql:312-316", "supabase/migrations/0037_leaderboard.sql:560-563"],
  "proof": "code-read", "root_cause_key": "board-throttle-ignores-new-days", "who": "members", "how_often": "when two sends come close together, for example on opening the app right after a workout",
  "fix_line": "Skip only when the days sent are the same as the ones kept", "fix_size": "small", "needs_him": False, "verified": "pending", "status": "open"})

with open(OUT, 'w', encoding='utf-8', newline='\n') as f:
    for r in rows:
        f.write(json.dumps(r, ensure_ascii=False, separators=(',', ':')) + '\n')
print(len(rows))
for k, v in stats.items():
    print('%s: %d journeys, %d type lines' % (k, v[0], v[1]))
