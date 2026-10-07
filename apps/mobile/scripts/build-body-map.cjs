#!/usr/bin/env node
/**
 * Builds src/tracker/catalog/bodyMapPaths.ts — the body drawings behind the "muscles trained"
 * map (Phase 3) — from react-native-body-highlighter 3.2.0 (MIT, (c) 2022 ELABBASSI Hicham).
 * Only the drawing data is used (male and, since v0.25.1, female, front and back); the
 * package itself is NOT a dependency.
 *
 *   npm pack react-native-body-highlighter@3.2.0 && tar -xzf react-native-body-highlighter-3.2.0.tgz
 *   node scripts/build-body-map.cjs <path-to-unpacked>/package
 *
 * The drawings have coarser regions than ForgeAI's 20 muscles, so two are split by size, on
 * each side of the body:
 *  - back "upper-back": the tallest piece (the wing) is the lats, the smaller pieces on the
 *    shoulder blade are the upper back;
 *  - back "gluteal": the shortest piece (the small top one) is the outer hip (abductors), the
 *    big one the glutes.
 * Deltoids are the front shoulders on the front view and the rear shoulders on the back
 * view; side shoulders light both (see engine/bodyMap). Head, hands, knees, shins, ankles
 * and feet are drawn as plain body. The male figure's hair is left out (as in Phase 3); the
 * female figure's hair is drawn as plain body — her back view has no head without it.
 *
 * The male views keep the package's frame (724 × 1448 each). The female drawing is taller in
 * its own units, so its frame is worked out to match the male one: each view 1 wide : 2 high,
 * the figure filling the same share of the height with the same room above the head. Every
 * screen and the share picture can then draw either figure in the same box.
 */
const fs = require('fs');
const path = require('path');
const { Resvg } = require('@resvg/resvg-js');

const pkg = process.argv[2];
if (!pkg) {
  console.error('usage: build-body-map.cjs <unpacked package dir>');
  process.exit(2);
}
const assets = path.join(pkg, 'dist', 'assets');
const license = fs.readFileSync(path.join(pkg, 'LICENSE'), 'utf8').trim();
const version = JSON.parse(fs.readFileSync(path.join(pkg, 'package.json'), 'utf8')).version;

function outlinesOf(wrapperFile) {
  const wrapper = fs.readFileSync(path.join(pkg, 'dist', 'components', wrapperFile), 'utf8');
  const outlines = [...wrapper.matchAll(/ d="([^"]+)"/g)].map((m) => m[1]);
  if (outlines.length !== 2) throw new Error(`${wrapperFile}: expected 2 outlines, found ${outlines.length}`);
  return outlines;
}

function bbox(d, stroke = false) {
  const paint = stroke ? 'fill="none" stroke="#000" stroke-width="1"' : 'fill="#000"';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-400 -400 2400 2400" width="2400" height="2400"><path d="${d}" ${paint}/></svg>`;
  const b = new Resvg(svg).getBBox();
  if (!b) throw new Error('empty path');
  return b;
}

const BODY = new Set(['neck', 'knees', 'tibialis', 'hands', 'ankles', 'feet', 'head', 'hair']);
const FRONT = {
  chest: 'chest',
  obliques: 'obliques',
  abs: 'abs',
  biceps: 'biceps',
  triceps: 'triceps',
  trapezius: 'traps',
  deltoids: 'front_delts',
  adductors: 'adductors',
  quadriceps: 'quads',
  calves: 'calves',
  forearm: 'forearms',
};
const BACK = {
  trapezius: 'traps',
  deltoids: 'rear_delts',
  triceps: 'triceps',
  'lower-back': 'lower_back',
  forearm: 'forearms',
  adductors: 'adductors',
  hamstring: 'hamstrings',
  calves: 'calves',
};

/** The region of each piece of one part on one side (the size splits compare a side's pieces). */
function regionsOf(view, slug, ds) {
  if (BODY.has(slug)) return ds.map(() => 'body');
  const heights = ds.map((d) => bbox(d).height);
  if (view === 'back' && slug === 'upper-back') {
    const tallest = Math.max(...heights);
    return heights.map((h) => (h === tallest ? 'lats' : 'upper_back'));
  }
  if (view === 'back' && slug === 'gluteal') {
    const shortest = Math.min(...heights);
    return heights.map((h) => (h === shortest ? 'abductors' : 'glutes'));
  }
  const map = view === 'front' ? FRONT : BACK;
  if (!map[slug]) throw new Error(`no region for ${view} ${slug}`);
  return ds.map(() => map[slug]);
}

function parts(view, data, keepHair) {
  const out = [];
  for (const part of data) {
    if (part.slug === 'hair' && !keepHair) continue;
    for (const side of ['left', 'right', 'common']) {
      const ds = part.path?.[side] ?? [];
      if (ds.length === 0) continue;
      const regions = regionsOf(view, part.slug, ds);
      ds.forEach((d, i) => out.push({ region: regions[i], d }));
    }
  }
  return out;
}

/** Top and bottom of a drawn figure: its parts and its outline. */
function verticalExtent(list, outline) {
  let top = Infinity;
  let bottom = -Infinity;
  for (const b of [...list.map((p) => bbox(p.d)), bbox(outline, true)]) {
    top = Math.min(top, b.y);
    bottom = Math.max(bottom, b.y + b.height);
  }
  return { top, bottom };
}

function horizontalCentre(list, outline) {
  let left = Infinity;
  let right = -Infinity;
  for (const b of [...list.map((p) => bbox(p.d)), bbox(outline, true)]) {
    left = Math.min(left, b.x);
    right = Math.max(right, b.x + b.width);
  }
  return (left + right) / 2;
}

const round1 = (n) => Math.round(n * 10) / 10;

// ---------------------------------------------------------------- male (the package's frame)
const maleOutlines = outlinesOf('SvgMaleWrapper.js');
const maleFront = parts('front', require(path.join(assets, 'bodyFront.js')).bodyFront, false);
const maleBack = parts('back', require(path.join(assets, 'bodyBack.js')).bodyBack, false);
const MALE_H = 1448;
const maleFrontExt = verticalExtent(maleFront, maleOutlines[0]);
const maleBackExt = verticalExtent(maleBack, maleOutlines[1]);
const maleTop = Math.min(maleFrontExt.top, maleBackExt.top);
const maleBottom = Math.max(maleFrontExt.bottom, maleBackExt.bottom);
const FILL = (maleBottom - maleTop) / MALE_H;
const ROOM_ABOVE = maleTop / MALE_H;

// ---------------------------------------------------------------- female (framed like the male)
const femaleOutlines = outlinesOf('SvgFemaleWrapper.js');
const femaleFront = parts('front', require(path.join(assets, 'bodyFemaleFront.js')).bodyFemaleFront, true);
const femaleBack = parts('back', require(path.join(assets, 'bodyFemaleBack.js')).bodyFemaleBack, true);
const fFrontExt = verticalExtent(femaleFront, femaleOutlines[0]);
const fBackExt = verticalExtent(femaleBack, femaleOutlines[1]);
const fTop = Math.min(fFrontExt.top, fBackExt.top);
const fBottom = Math.max(fFrontExt.bottom, fBackExt.bottom);
const fH = round1((fBottom - fTop) / FILL);
const fW = round1(fH / 2);
const fY = round1(fTop - ROOM_ABOVE * fH);
const femaleFrontX = round1(horizontalCentre(femaleFront, femaleOutlines[0]) - fW / 2);
const femaleBackX = round1(horizontalCentre(femaleBack, femaleOutlines[1]) - fW / 2);
console.log(`male figure fills ${(FILL * 100).toFixed(1)}% of the height, ${(ROOM_ABOVE * 100).toFixed(1)}% above the head`);
console.log(`female frame: front x ${femaleFrontX}, back x ${femaleBackX}, y ${fY}, ${fW} × ${fH}`);

const count = (list) =>
  Object.entries(list.reduce((a, p) => ((a[p.region] = (a[p.region] ?? 0) + 1), a), {}))
    .map(([k, v]) => `${k} ${v}`)
    .join(', ');
for (const [name, list] of [
  ['male front', maleFront],
  ['male back', maleBack],
  ['female front', femaleFront],
  ['female back', femaleBack],
]) {
  console.log(`${name}:`, count(list));
}

const q = (s) => JSON.stringify(s);
const lines = [];
lines.push('/**');
lines.push(' * GENERATED by scripts/build-body-map.cjs — do not edit by hand.');
lines.push(' *');
lines.push(` * Body drawings for the "muscles trained" map (Phase 3; the female figure since v0.25.1), from`);
lines.push(` * react-native-body-highlighter ${version} (MIT). Regions are ForgeAI's finer muscles; "body" is`);
lines.push(' * drawn plain. Each view is 1 wide : 2 high. Its licence travels with the app as BODY_MAP_LICENSE.');
lines.push(' */');
lines.push("import type { Muscle } from './muscles';");
lines.push('');
lines.push("export type BodyRegion = Muscle | 'body';");
lines.push('');
lines.push("/** The figure a member chose in Profile (\"Body figure\"). */");
lines.push("export type BodyFigure = 'male' | 'female';");
lines.push('');
lines.push('export interface BodyView {');
lines.push('  /** viewBox of this half of the drawing. */');
lines.push('  viewBox: { x: number; y: number; width: number; height: number };');
lines.push('  outline: string;');
lines.push('  parts: readonly { region: BodyRegion; d: string }[];');
lines.push('}');
lines.push('');
lines.push(`export const BODY_MAP_LICENSE = ${q(license)};`);
lines.push('');
for (const [name, list, vb, outline] of [
  ['BODY_FRONT', maleFront, { x: 0, y: 0, width: 724, height: MALE_H }, maleOutlines[0]],
  ['BODY_BACK', maleBack, { x: 724, y: 0, width: 724, height: MALE_H }, maleOutlines[1]],
  ['BODY_FEMALE_FRONT', femaleFront, { x: femaleFrontX, y: fY, width: fW, height: fH }, femaleOutlines[0]],
  ['BODY_FEMALE_BACK', femaleBack, { x: femaleBackX, y: fY, width: fW, height: fH }, femaleOutlines[1]],
]) {
  lines.push(`export const ${name}: BodyView = {`);
  lines.push(`  viewBox: { x: ${vb.x}, y: ${vb.y}, width: ${vb.width}, height: ${vb.height} },`);
  lines.push(`  outline: ${q(outline.replace(/\s+/g, ' ').trim())},`);
  lines.push('  parts: [');
  for (const p of list) lines.push(`    { region: ${q(p.region)}, d: ${q(p.d)} },`);
  lines.push('  ],');
  lines.push('};');
  lines.push('');
}
lines.push('/** Front and back of each figure. */');
lines.push('export const BODY_VIEWS: Record<BodyFigure, { front: BodyView; back: BodyView }> = {');
lines.push('  male: { front: BODY_FRONT, back: BODY_BACK },');
lines.push('  female: { front: BODY_FEMALE_FRONT, back: BODY_FEMALE_BACK },');
lines.push('};');
lines.push('');
const outFile = path.join(__dirname, '..', 'src', 'tracker', 'catalog', 'bodyMapPaths.ts');
fs.writeFileSync(outFile, lines.join('\n'));
console.log('wrote', outFile, fs.statSync(outFile).size, 'bytes');
