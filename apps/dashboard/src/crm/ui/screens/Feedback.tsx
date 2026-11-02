/** More → Send feedback (launch H7): write to MettleUp; the words are in logic/feedback.ts. */

import { useState } from 'react';

import { FEEDBACK_MAX, FEEDBACK_WORDS, rateHelp, sendFeedback, type HelpReply } from '../../logic/feedback';
import { Button, Card, PageHeader, TextField, color, font, space } from '../kit';

export function FeedbackScreen() {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; words: string; reply?: HelpReply } | null>(null);
  const [rated, setRated] = useState<'yes' | 'no' | null>(null);

  const send = async () => {
    if (sending) return;
    setSending(true);
    setNote(null);
    setRated(null);
    const r = await sendFeedback(text, 'more/feedback');
    setSending(false);
    if (r.ok) {
      setText('');
      setNote({ ok: true, words: FEEDBACK_WORDS.sent, reply: r.reply });
    } else {
      setNote({ ok: false, words: r.words });
    }
  };

  return (
    <>
      <PageHeader title="Help and feedback" />
      <Card>
        <p style={{ margin: 0, fontFamily: font.body, fontSize: 15, lineHeight: 1.5, color: color.inkSecondary }}>{FEEDBACK_WORDS.intro}</p>
        <TextField
          label="Your message"
          value={text}
          onChange={(v) => {
            setText(v.slice(0, FEEDBACK_MAX));
            if (note?.ok) setNote(null);
          }}
          multiline
        />
        {note?.reply?.ai ? (
          <div role="status" style={{ marginTop: space.md, padding: space.md, borderRadius: 12, border: `1px solid ${color.border}`, background: color.surfaceSunken }}>
            <p style={{ margin: 0, fontFamily: font.body, fontSize: 15, lineHeight: 1.5, color: color.ink, whiteSpace: 'pre-wrap' }}>{note.reply.text}</p>
            <p style={{ margin: `${space.sm}px 0 0`, fontFamily: font.body, fontSize: 12, color: color.inkMuted }}>{FEEDBACK_WORDS.aiNote}</p>
            {rated ? (
              <p style={{ margin: `${space.sm}px 0 0`, fontFamily: font.body, fontSize: 15, fontWeight: 600, color: color.goodText }}>
                {rated === 'yes' ? FEEDBACK_WORDS.thanksYes : FEEDBACK_WORDS.thanksNo}
              </p>
            ) : (
              <div style={{ marginTop: space.sm, display: 'flex', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' }}>
                <span style={{ flexGrow: 1, fontFamily: font.body, fontSize: 15, fontWeight: 600, color: color.inkSecondary }}>{FEEDBACK_WORDS.solved}</span>
                {(['yes', 'no'] as const).map((h) => (
                  <Button
                    key={h}
                    variant="ghost"
                    onClick={() => {
                      setRated(h);
                      if (note.reply?.id != null) void rateHelp(note.reply.id, h);
                    }}
                  >
                    {h === 'yes' ? 'Yes' : 'No'}
                  </Button>
                ))}
              </div>
            )}
          </div>
        ) : note ? (
          <p
            role="status"
            style={{ margin: `${space.md}px 0 0`, fontFamily: font.body, fontSize: 15, fontWeight: 600, color: note.ok ? color.goodText : color.criticalText }}
          >
            {note.reply?.text ?? note.words}
          </p>
        ) : null}
        <div style={{ marginTop: space.md }}>
          <Button onClick={() => void send()} disabled={sending || !text.trim()} full>
            {sending ? 'Sending…' : 'Send'}
          </Button>
        </div>
      </Card>
    </>
  );
}
