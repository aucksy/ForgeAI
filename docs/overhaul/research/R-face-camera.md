# Face recognition with our own camera instead of a machine — research, 20 Oct 2026

Owner's question (OWNER-INBOX #41): use a free face-recognition library and a plain camera that feeds
our system, instead of a vendor machine, "and no dependency".

## Free parts that a paid product may use (licence files read from the repos, 20 Oct 2026)
| Part | Job | Licence | Notes |
|---|---|---|---|
| OpenCV Zoo **YuNet** (`face_detection_yunet`) | find faces in the picture | MIT | tiny, CPU, ~ms per frame; WIDER Face AP 0.834 / 0.824 / 0.708 (easy / medium / hard) |
| OpenCV Zoo **SFace** (`face_recognition_sface`) | "is this member X?" | Apache 2.0 | LFW accuracy 0.9940 (0.9932 quantised); runs on CPU through OpenCV |
| minivision **Silent-Face-Anti-Spoofing** | "real face or a photo / screen?" | Apache 2.0 | ~4 MB, CPU; reliable only within ~30° of a frontal face |
| Exadel **CompreFace** | ready self-hosted face server (Docker, REST) | code Apache 2.0 | its models come from FaceNet / InsightFace, so check each model's licence |
| **InsightFace** (buffalo_l etc.) | best-known accuracy | code MIT, **models non-commercial only** | a paid licence is needed for a product. Don't use it. |
So a fully free, commercially allowed set exists: YuNet + SFace + Silent-Face, all offline on a CPU.

## What a camera setup still needs at the gym (it is not "no dependency")
- A camera at the door (USB or IP, ~Rs 2-4k), with steady light on the face (a light ~Rs 1k).
- A small always-on computer to run it offline: an old Android tablet or phone, a Raspberry Pi 5
  (~Rs 8-10k with case and power supply) or a mini PC (~Rs 10-15k). It also keeps the members'
  face data, so it must be locked down.
- A relay that the computer switches (Wi-Fi / USB relay ~Rs 500-1,500), plus the same magnetic lock,
  lock power supply and exit button as with a machine (~Rs 3-5k).
- Rough parts total: Rs 15-25k. A ready-made face terminal is Rs 17.5-31k (Matrix ARGO FACE200T,
  R-entry-machines.md). The gym already owns a fingerprint machine.

## Risks (why a home-made door camera is harder than it looks)
1. **Fooling it:** a member's photo or video shown on a phone. Ready-made terminals use infrared /
   3-D cameras; a free model on a normal camera is much weaker. At an entry door, that matters.
2. **Real-world accuracy:** 99.4% is on a clean benchmark (LFW, one-to-one comparisons). At a door
   it is one face against ~500 members, with backlight, caps, sweat, masks and people walking past.
   So expect some wrong refusals (a queue at the desk) and rare wrong matches.
3. **Privacy law (DPDP Act 2023):** faces are personal data. We need clear consent, a stated purpose,
   deletion when a member leaves, and care if the box is stolen. The wording is a legal / privacy
   item for the owner and the lawyer (#31).
4. **Support:** the camera, the box, Wi-Fi, power cuts, updates and lighting are all ours to fix,
   at the client's gym.

## Recommendation
- For the door, use a ready-made machine (the gym's RS20 now, or a face terminal later). It already
  has the lock relay, works offline, has a warranty, and a face model resists photos better.
- Keep the camera idea as a backlog "Idea" for later, for a no-touch check-in where a mistake costs
  little (e.g. a tablet at the desk that marks the visit, with no door attached). That would use the
  free set above (YuNet + SFace + Silent-Face). Build it only with the consent screen in place.
- Our app's QR self check-in already gives a no-machine way to record visits.
