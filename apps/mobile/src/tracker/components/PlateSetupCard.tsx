/**
 * Settings → Workouts → Plates and bars (Oct 2026). Hevy's "Available Equipment → Manage" in the
 * plate calculator (hevyapp.com/features/weight-plate-calculator): switch off the plates your gym
 * does not have, add your own sizes, pick the bar. Kept per unit system — the kg page and the lb
 * page are separate lists.
 *
 * Built for the owner's phone (large display size + large font): every plate is a full-width row
 * with a switch (no chip grid to squeeze), every button is at least 48 dp, and the type-a-number
 * rows wrap their button under the box when the text is big.
 */
import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { SettingRow, ToggleRow } from '@/components/settings/SettingRow';
import { Card, GhostButton, SheetRow } from '@/components/ui';
import { tap } from '@/lib/haptics';
import { weightUnitOf, type UnitSystem } from '@/lib/units';
import { useUnits } from '@/lib/useUnits';
import { color, radius, space, type } from '@/theme/tokens';

import {
  addPlate,
  allPlates,
  chooseBar,
  isExtraPlate,
  plateOn,
  removePlate,
  setupBar,
  standardBars,
  togglePlate,
  type PlateSetup,
} from '../services/plateMath';
import { usePlateSetup, usePlateSetupFor } from '../store/plateSetupStore';
import { parseTyped } from './unitText';

const HEADING = () => ({
  fontFamily: type.bodySemi,
  fontSize: type.size.caption,
  color: color.inkMuted,
  letterSpacing: 1.1,
  textTransform: 'uppercase',
  marginBottom: space.sm,
}) as const;

const LINE = () => ({ fontFamily: type.body, fontSize: type.size.caption, color: color.inkMuted, lineHeight: 17 }) as const;

const ERROR = () => ({ fontFamily: type.bodyMedium, fontSize: type.size.sub, color: color.criticalText, lineHeight: 19 }) as const;

/** A short number in the unit's own words: 1.25 → "1.25 kg". */
const say = (n: number, u: UnitSystem): string => `${Math.round(n * 100) / 100} ${weightUnitOf(u)}`;

/** A number box with a button beside it (wraps under it at large text). */
function TypeRow({
  value,
  onChange,
  placeholder,
  button,
  spoken,
  onSubmit,
}: {
  value: string;
  onChange: (t: string) => void;
  placeholder: string;
  button: string;
  spoken: string;
  onSubmit: () => void;
}) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm }}>
      <TextInput
        value={value}
        onChangeText={onChange}
        keyboardType="decimal-pad"
        placeholder={placeholder}
        placeholderTextColor={color.inkMuted}
        accessibilityLabel={spoken}
        onSubmitEditing={onSubmit}
        style={{
          flexGrow: 1,
          flexBasis: 140,
          minHeight: 48,
          borderRadius: radius.md,
          backgroundColor: color.surfaceSunken,
          borderWidth: 1,
          borderColor: color.border,
          paddingHorizontal: space.md,
          fontFamily: type.monoBold,
          fontSize: type.size.body,
          color: color.ink,
        }}
      />
      <Pressable
        onPress={onSubmit}
        accessibilityRole="button"
        accessibilityLabel={`${button}, ${spoken}`}
        style={({ pressed }) => ({
          minHeight: 48,
          minWidth: 88,
          paddingHorizontal: space.lg,
          borderRadius: radius.pill,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: color.accentSoft,
          borderWidth: 1,
          borderColor: color.accent,
          opacity: pressed ? 0.7 : 1,
        })}
      >
        <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.body, color: color.accent }}>{button}</Text>
      </Pressable>
    </View>
  );
}

export function PlateSetupCard() {
  const units = useUnits();
  const unit = weightUnitOf(units);
  const setup = usePlateSetupFor(units);
  const setSetup = usePlateSetup((s) => s.setSetup);
  const resetSetup = usePlateSetup((s) => s.resetSetup);
  const loadError = usePlateSetup((s) => s.loadError);
  const [plateText, setPlateText] = useState('');
  const [plateError, setPlateError] = useState<string | null>(null);
  const [barText, setBarText] = useState('');
  const [barError, setBarError] = useState<string | null>(null);

  const save = (next: PlateSetup): void => {
    setSetup(units, next);
  };

  const plates = allPlates(setup, units);
  const onCount = plates.filter((n) => plateOn(setup, n)).length;
  const bar = setupBar(setup, units);
  const bars = [...standardBars(units)];
  if (!bars.some((b) => Math.abs(b - bar) < 1e-9)) bars.push(bar);
  bars.sort((a, b) => b - a);

  const onAddPlate = (): void => {
    const next = addPlate(setup, parseTyped(plateText), units);
    if (typeof next === 'string') {
      setPlateError(next);
      return;
    }
    tap();
    save(next);
    setPlateText('');
    setPlateError(null);
  };

  const onUseBar = (): void => {
    const next = chooseBar(setup, parseTyped(barText), units);
    if (typeof next === 'string') {
      setBarError(next);
      return;
    }
    tap();
    save(next);
    setBarText('');
    setBarError(null);
  };

  return (
    <View style={{ gap: space.md }}>
      {loadError ? <Text style={ERROR()}>Couldn&apos;t read your saved plates. Showing the standard set.</Text> : null}

      <Card style={{ paddingVertical: space.md }}>
        <Text accessibilityRole="header" style={HEADING()}>
          Plates ({unit})
        </Text>
        <Text style={LINE()}>Turn off the plates your gym doesn&apos;t have. The plate calculator uses only the ones that are on.</Text>
        {plates.map((n, i) =>
          isExtraPlate(setup, n, units) ? (
            <SettingRow
              key={`x${n}`}
              title={say(n, units)}
              caption="Added by you"
              divider={i > 0}
              right={
                <Pressable
                  onPress={() => {
                    tap();
                    save(removePlate(setup, n));
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${say(n, units)} plates`}
                  style={({ pressed }) => ({
                    minHeight: 48,
                    minWidth: 48,
                    paddingHorizontal: space.md,
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: pressed ? 0.6 : 1,
                  })}
                >
                  <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.body, color: color.criticalText }}>Remove</Text>
                </Pressable>
              }
            />
          ) : (
            <ToggleRow
              key={`s${n}`}
              title={say(n, units)}
              value={plateOn(setup, n)}
              onChange={(on) => save(togglePlate(setup, n, on))}
              divider={i > 0}
            />
          ),
        )}
        {onCount === 0 ? (
          <Text style={[ERROR(), { marginTop: space.xs }]}>No plates are on. The calculator will show just the bar.</Text>
        ) : null}
        <View style={{ borderTopWidth: 1, borderTopColor: color.border, paddingTop: space.md, gap: space.sm }}>
          <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.body, color: color.ink }}>Add a plate</Text>
          <TypeRow
            value={plateText}
            onChange={(t) => {
              setPlateText(t);
              setPlateError(null);
            }}
            placeholder={units === 'imperial' ? 'e.g. 1.25' : 'e.g. 0.5'}
            button="Add"
            spoken={`New plate weight in ${units === 'imperial' ? 'pounds' : 'kilograms'}`}
            onSubmit={onAddPlate}
          />
          {plateError ? <Text style={ERROR()}>{plateError}</Text> : null}
        </View>
      </Card>

      <Card style={{ paddingVertical: space.md }}>
        <Text accessibilityRole="header" style={HEADING()}>
          Bar
        </Text>
        <Text style={[LINE(), { marginBottom: space.sm }]}>The plate calculator starts on this bar. You can switch it there for one lift.</Text>
        <View accessibilityRole="radiogroup" style={{ gap: space.xs }}>
          {bars.map((b) => (
            <SheetRow
              key={b}
              label={say(b, units)}
              selected={Math.abs(b - bar) < 1e-9}
              onPress={() => {
                tap();
                const next = chooseBar(setup, b, units);
                if (typeof next !== 'string') save(next);
              }}
            />
          ))}
        </View>
        <View style={{ borderTopWidth: 1, borderTopColor: color.border, marginTop: space.sm, paddingTop: space.md, gap: space.sm }}>
          <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.body, color: color.ink }}>Another bar</Text>
          <Text style={LINE()}>{units === 'imperial' ? 'Like a 25 lb EZ bar.' : "Like a 15 kg women's bar or a 10 kg EZ bar."}</Text>
          <TypeRow
            value={barText}
            onChange={(t) => {
              setBarText(t);
              setBarError(null);
            }}
            placeholder={units === 'imperial' ? 'e.g. 25' : 'e.g. 12'}
            button="Use"
            spoken={`Bar weight in ${units === 'imperial' ? 'pounds' : 'kilograms'}`}
            onSubmit={onUseBar}
          />
          {barError ? <Text style={ERROR()}>{barError}</Text> : null}
        </View>
      </Card>

      <GhostButton
        label="Back to the standard set"
        accessibilityLabel={`Back to the standard ${unit} plates and bar`}
        onPress={() => {
          tap();
          resetSetup(units);
          setPlateError(null);
          setBarError(null);
        }}
      />
    </View>
  );
}
