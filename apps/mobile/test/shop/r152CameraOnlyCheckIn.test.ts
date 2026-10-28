/**
 * R-152 (owner, 28 Oct 2026): scanning the gym's check-in QR is camera only — never "pick a photo
 * from the gallery" (a saved photo or screenshot of the poster would check a member in from home).
 * MettleUp has no scanner of its own: "Scan the poster" opens the phone's camera app straight in
 * photo mode. This guard fails if any check-in / scan code gains a gallery or file path.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { CAMERA_ACTION } from '@/shop/scanPoster';

const root = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

/** Every source file of the gym tab and the check-in link screen. */
function files(dir: string): string[] {
  return readdirSync(join(root, dir)).flatMap((n) => {
    const p = `${dir}/${n}`;
    return statSync(join(root, p)).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(n) ? [p] : [];
  });
}
const SCAN_CODE = [...files('src/shop'), ...files('src/app/c'), 'src/components/settings/JoinGymCard.tsx'];

/** Ways a picture could come from the gallery or a file instead of the live camera. */
const GALLERY = [
  /expo-image-picker/,
  /launchImageLibrary/,
  /ImagePicker/,
  /expo-document-picker/,
  /scanFromURLAsync/,
  /BarCodeScanner\.scanFromURL/,
  /android\.intent\.action\.(GET_CONTENT|PICK|OPEN_DOCUMENT)/,
  /\bgallery\b/i,
  /photo library/i,
];

describe('R-152: the check-in scan is camera only', () => {
  it('"Scan the poster" opens the camera app in photo mode, nothing else', () => {
    expect(CAMERA_ACTION).toBe('android.media.action.STILL_IMAGE_CAMERA');
  });

  it('no check-in or scan code offers the gallery, a file or a saved photo', () => {
    expect(SCAN_CODE.length).toBeGreaterThan(5);
    const hits = SCAN_CODE.flatMap((f) => GALLERY.filter((re) => re.test(read(f))).map((re) => `${f}: ${re}`));
    expect(hits).toEqual([]);
  });

  it('the check-in screen is reached only from the poster link, never from a picked picture', () => {
    expect(read('src/app/c/[code].tsx')).not.toMatch(/picker|library|base64|readAsString/i);
  });
});
