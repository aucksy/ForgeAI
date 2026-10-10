/**
 * "Include photos in my backup" (audit PG-17, owner decision D11 = A). Default OFF.
 *
 * When on, the newest progress photos that fit the budget (`photoBackupPlan`) are copied into
 * `files/photo-backup/`, the one photo folder Android's own backup includes (backup rules,
 * `<include domain="file" path="photo-backup/"/>`). Copies are shrunk to at most 1080 px on the
 * long side, JPEG at 70 % (`shrinkPhoto`, ~100–250 KB each, named `<id>.jpg`), so the 15 MB
 * budget holds the newest ~60–120 photos instead of 4–7 full-size ones.
 *
 * Review fixes (Phase 5):
 *  - ONE copy run at a time (`exclusive`): the card's on-focus run, the start-up run and a
 *    refresh after a photo change queue behind each other instead of copying side by side.
 *  - Turning it OFF writes the choice, tells a running run to stop, WAITS for it, then deletes
 *    the folder. Before, the folder was deleted under a running run: the shrink's move failed,
 *    and the as-is fallback recreated `photo-backup/` with a FULL-SIZE photo that then went to
 *    Google's backup against the member's choice.
 *  - The choice is re-read before EVERY copy; the folder is made once at the start of a run, and
 *    a folder gone mid-run means "stop", never "make it again".
 *  - No as-is (full-size) fallback: a photo the phone can't shrink is "couldn't be copied". It is
 *    tried on two runs, then skipped (remembered in meta, not retried every launch).
 *  - The size of each copy made is remembered, so the photo at the "doesn't fit" point is not
 *    shrunk, measured and deleted again on every run.
 *  - At start-up with the backup off, a leftover folder is deleted.
 *
 * On a fresh install Android restores the database (photo rows) and this folder, but not
 * `progress-photos/`. `relinkPhotosFromBackup` copies each photo back from the backup folder
 * and points its row at it (at the copy's own name, so a PNG's shrunk copy comes back as .jpg).
 *
 * Deleting a photo deletes its backup copy too (`progressPhotos.deleteProgressPhoto`), and
 * "Erase all data" deletes the folder.
 */
import * as FileSystem from 'expo-file-system/legacy';
import { ImageManipulator, type SaveFormat } from 'expo-image-manipulator';

import { DB_NAME, getDb, getMeta, setMeta } from '@/db';
import { enqueueWrite } from '@/db/writeQueue';

import { backupName, idOfBackupName, photoBudgetBytes, pickNewestThatFit, shrunkBackupName } from './photoBackupPlan';
import { getProgressPhotos } from './progressPhotos';

export const PHOTO_BACKUP_FOLDER = 'photo-backup/';
const PHOTOS_FOLDER = 'progress-photos/';
const META_KEY = 'photo_backup_on';
/** Per photo: the size of the last copy made, and how many shrinks failed. */
const MEMO_KEY = 'photo_backup_memo';
/** A photo whose shrink failed this many times is skipped from then on. */
const MAX_SHRINK_FAILS = 2;

/** The few file operations the backup needs — the phone's, or a stand-in in tests. */
export interface BackupFs {
  /** The app's files folder, ending in "/" ('' when unknown: then nothing is touched). */
  docDir: string;
  /** Size in bytes, or null when there is no such file. */
  size: (uri: string) => Promise<number | null>;
  /** Is there a folder here? */
  isDir: (uri: string) => Promise<boolean>;
  copy: (from: string, to: string) => Promise<void>;
  /** Write a smaller JPEG copy of a photo (optional: without it the copy is as-is — tests). */
  shrink?: (from: string, to: string) => Promise<void>;
  /** Delete a file or a whole folder; no error when it is not there. */
  remove: (uri: string) => Promise<void>;
  mkdir: (dir: string) => Promise<void>;
  /** File names in a folder (throws or returns [] when there is no folder). */
  list: (dir: string) => Promise<string[]>;
}

export function deviceFs(): BackupFs {
  return {
    docDir: FileSystem.documentDirectory ?? '',
    size: async (uri) => {
      const info = await FileSystem.getInfoAsync(uri).catch(() => null);
      return info && info.exists && !info.isDirectory ? info.size ?? 0 : null;
    },
    isDir: async (uri) => {
      const info = await FileSystem.getInfoAsync(uri).catch(() => null);
      return !!info && info.exists && info.isDirectory;
    },
    copy: (from, to) => FileSystem.copyAsync({ from, to }),
    shrink: shrinkPhoto,
    remove: (uri) => FileSystem.deleteAsync(uri, { idempotent: true }),
    mkdir: (dir) => FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => undefined),
    list: (dir) => FileSystem.readDirectoryAsync(dir),
  };
}

// ---------------------------------------------------------------- shrinking one photo

/** The long side of a backup copy, in pixels. */
const BACKUP_LONG_SIDE = 1080;
/** `SaveFormat.JPEG` (its value; the enum object itself is native-only). */
const JPEG = 'jpeg' as SaveFormat;

/** A native image that holds memory until released (expo SharedObject / SharedRef). */
interface Releasable {
  release?: () => void;
}
interface ShrinkImage extends Releasable {
  width: number;
  height: number;
  saveAsync: (o: { format: SaveFormat; compress: number }) => Promise<{ uri: string }>;
}
interface ShrinkContext extends Releasable {
  resize: (size: { width?: number; height?: number }) => ShrinkContext;
  renderAsync: () => Promise<ShrinkImage>;
}
export interface ShrinkDeps {
  manipulate: (source: string | ShrinkImage) => ShrinkContext;
  move: (from: string, to: string) => Promise<void>;
  remove: (uri: string) => Promise<void>;
}

function release(x: Releasable | null | undefined): void {
  try {
    x?.release?.();
  } catch {
    // Already released.
  }
}

/**
 * A backup-sized JPEG of a photo at `to`: long side ≤ 1080 px, 70 % quality.
 *
 * The file is decoded ONCE; a picture over 1080 px is then scaled from that decoded image in
 * memory (`manipulate(image)`), not decoded from the file a second time. Every context and image
 * is released in `finally` — they hold native bitmap memory that Hermes's garbage collector
 * can't see. (React Native's `Image.getSize` was not used to read the size first: on Android it
 * asks Fresco for the DECODED image, a second full decode; the photo rows store no size.)
 */
export async function shrinkPhotoWith(from: string, to: string, d: ShrinkDeps): Promise<void> {
  const held: Releasable[] = [];
  let saved: string | null = null;
  try {
    const ctx = d.manipulate(from);
    held.push(ctx);
    let image = await ctx.renderAsync();
    held.push(image);
    const long = Math.max(image.width, image.height);
    if (long > BACKUP_LONG_SIDE) {
      const small = d.manipulate(image);
      held.push(small);
      small.resize(image.width >= image.height ? { width: BACKUP_LONG_SIDE } : { height: BACKUP_LONG_SIDE });
      image = await small.renderAsync();
      held.push(image);
    }
    saved = (await image.saveAsync({ format: JPEG, compress: 0.7 })).uri;
    await d.move(saved, to);
    saved = null;
  } finally {
    for (const x of held.reverse()) release(x);
    if (saved) await d.remove(saved).catch(() => undefined);
  }
}

export function shrinkPhoto(from: string, to: string): Promise<void> {
  return shrinkPhotoWith(from, to, {
    manipulate: (source) => ImageManipulator.manipulate(source as never) as unknown as ShrinkContext,
    move: (a, b) => FileSystem.moveAsync({ from: a, to: b }),
    remove: (uri) => FileSystem.deleteAsync(uri, { idempotent: true }),
  });
}

// ---------------------------------------------------------------- one run at a time

let tail: Promise<unknown> = Promise.resolve();
/** Bumped by "off": a run that started under an older value stops at its next check. */
let offGen = 0;

/** Run `job` after every photo-backup job before it has finished (FIFO, one at a time). */
function exclusive<T>(job: () => Promise<T>): Promise<T> {
  const run = tail.then(job, job);
  tail = run.catch(() => undefined);
  return run;
}

export async function isPhotoBackupOn(): Promise<boolean> {
  return (await getMeta(META_KEY).catch(() => null)) === '1';
}

/** Still on, and not turned off since this run began? */
async function stillOn(gen: number): Promise<boolean> {
  return gen === offGen && (await isPhotoBackupOn());
}

/**
 * Remember the choice. Off: any copy run going now stops at its next step, and once it has,
 * the backup folder is deleted. (Turning on: call `syncPhotoBackup`.)
 */
export async function setPhotoBackupOn(on: boolean, fs: BackupFs = deviceFs()): Promise<void> {
  if (!on) offGen += 1;
  await enqueueWrite(() => setMeta(META_KEY, on ? '1' : '0'));
  if (!on && fs.docDir) {
    await exclusive(async () => {
      // A later "on" may have queued ahead of this delete; respect the stored choice.
      if (!(await isPhotoBackupOn())) await fs.remove(`${fs.docDir}${PHOTO_BACKUP_FOLDER}`);
    });
  }
}

export interface PhotoBackupState {
  /** Photos in the backup folder now. */
  kept: number;
  /** Photos on this phone (with a file). */
  total: number;
  bytes: number;
  /** Photos that couldn't be copied (the phone couldn't shrink them). */
  failed: number;
}

/**
 * The card's toggle: store the choice, copy when on — and say what is STORED once it has
 * settled, so the switch never shows "off" while the setting is on (or the other way round).
 */
export async function togglePhotoBackup(
  next: boolean,
  fs: BackupFs = deviceFs(),
): Promise<{ on: boolean; state: PhotoBackupState | null; failed: boolean }> {
  let state: PhotoBackupState | null = null;
  let failed = false;
  try {
    await setPhotoBackupOn(next, fs);
    if (next) state = await syncPhotoBackup(fs);
  } catch {
    failed = true;
  }
  const on = await isPhotoBackupOn();
  return { on, state: on ? state : null, failed };
}

async function databaseBytes(fs: BackupFs): Promise<number> {
  const base = `${fs.docDir}SQLite/${DB_NAME}`;
  const [db, wal] = await Promise.all([fs.size(base), fs.size(`${base}-wal`)]);
  return (db ?? 0) + (wal ?? 0);
}

type Memo = Record<string, { bytes?: number; fails?: number }>;

async function readMemo(): Promise<Memo> {
  try {
    const raw = await getMeta(MEMO_KEY);
    const v: unknown = raw ? JSON.parse(raw) : {};
    return v && typeof v === 'object' ? (v as Memo) : {};
  } catch {
    return {};
  }
}

const OFF_STATE: PhotoBackupState = { kept: 0, total: 0, bytes: 0, failed: 0 };

/**
 * Bring the backup folder in line: the newest photos that fit are copied in, any other copy
 * is removed. Returns what is backed up now. One run at a time; stops when turned off.
 */
export function syncPhotoBackup(fs: BackupFs = deviceFs()): Promise<PhotoBackupState> {
  const gen = offGen;
  return exclusive(() => syncNow(fs, gen));
}

async function syncNow(fs: BackupFs, gen: number): Promise<PhotoBackupState> {
  if (!fs.docDir || !(await stillOn(gen))) return { ...OFF_STATE };
  const dir = `${fs.docDir}${PHOTO_BACKUP_FOLDER}`;
  const [rows, dbBytes, names, memo] = await Promise.all([
    getProgressPhotos(),
    databaseBytes(fs),
    fs.list(dir).catch(() => [] as string[]),
    readMemo(),
  ]);
  // A photo's existing copy, by id (a shrunk "id.jpg", or an as-is copy from before).
  const copyOf = new Map<string, string>();
  for (const n of names) {
    const id = idOfBackupName(n);
    if (!copyOf.has(id) || n === shrunkBackupName(id)) copyOf.set(id, n);
  }
  const budget = photoBudgetBytes(dbBytes);

  // Every photo that still has a picture (its own file, or a backup copy from before).
  const photos: { id: string; dateISO: string; createdAt: number; uri: string; hasFile: boolean }[] = [];
  for (const r of rows) {
    const hasFile = (await fs.size(r.uri)) != null;
    if (!hasFile && !copyOf.has(r.id)) continue;
    photos.push({ id: r.id, dateISO: r.dateISO, createdAt: r.createdAt, uri: r.uri, hasFile });
  }
  // Newest first (the plan's own order), making each backup copy only when it is reached, and
  // stopping at the first that does not fit — so what is kept is always "your newest N".
  const order = pickNewestThatFit(
    photos.map((p) => ({ id: p.id, dateISO: p.dateISO, createdAt: p.createdAt, bytes: 0 })),
    Number.POSITIVE_INFINITY,
  ).keep;

  // The run makes the folder once, here. Missing later = stop, never make it again.
  await fs.mkdir(dir);
  const keep = new Set<string>();
  let bytes = 0;
  let failed = 0;
  let stopped = false;
  try {
    for (const id of order) {
      const p = photos.find((x) => x.id === id);
      if (!p) continue;
      const had = copyOf.get(p.id);
      if (had) {
        const size = await fs.size(`${dir}${had}`);
        if (size == null) continue;
        if (bytes + size > budget) break;
        keep.add(had);
        bytes += size;
        continue;
      }
      if (!p.hasFile) continue;
      const m = memo[p.id] ?? {};
      if ((m.fails ?? 0) >= MAX_SHRINK_FAILS) {
        failed += 1;
        continue;
      }
      // The copy made last time didn't fit, and still wouldn't: stop without making it again.
      if (m.bytes != null && bytes + m.bytes > budget) break;
      if (!(await stillOn(gen)) || !(await fs.isDir(dir))) {
        stopped = true;
        break;
      }
      const name = fs.shrink ? shrunkBackupName(p.id) : backupName(p.id, p.uri);
      const target = `${dir}${name}`;
      try {
        if (fs.shrink) await fs.shrink(p.uri, target);
        else await fs.copy(p.uri, target);
      } catch {
        if (!(await stillOn(gen)) || !(await fs.isDir(dir))) {
          stopped = true;
          break;
        }
        memo[p.id] = { ...m, fails: (m.fails ?? 0) + 1 };
        failed += 1;
        continue; // this one is not backed up; the rest still are
      }
      if (!(await stillOn(gen))) {
        await fs.remove(target).catch(() => undefined);
        stopped = true;
        break;
      }
      const size = await fs.size(target);
      if (size == null) continue;
      memo[p.id] = { bytes: size };
      if (bytes + size > budget) {
        await fs.remove(target).catch(() => undefined);
        break;
      }
      keep.add(name);
      bytes += size;
    }
    if (!stopped) {
      for (const name of names) {
        if (!keep.has(name)) await fs.remove(`${dir}${name}`).catch(() => undefined);
      }
    }
  } finally {
    // Remember sizes and failures for the photos that still exist.
    const live = new Set(rows.map((r) => r.id));
    const kept: Memo = {};
    for (const [id, v] of Object.entries(memo)) if (live.has(id)) kept[id] = v;
    await enqueueWrite(() => setMeta(MEMO_KEY, JSON.stringify(kept))).catch(() => undefined);
  }
  if (stopped) return { ...OFF_STATE };
  return { kept: keep.size, total: photos.length, bytes, failed };
}

/**
 * After a fresh install: every photo row whose file is missing but whose backup copy is here
 * gets its picture back (copied into the photo folder under the COPY's name — a PNG's shrunk
 * copy comes back as "id.jpg" — and the row pointed at it). Returns how many.
 */
export function relinkPhotosFromBackup(fs: BackupFs = deviceFs()): Promise<number> {
  return exclusive(() => relinkNow(fs));
}

async function relinkNow(fs: BackupFs): Promise<number> {
  if (!fs.docDir) return 0;
  const dir = `${fs.docDir}${PHOTO_BACKUP_FOLDER}`;
  const names = await fs.list(dir).catch(() => [] as string[]);
  if (names.length === 0) return 0;
  const byId = new Map<string, string>();
  for (const n of names) {
    const id = idOfBackupName(n);
    if (!byId.has(id) || n === shrunkBackupName(id)) byId.set(id, n);
  }
  const photosDir = `${fs.docDir}${PHOTOS_FOLDER}`;
  let n = 0;
  for (const row of await getProgressPhotos()) {
    const name = byId.get(row.id);
    if (!name) continue;
    if ((await fs.size(row.uri)) != null) continue;
    const to = `${photosDir}${name}`;
    try {
      if ((await fs.size(to)) == null) {
        await fs.mkdir(photosDir);
        await fs.copy(`${dir}${name}`, to);
      }
      if (row.uri !== to) await enqueueWrite(() => getDb().runAsync('UPDATE progress_photos SET uri = ? WHERE id = ?', [to, row.id]));
      n += 1;
    } catch {
      // That one stays missing; the others still come back.
    }
  }
  return n;
}

/**
 * At start-up: relink after a restore, then keep the folder current when the member chose it —
 * or, when the backup is off, delete any backup folder left behind.
 */
export async function photoBackupAtStart(fs: BackupFs = deviceFs()): Promise<void> {
  await relinkPhotosFromBackup(fs).catch(() => 0);
  if (await isPhotoBackupOn()) {
    await syncPhotoBackup(fs).catch(() => undefined);
    return;
  }
  if (!fs.docDir) return;
  const dir = `${fs.docDir}${PHOTO_BACKUP_FOLDER}`;
  await exclusive(async () => {
    if (!(await isPhotoBackupOn()) && (await fs.isDir(dir))) await fs.remove(dir);
  }).catch(() => undefined);
}

/** After photos change: keep the folder current when the member chose it. Never throws. */
export async function refreshPhotoBackup(fs: BackupFs = deviceFs()): Promise<void> {
  try {
    if (await isPhotoBackupOn()) await syncPhotoBackup(fs);
  } catch {
    // The next change or start-up tries again.
  }
}
