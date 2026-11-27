# Our build framework against Google's Elephant-Goldfish Model (F235, Phase C step zero)

Written 27 Nov 2026. Source: github.com/google/elephant-goldfish-model (Apache 2.0, "not an officially supported
Google product"): README.md, docs/designs/architecture.md (dated 2026-06-06), docs/getting_started.md,
skills/egm-review/SKILL.md. Not read: agents/*.md and resources/document_standards/*.md, so the detailed criteria of
most reviewer personas are not known.

## What EGM is

- The "elephant" (the agent that holds all the context) writes a design document before any code.
- "Goldfish" reviewers are fresh helpers with no memory of the chat. They see only the document and the files it
  links. Their aim: check "the design, its clarity, its fit with the code, and its implementation plan."
- Review stages: Zoom Out (simplicity, reuse), Comprehension (a naive reader: is it self-contained?), Critic
  (Design Critic: scale, failure modes; Structural; Style), Zoom Out again, Implementation Readiness (file paths,
  signatures, test cases). A synthesizer merges and de-duplicates the findings.
- Stop rule: each stage runs once, "max 1 re-audit"; after that, leftover findings are recorded as accepted
  trade-offs. The human picks which findings to fix.
- The human approves. "A saved design or resolved report alone does not establish approval."
- It covers design only. A review "does not replace tests or human judgment." For a simple bug fix: "Do not
  forcibly use the design-first process"; a Lite skill exists for small changes.
- The plan ends with a "Target Scope & File Boundary": the files the build may change.

## What they do better than us

1. They review the plan BEFORE code. Our fresh eyes look only after the build, when a wrong design is expensive.
2. Reviewers get no context on purpose, so they cannot share the builder's blind spots.
3. A "naive reader" reviewer checks the plan makes sense to someone new.
4. A file boundary limits what a build may touch.
5. A hard stop on review rounds, so reviews never loop.
6. A drift report compares the documents with the code.

## What we do better than them

1. Tests first, from plain "user sees / must NOT see" lines.
2. Machine gates (CI, phone UAT, picture checks), delivered-version check, escape log.
3. Questions for money, privacy, Indian time, phone and watch, and the product map (blast radius).
4. EGM has nothing after the design. Most of our 2,463 problems were in places a design review alone would not
   reach (numbers, looks, regressions, old promises).

## What we copy (proposal, waits for his yes)

- Design note before code for Full-lane changes (G1), with the file boundary.
- Three goldfish reviewers on the note (G2): Newcomer (= EGM Comprehension), Critic (= EGM Design Critic + our
  lenses), Promises-and-money (ours).
- Stop rule: at most 2 rounds, then his decision or an accepted risk.
- "Saved is not approved": product choices need his yes.
- Drift report folded into keeping the product map alive.

## What we do not copy

- All 8 reviewers over 5 stages for every change: too costly for our usage limit, and EGM itself says it gives
  "a lot of feedback by design".

The full framework: D:\Brain\Dev-Framework\2026-11-27-no-gaps-framework.md (the owner's notes, not in this repo).
