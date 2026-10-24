/**
 * QR self check-in (15 Oct 2026; research: Audit/crm-research/RESEARCH.md "QR check-in | Must").
 * The gym prints ONE check-in poster: its QR is https://app.mettleup.fit/c/<JOIN CODE>
 * (MettleUp, R-105; posters printed before carry https://forgeai.aakashpahuja.in/c/..., which works for good).
 *  - A member scans it with the phone camera; Android opens the MettleUp app on "Check in at <gym>"
 *    and one tap (none, once their number is known) records today's visit — server side, in the
 *    gym's online records (supabase/migrations/0015_qr_checkin.sql member_check_in), source 'app'.
 *  - The register shows it on its next pull, with a small "App" tag.
 *  - Without the app, the link's web page (apps/dashboard/public/checkin.html, served by
 *    deploy/panel/worker.js) says to open it in the app, and how to get the app.
 * The member is matched to the roster by MOBILE NUMBER, so a member the desk has not added (or
 * added with another number) is told to ask the desk.
 *
 * The app reads the same link (apps/mobile src/shop/checkIn.ts — keep the two in step).
 */

import { INVITE_ORIGIN } from './invite';
import type { PosterWords } from './InviteScreen';

/** The gym's check-in link (the poster's QR). PURE. */
export function checkInLink(joinCode: string): string {
  return `${INVITE_ORIGIN}/c/${encodeURIComponent(joinCode.trim().toUpperCase())}`;
}

/** The check-in poster's words. */
export const CHECKIN_POSTER: PosterWords = {
  lead: 'Scan to check in',
  steps: ['Open your phone camera', 'Scan this code', 'The MettleUp app checks you in'],
  codeLine: () => 'No app, or not on the gym list yet? Check in at the desk.',
  file: 'checkin-poster',
};
