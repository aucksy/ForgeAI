/**
 * Redesign R1 — the "Up next" card at the top of the Workout tab: what Home's answer card did,
 * calmer. The words come from `upNextCard` (the ONE Today answer); the card itself is not a
 * button — only its buttons act, each 48 dp or more. The title is its own heading and says the
 * whole answer to a screen reader. `children` holds the easy-week line and its choices (they
 * stay inside the card, as on the old Workout tab).
 *
 * No small eyebrow label over the title: "TODAY" over "Done today: Push 1" and "UP NEXT" over
 * "Up next: Full Body A" said the same thing twice (design critique, Oct 2026). The title leads.
 */
import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Icon, PrimaryButton } from '@/components/ui';
import { color, radius, space, type } from '@/theme/tokens';

import type { UpNextAction, UpNextCard as Answer } from '../lib/upNext';

export function UpNextCard({
  card,
  onAction,
  starting,
  children,
}: {
  card: Answer;
  onAction: (action: UpNextAction) => void;
  starting?: boolean;
  children?: ReactNode;
}) {
  const { title, line, goalLine, done, primary, secondary } = card;
  const live = card.kind === 'continue' || card.kind === 'editing';
  return (
    <View
      style={{
        backgroundColor: color.surface,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: live ? 'rgba(255, 122, 59, 0.45)' : color.border,
        padding: space.lg,
        gap: space.md,
      }}
    >
      <View style={{ gap: space.xs }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <Text
            accessibilityRole="header"
            accessibilityLabel={card.label}
            style={{ flexShrink: 1, fontFamily: type.display, fontSize: type.size.h2, color: color.ink, letterSpacing: -0.3 }}
          >
            {title}
          </Text>
          {done ? (
            <View
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: color.accentSoft, alignItems: 'center', justifyContent: 'center' }}
            >
              <Icon name="check" size={15} color={color.accentBright} />
            </View>
          ) : null}
        </View>
        {line ? (
          <Text
            accessibilityElementsHidden
            importantForAccessibility="no"
            style={{ fontFamily: type.body, fontSize: type.size.sub, lineHeight: 19, color: color.inkSecondary }}
          >
            {line}
          </Text>
        ) : null}
        {goalLine ? (
          <Text
            accessibilityElementsHidden
            importantForAccessibility="no"
            style={{ fontFamily: type.bodyMedium, fontSize: type.size.caption, color: color.inkMuted }}
          >
            {goalLine}
          </Text>
        ) : null}
      </View>

      {children}

      {primary || secondary ? (
        <View style={{ gap: space.xs }}>
          {primary ? (
            <PrimaryButton
              label={primary.label}
              icon={live ? 'clock' : 'dumbbell'}
              loading={starting && primary.action === 'start'}
              onPress={() => onAction(primary.action)}
            />
          ) : null}
          {secondary ? (
            <Pressable
              onPress={() => onAction(secondary.action)}
              accessibilityRole="button"
              accessibilityLabel={secondary.label}
              style={({ pressed }) => ({
                minHeight: 48,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 2,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: color.accent }}>{secondary.label}</Text>
              <Icon name="chevron-right" size={14} color={color.accent} />
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
