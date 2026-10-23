/**
 * Room for the Android keyboard, for the whole app (Phase 3, third review).
 *
 * The app draws edge to edge (behind the status and navigation bars). In that mode Android
 * no longer shrinks the window when the keyboard opens — "adjustResize" only reports the
 * keyboard's size — so the keyboard simply covered the bottom of every screen: the lower
 * measurement boxes and their Save button, the last sets of a workout, the end of a long form.
 * `KeyboardRoom` wraps the app and, while the keyboard is open, pads the bottom by the part of
 * the screen it covers: every screen shrinks above the keyboard the way Android used to do it,
 * and Android's scroll views bring the box being typed in back into view. Sheets (React
 * Native modals) are windows of their own that still resize themselves.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { AppState, Keyboard, Platform, TextInput, View } from 'react-native';

import { keyboardCacheTrusted, keyboardIfTyping, keyboardRoom, type KeyboardFrame } from '@/lib/keyboardRoom';

// U-M6: React Native's own keyboard state is stale after the app was away (see
// keyboardCacheTrusted). One app-wide belief, kept from Android's own events.
let cacheTrusted = true;
if (Platform.OS === 'android') {
  AppState.addEventListener('change', (s) => {
    if (s !== 'background') return;
    cacheTrusted = keyboardCacheTrusted(cacheTrusted, 'background');
    // U-M6c (23 Oct, run 39950792788 part UK2): a box still focused when the app went away came back
    // focused, so Android's report of a keyboard that was not on screen was believed again (blank band,
    // then no tab bar after Minimise). Leaving the app lets go of the box: nothing is typed while away.
    Keyboard.dismiss();
  });
  Keyboard.addListener('keyboardDidShow', () => {
    if (typing()) cacheTrusted = keyboardCacheTrusted(cacheTrusted, 'show');
  });
}

/** One of our text boxes has the focus: only then can an open keyboard be ours (U-M6, 21 Oct). */
function typing(): boolean {
  return TextInput.State?.currentlyFocusedInput?.() != null;
}

function current(): KeyboardFrame {
  const m = cacheTrusted && Keyboard.isVisible() ? Keyboard.metrics() : undefined;
  return keyboardIfTyping(m ? { screenY: m.screenY, height: m.height } : null, typing());
}

/** The keyboard as it is now — Android only (on iOS the screens keep their own handling). */
export function useKeyboardFrame(): KeyboardFrame {
  const [kb, setKb] = useState<KeyboardFrame>(() => (Platform.OS === 'android' ? current() : null));
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const show = Keyboard.addListener('keyboardDidShow', (e) =>
      setKb(keyboardIfTyping({ screenY: e.endCoordinates.screenY, height: e.endCoordinates.height }, typing())),
    );
    const hide = Keyboard.addListener('keyboardDidHide', () => setKb(null));
    // Away from the screen, no keyboard of ours is open (Android may not say so when it closes).
    const away = AppState.addEventListener('change', (s) => {
      if (s === 'background') setKb(null);
    });
    return () => {
      show.remove();
      hide.remove();
      away.remove();
    };
  }, []);
  // U-M6c: Android does not always say the keyboard closed (a screen with the focused box went away,
  // e.g. Minimise). While room is kept, check twice a second that a box of ours still has the focus.
  useEffect(() => {
    if (Platform.OS !== 'android' || kb == null) return;
    const check = setInterval(() => {
      if (!typing()) setKb(null);
    }, 500);
    return () => clearInterval(check);
  }, [kb]);
  return kb;
}

/** Wraps the whole app (it must start at the top of the screen and fill it). */
export function KeyboardRoom({ children }: { children: ReactNode }) {
  const kb = useKeyboardFrame();
  const [height, setHeight] = useState(0);
  return (
    <View style={{ flex: 1, paddingBottom: keyboardRoom(height, kb) }} onLayout={(e) => setHeight(e.nativeEvent.layout.height)}>
      {children}
    </View>
  );
}
