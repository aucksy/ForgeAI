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
// R-277 (migrations/0008): the AI answer and the "Did this solve it?" tap. R-319 item 10 (0009): whether
// the AI covered it, the team's reply, and whether the phone can get a pop-up (never the address itself).
const HELP_COLS = "answer, helped, covered, reply, reply_at, (push_to <> '') AS can_push";

/**
 * A help question still waiting for a person (R-319 item 10): sent from an app, not sorted away
 * (done, spam, a crash report), no reply yet, and the AI either did not answer, said the team will
 * reply, or the person tapped "No, it did not help". Plain feedback (no AI box, covered '') with status
 * 'question' counts too. PURE (one row).
 */
export function needsReply(r) {
  if (!r || (r.source !== 'member' && r.source !== 'admin')) return false;
  if (['done', 'spam', 'crash'].includes(r.status)) return false;
  if (String(r.reply || '').trim()) return false;
  return r.covered === 'no' || r.covered === 'none' || r.helped === 'no' || (r.covered === '' && r.status === 'question');
}

/** The same rule in SQL, for counting (keep it beside needsReply). */
const NEEDS_REPLY_SQL =
  "source IN ('member', 'admin') AND status NOT IN ('done', 'spam', 'crash') AND reply = '' " +
  "AND (covered IN ('no', 'none') OR helped = 'no' OR (covered = '' AND status = 'question'))";

/** True when D1 said a column is missing (a migration not applied yet). PURE. */
export function missingColumn(e) {
  return /no (such )?column|has no column/i.test(String(e && e.message));
}

/**
 * Feedback rows, newest first. `status` filters by status; 'needs-reply' by needsReply. Before
 * migrations 0008/0009 the rows come without the help columns (every row answer '' and so on).
 */
export async function listFeedback(db, { status = null, limit = 200 } = {}) {
  const lim = Math.min(Math.max(Number(limit) || 200, 1), 500);
  const read = async (cols, where = '', args = []) =>
    (await db.prepare(`SELECT ${cols} FROM feedback ${where} ORDER BY at DESC LIMIT ?`).bind(...args, lim).all()).results ?? [];
  const where = status && FEEDBACK_STATUS.includes(status) ? ['WHERE status = ?', [status]] : ['', []];
  const help = async (cols) =>
    status === 'needs-reply' ? (await read(cols, `WHERE ${NEEDS_REPLY_SQL}`)).map(withNeeds) : (await read(cols, ...where)).map(withNeeds);
  try {
    // R-452 (migration 0014): every reply the team sent, oldest first.
    return await help(`${FEEDBACK_COLS}, ${HELP_COLS}, replies`);
  } catch (e) {
    if (!missingColumn(e)) throw e;
  }
  try {
    // Before 0014: one reply each (shown as a list of one).
    return await help(`${FEEDBACK_COLS}, ${HELP_COLS}`);
  } catch (e) {
    if (!missingColumn(e)) throw e;
    console.warn('[hq-web] help columns missing (panel migrations 0008/0009 not applied?)');
    if (status === 'needs-reply') return [];
    return (await read(FEEDBACK_COLS, ...where)).map((r) => ({ ...r, answer: '', helped: '', covered: '', reply: '', reply_at: '', can_push: 0, needsReply: false, replyList: [], replyListKept: false }));
  }
}

function withNeeds(r) {
  const { replies, ...rest } = r;
  return {
    ...rest,
    can_push: Number(r.can_push) ? 1 : 0,
    needsReply: needsReply(r),
    // Every reply, oldest first; replyListKept: HQ adds a new reply under the others (0014), else it replaces.
    replyList: replyListOf(replies, r.reply, r.reply_at),
    replyListKept: replies !== undefined,
  };
}

export const REPLY_MAX = 1500;

/** The owner's reply, checked: trimmed, line breaks kept, at most REPLY_MAX. '' when empty. PURE. */
export function cleanReply(v) {
  return (typeof v === 'string' ? v : '').replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, REPLY_MAX);
}

/** At most this many team replies are kept per question (the same as panel help.js MAX_TEAM_REPLIES). */
export const MAX_TEAM_REPLIES = 20;

/**
 * Every team reply to one question, oldest first: the saved JSON list (panel migration 0014), or the one
 * `reply` column as a list of one. PURE (the same rule as panel help.js replyListOf).
 */
export function replyListOf(raw, reply = '', replyAt = '') {
  let list = [];
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const j = JSON.parse(raw);
      if (Array.isArray(j)) {
        list = j
          .filter((x) => x && typeof x.text === 'string' && x.text.trim())
          .map((x) => ({ text: x.text.trim(), at: typeof x.at === 'string' ? x.at : '' }));
      }
    } catch (e) {
      console.warn('[hq-web] a saved reply list is not JSON; using the one reply', e instanceof Error ? e.message : 'error');
    }
  }
  const one = String(reply || '').trim();
  if (!list.length && one) list = [{ text: one, at: String(replyAt || '') }];
  return list.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0)).slice(-MAX_TEAM_REPLIES);
}

/**
 * Save the team's reply to one message; the message is marked done. -> { pushTo } (the phone's push
 * address, '' when none; cleared here so it is used once) or null when there is no such message.
 * R-452: with panel migration 0014 a new reply is ADDED under the earlier ones (a correction or a top-up
 * after the AI's answer or an earlier reply); `reply` / `reply_at` always hold the newest, for older apps.
 * Before 0014 the new reply replaces the old one, as before.
 */
export async function saveReply(db, id, reply, now) {
  if (!Number.isInteger(id) || id < 1 || !reply) return null;
  const at = now.toISOString();
  let row;
  try {
    row = await db.prepare('SELECT id, push_to, reply, reply_at, replies FROM feedback WHERE id = ?').bind(id).first();
  } catch (e) {
    if (!missingColumn(e)) throw e;
    // Before 0014: one reply per question, the new one replaces it.
    const old = await db.prepare('SELECT id, push_to FROM feedback WHERE id = ?').bind(id).first();
    if (!old) return null;
    await db
      .prepare("UPDATE feedback SET reply = ?, reply_at = ?, push_to = '', status = 'done', sorted_at = ? WHERE id = ?")
      .bind(reply, at, at, id)
      .run();
    return { pushTo: String(old.push_to || '') };
  }
  if (!row) return null;
  const list = [...replyListOf(row.replies, row.reply, row.reply_at), { text: reply, at }].slice(-MAX_TEAM_REPLIES);
  await db
    .prepare("UPDATE feedback SET reply = ?, reply_at = ?, replies = ?, push_to = '', status = 'done', sorted_at = ? WHERE id = ?")
    .bind(reply, at, JSON.stringify(list), at, id)
    .run();
  return { pushTo: String(row.push_to || '') };
}

/**
 * ONE help question for the English helper (english.js), by its id: who sent it, its words, the AI's
 * earlier answer and every earlier team reply. Never any other row. null when there is no such row.
 * Before panel migrations 0008/0009 the answer and reply are ''.
 */
export async function getHelpQuestion(db, id) {
  if (!Number.isInteger(id) || id < 1) return null;
  // Newest columns first: the reply list (panel 0014, R-452), then one reply (0008/0009), then the words only.
  let row = null;
  for (const cols of ['id, source, text, answer, reply, reply_at, replies', 'id, source, text, answer, reply, reply_at', 'id, source, text']) {
    try {
      row = await db.prepare(`SELECT ${cols} FROM feedback WHERE id = ?`).bind(id).first();
      break;
    } catch (e) {
      if (!missingColumn(e)) throw e;
    }
  }
  if (!row) return null;
  // Every team reply sent so far, oldest first (a correction or a top-up after the first one).
  const earlierReply = replyListOf(row.replies, row.reply, row.reply_at).map((x, i) => `${i + 1}. ${x.text}`).join(String.fromCharCode(10));
  return { id: row.id, source: row.source === 'admin' ? 'admin' : 'member', question: String(row.text || ''), aiAnswer: String(row.answer || ''), earlierReply };
}

/**
 * What waits for the owner in Cloudflare's database (HQ's "Needs you"): new leads, new feedback, help
 * questions that need a reply. A part that cannot be read (a migration not applied) is null.
 */
export async function webNeeds(db) {
  const count = async (sql) => {
    try {
      return Number((await db.prepare(sql).first())?.n) || 0;
    } catch (e) {
      console.warn('[hq-web] a Needs you count could not be read', e instanceof Error ? e.message : 'error');
      return null;
    }
  };
  return {
    leadsNew: await count("SELECT COUNT(*) AS n FROM leads WHERE status = 'new'"),
    // New feedback that is not already counted as a help question waiting for a reply.
    feedbackNew:
      (await count(`SELECT COUNT(*) AS n FROM feedback WHERE status = 'new' AND source IN ('member', 'admin') AND NOT (${NEEDS_REPLY_SQL})`)) ??
      (await count("SELECT COUNT(*) AS n FROM feedback WHERE status = 'new' AND source IN ('member', 'admin')")),
    helpNeedsReply: await count(`SELECT COUNT(*) AS n FROM feedback WHERE ${NEEDS_REPLY_SQL}`),
  };
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
    // Anyone signed in to the admin app (a front-desk person too) could have sent it: never checked
    // until HQ calls the gym's own number (hq_delete_gym refuses before that step: NOT_CALLED).
    return { feedbackId: r.id, at: r.at, joinCode: m ? m[1] : null, status: r.status, checked: false, text: String(r.text || '').slice(0, 300) };
  });
}

// F184 (R-242): `source` 'member-referral' = the gym came through a member's shared link. Until migration
// 0007 is applied the column is missing: the list is then read without it (every lead source '').
export async function listLeads(db, { limit = 300 } = {}) {
  const lim = Math.min(Math.max(Number(limit) || 300, 1), 1000);
  const cols = 'id, at, phone, gym, city, size, today, lang, status, note';
  try {
    return (await db.prepare(`SELECT ${cols}, source FROM leads ORDER BY at DESC LIMIT ?`).bind(lim).all()).results ?? [];
  } catch (e) {
    if (!/no (such )?column|has no column/i.test(String(e && e.message))) throw e;
    const rows = (await db.prepare(`SELECT ${cols} FROM leads ORDER BY at DESC LIMIT ?`).bind(lim).all()).results ?? [];
    return rows.map((r) => ({ ...r, source: '' }));
  }
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
    .prepare("SELECT gym_id, provider, SUM(calls) AS calls, SUM(failed) AS failed, SUM(tokens_in) AS tin, SUM(tokens_out) AS tout FROM ai_usage WHERE day >= ? AND kind NOT LIKE 'assist%' GROUP BY gym_id, provider")
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
    .prepare("SELECT day, provider, SUM(calls) AS calls, SUM(failed) AS failed, SUM(tokens_in) AS tin, SUM(tokens_out) AS tout FROM ai_usage WHERE gym_id = ? AND day >= ? AND kind NOT LIKE 'assist%' GROUP BY day, provider ORDER BY day DESC")
    .bind(gymId, fromDay)
    .all()).results ?? [];
  return rows.map((r) => ({ day: r.day, provider: r.provider, calls: Number(r.calls) || 0, failed: Number(r.failed) || 0, rupees: costRupees(r.provider, r.tin, r.tout) }));
}

/**
 * F201: one gym's AI assistant use since a day (deploy/panel/assist.js writes it): requests ('assist' rows, Claude
 * tokens) and spoken seconds ('assist-voice' rows; calls = seconds). The column-matching numbers above leave these
 * out. -> { asks, failed, voiceSeconds, rupees }
 */
export async function assistUsage(db, gymId, fromDay) {
  const rows = (await db
    .prepare("SELECT kind, SUM(calls) AS calls, SUM(failed) AS failed, SUM(tokens_in) AS tin, SUM(tokens_out) AS tout FROM ai_usage WHERE gym_id = ? AND day >= ? AND kind IN ('assist', 'assist-voice') GROUP BY kind")
    .bind(gymId, fromDay)
    .all()).results ?? [];
  const out = { asks: 0, failed: 0, voiceSeconds: 0, rupees: 0 };
  for (const r of rows) {
    if (r.kind === 'assist') {
      out.asks += Number(r.calls) || 0;
      out.failed += Number(r.failed) || 0;
      out.rupees += costRupees('claude', r.tin, r.tout);
    } else {
      out.voiceSeconds += Number(r.calls) || 0;
    }
  }
  return out;
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

// ------------------------------------------------------------------ HQ messages (R-243)
// What HQ sends to every gym's admin app (migrations/0006_hq_messages.sql). The panel Worker hands
// them out (deploy/panel/hqNews.js); the admin app shows them in its notification bell.

export const MESSAGE_LIMITS = { title: 80, body: 500, label: 30, link: 200 };
const APP_PATH = /^\/[a-z0-9/-]{0,60}$/;

/** The checked message, or an error code (BAD_TITLE, BAD_BODY, BAD_LINK). PURE. */
export function checkMessage(b) {
  const clean = (v, n) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '').slice(0, n);
  const title = clean(b && b.title, MESSAGE_LIMITS.title);
  // The body keeps its line breaks (a short list reads better), but no runs of empty lines.
  const body = (typeof (b && b.body) === 'string' ? b.body : '').replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, MESSAGE_LIMITS.body);
  const link = clean(b && b.link, MESSAGE_LIMITS.link);
  const label = clean(b && b.label, MESSAGE_LIMITS.label);
  if (title.length < 3) return { error: 'BAD_TITLE' };
  if (body.length < 3) return { error: 'BAD_BODY' };
  if (link) {
    let ok = APP_PATH.test(link);
    if (!ok) {
      try {
        const u = new URL(link);
        ok = u.protocol === 'https:' && !u.username && !u.password;
      } catch {
        ok = false; // quiet: answered as BAD_LINK
      }
    }
    if (!ok || !label) return { error: 'BAD_LINK' };
  }
  return { value: { title, body, link, label: link ? label : '' } };
}

export async function listMessages(db, { limit = 100 } = {}) {
  const lim = Math.min(Math.max(Number(limit) || 100, 1), 300);
  return (await db.prepare('SELECT id, at, title, body, link, label, removed_at FROM hq_messages ORDER BY id DESC LIMIT ?').bind(lim).all()).results ?? [];
}

/** Saves a checked message; its new id. */
export async function addMessage(db, v, now) {
  const r = await db
    .prepare('INSERT INTO hq_messages (at, title, body, link, label) VALUES (?, ?, ?, ?, ?)')
    .bind(now.toISOString(), v.title, v.body, v.link, v.label)
    .run();
  return Number(r?.meta?.last_row_id) || null;
}

/** Takes a message back (the bell stops showing it). False when there is no such message. */
export async function removeMessage(db, id, now) {
  if (!Number.isInteger(id) || id < 1) return false;
  const r = await db.prepare('UPDATE hq_messages SET removed_at = ? WHERE id = ? AND removed_at IS NULL').bind(now.toISOString(), id).run();
  return Boolean(r && r.meta && r.meta.changes);
}
