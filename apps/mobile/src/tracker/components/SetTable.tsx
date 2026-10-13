/**
 * The one set table for a saved workout's sets (redesign R5, Hevy's Workout Detail): a "Set ·
 * Weight & reps" head, then W / 1 / 2 / D / F, the set in the exercise's own words, "@8" when an
 * RPE was logged, and a medal on a set that holds a record. Shared by the workout's page
 * (`WorkoutDetail`) and, since 13 Oct 2026, the exercise page's "Last time" card, so both read
 * the same. Rows come from `services/workoutDetail` (`detailSetRows`, `lastTimeRows`; PURE).
 */
import { Text, View } from 'react-native';

import { color, radius, space, type } from '@/theme/tokens';

import type { LogType } from '../engine/logTypes';
import { RECORD_LABEL } from '../engine/records';
import type { DetailSetRow } from '../services/workoutDetail';
import { Glyph } from './TrackerGlyph';

const TABLE_HEAD: Record<LogType, string> = {
  weight_reps: 'Weight & reps',
  weighted: 'Added weight & reps',
  reps: 'Reps',
  assisted: 'Help & reps',
  time: 'Time',
  distance: 'Distance',
  time_distance: 'Distance & time',
};

// Read when drawn: gym branding repaints the tokens.
const label = () => ({ fontFamily: type.bodyMedium, fontSize: type.size.caption, color: color.inkMuted }) as const;

export function SetTable({ rows, logType }: { rows: readonly DetailSetRow[]; logType: LogType }) {
  return (
    <View style={{ gap: space.sm }}>
      <View style={{ flexDirection: 'row', gap: space.md, paddingHorizontal: space.sm }}>
        <Text style={[label(), { width: 28 }]}>Set</Text>
        <Text style={[label(), { flex: 1 }]}>{TABLE_HEAD[logType]}</Text>
      </View>
      {rows.map((r, i) => (
        <View
          key={r.id}
          accessible
          accessibilityLabel={`Set ${r.mark}: ${r.text}${r.rpe ? `, effort ${r.rpe.slice(1)}` : ''}${r.records.length > 0 ? `, a record: ${r.records.map((k) => RECORD_LABEL[k].toLowerCase()).join(', ')}` : ''}`}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: space.md,
            minHeight: 36,
            paddingHorizontal: space.sm,
            borderRadius: radius.sm,
            backgroundColor: i % 2 === 0 ? color.surfaceSunken : 'transparent',
          }}
        >
          <Text style={{ width: 28, fontFamily: type.monoBold, fontSize: type.size.sub, color: r.warmup ? color.inkMuted : /^\d+$/.test(r.mark) ? color.inkSecondary : color.accent }}>{r.mark}</Text>
          <Text style={{ flex: 1, fontFamily: type.mono, fontSize: type.size.sub, color: r.warmup ? color.inkMuted : color.ink }}>
            {r.text}
            {r.rpe ? <Text style={{ color: color.inkMuted }}>{`  ${r.rpe}`}</Text> : null}
          </Text>
          {r.records.length > 0 ? <Glyph name="medal" size={18} color={color.accent} /> : null}
        </View>
      ))}
    </View>
  );
}
