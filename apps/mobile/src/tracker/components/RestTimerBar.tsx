/**
 * Rest-timer bar on the workout screen: countdown + progress + -15s / +15s / Skip.
 * Display only — the countdown, the bell and the lock-screen alert all live in
 * `restTimerStore` (Phase 1), so the timer keeps running when this bar is off screen.
 *
 * Phase 2, packet D:
 *  - RT-10: at 200 % text on a small phone the row wraps (time on top, buttons below) instead
 *    of clipping "Skip"; every button is at least 48 dp tall.
 *  - RT-02: notifications blocked → a small "Alerts off" line under the bar, once per workout,
 *    that opens Android's notification settings.
 *  - D8: the first rest on a phone whose alerts would come late (no "Alarms & reminders") asks
 *    ONCE: "Get rest alerts on time?" — Allow opens that Android page; Not now is remembered.
 */
import { useEffect, useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';

import { ConfirmSheet, Icon } from '@/components/ui';
import { tap } from '@/lib/haptics';
import { color, radius, space, type } from '@/theme/tokens';

import { openFixFor, readAlertAccess, shouldAskExact } from '../services/restAlertAccess';
import { openExactAlarmSettings } from '../services/restCard';
import { useActiveWorkout } from '../store/activeWorkoutStore';
import { restAlertPrefsReady, useRestAlertPrefs } from '../store/restAlertPrefsStore';
import { restRemainingSec, useRestTimer } from '../store/restTimerStore';

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

function TimerBtn({ label, onPress, a11y }: { label: string; onPress: () => void; a11y: string }) {
  return (
    <Pressable
      onPress={() => {
        tap();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      style={{
        minWidth: 56,
        minHeight: 48,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: space.md,
        borderRadius: radius.pill,
        backgroundColor: color.surfaceSunken,
        borderWidth: 1,
        borderColor: color.border,
      }}
    >
      <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: color.ink }}>{label}</Text>
    </Pressable>
  );
}

/**
 * RT-02 + D8: read the two Android switches when a rest starts. Shows the "Alerts off" line at
 * most once per workout, and asks about on-time alerts once ever.
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
      if (restAlertPrefsReady() && shouldAskExact(a, prefs.exactAsked)) setAsking(true);
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
      if (allow) openExactAlarmSettings();
    },
  };
}

export function RestTimerBar() {
  const endsAt = useRestTimer((s) => s.endsAt);
  const durationSec = useRestTimer((s) => s.durationSec);
  const addSec = useRestTimer((s) => s.addSec);
  const skip = useRestTimer((s) => s.skip);
  const remaining = useRestRemaining();
  const checks = useAlertChecks(endsAt);

  const ask = (
    <ConfirmSheet
      visible={checks.asking}
      title="Get rest alerts on time?"
      body="So your phone and watch buzz the moment rest is over."
      confirmLabel="Allow"
      cancelLabel="Not now"
      onConfirm={() => checks.answer(true)}
      onCancel={() => checks.answer(false)}
    />
  );

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
        {/* RT-10: wraps at large text — the buttons drop to a second line, never off the edge. */}
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            alignItems: 'center',
            columnGap: space.sm,
            rowGap: space.sm,
            padding: space.md,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, flexGrow: 1 }}>
            <Icon name="clock" size={18} color={color.accent} />
            <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.sub, color: color.inkSecondary }}>Rest</Text>
            <Text
              accessibilityLabel={`Rest, ${remaining} seconds left`}
              style={{ fontFamily: type.monoBold, fontSize: type.size.h3, color: color.ink, minWidth: 52 }}
            >
              {fmtClock(remaining)}
            </Text>
          </View>
          <View
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              gap: space.sm,
              marginLeft: 'auto',
              justifyContent: 'flex-end',
            }}
          >
            <TimerBtn label="−15 s" a11y="15 seconds less" onPress={() => addSec(-15)} />
            <TimerBtn label="+15 s" a11y="15 seconds more" onPress={() => addSec(15)} />
            <TimerBtn label="Skip" a11y="Skip rest" onPress={() => skip()} />
          </View>
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
    </View>
  );
}
