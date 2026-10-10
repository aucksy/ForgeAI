import { beforeEach, describe, expect, it, vi } from 'vitest';

const read = vi.fn();
vi.mock('@/tracker/services/dashboardPhase2', () => ({ getDashboardDataPhase2: () => read() }));
vi.mock('@/cloud/sync', () => ({ maybeSync: vi.fn() }));

describe('Home summary store (SH-13)', () => {
  beforeEach(() => {
    vi.resetModules();
    read.mockReset();
  });

  it('a failed read sets error instead of leaving Home on a skeleton forever', async () => {
    const { useDashboard } = await import('@/store/dashboardStore');
    read.mockRejectedValueOnce(new Error('database is locked'));
    await useDashboard.getState().refresh();
    expect(useDashboard.getState()).toMatchObject({ data: null, loading: false, error: true });
  });

  it('Try again clears the error and shows the summary once the read works', async () => {
    const { useDashboard } = await import('@/store/dashboardStore');
    read.mockRejectedValueOnce(new Error('x'));
    await useDashboard.getState().refresh();
    const summary = { streakDays: 3 };
    read.mockResolvedValueOnce(summary);
    const p = useDashboard.getState().refresh();
    expect(useDashboard.getState().error).toBe(false); // retry in flight → loading, not error
    await p;
    expect(useDashboard.getState()).toMatchObject({ data: summary, error: false, loading: false });
  });
});
