/**
 * R-319 items 4, 5 and 7 (owner, 4 Nov 2026): the one import flow's words, the honest "Erase all
 * data" (this phone only, or this phone and the MettleUp account; the Drive file stays), and a
 * chart point opening its workouts (a week, a month or a day → "/history?from=…&to=…"). PURE.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { ERASE_WORDS, eraseConfirmBody, eraseNeedsChoice } from '@/onboarding/eraseWords';
import { chartBars, chartHintText } from '@/tracker/engine/historyChart';
import { historyRangeLine, historyRangeParams, historyRangeText, parseHistoryRange } from '@/tracker/lib/historyRange';
import { IMPORT_FLOW_WORDS, exportSteps, routinesAheadText, routinesOfferText } from '@/tracker/services/importFlowWords';

const read = (f: string): string => readFileSync(join(__dirname, '..', '..', 'src', f), 'utf8');
const BANNED = /\b(volume|PR|session)\b/i;

describe('item 7: a chart point opens the workouts of its week, month or day', () => {
  it('a week of the 12-week chart becomes its first and last day', () => {
    const bars = chartBars([{ dateISO: '2026-10-14', durationSec: 3600, volumeKg: 5000, reps: 100 }], 'weeks', '2026-11-04');
    const week = bars.find((b) => b.workouts > 0);
    expect(week).toBeDefined();
    const r = historyRangeParams(week!.start, week!.end);
    expect(r.from <= '2026-10-14' && r.to >= '2026-10-14').toBe(true);
    expect(parseHistoryRange(r)).toEqual(r);
  });
  it('one day (another chart) is a range of one day; a swapped pair is put right', () => {
    expect(historyRangeParams('2026-10-12')).toEqual({ from: '2026-10-12', to: '2026-10-12' });
    expect(historyRangeParams('2026-10-31', '2026-10-01')).toEqual({ from: '2026-10-01', to: '2026-10-31' });
  });
  it('no range, or not real days: the old /history redirect', () => {
    expect(parseHistoryRange({})).toBeNull();
    expect(parseHistoryRange({ view: 'calendar' } as never)).toBeNull();
    expect(parseHistoryRange({ from: 'yesterday' })).toBeNull();
    expect(parseHistoryRange({ from: ['2026-10-05'], to: ['2026-10-11'] })).toEqual({ from: '2026-10-05', to: '2026-10-11' });
    expect(parseHistoryRange({ from: '2026-10-05', to: 'x' })).toEqual({ from: '2026-10-05', to: '2026-10-05' });
  });
  it('the list says the period as the chart does', () => {
    expect(historyRangeText({ from: '2026-10-05', to: '2026-10-11' }, '2026-11-04')).toBe('5–11 Oct');
    expect(historyRangeText({ from: '2026-10-01', to: '2026-10-31' }, '2026-11-04')).toBe('Oct 2026');
    expect(historyRangeLine(3, { from: '2026-10-05', to: '2026-10-11' }, '2026-11-04')).toBe('3 workouts in 5–11 Oct');
    expect(historyRangeLine(1, { from: '2026-10-12', to: '2026-10-12' }, '2026-11-04')).toBe('1 workout on 12 Oct');
    expect(historyRangeLine(0, { from: '2026-10-05', to: '2026-10-11' }, '2026-11-04')).toBe('You did not log a workout in 5–11 Oct.');
  });
  it('the Profile and Progress chart is the shared line chart, with "See these workouts"', () => {
    const src = read('tracker/components/profile/HistoryChartCard.tsx');
    expect(src).toContain('<DateLineChart');
    expect(src).toContain('See these workouts');
    expect(src).toMatch(/pathname: '\/history', params: \{ \.\.\.historyRangeParams\(b\.start, b\.end\) \}/);
    expect(chartHintText('weeks')).toBe('Tap a point to see one week');
    expect(read('app/history.tsx')).toContain('getHistoryBetween(range.from, range.to)');
  });
  it('the strength line opens the day behind its picked point', () => {
    expect(read('components/analytics/StrengthSection.tsx')).toContain('onOpenPicked=');
  });
});

describe('item 4: one import flow', () => {
  it('asks one question, and the Hevy link lives inside the Hevy branch only', () => {
    const card = read('tracker/components/ImportCard.tsx');
    expect(card).toContain('W.question');
    expect(card).not.toContain("'/import/routines'");
    expect(IMPORT_FLOW_WORDS.question).toBe('Which app are you moving from?');
    const screen = read('app/import/index.tsx');
    expect(screen).toMatch(/!strong \? \([\s\S]*IMPORT_FLOW_WORDS\.linkTitle/);
  });
  it('each app has its own numbered steps, ending on the button the member taps', () => {
    expect(exportSteps('strong')[0]).toContain('Settings → Export Strong Data');
    expect(exportSteps('strong')[2]).toContain('“Choose Strong file”');
    expect(exportSteps('hevy')[0]).toContain('Settings → Export & Backup Data');
    expect(exportSteps('hevy')[2]).toContain('“Choose Hevy file”');
  });
  it('Strong says plainly it has no routine export, before and after the import', () => {
    expect(routinesAheadText('strong')).toMatch(/^Strong doesn’t export saved routines\./);
    expect(routinesOfferText('strong', 3)).toBe(
      'Strong doesn’t export saved routines. We built 3 routines from the workouts you repeat most. Tick the ones you want.',
    );
    expect(routinesOfferText('hevy', 1)).toBe(
      'Hevy’s file has your workouts but not your saved routines. We built 1 routine from the workouts you repeat most. Tick it if you want it.',
    );
  });
  it('no banned word in the flow', () => {
    const all = [...Object.values(IMPORT_FLOW_WORDS), ...exportSteps('hevy'), ...exportSteps('strong'), routinesAheadText('hevy'), routinesOfferText('strong', 2)];
    for (const line of all) expect(line).not.toMatch(BANNED);
  });
});

describe('item 5: Erase all data says where the data lives', () => {
  const base = { withCoach: false, driveUsed: false, healthConnectUsed: false, gymNote: '' };
  it('signed in: the member chooses; not signed in: the one question as before', () => {
    expect(eraseNeedsChoice(true)).toBe(true);
    expect(eraseNeedsChoice(false)).toBe(false);
  });
  it('not signed in, no Drive link: the old words, without Google Drive (R-320)', () => {
    expect(eraseConfirmBody({ ...base, scope: null })).toBe(
      'Every workout, record, routine, body entry, photo and video, your gym link, and your settings. This phone goes back to new.',
    );
  });
  it('R-320: Google Drive is named only while a Drive link still exists on this phone', () => {
    const b = eraseConfirmBody({ ...base, scope: null, driveUsed: true });
    expect(b.startsWith('Every workout, record, routine, body entry, photo and video, your gym and Google Drive links, and your settings.')).toBe(true);
    expect(read('store/backupStore.ts')).toMatch(/return \(await getMeta\(LINKED_KEY\)\) === '1';/);
  });
  it('this phone only: the MettleUp copy stays and comes back', () => {
    const b = eraseConfirmBody({ ...base, scope: 'phone' });
    expect(b).toContain('Your saved copy on MettleUp stays. It comes back when you sign in again.');
    expect(b).not.toContain('account and everything');
  });
  it('this phone and the account: says the account goes too, for good', () => {
    const b = eraseConfirmBody({ ...base, scope: 'phone-and-account' });
    expect(b).toContain('Your MettleUp account and everything saved in it are deleted too. This cannot be undone.');
    expect(b).not.toContain('stays. It comes back');
  });
  it('Drive used: the backup file stays, and where to delete it', () => {
    expect(eraseConfirmBody({ ...base, scope: null, driveUsed: true })).toContain(ERASE_WORDS.driveStays);
    expect(ERASE_WORDS.driveStays).toBe('Your backup file in Google Drive stays. Delete it in Google Drive if you want it gone.');
    expect(eraseConfirmBody({ ...base, scope: null })).not.toContain('Google Drive stays');
  });
  it('Health Connect and the gym keep their lines, last', () => {
    const b = eraseConfirmBody({ ...base, scope: 'phone', driveUsed: true, healthConnectUsed: true, gymNote: 'You also leave Iron Gym.' });
    expect(b.indexOf('Google Drive stays')).toBeLessThan(b.indexOf('Health Connect stay there'));
    expect(b.endsWith('You also leave Iron Gym.')).toBe(true);
  });
  it('the account is deleted BEFORE the phone is erased, and a failed delete erases nothing', () => {
    const src = read('components/settings/DataCard.tsx');
    const del = src.indexOf('useAccount.getState().deleteAccount()');
    const wipe = src.indexOf('await erase({ beforeWelcome');
    expect(del).toBeGreaterThan(0);
    expect(del).toBeLessThan(wipe);
    expect(src).toContain('ERASE_WORDS.accountNotDeleted');
  });
  it('no banned word in the erase words', () => {
    for (const line of Object.values(ERASE_WORDS)) expect(line).not.toMatch(BANNED);
  });
});
