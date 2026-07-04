import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { BarChart, LineChart } from '@/components/charts';
import { Chip, EmptyState, GhostButton, Skeleton } from '@/components/ui';
import { getAllExercises } from '@/db/repos/exerciseRepo';
import { addDays, tinyDate, todayISO } from '@/lib/date';
import { trimNum } from '@/lib/format';
import { tap } from '@/lib/haptics';
import { getExerciseStats } from '@/services/analytics';
import { color, space, type } from '@/theme/tokens';
import type { ExerciseStats } from '@/types/models';

import { InspectReadout, Section } from './Section';
import { labelStep } from './util';

export interface ExerciseSectionProps {
  rangeDays: number;
  index: number;
}

interface PickItem {
  id: string;
  label: string;
}

/** Popular lifts to surface as picker chips; shortest matching name wins. */
const PICKS: { label: string; re: RegExp }[] = [
  { label: 'Bench', re: /bench/i },
  { label: 'Squat', re: /squat/i },
  { label: 'Deadlift', re: /deadlift/i },
  { label: 'OHP', re: /overhead press|shoulder press/i },
  { label: 'Lat Pulldown', re: /pulldown/i },
  { label: 'Row', re: /row/i },
];

/**
 * Per-exercise deep dive: chip picker -> top-set weight line (crosshair) +
 * session volume bars + link to the full exercise page.
 */
export function ExerciseSection({ rangeDays, index }: ExerciseSectionProps) {
  const [picks, setPicks] = useState<PickItem[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [stats, setStats] = useState<ExerciseStats | null>(null);
  const [busy, setBusy] = useState(true);
  const [inspect, setInspect] = useState<{ x: string; y: number } | null>(null);
  const reqRef = useRef(0);

  useEffect(() => {
    let alive = true;
    getAllExercises()
      .then((all) => {
        if (!alive) return;
        const found: PickItem[] = [];
        for (const p of PICKS) {
          const matches = all
            .filter((e) => p.re.test(e.name) && !found.some((f) => f.id === e.id))
            .sort((a, b) => a.name.length - b.name.length);
          if (matches.length > 0) found.push({ id: matches[0].id, label: p.label });
        }
        setPicks(found);
        if (found.length > 0) setSelected(found[0].id);
        else setBusy(false);
      })
      .catch(() => {
        if (alive) setBusy(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!selected) return;
    const req = ++reqRef.current;
    setBusy(true);
    setInspect(null);
    getExerciseStats(selected)
      .then((s) => {
        if (reqRef.current === req) setStats(s);
      })
      .catch(() => {
        if (reqRef.current === req) setStats(null);
      })
      .finally(() => {
        if (reqRef.current === req) setBusy(false);
      });
  }, [selected]);

  // Prefer the selected range window; fall back to full history if it's empty.
  const fromDay = addDays(todayISO(), -(rangeDays - 1));
  const all = stats?.progress ?? [];
  const inRange = all.filter((p) => p.dateISO >= fromDay);
  const progress = inRange.length > 0 ? inRange : all;

  const openExercise = () => {
    if (!selected) return;
    tap();
    router.push({ pathname: '/exercise/[id]', params: { id: selected } });
  };

  return (
    <Section
      title="Exercise Progress"
      index={index}
      right={
        inspect ? (
          <InspectReadout value={`${trimNum(inspect.y)} kg`} sub={tinyDate(inspect.x)} />
        ) : undefined
      }
    >
      {picks.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: space.sm }}
          style={{ marginBottom: space.lg }}
        >
          {picks.map((p) => (
            <Chip
              key={p.id}
              label={p.label}
              selected={p.id === selected}
              onPress={() => {
                if (p.id === selected) return;
                tap();
                setSelected(p.id);
              }}
            />
          ))}
        </ScrollView>
      ) : null}

      {busy ? (
        <View style={{ gap: space.md }}>
          <Skeleton width="100%" height={160} radius={12} />
          <Skeleton width="100%" height={110} radius={12} />
        </View>
      ) : progress.length === 0 ? (
        <EmptyState
          icon="dumbbell"
          title="No data yet"
          body="Log this exercise with the coach to unlock its trend."
        />
      ) : (
        <>
          <Text style={styles.chartLabel}>TOP SET WEIGHT</Text>
          <LineChart
            data={progress.map((p) => ({ x: p.dateISO, y: p.topWeightKg }))}
            fillGradient
            yFormat={(n) => trimNum(n)}
            onInspect={setInspect}
          />
          <Text style={[styles.chartLabel, { marginTop: space.lg }]}>SESSION VOLUME</Text>
          <BarChart
            data={progress.map((p) => ({ x: p.dateISO, y: p.volumeKg }))}
            height={120}
            labelEvery={labelStep(progress.length)}
          />
          <View style={{ marginTop: space.xl }}>
            <GhostButton label="Open exercise page" icon="dumbbell" onPress={openExercise} />
          </View>
        </>
      )}
    </Section>
  );
}

const styles = {
  chartLabel: {
    fontFamily: type.bodySemi,
    fontSize: type.size.caption,
    color: color.inkMuted,
    letterSpacing: 1.2,
    marginBottom: space.sm,
  },
} as const;
