/**
 * F20: whether an exercise's page shows its start and end pictures at the top. PURE (tested).
 *
 * Nothing (null) when the exercise has no matched picture (the page looks as before), when the
 * member's own photo or video is set (theirs wins, as for the demo clip), or when the exercise
 * has an owner-approved moving clip — then the pictures are only the clip's stand-in when the
 * clip cannot be had (`asFallback`).
 */
import { clipFor } from '../clips/clipManifest';
import { picturesFor, type ExercisePictures } from './pictures';

export function pictureChoice(
  catalogKey: string | null | undefined,
  { hidden = false, asFallback = false }: { hidden?: boolean; asFallback?: boolean } = {},
): ExercisePictures | null {
  if (hidden) return null;
  if (!asFallback && clipFor(catalogKey)) return null;
  return picturesFor(catalogKey);
}
