/**
 * Watch update ready (10 Nov 2026): the phone learns when the MettleUp WATCH app is older than the
 * phone app, so a later card can say "a watch update is ready". Plumbing and state only: no screen
 * uses it yet (the owner picks the card's design first).
 *
 * How the version travels: the watch app keeps its own versionName / versionCode in the Wear Data
 * Layer item /forge/watch-version (android/wear WatchVersion.kt: written on app start, boot, after
 * an update, and when the phone asks). The phone reads every watch's item with the watch app closed
 * (native: WearSync.watchVersions, which also asks a watch that has the app but no item yet). A watch
 * build from before this change writes no item, so a watch WITH the app and NO version is an old
 * build: an update is ready.
 *
 * "Update on watch" asks the watch to open its Play Store on the MettleUp page (WearSync.updateOnWatch,
 * the same RemoteActivityHelper path as "Install on watch", for watches that already have the app).
 */
import { versionParts } from '@/lib/appUpdate';

import { nativeUpdateOnWatch, nativeWatchVersions } from './restCard';

/** One connected watch, as the phone reads it. versionName / versionCode null = no version item. */
export interface WatchNode {
  nodeId: string;
  displayName: string;
  /** The MettleUp watch app is on it (R-575: its capability, or an item it wrote on this phone). */
  hasApp: boolean;
  /**
   * R-575: connected now. False = a watch with the app that wrote items here lately but is out of reach
   * (Bluetooth off, the connected-watches question failed). An older phone build sends no field: true.
   * R-596 (review G4): the pop-up waits for such a watch ('away') instead of showing a button that can
   * only answer "Your watch is not connected"; it shows once the watch is connected again.
   */
  connected: boolean;
  versionName: string | null;
  versionCode: number | null;
}

/** What Wear OS said: ok false = it could not say (no Play services, a timeout, an older build). */
export interface WatchVersions {
  ok: boolean;
  nodes: WatchNode[];
  /** R-575: how the phone read it, step by step ("nodes=1 capR=0 capA=0 ver=0 diag=1"); '' from an older build. */
  why: string;
}

/** R-575: the native "why", kept only in its known shape (step names, numbers, fail codes). PURE. */
export function cleanWhy(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const t = raw.trim().slice(0, 160);
  return /^[A-Za-z0-9=:?_ .-]*$/.test(t) ? t : '';
}

/**
 * 'none': no watch connected, or none has the app (installing is watchInstall.ts's job).
 * 'up-to-date': every watch with the app is the phone's version or newer.
 * 'update-ready': at least one watch with the app is older, or too old to say its version.
 * 'unknown': Wear OS or a version could not be read.
 * 'away' (R-596, review G4): the only older watch with the app is out of reach (connected false, a fresh
 *   diary). The pop-up waits and asks again; it shows when that watch is connected ('update-ready').
 * 'update-ready' and 'up-to-date' count CONNECTED watches only: "Update on watch" can reach only those.
 */
export type WatchUpdateState = 'none' | 'up-to-date' | 'update-ready' | 'away' | 'unknown';

/** What "Update on watch" did. */
export type UpdateResult = 'opened' | 'none' | 'missing' | 'failed' | 'unknown';

const UPDATE_RESULTS: readonly UpdateResult[] = ['opened', 'none', 'missing', 'failed', 'unknown'];

/** The native JSON as watches; null for anything unreadable (no native piece, junk). PURE. */
export function parseWatchVersions(raw: unknown): WatchVersions | null {
  if (typeof raw !== 'string' || raw === '') return null;
  let o: unknown;
  try {
    o = JSON.parse(raw);
  } catch (e) {
    console.warn('[watch update] the watch versions were not JSON', e);
    return null;
  }
  if (typeof o !== 'object' || o === null) return null;
  const rec = o as { ok?: unknown; nodes?: unknown; why?: unknown };
  const why = cleanWhy(rec.why);
  if (rec.ok !== true) return { ok: false, nodes: [], why };
  if (!Array.isArray(rec.nodes)) return null;
  const nodes: WatchNode[] = [];
  for (const n of rec.nodes as unknown[]) {
    if (typeof n !== 'object' || n === null) continue;
    const x = n as Record<string, unknown>;
    if (typeof x.nodeId !== 'string' || x.nodeId === '') continue;
    nodes.push({
      nodeId: x.nodeId,
      displayName: typeof x.displayName === 'string' ? x.displayName : '',
      hasApp: x.hasApp === true,
      connected: x.connected !== false,
      versionName: typeof x.versionName === 'string' && x.versionName.trim() !== '' ? x.versionName.trim() : null,
      versionCode: typeof x.versionCode === 'number' && Number.isFinite(x.versionCode) ? x.versionCode : null,
    });
  }
  return { ok: true, nodes, why };
}

/** One watch with the app against the phone: older (or no version) / same-or-newer / cannot say. PURE. */
function compareWatch(phone: number[], w: WatchNode): 'older' | 'ok' | 'unknown' {
  if (w.versionName == null) return 'older'; // a build from before 10 Nov 2026 writes no version
  const v = versionParts(w.versionName);
  if (!v) return 'unknown';
  for (let i = 0; i < 3; i++) if (v[i] !== phone[i]) return v[i] < phone[i] ? 'older' : 'ok';
  return 'ok';
}

/**
 * The CONNECTED watches with the app that are older than the phone (the ones to update). A watch out of
 * reach is left out (R-596): "Update on watch" cannot open its Play Store. PURE.
 */
export function watchesNeedingUpdate(phoneVersion: string | null | undefined, read: WatchVersions | null): WatchNode[] {
  const phone = versionParts(phoneVersion);
  if (!phone || !read?.ok) return [];
  return read.nodes.filter((w) => w.hasApp && w.connected && compareWatch(phone, w) === 'older');
}

/** The rule the card will use (see WatchUpdateState). PURE. */
export function watchUpdateState(phoneVersion: string | null | undefined, read: WatchVersions | null): WatchUpdateState {
  if (!read?.ok) return 'unknown';
  const withApp = read.nodes.filter((w) => w.hasApp);
  if (withApp.length === 0) return 'none';
  const phone = versionParts(phoneVersion);
  if (!phone) return 'unknown';
  const near = withApp.filter((w) => w.connected).map((w) => compareWatch(phone, w));
  if (near.includes('older')) return 'update-ready';
  if (near.includes('unknown')) return 'unknown';
  // R-596 (review G4): an older (or unreadable) watch out of reach waits; it is asked again later.
  if (withApp.some((w) => !w.connected && compareWatch(phone, w) !== 'ok')) return 'away';
  return 'up-to-date';
}

/** The native answer to "Update on watch"; anything else is 'failed'. PURE. */
export function parseUpdateResult(raw: unknown): UpdateResult {
  return typeof raw === 'string' && (UPDATE_RESULTS as readonly string[]).includes(raw) ? (raw as UpdateResult) : 'failed';
}

// ------------------------------------------------------------------ the phone
/** The JS side waits at most this long (native always answers within ~8 s, asking a watch included). */
const VERSIONS_WAIT_MS = 10_000;
const UPDATE_WAIT_MS = 20_000;

function within<T>(p: Promise<T>, ms: number, late: T, what: string): Promise<T> {
  return new Promise<T>((resolve) => {
    const t = setTimeout(() => {
      console.warn(`[watch update] ${what} timed out`);
      resolve(late);
    }, ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(t);
        console.warn(`[watch update] ${what} failed`, e);
        resolve(late);
      },
    );
  });
}

/** Every connected watch and its version; null with no native piece, an error or a timeout. Never throws. */
export async function readWatchVersions(): Promise<WatchVersions | null> {
  const raw = await within(nativeWatchVersions(), VERSIONS_WAIT_MS, null, 'watch versions');
  const v = parseWatchVersions(raw);
  if (raw != null && (v == null || !v.ok)) console.warn('[watch update] Wear OS could not say the watch versions', raw);
  return v;
}

/**
 * The state for the card plus the watches to update. [phoneVersion] is the running app's version
 * (Constants.expoConfig?.version, as Settings → About shows it). Never throws.
 */
export async function readWatchUpdate(
  phoneVersion: string | null | undefined,
): Promise<{ state: WatchUpdateState; stale: WatchNode[]; read: WatchVersions | null }> {
  const read = await readWatchVersions();
  return { state: watchUpdateState(phoneVersion, read), stale: watchesNeedingUpdate(phoneVersion, read), read };
}

// ------------------------------------------------------------------ R-575: the pop-up's last decision
let popupNote = '';

/** R-575: the pop-up's last decision, for the watch log's head ("" = no check yet in this app run). */
export function lastPopupNote(): string {
  return popupNote;
}

/** R-575: keeps the pop-up's decision for the watch log and says it once in the console (tagged). */
export function notePopup(line: string): void {
  if (line === popupNote) return;
  popupNote = line;
  console.warn(`[watch update] ${line}`);
}

/** "Update on watch": opens the Play Store on MettleUp on [nodeId] (null = every watch with the app). Never throws. */
export async function updateOnWatch(nodeId: string | null = null): Promise<UpdateResult> {
  const raw = await within(nativeUpdateOnWatch(nodeId), UPDATE_WAIT_MS, 'failed', 'watch Play Store (update)');
  const r = parseUpdateResult(raw);
  if (r !== 'opened') console.warn('[watch update] the watch Play Store did not open for an update', raw);
  return r;
}
