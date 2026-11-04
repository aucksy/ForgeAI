// F123 (4 Nov 2026): FITPASS, cultpass and other pass members, UAT on a phone (375 x 812) and on a
// computer (1280 x 900). Every step taps the real screen; pictures go to e2e/.results/uat (CI uploads
// them as "dashboard-uat-pictures").
//
//  1. Chetan pays the gym; his plan ends in 2 days, so he is on the renewal list (Expiring).
//  2. Asha is added as a pass member: Add member -> "Comes with a pass" -> FITPASS. Her page says
//     "Pass member", no plan and no dues; "Pass visit" counts today's visit for FITPASS.
//  3. Chetan moves to cultpass (Edit): he leaves the renewal list (Expiring 0, Pass members 2) and his
//     visit counts for cultpass. Nobody shows as "No plan bought" on Today.
//  4. Visits -> Pass visits: Oct 2026, FITPASS 1 visit 1 person, cultpass 1 visit 1 person; the Excel
//     file has one line per visit.
import { mkdirSync, readFileSync } from 'node:fs';

import { expect, test } from '@playwright/test';

import { addMember, expectFitsPhone, gymWithMonthlyPlan, open, openMember, sheet, tile } from './support.mjs';

const DIR = 'e2e/.results/uat';
mkdirSync(DIR, { recursive: true });

async function shot(page, name, fullPage = true) {
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${DIR}/${name}.png`, fullPage });
}

const ASHA = { name: 'Asha Verma', phone: '98290 11111' };
const CHETAN = { name: 'Chetan Rao', phone: '98290 33333' };

/** A Members filter chip ("Expiring 1", "Pass members 2"). */
function chip(page, label) {
  return page.getByRole('group', { name: 'Filter members' }).getByRole('button', { name: new RegExp(`^${label}`) });
}

/** Tick "Comes with a pass" in the open member sheet and pick a company. */
async function makePass(s, company) {
  await s.getByRole('checkbox', { name: 'Comes with a pass (FITPASS, cultpass and others)' }).check();
  await expect(s.getByText('They pay a pass company, not your gym. No plan and no dues, and never on the renewal list. Each visit counts for the pass company.')).toBeVisible();
  await s.getByRole('group', { name: 'Pass company' }).getByRole('button', { name: company, exact: true }).tap();
}

for (const size of ['phone', 'computer']) {
  test.describe(`pass members on a ${size}`, () => {
    // The gym is set up at phone size (the shared set-up opens Settings through the phone's "More" tab,
    // which a computer does not have). The computer run then turns the window to 1280 x 900 and does
    // everything F123 does there, through the sidebar (it has Today, Members and Visits too).
    test.use({ viewport: { width: 375, height: 812 } });

    test(`F123 ${size}: a pass member, a pass visit, off the renewal list, the monthly count`, async ({ page }) => {
      await gymWithMonthlyPlan(page);
      if (size === 'computer') await page.setViewportSize({ width: 1280, height: 900 });

      // 1. Chetan pays; his month runs 20 Sep - 19 Oct, so it ends in 2 days.
      await addMember(page, CHETAN);
      await page.getByRole('button', { name: 'Sell membership' }).first().tap();
      const sell = sheet(page, 'Sell membership');
      await sell.getByLabel('Starts on').fill('2026-09-20');
      await expect(sell).toContainText('19 Oct 2026');
      await sell.getByLabel('Received now').fill('2000');
      await sell.getByRole('button', { name: 'Confirm' }).tap();
      await expect(page.getByText(/^Membership saved\./)).toBeVisible();
      await open(page, 'Members');
      await expect(chip(page, 'Expiring')).toHaveText(/1/);
      // No pass member yet: no Pass members chip.
      await expect(chip(page, 'Pass members')).toHaveCount(0);

      // 2. Asha comes with FITPASS.
      await page.getByRole('button', { name: '+ Add member' }).first().tap();
      const add = sheet(page, 'Add member');
      await add.getByLabel('Full name').fill(ASHA.name);
      await add.getByLabel('Mobile number').fill(ASHA.phone);
      // Ticked with no company: it asks for one.
      await add.getByRole('checkbox', { name: 'Comes with a pass (FITPASS, cultpass and others)' }).check();
      await add.getByRole('button', { name: 'Add member' }).tap();
      await expect(add.getByText('Pick or type the pass company.')).toBeVisible();
      await add.getByRole('group', { name: 'Pass company' }).getByRole('button', { name: 'FITPASS', exact: true }).tap();
      await expectFitsPhone(page, 'in Add member with a pass');
      await shot(page, `${size}-pass-1-add-member`, false);
      await add.getByRole('button', { name: 'Add member' }).tap();
      await expect(add).toBeHidden();
      await expect(page.getByRole('heading', { name: ASHA.name, exact: true })).toBeVisible();

      const main = page.getByRole('main');
      await expect(main.getByText('Pass member', { exact: true })).toBeVisible();
      await expect(main.getByText('Comes with FITPASS. No plan and no dues: FITPASS pays your gym for each visit.')).toBeVisible();
      await expect(tile(page, 'Dues')).toContainText('—');
      await expect(tile(page, 'Dues')).toContainText('No dues on a pass');
      await expect(tile(page, 'Pass visits this month')).toContainText('0');
      await expect(tile(page, 'Pass visits this month')).toContainText('For FITPASS');

      await main.getByRole('button', { name: 'Pass visit', exact: true }).tap();
      await expect(page.getByText('Pass visit counted for FITPASS.')).toBeVisible();
      await expect(main.getByRole('button', { name: 'Pass visit counted today' })).toBeDisabled();
      await expect(tile(page, 'Pass visits this month')).toContainText('1');
      await expect(tile(page, 'Total visits')).toContainText('1');
      await expectFitsPhone(page, 'on a pass member');
      await shot(page, `${size}-pass-2-member-page`);
      // The full-page picture has the phone's bottom bar over the second row of tiles: a picture of
      // the screen as seen, scrolled to the tiles, so "1 pass visit this month" is read with its label.
      await tile(page, 'Total visits').scrollIntoViewIfNeeded();
      await shot(page, `${size}-pass-2b-member-tiles`, false);

      // 3. Chetan moves to cultpass: off the renewal list.
      await openMember(page, CHETAN.name);
      await page.getByRole('button', { name: 'Edit', exact: true }).tap();
      const edit = sheet(page, 'Edit member');
      await makePass(edit, 'cultpass');
      await edit.getByRole('button', { name: 'Save changes' }).tap();
      await expect(edit).toBeHidden();
      await expect(main.getByText('Comes with cultpass. No plan and no dues: cultpass pays your gym for each visit.')).toBeVisible();
      await main.getByRole('button', { name: 'Pass visit', exact: true }).tap();
      await expect(page.getByText('Pass visit counted for cultpass.')).toBeVisible();

      await open(page, 'Members');
      await expect(chip(page, 'Expiring')).toHaveText(/0/);
      await expect(chip(page, 'Has dues')).toHaveText(/0/);
      await expect(chip(page, 'Pass members')).toHaveText(/2/);
      await chip(page, 'Pass members').tap();
      await expect(main.getByRole('link', { name: new RegExp(ASHA.name) })).toBeVisible();
      await expect(main.getByRole('link', { name: new RegExp(CHETAN.name) })).toBeVisible();
      await expect(main).toContainText('FITPASS');
      await expect(main).toContainText('cultpass');
      await shot(page, `${size}-pass-3-members`);

      // Today: both came in, neither is "No plan bought", nobody to renew.
      await open(page, 'Today');
      await expect(main).not.toContainText('No plan bought');
      await expect(tile(page, 'Ending in 1-3 days')).toContainText('0');
      // Your numbers -> Renewals due must not count Chetan's old plan either (the 5 Nov picture showed 1).
      await expect(tile(page, 'Renewals due').locator('div').first()).toHaveText('0');
      await shot(page, `${size}-pass-4-today`);

      // The register says which company each visit counts for.
      await open(page, 'Visits');
      await expect(main.getByText('FITPASS visit', { exact: true })).toBeVisible();
      await expect(main.getByText('cultpass visit', { exact: true })).toBeVisible();

      // 4. The monthly count per company.
      await main.getByRole('button', { name: 'Pass visits', exact: true }).tap();
      await expect(page.getByRole('heading', { name: 'Pass visits', exact: true, level: 1 })).toBeVisible();
      await expect(tile(page, 'Pass visits')).toContainText('2');
      await expect(tile(page, 'Pass visits')).toContainText('Oct 2026');
      await expect(tile(page, 'Pass members who came')).toContainText('2');
      const table = main.getByRole('table', { name: 'Visits by pass company' });
      const rowOf = (company) => table.getByRole('row').filter({ has: page.getByRole('cell', { name: company, exact: true }) });
      await expect(rowOf('FITPASS').getByRole('cell')).toHaveText(['FITPASS', 'Oct 2026', '1', '1']);
      await expect(rowOf('cultpass').getByRole('cell')).toHaveText(['cultpass', 'Oct 2026', '1', '1']);
      await expect(main).toContainText('Who came on a pass');
      await expect(main).toContainText('FITPASS · last came 17 Oct 2026');
      await expectFitsPhone(page, 'on Pass visits');
      await shot(page, `${size}-pass-5-pass-visits`);

      const [file] = await Promise.all([
        page.waitForEvent('download'),
        main.getByRole('button', { name: 'Download Excel file' }).tap(),
      ]);
      expect(file.suggestedFilename()).toMatch(/pass-visits-2026-10\.csv$/);
      const text = readFileSync(await file.path(), 'utf8').replace(/^﻿/, '');
      const lines = text.split(/\r\n/);
      expect(lines[0]).toBe('Date,Pass company,Member,Mobile,Checked in by');
      expect(lines).toHaveLength(3);
      expect(lines.slice(1).sort()).toEqual([
        '2026-10-17,FITPASS,Asha Verma,91 98290 11111,Front desk',
        '2026-10-17,cultpass,Chetan Rao,91 98290 33333,Front desk',
      ]);
      await expect(page.getByText('Exported 2 pass visits.')).toBeVisible();
    });
  });
}
