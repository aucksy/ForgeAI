/**
 * Stopwatch and countdown for a timed set (Phase 2 — planks, holds, wall sits).
 *
 * Calm by design: one big clock, one main Action Button.
 *  - With a goal time (the Target, last time, or what the member typed) it counts DOWN
 *    from it; ±5 s before starting. At zero: the rest bell, a buzz, the time is written
 *    into the set and the set is ticked (the rest timer then starts as for any set).
 *  - Without one it counts UP; "Stop and save" writes the time and ticks the set.
 *
 * The clock runs on wall time (start stamp + paused total), never on ticks, so a busy
 * frame or a short trip to the background can't make it drift. The workout screen keeps
 * the phone awake, so the countdown's end is never missed while it is open.
 */
import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { success, tap } from '@/lib/haptics';
import { color, radius, space, type } from '@/theme/tokens';

import { fmtDuration } from '../engine/logTypes';
import { playWorkoutSound } from '../services/workoutSounds';
import { Glyph } from './TrackerGlyph';
import { TrackerSheet } from './TrackerSheet';

export interface HoldTimerProps {
  visible: boolean;
  title: string;
  /** Goal time in seconds (countdown), or null for a stopwatch. */
  goalSec: number | null;
  onSave: (durationSec: number) => void;
  onClose: () => void;
}

const STEP = 5;

/** Elapsed seconds on a wall-clock timer (exported for tests). */
export function timerElapsedMs(state: { startedAt: number | null; pausedMs: number }, now: number): number {
  return state.pausedMs + (state.startedAt != null ? Math.max(0, now - state.startedAt) : 0);
}

export function HoldTimerSheet({ visible, title, goalSec, onSave, onClose }: HoldTimerProps) {
  const [goal, setGoal] = useState<number | null>(goalSec);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [pausedMs, setPausedMs] = useState(0);
  const [now, setNow] = useState(Date.now());
  const saved = useRef(false);

  // Fresh state each time the sheet opens. Closed mid-run (backdrop, back, ✕): the clock
  // stops — a hidden countdown would otherwise ring "done" for a set nobody saves.
  useEffect(() => {
    if (!visible) {
      setStartedAt(null);
      setPausedMs(0);
      return;
    }
    setGoal(goalSec != null && goalSec > 0 ? goalSec : null);
    setStartedAt(null);
    setPausedMs(0);
    setNow(Date.now());
    saved.current = false;
  }, [visible, goalSec]);

  const running = startedAt != null;
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(id);
  }, [running]);

  const elapsedMs = timerElapsedMs({ startedAt, pausedMs }, now);
  const elapsedSec = Math.floor(elapsedMs / 1000);
  const countdown = goal != null;
  const remainingSec = countdown ? Math.max(0, goal - elapsedSec) : 0;
  const started = running || pausedMs > 0;

  const save = (sec: number): void => {
    if (saved.current || sec <= 0) return;
    saved.current = true;
    setStartedAt(null);
    onSave(sec);
  };

  // Countdown reached zero: bell, buzz, save the goal time.
  useEffect(() => {
    if (!countdown || !running || goal == null) return;
    if (elapsedMs >= goal * 1000) {
      success();
      playWorkoutSound('rest');
      save(goal);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elapsedMs, countdown, running, goal]);

  const onStartPause = (): void => {
    tap();
    if (running) {
      setPausedMs(timerElapsedMs({ startedAt, pausedMs }, Date.now()));
      setStartedAt(null);
    } else {
      setNow(Date.now());
      setStartedAt(Date.now());
    }
  };

  const clock = countdown ? fmtDuration(remainingSec) : fmtDuration(elapsedSec);
  const mainLabel = running ? 'Pause' : started ? 'Resume' : 'Start';

  return (
    <TrackerSheet
      visible={visible}
      title={title}
      subtitle={countdown ? `Countdown from ${fmtDuration(goal ?? 0)}. The set saves itself at zero.` : 'Stopwatch. Stop when you finish the set.'}
      onClose={onClose}
    >
      <View style={{ alignItems: 'center', gap: space.md, paddingVertical: space.sm }}>
        <Text
          accessibilityRole="timer"
          accessibilityLabel={countdown ? `${clock} left` : `${clock} so far`}
          style={{ fontFamily: type.monoBold, fontSize: 64, color: running ? color.accentBright : color.ink, letterSpacing: 1 }}
        >
          {clock}
        </Text>

        {/* Goal adjust: before starting only, so a running clock never jumps. */}
        {countdown && !started ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
            <SmallButton label={`−${STEP} s`} onPress={() => setGoal((g) => Math.max(STEP, (g ?? 0) - STEP))} />
            <SmallButton label="Stopwatch" onPress={() => setGoal(null)} />
            <SmallButton label={`+${STEP} s`} onPress={() => setGoal((g) => (g ?? 0) + STEP)} />
          </View>
        ) : null}

        <Pressable
          onPress={onStartPause}
          accessibilityRole="button"
          accessibilityLabel={`${mainLabel} timer`}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: space.sm,
            alignSelf: 'stretch',
            height: 54,
            borderRadius: radius.pill,
            backgroundColor: running ? color.surface : color.accent,
            borderWidth: 1,
            borderColor: running ? color.borderStrong : color.accent,
          }}
        >
          <Glyph name={running ? 'pause' : 'play'} size={20} color={running ? color.ink : '#1A0B03'} />
          <Text style={{ fontFamily: type.bodyBold, fontSize: type.size.body, color: running ? color.ink : '#1A0B03' }}>
            {mainLabel}
          </Text>
        </Pressable>

        {started ? (
          <Pressable
            onPress={() => save(Math.max(1, elapsedSec))}
            disabled={elapsedSec < 1}
            accessibilityRole="button"
            accessibilityLabel={`Stop and save ${fmtDuration(Math.max(1, elapsedSec))}`}
            hitSlop={8}
            style={{ paddingVertical: space.sm, paddingHorizontal: space.lg }}
          >
            <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: elapsedSec < 1 ? color.inkFaint : color.accent }}>
              Stop and save {fmtDuration(Math.max(1, elapsedSec))}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </TrackerSheet>
  );
}

function SmallButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{
        minWidth: 72,
        height: 38,
        paddingHorizontal: space.md,
        borderRadius: radius.pill,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: color.border,
        backgroundColor: color.surface,
      }}
    >
      <Text style={{ fontFamily: type.monoBold, fontSize: type.size.sub, color: color.ink }}>{label}</Text>
    </Pressable>
  );
}
