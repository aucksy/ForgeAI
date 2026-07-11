/**
 * Post-workout coach note (Phase C2) — a short coach-voice line on the finish
 * screen, grounded in the JUST-SAVED session (PRs, volume vs last same day-type,
 * one recovery/next-focus cue).
 *
 * Two layers, offline-first:
 *  - `buildSessionNote` is PURE + deterministic — the always-shown line. Zero
 *    network, works with no key. This is the offline coach.
 *  - `getCloudCoachNote` is an OPT-IN richer note via Groq. It short-circuits to
 *    null BEFORE any network unless the user enabled it (trackerPrefs.coachNotes)
 *    AND a Groq key is set — so the default build makes zero network calls and a
 *    keyless/offline user always gets the deterministic line with no latency.
 *
 * No frozen file edited, no schema change. Reuses frozen reads only
 * (`getLastSessionOfDayType`) + the ai module's Groq provider for the opt-in path.
 */
import { DEFAULT_GROQ_MODEL } from '@/ai/models';
import { chatGroq } from '@/ai/providers/groq';
import { getLastSessionOfDayType } from '@/db/repos/workoutRepo';
import { getGroqKey } from '@/lib/keys';
import { fmtInt, trimNum } from '@/lib/format';
import { useSettings } from '@/store/settingsStore';
import type { SessionDetail } from '@/types/models';

import { dayTypeLabel } from './finishSummary';
import type { SessionSummaryData } from './finishSummary';
import { useTrackerPrefs } from '../store/trackerPrefsStore';

const cap = (s: string): string => (s.length === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1));

/**
 * The deterministic coach line. Priority mirrors the app's coach voice:
 * PR celebration > volume vs last same day-type > recovery / next-focus cue.
 */
export function buildSessionNote(
  data: SessionSummaryData,
  prevSameType: SessionDetail | null,
): string {
  const dayLabel = dayTypeLabel(data.session.dayType);
  const weightPrs = data.prs.filter((p) => p.kind === 'weight');
  const e1rmPrs = data.prs.filter((p) => p.kind === 'e1rm');

  // 1) A heavier top set is the headline every time.
  if (weightPrs.length > 0) {
    const p = weightPrs[0];
    return weightPrs.length === 1
      ? `New PR on ${p.exerciseName} — ${trimNum(p.weightKg)} kg × ${p.reps}. That's progressive overload doing its job.`
      : `${weightPrs.length} weight PRs today — ${p.exerciseName} led at ${trimNum(p.weightKg)} kg. Your strength curve is pointing up.`;
  }
  if (e1rmPrs.length > 0) {
    const p = e1rmPrs[0];
    return `Estimated-1RM PR on ${p.exerciseName} today — you got stronger even without a heavier top set. Keep feeding it.`;
  }

  // 2) Volume vs the last time you trained this day type.
  if (prevSameType && prevSameType.totalVolumeKg > 0 && data.totalVolumeKg > 0) {
    const delta = (data.totalVolumeKg - prevSameType.totalVolumeKg) / prevSameType.totalVolumeKg;
    const pct = Math.round(Math.abs(delta) * 100);
    if (pct >= 5 && delta > 0) {
      return `${fmtInt(data.totalVolumeKg)} kg moved — ${pct}% more than your last ${dayLabel}. Recover hard and it'll show.`;
    }
    if (pct >= 5 && delta < 0) {
      return `Solid ${dayLabel}. Volume was ${pct}% down on last time — fine on a heavy or short day; the streak is what matters.`;
    }
    return `Right on pace with your last ${dayLabel} — consistency like this is exactly what compounds into results.`;
  }

  // 3) First time on this day type / no prior volume — recovery + next-focus cue.
  const topMuscle = data.muscles[0]?.muscleGroup;
  if (topMuscle) {
    return `${dayLabel} done — ${data.workingSetCount} working sets, ${cap(topMuscle)} took the brunt. Protein and sleep now; that's where growth happens.`;
  }
  return `${dayLabel} logged — ${data.workingSetCount} sets in the books. Recovery is where the growth actually happens.`;
}

export interface CoachNote {
  text: string;
  source: 'engine' | 'groq';
}

/** The always-shown deterministic note (fetches the prior same-day-type session). */
export async function getSessionCoachNote(data: SessionSummaryData): Promise<CoachNote> {
  // `date_iso < beforeISO` excludes today's just-saved session → the PREVIOUS
  // day we trained this type, which is the honest comparison point. If that read
  // ever fails, still return a note (prev=null) so the coach card ALWAYS shows.
  let prev: SessionDetail | null = null;
  try {
    prev = await getLastSessionOfDayType(data.session.dayType, data.session.dateISO);
  } catch {
    prev = null;
  }
  return { text: buildSessionNote(data, prev), source: 'engine' };
}

/** Compact, grounded fact sheet handed to Groq — only real numbers, no prose. */
function factSheet(data: SessionSummaryData, prevSameType: SessionDetail | null): string {
  const lines: string[] = [
    `Day type: ${dayTypeLabel(data.session.dayType)}`,
    `Total volume: ${fmtInt(data.totalVolumeKg)} kg across ${data.workingSetCount} working sets, ${data.exerciseCount} exercises`,
  ];
  if (data.prs.length > 0) {
    lines.push(
      `PRs today: ${data.prs
        .map((p) => `${p.exerciseName} ${trimNum(p.value)} ${p.kind === 'e1rm' ? 'est-1RM' : 'kg'}`)
        .join('; ')}`,
    );
  }
  const muscles = data.muscles.slice(0, 3).map((m) => m.muscleGroup);
  if (muscles.length > 0) lines.push(`Top muscles: ${muscles.join(', ')}`);
  if (prevSameType && prevSameType.totalVolumeKg > 0) {
    const pct = Math.round(
      ((data.totalVolumeKg - prevSameType.totalVolumeKg) / prevSameType.totalVolumeKg) * 100,
    );
    lines.push(
      `Vs last ${dayTypeLabel(data.session.dayType)}: ${pct >= 0 ? '+' : ''}${pct}% volume (last was ${fmtInt(prevSameType.totalVolumeKg)} kg)`,
    );
  }
  return lines.join('\n');
}

const CLOUD_SYSTEM =
  'You are an experienced, encouraging personal trainer. In ONE sentence of at most 28 words, ' +
  'give the member a specific post-workout note grounded ONLY in the facts provided. Reference at ' +
  'least one real number from the facts. Use kg. No emoji, no lists, no invented data. If the facts ' +
  'are thin, keep it short and motivating.';

/**
 * OPT-IN richer note via Groq. Returns null (no network attempted) unless the
 * user enabled coach notes AND a Groq key is set; returns null on any error so
 * the caller silently keeps the deterministic line.
 */
export async function getCloudCoachNote(data: SessionSummaryData): Promise<string | null> {
  if (!useTrackerPrefs.getState().coachNotes) return null; // opt-in gate — no network
  const key = await getGroqKey();
  if (!key) return null; // no key → stay offline
  try {
    const prevSameType = await getLastSessionOfDayType(data.session.dayType, data.session.dateISO);
    const model = useSettings.getState().ai.groqModel || DEFAULT_GROQ_MODEL;
    const turn = await chatGroq(
      { apiKey: key, model },
      CLOUD_SYSTEM,
      [{ role: 'user', text: `Facts:\n${factSheet(data, prevSameType)}` }],
      [],
    );
    const text = turn.text.trim();
    return text.length > 0 ? text : null;
  } catch {
    return null; // network/API error → deterministic line stands
  }
}
