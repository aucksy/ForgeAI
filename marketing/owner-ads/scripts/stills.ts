/**
 * Photograph named frames of one composition, without rendering the film.
 *
 * A full render of the journey film is minutes; a still is seconds. This is how
 * a layout gets checked — and it is the only way to catch the things a render
 * never reports: a caption landing on top of a screen, a label wrapping onto a
 * second line and colliding with the panel below it, a panel cropped by the
 * frame in the wrong place. Both of those were found here, not in the mp4.
 *
 *   STILL_ID=gyms-loop-hi FRAMES=20,60,190 npx tsx scripts/stills.ts
 *
 * Output goes to out/stills/, which is gitignored.
 */
import {bundle} from '@remotion/bundler';
import {renderStill, selectComposition} from '@remotion/renderer';
import {mkdirSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {timing} from '../src/timing';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

async function main() {
  // STILL_ID=01-pending-fee FRAMES=20,200,end   (several ids: comma-separated; "mid", "end" allowed)
  const ids = (process.env.STILL_ID || '01-pending-fee').split(',');
  const want = (process.env.FRAMES || '30,mid,end').split(',');
  const dir = resolve(ROOT, 'out', 'stills');
  mkdirSync(dir, {recursive: true});

  const serveUrl = await bundle({entryPoint: resolve(ROOT, 'src', 'index.ts'), onProgress: () => undefined});
  for (const id of ids) {
  const composition = await selectComposition({serveUrl, id, inputProps: {}, browserExecutable: process.env.BROWSER || null});
  const n = composition.durationInFrames;
  console.log(`${id}: ${n} frames`);
  // tokens: a number, "mid", "end", or a beat letter with an offset ("B+40", "D+30")
  const beat = (w: string) => {
    const m = /^([ABCD])([+-]\d+)?$/.exec(w);
    if (!m) return NaN;
    const t = timing(id) as unknown as Record<string, number>;
    return t[m[1]] + Number(m[2] || 0);
  };
  const frames = n === 1 ? [0] : want.map((w) => (w === 'mid' ? Math.floor(n / 2) : w === 'end' ? n - 20 : /^[ABCD]/.test(w) ? beat(w) : Math.min(n - 1, Number(w))));

  for (const frame of frames) {
    const output = resolve(dir, `${id}-${String(frame).padStart(4, '0')}.png`);
    await renderStill({
      composition, serveUrl, output, frame,
      imageFormat: 'png', chromiumOptions: {gl: 'angle'}, overwrite: true, browserExecutable: process.env.BROWSER || null,
    });
    console.log(`  frame ${frame}  ->  ${output}`);
  }
  }
}

main().catch((e) => {
  console.error(e?.stack || e?.message || e);
  process.exit(1);
});
