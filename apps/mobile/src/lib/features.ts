/**
 * Owner decision D4 = A: the AI coach, nutrition and gym sync stay in the code but are
 * hidden from members until their own phase. One switch per feature; flip it to bring
 * the feature back. Every screen that shows one of them asks this file.
 */
export const FEATURES = { coach: false, nutrition: false, gymSync: false } as const;

export type Features = { readonly coach: boolean; readonly nutrition: boolean; readonly gymSync: boolean };

/** Home's parts, top to bottom. Pure so the switch's effect on Home is testable. */
export type HomePart = 'today' | 'streak' | 'nutritionRings' | 'scores' | 'volume' | 'bodyWeight' | 'insight' | 'nextUp';

export function homeParts(f: Features): HomePart[] {
  const parts: HomePart[] = ['today', 'streak'];
  if (f.nutrition) parts.push('nutritionRings');
  // Recovery and strength scores belong to the coach's engine — shown only with it.
  if (f.coach) parts.push('scores');
  parts.push('volume', 'bodyWeight');
  // The insight card and "Next up" row both open the coach.
  if (f.coach) parts.push('insight', 'nextUp');
  return parts;
}

/** Profile's sections that depend on a hidden feature. */
export type ProfilePart = 'aiCoach' | 'voice' | 'language' | 'coachNotes' | 'gymSync';

export function profileParts(f: Features): ProfilePart[] {
  const parts: ProfilePart[] = [];
  // Voice and language only change the coach chat today (findings AI-13, AI-25).
  if (f.coach) parts.push('aiCoach', 'voice', 'language', 'coachNotes');
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
