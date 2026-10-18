/**
 * "My membership" (OWNER-INBOX #6): the member's plan from the gym's own records, at the top of the
 * gym's Shop and in Settings → Your gym. Read on every visit; the last answer is kept on the phone
 * so it still shows at the gym with no signal. Hidden until the server has 0023 (and on any answer
 * it can't read), so nothing half-working is ever on screen. Words: membership.ts (tested).
 */
import { useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';

import { Card } from '@/components/ui';
import { clockTime } from '@/lib/date';
import { color, space, type } from '@/theme/tokens';

import { apiMembership } from './gymApi';
import { keptLine, MEMBERSHIP_STORAGE_KEY, membershipFromRow, membershipView, type MembershipAnswer, type MembershipTone } from './membership';
import type { GymLink } from './types';

type Shown = { answer: MembershipAnswer; keptAt: number | null } | null;

async function readKept(memberId: string): Promise<{ answer: MembershipAnswer; at: number } | null> {
  try {
    const raw = await AsyncStorage.getItem(MEMBERSHIP_STORAGE_KEY);
    const v: unknown = raw ? JSON.parse(raw) : null;
    if (!v || typeof v !== 'object') return null;
    const o = v as { memberId?: unknown; answer?: unknown; at?: unknown };
    if (o.memberId !== memberId || typeof o.at !== 'number') return null;
    const answer = membershipFromRow(o.answer);
    return answer ? { answer, at: o.at } : null;
  } catch (e) {
    console.warn('[ForgeErr] membership: reading the kept answer', e);
    return null;
  }
}

async function keep(memberId: string, answer: MembershipAnswer): Promise<void> {
  try {
    // Kept in the server's own shape, so the same reader checks it when it is read back.
    const raw = answer.ok
      ? { ok: true, gymName: answer.gymName, memberName: answer.memberName, day: answer.day, current: answer.current, next: answer.next, lastEndedOn: answer.lastEndedOn, visitsThisMonth: answer.visitsThisMonth }
      : { error: answer.problem, gymName: answer.gymName };
    await AsyncStorage.setItem(MEMBERSHIP_STORAGE_KEY, JSON.stringify({ memberId, answer: raw, at: Date.now() }));
  } catch (e) {
    console.warn('[ForgeErr] membership: keeping the answer', e);
  }
}

const toneColor = (t: MembershipTone): string => (t === 'good' ? color.goodText : t === 'soon' ? color.warning : t === 'ended' ? color.criticalText : color.inkSecondary);

export function MembershipCard({ link }: { link: GymLink }) {
  const [shown, setShown] = useState<Shown>(null);

  useFocusEffect(
    useCallback(() => {
      let live = true;
      void (async () => {
        const kept = await readKept(link.memberId);
        if (live && kept) setShown((s) => s ?? { answer: kept.answer, keptAt: kept.at });
        const r = await apiMembership(link.memberKey);
        if (!live) return;
        if (r.ok) {
          setShown({ answer: r.data, keptAt: null });
          void keep(link.memberId, r.data);
        } else if ('missing' in r) {
          setShown(null);
        } else if (kept && (r.error.kind === 'offline' || r.error.kind === 'timeout')) {
          setShown({ answer: kept.answer, keptAt: kept.at });
        } else if (!kept) {
          if (r.error.kind !== 'offline' && r.error.kind !== 'timeout') console.warn('[ForgeErr] membership', r.error);
          setShown(null);
        }
      })();
      return () => {
        live = false;
      };
    }, [link.memberId, link.memberKey]),
  );

  if (!shown) return null;
  const v = membershipView(shown.answer);
  return (
    <Card style={{ gap: space.xs, marginBottom: space.md }}>
      <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.caption, color: color.accentBright, letterSpacing: 1.4, textTransform: 'uppercase' }}>
        My membership
      </Text>
      <Text accessibilityRole="header" style={{ fontFamily: type.heading, fontSize: type.size.h3, color: color.ink }}>
        {v.title}
      </Text>
      {v.when ? <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: toneColor(v.tone) }}>{v.when}</Text> : null}
      <View style={{ gap: 2, marginTop: space.xs }}>
        {v.lines.map((line) => (
          <Text key={line} style={{ fontFamily: type.body, fontSize: type.size.sub, color: color.inkSecondary, lineHeight: 20 }}>
            {line}
          </Text>
        ))}
        {shown.keptAt != null ? (
          <Text style={{ fontFamily: type.body, fontSize: type.size.caption, color: color.inkMuted, marginTop: space.xs }}>{keptLine(shown.keptAt, Date.now(), clockTime)}</Text>
        ) : null}
      </View>
    </Card>
  );
}
