/**
 * The exercise's records (Phase 3: every kind it keeps — heaviest weight, best 1-rep max,
 * best set, best session, most reps, longest time, best pace, longest distance) + the xRM
 * "Set Records" ladder for weight exercises. Tap a record → the workout it was set in.
 * Redesign R5 (Hevy's exercise Summary): "Personal records", then "Set records" — the heaviest
 * weight at each rep count — as a section of its own.
 *
 * v0.25.1: an exercise that keeps a pace (runs, rows, rides) says behind the i beside
 * "Records" that only sets of 1 km or more count, and shows "Best pace" with "—" until one
 * such set is logged — so a fast sprint that set nothing does not look like a bug.
 */
import { Pressable, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Card, Icon, SectionHeader } from '@/components/ui';
import type { IconName } from '@/components/ui';
import { tinyDateWithYear } from '@/lib/date';
import { color, motion, space, type } from '@/theme/tokens';
import { PACE_BASIS, paceRuleText, RECORD_LABEL, type RecordHit, type RecordKind } from '@/tracker/engine/records';
import type { XrmRecord } from '@/tracker/services/exerciseAnalytics';
import { recordDetailText, recordValueText, recordWeightText, type RecordTextContext } from '@/tracker/services/recordText';
import type { UnitSystem } from '@/types/models';

import { InfoHeading } from './InfoHeading';

export interface ExercisePrRowsProps {
  bests: RecordHit[];
  /** v0.25.1: the kinds this exercise keeps (a run keeps a pace, a carry its longest time). */
  kinds: readonly RecordKind[];
  ctx: RecordTextContext;
  ladder: XrmRecord[];
  units: UnitSystem;
  onOpenSession: (sessionId: string) => void;
}

/** Packet B (Phase 7): one icon per meaning — every record wears the medal; the label says which. */
const RECORD_ICON: IconName = 'medal';

/** "12 Jun" for the current year, else "12 Jun 2024" (records can be old). */
const recDate = (iso: string): string => tinyDateWithYear(iso);

function RecordRow({ icon, label, value, sub, onPress }: { icon: IconName; label: string; value: string; sub: string; onPress: (() => void) | null }) {
  const body = (
    <>
      <View
        style={{
          width: 34,
          height: 34,
          borderRadius: 17,
          backgroundColor: color.accentSoft,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon name={icon} size={16} color={color.accent} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.body, color: color.ink }}>{label}</Text>
        {/* 13 Oct 2026 audit (part W, ~360 dp at large text): two lines, so the date is never cut
            ("720 kg in one s…", "from 100 kg × 6 · 1 M…"). */}
        <Text numberOfLines={2} style={{ fontFamily: type.bodyMedium, fontSize: type.size.caption, color: color.inkMuted }}>
          {sub}
        </Text>
      </View>
      <Text style={{ fontFamily: type.mono, fontSize: type.size.body, color: onPress ? color.ink : color.inkMuted }}>{value}</Text>
      {onPress ? <Icon name="chevron-right" size={16} color={color.inkMuted} /> : <View style={{ width: 16 }} />}
    </>
  );
  const row = { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm } as const;
  // Nothing to open (a pace not set yet): a plain line, so a screen reader does not call it
  // a "disabled" button.
  if (!onPress) {
    return (
      <View accessible accessibilityLabel={`${label}, ${sub}`} style={row}>
        {body}
      </View>
    );
  }
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${label}, ${value}. Open the workout.`} style={row}>
      {body}
    </Pressable>
  );
}

export function ExercisePrRows({ bests, kinds, ctx, ladder, units, onOpenSession }: ExercisePrRowsProps) {
  // Runs, rows and rides keep a pace: say which sets count, and hold its place until one does —
  // also when nothing else is a record yet (a bike logged by time only).
  const keepsPace = kinds.includes('pace');
  const paceMissing = keepsPace && !bests.some((b) => b.kind === 'pace');
  if (bests.length === 0 && ladder.length === 0 && !keepsPace) return null;

  return (
    <Animated.View entering={FadeInDown.duration(motion.slow).delay(160)} style={{ marginTop: space.xl }}>
      {keepsPace ? <InfoHeading title="Personal records" info={paceRuleText(ctx.distUnit)} /> : <SectionHeader title="Personal records" />}
      {bests.length > 0 || paceMissing ? (
      <Card>
        {bests.map((b) => {
          const detail = recordDetailText(b, { ...ctx, units });
          return (
            <RecordRow
              key={b.kind}
              icon={RECORD_ICON}
              label={RECORD_LABEL[b.kind]}
              value={recordValueText(b, { ...ctx, units })}
              sub={detail ? `${detail} · ${recDate(b.dateISO)}` : recDate(b.dateISO)}
              onPress={() => onOpenSession(b.sessionId)}
            />
          );
        })}
        {paceMissing ? (
          <RecordRow
            icon={RECORD_ICON}
            label={RECORD_LABEL.pace}
            value="—"
            sub={`No set of ${PACE_BASIS.km.words} or more yet`}
            onPress={null}
          />
        ) : null}
      </Card>
      ) : null}

      {ladder.length > 0 ? (
        <View style={{ marginTop: space.xl }}>
          <SectionHeader title="Set records" />
          <Card>
            {ladder.map((r) => (
              <RecordRow
                key={`x-${r.reps}`}
                icon={RECORD_ICON}
                label={`${r.reps} ${r.reps === 1 ? 'rep' : 'reps'}`}
                // 13 Oct 2026 audit: the pop-up's words — "+10 kg" (weighted), "20 kg each" (dumbbells).
                value={recordWeightText(r.weightKg, { ...ctx, units })}
                sub={recDate(r.dateISO)}
                onPress={() => onOpenSession(r.sessionId)}
              />
            ))}
          </Card>
        </View>
      ) : null}
    </Animated.View>
  );
}
