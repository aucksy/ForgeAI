import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import * as Speech from 'expo-speech';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';

import { voiceProblemFor, type VoiceProblem } from './voiceProblem';

/**
 * expo-speech-recognition seam — graceful everywhere: `available` is false (never throws) where
 * the phone has no speech recognition (web/emulator). Audit M3: a refused microphone or a failed
 * start no longer hides the mic for good — `problem` says why, and the next hold tries again.
 * `partial` always holds the latest transcript, interim or final.
 */
export function useVoiceInput(): {
  available: boolean;
  listening: boolean;
  partial: string;
  /** Why the last hold did not listen (null = fine). Cleared by the next start. */
  problem: VoiceProblem | null;
  start: (lang: 'en-IN' | 'hi-IN') => Promise<void>;
  stop: () => Promise<void>;
} {
  const [available] = useState<boolean>(() => {
    try {
      return ExpoSpeechRecognitionModule.isRecognitionAvailable();
    } catch (e) {
      console.warn('[ForgeErr] speech recognition check failed', e);
      return false;
    }
  });
  const [problem, setProblem] = useState<VoiceProblem | null>(null);
  const [listening, setListening] = useState(false);
  const [partial, setPartial] = useState('');

  // Back from the app's settings with the microphone allowed: the line goes.
  useEffect(() => {
    if (problem !== 'denied') return;
    const sub = AppState.addEventListener('change', (a) => {
      if (a !== 'active') return;
      ExpoSpeechRecognitionModule.getPermissionsAsync()
        .then((p) => {
          if (p.granted) setProblem(null);
        })
        .catch((e: unknown) => console.warn('[ForgeErr] microphone permission check failed', e));
    });
    return () => sub.remove();
  }, [problem]);

  useSpeechRecognitionEvent('start', () => setListening(true));
  useSpeechRecognitionEvent('result', (event) => {
    const transcript = event.results[0]?.transcript;
    if (typeof transcript === 'string') setPartial(transcript);
  });
  useSpeechRecognitionEvent('end', () => setListening(false));
  useSpeechRecognitionEvent('error', (event) => {
    setListening(false);
    const why = voiceProblemFor(event.error);
    if (why) setProblem(why);
  });

  const start = useCallback(
    async (lang: 'en-IN' | 'hi-IN') => {
      if (!available || listening) return;
      try {
        let permission = await ExpoSpeechRecognitionModule.getPermissionsAsync();
        if (!permission.granted) {
          permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
        }
        if (!permission.granted) {
          // The member's own choice: said, with the way to turn it on — not an error to log.
          setProblem('denied');
          return;
        }
        setProblem(null);
        setPartial('');
        ExpoSpeechRecognitionModule.start({
          lang,
          interimResults: true,
          continuous: false,
        });
      } catch (e) {
        console.warn('[ForgeErr] voice input could not start', e);
        setListening(false);
        setProblem('error');
      }
    },
    [available, listening],
  );

  const stop = useCallback(async () => {
    try {
      ExpoSpeechRecognitionModule.stop();
    } catch (e) {
      console.warn('[ForgeErr] voice input could not stop', e);
      setListening(false);
    }
  }, []);

  return { available, listening, partial, problem, start, stop };
}

/** Fire-and-forget TTS for coach replies. Never throws. */
export function speak(text: string): void {
  if (!text.trim()) return;
  try {
    Speech.speak(text, { rate: 1.0, language: 'en-IN' });
  } catch {
    // TTS unavailable (web/emulator) — silently ignore.
  }
}
