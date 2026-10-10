import { beforeEach, describe, expect, it, vi } from 'vitest';

const read = vi.fn();
/** Whether the next read has a part that failed (`getDashboardDataPhase2Checked`). */
let partial = false;
vi.mock('@/tracker/services/dashboardPhase2', () => ({
  getDashboardDataPhase2: () => read(),
  getDashboardDataPhase2Checked: async () => ({ data: await read(), partial }),
  homeStamp: async () => 'stamp-1',
}));
vi.mock('@/cloud/sync', () => ({ maybeSync: vi.fn() }));

describe('Home summary store (SH-13)', () => {
  beforeEach(() => {
    vi.resetModules();
    read.mockReset();
    partial = false;
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

  it('audit Phase 8 review: a read with a failed part is never marked as read — the next visit reads again', async () => {
    const { useDashboard } = await import('@/store/dashboardStore');
    read.mockResolvedValue({ streakDays: 3 });
    partial = true;
    await useDashboard.getState().refresh();
    expect(useDashboard.getState()).toMatchObject({ data: { streakDays: 3 }, error: false, stamp: null });
    partial = false;
    // Same stamp (nothing saved), but the part that failed is read again.
    expect(await useDashboard.getState().refreshIfChanged()).toBe(true);
    expect(useDashboard.getState().stamp).toBe('stamp-1');
    // Now whole: the next visit with nothing saved reads nothing.
    expect(await useDashboard.getState().refreshIfChanged()).toBe(false);
    expect(read).toHaveBeenCalledTimes(2);
  });
});
