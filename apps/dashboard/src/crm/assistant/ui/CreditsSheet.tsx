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
 *
 * R-531 (decision #98 = B, supabase 0083): the owner's and staff's own AI questions are free; members' AI answers use
 * the credits (10 answers = 1 credit). "AI answers for members" holds the owner's switch, the monthly limit in credits
 * and what members used this month. Members never see any of this (their app says only "not on").
 */
import { useEffect, useState } from 'react';

import { checkPagesOpen } from '../../gympage/pagesOpen';
import { t } from '../../lang/lang';
import { navigate } from '../../ui/router';
import { Button, CheckField, Sheet, TextField, color, font, space } from '../../ui/kit';
import { refreshAssistantWallet } from '../useAssistant';
import { aiTasks, saveMemberAi, type AiQuestions, type AiWallet, type AiWalletRow, type MemberAi } from '../api';
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
      // F209: one credit for the next block of AI questions (the server's note: "20 AI questions"). R-531 (0083): only
      // members' answers take credits ("10 AI answers for members").
      const m = /^(\d+)/.exec(r.note.trim());
      if (m && /for members/i.test(r.note)) return t('{n} AI answers for members', { n: Number(m[1]) });
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

/** R-531: what the monthly limit gives members, under the box. PURE. */
export function limitHint(credits: number, perCredit: number): string {
  if (credits <= 0) return t('With 0, members get help pages instead of AI answers.');
  return t('This gives members up to {n} AI answers a month. After that, they get help pages until the month ends.', { n: credits * perCredit });
}

/** R-531: "Used this month: 36 answers (4 credits)." PURE. */
export function usedWords(m: Pick<MemberAi, 'monthAnswers' | 'monthUsed'>): string {
  const answers = m.monthAnswers === 1 ? t('1 answer') : t('{n} answers', { n: m.monthAnswers });
  const credits = m.monthUsed === 1 ? t('1 credit') : t('{n} credits', { n: m.monthUsed });
  return t('Used this month: {answers} ({credits}).', { answers, credits });
}

/** R-531: the limit typed in the box -> a whole number 0..max, or null when it is not one. PURE. */
export function limitOf(text: string, max: number): number | null {
  const v = text.trim();
  if (!/^\d{1,4}$/.test(v)) return null;
  const n = Number(v);
  return n <= max ? n : null;
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
    // R-555: ask the Worker's switches again too (AI_CREDITS_CHARGE decides whether the members' section shows).
    void checkPagesOpen();
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
          {q?.memberAi ? (
            <>
              <PriceRow label={t('AI questions from you and your staff')} price={t('Free')} />
              <PriceRow label={t('AI answers for members')} price={t('{n} for 1 credit', { n: q.memberAi.perCredit })} />
              <PriceRow label={t('Speaking instead of typing')} price={t('Free')} />
            </>
          ) : q ? (
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

        {q?.memberAi ? <MemberAiSection start={q.memberAi} memberDay={q.memberDay} assistKey={assistKey} /> : null}

        {q ? (
          <section aria-label={t('AI questions this month')} style={{ display: 'grid', gap: 4 }}>
            <h3 style={headStyle}>{t('AI questions this month')}</h3>
            {askedRows(q).map((r) => (
              <PriceRow key={r.label} label={r.label} price={String(r.n)} />
            ))}
            {/* R-531: with 0083 the members' section says what their answers used; this line was about everyone's. */}
            {q.memberAi ? null : (
              <p style={{ ...quiet, color: color.inkSecondary, marginTop: 4 }}>
                {q.credits === 1 ? t('These questions used 1 credit.') : t('These questions used {n} credits.', { n: q.credits })}{' '}
                {t('Each member can ask the AI {n} questions a day.', { n: q.memberDay })}
              </p>
            )}
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

/**
 * R-531: "AI answers for members": the owner's switch, the monthly limit in credits and what members used this month.
 * One "Save changes" for both; the server's numbers come back and the wallet is asked again.
 */
function MemberAiSection({ start, memberDay, assistKey }: { start: MemberAi; memberDay: number; assistKey: string }) {
  const [on, setOn] = useState(start.on);
  const [text, setText] = useState(String(start.monthCredits));
  const [saved, setSaved] = useState(start);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<'saved' | 'failed' | null>(null);
  const limit = limitOf(text, saved.monthMax);
  const changed = on !== saved.on || limit !== saved.monthCredits;
  const save = async () => {
    if (limit === null || busy) return;
    setBusy(true);
    setNote(null);
    const got = await saveMemberAi(assistKey, on, limit);
    setBusy(false);
    if (!got) {
      setNote('failed');
      return;
    }
    setSaved(got);
    setOn(got.on);
    setText(String(got.monthCredits));
    setNote('saved');
    void refreshAssistantWallet();
  };
  return (
    <section aria-label={t('AI answers for members')} style={{ display: 'grid', gap: 4 }}>
      <h3 style={headStyle}>{t('AI answers for members')}</h3>
      <CheckField
        checked={on}
        onChange={(v) => {
          setOn(v);
          setNote(null);
        }}
        hint={on ? t('Each member can ask the AI {n} questions a day.', { n: memberDay }) : t('Members get help pages instead of AI answers.')}
      >
        {t('Members can get AI answers')}
      </CheckField>
      <TextField
        label={t('Monthly limit, in credits')}
        value={text}
        inputMode="numeric"
        onChange={(v) => {
          setText(v);
          setNote(null);
        }}
        error={limit === null ? t('Type a number from 0 to {n}.', { n: saved.monthMax }) : null}
        hint={limit === null ? undefined : limitHint(limit, saved.perCredit)}
      />
      <p data-testid="members-ai-used" style={{ ...quiet, color: color.ink, marginTop: space.sm }}>
        {usedWords(saved)}
      </p>
      {changed || note ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: space.md, flexWrap: 'wrap', marginTop: space.sm }}>
          {changed ? (
            <Button needsInternet disabled={limit === null || busy} onClick={() => void save()}>
              {t('Save changes')}
            </Button>
          ) : null}
          {note ? (
            <span role="status" style={{ ...quiet, color: note === 'saved' ? color.goodText : color.critical }}>
              {note === 'saved' ? t('Saved.') : t('Not saved. Check your internet and try again.')}
            </span>
          ) : null}
        </div>
      ) : null}
    </section>
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
