/**
 * More → Send feedback (launch H7): write to MettleUp; the words are in logic/feedback.ts.
 * R-449: the owner's "MettleUp access" card (let MettleUp support look, and every look) lives here, under
 * the questions, where an owner goes when support needs to see his records (it was under Settings → Sign-in & data).
 */

import { useEffect, useRef, useState } from 'react';

import {
  FEEDBACK_MAX,
  FEEDBACK_WORDS,
  markHistorySeen,
  rateHelp,
  readHistory,
  refreshHistory,
  sendFeedback,
  type HelpReply,
} from '../../logic/feedback';
import { anyWaiting, HELP_HISTORY_WORDS as H, questionShows, type HelpQuestion } from '../../logic/helpHistory';
import { useAuth, useCan } from '../../auth/AuthProvider';
import { ForgeAccessCard } from '../ForgeAccessCard';
import { Button, Card, PageHeader, TextField, color, font, space } from '../kit';

const POLL_MS = 5_000;

export function FeedbackScreen() {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; words: string; reply?: HelpReply } | null>(null);
  const [rated, setRated] = useState<'yes' | 'no' | null>(null);
  // MettleUp access: owners of an online gym only (the server refuses anyone else), as on Settings before.
  const online = useAuth().session?.online === true;
  const owner = useCan()('eraseOrDemo');

  // R-319 item 10: "Your questions", kept in this browser, with late answers and the team's replies.
  const [history, setHistory] = useState<HelpQuestion[]>(() => readHistory());

  const send = async () => {
    if (sending) return;
    setSending(true);
    setNote(null);
    setRated(null);
    const pending = sendFeedback(text, 'more/feedback');
    setHistory(readHistory());
    const r = await pending;
    setHistory(readHistory());
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
                      if (note.reply?.id != null) {
                        void rateHelp(note.reply.id, h).then(() => setHistory(readHistory()));
                      }
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
        ) : sending ? (
          <p role="status" style={{ margin: `${space.md}px 0 0`, fontFamily: font.body, fontSize: 15, color: color.inkSecondary }}>
            {H.sending}
          </p>
        ) : null}
        <div style={{ marginTop: space.md }}>
          <Button onClick={() => void send()} disabled={sending || !text.trim()} full>
            {sending ? 'Sending…' : 'Send'}
          </Button>
        </div>
      </Card>
      <YourQuestions history={history} setHistory={setHistory} />
      {online && owner && <ForgeAccessCard />}
    </>
  );
}

function day(at: number): string {
  try {
    return new Date(at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  } catch (e) {
    console.warn('[help] date not shown', e);
    return '';
  }
}

/** Every question sent from this browser, newest first, with its answer and any reply from the team. */
function YourQuestions({ history, setHistory }: { history: HelpQuestion[]; setHistory: (h: HelpQuestion[]) => void }) {
  const [now, setNow] = useState(() => Date.now());
  const [newKeys, setNewKeys] = useState<Set<string>>(() => new Set());
  const seenOnce = useRef(new Set<string>());

  useEffect(() => {
    void refreshHistory().then(setHistory);
  }, [setHistory]);

  // A reply not opened before is "New" while this page is open; it counts as seen at once.
  useEffect(() => {
    const fresh = history.filter((q) => q.reply && !q.replySeen && !seenOnce.current.has(`${q.key}:${q.replyAt}`));
    if (fresh.length === 0) return;
    for (const q of fresh) seenOnce.current.add(`${q.key}:${q.replyAt}`);
    setNewKeys((prev) => new Set([...prev, ...fresh.map((q) => q.key)]));
    setHistory(markHistorySeen());
  }, [history, setHistory]);

  // An answer on its way: ask again every few seconds.
  const waiting = anyWaiting(history, now);
  useEffect(() => {
    if (!waiting) return;
    const t = window.setInterval(() => {
      setNow(Date.now());
      void refreshHistory().then(setHistory);
    }, POLL_MS);
    return () => window.clearInterval(t);
  }, [waiting, setHistory]);

  const text = (size: number, c: string, weight = 400) => ({ margin: 0, fontFamily: font.body, fontSize: size, lineHeight: 1.5, color: c, fontWeight: weight }) as const;
  return (
    <Card style={{ marginTop: space.lg }}>
      <h2 style={{ margin: 0, fontFamily: font.display, fontSize: 18, color: color.ink }}>{H.title}</h2>
      {history.length === 0 ? (
        <p style={{ ...text(15, color.inkSecondary), marginTop: space.sm }}>{H.empty}</p>
      ) : (
        history.map((q) => {
          const shows = questionShows(q, now);
          const isNew = newKeys.has(q.key);
          return (
            <div key={q.key} style={{ marginTop: space.md, paddingTop: space.md, borderTop: `1px solid ${color.border}`, display: 'grid', gap: space.xs }}>
              <p style={text(12, color.inkMuted)}>{day(q.at)}</p>
              <p style={{ ...text(15, color.ink, 600), whiteSpace: 'pre-wrap' }}>{q.text}</p>
              {shows === 'waiting' ? <p role="status" style={text(15, color.inkSecondary)}>{H.waiting}</p> : null}
              {shows === 'answer' ? (
                <div style={{ padding: space.md, borderRadius: 12, border: `1px solid ${color.border}`, background: color.surfaceSunken }}>
                  <p style={{ ...text(15, color.ink), whiteSpace: 'pre-wrap' }}>{q.answer}</p>
                  <p style={{ ...text(12, color.inkMuted), marginTop: space.xs }}>{FEEDBACK_WORDS.aiNote}</p>
                  {q.rated ? <p style={{ ...text(13, color.inkSecondary), marginTop: space.xs }}>{q.rated === 'yes' ? H.youSaidYes : H.youSaidNo}</p> : null}
                </div>
              ) : null}
              {shows === 'team-will-reply' ? <p style={text(15, color.inkSecondary)}>{H.teamWillReply}</p> : null}
              {q.reply ? (
                <div
                  style={{ padding: space.md, borderRadius: 12, border: `1px solid ${isNew ? color.accent : color.border}`, background: color.surfaceSunken }}
                >
                  <p style={text(13, color.ink, 700)}>
                    {H.replyTitle}
                    {isNew ? (
                      <span style={{ marginLeft: space.sm, padding: '1px 8px', borderRadius: 999, background: color.accentSoft, color: color.ink, fontSize: 12 }}>
                        {H.newBadge}
                      </span>
                    ) : null}
                  </p>
                  <p style={{ ...text(15, color.ink), whiteSpace: 'pre-wrap', marginTop: space.xs }}>{q.reply}</p>
                </div>
              ) : null}
            </div>
          );
        })
      )}
    </Card>
  );
}
