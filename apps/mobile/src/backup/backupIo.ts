/**
 * The phone's files for the backup (R-123), behind the small `BackupIo` interface so the save and
 * the restore run in tests on an in-memory stand-in. Uses expo-file-system's File API: a file is
 * opened once and read or written a piece at a time (a 200-photo backup never sits in memory).
 */
import { Directory, File, FileMode, Paths } from 'expo-file-system';

export interface ReadHandle {
  size: number;
  readAt(offset: number, length: number): Uint8Array;
  close(): void;
}

export interface WriteHandle {
  write(bytes: Uint8Array): void;
  close(): void;
}

export interface BackupIo {
  /** The app's own folders, ending in "/". */
  cacheDir: string;
  docDir: string;
  /** Free space on the phone, or null when it can't be told. */
  freeBytes(): number | null;
  /** A file's size, or null when it is not there. */
  fileSize(uri: string): number | null;
  openRead(uri: string): ReadHandle;
  /** A new, empty file (an old one of that name is replaced). */
  openWrite(uri: string): WriteHandle;
  remove(uri: string): void;
  mkdir(dir: string): void;
  /** The names in a folder ([] when it is not there). */
  list(dir: string): string[];
}

const withSlash = (u: string): string => (u.endsWith('/') ? u : `${u}/`);

export const deviceBackupIo: BackupIo = {
  get cacheDir() {
    return withSlash(Paths.cache.uri);
  },
  get docDir() {
    return withSlash(Paths.document.uri);
  },
  freeBytes() {
    try {
      const n = Paths.availableDiskSpace;
      return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : null;
    } catch {
      return null;
    }
  },
  fileSize(uri) {
    try {
      const f = new File(uri);
      return f.exists ? f.size : null;
    } catch {
      return null;
    }
  },
  openRead(uri) {
    const f = new File(uri);
    const size = f.size;
    const h = f.open(FileMode.ReadOnly);
    return {
      size,
      readAt(offset, length) {
        h.offset = offset;
        return h.readBytes(length);
      },
      close() {
        h.close();
      },
    };
  },
  openWrite(uri) {
    const f = new File(uri);
    if (f.exists) f.delete();
    f.create({ intermediates: true });
    const h = f.open(FileMode.WriteOnly);
    return {
      write(bytes) {
        h.writeBytes(bytes);
      },
      close() {
        h.close();
      },
    };
  },
  remove(uri) {
    try {
      const f = new File(uri);
      if (f.exists) f.delete();
    } catch (e) {
      console.warn('[backup] could not delete a file', e);
    }
  },
  mkdir(dir) {
    const d = new Directory(dir);
    if (!d.exists) d.create({ intermediates: true, idempotent: true });
  },
  list(dir) {
    try {
      const d = new Directory(dir);
      if (!d.exists) return [];
      return d.list().map((x) => x.name);
    } catch {
      return [];
    }
  },
};
