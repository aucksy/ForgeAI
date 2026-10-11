/**
 * Redesign R2 — what Hevy's Profile has and ours did not: a photo, a short bio and one link
 * (member schema v2 columns on `user_profile`; the name stays where it always was). Written
 * through the one write queue; the rules for what is kept are PURE and tested.
 */
import { getDb } from '@/db';
import { enqueueWrite } from '@/db/writeQueue';

export interface ProfileExtras {
  /** The photo in the app's own `profile-photo/` folder, or null (the first letter shows). */
  photoUri: string | null;
  bio: string | null;
  link: string | null;
}

/** Hevy's bio limit. */
export const BIO_MAX = 150;
export const LINK_MAX = 200;

const EMPTY: ProfileExtras = { photoUri: null, bio: null, link: null };

/** The bio as kept: trimmed, at most 3 lines and 150 characters; blank → null. PURE. */
export function cleanBio(raw: string | null | undefined): string | null {
  const lines = (raw ?? '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.replace(/[ \t]+/g, ' ').trim());
  const kept = lines.filter((l, i) => l.length > 0 || (i > 0 && lines[i - 1].length > 0)).slice(0, 3).join('\n').trim();
  return kept.length > 0 ? kept.slice(0, BIO_MAX).trim() : null;
}

/**
 * A link as kept, or why not. Checked only enough to open it: one word with a dot in its host,
 * "https://" added when no scheme was typed; only http(s). Blank → null (removed). PURE.
 */
export function cleanLink(raw: string | null | undefined): { link: string | null; error: string | null } {
  const t = (raw ?? '').trim();
  if (!t) return { link: null, error: null };
  if (/\s/.test(t)) return { link: null, error: 'A link has no spaces.' };
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(t) ? t : `https://${t}`;
  const m = /^(https?):\/\/([^/?#]+)(.*)$/i.exec(withScheme);
  if (!m) return { link: null, error: 'Use a web link, like instagram.com/yourname.' };
  const host = m[2].replace(/^[^@]*@/, '');
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+(:\d+)?$/i.test(host)) return { link: null, error: 'Use a web link, like instagram.com/yourname.' };
  if (withScheme.length > LINK_MAX) return { link: null, error: 'That link is too long.' };
  return { link: withScheme, error: null };
}

/** The link as shown on the Profile: no "https://", no trailing slash. PURE. */
export function linkLabel(link: string): string {
  return link.replace(/^https?:\/\//i, '').replace(/\/$/, '');
}

export async function getProfileExtras(): Promise<ProfileExtras> {
  const row = await getDb().getFirstAsync<{ photo_uri: string | null; bio: string | null; link: string | null }>(
    'SELECT photo_uri, bio, link FROM user_profile LIMIT 1',
  );
  if (!row) return EMPTY;
  return { photoUri: row.photo_uri ?? null, bio: row.bio ?? null, link: row.link ?? null };
}

const COLUMN: Record<keyof ProfileExtras, string> = { photoUri: 'photo_uri', bio: 'bio', link: 'link' };

/** Save some of them (queued — never call from inside another queued job). */
export async function setProfileExtras(patch: Partial<ProfileExtras>): Promise<void> {
  const keys = (Object.keys(patch) as (keyof ProfileExtras)[]).filter((k) => patch[k] !== undefined);
  if (keys.length === 0) return;
  const sets = keys.map((k) => `${COLUMN[k]} = ?`).join(', ');
  await enqueueWrite(() => getDb().runAsync(`UPDATE user_profile SET ${sets}`, keys.map((k) => patch[k] ?? null)));
}
