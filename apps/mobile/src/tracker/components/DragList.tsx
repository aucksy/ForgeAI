/**
 * A list you reorder by pressing and holding a card, then dragging it (15 Oct 2026; Hevy's
 * routine folders work this way). The held card lifts and follows the finger; the cards it passes
 * slide aside; letting go saves the new order through `onReorder`. A plain tap still opens or
 * starts, because the drag only begins after the hold. Move up / Move down stay in the card's ⋯
 * menu for screen readers and anyone who prefers them.
 *
 * 15 Oct 2026 (owner, in the gym — the live workout's exercises too):
 *  - a light buzz each time the held card passes another one (routines and workout alike);
 *  - `handle`: the hold works only on the part of the card `renderItem` wraps with `wrap` (the
 *    workout card's name row), so holding a weight box never lifts the card;
 *  - `onLift` / `onSettle` tell the screen a drag began and ended (the workout collapses every
 *    card to its name row while one is held), `onRowLayout` reports where each row sits, and
 *    `shift` moves the held card by a set amount (the screen keeps it under the finger while the
 *    cards around it shrink).
 *
 * Maths in ../lib/dragOrder.ts (tested). Built on react-native-gesture-handler + reanimated, which
 * the app already ships (no new native code).
 */

import { memo, useCallback, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, runOnUI, useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';

import { tap } from '@/lib/haptics';

import { dropIndex, movedIds, shiftFor } from '../lib/dragOrder';

/** How long a finger rests on a card before it lifts (ms): long enough that a scroll never lifts one. */
export const HOLD_MS = 350;

/** Wraps the part of a card the hold works on (only with `handle`). */
export type DragWrap = (node: ReactNode) => ReactNode;

export function DragList<T extends { id: string }>({
  items,
  gap,
  style,
  renderItem,
  onReorder,
  handle = false,
  onLift,
  onSettle,
  onRowLayout,
  shift,
}: {
  items: readonly T[];
  gap: number;
  style?: StyleProp<ViewStyle>;
  /** With `handle`, wrap the hold area in `wrap`; without it the whole card is the hold area. */
  renderItem: (item: T, wrap: DragWrap) => ReactNode;
  /** The full new order of ids, only when something moved; `moved` is the id that was dragged. */
  onReorder: (ids: string[], moved: string) => void;
  handle?: boolean;
  onLift?: (id: string) => void;
  /** The drag ended (dropped or cancelled), after `onReorder`. */
  onSettle?: () => void;
  onRowLayout?: (id: string, y: number, height: number) => void;
  /** Extra offset (px) for the held card, set by the screen; 0 when absent. */
  shift?: SharedValue<number>;
}) {
  const heights = useSharedValue<number[]>(items.map(() => 0));
  // Which card is held, by id (not index: the new order re-numbers the rows before the lift is
  // dropped, and an index would lift the neighbour for a frame).
  const fromId = useSharedValue('');
  const from = useSharedValue(-1);
  const to = useSharedValue(-1);
  const dy = useSharedValue(0);
  const noShift = useSharedValue(0);
  const extra = shift ?? noShift;
  const dragging = useRef(false);
  // Review (15 Oct 2026): every drop counts, so the lift is dropped even when the saved order comes
  // back the same (a card let go inside a superset jumps back after it) — it used to stay floating.
  const [drops, setDrops] = useState(0);

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
  }, [idsKey, drops, fromId, from, to, dy]);

  // Callbacks read the latest props through a ref, so the rows (memoised) keep stable props.
  const latest = useRef({ idsKey, onReorder, onLift, onSettle, onRowLayout });
  latest.current = { idsKey, onReorder, onLift, onSettle, onRowLayout };

  const drop = useCallback(
    (f: number, t: number) => {
      dragging.current = false;
      const keys = latest.current.idsKey ? latest.current.idsKey.split('|') : [];
      const order = movedIds(keys, f, t);
      if (order) {
        latest.current.onReorder(order, keys[f]);
        setDrops((d) => d + 1);
      } else {
        fromId.value = '';
        from.value = -1;
        to.value = -1;
        dy.value = 0;
      }
      latest.current.onSettle?.();
    },
    [fromId, from, to, dy],
  );

  const lifted = useCallback((id: string) => {
    dragging.current = true;
    tap();
    latest.current.onLift?.(id);
  }, []);

  const cancelled = useCallback(() => {
    dragging.current = false;
    latest.current.onSettle?.();
  }, []);

  const crossed = useCallback(() => tap(), []);

  const rowLayout = useCallback((id: string, y: number, h: number) => latest.current.onRowLayout?.(id, y, h), []);

  return (
    <View style={[{ gap }, style]}>
      {items.map((it, index) => (
        <DragRow
          key={it.id}
          item={it}
          index={index}
          gap={gap}
          enabled={items.length > 1}
          handle={handle}
          renderItem={renderItem as (item: { id: string }, wrap: DragWrap) => ReactNode}
          heights={heights}
          fromId={fromId}
          from={from}
          to={to}
          dy={dy}
          extra={extra}
          onLift={lifted}
          onDrop={drop}
          onCancel={cancelled}
          onCross={crossed}
          onRowLayout={rowLayout}
        />
      ))}
    </View>
  );
}

const DragRow = memo(function DragRow({
  item,
  index,
  gap,
  enabled,
  handle,
  renderItem,
  heights,
  fromId,
  from,
  to,
  dy,
  extra,
  onLift,
  onDrop,
  onCancel,
  onCross,
  onRowLayout,
}: {
  item: { id: string };
  index: number;
  gap: number;
  enabled: boolean;
  handle: boolean;
  renderItem: (item: { id: string }, wrap: DragWrap) => ReactNode;
  heights: SharedValue<number[]>;
  fromId: SharedValue<string>;
  from: SharedValue<number>;
  to: SharedValue<number>;
  dy: SharedValue<number>;
  extra: SharedValue<number>;
  onLift: (id: string) => void;
  onDrop: (from: number, to: number) => void;
  onCancel: () => void;
  onCross: () => void;
  onRowLayout: (id: string, y: number, height: number) => void;
}) {
  const id = item.id;
  // Written on the UI thread, one card at a time: every card measures itself in the same burst
  // when a folder opens, and JS-side read-copy-write lost all but the last height (review).
  const onLayout = (e: LayoutChangeEvent) => {
    const { y, height } = e.nativeEvent.layout;
    runOnUI((i: number, h: number) => {
      'worklet';
      const next = heights.value.slice();
      next[i] = h;
      heights.value = next;
    })(index, height);
    onRowLayout(id, y, height);
  };

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .enabled(enabled)
        .activateAfterLongPress(HOLD_MS)
        .onStart(() => {
          fromId.value = id;
          from.value = index;
          to.value = index;
          dy.value = 0;
          runOnJS(onLift)(id);
        })
        .onUpdate((e) => {
          dy.value = e.translationY;
          const t = dropIndex(heights.value, gap, index, e.translationY + extra.value);
          // A light buzz each time the held card passes another one.
          if (t !== to.value) {
            to.value = t;
            runOnJS(onCross)();
          }
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
        }),
    [enabled, id, index, gap, heights, fromId, from, to, dy, extra, onLift, onDrop, onCancel, onCross],
  );

  const animated = useAnimatedStyle(() => {
    if (fromId.value === id) {
      return {
        transform: [{ translateY: dy.value + extra.value }, { scale: 1.02 }],
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

  const wrap = useCallback<DragWrap>((node) => <GestureDetector gesture={pan}>{node}</GestureDetector>, [pan]);
  const plain = useCallback<DragWrap>((node) => node, []);
  const body = renderItem(item, handle ? wrap : plain);

  if (handle) {
    return (
      <Animated.View onLayout={onLayout} style={animated}>
        {body}
      </Animated.View>
    );
  }
  return (
    <GestureDetector gesture={pan}>
      <Animated.View onLayout={onLayout} style={animated}>
        {body}
      </Animated.View>
    </GestureDetector>
  );
});
