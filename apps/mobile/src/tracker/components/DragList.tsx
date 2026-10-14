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

import { useCallback, useLayoutEffect, useRef, type ReactNode } from 'react';
import { View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, runOnUI, useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';

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
  // Which card is held, by id (not index: the new order re-numbers the rows before the lift is
  // dropped, and an index would lift the neighbour for a frame).
  const fromId = useSharedValue('');
  const from = useSharedValue(-1);
  const to = useSharedValue(-1);
  const dy = useSharedValue(0);
  const dragging = useRef(false);

  const ids = items.map((it) => it.id);
  const idsKey = ids.join('|');

  // The list changed (a drop saved, a card added or removed): drop the lift in the same commit the
  // new order is drawn in — unless a finger is still dragging (a reload mid-drag keeps the drag).
  useLayoutEffect(() => {
    if (dragging.current) return;
    fromId.value = '';
    from.value = -1;
    to.value = -1;
    dy.value = 0;
  }, [idsKey, fromId, from, to, dy]);

  const drop = useCallback(
    (f: number, t: number) => {
      dragging.current = false;
      const order = movedIds(idsKey ? idsKey.split('|') : [], f, t);
      if (order) {
        onReorder(order);
      } else {
        fromId.value = '';
        from.value = -1;
        to.value = -1;
        dy.value = 0;
      }
    },
    [idsKey, onReorder, fromId, from, to, dy],
  );

  const lifted = useCallback(() => {
    dragging.current = true;
    tap();
  }, []);

  const cancelled = useCallback(() => {
    dragging.current = false;
  }, []);

  return (
    <View style={[{ gap }, style]}>
      {items.map((it, index) => (
        <DragRow
          key={it.id}
          id={it.id}
          index={index}
          gap={gap}
          enabled={items.length > 1}
          heights={heights}
          fromId={fromId}
          from={from}
          to={to}
          dy={dy}
          onLift={lifted}
          onDrop={drop}
          onCancel={cancelled}
        >
          {renderItem(it)}
        </DragRow>
      ))}
    </View>
  );
}

function DragRow({
  id,
  index,
  gap,
  enabled,
  heights,
  fromId,
  from,
  to,
  dy,
  onLift,
  onDrop,
  onCancel,
  children,
}: {
  id: string;
  index: number;
  gap: number;
  enabled: boolean;
  heights: SharedValue<number[]>;
  fromId: SharedValue<string>;
  from: SharedValue<number>;
  to: SharedValue<number>;
  dy: SharedValue<number>;
  onLift: () => void;
  onDrop: (from: number, to: number) => void;
  onCancel: () => void;
  children: ReactNode;
}) {
  // Written on the UI thread, one card at a time: every card measures itself in the same burst
  // when a folder opens, and JS-side read-copy-write lost all but the last height (review).
  const onLayout = (e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    runOnUI((i: number, height: number) => {
      'worklet';
      const next = heights.value.slice();
      next[i] = height;
      heights.value = next;
    })(index, h);
  };

  const pan = Gesture.Pan()
    .enabled(enabled)
    .activateAfterLongPress(HOLD_MS)
    .onStart(() => {
      fromId.value = id;
      from.value = index;
      to.value = index;
      dy.value = 0;
      runOnJS(onLift)();
    })
    .onUpdate((e) => {
      dy.value = e.translationY;
      to.value = dropIndex(heights.value, gap, index, e.translationY);
    })
    .onEnd((_e, success) => {
      // Only a real release saves; a cancelled drag (another gesture took over) moves nothing.
      if (success) runOnJS(onDrop)(from.value, to.value);
    })
    .onFinalize((_e, success) => {
      if (!success && fromId.value === id) {
        fromId.value = '';
        from.value = -1;
        to.value = -1;
        dy.value = 0;
        runOnJS(onCancel)();
      }
    });

  const animated = useAnimatedStyle(() => {
    if (fromId.value === id) {
      return {
        transform: [{ translateY: dy.value }, { scale: 1.02 }],
        zIndex: 10,
        elevation: 8,
        opacity: 0.96,
      };
    }
    if (fromId.value === '') {
      return { transform: [{ translateY: 0 }, { scale: 1 }], zIndex: 0, elevation: 0, opacity: 1 };
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
