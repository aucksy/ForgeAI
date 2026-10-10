/**
 * Rest-length picker (Phase 1). Used two ways:
 *  - per exercise (from the exercise card) — adds "Use default" at the top;
 *  - for the default rest (Profile → Workout).
 *
 * Phase 2, packet D:
 *  - RT-09: lengths up to 10:00, plus "Custom" (minutes and seconds typed in). A length that is
 *    not in the list (an old 1:15, a 7:00 from an import) shows as the selected Custom chip.
 *  - RT-11: `onChoose` may report that the choice could not be saved; the sheet then stays open
 *    with the parent's short message (`error`) instead of closing as if it were kept.
 */
import { useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { InlineError } from '@/components/ui/InlineError';
import { color, radius, space, type } from '@/theme/tokens';

import { REST_CHOICES, fmtRest, parseCustomRest } from '../services/restRules';
import { TrackerSheet } from './TrackerSheet';

function Chip({
  label,
  selected,
  wide,
  a11y,
  onPress,
}: {
  label: string;
  selected: boolean;
  wide?: boolean;
  a11y: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={a11y}
      style={{
        minWidth: wide ? 140 : 72,
        minHeight: 48,
        paddingHorizontal: space.md,
        borderRadius: radius.pill,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: selected ? color.accent : color.border,
        backgroundColor: selected ? color.accentSoft : color.surface,
      }}
    >
      <Text style={{ fontFamily: type.monoBold, fontSize: type.size.sub, color: selected ? color.accent : color.ink }}>
        {label}
      </Text>
    </Pressable>
  );
}

function NumBox({ value, onChange, label, a11y }: { value: string; onChange: (t: string) => void; label: string; a11y: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
      <TextInput
        value={value}
        onChangeText={(t) => onChange(t.replace(/[^0-9]/g, '').slice(0, 2))}
        keyboardType="number-pad"
        maxLength={2}
        accessibilityLabel={a11y}
        placeholder="0"
        placeholderTextColor={color.inkFaint}
        style={{
          minWidth: 56,
          minHeight: 48,
          paddingHorizontal: space.md,
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: color.border,
          backgroundColor: color.surface,
          color: color.ink,
          fontFamily: type.monoBold,
          fontSize: type.size.body,
          textAlign: 'center',
        }}
      />
      <Text style={{ fontFamily: type.body, fontSize: type.size.sub, color: color.inkSecondary }}>{label}</Text>
    </View>
  );
}

export function RestPickerSheet({
  visible,
  title,
  subtitle,
  value,
  defaultSec,
  error,
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
  /** RT-11: a short line shown when the last choice could not be saved. */
  error?: string | null;
  onChoose: (sec: number | null) => void;
  onClose: () => void;
}) {
  const custom = value != null && value > 0 && !REST_CHOICES.includes(value);
  const [editing, setEditing] = useState(false);
  const [min, setMin] = useState('');
  const [sec, setSec] = useState('');
  const [bad, setBad] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setEditing(false);
    setBad(false);
    const start = value != null && value > 0 ? value : 0;
    setMin(start ? String(Math.floor(start / 60)) : '');
    setSec(start ? String(start % 60).padStart(2, '0') : '');
  }, [visible, value]);

  const useCustom = (): void => {
    const total = parseCustomRest(min, sec);
    if (total == null) {
      setBad(true);
      return;
    }
    setBad(false);
    onChoose(total);
  };

  return (
    <TrackerSheet visible={visible} title={title} subtitle={subtitle} onClose={onClose}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
        {defaultSec != null ? (
          <Chip
            label={`Default · ${fmtRest(defaultSec)}`}
            selected={value === null}
            wide
            a11y={`Rest Default · ${fmtRest(defaultSec)}`}
            onPress={() => onChoose(null)}
          />
        ) : null}
        {REST_CHOICES.map((s) => (
          <Chip
            key={s}
            label={fmtRest(s)}
            selected={s === value}
            a11y={s === 0 ? 'Rest timer off' : `Rest ${fmtRest(s)}`}
            onPress={() => onChoose(s)}
          />
        ))}
        <Chip
          label={custom && value != null ? `Custom · ${fmtRest(value)}` : 'Custom'}
          selected={custom || editing}
          a11y={custom && value != null ? `Custom rest, ${fmtRest(value)}. Change` : 'Custom rest'}
          onPress={() => setEditing(true)}
        />
      </View>
      {editing ? (
        <View style={{ marginTop: space.md, gap: space.sm }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.md }}>
            <NumBox value={min} onChange={setMin} label="min" a11y="Minutes" />
            <NumBox value={sec} onChange={setSec} label="sec" a11y="Seconds" />
            <Pressable
              onPress={useCustom}
              accessibilityRole="button"
              accessibilityLabel="Use this rest"
              style={{
                minHeight: 48,
                paddingHorizontal: space.lg,
                borderRadius: radius.pill,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 1,
                borderColor: color.accent,
                backgroundColor: color.accentSoft,
              }}
            >
              <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: color.accent }}>Use</Text>
            </Pressable>
          </View>
          {bad ? <InlineError message="Pick a rest from 0:05 to 10:00." /> : null}
        </View>
      ) : null}
      {error ? (
        <View style={{ marginTop: space.md }}>
          <InlineError message={error} />
        </View>
      ) : null}
    </TrackerSheet>
  );
}
