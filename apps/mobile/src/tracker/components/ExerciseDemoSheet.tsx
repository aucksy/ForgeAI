/**
 * How to do an exercise (Phase 2): the moving demo and a few short steps, behind a tap.
 *
 * The library pictures are two drawings — the start and the end of the movement — that
 * fade into each other on a loop, so the member sees the motion without a heavy video.
 * A custom exercise shows the member's own photo, or plays their own video on a silent
 * loop. Opened from the small picture on the workout card and in the exercise lists;
 * nothing here ever plays on its own in a list.
 */
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Linking, Text, View } from 'react-native';
import type { ImageSourcePropType } from 'react-native';

import { color, radius, space, type } from '@/theme/tokens';

import { catalogEntry } from '../catalog/exerciseCatalog';
import { MEDIA_CREDIT, MEDIA_LICENCE_URL, mediaFor } from '../catalog/media';
import { getTrackerExercise } from '../db/exerciseInfo';
import type { ThumbMedia } from './ExerciseThumb';
import { TrackerSheet } from './TrackerSheet';

/** Two-frame loop: hold the start, fade to the end, hold, fade back. */
export function FrameLoop({ frames, height }: { frames: readonly [ImageSourcePropType, ImageSourcePropType]; height: number }) {
  const end = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const fade = (to: number) =>
      Animated.timing(end, { toValue: to, duration: 260, easing: Easing.inOut(Easing.quad), useNativeDriver: true });
    const loop = Animated.loop(
      Animated.sequence([Animated.delay(650), fade(1), Animated.delay(650), fade(0)]),
    );
    loop.start();
    return () => loop.stop();
  }, [end]);
  const box = { position: 'absolute' as const, left: 0, right: 0, top: 0, height };
  return (
    <View
      style={{
        height,
        borderRadius: radius.md,
        overflow: 'hidden',
        backgroundColor: color.surfaceSunken,
        borderWidth: 1,
        borderColor: color.border,
      }}
      accessibilityRole="image"
      accessibilityLabel="Moving demo of the exercise"
    >
      <Image source={frames[0]} style={box} contentFit="contain" />
      <Animated.View style={[box, { opacity: end }]}>
        <Image source={frames[1]} style={{ width: '100%', height }} contentFit="contain" />
      </Animated.View>
    </View>
  );
}

function LoopingVideo({ uri, height }: { uri: string; height: number }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });
  return (
    <View style={{ height, borderRadius: radius.md, overflow: 'hidden', backgroundColor: '#000000' }}>
      <VideoView player={player} style={{ width: '100%', height }} contentFit="contain" nativeControls={false} />
    </View>
  );
}

export function ExerciseDemoSheet({
  visible,
  exerciseId,
  catalogKey,
  name,
  media,
  onClose,
}: {
  visible: boolean;
  /** Used to look up the member's own photo/video when `media` isn't passed. */
  exerciseId?: string;
  catalogKey: string | null;
  name: string;
  media?: ThumbMedia | null;
  onClose: () => void;
}) {
  // Compared by value: callers may pass a fresh object on every render.
  const passed = media !== undefined;
  const passedUri = media?.uri ?? null;
  const passedType = media?.type ?? null;
  const [own, setOwn] = useState<ThumbMedia | null>(passed ? { uri: passedUri, type: passedType } : null);
  useEffect(() => {
    if (!visible) return;
    if (passed) {
      setOwn({ uri: passedUri, type: passedType });
      return;
    }
    if (!exerciseId) return;
    let alive = true;
    void getTrackerExercise(exerciseId)
      .then((ex) => {
        if (alive && ex) setOwn({ uri: ex.mediaUri, type: ex.mediaType });
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [visible, exerciseId, passed, passedUri, passedType]);

  const entry = catalogEntry(catalogKey);
  const bundled = mediaFor(catalogKey);
  const steps = entry?.steps ?? [];
  const height = 210;

  let picture = null;
  if (own?.uri && own.type === 'video') picture = <LoopingVideo uri={own.uri} height={height} />;
  else if (own?.uri && own.type === 'image')
    picture = (
      <View style={{ height, borderRadius: radius.md, overflow: 'hidden', backgroundColor: color.surfaceSunken }}>
        <Image source={{ uri: own.uri }} style={{ width: '100%', height }} contentFit="contain" />
      </View>
    );
  else if (bundled) picture = <FrameLoop frames={bundled.frames} height={height} />;
  const showCredit = !own?.uri && bundled != null;

  return (
    <TrackerSheet visible={visible} title={name} onClose={onClose}>
      <View style={{ gap: space.md }}>
        {visible ? picture : null}
        {showCredit ? (
          <Text
            onPress={() => void Linking.openURL(MEDIA_LICENCE_URL).catch(() => undefined)}
            accessibilityRole="link"
            style={{ fontFamily: type.body, fontSize: type.size.caption, color: color.inkFaint, marginTop: -space.sm }}
          >
            {MEDIA_CREDIT}
          </Text>
        ) : null}
        {steps.length > 0 && !picture ? (
          <Text style={{ fontFamily: type.body, fontSize: type.size.caption, color: color.inkMuted }}>
            No moving demo for this exercise yet — the steps are below.
          </Text>
        ) : null}
        {steps.length > 0 ? (
          <View style={{ gap: space.sm }}>
            {steps.map((s, i) => (
              <View key={i} style={{ flexDirection: 'row', gap: space.sm }}>
                <Text style={{ width: 18, fontFamily: type.monoBold, fontSize: type.size.sub, color: color.accent }}>
                  {i + 1}
                </Text>
                <Text style={{ flex: 1, fontFamily: type.body, fontSize: type.size.sub, color: color.inkSecondary, lineHeight: 19 }}>
                  {s}
                </Text>
              </View>
            ))}
          </View>
        ) : !picture ? (
          <Text style={{ fontFamily: type.body, fontSize: type.size.sub, color: color.inkMuted }}>
            No picture for this exercise yet. Add your own photo or video from the exercise page.
          </Text>
        ) : null}
      </View>
    </TrackerSheet>
  );
}
