#!/usr/bin/env node
/**
 * ForgeAI icon pipeline — resize the designer's master PNG exports into every
 * app-icon output (Expo assets + native Android mipmaps + splash logo).
 *
 * Source of truth = the three master PNGs in scripts/icon-src/ (copied from the
 * "Forge AI App Icons" export set):
 *   hero-1024.png        full square launcher art (ember hexagon + compass star
 *                        on #07080C, subtle glow) — the composed icon.
 *   mark-1024.png        the mark alone on transparent (adaptive foreground / splash).
 *   mark-white-1024.png  solid-white mark on transparent (Android monochrome/themed).
 *
 * No sharp/ImageMagick on the build machine, so we resize by embedding each PNG
 * as a data-URI <image> inside an SVG and letting @resvg/resvg-js rasterise it at
 * the target size (round icons use an SVG circle clip-path).
 *
 * CI builds android/ directly (no prebuild), so the NATIVE res/mipmap-* files are
 * what actually ship — they are regenerated here too, as PNG (the old .webp are
 * deleted; Android resolves @mipmap/ic_launcher to either extension).
 *
 * Run from apps/mobile:   node scripts/make-icons.mjs
 */
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'scripts', 'icon-src');
const ASSETS = join(ROOT, 'assets', 'images');
const RES = join(ROOT, 'android', 'app', 'src', 'main', 'res');

// Adaptive-icon safe zone = central 72dp of the 108dp foreground (~0.667). The
// mark art already carries ~0.82 internal height, so drawing it at 0.80 of the
// canvas lands the hexagon at ~0.66 — inside the mask on every launcher shape.
const FG_SAFE = 0.8;

const heroB64 = (await readFile(join(SRC, 'hero-1024.png'))).toString('base64');
const markB64 = (await readFile(join(SRC, 'mark-1024.png'))).toString('base64');
const monoB64 = (await readFile(join(SRC, 'mark-white-1024.png'))).toString('base64');

/** Rasterise a master PNG centred in a square canvas (optionally circle-clipped). */
function render(b64, canvas, contentFrac, { round = false } = {}) {
  const content = Math.round(canvas * contentFrac);
  const offset = (canvas - content) / 2;
  const defs = round
    ? `<defs><clipPath id="c"><circle cx="${canvas / 2}" cy="${canvas / 2}" r="${canvas / 2}"/></clipPath></defs>`
    : '';
  const clip = round ? ' clip-path="url(#c)"' : '';
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${canvas}" height="${canvas}" viewBox="0 0 ${canvas} ${canvas}">` +
    `${defs}<image href="data:image/png;base64,${b64}" x="${offset}" y="${offset}" width="${content}" height="${content}"${clip}/></svg>`;
  return new Resvg(svg, { fitTo: { mode: 'width', value: canvas } }).render().asPng();
}

/** width from a PNG's IHDR (bytes 16..20, big-endian) — to match existing sizes. */
function pngWidth(buf) {
  return buf.readUInt32BE(16);
}

const write = async (path, buf) => {
  await writeFile(path, buf);
  console.log(`  ${path.replace(ROOT, '.')}  (${buf.length} bytes)`);
};

// ---------------------------------------------------------------- Expo assets
await mkdir(ASSETS, { recursive: true });
console.log('Expo assets:');
await copyFile(join(SRC, 'hero-1024.png'), join(ASSETS, 'icon.png')); // 1024, lossless
console.log('  ./assets/images/icon.png  (copied hero)');
await write(join(ASSETS, 'android-icon-foreground.png'), render(markB64, 1024, FG_SAFE));
await write(join(ASSETS, 'android-icon-monochrome.png'), render(monoB64, 1024, FG_SAFE));
await write(join(ASSETS, 'splash-icon.png'), render(markB64, 512, 0.9));
await write(join(ASSETS, 'favicon.png'), render(heroB64, 48, 1));

// ---------------------------------------------------------------- native mipmaps
const DENSITIES = [
  { dir: 'mipmap-mdpi', legacy: 48, adaptive: 108 },
  { dir: 'mipmap-hdpi', legacy: 72, adaptive: 162 },
  { dir: 'mipmap-xhdpi', legacy: 96, adaptive: 216 },
  { dir: 'mipmap-xxhdpi', legacy: 144, adaptive: 324 },
  { dir: 'mipmap-xxxhdpi', legacy: 192, adaptive: 432 },
];
console.log('Native mipmaps (webp -> png):');
for (const d of DENSITIES) {
  const dir = join(RES, d.dir);
  await mkdir(dir, { recursive: true });
  // Drop the stale .webp so aapt doesn't see duplicate ic_launcher resources.
  for (const name of ['ic_launcher', 'ic_launcher_round', 'ic_launcher_foreground', 'ic_launcher_monochrome']) {
    await rm(join(dir, `${name}.webp`), { force: true });
  }
  await write(join(dir, 'ic_launcher.png'), render(heroB64, d.legacy, 1));
  await write(join(dir, 'ic_launcher_round.png'), render(heroB64, d.legacy, 1, { round: true }));
  await write(join(dir, 'ic_launcher_foreground.png'), render(markB64, d.adaptive, FG_SAFE));
  await write(join(dir, 'ic_launcher_monochrome.png'), render(monoB64, d.adaptive, FG_SAFE));
}

// ---------------------------------------------------------------- native splash logo
// Keep the launch screen on-brand; regenerate each drawable-* splashscreen_logo.png
// at its EXISTING pixel size (from the committed file's IHDR).
console.log('Native splash logo:');
for (const d of ['drawable-mdpi', 'drawable-hdpi', 'drawable-xhdpi', 'drawable-xxhdpi', 'drawable-xxxhdpi']) {
  const path = join(RES, d, 'splashscreen_logo.png');
  let size;
  try {
    size = pngWidth(await readFile(path));
  } catch {
    continue; // density not present
  }
  await write(path, render(markB64, size, 1));
}

console.log('done.');
