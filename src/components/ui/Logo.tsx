import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, G, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import * as tokens from '@/theme/tokens';

export interface LogoProps {
  /** Overall lockup height in px; width follows. Default 28. */
  height?: number;
}

/**
 * ForgeAI wordmark: the barbell-"F" ember mark + "FORGE" (ink) "AI" (ember).
 * Mark geometry is authored in a 512 box — keep in sync with
 * scripts/make-icons.mjs. viewBox is tightened to the mark's ink bounds
 * (centered 384 box) so the SVG square hugs the glyph.
 */
export function Logo({ height = 28 }: LogoProps) {
  const fontSize = height * 0.64;
  return (
    <View style={styles.row} accessibilityRole="image" accessibilityLabel="ForgeAI">
      <Svg width={height} height={height} viewBox="64 64 384 384">
        <Defs>
          {/* userSpaceOnUse -> one continuous ember sweep across all shapes */}
          <LinearGradient
            id="forgeaiEmber"
            x1={120}
            y1={52}
            x2={420}
            y2={416}
            gradientUnits="userSpaceOnUse"
          >
            <Stop offset={0} stopColor={tokens.gradients.ember[0]} />
            <Stop offset={1} stopColor={tokens.gradients.ember[1]} />
          </LinearGradient>
        </Defs>
        <G transform="translate(-40 22)">
          {/* barbell bar = F top arm, running under both plates */}
          <Rect x={120} y={96} width={352} height={72} rx={30} fill="url(#forgeaiEmber)" />
          <Rect x={330} y={52} width={48} height={160} rx={22} fill="url(#forgeaiEmber)" />
          <Rect x={398} y={72} width={40} height={120} rx={20} fill="url(#forgeaiEmber)" />
          {/* F stem + mid arm */}
          <Rect x={120} y={96} width={72} height={320} rx={30} fill="url(#forgeaiEmber)" />
          <Rect x={120} y={252} width={168} height={64} rx={28} fill="url(#forgeaiEmber)" />
          {/* rising ember spark + trailing dot */}
          <Path
            d="M386 262 Q392 300 430 306 Q392 312 386 350 Q380 312 342 306 Q380 300 386 262 Z"
            fill={tokens.gradients.ember[0]}
          />
          <Circle cx={448} cy={240} r={13} fill={tokens.color.accentBright} />
        </G>
      </Svg>
      <Text
        style={[
          styles.word,
          { fontSize, letterSpacing: fontSize * 0.04, marginLeft: height * 0.32 },
        ]}
      >
        FORGE<Text style={styles.ai}>AI</Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  word: {
    fontFamily: tokens.type.display,
    color: tokens.color.ink,
  },
  ai: {
    color: tokens.color.accent,
  },
});

export default Logo;
