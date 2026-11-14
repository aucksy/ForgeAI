/** R-506: the gym's alerts list (logic/gymAlerts.ts, from 0075 owner_alerts). */
import { describe, expect, it } from 'vitest';

import { ALERT_WORDS, alertAge, alertHref, alertNotice, freshAlerts, gymAlertsFrom, latestAlerts, type GymAlert } from '../../src/crm/logic/gymAlerts';

const NOW = Date.UTC(2026, 10, 14, 6, 0, 0);
const MIN = 60_000;

const raw = {
  ok: true,
  alerts: [
    { id: 'a1', kind: 'trainer_question', line: 'Asha asked a trainer a question. Open Questions to reply.', route: '/questions', urgent: false, at: NOW - 5 * MIN },
    { id: 'a2', kind: 'member_complaint', line: ' Ravi sent your gym a complaint. Open Member messages to read it. ', route: '/member-messages', urgent: true, at: NOW - 2 * MIN },
    { id: 'a3', kind: 'shop_order', line: 'New shop order 12 from Neha. Get it ready on Shop.', route: 'javascript:alert(1)', urgent: true, at: NOW - 30 * 60 * MIN },
    { id: 'bad1', kind: 'not_a_kind', line: 'x', route: '/', at: NOW },
    { id: 'bad2', kind: 'shop_order', line: '   ', route: '/', at: NOW },
    { id: 'bad3', kind: 'shop_order', line: 'Fine words', route: '/', at: 'soon' },
    { kind: 'shop_order', line: 'No id', route: '/', at: NOW },
    'not an object',
  ],
};

describe('gym alerts', () => {
  const list = gymAlertsFrom(raw) as GymAlert[];

  it('reads the server answer: only real alerts, newest first, a bad page becomes Today', () => {
    expect(list.map((a) => a.id)).toEqual(['a2', 'a1', 'a3']);
    expect(list[0].line).toBe('Ravi sent your gym a complaint. Open Member messages to read it.');
    expect(list[0].urgent).toBe(true);
    expect(list[1].urgent).toBe(false);
    expect(list[2].route).toBe('/');
    expect(gymAlertsFrom({ ok: false })).toBeNull();
    expect(gymAlertsFrom(null)).toBeNull();
    expect(gymAlertsFrom({ ok: true, alerts: 'x' })).toBeNull();
    expect(gymAlertsFrom({ ok: true, alerts: [] })).toEqual([]);
  });

  it('the first look rings for nothing; later only the new ones', () => {
    expect(freshAlerts(null, list)).toEqual([]);
    const seen = new Set(['a1', 'a3']);
    expect(freshAlerts(seen, list).map((a) => a.id)).toEqual(['a2']);
    expect(freshAlerts(new Set(list.map((a) => a.id)), list)).toEqual([]);
  });

  it('one new alert: its own line and page; several: one line that sends you to Today', () => {
    expect(alertNotice([])).toBeNull();
    expect(alertNotice([list[0]])).toEqual({ title: ALERT_WORDS.noticeTitle, body: list[0].line, route: '/member-messages' });
    expect(alertNotice(list)).toEqual({ title: ALERT_WORDS.noticeTitle, body: '3 new updates from your members. Open Today to see them.', route: '/' });
  });

  it('Today lists the last 24 hours, at most five', () => {
    expect(latestAlerts(list, NOW).map((a) => a.id)).toEqual(['a2', 'a1']);
    const many = Array.from({ length: 8 }, (_, i) => ({ ...list[0], id: `m${i}`, at: NOW - i * MIN }));
    expect(latestAlerts(many, NOW)).toHaveLength(5);
  });

  it('says how long ago in plain words', () => {
    expect(alertAge(NOW - 20_000, NOW)).toBe('Just now');
    expect(alertAge(NOW - 12 * MIN, NOW)).toBe('12 min ago');
    expect(alertAge(NOW - 3 * 60 * MIN, NOW)).toBe('3 h ago');
    expect(alertAge(NOW - 26 * 60 * MIN, NOW)).toBe('Yesterday');
    expect(alertAge(NOW - 50 * 60 * MIN, NOW)).toBe('2 days ago');
  });

  it('a tap opens the panel page by its hash address, never anything else', () => {
    expect(alertHref('/members/abc-1')).toBe('/#/members/abc-1');
    expect(alertHref('https://evil.example')).toBe('/#/');
    expect(alertHref('/a b')).toBe('/#/');
  });

  it('plain words', () => {
    for (const w of [...Object.values(ALERT_WORDS), alertNotice(list)!.body]) {
      expect(w).not.toMatch(/\b(volume|PR|session)\b/i);
    }
  });
});
