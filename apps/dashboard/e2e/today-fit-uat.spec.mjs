// R-593 (owner, 15 Nov 2026, his phone screenshot in Hinglish): the "AI Assistant" card on Today was wider than the
// screen. The ask box and the idea buttons ("Chhath Puja ki b...", "Hum aapko miss kar rahe hain wala mes...") ran off
// the right edge, and "10+ din se nahi aaye: 1" was squeezed into a one-word column. expectFitsPhone passed: the page
// itself did not scroll sideways. This spec checks EVERY element (support.mjs expectNothingPastScreen) on Today and on
// the AI Assistant page at 320, 360, 390 and 412 px, in English and Hinglish, dark and light, with the ideas card filled
// with the longest real idea words: a moon-dated festival ("Eid ul-Fitr kal hone ki ummeed hai (din chaand se tay hota
// hai)"), the longest festival name ("Ganesh Chaturthi ki badhai likho") and the "miss you" idea.
// Pictures: e2e/.results/uat/today-fit-*.png (CI "dashboard-uat-pictures").
import { mkdirSync } from 'node:fs';

import { expect, test } from '@playwright/test';

import { addMember, addPlan, expectFitsPhone, expectNothingPastScreen, openApp, pickInTopBar, sell, startOnlineGym, themeByEvents } from './support.mjs';

const DIR = 'e2e/.results/uat';
mkdirSync(DIR, { recursive: true });

const go = (page, path) =>
  page.evaluate((p) => {
    window.location.hash = p;
  }, path);

/** The AI wallet (0071) on the pretend server: the assistant shows for the owner. */
function installWallet(server) {
  const base = server.answer.bind(server);
  server.answer = (fn, args) => {
    if (fn !== 'owner_ai_wallet') return base(fn, args);
    server.calls.push(fn);
    server.log.push({ fn, args });
    server.anyone(args.p_key);
    return {
      ok: true, balance: 84, free_left: 34, monthly_free: 100, plan: 'pro', billing: 'yearly', trial: false, month: '2027-03', low_at: 5,
      packs: [{ credits: 50, inr: 149 }], recent: [],
    };
  };
}

const addDays = (iso, n) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/**
 * A gym on `day` (10 am IST) whose AI ideas are a festival tomorrow and "not seen for 10+ days". Two members on a
 * 12-month plan, no visit yet: Asha joined 40 days ago (counted), Ravi joined today (NOT counted: the live bug of
 * 15 Nov 2026 counted him). Their join and plan dates are set on the pretend server, then the panel reloads.
 */
async function gymWithIdeas(page, day) {
  const server = await openApp(page, { time: new Date(`${day}T10:00:00+05:30`) });
  installWallet(server);
  await startOnlineGym(page);
  await addPlan(page, { name: 'Yearly', price: '12000', joining: '0', months: '12' });
  await addMember(page, { name: 'Asha Verma', phone: '98290 11111' });
  await sell(page, { received: '12000' });
  await addMember(page, { name: 'Ravi Kumar', phone: '98290 22222' });
  await sell(page, { received: '12000' });
  const live = (k, test) => [...server.records.values()].find((r) => r.k === k && !r.x && test(r.d));
  await expect.poll(() => {
    const m = live('member', (d) => d.fullName === 'Asha Verma');
    return Boolean(m && live('membership', (d) => d.memberId === m.id) && live('member', (d) => d.fullName === 'Ravi Kumar'));
  }, { message: 'the sales reached the server', timeout: 15_000 }).toBe(true);
  const asha = live('member', (d) => d.fullName === 'Asha Verma');
  const plan = live('membership', (d) => d.memberId === asha.id);
  const since = addDays(day, -40);
  server.version += 1;
  server.records.set(`member:${asha.id}`, { ...asha, ver: server.version, d: { ...asha.d, joinedOn: since } });
  server.records.set(`membership:${plan.id}`, { ...plan, ver: server.version, d: { ...plan.d, startsOn: since } });
  await go(page, '/');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible({ timeout: 15_000 });
  return server;
}

const WORDS = {
  eid: {
    English: ['Eid ul-Fitr is expected tomorrow (the moon decides the day)', 'Write a Eid ul-Fitr greeting', 'Not seen for 10+ days: 1', 'Asha: joined 40 days ago, no visit yet', 'See who', 'Write a we miss you message'],
    Hinglish: ['Eid ul-Fitr kal hone ki ummeed hai (din chaand se tay hota hai)', 'Eid ul-Fitr ki badhai likho', '10+ din se nahi aaye: 1', 'Asha: 40 din pehle jude, ab tak nahi aaye', 'Kaun hain, dekho', 'Hum aapko miss kar rahe hain wala message likho'],
  },
  ganesh: {
    English: ['Ganesh Chaturthi is tomorrow', 'Write a Ganesh Chaturthi greeting', 'Not seen for 10+ days: 1', 'Asha: joined 40 days ago, no visit yet', 'See who', 'Write a we miss you message'],
    Hinglish: ['Ganesh Chaturthi kal hai', 'Ganesh Chaturthi ki badhai likho', '10+ din se nahi aaye: 1', 'Asha: 40 din pehle jude, ab tak nahi aaye', 'Kaun hain, dekho', 'Hum aapko miss kar rahe hain wala message likho'],
  },
};

/** Each idea's words keep the row: at least 12rem wide (or the whole row), never a one-word column. */
async function expectIdeaRowsRoomy(page, scope, where) {
  const rows = scope.locator('[data-idea-row]');
  expect(await rows.count(), `idea rows ${where}`).toBeGreaterThanOrEqual(2);
  const sizes = await rows.evaluateAll((els) =>
    els.map((row) => {
      const words = row.querySelector('p').getBoundingClientRect();
      const btn = row.querySelector('button').getBoundingClientRect();
      const box = row.getBoundingClientRect();
      return { words: Math.round(words.width), row: Math.round(box.width), btnRight: Math.round(btn.right), rowRight: Math.round(box.right), text: row.textContent };
    }),
  );
  for (const s of sizes) {
    expect(s.words, `"${s.text}" words box ${where}`).toBeGreaterThanOrEqual(Math.min(180, s.row - 2));
    expect(s.btnRight, `"${s.text}" button inside its row ${where}`).toBeLessThanOrEqual(s.rowRight + 1);
  }
}

async function sweep(page, words, widths, shotsAt) {
  const main = page.getByRole('main');
  for (const lang of ['English', 'Hinglish']) {
    await pickInTopBar(page, lang);
    for (const width of widths) {
      await page.setViewportSize({ width, height: 844 });
      for (const mode of ['dark', 'light']) {
        await themeByEvents(page, mode);
        const where = `${lang}, ${mode}, ${width}px`;
        // Today: the AI card with the ideas.
        await go(page, '/');
        const card = main.getByRole('region', { name: 'AI Assistant', exact: true });
        await expect(card).toBeVisible({ timeout: 15_000 });
        for (const w of words[lang]) await expect(card).toContainText(w);
        await expect(card).not.toContainText('Ravi');
        await expectFitsPhone(page, `on Today (${where})`);
        await expectNothingPastScreen(page, `on Today (${where})`);
        await expectIdeaRowsRoomy(page, card, `on Today (${where})`);
        if (shotsAt(width, lang)) {
          await card.evaluate((el) => {
            el.scrollIntoView({ block: 'start' });
            window.scrollBy(0, -80);
          });
          await page.waitForTimeout(250);
          await page.screenshot({ path: `${DIR}/today-fit-${words.id}-${width}-${lang}-${mode}.png` });
        }
        // The AI Assistant page: "Today for you" has the same rows.
        await go(page, '/assistant');
        await expect(page.getByRole('heading', { level: 1, name: /AI Assistant/ })).toBeVisible();
        for (const w of words[lang]) await expect(main).toContainText(w);
        await expectFitsPhone(page, `on the AI Assistant (${where})`);
        await expectNothingPastScreen(page, `on the AI Assistant (${where})`);
        await expectIdeaRowsRoomy(page, main, `on the AI Assistant (${where})`);
        if (shotsAt(width, lang)) {
          await page.waitForTimeout(250);
          await page.screenshot({ path: `${DIR}/today-fit-${words.id}-assistant-${width}-${lang}-${mode}.png` });
        }
      }
    }
  }
}

test.use({ viewport: { width: 390, height: 844 } });

test('R-593 the AI ideas fit every phone: Eid (the longest idea) at 320/360/390/412, English and Hinglish, dark and light', async ({ page }) => {
  test.setTimeout(240_000);
  await gymWithIdeas(page, '2027-03-09');
  await sweep(page, { id: 'eid', ...WORDS.eid }, [320, 360, 390, 412], (w) => w === 320 || w === 390);
  // The whole Today page at 390 in Hinglish (his phone), top to bottom.
  await page.setViewportSize({ width: 390, height: 844 });
  await go(page, '/');
  await expect(page.getByRole('heading', { name: 'Aaj', exact: true })).toBeVisible();
  await page.screenshot({ path: `${DIR}/today-fit-eid-390-Hinglish-whole-page.png`, fullPage: true });

  // "See who" (owner, 16 Nov 2026): the list behind the number, on the assistant, by our own code (no AI call: this
  // pretend server has no AI, so an ask would fail; the list still shows).
  const card = page.getByRole('main').getByRole('region', { name: 'AI Assistant', exact: true });
  await card.locator('[data-idea-row]').filter({ hasText: '10+ din se nahi aaye: 1' }).getByRole('button', { name: 'Kaun hain, dekho' }).click();
  await expect(page.getByRole('heading', { level: 1, name: /AI Assistant/ })).toBeVisible();
  const main = page.getByRole('main');
  await expect(main).toContainText('Asha Verma', { timeout: 10_000 });
  await expect(main.getByText('Ravi Kumar')).toHaveCount(0);
  await expectNothingPastScreen(page, 'on the AI Assistant after See who (Hinglish)');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${DIR}/today-fit-eid-see-who-390-Hinglish.png` });
});

test('R-593 the AI ideas fit every phone: Ganesh Chaturthi (the longest festival name)', async ({ page }) => {
  test.setTimeout(200_000);
  await gymWithIdeas(page, '2027-09-03');
  await sweep(page, { id: 'ganesh', ...WORDS.ganesh }, [320, 360, 390, 412], (w) => w === 320);
});
