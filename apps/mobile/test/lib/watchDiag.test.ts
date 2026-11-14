/**
 * R-441 (10 Nov 2026): the watch's screen diary reaches the feedback box with "Add my watch's screen
 * log": what is kept from each line (privacy), the 2000-letter cap, the second message's body, and that
 * the watch and the phone agree on the Data Layer path, ask message and keys (read as text).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { FEEDBACK_MAX } from '@/lib/feedback';
import { compactLine, parseWatchDiag, sendWatchLog, watchAppVersions, WATCH_LOG_SCREEN, WATCH_LOG_WORDS, watchLogAvailable, watchLogText } from '@/lib/watchDiag';

// Lines exactly as android/wear AmbientDiag.kt writes them (Lines.line + state()).
const STATE_ON = 'screen=1 saver=0 idle=0 aod=1/1 theatre=0';
const BLACK_SAVER = 'ambient=0 workout=1 blackout=0 cause=battery-saver screen=0 saver=1 idle=0 aod=1/1 theatre=0';
const diary = (n: number, day = '11-10'): string =>
  Array.from({ length: n }, (_, i) => {
    const s = String(i % 60).padStart(2, '0');
    const m = String(Math.floor(i / 60) % 60).padStart(2, '0');
    const ev = i % 3 === 0 ? `resume ${STATE_ON}` : i % 3 === 1 ? `ambient-enter ${STATE_ON}` : `stop ${BLACK_SAVER}`;
    return `${day} 09:${m}:${s}.123 ${ev}`;
  }).join('\n');

describe('one diary line, short and safe', () => {
  it('keeps the time, the event and the known settings, shortened', () => {
    expect(compactLine(`11-10 21:04:11.512 stop ${BLACK_SAVER}`)).toEqual({
      day: '11-10',
      event: 'stop',
      text: '21:04:11 stop amb0 wo1 bo0 cause=saver sc0 bs1 id0 aod1/1 th0',
    });
    expect(compactLine(`11-10 21:04:12.000 ambient-enter ${STATE_ON}`)?.text).toBe('21:04:12 DIM sc1 bs0 id0 aod1/1 th0');
    expect(compactLine('11-10 21:05:00.000 rebuild try 2')?.text).toBe('21:05:00 REBUILD try 2');
    expect(compactLine('11-10 21:05:01.000 create restored')?.text).toBe('21:05:01 create restored');
    expect(compactLine('11-10 21:05:02.000 stop cause=always-on-off aod=0/-')?.text).toBe('21:05:02 stop cause=aod-off aod0/-');
  });

  it('drops anything not in the diary shape: unknown events, words, settings and values', () => {
    expect(compactLine('hello world')).toBeNull();
    expect(compactLine('11-10 21:04:11.512 heart-rate bpm=140')).toBeNull();
    // An intent's action never goes out.
    expect(compactLine('11-10 21:04:11.512 new-intent android.intent.action.MAIN')?.text).toBe('21:04:11 intent');
    // Unknown keys, long or odd values and free words are left out of a known line.
    expect(compactLine('11-10 21:04:11.512 stop name=Aakash screen=on9999999999 aakash@x.in saver=1 cause=whatever')?.text).toBe('21:04:11 stop bs1');
  });
});

// R-444: lines exactly as R-442/R-444 MainActivity writes them (AmbientDiag.note: "self-dim-on <why> <state>",
// "self-dim-enter <why>", ...), from the R-442 cloud watch run's diary and the R-444 idle/paused release.
const AOD_OFF = 'screen=1 saver=0 idle=0 aod=0/0 theatre=0';
const R442 = [
  `11-10 06:27:58.101 resume ${AOD_OFF}`,
  `11-10 06:27:58.140 self-dim-on resume ${AOD_OFF}`,
  '11-10 06:28:13.150 self-dim-enter timeout',
  '11-10 06:28:20.002 self-dim-exit touch',
  '11-10 06:28:23.420 self-dim-enter wrist-down',
  '11-10 06:28:27.910 self-dim-exit wrist-up',
  '11-10 06:28:30.000 self-dim-exit crown',
  `11-10 06:40:30.000 self-dim-off idle ${AOD_OFF}`,
  `11-10 06:41:02.000 self-dim-on touch ${AOD_OFF}`,
  `11-10 06:45:00.000 self-dim-off paused ${AOD_OFF}`,
  `11-10 06:50:00.000 self-dim-on resume ${AOD_OFF}`,
  `11-10 06:55:00.000 self-dim-off check ${AOD_OFF}`,
  `11-10 06:55:01.000 stop ambient=0 workout=0 blackout=0 screen=0 saver=0 idle=0 aod=0/0 theatre=0`,
].join('\n');

describe("the app's own dim lines (R-442, Always-on OFF; R-444)", () => {
  it('keeps every self-dim line with its why word and settings', () => {
    expect(compactLine(`11-10 06:27:58.140 self-dim-on resume ${AOD_OFF}`)?.text).toBe('06:27:58 hold resume sc1 bs0 id0 aod0/0 th0');
    expect(compactLine('11-10 06:28:13.150 self-dim-enter timeout')?.text).toBe('06:28:13 ADIM timeout');
    expect(compactLine('11-10 06:28:23.420 self-dim-enter wrist-down')?.text).toBe('06:28:23 ADIM wrist-down');
    expect(compactLine('11-10 06:28:27.910 self-dim-exit wrist-up')?.text).toBe('06:28:27 aundim wrist-up');
    expect(compactLine(`11-10 06:40:30.000 self-dim-off idle ${AOD_OFF}`)?.text).toBe('06:40:30 letgo idle sc1 bs0 id0 aod0/0 th0');
    expect(compactLine(`11-10 06:45:00.000 self-dim-off paused ${AOD_OFF}`)?.text).toBe('06:45:00 letgo paused sc1 bs0 id0 aod0/0 th0');
  });

  it('only the known why words pass; anything else in a self-dim line is dropped', () => {
    expect(compactLine('11-10 06:28:13.150 self-dim-enter Aakash leg-day timeout')?.text).toBe('06:28:13 ADIM timeout');
    expect(compactLine('11-10 06:28:13.150 self-dim-off https://x.in idle')?.text).toBe('06:28:13 letgo idle');
    // The why words stay self-dim only: a stop line never carries them.
    expect(compactLine('11-10 06:28:13.150 stop touch screen=0')?.text).toBe('06:28:13 stop sc0');
    expect(compactLine('11-10 06:28:13.150 self-dim-sideways timeout')).toBeNull();
  });

  it("the head counts the app's dim apart, so 'Dimmed by the watch: 0' is not read as 'never dimmed'", () => {
    const text = watchLogText([{ at: 1, log: R442 }]);
    const lines = text.split('\n');
    expect(lines[1]).toBe(
      '13 lines on the watch. Off instead of dim: 0 (saver 0, aod-off 0, while held 0, old watch app 0). Dimmed by the watch (Always-on on): 0. Dimmed by the app (Always-on off): 2; screen held 3, let go 3 (idle 1, paused 1). Rebuild: 0. Last: bs0 aod0/0.',
    );
    expect(lines[2]).toContain('ADIM/aundim the app dims');
    expect(text).toContain('06:28:20 aundim touch');
    expect(text).toContain('06:40:30 letgo idle');
    expect(text.length).toBeLessThanOrEqual(FEEDBACK_MAX);
  });
});

// R-557 (14 Nov 2026, owner: "Watch screen is turning off. Log switch was enabled"): his diary, as his watch
// wrote it (12:27-12:48, Always-on off "aod=0/-", Battery Saver off, a workout open). Its stop lines have no
// cause= and no held=: the line of a watch app older than 0.77.0 (0.77.0 writes cause=always-on-off on each).
const HIS_STATE_ON = 'screen=1 saver=0 idle=0 aod=0/- theatre=0';
const HIS_BLACK = 'ambient=0 workout=1 blackout=0 screen=0 saver=0 idle=0 aod=0/- theatre=0';
const HIS = [
  ['12:27:54', `resume ${HIS_STATE_ON}`],
  ['12:27:56', `stop ${HIS_BLACK}`],
  ['12:28:00', `resume ${HIS_STATE_ON}`],
  ['12:28:01', `stop ${HIS_BLACK}`],
  ['12:28:23', `resume ${HIS_STATE_ON}`],
  ['12:28:33', `stop ${HIS_BLACK}`],
  ['12:35:03', `resume ${HIS_STATE_ON}`],
  ['12:35:09', `stop ${HIS_BLACK}`],
  ['12:37:20', `resume ${HIS_STATE_ON}`],
  ['12:37:25', 'stop ambient=0 workout=1 blackout=0 screen=1 saver=0 idle=0 aod=0/- theatre=0'],
]
  .map(([t, ev]) => `11-14 ${t}.000 ${ev}`)
  .join('\n');

describe("R-557: the owner's 14 Nov black screens are counted, and the log names the watch app", () => {
  it('every black stop in an open workout counts as "Off instead of dim" (it said 0 before)', () => {
    const lines = watchLogText([{ at: 1, log: HIS }]).split('\n');
    // 4 black stops (screen off, not dimmed, workout open); the 12:37:25 stop had the screen on (he left the app).
    expect(lines[1]).toContain('Off instead of dim: 4 (saver 0, aod-off 0, while held 0, old watch app 4).');
    expect(lines[1]).toContain('screen held 0, let go 0');
  });

  it('a 0.77.0-or-later black stop counts too, with its cause, and a held one apart', () => {
    const now = [
      '11-15 10:00:00.000 stop ambient=0 workout=1 blackout=0 held=0 cause=always-on-off screen=0 saver=0 idle=0 aod=0/- theatre=0',
      '11-15 10:01:00.000 stop ambient=0 workout=1 blackout=0 held=1 cause=always-on-off screen=0 saver=0 idle=0 aod=0/- theatre=0',
      '11-15 10:02:00.000 stop ambient=0 workout=0 blackout=0 held=0 screen=0 saver=0 idle=0 aod=0/- theatre=0',
      '11-15 10:03:00.000 stop ambient=1 workout=1 blackout=0 held=0 screen=0 saver=0 idle=0 aod=1/1 theatre=0',
    ].join('\n');
    const lines = watchLogText([{ at: 1, log: now }]).split('\n');
    expect(lines[1]).toContain('Off instead of dim: 2 (saver 0, aod-off 2, while held 1, old watch app 0).');
    expect(compactLine(now.split('\n')[1])?.text).toBe('10:01:00 stop amb0 wo1 bo0 hd1 cause=aod-off sc0 bs0 id0 aod0/- th0');
  });

  it("each wake's check line goes out with every input, nothing else", () => {
    expect(compactLine('11-15 10:00:00.000 self-dim-why resume hold=1 workout=1 front=1 aod=0 saver=0 blacked=0 paused=0 quiet=0')?.text).toBe(
      '10:00:00 why resume hd1 wo1 fr1 aod0 bs0 bk0 pa0 qt0',
    );
    expect(compactLine('11-15 10:00:00.000 self-dim-why resume hold=0 workout=1 front=1 aod=? saver=? blacked=0 paused=1 quiet=0 name=Aakash')?.text).toBe(
      '10:00:00 why resume hd0 wo1 fr1 aod? bs? bk0 pa1 qt0',
    );
  });

  it('the head names the watch app version the phone read (a watch app before 0.77.0 says none)', () => {
    expect(watchAppVersions('{"ok":true,"nodes":[{"nodeId":"a","hasApp":true,"versionName":null,"versionCode":null}]}')).toBe('older than 0.77.0');
    expect(watchAppVersions('{"ok":true,"nodes":[{"nodeId":"a","hasApp":true,"versionName":"0.78.0","versionCode":1000078000},{"nodeId":"b","hasApp":false}]}')).toBe('0.78.0');
    expect(watchAppVersions('{"ok":true,"nodes":[{"nodeId":"a","hasApp":true,"versionName":"Aakash 1"}]}')).toBe('unknown');
    expect(watchAppVersions('{"ok":false,"nodes":[]}')).toBe('');
    expect(watchAppVersions(null)).toBe('');
    expect(watchAppVersions('junk')).toBe('');
    const head = watchLogText([{ at: Date.UTC(2026, 10, 14, 7, 18), log: HIS }], undefined, 'older than 0.77.0').split('\n')[0];
    expect(head).toBe('Watch screen log (R-441), written 11-14 07:18 UTC. Watch app: older than 0.77.0.');
  });

  it('sendWatchLog puts the version in the log it sends', async () => {
    const sent: string[] = [];
    await sendWatchLog('0.78.0', {
      read: async () => JSON.stringify({ ok: true, watches: [{ at: 1, log: HIS }] }),
      versions: async () => '{"ok":true,"nodes":[{"nodeId":"a","hasApp":true,"versionName":null}]}',
      sender: async () => '',
      device: () => '',
      post: async (json) => {
        sent.push(json);
        return { status: 201 };
      },
    });
    const text = (JSON.parse(sent[0]) as { text: string }).text;
    expect(text.split('\n')[0]).toContain('Watch app: older than 0.77.0.');
    expect(text).toContain('Off instead of dim: 4');
  });
});

describe('the log that goes to the feedback box', () => {
  it('says what it is, counts over the whole diary and carries the newest lines', () => {
    const text = watchLogText([{ at: Date.UTC(2026, 10, 10, 15, 30), log: diary(9) }]);
    const lines = text.split('\n');
    expect(lines[0]).toBe('Watch screen log (R-441), written 11-10 15:30 UTC.');
    expect(lines[1]).toBe(
      '9 lines on the watch. Off instead of dim: 3 (saver 3, aod-off 0, while held 0, old watch app 0). Dimmed by the watch (Always-on on): 3. Dimmed by the app (Always-on off): 0; screen held 0, let go 0 (idle 0, paused 0). Rebuild: 0. Last: bs1 aod1/1.',
    );
    expect(lines[2]).toMatch(/^Key: /);
    expect(lines[3]).toBe('[11-10]');
    expect(lines[4]).toBe('09:00:00 resume sc1 bs0 id0 aod1/1 th0');
    expect(lines.at(-1)).toBe('09:00:08 stop amb0 wo1 bo0 cause=saver sc0 bs1 id0 aod1/1 th0');
  });

  it('never passes 2000 letters (the box refuses more) and keeps the NEWEST lines, under their day', () => {
    const log = `${diary(100, '11-09')}\n${diary(150, '11-10')}`;
    const text = watchLogText([{ at: 1, log }]);
    expect(text.length).toBeLessThanOrEqual(FEEDBACK_MAX);
    expect(text.length).toBeGreaterThan(FEEDBACK_MAX - 120);
    const body = text.split('\n').slice(3);
    expect(body[0]).toBe('[11-10]');
    expect(body.at(-1)).toBe('09:02:29 stop amb0 wo1 bo0 cause=saver sc0 bs1 id0 aod1/1 th0');
    expect(text).toContain('250 lines on the watch');
  });

  it('drops focus and pause lines first when it is too long', () => {
    const busy = Array.from({ length: 200 }, (_, i) => `11-10 10:${String(Math.floor(i / 60)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}.000 ${i % 2 ? 'focus' : `stop ${BLACK_SAVER}`}`).join('\n');
    const text = watchLogText([{ at: 1, log: busy }]);
    expect(text.length).toBeLessThanOrEqual(FEEDBACK_MAX);
    expect(text).not.toMatch(/ focus$/m);
  });

  it('a short diary fits whole, minor lines too; no diary is no text', () => {
    const text = watchLogText([{ at: 0, log: '11-10 09:00:00.000 focus-lost\n11-10 09:00:01.000 focus' }]);
    expect(text).toContain('09:00:00 unfocus');
    expect(text).toContain('written at an unknown time');
    expect(watchLogText([])).toBe('');
  });
});

describe('the native answer', () => {
  it('reads the watches newest first; junk is no diary', () => {
    expect(parseWatchDiag('{"ok":true,"watches":[{"at":1,"log":"a"},{"at":5,"log":"b"},{"at":9,"log":"  "}]}')).toEqual({
      ok: true,
      watches: [
        { at: 5, log: 'b' },
        { at: 1, log: 'a' },
      ],
    });
    expect(parseWatchDiag(null)).toEqual({ ok: false, watches: [] });
    expect(parseWatchDiag('not json')).toEqual({ ok: false, watches: [] });
    expect(parseWatchDiag('{"ok":false,"watches":[]}')).toEqual({ ok: false, watches: [] });
  });

  it('offers the switch only with a log on this phone', async () => {
    expect(await watchLogAvailable(async () => '{"ok":true,"watches":[{"at":1,"log":"11-10 09:00:00.000 create"}]}')).toBe(true);
    expect(await watchLogAvailable(async () => '{"ok":true,"watches":[]}')).toBe(false);
    expect(await watchLogAvailable(async () => null)).toBe(false);
    expect(await watchLogAvailable(async () => Promise.reject(new Error('x')))).toBe(false);
  });
});

describe('sending it', () => {
  const read = async () => JSON.stringify({ ok: true, watches: [{ at: 1, log: diary(5) }] });

  it('goes as its own member message, screen watch-diary, no gym code', async () => {
    const sent: string[] = [];
    const r = await sendWatchLog('0.77.0', {
      read,
      sender: async () => 'install-1234',
      device: () => 'Pixel 9 (google), Android 16',
      post: async (json) => {
        sent.push(json);
        return { status: 201 };
      },
    });
    expect(r).toBe('sent');
    const body = JSON.parse(sent[0]) as Record<string, string>;
    expect(body.source).toBe('member');
    expect(body.screen).toBe(WATCH_LOG_SCREEN);
    expect(body.gym).toBe('');
    expect(body.app).toBe('0.77.0');
    expect(body.sender).toBe('install-1234');
    expect(body.device).toBe('Pixel 9 (google), Android 16');
    expect(body.text.startsWith('Watch screen log (R-441)')).toBe(true);
    expect(body.text.length).toBeLessThanOrEqual(FEEDBACK_MAX);
  });

  it('no log = nothing sent; a refusal or no network = failed, never a throw', async () => {
    let posts = 0;
    const post = async () => {
      posts += 1;
      return { status: 201 };
    };
    expect(await sendWatchLog('1', { read: async () => '{"ok":true,"watches":[]}', post, sender: async () => '' })).toBe('none');
    expect(posts).toBe(0);
    expect(await sendWatchLog('1', { read, post: async () => ({ status: 429 }), sender: async () => '' })).toBe('failed');
    expect(await sendWatchLog('1', { read, post: async () => Promise.reject(new Error('offline')), sender: async () => '' })).toBe('failed');
  });

  it('member words never say volume, PR, session or ambient', () => {
    for (const w of Object.values(WATCH_LOG_WORDS)) expect(w).not.toMatch(/\b(volume|PR|session|ambient)\b/i);
  });
});

describe('the watch and the phone agree on the wire (read as text)', () => {
  const root = resolve(__dirname, '../..');
  const diag = readFileSync(resolve(root, 'android/wear/src/main/java/com/forgeai/wear/AmbientDiag.kt'), 'utf8');
  const send = readFileSync(resolve(root, 'android/wear/src/main/java/com/forgeai/wear/DiagSend.kt'), 'utf8');
  const listener = readFileSync(resolve(root, 'android/wear/src/main/java/com/forgeai/wear/ForgeListenerService.kt'), 'utf8');
  const phone = readFileSync(resolve(root, 'modules/forge-rest/android/src/main/java/com/forgeai/rest/WearWire.kt'), 'utf8');
  const manifest = readFileSync(resolve(root, 'android/wear/src/main/AndroidManifest.xml'), 'utf8');
  const constant = (src: string, name: string): string | undefined => new RegExp(`const val ${name} = "([^"]+)"`).exec(src)?.[1];

  it('same item path, ask path and keys', () => {
    expect(constant(diag, 'PATH')).toBe('/forge/diag');
    expect(constant(phone, 'PATH_WATCH_DIAG')).toBe(constant(diag, 'PATH'));
    expect(constant(phone, 'PATH_WATCH_DIAG_ASK')).toBe(constant(send, 'PATH_ASK'));
    expect(constant(phone, 'KEY_DIAG_LOG')).toBe('log');
    expect(constant(phone, 'KEY_DIAG_AT')).toBe('at');
    // Both writers on the watch use those keys.
    for (const src of [diag, send]) {
      expect(src).toContain('putString("log"');
      expect(src).toContain('putLong("at"');
    }
  });

  it('the watch listener wakes for the ask message and answers it', () => {
    expect(manifest).toContain(`android:path="${constant(send, 'PATH_ASK')}"`);
    expect(listener).toContain('DiagSend.PATH_ASK) DiagSend.answer(');
  });
});
