/**
 * Light grounding smoke-check (Phase C3).
 *
 * The coach persona is told to NEVER invent stored numbers — every figure should
 * come from a tool result (or the member's own profile in the system prompt).
 * This is a cheap, pure verifier for that contract: it extracts "data-like"
 * numbers from the coach's reply and flags any that don't appear in the grounding
 * sources (system prompt + tool outputs). It deliberately ignores single-digit
 * numbers, which are almost always generic programming advice ("3 sets of 8"),
 * not quoted stored data.
 *
 * It is intentionally NON-INTRUSIVE: the orchestrator only logs a warning in
 * __DEV__ — it never rewrites or blocks a user-facing reply (a false positive
 * must not degrade the chat). It exists as a testable seed for a fuller eval
 * harness and as a dev tripwire for hallucinated numbers.
 */

export interface GroundingResult {
  grounded: boolean;
  /** Distinct data-like numbers in the reply not found in any source. */
  ungroundedNumbers: string[];
}

/** Numbers worth checking: decimals (82.5) or integers with 2+ digits (125). */
function dataLikeNumbers(text: string): string[] {
  const matches = text.match(/\d+(?:\.\d+)?/g) ?? [];
  return matches.filter((n) => n.includes('.') || n.replace('.', '').length >= 2);
}

/**
 * @param replyText the coach's final text
 * @param sources   grounding corpus (e.g. [systemPrompt, ...JSON tool results])
 */
export function checkGrounding(replyText: string, sources: string[]): GroundingResult {
  const corpus = sources.join('  ');
  const seen = new Set<string>();
  const ungrounded: string[] = [];
  for (const n of dataLikeNumbers(replyText)) {
    if (seen.has(n)) continue;
    seen.add(n);
    if (!corpus.includes(n)) ungrounded.push(n);
  }
  return { grounded: ungrounded.length === 0, ungroundedNumbers: ungrounded };
}
