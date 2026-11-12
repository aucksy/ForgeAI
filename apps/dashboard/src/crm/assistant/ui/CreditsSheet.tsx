/**
 * F201: the AI credits sheet (canvas board "Credits"): the balance, what uses credits, the packs and the latest
 * changes. The numbers come from the server's wallet (owner_ai_wallet), never from the board.
 *
 * Buying a pack in the panel is not built (online billing is off, BILLING_ONLINE_ON): a pack tap says how to ask
 * MettleUp for credits instead, and HQ adds them by hand ("Add AI credits" on the gym's HQ page).
 */
import { useEffect, useState } from 'react';

import { t } from '../../lang/lang';
import { navigate } from '../../ui/router';
import { Button, Sheet, color, font, space } from '../../ui/kit';
import { refreshAssistantWallet } from '../useAssistant';
import type { AiWallet, AiWalletRow } from '../api';
import { quiet } from './parts';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "30 Nov": the last day of the wallet's month ("2026-11"), when the free credits end. '' when unknown. */
export function monthEndWords(month: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) return '';
  const y = Number(m[1]);
  const mo = Number(m[2]);
  if (mo < 1 || mo > 12) return '';
  const last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  return `${last} ${MONTHS[mo - 1]}`;
}

/** The words for one credit change (the server's note is English; the reason is translated here). */
export function walletRowWords(r: AiWalletRow): string {
  switch (r.reason) {
    case 'welcome':
      return t('Starter credits');
    case 'monthly':
      return t('Free credits for this month');
    case 'expire':
      return t('Unused free credits ended');
    case 'purchase':
      return t('Credits bought');
    case 'grant':
      return r.note.trim() || t('Credits from MettleUp');
    case 'refund':
      return t('Credits given back');
    case 'spend':
      return r.note.trim() || t('A task');
    default:
      return r.note.trim() || t('A change');
  }
}

export function CreditsSheet({ wallet, onClose, plansOn }: { wallet: AiWallet; onClose: () => void; plansOn: boolean }) {
  const [asked, setAsked] = useState<number | null>(null);
  useEffect(() => {
    void refreshAssistantWallet();
  }, []);
  const ends = monthEndWords(wallet.month);
  const freeLine =
    wallet.monthlyFree > 0 && wallet.freeLeft > 0 && ends
      ? t("{n} of them are this month's free credits. They are used first and end on {day}.", { n: Math.min(wallet.freeLeft, wallet.balance), day: ends })
      : null;
  const low = wallet.balance <= wallet.lowAt;
  return (
    <Sheet title={t('AI credits')} onClose={onClose}>
      <div style={{ display: 'grid', gap: space.lg }}>
        <div style={{ padding: space.lg, borderRadius: 16, background: color.accentSoft, display: 'grid', gap: 6 }}>
          <span style={{ fontFamily: font.body, fontSize: 13, fontWeight: 700, color: color.inkSecondary }}>{t('You have')}</span>
          <span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <b style={{ fontFamily: font.display, fontSize: 40, lineHeight: 1, color: color.ink, fontVariantNumeric: 'tabular-nums' }}>{wallet.balance}</b>
            <span style={{ fontFamily: font.body, fontSize: 16, fontWeight: 700, color: color.ink }}>{wallet.balance === 1 ? t('credit') : t('credits')}</span>
          </span>
          {freeLine ? <p style={{ ...quiet, color: color.inkSecondary }}>{freeLine}</p> : null}
          {low ? <p style={{ ...quiet, color: color.warning, fontWeight: 700 }}>{t('Your credits are running low. Questions stay free.')}</p> : null}
        </div>

        <section aria-label={t('What uses credits')} style={{ display: 'grid', gap: 4 }}>
          <h3 style={headStyle}>{t('What uses credits')}</h3>
          <PriceRow label={t('Questions, voice, drafts')} price={t('Free')} />
          <PriceRow label={t('Message sent, member or payment saved')} price={t('1 credit')} />
          {plansOn ? <PriceRow label={t('Workout or diet plan saved')} price={t('{n} credits', { n: 3 })} /> : null}
        </section>

        {wallet.packs.length > 0 ? (
          <section aria-label={t('Get more · they never expire')} style={{ display: 'grid', gap: space.sm }}>
            <h3 style={headStyle}>{t('Get more · they never expire')}</h3>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(3, wallet.packs.length)}, minmax(0, 1fr))`, gap: space.sm }}>
              {wallet.packs.map((p) => (
                <button
                  key={p.credits}
                  type="button"
                  aria-label={`${p.popular ? `${t('Popular')}: ` : ''}${t('{n} credits for {price}', { n: p.credits, price: `₹${p.inr.toLocaleString('en-IN')}` })}`}
                  aria-pressed={asked === p.credits}
                  onClick={() => setAsked(p.credits)}
                  style={{
                    appearance: 'none',
                    position: 'relative',
                    display: 'grid',
                    justifyItems: 'center',
                    gap: 2,
                    padding: '16px 6px 12px',
                    borderRadius: 14,
                    border: `1.5px solid ${p.popular || asked === p.credits ? color.accent : color.borderStrong}`,
                    background: asked === p.credits ? color.accentSoft : 'transparent',
                    cursor: 'pointer',
                    minHeight: 92,
                  }}
                >
                  {p.popular ? (
                    <span style={{ position: 'absolute', top: -10, padding: '2px 8px', borderRadius: 999, background: color.accent, color: '#1F0D05', fontFamily: font.body, fontSize: 11, fontWeight: 800 }}>
                      {t('Popular')}
                    </span>
                  ) : null}
                  <b style={{ fontFamily: font.display, fontSize: 22, color: color.ink }}>{p.credits}</b>
                  <span style={{ fontFamily: font.body, fontSize: 12, color: color.inkMuted }}>{t('credits')}</span>
                  <span style={{ fontFamily: font.body, fontSize: 15, fontWeight: 800, color: color.ink }}>₹{p.inr.toLocaleString('en-IN')}</span>
                </button>
              ))}
            </div>
            {asked !== null ? (
              <div role="status" style={{ display: 'grid', gap: space.sm, padding: 12, borderRadius: 12, background: color.surfaceSunken }}>
                <p style={{ ...quiet, color: color.ink }}>
                  {t('Buying credits here is not ready yet. Write to MettleUp in Help and feedback and say you want {n} credits. MettleUp adds them to your gym.', { n: asked })}
                </p>
                <Button
                  variant="ghost"
                  onClick={() => {
                    onClose();
                    navigate('/feedback');
                  }}
                >
                  {t('Open {page}', { page: t('Help and feedback') })}
                </Button>
              </div>
            ) : null}
          </section>
        ) : null}

        {wallet.recent.length > 0 ? (
          <section aria-label={t('Recently used')} style={{ display: 'grid' }}>
            <h3 style={headStyle}>{t('Recently used')}</h3>
            {wallet.recent.slice(0, 8).map((r, i) => (
              <div key={`${r.at}-${i}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '10px 0', borderTop: i === 0 ? 'none' : `1px solid ${color.border}` }}>
                <span style={{ fontFamily: font.body, fontSize: 14, color: color.ink, minWidth: 0, overflowWrap: 'anywhere' }}>{walletRowWords(r)}</span>
                <b style={{ fontFamily: font.body, fontSize: 14, color: r.delta > 0 ? color.goodText : color.ink, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                  {r.delta > 0 ? `+${r.delta}` : `−${Math.abs(r.delta)}`}
                </b>
              </div>
            ))}
          </section>
        ) : null}
      </div>
    </Sheet>
  );
}

const headStyle = { margin: '0 0 4px', fontFamily: font.body, fontSize: 13, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: color.inkMuted } as const;

function PriceRow({ label, price }: { label: string; price: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '8px 0', borderBottom: `1px solid ${color.border}` }}>
      <span style={{ fontFamily: font.body, fontSize: 14, color: color.ink }}>{label}</span>
      <b style={{ fontFamily: font.body, fontSize: 14, color: color.ink, flexShrink: 0 }}>{price}</b>
    </div>
  );
}
