/**
 * R-319 item 1 "Questions" (/questions): what members asked in their app's "Ask a trainer", for the person they
 * picked. Waiting questions first (the longest wait on top), each with a reply box; answered and closed ones under
 * them. The reply shows in the member's app and pops up on their phone (push kind 'trainer_reply').
 *
 * Who sees what is the server's rule: a trainer sees questions asked to them and to "Any trainer"; the owner sees
 * questions asked to the owner and to "Any trainer", NOT another trainer's (owner decision, 4 Nov 2026). The desk
 * without the Trainer tick is refused. Hidden until the gym's server has 0053. Rules and words:
 * logic/askQuestions.ts.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import { useAuth } from '../../auth/AuthProvider';
import {
  QUESTION_WORDS as W,
  REPLY_MAX,
  closedText,
  questionErrorWords,
  splitQuestions,
  toWhomLine,
  whenText,
  type GymQuestion,
  type GymQuestions,
} from '../../logic/askQuestions';
import { errorWords } from '../../shop/logic';
import * as questionsApi from '../../shop/questionsApi';
import { useCrm } from '../../store';
import { Button, Card, EmptyState, ErrorBanner, PageHeader, Pill, Row, SectionTitle, TextField, color, font, space } from '../kit';
import { navigate } from '../router';
import { refreshQuestionCount } from '../QuestionParts';

type Load =
  | { state: 'loading' }
  | { state: 'missing' }
  | { state: 'refused' }
  | { state: 'error'; message: string }
  | { state: 'ready'; data: GymQuestions };

const quiet = { margin: 0, fontFamily: font.body, fontSize: 14, color: color.inkSecondary } as const;
const small = { ...quiet, fontSize: 13, color: color.inkMuted } as const;
const said = { margin: 0, fontFamily: font.body, fontSize: 15, color: color.ink, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' } as const;

export function QuestionsScreen() {
  const { session } = useAuth();
  const { today } = useCrm();
  const key = session?.online ? (session.ownerKey ?? null) : null;
  const myStaffId = session?.person?.staffId ?? null;
  const [load, setLoad] = useState<Load>({ state: 'loading' });

  const fetchList = useCallback(async () => {
    if (!key) return;
    setLoad((l) => (l.state === 'ready' ? l : { state: 'loading' }));
    try {
      const r = await questionsApi.getQuestions(key);
      setLoad(r === 'missing' ? { state: 'missing' } : r === 'refused' ? { state: 'refused' } : { state: 'ready', data: r });
    } catch (e) {
      console.warn('[ForgeErr] questions: reading', e);
      setLoad({ state: 'error', message: questionErrorWords(e) ?? errorWords(e) });
    }
  }, [key]);

  useEffect(() => {
    void fetchList();
  }, [fetchList]);

  const parts = useMemo(() => (load.state === 'ready' ? splitQuestions(load.data.questions) : null), [load]);

  const replaced = (q: GymQuestion): void => {
    setLoad((l) => (l.state === 'ready' ? { state: 'ready', data: { ...l.data, open: Math.max(0, l.data.open - 1), questions: l.data.questions.map((x) => (x.id === q.id ? q : x)) } } : l));
    refreshQuestionCount();
  };

  return (
    <>
      <PageHeader
        title={W.title}
        subtitle={W.intro}
        actions={
          // Fresh eyes (14 Nov 2026): with the error card's "Try again" under it, two buttons did the same thing.
          load.state === 'error' ? undefined : (
            <Button variant="ghost" onClick={() => void fetchList().then(refreshQuestionCount)}>
              Refresh
            </Button>
          )
        }
      />
      {!key ? (
        <Card>
          <EmptyState title="Questions need your gym online" body="Put your gym online first (Settings → Sign-in & data)." />
        </Card>
      ) : load.state === 'missing' ? (
        <Card>
          <EmptyState title={W.notReady} />
        </Card>
      ) : load.state === 'refused' ? (
        <Card>
          <EmptyState title={W.notAllowed} />
        </Card>
      ) : load.state === 'error' ? (
        <Card>
          <ErrorBanner>{load.message}</ErrorBanner>
          <Button variant="ghost" onClick={() => void fetchList()}>
            {W.tryAgain}
          </Button>
        </Card>
      ) : load.state === 'loading' || !parts ? (
        <p style={quiet}>Loading…</p>
      ) : parts.waiting.length === 0 && parts.done.length === 0 ? (
        <Card>
          <EmptyState title={W.noneYet} />
        </Card>
      ) : (
        <div style={{ display: 'grid', gap: space.lg }}>
          <section aria-label={W.waiting} style={{ display: 'grid', gap: space.md }}>
            <SectionTitle>{`${W.waiting} (${parts.waiting.length})`}</SectionTitle>
            {parts.waiting.length === 0 ? <p style={quiet}>{W.noneWaiting}</p> : null}
            {parts.waiting.map((q) => (
              <QuestionCard key={q.id} q={q} today={today} me={myStaffId} apiKey={key} onAnswered={replaced} onStale={() => void fetchList()} />
            ))}
          </section>
          {parts.done.length > 0 ? (
            <section aria-label={W.done} style={{ display: 'grid', gap: space.md }}>
              <SectionTitle>{W.done}</SectionTitle>
              {parts.done.map((q) => (
                <QuestionCard key={q.id} q={q} today={today} me={myStaffId} apiKey={key} onAnswered={replaced} onStale={() => void fetchList()} />
              ))}
            </section>
          ) : null}
        </div>
      )}
    </>
  );
}

function QuestionCard({
  q,
  today,
  me,
  apiKey,
  onAnswered,
  onStale,
}: {
  q: GymQuestion;
  today: string;
  me: string | null;
  apiKey: string;
  onAnswered: (q: GymQuestion) => void;
  onStale: () => void;
}) {
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const closed = closedText(q);
  const send = async (): Promise<void> => {
    const text = reply.trim();
    if (!text || busy) return;
    setBusy(true);
    setError(null);
    try {
      onAnswered(await questionsApi.answerQuestion(apiKey, q.id, text));
      setReply('');
    } catch (e) {
      console.warn('[ForgeErr] questions: replying', e);
      setError(questionErrorWords(e) ?? errorWords(e));
      if (/\b(ALREADY_ANSWERED|WITHDRAWN|NOT_FOUND)\b/.test(e instanceof Error ? e.message : String(e))) onStale();
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card>
      <Row gap={space.sm}>
        <strong style={{ fontFamily: font.body, fontSize: 16, color: color.ink }}>
          {q.memberId ? (
            <a
              href={`#/members/${encodeURIComponent(q.memberId)}`}
              style={{ color: color.ink }}
              onClick={(e) => {
                e.preventDefault();
                navigate(`/members/${q.memberId}`);
              }}
            >
              {q.name}
            </a>
          ) : (
            q.name
          )}
        </strong>
        <Pill tone={q.open ? 'warn' : 'muted'}>{toWhomLine(q, me)}</Pill>
      </Row>
      <p style={{ ...small, marginTop: space.xs }}>{whenText(q.askedAt, today)}</p>
      <p style={{ ...said, marginTop: space.sm }}>{q.question}</p>
      {q.answer ? (
        <div style={{ marginTop: space.md, paddingLeft: space.md, borderLeft: `3px solid ${color.accent}` }}>
          <p style={small}>
            {W.repliedBy(q.answeredBy)}
            {q.answeredAt != null ? ` · ${whenText(q.answeredAt, today)}` : ''}
          </p>
          <p style={{ ...said, marginTop: space.xs }}>{q.answer}</p>
        </div>
      ) : closed ? (
        <p style={{ ...small, marginTop: space.md }}>{closed}</p>
      ) : (
        <div style={{ marginTop: space.md, display: 'grid', gap: space.sm }}>
          <TextField label={W.replyLabel} value={reply} onChange={(v) => setReply(v.slice(0, REPLY_MAX))} multiline hint={`${W.replyHint} ${W.counter(reply.length)}`} />
          {error && <ErrorBanner>{error}</ErrorBanner>}
          <div>
            <Button onClick={send} disabled={busy || reply.trim().length === 0} needsInternet>
              {busy ? W.sending : W.send}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
