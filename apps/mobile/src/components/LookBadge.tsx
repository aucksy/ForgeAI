/**
 * Light mode (9 Nov 2026): the small label chip ("Chest", "New record", "Done"), drawn the same as the
 * frozen components/ui Badge but with its colours read when it is drawn. The frozen Badge copies its
 * colours once, when the app loads, so after the look changed with the app open (the phone switching
 * from light to dark) its chips kept the old look: dark-orange words on a dark chip (cloud run
 * 42633581292, rel-look-dark-04/08). Every screen imports this one instead.
 */
import { Text, View } from 'react-native';

import type { BadgeProps } from '@/components/ui/Badge';
import { color, radius, type } from '@/theme/tokens';

export type { BadgeProps };

/** The frozen Badge's tones, read now. */
export function badgeTone(tone: NonNullable<BadgeProps['tone']>): { bg: string; fg: string } {
  switch (tone) {
    case 'accent':
      return { bg: color.accentSoft, fg: color.accentBright };
    case 'good':
      return { bg: 'rgba(61, 203, 108, 0.14)', fg: color.goodText };
    case 'warn':
      return { bg: 'rgba(250, 178, 25, 0.14)', fg: color.warning };
    default:
      return { bg: color.surfaceRaised, fg: color.inkSecondary };
  }
}

export function Badge({ label, tone = 'neutral' }: BadgeProps) {
  const t = badgeTone(tone);
  return (
    <View
      style={{
        alignSelf: 'flex-start',
        backgroundColor: t.bg,
        borderRadius: radius.pill,
        paddingHorizontal: 10,
        paddingVertical: 4,
      }}
    >
      <Text
        style={{
          fontFamily: type.bodySemi,
          fontSize: type.size.caption,
          color: t.fg,
          letterSpacing: 0.3,
        }}
      >
        {label}
      </Text>
    </View>
  );
}
