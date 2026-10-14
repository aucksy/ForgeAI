/**
 * Install the panel as an app (14 Oct 2026; Gym Panel step 2). Android Chrome fires
 * `beforeinstallprompt` once the page qualifies (public/manifest.webmanifest + icons); keeping that
 * event lets our own "Phone par app lagao" button open Chrome's install sheet. iPhone Safari has no
 * such event: there the button shows the two taps instead (Share, then "Add to Home Screen").
 *
 * The event can fire before React has drawn anything, so `listenForInstall` runs first thing in
 * main.tsx and keeps it here.
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
