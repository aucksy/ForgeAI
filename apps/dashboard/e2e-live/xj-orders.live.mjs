// UAT WP6 journeys 1 and 2, the owner's steps (admin app, live server, gym slot A).
//   XJ1a  the owner adds two products: QA Shaker (stock 3, journey 1) and QA Towel (stock 4, journey 2)
//   XJ1b  the member's order of 2 shakers is in Shop -> Orders (New); the owner taps "Mark ready"
//   XJ1c  the owner taps "Collected (paid)" (the hand-over at the desk)
//   XJ2a  the towel order the member cancelled shows "Cancelled by member"
//   XJ2b  the owner cancels the member's next towel order; the towel's stock is back
// The order numbers come from the server check before each step (xj_server.py check order ... remember).
import { expect, test } from '@playwright/test';

import { blockWith, gymState, openAsOwner, openShop, orderFilter, sheet, shot, waitFor } from './support.mjs';

const SHAKER = 'QA Shaker';
const TOWEL = 'QA Towel';
const MEMBER = 'QA Member';

async function addProduct(page, { name, price, stock }) {
  await page.getByRole('button', { name: '+ Add product' }).first().tap();
  const s = sheet(page, 'Add product');
  await expect(s).toBeVisible();
  await s.getByLabel('Name').fill(name);
  await s.getByLabel('Price').fill(price);
  await s.getByLabel('Stock').fill(stock);
  await s.getByRole('button', { name: 'Add product' }).tap();
  await expect(s).toBeHidden({ timeout: 30_000 });
  await expect(page.getByText(`${name} added to the shop.`)).toBeVisible();
}

function orderNo(slot, key) {
  const n = gymState(slot).orders?.[key];
  if (!n) throw new Error(`no order number kept for ${key}: the server check before this step did not run`);
  return n;
}

/** The order card for order `n`: the innermost block with its "Order n" title and its Total line. */
function card(page, n) {
  return blockWith(page, page.getByText(`Order ${n}`, { exact: true }), 'Total');
}

test('XJ1a owner adds two products to the shop', async ({ page }, testInfo) => {
  await openAsOwner(page, 'A');
  await openShop(page, 'Products');
  await expect(page.getByText('No products yet')).toBeVisible();
  await addProduct(page, { name: SHAKER, price: '300', stock: '3' });
  await addProduct(page, { name: TOWEL, price: '150', stock: '4' });
  await expect(page.getByText('2 products · 2 shown in the app')).toBeVisible();
  await expect(blockWith(page, page.getByRole('button', { name: `Edit ${SHAKER}` }), 'Low: 3 left')).toBeVisible();
  await expect(blockWith(page, page.getByRole('button', { name: `Edit ${TOWEL}` }), '4 in stock')).toBeVisible();
  await shot(page, testInfo, 'xj1a-products');
});

test('XJ1b owner sees the new order and marks it ready', async ({ page }, testInfo) => {
  const n = orderNo('A', 'J1');
  await openAsOwner(page, 'A');
  await openShop(page, 'Orders');
  // New is the first filter; the order arrives by itself within seconds.
  await waitFor(page, () => card(page, n).isVisible(), { what: `order ${n} under New`, reopen: () => openShop(page, 'Orders') });
  const c = card(page, n);
  await expect(c).toContainText(MEMBER);
  await expect(c).toContainText(`2 × ${SHAKER}`);
  await expect(c).toContainText('₹600');
  await expect(c).toContainText('New');
  await shot(page, testInfo, 'xj1b-new-order');
  await page.getByRole('button', { name: `Mark ready, order ${n}` }).tap();
  await expect(page.getByText(`Order ${n} is ready. ${MEMBER} can see this in the app.`)).toBeVisible();
  await orderFilter(page, 'Ready');
  await expect(card(page, n)).toContainText('Ready');
  await shot(page, testInfo, 'xj1b-ready');
});

test('XJ1c owner hands the order over: Collected (paid)', async ({ page }, testInfo) => {
  const n = orderNo('A', 'J1');
  await openAsOwner(page, 'A');
  await openShop(page, 'Orders');
  await orderFilter(page, 'Ready');
  await expect(card(page, n)).toBeVisible();
  await page.getByRole('button', { name: `Collected (paid), order ${n}` }).tap();
  await expect(page.getByText(`Order ${n} collected. ₹600 taken.`)).toBeVisible();
  await orderFilter(page, 'Collected');
  await expect(card(page, n)).toContainText('Collected');
  // A final order has no buttons left.
  await expect(page.getByRole('button', { name: new RegExp(`order ${n}$`) })).toHaveCount(0);
  await shot(page, testInfo, 'xj1c-collected');
});

test('XJ2a owner sees the order the member cancelled', async ({ page }, testInfo) => {
  const n = orderNo('A', 'J2a');
  await openAsOwner(page, 'A');
  await openShop(page, 'Orders');
  await orderFilter(page, 'Cancelled');
  await waitFor(page, () => card(page, n).isVisible(), {
    what: `order ${n} under Cancelled`,
    reopen: async () => {
      await openShop(page, 'Orders');
      await orderFilter(page, 'Cancelled');
    },
  });
  const c = card(page, n);
  await expect(c).toContainText(`1 × ${TOWEL}`);
  await expect(c).toContainText('Cancelled by member');
  await expect(page.getByRole('button', { name: new RegExp(`order ${n}$`) })).toHaveCount(0);
  await shot(page, testInfo, 'xj2a-cancelled-by-member');
});

test('XJ2b owner cancels an order; the stock goes back', async ({ page }, testInfo) => {
  const n = orderNo('A', 'J2b');
  await openAsOwner(page, 'A');
  await openShop(page, 'Orders');
  await waitFor(page, () => card(page, n).isVisible(), { what: `order ${n} under New`, reopen: () => openShop(page, 'Orders') });
  await expect(card(page, n)).toContainText(`1 × ${TOWEL}`);
  await page.getByRole('button', { name: `Cancel order, order ${n}` }).tap();
  const s = sheet(page, `Cancel order ${n}?`);
  await expect(s).toBeVisible();
  await expect(s).toContainText('The items go back into stock');
  await shot(page, testInfo, 'xj2b-cancel-question');
  await s.getByRole('button', { name: 'Cancel order' }).tap();
  await expect(page.getByText(`Order ${n} cancelled. Stock is back.`)).toBeVisible();
  await orderFilter(page, 'Cancelled');
  await expect(card(page, n)).toContainText('Cancelled');
  await expect(card(page, n)).not.toContainText('Cancelled by member');
  // The towel's stock, as the owner sees it: back to 4.
  await openShop(page, 'Products');
  await expect(blockWith(page, page.getByRole('button', { name: `Edit ${TOWEL}` }), '4 in stock')).toBeVisible();
  await shot(page, testInfo, 'xj2b-stock-back');
});
