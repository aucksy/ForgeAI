# Google Test Lab: one-time setup (owner, about 10 minutes, free)

What it gives us: after every release, Google's robot taps through the app on 5 real phones
(Samsung, Xiaomi, vivo, OPPO, OnePlus or Pixel) and 2 virtual ones, and reports crashes, broken
screens and slow starts. Free plan (Spark): no card, no bill. Workflow: `.github/workflows/test-lab.yml`.

Only you can do these steps: they create a Google project and a key in your account.
Use a NEW project only for this. The key can then reach nothing else.

## 1. Make the project (2 min)
1. Open https://console.firebase.google.com and sign in with your Google account.
2. Press **Create a project**. Name: `forgeai-testlab`. Turn **Google Analytics off**. Press **Create**.
3. Write down the **Project ID** (under the name, e.g. `forgeai-testlab-1a2b3`).

## 2. Turn on the two test services (2 min)
Open each link, replace `PROJECT_ID` with yours, press **Enable**:
- https://console.cloud.google.com/apis/library/testing.googleapis.com?project=PROJECT_ID
- https://console.cloud.google.com/apis/library/toolresults.googleapis.com?project=PROJECT_ID

## 3. Make the key (3 min)
1. Open https://console.cloud.google.com/iam-admin/serviceaccounts?project=PROJECT_ID
2. **Create service account**. Name: `github-test-lab`. Press **Create and continue**.
3. Role: **Editor** (Google's own instructions for Test Lab ask for it). Press **Done**.
4. Open `github-test-lab` → **Keys** → **Add key** → **Create new key** → **JSON** → **Create**.
   A small file downloads.

## 4. Give the key to GitHub (2 min)
Open https://github.com/aucksy/ForgeAI/settings/secrets/actions → **New repository secret**, twice:
- Name `TEST_LAB_PROJECT`, value: your Project ID.
- Name `TEST_LAB_KEY`, value: open the downloaded file in Notepad, copy ALL of it, paste.

Then delete the downloaded file from your computer.

## 5. Tell Claude "Test Lab is set up"
Claude starts the first run on v0.48.0 and reads the result.

## Later
- Each release runs it by itself. It never blocks a release; a real crash shows as a red run.
- Google has said Test Lab closes on 30 Sep 2027; we move to its successor before then.
