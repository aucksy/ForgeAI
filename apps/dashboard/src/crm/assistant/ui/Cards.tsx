/**
 * F201: the assistant's cards (03-design §6; canvas boards 3, 4 and 5): an Answer to a question, a Message to
 * send, a Change to save, a question back (AskBack), and "I can't do that" (Cannot, with the page to open).
 *
 * Every message or change card is ONE task with its OWN button and price (R-471). The price is on the button
 * before the tap. With too few credits the draft still shows and the button says "Get credits to send" and opens
 * the packs. Nothing is sent or saved until the owner taps that card's own button.
 */
import { useState, type ReactNode } from 'react';

import { t } from '../../lang/lang';
import { addDays, formatDayShort, isValidDateISO } from '../../logic/dates';
import { categoryLabel, EXPENSE_CATEGORIES } from '../../logic/expenses';
import { formatINR, paiseToRupees, rupeesToPaise } from '../../logic/money';
import { methodLabel, methodOptions } from '../../logic/payments';
import { endDateForPlan } from '../../logic/membership';
import type { MessageKind } from '../../shop/messages';
import type { ExpenseCategory, MemberView, PaymentMethod, Plan } from '../../types';
import { Button, SelectField, TextField, color, font, radius, space } from '../../ui/kit';
import type { AnswerRow, FollowUp } from '../answer';
import { PAGES, type Line } from '../catalogue';
import { CARD_TITLE, chooseOnCard, confirmWords, updateCard, withDraft, withMessage, type CardModel, type MessageState } from '../conversation';
import { checkDraft, messageReach, type Draft, type MessageDraftA, type PlanData } from '../plan';
import { CardFrame, CardHead, Chip, body, quiet, say } from './parts';

type DraftCard = Extract<CardModel, { kind: 'draft' }>;

/** What a card may do outside itself (the screen that shows the conversation provides them). */
export interface CardControls {
  balance: number | null;
  /** Ask the assistant this sentence (a follow-up button, an AskBack answer). */
  ask: (text: string) => void;
  /** Open a page of the panel. */
  go: (path: string) => void;
  /** Send or save this card (its own task). */
  confirm: (turnId: string, card: DraftCard) => void;
  /** Ask the AI to change a message's words. */
  rewrite: (turnId: string, card: DraftCard, how: string) => void;
  openCredits: () => void;
  /** The WhatsApp one-by-one list for members without the app. */
  openQueue: (people: readonly MemberView[], text: string) => void;
}

export function CardView({ turnId, card, data, ctl }: { turnId: string; card: CardModel; data: PlanData; ctl: CardControls }) {
  switch (card.kind) {
    case 'answer':
      return <AnswerView turnId={turnId} card={card} data={data} ctl={ctl} />;
    case 'draft':
      return <DraftView turnId={turnId} card={card} data={data} ctl={ctl} />;
    case 'ask_back':
      return (
        <CardFrame label={t('A question back')}>
          <div style={{ padding: space.lg, display: 'grid', gap: space.md }}>
            <p style={{ ...body, fontWeight: 700 }}>{card.question}</p>
            {card.options.length > 0 ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: space.sm }}>
                {card.options.map((o) => (
                  <Chip key={o} onClick={() => ctl.ask(o)}>
                    {o}
                  </Chip>
                ))}
              </div>
            ) : (
              <p style={quiet}>{t('Type your answer in the box below.')}</p>
            )}
          </div>
        </CardFrame>
      );
    case 'open_page':
      return (
        <CardFrame label={t('Where to do it')}>
          <div style={{ padding: space.lg, display: 'grid', gap: space.md }}>
            {card.why ? <p style={body}>{card.why}</p> : null}
            {card.steps.length > 0 ? (
              <ol style={{ ...body, margin: 0, paddingLeft: 20, display: 'grid', gap: 4 }}>
                {card.steps.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ol>
            ) : null}
            {card.path ? (
              <>
                <p style={quiet}>{t('Where: {path}', { path: card.path })}</p>
                <Button variant="ghost" onClick={() => ctl.go(card.path!)}>
                  {t('Open {page}', { page: t(card.name) })}
                </Button>
              </>
            ) : null}
            <p style={quiet}>{t('Free. This never uses credits.')}</p>
          </div>
        </CardFrame>
      );
    case 'cannot':
      return (
        <CardFrame label={t('Something the assistant cannot do')}>
          <div style={{ padding: space.lg, display: 'grid', gap: space.md }}>
            <p style={body}>{card.reason || t('The assistant cannot do this.')}</p>
            <p style={quiet}>{t('Where: {path}', { path: '/feedback' })}</p>
            <Button variant="ghost" onClick={() => ctl.go('/feedback')}>
              {t('Open {page}', { page: t('Help and feedback') })}
            </Button>
          </div>
        </CardFrame>
      );
    case 'plan_writer': {
      const path = card.what === 'workout' ? '/workouts' : '/diet';
      const page = card.what === 'workout' ? 'Workout plans' : 'Diet plans';
      return (
        <CardFrame label={t(page)}>
          <CardHead title={t(page)} />
          <div style={{ padding: space.lg, display: 'grid', gap: space.md }}>
            <p style={body}>
              {card.what === 'workout'
                ? t('The AI Assistant cannot write workout plans yet. Make one in Workout plans: start from a ready plan and change it for the member.')
                : t('The AI Assistant cannot write diet plans yet. Make one in Diet plans: start from a ready plan and change it for the member.')}
            </p>
            <p style={quiet}>{t('Where: {path}', { path })}</p>
            <Button variant="ghost" onClick={() => ctl.go(path)}>
              {t('Open {page}', { page: t(page) })}
            </Button>
            {/* No credit line: "never uses credits" turns false once the worker writes plans (3 credits, R-471). */}
          </div>
        </CardFrame>
      );
    }
    case 'help':
      return (
        <CardFrame label={t('A how-to question')}>
          <div style={{ padding: space.lg, display: 'grid', gap: space.md }}>
            <p style={body}>{t('This is a how-to question. Help and feedback answers it, step by step.')}</p>
            <p style={quiet}>{t('Where: {path}', { path: '/feedback' })}</p>
            <Button variant="ghost" onClick={() => ctl.go('/feedback')}>
              {t('Open {page}', { page: t('Help and feedback') })}
            </Button>
          </div>
        </CardFrame>
      );
  }
}

// ------------------------------------------------------------------ answers

function AnswerView({ turnId, card, data, ctl }: { turnId: string; card: Extract<CardModel, { kind: 'answer' }>; data: PlanData; ctl: CardControls }) {
  const r = card.result;
  if (r.kind === 'choose') {
    return (
      <CardFrame label={t('Which member?')}>
        <Chooser typed={r.typed} options={r.options} onPick={(id) => updateCard(turnId, card.id, (c) => chooseOnCard(c, id, data))} />
      </CardFrame>
    );
  }
  if (r.kind === 'not_found') {
    return (
      <CardFrame label={t('No member found')}>
        <NotFound typed={r.typed} followUps={r.followUps} ctl={ctl} />
      </CardFrame>
    );
  }
  if (r.kind !== 'card') return null;
  const a = r.card;
  const more = a.total > a.rows.length;
  return (
    <CardFrame label={say(a.headline)}>
      <div style={{ padding: `${space.lg}px ${space.lg}px ${space.md}px` }}>
        {a.number !== null ? (
          <>
            <p style={{ margin: '0 0 4px', fontFamily: font.body, fontSize: 12, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: color.inkMuted }}>{say(a.headline)}</p>
            <p style={{ margin: 0, fontFamily: font.display, fontSize: 30, fontWeight: 700, color: color.ink, fontVariantNumeric: 'tabular-nums' }}>{a.number}</p>
          </>
        ) : (
          <p style={{ ...body, fontWeight: 800, fontSize: 16 }}>{say(a.headline)}</p>
        )}
      </div>
      {a.rows.length > 0 ? (
        <ul style={{ listStyle: 'none', margin: 0, padding: `0 ${space.lg}px` }}>
          {a.rows.map((row) => (
            <AnswerRowView key={row.key} row={row} ctl={ctl} />
          ))}
        </ul>
      ) : a.number === null ? (
        <p style={{ ...quiet, padding: `0 ${space.lg}px ${space.md}px` }}>{t('Nobody right now.')}</p>
      ) : null}
      <div style={{ padding: `${space.md}px ${space.lg}px ${space.lg}px`, display: 'grid', gap: 10, borderTop: `1px solid ${color.border}` }}>
        {a.seeAll ? (
          <button type="button" onClick={() => ctl.go(a.seeAll!.path)} style={linkButton}>
            {more ? t('See all {n} in {page}', { n: a.total, page: t(pageName(a.seeAll.path)) }) : t('Open {page}', { page: t(pageName(a.seeAll.path)) })}
          </button>
        ) : null}
        {a.followUps.length > 0 ? <FollowUps list={a.followUps} ctl={ctl} /> : null}
        <p style={quiet}>{t('Free. Questions never use credits.')}</p>
      </div>
    </CardFrame>
  );
}

const linkButton = {
  appearance: 'none',
  background: 'transparent',
  border: 'none',
  padding: 0,
  minHeight: 32,
  textAlign: 'left',
  fontFamily: font.body,
  fontWeight: 700,
  fontSize: 14,
  color: color.accentBright,
  cursor: 'pointer',
} as const;

function AnswerRowView({ row, ctl }: { row: AnswerRow; ctl: CardControls }) {
  const inner = (
    <span style={{ display: 'grid', gap: 2, minWidth: 0 }}>
      <b style={{ fontFamily: font.body, fontWeight: 700, fontSize: 15, color: color.ink, overflowWrap: 'anywhere' }}>{row.label}</b>
      {row.detail ? <span style={{ fontFamily: font.body, fontSize: 13, color: color.inkMuted }}>{say(row.detail)}</span> : null}
    </span>
  );
  return (
    <li style={{ borderTop: `1px solid ${color.border}`, padding: '10px 0' }}>
      {row.memberId ? (
        <button
          type="button"
          onClick={() => ctl.go(`/members/${row.memberId}`)}
          style={{ appearance: 'none', background: 'transparent', border: 'none', padding: 0, width: '100%', textAlign: 'left', cursor: 'pointer', minHeight: 36 }}
        >
          {inner}
        </button>
      ) : (
        inner
      )}
    </li>
  );
}

function FollowUps({ list, ctl }: { list: readonly FollowUp[]; ctl: CardControls }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: list.length > 1 ? 'repeat(2, minmax(0, 1fr))' : 'minmax(0, 1fr)', gap: 10 }}>
      {list.map((f, i) => (
        <Button key={`${f.label.text}-${i}`} variant={i === 0 ? 'primary' : 'ghost'} wrap full onClick={() => ('request' in f ? ctl.ask(f.request) : ctl.go(f.path))}>
          {say(f.label)}
        </Button>
      ))}
    </div>
  );
}

function Chooser({ typed, options, onPick }: { typed: string; options: readonly AnswerRow[]; onPick: (memberId: string) => void }) {
  return (
    <div style={{ padding: space.lg, display: 'grid', gap: space.md }}>
      <p style={{ ...body, fontWeight: 700 }}>{t('{n} members are called {name}. Which one?', { n: options.length, name: typed })}</p>
      <div style={{ display: 'grid', gap: space.sm }}>
        {options.map((o) => (
          <button
            key={o.key}
            type="button"
            onClick={() => onPick(o.memberId ?? o.key)}
            style={{
              appearance: 'none',
              display: 'grid',
              gap: 2,
              textAlign: 'left',
              minHeight: 48,
              padding: '10px 12px',
              borderRadius: 12,
              border: `1px solid ${color.borderStrong}`,
              background: 'transparent',
              cursor: 'pointer',
            }}
          >
            <b style={{ fontFamily: font.body, fontSize: 15, color: color.ink }}>{o.label}</b>
            {o.detail ? <span style={{ fontFamily: font.body, fontSize: 13, color: color.inkMuted }}>{say(o.detail)}</span> : null}
          </button>
        ))}
      </div>
    </div>
  );
}

function NotFound({ typed, followUps, ctl }: { typed: string; followUps: readonly FollowUp[]; ctl: CardControls }) {
  return (
    <div style={{ padding: space.lg, display: 'grid', gap: space.md }}>
      <p style={body}>{t('Nobody called “{name}” is on your members list.', { name: typed })}</p>
      {followUps.length > 0 ? <FollowUps list={followUps} ctl={ctl} /> : null}
    </div>
  );
}

// ------------------------------------------------------------------ drafts: messages and changes

function DraftView({ turnId, card, data, ctl }: { turnId: string; card: DraftCard; data: PlanData; ctl: CardControls }) {
  const title = t(CARD_TITLE[card.action.tool as Draft['tool']] ?? 'Task');
  const r = card.result;
  if (r.kind === 'choose') {
    return (
      <CardFrame label={title}>
        <CardHead title={title} />
        <Chooser typed={r.typed} options={r.options} onPick={(id) => updateCard(turnId, card.id, (c) => chooseOnCard(c, id, data))} />
      </CardFrame>
    );
  }
  if (r.kind === 'not_found') {
    return (
      <CardFrame label={title}>
        <CardHead title={title} />
        <NotFound typed={r.typed} followUps={r.followUps} ctl={ctl} />
      </CardFrame>
    );
  }
  const dr = r.draft;
  if (card.status === 'done' || card.status === 'cancelled') return <DoneView card={card} dr={dr} data={data} title={title} ctl={ctl} />;
  return dr.tool === 'draft_message' ? (
    <MessageView turnId={turnId} card={card} dr={dr} data={data} ctl={ctl} />
  ) : (
    <ChangeView turnId={turnId} card={card} dr={dr} data={data} ctl={ctl} title={title} />
  );
}

function DoneView({ card, dr, data, title, ctl }: { card: DraftCard; dr: Draft; data: PlanData; title: string; ctl: CardControls }) {
  const step = card.steps[0];
  // A message went to the app: the members without it are one tap from WhatsApp, as on the Messages page.
  const reach = card.status === 'done' && dr.tool === 'draft_message' ? messageReach(dr, data) : null;
  return (
    <CardFrame label={title}>
      <CardHead title={title} />
      <div role="status" style={{ padding: space.lg, display: 'grid', gap: space.md }}>
        {card.status === 'cancelled' ? (
          <p style={quiet}>{t('Cancelled. Nothing was sent or saved, and no credit was used.')}</p>
        ) : (
          <>
            <p style={{ ...body, color: color.goodText, fontWeight: 700 }}>{card.outcome ? say(card.outcome) : t('Done.')}</p>
            {step?.path ? (
              <Button variant="ghost" onClick={() => ctl.go(step.path!)}>
                {t('Open {page}', { page: t(pageName(step.path)) })}
              </Button>
            ) : null}
            {reach && reach.whatsapp.length > 0 && dr.tool === 'draft_message' ? (
              <Button variant="ghost" full wrap onClick={() => ctl.openQueue(reach.whatsapp, `${dr.title}

${dr.body}`)}>
                {t('{n} without the app: send on WhatsApp', { n: reach.whatsapp.length })}
              </Button>
            ) : null}
          </>
        )}
      </div>
    </CardFrame>
  );
}

/** The panel's own name for a page ("Dues", "Messages & offers"), from the catalogue's page list. */
export function pageName(path: string): string {
  const exact = PAGES.find((p) => p.path === path);
  if (exact) return exact.name;
  const pattern = PAGES.find((p) => p.path.includes(':id') && path.startsWith(p.path.split(':id')[0]));
  return pattern ? pattern.name : 'the page';
}

/** The card's problems (block the button) and warnings (said, the button still works). */
function Checks({ dr, data, card }: { dr: Draft; data: PlanData; card: DraftCard }) {
  const { problems, warnings } = checkDraft(dr, data);
  return (
    <>
      {problems.map((p, i) => (
        <p key={`p${i}`} role="alert" style={{ ...quiet, color: color.criticalText, fontWeight: 700 }}>
          {say(p.message)}
        </p>
      ))}
      {warnings.map((w, i) => (
        <p key={`w${i}`} style={{ margin: 0, padding: '10px 12px', borderRadius: 10, background: 'rgba(250,178,25,0.12)', color: color.warning, fontFamily: font.body, fontSize: 13, lineHeight: 1.45 }}>
          {say(w)}
        </p>
      ))}
      {card.outcome && card.status === 'open' ? (
        <p role="alert" style={{ ...quiet, color: color.criticalText, fontWeight: 700 }}>
          {say(card.outcome)}
        </p>
      ) : null}
    </>
  );
}

function ConfirmButton({ turnId, card, dr, data, ctl, appCount }: { turnId: string; card: DraftCard; dr: Draft; data: PlanData; ctl: CardControls; appCount: number | null }) {
  const words = confirmWords(dr, appCount, ctl.balance);
  const blocked = checkDraft(dr, data).problems.length > 0;
  const label =
    words.credits === null
      ? say(words.action)
      : words.credits === 1
        ? t('{action} · 1 credit', { action: say(words.action) })
        : t('{action} · {credits} credits', { action: say(words.action), credits: words.credits });
  return (
    <Button
      full
      wrap
      needsInternet
      disabled={card.status === 'saving' || (!words.needCredits && blocked)}
      onClick={() => (words.needCredits ? ctl.openCredits() : ctl.confirm(turnId, card))}
    >
      {card.status === 'saving' ? t('Working…') : label}
    </Button>
  );
}

function CancelButton({ turnId, card }: { turnId: string; card: DraftCard }) {
  return (
    <Button variant="quiet" full disabled={card.status === 'saving'} onClick={() => updateCard(turnId, card.id, (c) => (c.kind === 'draft' ? { ...c, status: 'cancelled' } : c))}>
      {t('Cancel')}
    </Button>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '11px 0', borderBottom: `1px solid ${color.border}` }}>
      <dt style={{ fontFamily: font.body, fontSize: 14, color: color.inkMuted, flexShrink: 0 }}>{label}</dt>
      <dd style={{ margin: 0, textAlign: 'right', fontFamily: font.body, fontSize: 14, color: color.ink, minWidth: 0, overflowWrap: 'anywhere' }}>{children}</dd>
    </div>
  );
}

export const KIND_WORDS: Record<MessageKind, string> = {
  announcement: 'News',
  offer: 'Offer',
  event: 'Event',
  closed: 'Gym closed',
  timing: 'Timing change',
  reminder: 'Reminder',
};

function MessageView({ turnId, card, dr, data, ctl }: { turnId: string; card: DraftCard; dr: MessageDraftA; data: PlanData; ctl: CardControls }) {
  const [editing, setEditing] = useState(false);
  const msg = card.message;
  const reach = messageReach(dr, data);
  // In the app: everyone = every app member of the gym (the server sends to all of them); a group = its app members.
  const inApp = reach && data.appMembers ? (reach.everyone ? data.appMembers.length : (reach.appIds?.length ?? 0)) : null;
  const setMsg = (next: MessageState) => updateCard(turnId, card.id, (c) => (c.kind === 'draft' ? withMessage(c, next, data) : c));
  const setWords = (title: string, bodyText: string) =>
    updateCard(turnId, card.id, (c) => (c.kind === 'draft' && c.result.kind === 'draft' && c.result.draft.tool === 'draft_message'
      ? { ...withDraft(c, { ...c.result.draft, title, body: bodyText }), message: c.message ? { ...c.message, edited: true } : null }
      : c));
  const text = `${dr.title}\n\n${dr.body}`;
  const gymName = data.snapshot.gym.name;
  return (
    <CardFrame label={t('Message to your members')}>
      <CardHead title={t('Message to your members')} />
      <dl style={{ margin: 0, padding: `4px ${space.lg}px` }}>
        <Row label={t('Who gets it')}>
          {reach ? (
            <>
              <b>{reach.everyone ? t('Everyone · {n} members', { n: reach.group.length }) : reach.group.length === 1 ? t('1 member') : t('{n} members', { n: reach.group.length })}</b>
              <br />
              <span style={{ color: color.inkSecondary }}>{inApp === null ? t('The app list could not load.') : inApp === 1 ? t('1 has the app') : t('{n} have the app', { n: inApp })}</span>
            </>
          ) : (
            t('This group could not be found.')
          )}
        </Row>
        <Row label={t('Type')}>
          <b>{t(KIND_WORDS[dr.kind])}</b>
        </Row>
        {msg ? (
          <Row label={t('Language')}>
            <span role="group" aria-label={t('Language')} style={{ display: 'inline-flex', gap: 4, padding: 3, borderRadius: 10, background: color.surfaceSunken }}>
              {(['en', 'hi', 'both'] as const).map((l) => (
                <LangChip key={l} on={msg.lang === l} onClick={() => setMsg({ ...msg, lang: l, edited: false })}>
                  {l === 'en' ? t('English') : l === 'hi' ? t('Hindi') : t('Both')}
                </LangChip>
              ))}
            </span>
          </Row>
        ) : null}
        <WhenRow turnId={turnId} card={card} dr={dr} />
      </dl>
      <div style={{ margin: `${space.sm}px ${space.lg}px 0`, padding: 14, borderRadius: 14, background: '#F4F5F7', color: '#14161C', border: '1px solid rgba(20,22,28,0.12)' }}>
        <p style={{ margin: '0 0 8px', display: 'flex', alignItems: 'center', gap: 8, fontFamily: font.body, fontSize: 12, color: '#464D5B', fontWeight: 700 }}>
          <span aria-hidden style={{ width: 20, height: 20, borderRadius: 6, background: '#14161C', color: '#FF7A3B', display: 'grid', placeItems: 'center', fontSize: 10, fontWeight: 800 }}>
            {initialsOf(gymName)}
          </span>
          {t('{gym} · how members see it', { gym: gymName })}
        </p>
        <p style={{ margin: '0 0 6px', fontFamily: font.body, fontSize: 16, fontWeight: 800, overflowWrap: 'anywhere' }}>{dr.title || t('(no title yet)')}</p>
        <p style={{ margin: 0, fontFamily: font.body, fontSize: 14, lineHeight: 1.5, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{dr.body || t('(no words yet)')}</p>
      </div>
      {editing ? (
        <div style={{ padding: `0 ${space.lg}px` }}>
          <TextField label={t('Title')} value={dr.title} onChange={(v) => setWords(v, dr.body)} />
          <TextField label={t('Message')} value={dr.body} multiline onChange={(v) => setWords(dr.title, v)} />
        </div>
      ) : null}
      <div style={{ padding: `${space.md}px ${space.lg}px 0`, display: 'flex', flexWrap: 'wrap', gap: space.sm }}>
        <Chip round pressed={editing} onClick={() => setEditing((e) => !e)}>
          {editing ? t('Done editing') : t('Edit the words')}
        </Chip>
        {msg && msg.rewrites < 5 ? (
          <>
            <Chip round onClick={() => ctl.rewrite(turnId, card, 'Make it shorter')}>
              {t('Shorter')}
            </Chip>
            {dr.kind === 'offer' ? (
              <Chip round onClick={() => ctl.rewrite(turnId, card, 'Add the last date of the offer. If no date was given, end it this Sunday.')}>
                {t('Add last date of offer')}
              </Chip>
            ) : null}
            <Chip round onClick={() => ctl.rewrite(turnId, card, dr.kind === 'closed' || dr.kind === 'timing' || dr.kind === 'reminder' ? 'Make it more polite' : 'Make it more festive and warm')}>
              {dr.kind === 'closed' || dr.kind === 'timing' || dr.kind === 'reminder' ? t('More polite') : t('More festive')}
            </Chip>
            {msg.lang === 'en' ? (
              <Chip round onClick={() => ctl.rewrite(turnId, card, 'Add the same message in Hindi')}>
                {t('Add Hindi')}
              </Chip>
            ) : null}
          </>
        ) : null}
      </div>
      <div style={{ padding: `14px ${space.lg}px ${space.lg}px`, display: 'grid', gap: 10 }}>
        <Checks dr={dr} data={data} card={card} />
        {inApp === 0 ? (
          <p style={{ ...quiet, color: color.ink }}>{t('None of these members has the MettleUp app yet, so the message cannot go in the app. Send it on WhatsApp below.')}</p>
        ) : (
          <ConfirmButton turnId={turnId} card={card} dr={dr} data={data} ctl={ctl} appCount={inApp} />
        )}
        {reach && reach.whatsapp.length > 0 ? (
          <Button variant="ghost" full wrap onClick={() => ctl.openQueue(reach.whatsapp, text)}>
            {t('{n} without the app: send on WhatsApp', { n: reach.whatsapp.length })}
          </Button>
        ) : null}
        <CancelButton turnId={turnId} card={card} />
      </div>
    </CardFrame>
  );
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? 'G') + (parts[1]?.[0] ?? '')).toUpperCase();
}

function LangChip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      style={{
        appearance: 'none',
        minHeight: 34,
        padding: '0 10px',
        border: 'none',
        borderRadius: 8,
        background: on ? color.accent : 'transparent',
        color: on ? '#1F0D05' : color.inkSecondary,
        fontFamily: font.body,
        fontWeight: on ? 800 : 700,
        fontSize: 13,
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}

function WhenRow({ turnId, card, dr }: { turnId: string; card: DraftCard; dr: MessageDraftA }) {
  const set = (sendAt: string) =>
    updateCard(turnId, card.id, (c) => (c.kind === 'draft' && c.result.kind === 'draft' && c.result.draft.tool === 'draft_message' ? withDraft(c, { ...c.result.draft, sendAt }) : c));
  const later = dr.sendAt !== '';
  return (
    <div style={{ padding: '10px 0', display: 'grid', gap: space.sm }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <span style={{ fontFamily: font.body, fontSize: 14, color: color.inkMuted }}>{t('When')}</span>
        <span style={{ display: 'inline-flex', gap: 4, padding: 3, borderRadius: 10, background: color.surfaceSunken }}>
          <LangChip on={!later} onClick={() => set('')}>
            {t('Now')}
          </LangChip>
          <LangChip on={later} onClick={() => set(later ? dr.sendAt : tomorrowMorning())}>
            {t('Later')}
          </LangChip>
        </span>
      </div>
      {later ? <TextField label={t('Send on')} type="datetime-local" value={dr.sendAt} onChange={set} /> : null}
    </div>
  );
}

function tomorrowMorning(): string {
  const d = new Date(Date.now() + 24 * 3600 * 1000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T08:00`;
}

// ------------------------------------------------------------------ changes

function ChangeView({ turnId, card, dr, data, ctl, title }: { turnId: string; card: DraftCard; dr: Exclude<Draft, MessageDraftA>; data: PlanData; ctl: CardControls; title: string }) {
  const [editing, setEditing] = useState(false);
  const set = (next: Draft) => updateCard(turnId, card.id, (c) => (c.kind === 'draft' ? withDraft(c, next) : c));
  const receipt =
    dr.tool === 'renew' && dr.collectNowP > 0
      ? t('A receipt is made, the same as when you renew by hand.')
      : dr.tool === 'add_member' && dr.collectNowP > 0
        ? t('A receipt is made, the same as when you add a member by hand.')
        : dr.tool === 'record_payment'
          ? t('A receipt is made, the same as when you record a payment by hand.')
          : null;
  return (
    <CardFrame label={title}>
      <CardHead title={title} />
      <dl style={{ margin: 0, padding: `4px ${space.lg}px` }}>
        {changeRows(dr, data).map((row) => (
          <Row key={row.label} label={t(row.label)}>
            {row.strong ? <b>{row.value}</b> : row.value}
            {row.note ? <span style={{ color: color.inkMuted }}>{` ${row.note}`}</span> : null}
          </Row>
        ))}
      </dl>
      {editing ? <EditFields dr={dr} data={data} set={set} /> : null}
      <div style={{ padding: `14px ${space.lg}px ${space.lg}px`, display: 'grid', gap: 10 }}>
        <Checks dr={dr} data={data} card={card} />
        <ConfirmButton turnId={turnId} card={card} dr={dr} data={data} ctl={ctl} appCount={null} />
        <Button variant="ghost" full onClick={() => setEditing((e) => !e)}>
          {editing ? t('Done changing') : t('Change something')}
        </Button>
        <CancelButton turnId={turnId} card={card} />
        {receipt ? <p style={quiet}>{receipt}</p> : null}
      </div>
    </CardFrame>
  );
}

interface ShownRow {
  label: string;
  value: string;
  strong?: boolean;
  note?: string;
}

/** "Gold · 3 months": the plan and its length (the words of the Plans page). */
function planWords(pl: Plan): string {
  const length =
    pl.durationUnit === 'day'
      ? pl.durationCount === 1 ? t('1 day') : t('{n} days', { n: pl.durationCount })
      : pl.durationCount === 12 ? t('12 months (1 year)') : pl.durationCount === 1 ? t('1 month') : t('{n} months', { n: pl.durationCount });
  return `${pl.name} · ${length}`;
}

const day = (d: string) => (isValidDateISO(d) ? formatDayShort(d) : '—');
const money = (p: number) => formatINR(p);

/** The rows a change card shows: every field, money in bold (03-design §2 C). PURE (exported for tests). */
export function changeRows(dr: Exclude<Draft, MessageDraftA>, data: PlanData): ShownRow[] {
  const member = (id: string) => data.allViews.find((v) => v.member.id === id)?.member.fullName ?? '—';
  const plan = (id: string | null) => (id ? data.snapshot.plans.find((p) => p.id === id) ?? null : null);
  const paid = (p: number, m: PaymentMethod) => (p > 0 ? t('{amount} {method}', { amount: money(p), method: methodLabel(m).toLowerCase() }) : t('Nothing now'));
  switch (dr.tool) {
    case 'add_member': {
      const pl = plan(dr.planId);
      return [
        { label: 'Name', value: dr.form.fullName || '—', strong: true },
        { label: 'Mobile', value: dr.form.phone ? `${dr.form.dialCode} ${dr.form.phone}` : '—' },
        { label: 'Plan', value: pl ? planWords(pl) : t('No plan yet') },
        ...(pl ? [{ label: 'Dates', value: `${day(dr.startsOn)} → ${day(endDateForPlan(dr.startsOn, pl))}` }, { label: 'Price', value: money(dr.priceP + dr.joiningFeeP), strong: true }] : []),
        ...(pl ? [{ label: 'Paid now', value: paid(dr.collectNowP, dr.method), strong: true }] : []),
      ];
    }
    case 'renew': {
      const pl = plan(dr.planId);
      return [
        { label: 'Member', value: member(dr.memberId), strong: true },
        { label: 'Plan', value: pl ? planWords(pl) : '—' },
        ...(pl ? [{ label: 'Dates', value: `${day(dr.startsOn)} → ${day(endDateForPlan(dr.startsOn, pl))}` }] : []),
        { label: 'Price', value: money(dr.priceP + dr.joiningFeeP), strong: true, note: pl && pl.priceP !== dr.priceP ? t('(list price {amount})', { amount: money(pl.priceP) }) : undefined },
        { label: 'Paid now', value: paid(dr.collectNowP, dr.method), strong: true },
      ];
    }
    case 'record_payment': {
      const ms = dr.membershipId ? data.snapshot.memberships.find((m) => m.id === dr.membershipId) : undefined;
      return [
        { label: 'Member', value: member(dr.memberId), strong: true },
        { label: 'Amount', value: money(dr.amountP), strong: true },
        { label: 'Paid by', value: methodLabel(dr.method) },
        { label: 'For', value: ms ? ms.planName : '—' },
        ...(dr.note ? [{ label: 'Note', value: dr.note }] : []),
      ];
    }
    case 'extend': {
      const ms = dr.membershipId ? data.snapshot.memberships.find((m) => m.id === dr.membershipId) : undefined;
      return [
        { label: 'Member', value: member(dr.memberId), strong: true },
        { label: 'Extra days', value: dr.days === 1 ? t('1 day') : t('{n} days', { n: dr.days }), strong: true },
        ...(ms ? [{ label: 'New end date', value: day(addDays(ms.endsOn, dr.days)) }] : []),
        { label: 'Why', value: dr.reason || '—' },
      ];
    }
    case 'add_enquiry':
      return [
        { label: 'Name', value: dr.form.name || '—', strong: true },
        { label: 'Mobile', value: dr.form.phone ? `${dr.form.dialCode} ${dr.form.phone}` : '—' },
        { label: 'Interested in', value: dr.form.interest || '—' },
        { label: 'Call back on', value: dr.form.followUpOn ? day(dr.form.followUpOn) : '—' },
      ];
    case 'add_expense':
      return [
        { label: 'Amount', value: money(dr.amountP), strong: true },
        { label: 'For', value: categoryLabel(dr.category) },
        { label: 'Date', value: day(dr.spentOn) },
        ...(dr.note ? [{ label: 'Note', value: dr.note }] : []),
      ];
    case 'draft_workout_plan':
    case 'draft_diet_plan':
      return [];
  }
}

const rupees = (p: number) => (p > 0 ? String(paiseToRupees(p)) : '');
const toPaise = (v: string) => rupeesToPaise(Math.max(0, Number(v.replace(/[^\d.]/g, '')) || 0));

function EditFields({ dr, data, set }: { dr: Exclude<Draft, MessageDraftA>; data: PlanData; set: (d: Draft) => void }) {
  const methods = methodOptions();
  const plans = data.snapshot.plans.filter((p) => p.active).map((p) => ({ value: p.id, label: `${p.name} · ${formatINR(p.priceP)}` }));
  const box = (children: ReactNode) => <div style={{ padding: `0 ${space.lg}px`, display: 'grid' }}>{children}</div>;
  switch (dr.tool) {
    case 'add_member':
    case 'renew': {
      const pickPlan = (id: string) => {
        const p = data.snapshot.plans.find((x) => x.id === id) ?? null;
        set({ ...dr, planId: p ? p.id : null, priceP: p ? p.priceP : 0 });
      };
      return box(
        <>
          {dr.tool === 'add_member' ? (
            <>
              <TextField label={t('Name')} value={dr.form.fullName} onChange={(v) => set({ ...dr, form: { ...dr.form, fullName: v } })} />
              <TextField label={t('Mobile')} inputMode="tel" value={dr.form.phone} onChange={(v) => set({ ...dr, form: { ...dr.form, phone: v.replace(/[^\d]/g, '') } })} />
            </>
          ) : null}
          <SelectField
            label={t('Plan')}
            value={dr.planId ?? ''}
            onChange={pickPlan}
            options={[...(dr.tool === 'add_member' ? [{ value: '', label: t('No plan yet') }] : []), ...plans]}
          />
          <TextField label={t('Starts on')} type="date" value={dr.startsOn} onChange={(v) => set({ ...dr, startsOn: v })} />
          <TextField label={t('Paid now')} prefix="₹" inputMode="numeric" value={rupees(dr.collectNowP)} onChange={(v) => set({ ...dr, collectNowP: toPaise(v) })} />
          <SelectField label={t('Paid by')} value={dr.method} onChange={(v) => set({ ...dr, method: v as PaymentMethod })} options={methods} />
        </>,
      );
    }
    case 'record_payment':
      return box(
        <>
          <TextField label={t('Amount')} prefix="₹" inputMode="numeric" value={rupees(dr.amountP)} onChange={(v) => set({ ...dr, amountP: toPaise(v) })} />
          <SelectField label={t('Paid by')} value={dr.method} onChange={(v) => set({ ...dr, method: v as PaymentMethod })} options={methods} />
          <TextField label={t('Note')} value={dr.note} onChange={(v) => set({ ...dr, note: v })} />
        </>,
      );
    case 'extend':
      return box(
        <>
          <TextField label={t('Extra days')} inputMode="numeric" value={dr.days ? String(dr.days) : ''} onChange={(v) => set({ ...dr, days: Math.max(0, Math.round(Number(v.replace(/\D/g, '')) || 0)) })} />
          <TextField label={t('Why')} value={dr.reason} onChange={(v) => set({ ...dr, reason: v })} />
        </>,
      );
    case 'add_enquiry':
      return box(
        <>
          <TextField label={t('Name')} value={dr.form.name} onChange={(v) => set({ ...dr, form: { ...dr.form, name: v } })} />
          <TextField label={t('Mobile')} inputMode="tel" value={dr.form.phone} onChange={(v) => set({ ...dr, form: { ...dr.form, phone: v.replace(/[^\d]/g, '') } })} />
          <TextField label={t('Interested in')} value={dr.form.interest} onChange={(v) => set({ ...dr, form: { ...dr.form, interest: v } })} />
          <TextField label={t('Call back on')} type="date" value={dr.form.followUpOn} onChange={(v) => set({ ...dr, form: { ...dr.form, followUpOn: v } })} />
        </>,
      );
    case 'add_expense':
      return box(
        <>
          <TextField label={t('Amount')} prefix="₹" inputMode="numeric" value={rupees(dr.amountP)} onChange={(v) => set({ ...dr, amountP: toPaise(v) })} />
          <SelectField
            label={t('For')}
            value={dr.category}
            onChange={(v) => set({ ...dr, category: v as ExpenseCategory })}
            options={EXPENSE_CATEGORIES.map((c) => ({ value: c, label: categoryLabel(c) }))}
          />
          <TextField label={t('Date')} type="date" value={dr.spentOn} onChange={(v) => set({ ...dr, spentOn: v })} />
          <TextField label={t('Note')} value={dr.note} onChange={(v) => set({ ...dr, note: v })} />
        </>,
      );
    case 'draft_workout_plan':
    case 'draft_diet_plan':
      return null;
  }
}

/** For the conversation: the user's own request bubble. */
export function RequestBubble({ text, spoken }: { text: string; spoken: boolean }) {
  return (
    <div
      style={{
        alignSelf: 'flex-end',
        maxWidth: '86%',
        padding: '12px 14px',
        borderRadius: '16px 16px 4px 16px',
        background: color.surfaceSunken,
        border: `1px solid ${color.border}`,
        fontFamily: font.body,
        fontSize: 15,
        lineHeight: 1.45,
        color: color.ink,
        overflowWrap: 'anywhere',
      }}
    >
      {spoken ? <span style={{ display: 'block', fontSize: 12, color: color.inkMuted, marginBottom: 4 }}>{t('Spoken')}</span> : null}
      {text}
    </div>
  );
}

/** A calm line from the assistant (its note, a failure). */
export function AssistantLine({ words, tone }: { words: Line | string; tone?: 'fail' }) {
  return (
    <p
      role={tone === 'fail' ? 'alert' : undefined}
      style={{
        margin: 0,
        padding: '10px 12px',
        borderRadius: radius.md,
        background: tone === 'fail' ? 'rgba(198,40,40,0.10)' : color.surface,
        border: `1px solid ${color.border}`,
        fontFamily: font.body,
        fontSize: 14,
        lineHeight: 1.45,
        color: tone === 'fail' ? color.criticalText : color.ink,
      }}
    >
      {typeof words === 'string' ? words : say(words)}
    </p>
  );
}
