/**
 * F59 "Which muscles are ready today" (OWNER-INBOX #58). Opens from the Workout tab's card.
 *
 * The body drawing coloured by rest — green ready, amber almost ready, red still resting — from
 * the member's LOGGED workouts only (the screen says so: no sleep, soreness or heart data). Tap a
 * muscle for when it is ready and what the last workout gave it. The lists under the drawing name
 * every muscle in words, so the colours are never the only telling. Rules: engine/readiness.ts.
 */
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';

import { Card, EmptyState, Screen } from '@/components/ui';
import { goBack } from '@/lib/goBack';
import { todayISO } from '@/lib/date';
import { color, space, type } from '@/theme/tokens';
import { MUSCLE_LABEL, type Muscle } from '@/tracker/catalog/muscles';
import { BodyMap } from '@/tracker/components/BodyMap';
import { agoText, type MapLevel } from '@/tracker/engine/bodyMap';
import { setsText } from '@/tracker/engine/volume';
import { namesLine, readyInText, type MuscleReadiness, type ReadyState } from '@/tracker/engine/readiness';
import { readyPalette } from '@/tracker/lib/bodyMapColors';
import { getReadinessNow, type ReadinessNow } from '@/tracker/services/readinessService';
import { useTrackerPrefs } from '@/tracker/store/trackerPrefsStore';

const LEVEL: Record<ReadyState, MapLevel> = { ready: 1, almost: 2, resting: 3 };
const STATE_WORDS: Record<ReadyState, string> = { ready: 'Ready', almost: 'Almost ready', resting: 'Still resting' };

/** One plain line for a tapped muscle. */
function muscleLine(r: MuscleReadiness, last: string | undefined, now: number): string {
  const name = MUSCLE_LABEL[r.muscle];
  if (r.state === 'ready') {
    return last ? `${name} is ready. Last trained ${agoText(last, todayISO())}.` : `${name} is ready. No logged workout has trained it yet.`;
  }
  const when = r.readyAt ? readyInText(r.readyAt, now) : 'soon';
  return `${name}: ${STATE_WORDS[r.state].toLowerCase()}, ready ${when}. Your last workout gave it ${setsText(r.sets)}.`;
}

export default function ReadyScreen() {
  const router = useRouter();
  const figure = useTrackerPrefs((s) => s.bodyFigure);
  const [data, setData] = useState<ReadinessNow | null>(null);
  const [failed, setFailed] = useState(false);
  const [picked, setPicked] = useState<Muscle | null>(null);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      getReadinessNow()
        .then((r) => {
          if (alive) {
            setData(r);
            setFailed(false);
          }
        })
        .catch((e: unknown) => {
          console.warn('[ForgeErr] ready today: the workouts could not be read', e);
          if (alive) setFailed(true);
        });
      return () => {
        alive = false;
      };
    }, []),
  );

  const levels = new Map<Muscle, MapLevel>((data?.rows ?? []).map((r) => [r.muscle, LEVEL[r.state]]));
  const group = (s: ReadyState): string[] => (data?.rows ?? []).filter((r) => r.state === s).map((r) => MUSCLE_LABEL[r.muscle]);
  const pickedRow = picked && data ? data.rows.find((r) => r.muscle === picked) : undefined;
  const palette = readyPalette();

  return (
    <Screen title="Ready today" subtitle="Which muscles have rested enough to train" onBack={() => goBack(router, '/workout')}>
      <View style={{ gap: space.lg }}>
        {failed ? (
          <EmptyState icon="dumbbell" title="Couldn't read your workouts" body="Please go back and open this page again." />
        ) : !data ? null : !data.hasHistory ? (
          <EmptyState icon="dumbbell" title="No workouts logged yet" body="Finish a workout and this page shows which muscles are ready again." />
        ) : (
          <>
            <Card>
              <View style={{ gap: space.md }}>
                <BodyMap
                  levels={levels}
                  figure={figure}
                  height={250}
                  palette={palette}
                  onPressMuscle={setPicked}
                  accessibilityLabel={`Body map of which muscles are ready, ${figure} figure, front and back`}
                />
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.md, flexWrap: 'wrap' }}>
                  {(['ready', 'almost', 'resting'] as const).map((s) => (
                    <View key={s} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: palette[LEVEL[s]] }} />
                      <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.caption, color: color.inkMuted }}>{STATE_WORDS[s]}</Text>
                    </View>
                  ))}
                </View>
                <Text style={{ fontFamily: type.body, fontSize: type.size.sub, color: pickedRow ? color.ink : color.inkSecondary, lineHeight: 19 }}>
                  {pickedRow ? muscleLine(pickedRow, data.lastTrained.get(pickedRow.muscle), data.now) : 'Tap a muscle to see when it is ready.'}
                </Text>
              </View>
            </Card>
            <Card>
              <View style={{ gap: space.sm }}>
                {(['resting', 'almost', 'ready'] as const).map((s) => {
                  const names = group(s);
                  if (names.length === 0) return null;
                  return (
                    <Text key={s} style={{ fontFamily: type.body, fontSize: type.size.sub, color: color.inkSecondary, lineHeight: 19 }}>
                      <Text style={{ fontFamily: type.bodySemi, color: color.ink }}>{`${STATE_WORDS[s]}: `}</Text>
                      {namesLine(names, names.length)}
                    </Text>
                  );
                })}
              </View>
            </Card>
            <Text style={{ fontFamily: type.body, fontSize: type.size.caption, color: color.inkMuted, lineHeight: 16 }}>
              Worked out only from the workouts you logged in this app. A muscle rests 1 to 3 days after a workout, longer after more
              sets. Sleep and soreness are not counted, so listen to your body too.
            </Text>
          </>
        )}
      </View>
    </Screen>
  );
}
