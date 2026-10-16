// UAT work package 6 (17 Oct 2026): the admin app's half of the cross-role journeys, against the
// REAL live server. Not part of `npx playwright test` (that one's testDir is e2e/): it runs only from
// apps/mobile/qa/run-journeys.sh, one step at a time, between the member app's steps:
//
//   npx playwright test -c e2e-live/live.config.mjs -g " XJ1a "       (from apps/dashboard)
//
// Each step signs in as the FRESH gym the run made (XJ_STATE_DIR/<slot>.json, written by
// apps/mobile/qa/xj_server.py). No trace and no video: a trace keeps request bodies, and every
// request here carries the owner's session key. Failure screenshots only (they show the screen,
// never the key).
//
// E2E_CHROME: a local Chrome/Chromium to use instead of Playwright's download (laptop only).
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { defineConfig } from '@playwright/test';

const PORT = 4182;
const chrome = process.env.E2E_CHROME || process.env.CRAWL_CHROME;

export default defineConfig({
  testDir: '.',
  testMatch: /.*\.live\.mjs$/,
  // run-journeys.sh gives each step its own folder (Playwright empties this folder at every start).
  outputDir: process.env.XJ_PW_OUT || join(tmpdir(), 'forgeai-e2e-live'),
  timeout: 180_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}/`,
    // A phone: 390 x 844 with touch, Indian English, India time. The real clock (a live server).
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 2,
    locale: 'en-IN',
    timezoneId: 'Asia/Kolkata',
    trace: 'off',
    video: 'off',
    screenshot: 'only-on-failure',
    launchOptions: chrome ? { executablePath: chrome } : undefined,
    channel: chrome ? undefined : 'chromium',
  },
  webServer: {
    command: `npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
