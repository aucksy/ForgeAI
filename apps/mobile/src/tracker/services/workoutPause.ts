/**
 * Pausing the workout timer (15 Oct 2026) — PURE.
 *
 * Copies Hevy: in an active workout, tap the duration at the top → "Pause Workout Timer"; tap it
 * again → "Resume Workout Timer". While paused the duration stands still and the screen says
 * "Paused". Source: https://help.hevyapp.com/hc/en-us/articles/34513981310615-How-to-I-adjust-duration-and-pause-a-workout
 *
 * Our choices where Hevy's page says nothing:
 *  - the rest timer is its own clock and keeps running (pausing the WORKOUT does not stop a rest);
 *  - ticking a set while paused resumes the workout at the tick's moment (you are training again).
 *
 * The draft keeps `pausedAt` (the running pause's start, or null), `pausedTotalMs` (the finished
 * pauses added up — the live clock reads this) and `pauses` (the finished pauses themselves). The
 * spans exist for ONE case: Finish's "Ended at 6:42 pm" for a workout left open — a pause taken
 * AFTER that end must not shorten the workout, and only the spans can tell when it happened.
 *
 * How a saved workout keeps the real length: its `ended_at` is `started_at + time trained`
 * (`savedEnd`). The start stays the real moment (it anchors the day, history order, record
 * checks and the shade's "Complete set" match), and every reader of a saved workout — history,
 * the summary, stats, share pictures, Health Connect, the export — already works out the length
 * as `ended_at − started_at`, so none of them needed a change and no new column was added.
 */

/** One finished pause. */
export interface PauseSpan {
  from: number;
  to: number;
}

export interface PauseState {
  /** When the running pause began; null = the timer is running. */
  pausedAt: number | null;
  /** The finished pauses, added up (ms). */
  pausedTotalMs: number;
  /** The finished pauses, oldest first. Absent: only the total is known. */
  pauses?: readonly PauseSpan[];
}

export const NO_PAUSE: { pausedAt: null; pausedTotalMs: 0; pauses: PauseSpan[]; pausedAuto: false } = {
  pausedAt: null,
  pausedTotalMs: 0,
  pauses: [],
  pausedAuto: false,
};

const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

export function isPaused(p: Pick<PauseState, 'pausedAt'>): boolean {
  return p.pausedAt != null;
}

/** Pause at `now`. Already paused: unchanged (the first pause's start stands). */
export function pauseAt(p: PauseState, now: number): PauseState {
  if (p.pausedAt != null || !finite(now)) return p;
  return { pausedAt: now, pausedTotalMs: p.pausedTotalMs, pauses: [...(p.pauses ?? [])] };
}

/**
 * Resume at `now`: the pause becomes a finished span. Not paused: unchanged. A clock that went
 * backwards (now before the pause began) counts the pause as 0, never as negative time.
 */
export function resumeAt(p: PauseState, now: number): PauseState {
  if (p.pausedAt == null || !finite(now)) return p;
  const to = Math.max(p.pausedAt, now);
  const span = { from: p.pausedAt, to };
  return { pausedAt: null, pausedTotalMs: p.pausedTotalMs + (to - p.pausedAt), pauses: [...(p.pauses ?? []), span] };
}

/** Paused time between `startedAt` and `t` (finished pauses and the running one, clipped). */
export function pausedMsUntil(p: PauseState, startedAt: number, t: number): number {
  if (t <= startedAt) return 0;
  let ms = 0;
  let spanned = 0;
  for (const s of p.pauses ?? []) {
    ms += Math.max(0, Math.min(s.to, t) - Math.max(s.from, startedAt));
    spanned += s.to - s.from;
  }
  // Pauses known only by their total (no span kept): counted as before `t`.
  ms += Math.max(0, p.pausedTotalMs - spanned);
  if (p.pausedAt != null) ms += Math.max(0, t - Math.max(p.pausedAt, startedAt));
  return Math.min(ms, t - startedAt);
}

/** Time trained from `startedAt` to `t` — the workout duration, paused time left out. */
export function activeMs(startedAt: number, p: PauseState, t: number): number {
  if (!finite(startedAt) || !finite(t)) return 0;
  return Math.max(0, t - startedAt - pausedMsUntil(p, startedAt, t));
}

/** The `ended_at` a workout ending at `end` is saved with: start + the time trained. */
export function savedEnd(startedAt: number, p: PauseState, end: number): number {
  return startedAt + activeMs(startedAt, p, Math.max(startedAt, end));
}

/**
 * A pause read back from a saved draft. Anything that does not make sense (a hand-edited or
 * half-written draft) is dropped — with a [ForgeErr] line, never silently — rather than freeze
 * or rewind the clock. Absent fields (a draft from before pausing existed) = never paused.
 */
export function pauseFromDraft(raw: { pausedAt?: unknown; pausedTotalMs?: unknown; pauses?: unknown }, startedAt: number): PauseState {
  const out: { pausedAt: number | null; pausedTotalMs: number; pauses: PauseSpan[] } = { pausedAt: null, pausedTotalMs: 0, pauses: [] };
  if (raw.pausedAt != null) {
    if (finite(raw.pausedAt) && raw.pausedAt >= startedAt) out.pausedAt = raw.pausedAt;
    else console.warn('[ForgeErr] The saved workout had a pause time that made no sense, so it was dropped; the timer runs.');
  }
  if (Array.isArray(raw.pauses)) {
    for (const s of raw.pauses as unknown[]) {
      const span = s as { from?: unknown; to?: unknown } | null;
      if (span && finite(span.from) && finite(span.to) && span.to >= span.from && span.from >= startedAt) {
        out.pauses.push({ from: span.from, to: span.to });
      } else {
        console.warn('[ForgeErr] A saved pause of this workout made no sense, so it was left out of the duration.');
      }
    }
  }
  const totalOk = finite(raw.pausedTotalMs) && raw.pausedTotalMs >= 0;
  if (raw.pausedTotalMs != null && !totalOk) {
    console.warn('[ForgeErr] The saved workout\'s paused time made no sense; it was worked out again from its pauses.');
  }
  // The spans are the record; the total follows them.
  if (out.pauses.length > 0) {
    out.pausedTotalMs = out.pauses.reduce((n, s) => n + (s.to - s.from), 0);
    return out;
  }
  // No spans but a total: an older shape — keep the total (it all happened before any end).
  if (totalOk && (raw.pausedTotalMs as number) > 0) return { pausedAt: out.pausedAt, pausedTotalMs: raw.pausedTotalMs as number };
  return out;
}

/** "12:05" → spoken as words for a screen reader: "12 minutes 5 seconds" / "1 hour 2 minutes". */
export function spokenDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const part = (n: number, w: string): string => `${n} ${w}${n === 1 ? '' : 's'}`;
  if (h > 0) return m > 0 ? `${part(h, 'hour')} ${part(m, 'minute')}` : part(h, 'hour');
  if (m > 0) return `${part(m, 'minute')} ${part(s, 'second')}`;
  return part(s, 'second');
}

/** The duration control's spoken name (the phone test matches on it). */
export function durationLabel(ms: number, paused: boolean): string {
  return paused
    ? `Workout duration ${spokenDuration(ms)}, paused. Tap to resume.`
    : `Workout duration ${spokenDuration(ms)}. Tap to pause.`;
}

/** The menu's words. */
export const PAUSE_WORDS = {
  sheetTitle: 'Workout timer',
  pause: 'Pause Workout Timer',
  resume: 'Resume Workout Timer',
  badge: 'Paused',
  note: 'Workout paused. Ticking a set resumes it. Rest timers keep running.',
  runningHint: 'Paused time never counts toward the workout. Rest timers keep running.',
} as const;
