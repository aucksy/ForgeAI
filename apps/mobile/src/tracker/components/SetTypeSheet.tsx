/**
 * Tap the set number → this sheet (Phase 1, Hevy-style): choose Normal, Warm-up,
 * Drop set or Failure, or remove the set. With "Track RPE" on, the same sheet
 * also sets how hard the set felt. Replaces the old always-visible second row of
 * chips, so the set table stays one clean line per set.
 *
 * 13 Oct 2026 (owner's screenshot): a choice applies at once, so once the type or RPE changed a
 * ✓ "Done" shows beside the × (keep and close; `setChoiceChanged`). The RPE choices are an even
 * 3 × 3 grid of equal 48 dp cells (`rpeGrid`) — at large text they used to wrap 6 + 3 — and the
 * picked one is filled, outlined and ticked.
 */
import { useRef } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Icon } from '@/components/ui';

import { color, radius, space, type } from '@/theme/tokens';

import { rpeColor, rpeGrid, rpeMeaning } from '../lib/rpe';
import { setChoiceChanged, setChoiceOf, type SetChoice } from '../lib/sheetChange';
import type { DraftSet } from '../store/activeWorkoutStore';
import { Glyph } from './TrackerGlyph';
import { SheetRow, TrackerSheet } from './TrackerSheet';

export type SetTypeChoice = 'normal' | 'warmup' | 'drop' | 'failure';

// Read when drawn: gym branding repaints the tokens.
function types(): { id: SetTypeChoice; label: string; glyph: string; tint: string }[] {
  return [
    { id: 'normal', label: 'Normal set', glyph: '1', tint: color.inkSecondary },
    { id: 'warmup', label: 'Warm-up', glyph: 'W', tint: color.warning },
    { id: 'drop', label: 'Drop set', glyph: 'D', tint: color.accent },
    { id: 'failure', label: 'Failure', glyph: 'F', tint: color.criticalText },
  ];
}

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
  // What the set was when the sheet opened for it (a new set = a fresh start).
  const start = useRef<{ key: string; choice: SetChoice } | null>(null);
  if (!visible || !set) start.current = null;
  else if (start.current?.key !== set.key) start.current = { key: set.key, choice: setChoiceOf(set) };
  if (!set) return null;
  const cur = currentTypeOf(set);
  const rpe = set.rpe ?? null;
  const changed = setChoiceChanged(start.current?.choice ?? null, setChoiceOf(set));
  return (
    <TrackerSheet visible={visible} title="Set type" onClose={onClose} onDone={onClose} changed={changed}>
      <View style={{ gap: 2 }}>
        {types().map((t) => (
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
          <View style={{ gap: space.sm }}>
            {rpeGrid().map((row) => (
              <View key={row.join()} style={{ flexDirection: 'row', gap: space.sm }}>
                {row.map((v) => {
                  const selected = rpe === v;
                  return (
                    <Pressable
                      key={v}
                      onPress={() => onRpe(selected ? null : v)}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: selected }}
                      accessibilityLabel={`RPE ${v}`}
                      style={({ pressed }) => ({
                        flex: 1,
                        minHeight: 48,
                        flexDirection: 'row',
                        gap: 4,
                        borderRadius: radius.sm,
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderWidth: selected ? 2 : 1,
                        borderColor: selected ? rpeColor(v) : color.border,
                        backgroundColor: selected ? color.accentSoft : pressed ? color.surface : color.surfaceSunken,
                      })}
                    >
                      {selected ? <Icon name="check" size={14} color={rpeColor(v)} /> : null}
                      <Text numberOfLines={1} style={{ fontFamily: type.monoBold, fontSize: type.size.body, color: rpeColor(v) }}>
                        {v}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ))}
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
