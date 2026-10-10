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
 *
 * LW-18: a plank is done with the phone on the floor. Once the clock has started, a touch on
 * the dimmed area does nothing, and Back or × asks "Stop the timer?" — Keep 0:42 / Discard /
 * Keep going — while the clock keeps running. Its own panel (not the shared Sheet), because the
 * shared one closes on any of the three.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/ui';

import { success, tap } from '@/lib/haptics';
import { color, radius, space, type } from '@/theme/tokens';

import { fmtDuration } from '../engine/logTypes';
import { holdCloseIntent, type HoldCloseSource } from '../services/holdTimerRules';
import { playWorkoutSound } from '../services/workoutSounds';
import { Glyph } from './TrackerGlyph';

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
  const [asking, setAsking] = useState(false);
  const saved = useRef(false);

  // Fresh state each time the sheet opens. Closed mid-run (backdrop, back, ✕): the clock
  // stops — a hidden countdown would otherwise ring "done" for a set nobody saves.
  useEffect(() => {
    if (!visible) {
      setStartedAt(null);
      setPausedMs(0);
      setAsking(false);
      return;
    }
    setGoal(goalSec != null && goalSec > 0 ? goalSec : null);
    setStartedAt(null);
    setPausedMs(0);
    setNow(Date.now());
    setAsking(false);
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
    setAsking(false);
    onSave(sec);
  };

  // LW-18: a brushed screen never throws the time away; Back / × ask first.
  const requestClose = (source: HoldCloseSource): void => {
    const intent = holdCloseIntent(source, started);
    if (intent === 'close') onClose();
    else if (intent === 'ask') setAsking(true);
  };
  const keepSec = Math.max(1, elapsedSec);

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
    <HoldPanel
      visible={visible}
      title={title}
      subtitle={countdown ? `Countdown from ${fmtDuration(goal ?? 0)}. The set saves itself at zero.` : 'Stopwatch. Stop when you finish the set.'}
      onClose={requestClose}
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

        {/* LW-18: Back / × mid-hold — the clock keeps running while this is asked. */}
        {asking && started ? (
          <View
            accessibilityLiveRegion="polite"
            style={{
              alignSelf: 'stretch',
              gap: space.sm,
              padding: space.md,
              borderRadius: radius.lg,
              backgroundColor: color.surface,
              borderWidth: 1,
              borderColor: color.borderStrong,
            }}
          >
            <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.body, color: color.ink }}>Stop the timer?</Text>
            <AskButton label={`Keep ${fmtDuration(keepSec)}`} strong onPress={() => save(keepSec)} />
            <AskButton
              label="Discard"
              danger
              onPress={() => {
                setAsking(false);
                onClose();
              }}
            />
            <AskButton label="Keep going" onPress={() => setAsking(false)} />
          </View>
        ) : null}
      </View>
    </HoldPanel>
  );
}

/**
 * The hold timer's bottom panel: the shared Sheet's look, but it tells WHICH way the member
 * tried to close it (a tap outside, Back, or ×) so a running clock can ignore a brushed screen.
 */
function HoldPanel({
  visible,
  title,
  subtitle,
  onClose,
  children,
}: {
  visible: boolean;
  title: string;
  subtitle: string;
  onClose: (source: HoldCloseSource) => void;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={() => onClose('back')} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={{ flex: 1, justifyContent: 'flex-end', paddingTop: insets.top + space.lg }}>
          <Pressable
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.55)' }}
            onPress={() => onClose('backdrop')}
            accessible={false}
          />
          <View
            accessibilityViewIsModal
            style={{
              maxHeight: '90%',
              backgroundColor: color.surfaceRaised,
              borderTopLeftRadius: radius.xl,
              borderTopRightRadius: radius.xl,
              borderWidth: 1,
              borderColor: color.borderStrong,
              paddingTop: space.sm,
              paddingBottom: Math.max(insets.bottom, space.lg) + space.md,
            }}
          >
            <View
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={{ alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: color.borderStrong, marginBottom: space.xs }}
            />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingLeft: space.xl, paddingRight: space.sm }}>
              <View style={{ flex: 1 }}>
                <Text accessibilityRole="header" numberOfLines={2} style={{ fontFamily: type.heading, fontSize: type.size.h3, color: color.ink }}>
                  {title}
                </Text>
                <Text numberOfLines={3} style={{ fontFamily: type.body, fontSize: type.size.sub, color: color.inkSecondary, marginTop: 2 }}>
                  {subtitle}
                </Text>
              </View>
              <Pressable
                onPress={() => onClose('close')}
                accessibilityRole="button"
                accessibilityLabel="Close timer"
                style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}
              >
                <Icon name="close" size={22} color={color.inkMuted} />
              </Pressable>
            </View>
            <ScrollView
              style={{ flexGrow: 0, flexShrink: 1 }}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingHorizontal: space.xl, paddingTop: space.sm, gap: space.md }}
            >
              {children}
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function AskButton({ label, onPress, strong, danger }: { label: string; onPress: () => void; strong?: boolean; danger?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({
        minHeight: 48,
        borderRadius: radius.pill,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: space.lg,
        borderWidth: 1,
        borderColor: strong ? color.accent : danger ? color.critical : color.border,
        backgroundColor: strong ? color.accent : pressed ? color.surfaceRaised : 'transparent',
      })}
    >
      <Text
        style={{
          fontFamily: type.bodyBold,
          fontSize: type.size.body,
          color: strong ? '#1A0B03' : danger ? color.criticalText : color.ink,
        }}
      >
        {label}
      </Text>
    </Pressable>
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
