import { Text, View } from 'react-native';

import { color, radius, type } from '@/theme/tokens';

export interface BadgeProps {
  label: string;
  tone?: 'accent' | 'good' | 'warn' | 'neutral';
}

const TONES: Record<NonNullable<BadgeProps['tone']>, { bg: string; fg: string }> = {
  accent: { bg: color.accentSoft, fg: color.accentBright },
  good: { bg: 'rgba(61, 203, 108, 0.14)', fg: color.goodText },
  warn: { bg: 'rgba(250, 178, 25, 0.14)', fg: color.warning },
  neutral: { bg: color.surfaceRaised, fg: color.inkSecondary },
};

export function Badge({ label, tone = 'neutral' }: BadgeProps) {
  const t = TONES[tone];
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
