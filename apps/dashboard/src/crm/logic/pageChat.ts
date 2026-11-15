/**
 * F208 (R-538, docs/gym-page/PLAN.md section 10): a visitor's chat with the AI helper on the gym's web page, as the
 * owner reads it in Enquiries. The gym server keeps the chat on the enquiry (supabase 0094, data.pageChat); this file
 * reads it safely and says what the owner sees. Shown only while the panel Worker's PAGE_AI is live (pagesOpen.ts
 * usePageAiOn). PURE.
 *
 * The status rule is the same as the gym server's _page_chat_status and the Worker's: asked to join > wants a call >
 * a question the AI did not answer > answered.
 */
import type { Enquiry, EnquiryPageChat, PageChatMessage, PageChatStatus } from '../types';

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const STATES = ['waiting', 'answered', 'unknown', 'failed', 'limit'] as const;

/** What the owner reads for each status (public words for the owner; plain and complete). */
export const CHAT_STATUS_WORDS: Readonly<Record<PageChatStatus, string>> = {
  answered: 'AI answered',
  needs_you: 'Needs you: the AI could not answer',
  wants_call: 'Wants a call',
  join: 'Asked to join',
};

/** The gym server's copy of the first question on the interest line (for older admin apps). */
export const PAGE_CHAT_PREFIXES = ['Chat on your web page', 'Chatted on your web page'] as const;

/** The status from the lines and what the visitor asked for. PURE. */
export function chatStatus(messages: readonly PageChatMessage[], wants: 'call' | 'join' | null): PageChatStatus {
  if (wants === 'join') return 'join';
  if (wants === 'call') return 'wants_call';
  return messages.some((m) => m.from === 'visitor' && m.state !== 'answered') ? 'needs_you' : 'answered';
}

/** The enquiry's web page chat, or null (any other enquiry, or a damaged one). PURE. */
export function pageChatOf(e: Pick<Enquiry, 'pageChat'> | null | undefined): EnquiryPageChat | null {
  const x = e?.pageChat as unknown;
  if (!isObj(x)) return null;
  const messages: PageChatMessage[] = (Array.isArray(x.messages) ? x.messages : [])
    .filter((m): m is Record<string, unknown> => isObj(m) && (m.from === 'visitor' || m.from === 'ai') && typeof m.text === 'string' && m.text.trim() !== '')
    .slice(-60)
    .map((m) => ({
      id: typeof m.id === 'string' ? m.id : '',
      from: m.from as 'visitor' | 'ai',
      text: (m.text as string).trim().slice(0, 600),
      at: typeof m.at === 'number' && Number.isFinite(m.at) ? m.at : 0,
      ...(m.from === 'visitor' ? { state: (STATES as readonly string[]).includes(m.state as string) ? (m.state as PageChatMessage['state']) : 'waiting' } : {}),
    }));
  const cleared = x.cleared === true;
  if (!messages.length && !cleared) return null;
  const wants = x.wants === 'join' || x.wants === 'call' ? x.wants : null;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
  // After the 90-day clean-up the lines are gone: the status the server kept is the only record.
  const kept = ['answered', 'needs_you', 'wants_call', 'join'].includes(x.status as string) ? (x.status as PageChatStatus) : 'answered';
  return {
    v: 1,
    messages,
    status: cleared && !messages.length ? (wants ? chatStatus([], wants) : kept) : chatStatus(messages, wants),
    wants,
    startedAt: num(x.startedAt),
    lastAt: num(x.lastAt),
    needAt: num(x.needAt),
    doneAt: num(x.doneAt),
    cleared,
  };
}

/** Does the owner still need to act? Not for "AI answered", nor after "Mark as done" (until something newer comes). PURE. */
export function chatNeedsOwner(chat: EnquiryPageChat | null): boolean {
  if (!chat || chat.status === 'answered') return false;
  if (chat.doneAt === undefined) return true;
  return (chat.needAt ?? 0) > chat.doneAt;
}

/**
 * The list order with web page chats: the chats that need the owner ("Needs you", "Wants a call", "Asked to join")
 * first, the newest need on top; everything else as before (a stable sort keeps filterEnquiries' calling order). PURE.
 */
export function chatsNeedingOwnerFirst(rows: readonly Enquiry[]): Enquiry[] {
  return rows
    .map((e, i) => {
      const chat = pageChatOf(e);
      const top = chatNeedsOwner(chat);
      return { e, i, top: top ? 0 : 1, need: top ? chat?.needAt ?? 0 : 0 };
    })
    .sort((a, b) => a.top - b.top || b.need - a.need || a.i - b.i)
    .map((x) => x.e);
}

/** A line's small note for the owner, or null (a plain answered question, or the AI's own line). PURE. */
export function chatLineNote(m: PageChatMessage): string | null {
  if (m.from !== 'visitor') return null;
  switch (m.state) {
    case 'unknown':
      return 'The AI could not answer this from your page.';
    case 'limit':
      return 'Not sent to the AI: a daily limit or no AI credits left.';
    case 'failed':
    case 'waiting':
      return 'The AI did not answer this.';
    default:
      return null;
  }
}

/** The patch for "Mark as done": the chat stays, it stops being on top until the visitor needs the owner again. PURE. */
export function markChatDone(e: Pick<Enquiry, 'pageChat'>, nowMs: number): EnquiryPageChat | null {
  // The server's whole block, as it is, plus doneAt (fields this app does not read are kept).
  return isObj(e.pageChat) ? ({ ...(e.pageChat as EnquiryPageChat), doneAt: nowMs } as EnquiryPageChat) : null;
}

/** The enquiry has no number yet (a visitor who only chatted). PURE. */
export function noNumber(e: Pick<Enquiry, 'phone'>): boolean {
  return (e.phone ?? '').replace(/\D/g, '') === '';
}
