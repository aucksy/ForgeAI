/**
 * The live workout card's large icon (13 Oct 2026): the exercise's own picture — the member's
 * photo (never a video), else the library drawing's small square — as a string the native card
 * can read: a file / content uri, or in a release build the drawable the bundler made of the
 * drawing. Null when there is none, or it cannot be resolved (the card then has no picture).
 */
import { Image } from 'react-native';

import { mediaFor } from '../catalog/media';
import type { DraftExercise } from '../store/activeWorkoutStore';

export function liveCardImage(ex: Pick<DraftExercise, 'catalogKey' | 'mediaUri' | 'mediaType'> | null | undefined): string | null {
  if (!ex) return null;
  try {
    if (ex.mediaUri && ex.mediaType !== 'video') return ex.mediaUri;
    const thumb = mediaFor(ex.catalogKey)?.thumb;
    if (thumb == null) return null;
    const uri = Image.resolveAssetSource(thumb)?.uri;
    return typeof uri === 'string' && uri ? uri : null;
  } catch {
    return null;
  }
}
