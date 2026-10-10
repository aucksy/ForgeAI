/**
 * Phase 0, packet C.
 *  - RT-01: a late "Rest is over" alarm is never thrown away. The alert itself is native
 *    (modules/forge-rest, Kotlin, compiled only in cloud CI), so these are source checks on
 *    the rules a reviewer must see: no 60-second drop, the guards that stop a ghost alert stay.
 *  - EX-05: the exercise drawings are credited (Credits page, readable credit line).
 *  - EX-11: the demo sheet scrolls inside a max height.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { CREDITS } from '@/lib/credits';

const read = (p: string): string => readFileSync(p, 'utf8');
const KT = 'modules/forge-rest/android/src/main/java/com/forgeai/rest/RestCard.kt';
const MOD = 'modules/forge-rest/android/src/main/java/com/forgeai/rest/ForgeRestModule.kt';

/** The body of one Kotlin function, from its `fun name(` to the next function. */
function ktFun(src: string, name: string): string {
  const start = src.indexOf(`fun ${name}(`);
  expect(start).toBeGreaterThan(-1);
  const next = src.indexOf('\n  fun ', start + 10);
  const nextPrivate = src.indexOf('\n  private fun ', start + 10);
  const ends = [next, nextPrivate].filter((i) => i > 0);
  return src.slice(start, ends.length ? Math.min(...ends) : undefined);
}

describe('RT-01: a late "Rest is over" still comes', () => {
  const kt = read(KT);

  it('nothing drops a rest for ending more than a minute ago (before: the late alarm was thrown away)', () => {
    expect(kt).not.toMatch(/System\.currentTimeMillis\(\) - 60_000L\)\s*\{\s*p\.edit\(\)\.clear\(\)/);
    expect(ktFun(kt, 'load')).not.toMatch(/clear\(\)/);
  });

  it('the alarm reads the saved rest without a staleness rule, and keeps the ghost guards', () => {
    const fire = ktFun(kt, 'fireEnd');
    expect(fire).toMatch(/stored\(ctx\)/);
    expect(fire).not.toMatch(/load\(ctx\)/);
    // a rest that was moved, replaced by the next set, skipped or ended with the workout
    expect(fire).toMatch(/cur\.endsAt != expected\) return/);
    // Skip / Finish / Discard wipe the saved rest, so a late alarm then finds nothing
    expect(ktFun(kt, 'clear')).toMatch(/forget\(ctx\)/);
    expect(ktFun(kt, 'show')).toMatch(/save\(ctx, r\)/);
  });

  it('a late alert says when the rest ended', () => {
    expect(kt).toMatch(/Ended \$\{?\w+\}? min ago/);
    expect(ktFun(kt, 'postOver')).toMatch(/setWhen\(endsAt\)/);
  });

  it('exact alarm when allowed, inexact otherwise, and a refused exact alarm falls back', () => {
    const arm = ktFun(kt, 'arm');
    expect(arm).toMatch(/canScheduleExactAlarms\(\)/);
    expect(arm).toMatch(/setExactAndAllowWhileIdle\(AlarmManager\.RTC_WAKEUP, endsAt, pi\)/);
    expect(arm).toMatch(/catch \(_: SecurityException\)/);
    expect(arm).toMatch(/setAndAllowWhileIdle\(AlarmManager\.RTC_WAKEUP, endsAt, pi\)/);
  });

  it('back in the app after a long-overdue end: settled quietly, so no late buzz mid-set', () => {
    expect(read(MOD)).toMatch(/RestCard\.settle\(c\)/);
    expect(ktFun(kt, 'settle')).toMatch(/appOnScreen\(ctx\)/);
  });

  it('"+15 s" after the end, before the late alert, gives 15 s from now (before: ignored)', () => {
    const add = ktFun(kt, 'add');
    expect(add).not.toMatch(/if \(cur\.endsAt <= now\) return null/);
    expect(add).toMatch(/maxOf\(cur\.endsAt, now\)/);
  });
});

describe('EX-05: the exercise drawings are credited', () => {
  it('the Credits page names the drawings: source, author, licence in words, and that they were changed', () => {
    const ek = CREDITS.find((c) => c.id === 'everkinetic');
    expect(ek).toBeDefined();
    expect(ek!.author).toMatch(/Greg Priday/);
    expect(ek!.licenceName).toBe('Creative Commons Attribution-ShareAlike 4.0 International');
    expect(ek!.licenceUrl).toBe('https://creativecommons.org/licenses/by-sa/4.0/');
    expect(ek!.sourceUrl).toBe('https://github.com/everkinetic/data');
    expect(ek!.changes).toMatch(/recolou?red/i);
  });

  it('every other third-party piece the app ships is on the page too', () => {
    const ids = CREDITS.map((c) => c.id);
    expect(ids).toEqual(expect.arrayContaining(['body-map', 'fonts']));
    const body = CREDITS.find((c) => c.id === 'body-map')!;
    expect(body.fullText).toMatch(/MIT License/);
    expect(CREDITS.find((c) => c.id === 'fonts')!.licenceName).toBe('SIL Open Font License 1.1');
    for (const c of CREDITS) expect(c.licenceUrl).toMatch(/^https:\/\//);
  });

  it('the credits page exists and uses the app Screen with a way back', () => {
    const page = read('src/app/credits.tsx');
    expect(page).toMatch(/<Screen/);
    // Audit Phase 7 review: back, or (opened cold, nothing behind it) the Profile tab.
    expect(page).toMatch(/goBack\(router, '\/settings'\)/);
  });

  it('the credit line is readable and opens Credits (before: 1.74 : 1 grey, licence link only)', () => {
    const line = read('src/tracker/components/DrawingCredit.tsx');
    expect(line).not.toMatch(/color.inkFaint/);
    expect(line).toMatch(/color\.inkSecondary/);
    expect(line).toMatch(/'\/credits'/);
    expect(read('src/tracker/components/ExerciseDemoSheet.tsx')).toMatch(/<DrawingCredit/);
    expect(read('src/app/exercise/[id].tsx')).toMatch(/<DrawingCredit/);
  });
});

describe('EX-11: the demo sheet scrolls', () => {
  it('its body scrolls inside a max height, so the name and close stay on screen', () => {
    const sheet = read('src/tracker/components/ExerciseDemoSheet.tsx');
    expect(sheet).toMatch(/<ScrollView/);
    expect(sheet).toMatch(/maxHeight/);
    expect(sheet).toMatch(/accessibilityLabel="Close"/);
  });
});
