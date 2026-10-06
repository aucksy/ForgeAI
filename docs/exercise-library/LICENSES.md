# Exercise library — where everything comes from (Phase 2, 6 Oct 2026)

## Text: ForgeAI's own
Names, steps, muscles, log types and links in `part_*.json` were written for ForgeAI
(drafted with AI from general exercise knowledge, checked by `apps/mobile/scripts/build-exercise-catalog.py`).
No sentence was copied from another dataset or website. Exercise names and muscle facts are
not protected.

## Pictures: Everkinetic (free, CC BY-SA 4.0)
- Source: https://github.com/everkinetic/data — open data from everkinetic.com, created by Greg Priday.
- Licence: Creative Commons Attribution-ShareAlike 4.0 International
  (https://creativecommons.org/licenses/by-sa/4.0/). The original site released the drawings
  under CC BY-SA (2010) and later CC BY (2012); the repository is CC BY-SA 4.0, which we follow.
- What we changed: black-on-white line art recoloured to light lines on a transparent background
  (for the dark theme), rendered at 560 px, saved as lossless WebP, plus a 128 px thumbnail.
  Built by `apps/mobile/scripts/build-exercise-media.py`.
- Share-alike: the changed pictures in `apps/mobile/assets/exercises/` are shared under the same
  licence, CC BY-SA 4.0. The app's code is not affected.
- Attribution in the app: every demo sheet showing a library drawing says
  "Drawing: Everkinetic, CC BY-SA 4.0, recoloured" and links to the licence.
- Coverage: only the exercises whose `ek` field is set have a drawing — 175 of 402 (each one
  checked by eye against its name; several Everkinetic titles are wrong). The rest show their
  steps and say on screen that there is no moving demo yet. Size: 525 files, 4.3 MB.
- Rebuild: `python scripts/build-exercise-catalog.py ../../docs/exercise-library` (text) and
  `python scripts/build-exercise-media.py <merged.json from --out-json>` (pictures), from `apps/mobile`.

## Rejected: free-exercise-db (yuhonas) and wrkout/exercises.json
Labelled "public domain", but the photos and the instruction text were copied from
bodybuilding.com: the upstream author says so (wrkout CONTRIBUTING.md, 2020), a reverse image
search traced them there (wrkout issue #305), and a pixel comparison on 6 Oct 2026 matched 3 of 3
photos to bodybuilding.com's archived originals (mean difference 1.4–2.1 of 255). Not used, in any form.

## Paid options (not bought — owner decision pending)
- Gymvisual — owner of the "ExerciseDB" GIFs; ~$0.90 per GIF after 5 items (~$405 for 450);
  licence §6.1 names Android/iOS apps; non-transferable; §2 lets the owner replace media on notice.
- ExerciseAnimatic — $599 one-time for 2,600+ videos; licence names apps sold to gyms.
- MoveKit — ₹7,299 for 424 loopable clips; needs written OK on its "no extraction" clause (§3).
Side-by-side of the same 5 exercises: `Resources/Exercise-Demo-Options-v1.html` (outside the repo).
