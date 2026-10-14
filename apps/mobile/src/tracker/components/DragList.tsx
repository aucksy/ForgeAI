/**
 * A list you reorder by pressing and holding a card, then dragging it (15 Oct 2026; Hevy's
 * routine folders work this way). The held card lifts and follows the finger; the cards it passes
 * slide aside; letting go saves the new order through `onReorder`. A plain tap still opens or
 * starts, because the drag only begins after the hold. Move up / Move down stay in the card's ⋯
 * menu for screen readers and anyone who prefers them.
 *
 * Maths in ../lib/dragOrder.ts (tested). Built on react-native-gesture-handler + reanimated, which
 * the app already ships (no new native code).
 */

import { useCallback, useEffect, type ReactNode } from 'react';
import { View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';

import { tap } from '@/lib/haptics';

import { dropIndex, movedIds, shiftFor } from '../lib/dragOrder';

/** How long a finger rests on a card before it lifts (ms): long enough that a scroll never lifts one. */
export const HOLD_MS = 350;

export function DragList<T extends { id: string }>({
  items,
  gap,
  style,
  renderItem,
  onReorder,
}: {
  items: readonly T[];
  gap: number;
  style?: StyleProp<ViewStyle>;
  renderItem: (item: T) => ReactNode;
  /** The full new order of ids, only when something moved. */
  onReorder: (ids: string[]) => void;
}) {
  const heights = useSharedValue<number[]>(items.map(() => 0));
  const from = useSharedValue(-1);
  const to = useSharedValue(-1);
  const dy = useSharedValue(0);

  useEffect(() => {
    // A card added or removed: start the heights again (each card measures itself on layout).
    heights.value = items.map((_, i) => heights.value[i] ?? 0);
    from.value = -1;
    to.value = -1;
    dy.value = 0;
  }, [items, heights, from, to, dy]);

  const ids = items.map((it) => it.id);
  const idsKey = ids.join('|');

  const drop = useCallback(
    (f: number, t: number) => {
      const order = movedIds(idsKey ? idsKey.split('|') : [], f, t);
      if (order) onReorder(order);
      // Let the new order draw first, then drop the lift, so the card never jumps back.
      requestAnimationFrame(() => {
        from.value = -1;
        to.value = -1;
        dy.value = 0;
      });
    },
    [idsKey, onReorder, from, to, dy],
  );

  const lifted = useCallback(() => tap(), []);

  return (
    <View style={[{ gap }, style]}>
      {items.map((it, index) => (
        <DragRow
          key={it.id}
          index={index}
          gap={gap}
          enabled={items.length > 1}
          heights={heights}
          from={from}
          to={to}
          dy={dy}
          onLift={lifted}
          onDrop={drop}
        >
          {renderItem(it)}
        </DragRow>
      ))}
    </View>
  );
}

function DragRow({
  index,
  gap,
  enabled,
  heights,
  from,
  to,
  dy,
  onLift,
  onDrop,
  children,
}: {
  index: number;
  gap: number;
  enabled: boolean;
  heights: SharedValue<number[]>;
  from: SharedValue<number>;
  to: SharedValue<number>;
  dy: SharedValue<number>;
  onLift: () => void;
  onDrop: (from: number, to: number) => void;
  children: ReactNode;
}) {
  const onLayout = (e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    const next = [...heights.value];
    next[index] = h;
    heights.value = next;
  };

  const pan = Gesture.Pan()
    .enabled(enabled)
    .activateAfterLongPress(HOLD_MS)
    .onStart(() => {
      from.value = index;
      to.value = index;
      dy.value = 0;
      runOnJS(onLift)();
    })
    .onUpdate((e) => {
      dy.value = e.translationY;
      to.value = dropIndex(heights.value, gap, index, e.translationY);
    })
    .onEnd(() => {
      runOnJS(onDrop)(from.value, to.value);
    })
    .onFinalize((_e, success) => {
      // Cancelled (another gesture took over): nothing moves.
      if (!success && from.value === index) {
        from.value = -1;
        to.value = -1;
        dy.value = 0;
      }
    });

  const animated = useAnimatedStyle(() => {
    if (from.value === index) {
      return {
        transform: [{ translateY: dy.value }, { scale: 1.02 }],
        zIndex: 10,
        elevation: 8,
        opacity: 0.96,
      };
    }
    const h = from.value >= 0 ? (heights.value[from.value] ?? 0) : 0;
    return {
      transform: [{ translateY: withTiming(shiftFor(index, from.value, to.value, h, gap), { duration: 140 }) }, { scale: 1 }],
      zIndex: 0,
      elevation: 0,
      opacity: 1,
    };
  });

  return (
    <GestureDetector gesture={pan}>
      <Animated.View onLayout={onLayout} style={animated}>
        {children}
      </Animated.View>
    </GestureDetector>
  );
}
