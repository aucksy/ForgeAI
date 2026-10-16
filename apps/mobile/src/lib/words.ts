/**
 * A number with its word, never "1 sets" (v0.25.1: one helper for every count a member
 * reads — screens, share pictures, the coach's replies). PURE.
 *
 *   countWord(1, 'set')            → "1 set"
 *   countWord(3, 'set')            → "3 sets"
 *   countWord(2, 'exercise')       → "2 exercises"
 *   countWord(1240, 'set', fmtInt) → "1,240 sets"
 */
export function countWord(n: number, singular: string, fmt: (n: number) => string = String, plural = `${singular}s`): string {
  return `${fmt(n)} ${n === 1 ? singular : plural}`;
}

/**
 * Words a member must never read (docs/DESIGN-LANGUAGE.md, "Words: one word per idea"): say
 * "workout", "record", "kg lifted", "best single (estimate)". The guard test
 * (test/lib/memberWords.test.ts) checks every screen with this list, and the AI note is dropped
 * when the model's reply uses one of them (audit C9-6). PURE.
 */
export const BANNED_MEMBER_WORDS: readonly { word: string; re: RegExp }[] = [
  { word: 'session', re: /\bsessions?\b/i },
  // C9-5: any case ("PR", "pr", "Pb").
  { word: 'PR', re: /\bp[rb]s?\b/i },
  // Training "volume". The phone's sound ("at notification volume", "alarm volume") is fine.
  { word: 'volume', re: /(?<!\b(?:notification|alarm|ring|ringer|media|sound|phone|call)\s)\bvolumes?\b/i },
  { word: 'kg moved', re: /\b(kg|lbs?)\s+moved\b/i },
  { word: 'vol', re: /\bvol\b/i },
  // C9-5: "1RM" / "e1RM" / "est-1RM" (say "best single (estimate)").
  { word: 'e1RM', re: /\b(e|est-?)?1RM\b/i },
];

/** Does this text use a word a member must never read? PURE. */
export function usesBannedWord(text: string): boolean {
  return BANNED_MEMBER_WORDS.some((b) => b.re.test(text));
}
