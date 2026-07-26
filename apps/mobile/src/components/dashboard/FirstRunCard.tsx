import { LinearGradient } from 'expo-linear-gradient';
import { Text, View } from 'react-native';

import { GhostButton, HeroCard, Icon, PrimaryButton } from '@/components/ui';
import { color, gradients, radius, shadow, space, type } from '@/theme/tokens';

interface FirstRunCardProps {
  name: string | null;
  onStartWorkout: () => void;
  onBuildRoutine: () => void;
}

/**
 * Day one — Phase O2 (W1). Replaces the hero on a genuinely empty app (no session
 * ever logged), so a real member's first screen is an invitation to train rather
 * than the frozen coach service's "tell me your split" line over rows of zeros.
 */
export function FirstRunCard({ name, onStartWorkout, onBuildRoutine }: FirstRunCardProps) {
  return (
    <HeroCard
      gradient={gradients.steel}
      style={{ ...shadow.glow, backgroundColor: color.surface, borderRadius: radius.xl }}
    >
      <LinearGradient
        colors={gradients.ember}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3 }}
      />
      <LinearGradient
        colors={gradients.emberSubtle}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={{
          position: 'absolute',
          top: -48,
          right: -48,
          width: 170,
          height: 170,
          borderRadius: 85,
          opacity: 0.7,
        }}
      />

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <Icon name="flame" size={20} color={color.accent} />
        <Text style={{ fontFamily: type.display, fontSize: type.size.h2, color: color.ink }}>
          {name ? `Let's begin, ${name}` : "Let's begin"}
        </Text>
      </View>

      <Text
        style={{
          fontFamily: type.body,
          fontSize: type.size.sub,
          color: color.inkSecondary,
          lineHeight: 20,
          marginTop: space.sm,
        }}
      >
        Nothing logged yet — every chart here fills in from your own sets. Start a workout
        and add exercises as you go, or build a routine first.
      </Text>

      <View style={{ gap: space.md, marginTop: space.lg }}>
        <PrimaryButton label="Start your first workout" icon="dumbbell" onPress={onStartWorkout} />
        <GhostButton label="Build a routine" icon="target" onPress={onBuildRoutine} />
      </View>
    </HeroCard>
  );
}
