// The member page's only script (F184; rebuilt 4 Nov 2026, R-325). A separate file because the site's
// security policy runs no inline script. Six jobs:
//  1. English / Hindi (kept per browser; the same switch as the gym page, public/home/home.js);
//  2. on an iPhone, say the iPhone app is coming soon (the app is Android only for now);
//  3. the scorecard scene: Previous, then Next lights up, then the "Beaten" stamp lands (loops while seen);
//  4. the watch scene: real watch screens step through next set > dial > saved > rest over (loops while seen);
//  5. "Send to my gym": the phone's share sheet, else WhatsApp / copy the link. The link opens the gym
//     page with ?from=member, which its demo form saves as the lead's source (deploy/panel/leads.js);
//  6. the header line on scroll and the phone-only bottom bar.
// With reduced motion, every scene shows its last frame and never moves.
(function () {
  var root = document.documentElement;
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  function $(id) { return document.getElementById(id); }
  function all(sel, el) { return Array.prototype.slice.call((el || document).querySelectorAll(sel)); }
  function store(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* quiet: private window; the choice just isn't kept */ } }
  function read(k) { try { return localStorage.getItem(k); } catch (e) { return null; /* quiet: private window */ } }

  // 1. Language --------------------------------------------------------------------------------
  var LANG = 'mettleup.site.lang';
  var btn = $('lang');
  var swaps = [
    ['[data-hi]', function (n) { return n.innerHTML; }, function (n, v) { n.innerHTML = v; }, 'data-hi'],
    ['[data-hi-alt]', function (n) { return n.getAttribute('alt'); }, function (n, v) { n.setAttribute('alt', v); }, 'data-hi-alt'],
    ['[data-hi-label]', function (n) { return n.getAttribute('aria-label'); }, function (n, v) { n.setAttribute('aria-label', v); }, 'data-hi-label'],
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
  }
  if (btn) {
    btn.addEventListener('click', function () { setLang(root.lang === 'hi' ? 'en' : 'hi'); });
    if (read(LANG) === 'hi') setLang('hi');
  }

  // 2. iPhone or iPad: the iPhone app is coming soon ---------------------------------------------
  var ua = navigator.userAgent || '';
  var apple = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  if (apple) all('.note.ios').forEach(function (n) { n.hidden = false; });

  // A scene loops only while it is on screen; a tap pauses it (and a second tap plays it again).
  function loopScene(stage, arm, steps, total) {
    if (!stage) return;
    if (reduce || !('IntersectionObserver' in window)) return; // the page's HTML already shows the last frame
    var timers = [], visible = false, paused = false, running = false;
    function clear() { timers.forEach(clearTimeout); timers = []; running = false; }
    function run() {
      clear();
      if (!visible || paused) return;
      running = true;
      arm();
      steps.forEach(function (s) { timers.push(setTimeout(s[1], s[0])); });
      timers.push(setTimeout(run, total));
    }
    new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        visible = e.isIntersecting;
        if (visible && !running) run();
        if (!visible) clear();
      });
    }, { threshold: 0.45 }).observe(stage);
    stage.addEventListener('click', function () {
      paused = !paused;
      if (paused) clear(); else run();
    });
  }

  // 3. The scorecard ---------------------------------------------------------------------------------
  var score = $('score'), now = $('score-now'), stamp = $('score-stamp');
  loopScene(score, function () {
    score.classList.add('armed', 'rewind');
    now.classList.remove('in');
    stamp.classList.remove('in');
    setTimeout(function () { score.classList.remove('rewind'); }, 250);
  }, [
    [1100, function () { now.classList.add('in'); }],
    [2000, function () { stamp.classList.add('in'); }],
  ], 5600);

  // 4. The watch ---------------------------------------------------------------------------------------
  var scene = $('watch-scene'), beats = $('watch-beats');
  var faces = scene ? all('.face img', scene) : [];
  var steps = beats ? all('li', beats) : [];
  function show(i) {
    faces.forEach(function (f, k) { f.classList.toggle('on', k === i); });
    steps.forEach(function (s, k) { s.classList.toggle('on', k === i); });
  }
  if (scene && faces.length === 4) {
    var wvis = scene.parentNode;
    loopScene(wvis, function () {
      beats.classList.add('armed');
      show(0);
    }, [
      [1900, function () { show(1); }],
      [3700, function () { show(2); }],
      [5500, function () { show(3); }],
    ], 7800);
  }

  // 5. Send to my gym --------------------------------------------------------------------------------
  var LINK = 'https://gyms.mettleup.fit/?from=member';
  var WORDS = {
    en: {
      text: 'Our gym could use MettleUp. MettleUp is software that runs a gym: it handles memberships and check-ins, and it can also run a shop. Every member also gets a free workout app. Have a look:',
      copied: 'Link copied. Paste it in a chat with your gym owner.',
      manual: 'Press and hold the link above to copy it.',
    },
    hi: {
      text: 'हमारे जिम के लिए MettleUp देखिए। MettleUp एक सॉफ़्टवेयर है जो जिम चलाता है: मेंबरशिप और चेक इन संभालता है, और शॉप भी चला सकता है। हर मेंबर को फ़्री वर्कआउट ऐप भी मिलता है। यहाँ देखिए:',
      copied: 'लिंक कॉपी हो गया। इसे अपने जिम ओनर की चैट में पेस्ट कीजिए।',
      manual: 'ऊपर वाले लिंक को दबाकर रखिए और कॉपी कीजिए।',
    },
  };
  function w() { return WORDS[root.lang === 'hi' ? 'hi' : 'en']; }
  var msg = $('share-msg');
  var wa = $('wa');
  function say(t) { if (msg) msg.textContent = t; }
  if (wa) {
    // The words follow the language at the moment of the tap.
    wa.addEventListener('click', function () { wa.href = 'https://wa.me/?text=' + encodeURIComponent(w().text + ' ' + LINK); });
  }
  function copy() {
    var done = function () { say(w().copied); };
    var fail = function () {
      // No clipboard (an old browser or an in-app browser): select the link so a long-press copies it.
      var link = $('link');
      if (link && window.getSelection) {
        var r = document.createRange();
        r.selectNodeContents(link);
        var sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(r);
      }
      say(w().manual);
    };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(LINK).then(done, fail);
      else fail();
    } catch (e) { fail(); }
  }
  var copyBtn = $('copy');
  if (copyBtn) copyBtn.addEventListener('click', copy);
  var shareBtn = $('share');
  if (shareBtn) {
    shareBtn.addEventListener('click', function () {
      if (navigator.share) {
        navigator.share({ title: 'MettleUp for gyms', text: w().text, url: LINK }).catch(function (e) {
          if (e && e.name === 'AbortError') return; // the member closed the share sheet: nothing to say
          copy();
        });
      } else {
        // No share sheet (most computers): copy the link; the WhatsApp button sits right beside it.
        copy();
      }
    });
  }

  // 6. Header line + phone bottom bar ------------------------------------------------------------------
  var top = $('top'), dock = $('dock'), hero = document.querySelector('.hero'), get = $('get');
  var pastHero = false, atGet = false;
  function dockState() { if (dock) dock.classList.toggle('in', pastHero && !atGet); }
  function onScroll() { if (top) top.classList.toggle('scrolled', window.scrollY > 8); }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
  if ('IntersectionObserver' in window) {
    if (hero) new IntersectionObserver(function (es) { pastHero = !es[0].isIntersecting; dockState(); }, { threshold: 0 }).observe(hero);
    if (get) new IntersectionObserver(function (es) { atGet = es[0].isIntersecting; dockState(); }, { threshold: 0 }).observe(get);
  }
})();
