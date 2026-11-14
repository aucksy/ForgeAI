/**
 * F20: whether an exercise's page shows its start and end pictures at the top. PURE (tested).
 *
 * Nothing (null) when the exercise has no matched picture (the page looks as before), when the
 * member's own photo or video is set (theirs wins, as for the demo clip), or when the exercise
 * has an owner-approved moving clip — then the pictures are only the clip's stand-in when the
 * clip cannot be had (`asFallback`).
 */
import type { ImageSourcePropType } from 'react-native';

import { clipFor } from '../clips/clipManifest';
import { mediaFor } from './media';
import { picturesFor, type ExercisePictures } from './pictures';

/**
 * R-491 (owner, 14 Nov 2026: one look everywhere): the small square picture for an exercise in lists, the
 * "How to do it" card and the live workout card. The orange-tank close-up wins; the old line drawing
 * (Everkinetic) is used only when there is no orange-tank picture. `drawing` = it is a line drawing (shown
 * on the raised surface, tinted in the light look, and credited).
 */
export function thumbChoice(catalogKey: string | null | undefined): { source: ImageSourcePropType; drawing: boolean } | null {
  const pics = picturesFor(catalogKey);
  if (pics) return { source: pics.thumb, drawing: false };
  const drawn = mediaFor(catalogKey);
  return drawn ? { source: drawn.thumb, drawing: true } : null;
}

/** R-491: the demo sheet's two frames: the orange-tank start and end (end null for a hold), else the line drawing. */
export function demoFrames(
  catalogKey: string | null | undefined,
): { frames: readonly [ImageSourcePropType, ImageSourcePropType | null]; drawing: boolean } | null {
  const pics = picturesFor(catalogKey);
  if (pics) return { frames: [pics.start, pics.end], drawing: false };
  const drawn = mediaFor(catalogKey);
  return drawn ? { frames: drawn.frames, drawing: true } : null;
}

export function pictureChoice(
  catalogKey: string | null | undefined,
  { hidden = false, asFallback = false }: { hidden?: boolean; asFallback?: boolean } = {},
): ExercisePictures | null {
  if (hidden) return null;
  if (!asFallback && clipFor(catalogKey)) return null;
  return picturesFor(catalogKey);
}
