/**
 * "Log a past workout" (Phase 3 packet C): pick the day, the start time and the length, then
 * the normal editor opens and Save stores it as a manual workout. The answer comes first: the
 * button says the day and time it will log.
 *
 * "Which routine?" (optional, review fix): the followed plan's routines, then "None". A routine
 * picked gives the workout its name and day type and moves "Today" like any workout of it;
 * "None" never moves Today; nothing picked lets Today place it by its exercises.
 */
import { useEffect, useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import { Chip, PrimaryButton, Sheet } from '@/components/ui';
import { getActivePlan } from '@/db/repos/planRepo';
import { InlineError } from '@/components/ui/InlineError';
import { addDays, dateWithYear, todayISO } from '@/lib/date';
import { color, radius, space, type } from '@/theme/tokens';

import { checkMinutes, checkStartTime, parseClock } from '../services/editFields';
import type { PastRoutine } from '../store/activeWorkoutStore';
import { MonthCalendar } from './MonthCalendar';

export interface PastWorkoutChoice {
  dateISO: string;
  hour: number;
  minute: number;
  minutes: number;
  /** The routine it was; 'none' = no routine; absent/null = not picked. */
  routine?: PastRoutine | 'none' | null;
}

const overline = {
  fontFamily: type.bodySemi,
  fontSize: type.size.caption,
  color: color.inkMuted,
  letterSpacing: 1.1,
  textTransform: 'uppercase',
  marginBottom: space.sm,
} as const;

const box = {
  height: 48,
  paddingHorizontal: space.md,
  borderRadius: radius.md,
  backgroundColor: color.surfaceSunken,
  borderWidth: 1,
  borderColor: color.borderStrong,
  fontFamily: type.monoBold,
  fontSize: type.size.body,
  color: color.ink,
  textAlign: 'center',
} as const;

export function LogPastSheet({
  visible,
  onClose,
  onStart,
}: {
  visible: boolean;
  onClose: () => void;
  /** Returns why it couldn't start (shown here), or null when the editor opened. */
  onStart: (c: PastWorkoutChoice) => Promise<string | null>;
}) {
  const [day, setDay] = useState(() => addDays(todayISO(), -1));
  const [ym, setYm] = useState(day.slice(0, 7));
  const [hh, setHh] = useState('18');
  const [mm, setMm] = useState('00');
  const [mins, setMins] = useState('60');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [routines, setRoutines] = useState<PastRoutine[]>([]);
  const [routine, setRoutine] = useState<PastRoutine | 'none' | null>(null);

  useEffect(() => {
    if (!visible) return;
    const d = addDays(todayISO(), -1);
    setDay(d);
    setYm(d.slice(0, 7));
    setError(null);
    setBusy(false);
    setRoutine(null);
    let alive = true;
    // The followed plan's routines (a failed read just leaves the question out).
    void getActivePlan()
      .then((p) => {
        if (!alive) return;
        setRoutines(
          (p?.days ?? []).filter((r) => r.dayType !== 'rest').map((r) => ({ id: r.id, name: r.name, dayType: r.dayType })),
        );
      })
      .catch(() => alive && setRoutines([]));
    return () => {
      alive = false;
    };
  }, [visible]);

  /** A second tap on the chosen chip un-picks it (back to "not said"). */
  const pick = (r: PastRoutine | 'none'): void => {
    setRoutine((cur) => (cur === r || (cur && cur !== 'none' && r !== 'none' && cur.id === r.id) ? null : r));
  };
  const picked = (r: PastRoutine | 'none'): boolean =>
    r === 'none' ? routine === 'none' : routine != null && routine !== 'none' && routine.id === r.id;

  const clock = parseClock(hh, mm);
  const minCheck = checkMinutes(mins);
  const timeError = clock ? checkStartTime(day, clock.hour, clock.minute, Date.now(), minCheck.minutes) : 'Type the start time.';
  const fieldError = minCheck.error ?? (mins.trim() === '' ? 'Type how long it lasted.' : null) ?? timeError;
  const pad = (s: string): string => (s.length === 1 ? `0${s}` : s);

  const start = async (): Promise<void> => {
    if (busy || fieldError || !clock || minCheck.minutes == null) {
      setError(fieldError);
      return;
    }
    setBusy(true);
    setError(null);
    const why = await onStart({ dateISO: day, hour: clock.hour, minute: clock.minute, minutes: minCheck.minutes, routine }).catch(
      () => "Couldn't open the editor. Please try again.",
    );
    setBusy(false);
    if (why) setError(why);
  };

  return (
    <Sheet
      visible={visible}
      title="Log a past workout"
      subtitle="Pick the day, when it started and how long it lasted."
      onClose={onClose}
      footer={
        <View style={{ gap: space.sm }}>
          <InlineError message={error} />
          <PrimaryButton
            label={`Log ${dateWithYear(day)}${clock ? ` · ${pad(String(clock.hour))}:${pad(String(clock.minute))}` : ''}`}
            icon="plus"
            loading={busy}
            disabled={busy}
            onPress={() => void start()}
          />
        </View>
      }
    >
      <View style={{ gap: space.lg }}>
        <MonthCalendar ym={ym} onMonth={setYm} selected={day} onPick={setDay} />
        <View style={{ flexDirection: 'row', gap: space.md }}>
          <View style={{ flex: 3 }}>
            <Text style={overline}>Started at</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
              <TextInput
                value={hh}
                onChangeText={(t) => setHh(t.replace(/[^0-9]/g, '').slice(0, 2))}
                keyboardType="number-pad"
                selectTextOnFocus
                accessibilityLabel="Start hour, 0 to 23"
                style={[box, { flex: 1 }]}
              />
              <Text style={{ fontFamily: type.monoBold, fontSize: type.size.body, color: color.ink }}>:</Text>
              <TextInput
                value={mm}
                onChangeText={(t) => setMm(t.replace(/[^0-9]/g, '').slice(0, 2))}
                keyboardType="number-pad"
                selectTextOnFocus
                accessibilityLabel="Start minute, 0 to 59"
                style={[box, { flex: 1 }]}
              />
            </View>
          </View>
          <View style={{ flex: 2 }}>
            <Text style={overline}>Minutes</Text>
            <TextInput
              value={mins}
              onChangeText={(t) => setMins(t.replace(/[^0-9]/g, '').slice(0, 3))}
              keyboardType="number-pad"
              selectTextOnFocus
              accessibilityLabel="Workout length in minutes, 1 to 600"
              style={box}
            />
          </View>
        </View>
        {routines.length > 0 ? (
          <View>
            <Text style={overline}>Which routine?</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
              {routines.map((r) => (
                <Chip key={r.id} label={r.name} selected={picked(r)} onPress={() => pick(r)} />
              ))}
              <Chip label="None" selected={picked('none')} onPress={() => pick('none')} />
            </View>
          </View>
        ) : null}
        {fieldError && !error ? (
          <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.caption, color: color.inkSecondary }}>{fieldError}</Text>
        ) : null}
      </View>
    </Sheet>
  );
}
