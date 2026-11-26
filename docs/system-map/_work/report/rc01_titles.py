import io
p='cards-01.md'
s=io.open(p,encoding='utf-8',newline='').read()
rep={
"Spoken AI Assistant requests may go to a company our notice never names":"Spoken AI Assistant requests may go to an unnamed company",
"HQ can open a gym's records without asking, though the owner's screen says otherwise":"HQ can open a gym's records without the owner saying yes",
"The app's start-up error screen tells members to send private data to their gym":"Start-up error screen tells members to send private data to the gym",
"Our websites say member data stays in India, but a nightly copy may not":"Websites say data stays in India, but a nightly copy may not",
"The phone-number backup is marked released, but the app may not have it yet":"Phone-number backup is marked released, but members may not have it",
"Changing plans on the AI Assistant's add-member card keeps the wrong joining fee":"Changing plan on the AI Assistant's add-member card keeps the wrong joining fee",
"A member back after 3 months loses their workouts over a name spelling":"A member back after 3 months loses workouts over name spelling",
"Whoever later gets an owner's old mobile number can take over the gym":"Whoever gets an owner's old mobile number can take over the gym",
"Privacy notice says photos never leave the phone, but photo backup copies them":"Privacy notice says photos never leave the phone; photo backup copies them",
"On such an app, members who signed in by phone":"On that version, members who signed in by phone",
}
for a,b in rep.items():
    assert a in s,a
    s=s.replace(a,b)
io.open(p,'w',encoding='utf-8',newline='').write(s)
for l in s.splitlines():
    if l.startswith('### '):
        print(len(l[4:].split()), l[4:])
print(s.count('### '), s.count('**Your decision:**'), s.count('\nFinding: '))
