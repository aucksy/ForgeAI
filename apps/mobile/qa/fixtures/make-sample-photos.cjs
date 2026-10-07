#!/usr/bin/env node
/**
 * Two plain SAMPLE pictures for the device QA's progress-photo steps (Phase 3). They say
 * "Sample photo" on them, so no screenshot can be mistaken for a real person's photo.
 *   node qa/fixtures/make-sample-photos.cjs
 */
const fs = require('fs');
const path = require('path');
const { Resvg } = require('@resvg/resvg-js');

for (const [n, top, bottom] of [
  [1, '#2B3A55', '#151B28'],
  [2, '#3A2B55', '#1B1528'],
]) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800">
  <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient></defs>
  <rect width="600" height="800" fill="url(#g)"/>
  <circle cx="300" cy="230" r="70" fill="#5A6680"/>
  <path d="M190 330 Q300 300 410 330 L440 560 Q300 600 160 560 Z" fill="#5A6680"/>
  <rect x="140" y="660" width="320" height="70" rx="35" fill="#000" opacity="0.45"/>
  <text x="300" y="707" font-size="34" font-family="sans-serif" font-weight="700" fill="#fff" text-anchor="middle">SAMPLE PHOTO ${n}</text>
</svg>`;
  const png = new Resvg(svg, { font: { loadSystemFonts: true } }).render().asPng();
  fs.writeFileSync(path.join(__dirname, `sample-progress-${n}.png`), png);
  console.log('wrote', `sample-progress-${n}.png`, png.length);
}
