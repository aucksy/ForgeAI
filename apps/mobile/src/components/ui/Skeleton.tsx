import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import type { DimensionValue } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

export interface SkeletonProps {
  width: DimensionValue;
  height: number;
  radius?: number;
}

/** Shimmer placeholder: dim plate + looping gradient sweep. */
export function Skeleton({ width, height, radius = 10 }: SkeletonProps) {
  const [measured, setMeasured] = useState(typeof width === 'number' ? width : 0);
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withRepeat(
      withTiming(1, { duration: 1300, easing: Easing.inOut(Easing.ease) }),
      -1,
      false,
    );
    return () => cancelAnimation(progress);
  }, [progress]);

  const w = measured || 160;
  const sweep = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(progress.value, [0, 1], [-w, w]) }],
  }));

  return (
    <View
      onLayout={
        typeof width === 'number'
          ? undefined
          : (e) => setMeasured(e.nativeEvent.layout.width)
      }
      style={{
        width,
        height,
        borderRadius: radius,
        backgroundColor: 'rgba(255, 255, 255, 0.055)',
        overflow: 'hidden',
      }}
    >
      <Animated.View style={[{ position: 'absolute', top: 0, bottom: 0, width: w * 0.7 }, sweep]}>
        <LinearGradient
          colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.07)', 'rgba(255,255,255,0)']}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={{ flex: 1 }}
        />
      </Animated.View>
    </View>
  );
}
