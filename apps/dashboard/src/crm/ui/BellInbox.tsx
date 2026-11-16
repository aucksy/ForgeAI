/**
 * R-604 (owner, 16 Nov 2026, "yes alerts fix"): the bell's "Your gym" part as this person's to-do list, from the
 * server's truth (supabase 0098 owner_alert_list; rules in logic/alertInbox.ts).
 *  - Each card looks like something to tap: a border, our own pressed look (never the browser's grey tap cover), a
 *    chevron, the same hover and keyboard focus ring as every row (index.css .tap-row / .bell-card / .tap-icon).
 *  - Each card has its own X ("Remove from your list: <the line>"), a separate 44 px button: tapping X never opens the
 *    page, tapping the card never removes it. X moves the card to History for this person only; on an action item it
 *    never marks the thing done.
 *  - History sits at the top of the panel, folded to one row ("History" and its count); open, every line still opens
 *    its page.
 * The panel (ui/WhatsNew.tsx NewsBell) keeps the lists as they were when it opened: nothing moves under the finger.
 */
import { useId, useState } from 'react';

import { t } from '../lang/lang';
import { historyTag, INBOX_WORDS as W, type InboxAlert } from '../logic/alertInbox';
import { paymentTone } from '../logic/bellGroups';
import { alertAge, alertShown, type AlertOrder } from '../logic/gymAlerts';
import { GroupCount, GroupLabel, groupLabelText } from './GroupLabel';
import { color, font, radius, space, TOUCH } from './kit';
import { PaymentTag, paymentRowLook } from './PaymentTag';

const tagStyle = { padding: '1px 8px', borderRadius: radius.pill, fontSize: 11, fontWeight: 800 } as const;

function NewTag() {
  return <span style={{ ...tagStyle, background: color.accentSoft, color: color.accentBright }}>{t(W.newTag)}</span>;
}

function QuietTag({ text, testId }: { text: string; testId?: string }) {
  return (
    <span data-done-tag={testId} style={{ ...tagStyle, background: color.surfaceSunken, color: color.inkSecondary }}>
      {text}
    </span>
  );
}

/** The "this opens" mark at the end of a card (a chevron; turns down/up on the History row). */
export function Chevron({ dir = 'right' }: { dir?: 'right' | 'down' | 'up' }) {
  const d = dir === 'right' ? 'M9 6l6 6-6 6' : dir === 'down' ? 'M6 9l6 6 6-6' : 'M6 15l6-6 6 6';
  return (
    <svg className="tap-chevron" aria-hidden width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" style={{ color: color.inkMuted, flex: '0 0 auto' }}>
      <path d={d} />
    </svg>
  );
}

function CrossMark() {
  return (
    <svg aria-hidden width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
      <path d="M7 7l10 10M17 7L7 17" />
    </svg>
  );
}

const lineStyle = { fontSize: 14, lineHeight: 1.45, overflowWrap: 'anywhere' } as const;

/** One card of the main list: the card opens its page, the X beside it removes it from this person's list. */
function InboxCard({
  a,
  isNew,
  doneNow,
  orders,
  now,
  onGo,
  onRemove,
}: {
  a: InboxAlert;
  isNew: boolean;
  doneNow: boolean;
  orders: readonly AlertOrder[];
  now: number;
  onGo: (a: InboxAlert, route: string) => void;
  onRemove: (a: InboxAlert, line: string) => void;
}) {
  const shown = alertShown(a, orders);
  const tone = paymentTone(a);
  const pay = tone ? paymentRowLook(tone) : null;
  const done = doneNow || shown.done;
  return (
    <li
      className="bell-card"
      data-alert-card={a.id}
      data-needs={a.needs}
      style={{
        display: 'flex',
        alignItems: 'stretch',
        borderRadius: radius.md,
        border: `1px solid ${color.border}`,
        borderLeft: pay ? pay.borderLeft : `3px solid ${isNew ? color.accent : color.border}`,
        background: pay ? pay.background : isNew ? color.surfaceRaised : 'transparent',
        overflow: 'hidden',
      }}
    >
      <button
        type="button"
        className="tap-row"
        data-pay-row={tone ?? undefined}
        onClick={() => onGo(a, shown.route)}
        style={{
          flex: '1 1 auto',
          minWidth: 0,
          minHeight: TOUCH,
          display: 'flex',
          alignItems: 'center',
          gap: space.sm,
          textAlign: 'left',
          cursor: 'pointer',
          padding: `${space.sm}px ${space.xs}px ${space.sm}px ${space.md}px`,
          border: 'none',
          borderRadius: 0,
          background: 'transparent',
          color: color.ink,
          fontFamily: font.body,
        }}
      >
        <span style={{ display: 'grid', gap: 4, minWidth: 0, flex: '1 1 auto' }}>
          {tone || isNew || done ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' }}>
              {tone ? <PaymentTag tone={tone} /> : null}
              {isNew ? <NewTag /> : null}
              {done ? <QuietTag text={t(W.done)} testId="" /> : null}
            </span>
          ) : null}
          <span style={{ ...lineStyle, fontWeight: a.urgent && !done ? 600 : 400 }}>{shown.line}</span>
          <span style={{ fontSize: 12, color: color.inkSecondary }}>{alertAge(a.at, now)}</span>
        </span>
        <Chevron />
      </button>
      <button
        type="button"
        className="tap-icon"
        data-remove={a.id}
        aria-label={t(W.removeLabel, { line: shown.line })}
        title={t(W.removeTitle)}
        onClick={() => onRemove(a, shown.line)}
        style={{
          flex: '0 0 auto',
          width: TOUCH,
          minHeight: TOUCH,
          display: 'grid',
          placeItems: 'center',
          padding: 0,
          border: 'none',
          borderLeft: `1px solid ${color.border}`,
          background: 'transparent',
          color: color.inkSecondary,
          cursor: 'pointer',
        }}
      >
        <CrossMark />
      </button>
    </li>
  );
}

/** "Your gym": the main list. `items`: as frozen when the panel opened, each with "done since it opened". */
export function BellInbox({
  items,
  fresh,
  orders,
  first,
  onGo,
  onRemove,
}: {
  items: readonly { alert: InboxAlert; doneNow: boolean }[];
  fresh: ReadonlySet<string>;
  orders: readonly AlertOrder[];
  first: boolean;
  onGo: (a: InboxAlert, route: string) => void;
  onRemove: (a: InboxAlert, line: string) => void;
}) {
  const now = Date.now();
  return (
    <section aria-label={t('Your gym')} style={{ display: 'grid', gap: space.xs }}>
      <GroupLabel as="h3" first={first} count={items.length}>
        {t('Your gym')}
      </GroupLabel>
      {items.length === 0 ? (
        <p data-testid="bell-all-done" style={{ margin: 0, fontFamily: font.body, fontSize: 14, lineHeight: 1.5, color: color.inkSecondary }}>
          {t(W.allDone)}
        </p>
      ) : (
        <ul data-testid="bell-gym-alerts" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: space.xs }}>
          {items.map(({ alert, doneNow }) => (
            <InboxCard key={alert.id} a={alert} isNew={fresh.has(`alert-${alert.id}`)} doneNow={doneNow} orders={orders} now={now} onGo={onGo} onRemove={onRemove} />
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * History, folded to one row at the top of the panel; open, each line opens its page. Always there (also with 0), so
 * the first card removed with the X never pushes the list down under the finger.
 */
export function BellHistory({ items, orders, onGo }: { items: readonly InboxAlert[]; orders: readonly AlertOrder[]; onGo: (a: InboxAlert, route: string) => void }) {
  const [unfolded, setUnfolded] = useState(false);
  const listId = useId();
  const now = Date.now();
  return (
    <section aria-label={t(W.history)} data-testid="bell-history" style={{ display: 'grid', gap: space.xs, marginBottom: space.md }}>
      <button
        type="button"
        className="tap-row bell-fold"
        aria-expanded={unfolded}
        aria-controls={listId}
        onClick={() => setUnfolded(!unfolded)}
        style={{
          width: '100%',
          minHeight: TOUCH,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: space.sm,
          padding: `${space.xs}px ${space.md}px`,
          border: `1px solid ${color.border}`,
          borderRadius: radius.md,
          background: 'transparent',
          color: color.ink,
          cursor: 'pointer',
        }}
      >
        <span style={{ ...groupLabelText, display: 'flex', alignItems: 'center', gap: space.sm }}>
          {t(W.history)}
          <GroupCount n={items.length} />
        </span>
        <Chevron dir={unfolded ? 'up' : 'down'} />
      </button>
      {unfolded ? (
        <div id={listId} style={{ display: 'grid', gap: space.xs }}>
          <p data-testid="bell-history-hint" style={{ margin: 0, fontFamily: font.body, fontSize: 12, lineHeight: 1.5, color: color.inkMuted }}>
            {t(items.length === 0 ? W.historyEmpty : W.historyHint)}
          </p>
          {items.length === 0 ? null : (
          <ul data-testid="bell-history-list" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: space.xs }}>
            {items.map((a) => {
              const shown = alertShown(a, orders);
              const by = a.left === 'done' && a.doneBy ? t(W.doneBy, { name: a.doneBy }) : null;
              return (
                <li key={a.id} className="bell-card" data-history-card={a.id} data-left={a.left} style={{ borderRadius: radius.md, border: `1px solid ${color.border}`, overflow: 'hidden' }}>
                  <button
                    type="button"
                    className="tap-row"
                    onClick={() => onGo(a, shown.route)}
                    style={{
                      width: '100%',
                      minHeight: TOUCH,
                      display: 'flex',
                      alignItems: 'center',
                      gap: space.sm,
                      textAlign: 'left',
                      cursor: 'pointer',
                      padding: `${space.sm}px ${space.sm}px ${space.sm}px ${space.md}px`,
                      border: 'none',
                      borderRadius: 0,
                      background: 'transparent',
                      color: color.ink,
                      fontFamily: font.body,
                    }}
                  >
                    <span style={{ display: 'grid', gap: 4, minWidth: 0, flex: '1 1 auto' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' }}>
                        <QuietTag text={t(historyTag(a))} />
                      </span>
                      <span style={{ ...lineStyle, color: color.inkSecondary }}>{shown.line}</span>
                      <span style={{ fontSize: 12, color: color.inkMuted }}>{[by, alertAge(a.leftAt ?? a.at, now)].filter(Boolean).join(' · ')}</span>
                    </span>
                    <Chevron />
                  </button>
                </li>
              );
            })}
          </ul>
          )}
        </div>
      ) : null}
    </section>
  );
}
