/**
 * Phase 2: `src/tracker/catalog/media.ts` holds ~800 static `require('…webp')` calls at
 * module top level (Metro needs them literal). Vitest runs modules with Node's real
 * `require`, which would try to parse a picture as JavaScript and fail the whole suite.
 * Pictures and videos stand in as an opaque number here — the shape Metro gives them.
 */
import { createRequire } from 'node:module';

type Loader = (module: { exports: unknown }, filename: string) => void;
const nodeModule = createRequire(import.meta.url)('node:module') as { _extensions: Record<string, Loader> };

let next = 1;
for (const ext of ['.webp', '.png', '.jpg', '.jpeg', '.gif', '.mp4', '.wav']) {
  nodeModule._extensions[ext] = (module) => {
    module.exports = next++;
  };
}
