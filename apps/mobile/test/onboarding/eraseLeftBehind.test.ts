/**
 * Silent-failure audit H1 (14 Oct 2026): Erase all data says what it could not clear.
 *  - every failed step is logged and its name returned (it reached nobody before);
 *  - the AI-keys step fails when a key stays (it used allSettled, so it never failed);
 *  - the message names what is still on the phone, in plain words.
 */
import { describe, expect, it, vi } from 'vitest';

const keys = vi.hoisted(() => ({ groqFails: true }));
vi.mock('@/lib/keys', () => ({
  setOpenAiKey: async () => undefined,
  setAnthropicKey: async () => undefined,
  setGroqKey: async () => {
    if (keys.groqFails) throw new Error('keystore locked');
  },
}));

import { eraseDeviceData, eraseLeftBehindText, eraseStepWords, runEraseSteps } from '@/onboarding/eraseDevice';

describe('runEraseSteps', () => {
  it('logs each failed step with the ForgeErr tag, and nothing when all pass', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(await runEraseSteps([{ name: 'ok', run: async () => undefined }])).toEqual([]);
    expect(warn).not.toHaveBeenCalled();
    const failed = await runEraseSteps([
      { name: 'ai-keys', run: async () => Promise.reject(new Error('x')) },
      { name: 'ok', run: async () => undefined },
    ]);
    expect(failed).toEqual(['ai-keys']);
    expect(String(warn.mock.calls[0][0])).toMatch(/^\[ForgeErr\] erase step "ai-keys" failed/);
    warn.mockRestore();
  });
});

describe('the AI-keys step', () => {
  it('fails when one key stays behind (before: allSettled hid it)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    keys.groqFails = true;
    expect(await eraseDeviceData()).toContain('ai-keys');
    keys.groqFails = false;
    expect(await eraseDeviceData()).not.toContain('ai-keys');
    warn.mockRestore();
  });
});

describe('eraseLeftBehindText', () => {
  it('names one thing left behind', () => {
    expect(eraseLeftBehindText(['ai-keys'])).toBe('Your workouts were erased, but not your AI keys. Tap Erase all data to try again.');
  });
  it('names several, joined in plain English', () => {
    expect(eraseLeftBehindText(['ai-keys', 'drive-link', 'gym-link'])).toBe(
      'Your workouts were erased, but not your AI keys, Google Drive link and gym sign-in. Tap Erase all data to try again.',
    );
  });
  it('an unknown step keeps its own name', () => {
    expect(eraseStepWords('something-new')).toBe('something-new');
  });
});
