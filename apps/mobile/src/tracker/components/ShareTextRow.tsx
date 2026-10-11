/**
 * "Share as text" — the quieter partner of "Share as a picture": the workout (or month, or year)
 * as plain text for any AI chat. One 48 dp row, a one-line hint under its label; a second tap
 * while the share menu is opening does nothing.
 */
import { useRef } from 'react';
import { Pressable, Text, View } from 'react-native';

import { tell } from '@/lib/tell';
import { color, radius, space, type } from '@/theme/tokens';

import { shareAsText } from '../services/shareText';
import { Glyph } from './TrackerGlyph';

export const SHARE_TEXT_LABEL = 'Share as text';
export const SHARE_TEXT_HINT = 'Paste it into any AI chat for advice';

/** Build the text, then open the phone's share menu. Says so in the app's own sheet if it can't. */
export async function shareTextNow(getText: () => string | Promise<string>, title: string): Promise<void> {
  try {
    await shareAsText(await getText(), title);
  } catch {
    await tell("Couldn't share it as text", 'Please try again.');
  }
}

export function ShareTextRow({
  getText,
  title,
  inSheet = false,
  before,
}: {
  getText: () => string | Promise<string>;
  title: string;
  /** A row inside a menu sheet (full width, ink label) rather than under a screen's buttons. */
  inSheet?: boolean;
  /** Runs first — a menu closes and slides away before the share menu slides up. */
  before?: () => Promise<void>;
}) {
  const busy = useRef(false);
  const onPress = (): void => {
    if (busy.current) return;
    busy.current = true;
    void (async () => {
      if (before) await before();
      await shareTextNow(getText, title);
    })().finally(() => {
      busy.current = false;
    });
  };
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${SHARE_TEXT_LABEL}. ${SHARE_TEXT_HINT}`}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.md,
        minHeight: 48,
        paddingVertical: space.sm,
        paddingHorizontal: inSheet ? space.md : space.sm,
        borderRadius: radius.md,
        backgroundColor: pressed ? color.surface : 'transparent',
        alignSelf: inSheet ? 'stretch' : 'center',
      })}
    >
      <View style={{ width: 24, alignItems: 'center' }}>
        <Glyph name="list" size={20} color={color.accent} />
      </View>
      <View style={{ flexShrink: 1, gap: 2 }}>
        <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.body, color: inSheet ? color.ink : color.accent }}>{SHARE_TEXT_LABEL}</Text>
        <Text style={{ fontFamily: type.body, fontSize: type.size.caption, color: color.inkMuted }}>{SHARE_TEXT_HINT}</Text>
      </View>
    </Pressable>
  );
}
