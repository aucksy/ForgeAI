/**
 * "Scan the poster" / "Check in" on the Gym tab and in Settings → Join your gym. The gym's poster at
 * the desk carries a QR code with its check-in link (https://<gym-link host>/c/CODE); an invite QR
 * carries /j/CODE. Both open the matching screen (CheckInScreen, or join that gym).
 *
 * R-228 (owner, 30 Oct 2026: "It launches the phone camera and takes a picture"): the button used to
 * send Android's photo-camera action and hope the camera app read QR codes. Many do not in photo
 * mode, so members only took a picture. MettleUp now has its own scanner (ScanPosterScreen, expo-camera,
 * QR only, live camera only: R-152, never a saved photo). This file is the PURE half.
 */
import { checkInCodeFromUrl } from './checkIn';
import { inviteCodeFromUrl } from './pendingInvite';

/** Where a scanned QR goes: the check-in screen, the join screen, or null when it is not a gym's. PURE. */
export function posterRoute(data: string | null | undefined): `/c/${string}` | `/j/${string}` | null {
  const checkIn = checkInCodeFromUrl(data);
  if (checkIn) return `/c/${checkIn}`;
  const invite = inviteCodeFromUrl(data);
  if (invite) return `/j/${invite}`;
  return null;
}

/** The line under the button: what happens when it is tapped. */
export const SCAN_POSTER_LINE = "Point your camera at the QR code on the poster at your gym's desk.";

/** The words on the scanner screen (member-words skill, R-98). */
export const SCAN_WORDS = {
  title: 'Scan the gym poster',
  aim: "Point your camera at the QR code on the poster at your gym's desk.",
  notOurs: "Wrong QR code. Scan the MettleUp poster at your gym's desk.",
  asking: 'MettleUp needs your camera to scan the poster and check you in.',
  allow: 'Allow camera',
  camOff: 'Camera is off for MettleUp. Turn it on in Settings, or check in at the desk.',
  openSettings: 'Open Settings',
  noCamera: "The camera didn't start. Close this screen and try again, or check in at the desk.",
} as const;
