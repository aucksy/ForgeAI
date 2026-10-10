import { describe, expect, it } from 'vitest';

import { historyView } from '@/tracker/lib/historyView';

const base = { status: 'ready' as const, itemCount: 30, total: 120, searching: false, listShown: true };

describe("History tab's body (the search box never goes away mid-search)", () => {
  it('first read: placeholders, then the list', () => {
    expect(historyView({ ...base, status: 'loading', itemCount: 0, total: 0, listShown: false })).toBe('skeleton');
    expect(historyView({ ...base, listShown: false })).toBe('list');
  });

  it('first read failed: the full-page error, never "No workouts yet" (HI-11)', () => {
    expect(historyView({ ...base, status: 'error', itemCount: 0, total: 0, listShown: false })).toBe('error');
  });

  it('nothing logged: "No workouts yet"', () => {
    expect(historyView({ ...base, itemCount: 0, total: 0, listShown: false })).toBe('empty');
  });

  // Device QA run 38081757903, part N: "legs" matched nothing, then "legs old" was read with the
  // placeholders in place of the list — the box went with it and the keyboard closed mid-word.
  it('a search read after one that matched nothing keeps the list and its box', () => {
    expect(historyView({ ...base, status: 'loading', itemCount: 0, searching: true })).toBe('list');
    expect(historyView({ ...base, status: 'loading', itemCount: 0, searching: true, listShown: false })).toBe('list');
  });

  it('a search that failed keeps the box (the error shows under it)', () => {
    expect(historyView({ ...base, status: 'error', itemCount: 0, searching: true })).toBe('list');
  });

  it('a search that matches nothing is still the list ("No workouts match …")', () => {
    expect(historyView({ ...base, itemCount: 0, searching: true })).toBe('list');
  });

  it('clearing a search that matched nothing keeps the box while the full list is read again', () => {
    expect(historyView({ ...base, status: 'loading', itemCount: 0 })).toBe('list');
    expect(historyView({ ...base, status: 'error', itemCount: 0 })).toBe('list');
  });

  it('every workout erased after the list was shown: "No workouts yet" once the read answers', () => {
    expect(historyView({ ...base, status: 'loading', itemCount: 0, total: 0 })).toBe('list');
    expect(historyView({ ...base, itemCount: 0, total: 0 })).toBe('empty');
  });
});
