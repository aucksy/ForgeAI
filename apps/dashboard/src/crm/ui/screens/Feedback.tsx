/** More → Send feedback (launch H7): write to ForgeAI; the words are in logic/feedback.ts. */

import { useState } from 'react';

import { FEEDBACK_MAX, FEEDBACK_WORDS, sendFeedback } from '../../logic/feedback';
import { Button, Card, PageHeader, TextField, color, font, space } from '../kit';

export function FeedbackScreen() {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; words: string } | null>(null);

  const send = async () => {
    if (sending) return;
    setSending(true);
    setNote(null);
    const r = await sendFeedback(text, 'more/feedback');
    setSending(false);
    if (r.ok) {
      setText('');
      setNote({ ok: true, words: FEEDBACK_WORDS.sent });
    } else {
      setNote({ ok: false, words: r.words });
    }
  };

  return (
    <>
      <PageHeader title="Send feedback" />
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
        {note ? (
          <p
            role="status"
            style={{ margin: `${space.md}px 0 0`, fontFamily: font.body, fontSize: 15, fontWeight: 600, color: note.ok ? color.goodText : color.criticalText }}
          >
            {note.words}
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
