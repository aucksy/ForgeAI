/**
 * Oct 2026 — the choice sheet for "Weight jumps" and "Rep range" (Settings → Workouts). It opens
 * from its row exactly like "Default rest": a title, one plain line under it, then one full-width
 * row per choice — its name, a "Recommended" tag on the default, and one plain line saying what it
 * does. A tap chooses and closes. Rows wrap at large text (no segmented control).
 */
import { Pressable, Text, View } from 'react-native';

import { Icon } from '@/components/ui';
import { tap } from '@/lib/haptics';
import { color, radius, space, type } from '@/theme/tokens';

import type { PrefChoice } from '../services/targetChoices';
import { TrackerSheet } from './TrackerSheet';

export function PrefChoiceSheet<T extends string>({
  visible,
  title,
  subtitle,
  footnote,
  choices,
  value,
  onChoose,
  onClose,
}: {
  visible: boolean;
  title: string;
  subtitle: string;
  /** One more plain line under the choices (optional). */
  footnote?: string;
  choices: readonly PrefChoice<T>[];
  value: T;
  onChoose: (value: T) => void;
  onClose: () => void;
}) {
  return (
    <TrackerSheet visible={visible} title={title} subtitle={subtitle} onClose={onClose}>
      <View accessibilityRole="radiogroup" style={{ gap: space.sm }}>
        {choices.map((c) => {
          const selected = c.value === value;
          return (
            <Pressable
              key={c.value}
              onPress={() => {
                if (!selected) tap();
                onChoose(c.value);
              }}
              accessibilityRole="radio"
              accessibilityState={{ selected, checked: selected }}
              accessibilityLabel={`${c.label}${c.recommended ? ', recommended' : ''}. ${c.detail}`}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: space.md,
                minHeight: 56,
                paddingVertical: space.sm,
                paddingHorizontal: space.md,
                borderRadius: radius.md,
                borderWidth: 1,
                borderColor: selected ? color.accent : color.border,
                backgroundColor: selected ? color.accentSoft : pressed ? color.surfaceSunken : color.surface,
              })}
            >
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm }}>
                  <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.body, color: selected ? color.accent : color.ink }}>{c.label}</Text>
                  {c.recommended ? (
                    <View style={{ borderRadius: radius.pill, paddingHorizontal: space.sm, paddingVertical: 2, backgroundColor: color.surfaceRaised }}>
                      <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.caption, color: color.inkSecondary }}>Recommended</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={{ fontFamily: type.body, fontSize: type.size.caption, color: color.inkMuted, marginTop: 2, lineHeight: 17 }}>{c.detail}</Text>
              </View>
              {selected ? <Icon name="check" size={18} color={color.accent} /> : null}
            </Pressable>
          );
        })}
      </View>
      {footnote ? (
        <Text style={{ fontFamily: type.body, fontSize: type.size.caption, color: color.inkMuted, marginTop: space.md, lineHeight: 17 }}>{footnote}</Text>
      ) : null}
    </TrackerSheet>
  );
}
