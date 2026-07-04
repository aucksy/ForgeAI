import { useCallback, useState } from 'react';
import * as Speech from 'expo-speech';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';

/**
 * expo-speech-recognition seam — graceful everywhere: `available` turns false
 * (never throws) on web/emulator/denied permission. `partial` always holds the
 * latest transcript, interim or final.
 */
export function useVoiceInput(): {
  available: boolean;
  listening: boolean;
  partial: string;
  start: (lang: 'en-IN' | 'hi-IN') => Promise<void>;
  stop: () => Promise<void>;
} {
  const [available, setAvailable] = useState<boolean>(() => {
    try {
      return ExpoSpeechRecognitionModule.isRecognitionAvailable();
    } catch {
      return false;
    }
  });
  const [listening, setListening] = useState(false);
  const [partial, setPartial] = useState('');

  useSpeechRecognitionEvent('start', () => setListening(true));
  useSpeechRecognitionEvent('result', (event) => {
    const transcript = event.results[0]?.transcript;
    if (typeof transcript === 'string') setPartial(transcript);
  });
  useSpeechRecognitionEvent('end', () => setListening(false));
  useSpeechRecognitionEvent('error', (event) => {
    setListening(false);
    if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
      setAvailable(false);
    }
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
          if (!permission.canAskAgain) setAvailable(false);
          return;
        }
        setPartial('');
        ExpoSpeechRecognitionModule.start({
          lang,
          interimResults: true,
          continuous: false,
        });
      } catch {
        setAvailable(false);
      }
    },
    [available, listening],
  );

  const stop = useCallback(async () => {
    try {
      ExpoSpeechRecognitionModule.stop();
    } catch {
      setListening(false);
    }
  }, []);

  return { available, listening, partial, start, stop };
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
