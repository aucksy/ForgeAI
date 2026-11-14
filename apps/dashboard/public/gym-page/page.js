// F207 gym page (join.mettleup.fit/<gym>): the page's only script. The page is complete without it (the Worker
// renders all of it, deploy/panel/gymPage.js); this adds the shutter rolling up, the bar at the bottom of the phone,
// sending a question to the gym, Copy link, and the report form. No other scripts, no trackers, no cookies.
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

/** Indian mobile number from what was typed: "+91 98765 43210" -> "9876543210", else null. */
export function mobileOf(s) {
  const d = String(s || '').replace(/\D/g, '').replace(/^(91|0)(?=\d{10}$)/, '');
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

const WORDS = {
  NETWORK: 'Could not send. Please check your internet and try again.',
  LIMIT: 'Too many questions from this phone today. Please call or visit the gym.',
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
      say(msg, `Sent. ${data.gymName || 'The gym'} will reply on ${phone.slice(0, 2)}XXXXXX${phone.slice(8)}.`, true);
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
      copy.lastChild.textContent = 'Link copied';
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
