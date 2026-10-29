/**
 * Spoken feedback (R-206, 30 Oct 2026). The member taps Speak, talks (Hindi or English), taps Stop.
 * The clip goes to MettleUp's feedback box (/api/feedback/voice), which turns it into text with Groq's
 * Whisper on the owner's key (deploy/panel/voice.js; the key never sits in the app). The text lands in
 * the message box; the member checks it and taps Send as before. The clip is deleted from the phone
 * after it is sent and never kept by the server. The phone's own speech to text is no longer used
 * here: it was poor, worse with gym music.
 *
 * The pure parts (tested in test/lib/feedbackVoice.test.ts) and the upload.
 */
import type { RecordingOptions } from 'expo-audio';
import { File } from 'expo-file-system';

import { FEEDBACK_MAX, FEEDBACK_URLS, senderId } from '@/lib/feedback';
import { fetchWithTimeout } from '@/lib/fetchTimeout';

/** A clip stops by itself after this long (the server takes about 2 minutes at the rate below). */
export const MAX_CLIP_MS = 120_000;
/** Shorter than this is a slip of the finger: nothing is sent. */
export const MIN_CLIP_MS = 1_000;

/** Small speech clips: mono AAC in an .m4a, 16 kHz, 32 kbps (~240 KB a minute). Whisper works at 16 kHz. */
export const CLIP_OPTIONS: RecordingOptions = {
  extension: '.m4a',
  sampleRate: 16_000,
  numberOfChannels: 1,
  bitRate: 32_000,
  isMeteringEnabled: true,
  android: { outputFormat: 'mpeg4', audioEncoder: 'aac' },
  ios: { outputFormat: 'aac ', audioQuality: 64 },
  web: { mimeType: 'audio/webm', bitsPerSecond: 32_000 },
};

/** The words a member reads (member-words skill, R-98). */
export const VOICE_WORDS = {
  speak: 'Speak',
  speakLabel: 'Start recording your feedback',
  stop: 'Stop',
  stopLabel: 'Stop recording and turn it into text',
  cancel: 'Cancel',
  listening: 'Listening. Speak in Hindi or English, then tap Stop.',
  writing: 'Turning your voice into text…',
  check: 'Check the text. Fix anything, then tap Send.',
  tooShort: 'That was too short. Tap Speak and talk for a few seconds.',
  micOff: 'MettleUp needs the microphone to hear you. Allow it in your phone Settings, or type instead.',
  openSettings: 'Open Settings',
  offline: "Couldn't reach us. Check your internet and try again, or type.",
  failed: "Couldn't turn your voice into text. Try again, or type.",
  privacy: 'When you tap Stop, your recording goes to our speech-to-text service and is then deleted. Nothing is sent to us until you tap Send.',
} as const;

export type VoiceResult = { ok: true; text: string } | { ok: false; words: string };

/** What the box's answer means for the member. PURE. */
export function voiceAnswer(status: number, body: unknown): VoiceResult {
  const b = body && typeof body === 'object' ? (body as { text?: unknown; error?: unknown }) : {};
  if (status === 200 && typeof b.text === 'string' && b.text.trim()) return { ok: true, text: b.text.trim() };
  // The box's own words for what the member can act on: too long, nothing heard, limits, switched off.
  if ([413, 422, 429, 503].includes(status) && typeof b.error === 'string' && b.error) return { ok: false, words: b.error };
  return { ok: false, words: status >= 400 || status === 200 ? VOICE_WORDS.failed : VOICE_WORDS.offline };
}

/** The heard text added to what the member already typed (a new line between), within the limit. PURE. */
export function mergeHeard(existing: string, heard: string, max = FEEDBACK_MAX): string {
  const a = existing.trimEnd();
  const b = heard.trim();
  if (!b) return existing;
  return (a ? `${a}\n${b}` : b).slice(0, max);
}

/** 0:07, 1:45. PURE. */
export function clipClock(ms: number): string {
  const s = Math.max(0, Math.floor((Number.isFinite(ms) ? ms : 0) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** The microphone level (dB, -160 silent … 0 loudest) as 0…1 for the level bar. PURE. */
export function levelFromMetering(db: number | undefined): number {
  if (db == null || !Number.isFinite(db)) return 0;
  return Math.min(1, Math.max(0, (db + 50) / 50));
}

/** The voice address next to each feedback box address, newest first. PURE. */
export const VOICE_URLS = FEEDBACK_URLS.map((u) => `${u}/voice`);

/**
 * Send the clip; the next address only when one gave no answer or "not here" (404). A server answer
 * (502 Groq failed, 503 switched off) is final: trying the next address would spend a second
 * transcription for the same clip.
 */
export async function transcribe(uri: string, post: typeof fetchWithTimeout = fetchWithTimeout): Promise<VoiceResult> {
  const sender = await senderId();
  for (let i = 0; i < VOICE_URLS.length; i++) {
    const last = i === VOICE_URLS.length - 1;
    const form = new FormData();
    // React Native reads the file from its uri; the object form is RN's, not the web's Blob.
    form.append('audio', { uri, name: 'feedback.m4a', type: 'audio/mp4' } as unknown as Blob);
    if (sender) form.append('sender', sender);
    try {
      const res = await post(VOICE_URLS[i], { method: 'POST', body: form }, 45_000);
      if (!last && res.status === 404) {
        console.warn('[feedback-voice] box address answered', res.status, VOICE_URLS[i], '; trying the next');
        continue;
      }
      let body: unknown = null;
      try {
        body = await res.json();
      } catch {
        body = null; // quiet: judged by its status alone
      }
      if (res.status !== 200) console.warn('[feedback-voice] box answered', res.status, body);
      return voiceAnswer(res.status, body);
    } catch (e) {
      console.warn('[feedback-voice] box address gave no answer', VOICE_URLS[i], e);
      if (last) return { ok: false, words: VOICE_WORDS.offline };
    }
  }
  return { ok: false, words: VOICE_WORDS.offline };
}

/** The clip is deleted from the phone once it is sent (or thrown away). */
export function deleteClip(uri: string | null | undefined): void {
  if (!uri) return;
  try {
    const f = new File(uri);
    if (f.exists) f.delete();
  } catch (e) {
    console.warn('[feedback-voice] clip not deleted', e);
  }
}
