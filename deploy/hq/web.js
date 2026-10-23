// HQ's reads and writes in Cloudflare D1 `forgeai-web` (binding WEB), the same small database the
// panel Worker writes: feedback (deploy/panel/migrations/0001), leads (0002), AI usage (0003) and the
// per-gym AI daily limits (0004). No member data lives there.

export const FEEDBACK_STATUS = ['new', 'bug', 'idea', 'question', 'praise', 'spam', 'done'];
export const LEAD_STATUS = ['new', 'called', 'demo', 'won', 'lost'];
export const AI_LIMIT_MAX = 200;

/**
 * Rough AI prices in US dollars per million tokens, as deploy/panel/aiMatch.js documents them
 * (23 Oct 2026), and a rough rupee rate. The System page labels the result "about".
 */
export const PRICES = { gemini: { in: 0.25, out: 1.5 }, claude: { in: 0.1, out: 0.5 } };
export const USD_TO_INR = 88;

/** Rupees for one usage row (a provider we do not know is priced like Gemini). PURE. */
export function costRupees(provider, tokensIn, tokensOut) {
  const p = PRICES[provider] || PRICES.gemini;
  return ((Number(tokensIn) || 0) * p.in + (Number(tokensOut) || 0) * p.out) / 1e6 * USD_TO_INR;
}

/** The India date (YYYY-MM-DD) n days before now. PURE. */
export function indiaDay(now, daysBack = 0) {
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000 - daysBack * 24 * 60 * 60 * 1000);
  return ist.toISOString().slice(0, 10);
}

export function monthStart(now) {
  return `${indiaDay(now).slice(0, 7)}-01`;
}

const FEEDBACK_COLS = 'id, at, source, text, app, device, screen, gym, status, note, sorted_at';

export async function listFeedback(db, { status = null, limit = 200 } = {}) {
  const lim = Math.min(Math.max(Number(limit) || 200, 1), 500);
  if (status && FEEDBACK_STATUS.includes(status)) {
    return (await db.prepare(`SELECT ${FEEDBACK_COLS} FROM feedback WHERE status = ? ORDER BY at DESC LIMIT ?`).bind(status, lim).all()).results ?? [];
  }
  return (await db.prepare(`SELECT ${FEEDBACK_COLS} FROM feedback ORDER BY at DESC LIMIT ?`).bind(lim).all()).results ?? [];
}

/** New feedback per 6-letter gym code (for the all-gyms table). */
export async function newFeedbackByGym(db) {
  const rows = (await db.prepare("SELECT gym, COUNT(*) AS n FROM feedback WHERE status = 'new' AND gym <> '' GROUP BY gym").all()).results ?? [];
  return Object.fromEntries(rows.map((r) => [r.gym, Number(r.n)]));
}

export async function setFeedbackStatus(db, id, status, note, now) {
  if (!Number.isInteger(id) || id < 1 || !FEEDBACK_STATUS.includes(status)) return false;
  const r = await db
    .prepare('UPDATE feedback SET status = ?, note = ?, sorted_at = ? WHERE id = ?')
    .bind(status, String(note ?? '').slice(0, 500), now.toISOString(), id)
    .run();
  return Boolean(r && r.meta && r.meta.changes);
}

/**
 * Delete requests sent from the admin app (they arrive in the feedback box: GymDataActions.tsx,
 * screen 'settings/delete-request'), with the gym code read from the app's own sentence.
 */
export async function deleteRequestsInFeedback(db) {
  const rows = (await db
    .prepare("SELECT id, at, text, status FROM feedback WHERE screen = 'settings/delete-request' AND status NOT IN ('spam') ORDER BY at DESC LIMIT 100")
    .all()).results ?? [];
  return rows.map((r) => {
    const m = /\bcode ([A-Z0-9]{6})\b/.exec(String(r.text || ''));
    return { feedbackId: r.id, at: r.at, joinCode: m ? m[1] : null, status: r.status, text: String(r.text || '').slice(0, 300) };
  });
}

export async function listLeads(db, { limit = 300 } = {}) {
  const lim = Math.min(Math.max(Number(limit) || 300, 1), 1000);
  return (await db.prepare('SELECT id, at, phone, gym, city, size, today, lang, status, note FROM leads ORDER BY at DESC LIMIT ?').bind(lim).all()).results ?? [];
}

export async function getLead(db, id) {
  if (!Number.isInteger(id) || id < 1) return null;
  return db.prepare('SELECT id, at, phone, gym, city, status, note FROM leads WHERE id = ?').bind(id).first();
}

export async function setLeadStatus(db, id, status, note) {
  if (!Number.isInteger(id) || id < 1 || !LEAD_STATUS.includes(status)) return false;
  const r = await db.prepare('UPDATE leads SET status = ?, note = ? WHERE id = ?').bind(status, String(note ?? '').slice(0, 500), id).run();
  return Boolean(r && r.meta && r.meta.changes);
}

/** AI use per gym since a day: { gymId: { calls, failed, tokensIn, tokensOut, rupees } }. */
export async function aiUsageByGym(db, fromDay) {
  const rows = (await db
    .prepare('SELECT gym_id, provider, SUM(calls) AS calls, SUM(failed) AS failed, SUM(tokens_in) AS tin, SUM(tokens_out) AS tout FROM ai_usage WHERE day >= ? GROUP BY gym_id, provider')
    .bind(fromDay)
    .all()).results ?? [];
  const out = {};
  for (const r of rows) {
    const g = (out[r.gym_id] ||= { calls: 0, failed: 0, tokensIn: 0, tokensOut: 0, rupees: 0 });
    g.calls += Number(r.calls) || 0;
    g.failed += Number(r.failed) || 0;
    g.tokensIn += Number(r.tin) || 0;
    g.tokensOut += Number(r.tout) || 0;
    g.rupees += costRupees(r.provider, r.tin, r.tout);
  }
  return out;
}

/** One gym's AI use per day since a day, newest first. */
export async function aiUsageDays(db, gymId, fromDay) {
  const rows = (await db
    .prepare('SELECT day, provider, SUM(calls) AS calls, SUM(failed) AS failed, SUM(tokens_in) AS tin, SUM(tokens_out) AS tout FROM ai_usage WHERE gym_id = ? AND day >= ? GROUP BY day, provider ORDER BY day DESC')
    .bind(gymId, fromDay)
    .all()).results ?? [];
  return rows.map((r) => ({ day: r.day, provider: r.provider, calls: Number(r.calls) || 0, failed: Number(r.failed) || 0, rupees: costRupees(r.provider, r.tin, r.tout) }));
}

/** Per-gym AI daily limits ({ gymId: perDay }); {} before table ai_limits exists. */
export async function aiLimits(db) {
  try {
    const rows = (await db.prepare('SELECT gym_id, per_day FROM ai_limits').all()).results ?? [];
    return Object.fromEntries(rows.map((r) => [r.gym_id, Number(r.per_day)]));
  } catch (e) {
    console.warn('[hq-web] ai_limits not readable (migration 0004 not applied yet?)', e instanceof Error ? e.message : 'error');
    return {};
  }
}

/** Set one gym's AI daily limit (0-200); null puts it back to the normal limit. */
export async function setAiLimit(db, gymId, perDay, now) {
  if (perDay === null) {
    await db.prepare('DELETE FROM ai_limits WHERE gym_id = ?').bind(gymId).run();
    return;
  }
  await db
    .prepare('INSERT INTO ai_limits (gym_id, per_day, set_at) VALUES (?, ?, ?) ON CONFLICT (gym_id) DO UPDATE SET per_day = excluded.per_day, set_at = excluded.set_at')
    .bind(gymId, perDay, now.toISOString())
    .run();
}

/** Counts for the System page. */
export async function webTotals(db, now) {
  const from = monthStart(now);
  const ai = await aiUsageByGym(db, from);
  const totals = Object.values(ai).reduce(
    (a, g) => ({ calls: a.calls + g.calls, failed: a.failed + g.failed, rupees: a.rupees + g.rupees }),
    { calls: 0, failed: 0, rupees: 0 },
  );
  const fb = await db.prepare("SELECT COUNT(*) AS n, SUM(status = 'new') AS fresh FROM feedback").first();
  const ld = await db.prepare("SELECT COUNT(*) AS n, SUM(status = 'new') AS fresh FROM leads").first();
  return {
    aiThisMonth: totals,
    feedback: { all: Number(fb?.n) || 0, new: Number(fb?.fresh) || 0 },
    leads: { all: Number(ld?.n) || 0, new: Number(ld?.fresh) || 0 },
  };
}

/**
 * The nightly clean-up of this database: feedback older than 1 year (the privacy notice), leads
 * older than 12 months without a deal (the lead form says so), AI usage older than 1 year.
 */
export async function nightlyWeb(db, now) {
  const yearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString();
  const f = await db.prepare('DELETE FROM feedback WHERE at < ?').bind(yearAgo).run();
  const l = await db.prepare("DELETE FROM leads WHERE at < ? AND status <> 'won'").bind(yearAgo).run();
  const a = await db.prepare('DELETE FROM ai_usage WHERE day < ?').bind(yearAgo.slice(0, 10)).run();
  return { feedback: f?.meta?.changes ?? 0, leads: l?.meta?.changes ?? 0, aiUsage: a?.meta?.changes ?? 0 };
}
