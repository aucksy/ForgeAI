// F198 (R-389): new-feature dots in the admin app (logic/newDots.ts). Fixed clocks; TZ is Asia/Kolkata (vitest.config.ts).
import { describe, expect, it } from 'vitest';

import { canOpen } from '../../src/crm/auth/permissions';
import {
  DOTS_SEEN_KEY,
  DOT_DAYS,
  MAX_DOTS,
  SETTINGS_SPOTS,
  barLit,
  cleanPath,
  dotFeatures,
  featuresAt,
  linkFor,
  linkLit,
  liveFrom,
  reachable,
  readSeen,
  saveSeen,
  settingsRowLit,
  settingsTabLit,
  unseen,
} from '../../src/crm/logic/newDots';
import { ADMIN_NEWS, type AdminNewsEntry, type NewsStore } from '../../src/crm/logic/whatsNew';

const at = (iso: string) => new Date(iso).getTime();

// The admin sidebar of an owner (CrmApp.tsx), the phone bar and the More rows (More.tsx).
const SIDEBAR = ['/', '/members', '/shop', '/messages', '/attendance', '/money', '/growth', '/plans', '/enquiries', '/expenses',
  '/workouts', '/diet', '/challenges', '/settings/branding', '/settings/timings', '/settings', '/feedback'];
const BAR = ['/', '/members', '/money', '/attendance', '/more'];
const MORE = ['/growth', '/plans', '/enquiries', '/expenses', '/workouts', '/diet', '/shop', '/messages', '/settings/branding',
  '/settings/timings', '/challenges', '/settings/people', '/settings/invite', '/settings', '/news', '/feedback'];

const LOG: AdminNewsEntry[] = [
  { id: '2026-11-07', lines: [{ text: 'A fix.', go: { label: 'Open Branding', path: '/settings/branding' } }] },
  {
    id: '2026-11-06',
    lines: [
      { text: 'Icon preview.', go: { label: 'Open Branding', path: '/settings/branding' }, feature: true },
      { text: 'Pay MettleUp.', go: { label: 'Open Pay MettleUp', path: '/settings/mettleup' }, feature: true },
    ],
  },
  {
    id: '2026-11-05',
    lines: [
      { text: 'Pass members.', go: { label: 'Open Members', path: '/members' }, feature: true },
      { text: 'Bring a friend.', go: { label: 'Open Settings', path: '/settings/app' }, feature: true },
      { text: 'A feature with no button.', feature: true },
      { text: 'Small fixes.' },
    ],
  },
];

function store(seed: Record<string, string> = {}): NewsStore & { map: Map<string, string> } {
  const map = new Map(Object.entries(seed));
  return { map, getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v) };
}

describe('the trail from a path', () => {
  const pay = dotFeatures(at('2026-11-07T12:00:00+05:30'), LOG).filter((f) => f.path === '/settings/mettleup');

  it('Pay MettleUp: Settings in the menu, More then Settings on a phone, the Gym tab and its row, the heading', () => {
    expect(pay).toHaveLength(1);
    expect(linkLit(pay, SIDEBAR, '/settings')).toBe(true);
    expect(linkLit(pay, SIDEBAR, '/settings/branding')).toBe(false);
    expect(barLit(pay, BAR, '/more')).toBe(true);
    expect(barLit(pay, BAR, '/members')).toBe(false);
    expect(linkLit(pay, MORE, '/settings')).toBe(true);
    expect(linkLit(pay, MORE, '/settings/people')).toBe(false);
    expect(settingsTabLit(pay, 'gym')).toBe(true);
    expect(settingsTabLit(pay, 'app')).toBe(false);
    expect(settingsRowLit(pay, '/settings/mettleup')).toBe(true);
    expect(settingsRowLit(pay, '/settings/payments')).toBe(false);
    expect(featuresAt(pay, '/settings/mettleup')).toHaveLength(1);
    expect(featuresAt(pay, '/settings/mettleup/')).toHaveLength(1);
    expect(featuresAt(pay, '/settings')).toHaveLength(0);
  });

  it('Branding has its own menu entry: that lights, not Settings, and no Settings tab', () => {
    const brand = dotFeatures(at('2026-11-07T12:00:00+05:30'), LOG).filter((f) => f.path === '/settings/branding');
    expect(linkLit(brand, SIDEBAR, '/settings/branding')).toBe(true);
    expect(linkLit(brand, SIDEBAR, '/settings')).toBe(false);
    expect(linkLit(brand, MORE, '/settings/branding')).toBe(true);
    expect(barLit(brand, BAR, '/more')).toBe(true);
    expect(settingsTabLit(brand, 'app')).toBe(false);
  });

  it('a page on the phone bar lights its own item, not More', () => {
    const members = [{ key: 'x|/members', id: 'x', path: '/members' }];
    expect(barLit(members, BAR, '/members')).toBe(true);
    expect(barLit(members, BAR, '/more')).toBe(false);
    expect(barLit(members, BAR, '/')).toBe(false);
    expect(linkLit(members, SIDEBAR, '/members')).toBe(true);
  });

  it('a Settings tab destination lights its tab, with no row', () => {
    const app = [{ key: 'x|/settings/app', id: 'x', path: '/settings/app' }];
    expect(settingsTabLit(app, 'app')).toBe(true);
    expect(settingsTabLit(app, 'gym')).toBe(false);
    expect(settingsRowLit(app, '/settings/app')).toBe(false);
    expect(linkLit(app, SIDEBAR, '/settings')).toBe(true);
  });

  it('paths: the longest link wins, / matches only itself, the query is ignored', () => {
    expect(linkFor(SIDEBAR, '/settings/branding?x=1')).toBe('/settings/branding');
    expect(linkFor(SIDEBAR, '/settings/mettleup')).toBe('/settings');
    expect(linkFor(SIDEBAR, '/members/abc')).toBe('/members');
    expect(linkFor(['/'], '/members')).toBeNull();
    expect(linkFor(['/settings'], '/settingsx')).toBeNull();
    expect(cleanPath('')).toBe('/');
    expect(cleanPath('settings/')).toBe('/settings');
  });
});

describe('which features light', () => {
  it('fixes never light, nor a feature with no button', () => {
    const f = dotFeatures(at('2026-11-07T12:00:00+05:30'), LOG, 99);
    expect(f.map((x) => x.key)).toEqual(['2026-11-06|/settings/branding', '2026-11-06|/settings/mettleup', '2026-11-05|/members', '2026-11-05|/settings/app']);
    expect(f.some((x) => x.id === '2026-11-07')).toBe(false);
  });

  it('at most 3, newest first; seeing one does not pull an older one in', () => {
    const f = dotFeatures(at('2026-11-07T12:00:00+05:30'), LOG);
    expect(MAX_DOTS).toBe(3);
    expect(f.map((x) => x.path)).toEqual(['/settings/branding', '/settings/mettleup', '/members']);
    const left = unseen(f, new Set(['2026-11-06|/settings/mettleup']));
    expect(left.map((x) => x.path)).toEqual(['/settings/branding', '/members']);
  });

  it('30 days from the entry day, India time: the last minute of day 30 lights, day 31 does not', () => {
    expect(DOT_DAYS).toBe(30);
    expect(liveFrom('2026-11-06')).toBe(at('2026-11-06T00:00:00+05:30'));
    const ids = (iso: string) => [...new Set(dotFeatures(at(iso), LOG).map((x) => x.id))];
    expect(ids('2026-12-05T23:59:00+05:30')).toEqual(['2026-11-06']);
    expect(ids('2026-12-06T00:00:00+05:30')).toEqual([]);
    // 5 Nov ended a day earlier: at 18:31 UTC on 4 Dec (00:01 IST on 5 Dec) only 6 Nov is left.
    expect(ids('2026-12-04T18:31:00Z')).toEqual(['2026-11-06']);
    expect(ids('2026-12-04T18:29:00Z')).toEqual(['2026-11-06', '2026-11-05']);
  });

  it('before the entry day (a wrong clock, a test clock) it is not live yet', () => {
    expect(dotFeatures(at('2026-11-05T23:59:00+05:30'), LOG).map((x) => x.id)).toEqual(['2026-11-05', '2026-11-05']);
    expect(dotFeatures(at('2026-10-17T10:00:00+05:30'), LOG)).toEqual([]);
    expect(dotFeatures(at('2026-11-07T12:00:00+05:30'), [{ id: 'bad', lines: [{ text: 'x', go: { label: 'x', path: '/x' }, feature: true }] }])).toEqual([]);
  });
});

describe('seen on this device', () => {
  it('opening the page clears its parents, but another feature under the same parent keeps its dot', () => {
    const f = dotFeatures(at('2026-11-07T12:00:00+05:30'), LOG, 99);
    const after = unseen(f, new Set(['2026-11-06|/settings/mettleup']));
    // Settings still leads to Bring a friend (Member app tab); the Gym tab and the Pay MettleUp row go dark.
    expect(linkLit(after, SIDEBAR, '/settings')).toBe(true);
    expect(settingsTabLit(after, 'gym')).toBe(false);
    expect(settingsTabLit(after, 'app')).toBe(true);
    expect(settingsRowLit(after, '/settings/mettleup')).toBe(false);
    const both = unseen(f, new Set(['2026-11-06|/settings/mettleup', '2026-11-05|/settings/app']));
    expect(linkLit(both, SIDEBAR, '/settings')).toBe(false);
    expect(barLit(both, BAR, '/more')).toBe(true); // Branding is still behind More
  });

  it('saves and reads back, keeping only features still in the list', () => {
    const s = store();
    saveSeen(s, new Set(['2026-11-06|/settings/mettleup', 'old|/gone']), LOG);
    expect(JSON.parse(s.map.get(DOTS_SEEN_KEY)!)).toEqual(['2026-11-06|/settings/mettleup']);
    expect([...readSeen(s)]).toEqual(['2026-11-06|/settings/mettleup']);
  });

  it('a first visit (nothing saved) sees every live dot', () => {
    expect(readSeen(store()).size).toBe(0);
  });

  it('bad storage: broken JSON, not a list, no storage, a throwing storage: none seen, never throws', () => {
    expect(readSeen(store({ [DOTS_SEEN_KEY]: '{oops' })).size).toBe(0);
    expect(readSeen(store({ [DOTS_SEEN_KEY]: '{"a":1}' })).size).toBe(0);
    expect([...readSeen(store({ [DOTS_SEEN_KEY]: '["a|/x", 3, null]' }))]).toEqual(['a|/x']);
    expect(readSeen(null).size).toBe(0);
    const broken: NewsStore = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('full');
      },
    };
    expect(readSeen(broken).size).toBe(0);
    expect(() => saveSeen(broken, new Set(['x']), LOG)).not.toThrow();
    expect(() => saveSeen(null, new Set(['x']), LOG)).not.toThrow();
  });
});

describe('the real list', () => {
  it('every feature line has a page the owner can open, and 7 Nov carries only the Trainers feature', () => {
    for (const e of ADMIN_NEWS) {
      for (const l of e.lines) {
        if (l.feature) {
          expect(l.go, l.text).toBeDefined();
          expect(canOpen('owner', l.go!.path), l.go!.path).toBe(true);
        }
      }
    }
    // F105 Trainers landed in the 7 Nov entry; its other lines stay fixes.
    expect(ADMIN_NEWS.find((e) => e.id === '2026-11-07')!.lines.filter((l) => l.feature).map((l) => l.go!.path)).toEqual(['/trainers']);
  });

  it('on 7 Nov the three dots are Trainers, the icon preview and Pay MettleUp (MAX_DOTS pushes pass members out)', () => {
    expect(dotFeatures(at('2026-11-07T12:00:00+05:30')).map((f) => f.key)).toEqual([
      '2026-11-07|/trainers',
      '2026-11-06|/settings/branding',
      '2026-11-06|/settings/mettleup',
    ]);
    // On 6 Nov (before the Trainers day) the old three still hold.
    expect(dotFeatures(at('2026-11-06T12:00:00+05:30')).map((f) => f.key)).toEqual([
      '2026-11-06|/settings/branding',
      '2026-11-06|/settings/mettleup',
      '2026-11-05|/members',
    ]);
  });

  it('every Settings spot is a real Settings address', () => {
    for (const p of Object.keys(SETTINGS_SPOTS)) expect(p.startsWith('/settings')).toBe(true);
  });
});

describe('9 Nov: a dot never leads to a page this person cannot see', () => {
  const q = { key: '2026-11-09|/questions', id: '2026-11-09', path: '/questions' };
  const pay = { key: '2026-11-06|/settings/mettleup', id: '2026-11-06', path: '/settings/mettleup' };
  const menu = ['/', '/members', '/settings', '/more'];
  it('negative: Questions hidden (desk, or before 0053) = no dot, and More stays dark for it', () => {
    expect(reachable([q, pay], menu)).toEqual([pay]);
    expect(barLit(reachable([q], menu), ['/', '/members', '/more'], '/more')).toBe(false);
  });
  it('happy path: Questions in the menu = More lights on the phone', () => {
    const withQ = [...menu, '/questions'];
    expect(reachable([q], withQ)).toEqual([q]);
    expect(barLit(reachable([q], withQ), ['/', '/members', '/more'], '/more')).toBe(true);
  });
});
