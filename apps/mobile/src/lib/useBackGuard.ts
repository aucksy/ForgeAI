/**
 * Android Back (the button or the edge swipe) for a screen with steps inside it (Phase 1 —
 * IM-10). React Navigation asks `beforeRemove` before a screen leaves the stack, for the
 * hardware Back, the gesture and `router.back()` alike.
 *
 *   useBackGuard((leave) => {
 *     if (stepBack()) return true;           // handled: stay on the screen
 *     if (busy) { ask().then((ok) => ok && leave()); return true; }
 *     return false;                          // let the screen go
 *   });
 *
 * `leave()` finishes the removal that was held back. A screen that closes itself on purpose
 * (a Done button) must make its handler return false first, or it would be held too.
 */
import { useNavigation } from 'expo-router';
import { useEffect, useRef } from 'react';

type Handler = (leave: () => void) => boolean;

export function useBackGuard(handler: Handler): void {
  const navigation = useNavigation();
  const ref = useRef<Handler>(handler);
  ref.current = handler;
  useEffect(
    () =>
      navigation.addListener('beforeRemove', (e) => {
        const leave = () => navigation.dispatch(e.data.action);
        if (ref.current(leave)) e.preventDefault();
      }),
    [navigation],
  );
}
