# Exercise demo clips

Grey 3D athlete, target muscles in ForgeAI ember-red, a 3-second seamless loop per exercise.
Everything is CC0 or our own code: no credit screen, no licence fee.

- `specs/<key>.json` — one recipe per exercise (key, muscles and steps come from `docs/exercise-library`).
- `pipeline/` — Blender 4.5 LTS + MPFB scripts. `make_clip.py` (preview / full), `encode.py` (WebP, MP4, poster).
- `.github/workflows/exercise-clips.yml` — renders recipes in the cloud and publishes to the `exercise-clips` release.

How-to for agents: the `making-forgeai-exercise-clips` skill (recipe format in its `RECIPES.md`).

## Parts and licences
| Part | Source | Licence |
|---|---|---|
| Body, muscle shapes, skeleton | MakeHuman / MPFB 2.0.18 base mesh, targets, default rig | CC0 |
| Muscle detail (normal map) | Mindfront "Aksel" skin, MakeHuman skins02 pack | CC0 |
| Hair, eyes, eyebrows | MakeHuman system assets (short02, high-poly eyes, eyebrow001) | CC0 |
| Muscle masks, shorts, dumbbell, bench, shaders | this folder | ours |
| MPFB add-on (tool only, not shipped) | extensions.blender.org | GPL-3 |
