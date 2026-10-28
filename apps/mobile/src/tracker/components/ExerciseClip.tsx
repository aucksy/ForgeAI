/**
 * R-170: the looping demo clip at the top of an exercise's page and in its "how to" sheet.
 *
 * Only for exercises with an owner-approved clip (clips/clipManifest.ts); every other exercise
 * renders nothing here and looks exactly as before. The first visit downloads the clip (a still
 * frame first, ~10 KB, then the moving clip, ~560 KB) and keeps it on the phone; later visits play
 * it offline. Silent and without controls (it is a picture), looping. Under the phone's "Remove
 * animations" / "Reduce motion" only the still frame is shown (and the moving clip is never
 * downloaded). No internet, or a failed download: nothing is shown (the error is logged).
 *
 * Played as an animated WebP by expo-image: on Android its Glide pipeline carries the
 * APNG4Android WebP decoder (expo-image's android/build.gradle: glide-plugin 3.0.5), which is
 * independent of React Native's own `expo.webp.animated` Fresco switch (off in gradle.properties).
 */
import { Image } from 'expo-image';
import { useEffect, useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { useReduceMotion } from '@/components/ui/useReduceMotion';
import { color, radius } from '@/theme/tokens';

import { clipFor } from '../clips/clipManifest';
import { clipCache } from '../clips/clipFs';

/** The clips are drawn on white; the frame keeps that white edge to edge. */
const CLIP_BACKGROUND = '#FFFFFF';

type Got = { path: string | null; done: boolean };
const WAITING: Got = { path: null, done: false };

/** The local poster and clip of an exercise (downloaded the first time). */
export function useExerciseClip(catalogKey: string | null | undefined, moving: boolean) {
  const files = clipFor(catalogKey);
  const [poster, setPoster] = useState<Got>(WAITING);
  const [clip, setClip] = useState<Got>(WAITING);
  const key = files?.key ?? null;
  const version = files?.version ?? 0;

  useEffect(() => {
    setPoster(WAITING);
    setClip(WAITING);
    const f = clipFor(key);
    if (!f) return;
    let alive = true;
    const cache = clipCache();
    // clipCache() never rejects: a failure is logged there and answers null.
    void cache.poster(f).then((path) => {
      if (alive) setPoster({ path, done: true });
    });
    if (moving) {
      void cache.clip(f).then((path) => {
        if (alive) setClip({ path, done: true });
      });
    } else {
      setClip({ path: null, done: true });
    }
    return () => {
      alive = false;
    };
  }, [key, version, moving]);

  return { hasClip: files != null, poster, clip };
}

export function ExerciseClip({
  catalogKey,
  name,
  height = 220,
  hidden = false,
  marginBottom = 0,
  fallback = null,
}: {
  catalogKey: string | null | undefined;
  name: string;
  height?: number;
  /** The member's own photo or video wins over the library clip: nothing is shown then. */
  hidden?: boolean;
  /** Room under the frame (none when nothing is shown, so the page is as before). */
  marginBottom?: number;
  /** Shown instead when the clip cannot be had (the how-to sheet falls back to the drawings). */
  fallback?: ReactNode;
}) {
  const reduced = useReduceMotion();
  const { hasClip, poster, clip } = useExerciseClip(hidden ? null : catalogKey, !reduced);
  if (!hasClip || hidden) return null;

  const shown = clip.path ?? poster.path;
  const loading = !shown && (!poster.done || !clip.done);
  // Nothing could be had (offline on the first visit): no frame, no broken picture.
  if (!shown && !loading) return <>{fallback}</>;

  const frame = {
    height,
    borderRadius: radius.md,
    overflow: 'hidden' as const,
    borderWidth: 1,
    borderColor: color.border,
    marginBottom,
  };
  if (!shown) {
    // A calm, empty frame while the first download runs.
    return <View style={[frame, { backgroundColor: color.surfaceSunken }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />;
  }
  const moving = clip.path != null;
  return (
    <View
      style={[frame, { backgroundColor: CLIP_BACKGROUND }]}
      accessible
      accessibilityRole="image"
      accessibilityLabel={moving ? `Moving demo of ${name}` : `Picture of ${name}`}
      testID="exercise-clip"
    >
      <Image
        source={{ uri: shown }}
        placeholder={moving && poster.path ? { uri: poster.path } : undefined}
        style={{ width: '100%', height: '100%' }}
        contentFit="contain"
        autoplay
        transition={150}
        cachePolicy="memory"
        recyclingKey={shown}
      />
    </View>
  );
}
