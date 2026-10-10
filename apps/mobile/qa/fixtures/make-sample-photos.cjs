#!/usr/bin/env node
/**
 * Two plain SAMPLE pictures for the device QA's progress-photo steps (Phase 3). They say
 * "Sample photo" on them, so no screenshot can be mistaken for a real person's photo.
 * Audit Phase 5 (PG-18): picture 1 is TALL (600 x 800) and picture 2 is WIDE (800 x 600), so
 * part D's compare puts a wide photo next to a tall one (both must show whole). Neither has a
 * date of its own (PNG, no EXIF), so the app must ask "When was this photo taken?" (PG-16).
 *   node qa/fixtures/make-sample-photos.cjs
 */
const fs = require('fs');
const path = require('path');
const { Resvg } = require('@resvg/resvg-js');

for (const [n, w, h, top, bottom] of [
  [1, 600, 800, '#2B3A55', '#151B28'],
  [2, 800, 600, '#3A2B55', '#1B1528'],
]) {
  // The figure is drawn for 600 x 800 and centred; the wide picture gets coloured side bands
  // ("arms") at its far left and right, which a cover-cropped compare would cut off.
  const dx = (w - 600) / 2;
  const s = Math.min(1, h / 800);
  const bands =
    w > h
      ? `<rect x="0" y="0" width="60" height="${h}" fill="#C8642D"/><rect x="${w - 60}" y="0" width="60" height="${h}" fill="#C8642D"/>`
      : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient></defs>
  <rect width="${w}" height="${h}" fill="url(#g)"/>
  ${bands}
  <g transform="translate(${dx + (600 - 600 * s) / 2} 0) scale(${s})">
    <circle cx="300" cy="230" r="70" fill="#5A6680"/>
    <path d="M190 330 Q300 300 410 330 L440 560 Q300 600 160 560 Z" fill="#5A6680"/>
    <rect x="140" y="660" width="320" height="70" rx="35" fill="#000" opacity="0.45"/>
    <text x="300" y="707" font-size="34" font-family="sans-serif" font-weight="700" fill="#fff" text-anchor="middle">SAMPLE PHOTO ${n}</text>
  </g>
</svg>`;
  const png = new Resvg(svg, { font: { loadSystemFonts: true } }).render().asPng();
  fs.writeFileSync(path.join(__dirname, `sample-progress-${n}.png`), png);
  console.log('wrote', `sample-progress-${n}.png`, w, 'x', h, png.length);
}
