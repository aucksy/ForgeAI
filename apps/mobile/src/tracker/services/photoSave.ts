/**
 * "Save to phone gallery" (audit PG-17, owner decision D11). The app has no gallery module
 * (expo-media-library is not installed), so the photo goes out through the phone's share list,
 * where the member picks "Save image", Photos or Files. The screen says so in those words.
 */
import * as Sharing from 'expo-sharing';

import { photoExtension } from './progressPhotos';

/** The picture's type, for the share list. PURE. */
export function photoMime(uri: string): string {
  const ext = photoExtension(uri);
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'heic' || ext === 'heif') return 'image/heic';
  return 'image/jpeg';
}

/** Hand the photo to the share list. false when this phone has no share list. */
export async function savePhotoToGallery(uri: string): Promise<boolean> {
  if (!(await Sharing.isAvailableAsync())) return false;
  await Sharing.shareAsync(uri, { mimeType: photoMime(uri), dialogTitle: 'Save to phone gallery' });
  return true;
}
