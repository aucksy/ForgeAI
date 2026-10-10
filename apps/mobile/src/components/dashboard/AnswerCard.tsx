import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, Text, View } from 'react-native';

import { HeroCard, Icon, PrimaryButton } from '@/components/ui';
import { color, gradients, radius, shadow, space, type } from '@/theme/tokens';
import type { HomeAction, HomeAnswer } from '@/tracker/lib/homeAnswer';

interface AnswerCardProps {
  answer: HomeAnswer;
  onAction: (action: HomeAction) => void;
}

/**
 * Home's one answer card (audit Phase 7): what to do now, in one line, with the one button that
 * does it — "Next: Pull 1 · Start", "Workout in progress · Continue", "Done today: Push 1 ✓ ·
 * Next: Pull 1", or a calm "Start a workout". The words come from `homeAnswer` (the shared
 * Today answer). The card itself is not a button: only its buttons act, each 48 dp or more.
 *
 * Screen reader (review fix): the title is its own heading, and it says the whole answer
 * ("Next: Pull 1. 3 exercises from your plan") — before, the heading sat inside one grouped
 * element and could never be reached by heading navigation. The overline, the ✓ and the line
 * are said by the heading, so they are not read again.
 */
export function AnswerCard({ answer, onAction }: AnswerCardProps) {
  const { overline, title, line, done, primary, secondary } = answer;
  return (
    <HeroCard
      gradient={gradients.steel}
      style={{ ...shadow.glow, backgroundColor: color.surface, borderRadius: radius.xl }}
    >
      {/* ember top edge — the app's one hero look */}
      <LinearGradient
        colors={gradients.ember}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3 }}
      />

      <View>
        <Text
          accessibilityElementsHidden
          importantForAccessibility="no"
          style={{
            fontFamily: type.bodySemi,
            fontSize: type.size.caption,
            color: color.accentBright,
            letterSpacing: 1.4,
            textTransform: 'uppercase',
          }}
        >
          {overline}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.sm }}>
          <Text
            accessibilityRole="header"
            accessibilityLabel={answer.label}
            style={{
              flexShrink: 1,
              fontFamily: type.display,
              fontSize: type.size.h1,
              color: color.ink,
              letterSpacing: -0.5,
            }}
          >
            {title}
          </Text>
          {done ? (
            <View
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={{
                width: 26,
                height: 26,
                borderRadius: 13,
                backgroundColor: color.accentSoft,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon name="check" size={16} color={color.accentBright} />
            </View>
          ) : null}
        </View>
        {line ? (
          <Text
            accessibilityElementsHidden
            importantForAccessibility="no"
            style={{
              fontFamily: type.body,
              fontSize: type.size.sub,
              lineHeight: 19,
              color: color.inkSecondary,
              marginTop: space.xs,
            }}
          >
            {line}
          </Text>
        ) : null}
      </View>

      {primary || secondary ? (
        <View style={{ gap: space.sm, marginTop: space.lg }}>
          {primary ? <PrimaryButton label={primary.label} onPress={() => onAction(primary.action)} /> : null}
          {secondary ? (
            <Pressable
              onPress={() => onAction(secondary.action)}
              accessibilityRole="button"
              accessibilityLabel={secondary.label}
              style={({ pressed }) => ({
                minHeight: 48,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: primary ? 'center' : 'flex-end',
                gap: 2,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: color.accent }}>
                {secondary.label}
              </Text>
              <Icon name="chevron-right" size={14} color={color.accent} />
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </HeroCard>
  );
}
