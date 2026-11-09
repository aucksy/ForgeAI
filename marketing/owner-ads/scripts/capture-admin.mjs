/**
 * Photographs the LIVE admin panel's demo gym ("Iron Temple Fitness", example data) at phone and
 * desktop size, for the owner ads. Nothing is signed in: "Start demo" on app.mettleup.fit loads a
 * built-in example gym in the browser.
 *
 *   node scripts/capture-admin.mjs [route ...]
 *
 * Uses the repo's own Playwright (root node_modules). Output: public/screens/{phone,desk}-<name>.jpg (member-*.jpg are copies of branding/mettleup/store/raw)
 * Seconds-long; runs once by hand, the pictures are committed so the cloud render needs no network.
 */
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const require = createRequire(resolve(HERE, '../../../package.json'));
const { chromium } = require('playwright');
const OUT = resolve(HERE, '../public/screens');
mkdirSync(OUT, { recursive: true });

const ROUTES = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ['/', '/@700', '/money', '/money/dues', '/money/dues@500', '/members', '/members/import',
     '/workouts', '/settings/branding', '/plans'];

const SIZES = {
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  desk: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
};

// "path@600" = scroll 600 px down before the picture.
const split = (r) => { const [p, y] = r.split('@'); return { p, y: Number(y || 0) }; };
const name = (r) => { const { p, y } = split(r); return (p === '/' ? 'today' : p.slice(1).replace(/\//g, '-')) + (y ? `-${y}` : ''); };

// The demo's example members carry made-up mobile numbers. An ad must never show a number that
// could be someone's real one, so every number is masked on the page before the picture.
const MASK = () => {
  const re = /(\+91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}/g;
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    const v = n.nodeValue.replace(re, '+91 ••••• •••••');
    if (v !== n.nodeValue) n.nodeValue = v;
  }
};

async function main() {
  const browser = await chromium.launch({ executablePath: process.env.E2E_CHROME || undefined });
  for (const [kind, opts] of Object.entries(SIZES)) {
    const ctx = await browser.newContext({ ...opts, locale: 'en-IN', timezoneId: 'Asia/Kolkata', colorScheme: 'dark' });
    const page = await ctx.newPage();
    await page.goto('https://app.mettleup.fit/', { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Start demo' }).click();
    await page.waitForTimeout(2500);
    for (const r of ROUTES) {
      const { p, y } = split(r);
      await page.goto(`https://app.mettleup.fit/#${p}`, { waitUntil: 'networkidle' }).catch(() => {});
      await page.waitForTimeout(1500);
      if (y) { await page.mouse.wheel(0, y); await page.waitForTimeout(700); }
      await page.evaluate(MASK);
      const file = resolve(OUT, `${kind}-${name(r)}.jpg`);
      await page.screenshot({ path: file, type: 'jpeg', quality: 88 });
      console.log(file);
    }
    await ctx.close();
  }
  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
