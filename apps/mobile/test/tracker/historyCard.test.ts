/**
 * Phase 3 packet C — what a History card says (HI-04 display, HI-09, HI-15, HI-19, HI-20). PURE.
 */
import { describe, expect, it } from 'vitest';

import { dateWithYear, relativeDay } from '@/lib/date';
import { historyCardFacts } from '@/tracker/services/historyCard';
import type { HistoryItem } from '@/tracker/services/historyFeed';

const TODAY = '2026-10-10';

function item(o: Partial<HistoryItem> & { names?: [string, number][] } = {}): HistoryItem {
  const start = o.startedAt ?? new Date(2026, 9, 9, 18, 5, 0, 7).getTime();
  const names = o.names ?? [['Bench Press', 3]];
  return {
    id: 'x',
    dateISO: '2026-10-09',
    startedAt: start,
    endedAt: start + 52 * 60_000,
    dayType: 'push',
    notes: null,
    source: 'manual',
    title: null,
    exercises: names.map(([n, k], i) => ({
      exercise: { id: `e${i}`, name: n } as never,
      sets: Array.from({ length: k }, (_, j) => ({ id: `${i}-${j}`, sessionId: 'x', exerciseId: `e${i}`, setNumber: j + 1, weightKg: 50, reps: 8, isWarmup: false })),
      volumeKg: 0,
    })),
    totalVolumeKg: 12480,
    easyWeek: false,
    distanceM: 0,
    timedSec: 0,
    ...o,
  };
}

describe('HI-15 dates carry the year when it isn\'t this year', () => {
  it('"Fri, 9 Oct" this year, "Fri, 9 Oct 2025" last year', () => {
    expect(dateWithYear('2026-10-09', TODAY)).toBe('Fri, 9 Oct');
    expect(dateWithYear('2025-10-10', TODAY)).toBe('Fri, 10 Oct 2025');
  });
});

describe('HI-20 relativeDay never counts backwards', () => {
  it('tomorrow is "Tomorrow", later days are their date', () => {
    expect(relativeDay('2026-10-11', TODAY)).toBe('Tomorrow');
    expect(relativeDay('2026-10-14', TODAY)).toBe('Wed, 14 Oct');
    expect(relativeDay('2026-10-07', TODAY)).toBe('3 days ago');
    expect(relativeDay('2025-10-07', TODAY)).toBe('Tue, 7 Oct 2025');
  });
});

describe('the History card', () => {
  it('name, date + time + length, top 3 exercises, kg lifted', () => {
    const f = historyCardFacts(
      item({ title: 'Push 1', names: [['Fly', 2], ['Bench Press', 4], ['Incline Press', 3], ['Dip', 3], ['Curl', 1]] }),
      { today: TODAY },
    );
    expect(f.title).toBe('Push 1');
    expect(f.when).toBe('Yesterday · 18:05 · 52 min');
    expect(f.top).toBe('Bench Press, Incline Press, Dip · +2 more');
    expect(f.metric).toMatch(/^12,480 kg$/);
  });

  it('a workout with no name of its own shows its day type; an old one shows its year', () => {
    const f = historyCardFacts(item({ dateISO: '2025-10-10', startedAt: new Date(2025, 9, 10, 7, 30, 0, 7).getTime(), endedAt: null }), { today: TODAY });
    expect(f.title).toBe('Push Day');
    expect(f.when).toBe('Fri, 10 Oct 2025 · 07:30');
  });

  it('an imported start (the real moment since audit IM-07) shows the time the member saw', () => {
    const f = historyCardFacts(item({ dateISO: '2026-10-01', startedAt: new Date(2026, 9, 1, 18, 0, 0).getTime(), endedAt: null }), { today: TODAY });
    expect(f.when).toBe('Thu, 1 Oct · 18:00');
  });

  it('HI-09: a run or a plank never says "0 kg"', () => {
    expect(historyCardFacts(item({ totalVolumeKg: 0, distanceM: 5000 }), { today: TODAY }).metric).toBe('5 km');
    expect(historyCardFacts(item({ totalVolumeKg: 0, timedSec: 90 }), { today: TODAY }).metric).toBe('1 min 30 s');
    expect(historyCardFacts(item({ totalVolumeKg: 0 }), { today: TODAY }).metric).toBe('3 sets');
  });

  it('HI-19: an easy-week workout says so', () => {
    expect(historyCardFacts(item({ easyWeek: true }), { today: TODAY }).easyWeek).toBe(true);
  });
});
