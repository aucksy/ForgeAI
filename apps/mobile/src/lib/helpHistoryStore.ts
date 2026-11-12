/**
 * "Your questions" (R-319 item 10, R-320): the list kept on this phone, and the ask to the help box for
 * answers that came late and the MettleUp team's replies. Rules: helpHistory.ts (PURE).
 *
 * R-452: the app also asks when it opens and when it comes back to the front (checkHelpReplies, one request
 * with the secrets of the questions from the last 30 days, at most once a minute), so a reply reaches the red
 * dot on the round button even when the member never opens Settings; a new reply also gets a pop-up on the
 * phone (helpReplyAlert.ts, only when notifications are already allowed).
 */
import { create } from 'zustand';

import { getMeta, setMeta } from '@/db';
import { enqueueWrite } from '@/db/writeQueue';
import { fetchWithTimeout } from '@/lib/fetchTimeout';

import {
  addQuestion,
  keysToAsk,
  markRepliesSeen,
  mergeServer,
  OPEN_MS,
  parseHistory,
  qaStandInQuestion,
  rateQuestion,
  repliesToTell,
  serverItemsFrom,
  settleQuestion,
  type HelpQuestion,
} from './helpHistory';

const HISTORY_KEY = 'help_questions';
export const HELP_REPLIES_URL = 'https://app.mettleup.fit/api/help/replies';

interface HelpHistoryState {
  loaded: boolean;
  items: HelpQuestion[];
  load: () => Promise<void>;
  add: (key: string, text: string, pushed?: boolean) => Promise<void>;
  settle: (key: string, result: { id: number | null; answer: string; ai: boolean; covered?: boolean } | null) => Promise<void>;
  rate: (id: number, helped: 'yes' | 'no') => Promise<void>;
  /**
   * Ask the help box for late answers and replies. `since`: only questions sent from then on (0 = all).
   * False when it could not be asked (logged).
   */
  refresh: (sender: string, since?: number) => Promise<boolean>;
  /** The replies of these questions (all when left out) were on screen. */
  markSeen: (keys?: readonly string[]) => Promise<void>;
  /** How many new replies a pop-up should tell about now; they count as told. */
  takeToTell: () => Promise<number>;
  /** QA builds only: a made-up question with two unread team replies (helpHistory.ts qaStandInQuestion). */
  qaAddStandIn: () => Promise<void>;
  /** "Erase all data": the list is forgotten here too (the database row went with the erase). */
  forget: () => void;
}

let loading: Promise<void> | null = null;
/** The saved list could not be read: nothing is written over it until a read works (R-452 review). */
let readFailed = false;

export const useHelpHistory = create<HelpHistoryState>((set, get) => {
  const save = async (items: HelpQuestion[]): Promise<void> => {
    set({ items });
    if (readFailed) {
      // Before R-452 a failed read left an empty list that the next question saved over every kept question.
      loading = null;
      await get().load();
      if (readFailed) {
        console.warn('[help] your questions are not saved: the kept list could not be read');
        return;
      }
    }
    try {
      await enqueueWrite(() => setMeta(HISTORY_KEY, JSON.stringify(get().items)));
    } catch (e) {
      console.warn('[help] could not keep your questions on this phone', e);
    }
  };
  const ready = async (): Promise<void> => {
    if (!get().loaded) await get().load();
  };
  return {
    loaded: false,
    items: [],
    load: () => {
      loading ??= (async () => {
        try {
          const kept = parseHistory(await getMeta(HISTORY_KEY));
          readFailed = false;
          // Questions added while the read was failing stay on top.
          const extra = get().items.filter((q) => !kept.some((k) => k.key === q.key));
          set({ items: [...extra, ...kept], loaded: true });
        } catch (e) {
          console.warn('[help] could not read your questions on this phone', e);
          readFailed = true;
          set({ loaded: true });
        }
      })();
      return loading;
    },
    add: async (key, text, pushed = false) => {
      await ready();
      await save(addQuestion(get().items, key, text, Date.now(), pushed));
    },
    settle: async (key, result) => {
      await ready();
      await save(settleQuestion(get().items, key, result));
    },
    rate: async (id, helped) => {
      await ready();
      await save(rateQuestion(get().items, id, helped));
    },
    refresh: async (sender, since = 0) => {
      await ready();
      const keys = keysToAsk(get().items, since);
      if (!sender || keys.length === 0) return true;
      try {
        const res = await fetchWithTimeout(HELP_REPLIES_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sender, keys }),
        });
        if (res.status === 404) return true; // an older help box without replies: nothing to merge
        if (res.status !== 200) {
          console.warn('[help] replies answered', res.status);
          return false;
        }
        const items = serverItemsFrom((await res.json()) as unknown);
        if (items.length) {
          const next = mergeServer(get().items, items);
          if (next.some((q, i) => q !== get().items[i])) await save(next);
        }
        return true;
      } catch (e) {
        console.warn('[help] could not ask for replies', e);
        return false;
      }
    },
    markSeen: async (keys) => {
      await ready();
      const next = markRepliesSeen(get().items, keys);
      if (next.some((q, i) => q !== get().items[i])) await save(next);
    },
    takeToTell: async () => {
      await ready();
      const { count, list } = repliesToTell(get().items);
      if (list.some((q, i) => q !== get().items[i])) await save(list);
      return count;
    },
    qaAddStandIn: async () => {
      await ready();
      const q = qaStandInQuestion(Date.now());
      await save([q, ...get().items.filter((x) => !x.key.startsWith('qa-stand-in-'))]);
    },
    forget: () => {
      loading = null;
      readFailed = false;
      set({ items: [], loaded: false });
    },
  };
});

/** The last time the app asked by itself (opened, back in front, the slow check while open). */
let lastAsk = 0;
/** At most one ask a minute when the app keeps coming back to the front. */
export const ASK_GAP_MS = 60_000;

/**
 * R-452: ask the help box about the questions from the last 30 days, then pop up the new replies (Android,
 * notifications already allowed). One request; nothing at all when this phone never asked anything.
 * Never throws. `force` skips the once-a-minute limit (tests). -> how many new replies arrived.
 */
export async function checkHelpReplies(
  deps: { sender: () => Promise<string>; alert: (count: number) => Promise<void>; now?: () => number },
  force = false,
): Promise<number> {
  const now = (deps.now ?? Date.now)();
  if (!force && now - lastAsk < ASK_GAP_MS) return 0;
  lastAsk = now;
  try {
    const store = useHelpHistory.getState();
    await store.load();
    if (keysToAsk(useHelpHistory.getState().items, now - OPEN_MS).length === 0) return 0;
    await store.refresh(await deps.sender(), now - OPEN_MS);
    const count = await useHelpHistory.getState().takeToTell();
    if (count > 0) await deps.alert(count);
    return count;
  } catch (e) {
    console.warn('[help] the reply check failed', e);
    return 0;
  }
}

/** Tests only: forget when the app last asked. */
export function resetHelpCheckForTest(): void {
  lastAsk = 0;
}
