/**
 * The small picture beside an exercise (Phase 2) — still, never animated, so long lists
 * stay calm. Tapping it opens the moving demo (`ExerciseDemoSheet`).
 *
 * Source, in order: the member's own photo (custom exercises), a play badge for their own
 * video, the bundled library picture, else the plain dumbbell mark the app used before.
 */
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { Icon } from '@/components/ui';
import { color } from '@/theme/tokens';

import { catalogEntry } from '../catalog/exerciseCatalog';
import { mediaFor } from '../catalog/media';
import { Glyph } from './TrackerGlyph';

export interface ThumbMedia {
  uri: string | null;
  type: 'image' | 'video' | null;
}

/** Does this exercise have anything to show when its picture is tapped? */
export function hasDemo(catalogKey: string | null | undefined, custom?: ThumbMedia | null): boolean {
  return Boolean(custom?.uri) || mediaFor(catalogKey) != null || (catalogEntry(catalogKey)?.steps.length ?? 0) > 0;
}

export function ExerciseThumb({
  catalogKey,
  name,
  size = 38,
  media,
  onPress,
}: {
  exerciseId?: string;
  catalogKey: string | null;
  name: string;
  size?: number;
  media?: ThumbMedia | null;
  /** Opens the demo. Omitted (or nothing to show) → a plain, non-tappable picture. */
  onPress?: () => void;
}) {
  const bundled = mediaFor(catalogKey);
  const tappable = onPress != null && hasDemo(catalogKey, media);
  const r = Math.round(size * 0.28);
  // The member's photo can be gone (replaced mid-workout, or a restore on another phone):
  // fall back to the library drawing or the plain mark instead of a blank square.
  const [failedUri, setFailedUri] = useState<string | null>(null);
  useEffect(() => setFailedUri(null), [media?.uri]);
  const ownPhoto = media?.uri && media.type === 'image' && failedUri !== media.uri ? media.uri : null;

  let body;
  if (ownPhoto) {
    body = (
      <Image
        source={{ uri: ownPhoto }}
        style={{ width: size, height: size, borderRadius: r }}
        contentFit="cover"
        onError={() => setFailedUri(ownPhoto)}
        accessibilityIgnoresInvertColors
      />
    );
  } else if (media?.uri && media.type === 'video') {
    body = (
      <View
        style={{
          width: size,
          height: size,
          borderRadius: r,
          backgroundColor: color.accentSoft,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Glyph name="play" size={Math.round(size * 0.45)} color={color.accent} />
      </View>
    );
  } else if (bundled) {
    // Light line drawing on the app's raised surface (calm on the dark theme).
    body = (
      <Image
        source={bundled.thumb}
        style={{
          width: size,
          height: size,
          borderRadius: r,
          backgroundColor: color.surfaceRaised,
          borderWidth: 1,
          borderColor: color.border,
        }}
        contentFit="contain"
        accessibilityIgnoresInvertColors
      />
    );
  } else {
    body = (
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color.accentSoft,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon name="dumbbell" size={Math.round(size * 0.47)} color={color.accent} />
      </View>
    );
  }

  if (!tappable) return body;
  return (
    <Pressable onPress={onPress} hitSlop={6} accessibilityRole="button" accessibilityLabel={`Show how to do ${name}`}>
      {body}
    </Pressable>
  );
}
