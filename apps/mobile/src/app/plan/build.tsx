/**
 * Build a plan — Phase 4. One screen of answers (goal, level, days, split, equipment, time,
 * sore areas, exercises to leave out, easy weeks), then the plan itself: each routine with
 * its exercises, sets and rep ranges, a swap for any exercise, the push-up and pull-up
 * ladders, and the weekly sets per muscle. "Follow this plan" saves it as your plan.
 * Rules only (`plans/builder.ts`): no AI call, works offline.
 */
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';

import { Badge, Card, Chip, GhostButton, Icon, IconButton, PrimaryButton, Screen } from '@/components/ui';
import { ChipGroup, type ChipOption } from '@/components/settings/ChipGroup';
import { ToggleRow } from '@/components/settings/SettingRow';
import { getProfile } from '@/db/repos/userRepo';
import { countWord } from '@/lib/words';
import { color, radius, space, type } from '@/theme/tokens';
import type { Goal } from '@/types/models';

import { MUSCLE_LABEL } from '@/tracker/catalog/muscles';
import { InfoHeading } from '@/tracker/components/InfoHeading';
import { SwapSheet } from '@/tracker/components/SwapSheet';
import { Glyph } from '@/tracker/components/TrackerGlyph';
import { alternativesFor, LADDER_INFO, MINUTES, splitFor, SPLIT_LABEL, type Alternative, type Level, type SplitChoice } from '@/tracker/plans/builder';
import { EASY_EVERY } from '@/tracker/plans/easyWeek';
import { PLAN_EQUIPMENT, PLAN_EQUIPMENT_LABEL, SORE_AREA_INFO, SORE_AREA_LABEL, SORE_AREAS, type PlanEquipment } from '@/tracker/plans/fit';
import { setsAndReps } from '@/tracker/plans/programs';
import { catalogEntry } from '@/tracker/catalog/exerciseCatalog';
import { dayTypeLabel } from '@/tracker/services/finishSummary';
import { saveBuiltPlan } from '@/tracker/services/plansService';
import { usePlanBuilder } from '@/tracker/store/planBuilderStore';

const GOALS = [
  { id: 'muscle', label: 'Build muscle' },
  { id: 'strength', label: 'Get stronger' },
  { id: 'fat_loss', label: 'Lose fat' },
  { id: 'general', label: 'Stay fit' },
] as const satisfies readonly ChipOption<Goal>[];

const LEVELS = [
  { id: 'beginner', label: 'Beginner' },
  { id: 'intermediate', label: 'Intermediate' },
  { id: 'advanced', label: 'Advanced' },
] as const satisfies readonly ChipOption<Level>[];

const DAYS = (['2', '3', '4', '5', '6'] as const).map((d) => ({ id: d, label: d }));
const SPLITS = [
  { id: 'auto', label: 'Best for my days' },
  { id: 'full', label: 'Full body' },
  { id: 'upper_lower', label: 'Upper / Lower' },
  { id: 'ppl', label: 'Push Pull Legs' },
] as const satisfies readonly ChipOption<SplitChoice>[];
const EQUIPMENT = PLAN_EQUIPMENT.map((e) => ({ id: e, label: PLAN_EQUIPMENT_LABEL[e] })) as readonly ChipOption<PlanEquipment>[];
const TIMES = MINUTES.map((m) => ({ id: String(m), label: `${m} min` }));

function Label({ children }: { children: string }) {
  return (
    <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.caption, color: color.inkMuted, letterSpacing: 1.1, textTransform: 'uppercase', marginBottom: space.sm }}>
      {children}
    </Text>
  );
}

export default function BuildPlanScreen() {
  const router = useRouter();
  const s = usePlanBuilder();
  const [swapping, setSwapping] = useState<{ r: number; x: number; name: string; options: Alternative[] } | null>(null);
  const [weeklyOpen, setWeeklyOpen] = useState(false);
  const saving = useRef(false);

  // Start from the member's own goal and level (the profile has both).
  useEffect(() => {
    let alive = true;
    void getProfile()
      .then((p) => alive && usePlanBuilder.getState().start({ goal: p.goal, level: p.experience }))
      .catch(() => alive && usePlanBuilder.getState().start({ goal: null, level: null }));
    return () => {
      alive = false;
    };
  }, []);

  const { input, plan } = s;
  const autoSplit = SPLIT_LABEL[splitFor('auto', input.days)];

  const onFollow = async (): Promise<void> => {
    if (!plan || saving.current) return;
    saving.current = true;
    try {
      await saveBuiltPlan(plan, input, { follow: true, easyWeeks: s.easyWeeks });
      usePlanBuilder.getState().clearPlan();
      // Back to the Routines screen already open (not a second copy on top of the old ones).
      router.dismissTo('/routines');
    } catch {
      Alert.alert('Could not save the plan', 'Please try again.');
    } finally {
      saving.current = false;
    }
  };

  const openSwap = (r: number, x: number): void => {
    if (!plan) return;
    const ex = plan.routines[r].exercises[x];
    const exclude = plan.routines[r].exercises.map((e) => e.key);
    setSwapping({ r, x, name: ex.name, options: alternativesFor(ex.key, { level: input.level, exclude, equipment: input.equipment, sore: input.sore, avoid: input.avoid }) });
  };

  // ---------------------------------------------------------------- the plan
  if (plan) {
    return (
      <Screen
        title={plan.name}
        subtitle={`${countWord(input.days, 'day')} a week · ${input.minutes} min · ${PLAN_EQUIPMENT_LABEL[input.equipment]}`}
        right={<IconButton icon="close" onPress={() => router.back()} accessibilityLabel="Close" />}
      >
        <View style={{ gap: space.lg }}>
          {plan.notes.length > 0 ? (
            <Card style={{ gap: 6 }}>
              {plan.notes.map((n) => (
                <Text key={n} style={{ fontFamily: type.body, fontSize: type.size.sub, color: color.inkSecondary, lineHeight: 19 }}>
                  {n}
                </Text>
              ))}
            </Card>
          ) : null}
          <View style={{ gap: space.md }}>
            <PrimaryButton label="Follow this plan" icon="target" onPress={() => void onFollow()} />
            <GhostButton label="Change answers" icon="chevron-left" onPress={() => usePlanBuilder.getState().clearPlan()} />
          </View>

          {plan.routines.some((r) => r.exercises.some((x) => x.ladder.length > 0)) ? (
            <InfoHeading title="Routines" info={LADDER_INFO} />
          ) : null}
          {plan.routines.map((r, ri) => (
            <Card key={`${r.name}-${ri}`} style={{ gap: space.sm }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: 2 }}>
                <Text style={{ flex: 1, fontFamily: type.heading, fontSize: type.size.h3, color: color.ink }}>{r.name}</Text>
                <View>
                  <Badge label={dayTypeLabel(r.dayType)} tone="accent" />
                </View>
              </View>
              {r.exercises.map((x, xi) => {
                const e = catalogEntry(x.key);
                const hasReps = e ? e.type === 'weight_reps' || e.type === 'reps' || e.type === 'weighted' || e.type === 'assisted' : true;
                return (
                  <View key={`${x.key}-${xi}`} style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 48 }}>
                    <View style={{ flex: 1 }}>
                      <Text numberOfLines={1} style={{ fontFamily: type.bodySemi, fontSize: type.size.body, color: color.ink }}>
                        {x.name}
                      </Text>
                      {x.ladder.length > 0 ? (
                        <Text numberOfLines={1} style={{ fontFamily: type.body, fontSize: type.size.caption, color: color.inkMuted }}>
                          Then: {x.ladder.join(' → ')}
                        </Text>
                      ) : null}
                    </View>
                    <Text style={{ fontFamily: type.mono, fontSize: type.size.sub, color: color.inkSecondary }}>
                      {setsAndReps({ sets: x.sets, repMin: x.repMin, repMax: x.repMax, hasReps })}
                    </Text>
                    <Pressable
                      onPress={() => openSwap(ri, xi)}
                      hitSlop={6}
                      accessibilityRole="button"
                      accessibilityLabel={`Swap ${x.name}`}
                      style={{ width: 40, height: 40, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: color.surfaceRaised }}
                    >
                      <Glyph name="swap" size={18} color={color.accent} />
                    </Pressable>
                  </View>
                );
              })}
            </Card>
          ))}

          {/* the weekly dose — a long list, folded under its count */}
          <View>
            <Pressable
              onPress={() => setWeeklyOpen((v) => !v)}
              accessibilityRole="button"
              accessibilityState={{ expanded: weeklyOpen }}
              style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: space.sm }}
            >
              <View style={{ transform: [{ rotate: weeklyOpen ? '90deg' : '0deg' }] }}>
                <Icon name="chevron-right" size={16} color={color.inkMuted} />
              </View>
              <Text style={{ flex: 1, fontFamily: type.heading, fontSize: type.size.h3, color: color.ink }}>Weekly sets per muscle</Text>
              <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.caption, color: color.inkMuted }}>{countWord(plan.weekly.length, 'muscle')}</Text>
            </Pressable>
            {weeklyOpen ? (
              <Card style={{ gap: 6 }}>
                {plan.weekly.map((w) => (
                  <View key={w.muscle} style={{ flexDirection: 'row' }}>
                    <Text style={{ flex: 1, fontFamily: type.body, fontSize: type.size.sub, color: color.inkSecondary }}>{MUSCLE_LABEL[w.muscle]}</Text>
                    <Text style={{ fontFamily: type.mono, fontSize: type.size.sub, color: color.ink }}>{countWord(w.sets, 'set', (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1)))}</Text>
                  </View>
                ))}
              </Card>
            ) : null}
          </View>
        </View>

        <SwapSheet
          visible={swapping != null}
          name={swapping?.name ?? ''}
          options={swapping?.options ?? []}
          note="Fits your equipment and sore areas."
          onClose={() => setSwapping(null)}
          onPick={(a) => {
            const w = swapping;
            setSwapping(null);
            if (w) usePlanBuilder.getState().swap(w.r, w.x, a.key);
          }}
        />
      </Screen>
    );
  }

  // ---------------------------------------------------------------- the answers
  return (
    <Screen title="Build a plan" subtitle="A few answers, then your plan." right={<IconButton icon="close" onPress={() => router.back()} accessibilityLabel="Close" />}>
      <View style={{ gap: space.xl }}>
        <ChipGroup label="Goal" options={GOALS} selectedId={input.goal} onSelect={(goal) => s.set({ goal })} />
        <ChipGroup label="Experience" options={LEVELS} selectedId={input.level} onSelect={(level) => s.set({ level })} />
        <ChipGroup label="Days a week" options={DAYS} selectedId={String(input.days) as (typeof DAYS)[number]['id']} onSelect={(d) => s.set({ days: Number(d) })} />
        <View>
          <ChipGroup label="Split" options={SPLITS} selectedId={input.split} onSelect={(split) => s.set({ split })} />
          {input.split === 'auto' ? (
            <Text style={{ fontFamily: type.body, fontSize: type.size.caption, color: color.inkMuted, marginTop: space.sm }}>
              For {countWord(input.days, 'day')}: {autoSplit}
            </Text>
          ) : null}
        </View>
        <ChipGroup label="Equipment" options={EQUIPMENT} selectedId={input.equipment} onSelect={(equipment) => s.set({ equipment })} />
        <ChipGroup label="Time per workout" options={TIMES} selectedId={String(input.minutes)} onSelect={(m) => s.set({ minutes: Number(m) })} />

        <View>
          <InfoHeading title="Go easy on" info={SORE_AREA_INFO} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            {SORE_AREAS.map((a) => (
              <Chip key={a} label={SORE_AREA_LABEL[a]} selected={input.sore.includes(a)} onPress={() => s.toggleSore(a)} />
            ))}
          </View>
        </View>

        <View>
          <Label>Leave out</Label>
          {input.avoid.length > 0 ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginBottom: space.sm }}>
              {input.avoid.map((k) => (
                <Chip key={k} label={`${s.avoidNames[k] ?? k} ✕`} selected onPress={() => s.toggleAvoid(k, s.avoidNames[k] ?? k)} />
              ))}
            </View>
          ) : null}
          <GhostButton label={input.avoid.length > 0 ? 'Choose more' : 'Choose exercises to leave out'} icon="plus" onPress={() => router.push('/plan/avoid')} />
        </View>

        <Card style={{ paddingVertical: space.xs }}>
          <ToggleRow
            icon="heart"
            title={`Easy week every ${EASY_EVERY} weeks`}
            caption="Half the sets, the same weights. Kept out of your records."
            value={s.easyWeeks}
            onChange={s.setEasyWeeks}
          />
        </Card>

        <PrimaryButton label="Build my plan" icon="sparkle" onPress={() => s.build()} />
      </View>
    </Screen>
  );
}
