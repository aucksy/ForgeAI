/**
 * F201: speaking a request (canvas board "Voice"). The microphone starts when the sheet opens; "Done" stops it and
 * the words come back to read and fix ("What I heard (you can fix it)"); nothing is asked until "Send to AI
 * Assistant". Up to 30 seconds. Speaking is free (it is a draft), but counts toward the 10 voice minutes a day.
 */
import { useEffect, useRef, useState } from 'react';

import { t } from '../../lang/lang';
import { Button, Sheet, color, font, space } from '../../ui/kit';
import { transcribe } from '../api';
import { markAssistantOff } from '../useAssistant';
import { MAX_CLIP_SECONDS, problemOf, startRecording, voiceProblemWords, type Recording, type VoiceProblem } from '../voice';
import { MicIcon, quiet, say } from './parts';

type Stage = { kind: 'starting' } | { kind: 'listening' } | { kind: 'reading' } | { kind: 'heard'; text: string } | { kind: 'problem'; words: string };

const VOICE_PROBLEMS: readonly VoiceProblem[] = ['denied', 'no_mic', 'failed', 'too_short'];

/** "0:06". PURE. */
export function clockWords(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function VoiceSheet({ assistKey, onClose, onSend }: { assistKey: string; onClose: () => void; onSend: (text: string) => void }) {
  const [stage, setStage] = useState<Stage>({ kind: 'starting' });
  const [level, setLevel] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const rec = useRef<Recording | null>(null);
  const startedAt = useRef(0);
  const gone = useRef(false);

  const finish = async (): Promise<void> => {
    const r = rec.current;
    rec.current = null;
    if (!r) return;
    setStage({ kind: 'reading' });
    const clip = await r.stop();
    if (gone.current) return;
    if (!clip || clip.seconds < 1) {
      setStage({ kind: 'problem', words: t(voiceProblemWords('too_short')) });
      return;
    }
    const heard = await transcribe(assistKey, clip.blob, clip.seconds);
    if (gone.current) return;
    if (heard.ok) {
      setStage({ kind: 'heard', text: heard.text });
      return;
    }
    if ((heard.status === 503 && heard.reason === 'off') || (heard.status === 403 && heard.reason === 'demo')) markAssistantOff();
    setStage({ kind: 'problem', words: say(heard.words) });
  };

  useEffect(() => {
    gone.current = false;
    let timer: number | null = null;
    void (async () => {
      try {
        const r = await startRecording({
          onLevel: (l) => setLevel(l),
          onAutoStop: () => void finish(),
        });
        if (gone.current) {
          r.cancel();
          return;
        }
        rec.current = r;
        startedAt.current = Date.now();
        setStage({ kind: 'listening' });
        timer = window.setInterval(() => setSeconds((Date.now() - startedAt.current) / 1000), 250);
      } catch (e) {
        console.warn('[assistant] the microphone did not start', e);
        const p: VoiceProblem = typeof e === 'string' && (VOICE_PROBLEMS as readonly string[]).includes(e) ? (e as VoiceProblem) : problemOf(e);
        if (!gone.current) setStage({ kind: 'problem', words: t(voiceProblemWords(p)) });
      }
    })();
    return () => {
      gone.current = true;
      if (timer !== null) window.clearInterval(timer);
      rec.current?.cancel();
      rec.current = null;
    };
    // Once per opening: the sheet is made fresh each time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const listening = stage.kind === 'listening' || stage.kind === 'starting';
  const footer =
    stage.kind === 'heard' ? (
      <>
        <Button variant="ghost" onClick={onClose}>
          {t('Cancel')}
        </Button>
        <Button needsInternet disabled={!stage.text.trim()} onClick={() => onSend(stage.text.trim())}>
          {t('Send to AI Assistant')}
        </Button>
      </>
    ) : listening ? (
      <>
        <Button variant="ghost" onClick={onClose}>
          {t('Cancel')}
        </Button>
        <Button disabled={stage.kind !== 'listening'} onClick={() => void finish()}>
          {t('Done')}
        </Button>
      </>
    ) : (
      <Button variant="ghost" onClick={onClose}>
        {t('Close')}
      </Button>
    );

  return (
    <Sheet title={t('AI Assistant')} onClose={onClose} footer={footer}>
      <div style={{ display: 'grid', gap: space.lg, justifyItems: 'center', textAlign: 'center', padding: `${space.md}px 0` }}>
        {listening || stage.kind === 'reading' ? (
          <>
            <p aria-live="polite" style={{ margin: 0, fontFamily: font.body, fontSize: 16, fontWeight: 700, color: color.ink }}>
              {stage.kind === 'reading' ? t('Reading what you said…') : t('Listening… speak in Hindi, English or both')}
            </p>
            <span
              aria-hidden
              style={{
                width: 96,
                height: 96,
                borderRadius: '50%',
                display: 'grid',
                placeItems: 'center',
                background: color.accent,
                color: '#1F0D05',
                boxShadow: `0 0 0 ${Math.round(6 + level * 22)}px ${color.accentSoft}`,
                transition: 'box-shadow 90ms linear',
              }}
            >
              <MicIcon size={40} />
            </span>
            <div aria-hidden style={{ display: 'flex', alignItems: 'center', gap: 4, height: 28 }}>
              {[0.5, 0.8, 1, 0.8, 0.5].map((k, i) => (
                <span key={i} style={{ width: 5, borderRadius: 3, background: color.accentBright, height: Math.max(4, Math.round(28 * Math.min(1, level * k * 1.3))) }} />
              ))}
            </div>
            <p style={{ margin: 0, fontFamily: font.display, fontSize: 22, fontWeight: 700, color: color.ink, fontVariantNumeric: 'tabular-nums' }}>{clockWords(seconds)}</p>
            <p style={quiet}>{t('Up to {n} seconds', { n: MAX_CLIP_SECONDS })}</p>
          </>
        ) : stage.kind === 'heard' ? (
          <label style={{ display: 'grid', gap: space.sm, width: '100%', textAlign: 'left' }}>
            <span style={{ fontFamily: font.body, fontSize: 13, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: color.inkMuted }}>{t('What I heard (you can fix it)')}</span>
            <textarea
              value={stage.text}
              onChange={(e) => setStage({ kind: 'heard', text: e.target.value.slice(0, 600) })}
              rows={4}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: 12,
                borderRadius: 12,
                border: `1px solid ${color.borderStrong}`,
                background: color.surfaceSunken,
                color: color.ink,
                fontFamily: font.body,
                fontSize: 16,
                lineHeight: 1.45,
                resize: 'vertical',
              }}
            />
          </label>
        ) : (
          <p role="alert" style={{ margin: 0, fontFamily: font.body, fontSize: 15, color: color.criticalText, lineHeight: 1.45 }}>
            {stage.words}
          </p>
        )}
      </div>
    </Sheet>
  );
}
