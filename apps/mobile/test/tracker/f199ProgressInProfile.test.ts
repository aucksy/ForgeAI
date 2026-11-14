/**
 * F199 (owner R-403, 8 Nov 2026): the Progress tab moves into Profile, and every point on the Profile chart
 * opens something. "Remove the progress section, put it somewhere inside the profile ... the profile will give
 * them the high level overview"; "The charts behavior need to be the same."
 *
 *  - 3 tabs: Workout, Gym, Profile; "/progress" (old links, notifications, What's new buttons) lands on Profile.
 *  - The pages of "Your progress" go back to Profile when nothing is behind them.
 *  - The box over a picked week or month opens that period's workouts; exactly one workout opens itself.
 *  - The Today line follows the chart's chip: Kg lifted, Duration; none on Reps.
 *  - A member who had the Progress tab is told once where it went.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const calls: { sql: string; params: unknown[] }[] = [];
let rows: { id: string }[] = [];
vi.mock('@/db', () => ({
  getDb: () => ({
    getAllAsync: async (sql: string, params: unknown[]) => {
      calls.push({ sql, params });
      return rows;
    },
    getFirstAsync: async () => null,
    runAsync: async () => undefined,
  }),
  getMeta: async () => null,
  setMeta: async () => undefined,
}));

import { APP_TABS, HIDDEN_TAB_ROUTES, isShownTab } from '@/lib/appTabs';
import { backTarget } from '@/lib/goBack';
import { hadProgressTab, HINT_TEXT } from '@/lib/layoutHints';
import { trailOf } from '@/lib/newDots';
import { MOVED_ROUTES } from '@/lib/oldRoutes';
import { goFor, WHATS_NEW_LOG } from '@/lib/whatsNew';
import { periodTarget } from '@/tracker/lib/historyRange';
import { todayLineWords, todayModeFor } from '@/tracker/lib/todayGoal';
import { getWorkoutIdsBetween } from '@/tracker/services/historyFeed';

const SRC = join(__dirname, '..', '..', 'src');
const NB = String.fromCharCode(160);
const APP = join(SRC, 'app');
const read = (...p: string[]) => readFileSync(join(SRC, ...p), 'utf8');

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const f = join(dir, n);
    return statSync(f).isDirectory() ? filesUnder(f) : /\.tsx?$/.test(n) ? [f] : [];
  });
}

const WEEK = { from: '2026-10-26', to: '2026-11-01' };
const MONTH = { from: '2026-10-01', to: '2026-10-31' };

describe('F199 the tab bar', () => {
  it('shows Workout then Gym then Profile and never Progress', () => {
    expect(APP_TABS.map((t) => t.route)).toEqual(['workout', 'shop', 'profile']);
    expect(APP_TABS.map((t) => t.title)).not.toContain('Progress');
    expect(isShownTab('progress')).toBe(false);
    expect(HIDDEN_TAB_ROUTES).toEqual(expect.arrayContaining(['progress', 'coach']));
  });
  it('keeps the progress route in the navigator so old links still resolve', () => {
    expect(read('app', '(tabs)', '_layout.tsx')).toMatch(/HIDDEN_TAB_ROUTES\.map/);
  });
});

describe('F199 old links to progress land on Profile', () => {
  it('the progress route only redirects to Profile', () => {
    const f = read('app', '(tabs)', 'progress.tsx');
    expect(f).toContain('<Redirect href="/profile" />');
    expect(f).not.toMatch(/<Screen\b/);
    expect(MOVED_ROUTES['/progress']).toBe('/profile');
    expect(existsSync(join(APP, '(tabs)', 'profile.tsx'))).toBe(true);
  });
  it('the progress sub pages still exist under their old address', () => {
    expect(existsSync(join(APP, 'progress', 'pick-lift.tsx'))).toBe(true);
  });
});

describe('F199 back targets', () => {
  it('no page goes back to the old Progress tab', () => {
    for (const f of filesUnder(APP)) {
      const s = readFileSync(f, 'utf8');
      expect(s, f).not.toMatch(/(goBack|leavePage)\(router, '\/progress'\)/);
      expect(s, f).not.toMatch(/navigate\('\/progress'/);
    }
  });
  it('the pages of Your progress go back to Profile when nothing is behind them', () => {
    for (const p of ['stats.tsx', 'exercises.tsx', 'records.tsx', 'measures/index.tsx', 'report/[period].tsx', 'one-rep-max.tsx', 'photos/index.tsx', 'photos/compare.tsx', 'library/hidden.tsx', 'exercise/[id].tsx', 'progress/pick-lift.tsx']) {
      expect(readFileSync(join(APP, p), 'utf8'), p).toMatch(/(goBack|leavePage)\(router, '\/profile'\)/);
    }
    expect(backTarget(false, '/profile')).toBe('/profile');
    expect(backTarget(true, '/profile')).toBe('back');
  });
});

describe('F199 review fixes (8 Nov 2026)', () => {
  it('the exercise picker names Profile, not the removed Progress tab', () => {
    const s = readFileSync(join(APP, 'progress', 'pick-lift.tsx'), 'utf8');
    expect(s).toContain('subtitle="See its trend on your Profile"');
    expect(s).not.toMatch(/(subtitle|title)="[^"]*Progress/);
  });
  it('a picked point with no workouts still names its week or month', () => {
    const s = readFileSync(join(APP, '..', 'tracker', 'components', 'DateLineChart.tsx'), 'utf8');
    expect(s).toContain('date={(pickedDate ?? xLabel)(activeDatum.x)}');
  });
});

describe('F199 What is new buttons and new feature dots', () => {
  it('an older Open Progress button opens Profile with the right words', () => {
    const olds = WHATS_NEW_LOG.flatMap((e) => e.lines).filter((l) => l.go?.href === '/progress');
    expect(olds.length).toBeGreaterThan(0);
    for (const l of olds) expect(goFor(l, true)).toEqual({ label: 'Open Profile', href: '/profile', tab: true });
  });
  it('a dot trail to progress leads to a tab the bar shows', () => {
    const trail = trailOf({ label: 'x', href: '/progress' });
    const tabs = trail.filter((s) => s.startsWith('tab:')).map((s) => s.slice(4));
    expect(tabs).toEqual(['profile']);
    for (const t of tabs) expect(isShownTab(t)).toBe(true);
  });
  it('every dot trail in the log starts at a tab the bar shows', () => {
    for (const l of WHATS_NEW_LOG.flatMap((e) => e.lines)) {
      if (!l.go) continue;
      for (const s of trailOf(l.go)) if (s.startsWith('tab:')) expect(isShownTab(s.slice(4)), l.go.href).toBe(true);
    }
  });
});

describe('F199 the chart box opens the period or its one workout', () => {
  it('one workout in the week opens that workout', () => {
    expect(periodTarget(WEEK, ['w1'])).toEqual({ pathname: '/session/[id]', params: { id: 'w1' } });
  });
  it('two or more workouts open Your workouts for the week', () => {
    expect(periodTarget(WEEK, ['w2', 'w1'])).toEqual({ pathname: '/history', params: WEEK });
  });
  it('a month works the same way', () => {
    expect(periodTarget(MONTH, ['m1'])).toEqual({ pathname: '/session/[id]', params: { id: 'm1' } });
    expect(periodTarget(MONTH, ['m1', 'm2'])).toEqual({ pathname: '/history', params: MONTH });
  });
  it('negative no ids or a failed read or an empty id falls back to the list', () => {
    expect(periodTarget(WEEK, [])).toEqual({ pathname: '/history', params: WEEK });
    expect(periodTarget(WEEK, null)).toEqual({ pathname: '/history', params: WEEK });
    expect(periodTarget(WEEK, [''])).toEqual({ pathname: '/history', params: WEEK });
  });
  it('a period given back to front is put in order', () => {
    expect(periodTarget({ from: WEEK.to, to: WEEK.from }, [])).toEqual({ pathname: '/history', params: WEEK });
  });
});

describe('F199 reading the workouts of a period', () => {
  beforeEach(() => {
    calls.length = 0;
    rows = [];
  });
  it('reads at most two ids newest first inside both days', async () => {
    rows = [{ id: 'b' }, { id: 'a' }];
    expect(await getWorkoutIdsBetween(WEEK.from, WEEK.to)).toEqual(['b', 'a']);
    expect(calls).toHaveLength(1);
    expect(calls[0].sql).toMatch(/FROM workout_sessions WHERE date_iso >= \? AND date_iso <= \? ORDER BY date_iso DESC/);
    expect(calls[0].sql).toMatch(/LIMIT \?$/);
    expect(calls[0].params).toEqual([WEEK.from, WEEK.to, 2]);
  });
  it('one row gives one id and the box opens that workout', async () => {
    rows = [{ id: 'only' }];
    const ids = await getWorkoutIdsBetween(MONTH.from, MONTH.to);
    expect(periodTarget(MONTH, ids)).toEqual({ pathname: '/session/[id]', params: { id: 'only' } });
  });
  it('a limit below one still reads one row', async () => {
    await getWorkoutIdsBetween(WEEK.from, WEEK.to, 0);
    expect(calls[0].params[2]).toBe(1);
  });
  it('the chart card uses the rule for its box and keeps See these workouts as the list', () => {
    const card = read('tracker', 'components', 'profile', 'HistoryChartCard.tsx');
    expect(card).toMatch(/onOpenPicked=\{bar && bar\.workouts > 0 \? \(\) => openPicked\(bar\) : undefined\}/);
    expect(card).toMatch(/periodTarget\(range, ids\)/);
    expect(card).toMatch(/testID="chart-see-workouts"\s+onPress=\{\(\) => openWorkouts\(bar\)\}/);
  });
});

describe('F199 the Today line follows the chip', () => {
  it('Kg lifted and Duration have a Today line and Reps has none', () => {
    expect(todayModeFor('volume')).toBe('volume');
    expect(todayModeFor('duration')).toBe('duration');
    expect(todayModeFor('reps')).toBeNull();
    expect(todayModeFor('sets')).toBeNull();
  });
  it('the words of the line', () => {
    expect(todayLineWords({ big: '12,300 kg', label: 'to lift', line: '300 kg more than previous (12,000 kg).' }, 'volume')).toBe(
      `12,300${NB}kg to lift. 300${NB}kg more than previous (12,000${NB}kg).`,
    );
    expect(todayLineWords({ big: '52 min', label: 'took the previous time', line: 'x' }, 'duration')).toBe(`It took 52${NB}min the previous time.`);
    expect(todayLineWords({ big: '—', label: 'to lift', line: 'Finish this workout once to see your goal here.' }, 'volume')).toBe(
      'Finish this workout once to see your goal here.',
    );
  });
  it('never volume or PR or session on the line', () => {
    const lines = [
      todayLineWords({ big: '1 kg', label: 'to lift', line: 'Same as previous (1 kg).' }, 'volume'),
      todayLineWords({ big: '5 min', label: 'took the previous time', line: '' }, 'duration'),
      HINT_TEXT.progressInProfile,
    ];
    for (const l of lines) expect(l).not.toMatch(/\b(volume|PR|session)\b/i);
  });
});

describe('F199 Profile holds what the Progress tab held', () => {
  const profile = read('app', '(tabs)', 'profile.tsx');
  it('the chart then the Today line then Your progress then Calendar', () => {
    const at = (s: string) => profile.indexOf(s);
    expect(at('<HistoryChartCard')).toBeGreaterThan(-1);
    expect(at('<TodayGoalLine')).toBeGreaterThan(at('<HistoryChartCard'));
    const heading = profile.search(/>\s*Your progress\s*</);
    expect(heading).toBeGreaterThan(at('<TodayGoalLine'));
    expect(at("router.push('/calendar')")).toBeGreaterThan(heading);
  });
  it('the rows open Charts Exercises Records Body and the reports', () => {
    for (const [id, href] of [
      ['Charts', '/stats'],
      ['Exercises', '/exercises'],
      ['Records', '/records'],
      ['Body', '/measures'],
    ]) {
      expect(profile).toContain(`<ProgressRow id="${id}" title="${id}"`);
      expect(profile).toContain(`open('${href}')`);
      expect(existsSync(join(APP, `${href.slice(1)}.tsx`)) || existsSync(join(APP, href.slice(1), 'index.tsx')), href).toBe(true);
    }
    expect(profile).toMatch(/reportRows\(months, today\)/);
    expect(profile).toMatch(/pathname: '\/report\/\[period\]'/);
  });
  it('the Today line shows only for a chip with a mode', () => {
    expect(profile).toMatch(/const todayMode = todayModeFor\(metric\)/);
    expect(profile).toMatch(/\{goal && todayMode \? <TodayGoalLine/);
  });
  it('the chips are on and the old Sets choice falls back to Kg lifted', () => {
    expect(profile).not.toMatch(/showChips=\{false\}/);
    expect(profile).toMatch(/savedMetric === 'sets' \? DEFAULT_METRIC : savedMetric/);
  });
});

describe('F199 the one time hint', () => {
  it('a member who had the Progress tab is told once and a new member or the demo never', () => {
    expect(hadProgressTab({ metEarlierVersion: true, demo: false })).toBe(true);
    expect(hadProgressTab({ metEarlierVersion: false, demo: false })).toBe(false);
    expect(hadProgressTab({ metEarlierVersion: true, demo: true })).toBe(false);
  });
  it('the words are short and plain and the Workout tab settles it', () => {
    expect(HINT_TEXT.progressInProfile).toBe('Progress is now on your Profile, below the chart.');
    expect(HINT_TEXT.progressInProfile.length).toBeLessThanOrEqual(60);
    expect(read('app', '(tabs)', 'workout.tsx')).toMatch(/settleLayoutHint\('progressInProfile', hadProgressTab\(/);
  });
});

describe('F199 member words name Profile not the old tab', () => {
  it('help articles never send a member to the Progress tab', () => {
    const help = readFileSync(join(__dirname, '..', '..', '..', '..', 'deploy', 'panel', 'helpArticles.js'), 'utf8');
    expect(help).not.toMatch(/Progress tab/);
    expect(help).toMatch(/"Your progress" has Charts, Exercises, Records, Body and Reports/);
  });
  it('screens never say Progress tab or Progress then an arrow', () => {
    for (const f of [join(APP, 'exercise', '[id].tsx'), join(SRC, 'tracker', 'engine', 'badges.ts')]) {
      expect(readFileSync(f, 'utf8'), f).not.toMatch(/Progress →|in Progress, under Body/);
    }
  });
});
