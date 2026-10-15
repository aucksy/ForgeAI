"""Derive a cavity (groove) map from the CC0 Aksel normal map. Plain Python: numpy + opencv.

Grooves between muscles = places where the surface normals converge (negative divergence).
Output: assets/maps/cavity.png (grey: 0 = flat, 255 = deep groove), same UV layout as the body.
"""
import os, sys
import numpy as np, cv2

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC = os.path.join(ROOT, "assets", "mh", "skins", "mindfront_aksel_skin", "Aksel_Skin_NRM.png")
OUT = os.path.join(ROOT, "assets", "maps")

def main():
    os.makedirs(OUT, exist_ok=True)
    img = cv2.imread(SRC, cv2.IMREAD_UNCHANGED)[:, :, :3][:, :, ::-1].astype(np.float32) / 255.0  # RGB
    n = img * 2.0 - 1.0
    nx, ny = n[:, :, 0], n[:, :, 1]
    # remove pore/hair noise first: grooves are wide features
    nx = cv2.GaussianBlur(nx, (0, 0), 3.0); ny = cv2.GaussianBlur(ny, (0, 0), 3.0)
    dnx = cv2.Sobel(nx, cv2.CV_32F, 1, 0, ksize=3) / 8.0
    dny = cv2.Sobel(ny, cv2.CV_32F, 0, 1, ksize=3) / 8.0
    div = dnx - dny  # image rows grow downward, normal-map green grows upward (OpenGL)
    cav = np.clip(-div, 0, None)
    cav = cv2.GaussianBlur(cav, (0, 0), 3.0)
    hi = np.percentile(cav[cav > 0], 99.0)
    cav = np.clip(cav / hi, 0, 1) ** 0.8
    cv2.imwrite(os.path.join(OUT, "cavity.png"), (cav * 255).astype(np.uint8))
    convex = np.clip(div, 0, None); convex = cv2.GaussianBlur(convex, (0, 0), 1.5)
    convex = np.clip(convex / np.percentile(convex[convex > 0], 99.3), 0, 1)
    cv2.imwrite(os.path.join(OUT, "convex.png"), (convex * 255).astype(np.uint8))
    prev = cv2.resize((cav * 255).astype(np.uint8), (1024, 1024))
    cv2.imwrite(os.path.join(OUT, "_cavity_preview.png"), 255 - prev)
    # cleaned normal map: drop body hair and pores, keep the muscle forms
    raw = cv2.imread(SRC, cv2.IMREAD_UNCHANGED)[:, :, :3].astype(np.float32) / 255.0  # BGR
    v = raw * 2 - 1
    sigma = float(sys.argv[1]) if len(sys.argv) > 1 else 2.0
    v = cv2.GaussianBlur(v, (0, 0), sigma)
    v /= np.linalg.norm(v, axis=2, keepdims=True) + 1e-6
    cv2.imwrite(os.path.join(OUT, sys.argv[2] if len(sys.argv) > 2 else "body_nrm.png"), np.clip((v + 1) * 0.5 * 255 + 0.5, 0, 255).astype(np.uint8))
    print("ok", cav.shape)

if __name__ == "__main__":
    main()
