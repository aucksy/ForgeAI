#!/usr/bin/env node
/**
 * The admin app's icon (16 Oct 2026, owner: "It should be a little different... currently
 * identical to the member app icon"). The installed admin app (the gym panel: owner, desk, trainers) gets the
 * member app's mark with the colours swapped: an ember tile, a dark hexagon, an ember star.
 * Same family at a glance, never mistaken for the member app on a phone that has both.
 *
 * Source: the member app's white mark (apps/mobile/scripts/icon-src/mark-white-1024.png), used as
 * a mask, so the shape always matches the member icon. New file names (admin-*.png) make Chrome
 * notice the change and redraw an already installed icon.
 *
 * Run from apps/dashboard:   node scripts/make-admin-icons.mjs
 */
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MARK = join(ROOT, '..', 'mobile', 'scripts', 'icon-src', 'mark-white-1024.png');
const OUT = join(ROOT, 'public', 'icons');

// The mark art fills ~0.82 of its own square; 0.66 puts the hexagon at ~0.54 of the tile, inside
// the 0.8 circle a "maskable" icon may be cut to, with room to breathe.
const MARK_FRAC = 0.66;

const markB64 = (await readFile(MARK)).toString('base64');

function render(size) {
  const m = Math.round(size * MARK_FRAC);
  const o = (size - m) / 2;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
    '<defs>' +
    '<linearGradient id="tile" x1="0" y1="0" x2="1" y2="1">' +
    '<stop offset="0" stop-color="#F89A55"/><stop offset="1" stop-color="#E2541C"/></linearGradient>' +
    '<radialGradient id="glow" cx="0.78" cy="0.16" r="0.55">' +
    '<stop offset="0" stop-color="#FFD2A8" stop-opacity="0.45"/><stop offset="1" stop-color="#FFD2A8" stop-opacity="0"/></radialGradient>' +
    `<mask id="mark"><image href="data:image/png;base64,${markB64}" x="${o}" y="${o}" width="${m}" height="${m}"/></mask>` +
    '</defs>' +
    `<rect width="${size}" height="${size}" fill="url(#tile)"/>` +
    `<rect width="${size}" height="${size}" fill="url(#glow)"/>` +
    `<rect width="${size}" height="${size}" fill="#0E0F14" mask="url(#mark)"/>` +
    '</svg>';
  return new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng();
}

for (const size of [180, 192, 512]) {
  const buf = render(size);
  await writeFile(join(OUT, `admin-${size}.png`), buf);
  console.log(`  public/icons/admin-${size}.png  (${buf.length} bytes)`);
}
console.log('done.');
