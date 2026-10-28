/**
 * "MettleUp backup" — ONE file a member can keep anywhere and restore on any phone (R-123, owner
 * 25 Oct 2026: "the backup ... should also include the routine along with its sequence ... all other
 * settings ... my photo, any profile info"). PURE: the file's shape, reading it back, the words.
 *
 * The file is a ZIP (zipStore.ts), `mettleup-backup-YYYY-MM-DD.zip`:
 *   backup.json        this file's header + every record (below)
 *   photos/<id>.<ext>  progress photos, workout photos and the profile photo, as they are
 *
 * backup.json:
 *   format, formatVersion   'mettleup-backup', BACKUP_FORMAT_VERSION
 *   app, appVersion         who made it: 'MettleUp' 0.57.0, or 'ForgeAI' 0.55.2 (the old app)
 *   packVersion             the records' format (cloud/pack.ts PACK_VERSION)
 *   createdAt, units        when, and kg/lb
 *   counts                  what is inside, for the summary before a restore
 *   items                   [kind, id, record] — the SAME packed records the cloud copy uses
 *                           (pack.ts): workouts 'w' with every set, routine folders 'r' with their
 *                           routines and exercises IN ORDER (and which folder is followed, and the
 *                           folders' own order), own exercises 'x', per-exercise rest and records
 *                           start 'p', body weight 'b', measurements 'm', profile 'u' (never the
 *                           phone number). The record is the parsed array, not text.
 *   hiddenExercises         library exercises the member hid, by ref (`c:<key>`, never a row id)
 *   libraryEdits            what the member changed on a LIBRARY exercise (how it is logged and how
 *                           its weight counts), by ref: [ref, logType, loadMode]
 *   meta                    the few import marks that belong to the workouts (snapshot.ts META_KEYS)
 *   rows                    food log and coach chat, as their rows
 *   settings                the member's own choices that live outside the database (SETTINGS_KEYS)
 *   photos                  each picture's record and its file in the ZIP: progress photos, workout
 *                           photos, the profile photo, and an exercise's own photo or video
 *
 * Never in it: the phone number, gym membership and its keys, sign-in, AI keys, notification ids,
 * the demo flags, anything only this phone needs (Health Connect's permission, the exact-alarm ask).
 *
 * A newer app reads every older file (missing parts are simply empty). A file from a NEWER format or
 * pack version is refused with what to do. Unknown item kinds are skipped, never fatal.
 */
import { ITEM_KINDS, PACK_VERSION, type ItemKind } from '@/cloud/pack';

export const BACKUP_FORMAT = 'mettleup-backup';
export const BACKUP_FORMAT_VERSION = 1;
export const BACKUP_JSON_NAME = 'backup.json';
export const PHOTO_FOLDER_IN_ZIP = 'photos/';

export type BackupMaker = 'MettleUp' | 'ForgeAI';

/** One record: [kind, id, the packed record as an array]. */
export type BackupItem = [ItemKind, string, unknown[]];

export interface BackupCounts {
  workouts: number;
  folders: number;
  routines: number;
  ownExercises: number;
  bodyWeights: number;
  measurements: number;
  photos: number;
}

export type BackupPhotoKind = 'progress' | 'workout' | 'profile' | 'exercise';

export interface BackupPhoto {
  kind: BackupPhotoKind;
  /** The photo's own id ('me' for the profile photo). */
  id: string;
  /** Its entry in the ZIP. */
  file: string;
  /** Progress photo: its day. */
  date?: string;
  createdAt?: number;
  /** Workout photo: its workout and place (0-3). */
  sessionId?: string;
  position?: number;
  /** Exercise picture: whose (pack.ts ref) and 'image' | 'video'. */
  ref?: string;
  mediaType?: string;
  bytes?: number;
}

/** A library exercise the member changed: [ref, logType, loadMode]. */
export type LibraryEdit = [string, string | null, string | null];

export type SettingsBlob = Record<string, Record<string, unknown>>;

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  formatVersion: number;
  app: BackupMaker;
  appVersion: string;
  packVersion: number;
  createdAt: string;
  units: 'metric' | 'imperial';
  counts: BackupCounts;
  items: BackupItem[];
  hiddenExercises: string[];
  libraryEdits: LibraryEdit[];
  meta: Record<string, string>;
  rows: Record<string, Record<string, string | number | null>[]>;
  settings: SettingsBlob;
  photos: BackupPhoto[];
}

/**
 * The member's own choices kept outside the database: each saved store (by its AsyncStorage name)
 * and the fields of it that go in a backup. Everything not listed stays on the phone: AI keys and
 * provider, Health Connect's permission and its send log, the "Alarms & reminders" ask, one-off
 * hints and snoozes. `meta` lists `meta` table keys (the default rest).
 */
export const SETTINGS_KEYS: Readonly<Record<string, readonly string[]>> = {
  'forgeai-settings': ['unitSystem', 'language'],
  'forgeai-tracker-prefs': [
    'advancedSets',
    'coachNotes',
    'sounds',
    'restSound',
    'bodyFigure',
    'weeklyGoal',
    'chartMetric',
    'chartRange',
    'previousFrom',
    'shareSize',
    'shareLook',
    'weightJump',
    'repRange',
    'inUseAfterSet',
  ],
  'forgeai-plate-setup': ['metric', 'imperial'],
  'forgeai-rest-alert-prefs': ['ringThroughDnd'],
  // healthConnect: carried, but a restore never switches it on by itself (Android asks for the
  // permission on each phone): the member is told to turn it on again (backupSettings.ts).
  'forgeai-phone-prefs': ['healthConnect', 'remindersOn', 'reminderDays', 'reminderMinutes', 'reminderChosen', 'gymRemindersOn', 'gymMessagesOn'],
  'forgeai-muscle-tips': ['on', 'muted'],
  'forgeai-folder-open': ['open'],
  // `meta` table keys: the default rest, and "Include photos in my backup" (Settings → Backup).
  meta: ['restTimerDefaultSec', 'photo_backup_on'],
};

/**
 * The old ForgeAI app (0.55.1, and its 0.55.2 that writes this file) keeps its settings under the
 * SAME store names and field names as MettleUp (checked against the v0.55.1 tag, 25 Oct 2026: only
 * the rest-alert store gained a field since, `exactAskedAt`, which stays on the phone). A renamed
 * field goes here as 'store.old' → 'new', and a ForgeAI file is read through it. Empty today, on
 * purpose: test/backup/backupFormat.test.ts holds every 0.55.1 field to a field MettleUp restores.
 */
export const FORGEAI_RENAMES: Readonly<Record<string, string>> = {};

/** A ForgeAI file's settings under MettleUp's names. PURE. */
export function fromForgeAiSettings(s: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [store, v] of Object.entries(s)) {
    if (!isObj(v)) continue;
    const fields: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) fields[FORGEAI_RENAMES[`${store}.${k}`] ?? k] = x;
    out[store] = fields;
  }
  return out;
}

/** Plain data only (no functions, no undefined), at most this deep. PURE. */
function plain(v: unknown, depth = 0): unknown {
  if (v === null || typeof v === 'string' || typeof v === 'boolean') return v;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (depth > 6) return undefined;
  if (Array.isArray(v)) return v.map((x) => plain(x, depth + 1)).filter((x) => x !== undefined);
  if (typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      const p = plain(x, depth + 1);
      if (p !== undefined) out[k] = p;
    }
    return out;
  }
  return undefined;
}

/** Only the listed fields of the listed stores, as plain data. PURE. */
export function pickSettings(states: Readonly<Record<string, unknown>>): SettingsBlob {
  const out: SettingsBlob = {};
  for (const [store, keys] of Object.entries(SETTINGS_KEYS)) {
    const s = states[store];
    if (!s || typeof s !== 'object') continue;
    const picked: Record<string, unknown> = {};
    for (const k of keys) {
      if (!(k in (s as object))) continue;
      const v = plain((s as Record<string, unknown>)[k]);
      if (v !== undefined) picked[k] = v;
    }
    if (Object.keys(picked).length > 0) out[store] = picked;
  }
  return out;
}

// ------------------------------------------------------------------ names

/** "mettleup-backup-2026-10-25.zip". PURE. */
export function backupFileName(dayISO: string): string {
  return `mettleup-backup-${dayISO}.zip`;
}

const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;
const PHOTO_EXT = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'];
const VIDEO_EXT = ['mp4', 'mov', 'webm', '3gp', 'mkv'];

/** An id from a file is used in a file name only when it is plainly safe. PURE. */
export function safeId(id: unknown): string | null {
  return typeof id === 'string' && SAFE_ID.test(id) ? id : null;
}

/** A photo's extension from its path, one of the picture kinds the app keeps (else jpg). PURE. */
export function photoExt(uri: string, video = false): string {
  const m = /\.([a-z0-9]{2,5})(?:\?|#|$)/i.exec(uri);
  const ext = m ? m[1].toLowerCase() : video ? 'mp4' : 'jpg';
  if (video) return VIDEO_EXT.includes(ext) ? ext : 'mp4';
  return PHOTO_EXT.includes(ext) ? ext : 'jpg';
}

/** The photo's entry in the ZIP: photos/<kind>-<id>.<ext>. PURE. */
export function photoEntryName(kind: BackupPhotoKind, id: string, uri: string, video = false): string {
  return `${PHOTO_FOLDER_IN_ZIP}${kind}-${safeId(id) ?? 'photo'}.${photoExt(uri, video)}`;
}

// ------------------------------------------------------------------ counts and words

/** What a list of items holds. PURE. */
export function countItems(items: readonly BackupItem[], photos: number): BackupCounts {
  const c: BackupCounts = { workouts: 0, folders: 0, routines: 0, ownExercises: 0, bodyWeights: 0, measurements: 0, photos };
  for (const [kind, , rec] of items) {
    if (kind === 'w') c.workouts++;
    else if (kind === 'r') {
      c.folders++;
      c.routines += Array.isArray(rec[2]) ? rec[2].length : 0;
    } else if (kind === 'x') c.ownExercises++;
    else if (kind === 'b') c.bodyWeights++;
    else if (kind === 'm') c.measurements++;
  }
  return c;
}

const plural = (n: number, one: string, many: string = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

/** "25 Oct 2026". PURE. */
export function backupDay(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'an unknown day';
  const m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()];
  return `${d.getDate()} ${m} ${d.getFullYear()}`;
}

/**
 * The summary before a restore: "512 workouts, 9 routines, 40 measurements and 12 photos, saved on
 * 25 Oct 2026 by ForgeAI 0.55.2". Body weight counts as a measurement here. PURE.
 */
export function backupSummary(f: Pick<BackupFile, 'counts' | 'createdAt' | 'app' | 'appVersion'>): string {
  const c = f.counts;
  const parts = [plural(c.workouts, 'workout'), plural(c.routines, 'routine'), plural(c.measurements + c.bodyWeights, 'measurement')];
  const what = c.photos > 0 ? `${parts.join(', ')} and ${plural(c.photos, 'photo')}` : parts.join(', ');
  return `${what}, saved on ${backupDay(f.createdAt)} by ${f.app}${f.appVersion ? ` ${f.appVersion}` : ''}`;
}

// ------------------------------------------------------------------ reading back

export type ParseResult = { ok: true; file: BackupFile; skipped: number } | { ok: false; why: string };

export const NOT_A_BACKUP = 'That file isn’t a MettleUp backup, so nothing was changed. Pick the file that starts with “mettleup-backup”.';
export const NEWER_BACKUP = 'This backup was saved by a newer version of MettleUp. Update MettleUp, then restore it again. Nothing was changed.';
export const DAMAGED_BACKUP = 'That backup file is damaged, so it can’t be restored. Nothing was changed. Save a new backup and try again.';

const isObj = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const KINDS = new Set<string>(ITEM_KINDS);

/** Read backup.json's text. Never throws: a junk file comes back as plain words. PURE. */
export function parseBackup(json: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return { ok: false, why: NOT_A_BACKUP };
  }
  if (!isObj(raw) || raw.format !== BACKUP_FORMAT) return { ok: false, why: NOT_A_BACKUP };
  const fv = typeof raw.formatVersion === 'number' ? raw.formatVersion : NaN;
  const pv = typeof raw.packVersion === 'number' ? raw.packVersion : NaN;
  if (!Number.isFinite(fv) || !Number.isFinite(pv) || !Array.isArray(raw.items)) return { ok: false, why: DAMAGED_BACKUP };
  if (fv > BACKUP_FORMAT_VERSION || pv > PACK_VERSION) return { ok: false, why: NEWER_BACKUP };

  let skipped = 0;
  const items: BackupItem[] = [];
  for (const it of raw.items) {
    if (Array.isArray(it) && typeof it[0] === 'string' && KINDS.has(it[0]) && typeof it[1] === 'string' && Array.isArray(it[2])) {
      // 'f' (a photo record without its picture) is carried in `photos` instead.
      if (it[0] === 'f') continue;
      items.push([it[0] as ItemKind, it[1], it[2] as unknown[]]);
    } else skipped++;
  }
  const photos: BackupPhoto[] = [];
  for (const p of Array.isArray(raw.photos) ? raw.photos : []) {
    if (
      !isObj(p) ||
      (p.kind !== 'progress' && p.kind !== 'workout' && p.kind !== 'profile' && p.kind !== 'exercise') ||
      typeof p.id !== 'string' ||
      typeof p.file !== 'string' ||
      (p.kind === 'exercise' && typeof p.ref !== 'string')
    ) {
      skipped++;
      continue;
    }
    photos.push({
      kind: p.kind,
      id: p.id,
      file: p.file,
      ...(typeof p.date === 'string' ? { date: p.date } : {}),
      ...(typeof p.createdAt === 'number' ? { createdAt: p.createdAt } : {}),
      ...(typeof p.sessionId === 'string' ? { sessionId: p.sessionId } : {}),
      ...(typeof p.position === 'number' ? { position: p.position } : {}),
      ...(typeof p.ref === 'string' ? { ref: p.ref } : {}),
      ...(p.mediaType === 'video' || p.mediaType === 'image' ? { mediaType: p.mediaType } : {}),
      ...(typeof p.bytes === 'number' ? { bytes: p.bytes } : {}),
    });
  }
  const meta: Record<string, string> = {};
  if (isObj(raw.meta)) for (const [k, v] of Object.entries(raw.meta)) if (typeof v === 'string') meta[k] = v;
  const rows: BackupFile['rows'] = {};
  if (isObj(raw.rows)) {
    for (const [table, list] of Object.entries(raw.rows)) {
      if (Array.isArray(list)) rows[table] = list.filter(isObj) as Record<string, string | number | null>[];
    }
  }
  const settings: SettingsBlob = {};
  if (isObj(raw.settings)) {
    const given = raw.app === 'ForgeAI' ? fromForgeAiSettings(raw.settings) : raw.settings;
    for (const [store, v] of Object.entries(given)) {
      // Only what this version would itself save (a newer app's extra fields are left out).
      if (isObj(v) && SETTINGS_KEYS[store]) {
        const keep: Record<string, unknown> = {};
        for (const k of SETTINGS_KEYS[store]) if (k in v) keep[k] = plain(v[k]);
        settings[store] = keep;
      }
    }
  }
  const file: BackupFile = {
    format: BACKUP_FORMAT,
    formatVersion: fv,
    app: raw.app === 'ForgeAI' ? 'ForgeAI' : 'MettleUp',
    appVersion: typeof raw.appVersion === 'string' ? raw.appVersion.slice(0, 20) : '',
    packVersion: pv,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : '',
    units: raw.units === 'imperial' ? 'imperial' : 'metric',
    counts: countItems(items, photos.length),
    items,
    hiddenExercises: Array.isArray(raw.hiddenExercises) ? raw.hiddenExercises.filter((x): x is string => typeof x === 'string') : [],
    libraryEdits: Array.isArray(raw.libraryEdits)
      ? raw.libraryEdits
          .filter((e): e is unknown[] => Array.isArray(e) && typeof e[0] === 'string')
          .map((e): LibraryEdit => [e[0] as string, typeof e[1] === 'string' ? e[1] : null, typeof e[2] === 'string' ? e[2] : null])
      : [],
    meta,
    rows,
    settings,
    photos,
  };
  return { ok: true, file, skipped };
}

/** The packed text the pack.ts readers take, from an item's record. PURE. */
export const itemData = (it: BackupItem): string => JSON.stringify(it[2]);
