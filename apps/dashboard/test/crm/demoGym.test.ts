/**
 * The demo gym (R-119, 24 Oct 2026): app.mettleup.fit/demo opens made-up data and never touches the
 * gym a device is signed in to. Owner: "'Open Demo GYM' is opening the latest GYM I created."
 */
import { describe, expect, it, vi } from 'vitest';

import { allowedInDemo } from '../../src/crm/demo/lockdown';
import { demoNeedsRealGym } from '../../src/crm/demo/demoMode';
import { LocalCrmData, memoryStore } from '../../src/crm/data/local';
import { demoSnapshot } from '../../src/crm/data/demo';
import { CLOUD_GYM_KEY, clearCloudGym, readCloudGym, writeCloudGym } from '../../src/crm/shop/cloudGym';
import { activeNavPath } from '../../src/crm/ui/AppShell';
import { isDemoAddress, isDemoLocked, lockForDemo } from '../../src/lib/demoLock';

describe('the demo address', () => {
  it('is /demo on any host, or the older ?demo=1; nothing else', () => {
    expect(isDemoAddress('/demo', '')).toBe(true);
    expect(isDemoAddress('/demo/', '')).toBe(true);
    expect(isDemoAddress('/', '?demo=1')).toBe(true);
    expect(isDemoAddress('/', '?x=1&demo=1')).toBe(true);
    expect(isDemoAddress('/', '')).toBe(false);
    expect(isDemoAddress('/start', '')).toBe(false);
    expect(isDemoAddress('/demos', '')).toBe(false);
    expect(isDemoAddress('/j/ABC123', '?demo=1')).toBe(false);
  });
});

describe('what the demo page may ask the network for', () => {
  const origin = 'https://app.mettleup.fit';
  it('only reads this site’s own files', () => {
    expect(allowedInDemo('/assets/index-abc.js', 'GET', origin)).toBe(true);
    expect(allowedInDemo('/manifest.webmanifest', 'GET', origin)).toBe(true);
  });
  it('never the gym server, the Worker’s API, another site, or a write', () => {
    expect(allowedInDemo('/sb/rest/v1/rpc/crm_push', 'POST', origin)).toBe(false);
    expect(allowedInDemo('/sb/rest/v1/rpc/owner_gym', 'GET', origin)).toBe(false);
    expect(allowedInDemo('/api/feedback', 'GET', origin)).toBe(false);
    expect(allowedInDemo('https://hdxzqbdiokjklnypfisq.supabase.co/rest/v1/x', 'GET', origin)).toBe(false);
    expect(allowedInDemo('/assets/x.js', 'POST', origin)).toBe(false);
  });
});

describe('pages that need a real gym', () => {
  it('say what they do, instead of a form that could not work', () => {
    expect(demoNeedsRealGym('settings', 'branding')?.title).toBe('Branding');
    expect(demoNeedsRealGym('messages', undefined)?.title).toBe('Messages & offers');
    expect(demoNeedsRealGym('settings', undefined)?.title).toBe('Settings');
    expect(demoNeedsRealGym('shop', undefined)?.title).toBe('The shop');
    expect(demoNeedsRealGym('members', 'import')?.title).toBe('Importing members');
  });
  it('leave the desk work to the demo', () => {
    for (const head of [undefined, 'members', 'money', 'attendance', 'plans', 'enquiries', 'expenses', 'receipts', 'more']) {
      expect(demoNeedsRealGym(head, undefined)).toBeNull();
    }
    expect(demoNeedsRealGym('members', 'mem_1')).toBeNull();
  });
});

describe('the demo’s records', () => {
  it('live in memory only: a second demo starts again from the sample gym', async () => {
    const make = () => new LocalCrmData({ store: memoryStore(), seed: () => demoSnapshot('2026-10-17') });
    const a = make();
    const first = await a.load();
    expect(first.members.length).toBeGreaterThan(100);
    await a.updateGym({ name: 'Changed in the demo' });
    expect((await a.load()).gym.name).toBe('Changed in the demo');
    expect((await make().load()).gym.name).not.toBe('Changed in the demo');
  });
});

describe('the sidebar and More: Branding has its own place', () => {
  const nav = ['/branches', '/', '/members', '/shop', '/messages', '/attendance', '/money', '/plans', '/settings/branding', '/settings', '/more'];
  it('lights Branding on its page and Settings on the rest of Settings', () => {
    expect(activeNavPath(nav, '/settings/branding')).toBe('/settings/branding');
    expect(activeNavPath(nav, '/settings')).toBe('/settings');
    expect(activeNavPath(nav, '/settings/people')).toBe('/settings');
    expect(activeNavPath(nav, '/')).toBe('/');
    expect(activeNavPath(nav, '/members/mem_1')).toBe('/members');
    expect(activeNavPath(nav, '/messages/offer')).toBe('/messages');
    expect(activeNavPath(nav, '/receipts/p1')).toBe('/receipts');
  });
});

describe('once the page is locked for the demo, a signed-in gym is out of reach', () => {
  it('cannot be read, replaced or signed out', () => {
    const real = { gymId: 'g-real', ownerKey: 'k'.repeat(24), joinCode: 'ABC123', name: 'My real gym', demo: false, online: true };
    const store = memoryStore();
    store.setItem(CLOUD_GYM_KEY, JSON.stringify(real));
    vi.stubGlobal('localStorage', store);
    expect(readCloudGym()?.name).toBe('My real gym');
    expect(isDemoLocked()).toBe(false);

    lockForDemo();
    expect(isDemoLocked()).toBe(true);
    expect(readCloudGym()).toBeNull();
    writeCloudGym({ ...real, name: 'Overwritten' });
    clearCloudGym();
    expect(JSON.parse(store.getItem(CLOUD_GYM_KEY) ?? 'null').name).toBe('My real gym');
    vi.unstubAllGlobals();
  });
});
