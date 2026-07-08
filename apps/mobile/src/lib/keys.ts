import * as SecureStore from 'expo-secure-store';

/**
 * API keys live ONLY in SecureStore (hardware-backed on Android).
 * Never persist them in zustand/AsyncStorage/SQLite or log them.
 */

const OPENAI_KEY = 'forgeai.openai_api_key';
const ANTHROPIC_KEY = 'forgeai.anthropic_api_key';

export async function getOpenAiKey(): Promise<string | null> {
  return SecureStore.getItemAsync(OPENAI_KEY);
}

export async function setOpenAiKey(value: string): Promise<void> {
  if (!value.trim()) return SecureStore.deleteItemAsync(OPENAI_KEY);
  await SecureStore.setItemAsync(OPENAI_KEY, value.trim());
}

export async function getAnthropicKey(): Promise<string | null> {
  return SecureStore.getItemAsync(ANTHROPIC_KEY);
}

export async function setAnthropicKey(value: string): Promise<void> {
  if (!value.trim()) return SecureStore.deleteItemAsync(ANTHROPIC_KEY);
  await SecureStore.setItemAsync(ANTHROPIC_KEY, value.trim());
}

/** Masked preview for Settings, e.g. "sk-…k3Fq". */
export function maskKey(key: string | null): string {
  if (!key) return 'Not set';
  if (key.length <= 8) return '••••';
  return `${key.slice(0, 3)}…${key.slice(-4)}`;
}
