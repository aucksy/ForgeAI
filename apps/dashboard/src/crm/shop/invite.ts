/**
 * Invite link + front-desk QR (14 Oct 2026). ONE link per gym — the same in every WhatsApp invite
 * and on the printed poster: https://app.mettleup.fit/j/<JOIN CODE> (MettleUp, R-105; links sent and
 * posters printed before carry https://forgeai.aakashpahuja.in/j/..., which works for good).
 *  - On a phone with the MettleUp app, Android opens the app on "Join <gym>" (one tap to join).
 *  - Without the app, the link's web page (deploy/panel/join.html) shows the gym, how to get the
 *    app, and the code to type as the fallback.
 * No name or number rides in the link: it is forwarded, printed and photographed. The app fills
 * in the member's name from their own profile.
 *
 * The app reads the same links (apps/mobile src/shop/pendingInvite.ts — keep the two in step).
 */

import { phoneDigits, validateE164 } from '../logic/members';

export const INVITE_ORIGIN = 'https://app.mettleup.fit';

/** The gym's invite link. PURE. */
export function inviteLink(joinCode: string): string {
  return `${INVITE_ORIGIN}/j/${encodeURIComponent(joinCode.trim().toUpperCase())}`;
}

/** The first word of a name, for a friendly "Hi Rahul". PURE. */
export function firstName(fullName: string | null | undefined): string {
  return (fullName ?? '').trim().split(/\s+/)[0] ?? '';
}

/**
 * The WhatsApp message: one short English line, the link on its own line so WhatsApp makes it tappable, and the code last as the
 * way in when the link will not open. PURE.
 */
export function inviteMessage(gymName: string, joinCode: string, memberName?: string | null): string {
  const hi = firstName(memberName);
  const gym = gymName.trim() || 'our gym';
  return [
    hi ? `Hi ${hi}!` : 'Hi!',
    `Join ${gym} in the MettleUp app: track your workouts and order from the gym shop.`,
    '',
    `Tap to join:`,
    inviteLink(joinCode),
    '',
    `Gym code: ${joinCode.trim().toUpperCase()}`,
  ].join('\n');
}

/**
 * A wa.me link that opens WhatsApp with the message typed in: to one member's number, or with no
 * number (WhatsApp then asks who to send it to — a person, a group or the gym's broadcast list).
 * A number that is not a full international one (+ and country code) is left out rather than sent
 * to the wrong country (wa.me reads "9876543210" as Iran, +98). PURE.
 */
export function whatsAppHref(text: string, phone?: string | null): string {
  const e164 = phone ? validateE164(phone) : null;
  return `https://wa.me/${e164 ? phoneDigits(e164) : ''}?text=${encodeURIComponent(text)}`;
}
