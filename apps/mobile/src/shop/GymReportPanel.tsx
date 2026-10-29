/**
 * "Send your report to the gym?" on the member's plan card (F121). Shows only while the gym's desk has
 * asked for this member's workout report and it is still waiting. Yes: the phone makes the report
 * (only workouts from the join date at this gym on, gymReportMake.ts) and sends it to this gym only.
 * No: nothing is sent. Read on every visit to the card. Hidden until the server has 0045 (`missing`),
 * on an answer it can't read, and when the member's identity has a problem (the card explains that).
 * Words: gymReport.ts.
 */
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';

import { GhostButton, PrimaryButton } from '@/components/ui';
import { useSettings } from '@/store/settingsStore';
import { color, space, type } from '@/theme/tokens';

import { apiAnswerReportRequest, apiAttachReport, apiReportRequests } from './gymApi';
import {
  GYM_REPORT_WORDS as W,
  reportAskLine,
  reportRefusedWords,
  reportTooBig,
  requestToAsk,
  type ReportRequestsAnswer,
} from './gymReport';
import { makeGymReport } from './gymReportMake';
import type { GymLink } from './types';

type Done = 'sent' | 'declined' | null;

export function GymReportPanel({ link }: { link: GymLink }) {
  const units = useSettings((s) => s.unitSystem);
  const [answer, setAnswer] = useState<ReportRequestsAnswer | null>(null);
  const [busy, setBusy] = useState<'yes' | 'no' | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [done, setDone] = useState<Done>(null);

  const load = useCallback(async (isLive: () => boolean) => {
    const r = await apiReportRequests(link.memberKey);
    if (!isLive()) return;
    if (r.ok) {
      setAnswer(r.data);
      return;
    }
    if ('error' in r && r.error.kind !== 'offline' && r.error.kind !== 'timeout') console.warn('[ForgeErr] report requests', r.error);
    setAnswer(null);
  }, [link.memberKey]);

  useFocusEffect(
    useCallback(() => {
      let live = true;
      setDone(null);
      setProblem(null);
      void load(() => live);
      return () => {
        live = false;
      };
    }, [load]),
  );

  const small = { fontFamily: type.body, fontSize: type.size.sub, color: color.inkSecondary, lineHeight: 20 } as const;

  if (done) {
    return (
      <View style={{ marginTop: space.sm }}>
        <Text style={{ ...small, color: done === 'sent' ? color.goodText : color.inkSecondary }}>{done === 'sent' ? W.sent : W.declined}</Text>
      </View>
    );
  }
  const ask = requestToAsk(answer);
  if (!ask || !answer || !answer.ok) return null;

  /** After a refusal or a lost connection: show why, and read the request again. */
  const refused = (code: string): void => {
    setProblem(reportRefusedWords(code));
    if (code === 'GONE') void load(() => true);
  };

  const no = async (): Promise<void> => {
    if (busy) return;
    setBusy('no');
    setProblem(null);
    const r = await apiAnswerReportRequest(link.memberKey, ask.id, 'no');
    setBusy(null);
    if (r.ok) {
      setDone('declined');
      return;
    }
    if ('missing' in r) {
      setAnswer(null);
      return;
    }
    if ('refused' in r) {
      refused(r.refused);
      return;
    }
    if (r.error.kind !== 'offline' && r.error.kind !== 'timeout') console.warn('[ForgeErr] report request: no', r.error);
    setProblem(W.failed);
  };

  const yes = async (): Promise<void> => {
    if (busy) return;
    setBusy('yes');
    setProblem(null);
    try {
      // 1. The yes (kept by the gym even if the file is lost on the way: "Try again" sends it).
      if (!ask.agreed) {
        const a = await apiAnswerReportRequest(link.memberKey, ask.id, 'yes');
        if (!a.ok) {
          if ('missing' in a) setAnswer(null);
          else if ('refused' in a) refused(a.refused);
          else {
            if (a.error.kind !== 'offline' && a.error.kind !== 'timeout') console.warn('[ForgeErr] report request: yes', a.error);
            setProblem(W.failed);
          }
          return;
        }
        setAnswer((x) => (x && x.ok ? { ...x, requests: x.requests.map((q) => (q.id === ask.id ? { ...q, agreed: true } : q)) } : x));
      }
      // 2. The report, made on this phone from the gym's join date on.
      const file = await makeGymReport(units, ask.fromDay);
      if (reportTooBig(file.csv)) {
        setProblem(reportRefusedWords('TOO_BIG'));
        return;
      }
      // 3. Sent to this gym only.
      const s = await apiAttachReport(link.memberKey, ask.id, file);
      if (s.ok) {
        setDone('sent');
        return;
      }
      if ('missing' in s) setAnswer(null);
      else if ('refused' in s) {
        if (s.refused !== 'GONE' && s.refused !== 'SUSPENDED' && s.refused !== 'TOO_BIG') console.warn('[ForgeErr] report: refused', s.refused);
        refused(s.refused);
      } else {
        if (s.error.kind !== 'offline' && s.error.kind !== 'timeout') console.warn('[ForgeErr] report: send', s.error);
        setProblem(W.failed);
      }
    } catch (e) {
      // Reading the workouts on this phone failed.
      console.warn('[ForgeErr] report: make', e);
      setProblem(W.failed);
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={{ gap: space.sm, marginTop: space.sm }}>
      <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.body, color: color.ink }}>{W.title}</Text>
      <Text style={small}>{reportAskLine(link.gymName, ask.fromDay, answer.day)}</Text>
      {busy === 'yes' ? <Text style={small}>{W.sending}</Text> : null}
      {problem ? <Text style={{ ...small, color: color.criticalText }}>{problem}</Text> : null}
      <PrimaryButton label={ask.agreed ? W.tryAgain : W.yes} onPress={() => void yes()} loading={busy === 'yes'} disabled={busy != null} />
      {/* The busy guard inside no() keeps a second tap from doing anything while a reply is on its way. */}
      <GhostButton label={W.no} onPress={() => void no()} />
      <Text style={{ ...small, fontSize: type.size.caption, color: color.inkMuted }}>{W.ownCopy}</Text>
    </View>
  );
}
