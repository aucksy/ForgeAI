// ForgeAI HQ page: the words and numbers, as pure functions (tested: apps/hq/test/logic.test.mjs).
// Plain English for the owner; no database words ever reach the screen.

const DAY_MS = 24 * 60 * 60 * 1000;

/** ₹ with Indian grouping, from paise: 12345600 -> "₹1,23,456". */
export function rupees(paise) {
  const n = Math.round((Number(paise) || 0) / 100);
  return `₹${n.toLocaleString('en-IN')}`;
}

/** ₹ from rupees with paise shown when small: 0.4 -> "₹0.40", 1234.5 -> "₹1,235". */
export function rupeesExact(r) {
  const n = Number(r) || 0;
  return n < 100 ? `₹${n.toFixed(2)}` : `₹${Math.round(n).toLocaleString('en-IN')}`;
}

export function count(n, one, many = `${one}s`) {
  const v = Number(n) || 0;
  return `${v.toLocaleString('en-IN')} ${v === 1 ? one : many}`;
}

/** "just now", "5 min ago", "3 h ago", "2 days ago", or "never". */
export function ago(iso, now = Date.now()) {
  if (!iso) return 'never';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return 'never';
  const s = Math.max(0, (now - t) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  const d = Math.floor(s / 86400);
  return d === 1 ? '1 day ago' : `${d} days ago`;
}

/** "23 Oct 2026, 14:05" in India time. */
export function when(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
}

/** "14:05" in India time. */
export function clock(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false });
}

export function megabytes(bytes) {
  return Math.round((Number(bytes) || 0) / (1024 * 1024));
}

export const STATUS_WORDS = { trial: 'New, not checked yet', active: 'Active', suspended: 'Paused by ForgeAI' };

/** The flags on a gym's row, most urgent first. Each: { tone: 'bad' | 'warn' | 'info', words }. */
export function flags(g, now = Date.now()) {
  const out = [];
  if (g.status === 'suspended') out.push({ tone: 'bad', words: 'Paused' });
  if (g.deleteRequest) out.push({ tone: 'bad', words: `Delete asked (day ${g.deleteRequest.day} of 30)` });
  if (g.supportUntil && Date.parse(g.supportUntil) > now) {
    out.push({ tone: 'warn', words: `Support access open until ${clock(g.supportUntil)}` });
  }
  if ((Number(g.failedSignins24h) || 0) >= 10) out.push({ tone: 'warn', words: 'Many wrong sign-in codes' });
  if (g.aiLimit != null && g.aiToday != null && g.aiLimit > 0 && g.aiToday >= g.aiLimit) out.push({ tone: 'warn', words: 'AI limit hit today' });
  const created = Date.parse(g.createdAt);
  const last = g.lastDeskActivity ? Date.parse(g.lastDeskActivity) : NaN;
  if (now - created > 7 * DAY_MS && (Number.isNaN(last) || now - last > 7 * DAY_MS)) {
    out.push({ tone: 'warn', words: 'No desk activity for 7 days' });
  }
  if (g.status === 'trial') out.push({ tone: 'info', words: 'Not checked yet' });
  if (now - created <= 7 * DAY_MS) out.push({ tone: 'info', words: 'New this week' });
  return out;
}

/** Gyms that need a look (any bad or warn flag, or not checked yet). */
export function needsLook(gyms, now = Date.now()) {
  return gyms.filter((g) => flags(g, now).some((f) => f.tone !== 'info' || g.status === 'trial')).length;
}

/** What a refusal means, in plain words. */
const ERRORS = {
  SIGN_IN: 'You were signed out. Sign in again.',
  FRESH: 'For this, sign in again first (it must be within the last 15 minutes).',
  SAME_ORIGIN: 'That came from another page and was stopped.',
  BAD_REQUEST: 'Something in the form is missing or wrong.',
  NOT_FOUND: 'That is not here.',
  NEED_REASON: 'Write a reason (at least a few words).',
  BAD_PHONE: 'Type a 10-digit mobile number.',
  EMPTY: 'Fill in every box.',
  GONE: 'That gym or request is not there any more. The page was refreshed.',
  CONFIRM_CALL: 'Tick that you called the gym’s own number first.',
  PICK_OWNER: 'This gym has more than one owner. Pick the owner.',
  TOO_MANY: 'Too many codes for this gym in the last hour. Wait a little.',
  CLOSED: 'That request is already closed.',
  NOT_CALLED: 'First call the gym’s own number and tick “Called”.',
  NOT_REMINDED: 'First remind them to download their data and tick “Reminded”.',
  WRONG_CODE: 'That is not this gym’s code. Nothing was deleted.',
  STILL_ROWS: 'Something of the gym was still left, so nothing was deleted. Tell Claude.',
  NO_ACCESS: 'Support access is closed. Open it again to look.',
  INVALID: 'That choice is not allowed.',
  NO_ACTOR: 'Your sign-in could not be read. Sign in again.',
  NO_WEB_DB: 'Feedback, leads and AI use are not connected yet.',
  OFFLINE: 'The gym server did not answer. Try again in a minute.',
  HQ_ONLY: 'Only HQ can do that.',
  SUSPENDED: 'This gym is paused.',
};

export function errorWords(code) {
  return ERRORS[code] || 'Something went wrong. Try again, or tell Claude.';
}

/** The audit log's action names, in plain words. */
const ACTIONS = {
  sign_in: 'Signed in to HQ',
  view_all_gyms: 'Looked at all gyms',
  view_gym: 'Looked at a gym',
  view_system: 'Looked at the System page',
  view_audit: 'Looked at this log',
  view_feedback: 'Looked at feedback',
  view_leads: 'Looked at leads',
  view_delete_requests: 'Looked at delete requests',
  view_access_log: 'Looked at a gym’s sign-in history',
  approve_gym: 'Approved a gym',
  suspend_gym: 'Paused a gym',
  restore_gym: 'Un-paused a gym',
  create_gym: 'Made a gym',
  reset_owner_signin: 'Made a new sign-in code for an owner',
  sign_out_gym: 'Signed a gym out everywhere',
  delete_request_added: 'Wrote down a delete request',
  delete_request_called: 'Called the gym about deleting',
  delete_request_reminded: 'Reminded the gym to download',
  delete_request_cancel: 'Cancelled a delete request',
  delete_request_member_done: 'Erased a member’s details',
  delete_gym: 'Deleted a gym',
  delete_gym_files_left: 'Some pictures were left after a delete',
  feedback_status: 'Changed a feedback status',
  lead_status: 'Changed a lead status',
  ai_limit_set: 'Changed a gym’s AI limit',
  support_open: 'Opened support access (emergency)',
  support_close: 'Closed support access',
  support_view: 'Looked at a gym’s records (support access)',
  nightly_cleanup: 'Nightly clean-up',
};

export function actionWords(action) {
  return ACTIONS[action] || action;
}

export const REASON_KINDS = [
  ['leak', 'Suspected data leak'],
  ['legal', 'A legal demand'],
  ['erase', 'A member’s erase request the gym cannot handle'],
  ['locked_out', 'The owner is locked out'],
  ['other', 'Something else'],
];

export const RECORD_KINDS = [
  ['member', 'Members'],
  ['plan', 'Plans'],
  ['membership', 'Memberships'],
  ['payment', 'Receipts'],
  ['visit', 'Check-ins'],
  ['order', 'Shop orders'],
  ['staff', 'Staff list'],
];

/** One record as a few labelled cells, for the read-only support view. */
export function recordCells(kind, row) {
  const d = row.d || row;
  const pick = (...keys) => keys.map((k) => d[k]).find((v) => v !== undefined && v !== null && v !== '');
  switch (kind) {
    case 'member':
      return [['Name', pick('fullName', 'name')], ['Mobile', pick('phone')], ['Id', row.id]];
    case 'plan':
      return [['Plan', pick('name')], ['Price', d.priceP != null ? rupees(d.priceP) : pick('price')], ['Length', [pick('durationCount'), pick('durationUnit')].filter(Boolean).join(' ')]];
    case 'membership':
      return [['Plan', pick('planName')], ['Member', pick('memberId')], ['From', pick('startsOn')], ['To', pick('endsOn')], ['Cancelled', d.cancelled ? 'yes' : '']];
    case 'payment':
      return [['Receipt', pick('receiptNo')], ['Amount', d.amountP != null ? rupees(d.amountP) : ''], ['Paid on', pick('paidOn')], ['Cancelled', d.voided ? 'yes' : '']];
    case 'visit':
      return [['Member', pick('memberId')], ['Day', pick('visitedOn')]];
    case 'order':
      return [['Order', d.orderNo != null ? `#${d.orderNo}` : ''], ['Member', pick('memberName')], ['Total', d.totalP != null ? rupees(d.totalP) : ''], ['Status', pick('status')]];
    case 'staff':
      return [['Name', pick('name')], ['Mobile', pick('phone')], ['Role', d.role === 'owner' ? 'Owner' : 'Front desk']];
    default:
      return [];
  }
}

/** The message to send the owner on WhatsApp with a new sign-in code. */
export function codeMessage(gymName, code) {
  return `ForgeAI: your sign-in code for ${gymName} is ${code}. Open the ForgeAI admin app, type your mobile number and this code. It works once, for 30 minutes.`;
}

/** The gym of a 6-letter code from the list, or null. */
export function gymByCode(gyms, code) {
  return gyms.find((g) => g.joinCode === code) || null;
}

/** Days left of the 30 the privacy notice promises (0 on the last day, negative when late). */
export function daysLeft(req) {
  return 30 - (Number(req.day) || 0);
}
