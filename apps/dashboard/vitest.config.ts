import { defineConfig } from 'vitest/config';

/**
 * Dashboard test lane — pure-TypeScript unit tests over the CRM's logic and its
 * local data adapter. No browser, no React render, no network: the money maths,
 * the calendar maths, the membership rules and the storage adapter are all
 * reachable under Node, and those are the parts where a bug costs a gym money.
 *
 * Mirrors apps/mobile's O1 lane so both workspaces are run the same way in CI.
 *
 * TZ IS PINNED, and that is load-bearing. CI runs on UTC, where local time and
 * UTC are identical — so the tests asserting that dates are read from LOCAL parts
 * rather than converted to UTC passed even against the exact bug they existed to
 * catch. Asia/Kolkata is +05:30 (and never observes DST), which makes any
 * UTC/local confusion fail loudly and matches the target market.
 */
process.env.TZ = 'Asia/Kolkata';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});
