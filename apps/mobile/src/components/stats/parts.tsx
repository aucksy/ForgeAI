/**
 * Small shared pieces of the R3 screens behind Profile's Dashboard tiles (Statistics, Calendar,
 * Measures): Hevy's grey section heading, a wrapping chip row, a quiet "See all" row and the back
 * arrow's fallback.
 */
import type { Href } from 'expo-router';
import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { Chip, Icon } from '@/components/ui';
import { CHIP_TOUCH_SLOP } from '@/components/ui/Chip';
import { PressScale } from '@/components/ui/PressScale';
import { color, radius, space, type } from '@/theme/tokens';

interface Nav {
  canGoBack: () => boolean;
  back: () => void;
  replace: (href: Href) => void;
}

/** Back when there is a page behind, else the Profile tab (R1), which owns these pages. */
export function leavePage(router: Nav, fallback: Href = '/profile'): void {
  if (router.canGoBack()) router.back();
  else router.replace(fallback);
}

/** A section title in Hevy's style, with an optional action on the right ("See all"). */
export function StatHeading({ title, action, sub }: { title: string; sub?: string; action?: { label: string; onPress: () => void; spoken?: string } }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space.sm, marginTop: space.xl, marginBottom: space.md }}>
      <View style={{ flex: 1, minWidth: 140 }}>
        <Text accessibilityRole="header" style={{ fontFamily: type.heading, fontSize: type.size.h3, color: color.ink }}>
          {title}
        </Text>
        {sub ? <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.sub, color: color.inkMuted, marginTop: 2 }}>{sub}</Text> : null}
      </View>
      {action ? (
        <PressScale
          onPress={action.onPress}
          accessibilityRole="button"
          accessibilityLabel={action.spoken ?? action.label}
          hitSlop={8}
          style={{ minHeight: 40, justifyContent: 'center', paddingHorizontal: space.xs }}
        >
          <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: color.accent }}>{action.label}</Text>
        </PressScale>
      ) : null}
    </View>
  );
}

/** One-of-many chips that wrap onto a second line at large text. */
export function ChoiceRow<T extends string>({ options, value, onChange, label }: { options: readonly { id: T; label: string }[]; value: T; onChange: (v: T) => void; label?: string }) {
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, paddingVertical: CHIP_TOUCH_SLOP, marginVertical: -CHIP_TOUCH_SLOP }}
    >
      {options.map((o) => (
        <Chip key={o.id} role="radio" label={o.label} selected={o.id === value} onPress={() => o.id !== value && onChange(o.id)} />
      ))}
    </View>
  );
}

/** A tappable row: title, a grey line, a value on the right and a chevron — 56 dp or taller. */
export function LinkRow({ title, sub, value, onPress, leading, spoken }: { title: string; sub?: string; value?: string; onPress: () => void; leading?: ReactNode; spoken?: string }) {
  return (
    <PressScale
      onPress={onPress}
      scaleTo={0.98}
      accessibilityRole="button"
      accessibilityLabel={spoken ?? [title, sub, value].filter(Boolean).join(', ')}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.md,
        minHeight: 56,
        paddingVertical: space.sm,
        paddingHorizontal: space.md,
        borderRadius: radius.md,
        backgroundColor: color.surface,
        borderWidth: 1,
        borderColor: color.border,
      }}
    >
      {leading}
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.body, color: color.ink }}>{title}</Text>
        {sub ? <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.sub, color: color.inkMuted, marginTop: 2 }}>{sub}</Text> : null}
      </View>
      {value ? <Text style={{ fontFamily: type.monoBold, fontSize: type.size.body, color: color.inkSecondary }}>{value}</Text> : null}
      <Icon name="chevron-right" size={18} color={color.inkMuted} />
    </PressScale>
  );
}
