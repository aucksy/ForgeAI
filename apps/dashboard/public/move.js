// MettleUp (R-105): the last step of moving a desk from forgeai.aakashpahuja.in to app.mettleup.fit.
// The old address's admin app posts this device's sign-in to /api/move (deploy/panel/hosts.js), and
// the answer is a small page with the keys in a <meta> tag and this script. It writes them into this
// address's own storage, then opens the admin app. Only the allowed keys are written, and never over
// a sign-in this address already has (the desk may have signed in here already).
(function () {
  var KEYS = ['forgeai.cloudGym.v1', 'forgeai.branchKeys.v1', 'forgeai.theme.v1'];
  function meta(name) {
    var el = document.querySelector('meta[name="' + name + '"]');
    return el ? el.getAttribute('content') || '' : '';
  }
  function decode(b64url) {
    var b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    var bin = atob(b64);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }
  var to = meta('mettleup-to');
  if (!/^\/(?![\/\\])/.test(to)) to = '/';
  try {
    var raw = meta('mettleup-move');
    if (raw) {
      var keys = JSON.parse(decode(raw));
      // A sign-in already here wins: the whole set is skipped, so keys of two gyms never mix.
      var signedInHere = localStorage.getItem(KEYS[0]) !== null;
      for (var k = 0; k < KEYS.length; k++) {
        var key = KEYS[k];
        var value = keys && typeof keys[key] === 'string' ? keys[key] : null;
        if (value === null || localStorage.getItem(key) !== null) continue;
        if (signedInHere && key !== 'forgeai.theme.v1') continue;
        localStorage.setItem(key, value);
      }
      sessionStorage.setItem('mettleup.moved', '1');
    }
  } catch (e) {
    // Storage blocked or a broken hand-over: the desk signs in again here, nothing else is lost.
    console.warn('[move] sign-in not carried over', e);
  }
  location.replace(to);
})();
