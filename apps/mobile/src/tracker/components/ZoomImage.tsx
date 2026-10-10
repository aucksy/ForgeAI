/**
 * A whole photo that can be pinched to zoom, dragged while zoomed, and double-tapped to zoom
 * in or back out (audit PG-18). Always `contain`: the whole picture shows first, never cropped.
 * Inside a React Native Modal, wrap it in a GestureHandlerRootView (a Modal is its own window).
 * Review fix (Phase 5): a zoomed photo stops at its edges (`clampPan`); before, it could be
 * dragged right off the screen.
 */
import { Image } from 'expo-image';
import type { LayoutChangeEvent, StyleProp, ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { clampPan } from './zoomMath';

const MAX_ZOOM = 5;

export function ZoomImage({ uri, style, accessibilityLabel }: { uri: string; style?: StyleProp<ViewStyle>; accessibilityLabel?: string }) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const savedX = useSharedValue(0);
  const savedY = useSharedValue(0);
  const boxW = useSharedValue(0);
  const boxH = useSharedValue(0);
  const onLayout = (e: LayoutChangeEvent) => {
    boxW.value = e.nativeEvent.layout.width;
    boxH.value = e.nativeEvent.layout.height;
  };

  const reset = () => {
    'worklet';
    scale.value = withTiming(1);
    x.value = withTiming(0);
    y.value = withTiming(0);
    savedScale.value = 1;
    savedX.value = 0;
    savedY.value = 0;
  };

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = Math.min(MAX_ZOOM, Math.max(1, savedScale.value * e.scale));
      // Zooming back out pulls the picture in with it, never leaving a gap at an edge.
      x.value = clampPan(x.value, boxW.value, scale.value);
      y.value = clampPan(y.value, boxH.value, scale.value);
    })
    .onEnd(() => {
      if (scale.value <= 1.02) reset();
      else {
        savedScale.value = scale.value;
        savedX.value = x.value;
        savedY.value = y.value;
      }
    });

  const pan = Gesture.Pan()
    .averageTouches(true)
    .onUpdate((e) => {
      if (savedScale.value <= 1 && scale.value <= 1) return;
      x.value = clampPan(savedX.value + e.translationX, boxW.value, scale.value);
      y.value = clampPan(savedY.value + e.translationY, boxH.value, scale.value);
    })
    .onEnd(() => {
      savedX.value = x.value;
      savedY.value = y.value;
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (savedScale.value > 1) {
        reset();
      } else {
        scale.value = withTiming(2.5);
        savedScale.value = 2.5;
      }
    });

  const zoomed = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { translateY: y.value }, { scale: scale.value }],
  }));

  return (
    <GestureDetector gesture={Gesture.Simultaneous(pinch, pan, doubleTap)}>
      <Animated.View onLayout={onLayout} style={[{ flex: 1, overflow: 'hidden' }, style]} accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel} accessibilityHint="Pinch or double-tap to zoom">
        <Animated.View style={[{ flex: 1 }, zoomed]}>
          <Image source={{ uri }} style={{ flex: 1 }} contentFit="contain" cachePolicy="memory" />
        </Animated.View>
      </Animated.View>
    </GestureDetector>
  );
}
