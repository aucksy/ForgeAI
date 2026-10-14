/**
 * Audit M3: why the Coach mic did not listen, in plain words. PURE (voice.ts needs the native
 * speech module, so the words live here where tests can reach them).
 *  - 'denied':     the microphone is off for ForgeAI — the way round is the app's settings;
 *  - 'speech-off': the phone's speech recognition (voice typing) is off — not the microphone;
 *  - 'error':      listening could not start — the mic stays, and the member can hold it again.
 */
export type VoiceProblem = 'denied' | 'speech-off' | 'error';

export function voiceProblemText(p: VoiceProblem): string {
  if (p === 'denied') return 'The microphone is off for ForgeAI, so the coach can’t hear you.';
  if (p === 'speech-off') return 'Voice typing is off on this phone. Turn on Google voice typing in your phone settings.';
  return 'Couldn’t start listening. Hold the mic to try again.';
}

/** The recognizer's "not allowed" errors: the microphone permission, or speech turned off. */
export function voiceProblemFor(code: string | undefined): VoiceProblem | null {
  if (code === 'not-allowed') return 'denied';
  if (code === 'service-not-allowed') return 'speech-off';
  return null;
}
