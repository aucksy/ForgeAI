import { LinearGradient } from 'expo-linear-gradient';
import { Text, View } from 'react-native';

import { GlassCard, Icon } from '@/components/ui';
import { color, gradients, space, type } from '@/theme/tokens';

interface InsightCardProps {
  insight: string;
}

/** Coach-voice insight on a glass surface with a subtle ember left border. */
export function InsightCard({ insight }: InsightCardProps) {
  return (
    <GlassCard>
      <LinearGradient
        colors={gradients.ember}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={{
          position: 'absolute',
          left: 0,
          top: space.md,
          bottom: space.md,
          width: 3,
          borderRadius: 1.5,
        }}
      />
      <View style={{ flexDirection: 'row', gap: space.md }}>
        <View
          style={{
            width: 34,
            height: 34,
            borderRadius: 17,
            backgroundColor: color.accentSoft,
            alignItems: 'center',
            justifyContent: 'center',
            marginTop: 2,
          }}
        >
          <Icon name="sparkle" size={18} color={color.accentBright} />
        </View>
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontFamily: type.bodySemi,
              fontSize: type.size.caption,
              color: color.accentBright,
              letterSpacing: 1.4,
            }}
          >
            COACH INSIGHT
          </Text>
          <Text
            style={{
              fontFamily: type.bodyMedium,
              fontSize: type.size.body,
              lineHeight: 21,
              color: color.ink,
              marginTop: space.xs,
            }}
          >
            {insight}
          </Text>
        </View>
      </View>
    </GlassCard>
  );
}
