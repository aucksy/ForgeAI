/**
 * Owner decision D4 = A: the AI coach, nutrition and gym sync stay in the code but are
 * hidden from members until their own phase. One switch per feature; flip it to bring
 * the feature back. Every screen that shows one of them asks this file.
 */
export const FEATURES = { coach: false, nutrition: false, gymSync: false } as const;

export type Features = { readonly coach: boolean; readonly nutrition: boolean; readonly gymSync: boolean };

/**
 * SH-08: which score tiles can honestly be shown. A strength score needs body weight AND at
 * least one key lift (else it reads "Strength 0" forever); a recovery score needs at least
 * one workout (else day one reads "Recovery 95 · Primed"). A score that can't be worked out
 * is not shown at all. (Both tiles also need the coach switch.)
 */
export function scoreTiles(d: {
  strength: { keyLifts: readonly unknown[] };
  lastWorkout: unknown | null;
}): { strength: boolean; recovery: boolean } {
  return { strength: d.strength.keyLifts.length > 0, recovery: d.lastWorkout != null };
}

/** Profile's sections that depend on a hidden feature. */
export type ProfilePart = 'aiCoach' | 'voice' | 'coachNotes' | 'gymSync';

export function profileParts(f: Features): ProfilePart[] {
  const parts: ProfilePart[] = [];
  // Voice only changes the coach chat today (finding AI-13). Language changed nothing a member
  // could see (AI-25, SH-15), so it is gone from Profile even with the coach on.
  if (f.coach) parts.push('aiCoach', 'voice', 'coachNotes');
  if (f.gymSync) parts.push('gymSync');
  return parts;
}

/** A link into the coach (`forgeai://coach?prompt=…`) only ever fills the message box —
 *  it is never sent (finding SH-01). Returns the text to place there, or null. */
export function linkedDraft(prompt: string | string[] | undefined): string | null {
  const raw = Array.isArray(prompt) ? prompt[0] : prompt;
  if (typeof raw !== 'string') return null;
  const t = raw.trim();
  return t.length > 0 ? t.slice(0, 500) : null;
}
