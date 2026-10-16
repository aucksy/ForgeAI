/**
 * Shop → Messages (gym messages, Phase 1): write one message to every member who has the app, and
 * see what was sent and how many have seen it. A type picks ready words to edit; a phone preview
 * shows it as the member's inbox will; "Send" asks once more with the number of members it goes
 * to. "Take back" removes a sent message from every inbox (a typo, a cancelled offer).
 * Words and checks: messages.ts. Server: 0008_gym_messages.sql.
 */

import { useCallback, useRef, useState } from 'react';

import { Button, Card, ChipToggle, EmptyState, ErrorBanner, Pill, SectionTitle, TextField, Toast, color, font, radius, space, useIsCompact } from '../ui/kit';
import * as api from './api';
import { MutationGate, timeAgo } from './logic';
import {
  BODY_MAX,
  MESSAGE_KINDS,
  TITLE_MAX,
  draftProblem,
  isCapped,
  kindLabel,
  messageErrorWords,
  seenText,
  type MessageDraft,
  type MessageKind,
  type SentMessage,
} from './messages';
import { usePoll, useShop } from './ShopProvider';

const FIRST: MessageDraft = { kind: 'announcement', title: '', body: '' };

export function MessagesSection() {
  const { cloud, handleError, now } = useShop();
  const compact = useIsCompact();
  const key = cloud?.ownerKey ?? null;
  const [draft, setDraft] = useState<MessageDraft>(FIRST);
  const [touched, setTouched] = useState(false);
  const [sent, setSent] = useState<SentMessage[] | null>(null);
  const [members, setMembers] = useState<number | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // A refresh that left before a Send or Take back must not paint the list as it was (logic.ts).
  const gate = useRef(new MutationGate()).current;

  const load = useCallback(async () => {
    if (!key) return;
    const stamp = gate.stamp();
    try {
      const [list, people] = await Promise.all([api.listMessages(key), api.listAppMembers(key)]);
      if (!gate.fresh(stamp)) return;
      setSent(list);
      setMembers(people.length);
    } catch (e) {
      setError(handleError(e));
    }
  }, [key, handleError, gate]);

  usePoll(load, 30_000, key !== null);

  if (!cloud || !key) return null;

  const problem = draftProblem(draft);
  const pickKind = (kind: MessageKind) => {
    const t = MESSAGE_KINDS.find((k) => k.kind === kind)!;
    // Ready words only replace what the owner has not written yet.
    setDraft((d) => ({
      kind,
      title: touched && d.title.trim() ? d.title : t.title,
      body: touched && d.body.trim() ? d.body : t.body,
    }));
    setConfirming(false);
  };

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      const m = await gate.run(() => api.sendMessage(key, draft));
      setSent((prev) => [m, ...(prev ?? [])]);
      setDraft(FIRST);
      setTouched(false);
      setConfirming(false);
      setToast(
        m.recipients === 1
          ? `Sent to ${m.recipients} member.`
          : `Sent to ${m.recipients} members.`,
      );
      window.setTimeout(() => setToast(null), 3000);
    } catch (e) {
      const words = messageErrorWords(e);
      setError(/BAD_KEY/.test(String((e as { message?: unknown })?.message ?? '')) ? handleError(e) : words);
      setConfirming(false);
      // A slow answer can come after the message was saved: look again before the owner re-sends.
      void load();
    } finally {
      setBusy(false);
    }
  };

  const takeBack = async (m: SentMessage) => {
    if (!window.confirm(`Take back “${m.title}”? It is removed from every member’s inbox.`)) return;
    try {
      await gate.run(() => api.withdrawMessage(key, m.id));
      setSent((prev) => prev?.map((x) => (x.id === m.id ? { ...x, withdrawn: true } : x)) ?? prev);
    } catch (e) {
      setError(messageErrorWords(e));
    }
  };

  return (
    <>
      <p style={{ margin: `0 0 ${space.lg}px`, fontFamily: font.body, fontSize: 14, color: color.inkSecondary }}>
        Your message goes to every member who joined your gym in the ForgeAI app. They see it in the app's inbox (the bell on their Shop tab).
      </p>
      {error && <ErrorBanner>{error}</ErrorBanner>}

      <div
        style={{
          display: 'grid',
          gap: space.lg,
          gridTemplateColumns: compact ? '1fr' : 'minmax(0, 1.3fr) minmax(0, 1fr)',
          alignItems: 'start',
          marginBottom: space.xl,
        }}
      >
        <Card>
          <SectionTitle>New message</SectionTitle>
          <div style={{ marginBottom: space.md }}>
            <ChipToggle
              label="Message type"
              value={draft.kind}
              onChange={(v) => pickKind(v as MessageKind)}
              options={MESSAGE_KINDS.map((k) => ({ value: k.kind, label: k.label }))}
            />
          </div>
          <TextField
            label={`Title (${draft.title.trim().length}/${TITLE_MAX})`}
            value={draft.title}
            onChange={(v) => {
              setTouched(true);
              setConfirming(false);
              setDraft((d) => ({ ...d, title: v.slice(0, TITLE_MAX + 10) }));
            }}
            placeholder="Gym closed on Sunday"
          />
          <div style={{ height: space.md }} />
          <TextField
            label={`Message (${draft.body.trim().length}/${BODY_MAX})`}
            value={draft.body}
            multiline
            onChange={(v) => {
              setTouched(true);
              setConfirming(false);
              setDraft((d) => ({ ...d, body: v.slice(0, BODY_MAX + 20) }));
            }}
            placeholder="A line or two members should know"
          />
          {isCapped(draft.kind) && (
            <p style={{ margin: `${space.sm}px 0 0`, fontFamily: font.body, fontSize: 12, color: color.inkMuted }}>
              Members get at most one offer or event a day, and three a week.
            </p>
          )}
          {problem && (touched || /\[/.test(draft.title + draft.body)) && (
            <p role="status" style={{ margin: `${space.sm}px 0 0`, fontFamily: font.body, fontSize: 13, color: color.warning }}>
              {problem}
            </p>
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: space.sm, marginTop: space.lg, alignItems: 'center' }}>
            {!confirming ? (
              <Button
                disabled={busy || problem !== null}
                onClick={() => {
                  setTouched(true);
                  if (!problem) setConfirming(true);
                }}
              >
                Send
              </Button>
            ) : (
              <>
                <span style={{ fontFamily: font.body, fontSize: 14, color: color.ink }}>
                  {members === 0
                    ? 'No member has the app yet. Members who join in the next 14 days will see it. Send now?'
                    : members === 1
                      ? `Goes to ${members ?? '…'} member. Send now?`
                      : `Goes to ${members ?? '…'} members. Send now?`}
                </span>
                <Button disabled={busy} onClick={() => void send()}>
                  {busy ? 'Sending…' : 'Yes, send'}
                </Button>
                <Button variant="ghost" disabled={busy} onClick={() => setConfirming(false)}>
                  Not yet
                </Button>
              </>
            )}
          </div>
          {members === 0 && (
            <p style={{ margin: `${space.sm}px 0 0`, fontFamily: font.body, fontSize: 13, color: color.inkMuted }}>
              No member has joined in the app yet. Send them your gym’s link (Settings → Invite members). New members also see messages from the last 14 days.
            </p>
          )}
        </Card>

        <Card>
          <SectionTitle>What members see</SectionTitle>
          <InboxPreview draft={draft} gymName={cloud.name} />
        </Card>
      </div>

      <SectionTitle>Sent</SectionTitle>
      {sent === null && !error ? (
        <Card>
          <EmptyState title="Loading…" />
        </Card>
      ) : sent && sent.length === 0 ? (
        <Card>
          <EmptyState
            title="Nothing sent yet"
            body="Messages you send show here, with how many members have seen each one."
          />
        </Card>
      ) : (
        <div style={{ display: 'grid', gap: space.sm }}>
          {(sent ?? []).map((m) => (
            <Card key={m.id} pad={space.lg} style={{ opacity: m.withdrawn ? 0.6 : 1 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: space.sm, alignItems: 'center', marginBottom: 6 }}>
                <Pill tone={isCapped(m.kind) ? 'accent' : 'muted'}>{kindLabel(m.kind)}</Pill>
                {m.withdrawn && <Pill tone="critical">Taken back</Pill>}
                <span style={{ fontFamily: font.body, fontSize: 12, color: color.inkMuted }}>{timeAgo(m.createdAt, now)}</span>
              </div>
              <div style={{ fontFamily: font.display, fontSize: 16, fontWeight: 600, color: color.ink }}>{m.title}</div>
              {m.body && (
                <div style={{ marginTop: 4, fontFamily: font.body, fontSize: 14, color: color.inkSecondary, whiteSpace: 'pre-wrap' }}>
                  {m.body}
                </div>
              )}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: space.md, alignItems: 'center', justifyContent: 'space-between', marginTop: space.sm }}>
                <span style={{ fontFamily: font.body, fontSize: 13, color: color.inkSecondary }}>{seenText(m)}</span>
                {!m.withdrawn && (
                  <Button variant="quiet" onClick={() => void takeBack(m)} ariaLabel={`Take back ${m.title}`}>
                    Take back
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
      {toast && <Toast message={toast} />}
    </>
  );
}

/** The message as one card in the member's inbox (dark, like the app). */
function InboxPreview({ draft, gymName }: { draft: MessageDraft; gymName: string }) {
  return (
    <div style={{ background: '#07080C', borderRadius: radius.lg, padding: space.lg, border: `1px solid ${color.border}` }}>
      <div style={{ fontFamily: font.body, fontSize: 12, color: '#9097A8', marginBottom: space.sm }}>{gymName} · now</div>
      <div style={{ background: '#12141B', borderRadius: radius.md, padding: space.md }}>
        <div style={{ fontFamily: font.body, fontSize: 11, fontWeight: 700, letterSpacing: 0.4, color: '#FF8B4A', marginBottom: 4 }}>
          {kindLabel(draft.kind)}
        </div>
        <div style={{ fontFamily: font.display, fontSize: 15, fontWeight: 600, color: '#F4F5F8' }}>
          {draft.title.trim() || 'Your title'}
        </div>
        <div style={{ marginTop: 4, fontFamily: font.body, fontSize: 13, color: '#B9BFCC', whiteSpace: 'pre-wrap' }}>
          {draft.body.trim() || 'Your message'}
        </div>
      </div>
    </div>
  );
}
