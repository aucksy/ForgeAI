/**
 * Recovery scoring — PURE (no DB imports).
 * Base 75, adjusted by rest days, 7-day volume load, and muscle freshness.
 */
import { daysBetween } from '@/lib/date';
import { clamp } from '@/lib/format';
import type { DayType, MuscleGroup, RecoveryStatus } from '@/types/models';

type Freshness = RecoveryStatus['muscleFreshness'][number];

export function computeRecovery(input: {
  todayISO: string;
  recentSessions: {
    dateISO: string;
    dayType: DayType;
    volumeKg: number;
    muscleVolumes: { muscleGroup: MuscleGroup; volumeKg: number }[];
  }[]; // last 7 days
  avgWeeklyVolumeKg: number; // trailing 4-week mean
}): RecoveryStatus {
  const { todayISO, recentSessions, avgWeeklyVolumeKg } = input;

  // (a) Rest credit: trained today -10, yesterday +5, 2+ days ago (or never) +10.
  let daysSince = Number.POSITIVE_INFINITY;
  for (const s of recentSessions) {
    daysSince = Math.min(daysSince, Math.max(0, daysBetween(s.dateISO, todayISO)));
  }
  const restAdj = daysSince <= 0 ? -10 : daysSince === 1 ? 5 : 10;

  // (b) Last-7d volume vs trailing weekly average (no baseline -> neutral).
  const vol7 = recentSessions.reduce((sum, s) => sum + s.volumeKg, 0);
  const ratio = avgWeeklyVolumeKg > 0 ? vol7 / avgWeeklyVolumeKg : null;
  const volAdj = ratio === null ? 0 : ratio > 1.3 ? -25 : ratio > 1.1 ? -10 : ratio >= 0.7 ? 0 : 5;

  // (c) Muscle freshness: >= 48 h since a muscle last worked counts as fresh.
  const lastTrained = new Map<MuscleGroup, string>();
  for (const s of recentSessions) {
    for (const mv of s.muscleVolumes) {
      if (mv.volumeKg <= 0) continue;
      const prev = lastTrained.get(mv.muscleGroup);
      if (!prev || s.dateISO > prev) lastTrained.set(mv.muscleGroup, s.dateISO);
    }
  }
  const muscleFreshness: Freshness[] = Array.from(lastTrained.entries())
    .map(([muscleGroup, dateISO]) => {
      const hoursSince = Math.max(0, daysBetween(dateISO, todayISO)) * 24;
      return { muscleGroup, hoursSince, fresh: hoursSince >= 48 };
    })
    .sort((a, b) => a.hoursSince - b.hoursSince);
  const freshAdj =
    muscleFreshness.length === 0
      ? 10
      : Math.round((muscleFreshness.filter((m) => m.fresh).length / muscleFreshness.length) * 10);

  const score = clamp(Math.round(75 + restAdj + volAdj + freshAdj), 0, 100);
  const label: RecoveryStatus['label'] =
    score >= 85 ? 'primed' : score >= 70 ? 'good' : score >= 50 ? 'moderate' : 'low';

  return { score, label, muscleFreshness, note: buildNote(label, daysSince, ratio, muscleFreshness) };
}

function buildNote(
  label: RecoveryStatus['label'],
  daysSince: number,
  ratio: number | null,
  freshness: Freshness[],
): string {
  if (daysSince <= 0) {
    return 'Session already banked today — food, water and sleep are the workout now.';
  }
  if (ratio !== null && ratio > 1.3) {
    return `Volume is ${Math.round((ratio - 1) * 100)}% above your usual week — keep today sharp but short.`;
  }
  const stale = freshness.filter((m) => !m.fresh);
  switch (label) {
    case 'primed':
      return 'Fully recharged — a great day to chase heavy top sets.';
    case 'good':
      return stale.length > 0
        ? `Recovery is on track — ${stale[0].muscleGroup} worked recently, so warm it up well.`
        : 'Recovery is on track — attack the session as planned.';
    case 'moderate':
      return stale.length > 0
        ? `Carrying some fatigue in ${listMuscles(stale)} — keep the intensity honest today.`
        : 'Carrying a little fatigue — keep the intensity honest today.';
    default:
      return 'Fatigue is high — a light session or full rest today will pay you back tomorrow.';
  }
}

function listMuscles(items: Freshness[]): string {
  const names = items.slice(0, 2).map((m) => m.muscleGroup);
  return names.join(' and ');
}
