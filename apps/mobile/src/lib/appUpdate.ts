/**
 * "A new version is ready" (launch plan C6). During the trial members install the APK from the
 * GitHub release page, so nothing tells them about a fix. The app asks GitHub for the latest
 * published release (drafts and pre-releases are never "latest"), at most once every 6 hours, and
 * the Workout tab shows a card when that release is newer than the app on the phone.
 *
 * "Get it" opens the release's phone APK in the browser; Android installs it over the old one and
 * keeps every workout (same signing key). "Later" hides the card until the NEXT version.
 * A copy installed from Google Play never shows the card (lib/installSource.ts, 0.56.0): a Play
 * install cannot take the GitHub APK, and Play updates it itself.
 */
import { getMeta, setMeta } from '@/db';
import { enqueueWrite } from '@/db/writeQueue';
import { fetchWithTimeout } from '@/lib/fetchTimeout';

export const LATEST_URL = 'https://api.github.com/repos/aucksy/ForgeAI/releases/latest';
const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;
const SEEN_KEY = 'update_seen'; // JSON: { at, version, url }
const LATER_KEY = 'update_later'; // the version "Later" was pressed for

export type AppUpdate = { version: string; url: string };

/** "v0.49.0" / "0.49.0" -> [0, 49, 0]; null when it is not a plain version. PURE. */
export function versionParts(v: string | null | undefined): number[] | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec((v ?? '').trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** True only when `latest` is a plain version newer than `current`. PURE. */
export function isNewer(latest: string | null | undefined, current: string | null | undefined): boolean {
  const a = versionParts(latest);
  const b = versionParts(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
}

type Release = { tag_name?: unknown; assets?: { name?: unknown; browser_download_url?: unknown }[] };

/**
 * The phone APK's file name in a GitHub release: "mettleup-v0.56.0.apk" (0.56.0 on; the release workflow
 * publishes this exact name, scripts/ci/test_release_checks.py checks the two agree). Older ForgeAI apps
 * (com.forgeai.app) look for "forgeai-<tag>.apk" and must never find a MettleUp release: it is another
 * package, so "updating" would install a second, empty app. PURE.
 */
export function phoneApkName(tag: string): string {
  return `mettleup-${tag}.apk`;
}

/** The phone APK of a GitHub release ("mettleup-v0.56.0.apk", never the watch APK). PURE. */
export function releaseUpdate(release: Release): AppUpdate | null {
  const tag = typeof release.tag_name === 'string' ? release.tag_name : '';
  if (!versionParts(tag)) return null;
  const apk = (release.assets ?? []).find((a) => a.name === phoneApkName(tag));
  const url = typeof apk?.browser_download_url === 'string' ? apk.browser_download_url : '';
  if (!url.startsWith('https://github.com/')) return null;
  return { version: tag.replace(/^v/, ''), url };
}

/** What the card shows: the newer release, unless "Later" was pressed for that version. PURE. */
export function updateToShow(seen: AppUpdate | null, current: string | null | undefined, later: string | null): AppUpdate | null {
  if (!seen || !isNewer(seen.version, current)) return null;
  return later === seen.version ? null : seen;
}

/** A saved value, or null when the phone's database cannot be read (logged). */
async function readMeta(key: string): Promise<string | null> {
  try {
    return await getMeta(key);
  } catch (e) {
    console.warn('[update] could not read', key, e);
    return null;
  }
}

function readSeen(raw: string | null): (AppUpdate & { at: number }) | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<AppUpdate & { at: number }>;
    return typeof v.version === 'string' && typeof v.url === 'string' && typeof v.at === 'number' ? (v as AppUpdate & { at: number }) : null;
  } catch {
    return null; // quiet: a broken saved value is the same as none; the next check rewrites it
  }
}

/** The update to offer, asking GitHub when the last answer is older than 6 hours. Never throws. */
export async function findUpdate(current: string | null | undefined, now = Date.now()): Promise<AppUpdate | null> {
  const seen = await findLatest(current, now);
  const later = await readMeta(LATER_KEY);
  return updateToShow(seen, current, later);
}

/**
 * R-260: the newest release when it is newer than this app, with no "Later" applied (the pop-up and the
 * card keep their own reminders now: lib/updatePrompt.ts). Never throws.
 */
export async function findLatest(current: string | null | undefined, now = Date.now()): Promise<AppUpdate | null> {
  let seen = readSeen(await readMeta(SEEN_KEY));
  if (!seen || now - seen.at > CHECK_EVERY_MS) {
    try {
      const res = await fetchWithTimeout(LATEST_URL, { headers: { Accept: 'application/vnd.github+json' } });
      if (res.ok) {
        const found = releaseUpdate((await res.json()) as Release);
        const next = found ? { ...found, at: now } : { version: '', url: '', at: now };
        seen = next;
        await enqueueWrite(() => setMeta(SEEN_KEY, JSON.stringify(next)));
      } else {
        console.warn('[update] release check answered', res.status);
      }
    } catch (e) {
      console.warn('[update] release check failed', e); // offline: keep the last answer
    }
  }
  return updateToShow(seen && seen.version ? { version: seen.version, url: seen.url } : null, current, null);
}

/** R-260: a saved value for the update reminders, or null (logged) when the database cannot say. */
export async function readUpdateMeta(key: string): Promise<string | null> {
  return readMeta(key);
}

export async function writeUpdateMeta(key: string, value: string): Promise<void> {
  await enqueueWrite(() => setMeta(key, value));
}

export async function updateLater(version: string): Promise<void> {
  await enqueueWrite(() => setMeta(LATER_KEY, version));
}
