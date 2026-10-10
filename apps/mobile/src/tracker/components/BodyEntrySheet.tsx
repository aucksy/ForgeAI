/**
 * Fix a body entry (audit PG-03 / PG-16): one sheet for a weigh-in or a measurement — its value,
 * its day, Save, and Delete (which the screen undoes with an UndoBar, never "Are you sure?").
 * Also the "Day" row the log forms use, and a holder that floats the UndoBar above the gesture
 * bar.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, PrimaryButton, Sheet } from '@/components/ui';
import { relativeDay, todayISO } from '@/lib/date';
import { color, radius, space, type } from '@/theme/tokens';

import { DatePickerSheet } from './DatePickerSheet';
import { Glyph } from './TrackerGlyph';

/** "Day — Today ›": tap to pick another day (never a future one). */
export function DayRow({ dateISO, onPress, label = 'Day' }: { dateISO: string; onPress: () => void; label?: string }) {
  const shown = relativeDay(dateISO, todayISO());
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${shown}. Change the day`}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        minHeight: 48,
        gap: space.sm,
        paddingHorizontal: space.md,
        borderRadius: radius.md,
        backgroundColor: pressed ? color.surfaceRaised : color.surfaceSunken,
        borderWidth: 1,
        borderColor: color.border,
      })}
    >
      <Icon name="calendar" size={16} color={color.inkMuted} />
      <Text style={{ flex: 1, fontFamily: type.bodyMedium, fontSize: type.size.sub, color: color.inkSecondary }}>{label}</Text>
      <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.body, color: color.ink }}>{shown}</Text>
      <Icon name="chevron-right" size={16} color={color.inkMuted} />
    </Pressable>
  );
}

/** A number box with its unit, as the log forms draw it. */
export function NumberBox({
  value,
  onChangeText,
  unit,
  placeholder,
  accessibilityLabel,
}: {
  value: string;
  onChangeText: (t: string) => void;
  unit: string;
  placeholder?: string;
  accessibilityLabel: string;
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.sm,
        height: 48,
        paddingHorizontal: space.md,
        borderRadius: radius.md,
        backgroundColor: color.surfaceSunken,
        borderWidth: 1,
        borderColor: color.border,
      }}
    >
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={color.inkFaint}
        keyboardType="decimal-pad"
        accessibilityLabel={accessibilityLabel}
        style={{ flex: 1, fontFamily: type.mono, fontSize: type.size.body, color: color.ink, paddingVertical: 0 }}
      />
      <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.sub, color: color.inkMuted }}>{unit}</Text>
    </View>
  );
}

/** A plain line under a form: a fact (muted) or what went wrong (red). */
export function FormNote({ text, tone = 'muted' }: { text: string | null; tone?: 'muted' | 'error' }) {
  if (!text) return null;
  return (
    <Text
      accessibilityLiveRegion="polite"
      style={{
        fontFamily: tone === 'error' ? type.bodyMedium : type.body,
        fontSize: type.size.caption,
        lineHeight: 17,
        color: tone === 'error' ? color.criticalText : color.inkMuted,
      }}
    >
      {text}
    </Text>
  );
}

export interface BodyEntrySheetProps {
  visible: boolean;
  /** "Fix this weigh-in", "Fix this waist entry". */
  title: string;
  unit: string;
  /** The value as the member reads it (their units). */
  value: string;
  dateISO: string;
  /** Spoken name of the number box. */
  valueLabel: string;
  /** Title of the day picker ("Weigh-in date"). */
  dayTitle: string;
  saving?: boolean;
  error?: string | null;
  /** A fact about the chosen day ("Replaces 76.2 kg"), given the day. */
  noteFor?: (dateISO: string) => string | null;
  onSave: (text: string, dateISO: string) => void;
  onDelete: () => void;
  onClose: () => void;
}

export function BodyEntrySheet(p: BodyEntrySheetProps) {
  const [text, setText] = useState(p.value);
  const [day, setDay] = useState(p.dateISO);
  const [picking, setPicking] = useState(false);
  useEffect(() => {
    if (!p.visible) return;
    setText(p.value);
    setDay(p.dateISO);
    setPicking(false);
  }, [p.visible, p.value, p.dateISO]);

  const note = p.noteFor ? p.noteFor(day) : null;
  return (
    <>
      <Sheet
        visible={p.visible && !picking}
        title={p.title}
        onClose={p.onClose}
        footer={<PrimaryButton label="Save" icon="check" loading={p.saving} onPress={() => p.onSave(text, day)} />}
      >
        <View style={{ gap: space.md }}>
          <NumberBox value={text} onChangeText={setText} unit={p.unit} accessibilityLabel={p.valueLabel} />
          <DayRow dateISO={day} onPress={() => setPicking(true)} />
          <FormNote text={note} />
          <FormNote text={p.error ?? null} tone="error" />
          <Pressable
            onPress={p.onDelete}
            accessibilityRole="button"
            accessibilityLabel="Delete this entry"
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, minHeight: 48 }}
          >
            <Glyph name="trash" size={18} color={color.criticalText} />
            <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.body, color: color.criticalText }}>Delete</Text>
          </Pressable>
        </View>
      </Sheet>
      <DatePickerSheet
        visible={p.visible && picking}
        title={p.dayTitle}
        value={day}
        onChoose={(iso) => {
          setDay(iso);
          setPicking(false);
        }}
        onClose={() => setPicking(false)}
      />
    </>
  );
}

/** Floats its child (an UndoBar) above the gesture bar, over the screen. */
export function FloatAtBottom({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: space.screenX, right: space.screenX, bottom: insets.bottom + space.lg }}>
      {children}
    </View>
  );
}
