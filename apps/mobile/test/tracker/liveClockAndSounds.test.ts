import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { liveClock } from '@/tracker/services/liveClock';
import { DEFAULT_REST_SOUND, isRestSoundId, REST_SOUND_CHOICES, restSoundFootnote } from '@/tracker/services/restSounds';
import { activeMs, NO_PAUSE } from '@/tracker/services/workoutPause';

const MIN = 60_000;

describe('R-55: the workout time on the notification card', () => {
  const start = 1_000_000_000_000;

  it('running: a fixed start point, so Android ticks it without updates', () => {
    const a = liveClock(start, NO_PAUSE, start + 10 * MIN);
    const b = liveClock(start, NO_PAUSE, start + 10 * MIN + 7_000);
    expect(a).toEqual({ base: start });
    expect(b).toEqual(a); // the same every second: the card is not re-posted to tick
  });

  it('paused time is left out, exactly as the in-app WORKOUT DURATION', () => {
    const pause = { pausedAt: null, pausedTotalMs: 5 * MIN, pauses: [{ from: start + 2 * MIN, to: start + 7 * MIN }] };
    const now = start + 30 * MIN;
    const c = liveClock(start, pause, now);
    expect(c).toEqual({ base: start + 5 * MIN });
    expect(now - (c as { base: number }).base).toBe(activeMs(start, pause, now)); // 25 minutes
  });

  it('paused: the time stands still', () => {
    const pause = { pausedAt: start + 20 * MIN, pausedTotalMs: 0, pauses: [] };
    expect(liveClock(start, pause, start + 26 * MIN)).toEqual({ paused: 20 * MIN });
    expect(liveClock(start, pause, start + 40 * MIN)).toEqual({ paused: 20 * MIN });
  });

  it('no workout start: no clock', () => {
    expect(liveClock(null, NO_PAUSE, start)).toBeNull();
    expect(liveClock(Number.NaN, NO_PAUSE, start)).toBeNull();
  });
});

describe('R-55: pick your rest-over sound', () => {
  it('the ForgeAI chime stays the default (owner R-43), with three others', () => {
    expect(DEFAULT_REST_SOUND).toBe('forge');
    expect(REST_SOUND_CHOICES.map((c) => c.value)).toEqual(['forge', 'bell', 'beep', 'whistle']);
    expect(REST_SOUND_CHOICES.filter((c) => c.recommended).map((c) => c.value)).toEqual(['forge']);
  });

  it('an unknown stored sound falls back to the chime', () => {
    expect(isRestSoundId('bell')).toBe(true);
    expect(isRestSoundId('gong')).toBe(false);
    expect(isRestSoundId(undefined)).toBe(false);
  });

  it('with Workout sounds off the sheet says Rest is over only buzzes', () => {
    expect(restSoundFootnote(false)).toMatch(/only buzzes/);
    expect(restSoundFootnote(true)).toMatch(/screen off/);
  });

  // An alert has two sound paths (memory note): the open app and the screen-off channel must play
  // the SAME file, or members hear two different sounds for one rest.
  it('each sound is one file on both paths, byte for byte', () => {
    const root = join(__dirname, '..', '..');
    for (const c of REST_SOUND_CHOICES) {
      const app = c.value === 'forge' ? 'rest-done.wav' : `rest-${c.value}.wav`;
      const raw = c.value === 'forge' ? 'forge_rest_done.wav' : `forge_rest_${c.value}.wav`;
      const a = readFileSync(join(root, 'assets', 'sounds', app));
      const b = readFileSync(join(root, 'modules', 'forge-rest', 'android', 'src', 'main', 'res', 'raw', raw));
      expect(a.equals(b), `${app} vs ${raw}`).toBe(true);
    }
  });

  it('every raw sound is kept from the release build\'s shrinker', () => {
    const keep = readFileSync(
      join(__dirname, '..', '..', 'modules', 'forge-rest', 'android', 'src', 'main', 'res', 'raw', 'forge_rest_keep.xml'),
      'utf8',
    );
    for (const c of REST_SOUND_CHOICES) {
      const raw = c.value === 'forge' ? 'forge_rest_done' : `forge_rest_${c.value}`;
      expect(keep).toContain(`@raw/${raw}`);
    }
  });
});
