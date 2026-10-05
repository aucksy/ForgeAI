/**
 * Rest-length picker (Phase 1). Used two ways:
 *  - per exercise (from the exercise card) — adds "Use default" at the top;
 *  - for the default rest (Profile → Workout).
 */
import { Pressable, Text, View } from 'react-native';

import { color, radius, space, type } from '@/theme/tokens';

import { REST_CHOICES, fmtRest } from '../services/restRules';
import { TrackerSheet } from './TrackerSheet';

export function RestPickerSheet({
  visible,
  title,
  subtitle,
  value,
  defaultSec,
  onChoose,
  onClose,
}: {
  visible: boolean;
  title: string;
  subtitle?: string;
  /** Current choice: seconds, or null for "use default" (only when defaultSec is given). */
  value: number | null;
  /** When given, a "Default (1:30)" choice is offered and maps to null. */
  defaultSec?: number;
  onChoose: (sec: number | null) => void;
  onClose: () => void;
}) {
  const options: { sec: number | null; label: string }[] = [
    ...(defaultSec != null ? [{ sec: null, label: `Default · ${fmtRest(defaultSec)}` }] : []),
    ...REST_CHOICES.map((s) => ({ sec: s as number | null, label: fmtRest(s) })),
  ];
  return (
    <TrackerSheet visible={visible} title={title} subtitle={subtitle} onClose={onClose}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
        {options.map((o) => {
          const selected = o.sec === value;
          return (
            <Pressable
              key={String(o.sec)}
              onPress={() => onChoose(o.sec)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={o.sec === 0 ? 'Rest timer off' : `Rest ${o.label}`}
              style={{
                minWidth: o.sec == null ? 140 : 72,
                height: 44,
                paddingHorizontal: space.md,
                borderRadius: radius.pill,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 1,
                borderColor: selected ? color.accent : color.border,
                backgroundColor: selected ? color.accentSoft : color.surface,
              }}
            >
              <Text
                style={{
                  fontFamily: type.monoBold,
                  fontSize: type.size.sub,
                  color: selected ? color.accent : color.ink,
                }}
              >
                {o.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </TrackerSheet>
  );
}
