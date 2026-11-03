/**
 * F148 "The gym's own form videos" — the PURE half. A trainer may give an exercise in the gym's workout plans
 * (and in the workout of the day, F151) a YouTube link; the member's exercise page then shows "Watch your
 * trainer". The link rides in the plan's routines as the exercise's `videoUrl` (0051). The routine-file reader
 * drops fields it does not know, so the links are read here from the raw answer, before it.
 *
 * The phone opens ONLY a link that passes the server's rule (`_video_url_ok`, 0051; the admin app's
 * logic/trainerVideos.ts): https, host youtube.com / www.youtube.com / m.youtube.com / youtu.be, at most 300
 * characters. Anything else is dropped here and checked again at the tap.
 */

export const VIDEO_URL_MAX = 300;

const WATCH = /^https:\/\/((www|m)\.)?youtube\.com\/[A-Za-z0-9_./?=&%#:+~-]*$/;
const SHORT = /^https:\/\/youtu\.be\/[A-Za-z0-9_-]+([?#][A-Za-z0-9_./?=&%#:+~-]*)?$/;

/** True when the phone may open this link. PURE. */
export function videoUrlOk(u: unknown): u is string {
  return typeof u === 'string' && u.length >= 10 && u.length <= VIDEO_URL_MAX && (WATCH.test(u) || SHORT.test(u));
}

export interface TrainerVideo {
  /** The exercise's library key, or null for one the trainer typed by hand. */
  catalogKey: string | null;
  /** The exercise's name as the trainer wrote it. */
  name: string;
  url: string;
  /** Who sent it ("Ravi"), when known. */
  byName: string | null;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '');
const nameKey = (s: string): string => s.replace(/\s+/g, ' ').trim().toLowerCase();

/** The good links in some raw routines ([{exercises: [{name, catalogKey, videoUrl}]}]). PURE. */
export function videosInRoutines(routines: unknown, byName: string | null): TrainerVideo[] {
  if (!Array.isArray(routines)) return [];
  const out: TrainerVideo[] = [];
  for (const r of routines) {
    if (!isObj(r) || !Array.isArray(r.exercises)) continue;
    for (const e of r.exercises) {
      if (!isObj(e) || !videoUrlOk(e.videoUrl)) continue;
      const name = str(e.name).slice(0, 120);
      const catalogKey = typeof e.catalogKey === 'string' && /^[a-z0-9_]{1,60}$/.test(e.catalogKey) ? e.catalogKey : null;
      if (!name && !catalogKey) continue;
      out.push({ catalogKey, name, url: e.videoUrl, byName });
    }
  }
  return out;
}

/**
 * The trainer's video for an exercise on this phone: by library key first, then by name; the first one wins
 * (the newest source is passed first). Null when there is none. PURE.
 */
export function videoFor(list: readonly TrainerVideo[], ex: { catalogKey: string | null; name: string }): TrainerVideo | null {
  if (ex.catalogKey) {
    const byKey = list.find((v) => v.catalogKey === ex.catalogKey);
    if (byKey) return byKey;
  }
  const n = nameKey(ex.name);
  return n ? (list.find((v) => nameKey(v.name) === n) ?? null) : null;
}

/** A saved list read back; anything broken is dropped. PURE. */
export function parseVideoList(raw: string | null | undefined): TrainerVideo[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw) as unknown;
    if (!Array.isArray(v)) return [];
    return v.flatMap((x): TrainerVideo[] =>
      isObj(x) && videoUrlOk(x.url) && typeof x.name === 'string'
        ? [{ catalogKey: typeof x.catalogKey === 'string' ? x.catalogKey : null, name: x.name, url: x.url, byName: typeof x.byName === 'string' ? x.byName : null }]
        : [],
    );
  } catch {
    // quiet: a broken saved list is the same as none (the next gym read writes it again).
    return [];
  }
}
