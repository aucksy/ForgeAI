/** Body-weight quick-log + trend + history — frozen userRepo, offline, stored in kg (shown kg or lb). */
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, Text, TextInput, View } from 'react-native';

import { DeltaPill } from '@/components/charts';
import { AnimatedNumber, Card, EmptyState, IconButton, LoadError, PrimaryButton, Screen, SectionHeader, Skeleton } from '@/components/ui';
import { getBodyWeightHistory, getProfile } from '@/db/repos/userRepo';
import { logBodyWeight } from '@/db/queuedWrites';
import { shortDate, todayISO } from '@/lib/date';
import { trimNum } from '@/lib/format';
import { success } from '@/lib/haptics';
import { kgToShown, shownToKg, weightUnitOf } from '@/lib/units';
import { useUnits } from '@/lib/useUnits';
import { color, radius, space, type } from '@/theme/tokens';
import { DateLineChart } from '@/tracker/components/DateLineChart';
import { showW } from '@/tracker/components/unitText';
import { weightChange, weightChangeShown, weightChangeTone, weightSpanText } from '@/tracker/engine/headline';
import type { BodyWeightEntry, Goal } from '@/types/models';

const noopInspect = () => {
  /* enables the chart's press-drag crosshair */
};

export default function BodyWeightScreen() {
  const router = useRouter();
  // v0.27.0: typed and shown in kg or lb; always stored in kg.
  const units = useUnits();
  const unit = weightUnitOf(units);

  const [history, setHistory] = useState<BodyWeightEntry[]>([]);
  const [loading, setLoading] = useState(true);
  // PG-23: a failed read shows "Couldn't load your weigh-ins", never "No weigh-ins yet".
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [input, setInput] = useState('');
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  // PG-10: the change's colour follows the member's goal (neutral until it is read).
  const [goal, setGoal] = useState<Goal | null>(null);

  useEffect(() => {
    let alive = true;
    getProfile()
      .then((p) => {
        if (alive) setGoal(p.goal);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    getBodyWeightHistory()
      .then((h) => {
        if (alive) {
          setHistory(h);
          setLoading(false);
          setFailed(false);
        }
      })
      .catch(() => {
        if (!alive) return;
        setLoading(false);
        setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [attempt]);

  const retry = (): void => {
    setFailed(false);
    setLoading(true);
    setAttempt((n) => n + 1);
  };

  const onLog = async (): Promise<void> => {
    if (savingRef.current) return;
    const v = parseFloat(input.replace(',', '.'));
    if (!Number.isFinite(v) || v <= 0) {
      Alert.alert('Enter a weight', units === 'imperial' ? 'Type your body weight in lb, e.g. 168.5' : 'Type your body weight in kg, e.g. 76.5');
      return;
    }
    savingRef.current = true;
    setSaving(true);
    try {
      await logBodyWeight(todayISO(), shownToKg(v, units));
      success();
      setInput('');
      // The weigh-in IS saved: a failed re-read must not say "Could not save" (it would be
      // logged twice). The list catches up on the next visit.
      await getBodyWeightHistory()
        .then((h) => {
          setHistory(h);
          setFailed(false);
        })
        .catch(() => undefined);
    } catch {
      Alert.alert('Could not save', 'Something went wrong — please try again.');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const latest = history.length > 0 ? history[history.length - 1] : null;
  const current = latest ? latest.weightKg : 0;
  // PG-11: the one body-weight rule, always with its span ("+5 kg since 13 Jul 2025").
  const change = weightChange(history);

  return (
    <Screen
      title="Body weight"
      right={<IconButton icon="close" onPress={() => router.back()} accessibilityLabel="Close" />}
    >
      <View style={{ gap: space.lg }}>
        {/* quick log — always available */}
        <Card>
          <View style={{ gap: space.md }}>
            <Text style={{ fontFamily: type.heading, fontSize: type.size.sub, color: color.inkSecondary }}>
              Log today’s weight
            </Text>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: space.sm,
                height: 46,
                paddingHorizontal: space.md,
                borderRadius: radius.md,
                backgroundColor: color.surfaceSunken,
                borderWidth: 1,
                borderColor: color.border,
              }}
            >
              <TextInput
                value={input}
                onChangeText={setInput}
                placeholder={latest ? showW(latest.weightKg, units) : units === 'imperial' ? '168.5' : '76.5'}
                placeholderTextColor={color.inkMuted}
                keyboardType="decimal-pad"
                style={{
                  flex: 1,
                  fontFamily: type.mono,
                  fontSize: type.size.body,
                  color: color.ink,
                  paddingVertical: 0,
                }}
              />
              <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.sub, color: color.inkMuted }}>{unit}</Text>
            </View>
            <PrimaryButton label="Log weight" icon="check" loading={saving} onPress={() => void onLog()} />
          </View>
        </Card>

        {loading ? (
          <Skeleton width="100%" height={220} radius={radius.lg} />
        ) : failed && history.length === 0 ? (
          <LoadError what="your weigh-ins" onRetry={retry} />
        ) : history.length === 0 ? (
          <EmptyState icon="scale" title="No weigh-ins yet" body="Log your body weight above to start a trend." />
        ) : (
          <>
            {/* trend */}
            <View style={{ gap: space.md }}>
              <SectionHeader title="Trend" />
              <Card>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'flex-end',
                    justifyContent: 'space-between',
                    marginBottom: space.lg,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.xs + 2 }}>
                    <AnimatedNumber key={units} value={current} format={(n) => showW(n, units)} style={{ fontSize: type.size.h1 }} />
                    <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.sub, color: color.inkMuted }}>
                      {unit} now
                    </Text>
                  </View>
                  {change ? (
                    <View style={{ alignItems: 'flex-end', gap: 3 }}>
                      <DeltaPill value={weightChangeShown(change, units)} suffix={` ${unit}`} tone={weightChangeTone(change.changeKg, goal)} />
                      <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.caption, color: color.inkMuted }}>{weightSpanText(change)}</Text>
                    </View>
                  ) : null}
                </View>
                {history.length >= 2 ? (
                  <DateLineChart
                    data={history.map((d) => ({ x: d.dateISO, y: kgToShown(d.weightKg, units) }))}
                    fillGradient
                    yFormat={(n) => trimNum(n)}
                    onInspect={noopInspect}
                  />
                ) : (
                  <Text style={{ fontFamily: type.body, fontSize: type.size.sub, color: color.inkMuted }}>
                    Log a few more days to see your trend line.
                  </Text>
                )}
              </Card>
            </View>

            {/* history list */}
            <View style={{ gap: space.sm }}>
              <SectionHeader title="History" />
              {[...history]
                .reverse()
                .slice(0, 60)
                .map((e) => (
                  <View
                    key={e.id}
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      paddingVertical: space.sm,
                      paddingHorizontal: space.md,
                      borderRadius: radius.md,
                      backgroundColor: color.surface,
                      borderWidth: 1,
                      borderColor: color.border,
                    }}
                  >
                    <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.body, color: color.inkSecondary }}>
                      {shortDate(e.dateISO)}
                    </Text>
                    <Text style={{ fontFamily: type.mono, fontSize: type.size.body, color: color.ink }}>
                      {showW(e.weightKg, units)} {unit}
                    </Text>
                  </View>
                ))}
            </View>
          </>
        )}
      </View>
    </Screen>
  );
}
