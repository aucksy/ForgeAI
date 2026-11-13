/**
 * F201: the AI Assistant itself (canvas boards "Main", "EntryDeskOpen"): the header with the credits, "Today for
 * you", "Try saying", the conversation and its cards, History, and the box to type or speak in. The same view is
 * the /assistant page (phone and computer) and the 420 px side panel on a computer (`panel`).
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';

import { t } from '../../lang/lang';
import { useIsCompact, Button, Sheet, color, font, space } from '../../ui/kit';
import { navigate } from '../../ui/router';
import { SendQueueSheet } from '../../ui/SendQueueSheet';
import { messageSignature } from '../../logic/sendQueue';
import type { MemberView } from '../../types';
import { leftLine, useAllowance } from '../allowance';
import { aiTasks, type AiTaskRow, type AiWallet } from '../api';
import { EXAMPLE_GROUPS, EXAMPLES } from '../catalogue';
import { clearTurns } from '../conversation';
import { jobLine } from '../jobs';
import { todaySuggestions } from '../suggestions';
import { isVoiceSupported } from '../voice';
import { AssistantLine, CardView, RequestBubble, type CardControls } from './Cards';
import { CreditsSheet } from './CreditsSheet';
import { CreditsPill, Chip, MicIcon, SectionLabel, SendIcon, SparkleIcon, body, quiet, say, setPanelOpen, takeRequest, useOpener } from './parts';
import { useAssistantData } from './useAssistantData';
import { useConversation } from './useConversation';
import { VoiceSheet } from './VoiceSheet';

/**
 * R-471: the AI writes WORKOUT plans (POST /api/assist/plan), so their example shows. Diet plans are not written
 * yet: any diet example stays out of the lists.
 */
export const WORKOUT_PLANS_ON = true;
const SHOWN_EXAMPLES = EXAMPLES.filter((e) => e.tool !== 'draft_diet_plan' && (WORKOUT_PLANS_ON || e.tool !== 'draft_workout_plan'));

/**
 * The short "Try saying" list, from the catalogue's examples: who owes, a renewal, this month's collection and a
 * "gym closed" message. No dated festival here: festival ideas come from the festival calendar ("Today for you").
 */
const TRY_FIRST: string[] = [
  SHOWN_EXAMPLES.find((e) => e.tool === 'who_owes'),
  SHOWN_EXAMPLES.find((e) => e.tool === 'renew'),
  SHOWN_EXAMPLES.find((e) => e.tool === 'money_summary' && e.group === 'money'),
  SHOWN_EXAMPLES.find((e) => e.tool === 'draft_message' && (e.expect as { kind?: string } | undefined)?.kind === 'closed'),
].flatMap((e) => (e ? [e.text] : []));

export const GROUP_WORDS: Record<string, string> = {
  messages: 'Messages to members',
  members: 'Members and plans',
  money: 'Money',
  questions: 'Questions about the gym',
  settings: 'Help with settings',
};

export const STATUS_WORDS: Record<AiTaskRow['status'], string> = {
  drafted: 'Not sent',
  done: 'Done',
  cancelled: 'Cancelled',
  failed: 'Did not work',
};

export function AssistantHome({ assistKey, wallet, panel = false }: { assistKey: string; wallet: AiWallet; panel?: boolean }) {
  const compact = useIsCompact();
  const { data, reload } = useAssistantData(assistKey);
  const [tab, setTab] = useState<'ask' | 'history'>('ask');
  const [text, setText] = useState('');
  const [credits, setCredits] = useState(false);
  const [voice, setVoice] = useState(false);
  const [examples, setExamples] = useState(false);
  const [queue, setQueue] = useState<{ people: readonly MemberView[]; text: string } | null>(null);
  const convo = useConversation(assistKey, data, reload, () => setCredits(true));
  const { turns } = convo;
  const box = useRef<HTMLTextAreaElement>(null);
  const lastTurn = useRef<HTMLDivElement>(null);
  const opener = useOpener();
  const canSpeak = useMemo(() => isVoiceSupported(), []);
  const suggestions = useMemo(() => todaySuggestions(data), [data]);
  const asking = turns.some((t) => t.status === 'asking');
  // R-488: today's free questions. At the limit the box locks with a calm line; at 5 or fewer it says how many.
  const allowance = useAllowance(data.today);
  const full = allowance.full;
  const fewLeft = leftLine(allowance.left);

  const send = (words: string, spoken = false): void => {
    const s = words.trim();
    if (!s || asking || full) return;
    setText('');
    setTab('ask');
    void convo.ask(s, spoken);
  };

  // A sentence handed over from the Today card or "Make it": put it in, and ask it when asked to.
  useEffect(() => {
    if (!opener.pending) return;
    const p = takeRequest();
    if (!p) return;
    if (p.send) send(p.text);
    else {
      setText(p.text);
      box.current?.focus();
    }
    // `send` reads the latest state; the effect runs when a sentence arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opener.pending]);

  // The newest request at the top, its cards below it (a card left under the box could not be read).
  const lastId = turns.length > 0 ? `${turns[turns.length - 1].id}:${turns[turns.length - 1].status}` : '';
  useEffect(() => {
    if (lastId) lastTurn.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, [lastId]);

  const ctl: CardControls = {
    balance: wallet.balance,
    ask: (s) => send(s),
    go: (path) => {
      if (panel && compact) setPanelOpen(false);
      navigate(path);
    },
    confirm: (turnId, card) => void convo.confirm(turnId, card),
    rewrite: (turnId, card, how) => void convo.rewrite(turnId, card, how),
    openCredits: () => setCredits(true),
    openQueue: (people, words) => setQueue({ people, text: words }),
    writePlan: (turnId, card) => void convo.writePlan(turnId, card),
    savePlan: (turnId, card, plan) => convo.savePlan(turnId, card, plan),
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey && !compact) {
      e.preventDefault();
      send(text);
    }
  };

  const header = (
    <div style={{ display: 'flex', alignItems: 'center', gap: space.sm, justifyContent: 'space-between', flexWrap: 'wrap' }}>
      <h1 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8, fontFamily: font.display, fontSize: panel ? 20 : 24, fontWeight: 700, color: color.ink }}>
        <span aria-hidden style={{ color: color.accentBright }}>
          <SparkleIcon size={panel ? 20 : 24} />
        </span>
        {t('AI Assistant')}
      </h1>
      <span style={{ display: 'flex', alignItems: 'center', gap: space.sm }}>
        <CreditsPill balance={wallet.balance} onOpen={() => setCredits(true)} />
        {panel ? (
          <button
            type="button"
            onClick={() => setPanelOpen(false)}
            aria-label={t('Close the AI Assistant')}
            style={{ appearance: 'none', border: 'none', background: 'transparent', color: color.inkSecondary, fontSize: 24, lineHeight: 1, minWidth: 40, minHeight: 40, cursor: 'pointer' }}
          >
            ×
          </button>
        ) : null}
      </span>
    </div>
  );

  const tabs = (
    <div role="tablist" aria-label={t('AI Assistant')} style={{ display: 'flex', gap: 4, padding: 3, borderRadius: 12, background: color.surfaceSunken, alignSelf: 'start' }}>
      {(['ask', 'history'] as const).map((k) => (
        <button
          key={k}
          type="button"
          role="tab"
          aria-selected={tab === k}
          onClick={() => setTab(k)}
          style={{
            appearance: 'none',
            minHeight: 36,
            padding: '0 14px',
            border: 'none',
            borderRadius: 9,
            background: tab === k ? color.surface : 'transparent',
            color: tab === k ? color.ink : color.inkSecondary,
            fontFamily: font.body,
            fontWeight: 700,
            fontSize: 14,
            cursor: 'pointer',
          }}
        >
          {k === 'ask' ? t('Ask') : t('History')}
        </button>
      ))}
    </div>
  );

  const start = (
    <>
      {suggestions.length > 0 ? (
        <section aria-labelledby="ai-today" style={{ display: 'grid', gap: space.sm }}>
          <SectionLabel id="ai-today">{t('Today for you')}</SectionLabel>
          <div style={{ display: 'grid', gap: space.sm }}>
            {suggestions.map((s) => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: space.md, padding: '12px 14px', borderRadius: 14, background: color.surface, border: `1px solid ${color.border}` }}>
                <p style={{ ...body, flex: 1, minWidth: 0, fontWeight: 600 }}>{say(s.words)}</p>
                <Button variant="ghost" needsInternet disabled={asking} onClick={() => send(s.request)}>
                  {say(s.action)}
                </Button>
              </div>
            ))}
          </div>
        </section>
      ) : null}
      <section aria-labelledby="ai-try" style={{ display: 'grid', gap: space.sm }}>
        <SectionLabel id="ai-try">{t('Try saying')}</SectionLabel>
        <div style={{ display: 'grid', gap: space.sm }}>
          {TRY_FIRST.map((s) => (
            <Chip key={s} onClick={() => fill(s)}>
              {`“${s}”`}
            </Chip>
          ))}
        </div>
        <button type="button" onClick={() => setExamples(true)} style={linkStyle}>
          {t('See all {n} things it can do', { n: SHOWN_EXAMPLES.length })}
        </button>
      </section>
      <p style={quiet}>{t('Asking is free. A task uses credits only when you send or save it.')}</p>
    </>
  );

  function fill(s: string): void {
    setText(s);
    setTab('ask');
    box.current?.focus();
  }

  const conversation = (
    <div style={{ display: 'grid', gap: space.lg }}>
      {turns.map((turn, i) => (
        <div
          key={turn.id}
          ref={i === turns.length - 1 ? lastTurn : undefined}
          style={{ display: 'flex', flexDirection: 'column', gap: space.md, scrollMarginTop: compact ? 88 : 24 }}
        >
          <RequestBubble text={turn.request} spoken={turn.spoken} />
          {turn.status === 'asking' ? (
            <p role="status" style={{ ...quiet, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span aria-hidden style={{ color: color.accentBright }}>
                <SparkleIcon size={16} />
              </span>
              {t('Thinking…')}
            </p>
          ) : null}
          {turn.note && turn.cards.length > 0 ? <AssistantLine words={turn.note} /> : null}
          {turn.cards.map((c) => (
            <CardView key={c.id} turnId={turn.id} card={c} data={data} ctl={ctl} />
          ))}
          {turn.fail ? <AssistantLine words={turn.fail} tone={turn.notice ? undefined : 'fail'} /> : null}
        </div>
      ))}
      <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
        <Button variant="quiet" disabled={asking} onClick={() => clearTurns()}>
          {t('Start a new chat')}
        </Button>
      </div>
    </div>
  );

  const composer = (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        send(text);
      }}
      style={{
        display: 'flex',
        alignItems: 'flex-end',
        gap: space.sm,
        padding: 8,
        borderRadius: 18,
        background: color.surfaceRaised,
        border: `1px solid ${color.borderStrong}`,
        boxShadow: panel ? 'none' : '0 6px 24px rgba(0,0,0,0.18)',
      }}
    >
      <textarea
        ref={box}
        value={text}
        rows={1}
        maxLength={600}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKey}
        disabled={full}
        aria-label={t('Ask or give a task')}
        placeholder={full ? t('No more free questions today. Ask again tomorrow.') : t('Ask or give a task, in Hindi or English')}
        style={{
          flex: 1,
          minWidth: 0,
          minHeight: 44,
          maxHeight: 132,
          padding: '11px 10px',
          border: 'none',
          outline: 'none',
          resize: 'none',
          background: 'transparent',
          color: color.ink,
          fontFamily: font.body,
          fontSize: 16,
          lineHeight: 1.4,
          fieldSizing: 'content',
        } as CSSProperties}
      />
      {canSpeak ? (
        <button type="button" onClick={() => setVoice(true)} disabled={asking || full} aria-label={t('Speak a request')} style={roundButton(false)}>
          <MicIcon />
        </button>
      ) : null}
      <button type="submit" disabled={!text.trim() || asking || full} aria-label={t('Ask the AI Assistant')} style={roundButton(true, !text.trim() || asking || full)}>
        <SendIcon />
      </button>
    </form>
  );

  const content = tab === 'history' ? <History assistKey={assistKey} onAgain={fill} /> : turns.length === 0 ? start : conversation;

  return (
    <div
      data-assistant={panel ? 'panel' : 'page'}
      style={
        panel
          ? { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }
          : { display: 'flex', flexDirection: 'column', gap: space.lg, maxWidth: 720, margin: '0 auto', width: '100%' }
      }
    >
      <div style={panel ? { padding: `${space.lg}px ${space.lg}px ${space.md}px`, display: 'grid', gap: space.md, borderBottom: `1px solid ${color.border}` } : { display: 'grid', gap: space.md }}>
        {header}
        {tabs}
      </div>
      <div style={panel ? { flex: 1, minHeight: 0, overflowY: 'auto', padding: space.lg, display: 'grid', gap: space.lg, alignContent: 'start' } : { display: 'grid', gap: space.lg }}>
        {content}
      </div>
      {tab === 'ask' ? (
        <div
          style={
            panel
              ? { padding: space.md, borderTop: `1px solid ${color.border}` }
              : { position: 'sticky', bottom: compact ? 'calc(70px + env(safe-area-inset-bottom))' : 16, zIndex: 5 }
          }
        >
          {fewLeft ? (
            <p role="status" style={{ ...quiet, margin: `0 0 ${space.sm}px` }}>
              {t(fewLeft.text, fewLeft.vars)}
            </p>
          ) : null}
          {composer}
        </div>
      ) : null}

      {credits ? <CreditsSheet wallet={wallet} plansOn={WORKOUT_PLANS_ON} assistKey={assistKey} onClose={() => setCredits(false)} /> : null}
      {voice ? (
        <VoiceSheet
          assistKey={assistKey}
          onClose={() => setVoice(false)}
          onSend={(words) => {
            setVoice(false);
            send(words, true);
          }}
        />
      ) : null}
      {examples ? (
        <Sheet title={t('What the AI Assistant can do')} onClose={() => setExamples(false)}>
          <div style={{ display: 'grid', gap: space.lg }}>
            <p style={quiet}>{t('Tap one to put it in the box. Change it, then ask.')}</p>
            {EXAMPLE_GROUPS.map((g) => {
              const list = SHOWN_EXAMPLES.filter((e) => e.group === g);
              if (list.length === 0) return null;
              return (
                <section key={g} style={{ display: 'grid', gap: space.sm }}>
                  <SectionLabel>{t(GROUP_WORDS[g] ?? g)}</SectionLabel>
                  {list.map((e) => (
                    <Chip
                      key={e.text}
                      onClick={() => {
                        setExamples(false);
                        fill(e.text);
                      }}
                    >
                      {`“${e.text}”`}
                    </Chip>
                  ))}
                </section>
              );
            })}
          </div>
        </Sheet>
      ) : null}
      {queue ? (
        <SendQueueSheet group={queue.people} textFor={() => queue.text} signature={messageSignature(queue.text)} onePerNumber onClose={() => setQueue(null)} />
      ) : null}
    </div>
  );
}

const linkStyle = {
  appearance: 'none',
  justifySelf: 'start',
  background: 'transparent',
  border: 'none',
  padding: 0,
  minHeight: 36,
  fontFamily: font.body,
  fontWeight: 700,
  fontSize: 14,
  color: color.accentBright,
  cursor: 'pointer',
} as const;

function roundButton(primary: boolean, off = false): CSSProperties {
  return {
    appearance: 'none',
    width: 44,
    height: 44,
    flexShrink: 0,
    borderRadius: '50%',
    display: 'grid',
    placeItems: 'center',
    border: primary ? 'none' : `1px solid ${color.borderStrong}`,
    background: primary ? (off ? color.surfaceSunken : color.accent) : 'transparent',
    color: primary ? (off ? color.inkMuted : '#1F0D05') : color.ink,
    cursor: off ? 'default' : 'pointer',
  };
}

const jobOf = (r: AiTaskRow) => jobLine(r.actions);

/** Past tasks from the server (owner_ai_tasks), newest first, each with what it did. A tap puts the request back in the box. */
function History({ assistKey, onAgain }: { assistKey: string; onAgain: (text: string) => void }) {
  const [rows, setRows] = useState<AiTaskRow[] | null | 'loading'>('loading');
  useEffect(() => {
    let live = true;
    void aiTasks(assistKey, 30).then((r) => {
      if (live) setRows(r);
    });
    return () => {
      live = false;
    };
  }, [assistKey]);
  if (rows === 'loading') return <p style={quiet}>{t('Loading…')}</p>;
  if (rows === null) return <AssistantLine words={t('History could not load. Check the internet and try again.')} tone="fail" />;
  if (rows.length === 0) return <p style={quiet}>{t('Nothing yet. Tasks you give the AI Assistant show here.')}</p>;
  return (
    <ul aria-label={t('History')} style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid' }}>
      {rows.map((r, i) => (
        <li key={r.id} style={{ borderTop: i === 0 ? 'none' : `1px solid ${color.border}` }}>
          <button
            type="button"
            onClick={() => onAgain(r.request)}
            style={{ appearance: 'none', width: '100%', textAlign: 'left', background: 'transparent', border: 'none', padding: '12px 0', cursor: 'pointer', display: 'grid', gap: 4 }}
          >
            <span style={{ fontFamily: font.body, fontSize: 15, fontWeight: 600, color: color.ink, overflowWrap: 'anywhere' }}>{r.request || t('A task')}</span>
            <span style={{ fontFamily: font.body, fontSize: 13, color: color.inkMuted }}>
              {jobOf(r) ? `${say(jobOf(r)!)} · ` : ''}
              {historyWhen(r.at)} · {t(STATUS_WORDS[r.status])}
              {r.status === 'done' && r.credits > 0 ? ` · ${r.credits === 1 ? t('1 credit') : t('{n} credits', { n: r.credits })}` : ''}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "12 Nov, 9:05 am" in India time. PURE. */
export function historyWhen(at: number): string {
  if (!at) return '';
  const d = new Date(at + 330 * 60 * 1000);
  const h = d.getUTCHours();
  const m = String(d.getUTCMinutes()).padStart(2, '0');
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}, ${h % 12 === 0 ? 12 : h % 12}:${m} ${h < 12 ? 'am' : 'pm'}`;
}
