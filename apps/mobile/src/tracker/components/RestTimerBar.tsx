/**
 * Rest-timer bar on the workout screen: countdown + progress + -15s / +15s / Skip.
 * Display only — the countdown, the bell and the lock-screen alert all live in
 * `restTimerStore` (Phase 1), so the timer keeps running when this bar is off screen.
 *
 * Phase 2, packet D:
 *  - RT-10: every button is at least 48 dp tall. (Oct 2026: the bar no longer wraps. It is ONE
 *    row at every text size, [−15] [Rest 0:20] [+15] [Skip]; labels and clock shrink to fit.)
 *  - RT-02: notifications blocked → a small "Alerts off" line under the bar, once per workout,
 *    that opens Android's notification settings.
 *  - D8: a rest on a phone whose alerts would come late (no "Alarms & reminders") asks
 *    "Hear "Rest is over" on time" — Allow opens that Android page; "Not now" waits 7 days before
 *    asking again (0.56.1: the app no longer gets exact alarms at install, Google Play policy).
 *    Settings → Rest timer and sounds keeps the fix meanwhile (RestAlertsStatusRow).
 *
 * R-298 (owner, 3 Nov 2026: he starts his next set without telling the app, so a count past the
 * rest looks like a longer rest): no red "Rest +0:30 over" row any more. When the rest ends the bar
 * hides, exactly as a skipped rest does. The quiet long-rest rule (F73, engine/restTaken) measures
 * tick to tick and never used that row, so it is unchanged.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';

import { MachineInUse, machineName, type InUseExercise } from './MachineInUse';
import { IN_USE_WORDS, inUseAutoOn, inUseBeatLine, inUseHasOpenWorkingSet } from '../lib/inUse';
import { useKgLeft } from '../store/kgLeftStore';

import { ConfirmSheet, Icon } from '@/components/ui';
import { tap } from '@/lib/haptics';
import { color, radius, space, type } from '@/theme/tokens';

import { EXACT_ASK, openFixFor, readAlertAccess, shouldAskExact } from '../services/restAlertAccess';
import { useActiveWorkout } from '../store/activeWorkoutStore';
import { restAlertPrefsReady, useRestAlertPrefs } from '../store/restAlertPrefsStore';
import { restRemainingSec, useRestTimer } from '../store/restTimerStore';
import { useTrackerPrefs } from '../store/trackerPrefsStore';
import { useWorkoutUi } from '../store/workoutUiStore';

/**
 * The three pills share one width, so the row reads as a set. Fresh-eyes review (5 Nov 2026): at
 * 52 dp "Skip" filled its pill edge to edge at large text and looked crowded; 58 dp gives it air.
 */
const PILL_W = 58;

export function fmtClock(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Re-render ~4×/s while a rest runs; returns seconds left. */
export function useRestRemaining(): number {
  const endsAt = useRestTimer((s) => s.endsAt);
  const durationSec = useRestTimer((s) => s.durationSec);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (endsAt == null) return;
    setNow(Date.now()); // fresh baseline so a new timer doesn't flash a stale value
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [endsAt]);
  return restRemainingSec(endsAt, durationSec, now);
}

/** One of the bar's three pills: all the same width, 48 dp tall, the label never wraps. */
function TimerBtn({ label, onPress, a11y }: { label: string; onPress: () => void; a11y: string }) {
  return (
    <Pressable
      onPress={() => {
        tap();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      style={({ pressed }) => ({
        width: PILL_W,
        height: 48,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: space.xs,
        borderRadius: radius.pill,
        backgroundColor: color.surfaceSunken,
        borderWidth: 1,
        borderColor: color.border,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.6}
        style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: color.ink }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * RT-02 + D8: read the two Android switches when a rest starts. Shows the "Alerts off" line at
 * most once per workout, and asks about on-time alerts at most once every 7 days.
 */
function useAlertChecks(endsAt: number | null): {
  alertsOff: boolean;
  dismissAlertsOff: () => void;
  asking: boolean;
  answer: (allow: boolean) => void;
} {
  const workoutStart = useActiveWorkout((s) => s.startedAt);
  const [alertsOff, setAlertsOff] = useState(false);
  const [asking, setAsking] = useState(false);
  const resting = endsAt != null;

  useEffect(() => {
    if (!resting || Platform.OS !== 'android') return;
    let live = true;
    void readAlertAccess().then((a) => {
      if (!live) return;
      const prefs = useRestAlertPrefs.getState();
      if (a.notifications === false) {
        // Once per workout: the first rest shows it; later rests of the same workout do not.
        const key = workoutStart ?? 0;
        const first = prefs.alertsHintFor !== key;
        if (first) prefs.markAlertsHint(key);
        setAlertsOff(first);
        return;
      }
      setAlertsOff(false);
      if (restAlertPrefsReady() && shouldAskExact(a, prefs.exactAskedAt, Date.now())) setAsking(true);
    });
    return () => {
      live = false;
    };
  }, [resting, workoutStart]);

  return {
    alertsOff: alertsOff && resting,
    dismissAlertsOff: () => setAlertsOff(false),
    asking,
    answer: (allow) => {
      setAsking(false);
      useRestAlertPrefs.getState().answerExact(allow ? 'allow' : 'later');
      // Android's "Alarms & reminders" page for MettleUp (the app's settings if that fails).
      if (allow) openFixFor('may-be-late');
    },
  };
}

/** R-70 review: how long after a rest starts "In use" opens by itself. */
const IN_USE_DELAY_MS = 300;

export function RestTimerBar() {
  const endsAt = useRestTimer((s) => s.endsAt);
  const durationSec = useRestTimer((s) => s.durationSec);
  const addSec = useRestTimer((s) => s.addSec);
  const skip = useRestTimer((s) => s.skip);
  const nextLabel = useRestTimer((s) => s.nextLabel);
  // "In use" names the lift whose tick started this rest (the machine the member is on), not the next one.
  const startedBy = useRestTimer((s) => s.source?.exKey ?? null);
  const startedEx = useActiveWorkout((s) => (startedBy ? s.exercises.find((e) => e.key === startedBy) ?? null : null));
  const machine = startedEx?.name ?? null;
  // R-304: the lift's own In use choice (remembered per exercise), else its equipment's default.
  const exId = startedEx?.exerciseId ?? null;
  const exName = startedEx?.name ?? '';
  const exEquipment = startedEx?.equipment ?? null;
  const inUseEx: InUseExercise | null = useMemo(() => (exId ? { id: exId, name: exName, equipment: exEquipment } : null), [exId, exName, exEquipment]);
  const master = useTrackerPrefs((s) => s.inUseAfterSet);
  const chosen = useTrackerPrefs((s) => (exId ? s.inUseByExercise[exId] : undefined));
  const autoInUse = inUseAutoOn(master, chosen, inUseEx ? { name: inUseEx.name, key: inUseEx.id, equipment: inUseEx.equipment } : null);
  // R-305: "300 kg more to reach today's target" for that same lift.
  const beatLine = useKgLeft((s) => inUseBeatLine(startedBy ? s.byEx[startedBy] ?? null : null));
  const remaining = useRestRemaining();
  const checks = useAlertChecks(endsAt);
  // 0.56.1: the "Alarms & reminders" ask now shows on many new phones; "In use" never opens over it.
  const askingRef = useRef(false);
  askingRef.current = checks.asking;
  const [inUse, setInUse] = useState(false);
  // The rest ended (or was skipped): the in-use screen closes and stays closed for the next rest.
  useEffect(() => {
    if (endsAt == null) setInUse(false);
  }, [endsAt]);
  // R-70: with "Show after every set" on (R-304: for THIS exercise), a rest that starts now opens it by
  // itself. A rest already running when the screen opens (an app restart, coming back to the workout)
  // does not.
  const startedAt = useRestTimer((s) => s.startedAt);
  const seenStart = useRef(startedAt);
  useEffect(() => {
    if (startedAt == null || startedAt === seenStart.current) return;
    seenStart.current = startedAt;
    // Review: not after the last set (Finish comes next), and never over a question the tick asked
    // ("Is 1000 kg right?"). It opens a moment later, so a sheet closing in the same moment (a hold's
    // timer) never swallows it.
    if (!autoInUse || endsAt == null || !nextLabel) return undefined;
    // Owner decision (3 Nov 2026): not after the LAST set of this exercise (no open working set left
    // on its card): the member leaves that machine anyway. The clock still opens it by hand.
    const card = startedBy ? useActiveWorkout.getState().exercises.find((e) => e.key === startedBy) : undefined;
    if (!inUseHasOpenWorkingSet(card?.sets)) return undefined;
    const t = setTimeout(() => {
      if (useWorkoutUi.getState().typoAsk == null && !askingRef.current && useRestTimer.getState().endsAt != null) setInUse(true);
    }, IN_USE_DELAY_MS);
    return () => clearTimeout(t);
  }, [startedAt, endsAt, autoInUse, nextLabel, startedBy]);

  const ask = (
    <ConfirmSheet
      visible={checks.asking}
      title={EXACT_ASK.title}
      body={EXACT_ASK.body}
      confirmLabel={EXACT_ASK.allow}
      cancelLabel={EXACT_ASK.notNow}
      onConfirm={() => checks.answer(true)}
      onCancel={() => checks.answer(false)}
    />
  );

  // R-298: no rest running = no bar (the red "over" row is gone).
  if (endsAt == null) return ask;
  const pct = durationSec > 0 ? Math.min(1, Math.max(0, remaining / durationSec)) : 0;

  return (
    <View style={{ marginBottom: space.sm }}>
      <View
        style={{
          borderRadius: radius.lg,
          backgroundColor: color.surfaceRaised,
          borderWidth: 1,
          borderColor: color.borderStrong,
          overflow: 'hidden',
        }}
      >
        {/* progress fill */}
        <View
          style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct * 100}%`, backgroundColor: color.accentSoft }}
        />
        {/* ONE row at every text size (design critique, Oct 2026): [−15] [Rest 0:20] [+15] [Skip].
            It used to wrap at large text: −15 and +15 on one line, Skip alone below, and the time
            pinned left over dead space. The pills keep one width; the clock shrinks to fit.
            The gap after Rest is an en space, so this text never reads "Rest 0:30" (the rest
            picker's own option, which phone tests tap by that text). */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.sm }}>
          <TimerBtn label="−15" a11y="15 seconds less" onPress={() => addSec(-15)} />
          {/* Backlog (21 Oct): tapping the clock shows "Machine in use" full screen (MachineInUse). */}
          <Pressable
            onPress={() => {
              // Review: a screen Android dropped can't leave this tap dead: close, then open again.
              setInUse(false);
              setTimeout(() => setInUse(true), 0);
            }}
            accessibilityRole="button"
            accessibilityLabel={`Rest, ${remaining} seconds left. Show machine in use`}
            style={{ flex: 1, minWidth: 0, minHeight: 48, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text
              accessible={false}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.5}
              style={{ fontFamily: type.monoBold, fontSize: type.size.h3, color: color.ink, textAlign: 'center' }}
            >
              <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.sub, color: color.inkSecondary }}>Rest </Text>
              {fmtClock(remaining)}
            </Text>
            {/* R-299 (owner, 3 Nov 2026): while this exercise's In use does not open by itself, say the
                clock opens it. One small line, so the bar stays one row of buttons. */}
            {!autoInUse ? (
              <Text
                accessible={false}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.7}
                style={{ fontFamily: type.bodyMedium, fontSize: type.size.caption, color: color.accent, textAlign: 'center' }}
              >
                {IN_USE_WORDS.tapHint}
              </Text>
            ) : null}
          </Pressable>
          <TimerBtn label="+15" a11y="15 seconds more" onPress={() => addSec(15)} />
          <TimerBtn label="Skip" a11y="Skip rest" onPress={() => skip()} />
        </View>
      </View>
      {checks.alertsOff ? (
        <Pressable
          onPress={() => {
            openFixFor('off');
            checks.dismissAlertsOff();
          }}
          accessibilityRole="button"
          accessibilityLabel="Rest alerts are off. Turn on notifications"
          style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.md }}
        >
          <Icon name="volume" size={16} color={color.inkSecondary} />
          <Text style={{ flex: 1, fontFamily: type.bodyMedium, fontSize: type.size.sub, color: color.inkSecondary }}>
            Alerts off — your phone won't buzz when rest is over.{' '}
            <Text style={{ fontFamily: type.bodySemi, color: color.accent }}>Turn on</Text>
          </Text>
        </Pressable>
      ) : null}
      {ask}
      <MachineInUse visible={inUse} remaining={remaining} clock={fmtClock(remaining)} machine={machine ?? machineName(nextLabel)} beatLine={beatLine} exercise={inUseEx} onClose={() => setInUse(false)} />
    </View>
  );
}
