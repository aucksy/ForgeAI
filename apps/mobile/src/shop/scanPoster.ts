/**
 * "Scan the poster" / "Check in" on the Gym tab (Release A, A3, docs/ux/MEMBER-APP-MAP.md). The gym's
 * poster at the desk carries a QR code with its check-in link (https://forgeai.aakashpahuja.in/c/CODE),
 * which opens ForgeAI's check-in screen (CheckInScreen: check in, or join that gym first).
 *
 * Until Release A there was no button for it at all: a member had to know to open the camera. Now the
 * button opens the PHONE'S OWN camera, which reads QR codes on Android phones (Pixel, Samsung and most
 * others show the link to tap). No camera code inside ForgeAI and no camera permission: a scanner of
 * our own would need a new native part and a new build (noted for a later release).
 * The manifest lists the camera action under <queries> (Android 11+ hides apps it does not list).
 */
import { Linking, Platform } from 'react-native';

import { tell } from '@/lib/tell';

/** Android's "open the camera app" action. */
export const CAMERA_ACTION = 'android.media.action.STILL_IMAGE_CAMERA';

/** The line under the button: what happens, so the camera opening is never a surprise. */
export const SCAN_POSTER_LINE = "Your phone's camera opens. Point it at the QR code on the poster at your gym's desk, then tap the link it shows.";

/** Shown when no camera app opened. */
export const NO_CAMERA_TITLE = "Couldn't open the camera";
export const NO_CAMERA_BODY = "Open your phone's camera app, point it at the QR code on the poster, and tap the link it shows to come back to ForgeAI.";

/** Open the phone's camera; when it cannot, say how to do it by hand. Never throws. */
export async function openPosterScan(): Promise<void> {
  try {
    if (Platform.OS !== 'android') throw new Error('camera action is Android only');
    await Linking.sendIntent(CAMERA_ACTION);
  } catch (e) {
    console.warn('[gym] the camera did not open for the poster scan', e);
    await tell(NO_CAMERA_TITLE, NO_CAMERA_BODY);
  }
}
