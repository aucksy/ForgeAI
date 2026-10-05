/**
 * Workout sounds (Phase 1): a bell when rest is over, a rising chime on a new
 * record. One switch in Profile → Workout ("Workout sounds", on by default).
 *
 * Sounds DUCK the member's music rather than stopping it — a gym phone is usually
 * playing something. Players are created lazily on first use and reused. Never
 * throws: no audio simply means no sound.
 */
import { Platform } from 'react-native';

import { useTrackerPrefs } from '../store/trackerPrefsStore';

type AudioModule = typeof import('expo-audio');
type Player = ReturnType<AudioModule['createAudioPlayer']>;

export type WorkoutSound = 'rest' | 'record';

/** Resolved on first play only (static requires, so the bundler still packs them). */
function source(kind: WorkoutSound): number {
  /* eslint-disable @typescript-eslint/no-require-imports */
  return kind === 'rest'
    ? (require('../../../assets/sounds/rest-done.wav') as number)
    : (require('../../../assets/sounds/record.wav') as number);
  /* eslint-enable @typescript-eslint/no-require-imports */
}

let audio: AudioModule | null | undefined;
let modeSet = false;
const players: Partial<Record<WorkoutSound, Player>> = {};

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

export function playWorkoutSound(kind: WorkoutSound): void {
  if (!useTrackerPrefs.getState().sounds) return;
  const a = A();
  if (!a) return;
  try {
    if (!modeSet) {
      modeSet = true;
      void a
        .setAudioModeAsync({ playsInSilentMode: false, interruptionMode: 'duckOthers', shouldPlayInBackground: false })
        .catch(() => undefined);
    }
    let p = players[kind];
    if (!p) {
      p = a.createAudioPlayer(source(kind));
      players[kind] = p;
    }
    void p.seekTo(0);
    p.play();
  } catch {
    // ignore
  }
}
