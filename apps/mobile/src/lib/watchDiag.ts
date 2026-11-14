/**
 * R-441 (10 Nov 2026): "Add my watch's screen log" in Help and feedback.
 *
 * The owner's watch screen went black instead of dimming (R-437). The MettleUp watch app keeps a short
 * screen diary (android/wear AmbientDiag.kt: when the screen turned on, off or dim, Battery Saver, the
 * always-on setting, the time), but nothing could read it off the watch. Now:
 *  - the phone reads every watch's diary from the Wear Data Layer (native WearSync.watchDiag, which asks
 *    the watch to send a fresh copy first; android/wear DiagSend.kt);
 *  - a member who switches "Add my watch's screen log" on sends it with their message, as a SECOND
 *    message to the same feedback box (deploy/panel/feedback.js, D1 `forgeai-web`, table `feedback`),
 *    screen 'watch-diary'. No server or database change: the box already takes 2000 letters.
 *  - Claude reads them with `python scripts/feedback.py watch` (runbook docs/launch/FEEDBACK.md).
 *
 * Privacy: only lines in the diary's known shape go out, and only known words and settings in them
 * (anything else in a line is dropped); no watch name, no workout, no heart rate, no gym code. Off
 * unless the member switches it on, and offered only when the phone has a watch diary at all.
 */
import { Platform } from 'react-native';

import { deviceLine, FEEDBACK_MAX, FEEDBACK_URLS, postToBox, senderId } from '@/lib/feedback';
import { nativeWatchDiag, nativeWatchVersions } from '@/tracker/services/restCard';

export const WATCH_LOG_SCREEN = 'watch-diary';

export const WATCH_LOG_WORDS = {
  title: "Add my watch's screen log",
  caption: "It helps us fix a watch screen that goes dark. It holds only the times your watch screen turned on, off or dim, and your watch's Battery Saver and screen settings.",
  sent: 'Your watch screen log was sent too.',
  notSent: 'Your message was sent, but the watch screen log was not. Try again later.',
} as const;

/** One watch's diary as the phone read it: [at] when the watch wrote it (ms), [log] its raw lines. */
export interface WatchDiagItem {
  at: number;
  log: string;
}

/** The native answer. PURE. Anything unreadable is "no diary" (ok false). */
export function parseWatchDiag(raw: string | null): { ok: boolean; watches: WatchDiagItem[] } {
  if (!raw) return { ok: false, watches: [] };
  try {
    const o = JSON.parse(raw) as { ok?: unknown; watches?: unknown };
    const list = Array.isArray(o.watches) ? o.watches : [];
    const watches = list
      .map((w) => w as { at?: unknown; log?: unknown })
      .filter((w) => typeof w.log === 'string' && w.log.trim() !== '')
      .map((w) => ({ at: typeof w.at === 'number' && Number.isFinite(w.at) ? w.at : 0, log: w.log as string }))
      .sort((a, b) => b.at - a.at);
    return { ok: o.ok === true, watches };
  } catch (e) {
    console.warn('[watch-log] the watch screen log answer was not JSON', e);
    return { ok: false, watches: [] };
  }
}

/** The diary's events, as the log shows them (short, so more lines fit in 2000 letters). */
const EVENTS: Record<string, string> = {
  create: 'create',
  resume: 'resume',
  pause: 'pause',
  stop: 'stop',
  destroy: 'destroy',
  'ambient-enter': 'DIM',
  'ambient-exit': 'undim',
  rebuild: 'REBUILD',
  focus: 'focus',
  'focus-lost': 'unfocus',
  'new-intent': 'intent',
  // R-442/R-444: with Always-on display OFF the app keeps the screen on and dims it itself.
  'self-dim-on': 'hold',
  'self-dim-off': 'letgo',
  'self-dim-enter': 'ADIM',
  'self-dim-exit': 'aundim',
  // R-557: the app's check on every wake: whether it holds the screen, and each input that decided it.
  'self-dim-why': 'why',
};

/** R-444: the app's own dim lines (self-dim-*), whose first word says why (MainActivity: refreshSelfDim, dimNow, brighten, input). */
const SELF_DIM = new Set(['hold', 'letgo', 'ADIM', 'aundim', 'why']);

/** The only "why" words a self-dim line may carry: what happened, never anything the member typed. */
const SELF_DIM_WHY = new Set(['stop', 'state', 'check', 'resume', 'setting', 'idle', 'paused', 'touch', 'crown', 'key', 'wrist-up', 'wrist-down', 'timeout']);

/** Events dropped first when the log is too long (they say least about a black screen). */
const MINOR = new Set(['focus', 'unfocus', 'pause', 'intent']);

/** The diary's settings, shortened (the legend in the log's head says what each is). */
const KEYS: Record<string, string> = {
  screen: 'sc',
  saver: 'bs',
  idle: 'id',
  aod: 'aod',
  theatre: 'th',
  ambient: 'amb',
  workout: 'wo',
  blackout: 'bo',
  cause: 'cause',
  // R-557: the wake check (self-dim-why) and the stop line's held=.
  hold: 'hd',
  held: 'hd',
  front: 'fr',
  blacked: 'bk',
  paused: 'pa',
  quiet: 'qt',
};

const CAUSES: Record<string, string> = { 'battery-saver': 'saver', 'always-on-off': 'aod-off' };

/** Bare words a diary line may carry (create "restored", destroy "rebuild", pause "ambient", rebuild "try 1"). */
const WORDS = new Set(['restored', 'rebuild', 'ambient', 'try']);

const LINE = /^(\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})(?:\.\d{1,3})? ([a-z-]+)(?: (.*))?$/;
const VALUE = /^[0-9?/-]{1,9}$/;

/** One diary line, short and safe: { day, text } or null when it is not a diary line. PURE. */
export function compactLine(line: string): { day: string; event: string; text: string } | null {
  const m = LINE.exec(line.trim());
  if (!m) return null;
  const event = EVENTS[m[3]];
  if (!event) return null;
  const parts: string[] = [];
  // new-intent's detail is an intent's action: never sent.
  if (m[4] && event !== 'intent') {
    for (const token of m[4].split(/\s+/)) {
      const eq = token.indexOf('=');
      if (eq < 0) {
        if (WORDS.has(token) || /^\d{1,2}$/.test(token) || (SELF_DIM.has(event) && SELF_DIM_WHY.has(token))) parts.push(token);
        continue;
      }
      const key = KEYS[token.slice(0, eq)];
      const value = token.slice(eq + 1);
      if (!key) continue;
      if (key === 'cause') {
        if (CAUSES[value]) parts.push(`cause=${CAUSES[value]}`);
      } else if (VALUE.test(value)) {
        parts.push(`${key}${value}`);
      }
    }
  }
  return { day: m[1], event, text: [m[2], event, ...parts].join(' ') };
}

/**
 * R-557: the MettleUp watch app's version on each connected watch, from the native answer of
 * WearSync.watchVersions (the phone reads /forge/watch-version; a watch app older than 0.77.0 writes no
 * version). "" when Wear OS could not say or no watch has the app. PURE.
 */
export function watchAppVersions(raw: string | null): string {
  if (!raw) return '';
  try {
    const o = JSON.parse(raw) as { ok?: unknown; nodes?: unknown };
    if (o.ok !== true || !Array.isArray(o.nodes)) return '';
    const seen = (o.nodes as unknown[])
      .map((n) => (typeof n === 'object' && n !== null ? (n as { hasApp?: unknown; versionName?: unknown }) : {}))
      .filter((n) => n.hasApp === true)
      .map((n) => {
        const v = typeof n.versionName === 'string' ? n.versionName.trim() : '';
        if (v === '') return 'older than 0.77.0';
        return /^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(v) ? v : 'unknown';
      });
    return [...new Set(seen)].join(', ');
  } catch (e) {
    console.warn('[watch-log] the watch app versions were not JSON', e);
    return '';
  }
}

/** "11-10 21:04 UTC" for the watch's own clock in ms; "" when unknown. PURE. */
function when(at: number): string {
  if (!(at > 0)) return '';
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.toISOString().slice(5, 16).replace('T', ' ')} UTC`;
}

/**
 * The text that goes to the feedback box: a head (what this is, counts over the WHOLE diary, the last
 * Battery Saver and always-on values, a legend), then the newest lines that fit in [max] letters, by day.
 * Minor lines (focus, pause) go first when it is too long. PURE.
 */
export function watchLogText(items: WatchDiagItem[], max: number = FEEDBACK_MAX, watchApp: string = ''): string {
  const w = items[0];
  if (!w) return '';
  const lines = w.log
    .split('\n')
    .map(compactLine)
    .filter((l): l is NonNullable<ReturnType<typeof compactLine>> => l != null);
  const stops = lines.filter((l) => l.event === 'stop');
  // R-557 (14 Nov 2026): a black screen is any stop with the screen off, not dimmed, a workout open. It counted
  // only bo1 before (the rebuild's own flag, set only after the watch's dim state once worked), so with
  // Always-on off every black screen read "Off instead of dim: 0".
  const blackStops = stops.filter((l) => / amb0( |$)/.test(l.text) && / wo1( |$)/.test(l.text) && / sc0( |$)/.test(l.text));
  const black = blackStops.length;
  const saver = blackStops.filter((l) => l.text.includes('cause=saver')).length;
  const aodOff = blackStops.filter((l) => l.text.includes('cause=aod-off')).length;
  // Held by the app and still black: the watch turned the screen off over the app's keep-on.
  const heldBlack = blackStops.filter((l) => / hd1( |$)/.test(l.text)).length;
  // Since 0.77.0 a black stop with Always-on off always names cause=aod-off (or saver) and carries hd: one
  // without either comes from a watch app older than 0.77.0, which has no way to dim with Always-on off.
  const oldApp = blackStops.filter((l) => / aod0\//.test(l.text) && !l.text.includes('cause=') && !/ hd[01?]( |$)/.test(l.text)).length;
  const dims = lines.filter((l) => l.event === 'DIM').length;
  // R-444: with Always-on OFF the watch never dims (Dim stays 0); the app's own dim is counted apart.
  const selfDims = lines.filter((l) => l.event === 'ADIM').length;
  const holds = lines.filter((l) => l.event === 'hold').length;
  const letGo = lines.filter((l) => l.event === 'letgo');
  const idle = letGo.filter((l) => / idle( |$)/.test(l.text)).length;
  const paused = letGo.filter((l) => / paused( |$)/.test(l.text)).length;
  const rebuilds = lines.filter((l) => l.event === 'REBUILD').length;
  const lastState = [...lines].reverse().find((l) => / bs[01?]/.test(l.text));
  const bs = lastState ? (/ (bs[01?])/.exec(lastState.text)?.[1] ?? '') : '';
  const aod = lastState ? (/ (aod[0-9?/-]+)/.exec(lastState.text)?.[1] ?? '') : '';
  const head = [
    `Watch screen log (R-441), written ${when(w.at) || 'at an unknown time'}${items.length > 1 ? `, newest of ${items.length} watches` : ''}.${watchApp ? ` Watch app: ${watchApp}.` : ''}`,
    `${lines.length} lines on the watch. Off instead of dim: ${black} (saver ${saver}, aod-off ${aodOff}, while held ${heldBlack}, old watch app ${oldApp}). Dimmed by the watch (Always-on on): ${dims}. Dimmed by the app (Always-on off): ${selfDims}; screen held ${holds}, let go ${letGo.length} (idle ${idle}, paused ${paused}). Rebuild: ${rebuilds}. Last: ${[bs, aod].filter(Boolean).join(' ') || '-'}.`,
    'Key: sc screen on, bs Battery Saver, id idle, aod always-on global/secure, th theatre, amb dimmed, wo workout open, bo rebuild armed, hd the app holds the screen; DIM/undim the watch dims, ADIM/aundim the app dims, hold/letgo the app keeps the screen on or lets go (and why); why the check on each wake (fr app in front, bk black before, pa paused, qt unused 12 min). Times are the watch clock.',
  ].join('\n');

  const budget = max - head.length - 1;
  const fit = (pool: typeof lines): { out: string[]; n: number } => {
    // Newest first until full; each day's block gets a "[MM-dd]" line above it (counted in the budget).
    const picked: typeof lines = [];
    let used = 0;
    for (let i = pool.length - 1; i >= 0; i--) {
      const l = pool[i];
      const newDay = picked.length === 0 || picked[0].day !== l.day;
      const cost = l.text.length + 1 + (newDay ? l.day.length + 3 : 0);
      if (used + cost > budget) break;
      picked.unshift(l);
      used += cost;
    }
    const out: string[] = [];
    picked.forEach((l, j) => {
      if (j === 0 || picked[j - 1].day !== l.day) out.push(`[${l.day}]`);
      out.push(l.text);
    });
    return { out, n: picked.length };
  };
  let body = fit(lines);
  if (body.n < lines.length) body = fit(lines.filter((l) => !MINOR.has(l.event)));
  const text = [head, ...body.out].join('\n').trim();
  return text.length <= max ? text : text.slice(0, max);
}

/** Is there a watch screen log on this phone to offer? Never throws. */
export async function watchLogAvailable(read: () => Promise<string | null> = nativeWatchDiag): Promise<boolean> {
  try {
    return parseWatchDiag(await read()).watches.length > 0;
  } catch (e) {
    console.warn('[watch-log] the watch screen log could not be looked up', e);
    return false;
  }
}

export interface WatchLogDeps {
  read?: () => Promise<string | null>;
  post?: (json: string) => Promise<{ status: number }>;
  sender?: () => Promise<string>;
  device?: () => string;
  /** R-557: the native watch versions answer (WearSync.watchVersions), for the log's "Watch app:". */
  versions?: () => Promise<string | null>;
}

/** "Pixel 7 (Google), Android 14", as Send feedback says it; '' when the phone cannot say. */
function thisDevice(): string {
  try {
    return deviceLine(Platform.constants as { Model?: unknown; Brand?: unknown; Release?: unknown }, Platform.OS);
  } catch (e) {
    console.warn('[watch-log] the phone model could not be read', e);
    return '';
  }
}

/**
 * Sends the newest watch's screen log as its own message (screen 'watch-diary'). 'sent' | 'none' (no log
 * on this phone) | 'failed' (the box refused it or could not be reached; logged). Never throws.
 */
export async function sendWatchLog(app: string, deps: WatchLogDeps = {}): Promise<'sent' | 'none' | 'failed'> {
  const read = deps.read ?? nativeWatchDiag;
  const post = deps.post ?? ((json: string) => postToBox(json, undefined, FEEDBACK_URLS));
  const sender = deps.sender ?? senderId;
  try {
    const versions = deps.versions ?? nativeWatchVersions;
    let watchApp = '';
    try {
      watchApp = watchAppVersions(await versions());
    } catch (e) {
      console.warn('[watch-log] the watch app version could not be read; the log goes without it', e);
    }
    const text = watchLogText(parseWatchDiag(await read()).watches, FEEDBACK_MAX, watchApp);
    if (!text) {
      console.warn('[watch-log] no watch screen log on this phone; nothing sent');
      return 'none';
    }
    const body = {
      source: 'member',
      text,
      app,
      device: (deps.device ?? thisDevice)(),
      screen: WATCH_LOG_SCREEN,
      gym: '',
      input: 'typed',
      sender: await sender(),
    };
    const res = await post(JSON.stringify(body));
    if (res.status !== 201) {
      console.warn('[watch-log] the feedback box answered', res.status, 'to the watch screen log');
      return 'failed';
    }
    return 'sent';
  } catch (e) {
    console.warn('[watch-log] the watch screen log could not be sent', e);
    return 'failed';
  }
}
