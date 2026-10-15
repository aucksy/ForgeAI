"""Tile _sheet/<key>_f.png + _b.png into one labelled grid. Plain Python (opencv)."""
import sys, os, cv2, numpy as np
d = sys.argv[1]; out = sys.argv[2]; keys = sys.argv[3].split(",")
# app labels (apps/mobile/src/tracker/catalog/muscles.ts MUSCLE_LABEL)
LABEL = {"chest": "Chest", "front_delts": "Front shoulders", "side_delts": "Side shoulders", "rear_delts": "Rear shoulders",
         "lats": "Lats", "upper_back": "Upper back", "traps": "Traps", "lower_back": "Lower back", "biceps": "Biceps",
         "triceps": "Triceps", "forearms": "Forearms", "abs": "Abs", "obliques": "Obliques", "glutes": "Glutes",
         "quads": "Quads", "hamstrings": "Hamstrings", "adductors": "Inner thighs", "abductors": "Outer hips", "calves": "Calves"}
cells = []
for k in keys:
    f = cv2.imread(os.path.join(d, f"{k}_f.png")); b = cv2.imread(os.path.join(d, f"{k}_b.png"))
    if f is None or b is None:
        continue
    c = np.hstack([f[20:, 50:250], b[20:, 50:250]])
    lab = np.full((34, c.shape[1], 3), 255, np.uint8)
    cv2.putText(lab, LABEL.get(k, k), (8, 24), cv2.FONT_HERSHEY_SIMPLEX, 0.65, (30, 30, 30), 1, cv2.LINE_AA)
    cells.append(np.vstack([lab, c]))
cols = 5
rows = []
for i in range(0, len(cells), cols):
    r = cells[i:i + cols]
    while len(r) < cols:
        r.append(np.full_like(cells[0], 255))
    rows.append(np.hstack(r))
cv2.imwrite(out, np.vstack(rows))
