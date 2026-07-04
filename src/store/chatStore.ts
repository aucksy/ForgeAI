import { create } from 'zustand';

import { sendToCoach } from '@/ai/orchestrator';
import * as chatRepo from '@/db/repos/chatRepo';
import { uuid } from '@/lib/uuid';
import type { ChatMessage } from '@/types/models';

export interface ChatState {
  messages: ChatMessage[];
  sending: boolean;
  loaded: boolean;
  load: () => Promise<void>;
  send: (text: string, imageUri?: string | null) => Promise<void>;
  clear: () => Promise<void>;
}

export const useChat = create<ChatState>()((set, get) => ({
  messages: [],
  sending: false,
  loaded: false,

  load: async () => {
    try {
      const messages = await chatRepo.getMessages(200);
      set({ messages, loaded: true });
    } catch {
      set({ loaded: true });
    }
  },

  send: async (text, imageUri) => {
    const trimmed = text.trim();
    if ((!trimmed && !imageUri) || get().sending) return;
    const now = Date.now();
    // Optimistic user bubble + pending coach placeholder, replaced by the
    // persisted messages once sendToCoach resolves (it never throws).
    const optimisticUser: ChatMessage = {
      id: `local-user-${uuid()}`,
      role: 'user',
      kind: 'text',
      text: trimmed,
      payload: null,
      createdAt: now,
      imageUri: imageUri ?? null,
    };
    const pendingCoach: ChatMessage = {
      id: `local-pending-${uuid()}`,
      role: 'coach',
      kind: 'text',
      text: '',
      payload: null,
      createdAt: now + 1,
      pending: true,
    };
    set((s) => ({ sending: true, messages: [...s.messages, optimisticUser, pendingCoach] }));

    try {
      const persisted = await sendToCoach(trimmed, imageUri ?? null);
      set((s) => ({
        sending: false,
        messages: [
          ...s.messages.filter((m) => m.id !== optimisticUser.id && m.id !== pendingCoach.id),
          ...persisted,
        ],
      }));
    } catch {
      // Belt & braces: surface as an error bubble, never throw to the UI.
      const errorMsg: ChatMessage = {
        id: `local-error-${uuid()}`,
        role: 'coach',
        kind: 'error',
        text: 'Something went wrong — please try again.',
        payload: null,
        createdAt: Date.now(),
      };
      set((s) => ({
        sending: false,
        messages: [...s.messages.filter((m) => m.id !== pendingCoach.id), errorMsg],
      }));
    }
  },

  clear: async () => {
    try {
      await chatRepo.clearHistory();
    } finally {
      set({ messages: [] });
    }
  },
}));
