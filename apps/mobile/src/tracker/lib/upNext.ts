/**
 * Redesign R1 — the "Up next" card at the top of the Workout tab (PLAN §2 item 2). PURE.
 *
 * Home is gone; its answer card lives here now. It reads the ONE Today answer
 * (`plans/todayPlan` via `services/todayService`, the same the widgets, reminders, app-icon
 * shortcuts and every Start button read) and adds no rule of its own. First that holds wins:
 *  - a workout is open → "Workout in progress · Pull 1 · 3 sets done" with Resume / Discard
 *    (an edit of a saved workout: "Editing a workout" with Resume editing / Discard changes);
 *  - the routine was done today → "Done today: Push 1 ✓", "Next: Pull 1", Start Pull 1;
 *  - a routine is up next → "Up next: Pull 1", "from Push Pull Legs · 6 exercises · Lat
 *    Pulldown first", Start and See exercises;
 *  - routines with no exercises yet → the shared words and Open your routines;
 *  - no routines at all → no card (Start empty workout sits right below).
 * With a weekly goal set: "This week: 2 of 4 workouts". On an empty app (no workout ever, no
 * demo, nothing open) the import offer shows ("Moving from Hevy or Strong?").
 */
import { countWord } from '@/lib/words';

export type UpNextAction = 'resume' | 'discard' | 'start' | 'preview' | 'routines';

export interface UpNextButton {
  label: string;
  action: UpNextAction;
}

export type UpNextKind = 'continue' | 'editing' | 'next' | 'doneToday' | 'emptyPlan' | 'none';

export interface UpNextToday {
  status: 'next' | 'doneToday' | 'noPlan' | 'emptyPlan';
  /** The routine Start starts. */
  nextId: string | null;
  nextName: string | null;
  /** Its exercises: how many, and the first one's name. */
  nextCount: number;
  nextFirst: string | null;
  /** The workout done today ('doneToday'). */
  doneName: string | null;
  /** The folder the answer comes from. */
  folderName: string | null;
  /** The shared words (title / line) for 'emptyPlan'. */
  title: string;
  line: string;
}

export interface UpNextInput {
  /** The shared answer; null while it loads or when the read failed. */
  today: UpNextToday | null;
  /** A live workout (not an edit, not a past log being typed): its name and counts line. */
  open: { name: string | null; countsLine: string } | null;
  /** An edit of a saved workout is open. */
  editing: boolean;
  /** The member's own workouts-a-week goal, or null. */
  weeklyGoal: number | null;
  /** Workouts since Monday, or null when unknown. */
  doneThisWeek: number | null;
  /** Any workout ever saved (null = not known yet). */
  hasWorkouts: boolean | null;
  demo: boolean;
}

export interface UpNextCard {
  kind: UpNextKind;
  title: string;
  /** The grey line under the title ('' = none). */
  line: string;
  /** "This week: 2 of 4 workouts" — only with a goal, only on a routine card. */
  goalLine: string | null;
  /** A ✓ beside the title (done today). */
  done: boolean;
  primary: UpNextButton | null;
  secondary: UpNextButton | null;
  /** The red "Discard …" link under the card (open workout only). */
  discard: UpNextButton | null;
  /** What a screen reader says for the card's text. */
  label: string;
}

/** "This week: 2 of 4 workouts", or null without a goal. PURE. */
export function goalLine(goal: number | null, done: number | null): string | null {
  if (goal == null || goal < 1 || done == null) return null;
  return `This week: ${done} of ${countWord(goal, 'workout')}`;
}

/** "from Push Pull Legs · 6 exercises · Lat Pulldown first". PURE. */
export function routineLine(t: Pick<UpNextToday, 'folderName' | 'nextCount' | 'nextFirst'>): string {
  const parts: string[] = [];
  if (t.folderName) parts.push(`from ${t.folderName}`);
  if (t.nextCount > 0) parts.push(countWord(t.nextCount, 'exercise'));
  if (t.nextFirst) parts.push(`${t.nextFirst} first`);
  return parts.join(' · ');
}

function card(c: Omit<UpNextCard, 'label'>): UpNextCard {
  const said = [c.title, c.line, c.goalLine].filter((x): x is string => !!x).join('. ');
  return { ...c, label: c.done ? `${said}. Done` : said };
}

/** The Up next card. PURE. */
export function upNextCard(i: UpNextInput): UpNextCard {
  if (i.editing) {
    return card({
      kind: 'editing',
      title: 'Editing a workout',
      line: 'You have unsaved changes to a saved workout.',
      goalLine: null,
      done: false,
      primary: { label: 'Resume editing', action: 'resume' },
      secondary: null,
      discard: { label: 'Discard changes', action: 'discard' },
    });
  }
  if (i.open) {
    const line = [i.open.name?.trim() || null, i.open.countsLine].filter((x): x is string => !!x).join(' · ');
    return card({
      kind: 'continue',
      title: 'Workout in progress',
      line,
      goalLine: null,
      done: false,
      primary: { label: 'Resume workout', action: 'resume' },
      secondary: null,
      discard: { label: 'Discard workout', action: 'discard' },
    });
  }
  const t = i.today;
  const goal = goalLine(i.weeklyGoal, i.doneThisWeek);
  if (t?.status === 'doneToday') {
    const done = t.doneName?.trim() || 'Workout';
    return card({
      kind: 'doneToday',
      title: `Done today: ${done}`,
      line: t.nextName ? `Next: ${t.nextName}` : '',
      goalLine: goal,
      done: true,
      primary: t.nextId && t.nextName ? { label: `Start ${t.nextName}`, action: 'start' } : null,
      secondary: t.nextId ? { label: 'See exercises', action: 'preview' } : null,
      discard: null,
    });
  }
  if (t?.status === 'next' && t.nextId && t.nextName) {
    return card({
      kind: 'next',
      title: `Up next: ${t.nextName}`,
      line: routineLine(t),
      goalLine: goal,
      done: false,
      primary: { label: 'Start', action: 'start' },
      secondary: { label: 'See exercises', action: 'preview' },
      discard: null,
    });
  }
  if (t?.status === 'emptyPlan') {
    return card({
      kind: 'emptyPlan',
      title: t.title,
      line: t.line,
      goalLine: null,
      done: false,
      primary: null,
      secondary: { label: 'Open your routines', action: 'routines' },
      discard: null,
    });
  }
  return card({ kind: 'none', title: '', line: '', goalLine: null, done: false, primary: null, secondary: null, discard: null });
}

/** "Moving from Hevy or Strong?" — a truly empty app only: no workout, no demo, nothing open. PURE. */
export function showsImportOffer(i: Pick<UpNextInput, 'hasWorkouts' | 'demo' | 'open' | 'editing'>): boolean {
  return i.hasWorkouts === false && !i.demo && i.open == null && !i.editing;
}
