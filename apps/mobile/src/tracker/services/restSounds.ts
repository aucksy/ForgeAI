/**
 * R-55 (22 Oct 2026, owner backlog "Pick your rest-over sound"): the sound "Rest is over" plays.
 *
 * The ForgeAI chime stays the default (owner R-43: most members never change it, so the gym still
 * hears "the ForgeAI sound"). Three others let a member tell their rest from a gym friend's: several
 * phones ringing the same sound at once is the real problem. "Vibrate only" is the existing
 * "Workout sounds" switch, not a fourth choice here.
 *
 * Every sound plays the SAME file on both paths (memory note an-alert-has-two-sound-paths):
 * assets/sounds/rest-<id>.wav for the open app's bell, res/raw/forge_rest_<id>.wav for the
 * "Rest is over" channels (RestCard.kt, one channel per sound). Both are written by
 * scripts/make_rest_sounds.py. PURE.
 */
import type { PrefChoice } from './targetChoices';

export type RestSoundId = 'forge' | 'bell' | 'beep' | 'whistle';

export const DEFAULT_REST_SOUND: RestSoundId = 'forge';

export const REST_SOUND_CHOICES: readonly PrefChoice<RestSoundId>[] = [
  { value: 'forge', label: 'ForgeAI chime', detail: 'Two rising notes', recommended: true },
  { value: 'bell', label: 'Bell', detail: 'One deep bell' },
  { value: 'beep', label: 'Double beep', detail: 'Two short beeps, like a sports timer' },
  { value: 'whistle', label: 'Whistle', detail: "A coach's whistle" },
];

/** A sound this version knows. PURE. */
export function isRestSoundId(v: unknown): v is RestSoundId {
  return v === 'forge' || v === 'bell' || v === 'beep' || v === 'whistle';
}

/**
 * The "Rest is over" channel for a sound: the chime keeps the original id, every other sound has
 * its own (RestCard.kt makes it when the sound is picked). PURE.
 */
export function overSoundChannel(id: RestSoundId): string {
  return id === 'forge' ? 'rest-over-sound' : `rest-over-sound-${id}`;
}

/** The sheet's line under the choices, as "Workout sounds" stands. PURE. */
export function restSoundFootnote(soundsOn: boolean): string {
  return soundsOn
    ? 'Tap a sound to hear it here, at your media volume. Rest is over plays it at your notification volume.'
    : 'Workout sounds are off, so Rest is over only buzzes. Turn them on to hear this sound.';
}
