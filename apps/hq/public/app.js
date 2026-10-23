// ForgeAI HQ page (#51). Plain static script: no build, no outside files (the Worker's strict CSP
// allows only this address). Every name, number and message from the server is put on screen as
// text (textContent), never as HTML. Nothing is kept in the browser: each page asks the Worker.
import {
  REASON_KINDS,
  RECORD_KINDS,
  STATUS_WORDS,
  actionWords,
  ago,
  codeMessage,
  count,
  daysLeft,
  errorWords,
  flags,
  gymByCode,
  NOT_CHECKED_WORDS,
  megabytes,
  needsLook,
  recordCells,
  rupees,
  rupeesExact,
  when,
} from './logic.js';

const main = document.getElementById('main');

// ------------------------------------------------------------------ small helpers
function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const kid of kids.flat()) {
    if (kid === null || kid === undefined || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

class HqError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

async function api(path, body) {
  const init = body === undefined
    ? { credentials: 'same-origin' }
    : { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
  let res;
  try {
    res = await fetch(path, init);
  } catch (e) {
    console.warn('[hq] no answer', path, e);
    throw new HqError('OFFLINE');
  }
  let data = null;
  try {
    data = await res.json();
  } catch (e) {
    console.warn('[hq] answer was not JSON', path, res.status, e);
  }
  if (res.status === 401 && data && data.error === 'SIGN_IN') {
    location.href = `/auth/login?back=${encodeURIComponent(`/${location.hash}`)}`;
    throw new HqError('SIGN_IN');
  }
  if (!res.ok) throw new HqError((data && data.error) || 'UNKNOWN');
  return data;
}

function note(words, tone = 'bad') {
  return h('p', { class: `note ${tone}`, role: tone === 'bad' ? 'alert' : 'status' }, words);
}

function fail(box, e) {
  const code = e instanceof HqError ? e.code : 'UNKNOWN';
  if (!(e instanceof HqError)) console.error('[hq]', e);
  box.replaceChildren(note(errorWords(code)));
  if (code === 'FRESH') {
    box.append(h('p', {}, h('a', { class: 'button', href: `/auth/login?fresh=1&back=${encodeURIComponent(`/${location.hash}`)}` }, 'Sign in again')));
  }
}

/** A button that runs an action once at a time, showing what happened in `out`. */
function action(label, run, { tone = '', out } = {}) {
  const b = h('button', { class: `button ${tone}`, type: 'button' }, label);
  b.addEventListener('click', async () => {
    b.disabled = true;
    if (out) out.replaceChildren();
    try {
      await run();
    } catch (e) {
      if (out) fail(out, e);
      else console.error('[hq] action failed', e);
    } finally {
      b.disabled = false;
    }
  });
  return b;
}

function stat(label, value, hint) {
  return h('div', { class: 'stat' }, h('span', { class: 'stat-value' }, value), h('span', { class: 'stat-label' }, label), hint ? h('span', { class: 'stat-hint' }, hint) : null);
}

function flagList(g) {
  const list = flags(g);
  return list.length ? h('span', { class: 'flags' }, list.map((f) => h('span', { class: `flag ${f.tone}` }, f.words))) : null;
}

function field(label, input, hint) {
  return h('label', { class: 'field' }, h('span', {}, label), input, hint ? h('small', {}, hint) : null);
}

function select(options, value) {
  const s = h('select', {}, options.map(([v, words]) => h('option', { value: v }, words)));
  if (value !== undefined) s.value = value;
  return s;
}

function loading() {
  show(h('p', { class: 'muted' }, 'Loading…'));
}

/** The page's content (null and false are skipped, so optional parts can be written inline). */
function show(...kids) {
  main.replaceChildren(...kids.flat().filter((k) => k !== null && k !== undefined && k !== false));
}

let gymsCache = [];

// ------------------------------------------------------------------ All gyms
async function gymsPage() {
  loading();
  const data = await api('/api/gyms');
  gymsCache = data.gyms;
  const now = Date.now();
  const gyms = data.gyms;
  const newWeek = gyms.filter((g) => now - Date.parse(g.createdAt) <= 7 * 864e5).length;
  const createOut = h('div');
  const rows = gyms.map((g) =>
    h('tr', { tabindex: '0', onclick: () => (location.hash = `#gym/${g.gymId}`), onkeydown: (e) => e.key === 'Enter' && (location.hash = `#gym/${g.gymId}`) },
      h('td', {}, h('strong', {}, g.name), h('div', { class: 'muted' }, `${g.joinCode} · ${STATUS_WORDS[g.status] || g.status}`), flagList(g)),
      h('td', { class: 'num' }, `${g.membersRegister}`, h('div', { class: 'muted' }, `${g.membersApp} in app`)),
      h('td', { class: 'num' }, `${g.checkins7} / ${g.checkins30}`),
      h('td', { class: 'num' }, `${g.orders30}`),
      h('td', { class: 'num' }, rupees(g.moneyThisMonthP), h('div', { class: 'muted' }, `last month ${rupees(g.moneyLastMonthP)}`)),
      h('td', {}, ago(g.lastDeskActivity, now)),
      h('td', { class: 'num' }, `${g.staff}`, h('div', { class: 'muted' }, `${g.liveDevices} devices`)),
      h('td', { class: 'num' }, `${g.failedSignins24h}`),
      h('td', { class: 'num' }, g.newFeedback == null ? '–' : `${g.newFeedback}`),
      h('td', { class: 'num' }, g.aiThisMonth ? `${g.aiThisMonth.calls}` : '–', g.aiThisMonth ? h('div', { class: 'muted' }, rupeesExact(g.aiThisMonth.rupees)) : null),
      h('td', {}, h('span', { class: 'muted' }, g.ownerName || ''), h('div', {}, g.ownerPhone ? h('a', { href: `tel:+91${g.ownerPhone}`, onclick: (e) => e.stopPropagation() }, g.ownerPhone) : '')),
    ));
  show(
    h('div', { class: 'page-head' }, h('h1', {}, 'All gyms'), h('button', { class: 'button', type: 'button', onclick: () => createGymForm(createOut, {}) }, 'Make a gym')),
    createOut,
    h('div', { class: 'stats' }, stat('Gyms', `${gyms.length}`), stat('New this week', `${newWeek}`), stat('Need a look', `${needsLook(gyms, now)}`)),
    data.webOk ? null : note('Feedback, leads and AI use could not be read right now, so those columns are empty.', 'warn'),
    h('p', { class: 'muted' }, 'Counts only. Member names and numbers are never shown here. Tap a gym for more.'),
    gyms.length === 0
      ? h('p', {}, 'No gyms yet.')
      : h('div', { class: 'table-wrap' }, h('table', {},
          h('thead', {}, h('tr', {}, ['Gym', 'Members', 'Check-ins 7 / 30 days', 'Shop orders 30 days', 'Money this month', 'Last desk activity', 'Staff', 'Wrong codes 24 h', 'New feedback', 'AI reads this month', 'Owner'].map((t) => h('th', {}, t)))),
          h('tbody', {}, rows))),
  );
}

function createGymForm(box, { gymName = '', phone = '', leadId = null }) {
  const name = h('input', { value: gymName, maxlength: '60', autocomplete: 'off' });
  const owner = h('input', { maxlength: '60', autocomplete: 'off' });
  const mobile = h('input', { value: phone, inputmode: 'tel', maxlength: '16', autocomplete: 'off' });
  const out = h('div');
  box.replaceChildren(h('div', { class: 'card' },
    h('h2', {}, leadId ? 'Make a gym for this lead' : 'Make a gym'),
    field('Gym name', name), field('Owner’s name', owner), field('Owner’s mobile', mobile, '10 digits'),
    action('Make the gym', async () => {
      const r = await api('/api/gym/create', { gymName: name.value, ownerName: owner.value, phone: mobile.value, leadId });
      out.replaceChildren(codeCard(r.name, r.code, `Gym made: ${r.name}, gym code ${r.joinCode}.`));
    }, { out }),
    out));
  name.focus();
}

function codeCard(gymName, code, lead) {
  const msg = codeMessage(gymName, code);
  const copied = h('span', { class: 'muted' });
  return h('div', { class: 'card good' },
    lead ? h('p', {}, lead) : null,
    h('p', {}, 'The owner’s sign-in code (works once, for 30 minutes):'),
    h('p', { class: 'code' }, code),
    h('p', { class: 'muted' }, 'Send it on WhatsApp. It is not kept anywhere: copy it now.'),
    h('textarea', { readonly: true, rows: '3' }, msg),
    h('button', {
      class: 'button', type: 'button', onclick: async () => {
        try {
          await navigator.clipboard.writeText(msg);
          copied.textContent = ' Copied.';
        } catch (e) {
          console.warn('[hq] copy failed', e);
          copied.textContent = ' Could not copy: select the text above.';
        }
      },
    }, 'Copy the message'), copied);
}

// ------------------------------------------------------------------ One gym
async function gymPage(id) {
  loading();
  const data = await api(`/api/gym?id=${encodeURIComponent(id)}`);
  const g = data.gym;
  const out = h('div');
  const accessBox = h('div');
  const historyBox = h('div');

  const statusActions = [];
  if (g.status === 'trial') statusActions.push(action('Approve (checked)', async () => { await api('/api/gym/status', { gymId: id, status: 'active' }); await gymPage(id); }, { out }));
  if (g.status !== 'suspended') {
    const why = h('input', { placeholder: 'Why (the gym owner is told this by you)', maxlength: '300' });
    statusActions.push(h('div', { class: 'row' }, why, action('Pause the gym', async () => {
      await api('/api/gym/status', { gymId: id, status: 'suspended', reason: why.value });
      await gymPage(id);
    }, { tone: 'danger', out })));
  } else {
    statusActions.push(action('Un-pause the gym', async () => { await api('/api/gym/status', { gymId: id, status: 'active' }); await gymPage(id); }, { out }));
  }

  // Reset the owner's sign-in.
  const called = h('input', { type: 'checkbox' });
  const ownerPick = g.owners.length > 1 ? select(g.owners.map((o) => [o.staffId, `${o.name} (${o.phone})`])) : null;
  const resetOut = h('div');
  const reset = h('div', { class: 'card' },
    h('h2', {}, 'Owner lost their sign-in'),
    h('p', { class: 'muted' }, 'Call the gym’s own number first. Make a code only when the owner confirms on that call.'),
    ownerPick ? field('Which owner', ownerPick) : null,
    h('label', { class: 'check' }, called, ' I called the gym’s own number and the owner confirmed'),
    action('Make a new sign-in code', async () => {
      const r = await api('/api/gym/reset-signin', { gymId: id, staffId: ownerPick ? ownerPick.value : null, called: called.checked });
      resetOut.replaceChildren(codeCard(g.name, r.code, `For ${r.name}, ${r.phone}.`));
    }, { out: resetOut }),
    resetOut);

  // Sign out everywhere.
  const soWhy = h('input', { placeholder: 'Why (for example: owner reported a lost phone)', maxlength: '300' });
  const soOut = h('div');
  const signOut = h('div', { class: 'card' },
    h('h2', {}, 'Sign the gym out everywhere'),
    h('p', { class: 'muted' }, 'Every phone and computer of this gym is signed out at once. They sign in again with a new code.'),
    soWhy,
    action('Sign out everywhere', async () => {
      const r = await api('/api/gym/sign-out-all', { gymId: id, reason: soWhy.value });
      soOut.replaceChildren(note(`${count(r.devices, 'device')} signed out.${r.oldOwnerKeys ? ' This gym also has an old browser key; tell Claude.' : ''}`, 'good'));
    }, { tone: 'danger', out: soOut }),
    soOut);

  // AI limit.
  const limit = h('input', { type: 'number', min: '0', max: '200', value: data.aiLimit ?? '', inputmode: 'numeric' });
  const aiOut = h('div');
  const ai = h('div', { class: 'card' },
    h('h2', {}, 'AI column matching'),
    data.aiDays === null
      ? note('AI use could not be read right now.', 'warn')
      : h('p', {}, data.aiDays.length
          ? `Last 30 days: ${count(data.aiDays.reduce((n, d) => n + d.calls, 0), 'read')}, about ${rupeesExact(data.aiDays.reduce((n, d) => n + d.rupees, 0))}.`
          : 'No AI use in the last 30 days.'),
    field('Reads a day for this gym', limit, `Normal: ${data.normalAiLimit}. 0 switches it off for this gym.`),
    h('div', { class: 'row' },
      action('Save the limit', async () => {
        const r = await api('/api/ai/limit', { gymId: id, perDay: limit.value === '' ? null : Number(limit.value) });
        aiOut.replaceChildren(note(`Saved: ${r.aiLimit} a day.`, 'good'));
      }, { out: aiOut }),
      action('Back to normal', async () => {
        const r = await api('/api/ai/limit', { gymId: id, perDay: null });
        limit.value = String(r.aiLimit);
        aiOut.replaceChildren(note(`Back to normal: ${r.aiLimit} a day.`, 'good'));
      }, { out: aiOut })),
    aiOut);

  renderAccess(accessBox, g, id);

  show(
    h('p', {}, h('a', { href: '#gyms' }, '← All gyms')),
    h('div', { class: 'page-head' }, h('h1', {}, g.name), h('span', { class: `badge ${g.status}` }, STATUS_WORDS[g.status] || g.status)),
    h('p', { class: 'muted' }, `Gym code ${g.joinCode} · started ${when(g.createdAt)}`),
    flagList({ ...g, aiLimit: null }),
    h('div', { class: 'stats' },
      stat('Members in the register', `${g.membersRegister}`),
      stat('Members in the app', `${g.membersApp}`),
      stat('Check-ins, 7 days', `${g.checkins7}`, `${g.checkins30} in 30 days`),
      stat('Money this month', rupees(g.moneyThisMonthP), `last month ${rupees(g.moneyLastMonthP)}`),
      stat('Receipts cancelled this month', `${g.receiptsCancelledThisMonth}`),
      stat('Shop orders, 30 days', `${g.orders30}`),
      stat('Staff', `${g.staff}`, `${g.liveDevices} devices signed in`),
      stat('Wrong sign-in codes, 24 h', `${g.failedSignins24h}`),
      stat('Last desk activity', ago(g.lastDeskActivity))),
    h('div', { class: 'card' }, h('h2', {}, 'Owner'),
      g.owners.length ? g.owners.map((o) => h('p', {}, `${o.name} · `, h('a', { href: `tel:+91${o.phone}` }, o.phone))) : h('p', {}, 'No owner on the list.')),
    g.deleteRequest ? h('div', { class: 'card warn' }, h('p', {}, `Delete asked ${when(g.deleteRequest.requestedAt)}: day ${g.deleteRequest.day} of 30.`), h('a', { href: '#deletes' }, 'Open delete requests')) : null,
    h('div', { class: 'card' }, h('h2', {}, 'Status'), h('div', { class: 'stack' }, statusActions), out),
    accessBox,
    reset,
    signOut,
    ai,
    h('div', { class: 'card' }, h('h2', {}, 'Sign-in history'),
      h('p', { class: 'muted' }, 'Sign-ins, sign-outs, wrong codes and saves in the admin app (kept 7 days; 1 year from 13 May 2027).'),
      action('Show sign-in history', async () => {
        const r = await api(`/api/gym/access-log?id=${encodeURIComponent(id)}`);
        const counts = Object.entries(r.counts7Days || {}).map(([k, n]) => `${ACCESS_WORDS[k] || k}: ${n}`).join(' · ');
        historyBox.replaceChildren(
          h('p', { class: 'muted' }, r.detailed
            ? 'Support access is open, so names, devices and addresses show (the gym owner sees this look).'
            : 'Times only. Names, devices and addresses show only while support access is open.'),
          counts ? h('p', {}, `Last 7 days: ${counts}`) : null,
          r.rows.length
            ? h('div', { class: 'table-wrap' }, h('table', {}, h('tbody', {}, r.rows.map((x) => h('tr', {}, h('td', {}, when(x.at)), h('td', {}, ACCESS_WORDS[x.action] || x.action),
                r.detailed ? h('td', {}, x.person || '') : null, r.detailed ? h('td', { class: 'muted' }, x.device || '') : null, r.detailed ? h('td', { class: 'muted' }, x.ip || '') : null)))))
            : h('p', {}, 'Nothing yet.'));
      }, { out: historyBox }),
      historyBox),
    h('div', { class: 'card' }, h('h2', {}, 'What HQ did here'),
      g.recentHq.length ? h('ul', { class: 'plain' }, g.recentHq.map((a) => h('li', {}, `${when(a.at)} · ${actionWords(a.action)}${a.reason ? ` · ${a.reason}` : ''}`))) : h('p', {}, 'Nothing yet.')),
  );
}

const ACCESS_WORDS = { sign_in: 'Signed in', sign_out: 'Signed out', sign_in_failed: 'Wrong code', push: 'Saved changes', pull_all: 'Pulled the whole gym' };

function renderAccess(box, g, id) {
  const out = h('div');
  const view = h('div');
  const open = g.supportUntil && Date.parse(g.supportUntil) > Date.now();
  if (open) {
    box.replaceChildren(h('div', { class: 'card warn' },
      h('h2', {}, 'Support access is open'),
      h('p', {}, `Opened by ${g.supportOpenedBy === 'gym' ? 'the gym' : 'ForgeAI (emergency)'}, until ${when(g.supportUntil)}. Read-only. The gym owner sees every look.`),
      h('div', { class: 'row wrap' }, RECORD_KINDS.map(([kind, words]) => action(words, async () => {
        const r = await api(`/api/access/records?id=${encodeURIComponent(id)}&kind=${kind}`);
        view.replaceChildren(h('h3', {}, `${words} (${r.rows.length}${r.rows.length === 200 ? '+' : ''})`),
          r.rows.length ? h('div', { class: 'table-wrap' }, h('table', {}, h('tbody', {}, r.rows.map((row) => h('tr', {}, recordCells(kind, row).map(([label, value]) => h('td', {}, h('span', { class: 'muted' }, `${label}: `), value ?? ''))))))) : h('p', {}, 'None.'));
      }, { out }))),
      action('Close access now', async () => { await api('/api/access/end', { gymId: id }); await gymPage(id); }, { tone: 'danger', out }),
      out, view));
    return;
  }
  const kind = select(REASON_KINDS);
  const reason = h('textarea', { rows: '2', maxlength: '500', placeholder: 'One sentence: what happened and why you must look' });
  const minutes = select([['15', '15 minutes'], ['30', '30 minutes'], ['60', '60 minutes']], '30');
  box.replaceChildren(h('div', { class: 'card' },
    h('h2', {}, 'Support access'),
    h('p', { class: 'muted' }, 'Closed. Normally the gym opens it (Settings → Your data → “Let ForgeAI support look”). Open it yourself only in an emergency: it is read-only, it ends by itself, and the gym owner sees it with your reason.'),
    field('Reason', kind), field('What happened', reason), field('For how long', minutes),
    action('Open in an emergency', async () => {
      await api('/api/access/open', { gymId: id, reasonKind: kind.value, reason: reason.value, minutes: Number(minutes.value) });
      await gymPage(id);
    }, { tone: 'danger', out }),
    out));
}

// ------------------------------------------------------------------ System
async function systemPage() {
  loading();
  const d = await api('/api/system');
  const s = d.system;
  const mb = megabytes(s.dbBytes);
  const limitMb = megabytes(s.dbLimitBytes);
  show(
    h('h1', {}, 'System'),
    h('div', { class: 'card' }, h('h2', {}, 'Gym server storage'),
      h('p', {}, `${mb} MB of the free ${limitMb} MB`),
      h('div', { class: 'bar', role: 'img', 'aria-label': `${mb} of ${limitMb} MB used` }, h('span', { class: mb / limitMb > 0.8 ? 'bad' : '', style: null, 'data-pct': String(Math.min(100, Math.round((mb / limitMb) * 100))) }))),
    h('div', { class: 'stats' },
      stat('Gyms', `${s.gyms}`, `${s.gymsNew7} new this week`),
      stat('Members in registers', `${s.membersRegister}`),
      stat('Members in the app', `${s.membersApp}`),
      stat('Devices signed in', `${s.liveDevices}`),
      d.web ? stat('AI reads this month', `${d.web.aiThisMonth.calls}`, `about ${rupeesExact(d.web.aiThisMonth.rupees)}, ${d.web.aiThisMonth.failed} failed`) : null,
      d.web ? stat('Feedback', `${d.web.feedback.new} new`, `${d.web.feedback.all} in all`) : null,
      d.web ? stat('Leads', `${d.web.leads.new} new`, `${d.web.leads.all} in all`) : null),
    d.web ? null : note('Feedback, leads and AI use could not be read right now.', 'warn'),
    h('div', { class: 'card' }, h('h2', {}, 'Member app downloads'),
      d.releases === null
        ? note('GitHub did not answer. Try again later.', 'warn')
        : h('div', { class: 'table-wrap' }, h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'Version'), h('th', {}, 'Released'), h('th', {}, 'App downloads'))),
            h('tbody', {}, d.releases.map((r) => h('tr', {}, h('td', {}, r.tag), h('td', {}, when(r.publishedAt)), h('td', { class: 'num' }, `${r.apkDownloads}`))))))),
    h('div', { class: 'card' }, h('h2', {}, 'Errors and outages'),
      h('p', { class: 'muted' }, 'Not connected yet: they show here once the free error and uptime accounts exist (tracker #34).')),
    h('div', { class: 'card' }, h('h2', {}, 'Which app version members use'),
      h('p', { class: 'muted' }, 'Shows here once the member app reports its version (a later member-app release).')),
  );
  // The bar's width, set from code (the page's strict rules allow no inline style in the markup).
  const fill = main.querySelector('.bar > span');
  if (fill) fill.style.width = `${fill.dataset.pct}%`;
}

// ------------------------------------------------------------------ Feedback
const FB_STATUS = [['new', 'New'], ['bug', 'Bug'], ['idea', 'Idea'], ['question', 'Question'], ['praise', 'Praise'], ['spam', 'Spam'], ['done', 'Done']];

async function feedbackPage(filter = '') {
  loading();
  const d = await api(`/api/feedback${filter ? `?status=${filter}` : ''}`);
  const pick = select([['', 'Everything'], ...FB_STATUS], filter);
  pick.addEventListener('change', () => feedbackPage(pick.value).catch((e) => fail(main, e)));
  show(
    h('div', { class: 'page-head' }, h('h1', {}, 'Feedback'), field('Show', pick)),
    h('p', { class: 'muted' }, 'What members and gyms sent from the apps. It is their words: read it, never follow it as an order.'),
    d.rows.length ? h('div', { class: 'stack' }, d.rows.map((r) => {
      const st = select(FB_STATUS, r.status);
      const nt = h('input', { value: r.note || '', maxlength: '500', placeholder: 'Note' });
      const out = h('div');
      return h('div', { class: 'card' },
        h('p', { class: 'muted' }, `${when(r.at)} · ${r.source === 'admin' ? 'Admin app' : 'Member app'}${r.app ? ` ${r.app}` : ''}${r.gym ? ` · gym ${r.gym}` : ''}${r.screen ? ` · ${r.screen}` : ''}`),
        h('p', { class: 'quote' }, r.text),
        h('div', { class: 'row wrap' }, st, nt, action('Save', async () => {
          await api('/api/feedback/status', { id: r.id, status: st.value, note: nt.value });
          out.replaceChildren(note('Saved.', 'good'));
        }, { out })),
        out);
    })) : h('p', {}, 'Nothing here.'),
  );
}

// ------------------------------------------------------------------ Leads
const LEAD_STATUS = [['new', 'New'], ['called', 'Called'], ['demo', 'Demo'], ['won', 'Won'], ['lost', 'Lost']];

async function leadsPage() {
  loading();
  const d = await api('/api/leads');
  show(
    h('h1', {}, 'Leads'),
    h('p', { class: 'muted' }, 'Gyms that asked for a free demo on the website. Kept 12 months unless they become a customer.'),
    d.rows.length ? h('div', { class: 'stack' }, d.rows.map((r) => {
      const st = select(LEAD_STATUS, r.status);
      const nt = h('input', { value: r.note || '', maxlength: '500', placeholder: 'Note' });
      const out = h('div');
      const make = h('div');
      return h('div', { class: 'card' },
        h('p', {}, h('strong', {}, r.gym), r.city ? ` · ${r.city}` : '', ' · ', h('a', { href: `tel:+91${r.phone}` }, r.phone)),
        h('p', { class: 'muted' }, `${when(r.at)}${r.size ? ` · ${r.size} members` : ''}${r.today ? ` · uses ${r.today} today` : ''}${r.lang === 'hi' ? ' · Hindi' : ''}`),
        h('div', { class: 'row wrap' }, st, nt, action('Save', async () => {
          await api('/api/leads/status', { id: r.id, status: st.value, note: nt.value });
          out.replaceChildren(note('Saved.', 'good'));
        }, { out }), h('button', { class: 'button', type: 'button', onclick: () => createGymForm(make, { gymName: r.gym, phone: r.phone, leadId: r.id }) }, 'Make a gym for this lead')),
        out, make);
    })) : h('p', {}, 'No leads yet.'),
  );
}

// ------------------------------------------------------------------ Delete requests
async function deletesPage() {
  loading();
  const [d, gyms] = await Promise.all([api('/api/delete-requests'), gymsCache.length ? Promise.resolve({ gyms: gymsCache }) : api('/api/gyms')]);
  gymsCache = gyms.gyms;
  const out = h('div');
  const waiting = (d.waiting || []).map((w) => {
    const gym = w.joinCode ? gymByCode(gymsCache, w.joinCode) : null;
    return h('div', { class: 'card warn' },
      h('p', {}, `${when(w.at)} · from the admin app`),
      h('p', { class: 'quote' }, w.text),
      w.checked ? null : note(NOT_CHECKED_WORDS, 'warn'),
      gym ? action(`Write it down for ${gym.name}`, async () => {
        await api('/api/delete-requests/add', { gymId: gym.gymId, kind: 'gym', requestedAt: w.at, source: 'admin_app', sourceRef: `fb-${w.feedbackId}` });
        await deletesPage();
      }, { out }) : note('No gym with that code. It may be deleted already.', 'warn'));
  });

  const gymPick = select(gymsCache.map((g) => [g.gymId, `${g.name} (${g.joinCode})`]));
  const kindPick = select([['gym', 'Delete the whole gym'], ['member', 'Erase one member']]);
  const memberRef = h('input', { maxlength: '80', placeholder: 'For a member: how to find them, for example “mobile ending 4321”' });
  const source = select([['email', 'By email'], ['phone', 'By phone'], ['other', 'Other']]);
  const date = h('input', { type: 'date' });
  const addOut = h('div');

  const open = d.requests.filter((r) => !r.doneAt && !r.cancelledAt);
  const closed = d.requests.filter((r) => r.doneAt || r.cancelledAt);
  show(
    h('h1', {}, 'Delete requests'),
    h('p', { class: 'muted' }, 'The privacy notice promises a delete within 30 days. Each step is written in the log.'),
    out,
    waiting.length ? h('div', { class: 'stack' }, h('h2', {}, 'New from the admin app'), waiting) : null,
    h('h2', {}, `Open (${open.length})`),
    open.length ? h('div', { class: 'stack' }, open.map(requestCard)) : h('p', {}, 'None open.'),
    h('div', { class: 'card' }, h('h2', {}, 'Write down a request that came another way'),
      field('Gym', gymPick), field('What', kindPick), memberRef, field('How it came', source), field('Asked on', date, 'Leave empty for today'),
      action('Write it down', async () => {
        await api('/api/delete-requests/add', { gymId: gymPick.value, kind: kindPick.value, memberRef: memberRef.value, source: source.value, requestedAt: date.value ? `${date.value}T12:00:00+05:30` : null });
        await deletesPage();
      }, { out: addOut }), addOut),
    closed.length ? h('details', {}, h('summary', {}, `Closed (${closed.length})`), h('ul', { class: 'plain' }, closed.map((r) => h('li', {}, `${r.gymName} (${r.joinCode}) · ${r.kind === 'gym' ? 'gym' : `member ${r.memberRef || ''}`} · ${r.doneAt ? `done ${when(r.doneAt)}` : `cancelled ${when(r.cancelledAt)}`}`)))) : null,
  );
}

function requestCard(r) {
  const out = h('div');
  const left = daysLeft(r);
  const step = (s, words, tone) => action(words, async () => { await api('/api/delete-requests/step', { requestId: r.requestId, step: s }); await deletesPage(); }, { out, tone });
  const typed = h('input', { maxlength: '6', placeholder: 'Type the gym code', autocomplete: 'off' });
  const cancelWhy = h('input', { maxlength: '300', placeholder: 'Why it is cancelled' });
  return h('div', { class: `card ${left <= 5 ? 'bad' : ''}` },
    h('p', {}, h('strong', {}, `${r.gymName} (${r.joinCode})`), ` · ${r.kind === 'gym' ? 'delete the whole gym' : `erase a member: ${r.memberRef || ''}`}`),
    h('p', {}, `Asked ${when(r.requestedAt)} · day ${r.day} of 30 · ${left > 0 ? `${left} days left` : left === 0 ? 'last day' : `${-left} days late`}`),
    r.calledAt ? null : note(NOT_CHECKED_WORDS, 'warn'),
    h('ol', { class: 'steps' },
      h('li', {}, r.calledAt ? `Called the gym’s own number ✓ (${when(r.calledAt)})` : step('called', 'I called the gym’s own number and the owner confirmed')),
      r.kind === 'gym'
        ? h('li', {}, r.remindedAt ? `Reminded them to download their data ✓ (${when(r.remindedAt)})` : step('reminded', 'I reminded them to download their data first'))
        : h('li', {}, 'Open support access on the gym, find the member, and erase their details by hand (receipts stay: the law keeps them). Then:', ' ', step('member_done', 'Done: the member is erased')),
      r.kind === 'gym'
        ? h('li', {}, 'Delete: nothing can be brought back after this.', h('div', { class: 'row' }, typed, action('Delete the gym for ever', async () => {
            const res = await api('/api/delete-requests/delete-gym', { requestId: r.requestId, typedCode: typed.value });
            out.replaceChildren(note(`Deleted ${res.gymName}. Checked ${res.tablesChecked} tables: nothing left. Pictures removed: ${res.filesRemoved}.${res.filesLeft.length ? ` ${res.filesLeft.length} pictures are left: remove them in the Supabase dashboard (Storage).` : ''} Now tell the gym it is done.`, 'good'));
          }, { tone: 'danger', out })))
        : null),
    h('div', { class: 'row' }, cancelWhy, action('Cancel the request', async () => {
      await api('/api/delete-requests/step', { requestId: r.requestId, step: 'cancel', note: cancelWhy.value });
      await deletesPage();
    }, { out })),
    out);
}

// ------------------------------------------------------------------ Log
async function logPage(before = null, list = null) {
  if (!list) loading();
  const d = await api(`/api/audit${before ? `?before=${before}` : ''}`);
  const rows = d.rows.map((r) => h('tr', {},
    h('td', {}, when(r.at)), h('td', {}, actionWords(r.action)), h('td', {}, r.gymName || ''), h('td', {}, r.reason || ''), h('td', { class: 'muted' }, r.actor), h('td', { class: 'muted' }, r.ip || '')));
  if (list) {
    list.append(...rows);
  } else {
    list = h('tbody', {}, rows);
    show(
      h('h1', {}, 'Log'),
      h('p', { class: 'muted' }, 'Everything done in HQ, and every look at a gym. Nobody can change or delete a line. Kept 2 years.'),
      h('div', { class: 'table-wrap' }, h('table', {}, h('thead', {}, h('tr', {}, ['When', 'What', 'Gym', 'Reason', 'Who', 'From'].map((t) => h('th', {}, t)))), list)),
      h('div', { id: 'more' }));
  }
  const more = document.getElementById('more');
  const last = d.rows.length ? d.rows[d.rows.length - 1].id : null;
  more.replaceChildren(d.rows.length === 100 && last ? action('Show older', () => logPage(last, list)) : h('p', { class: 'muted' }, 'That is everything.'));
}

// ------------------------------------------------------------------ router
const ROUTES = { gyms: gymsPage, system: systemPage, feedback: () => feedbackPage(''), leads: leadsPage, deletes: deletesPage, log: () => logPage() };

async function route() {
  const hash = location.hash.replace(/^#/, '') || 'gyms';
  const top = hash.split('/')[0] === 'gym' ? 'gyms' : hash.split('/')[0];
  for (const a of document.querySelectorAll('nav a')) a.classList.toggle('on', a.getAttribute('href') === `#${top}`);
  try {
    const gym = /^gym\/([0-9a-f-]{36})$/.exec(hash);
    if (gym) await gymPage(gym[1]);
    else await (ROUTES[hash] || gymsPage)();
  } catch (e) {
    fail(main, e);
  }
}

async function start() {
  try {
    const me = await api('/api/me');
    document.getElementById('who').textContent = me.email;
  } catch (e) {
    console.warn('[hq] who am I failed', e);
  }
  window.addEventListener('hashchange', () => void route());
  await route();
}

void start();
