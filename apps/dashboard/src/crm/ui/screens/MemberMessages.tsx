/**
 * "Member messages" (/member-messages; owner request, 12 Nov 2026): what members sent from "Message your gym" on
 * the Gym tab of their app (questions, feedback, complaints), with a reply box, "Mark as done" and "Open again".
 * Type buttons on top; then Waiting for a reply (the longest wait first), Replied, Done.
 *
 * Who sees what is the server's rule (0069): the owner sees everything; the front desk and trainers see questions
 * and feedback, never complaints. Feedback sent without the member's name comes with no name, phone or member id.
 * The reply shows in the member's app with a notification on their phone (push kind 'gym_reply'). Hidden until
 * the gym's server has 0069 (the menu item is not there; an old link says "not switched on"). Words:
 * logic/memberMessages.ts.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useAuth } from '../../auth/AuthProvider';
import {
  MEMBER_MESSAGE_WORDS as W,
  TALK_REPLY_MAX,
  TALK_THREAD_MAX,
  splitTalk,
  talkChipLabel,
  talkErrorWords,
  talkFilterFrom,
  talkFilters,
  talkLineHead,
  talkName,
  talkStatusLine,
  type TalkFilter,
  type TalkList,
  type TalkThread,
} from '../../logic/memberMessages';
import { errorWords } from '../../shop/logic';
import * as api from '../../shop/memberMessagesApi';
import { useCrm } from '../../store';
import { Button, Card, ChipToggle, EmptyState, ErrorBanner, PageHeader, Pill, Row, SectionTitle, TextField, color, font, space } from '../kit';
import { refreshMemberMessageCount, useMemberMessageCount } from '../MemberMessageParts';
import { navigate } from '../router';

type Load = { state: 'loading' } | { state: 'missing' } | { state: 'error'; message: string } | { state: 'ready'; data: TalkList };
/**
 * What the last action said. Kept by the page, not the card: a replied conversation moves to "Replied" (a new
 * card), and one that is gone leaves the list, so a card's own note would vanish with it.
 */
type Note = { id: string | null; ok: boolean; words: string } | null;

const quiet = { margin: 0, fontFamily: font.body, fontSize: 14, color: color.inkSecondary } as const;
const small = { ...quiet, fontSize: 13, color: color.inkMuted } as const;
const said = { margin: 0, fontFamily: font.body, fontSize: 15, color: color.ink, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' } as const;

const KIND_TONE = { question: 'accent', feedback: 'good', complaint: 'critical' } as const;

/** `startWith`: a type from the address (`/member-messages/complaint`): a line on Today opens its own type. */
export function MemberMessagesScreen({ startWith }: { startWith?: string } = {}) {
  const { session } = useAuth();
  const { today } = useCrm();
  const key = session?.online ? (session.ownerKey ?? null) : null;
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [filter, setFilter] = useState<TalkFilter>(() => talkFilterFrom(startWith, 'owner'));
  const [note, setNote] = useState<Note>(null);

  const fetchList = useCallback(async () => {
    if (!key) return;
    setLoad((l) => (l.state === 'ready' ? l : { state: 'loading' }));
    try {
      const r = await api.getTalkList(key);
      setLoad(r === 'missing' ? { state: 'missing' } : { state: 'ready', data: r });
    } catch (e) {
      console.warn('[ForgeErr] member messages: reading', e);
      setLoad({ state: 'error', message: talkErrorWords(e) ?? errorWords(e) });
    }
  }, [key]);

  useEffect(() => {
    void fetchList();
  }, [fetchList]);

  // Fresh eyes (14 Nov 2026): a new message while the page is open. The waiting count (the menu badge, read with Needs
  // you every minute) moves first; when it no longer matches the page, the page reads the list again.
  // Only when the shared count moves (a ref for the page's number): the page's own reply lowers both, so nothing more.
  const waitingNow = useMemberMessageCount();
  const pageWaiting = useRef<number | null>(null);
  pageWaiting.current = load.state === 'ready' ? load.data.waiting : null;
  useEffect(() => {
    const shown = pageWaiting.current;
    if (waitingNow !== null && shown !== null && waitingNow !== shown) void fetchList();
  }, [waitingNow, fetchList]);

  const role = load.state === 'ready' ? load.data.role : 'owner';
  const filters = talkFilters(role);
  const shown = filters.includes(filter) ? filter : 'all';
  const parts = useMemo(() => (load.state === 'ready' ? splitTalk(load.data.threads, shown) : null), [load, shown]);

  const stale = (words: string): void => {
    setNote({ id: null, ok: false, words });
    // The badge in the menu counts the gone message too until it asks again.
    void fetchList().then(refreshMemberMessageCount);
  };

  const replaced = (t: TalkThread): void => {
    setLoad((l) => {
      if (l.state !== 'ready') return l;
      const threads = l.data.threads.map((x) => (x.id === t.id ? t : x));
      return { state: 'ready', data: { ...l.data, threads, waiting: threads.filter((x) => x.waiting).length } };
    });
    refreshMemberMessageCount();
  };

  return (
    <>
      <PageHeader
        title={W.title}
        subtitle={W.intro}
        actions={
          // Fresh eyes (14 Nov 2026): not beside the error card's own "Try again" (two buttons for one thing).
          key && load.state !== 'error' ? (
            <Button
              variant="ghost"
              onClick={() => {
                setNote(null);
                void fetchList().then(refreshMemberMessageCount);
              }}
            >
              {W.refresh}
            </Button>
          ) : undefined
        }
      />
      {!key ? (
        <Card>
          <EmptyState title={W.needsOnline} body={W.needsOnlineBody} />
        </Card>
      ) : load.state === 'missing' ? (
        <Card>
          <div data-testid="member-messages-not-ready">
            <EmptyState title={W.notReady} />
          </div>
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
      ) : (
        <div style={{ display: 'grid', gap: space.lg }}>
          {role === 'staff' ? <p style={quiet}>{W.staffNote}</p> : null}
          {note && note.id === null ? <ErrorBanner>{note.words}</ErrorBanner> : null}
          {load.data.threads.length === 0 ? (
            <Card>
              <EmptyState title={W.noneYet} />
            </Card>
          ) : (
            <>
              <ChipToggle
                label={W.filterLabel}
                wrap
                value={shown}
                onChange={(v) => setFilter(v as TalkFilter)}
                options={filters.map((f) => ({ value: f, label: talkChipLabel(load.data.threads, f) }))}
              />
              <section aria-label={W.waiting} style={{ display: 'grid', gap: space.md }}>
                <SectionTitle>{`${W.waiting} (${parts.waiting.length})`}</SectionTitle>
                {parts.waiting.length === 0 ? <p style={quiet}>{parts.replied.length + parts.done.length === 0 ? W.noneOfKind : W.noneWaiting}</p> : null}
                {parts.waiting.map((t) => (
                  <ThreadCard key={t.id} t={t} today={today} apiKey={key} note={note} setNote={setNote} onChanged={replaced} onStale={stale} />
                ))}
              </section>
              {parts.replied.length > 0 ? (
                <section aria-label={W.replied} style={{ display: 'grid', gap: space.md }}>
                  <SectionTitle>{W.replied}</SectionTitle>
                  {parts.replied.map((t) => (
                    <ThreadCard key={t.id} t={t} today={today} apiKey={key} note={note} setNote={setNote} onChanged={replaced} onStale={stale} />
                  ))}
                </section>
              ) : null}
              {parts.done.length > 0 ? (
                <section aria-label={W.done} style={{ display: 'grid', gap: space.md }}>
                  <SectionTitle>{W.done}</SectionTitle>
                  {parts.done.map((t) => (
                    <ThreadCard key={t.id} t={t} today={today} apiKey={key} note={note} setNote={setNote} onChanged={replaced} onStale={stale} />
                  ))}
                </section>
              ) : null}
            </>
          )}
          <p style={small}>{W.keptNote}</p>
        </div>
      )}
    </>
  );
}

function ThreadCard({
  t,
  today,
  apiKey,
  note,
  setNote,
  onChanged,
  onStale,
}: {
  t: TalkThread;
  today: string;
  apiKey: string;
  note: Note;
  setNote: (n: Note) => void;
  onChanged: (t: TalkThread) => void;
  /** The conversation is gone (the member left): the page says so and reads the list again. */
  onStale: (words: string) => void;
}) {
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState<'reply' | 'done' | null>(null);
  const full = t.messages.length >= TALK_THREAD_MAX;
  const status = talkStatusLine(t, today);
  const mine = note && note.id === t.id ? note : null;

  const fail = (what: string, e: unknown): void => {
    console.warn(`[ForgeErr] member messages: ${what}`, e);
    const words = talkErrorWords(e) ?? errorWords(e);
    if (/\bNOT_FOUND\b/.test(e instanceof Error ? e.message : String((e as { message?: unknown })?.message ?? e))) onStale(words);
    else setNote({ id: t.id, ok: false, words });
  };
  const send = async (): Promise<void> => {
    const text = reply.trim();
    if (!text || busy) return;
    setBusy('reply');
    setNote(null);
    try {
      onChanged(await api.replyTalk(apiKey, t.id, text));
      setReply('');
      setNote({ id: t.id, ok: true, words: W.sent });
    } catch (e) {
      fail('replying', e);
    } finally {
      setBusy(null);
    }
  };
  const toggleDone = async (): Promise<void> => {
    if (busy) return;
    setBusy('done');
    setNote(null);
    try {
      onChanged(await api.setTalkDone(apiKey, t.id, !t.done));
    } catch (e) {
      fail('marking done', e);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card>
      <div data-testid="member-message" style={{ display: 'grid', gap: space.sm }}>
        <Row gap={space.sm}>
          <strong style={{ fontFamily: font.body, fontSize: 16, color: color.ink }}>
            {t.memberId ? (
              <a
                href={`#/members/${encodeURIComponent(t.memberId)}`}
                style={{ color: color.ink }}
                onClick={(e) => {
                  e.preventDefault();
                  navigate(`/members/${t.memberId}`);
                }}
              >
                {talkName(t)}
              </a>
            ) : (
              talkName(t)
            )}
          </strong>
          <Pill tone={KIND_TONE[t.kind]}>{W.kind[t.kind]}</Pill>
        </Row>
        {t.anonymous ? <p style={small}>{W.anonNote}</p> : t.phone ? <p style={small}>{t.phone}</p> : null}
        {t.messages.map((m) => (
          <div
            key={m.id}
            style={m.fromGym ? { paddingLeft: space.md, borderLeft: `3px solid ${color.accent}` } : undefined}
          >
            <p style={small}>{talkLineHead(t, m, today)}</p>
            <p style={{ ...said, marginTop: 2 }}>{m.text}</p>
          </div>
        ))}
        {status ? <p style={{ ...small, color: t.done ? color.goodText : color.inkMuted }}>{status}</p> : null}
        {full ? (
          <p style={small}>{W.full}</p>
        ) : (
          <div style={{ display: 'grid', gap: space.sm, marginTop: space.xs }}>
            <TextField
              label={W.replyLabel}
              value={reply}
              onChange={(v) => {
                setReply(v.slice(0, TALK_REPLY_MAX));
                if (mine?.ok) setNote(null);
              }}
              multiline
              hint={`${W.replyHint} ${W.counter(reply.length)}`}
            />
          </div>
        )}
        {mine && !mine.ok ? <ErrorBanner>{mine.words}</ErrorBanner> : null}
        {mine?.ok ? (
          <p role="status" style={{ ...small, color: color.goodText }}>
            {mine.words}
          </p>
        ) : null}
        <Row gap={space.sm}>
          {!full ? (
            <Button onClick={send} disabled={busy !== null || reply.trim().length === 0} needsInternet>
              {busy === 'reply' ? W.sending : W.send}
            </Button>
          ) : null}
          <Button variant="ghost" onClick={toggleDone} disabled={busy !== null} needsInternet>
            {t.done ? W.reopen : W.markDone}
          </Button>
        </Row>
      </div>
    </Card>
  );
}
