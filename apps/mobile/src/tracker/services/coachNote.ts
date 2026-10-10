/**
 * The finish screen's short note — a line of facts under "… done", grounded in the JUST-SAVED
 * workout: an easy week, its records, or its kg lifted against the last workout of its kind.
 *
 * Audit Phase 7: while the coach is hidden (owner decision D4) the note is not a coach. No
 * coach voice, no cheering ("Keep feeding it", "Recover hard and it'll show"), and never food,
 * protein or sleep advice while nutrition is hidden (`noteAllowed`). With nothing worth saying
 * it is null and the screen shows no card.
 *
 * Two layers, offline-first:
 *  - `buildSessionNote` is PURE + deterministic. Zero network, works with no key.
 *  - `getCloudCoachNote` is an OPT-IN richer note via Groq. It short-circuits to null BEFORE
 *    any network unless the coach switch is on, the member enabled it (trackerPrefs.coachNotes)
 *    AND a Groq key is set.
 *
 * No frozen file edited, no schema change. Reuses frozen reads only
 * (`getLastSessionOfDayType`) + the ai module's Groq provider for the opt-in path.
 */
import { DEFAULT_GROQ_MODEL } from '@/ai/models';
import { chatGroq } from '@/ai/providers/groq';
import { FEATURES, type Features } from '@/lib/features';
import { getLastSessionOfDayType } from '@/db/repos/workoutRepo';
import { MUSCLE_LABEL } from '@/tracker/catalog/muscles';
import { getGroqKey } from '@/lib/keys';
import { kgNum } from '@/lib/format';
import { displayUnits, fmtVol, liftedWords, weightUnitOf, type UnitSystem } from '@/lib/units';
import { countWord } from '@/lib/words';
import { useSettings } from '@/store/settingsStore';
import type { SessionDetail } from '@/types/models';

import { RECORD_LABEL } from '../engine/records';
import { dayTypeLabel } from './finishSummary';
import { recordValueText } from './recordText';
import { withVolume } from './volumeService';
import type { SessionSummaryData } from './finishSummary';
import { useTrackerPrefs } from '../store/trackerPrefsStore';

/** Food, drink and sleep words — advice the note may give only with the nutrition switch on. */
const NUTRITION_WORDS = /\b(protein|sleep|slept|eat|eating|ate|food|meal|meals|nutrition|calorie|calories|kcal|carb|carbs|diet|hydrate|hydration|water)\b/i;

/** A note may show: never nutrition or sleep advice while nutrition is hidden. PURE. */
export function noteAllowed(text: string, features: Pick<Features, 'nutrition'> = FEATURES): boolean {
  return features.nutrition || !NUTRITION_WORDS.test(text);
}

/**
 * The kind of workout the comparison is made with, in plain words ("push workout"), or null
 * when the type says nothing about what was trained — a workout started empty is "full" until
 * it is named, so comparing two of those compares a run with a bench session.
 */
function kindWord(dayType: string): string | null {
  switch (dayType) {
    case 'push':
      return 'push workout';
    case 'pull':
      return 'pull workout';
    case 'legs':
      return 'leg workout';
    case 'upper':
      return 'upper-body workout';
    case 'lower':
      return 'lower-body workout';
    default:
      return null;
  }
}

/** "Bench Press", "Bench Press and Squat", "Bench Press, Squat and 2 more lifts". */
function liftList(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  const more = names.length - 2;
  return `${names[0]}, ${names[1]} and ${more} more ${more === 1 ? 'lift' : 'lifts'}`;
}

/**
 * The deterministic note: an easy week > its records > kg lifted against the last workout of
 * the same kind. null when none applies (no card). PURE. `units`: the member's choice — "lb
 * lifted" and pounds under "lb, miles" (review fix: it said "kg lifted" beside a pound total).
 */
export function buildSessionNote(
  data: SessionSummaryData,
  prevSameType: SessionDetail | null,
  units: UnitSystem = displayUnits(),
): string | null {
  // Phase 4: a planned easy week — less is the point, not a dip to explain away.
  if (data.easyWeek) {
    return `Easy week: ${countWord(data.workingSetCount, 'working set')} at your usual weights, lighter on purpose.`;
  }

  // Records, by the one record rule (the same the list below shows), in the workout's order.
  const records = data.records ?? [];
  if (records.length > 0) {
    const lifts: string[] = [];
    for (const r of records) if (!lifts.includes(r.exerciseName)) lifts.push(r.exerciseName);
    if (lifts.length === 1) {
      const r = records[0];
      return `Record on ${r.exerciseName}: ${RECORD_LABEL[r.kind].toLowerCase()} ${recordValueText(r, r.info)}.`;
    }
    return `Records on ${liftList(lifts)}.`;
  }

  // Kg lifted against the last workout of the same kind.
  const kind = kindWord(data.session.dayType);
  if (kind && prevSameType && prevSameType.totalVolumeKg > 0 && data.totalVolumeKg > 0) {
    const delta = (data.totalVolumeKg - prevSameType.totalVolumeKg) / prevSameType.totalVolumeKg;
    const pct = Math.round(Math.abs(delta) * 100);
    const lifted = liftedWords(units);
    const last = fmtVol(prevSameType.totalVolumeKg, units);
    if (pct >= 5 && delta > 0) return `${pct}% more ${lifted} than your last ${kind} (${last}).`;
    if (pct >= 5 && delta < 0) return `${pct}% less ${lifted} than your last ${kind} (${last}).`;
    return `About the same ${lifted} as your last ${kind} (${last}).`;
  }
  return null;
}

export interface CoachNote {
  /** null: nothing worth a card. */
  text: string | null;
  source: 'engine' | 'groq';
}

/** The previous workout of the same day type, its volume counted by the Phase 2 rule (like today's). */
async function lastSameTypeWithVolume(data: SessionSummaryData): Promise<SessionDetail | null> {
  const prev = await getLastSessionOfDayType(data.session.dayType, data.session.dateISO);
  return prev ? (await withVolume([prev]))[0] : null;
}

/** The deterministic note (fetches the prior same-day-type session); text null = no card. */
export async function getSessionCoachNote(data: SessionSummaryData): Promise<CoachNote> {
  // `date_iso < beforeISO` excludes today's just-saved session → the PREVIOUS
  // day we trained this type, which is the honest comparison point. If that read
  // ever fails, the note is worked out without it (prev=null).
  let prev: SessionDetail | null = null;
  try {
    prev = await lastSameTypeWithVolume(data);
  } catch {
    prev = null;
  }
  return { text: buildSessionNote(data, prev), source: 'engine' };
}

/** Compact, grounded fact sheet handed to Groq — only real numbers, no prose. */
function factSheet(data: SessionSummaryData, prevSameType: SessionDetail | null): string {
  const lines: string[] = [
    `Day type: ${dayTypeLabel(data.session.dayType)}`,
    ...(data.easyWeek ? ['This was a planned easy week: half the sets at the usual weights, so less volume is the point.'] : []),
    `Total volume: ${fmtVol(data.totalVolumeKg)} across ${data.workingSetCount} working sets, ${data.exerciseCount} exercises`,
  ];
  if (data.prs.length > 0) {
    lines.push(
      `PRs today: ${data.prs
        .map((p) => `${p.exerciseName} ${kgNum(p.value)} ${p.kind === 'e1rm' ? 'est-1RM' : weightUnitOf()}`)
        .join('; ')}`,
    );
  }
  const others = (data.records ?? []).filter((r) => r.kind !== 'weight' && r.kind !== 'e1rm');
  if (others.length > 0) {
    lines.push(
      `Other records today: ${others
        .map((r) => `${r.exerciseName} ${RECORD_LABEL[r.kind].toLowerCase()} ${recordValueText(r, r.info)}`)
        .join('; ')}`,
    );
  }
  const muscles = data.muscles.slice(0, 3).map((m) => MUSCLE_LABEL[m.muscle].toLowerCase());
  if (muscles.length > 0) lines.push(`Top muscles: ${muscles.join(', ')}`);
  if (prevSameType && prevSameType.totalVolumeKg > 0) {
    const pct = Math.round(
      ((data.totalVolumeKg - prevSameType.totalVolumeKg) / prevSameType.totalVolumeKg) * 100,
    );
    lines.push(
      `Vs last ${dayTypeLabel(data.session.dayType)}: ${pct >= 0 ? '+' : ''}${pct}% volume (last was ${fmtVol(prevSameType.totalVolumeKg)})`,
    );
  }
  return lines.join('\n');
}

const cloudSystem = (): string =>
  'You are an experienced, encouraging personal trainer. In ONE sentence of at most 28 words, ' +
  'give the member a specific post-workout note grounded ONLY in the facts provided. Reference at ' +
  `least one real number from the facts. Use ${weightUnitOf()}. No emoji, no lists, no invented data. If the facts ` +
  `are thin, keep it short. Say "record", never "PR"; say "${liftedWords()}", never "volume".` +
  (FEATURES.nutrition ? '' : ' Never mention food, protein, eating, drinking or sleep.');

/**
 * OPT-IN richer note via Groq. Returns null (no network attempted) unless the
 * user enabled coach notes AND a Groq key is set; returns null on any error so
 * the caller silently keeps the deterministic line.
 */
export async function getCloudCoachNote(data: SessionSummaryData): Promise<string | null> {
  if (!FEATURES.coach) return null; // the coach is hidden (owner decision D4) — no network
  if (!useTrackerPrefs.getState().coachNotes) return null; // opt-in gate — no network
  const key = await getGroqKey();
  if (!key) return null; // no key → stay offline
  try {
    const prevSameType = await lastSameTypeWithVolume(data);
    const model = useSettings.getState().ai.groqModel || DEFAULT_GROQ_MODEL;
    const turn = await chatGroq(
      { apiKey: key, model },
      cloudSystem(),
      [{ role: 'user', text: `Facts:\n${factSheet(data, prevSameType)}` }],
      [],
    );
    const text = turn.text.trim();
    // Nutrition hidden: a reply that strays into food or sleep advice is dropped.
    return text.length > 0 && noteAllowed(text) ? text : null;
  } catch {
    return null; // network/API error → deterministic line stands
  }
}
