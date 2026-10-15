/**
 * Tap the set number → this sheet (Phase 1, Hevy-style): choose Normal, Warm-up,
 * Drop set or Failure, or remove the set. Replaces the old always-visible second row of
 * chips, so the set table stays one clean line per set.
 *
 * 15 Oct 2026 (owner, testing in the gym: "Keep RPE section just for RPE"): RPE moved to its own
 * one-tap sheet on the RPE cell (RpeSheet.tsx). This sheet is set type only, and a type applies
 * and closes at once — so it needs no ✓ "Done" (the 13 Oct ✓ was there for the RPE grid).
 */
import { Text, View } from 'react-native';

import { color, type } from '@/theme/tokens';

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
  onType,
  onRemove,
  onClose,
}: {
  visible: boolean;
  set: DraftSet | null;
  onType: (t: SetTypeChoice) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  if (!set) return null;
  const cur = currentTypeOf(set);
  return (
    <TrackerSheet visible={visible} title="Set type" onClose={onClose}>
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

      <SheetRow label="Remove set" danger onPress={onRemove} leading={<Glyph name="trash" size={20} color={color.criticalText} />} />
    </TrackerSheet>
  );
}
