# Checkpoint: A2-server-ci-workflows

Output: docs/system-map/_work/out/A2-server-ci-workflows.jsonl (22 rows, F-server-600 to F-server-621)

## Finished units (all 20 items)
- [x] server.txt#2 (watch.yml cron) -> F-server-600
- [x] words.txt#76 (login_code template check) -> F-server-601
- [x] file#.github/workflows/ci.yml -> F-server-602, 603, 604
- [x] file#.github/workflows/exercise-clips.yml -> F-server-605
- [x] file#.github/workflows/final-voice.yml -> F-server-606 (not-a-feature)
- [x] file#.github/workflows/ios.yml -> F-server-607 (hidden, paused)
- [x] file#.github/workflows/music-choices.yml -> F-server-608 (not-a-feature)
- [x] file#.github/workflows/owner-ads.yml -> F-server-609 (not-a-feature)
- [x] file#.github/workflows/play-listing.yml -> F-server-610
- [x] file#.github/workflows/play-upload.yml -> F-server-611
- [x] file#.github/workflows/qa-conditions.yml -> F-server-612
- [x] file#.github/workflows/qa-device.yml -> F-server-613
- [x] file#.github/workflows/qa-journeys.yml -> F-server-614
- [x] file#.github/workflows/release-apk.yml -> F-server-615
- [x] file#.github/workflows/store-shots.yml -> F-server-616
- [x] file#.github/workflows/test-lab.yml -> F-server-617 (behind switch: Test Lab secrets)
- [x] file#.github/workflows/voice-samples.yml -> F-server-618 (not-a-feature)
- [x] file#.github/workflows/watch-video.yml -> F-server-619
- [x] file#.github/workflows/wear-build.yml -> F-server-620
- [x] file#.github/workflows/whatsapp-probe.yml -> F-server-621

## Switches and plan gates met
- No per-gym switch and no Pro gate in this area.
- test-lab.yml:50 stops green with nothing tested unless the secrets TEST_LAB_PROJECT and TEST_LAB_KEY exist.
- release-apk.yml:75 skip_phone_gate input: a hand-started run can skip the phone gate; a tag never can.
- play-upload.yml and play-listing.yml have a dry_run input (default ON for a hand-started play-upload).

## Seen in passing
- test-lab.yml:28 still starts on workflow_run of "Build & Release (APK + AAB)"; play-upload.yml:20-23 says that trigger never fired in this repo after a tag release (test-lab's included). So the Test Lab crawl probably never runs by itself after a release.
- whatsapp-setup.yml:119 says the Cloudflare account id is "as in watch.yml", but watch.yml no longer carries any Cloudflare id (stale comment after crash alerts moved out).
- wear-build.yml:3 header still calls it "the ForgeAI watch app" (old name).
- watch-video.yml:16 default tag is fixed at v0.71.0: a hand run without a tag records an old watch app.
- whatsapp-setup.yml and whatsapp-probe.yml hold the same phone number id and WhatsApp account id twice (hand-typed in two files).

## Could not check
- Whether the secrets (TEST_LAB_*, WHATSAPP_*, PROBE_TO, RAZORPAY_TEST_*) exist: no access to repo settings in this step.
- Whether each workflow's last run was green: no CI run ids read in this step.
- Only the header, triggers and step names of the long files were read (about 1,150 of 3,524 lines); step bodies of release-apk.yml, qa-device.yml, ios.yml and wear-build.yml were not read line by line.
