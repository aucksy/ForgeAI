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

// gyms.status (0027). Its 'trial' means "new, not checked by ForgeAI yet" and has NOTHING to do with
// the free trial (0030, trialEndsAt): the screens say "Free trial" only for that one.
export const STATUS_WORDS = { trial: 'New, not checked yet', active: 'Active (checked)', suspended: 'Paused by ForgeAI' };

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
  // Nobody signs in to it: a "Start demo" gym or a browser-only gym's shop. Not a gym to chase.
  const noPeople = Number(g.staff) === 0;
  if (noPeople) {
    out.push({ tone: 'info', words: 'Demo or browser-only (nobody signs in)' });
    return out;
  }
  if (now - created > 7 * DAY_MS && (Number.isNaN(last) || now - last > 7 * DAY_MS)) {
    out.push({ tone: 'warn', words: 'No desk activity for 7 days' });
  }
  if (g.status === 'trial') out.push({ tone: 'info', words: 'Not checked yet' });
  if (now - created <= 7 * DAY_MS) out.push({ tone: 'info', words: 'New this week' });
  return out;
}

// Gyms made by our own automatic tests (the phone and browser journeys sign up as "QA ... Gym" with the
// 98765000xx test mobiles), by the database tests, and the "Start demo" sample gym nobody signs in to.
const TEST_NAME = /^(QA |T\d+ |Sec Gym |Owner RPC check$|ForgeAI Test Gym$)/;
const DEMO_NAME = 'Iron Temple Fitness';

/** 'test', 'demo' or '' (a real gym). Hidden from the list unless "Show test and demo gyms" is on. */
export function testKind(g) {
  const name = String(g.name || '');
  if (TEST_NAME.test(name) || /^98765000\d\d$/.test(String(g.ownerPhone || ''))) return 'test';
  if (name === DEMO_NAME && Number(g.staff) === 0) return 'demo';
  return '';
}

/** Gyms that need a look (any bad or warn flag, or not checked yet). */
export function needsLook(gyms, now = Date.now()) {
  return gyms.filter((g) => flags(g, now).some((f) => f.tone !== 'info' || (g.status === 'trial' && Number(g.staff) > 0))).length;
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
  TRIAL_PAST: 'That date has already gone. Pick a later one.',
  TRIAL_CAP: 'That is longer than a free trial can be (6 months from its start). Pick an earlier date.',
  NEED_DATE: 'Pick the date the payment covers until.',
  BAD_DATE: 'That date is too far ahead (3 years at most).',
  NOT_READY: 'Trials need the database update (waiting for your yes).',
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
  delete_gym_refused: 'A gym delete was refused (nothing deleted)',
  feedback_status: 'Changed a feedback status',
  lead_status: 'Changed a lead status',
  ai_limit_set: 'Changed a gym’s AI limit',
  support_open: 'Opened support access (emergency)',
  support_close: 'Closed support access',
  support_view: 'Looked at a gym’s records (support access)',
  nightly_cleanup: 'Nightly clean-up',
  set_trial: 'Changed a gym’s free trial',
  set_plan: 'Set a gym’s plan',
  export_gyms: 'Exported the gym list (CSV)',
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
/** The warning on a delete request nobody has confirmed by phone yet. */
export const NOT_CHECKED_WORDS = 'Not checked: anyone signed in to the gym’s admin app could have sent this. Call the owner on the gym’s own number first.';

export function daysLeft(req) {
  return 30 - (Number(req.day) || 0);
}

// ------------------------------------------------------------------ free trial and plan (0030, R-97)
// A free trial is 3 months from its start; HQ may make it longer, never past 6 months from the
// start (the database refuses more: TRIAL_CAP). Nothing locks when it ends.

const IST_MS = 5.5 * 60 * 60 * 1000;
export const TRIAL_CAP_MONTHS = 6;
export const ENDING_SOON_DAYS = 14;

export const PLAN_WORDS = { starter: 'Starter', pro: 'Pro', ai: 'AI' };
export const BILLING_WORDS = { monthly: 'monthly', yearly: 'yearly', lifetime: 'lifetime' };
export const PLAN_CHOICES = [['', 'No plan yet (free trial)'], ['starter', 'Starter'], ['pro', 'Pro'], ['ai', 'AI']];
export const BILLING_CHOICES = [['monthly', 'Monthly'], ['yearly', 'Yearly'], ['lifetime', 'Lifetime (paid once)']];
export const NOT_READY_WORDS = 'Trials need the database update (waiting for your yes).';

/** The gym row came from a database with 0030 (it carries the trial keys, even when empty). */
export function hasTrialFields(g) {
  return Boolean(g) && Object.prototype.hasOwnProperty.call(g, 'trialEndsAt');
}

/** The India calendar day of a moment, as a day number (for "days left"). */
function indiaDayNo(ms) {
  return Math.floor((ms + IST_MS) / DAY_MS);
}

/** "24 Jan 2027" in India time; '' for nothing. */
export function dateWords(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' });
}

/** iso + n calendar months, counted in UTC with the day held (31 Jan + 1 = 28/29 Feb), like Postgres. */
export function addMonths(iso, n) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + n;
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const out = new Date(Date.UTC(y, m, Math.min(d.getUTCDate(), last), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), d.getUTCMilliseconds()));
  return out.toISOString();
}

/** The latest end the free trial may have: the server's own number when it sent one. */
export function trialCap(g) {
  if (g.trialCapAt) return new Date(g.trialCapAt).toISOString();
  return g.trialStartsAt ? addMonths(g.trialStartsAt, TRIAL_CAP_MONTHS) : null;
}

/** India days from today to the trial's end day (0 = ends today, negative = ended); null = unknown. */
export function trialDaysLeft(g, now = Date.now()) {
  const end = g.trialEndsAt ? Date.parse(g.trialEndsAt) : NaN;
  if (Number.isNaN(end)) return null;
  return indiaDayNo(end) - indiaDayNo(now);
}

/**
 * Where a gym stands: 'unknown' (database without 0030), 'trial', 'trial_ended', 'paying',
 * 'lapsed' (monthly or yearly, paid-until passed) or 'lifetime'.
 */
export function billingState(g, now = Date.now()) {
  if (!hasTrialFields(g)) return 'unknown';
  if (g.plan) {
    if (g.billing === 'lifetime') return 'lifetime';
    const until = g.paidUntil ? Date.parse(g.paidUntil) : NaN;
    return !Number.isNaN(until) && until >= now ? 'paying' : 'lapsed';
  }
  const end = g.trialEndsAt ? Date.parse(g.trialEndsAt) : NaN;
  if (Number.isNaN(end)) return 'unknown';
  return end > now ? 'trial' : 'trial_ended';
}

/** "Free trial: 41 days left", "Free trial: last day", "Free trial ended 3 days ago". */
export function trialWords(g, now = Date.now()) {
  const left = trialDaysLeft(g, now);
  if (left === null) return '';
  if (Date.parse(g.trialEndsAt) <= now) {
    const ago = -left;
    return ago <= 0 ? 'Free trial ended today' : `Free trial ended ${ago === 1 ? '1 day' : `${ago} days`} ago`;
  }
  if (left <= 0) return 'Free trial: last day';
  return `Free trial: ${left === 1 ? '1 day' : `${left} days`} left`;
}

/** "Pro, yearly, paid until 24 Oct 2027", "AI, lifetime", or "" with no plan. */
export function planWords(g) {
  if (!g.plan) return '';
  const name = PLAN_WORDS[g.plan] || g.plan;
  if (g.billing === 'lifetime') return `${name}, lifetime`;
  const how = BILLING_WORDS[g.billing] || g.billing || '';
  return `${name}, ${how}${g.paidUntil ? `, paid until ${dateWords(g.paidUntil)}` : ''}`;
}

/** The one badge on a gym's row: { tone: 'good' | 'warn' | 'bad' | 'info', words } or null. */
export function billingBadge(g, now = Date.now()) {
  const s = billingState(g, now);
  if (s === 'unknown') return null;
  if (s === 'lifetime' || s === 'paying') return { tone: 'good', words: planWords(g) };
  if (s === 'lapsed') return { tone: 'bad', words: `${PLAN_WORDS[g.plan] || g.plan}: payment due since ${dateWords(g.paidUntil) || 'unknown'}` };
  if (s === 'trial_ended') return { tone: 'bad', words: `${trialWords(g, now)}, no plan` };
  return { tone: trialDaysLeft(g, now) <= ENDING_SOON_DAYS ? 'warn' : 'info', words: trialWords(g, now) };
}

/** The gym-list filters, in the order the picker shows them. */
export const FILTERS = [
  ['all', 'All gyms'],
  ['look', 'Need a look'],
  ['trial', 'On free trial'],
  ['ending', `Free trial ends within ${ENDING_SOON_DAYS} days`],
  ['ended', 'Free trial ended, not paid'],
  ['paying', 'Paying'],
  ['lifetime', 'Lifetime'],
  ['unchecked', 'New, not checked yet'],
  ['paused', 'Paused'],
];
const TRIAL_FILTERS = new Set(['trial', 'ending', 'ended', 'paying', 'lifetime']);

/** The filters that need the trial fields (left out of the picker until 0030 is applied). */
export function filterNeedsTrial(f) {
  return TRIAL_FILTERS.has(f);
}

/** Is gym g in filter f? */
export function inFilter(g, f, now = Date.now()) {
  const s = billingState(g, now);
  switch (f) {
    case 'trial':
      return s === 'trial';
    case 'ending':
      return s === 'trial' && trialDaysLeft(g, now) <= ENDING_SOON_DAYS;
    case 'ended':
      return s === 'trial_ended' || s === 'lapsed';
    case 'paying':
      return s === 'paying';
    case 'lifetime':
      return s === 'lifetime';
    case 'look':
      return needsLook([g], now) === 1;
    case 'unchecked':
      return g.status === 'trial';
    case 'paused':
      return g.status === 'suspended';
    default:
      return true;
  }
}

/** Search by gym name, gym code, owner's name (every word must be there) or owner's mobile. */
export function matchesSearch(g, q) {
  const words = String(q || '').trim().toLowerCase();
  if (!words) return true;
  const hay = [g.name, g.joinCode, g.ownerName].map((x) => String(x || '').toLowerCase()).join(' ');
  if (words.split(/\s+/).every((w) => hay.includes(w))) return true;
  const digits = words.replace(/[^0-9]/g, '');
  return digits.length >= 3 && digits.length === words.replace(/[\s+-]/g, '').length && String(g.ownerPhone || '').includes(digits);
}

export const SORTS = [
  ['new', 'Newest first'],
  ['trial', 'Free trial ends soonest'],
  ['members', 'Most members'],
  ['activity', 'Last desk activity'],
  ['name', 'Name A to Z'],
];

/** A sorted copy. 'trial': gyms on a free trial by end (ended ones first), then everyone else. */
export function sortGyms(gyms, key, now = Date.now()) {
  const t = (iso) => (iso ? Date.parse(iso) || 0 : 0);
  const trialKey = (g) => {
    const s = billingState(g, now);
    return s === 'trial' || s === 'trial_ended' ? t(g.trialEndsAt) : Number.MAX_SAFE_INTEGER;
  };
  const by = {
    new: (a, b) => t(b.createdAt) - t(a.createdAt),
    name: (a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'en', { sensitivity: 'base' }),
    members: (a, b) => (Number(b.membersRegister) || 0) - (Number(a.membersRegister) || 0),
    activity: (a, b) => t(b.lastDeskActivity) - t(a.lastDeskActivity),
    trial: (a, b) => trialKey(a) - trialKey(b),
  }[key] || ((a, b) => t(b.createdAt) - t(a.createdAt));
  return [...gyms].sort(by);
}

/** The numbers across the top of the gym list. */
export function summary(gyms, now = Date.now()) {
  const n = (f) => gyms.filter((g) => inFilter(g, f, now)).length;
  return {
    gyms: gyms.length,
    members: gyms.reduce((s, g) => s + (Number(g.membersRegister) || 0), 0),
    membersApp: gyms.reduce((s, g) => s + (Number(g.membersApp) || 0), 0),
    newWeek: gyms.filter((g) => now - Date.parse(g.createdAt) <= 7 * DAY_MS).length,
    onTrial: n('trial'),
    endingSoon: n('ending'),
    ended: n('ended'),
    paying: n('paying') + n('lifetime'),
    needLook: needsLook(gyms, now),
  };
}

/**
 * The free-trial quick picks on a gym's page: +1, +2, ... months from the trial's end (from today
 * when it has ended), never past the cap, then the cap itself. Each: { label, endsAt }. Empty at the cap.
 */
export function trialPicks(g, now = Date.now()) {
  const cap = trialCap(g);
  if (!cap) return [];
  const capMs = Date.parse(cap);
  const end = g.trialEndsAt ? Date.parse(g.trialEndsAt) : NaN;
  const from = Number.isNaN(end) ? now : Math.max(end, now);
  const out = [];
  for (let m = 1; m <= TRIAL_CAP_MONTHS; m++) {
    const at = addMonths(new Date(from).toISOString(), m);
    if (Date.parse(at) > capMs) break;
    out.push({ label: `+${m} ${m === 1 ? 'month' : 'months'} (to ${dateWords(at)})`, endsAt: at });
  }
  const last = out.length ? Date.parse(out[out.length - 1].endsAt) : from;
  if (capMs > last && capMs > now) out.push({ label: `Up to the most allowed (${dateWords(cap)})`, endsAt: cap });
  return out;
}

/** The cap in words, for the gym page. */
export function capWords(g) {
  const cap = trialCap(g);
  return cap ? `The free trial can go up to ${dateWords(cap)} at most (6 months from its start on ${dateWords(g.trialStartsAt)}).` : '';
}

/** The India day of a moment as a date box wants it ("2027-01-24"); '' for nothing. */
export function indiaDayOf(iso) {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isNaN(t) ? '' : new Date(t + IST_MS).toISOString().slice(0, 10);
}

/** An India day picked in a date box ("2027-01-24") as the end of that day, India time; else null. */
export function endOfIndiaDay(day) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(day || '')) ? new Date(`${day}T23:59:59+05:30`).toISOString() : null;
}

// ------------------------------------------------------------------ "Export gyms (CSV)"
// Gym-level facts only: never a member's name or number (HQ sees counts). The gym owner's own name
// and mobile are ForgeAI's business contact. Gyms carry no city yet, so there is no city column.
const CSV_COLUMNS = [
  ['Gym name', (g) => g.name],
  ['Gym code', (g) => g.joinCode],
  ['Owner name', (g) => g.ownerName],
  ['Owner mobile', (g) => g.ownerPhone],
  ['Started', (g) => dateWords(g.createdAt)],
  ['Status', (g) => STATUS_WORDS[g.status] || g.status],
  ['Free trial ends', (g) => dateWords(g.trialEndsAt)],
  ['Plan', (g) => PLAN_WORDS[g.plan] || g.plan || ''],
  ['Billing', (g) => BILLING_WORDS[g.billing] || g.billing || ''],
  ['Paid until', (g) => (g.billing === 'lifetime' ? 'for ever' : dateWords(g.paidUntil))],
  ['Members in the register', (g) => Number(g.membersRegister) || 0],
  ['Members in the app', (g) => Number(g.membersApp) || 0],
];

/** One CSV cell: quoted when needed; a cell a spreadsheet would run as a formula gets a ' first. */
export function csvCell(v) {
  let s = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const BOM = String.fromCharCode(0xfeff);

/** The gym list as CSV text (with a byte-order mark so Excel reads Hindi names right). */
export function gymsCsv(gyms) {
  const lines = [CSV_COLUMNS.map(([head]) => csvCell(head)).join(',')];
  for (const g of gyms) lines.push(CSV_COLUMNS.map(([, f]) => csvCell(f(g))).join(','));
  return `${BOM}${lines.join('\r\n')}\r\n`;
}

/** "forgeai-gyms-2026-10-24.csv" (India day). */
export function csvName(now = Date.now()) {
  return `forgeai-gyms-${new Date(now + IST_MS).toISOString().slice(0, 10)}.csv`;
}
