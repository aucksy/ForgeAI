/**
 * F201 review (13 Nov 2026): what ONE task did, in a few words, for History and the credits list. One request can
 * make two tasks (a message and an expense); both carry the same request words, so each needs its own job line
 * ("Message: Gym closed tomorrow", "Expense ₹3,200"). Read from the task's saved actions (owner_ai_tasks). PURE.
 */
import { line, type Line } from './catalogue';
import { CARD_TITLE } from './conversation';

export function jobLine(actions: unknown): Line | null {
  const first = Array.isArray(actions) ? (actions[0] as { tool?: unknown; input?: unknown } | undefined) : undefined;
  if (!first || typeof first.tool !== 'string') return null;
  const input = (first.input && typeof first.input === 'object' ? first.input : {}) as Record<string, unknown>;
  if (first.tool === 'draft_message') {
    const title = String(input.title_en || input.title_hi || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 60);
    return title ? line('Message: {title}', { title }) : line(CARD_TITLE.draft_message);
  }
  if (first.tool === 'add_expense') {
    const amount = Number(input.amount);
    return Number.isFinite(amount) && amount > 0 ? line('Expense {amount}', { amount: `₹${Math.round(amount).toLocaleString('en-IN')}` }) : line(CARD_TITLE.add_expense);
  }
  const title = (CARD_TITLE as Record<string, string | undefined>)[first.tool];
  return title ? line(title) : null;
}
