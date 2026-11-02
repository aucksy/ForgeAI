import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { Chip, EmptyState } from '@/components/ui';
import { addDays, todayISO } from '@/lib/date';
import { color, space, type } from '@/theme/tokens';
import { MUSCLE_LABEL, type Muscle } from '@/tracker/catalog/muscles';
import { BodyMap } from '@/tracker/components/BodyMap';
import {
  lastTrainedByMuscle,
  legendFor,
  MAP_RANGES,
  MAPPED_MUSCLES,
  muscleLevels,
  stepsFor,
  untrainedLine,
  untrainedMuscles,
  untrainedWithAge,
  type MapRange,
} from '@/tracker/engine/bodyMap';
import { fmtSets, type MuscleSetsSlice } from '@/tracker/engine/volume';
import { mapLevels } from '@/tracker/lib/bodyMapColors';
import { getExerciseLastDays } from '@/tracker/services/progressTop';
import { getMuscleSetsBetween } from '@/tracker/services/volumeService';
import { useTrackerPrefs } from '@/tracker/store/trackerPrefsStore';

import { MuscleSheet } from './MuscleSheet';
import { Section } from './Section';

export interface BodyMapSectionProps {
  /** Working sets per muscle over the last 7 days. */
  sets: MuscleSetsSlice[];
  index: number;
  onOpenExercise: (exerciseId: string) => void;
}

/**
 * Phase 3: the muscles trained in the last 7 days on a body drawing (Hevy's map, praised for
 * showing what you skipped). Brighter = more working sets; the line under it names the
 * muscles that got none. v0.25.1: drawn on the figure chosen in Profile. Audit Phase 5: tap a
 * muscle (on the drawing or its chip) → its sets, the exercises that trained it, and a hint
 * when it got under 10 sets. R-286 (ideas from the openGym tracker): a 7 / 30 / 90 day switch, and
 * each untrained muscle says how long ago it was last trained, longest first.
 */
export function BodyMapSection({ sets, index, onOpenExercise }: BodyMapSectionProps) {
  const figure = useTrackerPrefs((s) => s.bodyFigure);
  const [open, setOpen] = useState<Muscle | null>(null);
  const [days, setDays] = useState<MapRange>(7);
  const [longer, setLonger] = useState<MuscleSetsSlice[] | null>(null);
  const [last, setLast] = useState<Map<Muscle, string> | null>(null);

  // A longer range reads its own sets; the week comes from Progress (reloaded on every focus).
  useEffect(() => {
    if (days === 7) return;
    let alive = true;
    setLonger(null);
    const today = todayISO();
    getMuscleSetsBetween(addDays(today, -(days - 1)), today)
      .then((s) => {
        if (alive) setLonger(s);
      })
      .catch((e: unknown) => {
        console.warn('[body map] range read failed', e);
        if (alive) setLonger([]);
      });
    return () => {
      alive = false;
    };
  }, [days, sets]);

  // "Last trained": read again whenever Progress reloads the week (a workout may have just ended).
  useEffect(() => {
    let alive = true;
    getExerciseLastDays()
      .then((rows) => {
        if (alive) setLast(lastTrainedByMuscle(rows));
      })
      .catch((e: unknown) => {
        // quiet: without the ages the line falls back to plain names.
        console.warn('[body map] last-trained read failed', e);
      });
    return () => {
      alive = false;
    };
  }, [sets]);

  const shown = days === 7 ? sets : (longer ?? []);
  const levels = muscleLevels(shown, stepsFor(days));
  const untrained = untrainedMuscles(levels);
  const skipped = last ? untrainedWithAge(untrained, last, todayISO(), (m) => MUSCLE_LABEL[m]) : untrained.map((m) => MUSCLE_LABEL[m]);
  const trained = shown.filter((s) => s.sets > 0 && MAPPED_MUSCLES.includes(s.muscle));
  const loading = days !== 7 && longer == null;

  return (
    <Section index={index}>
      <View style={{ flexDirection: 'row', gap: space.sm, marginBottom: space.md }}>
        {MAP_RANGES.map((d) => (
          <Chip key={d} label={`${d} days`} selected={d === days} onPress={() => setDays(d)} />
        ))}
      </View>
      {loading ? null : trained.length === 0 ? (
        <EmptyState icon="dumbbell" title={`Nothing trained in the last ${days} days`} body="Do a workout and the muscles you work light up here." />
      ) : (
        <View style={{ gap: space.md }}>
          <BodyMap levels={levels} figure={figure} height={250} onPressMuscle={setOpen} />
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.md, flexWrap: 'wrap' }}>
            {legendFor(days).map((label, i) => (
              <View key={label} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: mapLevels()[i + 1] }} />
                <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.caption, color: color.inkMuted }}>{label}</Text>
              </View>
            ))}
          </View>
          <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: color.inkSecondary }}>Tap a muscle for its sets</Text>
          {/* The chips run to the card's edges (12 Oct 2026: they were cut at the card's padding,
              "Front s", which read as a clipped word rather than a row that scrolls). */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -space.lg }} contentContainerStyle={{ gap: space.sm, paddingHorizontal: space.lg }}>
            {trained.map((m) => (
              <Chip key={m.muscle} label={`${MUSCLE_LABEL[m.muscle]} · ${fmtSets(m.sets)}`} onPress={() => setOpen(m.muscle)} />
            ))}
          </ScrollView>
          {skipped.length > 0 ? (
            <Text style={{ fontFamily: type.body, fontSize: type.size.sub, color: color.inkSecondary, lineHeight: 19 }}>
              <Text style={{ fontFamily: type.bodySemi, color: color.ink }}>Not trained: </Text>
              {untrainedLine(skipped)}
            </Text>
          ) : (
            <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: color.goodText }}>{`Every muscle got some work in the last ${days} days.`}</Text>
          )}
        </View>
      )}
      <MuscleSheet
        muscle={open}
        days={days}
        lastISO={open && last ? last.get(open) : undefined}
        onClose={() => setOpen(null)}
        onOpenExercise={(id) => {
          setOpen(null);
          onOpenExercise(id);
        }}
      />
    </Section>
  );
}
