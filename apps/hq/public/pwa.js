// MettleUp HQ: "install on the phone" parts. Plain static script (no build). Nothing here reads or
// stores any HQ data: it registers the tiny service worker (sw.js), runs the "Install app" button
// and the phone menu button.

/** How to offer the install, from what the browser says. PURE. -> 'installed' | 'ios' | 'prompt' | 'none' */
export function installMode({ standalone, iosStandalone, userAgent, platform, touchPoints, hasPrompt }) {
  if (standalone || iosStandalone) return 'installed';
  const ios = /iphone|ipad|ipod/i.test(userAgent || '') || (platform === 'MacIntel' && touchPoints > 1);
  if (ios) return 'ios';
  return hasPrompt ? 'prompt' : 'none';
}

export const IOS_HINT = 'Tap Share, then Add to Home Screen.';

function setup() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch((e) => console.warn('[hq] service worker not registered', e));
  }

  const button = document.getElementById('install');
  const hint = document.getElementById('install-hint');
  let promptEvent = null;
  const state = () => ({
    standalone: window.matchMedia('(display-mode: standalone)').matches,
    iosStandalone: navigator.standalone === true,
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    touchPoints: navigator.maxTouchPoints || 0,
    hasPrompt: promptEvent !== null,
  });
  const refresh = () => {
    if (!button) return;
    const mode = installMode(state());
    button.hidden = mode === 'installed' || mode === 'none';
    if (button.hidden && hint) hint.hidden = true;
  };
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    promptEvent = e;
    refresh();
  });
  window.addEventListener('appinstalled', () => {
    promptEvent = null;
    refresh();
  });
  if (button) {
    button.addEventListener('click', async () => {
      const mode = installMode(state());
      if (mode === 'ios') {
        if (hint) {
          hint.textContent = IOS_HINT;
          hint.hidden = !hint.hidden;
        }
        return;
      }
      if (mode !== 'prompt' || !promptEvent) return;
      const e = promptEvent;
      promptEvent = null;
      try {
        await e.prompt();
        await e.userChoice;
      } catch (err) {
        console.warn('[hq] install prompt failed', err);
      }
      refresh();
    });
  }
  refresh();

  // The phone menu: the page links fold away behind one button on a narrow screen (style.css).
  const toggle = document.getElementById('menu-toggle');
  const top = document.querySelector('.top');
  if (toggle && top) {
    const close = () => {
      top.classList.remove('open');
      toggle.setAttribute('aria-expanded', 'false');
    };
    toggle.addEventListener('click', () => {
      const open = top.classList.toggle('open');
      toggle.setAttribute('aria-expanded', String(open));
    });
    document.querySelector('nav')?.addEventListener('click', close);
    window.addEventListener('hashchange', close);
  }
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') setup();
