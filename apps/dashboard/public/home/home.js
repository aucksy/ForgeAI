// The landing page's only script (launch I2/I3; rebuilt 21 Oct 2026 around the member app, owner
// R-50). A separate file because the site's security policy runs no inline script. Four jobs:
//  1. English / Hindi (kept per browser);
//  2. "Type your gym's name" + colour: every phone on the page wears it (View Transitions when the
//     browser has them);
//  3. the played scenes (the live workout, the shop, the messages, moving in), each
//     with a list beside it that lights up step by step; since R-97 they loop by themselves;
//  4. the "free demo" forms -> POST /api/lead (deploy/panel/leads.js).
(function () {
  var root = document.documentElement;
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  function store(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* quiet: private window; the choice just isn't kept */ } }
  function read(k) { try { return localStorage.getItem(k); } catch (e) { return null; /* quiet: private window */ } }

  // 1. Language --------------------------------------------------------------------------------
  var LANG = 'forgeai.home.lang';
  var btn = document.getElementById('lang');
  var swaps = [
    ['[data-hi]', function (n) { return n.innerHTML; }, function (n, v) { n.innerHTML = v; }, 'data-hi'],
    ['[data-hi-alt]', function (n) { return n.getAttribute('alt'); }, function (n, v) { n.setAttribute('alt', v); }, 'data-hi-alt'],
    ['[data-hi-label]', function (n) { return n.getAttribute('aria-label'); }, function (n, v) { n.setAttribute('aria-label', v); }, 'data-hi-label'],
    ['[data-hi-ph]', function (n) { return n.getAttribute('placeholder'); }, function (n, v) { n.setAttribute('placeholder', v); }, 'data-hi-ph'],
  ].map(function (s) {
    var nodes = Array.prototype.slice.call(document.querySelectorAll(s[0]));
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
  var nameBox = document.getElementById('gymname');
  var swatches = Array.prototype.slice.call(document.querySelectorAll('.sw'));
  // The empty box shows a grey example; the phone preview keeps its own made-up gym (owner, 25 Oct: a grey
  // "Iron Temple Fitness" in the box looked already filled in, so the call-back form seemed stuck on it).
  var DEMO_GYM = 'Iron Temple Fitness';
  function gymName() { return (nameBox.value || '').replace(/\s+/g, ' ').trim() || DEMO_GYM; }
  function paintGym() {
    var name = gymName();
    Array.prototype.forEach.call(document.querySelectorAll('[data-gym]'), function (n) { n.textContent = name; });
    Array.prototype.forEach.call(document.querySelectorAll('[data-initial]'), function (n) { n.textContent = name.charAt(0).toUpperCase(); });
    Array.prototype.forEach.call(document.querySelectorAll('.back input[name=gym]'), function (n) { if (!n.dataset.touched) n.value = nameBox.value.trim(); });
  }
  function paintColour(sw, animate) {
    var apply = function () {
      root.style.setProperty('--flavour', sw.dataset.c);
      root.style.setProperty('--on-flavour', sw.dataset.on);
      swatches.forEach(function (s) { s.setAttribute('aria-pressed', s === sw ? 'true' : 'false'); });
      var meta = document.querySelector('meta[name=theme-color]');
      if (meta) meta.setAttribute('content', sw.dataset.c);
    };
    if (animate && !reduce && document.startViewTransition) document.startViewTransition(apply);
    else apply();
    store(COLOUR, sw.dataset.c);
  }
  swatches.forEach(function (sw) { sw.addEventListener('click', function () { paintColour(sw, true); }); });
  nameBox.addEventListener('input', function () { paintGym(); store(GYM, nameBox.value.slice(0, 34)); });
  var back = document.querySelector('.back input[name=gym]');
  if (back) back.addEventListener('input', function () { back.dataset.touched = '1'; });
  var savedGym = read(GYM);
  if (savedGym) nameBox.value = savedGym;
  var savedColour = read(COLOUR);
  swatches.forEach(function (sw) { if (sw.dataset.c === savedColour) paintColour(sw, false); });
  if (read(LANG) === 'hi') setLang('hi'); else paintGym();

  // 3. The played scenes ------------------------------------------------------------------------
  // R-97 (owner, 24 Oct 2026): every scene plays by itself, again and again, while it is on screen
  // (no "Play it again"). One run ends on the finished state, held HOLD ms so it can be read; the
  // stage fades for a moment and the run starts over. Off screen, or with the tab hidden, it stops
  // (nothing runs in the background) and starts from the top when it is seen again. The HTML holds
  // the finished state, which is what no script, reduced motion and a screenshot all keep.
  var HOLD = 3400, FADE = 450;
  function $(id) { return document.getElementById(id); }
  /** R-57: light the list beside a phone up to step n (0 = none yet). */
  function beatsTo(list, n) {
    if (!list) return;
    Array.prototype.forEach.call(list.querySelectorAll('[data-beat]'), function (li) { li.classList.toggle('on', Number(li.dataset.beat) <= n); });
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
  /**
   * stage: the element that fades between runs and is watched for being on screen.
   * arm(): every part to its starting state. steps: [[ms, fn], ...]. stop(): optional, ends any
   * interval a step started.
   */
  function loopScene(stage, arm, steps, stop) {
    if (!stage || reduce || !('IntersectionObserver' in window)) return;
    var ts = [], on = false, seen = false;
    var last = steps.reduce(function (m, s) { return Math.max(m, s[0]); }, 0);
    function clear() { ts.forEach(clearTimeout); ts = []; if (stop) stop(); }
    function run() {
      clear();
      stage.classList.remove('rewind');
      arm();
      steps.forEach(function (st) { ts.push(setTimeout(st[1], st[0])); });
      ts.push(setTimeout(function () { stage.classList.add('rewind'); }, last + HOLD));
      ts.push(setTimeout(run, last + HOLD + FADE));
    }
    var paused = false;
    /** The finished state at once: every step run in order, then any interval stopped. */
    function finish() { arm(); steps.slice().sort(function (a, b) { return a[0] - b[0]; }).forEach(function (st) { st[1](); }); if (stop) stop(); }
    function begin() { if (on || paused) return; on = true; run(); }
    function end() { if (!on) return; on = false; clear(); stage.classList.remove('rewind'); finish(); }
    arm();
    new IntersectionObserver(function (es) {
      es.forEach(function (e) { seen = e.isIntersecting; if (seen && !document.hidden) begin(); else end(); });
    }, { threshold: 0.35 }).observe(stage);
    document.addEventListener('visibilitychange', function () { if (document.hidden) end(); else if (seen) begin(); });
    // A tap (or click) on the stage pauses it on the finished state; another tap plays it again.
    stage.addEventListener('click', function () {
      paused = !paused;
      stage.classList.toggle('paused', paused);
      if (paused) end(); else if (seen) begin();
    });
  }

  // The live workout: three sets tick, the kg to beat rolls down digit by digit, a record slams.
  (function () {
    var live = $('live'), stage = $('lift-scene');
    if (!live) return;
    var rows = Array.prototype.slice.call(live.querySelectorAll('tbody tr'));
    var beat = $('beat'), record = $('record'), list = $('lift-beats');
    var won = beat.closest('.live-beat');
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

  // The shop: Add -> the bag -> Place order -> the desk gets it -> one fewer on the shelf.
  (function () {
    var scene = $('shop-scene'), list = $('shop-beats');
    if (!scene) return;
    var add = $('shop-add'), bag = $('shop-bag'), bagN = $('shop-bagn'), sheet = $('shop-sheet');
    var order = $('shop-order'), burst = $('shop-burst'), left = $('shop-left');
    loopScene(scene, function () {
      scene.classList.add('armed');
      if (list) list.classList.add('armed');
      beatsTo(list, 0);
      add.classList.remove('on', 'tapping');
      bag.classList.remove('has');
      bagN.textContent = '0';
      sheet.classList.remove('up', 'sent');
      order.classList.remove('in');
      burst.classList.remove('in');
      left.textContent = '3';
    }, [
      [700, function () { tap(add); add.classList.add('on'); bag.classList.add('has'); bagN.textContent = '1'; beatsTo(list, 1); }],
      [1500, function () { sheet.classList.add('up'); }],
      [2600, function () { tap($('shop-place')); }],
      [3000, function () { sheet.classList.add('sent'); beatsTo(list, 2); }],
      [3700, function () { order.classList.add('in'); }],
      [4500, function () { roll(left, '2'); beatsTo(list, 3); }],
      [5000, function () { burst.classList.add('in'); }],
    ]);
  })();

  // Messages: typed once, Send, it lands in the inbox, "read by" counts up.
  (function () {
    var scene = $('msg-scene'), compose = $('msg-compose'), typed = $('msg-typed');
    var read = $('msg-read'), card = $('msg-new');
    if (!scene) return;
    var text = typed.textContent;
    var steps = [];
    for (var k = 1; k <= text.length; k++) {
      (function (k) { steps.push([500 + k * 32, function () { typed.textContent = text.slice(0, k); }]); })(k);
    }
    var at = 500 + text.length * 32;
    steps.push([at + 450, function () { tap($('msg-send')); }]);
    steps.push([at + 850, function () { compose.classList.add('sent'); card.classList.add('in'); }]);
    [9, 21, 35, 48, 58, 64].forEach(function (n, i) { steps.push([at + 1500 + i * 260, function () { roll(read, String(n)); }]); });
    loopScene(scene, function () {
      scene.classList.add('armed');
      compose.classList.remove('sent');
      typed.textContent = '';
      read.textContent = '0';
      card.classList.remove('in');
    }, steps);
  })();

  // Moving in (R-97): the owner's own sheet; each column gets its MettleUp name, the rows check out,
  // and the count of members ready rolls up, with no mobile number shown to the AI.
  (function () {
    var scene = $('move-scene'), list = $('move-beats');
    if (!scene) return;
    var head = $('mv-head'), ai = $('mv-ai'), count = $('mv-count'), done = scene.querySelector('.sh-done');
    var chips = scene.querySelectorAll('.mv-chip'), rowsOk = scene.querySelectorAll('.sh-grid tbody tr');
    var steps = [
      [500, function () { beatsTo(list, 1); head.classList.add('scan'); ai.classList.add('on'); }],
    ];
    Array.prototype.forEach.call(chips, function (c, i) { steps.push([1300 + i * 420, function () { c.classList.add('in'); if (i === 1) beatsTo(list, 2); }]); });
    var t = 1300 + chips.length * 420 + 200;
    steps.push([t, function () { head.classList.remove('scan'); ai.classList.remove('on'); }]);
    Array.prototype.forEach.call(rowsOk, function (r, i) { steps.push([t + 250 + i * 280, function () { r.classList.add('ok'); }]); });
    t += 250 + rowsOk.length * 280;
    steps.push([t + 200, function () { beatsTo(list, 3); done.classList.add('in'); }]);
    [26, 74, 131, 178, 212].forEach(function (n, i) { steps.push([t + 300 + i * 160, function () { roll(count, String(n)); }]); });
    loopScene(scene, function () {
      scene.classList.add('armed');
      if (list) list.classList.add('armed');
      beatsTo(list, 0);
      head.classList.remove('scan');
      ai.classList.remove('on');
      Array.prototype.forEach.call(chips, function (c) { c.classList.remove('in'); });
      Array.prototype.forEach.call(rowsOk, function (r) { r.classList.remove('ok'); });
      done.classList.remove('in');
      count.textContent = '0';
    }, steps);
  })();

  // Leader lines: each call-out or price tag (data-target, data-side) gets a hand-drawn line to the
  // part of the app it names. The line runs to a gutter beside the phone (data-side = which side),
  // along it, then into the target, so it never cuts across the label text it starts from.
  var NS = 'http://www.w3.org/2000/svg';
  function drawLeaders() {
    Array.prototype.forEach.call(document.querySelectorAll('.leads-host'), function (host) {
      var svg = host.querySelector(':scope > svg.leaders');
      if (!svg) return;
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      var H = host.getBoundingClientRect();
      var lane = { left: 0, right: 0 };
      Array.prototype.forEach.call(host.querySelectorAll('[data-target]'), function (tag) {
        var target = host.querySelector(tag.dataset.target);
        var phone = target && target.closest('.phone');
        if (!target || !phone || !tag.offsetParent) return;
        var T = tag.getBoundingClientRect(), G = target.getBoundingClientRect(), P = phone.getBoundingClientRect();
        var right = tag.dataset.side === 'right';
        // each line gets its own lane beside the phone, so two lines never run on top of each other
        var k = lane[right ? 'right' : 'left']++;
        var gx = (right ? P.right + 12 + k * 12 : P.left - 12 - k * 12) - H.left;
        // R-97 review: the line stops at the edge of the card (or product, or table) that holds the
        // named part, level with it, so it never runs through the words it points at.
        var box = target.closest('.nc, .ac, .prod') || target;
        var B = box.getBoundingClientRect();
        var gy = G.top + G.height / 2 - H.top;
        var ex = (right ? B.right + 3 : B.left - 3) - H.left;
        var tl = T.left - H.left, tr = T.right - H.left, tt = T.top - H.top, tb = T.bottom - H.top;
        var d;
        if (gy > tt + 6 && gy < tb - 6 && (gx <= tl || gx >= tr)) {
          // R-97: the target sits level with the note: one straight line, no corner.
          d = 'M' + (gx > tr ? tr : tl) + ' ' + gy + ' H' + ex;
        } else if (gx > tl && gx < tr) {
          var sy = tt > gy ? tt : tb;
          d = 'M' + gx + ' ' + sy + ' V' + gy + ' H' + ex;
        } else {
          var sx = gx > tr ? tr : tl;
          var ty = tt + (tb - tt) / 2;
          d = 'M' + sx + ' ' + ty + ' H' + gx + ' V' + gy + ' H' + ex;
        }
        var path = document.createElementNS(NS, 'path');
        path.setAttribute('d', d);
        var dot = document.createElementNS(NS, 'circle');
        dot.setAttribute('cx', ex);
        dot.setAttribute('cy', gy);
        dot.setAttribute('r', 3.5);
        var lead = getComputedStyle(tag).getPropertyValue('--lead');
        if (lead) { path.style.stroke = lead; dot.style.fill = lead; }
        svg.appendChild(path);
        svg.appendChild(dot);
      });
    });
  }
  var leadQueued = false;
  function queueLeaders() {
    if (leadQueued) return;
    leadQueued = true;
    requestAnimationFrame(function () { leadQueued = false; drawLeaders(); });
  }
  window.addEventListener('resize', queueLeaders);
  window.addEventListener('load', queueLeaders);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(queueLeaders);
  if ('ResizeObserver' in window) {
    var ro = new ResizeObserver(queueLeaders);
    Array.prototype.forEach.call(document.querySelectorAll('.leads-host'), function (h) { ro.observe(h); });
  }
  btn.addEventListener('click', queueLeaders);
  nameBox.addEventListener('input', queueLeaders);
  queueLeaders();

  // 4. Free demo forms ---------------------------------------------------------------------------
  // 25 Oct 2026 (the owner's own request never reached HQ): the top form ("Or we call you") has only
  // a number box. It used to refuse when the coloured gym-name box at the top was empty, and jump up
  // to that box: the refusal sat below the screen, and pressing Go in that box sends nothing (it is
  // in no form). So the top form now sends the number with whatever gym name is typed, or none
  // (deploy/panel/leads.js takes a lead without one), and every message is scrolled into view.
  var WORDS = {
    en: { phone: 'Type a 10-digit mobile number.', gym2: 'Type your gym’s name.', sending: 'Sending…', ok: 'Thank you! We will call you soon.', many: 'You have sent too many demo requests today. Please try again tomorrow.', fail: 'Could not send. Check your internet and try again.' },
    hi: { phone: '10 डिजिट का मोबाइल नंबर टाइप करें।', gym2: 'अपने जिम का नाम टाइप करें।', sending: 'भेज रहे हैं…', ok: 'थैंक यू! हम जल्दी आपको कॉल करेंगे।', many: 'आपने आज बहुत बार डेमो रिक्वेस्ट भेजी है। प्लीज़ कल फिर ट्राई करें।', fail: 'भेज नहीं पाए। इंटरनेट चेक करके फिर ट्राई करें।' },
  };
  function w() { return WORDS[root.lang === 'hi' ? 'hi' : 'en']; }
  Array.prototype.forEach.call(document.querySelectorAll('.lead-form'), function (form) {
    var msg = form.querySelector('.msg');
    var go = form.querySelector('.go');
    var busy = false;
    function say(text, kind) {
      msg.textContent = text;
      msg.className = 'msg' + (kind ? ' ' + kind : '');
      // A message the visitor cannot see is a silent failure: bring it on screen (a focus() call
      // just before can have scrolled it away, or a phone keyboard can cover it).
      if (msg.scrollIntoView) msg.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
    }
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (busy) return;
      var f = form.elements;
      var digits = f.phone.value.replace(/\D/g, '').replace(/^(91|0)(?=\d{10}$)/, '');
      if (!/^[6-9]\d{9}$/.test(digits)) { f.phone.focus(); say(w().phone, 'err'); return; }
      // The Start form asks the gym name itself (its box is right above the button); the top form
      // takes it from the coloured box when one is typed, and is sent without it otherwise.
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
        }),
      })
        .then(function (r) {
          return r.json().catch(function () { return {}; }).then(function (b) {
            if (r.status === 201) { f.phone.value = ''; say(w().ok, 'ok'); return; }
            console.warn('[lead] answered', r.status, b && b.error);
            // The page's own words (English or Hindi); only the number can be refused (400) now.
            say(r.status === 429 ? w().many : r.status === 400 ? w().phone : w().fail, 'err');
          });
        })
        .catch(function (err) { console.warn('[lead] could not send', err); say(w().fail, 'err'); })
        .then(function () { busy = false; go.disabled = false; });
    });
  });
})();
