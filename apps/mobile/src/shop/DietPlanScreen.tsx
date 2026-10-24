/**
 * Gym tab → Diet plan (R-120, 24 Oct 2026): the plan the gym's trainer sent, read-only. The title,
 * the goal, calories and protein a day when given, each meal with its time and foods, the trainer's
 * notes, and always "Talk to a doctor if you have a health condition." The kept copy shows at once
 * (works offline after the first answer); the gym is asked when the page opens and on a pull.
 * No food logging here. Only with a gym joined (GymOnly).
 */
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';

import { EmptyState, Screen } from '@/components/ui';
import { tinyDateWithYear } from '@/lib/date';
import { color, radius, space, type } from '@/theme/tokens';
import { readGymDiets, syncGymDiets } from '@/tracker/services/gymBodySync';

import { DIET_DOCTOR_LINE, dietProblemWords, dietTargetsWords, type GymDietPlan, type GymDietsCopy, type GymProblem } from './gymBody';
import { GymOnly } from './GymOnly';
import { useGymShop } from './gymStore';
import { QuietLine, leave } from './ShopParts';

export function DietPlanScreen() {
  return (
    <GymOnly>
      <GymDiet />
    </GymOnly>
  );
}

function GymDiet() {
  const router = useRouter();
  const link = useGymShop((s) => s.link);
  const [copy, setCopy] = useState<GymDietsCopy | null | undefined>(undefined);
  const [problem, setProblem] = useState<GymProblem | null>(null);
  const [pulling, setPulling] = useState(false);
  const running = useRef(false);

  const refresh = useCallback(
    async (byPull: boolean) => {
      if (running.current) return;
      running.current = true;
      if (byPull) setPulling(true);
      const kept = await readGymDiets(link);
      setCopy((c) => (c === undefined ? kept : c));
      const r = await syncGymDiets(link, { force: byPull });
      if (r.kind === 'fresh') {
        setCopy(r.copy);
        setProblem(null);
      } else if (r.kind === 'problem') {
        setProblem(r.problem);
      } else {
        setCopy(kept);
      }
      running.current = false;
      setPulling(false);
    },
    [link],
  );

  useFocusEffect(
    useCallback(() => {
      void refresh(false);
    }, [refresh]),
  );

  const gymName = link?.gymName ?? 'Your gym';
  const plans = copy?.plans ?? [];

  return (
    <Screen title="Diet plan" onBack={() => leave(router, '/shop')} scroll={false} noPad>
      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: space.screenX, paddingBottom: space.xxl, gap: space.md }}
        refreshControl={
          <RefreshControl refreshing={pulling} onRefresh={() => void refresh(true)} colors={[color.accent]} tintColor={color.accent} progressBackgroundColor={color.surfaceRaised} />
        }
      >
        {copy === undefined ? (
          <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.body, color: color.inkSecondary, paddingVertical: space.lg }}>Loading…</Text>
        ) : plans.length === 0 ? (
          problem ? (
            <EmptyState icon="meal" title={dietProblemWords(problem, gymName).title} body={dietProblemWords(problem, gymName).body} />
          ) : (
            <EmptyState icon="meal" title="No diet plan yet" body={`When your trainer at ${gymName} sends you a diet plan, it shows here by itself. Ask them if you'd like one.`} />
          )
        ) : (
          <>
            {problem ? <QuietLine text={dietProblemWords(problem, gymName).title} /> : null}
            {plans.map((p) => (
              <PlanCard key={p.id} plan={p} gymName={copy?.gymName ?? gymName} />
            ))}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

function PlanCard({ plan, gymName }: { plan: GymDietPlan; gymName: string }) {
  const targets = dietTargetsWords(plan);
  return (
    <View style={{ padding: space.lg, borderRadius: radius.lg, backgroundColor: color.surface, borderWidth: 1, borderColor: color.border, gap: space.md }}>
      <View style={{ gap: 4 }}>
        <Text accessibilityRole="header" style={{ fontFamily: type.heading, fontSize: type.size.h3, color: color.ink }}>
          {plan.title}
        </Text>
        <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.caption, color: color.accent }}>
          {`From ${gymName}${plan.byName ? ` · ${plan.byName}` : ''}${plan.updatedAt > 0 ? ` · ${tinyDateWithYear(new Date(plan.updatedAt).toISOString().slice(0, 10))}` : ''}`}
        </Text>
        {plan.goal ? <Text style={{ fontFamily: type.body, fontSize: type.size.body, color: color.inkSecondary }}>{plan.goal}</Text> : null}
        {targets ? <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.body, color: color.ink }}>{targets}</Text> : null}
      </View>

      {plan.meals.map((m, i) => (
        <View key={`${i}-${m.name}`} style={{ gap: 4, paddingTop: space.sm, borderTopWidth: 1, borderTopColor: color.border }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'baseline', gap: space.sm }}>
            <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.body, color: color.ink }}>{m.name}</Text>
            {m.time ? <Text style={{ fontFamily: type.mono, fontSize: type.size.sub, color: color.inkMuted }}>{m.time}</Text> : null}
          </View>
          {m.items.map((it, j) => (
            <Text key={j} style={{ fontFamily: type.body, fontSize: type.size.body, lineHeight: 22, color: color.inkSecondary }}>
              {`• ${it}`}
            </Text>
          ))}
        </View>
      ))}

      {plan.notes ? (
        <View style={{ gap: 4, paddingTop: space.sm, borderTopWidth: 1, borderTopColor: color.border }}>
          <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.body, color: color.ink }}>Notes from your trainer</Text>
          <Text style={{ fontFamily: type.body, fontSize: type.size.body, lineHeight: 22, color: color.inkSecondary }}>{plan.notes}</Text>
        </View>
      ) : null}
      {plan.notes?.includes(DIET_DOCTOR_LINE) ? null : (
        <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.sub, color: color.inkMuted }}>{DIET_DOCTOR_LINE}</Text>
      )}
    </View>
  );
}
