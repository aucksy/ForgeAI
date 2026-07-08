/** Bottom-sheet plate calculator (kg): target + bar -> per-side plate stack. */
import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, Text, TextInput, View } from 'react-native';

import { Icon } from '@/components/ui';
import { trimNum } from '@/lib/format';
import { color, radius, space, type } from '@/theme/tokens';

import { BAR_OPTIONS_KG, DEFAULT_BAR_KG, computePlates } from '../services/plateMath';

export function PlateCalcSheet({
  visible,
  initialKg,
  onClose,
}: {
  visible: boolean;
  initialKg: number;
  onClose: () => void;
}) {
  const [text, setText] = useState('');
  const [barKg, setBarKg] = useState<number>(DEFAULT_BAR_KG);

  useEffect(() => {
    if (visible) setText(initialKg > 0 ? String(initialKg) : '');
  }, [visible, initialKg]);

  const target = useMemo(() => {
    const n = parseFloat(text.replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
  }, [text]);

  const result = useMemo(() => (target > 0 ? computePlates(target, barKg) : null), [target, barKg]);

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
            <Icon name="scale" size={20} color={color.accent} />
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
            placeholder="kg"
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
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.body, color: color.inkSecondary, width: 64 }}>
            Bar
          </Text>
          {BAR_OPTIONS_KG.map((b) => {
            const on = barKg === b;
            return (
              <Pressable
                key={b}
                onPress={() => setBarKg(b)}
                style={{
                  paddingHorizontal: space.md,
                  paddingVertical: 8,
                  borderRadius: radius.pill,
                  backgroundColor: on ? color.accentSoft : color.surfaceSunken,
                  borderWidth: 1,
                  borderColor: on ? 'rgba(255,122,59,0.45)' : color.border,
                }}
              >
                <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: on ? color.accent : color.inkSecondary }}>
                  {b} kg
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
                      borderColor: 'rgba(255,122,59,0.35)',
                    }}
                  >
                    <Text style={{ fontFamily: type.monoBold, fontSize: type.size.body, color: color.accentBright }}>
                      {trimNum(p)}
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
                Closest achievable: {trimNum(result.achievableKg)} kg (target {trimNum(result.targetKg)} kg)
              </Text>
            ) : (
              <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.sub, color: color.inkSecondary }}>
                {trimNum(result.achievableKg)} kg · each side loaded the same
              </Text>
            )}
          </View>
        ) : (
          <Text style={{ fontFamily: type.body, fontSize: type.size.sub, color: color.inkMuted }}>
            Enter a target weight to see the plates.
          </Text>
        )}
      </View>
    </Modal>
  );
}
