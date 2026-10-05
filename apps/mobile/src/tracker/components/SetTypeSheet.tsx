/**
 * Tap the set number → this sheet (Phase 1, Hevy-style): choose Normal, Warm-up,
 * Drop set or Failure, or remove the set. With "Track RPE" on, the same sheet
 * also sets how hard the set felt. Replaces the old always-visible second row of
 * chips, so the set table stays one clean line per set.
 */
import { Pressable, Text, View } from 'react-native';

import { color, radius, space, type } from '@/theme/tokens';

import { RPE_CHOICES, rpeColor, rpeMeaning } from '../lib/rpe';
import type { DraftSet } from '../store/activeWorkoutStore';
import { Glyph } from './TrackerGlyph';
import { SheetRow, TrackerSheet } from './TrackerSheet';

export type SetTypeChoice = 'normal' | 'warmup' | 'drop' | 'failure';

const TYPES: { id: SetTypeChoice; label: string; glyph: string; tint: string }[] = [
  { id: 'normal', label: 'Normal set', glyph: '1', tint: color.inkSecondary },
  { id: 'warmup', label: 'Warm-up', glyph: 'W', tint: color.warning },
  { id: 'drop', label: 'Drop set', glyph: 'D', tint: color.accent },
  { id: 'failure', label: 'Failure', glyph: 'F', tint: color.criticalText },
];

export function currentTypeOf(set: Pick<DraftSet, 'isWarmup' | 'setType'>): SetTypeChoice {
  return set.isWarmup ? 'warmup' : set.setType ?? 'normal';
}

export function SetTypeSheet({
  visible,
  set,
  showRpe,
  onType,
  onRpe,
  onRemove,
  onClose,
}: {
  visible: boolean;
  set: DraftSet | null;
  showRpe: boolean;
  onType: (t: SetTypeChoice) => void;
  onRpe: (rpe: number | null) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  if (!set) return null;
  const cur = currentTypeOf(set);
  const rpe = set.rpe ?? null;
  return (
    <TrackerSheet visible={visible} title="Set type" onClose={onClose}>
      <View style={{ gap: 2 }}>
        {TYPES.map((t) => (
          <SheetRow
            key={t.id}
            label={t.label}
            selected={cur === t.id}
            onPress={() => onType(t.id)}
            leading={
              <Text style={{ fontFamily: type.monoBold, fontSize: type.size.body, color: t.tint }}>{t.glyph}</Text>
            }
          />
        ))}
      </View>

      {showRpe && !set.isWarmup ? (
        <View style={{ gap: space.sm }}>
          <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.caption, color: color.inkMuted, letterSpacing: 1 }}>
            HOW HARD WAS IT? (RPE)
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.xs }}>
            {RPE_CHOICES.map((v) => {
              const selected = rpe === v;
              return (
                <Pressable
                  key={v}
                  onPress={() => onRpe(selected ? null : v)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`RPE ${v}`}
                  style={{
                    width: 46,
                    height: 40,
                    borderRadius: radius.sm,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderWidth: 1,
                    borderColor: selected ? rpeColor(v) : color.border,
                    backgroundColor: selected ? color.surface : color.surfaceSunken,
                  }}
                >
                  <Text style={{ fontFamily: type.monoBold, fontSize: type.size.sub, color: rpeColor(v) }}>{v}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={{ fontFamily: type.body, fontSize: type.size.sub, color: color.inkSecondary }}>
            {rpe != null ? rpeMeaning(rpe) : 'Optional. Tap again to clear.'}
          </Text>
        </View>
      ) : null}

      <SheetRow label="Remove set" danger onPress={onRemove} leading={<Glyph name="trash" size={20} color={color.criticalText} />} />
    </TrackerSheet>
  );
}
