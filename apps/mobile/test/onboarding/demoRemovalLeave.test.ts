/**
 * Silent-failure audit H1 (14 Oct 2026): "Remove demo data" leaves Settings only after the demo
 * is gone. Before, it left first, so a failure was reported to a screen nobody was on.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  removeError: null as Error | null,
  status: 'ready' as string,
  calls: [] as string[],
}));

vi.mock('@/components/ui', () => ({ askConfirm: async () => true }));
vi.mock('@/store/chatStore', () => ({ useChat: { getState: () => ({ load: async () => undefined }) } }));
vi.mock('@/store/dashboardStore', () => ({ useDashboard: { getState: () => ({ refresh: async () => undefined }) } }));
vi.mock('@/onboarding/db/dataActions', () => ({
  countOwnWorkouts: async () => 0,
  removeDemoData: async () => {
    h.calls.push('remove');
    if (h.removeError) throw h.removeError;
    return { removed: true, keptWorkouts: 0 };
  },
}));
vi.mock('@/onboarding/store/onboardingStore', () => ({
  LEAVE_SETTLE_MS: 0,
  useOnboarding: {
    getState: () => ({ refreshDemoFlag: async () => undefined }),
    setState: (p: { status?: string }) => {
      if (p.status) {
        h.calls.push(`status:${p.status}`);
        h.status = p.status;
      }
    },
  },
}));

import { confirmAndRemoveDemo } from '@/onboarding/demoRemoval';

beforeEach(() => {
  h.removeError = null;
  h.status = 'ready';
  h.calls.length = 0;
});

describe('confirmAndRemoveDemo', () => {
  it('leaves the screen after the removal and before the welcome screen', async () => {
    const ok = await confirmAndRemoveDemo(() => h.calls.push('leave'));
    expect(ok).toBe(true);
    expect(h.calls).toEqual(['remove', 'leave', 'status:welcome']);
  });

  it('a failed removal throws and never leaves the screen', async () => {
    h.removeError = new Error('database is locked');
    const leave = vi.fn();
    await expect(confirmAndRemoveDemo(leave)).rejects.toThrow('database is locked');
    expect(leave).not.toHaveBeenCalled();
    expect(h.status).toBe('ready');
  });
});
