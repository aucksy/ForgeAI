# Connect your eSSL or ZKTeco entry machine to MettleUp

Draft for gym owners (F103, 6 Nov 2026). Not in the app yet. Before it goes into the app, it gets the
`member-words` check. The steps match most eSSL and ZKTeco machines (X990, K90, MB160, uFace, iFace).
Menu names can differ a little on your model.

## What you get

- When a member puts a finger or face on the machine, MettleUp marks them as come in today.
- The register shows "Machine" next to that entry.
- When a plan ends, MettleUp takes the member off the machine. When they renew, MettleUp puts them back.
- You do not need a computer at the gym. The machine only needs the internet.

## Before you start

- Your machine must be connected to the internet: Wi-Fi or a network cable.
- You need the machine's admin password, if it has one.
- Your machine must have a setting called **ADMS** or **Cloud Server Setting**. Old machines may not
  have it. Ask us if you cannot find it.

## Step 1: find the serial number

1. Press **Menu** on the machine.
2. Go to **System Info** (on some models: **Sys Info** > **Device Info**).
3. Write down the **Serial Number**. It looks like `CJDE231560123`.

## Step 2: point the machine to MettleUp

1. Press **Menu**.
2. Go to **COMM** (or **Comm.**).
3. Open **ADMS** (or **Cloud Server Setting**).
4. Set **Enable Domain Name** to **ON**.
5. Set **Server Address** to the address MettleUp gives you.
6. Set **Server Port** to **80**.
7. Set **Enable Proxy Server** to **OFF**.
8. If you see **HTTPS**, leave it **OFF** unless MettleUp tells you to turn it on.
9. Press **OK** or **Save**.

Some machines ask you to restart them. Switch it off and on.

## Step 3: add the machine in MettleUp

1. Open MettleUp on the desk computer.
2. Go to **Settings** > **Entry machines**.
3. Type the serial number from Step 1.
4. Give the machine a name, like "Front door".
5. Press **Save**.

Within a minute, MettleUp shows the machine as **Online**.

## Step 4: give each member their number

- Every member gets a number in MettleUp, like 1001.
- Add the member on the machine with that same number. Then take their fingerprint or face at the machine.
- If the number on the machine and in MettleUp are different, the entry shows as "unknown member".
  You can fix it on the member's page.

## Good to know

- If the internet goes down, the machine keeps every entry. It sends them when the internet is back.
- On most eSSL machines, removing a member when their plan ends also removes their fingerprint.
  When they renew, they put their finger on the machine again to enrol.
- Check the machine's date and time once. MettleUp uses India time.
- A machine that is not added in MettleUp is ignored. Nobody else can send entries into your gym.

## If it does not work

- **Machine shows "offline" in MettleUp:** check the machine has internet. Check the Server Address
  has no spaces. Check the port is 80.
- **Some machines only take a number address (IP), not a name:** tell us. We will give you one.
- **The machine has no ADMS setting:** tell us the model name. It may need a software update from
  your dealer.
