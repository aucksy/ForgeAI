import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { DEFAULT_ANTHROPIC_MODEL, DEFAULT_GROQ_MODEL, DEFAULT_OPENAI_MODEL } from '@/ai/models';
import type { AiProviderId, AiSettings, AppLanguage, UnitSystem } from '@/types/models';

/**
 * App settings (persisted to AsyncStorage). API keys are NEVER stored here —
 * they live in SecureStore via @/lib/keys.
 */
export interface SettingsState {
  ai: AiSettings;
  unitSystem: UnitSystem;
  language: AppLanguage;
  setProvider: (provider: AiProviderId) => void;
  setModel: (provider: 'anthropic' | 'openai' | 'groq', model: string) => void;
  setVoiceEnabled: (enabled: boolean) => void;
  setSpeakReplies: (enabled: boolean) => void;
  setUnitSystem: (unitSystem: UnitSystem) => void;
  setLanguage: (language: AppLanguage) => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      ai: {
        provider: 'local',
        anthropicModel: DEFAULT_ANTHROPIC_MODEL,
        openaiModel: DEFAULT_OPENAI_MODEL,
        groqModel: DEFAULT_GROQ_MODEL,
        voiceEnabled: true,
        speakReplies: false,
      },
      unitSystem: 'metric',
      language: 'en',
      setProvider: (provider) => set((s) => ({ ai: { ...s.ai, provider } })),
      setModel: (provider, model) =>
        set((s) => ({
          ai: {
            ...s.ai,
            ...(provider === 'anthropic'
              ? { anthropicModel: model }
              : provider === 'groq'
                ? { groqModel: model }
                : { openaiModel: model }),
          },
        })),
      setVoiceEnabled: (voiceEnabled) => set((s) => ({ ai: { ...s.ai, voiceEnabled } })),
      setSpeakReplies: (speakReplies) => set((s) => ({ ai: { ...s.ai, speakReplies } })),
      setUnitSystem: (unitSystem) => set({ unitSystem }),
      setLanguage: (language) => set({ language }),
    }),
    {
      name: 'forgeai-settings',
      storage: createJSONStorage(() => AsyncStorage),
      // Deep-merge the nested `ai` object so a settings blob persisted before a
      // new field existed (e.g. groqModel) still gets the current default.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<SettingsState>;
        return { ...current, ...p, ai: { ...current.ai, ...(p.ai ?? {}) } };
      },
    },
  ),
);
