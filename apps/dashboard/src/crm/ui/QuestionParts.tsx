/**
 * R-319 items 1 and 11: the small pieces outside the Questions page.
 *  - useQuestionCount(): the waiting questions for the menu badge (null: no Questions for this key; hidden).
 *    Asked when the page opens, when the tab comes back into view, and every 3 minutes while it is open.
 *  - MemberProgressCard: the live "Progress" on a member's page, for the owner and the member's own ticked
 *    trainer, while the member shares from the app: R-535's lines (ui/ProgressView.tsx: workouts per week,
 *    strength score per main exercise with its tag, every shared workout) and a gentle staff-only line.
 *    The member never sees this card.
 * Both hidden until the gym's server has 0053, for the desk without the Trainer tick, and in the demo gym.
 */

import { useEffect, useState, useSyncExternalStore } from 'react';

import { useAuth } from '../auth/AuthProvider';
import * as questionsApi from '../shop/questionsApi';
import { useCrm } from '../store';
import { Card, SectionTitle, color, font, space } from './kit';
import { ProgressDetail, useMemberProgress } from './ProgressView';
import { useTrainerAccess } from './TrainerParts';

/** The signed-in key, when the gym is online. */
function useOnlineKey(): string | null {
  const { session } = useAuth();
  return session?.online ? (session.ownerKey ?? null) : null;
}

// ---------------------------------------------------------------- the menu badge

let count: number | null = null;
let countKey: string | null = null;
const countListeners = new Set<() => void>();
const emit = (): void => {
  for (const fn of [...countListeners]) fn();
};
// Every mounted user of the count (the app menu, the More page) leaves its asker here. One shared slot broke the
// badge: leaving More cleared it while the menu still showed the count (found by the Member messages e2e,
// 12 Nov 2026).
const askers = new Set<() => void>();
function subscribeCount(fn: () => void): () => void {
  countListeners.add(fn);
  return () => {
    countListeners.delete(fn);
  };
}

async function readCount(key: string): Promise<void> {
  try {
    const n = await questionsApi.getQuestionCount(key);
    const next = typeof n === 'number' ? n : null;
    if (countKey !== key || count !== next) {
      countKey = key;
      count = next;
      emit();
    }
  } catch (e) {
    // Offline or a hiccup: keep what was shown; the next tick asks again.
    console.warn('[questions] reading the count', e);
  }
}

/** Fresh eyes (14 Nov 2026): one count with Needs you on Today (see MemberMessageParts.tsx). */
export function publishQuestionCount(key: string, n: number | null): void {
  if (countKey === key && count === n) return;
  countKey = key;
  count = n;
  emit();
}

export function subscribeQuestionCountChange(fn: () => void): () => void {
  return subscribeCount(fn);
}

/** The shared count for this key; null when not known (or no Questions for this person). */
export function questionCountFor(key: string | null): number | null {
  return key !== null && countKey === key ? count : null;
}

/** Ask again now (after a reply, or Refresh on the page). */
export function refreshQuestionCount(): void {
  const ask = askers.values().next().value;
  ask?.();
}

/** Waiting questions for the signed-in person; null when Questions is not there for them (hide the menu item). */
export function useQuestionCount(enabled: boolean): number | null {
  const key = useOnlineKey();
  const n = useSyncExternalStore(subscribeCount, () => (countKey === key ? count : null));
  useEffect(() => {
    if (!enabled || !key || questionsApi.questionsMissing()) return;
    const run = (): void => void readCount(key);
    askers.add(run);
    run();
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') run();
    }, 3 * 60 * 1000);
    const onShow = (): void => {
      if (document.visibilityState === 'visible') run();
    };
    document.addEventListener('visibilitychange', onShow);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onShow);
      askers.delete(run);
    };
  }, [enabled, key]);
  return enabled ? n : null;
}

// ---------------------------------------------------------------- Progress on a member's page

const quiet = { margin: 0, fontFamily: font.body, fontSize: 14, color: color.inkSecondary } as const;

/**
 * A member's page: the live Progress (R-535: the lines of logic/progressTrend.ts, the same as Training progress).
 * Hidden for anyone who may not see it and without 0053.
 */
export function MemberProgressCard({ memberId }: { memberId: string }) {
  const key = useOnlineKey();
  const { today } = useCrm();
  const access = useTrainerAccess();
  const mayRead = access === 'owner' || access === 'trainer';
  const { p } = useMemberProgress(key, memberId, mayRead);
  if (!mayRead || !p || !p.allowed) return null;
  return (
    <Card style={{ marginBottom: space.lg }}>
      <SectionTitle>Progress</SectionTitle>
      {!p.shared ? (
        <p style={quiet}>
          This member is not sharing workouts from the MettleUp app. They can switch on “Share my workouts with my trainers” in the app’s
          settings.
        </p>
      ) : (
        <ProgressDetail p={p} today={today} onMemberPage />
      )}
    </Card>
  );
}
