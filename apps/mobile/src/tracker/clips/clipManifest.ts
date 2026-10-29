/**
 * R-170: the exercise demo clips the owner approved, and where each one is downloaded from.
 *
 * A clip is a short looping film of the grey 3D athlete doing the exercise (made by
 * tools/exercise-anim, one a day). It is NOT bundled in the app: the files sit on the public
 * GitHub release "exercise-clips" and the phone downloads them the first time the member opens
 * that exercise, then keeps them (clipCache.ts).
 *
 * ADDING AN APPROVED CLIP = ONE LINE BELOW: `<catalog key>: <version>`, exactly as the clip's row
 * in tools/exercise-anim/QUEUE.md says "approved (vN)". A test (test/tracker/exerciseClips.test.ts)
 * fails when this list and QUEUE.md's approved rows differ. A newer version of a clip (v7 for v6)
 * is the same one-line change: phones fetch the new files and delete the old ones.
 *
 * PURE: no native imports, so the tests can read it.
 */

/** Approved clips: catalog key -> version on the release. Keep in QUEUE.md order. */
export const CLIP_VERSIONS: Readonly<Record<string, number>> = {
  incline_dumbbell_press: 6,
  lateral_raise: 6,
};

/** The public release that holds every clip's files. */
export const CLIP_BASE_URL = 'https://github.com/aucksy/ForgeAI/releases/download/exercise-clips/';

export interface ClipFiles {
  key: string;
  version: number;
  /** The looping animated WebP (~560 KB). */
  clipName: string;
  clipUrl: string;
  /** One still frame (~10 KB): shown while the clip downloads, and alone under "reduce motion". */
  posterName: string;
  posterUrl: string;
}

/** The files for an exercise's clip, or null when it has no approved clip (it looks as before). */
export function clipFor(catalogKey: string | null | undefined): ClipFiles | null {
  if (!catalogKey) return null;
  if (!Object.prototype.hasOwnProperty.call(CLIP_VERSIONS, catalogKey)) return null;
  const version = CLIP_VERSIONS[catalogKey];
  if (!Number.isInteger(version) || version < 1) return null;
  const clipName = `${catalogKey}.v${version}.webp`;
  const posterName = `${catalogKey}.v${version}.poster.webp`;
  return {
    key: catalogKey,
    version,
    clipName,
    clipUrl: CLIP_BASE_URL + clipName,
    posterName,
    posterUrl: CLIP_BASE_URL + posterName,
  };
}

/** True when the exercise has an approved clip. */
export function hasClip(catalogKey: string | null | undefined): boolean {
  return clipFor(catalogKey) != null;
}

/**
 * The approved rows of QUEUE.md (`| # | key | name | equipment | approved (vN) |`) as
 * key -> version. PURE (used by the test that keeps CLIP_VERSIONS in step with the queue).
 */
export function approvedInQueue(markdown: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const line of markdown.split(/\r?\n/)) {
    if (!line.trim().startsWith('|')) continue;
    const cells = line.split('|').map((c) => c.trim());
    // ['', '#', 'key', 'name', 'equipment', 'status', '']
    const key = cells[2];
    const status = cells[5] ?? '';
    const m = /^approved\s*\(v(\d+)\)/i.exec(status);
    if (key && m) out[key] = Number(m[1]);
  }
  return out;
}
