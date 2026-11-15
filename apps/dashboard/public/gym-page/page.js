// F207 gym page (join.mettleup.fit/<gym>): the page's only script. The page is complete without it (the Worker
// renders all of it, deploy/panel/gymPage.js); this adds the shutter rolling up, the bar at the bottom of the phone,
// sending a question to the gym, Copy link, the report form, and (F208, only when the page has it) the AI helper
// chat. No other scripts, no trackers, no cookies.
// HIDDEN until the gym page is switched on (docs/gym-page/PLAN.md).

const $ = (id) => document.getElementById(id);
const data = (() => {
  try {
    return JSON.parse($('gym-data')?.textContent || '{}');
  } catch {
    return {};
  }
})();
document.documentElement.classList.add('js');

// The shutter rolls up once the photos are on screen (it stays part-way down when the gym is closed now).
const floor = document.querySelector('.floor');
if (floor) {
  const up = () => floor.classList.add('up');
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) up();
  else {
    const io = new IntersectionObserver((es) => {
      if (es.some((e) => e.isIntersecting)) {
        setTimeout(up, 180);
        io.disconnect();
      }
    }, { threshold: 0.25 });
    io.observe(floor);
  }
}

// The bar at the bottom shows once the signboard's buttons have scrolled away, and hides at the form itself.
const dock = $('dock');
const sign = $('sign');
const ask = $('ask');
if (dock && sign && 'IntersectionObserver' in window) {
  let signVisible = true;
  let askVisible = false;
  const set = () => dock.classList.toggle('on', !signVisible && !askVisible);
  new IntersectionObserver((es) => {
    for (const e of es) {
      if (e.target === sign) signVisible = e.isIntersecting;
      if (e.target === ask) askVisible = e.isIntersecting;
    }
    set();
  }).observe(sign);
  if (ask) {
    const io2 = new IntersectionObserver((es) => {
      askVisible = es.some((e) => e.isIntersecting);
      set();
    });
    io2.observe(ask);
  }
}

// R-580 mobile rule >>> (a plain-JS twin of packages/theme/src/indianMobile.ts; every copy is the same text, and
// apps/dashboard/test/crm/mobileNumber.test.ts runs each one on the shared cases. Change one, change them all.)
var MOBILE_ZEROS = [0x0660, 0x06f0, 0x0966, 0x09e6, 0x0a66, 0x0ae6, 0x0b66, 0x0be6, 0x0c66, 0x0ce6, 0x0d66, 0xff10];
function mobileAscii(raw) {
  var s = String(raw == null ? '' : raw), out = '';
  for (var i = 0; i < s.length; i++) {
    var c = s.charCodeAt(i), ch = s.charAt(i);
    for (var z = 0; z < MOBILE_ZEROS.length; z++) if (c >= MOBILE_ZEROS[z] && c <= MOBILE_ZEROS[z] + 9) { ch = String(c - MOBILE_ZEROS[z]); break; }
    out += ch;
  }
  return out;
}
function mobileForeign(a, d) {
  if (/^[^0-9]*\+/.test(a)) return d.length > 0 && d.indexOf('91') !== 0 && '91'.indexOf(d.slice(0, 2)) !== 0;
  return d.length >= 4 && d.indexOf('00') === 0 && d.indexOf('0091') !== 0;
}
function cleanMobile(raw) {
  var a = mobileAscii(raw), d = a.replace(/[^0-9]/g, '');
  if (mobileForeign(a, d)) return d;
  if (/^[^0-9]*\+/.test(a) && d.indexOf('91') === 0) d = d.slice(2);
  return d.length > 10 ? d.slice(-10) : d;
}
function mobileInput(prev, raw) {
  var a = mobileAscii(raw), plus = /^[^0-9]*\+\s*(9)?\s*$/.exec(a);
  if (plus) return plus[1] ? '+9' : '+';
  var d = a.replace(/[^0-9]/g, '');
  if (mobileForeign(a, d)) return a.slice(0, 24);
  if (/^[^0-9]*\+/.test(a) && d.indexOf('91') === 0) d = d.slice(2);
  if (d.length <= 10) return d;
  if (d.indexOf('0091') === 0 && d.length < 14) return d;
  var before = mobileAscii(prev).replace(/[^0-9]/g, '');
  if (before.length === 10 && d.length === 11 && d.charAt(0) !== '0') return before;
  return d.slice(-10);
}
function keepMobile(input) {
  var last = input.value;
  function mark() { last = input.value; }
  input.addEventListener('focus', mark);
  input.addEventListener('beforeinput', mark);
  input.addEventListener('input', function () {
    var next = mobileInput(last, input.value);
    if (next !== input.value) input.value = next;
    last = next;
  });
}
// <<< R-580 mobile rule

/** Indian mobile number from what was typed: "+91 98765 43210" -> "9876543210", else null. */
export function mobileOf(s) {
  const d = cleanMobile(s);
  return /^[6-9]\d{9}$/.test(d) ? d : null;
}

async function post(path, body) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 15000);
  try {
    const r = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: ctl.signal });
    const j = await r.json().catch(() => ({}));
    return { ok: r.ok && j.ok === true, error: j.error || (r.ok ? null : `HTTP_${r.status}`) };
  } catch (e) {
    console.warn('gym page: send failed', e);
    return { ok: false, error: 'NETWORK' };
  } finally {
    clearTimeout(t);
  }
}

/** A POST whose answer the caller reads: {ok, body, error}. */
async function postJson(path, body) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 25000);
  try {
    const r = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: ctl.signal });
    const j = await r.json().catch(() => ({}));
    return { ok: r.ok && j.ok === true, body: j, error: j.error || (r.ok ? null : `HTTP_${r.status}`) };
  } catch (e) {
    console.warn('gym page: chat send failed', e);
    return { ok: false, body: {}, error: 'NETWORK' };
  } finally {
    clearTimeout(t);
  }
}

const WORDS = {
  NETWORK: 'Could not send. Please check your internet and try again.',
  LIMIT: 'Too many questions were sent from here today. Please call or visit the gym.',
  NOT_READY: 'This page cannot take questions yet. Please call or visit the gym.',
  CLOSED: 'This gym is not taking questions here right now. Please visit the gym.',
};
const sayFail = (err) => WORDS[err] || 'Could not send. Please try again in a minute.';

function say(el, text, ok) {
  el.textContent = text;
  el.className = `msg ${ok ? 'ok' : 'bad'}`;
}

const form = $('ask-form');
if (form) {
  if (form.phone) keepMobile(form.phone);
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const msg = $('ask-msg');
    const f = new FormData(form);
    const name = String(f.get('name') || '').trim();
    const phone = mobileOf(f.get('phone'));
    const question = String(f.get('question') || '').trim();
    if (name.length < 2) return say(msg, 'Please write your name.', false), form.name.focus();
    if (!phone) return say(msg, 'Please write a 10-digit mobile number.', false), form.phone.focus();
    if (question.length < 3) return say(msg, 'Please write your question.', false), form.question.focus();
    if (!f.get('consent')) return say(msg, 'Please tick the box so the gym can reply to you.', false), form.consent.focus();
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    msg.textContent = 'Sending…';
    msg.className = 'msg';
    const r = await post('/api/gym-page/ask', { slug: data.slug, name, phone, question, consent: true, website: String(f.get('website') || '') });
    btn.disabled = false;
    if (r.ok) {
      form.reset();
      // Owner (15 Nov 2026): the visitor has no app; the gym calls or sends a WhatsApp message to this number.
      say(msg, `Your question is sent to ${data.gymName || 'the gym'}. The gym will call you or send you a WhatsApp message on ${phone.slice(0, 2)}XXXXXX${phone.slice(8)}.`, true);
    } else say(msg, sayFail(r.error), false);
  });
}

const copy = $('copy');
if (copy) {
  copy.addEventListener('click', async () => {
    const url = copy.dataset.url || location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title: data.gymName, url });
        return;
      } catch (e) {
        if (e && e.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      copy.lastChild.textContent = 'The link is copied';
    } catch {
      prompt('Copy this link', url);
    }
  });
}

const report = $('report-form');
if (report) {
  report.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const msg = $('report-msg');
    const f = new FormData(report);
    const reason = String(f.get('reason') || '');
    if (!reason) return say(msg, 'Please pick what is wrong.', false);
    const btn = report.querySelector('button[type=submit]');
    btn.disabled = true;
    const r = await post('/api/gym-page/report', { slug: data.slug, reason, details: String(f.get('details') || '').trim(), website: String(f.get('website') || '') });
    btn.disabled = false;
    if (r.ok) {
      report.reset();
      say(msg, 'Thank you. MettleUp will look at this page.', true);
    } else say(msg, sayFail(r.error), false);
  });
}

// ------------------------------------------------------------------ F208 the AI helper chat (deploy/panel/pageChat.js)
// Only on a page drawn with the chat box (the Worker's PAGE_AI live and the owner's switch on). The browser keeps a
// random id for this gym and the chat's lines, so a reload shows the chat again (90 days, then forgotten). Asks for a
// name and number once: when the visitor shows interest, or the AI could not answer.
const chatForm = $('chat-form');
const chatLog = $('chat-log');
const chatContact = $('chat-contact');
const CHAT_DAYS = 90;
const chatKey = `mettleup-chat:${data.slug || ''}`;

function newVisitorId() {
  const b = new Uint8Array(18);
  crypto.getRandomValues(b);
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** This browser's chat with this gym: {id, lines, at, contact}. A fresh one when none, or older than 90 days. */
function chatState() {
  let s = null;
  try {
    s = JSON.parse(localStorage.getItem(chatKey) || 'null');
  } catch (e) {
    console.warn('gym page: saved chat not readable', e);
  }
  const fresh = s && typeof s.id === 'string' && /^[A-Za-z0-9_-]{16,64}$/.test(s.id) && Date.now() - Number(s.at || 0) < CHAT_DAYS * 864e5;
  return fresh
    ? { id: s.id, lines: Array.isArray(s.lines) ? s.lines.slice(-40) : [], at: s.at, contact: s.contact === true }
    : { id: newVisitorId(), lines: [], at: Date.now(), contact: false };
}

function keepChat(s) {
  try {
    localStorage.setItem(chatKey, JSON.stringify({ ...s, lines: s.lines.slice(-40) }));
  } catch (e) {
    console.warn('gym page: chat not saved in this browser (private window?)', e);
  }
}

function chatLine(from, text, extra = '') {
  const li = document.createElement('li');
  li.className = `${from === 'me' ? 'me' : 'ai'}${extra ? ` ${extra}` : ''}`;
  const who = document.createElement('span');
  who.className = 'vh';
  who.textContent = from === 'me' ? 'You: ' : 'AI helper: ';
  li.append(who, document.createTextNode(text));
  chatLog.append(li);
  chatLog.scrollTop = chatLog.scrollHeight;
  return li;
}

const CHAT_WORDS = {
  ...WORDS,
  LIMIT: 'You have sent the most messages allowed for today. To ask the gym, use the "Ask the gym" form below. The gym will call you or send you a WhatsApp message on the number you give.',
  OFF: 'The AI helper is switched off for this gym. To ask the gym, use the "Ask the gym" form below.',
  BAD_QUESTION: 'Please write your question in a few words, without a web address.',
};

if (chatForm && chatLog && data.chat) {
  const st = chatState();
  for (const l of st.lines) chatLine(l.from, l.text);
  const showContact = () => {
    if (chatContact && !st.contact) chatContact.hidden = false;
  };
  if (st.lines.some((l) => l.ask)) showContact();
  chatForm.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const msg = $('chat-msg');
    const f = new FormData(chatForm);
    const question = String(f.get('question') || '').replace(/\s+/g, ' ').trim();
    if (!question) return say(msg, 'Please write your question.', false), chatForm.question.focus();
    const btn = chatForm.querySelector('button[type=submit]');
    btn.disabled = true;
    msg.textContent = '';
    msg.className = 'msg';
    const mine = chatLine('me', question);
    const wait = chatLine('ai', 'The AI helper is reading this page.', 'wait');
    const r = await postJson('/api/gym-page/chat', { slug: data.slug, visitor: st.id, question, website: String(f.get('website') || '') });
    wait.remove();
    btn.disabled = false;
    if (r.ok && typeof r.body.answer === 'string') {
      chatForm.reset();
      chatLine('ai', r.body.answer);
      st.lines.push({ from: 'me', text: question }, { from: 'ai', text: r.body.answer, ask: r.body.askNumber === true });
      st.at = Date.now();
      keepChat(st);
      if (r.body.askNumber === true) showContact();
    } else {
      mine.remove();
      say(msg, CHAT_WORDS[r.error] || sayFail(r.error), false);
    }
  });
  if (chatContact) {
    if (chatContact.phone) keepMobile(chatContact.phone);
    chatContact.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const msg = $('chat-contact-msg');
      const f = new FormData(chatContact);
      const wants = ev.submitter && ev.submitter.value === 'join' ? 'join' : 'call';
      const name = String(f.get('name') || '').trim();
      const phone = mobileOf(f.get('phone'));
      if (name.length < 2) return say(msg, 'Please write your name.', false), chatContact.name.focus();
      if (!phone) return say(msg, 'Please write a 10-digit mobile number.', false), chatContact.phone.focus();
      if (!f.get('consent')) return say(msg, 'Please tick the box so the gym can call you.', false), chatContact.consent.focus();
      const buttons = chatContact.querySelectorAll('button');
      for (const b of buttons) b.disabled = true;
      const r = await postJson('/api/gym-page/chat-contact', { slug: data.slug, visitor: st.id, name, phone, consent: true, wants, website: String(f.get('website') || '') });
      for (const b of buttons) b.disabled = false;
      if (r.ok) {
        st.contact = true;
        keepChat(st);
        chatContact.reset();
        for (const el of chatContact.querySelectorAll('label, input, .tel, .two, h3')) el.hidden = true;
        say(msg, `Your number is sent to ${data.gymName || 'the gym'}. They will call you or send you a WhatsApp message on ${phone.slice(0, 2)}XXXXXX${phone.slice(8)}.`, true);
      } else say(msg, sayFail(r.error), false);
    });
  }
}
