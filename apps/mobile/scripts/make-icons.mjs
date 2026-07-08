#!/usr/bin/env node
/**
 * ForgeAI icon pipeline — ONE inline SVG master -> every app icon.
 *
 * Master mark: bold geometric "F" whose top arm IS a barbell (long bar, two
 * plates, sleeve tip) plus a rising ember spark. Ember gradient
 * (#FF8B4A -> #F0570F) on deep #07080C rounded-square background.
 *
 * Run from repo root:   node scripts/make-icons.mjs
 * Outputs (assets/images/):
 *   icon.png                     1024  mark on rounded-square bg + subtle glow
 *   android-icon-foreground.png  1024  mark only, transparent (adaptive icon)
 *   android-icon-monochrome.png  1024  solid-white mark, transparent
 *   splash-icon.png               512  mark only, transparent
 *   favicon.png                    48  mini icon with bg
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'images');

const BG = '#07080C';
const EMBER = ['#FF8B4A', '#F0570F']; // gradient sweep, top-left -> bottom-right
const EMBER_GLOW = '#FF7A3B';
const EMBER_BRIGHT = '#FFA043';

/**
 * The mark is authored in a 512x512 box (kept in sync with
 * src/components/ui/Logo.tsx). After the -40/+22 centering shift its ink
 * spans x 80..432, y 74..438 — centered on (256, 256); the farthest ink
 * point from center is r ~= 241 (stem's bottom-left rounded corner).
 */
const MARK_BOX = 512;

function markShapes(mono) {
  const fill = mono ? '#FFFFFF' : 'url(#ember)';
  const spark = mono ? '#FFFFFF' : EMBER[0];
  const dot = mono ? '#FFFFFF' : EMBER_BRIGHT;
  return `<g transform="translate(-40 22)">
    <!-- barbell bar doubles as the F's top arm; runs under both plates -->
    <rect x="120" y="96" width="352" height="72" rx="30" fill="${fill}"/>
    <rect x="330" y="52" width="48" height="160" rx="22" fill="${fill}"/>
    <rect x="398" y="72" width="40" height="120" rx="20" fill="${fill}"/>
    <!-- F stem + mid arm -->
    <rect x="120" y="96" width="72" height="320" rx="30" fill="${fill}"/>
    <rect x="120" y="252" width="168" height="64" rx="28" fill="${fill}"/>
    <!-- rising ember spark + trailing dot -->
    <path d="M386 262 Q392 300 430 306 Q392 312 386 350 Q380 312 342 306 Q380 300 386 262 Z" fill="${spark}"/>
    <circle cx="448" cy="240" r="13" fill="${dot}"/>
  </g>`;
}

function buildSvg({ canvas, markBoxPx, background = false, mono = false }) {
  const scale = markBoxPx / MARK_BOX;
  const offset = (canvas - markBoxPx) / 2;
  const rx = Math.round(canvas * 0.176); // rounded-square bg radius
  // Gradient coords are userSpaceOnUse in the mark's local (pre-shift) space,
  // so one continuous sweep covers the whole monogram instead of restarting
  // per shape (which objectBoundingBox would do).
  const defs = mono
    ? ''
    : `<defs>
    <linearGradient id="ember" x1="120" y1="52" x2="420" y2="416" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="${EMBER[0]}"/>
      <stop offset="1" stop-color="${EMBER[1]}"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.42" r="0.65">
      <stop offset="0" stop-color="${EMBER_GLOW}" stop-opacity="0.16"/>
      <stop offset="1" stop-color="${EMBER_GLOW}" stop-opacity="0"/>
    </radialGradient>
  </defs>`;
  const bg = background
    ? `<rect width="${canvas}" height="${canvas}" rx="${rx}" fill="${BG}"/>
  <rect width="${canvas}" height="${canvas}" rx="${rx}" fill="url(#glow)"/>`
    : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${canvas}" height="${canvas}" viewBox="0 0 ${canvas} ${canvas}">
  ${defs}${bg}
  <g transform="translate(${offset} ${offset}) scale(${scale})">${markShapes(mono)}</g>
</svg>`;
}

const TARGETS = [
  { file: 'icon.png', canvas: 1024, markBoxPx: 844, background: true },
  // Adaptive-icon safe zone = central 66% circle (Pixel uses a plain circle
  // mask). markBoxPx 708 puts the mark's farthest corner at
  // 241 * (708/512) ~= 333 px from center — inside the 338 px safe radius.
  { file: 'android-icon-foreground.png', canvas: 1024, markBoxPx: 708 },
  { file: 'android-icon-monochrome.png', canvas: 1024, markBoxPx: 708, mono: true },
  { file: 'splash-icon.png', canvas: 512, markBoxPx: 512 },
  // At 48 px push the mark slightly past the box for legibility.
  { file: 'favicon.png', canvas: 48, markBoxPx: 54, background: true },
];

await mkdir(OUT_DIR, { recursive: true });
for (const target of TARGETS) {
  const svg = buildSvg(target);
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: target.canvas } })
    .render()
    .asPng();
  await writeFile(join(OUT_DIR, target.file), png);
  console.log(`wrote ${target.file}  ${target.canvas}x${target.canvas}  ${png.length} bytes`);
}
