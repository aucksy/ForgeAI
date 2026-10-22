/**
 * Workout sounds (Phase 1): a bell when rest is over, a rising chime on a new
 * record. One switch in Profile → Workout ("Workout sounds", on by default).
 *
 * Sounds DUCK the member's music rather than stopping it — a gym phone is usually
 * playing something. Players are created lazily on first use and reused. Never
 * throws: no audio simply means no sound.
 *
 * R-55 (22 Oct 2026): the rest bell is the member's own "Rest-over sound" (restSounds.ts), the same
 * file the screen-off "Rest is over" plays.
 */
import { Platform } from 'react-native';

import { useTrackerPrefs } from '../store/trackerPrefsStore';
import type { RestSoundId } from './restSounds';

type AudioModule = typeof import('expo-audio');
type Player = ReturnType<AudioModule['createAudioPlayer']>;

export type WorkoutSound = 'rest' | 'record';

/** Resolved on first play only (static requires, so the bundler still packs them). */
function restSource(id: RestSoundId): number {
  /* eslint-disable @typescript-eslint/no-require-imports */
  switch (id) {
    case 'bell':
      return require('../../../assets/sounds/rest-bell.wav') as number;
    case 'beep':
      return require('../../../assets/sounds/rest-beep.wav') as number;
    case 'whistle':
      return require('../../../assets/sounds/rest-whistle.wav') as number;
    default:
      return require('../../../assets/sounds/rest-done.wav') as number;
  }
  /* eslint-enable @typescript-eslint/no-require-imports */
}

function recordSource(): number {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('../../../assets/sounds/record.wav') as number;
}

let audio: AudioModule | null | undefined;
let modeSet = false;
/** One player per file ("rest:bell", "record"). */
const players = new Map<string, Player>();

function A(): AudioModule | null {
  if (audio !== undefined) return audio;
  if (Platform.OS !== 'android') {
    audio = null;
    return audio;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    audio = require('expo-audio') as AudioModule;
  } catch {
    audio = null;
  }
  return audio;
}

function play(key: string, source: () => number): void {
  const a = A();
  if (!a) return;
  try {
    if (!modeSet) {
      modeSet = true;
      void a
        .setAudioModeAsync({ playsInSilentMode: false, interruptionMode: 'duckOthers', shouldPlayInBackground: false })
        .catch(() => undefined);
    }
    let p = players.get(key);
    if (!p) {
      p = a.createAudioPlayer(source());
      players.set(key, p);
    }
    void p.seekTo(0);
    p.play();
  } catch (e) {
    console.warn('[workout sound] could not play', key, e);
  }
}

export function playWorkoutSound(kind: WorkoutSound): void {
  const prefs = useTrackerPrefs.getState();
  if (!prefs.sounds) return;
  if (kind === 'record') play('record', recordSource);
  else play(`rest:${prefs.restSound}`, () => restSource(prefs.restSound));
}

/** R-55: Settings → Rest-over sound, a tap on a choice: hear it (also with "Workout sounds" off — it was asked for). */
export function previewRestSound(id: RestSoundId): void {
  play(`rest:${id}`, () => restSource(id));
}
