/**
 * Invite link: a gym's link (https://forgeai.aakashpahuja.in/j/RAMS01) tapped on a phone that has
 * not been set up yet. The first start shows the welcome flow INSTEAD of the app's screens
 * (app/_layout.tsx), so the link's own screen cannot open yet: the code is kept here and the
 * "Join <gym>" screen opens once the welcome flow is done. Memory only — a link is a one-off tap.
 */

/** Where invite links live. The panel builds the same links (apps/dashboard src/crm/shop/invite.ts). */
export const INVITE_HOST = 'forgeai.aakashpahuja.in';

const CODE = /^[A-Za-z0-9]{6}$/;

/** The gym code in an invite URL (https://<INVITE_HOST>/j/CODE or forgeai://j/CODE), else null. PURE. */
export function inviteCodeFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = /^(?:https?:\/\/([^/?#]+)|forgeai:\/)\/j\/([^/?#]+)/i.exec(url.trim());
  if (!m) return null;
  if (m[1] !== undefined && m[1].toLowerCase() !== INVITE_HOST) return null;
  let raw = m[2];
  try {
    raw = decodeURIComponent(raw);
  } catch {
    return null;
  }
  return CODE.test(raw) ? raw.toUpperCase() : null;
}

let pending: string | null = null;

export function setPendingInvite(code: string | null): void {
  pending = code;
}

/** The waiting code, once: whoever takes it opens the screen. */
export function takePendingInvite(): string | null {
  const c = pending;
  pending = null;
  return c;
}
