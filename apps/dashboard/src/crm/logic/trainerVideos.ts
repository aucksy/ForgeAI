/**
 * F148 "The gym's own form videos": a trainer's video link on an exercise. PURE.
 *
 * Only a YouTube link reaches a member: https, host youtube.com / www.youtube.com / m.youtube.com /
 * youtu.be, no user@host, no port, at most 300 characters. The server keeps the same rule
 * (`_video_url_ok` in supabase/migrations/0051_gym_videos_and_wod.sql) and the phone checks it again
 * before it opens anything (apps/mobile/src/shop/trainerVideo.ts). A link pasted without "https://", or
 * with "http://", is saved as https; the host is written in small letters.
 */

export const VIDEO_URL_MAX = 300;

const WATCH = /^https:\/\/((www|m)\.)?youtube\.com\/[A-Za-z0-9_./?=&%#:+~-]*$/;
const SHORT = /^https:\/\/youtu\.be\/[A-Za-z0-9_-]+([?#][A-Za-z0-9_./?=&%#:+~-]*)?$/;

/** True when the phone may open this link (the server's rule, exactly). */
export function videoUrlOk(u: unknown): u is string {
  return typeof u === 'string' && u.length >= 10 && u.length <= VIDEO_URL_MAX && (WATCH.test(u) || SHORT.test(u));
}

/**
 * What a trainer typed -> the link to save. '' (blank) -> null. Anything that is not a YouTube link ->
 * 'bad' (the builder then says so in plain words).
 */
export function cleanVideoUrl(typed: string | null | undefined): string | null | 'bad' {
  const t = (typed ?? '').trim();
  if (!t) return null;
  const withScheme = /^https?:\/\//i.test(t) ? t.replace(/^http:\/\//i, 'https://') : `https://${t}`;
  // The host in small letters (the path keeps its case: a video id is case-sensitive).
  const m = /^https:\/\/([^/?#]*)(.*)$/i.exec(withScheme);
  if (!m) return 'bad';
  const out = `https://${m[1].toLowerCase()}${m[2]}`;
  return videoUrlOk(out) ? out : 'bad';
}

/** The builder's line for a link that is not allowed. */
export const VIDEO_URL_PROBLEM = 'the video link must be a YouTube link (youtube.com or youtu.be).';
