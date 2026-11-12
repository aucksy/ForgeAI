/**
 * F201: the AI Assistant on the Today screen (canvas board "Today"): a box to ask in, and today's ideas, each with
 * "Make it". A tap opens the assistant (the side panel on a computer, the full screen on a phone) with the sentence
 * already asked. Owner only, and hidden until the server's wallet answers (useAssistant), like the rest of it.
 */
import { useMemo } from 'react';

import { useCan } from '../../auth/AuthProvider';
import { t } from '../../lang/lang';
import { useShop } from '../../shop/ShopProvider';
import { useCrm } from '../../store';
import { Button, color, font, space, useIsCompact } from '../../ui/kit';
import { navigate } from '../../ui/router';
import { todaySuggestions } from '../suggestions';
import { useAssistant } from '../useAssistant';
import { CreditsPill, SparkleIcon, body, queueRequest, say, setPanelOpen } from './parts';

export function TodayAiCard() {
  const { on, wallet } = useAssistant();
  const { snapshot, memberViews, allMemberViews, today } = useCrm();
  const { now } = useShop();
  const seeTotals = useCan()('seeTotals');
  const compact = useIsCompact();
  const ideas = useMemo(
    () => (on ? todaySuggestions({ snapshot, views: memberViews, allViews: allMemberViews, today, now, appPhones: null, seeTotals }).slice(0, 2) : []),
    [on, snapshot, memberViews, allMemberViews, today, now, seeTotals],
  );
  if (!on || !wallet) return null;

  const open = (request: string | null): void => {
    if (request) queueRequest(request, true);
    if (compact) navigate('/assistant');
    else setPanelOpen(true);
  };

  return (
    <section
      aria-label={t('AI Assistant')}
      style={{ marginBottom: space.lg, padding: space.lg, borderRadius: 16, background: color.surface, border: `1px solid ${color.border}`, display: 'grid', gap: space.md }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: space.sm }}>
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
          minHeight: 48,
          padding: '0 14px',
          borderRadius: 14,
          border: `1px solid ${color.borderStrong}`,
          background: color.surfaceSunken,
          color: color.inkMuted,
          fontFamily: font.body,
          fontSize: 15,
          textAlign: 'left',
          cursor: 'text',
        }}
      >
        {t('Ask or give a task, in Hindi or English')}
      </button>
      {ideas.length > 0 ? (
        <div style={{ display: 'grid', gap: space.sm }}>
          <p style={{ margin: 0, fontFamily: font.body, fontSize: 13, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: color.inkMuted }}>
            {ideas.length === 1 ? t('1 idea for today') : t('{n} ideas for today', { n: ideas.length })}
          </p>
          {ideas.map((s) => (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: space.md, paddingTop: space.sm, borderTop: `1px solid ${color.border}` }}>
              <p style={{ ...body, flex: 1, minWidth: 0, fontWeight: 600 }}>{say(s.words)}</p>
              <Button variant="ghost" needsInternet onClick={() => open(s.request)}>
                {say(s.action)}
              </Button>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
