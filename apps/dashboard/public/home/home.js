// The landing page's only script (launch I2/I3, 21 Oct 2026): the English / Hindi switch and the
// "free demo" form (POST /api/lead, deploy/panel/leads.js). A separate file because the site's
// security policy runs no inline script.
(function () {
  var KEY = 'forgeai.home.lang';
  var btn = document.getElementById('lang');
  var nodes = Array.prototype.slice.call(document.querySelectorAll('[data-hi]'));
  var alts = Array.prototype.slice.call(document.querySelectorAll('[data-hi-alt]'));
  var labels = Array.prototype.slice.call(document.querySelectorAll('[data-hi-label]'));
  nodes.forEach(function (n) { n.setAttribute('data-en', n.innerHTML); });
  alts.forEach(function (n) { n.setAttribute('data-en-alt', n.getAttribute('alt')); });
  labels.forEach(function (n) { n.setAttribute('data-en-label', n.getAttribute('aria-label')); });

  function set(lang) {
    var hi = lang === 'hi';
    document.documentElement.lang = hi ? 'hi' : 'en';
    nodes.forEach(function (n) { n.innerHTML = n.getAttribute(hi ? 'data-hi' : 'data-en'); });
    alts.forEach(function (n) { n.setAttribute('alt', n.getAttribute(hi ? 'data-hi-alt' : 'data-en-alt')); });
    labels.forEach(function (n) { n.setAttribute('aria-label', n.getAttribute(hi ? 'data-hi-label' : 'data-en-label')); });
    btn.textContent = hi ? 'English' : 'हिंदी';
    btn.setAttribute('aria-label', hi ? 'Read in English' : 'हिंदी में पढ़ें');
    try { localStorage.setItem(KEY, lang); } catch (e) { /* quiet: private window; the choice just isn't kept */ }
  }
  var saved = null;
  try { saved = localStorage.getItem(KEY); } catch (e) { /* quiet: private window */ }
  if (saved === 'hi') set('hi');
  btn.addEventListener('click', function () { set(document.documentElement.lang === 'hi' ? 'en' : 'hi'); });

  var form = document.getElementById('lead');
  var msg = document.getElementById('msg');
  var WORDS = {
    en: { phone: 'Type a 10-digit mobile number.', gym: 'Type your gym’s name.', city: 'Type your city.', sending: 'Sending…', ok: 'Thank you! We will call you soon.', fail: 'Could not send. Check your internet and try again.' },
    hi: { phone: '10 अंकों का मोबाइल नंबर लिखें।', gym: 'जिम का नाम लिखें।', city: 'शहर लिखें।', sending: 'भेज रहे हैं…', ok: 'धन्यवाद! हम जल्दी फोन करेंगे।', fail: 'भेज नहीं पाए। इंटरनेट देखकर फिर कोशिश करें।' },
  };
  function w() { return WORDS[document.documentElement.lang === 'hi' ? 'hi' : 'en']; }
  function say(text, kind) { msg.textContent = text; msg.className = 'msg' + (kind ? ' ' + kind : ''); }
  var busy = false;
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (busy) return;
    var f = form.elements;
    var digits = f.phone.value.replace(/\D/g, '').replace(/^(91|0)(?=\d{10}$)/, '');
    if (!/^[6-9]\d{9}$/.test(digits)) { say(w().phone, 'err'); f.phone.focus(); return; }
    if (!f.gym.value.trim()) { say(w().gym, 'err'); f.gym.focus(); return; }
    if (!f.city.value.trim()) { say(w().city, 'err'); f.city.focus(); return; }
    busy = true;
    say(w().sending);
    fetch('/api/lead', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: digits, gym: f.gym.value, city: f.city.value, size: f.size.value, today: f.today.value, website: f.website.value, lang: document.documentElement.lang }),
    })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (b) {
          if (r.status === 201) { form.reset(); say(w().ok, 'ok'); return; }
          console.warn('[lead] answered', r.status);
          say(r.status < 500 && b && b.error ? b.error : w().fail, 'err');
        });
      })
      .catch(function (err) { console.warn('[lead] could not send', err); say(w().fail, 'err'); })
      .then(function () { busy = false; });
  });
})();
