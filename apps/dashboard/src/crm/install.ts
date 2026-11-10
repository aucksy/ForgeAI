/**
 * Install the panel as an app (14 Oct 2026; Gym Panel step 2). Android Chrome fires
 * `beforeinstallprompt` once the page qualifies (public/manifest.webmanifest + icons); keeping that
 * event lets our own "Phone par app lagao" button open Chrome's install sheet. iPhone Safari has no
 * such event: there the button shows the two taps instead (Share, then "Add to Home Screen").
 *
 * The event can fire before React has drawn anything, so `listenForInstall` runs first thing in
 * main.tsx and keeps it here.
 *
 * R-97 (24 Oct 2026, owner): installing is offered only to someone SIGNED IN. index.html no longer
 * links the manifest, so Chrome never offers "Install" on the sign-in page to a stranger; the
 * manifest link is added from code once a person is signed in (`setInstallOffer(true)` in
 * CrmApp) and taken away again on sign-out. Chrome fires `beforeinstallprompt` after the link
 * appears, and `listenForInstall` (already listening) keeps it as before.
 */

import { useEffect, useState } from 'react';

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: InstallPromptEvent | null = null;
let installedNow = false;
const listeners = new Set<() => void>();

function notify(): void {
  for (const l of listeners) l();
}

export function listenForInstall(): void {
  if (typeof window === 'undefined') return;
  // Chrome's one-tap install sheet needs a service worker (public/sw.js caches nothing). Live site
  // only: a dev server with one would confuse hot reload.
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    void navigator.serviceWorker.register('/sw.js').catch((e: unknown) => console.warn('service worker', e));
  }
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    installedNow = true;
    deferred = null;
    notify();
  });
}

export const MANIFEST_HREF = '/manifest.webmanifest';

/** The small part of `document` this needs (a fake one in tests). */
export interface ManifestDoc {
  head: { appendChild: (el: ManifestLink) => unknown };
  querySelector: (sel: string) => ManifestLink | null;
  createElement: (tag: 'link') => ManifestLink;
}
export interface ManifestLink {
  rel: string;
  href: string;
  remove: () => void;
}

/**
 * Offer "Install the admin app" (on = signed in) or stop offering it (signed out). Adds or removes
 * the one <link rel="manifest">; calling it twice changes nothing.
 */
export function setInstallOffer(on: boolean, doc: ManifestDoc | null = typeof document !== 'undefined' ? (document as unknown as ManifestDoc) : null): void {
  if (!doc) return;
  const have = doc.querySelector('link[rel="manifest"]');
  if (on && !have) {
    const link = doc.createElement('link');
    link.rel = 'manifest';
    link.href = MANIFEST_HREF;
    doc.head.appendChild(link);
  } else if (!on && have) {
    have.remove();
    deferred = null; // an offer Chrome made while signed in is not used after sign-out
    notify();
  }
}

export type Platform = 'android' | 'iphone' | 'computer';

/** Which install steps to show. PURE. */
export function platformOf(userAgent: string, touchPoints = 0): Platform {
  const ua = userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) return 'iphone';
  // iPadOS 13+ says it is a Mac; a Mac has no touch screen.
  if (ua.includes('macintosh') && touchPoints > 1) return 'iphone';
  if (ua.includes('android')) return 'android';
  return 'computer';
}

/**
 * The taps to install by hand, one short step each (R-446, owner 10 Nov 2026: on his iPhone the old
 * one-line hint named a Share square that iOS 26 Safari hides behind "•••", and the line was easy to miss).
 * iPhone Safari (iOS 26 default "Compact" bar): ••• -> Share -> Add to Home Screen. iPhone Chrome/Edge/Firefox
 * keep a Share icon in the address bar. PURE.
 */
export function installSteps(platform: Platform, userAgent: string): string[] {
  const ua = userAgent.toLowerCase();
  if (platform === 'iphone') {
    // R-446 fresh-eyes (10 Nov 2026): one step for "••• then Share" (a separate "Tap Share" step read as wrong to
    // someone who had tapped the Share square directly); no "at the bottom" (Safari's bar can sit at the top);
    // "Open as Web App" is iOS 26 only, so it is conditional.
    const otherBrowser = /crios|edgios|fxios/.test(ua);
    return [
      otherBrowser
        ? 'Tap the Share icon (a square with an arrow up) in the address bar.'
        : 'In Safari’s address bar, tap the 3 dots •••, then tap “Share”. (If you see a square with an arrow up there, tap that instead.)',
      'Scroll down the list. Tap “Add to Home Screen”.',
      'If you see “Open as Web App”, keep it on. Tap “Add”.',
      'Open MettleUp Admin from your home screen. Sign in once more there. (iPhone keeps it apart from Safari.)',
    ];
  }
  if (platform === 'android') {
    return ['In Chrome, tap ⋮ at the top right.', 'Tap “Add to Home screen” or “Install app”.', 'Tap “Install”.'];
  }
  return ['In Chrome or Edge, click the install icon at the right end of the address bar.', 'Click “Install”.'];
}

/** Opened from the home-screen icon (already installed). */
export function runningAsApp(): boolean {
  try {
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true
    );
  } catch {
    return false;
  }
}

export interface InstallState {
  /** Opened as the installed app, or installed in this visit. */
  installed: boolean;
  /** Chrome's own install sheet can be opened from our button. */
  canPrompt: boolean;
  platform: Platform;
  /** Opens Chrome's install sheet. Resolves true when the person tapped Install. */
  prompt: () => Promise<boolean>;
}

export function useInstall(): InstallState {
  const [, setTick] = useState(0);
  useEffect(() => {
    const l = () => setTick((n) => n + 1);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  return {
    installed: installedNow || runningAsApp(),
    canPrompt: deferred !== null,
    platform: platformOf(
      typeof navigator !== 'undefined' ? navigator.userAgent : '',
      typeof navigator !== 'undefined' ? navigator.maxTouchPoints : 0,
    ),
    prompt: async () => {
      const e = deferred;
      if (!e) return false;
      deferred = null; // Chrome lets each event open the sheet once.
      await e.prompt();
      const choice = await e.userChoice;
      notify();
      return choice.outcome === 'accepted';
    },
  };
}
