/**
 * The demo gym's second lock (R-119): the page's own network calls. The first lock is in
 * lib/supabase.ts (every gym-server call is refused). This one covers anything that goes around it:
 * `fetch`, XHR and beacons may only READ this site's own files, never /sb (the gym server), /api, or
 * any other site. The browser's own storage is shut too: whatever the demo's screens remember (the
 * "Get started" ticks, the quick buttons, the WhatsApp queue) is kept in the page's memory only, and the
 * keys that hold a signed-in gym read as empty. Only the dark | light choice reaches the device.
 * PURE `allowedInDemo` and `isHiddenFromDemo`; `installDemoLockdown` is called once, by main.tsx, with the lock.
 */

import { DEMO_LOCKED_WORDS } from '../../lib/demoLock';
import { THEME_KEY } from '../../theme';

/** May the demo's page make this request? Only a GET/HEAD for one of this site's own files. PURE. */
export function allowedInDemo(url: string, method: string, pageOrigin: string): boolean {
  let u: URL;
  try {
    u = new URL(url, pageOrigin);
  } catch {
    return false;
  }
  if (u.origin !== pageOrigin) return false;
  if (!/^(GET|HEAD)$/i.test(method)) return false;
  return !/^\/(sb|api)(\/|$)/.test(u.pathname);
}

/** The device's keys the demo must never see: a signed-in gym, its branch keys, its saved records. PURE. */
export function isHiddenFromDemo(key: string): boolean {
  return key === 'forgeai.cloudGym.v1' || key === 'forgeai.branchKeys.v1' || key === 'mettleup.askPin.v1' || key.startsWith('forgeai-crm-v1');
}

function urlOf(input: RequestInfo | URL): string {
  return typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
}

export function installDemoLockdown(): void {
  const origin = window.location.origin;
  const realFetch = window.fetch.bind(window);
  window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const method = init?.method ?? (typeof input === 'object' && 'method' in input ? input.method : 'GET');
    if (!allowedInDemo(urlOf(input), method, origin)) {
      console.warn('[demo] a request was refused:', urlOf(input));
      return Promise.reject(new TypeError(DEMO_LOCKED_WORDS));
    }
    return realFetch(input, init);
  }) as typeof fetch;

  const realOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (this: XMLHttpRequest, method: string, url: string | URL, ...rest: unknown[]) {
    if (!allowedInDemo(String(url), method, origin)) {
      console.warn('[demo] a request was refused:', String(url));
      throw new TypeError(DEMO_LOCKED_WORDS);
    }
    return (realOpen as (...a: unknown[]) => void).call(this, method, url, ...rest);
  } as typeof XMLHttpRequest.prototype.open;

  // Storage: reads come from the page's memory first; writes stay there (but the theme choice).
  const memory = new Map<string, string>();
  const proto = Storage.prototype;
  const { getItem, setItem, removeItem, clear } = proto;
  const mine = (self: Storage) => self === window.localStorage;
  proto.getItem = function (this: Storage, key: string) {
    if (!mine(this)) return getItem.call(this, key);
    if (memory.has(key)) return memory.get(key) ?? null;
    return isHiddenFromDemo(key) ? null : getItem.call(this, key);
  };
  proto.setItem = function (this: Storage, key: string, value: string) {
    if (!mine(this) || key === THEME_KEY) return setItem.call(this, key, value);
    memory.set(key, String(value));
  };
  proto.removeItem = function (this: Storage, key: string) {
    if (!mine(this) || key === THEME_KEY) return removeItem.call(this, key);
    memory.delete(key);
  };
  proto.clear = function (this: Storage) {
    if (!mine(this)) return clear.call(this);
    memory.clear();
  };

  if (typeof navigator.sendBeacon === 'function') navigator.sendBeacon = () => false;
}
