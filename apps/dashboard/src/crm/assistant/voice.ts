/**
 * F201 "speak instead of type": records a short clip in the browser (Opus in WebM where the browser can,
 * else what it can), at most 30 seconds, with a level for the meter. The clip goes to /api/assist/voice
 * (api.ts transcribe) and the words come back into the box for the owner to read before anything is asked.
 * The mic button is hidden where the browser cannot record or the page may not use the microphone.
 */

export const MAX_CLIP_SECONDS = 30;
/** The server's limit (deploy/panel/assist.js MAX_CLIP_BYTES). */
export const MAX_CLIP_BYTES = 1_000_000;
/** Opus at this rate keeps 30 seconds well under the 1 MB limit. */
export const CLIP_BITS_PER_SECOND = 24_000;

/** The clip formats tried, best first. */
export const CLIP_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'] as const;

interface PolicyDoc {
  permissionsPolicy?: { allowsFeature(f: string): boolean };
  featurePolicy?: { allowsFeature(f: string): boolean };
}

/** The first clip format this browser records, or '' (let it choose), or null when it cannot record. */
export function clipType(rec: { isTypeSupported?: (t: string) => boolean } | undefined = globalThis.MediaRecorder): string | null {
  if (!rec) return null;
  if (typeof rec.isTypeSupported !== 'function') return '';
  return CLIP_TYPES.find((t) => rec.isTypeSupported!(t)) ?? '';
}

/** Can this page record a voice clip? (A browser with MediaRecorder, a microphone API, and the page allowed it.) */
export function isVoiceSupported(
  g: { navigator?: Navigator; MediaRecorder?: unknown; document?: Document } = globalThis as never,
): boolean {
  try {
    if (!g.MediaRecorder || !g.navigator?.mediaDevices?.getUserMedia) return false;
    const policy = (g.document as unknown as PolicyDoc | undefined)?.permissionsPolicy ?? (g.document as unknown as PolicyDoc | undefined)?.featurePolicy;
    if (policy && !policy.allowsFeature('microphone')) return false;
    return true;
  } catch (e) {
    console.warn('[voice] could not tell if this browser records', e);
    return false;
  }
}

export interface Clip {
  blob: Blob;
  seconds: number;
}

export type VoiceProblem = 'denied' | 'no_mic' | 'failed' | 'too_short';

/** The owner's line for a recording problem. */
export function voiceProblemWords(p: VoiceProblem): string {
  switch (p) {
    case 'denied':
      return 'The microphone is blocked. Allow it in the browser, or type instead.';
    case 'no_mic':
      return 'No microphone was found. Type instead.';
    case 'too_short':
      return 'That was too short. Hold the button and speak.';
    case 'failed':
    default:
      return 'The recording did not work. Type instead.';
  }
}

/** A recording problem from the browser's error. */
export function problemOf(err: unknown): VoiceProblem {
  const name = (err as { name?: unknown })?.name;
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'denied';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'no_mic';
  return 'failed';
}

/** The loudness of a buffer of samples (0 to 1), for the meter. PURE. */
export function levelOf(samples: ArrayLike<number>): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const v = (samples[i] - 128) / 128;
    sum += v * v;
  }
  // RMS of speech sits around 0.05-0.3: stretched so a normal voice fills most of the meter.
  return Math.min(1, Math.sqrt(sum / samples.length) * 3);
}

export interface Recording {
  /** Stop and get the clip (also called by itself at MAX_CLIP_SECONDS). */
  stop(): Promise<Clip | null>;
  /** Throw the clip away. */
  cancel(): void;
}

/**
 * Start recording. `onLevel` gets the loudness about 15 times a second; `onAutoStop` is called when the
 * 30 seconds run out (the clip is then waiting in `stop()`). Throws a VoiceProblem.
 */
export async function startRecording(opts: { onLevel?: (level: number) => void; onAutoStop?: () => void } = {}): Promise<Recording> {
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  } catch (e) {
    console.warn('[voice] no microphone', e);
    throw problemOf(e);
  }
  const type = clipType() ?? '';
  let rec: MediaRecorder;
  try {
    rec = new MediaRecorder(stream, type ? { mimeType: type, audioBitsPerSecond: CLIP_BITS_PER_SECOND } : { audioBitsPerSecond: CLIP_BITS_PER_SECOND });
  } catch (e) {
    stream.getTracks().forEach((t) => t.stop());
    console.warn('[voice] recorder could not start', e);
    throw 'failed' as VoiceProblem;
  }

  const parts: Blob[] = [];
  rec.ondataavailable = (ev) => {
    if (ev.data && ev.data.size > 0) parts.push(ev.data);
  };
  const startedAt = Date.now();

  // The level meter: an analyser on the same stream. Optional: no meter is better than no recording.
  let ctx: AudioContext | null = null;
  let meter: number | null = null;
  if (opts.onLevel) {
    try {
      const AC = (globalThis as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext
        ?? (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AC) {
        ctx = new AC();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        ctx.createMediaStreamSource(stream).connect(analyser);
        const buf = new Uint8Array(analyser.fftSize);
        meter = window.setInterval(() => {
          analyser.getByteTimeDomainData(buf);
          opts.onLevel?.(levelOf(buf));
        }, 66);
      }
    } catch (e) {
      console.warn('[voice] no level meter', e);
    }
  }

  let finished: Promise<Clip | null> | null = null;
  const cleanup = () => {
    if (meter !== null) window.clearInterval(meter);
    meter = null;
    stream.getTracks().forEach((t) => t.stop());
    void ctx?.close().catch(() => undefined);
    ctx = null;
  };
  const stop = (): Promise<Clip | null> => {
    if (finished) return finished;
    finished = new Promise<Clip | null>((resolve) => {
      rec.onstop = () => {
        cleanup();
        const seconds = Math.min(MAX_CLIP_SECONDS, (Date.now() - startedAt) / 1000);
        const blob = new Blob(parts, { type: rec.mimeType || type || 'audio/webm' });
        resolve(seconds < 0.6 || blob.size === 0 ? null : { blob, seconds });
      };
      try {
        if (rec.state !== 'inactive') rec.stop();
        else rec.onstop?.call(rec, new Event('stop'));
      } catch (e) {
        console.warn('[voice] stop failed', e);
        cleanup();
        resolve(null);
      }
    });
    return finished;
  };
  const auto = window.setTimeout(() => {
    void stop();
    opts.onAutoStop?.();
  }, MAX_CLIP_SECONDS * 1000);

  rec.start(250);
  return {
    stop: () => {
      window.clearTimeout(auto);
      return stop();
    },
    cancel: () => {
      window.clearTimeout(auto);
      parts.length = 0;
      void stop();
    },
  };
}
