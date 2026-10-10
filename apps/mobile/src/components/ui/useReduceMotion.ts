/**
 * Audit Phase 7: is the phone set to "Remove animations" / "Reduce motion"?
 *
 * Reanimated reads the setting once, when the app starts. This hook also follows the switch
 * while the app is open, through ONE shared listener (not one per card on screen), so the
 * shared pieces can skip their movement the moment the member turns it on.
 */
import { useSyncExternalStore } from 'react';
import { AccessibilityInfo } from 'react-native';
import { ReduceMotion, useReducedMotion } from 'react-native-reanimated';

let live: boolean | null = null;
let started = false;
const listeners = new Set<() => void>();

function set(value: boolean) {
  if (live === value) return;
  live = value;
  listeners.forEach((l) => l());
}

function start() {
  if (started) return;
  started = true;
  AccessibilityInfo.isReduceMotionEnabled()
    .then(set)
    .catch(() => {});
  AccessibilityInfo.addEventListener('reduceMotionChanged', set);
}

function subscribe(listener: () => void) {
  start();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const snapshot = () => live;

/** True when the member asked the phone for less movement. */
export function useReduceMotion(): boolean {
  const atStart = useReducedMotion();
  const now = useSyncExternalStore(subscribe, snapshot, snapshot);
  return now ?? atStart;
}

/** The Reanimated setting that matches the live switch (overrides Reanimated's start-up copy). */
export function motionMode(reduced: boolean): ReduceMotion {
  return reduced ? ReduceMotion.Always : ReduceMotion.Never;
}
