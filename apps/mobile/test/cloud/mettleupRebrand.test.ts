/**
 * MettleUp (owner R-105, 24 Oct 2026): the member app's new name, Play ID and addresses. The old
 * address (forgeai.aakashpahuja.in) and the old link scheme (forgeai://) keep working for good:
 * printed posters, old messages and old phones still reach the app and the gym server.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { activeProxy, FALLBACK_MS, PROBE_PATH, proxyList, resetAddressSwitch, routedFetch, STAMP, usingDirect, viaOurAddress } from '@/cloud/address';
import { FEEDBACK_URLS, postToBox, tryNextBox } from '@/lib/feedback';
import { isExportFile, isPrivateCacheEntry } from '@/onboarding/eraseDevice';
import { joinCodeFromTyped } from '@/shop/gym';
import { checkInCodeFromUrl } from '@/shop/checkIn';
import { INVITE_HOST, INVITE_HOSTS, inviteCodeFromUrl, isInviteHost } from '@/shop/pendingInvite';
import { wordmark } from '@/tracker/share/brand';

const ROOT = join(__dirname, '..', '..');
const read = (p: string): string => readFileSync(join(ROOT, p), 'utf8');

const DIRECT = 'https://hdxzqbdiokjklnypfisq.supabase.co';
const NEW = 'https://app.mettleup.fit/sb';
const OLD = 'https://forgeai.aakashpahuja.in/sb';
const LIST = [NEW, OLD];
const served = (status = 200) => new Response('[]', { status, headers: { [STAMP]: '1' } });
const flush = async (): Promise<void> => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

describe('the app is MettleUp, with its permanent Play ID', () => {
  const app = JSON.parse(read('app.json')) as { expo: Record<string, unknown> & { android: { package: string }; extra: Record<string, unknown> } };

  it('app.json: name, Play ID, the new link scheme first and the old one kept', () => {
    expect(app.expo.name).toBe('MettleUp');
    expect(app.expo.android.package).toBe('com.mettleup.app');
    expect(app.expo.scheme).toEqual(['mettleup', 'forgeai']);
    expect(app.expo.extra.supabaseProxyUrl).toBe(NEW);
    expect(app.expo.extra.supabaseProxyFallbackUrls).toEqual([OLD]);
  });

  it('the committed Android project builds the phone and the watch as com.mettleup.app', () => {
    expect(read('android/app/build.gradle')).toMatch(/applicationId 'com\.mettleup\.app'/);
    // The watch MUST carry the phone's id, or the Data Layer never pairs them.
    expect(read('android/wear/build.gradle')).toMatch(/applicationId 'com\.mettleup\.app'/);
    expect(read('android/app/src/main/res/values/strings.xml')).toMatch(/<string name="app_name">MettleUp<\/string>/);
    expect(read('android/wear/src/main/res/values/strings.xml')).toMatch(/<string name="app_name">MettleUp<\/string>/);
  });

  it('the manifest opens mettleup:// and forgeai:// links, and both hosts\' gym links', () => {
    const xml = read('android/app/src/main/AndroidManifest.xml');
    expect(xml).toMatch(/<data android:scheme="mettleup"\/>/);
    expect(xml).toMatch(/<data android:scheme="forgeai"\/>/);
    for (const host of ['app\\.mettleup\\.fit', 'forgeai\\.aakashpahuja\\.in']) {
      for (const path of ['j', 'c']) {
        expect(xml).toMatch(new RegExp(`android:host="${host}" android:pathPrefix="/${path}/"`));
      }
    }
  });

  it('no member-facing "ForgeAI" is left in the Android strings, widgets or the watch', () => {
    for (const f of [
      'android/app/src/main/res/values/strings.xml',
      'android/wear/src/main/res/values/strings.xml',
      'modules/forge-phone/android/src/main/res/values/strings.xml',
      'modules/forge-phone/android/src/main/res/layout/forge_widget_today.xml',
      'modules/forge-phone/android/src/main/res/layout/forge_widget_week.xml',
    ]) {
      const text = read(f).replace(/<!--[\s\S]*?-->/g, '');
      expect(text, f).not.toMatch(/ForgeAI/);
    }
  });
});

describe('gym links: the new host first, the old one read for good', () => {
  it('both hosts and both schemes give the gym code', () => {
    expect(INVITE_HOST).toBe('app.mettleup.fit');
    expect(INVITE_HOSTS).toEqual(['app.mettleup.fit', 'forgeai.aakashpahuja.in']);
    expect(inviteCodeFromUrl('https://app.mettleup.fit/j/rams01')).toBe('RAMS01');
    expect(inviteCodeFromUrl('https://forgeai.aakashpahuja.in/j/RAMS01')).toBe('RAMS01');
    expect(inviteCodeFromUrl('mettleup://j/RAMS01')).toBe('RAMS01');
    expect(inviteCodeFromUrl('forgeai://j/RAMS01')).toBe('RAMS01');
    expect(checkInCodeFromUrl('https://www.app.mettleup.fit:443/c/RAMS01')).toBe('RAMS01');
    expect(checkInCodeFromUrl('mettleup://c/RAMS01')).toBe('RAMS01');
    expect(checkInCodeFromUrl('forgeai://c/RAMS01')).toBe('RAMS01');
  });

  it('look-alikes and the marketed site are not gym links', () => {
    expect(isInviteHost('mettleup.fit')).toBe(false);
    expect(isInviteHost('app.mettleup.fit.evil.example')).toBe(false);
    expect(inviteCodeFromUrl('https://app.mettleup.fit.evil.example/j/RAMS01')).toBeNull();
    expect(inviteCodeFromUrl('otherapp://j/RAMS01')).toBeNull();
  });

  it('a WhatsApp message with either link, with or without https://, fills the code box', () => {
    expect(joinCodeFromTyped('Join us on MettleUp: app.mettleup.fit/j/rams01 see you')).toBe('RAMS01');
    expect(joinCodeFromTyped('www.app.mettleup.fit/j/RAMS01')).toBe('RAMS01');
    expect(joinCodeFromTyped('forgeai.aakashpahuja.in/j/RAMS01')).toBe('RAMS01');
  });
});

describe('the block-proof address list: new, then old, then Supabase\'s own', () => {
  beforeEach(() => resetAddressSwitch());

  it('app.json order, blanks and repeats left out', () => {
    expect(proxyList(NEW, [OLD])).toEqual(LIST);
    expect(proxyList(`${NEW}/`, [NEW, '', OLD, 7])).toEqual(LIST);
    expect(proxyList('', undefined)).toEqual([]);
    expect(proxyList(undefined, [OLD])).toEqual([OLD]);
  });

  it('a new address not live yet costs no request: the old one serves while a test call fails quietly', async () => {
    let t = 1_000;
    const calls: string[] = [];
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const base = vi.fn(async (input: RequestInfo | URL) => {
      const u = String(input);
      calls.push(u);
      if (u.startsWith(NEW)) throw new TypeError('Network request failed'); // no DNS yet
      return served();
    });
    const f = routedFetch(LIST, DIRECT, base as unknown as typeof fetch, () => t);
    const res = await f(`${NEW}/rest/v1/rpc/member_check_in`, { method: 'POST' });
    expect(res.status).toBe(200);
    await flush();
    expect(calls).toEqual([`${NEW}${PROBE_PATH}`, `${OLD}/rest/v1/rpc/member_check_in`]);
    expect(calls.filter((c) => c.endsWith('member_check_in'))).toHaveLength(1); // never twice
    // The next request does not test again within 10 minutes.
    await f(`${NEW}/rest/v1/rpc/member_me`, { method: 'POST' });
    await flush();
    expect(calls.slice(2)).toEqual([`${OLD}/rest/v1/rpc/member_me`]);
    t += FALLBACK_MS + 1;
    await f(`${NEW}/rest/v1/rpc/member_me`, { method: 'POST' });
    await flush();
    expect(calls.slice(3)).toEqual([`${NEW}${PROBE_PATH}`, `${OLD}/rest/v1/rpc/member_me`]);
    expect(usingDirect(t)).toBe(false);
    log.mockRestore();
  });

  it('once the test call comes back from the gym server, the new address is used', async () => {
    const t = 1_000;
    const calls: string[] = [];
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const base = vi.fn(async (input: RequestInfo | URL) => {
      calls.push(String(input));
      return served(String(input).endsWith(PROBE_PATH) ? 401 : 200); // health without a key: 401, stamped
    });
    const f = routedFetch(LIST, DIRECT, base as unknown as typeof fetch, () => t);
    await f(`${NEW}/rest/v1/rpc/member_me`, { method: 'POST' });
    await flush();
    expect(activeProxy(LIST, t)).toBe(NEW);
    await f(`${NEW}/rest/v1/rpc/member_me`, { method: 'POST' });
    expect(calls).toEqual([`${NEW}${PROBE_PATH}`, `${OLD}/rest/v1/rpc/member_me`, `${NEW}/rest/v1/rpc/member_me`]);
    log.mockRestore();
  });

  it('a test answer without the gym server\'s stamp (a host with no Worker yet) does not count', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const base = vi.fn(async (input: RequestInfo | URL) => (String(input).endsWith(PROBE_PATH) ? new Response('Not found', { status: 404 }) : served()));
    const f = routedFetch(LIST, DIRECT, base as unknown as typeof fetch, () => 1_000);
    await f(`${NEW}/rest/v1/x`);
    await flush();
    expect(activeProxy(LIST, 1_000)).toBe(OLD);
    log.mockRestore();
  });

  it('the proven new address failing hands over to the old one, then Supabase\'s own', async () => {
    let t = 1_000;
    const calls: string[] = [];
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    let down = false;
    const base = vi.fn(async (input: RequestInfo | URL) => {
      const u = String(input);
      calls.push(u);
      if (down && !u.startsWith(DIRECT)) throw new TypeError('Network request failed');
      return served();
    });
    const f = routedFetch(LIST, DIRECT, base as unknown as typeof fetch, () => t);
    await f(`${NEW}/rest/v1/a`);
    await flush();
    expect(activeProxy(LIST, t)).toBe(NEW);
    down = true;
    await expect(f(`${NEW}/rest/v1/b`)).rejects.toThrow();
    expect(activeProxy(LIST, t)).toBe(OLD);
    await expect(f(`${NEW}/rest/v1/c`)).rejects.toThrow();
    expect(usingDirect(t)).toBe(true);
    await f(`${NEW}/rest/v1/d`);
    expect(calls.at(-1)).toBe(`${DIRECT}/rest/v1/d`);
    t += FALLBACK_MS + 1;
    expect(activeProxy(LIST, t)).toBe(NEW); // still proven: back to the new one after its rest
    warn.mockRestore();
    log.mockRestore();
  });

  it('pictures load through the address of ours in use now', () => {
    const logo = `${DIRECT}/storage/v1/object/public/gym-logos/a/logo.png`;
    routedFetch(LIST, DIRECT, (async () => served()) as unknown as typeof fetch);
    expect(viaOurAddress(logo, DIRECT, LIST)).toBe(`${OLD}/storage/v1/object/public/gym-logos/a/logo.png`);
    expect(viaOurAddress(logo, DIRECT, [])).toBe(logo);
  });
});

describe('Send feedback: the new box address first, the old one when it gives no answer', () => {
  it('order, and which answers try the next address', () => {
    expect(FEEDBACK_URLS).toEqual(['https://app.mettleup.fit/api/feedback', 'https://forgeai.aakashpahuja.in/api/feedback']);
    expect(tryNextBox(404)).toBe(true);
    expect(tryNextBox(502)).toBe(true);
    expect(tryNextBox(201)).toBe(false);
    expect(tryNextBox(429)).toBe(false); // the box's own "too many today"
  });

  it('no answer from the new address: sent once to the old one', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const sent: string[] = [];
    const post = vi.fn(async (url: string) => {
      sent.push(url);
      if (url.includes('mettleup')) throw new TypeError('Network request failed');
      return new Response('{"ok":true}', { status: 201 });
    });
    const res = await postToBox('{}', post as never);
    expect(res.status).toBe(201);
    expect(sent).toEqual([...FEEDBACK_URLS]);
    warn.mockRestore();
  });

  it('a real answer from the new address is the answer; the old one is not asked', async () => {
    const sent: string[] = [];
    const post = vi.fn(async (url: string) => {
      sent.push(url);
      return new Response('{"ok":true}', { status: 201 });
    });
    expect((await postToBox('{}', post as never)).status).toBe(201);
    expect(sent).toEqual([FEEDBACK_URLS[0]]);
  });
});

describe('what members see with the new name', () => {
  it('share pictures carry METTLEUP ("UP" in the brand ember)', () => {
    const texts = wordmark(0, 0, 56).nodes.filter((n) => n.t === 'text').map((n) => (n as { text: string }).text);
    expect(texts).toEqual(['METTLE', 'UP']);
  });

  it('"Erase all data" still finds files saved under either name', () => {
    expect(isExportFile('mettleup-history-2026-10-24.csv')).toBe(true);
    expect(isExportFile('forgeai-history-2026-10-01.csv')).toBe(true);
    expect(isPrivateCacheEntry('mettleup-data-2026-10-24-0905.db')).toBe(true);
    expect(isPrivateCacheEntry('mettleup-workout-2026-10-24.png')).toBe(true);
  });

  it('[source-text check] Drive backup uses a "MettleUp" folder, or the old "ForgeAI" one if it exists', () => {
    const drive = read('src/cloud/drive.ts');
    expect(drive).toMatch(/const FOLDER_NAME = 'MettleUp';/);
    expect(drive).toMatch(/\(name = '\$\{FOLDER_NAME\}' or name = '\$\{OLD_FOLDER_NAME\}'\)/);
  });
});
