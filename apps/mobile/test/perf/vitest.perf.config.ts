/**
 * Audit Phase 8 perf lane. The normal run (`npx vitest run`) only picks up `test/**\/*.test.ts`,
 * so the perf files (`*.perf.ts`) never slow it down. Run them with:
 *
 *   npx vitest run -c test/perf/vitest.perf.config.ts
 *
 * Same aliases and set-up as the main config; one file at a time, long timeout.
 */
import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

import base from '../../vitest.config';

const root = resolve(__dirname, '../..');

export default defineConfig({
  ...base,
  root,
  test: {
    ...base.test,
    include: ['test/perf/**/*.perf.ts'],
    testTimeout: 30 * 60_000,
    hookTimeout: 30 * 60_000,
    fileParallelism: false,
    // Results go to the console; keep vitest's own output plain.
    reporters: ['verbose'],
  },
});
