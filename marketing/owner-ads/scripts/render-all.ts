/**
 * Renders every owner ad: the 9:16 videos and the 1:1 and 4:5 feed stills.
 * Runs in GitHub Actions (.github/workflows/owner-ads.yml), NEVER on the laptop (owner rule: nothing
 * heavy runs locally). Locally use scripts/stills.ts for single frames.
 *
 *   ONLY=01-pending-fee npx tsx scripts/render-all.ts
 *
 * Output: out/videos/<id>.mp4, out/feed/<id>-1x1.png, out/feed/<id>-4x5.png
 */
import { bundle } from '@remotion/bundler';
import { renderMedia, renderStill, selectComposition } from '@remotion/renderer';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

async function main() {
  const copy = JSON.parse(readFileSync(resolve(ROOT, 'src', 'copy.json'), 'utf8')) as { ads: { id: string }[] };
  const ids = copy.ads.map((a) => a.id).filter((id) => !process.env.ONLY || process.env.ONLY.split(',').includes(id));
  const gl = process.platform === 'win32' ? 'angle' : 'swangle';
  const browserExecutable = process.env.BROWSER || null;
  mkdirSync(resolve(ROOT, 'out', 'videos'), { recursive: true });
  mkdirSync(resolve(ROOT, 'out', 'feed'), { recursive: true });

  const serveUrl = await bundle({ entryPoint: resolve(ROOT, 'src', 'index.ts'), onProgress: () => undefined });

  for (const id of ids) {
    const composition = await selectComposition({ serveUrl, id, inputProps: {}, browserExecutable });
    const out = resolve(ROOT, 'out', 'videos', `${id}.mp4`);
    let last = -1;
    await renderMedia({
      composition, serveUrl, codec: 'h264', outputLocation: out, crf: 21, audioCodec: 'aac', audioBitrate: '192k',
      pixelFormat: 'yuv420p', chromiumOptions: { gl }, browserExecutable,
      concurrency: Number(process.env.CONCURRENCY || 2),
      onProgress: ({ progress }) => {
        const p = Math.floor(progress * 10);
        if (p !== last) { last = p; console.log(`${id}: ${p * 10}%`); }
      },
    });
    console.log(`${id}: ${composition.durationInFrames} frames -> ${out}`);

    for (const size of ['1x1', '4x5']) {
      const still = await selectComposition({ serveUrl, id: `${id}-${size}`, inputProps: {}, browserExecutable });
      const file = resolve(ROOT, 'out', 'feed', `${id}-${size}.png`);
      await renderStill({ composition: still, serveUrl, output: file, frame: 0, imageFormat: 'png', chromiumOptions: { gl }, browserExecutable, overwrite: true });
      console.log(`  ${file}`);
    }
  }
}

main().catch((e) => {
  console.error(e?.stack || e?.message || e);
  process.exit(1);
});
