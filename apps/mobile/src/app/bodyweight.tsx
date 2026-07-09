/** Body-weight quick-log + trend + history — frozen userRepo, offline, kg. */
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, Text, TextInput, View } from 'react-native';

import { DeltaPill, LineChart } from '@/components/charts';
import { AnimatedNumber, Card, EmptyState, IconButton, PrimaryButton, Screen, SectionHeader, Skeleton } from '@/components/ui';
import { getBodyWeightHistory, logBodyWeight } from '@/db/repos/userRepo';
import { shortDate, todayISO } from '@/lib/date';
import { trimNum } from '@/lib/format';
import { success } from '@/lib/haptics';
import { color, radius, space, type } from '@/theme/tokens';
import type { BodyWeightEntry } from '@/types/models';

const noopInspect = () => {
  /* enables the chart's press-drag crosshair */
};

export default function BodyWeightScreen() {
  const router = useRouter();

  const [history, setHistory] = useState<BodyWeightEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState('');
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  useEffect(() => {
    let alive = true;
    getBodyWeightHistory()
      .then((h) => {
        if (alive) {
          setHistory(h);
          setLoading(false);
        }
      })
      .catch(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const onLog = async (): Promise<void> => {
    if (savingRef.current) return;
    const v = parseFloat(input.replace(',', '.'));
    if (!Number.isFinite(v) || v <= 0) {
      Alert.alert('Enter a weight', 'Type your body weight in kg, e.g. 76.5');
      return;
    }
    savingRef.current = true;
    setSaving(true);
    try {
      await logBodyWeight(todayISO(), v);
      success();
      setInput('');
      const h = await getBodyWeightHistory();
      setHistory(h);
    } catch {
      Alert.alert('Could not save', 'Something went wrong — please try again.');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const latest = history.length > 0 ? history[history.length - 1] : null;
  const current = latest ? latest.weightKg : 0;
  const delta = history.length >= 2 ? Math.round((current - history[0].weightKg) * 10) / 10 : 0;

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
                placeholder={latest ? trimNum(latest.weightKg) : '76.5'}
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
              <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.sub, color: color.inkMuted }}>kg</Text>
            </View>
            <PrimaryButton label="Log weight" icon="check" loading={saving} onPress={() => void onLog()} />
          </View>
        </Card>

        {loading ? (
          <Skeleton width="100%" height={220} radius={radius.lg} />
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
                    <AnimatedNumber value={current} format={(n) => trimNum(n)} style={{ fontSize: type.size.h1 }} />
                    <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.sub, color: color.inkMuted }}>
                      kg now
                    </Text>
                  </View>
                  {history.length >= 2 ? <DeltaPill value={delta} suffix=" kg" /> : null}
                </View>
                {history.length >= 2 ? (
                  <LineChart
                    data={history.map((d) => ({ x: d.dateISO, y: d.weightKg }))}
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
                      {trimNum(e.weightKg)} kg
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
