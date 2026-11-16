/**
 * F201: the AI Assistant on the Today screen (canvas board "Today"): a box to ask in, and today's ideas, each with
 * "Make it". A tap opens the assistant (the side panel on a computer, the full screen on a phone) with the sentence
 * already asked. Owner only, and hidden until the server's wallet answers (useAssistant), like the rest of it.
 */
import { useMemo } from 'react';

import { useCan } from '../../auth/AuthProvider';
import { t } from '../../lang/lang';
import { useBirthdayAutoWish } from '../../shop/birthdayAuto';
import { useShop } from '../../shop/ShopProvider';
import { useCrm } from '../../store';
import { color, font, space, useIsCompact } from '../../ui/kit';
import { navigate } from '../../ui/router';
import { todaySuggestions } from '../suggestions';
import { useAssistant } from '../useAssistant';
import { CreditsPill, IdeaRow, SparkleIcon, queueRequest, queueShow, say, setPanelOpen, type ShowList } from './parts';

export function TodayAiCard() {
  const { on, wallet } = useAssistant();
  const { snapshot, memberViews, allMemberViews, today } = useCrm();
  const { now } = useShop();
  const seeTotals = useCan()('seeTotals');
  const compact = useIsCompact();
  const birthdayAuto = useBirthdayAutoWish();
  const ideas = useMemo(
    () => (on ? todaySuggestions({ snapshot, views: memberViews, allViews: allMemberViews, today, now, appPhones: null, seeTotals, birthdayAuto }).slice(0, 2) : []),
    [on, snapshot, memberViews, allMemberViews, today, now, seeTotals, birthdayAuto],
  );
  if (!on || !wallet) return null;

  const open = (request: string | null): void => {
    if (request) queueRequest(request, true);
    if (compact) navigate('/assistant');
    else setPanelOpen(true);
  };
  // R-593: "See who" opens the assistant with the list behind the idea's number (no AI, free).
  const seeWho = (words: string, list: ShowList): void => {
    queueShow(words, list);
    if (compact) navigate('/assistant');
    else setPanelOpen(true);
  };

  return (
    <section
      aria-label={t('AI Assistant')}
      // R-593: one column that never grows past the card (a long button inside used to push the card off a phone).
      style={{ marginBottom: space.lg, padding: space.lg, borderRadius: 16, background: color.surface, border: `1px solid ${color.border}`, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: space.md, minWidth: 0 }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: space.sm }}>
        <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8, fontFamily: font.display, fontSize: 18, fontWeight: 700, color: color.ink }}>
          <span aria-hidden style={{ color: color.accentBright }}>
            <SparkleIcon size={20} />
          </span>
          {t('AI Assistant')}
        </h2>
        <CreditsPill balance={wallet.balance} onOpen={() => open(null)} />
      </div>
      <button
        type="button"
        onClick={() => open(null)}
        style={{
          appearance: 'none',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          width: '100%',
          minWidth: 0,
          minHeight: 48,
          padding: '8px 14px',
          borderRadius: 14,
          border: `1px solid ${color.borderStrong}`,
          background: color.surfaceSunken,
          color: color.inkMuted,
          fontFamily: font.body,
          fontSize: 15,
          textAlign: 'left',
          lineHeight: 1.35,
          overflowWrap: 'anywhere',
          cursor: 'text',
        }}
      >
        {t('Ask or give a task, in Hindi or English')}
      </button>
      {ideas.length > 0 ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: space.sm }}>
          <p style={{ margin: 0, fontFamily: font.body, fontSize: 13, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: color.inkMuted }}>
            {ideas.length === 1 ? t('1 idea for today') : t('{n} ideas for today', { n: ideas.length })}
          </p>
          {ideas.map((s) => (
            <IdeaRow
              key={s.id}
              words={say(s.words)}
              who={s.who.map(say)}
              action={say(s.action)}
              onClick={() => open(s.request)}
              onSeeWho={s.show ? () => seeWho(say(s.words), s.show!) : undefined}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}
