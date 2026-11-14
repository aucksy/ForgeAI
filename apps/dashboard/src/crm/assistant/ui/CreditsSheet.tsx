/**
 * F201: the AI credits sheet (canvas board "Credits"): the balance, what uses credits, the packs and the latest
 * changes. The numbers come from the server's wallet (owner_ai_wallet), never from the board.
 *
 * Buying a pack in the panel is not built: the sheet shows no pack prices (review, 13 Nov), only "Ask MettleUp for
 * credits" (Help and feedback); HQ adds them by hand ("Add AI credits" on the gym's HQ page).
 *
 * F209 (owner 14 Nov 2026): once the gym's server counts AI questions on the credits (wallet.questions, supabase 0078),
 * the sheet says what questions cost and shows who asked the AI this month (you, staff, members, gym page visitors).
 * Before that it is exactly as it was.
 */
import { useEffect, useState } from 'react';

import { t } from '../../lang/lang';
import { navigate } from '../../ui/router';
import { Button, Sheet, color, font, space } from '../../ui/kit';
import { refreshAssistantWallet } from '../useAssistant';
import { aiTasks, type AiQuestions, type AiWallet, type AiWalletRow } from '../api';
import type { Line } from '../catalogue';
import { jobLine } from '../jobs';
import { quiet, say } from './parts';

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
    case 'questions': {
      // F209: one credit for the next block of AI questions (the server's note: "20 AI questions").
      const m = /^(\d+)/.exec(r.note.trim());
      return m ? t('{n} AI questions', { n: Number(m[1]) }) : t('AI questions');
    }
    default:
      return r.note.trim() || t('A change');
  }
}

/** F209: the warning line when credits run low (null when they do not). PURE. */
export function lowWords(w: Pick<AiWallet, 'balance' | 'lowAt' | 'questions'>): string | null {
  // F209: the warning starts where the owner's "credits low" alert does (10), when that is higher than the wallet's.
  if (w.balance > Math.max(w.lowAt, w.questions?.lowAt ?? 0)) return null;
  if (!w.questions) return w.balance <= 0 ? t('You have no credits left. Questions stay free.') : t('Your credits are running low. Questions stay free.');
  return w.balance <= 0
    ? t('You have no credits left. Members now get help pages instead of AI answers.')
    : t('Your credits are running low. When they run out, members get help pages instead of AI answers.');
}

/** F209: the rows of "AI questions this month". Gym page visitors show once there are some. PURE. */
export function askedRows(q: AiQuestions): { label: string; n: number }[] {
  const rows = [
    { label: t('You'), n: q.owner },
    { label: t('Your staff'), n: q.staff },
    { label: t('Members'), n: q.members },
  ];
  if (q.visitors > 0) rows.push({ label: t('Gym page visitors'), n: q.visitors });
  return rows;
}

/** The line about free credits each month, from the wallet (R-473): the plan's own number, or how to get some. */
export function monthlyWords(w: Pick<AiWallet, 'monthlyFree' | 'trial' | 'billing'>): string | null {
  if (w.monthlyFree > 0) return t('Your plan gets {n} free credits every month.', { n: w.monthlyFree });
  if (w.trial) return null;
  return w.billing === 'monthly' ? t('Yearly plans get free credits every month.') : null;
}

export function CreditsSheet({ wallet, onClose, plansOn, assistKey }: { wallet: AiWallet; onClose: () => void; plansOn: boolean; assistKey: string }) {
  // Review (13 Nov): one request can make two tasks with the same words; each spend shows what that task did.
  const [jobs, setJobs] = useState<Map<string, Line>>(new Map());
  useEffect(() => {
    void refreshAssistantWallet();
    let live = true;
    void aiTasks(assistKey, 30).then((rows) => {
      if (!live || !rows) return;
      setJobs(new Map(rows.flatMap((r) => {
        const job = jobLine(r.actions);
        return job ? [[r.id, job] as const] : [];
      })));
    });
    return () => {
      live = false;
    };
  }, [assistKey]);
  const ends = monthEndWords(wallet.month);
  const freeLine =
    wallet.monthlyFree > 0 && wallet.freeLeft > 0 && ends
      ? t("{n} of them are this month's free credits. They are used first and end on {day}.", { n: Math.min(wallet.freeLeft, wallet.balance), day: ends })
      : null;
  const low = lowWords(wallet);
  const q = wallet.questions ?? null;
  // R-473: the number is the server's (monthly_free: 50 on a yearly Starter, 100 on a yearly Pro), never typed here.
  const monthLine = monthlyWords(wallet);
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
          {monthLine ? <p style={{ ...quiet, color: color.inkSecondary }}>{monthLine}</p> : null}
          {low ? <p style={{ ...quiet, color: color.warning, fontWeight: 700 }}>{low}</p> : null}
        </div>

        <section aria-label={t('What uses credits')} style={{ display: 'grid', gap: 4 }}>
          <h3 style={headStyle}>{t('What uses credits')}</h3>
          {q ? (
            <>
              <PriceRow label={t('AI questions and drafts')} price={t('{n} for 1 credit', { n: q.perCredit })} />
              <PriceRow label={t('Speaking instead of typing')} price={t('Free')} />
            </>
          ) : (
            <PriceRow label={t('Questions, voice, drafts')} price={t('Free')} />
          )}
          <PriceRow label={t('Message sent, member or payment saved')} price={t('1 credit')} />
          {plansOn ? <PriceRow label={t('Workout plan saved')} price={t('{n} credits', { n: 3 })} /> : null}
        </section>

        {q ? (
          <section aria-label={t('AI questions this month')} style={{ display: 'grid', gap: 4 }}>
            <h3 style={headStyle}>{t('AI questions this month')}</h3>
            {askedRows(q).map((r) => (
              <PriceRow key={r.label} label={r.label} price={String(r.n)} />
            ))}
            <p style={{ ...quiet, color: color.inkSecondary, marginTop: 4 }}>
              {q.credits === 1 ? t('They used 1 credit.') : t('They used {n} credits.', { n: q.credits })}{' '}
              {t('Each member can ask the AI {n} questions a day.', { n: q.memberDay })}
            </p>
          </section>
        ) : null}

        {/* Review (13 Nov): buying in the panel is not built, so no pack prices it cannot sell. HQ adds credits by hand. */}
        <section aria-label={t('Get more credits')} style={{ display: 'grid', gap: space.sm }}>
          <h3 style={headStyle}>{t('Get more credits')}</h3>
          <p style={{ ...quiet, color: color.ink }}>{t('Write to MettleUp in Help and feedback and say how many credits you want. MettleUp adds them to your gym.')}</p>
          <Button
            variant="ghost"
            onClick={() => {
              onClose();
              navigate('/feedback');
            }}
          >
            {t('Ask MettleUp for credits')}
          </Button>
        </section>

        {wallet.recent.length > 0 ? (
          <section aria-label={t('Recently used')} style={{ display: 'grid' }}>
            <h3 style={headStyle}>{t('Recently used')}</h3>
            {wallet.recent.slice(0, 8).map((r, i) => (
              <div key={`${r.at}-${i}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '10px 0', borderTop: i === 0 ? 'none' : `1px solid ${color.border}` }}>
                <span style={{ fontFamily: font.body, fontSize: 14, color: color.ink, minWidth: 0, overflowWrap: 'anywhere' }}>{r.reason === 'spend' && r.taskId && jobs.has(r.taskId) ? say(jobs.get(r.taskId)!) : walletRowWords(r)}</span>
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
