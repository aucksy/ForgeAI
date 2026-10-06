#!/usr/bin/env node
/**
 * Render SVG files to PNG with @resvg/resvg-js (no ImageMagick/sharp on the build machine).
 * Used by scripts/build-exercise-media.py, which then recolours and encodes WebP.
 *
 *   node scripts/render-svg.mjs <maxSidePx> <in1.svg> <out1.png> [<in2.svg> <out2.png> …]
 *
 * Each SVG is scaled so its LONGER side is <maxSidePx>; both frames of an exercise share
 * one viewBox, so equal settings keep the figure aligned between the two frames.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { Resvg } from '@resvg/resvg-js';

const [, , maxArg, ...pairs] = process.argv;
const maxSide = Number(maxArg);
if (!Number.isFinite(maxSide) || maxSide <= 0 || pairs.length === 0 || pairs.length % 2 !== 0) {
  console.error('usage: render-svg.mjs <maxSidePx> <in.svg> <out.png> [...]');
  process.exit(2);
}

for (let i = 0; i < pairs.length; i += 2) {
  const svg = await readFile(pairs[i], 'utf8');
  const vb = /viewBox="\s*[-\d.]+\s+[-\d.]+\s+([\d.]+)\s+([\d.]+)\s*"/.exec(svg);
  const w = vb ? Number(vb[1]) : 300;
  const h = vb ? Number(vb[2]) : 300;
  const fitTo = w >= h ? { mode: 'width', value: maxSide } : { mode: 'height', value: maxSide };
  const png = new Resvg(svg, { fitTo, background: 'rgba(0,0,0,0)' }).render().asPng();
  await writeFile(pairs[i + 1], png);
}
