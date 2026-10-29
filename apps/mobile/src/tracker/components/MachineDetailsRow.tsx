/**
 * F64 (29 Oct 2026) — a cardio machine's details under one set row: a treadmill's speed and
 * incline, a bike's / elliptical's / stair climber's / rower's level. Every box is optional; a
 * blank box saves nothing, so a set logged without them is stored exactly as before.
 *
 * Not a hint and not filled by a tick: the boxes hold only what the member typed (a hint a tick
 * would not save would mislead). Intervals are simply more sets, each with its own speed.
 */
import { memo, useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { useUnits } from '@/lib/useUnits';
import { color, radius, space, type } from '@/theme/tokens';

import {
  fieldLabel,
  machineBoxText,
  parseMachineValue,
  withMachineField,
  type MachineDetails,
  type MachineField,
} from '../engine/cardioMachine';
import { useActiveWorkout } from '../store/activeWorkoutStore';

const BOX_W = 64;
const BOX_H = 40;

/** How a box is spoken: "Speed for set 2", "Incline for warm-up 1". */
export function machineBoxA11y(field: MachineField, spoken: string): string {
  const what = field === 'speed' ? 'Speed' : field === 'incline' ? 'Incline' : 'Level'; // member-words
  return `${what} for ${spoken}`; // member-words
}

export const MachineDetailsRow = memo(function MachineDetailsRow({
  exKey,
  setKey,
  machine,
  fields,
  spoken,
  insetLeft,
}: {
  exKey: string;
  setKey: string;
  machine: MachineDetails | null | undefined;
  fields: readonly MachineField[];
  /** How the set is spoken ("set 2"). */
  spoken: string;
  /** Lines the boxes up under the set's own boxes (past its SET cell). */
  insetLeft: number;
}) {
  const units = useUnits();
  const updateSet = useActiveWorkout((s) => s.updateSet);
  if (fields.length === 0) return null;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.md, paddingLeft: insetLeft, marginTop: -2 }}>
      {fields.map((field) => (
        <MachineBox
          key={field}
          field={field}
          stored={machineBoxText(machine, field, units)}
          label={fieldLabel(field, units)}
          a11y={machineBoxA11y(field, spoken)}
          onValue={(v) => {
            const cur = useActiveWorkout.getState().exercises.find((e) => e.key === exKey)?.sets.find((s) => s.key === setKey)?.machine;
            updateSet(exKey, setKey, { machine: withMachineField(cur, field, v, units) });
          }}
        />
      ))}
    </View>
  );
});

function MachineBox({
  field,
  stored,
  label,
  a11y,
  onValue,
}: {
  field: MachineField;
  stored: string;
  label: string;
  a11y: string;
  onValue: (v: number | null) => void;
}) {
  const [text, setText] = useState(stored);
  // Follow the store when it changes from elsewhere (an edit loaded), never mid-typing ("8.").
  useEffect(() => {
    const typed = parseMachineValue(text, field);
    const shown = parseMachineValue(stored, field);
    if (typed !== shown) setText(stored);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stored]);
  return (
    <Pressable accessible={false} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 48 }}>
      <TextInput
        value={text}
        onChangeText={(t) => {
          const clean = t.replace(/[^\d.,]/g, '').slice(0, 5);
          setText(clean);
          onValue(parseMachineValue(clean, field));
        }}
        keyboardType="decimal-pad"
        // R-79: a multi-line box lets a drag that starts on it scroll the page (see SetRow).
        multiline
        submitBehavior="blurAndSubmit"
        returnKeyType="done"
        selectTextOnFocus
        accessibilityLabel={a11y}
        style={{
          width: BOX_W,
          minHeight: BOX_H,
          borderRadius: radius.sm,
          backgroundColor: color.surfaceSunken,
          borderWidth: 1,
          borderColor: color.border,
          textAlign: 'center',
          textAlignVertical: 'center',
          fontFamily: type.monoBold,
          fontSize: type.size.sub,
          color: color.ink,
          paddingVertical: 0,
          paddingHorizontal: 2,
        }}
      />
      <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.caption, color: color.inkMuted }}>{label}</Text>
    </Pressable>
  );
}
