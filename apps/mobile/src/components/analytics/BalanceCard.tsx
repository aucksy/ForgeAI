import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { askConfirm, Card, GhostButton, PrimaryButton, Sheet, SheetRow } from '@/components/ui';
import { color, space, type } from '@/theme/tokens';
import {
  BLOCK_WEEKS,
  dueQuestion,
  dueTitle,
  equipmentWord,
  heavyLine,
  progressLine,
  runningTitle,
  sheetTitle,
  swapLine,
  weakLine,
} from '@/tracker/engine/balanceBlock';
import { getBalanceCard, keepBlock, snoozeMuscle, startBlock, undoBlock, type BalanceCard as Data } from '@/tracker/services/balanceCheck';
import { todayISO } from '@/lib/date';
import { exerciseIdsForKeys } from '@/tracker/db/folderRepo';

export interface BalanceCardProps {
  /** Changes when the Charts page reloads (a workout may have just ended): read again. */
  stamp: unknown;
  /** Opens an exercise's page. */
  onOpenExercise: (exerciseId: string) => void;
}

// Read at draw time (gym branding repaints the app; noModuleColours.test).
const bodyStyle = () => ({ fontFamily: type.body, fontSize: type.size.sub, color: color.inkSecondary, lineHeight: 19 }) as const;
const titleStyle = () => ({ fontFamily: type.bodySemi, fontSize: type.size.body, color: color.ink }) as const;
const labelStyle = () => ({ fontFamily: type.bodySemi, fontSize: type.size.caption, color: color.inkMuted, textTransform: 'uppercase', letterSpacing: 0.6 }) as const;

/**
 * Balance check (F52, R-201), under the body map: a muscle the member trains much less than the
 * rest, and one swap in their routines for 8 weeks; then "Keep it" or "Go back". Shows nothing
 * until 4 weeks of workouts, and nothing when the week is balanced.
 */
export function BalanceCard({ stamp, onOpenExercise }: BalanceCardProps) {
  const [data, setData] = useState<Data | null>(null);
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState(0);
  const [busy, setBusy] = useState(false);
  // State is one render late: two fast taps would both pass `busy` (review, 2 Nov). The ref is not.
  const running = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    getBalanceCard()
      .then((d) => {
        if (alive) setData(d);
      })
      .catch((e: unknown) => console.warn('[ForgeErr] balance check not loaded', e));
    return () => {
      alive = false;
    };
  }, [stamp, attempt]);

  const reload = () => setAttempt((n) => n + 1);

  const run = async (fn: () => Promise<void>, failText: string) => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError(null);
    try {
      await fn();
      setOpen(false);
      reload();
    } catch (e) {
      console.warn('[ForgeErr] balance check action failed', e);
      setError(failText);
    } finally {
      running.current = false;
      setBusy(false);
    }
  };

  /** A library pick's own page (its row is added to the member's list if it is not there yet). */
  const openPick = (key: string) => {
    exerciseIdsForKeys([key])
      .then((ids) => {
        const id = ids.get(key);
        if (!id) return;
        setOpen(false);
        onOpenExercise(id);
      })
      .catch((e: unknown) => console.warn('[ForgeErr] balance check: exercise not opened', e));
  };

  if (!data || data.kind === 'none') return null;
  const body = bodyStyle();
  const title = titleStyle();
  const label = labelStyle();

  if (data.kind === 'running' || data.kind === 'due') {
    const b = data.block;
    const progress = progressLine(b.muscle, data.now, b.before);
    const due = data.kind === 'due';
    return (
      <Card style={{ gap: space.sm, marginBottom: space.xxl }}>
        <Text style={label}>Balance check</Text>
        <Text style={title}>{due ? dueTitle(b) : runningTitle(b, todayISO())}</Text>
        {progress ? <Text style={body}>{progress}</Text> : null}
        <Text style={body}>{due ? dueQuestion(b) : swapLine(b)}</Text>
        {error ? <Text style={{ ...body, color: color.criticalText }}>{error}</Text> : null}
        {due ? (
          <View style={{ gap: space.sm, marginTop: space.xs }}>
            <PrimaryButton label="Keep it" loading={busy} onPress={() => void run(keepBlock, 'Could not save. Please try again.')} />
            <GhostButton label="Go back" onPress={() => void run(() => undoBlock(), 'Could not change the routine. Please try again.')} />
          </View>
        ) : (
          <GhostButton
            label="Go back now"
            onPress={() =>
              void askConfirm({
                title: `Put ${b.oldName} back?`,
                body: `${b.newName} comes out of ${b.routineName}.`,
                confirmLabel: 'Go back',
              }).then((yes) => {
                if (yes) void run(() => undoBlock(), 'Could not change the routine. Please try again.');
              })
            }
          />
        )}
      </Card>
    );
  }

  const { spot, swap, best } = data;
  const chosen = best[Math.min(pick, best.length - 1)];
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${weakLine(spot)}. See a swap`}
        onPress={() => {
          setPick(0);
          setError(null);
          setOpen(true);
        }}
      >
        <Card style={{ gap: space.sm, marginBottom: space.xxl }}>
          <Text style={label}>Balance check</Text>
          <Text style={title}>{weakLine(spot)}</Text>
          <Text style={body}>These numbers come from your last 4 weeks of workouts.</Text>
          <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: color.accent }}>See a swap</Text>
        </Card>
      </Pressable>
      <Sheet visible={open} title={sheetTitle(spot.muscle)} subtitle={weakLine(spot)} onClose={() => setOpen(false)}>
        <View style={{ gap: space.md }}>
          {swap ? (
            <>
              <Text style={label}>Take out</Text>
              <SheetRow label={swap.name} value={swap.routineName} onPress={() => {
                  setOpen(false);
                  onOpenExercise(swap.exerciseId);
                }}
              />
              <Text style={body}>{heavyLine(swap)}</Text>
              <Text style={label}>Put in (pick one)</Text>
              {best.map((b, i) => (
                <SheetRow key={b.key} label={i === 0 ? `${b.name} (best)` : b.name} value={equipmentWord(b.equipment)} selected={i === pick} onPress={() => setPick(i)} />
              ))}
              <Text style={body}>
                {`The new exercise keeps the same sets and reps. After ${BLOCK_WEEKS} weeks, the app asks if you want to keep it or go back. Your old routine is saved.`}
              </Text>
              {error ? <Text style={{ ...body, color: color.criticalText }}>{error}</Text> : null}
              <PrimaryButton
                label={`Swap for ${BLOCK_WEEKS} weeks`}
                loading={busy}
                onPress={() => void run(() => startBlock(spot, swap, chosen), 'Could not change the routine. Please try again.')}
              />
            </>
          ) : (
            <>
              <Text style={body}>Your routines have no exercise that is easy to take out for this. You can add one of these to a routine.</Text>
              <Text style={label}>Best for this muscle</Text>
              {best.map((b) => (
                <SheetRow key={b.key} label={b.name} value={equipmentWord(b.equipment)} onPress={() => openPick(b.key)} />
              ))}
            </>
          )}
          <GhostButton label="Not now" onPress={() => void run(() => snoozeMuscle(spot.muscle), 'Could not save. Please try again.')} />
        </View>
      </Sheet>
    </>
  );
}
