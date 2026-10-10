/**
 * Audit Phase 6 (PH-09): the Today widget's "Start" / "Resume" link,
 * `forgeai://workout/start?routine=<id>&t=<key>`. PURE.
 *
 * Phase 0's rule is that a link only opens a screen. This one may also START a workout, but only
 * when it is the member's own tap on their own widget: the link must carry the widget's key
 * (`widgetToken.ts`), which no other app knows and which is spent by the start. It carries
 * nothing else: no sets, no weights, no text. Only a routine id, used only if a routine with
 * that id exists. It never discards or changes anything:
 *  - a live workout open → Resume it (the routine in the link is ignored; harmless, so no key
 *    is needed);
 *  - a correction of a saved workout or a past log open → the Workout tab (review fix: the
 *    widget said "Start", so it never lands in the correction);
 *  - else a routine that exists → start it with the right key; without it (another app, a
 *    replayed or doubled link) a calm one-tap "Start <routine>?" screen;
 *  - anything else (no id, a malformed one, a routine deleted since) → the Workout tab.
 */

/** Ids ForgeAI makes (uuids and seed ids): letters, digits, '-' and '_'. */
const ID = /^[A-Za-z0-9_-]{1,80}$/;

/** The routine id from the link, or null when it is missing or not an id. */
export function routineParam(raw: string | string[] | undefined): string | null {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return typeof v === 'string' && ID.test(v) ? v : null;
}

/** True only when the link carries the key this phone's widget was given (never when none is kept). */
export function widgetTokenOk(raw: string | string[] | undefined, kept: string): boolean {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return kept.length > 0 && typeof v === 'string' && v === kept;
}

export type WidgetStartAction = 'resume' | 'start' | 'confirm' | 'tab';

export function widgetStartAction(o: {
  routineId: string | null;
  /** A workout is open (live, or a correction / past log). */
  open: boolean;
  /** The open workout is a correction of a saved one or a past log, not a live workout. */
  correcting?: boolean;
  routineExists: boolean;
  /** The link carries the widget's key. */
  tokenOk: boolean;
}): WidgetStartAction {
  if (o.open) return o.correcting ? 'tab' : 'resume';
  if (o.routineId && o.routineExists) return o.tokenOk ? 'start' : 'confirm';
  return 'tab';
}
