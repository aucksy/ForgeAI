import { afterEach, describe, expect, it } from 'vitest';

import { askConfirm, answerConfirm, useConfirmStore } from '@/components/ui/confirmStore';
import { foldSummary } from '@/components/ui/foldSummary';
import { UNDO_MIN_MS, undoClock } from '@/components/ui/undoClock';

describe('undo clock (UndoBar)', () => {
  it('never lasts less than 6 s, even when asked for less', () => {
    expect(UNDO_MIN_MS).toBe(6000);
    expect(undoClock.start(0, 2000).remainingMs).toBe(6000);
    expect(undoClock.start(0, 9000).remainingMs).toBe(9000);
    expect(undoClock.start(0).remainingMs).toBe(6000);
  });

  it('counts down while running and expires at the end', () => {
    const c = undoClock.start(1000);
    expect(undoClock.left(c, 4000)).toBe(3000);
    expect(undoClock.left(c, 7000)).toBe(0);
  });

  it('stands still while a finger is on it, then carries on', () => {
    let c = undoClock.start(0);
    c = undoClock.pause(c, 2000); // 4 s left
    expect(undoClock.left(c, 60_000)).toBe(4000); // touched for a minute: nothing lost
    c = undoClock.resume(c, 60_000);
    expect(undoClock.left(c, 63_000)).toBe(1000);
  });

  it('pausing or resuming twice is harmless', () => {
    let c = undoClock.start(0);
    c = undoClock.pause(undoClock.pause(c, 1000), 3000);
    expect(undoClock.left(c, 5000)).toBe(5000);
    c = undoClock.resume(undoClock.resume(c, 5000), 9000);
    expect(undoClock.left(c, 6000)).toBe(4000);
  });
});

describe('fold summary (FoldSection)', () => {
  it('names the count and the way in', () => {
    expect(foldSummary(12, 'set', false)).toBe('12 sets · see them');
    expect(foldSummary(12, 'set', true)).toBe('12 sets · hide them');
    expect(foldSummary(1, 'set', false)).toBe('1 set · see it');
    expect(foldSummary(1, 'set', true)).toBe('1 set · hide it');
  });

  it('takes an irregular plural', () => {
    expect(foldSummary(3, { one: 'entry', other: 'entries' }, false)).toBe('3 entries · see them');
  });

  it('groups big counts the member way', () => {
    expect(foldSummary(1234, 'set', false)).toBe(`${(1234).toLocaleString()} sets · see them`);
  });
});

describe('confirm store (ConfirmSheet)', () => {
  afterEach(() => useConfirmStore.setState({ request: null }));

  it('opens a request and resolves true on confirm', async () => {
    const p = askConfirm({ title: 'Delete this workout?', confirmLabel: 'Delete', destructive: true });
    const req = useConfirmStore.getState().request;
    expect(req?.title).toBe('Delete this workout?');
    answerConfirm(req!.id, true);
    await expect(p).resolves.toBe(true);
    expect(useConfirmStore.getState().request).toBeNull();
  });

  it('resolves false on cancel', async () => {
    const p = askConfirm({ title: 'Leave?', confirmLabel: 'Leave' });
    answerConfirm(useConfirmStore.getState().request!.id, false);
    await expect(p).resolves.toBe(false);
  });

  it('a second question cancels the first, never leaves it hanging', async () => {
    const first = askConfirm({ title: 'One?', confirmLabel: 'Yes' });
    const second = askConfirm({ title: 'Two?', confirmLabel: 'Yes' });
    await expect(first).resolves.toBe(false);
    expect(useConfirmStore.getState().request?.title).toBe('Two?');
    answerConfirm(useConfirmStore.getState().request!.id, true);
    await expect(second).resolves.toBe(true);
  });

  it('a stale answer (double tap) does nothing', async () => {
    const p = askConfirm({ title: 'One?', confirmLabel: 'Yes' });
    const id = useConfirmStore.getState().request!.id;
    answerConfirm(id, true);
    answerConfirm(id, false);
    await expect(p).resolves.toBe(true);
  });
});
