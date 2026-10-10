/**
 * One-of-many as a list of rows with a radio circle (design language: "a radio circle for
 * one-of-many"). Each row is 56 dp or taller, grows with the phone's text size (no fixed
 * heights on text), and is read as "Pounds and miles, radio button, checked, 2 of 2".
 */
import { Pressable, Text, View } from 'react-native';

import { tap } from '@/lib/haptics';
import { color, radius, space, type } from '@/theme/tokens';

export interface RadioOption<T extends string> {
  id: T;
  label: string;
  caption?: string;
}

export function RadioList<T extends string>({
  options,
  selectedId,
  onSelect,
  invalid = false,
}: {
  options: readonly RadioOption<T>[];
  selectedId: T | null;
  onSelect: (id: T) => void;
  /** Outline the rows in red while this question is the one missing an answer. */
  invalid?: boolean;
}) {
  return (
    <View accessibilityRole="radiogroup" style={{ gap: space.sm }}>
      {options.map((o) => {
        const on = o.id === selectedId;
        return (
          <Pressable
            key={o.id}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            accessibilityLabel={o.caption ? `${o.label}, ${o.caption}` : o.label}
            onPress={() => {
              tap();
              onSelect(o.id);
            }}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: space.md,
              minHeight: 56,
              paddingHorizontal: space.md,
              paddingVertical: space.sm,
              borderRadius: radius.md,
              borderWidth: 1,
              borderColor: on ? color.accent : invalid ? color.criticalText : color.border,
              backgroundColor: on ? color.accentSoft : pressed ? color.surfaceRaised : color.surface,
            })}
          >
            <View
              style={{
                width: 22,
                height: 22,
                borderRadius: 11,
                borderWidth: 2,
                borderColor: on ? color.accent : color.inkMuted,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {on ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color.accent }} /> : null}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.body, color: color.ink }}>{o.label}</Text>
              {o.caption ? (
                <Text style={{ fontFamily: type.body, fontSize: type.size.caption, color: color.inkMuted, marginTop: 2 }}>
                  {o.caption}
                </Text>
              ) : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}
