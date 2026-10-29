/**
 * "Pause my plan" / "Renew my plan" on the member's plan card (F150). The two buttons, the pause
 * calendar, the plan list, "Request sent. The desk will confirm." and the desk's answer. Read on every
 * visit to the card. Hidden until the server has 0044 (`missing`), on an answer it can't read, and
 * when the member's identity has a problem (the card already explains that). Words: planRequest.ts.
 */
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { GhostButton, Icon, PrimaryButton, Sheet, SheetRow } from '@/components/ui';
import { fromISO, monthTitle } from '@/lib/date';
import { color, radius, space, type } from '@/theme/tokens';

import { monthGrid } from '@/tracker/lib/calendar';

import { apiAskPlanChange, apiCancelPlanRequest, apiPlanRequests, apiSawPlanRequests } from './gymApi';
import {
  decidedIds,
  lastStartDay,
  pauseProblem,
  planRequestButtons,
  PLAN_REQUEST_WORDS as W,
  refusedWords,
  requestLine,
  requestWhat,
  tapPauseDay,
  type PlanRequestsAnswer,
} from './planRequest';
import type { GymLink } from './types';

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export function PlanRequestPanel({ link, hasCurrentPlan }: { link: GymLink; hasCurrentPlan: boolean }) {
  const [answer, setAnswer] = useState<PlanRequestsAnswer | null>(null);
  const [open, setOpen] = useState<'pause' | 'renew' | null>(null);
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const [planId, setPlanId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [cursor, setCursor] = useState<{ y: number; m: number } | null>(null);

  const load = useCallback(async (isLive: () => boolean) => {
    const r = await apiPlanRequests(link.memberKey);
    if (!isLive()) return;
    if (r.ok) {
      setAnswer(r.data);
      return;
    }
    if (!('missing' in r) && 'error' in r && r.error.kind !== 'offline' && r.error.kind !== 'timeout') {
      console.warn('[ForgeErr] plan requests', r.error);
    }
    setAnswer(null);
  }, [link.memberKey]);

  useFocusEffect(
    useCallback(() => {
      let live = true;
      void load(() => live);
      return () => {
        live = false;
      };
    }, [load]),
  );

  if (!answer || !answer.ok) return null;
  const today = answer.day;
  const buttons = planRequestButtons(answer, hasCurrentPlan);

  const close = (): void => {
    setOpen(null);
    setProblem(null);
  };

  const openPause = (): void => {
    const t = fromISO(today);
    setCursor({ y: t.getFullYear(), m: t.getMonth() });
    setFrom(null);
    setTo(null);
    setProblem(null);
    setOpen('pause');
  };

  const openRenew = (): void => {
    setPlanId(null);
    setProblem(null);
    setOpen('renew');
  };

  const send = async (): Promise<void> => {
    if (sending) return;
    let ask: Parameters<typeof apiAskPlanChange>[1];
    if (open === 'pause') {
      const p = pauseProblem(from, to, today);
      if (p || !from || !to) {
        setProblem(p);
        return;
      }
      ask = { kind: 'freeze', from, to };
    } else {
      if (!planId) return;
      ask = { kind: 'renew', planId };
    }
    setSending(true);
    setProblem(null);
    const r = await apiAskPlanChange(link.memberKey, ask);
    setSending(false);
    if (r.ok) {
      close();
      setAnswer((a) => (a && a.ok ? { ...a, requests: [r.data, ...a.requests.filter((q) => q.id !== r.data.id)] } : a));
      return;
    }
    if ('refused' in r) {
      setProblem(refusedWords(r.refused));
      return;
    }
    if ('missing' in r) {
      close();
      setAnswer(null);
      return;
    }
    if (r.error.kind !== 'offline' && r.error.kind !== 'timeout') console.warn('[ForgeErr] plan request: send', r.error);
    setProblem(W.failed);
  };

  const takeBack = async (id: string): Promise<void> => {
    const r = await apiCancelPlanRequest(link.memberKey, id);
    if (!r.ok) {
      if ('error' in r && r.error.kind !== 'offline' && r.error.kind !== 'timeout') console.warn('[ForgeErr] plan request: take back', r.error);
    }
    // Either way, read again: the desk may have answered in the meantime.
    await load(() => true);
  };

  const gotIt = async (): Promise<void> => {
    const ids = decidedIds(answer);
    setAnswer((a) => (a && a.ok ? { ...a, requests: a.requests.filter((q) => q.status === 'pending') } : a));
    if (ids.length === 0) return;
    const r = await apiSawPlanRequests(link.memberKey, ids);
    // quiet: not being able to tell the gym only means the answer shows once more next time.
    if (!r.ok && 'error' in r && r.error.kind !== 'offline' && r.error.kind !== 'timeout') console.warn('[ForgeErr] plan request: seen', r.error);
  };

  const small = { fontFamily: type.body, fontSize: type.size.sub, color: color.inkSecondary, lineHeight: 20 } as const;
  const pending = answer.requests.filter((r) => r.status === 'pending');
  const decided = answer.requests.filter((r) => r.status !== 'pending');
  const plan = answer.plans.find((p) => p.id === planId) ?? null;

  const cells = cursor ? monthGrid(cursor.y, cursor.m) : [];
  const lastStart = lastStartDay(today);
  const t = fromISO(today);
  const atFirstMonth = cursor != null && cursor.y === t.getFullYear() && cursor.m === t.getMonth();
  const step = (delta: number): void => {
    if (!cursor) return;
    const d = new Date(cursor.y, cursor.m + delta, 1);
    setCursor({ y: d.getFullYear(), m: d.getMonth() });
  };
  const pauseHint = from && to ? null : from ? W.pickEnd : W.pickStart;

  return (
    <View style={{ gap: space.sm, marginTop: space.sm }}>
      {decided.map((r) => (
        <Text key={r.id} style={{ ...small, color: r.status === 'approved' ? color.goodText : color.inkSecondary }}>
          {requestLine(r, today)}
        </Text>
      ))}
      {decided.length > 0 ? <GhostButton label={W.gotIt} onPress={() => void gotIt()} /> : null}
      {pending.map((r) => (
        <View key={r.id} style={{ gap: space.xs }}>
          <Text style={small}>{requestLine(r, today)}</Text>
          <Pressable accessibilityRole="button" onPress={() => void takeBack(r.id)} hitSlop={8}>
            <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.caption, color: color.inkMuted }}>{W.takeBack}</Text>
          </Pressable>
        </View>
      ))}
      {buttons.pause ? <GhostButton label={W.pauseButton} onPress={openPause} /> : null}
      {buttons.renew ? <GhostButton label={W.renewButton} onPress={openRenew} /> : null}

      <Sheet
        visible={open === 'pause'}
        title={W.pauseTitle}
        subtitle={W.pauseHelp}
        onClose={close}
        footer={<PrimaryButton label={W.send} onPress={() => void send()} loading={sending} disabled={!from || !to} />}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Pressable onPress={() => !atFirstMonth && step(-1)} disabled={atFirstMonth} hitSlop={10} accessibilityRole="button" accessibilityLabel="Previous month" style={{ padding: space.sm }}>
            <Icon name="chevron-left" size={20} color={atFirstMonth ? color.inkFaint : color.ink} />
          </Pressable>
          <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.body, color: color.ink }}>
            {cursor ? monthTitle(`${cursor.y}-${String(cursor.m + 1).padStart(2, '0')}`) : ''}
          </Text>
          <Pressable onPress={() => step(1)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Next month" style={{ padding: space.sm }}>
            <Icon name="chevron-right" size={20} color={color.ink} />
          </Pressable>
        </View>
        <View style={{ flexDirection: 'row' }}>
          {WEEKDAYS.map((w, i) => (
            <Text key={i} style={{ flex: 1, textAlign: 'center', fontFamily: type.bodySemi, fontSize: type.size.caption, color: color.inkMuted }}>
              {w}
            </Text>
          ))}
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {cells.map((iso, i) => {
            if (!iso) return <View key={i} style={{ width: `${100 / 7}%`, height: 44 }} />;
            // A start must be today..today+90; an end may run later (up to the server's 365 days).
            const disabled = iso < today || (!from || to ? iso > lastStart : false);
            const ends = iso === from || iso === to;
            const inside = from != null && to != null && iso > from && iso < to;
            return (
              <View key={iso} style={{ width: `${100 / 7}%`, height: 44, alignItems: 'center', justifyContent: 'center' }}>
                <Pressable
                  onPress={() => {
                    const next = tapPauseDay(from, to, iso);
                    setFrom(next.from);
                    setTo(next.to);
                    setProblem(null);
                  }}
                  disabled={disabled}
                  accessibilityRole="button"
                  accessibilityState={{ selected: ends || inside, disabled }}
                  accessibilityLabel={iso}
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: radius.pill,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: ends ? color.accent : inside ? color.surfaceSunken : 'transparent',
                    borderWidth: iso === today && !ends ? 1 : 0,
                    borderColor: color.borderStrong,
                  }}
                >
                  <Text style={{ fontFamily: ends ? type.bodyBold : type.bodyMedium, fontSize: type.size.sub, color: ends ? color.onAccent : disabled ? color.inkFaint : color.ink }}>
                    {Number(iso.slice(8, 10))}
                  </Text>
                </Pressable>
              </View>
            );
          })}
        </View>
        {from && to ? (
          <Text style={{ ...small, color: color.ink }}>
            {requestWhat({ id: '', kind: 'freeze', from, to, planName: null, status: 'pending', startsOn: null, endsOn: null }, today)}
          </Text>
        ) : null}
        {problem ? <Text style={{ ...small, color: color.criticalText }}>{problem}</Text> : pauseHint ? <Text style={small}>{pauseHint}</Text> : null}
      </Sheet>

      <Sheet
        visible={open === 'renew'}
        title={W.renewTitle}
        subtitle={W.renewHelp}
        onClose={close}
        footer={answer.plans.length > 0 ? <PrimaryButton label={W.send} onPress={() => void send()} loading={sending} disabled={!plan} /> : undefined}
      >
        {answer.plans.length === 0 ? <Text style={small}>{W.noPlans}</Text> : null}
        {answer.plans.map((p) => (
          <SheetRow key={p.id} label={p.name} value={p.length || undefined} selected={p.id === planId} onPress={() => setPlanId(p.id)} />
        ))}
        {problem ? <Text style={{ ...small, color: color.criticalText }}>{problem}</Text> : null}
      </Sheet>
    </View>
  );
}
