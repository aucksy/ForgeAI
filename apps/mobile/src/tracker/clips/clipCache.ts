/**
 * R-170: download an exercise's clip once, keep it on the phone, play it offline after that.
 *
 * Files live in the app's own documents folder (`exercise-clips/`), not the cache folder, so
 * Android does not throw them away when space runs low. Each file is downloaded to a `.part` name
 * and renamed only when complete, so a download cut off half-way is never played. When a clip's
 * version changes (manifest v7 for v6), the old files of that exercise are deleted after the new
 * one arrives. A failed download is remembered for a few minutes (one try per exercise, not one
 * per screen visit) and logged; the screen then shows nothing in its place.
 *
 * The file system is passed in (`ClipFs`), so this logic runs in the tests; clipFs.ts is the
 * phone's own.
 */
import type { ClipFiles } from './clipManifest';

export interface ClipFs {
  /** Folder for the clips, ending in '/'. */
  dir: string;
  /** True when the file is there and not empty. */
  exists(path: string): Promise<boolean>;
  makeDir(path: string): Promise<void>;
  /** Download `url` to `path`; throws on a network error or a non-200 answer. */
  download(url: string, path: string): Promise<void>;
  move(from: string, to: string): Promise<void>;
  remove(path: string): Promise<void>;
  /** File names in the folder (empty when it does not exist). */
  list(dir: string): Promise<string[]>;
}

export type ClipLog = (message: string, error?: unknown) => void;

/** A failed download is not tried again for this long (the next visit after it tries again). */
export const RETRY_AFTER_MS = 5 * 60 * 1000;

export interface ClipCache {
  /** Local path of the still frame (downloads it the first time); null when it cannot be had. */
  poster(files: ClipFiles): Promise<string | null>;
  /** Local path of the looping clip (downloads it the first time); null when it cannot be had. */
  clip(files: ClipFiles): Promise<string | null>;
}

/** Old files of this exercise (another version, or a `.part` left by a cut-off download). PURE. */
export function staleFiles(names: readonly string[], files: ClipFiles): string[] {
  const prefix = `${files.key}.v`;
  const keep = new Set([files.clipName, files.posterName]);
  return names.filter((n) => {
    if (!n.startsWith(prefix)) return false;
    // `lateral_raise.v6.webp` must not match a key that merely starts the same way
    // (`lateral_raise_machine.v1.webp` starts with `lateral_raise_`, never with `lateral_raise.v`).
    if (!/^\d+\./.test(n.slice(prefix.length))) return false;
    if (keep.has(n)) return false;
    return true;
  });
}

export function createClipCache(
  fs: ClipFs,
  log: ClipLog,
  now: () => number = () => Date.now(),
): ClipCache {
  const inFlight = new Map<string, Promise<string | null>>();
  const failedAt = new Map<string, number>();
  let dirReady: Promise<void> | null = null;

  const ensureDir = () => {
    if (!dirReady) {
      dirReady = fs.makeDir(fs.dir).catch((e: unknown) => {
        dirReady = null;
        throw e;
      });
    }
    return dirReady;
  };

  const tidy = async (files: ClipFiles) => {
    try {
      const names = await fs.list(fs.dir);
      for (const n of staleFiles(names, files)) {
        // A `.part` of the file being downloaded right now is not stale yet.
        if (inFlight.has(n.replace(/\.part$/, ''))) continue;
        await fs.remove(fs.dir + n);
      }
    } catch (e) {
      log(`exercise clip: could not tidy old files of ${files.key}`, e);
    }
  };

  const fetchOne = (name: string, url: string, files: ClipFiles): Promise<string | null> => {
    const running = inFlight.get(name);
    if (running) return running;
    const path = fs.dir + name;
    const job = (async () => {
      try {
        if (await fs.exists(path)) return path;
        const failed = failedAt.get(name);
        if (failed != null && now() - failed < RETRY_AFTER_MS) return null;
        await ensureDir();
        const part = `${path}.part`;
        await fs.remove(part);
        await fs.download(url, part);
        await fs.move(part, path);
        failedAt.delete(name);
        void tidy(files);
        return path;
      } catch (e) {
        failedAt.set(name, now());
        log(`exercise clip: ${name} could not be downloaded (no internet, or the file is missing)`, e);
        try {
          await fs.remove(`${path}.part`);
        } catch (cleanup) {
          log(`exercise clip: could not remove the cut-off download of ${name}`, cleanup);
        }
        return null;
      } finally {
        inFlight.delete(name);
      }
    })();
    inFlight.set(name, job);
    return job;
  };

  return {
    poster: (files) => fetchOne(files.posterName, files.posterUrl, files),
    clip: (files) => fetchOne(files.clipName, files.clipUrl, files),
  };
}
