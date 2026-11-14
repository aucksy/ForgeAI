/**
 * F210 Free trial when joining online (R-521, owner 14 Nov 2026): Settings -> Member app -> "Free trial for new people".
 * The owner picks Off (the default), 1, 3 or 7 days. People who open the gym's "Become a member" link then see
 * "Try free for 3 days" above the plans; the request shows on Today's "Joined online" with the last day they may visit.
 *
 * Kept on the gym's details record (GymRecord.joinTrialDays, like F147's free days for a friend); the gym server reads
 * it (supabase 0088). Shown only when ALL hold (owner rule: show a feature only when it is on):
 *   the gym is online, the owner is signed in, its "Become a member" page works (0077, open, a plan to pick), and the
 *   gym server has 0088 (the preview carries the `trial` key). Before 0088 is applied nothing here shows.
 * The trial person is not a member: they cannot check in with the app or a card, so the desk lets them in until the
 * day Today shows. The trial fee (R-524) waits for online join payments (JOIN_PAY) and is not offered here.
 */

import { useEffect, useState } from 'react';

import { useAuth } from '../auth/AuthProvider';
import { t } from '../lang/lang';
import { JOIN_TRIAL_DAYS, joinTrialDays } from '../logic/selfJoin';
import { useCrm } from '../store';
import { Card, ChipToggle, ErrorBanner, SectionTitle, Toast, color, font, space } from '../ui/kit';
import { useShop } from './ShopProvider';
import { useJoinTrialReady } from './selfJoinReady';

const quiet = { margin: 0, fontFamily: font.body, fontSize: 14, color: color.inkSecondary, overflowWrap: 'anywhere' } as const;

/** The chip for a length (or Off). */
function chipLabel(days: number | null): string {
  if (!days) return t('Off');
  return days === 1 ? t('1 day') : t('{n} days', { n: days });
}

/** What the owner reads after saving. */
export function savedWords(days: number | null): string {
  if (!days) return t('Saved. Free trials are off.');
  return days === 1 ? t('Saved. New people can try your gym free for 1 day.') : t('Saved. New people can try your gym free for {n} days.', { n: days });
}

export function JoinTrialCard() {
  const session = useAuth().session;
  const { cloud } = useShop();
  const { snapshot, updateGym } = useCrm();
  // The online gym's own code (the shop's copy as a fallback), as the join link uses it.
  const ready = useJoinTrialReady(session?.online ? snapshot.gym.joinCode || cloud?.joinCode : null);
  const saved = joinTrialDays(snapshot.gym);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 3000);
    return () => window.clearTimeout(id);
  }, [toast]);

  if (!ready) return null;

  const choose = async (v: string) => {
    if (busy) return;
    const days = JOIN_TRIAL_DAYS.find((d) => String(d) === v) ?? null;
    if (days === saved) return;
    setBusy(true);
    setError(null);
    try {
      await updateGym({ joinTrialDays: days });
      setToast(savedWords(days));
    } catch (e) {
      console.warn('[join trial] the setting was not saved', e instanceof Error ? e.message : e);
      setError(t('Could not save. Check your internet and try again.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card style={{ marginBottom: space.lg }}>
      <div data-testid="join-trial-card">
        <SectionTitle>{t('Free trial for new people')}</SectionTitle>
        <p style={quiet}>
          {t('People who open your "Become a member" link can try your gym free before they pick a plan. They check their number on WhatsApp, and you see them on Today under "Joined online".')}
        </p>
        <div style={{ marginTop: space.lg }}>
          <ChipToggle
            label={t('Free trial length')}
            wrap
            value={saved ? String(saved) : 'off'}
            onChange={(v) => void choose(v)}
            options={[{ value: 'off', label: chipLabel(null) }, ...JOIN_TRIAL_DAYS.map((d) => ({ value: String(d), label: chipLabel(d) }))]}
          />
        </div>
        {error ? (
          <div style={{ marginTop: space.md }}>
            <ErrorBanner>{error}</ErrorBanner>
          </div>
        ) : null}
        {saved ? (
          <>
            <p style={{ ...quiet, marginTop: space.md, fontSize: 13 }}>{t('Each mobile number gets one free trial at your gym.')}</p>
            <p style={{ ...quiet, marginTop: space.sm, fontSize: 13 }}>
              {t('A person on a free trial is not a member yet. They cannot check in with the app or a card, so let them in at the desk until the day shown on Today.')}
            </p>
          </>
        ) : null}
      </div>
      {toast ? <Toast message={toast} /> : null}
    </Card>
  );
}
