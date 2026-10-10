/**
 * Audit Phase 7 (SH-21): ONE text-size policy for the whole app.
 *
 * Every `Text` and `TextInput` grows with the phone's font size, up to a cap that depends on
 * how big the text already is (see `textScaleCap`): body text up to 1.6×, headings 1.4×, page
 * titles 1.3×, hero numerals 1.2×. A screen can still pass its own `maxFontSizeMultiplier`.
 *
 * How it reaches every screen without editing 130 files: React 19 dropped `defaultProps` for
 * function components, so `Text.defaultProps` no longer works. Instead `metro.config.js`
 * points React Native's own `Text` / `TextInput` entries at the two components below, so
 * `import { Text } from 'react-native'` anywhere in the app gets them. They render the real
 * ones, which they import straight from their files (never from 'react-native', which would
 * loop back here).
 *
 * A Text inside another Text with no size of its own passes no cap, so it keeps the outer
 * Text's. React Native says when a Text is nested through `unstable_TextAncestorContext` (its
 * public name for the very context its own Text reads; test/components/ui/rnTextEntries.test.ts
 * fails if it moves).
 *
 * Do not import this file directly — it is wired in by the bundler (and only on the phone).
 */
import { useContext, type Ref } from 'react';
import { StyleSheet, unstable_TextAncestorContext as TextAncestorContext } from 'react-native';
import type { Text as TextType, TextInput as TextInputType, TextInputProps, TextProps } from 'react-native';
import * as RNTextInputModule from 'react-native/Libraries/Components/TextInput/TextInput';
import * as RNTextModule from 'react-native/Libraries/Text/Text';

import { textCapProp } from './a11y';

const RNText = (RNTextModule as unknown as { default: typeof TextType }).default;
const RNTextInput = (RNTextInputModule as unknown as { default: typeof TextInputType }).default;

function capFor(given: number | null | undefined, style: TextProps['style'], nested = false): number | undefined {
  const flat = StyleSheet.flatten(style) as { fontSize?: number } | undefined;
  return textCapProp(given, flat?.fontSize, nested);
}

function Text(props: TextProps & { ref?: Ref<TextType> }) {
  const nested = useContext(TextAncestorContext);
  const cap = capFor(props.maxFontSizeMultiplier, props.style, nested);
  // Nested with no size of its own: pass nothing, so the outer Text's cap carries on.
  if (cap === undefined) return <RNText {...props} />;
  return <RNText {...props} maxFontSizeMultiplier={cap} />;
}
Text.displayName = 'Text';

function TextInput(props: TextInputProps & { ref?: Ref<TextInputType> }) {
  return <RNTextInput {...props} maxFontSizeMultiplier={capFor(props.maxFontSizeMultiplier, props.style)} />;
}
TextInput.displayName = 'TextInput';
// Keep the statics other code reaches for (TextInput.State.currentlyFocusedInput(), …).
(TextInput as unknown as { State: unknown }).State = (RNTextInput as unknown as { State: unknown }).State;

export { Text as ScaledText, TextInput as ScaledTextInput };
export default Text;
