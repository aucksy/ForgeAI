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
import { Animated, Easing, Modal, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import type { ImageSourcePropType } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/ui';
import { color, radius, space, type } from '@/theme/tokens';

import { catalogEntry } from '../catalog/exerciseCatalog';
import { mediaFor } from '../catalog/media';
import { getTrackerExercise } from '../db/exerciseInfo';
import { DrawingCredit } from './DrawingCredit';
import type { ThumbMedia } from './ExerciseThumb';

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
  showSteps = true,
}: {
  visible: boolean;
  /** Used to look up the member's own photo/video when `media` isn't passed. */
  exerciseId?: string;
  catalogKey: string | null;
  name: string;
  media?: ThumbMedia | null;
  onClose: () => void;
  /**
   * Audit Phase 4 (EX-09): the exercise page already prints the steps under the picture, so its
   * sheet shows the picture alone — the steps are never shown twice.
   */
  showSteps?: boolean;
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
  const steps = showSteps ? entry?.steps ?? [] : [];
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

  // Phase 0 (EX-11): the sheet stops at 90 % of the screen (below the status bar) and its body
  // scrolls, so at large text the name and the close button stay on screen. Built here rather
  // than on TrackerSheet, which the workout's other small sheets share unchanged.
  const insets = useSafeAreaInsets();
  const { height: winH } = useWindowDimensions();
  const maxHeight = Math.min(winH * 0.9, winH - insets.top - space.md);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' }}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close"
      />
      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          maxHeight,
          backgroundColor: color.surfaceRaised,
          borderTopLeftRadius: radius.xl,
          borderTopRightRadius: radius.xl,
          borderWidth: 1,
          borderColor: color.borderStrong,
          paddingTop: space.lg,
          gap: space.md,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.xl }}>
          <Text
            numberOfLines={2}
            accessibilityRole="header"
            style={{ flex: 1, fontFamily: type.heading, fontSize: type.size.h3, color: color.ink }}
          >
            {name}
          </Text>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close"
            style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center', marginRight: -space.sm }}
          >
            <Icon name="close" size={22} color={color.inkMuted} />
          </Pressable>
        </View>
        <ScrollView
          style={{ flexGrow: 0, flexShrink: 1 }}
          contentContainerStyle={{
            paddingHorizontal: space.xl,
            paddingBottom: Math.max(insets.bottom, space.lg) + space.md,
          }}
          showsVerticalScrollIndicator
        >
          <View style={{ gap: space.md }}>
            {visible ? picture : null}
            {showCredit ? <DrawingCredit beforeOpen={onClose} /> : null}
            {steps.length > 0 && !picture ? (
              <Text style={{ fontFamily: type.body, fontSize: type.size.caption, color: color.inkMuted }}>
                No picture for this exercise yet. Here is how to do it:
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
        </ScrollView>
      </View>
    </Modal>
  );
}
