// Panel click-through check (15 Oct 2026, audit toolkit pick 9). Opens EVERY panel page of a demo
// gym at a phone width (390 px) and a computer width (1280 px), in English and Hinglish, and fails
// on any page error, console error, or page wider than the screen (sideways scrolling).
// The Supabase calls are answered here (no real server touched, no demo gym made).
//
//   npm run build && node scripts/crawl.mjs        (CI: .github/workflows/ci.yml)

import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const PORT = 4179;
const BASE = `http://localhost:${PORT}/`;
const KEY = 'k'.repeat(48);
const GYM = { gymId: 'g-qa', name: 'Iron Temple Fitness', joinCode: 'QA0001' };

function rpcAnswer(fn) {
  switch (fn) {
    case 'demo_start_gym':
      return { ...GYM, ownerKey: KEY };
    case 'owner_gym':
      return { ...GYM, brand: null };
    case 'owner_rename_gym':
      return GYM;
    default:
      return [];
  }
}

const ROUTES = [
  '/', '/members', '/members/import', '/members/f/exp-1-3', '/members/f/active', '/members/app', 'MEMBER', '/shop', '/shop/messages',
  '/attendance', '/money', '/money/dues', '/money/today', 'RECEIPT', '/plans', '/enquiries', '/expenses',
  '/settings', '/settings/invite', '/settings/people', '/settings/branding', '/more',
];

async function waitForServer() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const r = await fetch(BASE);
      if (r.ok) return;
    } catch {
      // quiet: the server is still starting; try again
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('vite preview did not start');
}

const server = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
  stdio: 'ignore',
  shell: process.platform === 'win32',
});
const failures = [];
let browser;
try {
  await waitForServer();
  // The full Chromium build (the 'chromium' channel) runs headless too; CI installs it with
  // `npx playwright install --with-deps chromium`.
  // CRAWL_CHROME: a local Chrome/Chromium to use instead (a laptop whose Playwright download is
  // incomplete); CI leaves it unset.
  browser = await chromium.launch(
    process.env.CRAWL_CHROME ? { executablePath: process.env.CRAWL_CHROME } : { channel: 'chromium' },
  );
  for (const lang of ['en', 'hi']) {
    for (const width of [390, 1280]) {
      const context = await browser.newContext({ viewport: { width, height: 844 } });
      await context.addInitScript((l) => {
        try {
          if (!localStorage.getItem('forgeai.qa.seeded')) {
            localStorage.clear();
            localStorage.setItem('forgeai.qa.seeded', '1');
          }
          localStorage.setItem('forgeai.lang.v1', l);
          localStorage.setItem('forgeai.installBanner.closed', '1');
        } catch {
          // quiet: storage blocked; the run reports what it can
        }
      }, lang);
      await context.route(/supabase\.co\/rest\/v1\/rpc\/([a-z_]+)/, (route) => {
        const fn = /rpc\/([a-z_]+)/.exec(route.request().url())?.[1] ?? '';
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rpcAnswer(fn)) });
      });
      // CRAWL_SELFTEST=1 makes every page too wide, to prove the check can fail.
      if (process.env.CRAWL_SELFTEST) {
        await context.addInitScript(() => {
          document.addEventListener('DOMContentLoaded', () => {
            const d = document.createElement('div');
            d.style.width = '3000px';
            d.style.height = '1px';
            document.body.appendChild(d);
          });
        });
      }
      const page = await context.newPage();
      let where = 'start';
      page.on('pageerror', (e) => failures.push(`${lang} ${width}px ${where}: page error ${e.message}`));
      page.on('console', (m) => {
        if (m.type() === 'error' && !/fonts\.g/.test(m.text())) failures.push(`${lang} ${width}px ${where}: console ${m.text().slice(0, 200)}`);
      });
      await page.goto(BASE);
      await page.getByRole('button', { name: lang === 'hi' ? 'Demo shuru karo' : 'Start demo' }).click();
      await page.waitForFunction(() => location.hash === '#/' && document.querySelector('main'), null, { timeout: 15000 });
      const ids = await page.evaluate(() => {
        const s = JSON.parse(localStorage.getItem('forgeai-crm-v1') || '{}').snapshot || {};
        return { member: s.members?.[0]?.id, payment: s.payments?.[0]?.id };
      });
      for (const r of ROUTES) {
        const path = r === 'MEMBER' ? `/members/${ids.member}` : r === 'RECEIPT' ? `/receipts/${ids.payment}` : r;
        where = path;
        await page.evaluate((p) => (location.hash = `#${p}`), path);
        await page.waitForTimeout(500);
        const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: window.innerWidth, main: !!document.querySelector('main') }));
        if (m.sw > m.w + 1) failures.push(`${lang} ${width}px ${path}: page is ${m.sw}px wide on a ${m.w}px screen`);
        if (!m.main) failures.push(`${lang} ${width}px ${path}: no page content`);
      }
      await context.close();
    }
  }
} finally {
  await browser?.close();
  server.kill();
}

if (failures.length) {
  console.log(`::error::Panel crawl: ${failures.length} problem(s)`);
  for (const f of failures) console.log(`  ${f}`);
  process.exit(1);
}
console.log(`Panel crawl: ${ROUTES.length} pages x 2 widths x 2 languages, clean.`);
