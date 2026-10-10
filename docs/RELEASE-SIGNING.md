# Release signing

How the ForgeAI APK is signed, and why members' phones accept each new release as an update and
keep their data. Audit Phase 1 part 2: decision D2 = A, findings DS-02, QA-01 and QA-26.

## The two keys

| Key | What it is | Where it lives |
|---|---|---|
| **Old key** | The React Native template's debug key. It is public: it is committed at `apps/mobile/android/app/debug.keystore` with the password `android`. Every copy installed up to **v0.31.0** is signed with it. | In the repo. Anyone can sign with it, which is the problem being fixed. |
| **Release key** | ForgeAI's own private key (`forgeai`, PKCS12). Certificate SHA-256 `B2:B0:C2:11:5C:A2:13:62:D4:EB:50:C0:70:97:5C:74:8E:2E:9B:37:93:DC:87:32:53:17:43:B5:2D:85:75:B2`. | Two offline copies kept by the owner, plus GitHub Actions secrets. **Never in the repo.** |

Android only installs an update when it is signed by the key that signed the installed copy. If we
simply switched to the release key, every phone would refuse the update. The only way out would
be to uninstall, which deletes every workout.

## What signs what (APK Signature Scheme v3 key rotation)

Gradle still signs the release build with the debug key, the same as before. The release workflow
(`.github/workflows/release-apk.yml`, step *Sign with key rotation*) then re-signs the APK so that
it carries three signatures:

| Part of the APK | Signed by | Read by |
|---|---|---|
| v1 + v2 signature | **old (debug) key** | Android 7 and 8 (API 24 to 27). They do not understand v3, so they compare this with the installed copy. It matches, so they update normally. |
| v3 signature | **release key** | Android 9+ (API 28+). |
| Lineage (inside v3) | the old key, signing "my successor is the release key" | Android 9+. This proof lets the phone accept a different key as an update. From then on, the phone holds the app under the release key. |

The AAB is only for a future Play Store upload and is never sideloaded. It is signed with the
release key alone.

**Why the debug key stays in the v1/v2 slot.** Phones on Android 7 or 8 cannot read the rotation
proof. If v1/v2 were signed with the release key, every Android 7 or 8 phone would refuse the
update. The release checks enforce this rule through `TRANSITION_FROM_DEBUG_KEY` in
`scripts/ci/release_checks.py`. The slot only stops mattering if the app's minimum Android version
moves to 9 (minSdk 28).

What this does and does not protect:
- On Android 9+, after one update, the phone accepts updates only from the release key. A copy
  signed by someone else with the public debug key is refused.
- Android 7 and 8 phones still trust the debug key. Nothing can change that while those phones
  have to keep updating.

## Gates before anything is published

1. **Release checks** (`scripts/ci/release_checks.py`, signing part). These run once the
   repository variable `ALLOWED_CERT_SHA256` is set to the release key's fingerprint. The build
   FAILS unless all three hold:
   - what Android 7 and 8 see is the debug key and nothing else;
   - what Android 9+ see is an allowed key, and never the debug key;
   - the lineage runs from the debug key to that allowed key.

   It also FAILS a build signed only with the new key (which would break every installed copy) and
   a build signed only with the debug key (which means the rotation step did not run).
2. **Update proof** (job `update-proof`, `scripts/ci/update_proof.py`):
   - downloads the previous published release's APK;
   - installs it on an Android 14 emulator, launches it, and writes a marker file into its data;
   - runs `adb install -r` with the new APK.

   The proof needs: install success, the same `firstInstallTime` (updated, not reinstalled), the
   new version, the marker still there, and the app's signature moved to the release key with the
   debug key in its history. A static check also confirms that Android 7 and 8 see the same key in
   both APKs.
3. **Publish** only runs on a `v*` tag, and only after both gates pass.

Without the keystore secrets (forks, or before the secrets were set), nothing changes: the build is
debug-signed as before. The workflow and the release checks both say so with a warning.

## Version codes (QA-26)

`versionCode = MAJOR × 1,000,000 + MINOR × 1,000 + PATCH` of the tag, so v0.33.0 gets 33000. It no
longer depends on the workflow's run number, so it cannot go backwards if the workflow is renamed or
recreated. Releases up to v0.31.0 used the run number, and the highest was 45 (v0.31.0). The
release checks FAIL a build when:
- its versionCode is not the one derived from its version, or
- its versionCode is not above the previous release's.

## Secrets and variables (set by the owner in GitHub, never committed)

| Name | Kind | Value |
|---|---|---|
| `ANDROID_KEYSTORE_BASE64` | secret | the PKCS12 keystore, base64 |
| `ANDROID_KEYSTORE_PASSWORD` | secret | store password |
| `ANDROID_KEY_PASSWORD` | secret | key password (for PKCS12, the same as the store password) |
| `ANDROID_KEY_ALIAS` | variable (preferred) or secret | `forgeai` |
| `ALLOWED_CERT_SHA256` | variable | the release certificate's SHA-256 above (public) |

`ANDROID_KEY_ALIAS` works better as a **variable**. GitHub masks every secret value in the logs, so
a secret `forgeai` would turn every "forgeai" in the logs (file names, `com.forgeai.app`) into `***`.

The keystore is decoded to `$RUNNER_TEMP` with owner-only permissions. It exists only inside the
signing step and is deleted when that step ends. Gradle never sees it. Passwords reach `apksigner`
and `jarsigner` as the *names* of environment variables, never on a command line.

## Dry run (no publish)

Actions → *Build & Release (APK + AAB)* → *Run workflow* on `main`. Tick `skip_phone_gate` if the
phone test has not passed on that commit. A manual run takes its version from
`apps/mobile/app.json` and names the build `<version>-dryrun.<run>`. It then runs:
- the build and the rotation signing;
- the release checks;
- the update proof against the latest published release.

It never publishes. The APK is attached to the run as the `forgeai-build` artifact, and the
emulator evidence (screenshots, dumpsys, logcat) as `update-proof`.

## Rotating to another key later

1. Get the current lineage from any released APK:
   `apksigner lineage --in forgeai-vX.apk --out lineage.bin`. The lineage is public data:
   certificates and signatures, no private keys.
2. Extend it: `apksigner rotate --in lineage.bin --out lineage2.bin --old-signer --ks <current release key> --new-signer --ks <next key>`.
3. Sign with all keys in order (debug key for v1/v2 while Android 7 and 8 matter, then each newer
   key) with `--lineage lineage2.bin`. Add the new fingerprint to `ALLOWED_CERT_SHA256`.

## If the release key is lost

Nothing can recover it, and no update signed by another key will install over it on Android 9+.
Members would have to uninstall, which loses their data, and install a fresh app. That is why two
offline copies of the keystore and its password exist. Keep them apart, and check both still open
once a year. A leaked key is a different problem: rotate to a new key (above) and remove the old
fingerprint from `ALLOWED_CERT_SHA256`.
