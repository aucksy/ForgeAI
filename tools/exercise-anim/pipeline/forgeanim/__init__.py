"""ForgeAI exercise animation pipeline (runs inside Blender 4.5 LTS with the MPFB extension)."""
import os

PIPELINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROOT = os.path.dirname(PIPELINE)
ASSETS = os.path.join(ROOT, "assets")
MH = os.path.join(ASSETS, "mh")
MAPS = os.path.join(ASSETS, "maps")
OUT = os.path.join(ROOT, "out")
