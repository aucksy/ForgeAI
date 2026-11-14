// R-528 (14 Nov 2026): the gym owner's two payment switches, kept in D1 (migrations/0016_pay_switches.sql):
//   "Take payments in the member app"               app_on (pay.js: /api/pay/mine, member-check, shop)
//   "Take payments on your web page and join link"  web_on (joinPay.js: the join page and the gym's web page)
// Both are ON when the gym has no row (the default once its payment account is set up). Before 0016 is applied the
// switches read as ON for the member app (so nothing changes there) and the web page offers no online pay at all
// (joinPay.js checks switchesReady first). Also here: "I have paid" for a plain UPI payment (table pay_said).

const nowIso = (now) => new Date(now ?? Date.now()).toISOString();

/** Are 0016's tables there? */
export async function switchesReady(db) {
  if (!db) return false;
  try {
    await db.prepare('SELECT 1 FROM pay_switches LIMIT 1').all();
    await db.prepare('SELECT 1 FROM pay_said LIMIT 1').all();
    return true;
  } catch {
    return false;
  }
}

/** The owner's switches for this gym. ON when there is no row, or no table yet. */
export async function switchesOf(db, gymId) {
  try {
    const row = await db.prepare('SELECT app_on, web_on FROM pay_switches WHERE gym_id = ?').bind(gymId).first();
    return { app: !row || Number(row.app_on) !== 0, web: !row || Number(row.web_on) !== 0 };
  } catch {
    return { app: true, web: true };
  }
}

/** Save one or both switches (booleans; anything else leaves that switch as it is). */
export async function saveSwitches(db, gymId, patch, now) {
  const cur = await switchesOf(db, gymId);
  const app = typeof patch.app === 'boolean' ? patch.app : cur.app;
  const web = typeof patch.web === 'boolean' ? patch.web : cur.web;
  await db
    .prepare(
      `INSERT INTO pay_switches (gym_id, app_on, web_on, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(gym_id) DO UPDATE SET app_on = excluded.app_on, web_on = excluded.web_on, updated_at = excluded.updated_at`,
    )
    .bind(gymId, app ? 1 : 0, web ? 1 : 0, nowIso(now))
    .run();
  return { app, web };
}

/** When the payer said "I have paid" (a plain UPI payment), or ''. */
export async function saidAt(db, requestId) {
  try {
    const row = await db.prepare('SELECT at FROM pay_said WHERE request_id = ?').bind(requestId).first();
    return row ? String(row.at) : '';
  } catch {
    return '';
  }
}

/** "I have paid": kept once (the first time counts). */
export async function markSaid(db, requestId, now) {
  await db.prepare('INSERT OR IGNORE INTO pay_said (request_id, at) VALUES (?, ?)').bind(requestId, nowIso(now)).run();
}
