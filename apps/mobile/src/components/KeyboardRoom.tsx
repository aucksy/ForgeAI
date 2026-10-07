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
import { Keyboard, Platform, View } from 'react-native';

import { keyboardRoom, type KeyboardFrame } from '@/lib/keyboardRoom';

function current(): KeyboardFrame {
  const m = Keyboard.isVisible() ? Keyboard.metrics() : undefined;
  return m ? { screenY: m.screenY, height: m.height } : null;
}

/** The keyboard as it is now — Android only (on iOS the screens keep their own handling). */
export function useKeyboardFrame(): KeyboardFrame {
  const [kb, setKb] = useState<KeyboardFrame>(() => (Platform.OS === 'android' ? current() : null));
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const show = Keyboard.addListener('keyboardDidShow', (e) => setKb({ screenY: e.endCoordinates.screenY, height: e.endCoordinates.height }));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKb(null));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
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
