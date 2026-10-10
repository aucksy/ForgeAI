/**
 * Audit Phase 7 review: a notice or question asked the moment a sheet closes waits for it to
 * slide away (two Android Modals swapping in one frame can lose the new one). The timing rule.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import {
  noteSheetClosed,
  resetSheetClockForTests,
  SHEET_CLOSE_MS,
  SHEET_RECENT_MS,
  sheetWaitNow,
  waitAfterSheet,
} from '@/components/ui/sheetClock';

beforeEach(() => resetSheetClockForTests());

describe('waitAfterSheet — wait only while a sheet may still be leaving', () => {
  it('a sheet that closed just now, or within the last 300 ms: wait for its slide-out', () => {
    expect(waitAfterSheet(1000, 1000)).toBe(SHEET_CLOSE_MS);
    expect(waitAfterSheet(1000, 1000 + SHEET_RECENT_MS - 1)).toBe(SHEET_CLOSE_MS);
  });

  it('longer ago (or never): show at once', () => {
    expect(waitAfterSheet(1000, 1000 + SHEET_RECENT_MS)).toBe(0);
    expect(waitAfterSheet(Number.NEGATIVE_INFINITY, 5000)).toBe(0);
  });

  it('a close time from the future (clock change) never makes it wait', () => {
    expect(waitAfterSheet(2000, 1000)).toBe(0);
  });

  it('the wait is about the length of the per-screen delay it replaces (≈ 260 ms)', () => {
    expect(SHEET_CLOSE_MS).toBe(260);
    expect(SHEET_RECENT_MS).toBeGreaterThan(SHEET_CLOSE_MS);
  });
});

describe('the shared close time', () => {
  it('nothing closed yet → no wait; a sheet closes → the next question waits; later → none', () => {
    expect(sheetWaitNow(10_000)).toBe(0);
    noteSheetClosed(10_000);
    expect(sheetWaitNow(10_050)).toBe(SHEET_CLOSE_MS);
    expect(sheetWaitNow(10_000 + SHEET_RECENT_MS + 1)).toBe(0);
  });
});
