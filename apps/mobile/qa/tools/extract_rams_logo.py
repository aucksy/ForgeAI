"""Cut RAM'S FITNESS CLUB IMPACT's badge out of their proposal PDF as a see-through 512 px PNG.

Test asset only (gym branding, Level 1): the panel's logo upload and the branded opening are tried
with it. The picture is the client's own mark, so it is NOT committed to this public repo
(qa/test-assets/ is ignored) — run this again to get it back:

    python -I apps/mobile/qa/tools/extract_rams_logo.py [path/to/proposal.pdf] [out.png]

The badge is vector art on page 1 (a black circle with a yellow mark, about 89 pt across). It is
drawn at a high zoom with a transparent page, then everything outside the circle is masked out
so no page white is left at the corners.
"""
import sys
from pathlib import Path

import pymupdf
from PIL import Image, ImageDraw

PDF = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(r"D:\Apps\ForgeAI\Clients\RAMs\Gym Mobile App Proposal.pdf")
OUT = Path(sys.argv[2]) if len(sys.argv) > 2 else Path(__file__).resolve().parents[1] / "test-assets" / "rams-logo-512.png"
SIZE = 512


def badge_rect(page: pymupdf.Page) -> pymupdf.Rect:
    """The biggest roughly square filled shape near the top-left: the badge's outer circle."""
    best = None
    for d in page.get_drawings():
        r = d.get("rect")
        if r is None or d.get("fill") is None:
            continue
        if r.y0 > page.rect.height / 3 or abs(r.width - r.height) > 2 or r.width < 40:
            continue
        if best is None or r.width > best.width:
            best = r
    if best is None:
        raise SystemExit("No badge found on page 1")
    return best


def main() -> None:
    doc = pymupdf.open(PDF)
    page = doc[0]
    rect = badge_rect(page)
    zoom = SIZE / rect.width
    pix = page.get_pixmap(matrix=pymupdf.Matrix(zoom, zoom), clip=rect, alpha=True)
    img = Image.frombytes("RGBA", (pix.width, pix.height), pix.samples).resize((SIZE, SIZE), Image.LANCZOS)
    # Keep only the circle (anti-aliased edge: draw the mask 4x and shrink it).
    big = Image.new("L", (SIZE * 4, SIZE * 4), 0)
    ImageDraw.Draw(big).ellipse((0, 0, SIZE * 4 - 1, SIZE * 4 - 1), fill=255)
    mask = big.resize((SIZE, SIZE), Image.LANCZOS)
    alpha = Image.composite(img.getchannel("A"), Image.new("L", (SIZE, SIZE), 0), mask)
    img.putalpha(alpha)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    img.save(OUT, optimize=True)
    print(f"{OUT} {img.size} from {rect}")


if __name__ == "__main__":
    main()
