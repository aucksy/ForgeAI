/**
 * Audit Phase 7 (item 5) — a calmer Home: ONE answer card at the top. PURE.
 *
 * The card reads the shared "Today" answer (`plans/todayPlan` via `services/todayService` —
 * the same one the Workout tab, the Today page, the reminders and the widgets read); it adds
 * no rule of its own. Top to bottom, the first that holds wins:
 *  - a workout is open (not an edit of a past one) → "Workout in progress · 3 sets done ·
 *    Continue" (the tap resumes it);
 *  - the plan's routine was done today → "Done today: Push 1 ✓ · Next: Pull 1";
 *  - today's routine is still to do → "Next: Pull 1 · Start" (Start starts it at once);
 *  - a plan with no exercises yet → the shared words, and the routines screen;
 *  - no plan → a calm "Start a workout" card (an empty workout, or pick a program).
 * Under it: this week's numbers (only once there is a workout), and the import offer for a
 * switcher on a truly empty app (never over the demo).
 */
import { scoreTiles, type HomePart } from '@/lib/features';
import { liveCountsLine } from '@/tracker/services/finishCheck';
import type { DraftExercise } from '@/tracker/store/activeWorkoutStore';
import type { TodaySummary } from '@/types/models';

/** What a button on the card does. */
export type HomeAction =
  /** Open the workout that is already running. */
  | 'resume'
  /** Start today's routine now (`nextId`). */
  | 'start'
  /** Start an empty workout. */
  | 'startEmpty'
  /** Open today's routine's preview (its exercises, then Start). */
  | 'preview'
  /** Open the routines screen (ready programs, build a plan, your routines). */
  | 'routines';

export interface HomeButton {
  label: string;
  action: HomeAction;
}

export type HomeAnswerKind = 'continue' | 'doneToday' | 'next' | 'emptyPlan' | 'noPlan';

export interface HomeAnswer {
  kind: HomeAnswerKind;
  /** Small overline above the title (ALL CAPS is applied by the card). */
  overline: string;
  title: string;
  /** The line under the title — facts only; '' = none. */
  line: string;
  /** Show a ✓ beside the title (done today). */
  done: boolean;
  /** The one main button, or null. */
  primary: HomeButton | null;
  /** A quiet text link under it, or null. */
  secondary: HomeButton | null;
  /** What a screen reader says for the card's text. */
  label: string;
}

export interface HomeAnswerInput {
  /** The shared Today answer (absent on an older snapshot shape). */
  today: TodaySummary | null | undefined;
  /** The open workout's exercises, or null when no workout is open (an edit is not "open"). */
  open: readonly DraftExercise[] | null;
}

function answer(a: Omit<HomeAnswer, 'label'>): HomeAnswer {
  return { ...a, label: a.line ? `${a.title}. ${a.line}` : a.title };
}

/** The one answer card. PURE. */
export function homeAnswer({ today, open }: HomeAnswerInput): HomeAnswer {
  if (open) {
    return answer({
      kind: 'continue',
      overline: 'In progress',
      title: 'Workout in progress',
      line: liveCountsLine(open),
      done: false,
      primary: { label: 'Continue', action: 'resume' },
      secondary: null,
    });
  }
  switch (today?.status) {
    case 'doneToday':
      return answer({
        kind: 'doneToday',
        overline: 'Today',
        title: today.title,
        line: today.line,
        done: true,
        primary: null,
        secondary: today.nextId ? { label: 'See what’s next', action: 'preview' } : null,
      });
    case 'next':
      if (today.nextId && today.nextName) {
        return answer({
          kind: 'next',
          overline: 'Today',
          title: `Next: ${today.nextName}`,
          line: today.line,
          done: false,
          primary: { label: 'Start', action: 'start' },
          secondary: { label: 'See exercises', action: 'preview' },
        });
      }
      break;
    case 'emptyPlan':
      return answer({
        kind: 'emptyPlan',
        overline: 'Today',
        title: today.title,
        line: today.line,
        done: false,
        primary: null,
        secondary: { label: 'Open your routines', action: 'routines' },
      });
    default:
      break;
  }
  return answer({
    kind: 'noPlan',
    overline: 'Today',
    title: 'Start a workout',
    line: 'No plan yet',
    done: false,
    primary: { label: 'Start empty workout', action: 'startEmpty' },
    secondary: { label: 'Pick a program', action: 'routines' },
  });
}

/** Which workout counts as "open" for Home: a live one, never an edit or a past log. PURE. */
export function openWorkout(w: {
  active: boolean;
  editingSessionId: string | null;
  pastLog: boolean;
  exercises: readonly DraftExercise[];
}): readonly DraftExercise[] | null {
  return w.active && w.editingSessionId == null && !w.pastLog ? w.exercises : null;
}

export interface HomeBelow {
  /** This week's numbers (the same as Progress) — only once there is a workout. */
  week: boolean;
  /** "Coming from Hevy or Strong?" — a truly empty app only; never over the demo or an open workout. */
  switcher: boolean;
  /** Calorie and protein rings — nutrition switch on AND something logged today. */
  rings: boolean;
  /** Recovery and strength tiles — coach switch on AND at least one can be worked out. */
  scores: boolean;
}

/** What shows under the answer card. PURE. */
export function homeBelow(input: {
  parts: ReadonlySet<HomePart>;
  demo: boolean;
  open: boolean;
  data: {
    lastWorkout: unknown | null;
    caloriesToday: number;
    proteinTodayG: number;
    strength: { keyLifts: readonly unknown[] };
  };
}): HomeBelow {
  const { parts, data } = input;
  const hasWorkouts = data.lastWorkout != null;
  const tiles = scoreTiles(data);
  return {
    week: parts.has('week') && hasWorkouts,
    switcher: !input.demo && !input.open && !hasWorkouts,
    rings: parts.has('nutritionRings') && (data.caloriesToday > 0 || data.proteinTodayG > 0),
    scores: parts.has('scores') && (tiles.strength || tiles.recovery),
  };
}
