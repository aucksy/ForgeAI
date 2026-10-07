import { Text, View } from 'react-native';

import { EmptyState } from '@/components/ui';
import { color, space, type } from '@/theme/tokens';
import { MUSCLE_LABEL } from '@/tracker/catalog/muscles';
import { BodyMap } from '@/tracker/components/BodyMap';
import { MAPPED_MUSCLES, muscleLevels, untrainedLine, untrainedMuscles, WEEK_LEGEND } from '@/tracker/engine/bodyMap';
import type { MuscleSetsSlice } from '@/tracker/engine/volume';
import { MAP_LEVELS } from '@/tracker/lib/bodyMapColors';
import { useTrackerPrefs } from '@/tracker/store/trackerPrefsStore';

import { HeaderStat, Section } from './Section';

export interface BodyMapSectionProps {
  /** Working sets per muscle over the last 7 days. */
  sets: MuscleSetsSlice[];
  index: number;
}

/**
 * Phase 3: the muscles trained in the last 7 days on a body drawing (Hevy's map, praised for
 * showing what you skipped). Brighter = more working sets; the line under it names the
 * muscles that got none. v0.25.1: drawn on the figure chosen in Profile.
 */
export function BodyMapSection({ sets, index }: BodyMapSectionProps) {
  const figure = useTrackerPrefs((s) => s.bodyFigure);
  const levels = muscleLevels(sets);
  const trained = MAPPED_MUSCLES.length - untrainedMuscles(levels).length;
  const skipped = untrainedMuscles(levels).map((m) => MUSCLE_LABEL[m]);

  return (
    <Section
      title="Last 7 days"
      index={index}
      right={trained > 0 ? <HeaderStat text={`${trained} of ${MAPPED_MUSCLES.length} muscles`} /> : undefined}
    >
      {trained === 0 ? (
        <EmptyState icon="dumbbell" title="Nothing trained this week" body="Log a workout and the muscles you work light up here." />
      ) : (
        <View style={{ gap: space.md }}>
          <BodyMap levels={levels} figure={figure} height={250} />
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.md, flexWrap: 'wrap' }}>
            {WEEK_LEGEND.map((label, i) => (
              <View key={label} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: MAP_LEVELS[i + 1] }} />
                <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.caption, color: color.inkMuted }}>{label}</Text>
              </View>
            ))}
          </View>
          {skipped.length > 0 ? (
            <Text style={{ fontFamily: type.body, fontSize: type.size.sub, color: color.inkSecondary, lineHeight: 19 }}>
              <Text style={{ fontFamily: type.bodySemi, color: color.ink }}>Not trained: </Text>
              {untrainedLine(skipped)}
            </Text>
          ) : (
            <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: color.goodText }}>Every muscle got some work this week.</Text>
          )}
        </View>
      )}
    </Section>
  );
}
