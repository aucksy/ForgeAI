// UAT work package 5 (17 Oct 2026): the admin app driven the way an owner and a front-desk person
// use it, on a phone. Real taps and typing on real forms; only the clock and the server are faked.
//
//   npm run build && npx playwright test          (CI: .github/workflows/ci.yml, after the crawl)
//
// E2E_CHROME (or CRAWL_CHROME): a local Chrome/Chromium to use instead of Playwright's download,
// for a laptop whose download is incomplete. CI leaves both unset.
import { defineConfig } from '@playwright/test';

const PORT = 4181;
const chrome = process.env.E2E_CHROME || process.env.CRAWL_CHROME;

export default defineConfig({
  testDir: 'e2e',
  outputDir: 'e2e/.results',
  timeout: 90_000,
  expect: { timeout: 8_000 },
  fullyParallel: true,
  workers: process.env.CI ? 2 : 4,
  retries: 0,
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? [['list'], ['github']] : [['list']],
  use: {
    baseURL: `http://localhost:${PORT}/`,
    // A phone: 390 x 844 with touch, Indian English, India time.
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 2,
    locale: 'en-IN',
    timezoneId: 'Asia/Kolkata',
    // With a local Chrome (much newer than this Playwright) a failed test sat until the timeout
    // while taking its failure screenshot, so failure screenshots and traces are kept for runs on
    // Playwright's own Chromium (CI uploads them).
    trace: chrome ? 'off' : 'retain-on-failure',
    screenshot: chrome ? 'off' : 'only-on-failure',
    launchOptions: chrome ? { executablePath: chrome } : undefined,
    // The full Chromium build, the same one the crawl uses (CI installs it with
    // `npx playwright install --with-deps chromium`).
    channel: chrome ? undefined : 'chromium',
  },
  webServer: {
    command: `npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
