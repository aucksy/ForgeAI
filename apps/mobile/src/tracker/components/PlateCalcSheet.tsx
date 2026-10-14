/**
 * Bottom-sheet plate calculator: target + bar -> per-side plate stack. Works in kg; under
 * "lb, miles" (v0.27.0) the target is typed in lb and the bar and plates are the pound set.
 *
 * Oct 2026: uses the member's own plates and bar (Settings → Workouts → Plates and bars, as Hevy's
 * "Available Equipment"); says which bar it assumed; a target the plates cannot make shows the
 * nearest load below and above; "Change plates" opens that page.
 */
import { useRouter, type Href } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, Text, TextInput, View } from 'react-native';

import { Icon } from '@/components/ui';
import { shownToKg, weightUnitOf } from '@/lib/units';
import { useUnits } from '@/lib/useUnits';
import { accentTint } from '@/theme/tint';
import { color, radius, space, type } from '@/theme/tokens';

import { computePlates, gymBarChoicesKg, gymBarKg, gymPlatesKg } from '../services/plateMath';
import { usePlateSetupFor } from '../store/plateSetupStore';
import { kgToTyped, parseTyped, showW } from './unitText';

export function PlateCalcSheet({
  visible,
  initialKg,
  onClose,
}: {
  visible: boolean;
  initialKg: number;
  onClose: () => void;
}) {
  const units = useUnits();
  const unit = weightUnitOf(units);
  const [text, setText] = useState('');
  const setup = usePlateSetupFor(units);
  const router = useRouter();
  const [barKg, setBarKg] = useState<number>(() => gymBarKg(setup, units));
  const [openError, setOpenError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) setText(initialKg > 0 ? kgToTyped(initialKg, units) : '');
  }, [visible, initialKg, units]);
  // Each opening, a unit switch (20 kg ↔ 45 lb) or a new usual bar starts on the member's bar.
  useEffect(() => {
    if (visible) {
      setBarKg(gymBarKg(setup, units));
      setOpenError(null);
    }
  }, [visible, setup, units]);
  const plates = useMemo(() => gymPlatesKg(setup, units), [setup, units]);
  const usualBar = gymBarKg(setup, units);

  const changePlates = (): void => {
    setOpenError(null);
    try {
      // Open first, then close: if opening fails the sheet stays up and says so.
      router.push('/settings/plates' as Href);
      onClose();
    } catch (e) {
      console.warn('[ForgeErr] plate calculator: Plates and bars did not open', e);
      setOpenError("Couldn't open Plates and bars. Try again from Settings → Workouts.");
    }
  };

  // The typed target, in kg (typed pounds turned into kg).
  const target = useMemo(() => {
    const n = parseTyped(text);
    return n != null && Number.isFinite(n) ? shownToKg(n, units) : 0;
  }, [text, units]);

  const result = useMemo(() => (target > 0 ? computePlates(target, barKg, plates) : null), [target, barKg, plates]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' }} onPress={onClose} />
      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: color.surfaceRaised,
          borderTopLeftRadius: radius.xl,
          borderTopRightRadius: radius.xl,
          borderWidth: 1,
          borderColor: color.borderStrong,
          padding: space.xl,
          paddingBottom: space.xxl,
          gap: space.lg,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <Icon name="dumbbell" size={20} color={color.accent} />
            <Text style={{ fontFamily: type.heading, fontSize: type.size.h3, color: color.ink }}>Plate calculator</Text>
          </View>
          <Pressable onPress={onClose} hitSlop={8}>
            <Icon name="close" size={22} color={color.inkMuted} />
          </Pressable>
        </View>

        {/* target weight */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.body, color: color.inkSecondary, width: 64 }}>
            Target
          </Text>
          <TextInput
            value={text}
            onChangeText={setText}
            keyboardType="decimal-pad"
            selectTextOnFocus
            placeholder={unit}
            placeholderTextColor={color.inkMuted}
            style={{
              flex: 1,
              height: 44,
              borderRadius: radius.md,
              backgroundColor: color.surfaceSunken,
              borderWidth: 1,
              borderColor: color.border,
              textAlign: 'center',
              fontFamily: type.monoBold,
              fontSize: type.size.h3,
              color: color.ink,
              paddingVertical: 0,
            }}
          />
        </View>

        {/* bar selector */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm }}>
          <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.body, color: color.inkSecondary, width: 64 }}>
            Bar
          </Text>
          {gymBarChoicesKg(setup, units).map((b) => {
            const on = Math.abs(barKg - b) < 1e-6;
            return (
              <Pressable
                key={b}
                onPress={() => setBarKg(b)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`${showW(b, units)} ${unit} bar`}
                style={{
                  minHeight: 48,
                  justifyContent: 'center',
                  paddingHorizontal: space.md,
                  paddingVertical: 8,
                  borderRadius: radius.pill,
                  backgroundColor: on ? color.accentSoft : color.surfaceSunken,
                  borderWidth: 1,
                  borderColor: on ? accentTint(0.45) : color.border,
                }}
              >
                <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: on ? color.accent : color.inkSecondary }}>
                  {showW(b, units)} {unit}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* result */}
        {result ? (
          <View style={{ gap: space.sm }}>
            <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.caption, color: color.inkMuted, letterSpacing: 0.4 }}>
              PER SIDE
            </Text>
            {result.perSide.length > 0 ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {result.perSide.map((p, i) => (
                  <View
                    key={i}
                    style={{
                      paddingHorizontal: space.md,
                      paddingVertical: 8,
                      borderRadius: radius.sm,
                      backgroundColor: color.accentSoft,
                      borderWidth: 1,
                      borderColor: accentTint(0.35),
                    }}
                  >
                    <Text style={{ fontFamily: type.monoBold, fontSize: type.size.body, color: color.accentBright }}>
                      {showW(p, units)}
                    </Text>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={{ fontFamily: type.body, fontSize: type.size.sub, color: color.inkMuted }}>
                Just the bar — no plates needed.
              </Text>
            )}
            {!result.exact ? (
              <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.sub, color: color.warning }}>
                {result.targetKg < result.barKg
                  ? `The bar alone is ${showW(result.barKg, units)} ${unit} (target ${showW(result.targetKg, units)} ${unit})`
                  : `Can't make ${showW(result.targetKg, units)} ${unit} with your plates. Shown: ${showW(result.achievableKg, units)} ${unit}.`}
                {result.higherKg != null && result.higherPerSide
                  ? ` Next up: ${showW(result.higherKg, units)} ${unit} (${result.higherPerSide.map((p) => showW(p, units)).join(' + ')} a side).`
                  : ''}
              </Text>
            ) : (
              <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.sub, color: color.inkSecondary }}>
                {showW(result.achievableKg, units)} {unit} · each side loaded the same
              </Text>
            )}
          </View>
        ) : (
          <Text style={{ fontFamily: type.body, fontSize: type.size.sub, color: color.inkMuted }}>
            Enter a target weight to see the plates.
          </Text>
        )}

        {/* Which bar and plates it assumed, and the way to change them. */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: space.md }}>
          <Text style={{ flexShrink: 1, fontFamily: type.body, fontSize: type.size.sub, color: color.inkSecondary }}>
            {`Using a ${showW(barKg, units)} ${unit} bar${Math.abs(barKg - usualBar) < 1e-6 ? ' (your usual)' : ''}${plates.length === 0 ? ', no plates on' : ''}.`}
          </Text>
          <Pressable
            onPress={changePlates}
            accessibilityRole="link"
            accessibilityLabel="Change plates and bars"
            style={({ pressed }) => ({ minHeight: 48, justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}
          >
            <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: color.accent, textDecorationLine: 'underline' }}>
              Change plates
            </Text>
          </Pressable>
        </View>
        {openError ? (
          <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.sub, color: color.criticalText }}>{openError}</Text>
        ) : null}
      </View>
    </Modal>
  );
}
