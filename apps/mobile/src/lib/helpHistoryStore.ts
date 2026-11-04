/**
 * "Your questions" (R-319 item 10, R-320): the list kept on this phone, and the ask to the help box for
 * answers that came late and the MettleUp team's replies. Rules: helpHistory.ts (PURE).
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
  parseHistory,
  rateQuestion,
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
  add: (key: string, text: string) => Promise<void>;
  settle: (key: string, result: { id: number | null; answer: string; ai: boolean; covered?: boolean } | null) => Promise<void>;
  rate: (id: number, helped: 'yes' | 'no') => Promise<void>;
  /** Ask the help box for late answers and replies. False when it could not be asked (logged). */
  refresh: (sender: string) => Promise<boolean>;
  markSeen: () => Promise<void>;
}

let loading: Promise<void> | null = null;

export const useHelpHistory = create<HelpHistoryState>((set, get) => {
  const save = async (items: HelpQuestion[]): Promise<void> => {
    set({ items });
    try {
      await enqueueWrite(() => setMeta(HISTORY_KEY, JSON.stringify(items)));
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
          set({ items: parseHistory(await getMeta(HISTORY_KEY)), loaded: true });
        } catch (e) {
          console.warn('[help] could not read your questions on this phone', e);
          set({ loaded: true });
        }
      })();
      return loading;
    },
    add: async (key, text) => {
      await ready();
      await save(addQuestion(get().items, key, text, Date.now()));
    },
    settle: async (key, result) => {
      await ready();
      await save(settleQuestion(get().items, key, result));
    },
    rate: async (id, helped) => {
      await ready();
      await save(rateQuestion(get().items, id, helped));
    },
    refresh: async (sender) => {
      await ready();
      const keys = keysToAsk(get().items);
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
        if (items.length) await save(mergeServer(get().items, items));
        return true;
      } catch (e) {
        console.warn('[help] could not ask for replies', e);
        return false;
      }
    },
    markSeen: async () => {
      await ready();
      const next = markRepliesSeen(get().items);
      if (next.some((q, i) => q !== get().items[i])) await save(next);
    },
  };
});
