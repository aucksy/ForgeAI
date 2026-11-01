// The member page's only script (F184, owner R-242, 31 Oct 2026). A separate file because the site's
// security policy runs no inline script. Four jobs:
//  1. English / Hindi (kept per browser; the same switch as the gym page, public/home/home.js);
//  2. "Get the app" on a phone that is not Android says so (the app is Android only for now);
//  3. the "Beaten" stamp lands once when the scorecard is seen (the page's one moving moment);
//  4. "Send to my gym": the phone's share sheet, else WhatsApp / copy the link. The link opens the gym
//     page with ?from=member, which its demo form saves as the lead's source (deploy/panel/leads.js).
(function () {
  var root = document.documentElement;
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  function store(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* quiet: private window; the choice just isn't kept */ } }
  function read(k) { try { return localStorage.getItem(k); } catch (e) { return null; /* quiet: private window */ } }

  // 1. Language --------------------------------------------------------------------------------
  var LANG = 'mettleup.site.lang';
  var btn = document.getElementById('lang');
  var swaps = [
    ['[data-hi]', function (n) { return n.innerHTML; }, function (n, v) { n.innerHTML = v; }, 'data-hi'],
    ['[data-hi-alt]', function (n) { return n.getAttribute('alt'); }, function (n, v) { n.setAttribute('alt', v); }, 'data-hi-alt'],
    ['[data-hi-label]', function (n) { return n.getAttribute('aria-label'); }, function (n, v) { n.setAttribute('aria-label', v); }, 'data-hi-label'],
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
  }
  btn.addEventListener('click', function () { setLang(root.lang === 'hi' ? 'en' : 'hi'); });
  if (read(LANG) === 'hi') setLang('hi');

  // 2. Not an Android phone: say so beside each download button ----------------------------------
  var ua = navigator.userAgent || '';
  var phoneNotAndroid = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  if (phoneNotAndroid) {
    Array.prototype.forEach.call(document.querySelectorAll('.cta-note.android'), function (n) { n.hidden = false; });
  }

  // 3. The "Beaten" stamp --------------------------------------------------------------------------
  var score = document.getElementById('score');
  if (score && !reduce && 'IntersectionObserver' in window) {
    score.classList.add('armed');
    var seen = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (e.isIntersecting) { score.classList.add('in'); seen.disconnect(); }
      });
    }, { threshold: 0.6 });
    seen.observe(score);
  }

  // 4. Send to my gym --------------------------------------------------------------------------------
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
  var msg = document.getElementById('share-msg');
  var wa = document.getElementById('wa');
  function say(t) { if (msg) msg.textContent = t; }
  function waHref() { return 'https://wa.me/?text=' + encodeURIComponent(w().text + ' ' + LINK); }
  if (wa) {
    // The words follow the language at the moment of the tap.
    wa.addEventListener('click', function () { wa.href = waHref(); });
  }
  function copy() {
    var done = function () { say(w().copied); };
    var fail = function () {
      // No clipboard (an old browser or an in-app browser): select the link so a long-press copies it.
      var link = document.getElementById('link');
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
  var copyBtn = document.getElementById('copy');
  if (copyBtn) copyBtn.addEventListener('click', copy);
  var shareBtn = document.getElementById('share');
  if (shareBtn) {
    shareBtn.addEventListener('click', function () {
      if (navigator.share) {
        navigator.share({ title: 'MettleUp for gyms', text: w().text, url: LINK }).catch(function (e) {
          if (e && e.name === 'AbortError') return; // the member closed the share sheet: nothing to say
          copy();
        });
      } else {
        // No share sheet (most computers): copy the link; the WhatsApp button sits right below.
        copy();
      }
    });
  }
})();
