/**
 * A see-through layer over a number box that already has the cursor: a tap on it selects the whole
 * number at once (see ../lib/selectAllOnTap.ts). Drawn only while the box is focused, so the first
 * tap, a drag that scrolls the page and the screen reader all reach the box itself, as before.
 */
import type { JSX, RefObject } from 'react';
import { Keyboard, Pressable } from 'react-native';
import type { TextInput } from 'react-native';

import { retapSelectAll } from '../lib/selectAllOnTap';

export function RetapLayer(p: {
  focused: boolean;
  inputRef: RefObject<TextInput | null>;
  length: number;
}): JSX.Element | null {
  if (!p.focused) return null;
  return (
    <Pressable
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      onPress={() => retapSelectAll(p.inputRef.current, p.length, Keyboard.isVisible())}
      style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}
    />
  );
}
