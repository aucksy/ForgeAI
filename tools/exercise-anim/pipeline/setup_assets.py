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

def main():
    os.makedirs(DEST, exist_ok=True)
    zips = {n: zipfile.ZipFile(fetch(n, u)) for n, u in PACKS.items()}
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
