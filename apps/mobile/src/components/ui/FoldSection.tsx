/**
 * A long list folded shut under a highlighted heading with its count (Appendix B, R2: "the
 * answer leads; every long list folds shut"). Tap the heading to open; the chevron turns.
 *
 *   <FoldSection title="Working sets" count={12} noun="set">…rows…</FoldSection>
 *   <FoldedList title="All sets" noun="set" items={sets} keyOf={(s) => s.id} renderItem={(s) => <Row set={s} />} />
 */
import { useState, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import { color, radius, space, type } from '@/theme/tokens';

import { foldSummary, type FoldNoun } from './foldSummary';
import { Icon } from './Icon';

export interface FoldSectionProps {
  title: string;
  count: number;
  /** "set" → "12 sets · see them"; irregular: { one: 'entry', other: 'entries' }. */
  noun: FoldNoun;
  /** Starts shut unless this is true. */
  defaultOpen?: boolean;
  /** Controlled use: pass both. */
  open?: boolean;
  onToggle?: (open: boolean) => void;
  children?: ReactNode;
}

export function FoldSection({ title, count, noun, defaultOpen = false, open, onToggle, children }: FoldSectionProps) {
  const [own, setOwn] = useState(defaultOpen);
  const isOpen = open ?? own;
  const summary = foldSummary(count, noun, isOpen);
  const toggle = () => {
    const next = !isOpen;
    if (open == null) setOwn(next);
    onToggle?.(next);
  };

  return (
    <View style={{ gap: space.sm }}>
      <Pressable
        onPress={toggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: isOpen }}
        accessibilityLabel={`${title}, ${summary.replace(' · ', ', ')}`}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.md,
          minHeight: 56,
          paddingHorizontal: space.lg,
          paddingVertical: space.sm,
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: isOpen ? color.borderStrong : color.border,
          backgroundColor: pressed ? color.surfaceRaised : color.surface,
        })}
      >
        <View style={{ flex: 1 }}>
          <Text accessibilityRole="header" style={{ fontFamily: type.heading, fontSize: type.size.body, color: color.ink }}>
            {title}
          </Text>
          <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: color.accent, marginTop: 2 }}>{summary}</Text>
        </View>
        <View style={{ transform: [{ rotate: isOpen ? '90deg' : '0deg' }] }}>
          <Icon name="chevron-right" size={20} color={color.inkMuted} />
        </View>
      </Pressable>
      {isOpen ? children : null}
    </View>
  );
}

export interface FoldedListProps<T> extends Omit<FoldSectionProps, 'count' | 'children'> {
  items: readonly T[];
  keyOf: (item: T, index: number) => string;
  renderItem: (item: T, index: number) => ReactNode;
  /** Shown instead of the fold when there are no items (default: nothing). */
  empty?: ReactNode;
}

/** A FoldSection over an array; rows are only built once it is opened. */
export function FoldedList<T>({ items, keyOf, renderItem, empty = null, ...fold }: FoldedListProps<T>) {
  if (items.length === 0) return <>{empty}</>;
  return (
    <FoldSection {...fold} count={items.length}>
      {items.map((item, i) => (
        <View key={keyOf(item, i)}>{renderItem(item, i)}</View>
      ))}
    </FoldSection>
  );
}
