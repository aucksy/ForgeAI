#!/usr/bin/env node
/**
 * MettleUp icon pipeline (first MettleUp release, 0.56.0: logo E "Forged").
 *
 * The icons are no longer resized here. They are drawn, each at its own size, by the brand
 * generator in branding/mettleup (`python branding/mettleup/_src/make_assets.py`; rules and sizes
 * in branding/mettleup/BRAND.md): the adaptive layers inside Android's safe zone, the Android 13
 * themed (monochrome) layer, the splash at Android 12's 288 dp canvas, the small-size M for the
 * status bar. This script only copies those finished files into the app, the same files
 * `python branding/mettleup/install.py --only mobile --apply` copies (that one also sets the
 * colours in app.json and colors.xml; prefer it).
 *
 * Until 24 Oct 2026 this resized the old ForgeAI masters in scripts/icon-src, so running it again
 * would have brought the old logo back. scripts/icon-src now holds the MettleUp mark only:
 *   hero-1024.png        the full launcher icon (= assets/images/icon.png)
 *   mark-1024.png        the mark in its colours on transparent, ~0.82 of the square
 *   mark-white-1024.png  the same shape in white (the owner panel's admin icon uses it as a mask)
 *
 * CI builds android/ directly (no prebuild), so the native res/ files are what actually ship.
 * Run from apps/mobile:   node scripts/make-icons.mjs
 */
import { copyFile, mkdir, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BRAND = join(ROOT, '..', '..', 'branding', 'mettleup', 'android');
const ASSETS = join(ROOT, 'assets', 'images');
const RES = join(ROOT, 'android', 'app', 'src', 'main', 'res');
const DENSITIES = ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi'];

/** [from, to] pairs, as install.py's mobile and wear groups. */
const files = [];
for (const d of DENSITIES) {
  for (const f of ['ic_launcher_foreground.png', 'ic_launcher_background.png', 'ic_launcher_monochrome.png', 'ic_launcher.png', 'ic_launcher_round.png']) {
    files.push([join(BRAND, 'res', `mipmap-${d}`, f), join(RES, `mipmap-${d}`, f)]);
  }
  files.push([join(BRAND, 'res', `drawable-${d}`, 'splashscreen_logo.png'), join(RES, `drawable-${d}`, 'splashscreen_logo.png')]);
}
for (const f of ['ic_launcher.xml', 'ic_launcher_round.xml']) files.push([join(BRAND, 'res', 'mipmap-anydpi-v26', f), join(RES, 'mipmap-anydpi-v26', f)]);
files.push([join(BRAND, 'res', 'drawable', 'notification_icon.xml'), join(RES, 'drawable', 'notification_icon.xml')]);
for (const f of ['icon.png', 'android-icon-foreground.png', 'android-icon-background.png', 'android-icon-monochrome.png', 'splash-icon.png', 'favicon.png', 'notification-icon.png']) {
  files.push([join(BRAND, 'expo', f), join(ASSETS, f)]);
}
for (const f of ['ic_launcher.xml', 'ic_stat_forge.xml']) {
  files.push([join(BRAND, 'wear', 'res', 'drawable', f), join(ROOT, 'android', 'wear', 'src', 'main', 'res', 'drawable', f)]);
}

const missing = files.filter(([from]) => !existsSync(from));
if (missing.length) {
  console.error(`Missing brand files (run python branding/mettleup/_src/make_assets.py):\n${missing.map(([f]) => `  ${f}`).join('\n')}`);
  process.exit(1);
}

/** A PNG's width and height from its IHDR, to say when a size changes. */
const dims = async (p) => {
  try {
    const b = await readFile(p);
    return b.readUInt32BE(0) === 0x89504e47 ? `${b.readUInt32BE(16)}x${b.readUInt32BE(20)}` : null;
  } catch {
    return null;
  }
};

for (const [from, to] of files) {
  await mkdir(dirname(to), { recursive: true });
  const before = to.endsWith('.png') ? await dims(to) : null;
  // An old .webp twin would be a duplicate resource for aapt.
  if (to.includes(`${join('res', 'mipmap-')}`) && to.endsWith('.png')) await rm(to.replace(/\.png$/, '.webp'), { force: true });
  await copyFile(from, to);
  const after = to.endsWith('.png') ? await dims(to) : null;
  console.log(`  ${to.replace(ROOT, '.')}${before && after && before !== after ? `  (size ${before} -> ${after})` : ''}`);
}
console.log(`done: ${files.length} files. Colours in app.json / colors.xml: python branding/mettleup/install.py --only mobile`);
