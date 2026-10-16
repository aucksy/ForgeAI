# Exercise research format (v1)

One file per exercise: `research/<key>.json`. It is the ONLY place the facts live:
- the clip reads its muscle colours from it (`muscles[].tier`), so the picture can never drift from the research;
- when the owner approves an exercise, its rows are copied into the Excel register
  (`ForgeAI Exercise Research.xlsx`, one sheet per section below). Nothing is typed twice.

`status`: `draft` → `clip-matches` (every `clip_check` row passes) → `owner-approved` (he said "save it").
Only `owner-approved` exercises go into the Excel.

## Sections (each one becomes an Excel sheet; every row carries `key`)

### 1. exercise (sheet "Exercises", one row)
key, name, equipment, library_primary, library_secondary (copied from `docs/exercise-library`), status,
version (clip version that matches), researched_on, one_line_summary, evidence_grade (worst grade of the
rows that set the motion or the primary muscle).

### 2. setup (sheet "Setup", one row per item)
item (bench angle, stance width, grip, foot position, start position…), target, tolerance, why,
source_ids, grade.

### 3. movement (sheet "Movement", one row per joint measure)
joint, measure (plain definition, e.g. "elbow bend: 0° = straight"), start, end, path (how it gets there),
tolerance (± the clip may differ), source_ids, grade.
Must cover every joint that moves AND every joint that must stay still (trunk, wrist, shoulder blade).
Include the turn of the upper arm (the roll) so a twist bug can be caught.

### 4. muscles (sheet "Muscles", one row per muscle)
muscle (plain name), anatomy (Latin / head), mask_key (from `pipeline/forgeanim/muscles.py`, or `none`
if the mask does not exist yet), tier, glow, emg (value + unit + condition, e.g. "~30 % MVIC, 30° bench"),
role (what it does in this exercise), surface (where it sits on the skin, by landmarks), source_ids, grade.

**Tiers — the same rule for all 400+ exercises:**

| tier | glow | rule |
|---|---|---|
| primary | 1.0 (deep red) | The muscle the exercise is FOR, and top or joint-top in EMG. One muscle, two at most. |
| secondary | 0.35 (light red) | Clearly working: EMG at least ~40 % of the primary's, or a named helper in 2+ sources. Three at most. |
| stabiliser | 0 (not lit) | Holds a joint still (rotator cuff, core, forearm grip). Listed, never lit. |
| deep | 0 (not lit) | Works but lies under other muscles (supraspinatus, brachialis under biceps). Listed, never lit. |

Lighting a muscle the app calls "primary" must also match what a gym-goer expects to feel. If EMG and the
exercise's purpose disagree (front delt ≈ upper chest in an incline press), the purpose wins the primary
slot and the other muscle is secondary; write the reason in `role`.

### 5. tempo (sheet "Tempo", one row)
up_s, hold_top_s, down_s, pause_bottom_s, loop_s, source_ids.

### 6. mistakes (sheet "Mistakes", one row per mistake)
mistake, what it looks like, why it matters, source_ids. The clip must not show any of them.

### 7. sources (sheet "Sources", one row per source)
id (S1, S2…), citation (authors, year, title, journal), url, type (`emg` / `biomechanics` / `review` /
`guideline` / `textbook` / `coach`), what_it_gave.

**Evidence grade per row:** A = study on this exact exercise; B = study on a close variant (barbell for
dumbbell, other bench angle); C = guideline or textbook (ACE, NASM, NSCA, anatomy atlas); D = coach consensus
only. Peer-reviewed first. A number with no source is not allowed.

### 8. clip_check (sheet "Clip check", one row per check)
check, target, measured (from `measure_pose.py` / `measure_twist.py` / the rendered frames), pass (yes/no),
tool. Must include: every movement row, the twist checks (upper-arm roll range, elbow hinge drift, wrist
twist), and "primary muscle is the strongest red in the bottom, middle and top frames".
