// The landing page's only script (launch I2/I3; rebuilt 21 Oct 2026 around the member app, owner
// R-50). A separate file because the site's security policy runs no inline script. Four jobs:
//  1. English / Hindi (kept per browser);
//  2. "Type your gym's name" + colour: every phone on the page wears it (View Transitions when the
//     browser has them);
//  3. the live workout: three sets tick, the kg to beat rolls down digit by digit, a record slams;
//  3b. R-57 (owner, 22 Oct 2026): the shop, the messages and the lock screen play the same way, each
//      with a list beside it that lights up step by step;
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
  function gymName() { return (nameBox.value || '').replace(/\s+/g, ' ').trim() || nameBox.getAttribute('placeholder'); }
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

  // 3. The live workout --------------------------------------------------------------------------
  var live = document.getElementById('live');
  var rows = live ? Array.prototype.slice.call(live.querySelectorAll('tbody tr')) : [];
  var beat = document.getElementById('beat');
  var rest = document.getElementById('rest');
  var restT = document.getElementById('restt');
  var record = document.getElementById('record');
  var liftBeats = document.getElementById('lift-beats');
  var timers = [];
  /** R-57: light the list beside a phone up to step n (0 = none yet). */
  function beatsTo(list, n) {
    if (!list) return;
    Array.prototype.forEach.call(list.querySelectorAll('[data-beat]'), function (li) { li.classList.toggle('on', Number(li.dataset.beat) <= n); });
  }
  function later(ms, fn) { timers.push(setTimeout(fn, ms)); }
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
  function countDown(from, to, ms) {
    var steps = 8;
    for (var s = 1; s <= steps; s++) {
      (function (s) { later((ms / steps) * s, function () { roll(beat, fmt(Math.round(from - ((from - to) * s) / steps))); }); })(s);
    }
  }
  function reset() {
    timers.forEach(clearTimeout);
    timers = [];
    rows.forEach(function (r) { r.classList.remove('done'); });
    if (beat) beat.textContent = '1,125';
    if (rest) rest.style.setProperty('--p', 0);
    if (restT) restT.textContent = '1:30';
    if (record) record.classList.remove('slam');
    if (beat) beat.closest('.live-beat').classList.remove('won');
    beatsTo(liftBeats, 0);
  }
  function finalState() {
    rows.forEach(function (r) { r.classList.add('done'); });
    beat.textContent = '0';
    beat.closest('.live-beat').classList.add('won');
    record.classList.add('slam');
    beatsTo(liftBeats, 3);
  }
  function play() {
    reset();
    if (!live) return;
    if (reduce) { finalState(); return; }
    if (liftBeats) liftBeats.classList.add('armed');
    beatsTo(liftBeats, 1);
    var left = 1125;
    rows.forEach(function (r, i) {
      later(900 + i * 2100, function () {
        if (i === 0) beatsTo(liftBeats, 2);
        r.classList.add('done');
        var next = Math.max(0, left - 375);
        countDown(left, next, 600);
        left = next;
        if (i < rows.length - 1) {
          for (var t = 1; t <= 6; t++) {
            (function (t) { later(t * 230, function () { rest.style.setProperty('--p', t / 6); restT.textContent = '1:' + String(30 - t * 5).padStart(2, '0'); }); })(t);
          }
          later(1800, function () { rest.style.setProperty('--p', 0); restT.textContent = '1:30'; });
        }
      });
    });
    later(900 + rows.length * 2100, function () { beat.closest('.live-beat').classList.add('won'); record.classList.add('slam'); beatsTo(liftBeats, 3); });
  }
  if (live) {
    if ('IntersectionObserver' in window) {
      // The HTML holds the finished workout (no script, reduced motion). With motion it is set back
      // to the start now, so the visitor sees it play from the first set (R-57 review).
      if (!reduce) {
        reset();
        if (liftBeats) liftBeats.classList.add('armed');
      }
      var seen = false;
      new IntersectionObserver(function (es) {
        es.forEach(function (e) { if (e.isIntersecting && !seen) { seen = true; play(); } });
      }, { threshold: 0.45 }).observe(live);
    } else {
      finalState();
    }
    var again = document.getElementById('replay');
    if (again) again.addEventListener('click', play);
  }


  // 3b. R-57: the played scenes ----------------------------------------------------------------
  // A scene is ARMED when it can play (its parts take their starting state; until then the HTML
  // shows the finished state, which is also what reduced motion and a page without script keep).
  // It plays once when it scrolls into view, and again on "Play it again".
  function sceneOn(el, again, arm, steps) {
    if (!el || reduce || !('IntersectionObserver' in window)) return;
    var ts = [];
    function run() {
      ts.forEach(clearTimeout);
      ts = [];
      arm();
      steps.forEach(function (st) { ts.push(setTimeout(st[1], st[0])); });
    }
    arm();
    var seen = false;
    new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting && !seen) { seen = true; run(); } });
    }, { threshold: 0.4 }).observe(el);
    if (again) again.addEventListener('click', run);
  }
  /** A finger on a control: it dips and a ring spreads (the class is set again to replay it). */
  function tap(el) {
    if (!el) return;
    el.classList.remove('tapping');
    void el.offsetWidth;
    el.classList.add('tapping');
  }
  function $(id) { return document.getElementById(id); }

  // The shop: Add -> the bag -> Place order -> the desk gets it -> one fewer on the shelf.
  (function () {
    var scene = $('shop-scene'), list = $('shop-beats');
    var add = $('shop-add'), bag = $('shop-bag'), bagN = $('shop-bagn'), sheet = $('shop-sheet');
    var order = $('shop-order'), burst = $('shop-burst'), left = $('shop-left');
    sceneOn(scene, $('shop-replay'), function () {
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
    sceneOn(scene, $('msg-replay'), function () {
      scene.classList.add('armed');
      compose.classList.remove('sent');
      typed.textContent = '';
      read.textContent = '0';
      card.classList.remove('in');
    }, steps);
  })();

  // The lock screen: the live card (workout time ticking) -> Complete set -> the rest counts down
  // -> "Rest is over" rings and the phone buzzes.
  (function () {
    var scene = $('lock-scene'), phone = $('lock-phone'), list = $('lock-beats'), watch = $('lock-watch');
    var clock = $('n-clock'), lefts = scene ? scene.querySelectorAll('.js-left') : [];
    if (!scene) return;
    /** The phone and the watch move together (the watch app counts the rest and buzzes too). */
    function state(v) { phone.dataset.s = v; if (watch) watch.dataset.s = v; }
    function setLeft(t) { Array.prototype.forEach.call(lefts, function (n) { n.textContent = t; }); }
    function buzz(el) { if (!el) return; el.classList.remove('buzz'); void el.offsetWidth; el.classList.add('buzz'); }
    var tick = null;
    function mmss(sec) { return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0'); }
    function stopClock() { if (tick) clearInterval(tick); tick = null; }
    var steps = [
      [300, function () {
        beatsTo(list, 1);
        var sec = 24 * 60 + 10;
        stopClock();
        tick = setInterval(function () { sec += 1; clock.textContent = mmss(sec); }, 1000);
      }],
      [2200, function () { tap($('n-complete')); }],
      [2700, function () { stopClock(); state('rest'); beatsTo(list, 2); }],
    ];
    for (var r = 1; r <= 10; r++) {
      (function (r) { steps.push([2900 + r * 300, function () { setLeft(mmss(90 - r * 9)); }]); })(r);
    }
    steps.push([6300, function () { state('over'); beatsTo(list, 3); buzz(phone); buzz(watch); }]);
    sceneOn(scene, $('lock-replay'), function () {
      stopClock();
      if (list) list.classList.add('armed');
      beatsTo(list, 0);
      state('live');
      phone.classList.remove('buzz');
      if (watch) watch.classList.remove('buzz');
      clock.textContent = '24:10';
      setLeft('1:30');
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
        // data-anchor="under": run along the target's bottom edge (a table header's own rule) to its
        // middle, so the line never crosses the words beside it.
        var under = tag.dataset.anchor === 'under';
        var gy = (under ? G.bottom : G.top + G.height / 2) - H.top;
        var ex = (under ? G.left + G.width / 2 : right ? G.right + 3 : G.left - 3) - H.left;
        var tl = T.left - H.left, tr = T.right - H.left, tt = T.top - H.top, tb = T.bottom - H.top;
        var d;
        if (gx > tl && gx < tr) {
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
  var WORDS = {
    en: { phone: 'Type a 10-digit mobile number.', gym: 'Type your gym’s name first (in the coloured box above).', gym2: 'Type your gym’s name.', sending: 'Sending…', ok: 'Thank you! We will call you soon.', fail: 'Could not send. Check your internet and try again.' },
    hi: { phone: '10 अंकों का मोबाइल नंबर लिखें।', gym: 'पहले ऊपर रंगीन बॉक्स में जिम का नाम लिखें।', gym2: 'जिम का नाम लिखें।', sending: 'भेज रहे हैं…', ok: 'धन्यवाद! हम जल्दी फोन करेंगे।', fail: 'भेज नहीं पाए। इंटरनेट देखकर फिर कोशिश करें।' },
  };
  function w() { return WORDS[root.lang === 'hi' ? 'hi' : 'en']; }
  Array.prototype.forEach.call(document.querySelectorAll('.lead-form'), function (form) {
    var msg = form.querySelector('.msg');
    var go = form.querySelector('.go');
    var busy = false;
    function say(text, kind) { msg.textContent = text; msg.className = 'msg' + (kind ? ' ' + kind : ''); }
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (busy) return;
      var f = form.elements;
      var digits = f.phone.value.replace(/\D/g, '').replace(/^(91|0)(?=\d{10}$)/, '');
      if (!/^[6-9]\d{9}$/.test(digits)) { say(w().phone, 'err'); f.phone.focus(); return; }
      var gym = f.gym ? f.gym.value.trim() : nameBox.value.trim();
      if (!gym) {
        if (f.gym) { say(w().gym2, 'err'); f.gym.focus(); } else { say(w().gym, 'err'); nameBox.focus(); }
        return;
      }
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
            console.warn('[lead] answered', r.status);
            say(r.status < 500 && b && b.error ? b.error : w().fail, 'err');
          });
        })
        .catch(function (err) { console.warn('[lead] could not send', err); say(w().fail, 'err'); })
        .then(function () { busy = false; go.disabled = false; });
    });
  });
})();
