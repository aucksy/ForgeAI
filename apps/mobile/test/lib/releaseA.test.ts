/**
 * Release A, "make room" (docs/ux/MEMBER-APP-MAP.md §3–4, owner yes 24 Oct 2026): the pure rules
 * behind the new layout — the 4 tabs, Settings' 6 groups, the one-time "it moved" hints, one notice
 * at a time on the Workout tab, the Progress tab's reports, and every old address still landing.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  MAX_ROWS_PER_GROUP,
  nextWeightLine,
  onOffLine,
  settingsGroups,
  weeklyGoalLine,
  type SettingsContext,
} from '@/components/settings/settingsLines';
import { APP_TABS, HIDDEN_TAB_ROUTES, isShownTab, tabTitle } from '@/lib/appTabs';
import { hadOldTiles, hadShopTab, HINT_TEXT, hintShows, settleHint } from '@/lib/layoutHints';
import { bodyTarget, firstParam, MOVED_ROUTES } from '@/lib/oldRoutes';
import { goFor, WHATS_NEW_LOG } from '@/lib/whatsNew';
import { NOTICE_ORDER, pickNotice, upNextExtra } from '@/lib/workoutNotices';
import { reportRows } from '@/tracker/lib/progressTab';

const APP = join(__dirname, '..', '..', 'src', 'app');
const TABS = new Set(['workout', 'progress', 'shop', 'profile', 'coach']);

/** The route file an address opens, or null when none exists. */
function routeFile(href: string): string | null {
  const path = href.split('?')[0].replace(/^\//, '');
  const tries = TABS.has(path) ? [join(APP, '(tabs)', `${path}.tsx`)] : [join(APP, `${path}.tsx`), join(APP, path, 'index.tsx')];
  return tries.find((f) => existsSync(f)) ?? null;
}

const NO_GYM: SettingsContext = { gymName: null, canAddGymLogo: false, hasHealth: true, coach: false };
const IN_GYM: SettingsContext = { gymName: 'RAM Fitness Club', canAddGymLogo: true, hasHealth: true, coach: false };

describe('A1/A5: 4 tabs, always the same 4', () => {
  it('Workout, Progress, Gym, Profile, in that order; Workout first', () => {
    expect(APP_TABS.map((t) => t.title)).toEqual(['Workout', 'Progress', 'Gym', 'Profile']);
    expect(APP_TABS[0].route).toBe('workout');
  });
  it('the Gym tab keeps the /shop address (old links, notifications, What’s new buttons)', () => {
    expect(tabTitle('shop')).toBe('Gym');
    expect(isShownTab('shop')).toBe(true);
  });
  it('Coach stays hidden; every tab has its route file', () => {
    expect(HIDDEN_TAB_ROUTES).toContain('coach');
    expect(isShownTab('coach')).toBe(false);
    expect(tabTitle('coach')).toBeNull();
    for (const t of APP_TABS) expect(existsSync(join(APP, '(tabs)', `${t.route}.tsx`)), t.route).toBe(true);
  });
  it('the tab layout and the tab bar both read the one list', () => {
    expect(readFileSync(join(APP, '(tabs)', '_layout.tsx'), 'utf8')).toMatch(/APP_TABS\.map/);
    expect(readFileSync(join(__dirname, '..', '..', 'src', 'tracker', 'components', 'TrackerTabBar.tsx'), 'utf8')).toMatch(/progress: \{ icon: 'trend' \}/);
  });
});

describe('A7: Settings in 6 headed groups', () => {
  it('the groups, in order, each with at most 7 rows', () => {
    for (const ctx of [NO_GYM, IN_GYM, { ...IN_GYM, coach: true }]) {
      const groups = settingsGroups(ctx);
      expect(groups.map((g) => g.title)).toEqual(['You', 'Workouts', 'Reminders and phone', 'Your gym', 'Back up and restore', 'Your data', 'Help']);
      for (const g of groups) {
        expect(g.rows.length, g.title).toBeGreaterThan(0);
        expect(g.rows.length, g.title).toBeLessThanOrEqual(MAX_ROWS_PER_GROUP);
      }
    }
  });
  it('the rows the review named (labels in plain words)', () => {
    const rows = Object.fromEntries(settingsGroups(NO_GYM).map((g) => [g.title, g.rows.map((r) => r.title)]));
    expect(rows.You).toEqual(['Your profile', 'Units']);
    expect(rows.Workouts).toEqual([
      'Weekly goal',
      'Rest timer and sounds',
      'How the app picks your next weight',
      'Plates and bars',
      "Last time's numbers",
      'Rate how hard each set felt',
      'Muscle tips',
    ]);
    expect(rows['Reminders and phone']).toEqual(['Reminders', 'Health Connect', 'Widgets']);
    expect(rows['Your gym']).toEqual(['Join your gym']);
    expect(rows['Back up and restore']).toEqual(['Save a backup', 'Restore from a backup']);
    expect(rows['Your data']).toEqual(['Backup', 'Save as a spreadsheet', 'Bring in from Hevy or Strong', 'Erase or start over']);
    expect(rows.Help).toEqual(["What's new", 'Send feedback', 'About']);
  });
  it('with a gym: the logo (when it has one) and Leave, which act on the spot', () => {
    const gym = settingsGroups(IN_GYM).find((g) => g.title === 'Your gym');
    expect(gym?.rows.map((r) => r.title)).toEqual(['Gym logo on my home screen', 'Leave RAM Fitness Club']);
    expect(gym?.rows.every((r) => r.href === undefined)).toBe(true);
    expect(settingsGroups({ ...IN_GYM, canAddGymLogo: false }).find((g) => g.title === 'Your gym')?.rows.map((r) => r.key)).toEqual(['gymLeave']);
  });
  it('no Health Connect on the phone: no row; the coach row only while the coach is on', () => {
    const phone = settingsGroups({ ...NO_GYM, hasHealth: false }).find((g) => g.title === 'Reminders and phone');
    expect(phone?.rows.map((r) => r.key)).toEqual(['reminders', 'widgets']);
    expect(settingsGroups(NO_GYM).flatMap((g) => g.rows).some((r) => r.key === 'coach')).toBe(false);
    expect(settingsGroups({ ...NO_GYM, coach: true }).find((g) => g.title === 'You')?.rows.map((r) => r.key)).toContain('coach');
  });
  it('every row that opens a page opens one that exists, and no two rows open the same page', () => {
    const hrefs = settingsGroups({ ...NO_GYM, coach: true })
      .flatMap((g) => g.rows)
      .map((r) => r.href)
      .filter((h): h is string => h != null);
    for (const h of hrefs) expect(routeFile(h), h).not.toBeNull();
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });
  it('never "volume", "PR" or "session" on a row', () => {
    for (const r of settingsGroups({ ...IN_GYM, coach: true }).flatMap((g) => g.rows)) expect(r.title).not.toMatch(/\b(volume|PR|session|RPE)\b/i);
  });
  it('the grey lines', () => {
    expect(weeklyGoalLine(3)).toBe('3 a week');
    expect(weeklyGoalLine(null)).toBe('Off');
    expect(nextWeightLine('Standard', 'Match my goal')).toBe('Standard step, Match my goal');
    expect(onOffLine(true)).toBe('On');
    expect(onOffLine(false)).toBe('Off');
  });
});

describe('A5: the one-time "it moved" hints', () => {
  it('the owner’s words', () => {
    expect(HINT_TEXT.progressTab).toBe('Your charts are now in the Progress tab.');
    for (const t of Object.values(HINT_TEXT)) expect(t.length).toBeLessThanOrEqual(60);
  });
  it('settled once: due for a member who had the old layout, done for everyone else', () => {
    expect(settleHint(null, true)).toBe('due');
    expect(settleHint(null, false)).toBe('done');
    expect(settleHint('due', false)).toBeNull();
    expect(settleHint('done', true)).toBeNull();
    // Anything unknown is settled again.
    expect(settleHint('1', true)).toBe('due');
  });
  it('shows while due; never again once closed', () => {
    expect(hintShows('due')).toBe(true);
    expect(hintShows('done')).toBe(false);
    expect(hintShows(null)).toBe(false);
  });
  it('who had the old layout: an earlier version, own workouts, not the demo; a Shop tab for the shop hint', () => {
    expect(hadOldTiles({ metEarlierVersion: true, hasWorkouts: true, demo: false })).toBe(true);
    expect(hadOldTiles({ metEarlierVersion: false, hasWorkouts: true, demo: false })).toBe(false);
    expect(hadOldTiles({ metEarlierVersion: true, hasWorkouts: false, demo: false })).toBe(false);
    expect(hadOldTiles({ metEarlierVersion: true, hasWorkouts: true, demo: true })).toBe(false);
    expect(hadShopTab({ metEarlierVersion: true, joined: true, productCount: 2 })).toBe(true);
    expect(hadShopTab({ metEarlierVersion: true, joined: true, productCount: 0 })).toBe(false);
    expect(hadShopTab({ metEarlierVersion: false, joined: true, productCount: 2 })).toBe(false);
  });
  it('Profile and the Gym tab show them', () => {
    expect(readFileSync(join(APP, '(tabs)', 'profile.tsx'), 'utf8')).toMatch(/hintDue\('progressTab'\)/);
    expect(readFileSync(join(__dirname, '..', '..', 'src', 'shop', 'ShopScreen.tsx'), 'utf8')).toMatch(/hintDue\('shopInGym'\)/);
  });
});

describe('A12: one notice at a time above Up next, one extra line inside it', () => {
  const today = '2026-10-26';
  it('the order: the link just tapped, a new version, What’s new, the backup reminder', () => {
    expect(NOTICE_ORDER).toEqual(['link', 'update', 'whatsNew', 'watch', 'backup']);
    expect(pickNotice({ update: true, whatsNew: true, backup: true }, null, today)).toBe('update');
    expect(pickNotice({ whatsNew: true, backup: true }, null, today)).toBe('whatsNew');
    expect(pickNotice({ backup: true }, null, today)).toBe('backup');
    expect(pickNotice({ link: true, update: true }, null, today)).toBe('link');
    expect(pickNotice({}, null, today)).toBeNull();
  });
  it('one closed today: the others wait for tomorrow; a tapped link is still answered', () => {
    expect(pickNotice({ backup: true }, today, today)).toBeNull();
    // Owner, 30 Oct 2026: the news of a just-installed update never waits for tomorrow.
    expect(pickNotice({ whatsNew: true, backup: true }, today, today)).toBe('whatsNew');
    expect(pickNotice({ whatsNew: true }, '2026-10-25', today)).toBe('whatsNew');
    expect(pickNotice({ link: true, whatsNew: true }, today, today)).toBe('link');
  });
  it('0.56.0: nothing is drawn until the closed day has been read (no flash of a closed notice)', () => {
    expect(pickNotice({ whatsNew: true, update: true }, undefined, today)).toBeNull();
    expect(pickNotice({ link: true }, undefined, today)).toBeNull();
    expect(pickNotice({ whatsNew: true }, null, today)).toBe('whatsNew');
  });
  it('inside Up next: the easy week, else the offer, else the muscle tip — never two', () => {
    expect(upNextExtra({ easyNow: true, offerEasy: true, tip: true })).toBe('easyWeek');
    expect(upNextExtra({ easyNow: false, offerEasy: true, tip: true })).toBe('easyOffer');
    expect(upNextExtra({ easyNow: false, offerEasy: false, tip: true })).toBe('muscleTip');
    expect(upNextExtra({ easyNow: false, offerEasy: false, tip: false })).toBeNull();
  });
  it('the Workout tab draws each card only when it is the one picked; Start is untouched', () => {
    const w = readFileSync(join(APP, '(tabs)', 'workout.tsx'), 'utf8');
    expect(w).toMatch(/<UpdateCard hidden=\{notice !== 'update'\}/);
    expect(w).toMatch(/<WhatsNewCard hidden=\{notice !== 'whatsNew'\}/);
    expect(w).toMatch(/<BackupNudgeCard hidden=\{notice !== 'backup'\}/);
    expect(w).toMatch(/await startShownWorkout\(router, today\?\.nextId \?\? null\)/);
    expect(w).not.toMatch(/TABS_NOTICE_TEXT/);
  });
});

describe('A5: the Progress tab’s reports', () => {
  it('the latest finished month and this year so far', () => {
    expect(reportRows(['2026-10', '2026-09', '2025-12'], '2026-10-24')).toEqual([
      { period: '2026-09', title: 'September 2026', sub: 'Monthly report' },
      { period: '2026', title: '2026 so far', sub: 'Year in review' },
    ]);
  });
  it('a new member: this month so far; January: last year’s review too', () => {
    expect(reportRows(['2026-10'], '2026-10-24')[0]).toEqual({ period: '2026-10', title: 'October 2026 so far', sub: 'Monthly report' });
    expect(reportRows(['2027-01', '2026-12'], '2027-01-05').map((r) => r.period)).toEqual(['2026-12', '2027', '2026']);
  });
  it('no workouts: no rows (the tab says when they come)', () => {
    expect(reportRows([], '2026-10-24')).toEqual([]);
  });
});

describe('Every old address still lands (redirects)', () => {
  it('each moved address keeps a route file that redirects, to a page that exists', () => {
    for (const [from, to] of Object.entries(MOVED_ROUTES)) {
      const file = routeFile(from);
      expect(file, from).not.toBeNull();
      expect(readFileSync(file as string, 'utf8'), from).toMatch(/<Redirect\b/);
      expect(routeFile(to), `${from} → ${to}`).not.toBeNull();
    }
  });
  it('the redirect files name the place the map says', () => {
    const src = (p: string) => readFileSync(join(APP, p), 'utf8');
    expect(src('settings/details.tsx')).toMatch(/<Redirect href="\/edit-profile" \/>/);
    expect(src('settings/workouts.tsx')).toMatch(/<Redirect href="\/settings" \/>/);
    // 0.56.0 review: opened from Settings, it goes back to that Settings page (never a second one).
    expect(src('settings/workouts.tsx')).toMatch(/if \(back\) router\.dismissTo\('\/settings'\)/);
    expect(src('bodyweight.tsx')).toMatch(/bodyTarget\('\/bodyweight'/);
    expect(src('measurements/index.tsx')).toMatch(/bodyTarget\('\/measurements'/);
    expect(src('measurements/log.tsx')).toMatch(/bodyTarget\('\/measurements\/log'/);
    // No gym: Your gym's old address opens the Gym tab's join screen.
    expect(src('settings/gym.tsx')).toMatch(/if \(hydrated && !link\) return <Redirect href="\/shop" \/>/);
  });
  it('A13: the old body pages land on Body, on the measure they named', () => {
    expect(bodyTarget('/bodyweight', undefined)).toEqual({ pathname: '/measures', params: { kind: 'bodyweight' } });
    expect(bodyTarget('/measurements', 'waist')).toEqual({ pathname: '/measures', params: { kind: 'waist' } });
    expect(bodyTarget('/measurements', ['chest', 'arm'])).toEqual({ pathname: '/measures', params: { kind: 'chest' } });
    expect(bodyTarget('/measurements/log', undefined)).toEqual({ pathname: '/measures/add', params: {} });
    expect(firstParam('../../x')).toBeUndefined();
  });
  it('What’s new buttons open the new homes (Rest-over sound → Rest timer and sounds)', () => {
    const hrefs = WHATS_NEW_LOG.flatMap((e) => e.lines).flatMap((l) => (l.go ? [l.go.href] : []));
    expect(hrefs).not.toContain('/settings/workouts');
    for (const h of hrefs) expect(routeFile(h), h).not.toBeNull();
    const sound = WHATS_NEW_LOG.flatMap((e) => e.lines).find((l) => /sound that plays when your rest is over/.test(l.text));
    expect(sound?.go?.href).toBe('/settings/rest');
  });
  it('the Gym tab button: "Join your gym" on the Gym tab itself when there is no gym', () => {
    expect(goFor({ text: 'x', go: { label: 'Open My membership', href: '/shop' } }, false)).toEqual({ label: 'Join your gym', href: '/shop', tab: true });
  });
});
