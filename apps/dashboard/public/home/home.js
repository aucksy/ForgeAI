// The gym-owner page's only script (gyms.mettleup.fit; rebuilt 4 Nov 2026, R-324). A separate file because
// the site's security policy runs no inline script. Jobs:
//  1. English / Hindi (kept per browser);
//  2. "Type your gym's name" + colour: every phone and card on the page wears it;
//  3. the live scenes (the workout, and one tiny scene per card): each plays by itself while it is on
//     screen, holds its finished state, fades and starts again; off screen or in a hidden tab it stops.
//     The HTML holds the finished state, which is what no script, reduced motion and a screenshot keep;
//  4. small touches: the header line, the 63% count, the hero phone's tilt, monthly / yearly prices, the
//     phone's bottom "Start free" bar;
//  5. the "free demo" forms -> POST /api/lead (deploy/panel/leads.js). Unchanged in behaviour.
(function () {
  var root = document.documentElement;
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  function store(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* quiet: private window; the choice just isn't kept */ } }
  function read(k) { try { return localStorage.getItem(k); } catch (e) { return null; /* quiet: private window */ } }
  function $(id) { return document.getElementById(id); }
  function all(sel, el) { return Array.prototype.slice.call((el || document).querySelectorAll(sel)); }
  var canWatch = 'IntersectionObserver' in window;

  // 1. Language --------------------------------------------------------------------------------
  var LANG = 'forgeai.home.lang';
  var btn = $('lang');
  var swaps = [
    ['[data-hi]', function (n) { return n.innerHTML; }, function (n, v) { n.innerHTML = v; }, 'data-hi'],
    ['[data-hi-alt]', function (n) { return n.getAttribute('alt'); }, function (n, v) { n.setAttribute('alt', v); }, 'data-hi-alt'],
    ['[data-hi-label]', function (n) { return n.getAttribute('aria-label'); }, function (n, v) { n.setAttribute('aria-label', v); }, 'data-hi-label'],
    ['[data-hi-ph]', function (n) { return n.getAttribute('placeholder'); }, function (n, v) { n.setAttribute('placeholder', v); }, 'data-hi-ph'],
  ].map(function (s) {
    var nodes = all(s[0]);
    nodes.forEach(function (n) { n.__en = n.__en || {}; n.__en[s[3]] = s[1](n); });
    return { nodes: nodes, set: s[2], attr: s[3] };
  });
  function setLang(lang) {
    var hi = lang === 'hi';
    root.lang = hi ? 'hi' : 'en';
    swaps.forEach(function (s) { s.nodes.forEach(function (n) { s.set(n, hi ? n.getAttribute(s.attr) : n.__en[s.attr]); }); });
    btn.textContent = hi ? 'English' : 'हिंदी';
    btn.lang = hi ? 'en' : 'hi';
    store(LANG, root.lang);
    paintGym();
  }
  btn.addEventListener('click', function () { setLang(root.lang === 'hi' ? 'en' : 'hi'); });

  // 2. Your gym, your colour ---------------------------------------------------------------------
  var GYM = 'forgeai.home.gym';
  var COLOUR = 'forgeai.home.colour';
  var nameBox = $('gymname');
  var swatches = all('.sw');
  // The empty box shows a grey example; the phones keep their own made-up gym (owner, 25 Oct: a grey
  // "Iron Temple Fitness" in the box looked already filled in, so the call-back form seemed stuck on it).
  var DEMO_GYM = 'Iron Temple Fitness';
  var formGym = document.querySelector('#demo input[name=gym]');
  function gymName() { return (nameBox.value || '').replace(/\s+/g, ' ').trim() || DEMO_GYM; }
  function paintGym() {
    var name = gymName();
    all('[data-gym]').forEach(function (n) { n.textContent = name; });
    all('[data-initial]').forEach(function (n) { n.textContent = name.charAt(0).toUpperCase(); });
    if (formGym && !formGym.dataset.touched) formGym.value = nameBox.value.trim();
  }
  function paintColour(sw, animate) {
    var apply = function () {
      root.style.setProperty('--flavour', sw.dataset.c);
      root.style.setProperty('--on-flavour', sw.dataset.on);
      swatches.forEach(function (s) { s.setAttribute('aria-pressed', s === sw ? 'true' : 'false'); });
    };
    if (animate && !reduce && document.startViewTransition) document.startViewTransition(apply);
    else apply();
    store(COLOUR, sw.dataset.c);
  }
  swatches.forEach(function (sw) { sw.addEventListener('click', function () { paintColour(sw, true); }); });
  nameBox.addEventListener('input', function () { paintGym(); store(GYM, nameBox.value.slice(0, 34)); });
  if (formGym) formGym.addEventListener('input', function () { formGym.dataset.touched = '1'; });
  var savedGym = read(GYM);
  if (savedGym) nameBox.value = savedGym;
  var savedColour = read(COLOUR);
  swatches.forEach(function (sw) { if (sw.dataset.c === savedColour) paintColour(sw, false); });
  if (read(LANG) === 'hi') setLang('hi'); else paintGym();

  // 3. The live scenes ---------------------------------------------------------------------------
  // R-97 (owner, 24 Oct 2026): every scene plays by itself, again and again, while it is on screen.
  // One run ends on the finished state, held HOLD ms so it can be read; it fades and starts over.
  var HOLD = 3400, FADE = 450;
  function beatsTo(list, n) {
    if (!list) return;
    all('[data-beat]', list).forEach(function (li) { li.classList.toggle('on', Number(li.dataset.beat) <= n); });
  }
  function fmt(n) { return n.toLocaleString('en-IN'); }
  // Split-flap roll: only the characters that change flip in.
  function roll(el, text) {
    var old = el.textContent;
    el.textContent = '';
    for (var i = 0; i < text.length; i++) {
      var c = document.createElement('i');
      c.textContent = text[i];
      if (text[i] !== old[i]) c.className = 'flip';
      el.appendChild(c);
    }
  }
  /** A finger on a control: it dips and a ring spreads (the class is set again to replay it). */
  function tap(el) {
    if (!el) return;
    el.classList.remove('tapping');
    void el.offsetWidth;
    el.classList.add('tapping');
  }
  /** stage: watched for being on screen, fades between runs. arm(): the starting state. steps: [[ms, fn]]. */
  function loopScene(stage, arm, steps) {
    if (!stage || reduce || !canWatch) return;
    var ts = [], on = false, seen = false, paused = false;
    var last = steps.reduce(function (m, s) { return Math.max(m, s[0]); }, 0);
    function clear() { ts.forEach(clearTimeout); ts = []; }
    function run() {
      clear();
      stage.classList.remove('rewind');
      arm();
      steps.forEach(function (st) { ts.push(setTimeout(st[1], st[0])); });
      ts.push(setTimeout(function () { stage.classList.add('rewind'); }, last + HOLD));
      ts.push(setTimeout(run, last + HOLD + FADE));
    }
    /** The finished state at once: every step run in order. */
    function finish() { arm(); steps.slice().sort(function (a, b) { return a[0] - b[0]; }).forEach(function (st) { st[1](); }); }
    function begin() { if (on || paused) return; on = true; run(); }
    function end() { if (!on) return; on = false; clear(); stage.classList.remove('rewind'); finish(); }
    new IntersectionObserver(function (es) {
      es.forEach(function (e) { seen = e.isIntersecting; if (seen && !document.hidden) begin(); else end(); });
    }, { threshold: 0.35 }).observe(stage);
    document.addEventListener('visibilitychange', function () { if (document.hidden) end(); else if (seen) begin(); });
    // A tap (or click) pauses it on the finished state; another tap plays it again.
    stage.addEventListener('click', function () {
      paused = !paused;
      if (paused) end(); else if (seen) begin();
    });
  }

  // The live workout: three sets tick, the kg to beat rolls down digit by digit, a record slams.
  (function () {
    var live = $('live'), stage = $('lift-scene');
    if (!live) return;
    var rows = all('tbody tr', live);
    var beat = $('beat'), record = $('record'), list = $('lift-beats');
    var won = $('t-beat');
    var steps = [[0, function () { beatsTo(list, 1); }]];
    var left = 1125;
    rows.forEach(function (r, i) {
      var t0 = 900 + i * 1500, from = left, to = Math.max(0, left - 375);
      left = to;
      steps.push([t0, function () { if (i === 0) beatsTo(list, 2); r.classList.add('done'); }]);
      for (var s = 1; s <= 8; s++) {
        (function (s) { steps.push([t0 + 75 * s, function () { roll(beat, fmt(Math.round(from - ((from - to) * s) / 8))); }]); })(s);
      }
    });
    steps.push([900 + rows.length * 1500, function () { won.classList.add('won'); record.classList.add('slam'); beatsTo(list, 3); }]);
    loopScene(stage, function () {
      if (list) list.classList.add('armed');
      rows.forEach(function (r) { r.classList.remove('done'); });
      beat.textContent = '1,125';
      record.classList.remove('slam');
      won.classList.remove('won');
      beatsTo(list, 0);
    }, steps);
  })();

  // Who stopped coming: the morning list fills in, one member at a time, the WhatsApp button pressed.
  (function () {
    var cell = $('c-slip');
    if (!cell) return;
    var rows = all('.urow', cell);
    var steps = rows.map(function (r, i) { return [400 + i * 550, function () { r.classList.remove('hide'); }]; });
    steps.push([400 + rows.length * 550 + 300, function () { tap(rows[0].querySelector('.wa')); }]);
    loopScene(cell, function () {
      cell.classList.add('armed');
      rows.forEach(function (r) { r.classList.add('hide'); });
    }, steps);
  })();

  // AI import: a scan runs over the sheet, each column gets its MettleUp name, the count rolls up.
  (function () {
    var cell = $('c-ai');
    if (!cell) return;
    var cols = all('.col', cell), scan = cell.querySelector('.scan'), count = $('ai-count');
    var steps = [[300, function () { scan.classList.add('go'); }]];
    cols.forEach(function (c, i) { steps.push([800 + i * 380, function () { c.classList.add('in'); }]); });
    var t = 800 + cols.length * 380 + 200;
    [26, 74, 131, 178, 212].forEach(function (n, i) { steps.push([t + i * 150, function () { roll(count, String(n)); }]); });
    loopScene(cell, function () {
      scan.classList.remove('go');
      cols.forEach(function (c) { c.classList.remove('in'); });
      count.textContent = '0';
    }, steps);
  })();

  // Offline desk: saved while the internet is down, then sent one by one when it is back.
  (function () {
    var cell = $('c-off');
    if (!cell) return;
    var ui = cell.querySelector('.ui'), rows = all('.urow', cell);
    var steps = [[1600, function () { ui.classList.add('online'); }]];
    rows.forEach(function (r, i) { steps.push([2100 + i * 500, function () { r.classList.add('sent'); }]); });
    loopScene(cell, function () {
      ui.classList.remove('online');
      rows.forEach(function (r) { r.classList.remove('sent'); });
    }, steps);
  })();

  // Shop: the order lands on the desk, and the shelf shows one fewer.
  (function () {
    var cell = $('c-shop');
    if (!cell) return;
    var toast = cell.querySelector('.toast'), left = $('shop-left');
    loopScene(cell, function () {
      cell.classList.add('armed');
      toast.classList.remove('in');
      left.textContent = '3';
    }, [
      [600, function () { toast.classList.add('in'); }],
      [1500, function () { roll(left, '2'); }],
    ]);
  })();

  // Messages: typed once, Send, "read by" counts up.
  (function () {
    var cell = $('c-msg'), bubble = $('m-bubble'), typed = $('m-typed'), readBy = $('m-read');
    if (!cell) return;
    var text = typed.textContent;
    var steps = [];
    for (var k = 1; k <= text.length; k++) {
      (function (k) { steps.push([300 + k * 30, function () { typed.textContent = text.slice(0, k); }]); })(k);
    }
    var at = 300 + text.length * 30;
    steps.push([at + 400, function () { tap($('m-send')); }]);
    steps.push([at + 700, function () { bubble.classList.add('sent'); }]);
    [9, 21, 35, 48, 58, 64].forEach(function (n, i) { steps.push([at + 1200 + i * 240, function () { roll(readBy, String(n)); }]); });
    loopScene(cell, function () {
      bubble.classList.remove('sent');
      typed.textContent = '';
      readBy.textContent = '0';
    }, steps);
  })();

  // Trainer plan: Send, and it is on its way to every member's app.
  (function () {
    var cell = $('c-plan'), ui = $('p-ui');
    if (!cell) return;
    loopScene(cell, function () {
      cell.classList.add('armed');
      ui.classList.remove('sent');
    }, [
      [1100, function () { tap($('p-send')); }],
      [1450, function () { ui.classList.add('sent'); }],
    ]);
  })();

  // 4. Small touches -------------------------------------------------------------------------------
  // The header gets its line once the page moves.
  var top = $('top');
  function onScroll() { top.classList.toggle('scrolled', window.scrollY > 8); }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // The 63% counts up the first time it is seen.
  if (!reduce && canWatch) {
    all('.count').forEach(function (el) {
      var to = Number(el.dataset.to);
      var io = new IntersectionObserver(function (es) {
        if (!es[0].isIntersecting) return;
        io.disconnect();
        var t0 = performance.now();
        (function step(t) {
          var p = Math.min(1, (t - t0) / 1100);
          el.textContent = String(Math.round(to * (1 - Math.pow(1 - p, 3))));
          if (p < 1) requestAnimationFrame(step);
        })(t0);
      }, { threshold: 0.6 });
      el.textContent = '0';
      io.observe(el);
    });
  }

  // The hero phone leans a little toward the mouse (a mouse only; phones keep it still).
  var tilt = $('tilt'), hero = document.querySelector('.hero');
  if (tilt && hero && !reduce && window.matchMedia && matchMedia('(hover: hover) and (pointer: fine)').matches) {
    var queued = false, px = 0, py = 0;
    hero.addEventListener('pointermove', function (e) {
      var r = hero.getBoundingClientRect();
      px = (e.clientX - r.left) / r.width - 0.5;
      py = (e.clientY - r.top) / r.height - 0.5;
      if (queued) return;
      queued = true;
      requestAnimationFrame(function () {
        queued = false;
        tilt.style.setProperty('--ry', (px * 10).toFixed(2) + 'deg');
        tilt.style.setProperty('--rx', (-py * 8).toFixed(2) + 'deg');
      });
    });
    hero.addEventListener('pointerleave', function () { tilt.style.setProperty('--ry', '0deg'); tilt.style.setProperty('--rx', '0deg'); });
  }

  // Monthly / yearly prices.
  var cards = $('cards'), bm = $('bill-m'), by = $('bill-y');
  function bill(yearly) {
    cards.classList.toggle('yr', yearly);
    bm.setAttribute('aria-pressed', String(!yearly));
    by.setAttribute('aria-pressed', String(yearly));
  }
  if (cards && bm && by) {
    bm.addEventListener('click', function () { bill(false); });
    by.addEventListener('click', function () { bill(true); });
  }

  // On a phone, the bottom "Start free" bar shows once the top buttons have scrolled away, and hides
  // again near the end of the page (where the Start section and the footer have their own).
  var dock = $('dock');
  if (dock && canWatch) {
    var away = false, near = false, nearSet = {};
    var show = function () { dock.classList.toggle('show', away && !near); };
    new IntersectionObserver(function (es) { away = !es[0].isIntersecting && es[0].boundingClientRect.top < 0; show(); }).observe(document.querySelector('.hero .ctas'));
    var endIo = new IntersectionObserver(function (es) {
      es.forEach(function (e) { nearSet[e.target.id || 'foot'] = e.isIntersecting; });
      near = Object.keys(nearSet).some(function (k) { return nearSet[k]; });
      show();
    });
    endIo.observe($('start'));
    endIo.observe(document.querySelector('.foot-bar'));
  }

  // 5. Free demo forms ---------------------------------------------------------------------------
  // 25 Oct 2026 (the owner's own request never reached HQ): the top form ("Or we call you") has only
  // a number box. It sends the number with whatever gym name is typed in the coloured box, or none
  // (deploy/panel/leads.js takes a lead without one), and every message is scrolled into view.
  var WORDS = {
    en: { phone: 'Type a 10-digit mobile number.', gym2: 'Type your gym’s name.', sending: 'Sending…', ok: 'Thank you! We will call you soon.', many: 'You have sent too many demo requests today. Please try again tomorrow.', fail: 'Could not send. Check your internet and try again.' },
    hi: { phone: '10 डिजिट का मोबाइल नंबर टाइप करें।', gym2: 'अपने जिम का नाम टाइप करें।', sending: 'भेज रहे हैं…', ok: 'थैंक यू! हम जल्दी आपको कॉल करेंगे।', many: 'आपने आज बहुत बार डेमो रिक्वेस्ट भेजी है। प्लीज़ कल फिर ट्राई करें।', fail: 'भेज नहीं पाए। इंटरनेट चेक करके फिर ट्राई करें।' },
  };
  function w() { return WORDS[root.lang === 'hi' ? 'hi' : 'en']; }
  // F184 (R-242): a member shared this page with their gym owner (mettleup.fit's "Recommend MettleUp to
  // your gym" sends gyms.mettleup.fit/?from=member). A demo request from that visit is marked
  // 'member-referral' so HQ counts it as a lead a member brought in. Kept for this tab only.
  var SOURCE = 'forgeai.home.from';
  var source = '';
  try {
    if (new URLSearchParams(location.search).get('from') === 'member') sessionStorage.setItem(SOURCE, 'member-referral');
    source = sessionStorage.getItem(SOURCE) || '';
  } catch (e) {
    source = /[?&]from=member(&|$)/.test(location.search) ? 'member-referral' : ''; // quiet: storage blocked
  }
  all('.lead-form').forEach(function (form) {
    var msg = form.querySelector('.msg');
    var go = form.querySelector('.go');
    var busy = false;
    function say(text, kind) {
      msg.textContent = text;
      msg.className = 'msg' + (kind ? ' ' + kind : '');
      // A message the visitor cannot see is a silent failure: bring it on screen.
      if (msg.scrollIntoView) msg.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
    }
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (busy) return;
      var f = form.elements;
      var digits = f.phone.value.replace(/\D/g, '').replace(/^(91|0)(?=\d{10}$)/, '');
      if (!/^[6-9]\d{9}$/.test(digits)) { f.phone.focus(); say(w().phone, 'err'); return; }
      var gym = f.gym ? f.gym.value.trim() : nameBox.value.replace(/\s+/g, ' ').trim();
      if (f.gym && !gym) { f.gym.focus(); say(w().gym2, 'err'); return; }
      busy = true;
      go.disabled = true;
      say(w().sending);
      fetch('/api/lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: digits,
          gym: gym,
          city: f.city ? f.city.value : '',
          size: f.size ? f.size.value : '',
          today: f.today ? f.today.value : '',
          website: f.website.value,
          lang: root.lang,
          colour: read(COLOUR) || '',
          source: source,
        }),
      })
        .then(function (r) {
          return r.json().catch(function () { return {}; }).then(function (b) {
            if (r.status === 201) { f.phone.value = ''; say(w().ok, 'ok'); return; }
            console.warn('[lead] answered', r.status, b && b.error);
            say(r.status === 429 ? w().many : r.status === 400 ? w().phone : w().fail, 'err');
          });
        })
        .catch(function (err) { console.warn('[lead] could not send', err); say(w().fail, 'err'); })
        .then(function () { busy = false; go.disabled = false; });
    });
  });
})();
