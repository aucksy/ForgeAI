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
 * R-579: the smart app link with no gym (the Worker sends each phone to its own store: deploy/panel/appLink.js). With a gym,
 * the gym's invite link above is the smart link: it also opens an installed app straight on "Join <gym>".
 */
export const APP_LINK = `${INVITE_ORIGIN}/app`;

/**
 * R-579 "Share app link" on a member's page: a short WhatsApp message with the smart link, the gym's code included when the
 * gym is online. A member already on the app gets words for a new phone or a reinstall; anyone else the invite. PURE.
 */
export function appLinkMessage(gymName: string, joinCode: string | null | undefined, memberName?: string | null, onApp = false): string {
  const code = (joinCode ?? '').trim();
  if (!onApp && code) return inviteMessage(gymName, code, memberName);
  const hi = firstName(memberName);
  const gym = gymName.trim();
  const lines = [
    hi ? `Hi ${hi}!` : 'Hi!',
    onApp
      ? `Here is the MettleUp app link${gym ? ` from ${gym}` : ''}, in case you need to install the app again or use a new phone.`
      : `Get the free MettleUp app${gym ? ` from ${gym}` : ''} to track your workouts.`,
    '',
    'Tap to get the app:',
    code ? inviteLink(code) : APP_LINK,
  ];
  if (code) lines.push('', `Gym code: ${code.toUpperCase()}`);
  return lines.join('\n');
}

/**
 * R-513 Join online: the gym's "Become a member" page (public/join-online.html). Not /j/: the MettleUp app claims
 * /j/ and /c/ on a phone, and this page is for people with no app. R-539: `origin` is join.mettleup.fit once the
 * panel's Worker says so (linkOrigin.ts useJoinOrigin), outside the admin app; app.mettleup.fit otherwise. PURE.
 */
export function joinOnlineLink(joinCode: string, origin: string = INVITE_ORIGIN): string {
  return `${origin}/m/${encodeURIComponent(joinCode.trim().toUpperCase())}`;
}

/** R-513: the WhatsApp message with the "Become a member" link, for people who are not members yet. PURE. */
export function joinOnlineMessage(gymName: string, joinCode: string, origin: string = INVITE_ORIGIN, joinPay = false): string {
  const gym = gymName.trim() || 'our gym';
  return [
    'Hi!',
    // Fresh-eyes review (15 Nov 2026): "You pay at the gym desk" only while paying online on joining is off (JOIN_PAY).
    `Become a member of ${gym} online. Pick a plan and send your details.${joinPay ? '' : ' You pay at the gym desk.'}`,
    '',
    'Open this link to join:',
    joinOnlineLink(joinCode, origin),
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
