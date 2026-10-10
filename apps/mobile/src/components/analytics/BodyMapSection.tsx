import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { Chip, EmptyState } from '@/components/ui';
import { color, space, type } from '@/theme/tokens';
import { MUSCLE_LABEL, type Muscle } from '@/tracker/catalog/muscles';
import { BodyMap } from '@/tracker/components/BodyMap';
import { MAPPED_MUSCLES, muscleLevels, untrainedLine, untrainedMuscles, WEEK_LEGEND } from '@/tracker/engine/bodyMap';
import { fmtSets, type MuscleSetsSlice } from '@/tracker/engine/volume';
import { MAP_LEVELS } from '@/tracker/lib/bodyMapColors';
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
 * when it got under 10 sets.
 */
export function BodyMapSection({ sets, index, onOpenExercise }: BodyMapSectionProps) {
  const figure = useTrackerPrefs((s) => s.bodyFigure);
  const [open, setOpen] = useState<Muscle | null>(null);
  const levels = muscleLevels(sets);
  const skipped = untrainedMuscles(levels).map((m) => MUSCLE_LABEL[m]);
  const trained = sets.filter((s) => s.sets > 0 && MAPPED_MUSCLES.includes(s.muscle));

  return (
    <Section index={index}>
      {trained.length === 0 ? (
        <EmptyState icon="dumbbell" title="Nothing trained in the last 7 days" body="Do a workout and the muscles you work light up here." />
      ) : (
        <View style={{ gap: space.md }}>
          <BodyMap levels={levels} figure={figure} height={250} onPressMuscle={setOpen} />
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.md, flexWrap: 'wrap' }}>
            {WEEK_LEGEND.map((label, i) => (
              <View key={label} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: MAP_LEVELS[i + 1] }} />
                <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.caption, color: color.inkMuted }}>{label}</Text>
              </View>
            ))}
          </View>
          <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: color.inkSecondary }}>Tap a muscle for its sets</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
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
            <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: color.goodText }}>Every muscle got some work in the last 7 days.</Text>
          )}
        </View>
      )}
      <MuscleSheet
        muscle={open}
        onClose={() => setOpen(null)}
        onOpenExercise={(id) => {
          setOpen(null);
          onOpenExercise(id);
        }}
      />
    </Section>
  );
}
