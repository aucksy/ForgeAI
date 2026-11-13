"""Fetch and unpack the CC0 MakeHuman assets the pipeline needs. Plain Python (no Blender).

Run once per machine:  python setup_assets.py
Everything used here is CC0 (no credit needed); see assets/LICENSES.md.
"""
import os, sys, zipfile, urllib.request, json

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DL = os.environ.get("FORGEANIM_DL", "D:/Tools/_dl/mh")
DEST = os.path.join(ROOT, "assets", "mh")

PACKS = {
    "makehuman_system_assets_cc0.zip": "https://files2.makehumancommunity.org/asset_packs/makehuman_system_assets/makehuman_system_assets_cc0.zip",
    "skins02_cc0.zip": "https://files2.makehumancommunity.org/asset_packs/skins02/skins02_cc0.zip",
}
# (zip, path prefix inside the zip)
WANT = [
    ("makehuman_system_assets_cc0.zip", "hair/short02/"),
    ("makehuman_system_assets_cc0.zip", "eyes/high-poly/"),
    ("makehuman_system_assets_cc0.zip", "eyes/materials/brown"),
    ("makehuman_system_assets_cc0.zip", "eyebrows/eyebrow001/"),
    ("makehuman_system_assets_cc0.zip", "eyelashes/eyelashes01/"),
    ("makehuman_system_assets_cc0.zip", "clothes/shoes05/"),   # white trainers, drawn look (R-490)
    ("skins02_cc0.zip", "skins/mindfront_aksel_skin/"),
    ("skins02_cc0.zip", "packs/skins02.json"),
]

def fetch(name, url):
    path = os.path.join(DL, name)
    if os.path.isfile(path):
        return path
    legacy = os.path.join(DL, name.replace("makehuman_", ""))   # first manual download used the short name
    if os.path.isfile(legacy):
        return legacy
    os.makedirs(DL, exist_ok=True)
    print("downloading", url)
    urllib.request.urlretrieve(url, path)
    return path

class RangeFile:
    """A read-only, seekable view of a remote file over HTTP Range requests (11 Nov 2026: the MakeHuman
    server sends ~40 KB/s, so the 280 MB system pack took hours; the few files we need are under 20 MB)."""
    def __init__(self, url, block=1 << 20):
        self.url, self.pos, self.block, self.cache = url, 0, block, {}
        req = urllib.request.Request(url, method="HEAD")
        self.size = int(urllib.request.urlopen(req, timeout=60).headers["Content-Length"])
    def seekable(self): return True
    def readable(self): return True
    def tell(self): return self.pos
    def seek(self, off, whence=0):
        self.pos = off if whence == 0 else (self.pos + off if whence == 1 else self.size + off)
        return self.pos
    def _blk(self, i):
        if i not in self.cache:
            a = i * self.block; b = min(self.size, a + self.block) - 1
            for attempt in range(5):
                try:
                    r = urllib.request.Request(self.url, headers={"Range": f"bytes={a}-{b}"})
                    self.cache[i] = urllib.request.urlopen(r, timeout=300).read(); break
                except Exception:
                    if attempt == 4: raise
        return self.cache[i]
    def read(self, n=-1):
        if n is None or n < 0: n = self.size - self.pos
        n = max(0, min(n, self.size - self.pos)); out = bytearray()
        while n > 0:
            i, o = divmod(self.pos, self.block); chunk = self._blk(i)[o:o + n]
            out += chunk; self.pos += len(chunk); n -= len(chunk)
        return bytes(out)
    def close(self): pass


def open_zip(name, url):
    local = os.path.join(DL, name)
    legacy = os.path.join(DL, name.replace("makehuman_", ""))
    for p in (local, legacy):
        if os.path.isfile(p):
            return zipfile.ZipFile(p)
    if os.environ.get("FORGEANIM_FULL_DL"):
        return zipfile.ZipFile(fetch(name, url))
    print("reading only the needed files from", url)
    return zipfile.ZipFile(RangeFile(url, block=256 << 10))


def main():
    if os.path.isfile(os.path.join(DEST, "packs", "skins02.json")) and os.path.isdir(os.path.join(DEST, "skins", "mindfront_aksel_skin"))             and os.path.isfile(os.path.join(DEST, "clothes", "shoes05", "shoes05.mhclo")):
        print("assets already in", DEST); return
    os.makedirs(DEST, exist_ok=True)
    zips = {n: open_zip(n, u) for n, u in PACKS.items()}
    n = 0
    for zname, prefix in WANT:
        for member in zips[zname].namelist():
            if member.startswith(prefix) and not member.endswith("/"):
                zips[zname].extract(member, DEST); n += 1
    lic = json.load(open(os.path.join(DEST, "packs", "skins02.json")))["mindfront_aksel_skin"]["license"]
    assert lic == "CC0", lic
    print("extracted", n, "files to", DEST)

if __name__ == "__main__":
    main()
