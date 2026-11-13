import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';

import { askConfirm, Card, GhostButton, PrimaryButton } from '@/components/ui';
import { color, space, type } from '@/theme/tokens';
import { dueQuestion, dueTitle, progressLine, runningTitle, swapLine, weakLine } from '@/tracker/engine/balanceBlock';
import { getBalanceCard, keepBlock, snoozeMuscle, undoBlock, type BalanceCard as Data } from '@/tracker/services/balanceCheck';
import { todayISO } from '@/lib/date';

export interface BalanceCardProps {
  /** Changes when the Charts page reloads (a workout may have just ended): read again. */
  stamp: unknown;
}

// Read at draw time (gym branding repaints the app; noModuleColours.test).
const bodyStyle = () => ({ fontFamily: type.body, fontSize: type.size.sub, color: color.inkSecondary, lineHeight: 19 }) as const;
const titleStyle = () => ({ fontFamily: type.bodySemi, fontSize: type.size.body, color: color.ink }) as const;
const labelStyle = () => ({ fontFamily: type.bodySemi, fontSize: type.size.caption, color: color.inkMuted, textTransform: 'uppercase', letterSpacing: 0.6 }) as const;

/**
 * Balance check (F52, R-201), under the body map: a muscle the member trains much less than the
 * rest, from the last 4 weeks, with "Not now". Shows nothing until 4 weeks of workouts, and nothing
 * when the week is balanced. R-483 (owner, 13 Nov 2026): swap advice lives only in the Up next muscle
 * tip, so this card no longer suggests a swap. A focus block started before R-483 still runs to its
 * end here ("Keep it" / "Go back").
 */
export function BalanceCard({ stamp }: BalanceCardProps) {
  const [data, setData] = useState<Data | null>(null);
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
      reload();
    } catch (e) {
      console.warn('[ForgeErr] balance check action failed', e);
      setError(failText);
    } finally {
      running.current = false;
      setBusy(false);
    }
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

  const { spot } = data;
  return (
    <Card style={{ gap: space.sm, marginBottom: space.xxl }}>
      <Text style={label}>Balance check</Text>
      <Text style={title}>{weakLine(spot)}</Text>
      <Text style={body}>These numbers come from your last 4 weeks of workouts.</Text>
      {error ? <Text style={{ ...body, color: color.criticalText }}>{error}</Text> : null}
      <GhostButton label="Not now" onPress={() => void run(() => snoozeMuscle(spot.muscle), 'Could not save. Please try again.')} />
    </Card>
  );
}
