/**
 * Watch update ready (10 Nov 2026): when the phone says a watch update is ready, and that the
 * watch and the phone agree on the Data Layer path and keys (read as text).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  cleanWhy,
  lastPopupNote,
  notePopup,
  parseUpdateResult,
  parseWatchVersions,
  watchUpdateState,
  watchesNeedingUpdate,
  type WatchNode,
  type WatchVersions,
} from '@/tracker/services/watchUpdate';

const node = (over: Partial<WatchNode> = {}): WatchNode => ({
  nodeId: 'w1',
  displayName: 'Pixel Watch 3',
  hasApp: true,
  connected: true,
  versionName: '0.76.0',
  versionCode: 1_000_000_076,
  ...over,
});
const read = (...nodes: WatchNode[]): WatchVersions => ({ ok: true, nodes, why: '' });

describe('watchUpdateState', () => {
  it('no watch connected is none', () => {
    expect(watchUpdateState('0.76.0', read())).toBe('none');
  });

  it('a watch without the app is none (installing is another card)', () => {
    expect(watchUpdateState('0.76.0', read(node({ hasApp: false, versionName: null, versionCode: null })))).toBe('none');
  });

  it('the same version is up to date', () => {
    expect(watchUpdateState('0.76.0', read(node()))).toBe('up-to-date');
  });

  it('a newer watch is up to date', () => {
    expect(watchUpdateState('0.76.0', read(node({ versionName: '0.77.1' })))).toBe('up-to-date');
  });

  it('an older watch is update-ready, by number not by text', () => {
    expect(watchUpdateState('0.76.0', read(node({ versionName: '0.75.9' })))).toBe('update-ready');
    expect(watchUpdateState('0.10.0', read(node({ versionName: '0.9.0' })))).toBe('update-ready');
    expect(watchUpdateState('1.0.0', read(node({ versionName: '0.99.99' })))).toBe('update-ready');
  });

  it('the app with no version is an old build: update-ready', () => {
    expect(watchUpdateState('0.76.0', read(node({ versionName: null, versionCode: null })))).toBe('update-ready');
  });

  it('two watches: one old is enough', () => {
    expect(watchUpdateState('0.76.0', read(node(), node({ nodeId: 'w2', versionName: '0.70.0' })))).toBe('update-ready');
  });

  it('Wear OS could not say, or no native piece, is unknown', () => {
    expect(watchUpdateState('0.76.0', null)).toBe('unknown');
    expect(watchUpdateState('0.76.0', { ok: false, nodes: [], why: 'timeout' })).toBe('unknown');
  });

  it('an unreadable phone or watch version is unknown, never a false card', () => {
    expect(watchUpdateState(undefined, read(node()))).toBe('unknown');
    expect(watchUpdateState('dev', read(node()))).toBe('unknown');
    expect(watchUpdateState('0.76.0', read(node({ versionName: '0.76' })))).toBe('unknown');
    // ...but a sure old watch beside it still counts.
    expect(watchUpdateState('0.76.0', read(node({ versionName: 'x' }), node({ nodeId: 'w2', versionName: null })))).toBe('update-ready');
  });
});

describe('watchesNeedingUpdate', () => {
  it('lists only the old watches with the app', () => {
    const r = read(
      node(),
      node({ nodeId: 'w2', versionName: '0.70.0' }),
      node({ nodeId: 'w3', versionName: null }),
      node({ nodeId: 'w4', hasApp: false, versionName: null }),
    );
    expect(watchesNeedingUpdate('0.76.0', r).map((w) => w.nodeId)).toEqual(['w2', 'w3']);
    expect(watchesNeedingUpdate('0.76.0', null)).toEqual([]);
    expect(watchesNeedingUpdate(null, r)).toEqual([]);
  });
});

describe('parseWatchVersions', () => {
  it('reads what the phone native sends (WearWire.watchVersionsJson)', () => {
    const raw =
      '{"ok":true,"nodes":[{"nodeId":"a1","displayName":"Galaxy Watch","hasApp":true,"versionName":"0.76.0","versionCode":1000000076},' +
      '{"nodeId":"b2","displayName":"Old","hasApp":true,"versionName":null,"versionCode":null}]}';
    expect(parseWatchVersions(raw)).toEqual({
      ok: true,
      why: '',
      nodes: [
        { nodeId: 'a1', displayName: 'Galaxy Watch', hasApp: true, connected: true, versionName: '0.76.0', versionCode: 1000000076 },
        { nodeId: 'b2', displayName: 'Old', hasApp: true, connected: true, versionName: null, versionCode: null },
      ],
    });
  });

  it('junk, no native piece and "could not say" never throw', () => {
    expect(parseWatchVersions(null)).toBeNull();
    expect(parseWatchVersions('')).toBeNull();
    expect(parseWatchVersions('not json')).toBeNull();
    expect(parseWatchVersions('{"ok":true}')).toBeNull();
    expect(parseWatchVersions('{"ok":false,"nodes":[]}')).toEqual({ ok: false, nodes: [], why: '' });
    expect(parseWatchVersions('{"ok":true,"nodes":[{"displayName":"no id"},7,{"nodeId":"x"}]}')).toEqual({
      ok: true,
      why: '',
      nodes: [{ nodeId: 'x', displayName: '', hasApp: false, connected: true, versionName: null, versionCode: null }],
    });
  });
});

describe('parseUpdateResult', () => {
  it('keeps known answers, anything else is failed', () => {
    for (const r of ['opened', 'none', 'missing', 'failed', 'unknown'] as const) expect(parseUpdateResult(r)).toBe(r);
    expect(parseUpdateResult(null)).toBe('failed');
    expect(parseUpdateResult('installed')).toBe('failed');
  });
});

describe('the watch and the phone agree on the wire (read as text)', () => {
  const root = resolve(__dirname, '../..');
  const watch = readFileSync(resolve(root, 'android/wear/src/main/java/com/forgeai/wear/WatchVersion.kt'), 'utf8');
  const phone = readFileSync(resolve(root, 'modules/forge-rest/android/src/main/java/com/forgeai/rest/WearWire.kt'), 'utf8');
  const manifest = readFileSync(resolve(root, 'android/wear/src/main/AndroidManifest.xml'), 'utf8');
  const constant = (src: string, name: string): string | undefined => new RegExp(`const val ${name} = "([^"]+)"`).exec(src)?.[1];

  it('same path, ask path and keys', () => {
    expect(constant(watch, 'PATH')).toBe('/forge/watch-version');
    expect(constant(phone, 'PATH_WATCH_VERSION')).toBe(constant(watch, 'PATH'));
    expect(constant(phone, 'PATH_WATCH_VERSION_ASK')).toBe(constant(watch, 'PATH_ASK'));
    expect(constant(phone, 'KEY_NAME')).toBe(constant(watch, 'KEY_NAME'));
    expect(constant(phone, 'KEY_CODE')).toBe(constant(watch, 'KEY_CODE'));
  });

  it('the watch listener wakes for the ask message', () => {
    expect(manifest).toContain(`android:path="${constant(watch, 'PATH_ASK')}"`);
  });
});

describe('R-575: the read says where it came from', () => {
  // His case (feedback 105, 15 Nov 2026): the capability empty, his watch found by its own diary item.
  const his =
    '{"ok":true,"why":"nodes=1 capR=0 capA=0 ver=0 diag=1 asked=1 got=0","nodes":[{"nodeId":"X","displayName":"Watch","hasApp":true,"connected":true,"versionName":null,"versionCode":null}]}';

  it('his watch with an old app and no version is update-ready', () => {
    const r = parseWatchVersions(his);
    expect(r?.why).toBe('nodes=1 capR=0 capA=0 ver=0 diag=1 asked=1 got=0');
    expect(watchUpdateState('0.78.0', r)).toBe('update-ready');
    expect(watchesNeedingUpdate('0.78.0', r).map((w) => w.nodeId)).toEqual(['X']);
  });

  it('a watch out of reach with the app still counts, marked not connected', () => {
    const r = parseWatchVersions(
      '{"ok":true,"why":"nodes=0 capR=0 capA=0 ver=0 diag=1","nodes":[{"nodeId":"X","displayName":"","hasApp":true,"connected":false,"versionName":null,"versionCode":null}]}',
    );
    expect(r?.nodes[0].connected).toBe(false);
    expect(watchUpdateState('0.78.0', r)).toBe('update-ready');
  });

  it('"could not say" keeps its why; a why in any other shape is dropped', () => {
    expect(parseWatchVersions('{"ok":false,"why":"timeout","nodes":[]}')).toEqual({ ok: false, nodes: [], why: 'timeout' });
    expect(cleanWhy('nodes=fail:17 capR=? late')).toBe('nodes=fail:17 capR=? late');
    expect(cleanWhy('<script>')).toBe('');
    expect(cleanWhy('name "Aakash"')).toBe('');
    expect(cleanWhy(7)).toBe('');
    expect(cleanWhy('x'.repeat(300))).toHaveLength(160);
  });

  it('the pop-up note keeps the last decision and says a repeat only once', () => {
    const warn = console.warn;
    const said: unknown[] = [];
    console.warn = (...a: unknown[]) => said.push(a[0]);
    try {
      notePopup('11-15 13:20 UTC update-ready, shown');
      notePopup('11-15 13:20 UTC update-ready, shown');
      expect(lastPopupNote()).toBe('11-15 13:20 UTC update-ready, shown');
      expect(said).toEqual(['[watch update] 11-15 13:20 UTC update-ready, shown']);
    } finally {
      console.warn = warn;
    }
  });
});
