/**
 * R-248: the watch card at the first workout start, and the 2-3 intro screens before the welcome
 * flow. The rules are pure; the wiring is read as text.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { usesBannedWord } from '@/lib/words';
import { INTRO_SLIDES, INTRO_WORDS, introShows, introSlides, introStepLabel } from '@/onboarding/introSlides';
import { CARD_DONE, START_KEY, WATCH_WORDS, watchStartCardShows, type StartCardInput, type WatchState } from '@/tracker/services/watchInstall';

const read = (p: string) => readFileSync(resolve(__dirname, '../../src', p), 'utf8');
const base: StartCardInput = { state: 'missing', freshStart: true, demo: false, startStored: null, cardStored: null };

describe('R-248 watch card at the first workout start', () => {
  it('shows on a fresh start with a watch that lacks the app, never shown before', () => {
    expect(watchStartCardShows(base)).toBe(true);
  });

  it.each<WatchState>(['none', 'installed', 'unknown'])('no card when Wear OS says %s', (state) => {
    expect(watchStartCardShows({ ...base, state })).toBe(false);
  });

  it('no card on a resume, an edit or a past log (not a fresh start)', () => {
    expect(watchStartCardShows({ ...base, freshStart: false })).toBe(false);
  });

  it('no card with the demo workouts loaded', () => {
    expect(watchStartCardShows({ ...base, demo: true })).toBe(false);
  });

  it('only once: the start mark ends it; the after-workout card being done ends it too', () => {
    expect(watchStartCardShows({ ...base, startStored: CARD_DONE })).toBe(false);
    expect(watchStartCardShows({ ...base, cardStored: CARD_DONE })).toBe(false);
  });

  it('nothing before the marks are read', () => {
    expect(watchStartCardShows({ ...base, startStored: undefined })).toBe(false);
    expect(watchStartCardShows({ ...base, cardStored: undefined })).toBe(false);
  });

  it('has its own mark, apart from the after-workout card', () => {
    expect(START_KEY).toBe('watch_install_start');
  });

  it('the workout screen shows the card, above the first exercise', () => {
    const src = read('app/session/active.tsx');
    expect(src).toContain("import { WatchStartCard } from '@/tracker/components/WatchStartCard'");
    expect(src).toContain('<WatchStartCard startedAt={startedAt} editing={isEditing} />');
  });

  it('the card marks itself shown the moment it appears, and asks Wear OS only on a fresh start', () => {
    const src = read('tracker/components/WatchStartCard.tsx');
    expect(src).toContain('START_WINDOW_MS');
    expect(src.indexOf('setShows(true)')).toBeLessThan(src.indexOf('markStartCardDone()'));
    expect(src.indexOf('if (!freshStart || demo) return undefined')).toBeLessThan(src.indexOf('readWatchStateQuick(START_CARD_WAIT_MS)'));
  });
});

describe('R-248 intro screens', () => {
  it('two screens; the watch one only when a watch lacks the app', () => {
    expect(introSlides('missing').map((s) => s.key)).toEqual(['last', 'rest', 'watch']);
    for (const s of ['none', 'installed', 'unknown'] as const) expect(introSlides(s).map((x) => x.key)).toEqual(['last', 'rest']);
  });

  it('never more than 3 (owner: "maximum 2 or 3")', () => {
    expect(introSlides('missing').length).toBeLessThanOrEqual(3);
  });

  it('show only when the seen mark was read and is empty', () => {
    expect(introShows(null)).toBe(true);
    expect(introShows('done')).toBe(false);
    expect(introShows(undefined)).toBe(false);
  });

  it('"1 of 3"', () => {
    expect(introStepLabel(0, 3)).toBe('1 of 3');
  });

  it('every word a member reads is free of banned words', () => {
    const lines = [
      ...Object.values(INTRO_SLIDES).flatMap((s) => [s.title, s.body]),
      ...Object.values(INTRO_WORDS),
      WATCH_WORDS.startTitle,
      WATCH_WORDS.startBody,
    ];
    for (const l of lines) expect(usesBannedWord(l), l).toBe(false);
  });

  it('the welcome flow sits behind the intro gate', () => {
    const src = read('app/_layout.tsx');
    expect(src).toMatch(/<IntroGate>\s*<WelcomeScreen \/>\s*<\/IntroGate>/);
  });

  it('the screen list is fixed after a short wait for the watch (review: a button changed under a thumb)', () => {
    const src = read('onboarding/components/IntroSlides.tsx');
    expect(src).toContain('readWatchStateQuick(INTRO_WATCH_WAIT_MS)');
    expect(src).toContain('<ScrollView');
    expect(src).toContain('enqueueWrite(() => setMeta(INTRO_KEY, INTRO_DONE))');
  });

  it('a failed read of the seen mark skips the screens (never blocks setting up)', () => {
    const src = read('onboarding/components/IntroSlides.tsx');
    expect(src).toMatch(/catch\(\(e: unknown\) => \{\s*console\.warn\('\[intro\] could not read the seen mark', e\);\s*if \(live\) setStored\(INTRO_DONE\);/);
  });
});
