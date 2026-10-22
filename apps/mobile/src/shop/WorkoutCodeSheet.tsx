/**
 * "Show my workouts to the desk" (Messages & offers step 1, item 6; OWNER-INBOX #49): the counted
 * workout days of the last 30 and the short code the desk types in. Read when opened; nothing is
 * sent from the phone. Words: workoutCodeWords (tested).
 */
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { Sheet } from '@/components/ui';
import { shortDate } from '@/lib/date';
import { color, space, type } from '@/theme/tokens';

import { getWorkoutCode, type WorkoutCode } from './workoutCode';
import { WORKOUT_CODE_WORDS, workoutCodeCount } from './workoutCodeWords';

export function WorkoutCodeSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [shown, setShown] = useState<WorkoutCode | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!visible) return;
    let live = true;
    setFailed(false);
    getWorkoutCode()
      .then((c) => {
        if (live) setShown(c);
      })
      .catch((e: unknown) => {
        console.warn('[ForgeErr] workout code: reading the workouts', e);
        if (live) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, [visible]);

  const body = { fontFamily: type.body, fontSize: type.size.sub, color: color.inkSecondary, lineHeight: 20 } as const;
  return (
    <Sheet visible={visible} title={WORKOUT_CODE_WORDS.title} onClose={onClose}>
      {failed ? (
        <Text style={body}>{WORKOUT_CODE_WORDS.failed}</Text>
      ) : !shown ? null : (
        <View style={{ gap: space.md }}>
          <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.body, color: color.ink }}>{workoutCodeCount(shown.days.length)}</Text>
          <View
            accessible
            accessibilityLabel={`Code: ${shown.code.split('').join(' ')}`}
            style={{ alignItems: 'center', paddingVertical: space.lg, borderRadius: 14, borderWidth: 1, borderColor: color.border, backgroundColor: color.surfaceSunken }}
          >
            <Text selectable style={{ fontFamily: type.displaySemi, fontSize: 32, letterSpacing: 3, color: color.ink }}>
              {shown.code}
            </Text>
          </View>
          <Text style={body}>{WORKOUT_CODE_WORDS.how}</Text>
          <Text style={body}>{WORKOUT_CODE_WORDS.rule}</Text>
          {shown.days.length > 0 ? (
            <Text style={{ ...body, color: color.inkMuted }}>{shown.days.map(shortDate).join(' · ')}</Text>
          ) : null}
        </View>
      )}
    </Sheet>
  );
}
