/**
 * Swap an exercise (Phase 4): up to four that fit — the same movement or main muscle, the
 * member's equipment and sore areas — each with the reason in a few words.
 */
import { Pressable, Text, View } from 'react-native';

import { color, radius, space, type } from '@/theme/tokens';

import type { Alternative } from '../plans/builder';
import { Glyph } from './TrackerGlyph';
import { TrackerSheet } from './TrackerSheet';

export function SwapSheet({
  visible,
  name,
  options,
  note,
  onPick,
  onClose,
}: {
  visible: boolean;
  /** The exercise being swapped. */
  name: string;
  options: readonly Alternative[];
  /** A line under the title ("For this workout only" / "In this routine from now on"). */
  note: string;
  onPick: (a: Alternative) => void;
  onClose: () => void;
}) {
  return (
    <TrackerSheet visible={visible} title={`Swap ${name}`} subtitle={note} onClose={onClose}>
      {options.length === 0 ? (
        <Text style={{ fontFamily: type.body, fontSize: type.size.sub, color: color.inkMuted }}>
          Nothing else in the library fits here. Add any exercise by hand instead.
        </Text>
      ) : (
        <View style={{ gap: 2 }}>
          {options.map((o) => (
            <Pressable
              key={o.key}
              onPress={() => onPick(o)}
              accessibilityRole="button"
              accessibilityLabel={`Swap to ${o.name}. ${o.reason}`}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: space.md,
                minHeight: 56,
                paddingHorizontal: space.md,
                borderRadius: radius.md,
                backgroundColor: pressed ? color.surface : 'transparent',
              })}
            >
              <Glyph name="swap" size={18} color={color.accent} />
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={{ fontFamily: type.bodySemi, fontSize: type.size.body, color: color.ink }}>
                  {o.name}
                </Text>
                <Text numberOfLines={1} style={{ fontFamily: type.body, fontSize: type.size.caption, color: color.inkMuted }}>
                  {o.reason}
                </Text>
              </View>
            </Pressable>
          ))}
        </View>
      )}
    </TrackerSheet>
  );
}
