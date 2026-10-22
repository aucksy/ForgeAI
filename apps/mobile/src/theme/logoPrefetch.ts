/**
 * Gym branding: fetch the gym's logo into the image cache AHEAD of the logo opening and the
 * header mark (after a join, and after each check with the gym), so the ~1.3 s opening shows the
 * logo instead of an empty frame while it downloads. Same cache the two of them read
 * (expo-image, memory + disk). Quiet: a failure only means the opening shows the gym's name.
 */
import { Image } from 'expo-image';

import { pictureUrl } from '@/cloud/picture';

let last: string | null = null;

export function prefetchGymLogo(url: string | null | undefined): void {
  if (!url || url === last) return;
  last = url;
  try {
    // R-55: the same address the opening and the mark load it from (cloud/picture.ts).
    void Image.prefetch(pictureUrl(url), 'memory-disk').catch(() => {
      last = null;
    });
  } catch {
    last = null;
  }
}
