/**
 * R-319 item 1: Gym tab -> "Ask a trainer" (/shop/ask). Not a live chat: pick who should answer (the member's
 * own trainer first; any ticked trainer, the gym owner, or "Any trainer"), type one question (500 letters at
 * most), send. Only the person picked sees it ("Any trainer": every trainer and the owner; owner decision 4 Nov
 * 2026). One question waits at a time; it can be taken back. The reply shows here, in a short history, and pops
 * up on the phone when "Messages from my gym" is on (deploy/hq/push.js, kind 'trainer_reply'; a tap opens this
 * page). Server: supabase/migrations/0053_ask_trainer_and_progress.sql; without it the page says it is not
 * ready and the Gym tab hides the row. Words: askTrainer.ts ASK_WORDS.
 * R-505 (owner, 14 Nov 2026): asking is only for members on a running paid gym plan (askTrainer.ts askAccess).
 * Anyone else who reaches this page (a plan that ended, a pass member, a reply's pop-up) reads their old
 * questions and replies, and in place of the question box: "Ask a trainer is for members with a running plan."
 * (with "Renew my plan" when their plan ended). A NO_PLAN from the server (0074) locks the page the same way.
 * R-533 (owner, 14 Nov 2026): the member reads "Ask about your workout" (askTrainer.ts ASK_WORDS). Opening this page
 * marks every reply read, so the red count on the Gym tab and the row goes (askReplySync.saveAskSeen).
 */
import { Redirect, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';

import { Card, Chip, GhostButton, PrimaryButton, Screen } from '@/components/ui';
import { color, radius, space, type } from '@/theme/tokens';
import { usePhonePrefs } from '@/tracker/phone/phonePrefs';

import { ASK_MAX, ASK_WORDS, askWhen, closedLine, defaultPick, openQuestion, type AskAccess, type AskChoices, type AskQuestion } from './askTrainer';
import { readAskAccess } from './askAccessRead';
import { saveAskSeen } from './askReplySync';
import { useGymShop } from './gymStore';
import { requestRenew } from './renewRequest';
import { useGymHydrated } from './shopSource';
import { askServerKnownMissing, readAskChoices, readAskQuestions, sendAskQuestion, withdrawAskQuestion } from './trainerSync';
import type { GymLink } from './types';

// R-533: what this phone has shown, and the red count it clears, live in askReplySync.ts (the row and the 15-minute
// check read it too). Kept exported from here for older imports.
export { readAskSeen } from './askReplySync';

type Load = { state: 'loading' } | { state: 'missing' } | { state: 'failed' } | { state: 'ready'; choices: AskChoices; list: AskQuestion[] };

export function AskTrainerScreen() {
  const hydrated = useGymHydrated();
  const link = useGymShop((s) => s.link);
  if (hydrated && !link) return <Redirect href="/shop" />;
  if (!link) return null;
  return <AskTrainer link={link} />;
}

function AskTrainer({ link }: { link: GymLink }) {
  const router = useRouter();
  const pushOn = usePhonePrefs((s) => s.gymMessagesOn);
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [pulling, setPulling] = useState(false);
  const [pick, setPick] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [note, setNote] = useState<{ ok: boolean; words: string } | null>(null);
  const [sending, setSending] = useState(false);
  const busy = useRef(false);
  // R-505: null = not known (the server still checks every question).
  const [access, setAccess] = useState<AskAccess | null>(null);
  // The server said NO_PLAN on this visit: stays locked until the page is opened again.
  const [refused, setRefused] = useState(false);

  const fetchAll = useCallback(
    async (byPull: boolean) => {
      if (byPull) setPulling(true);
      const [choices, list, a] = await Promise.all([readAskChoices(link), readAskQuestions(link), readAskAccess(link)]);
      setPulling(false);
      if (a) setAccess(a);
      if (!choices || !list) {
        setLoad((old) => (askServerKnownMissing() ? { state: 'missing' } : old.state === 'ready' ? old : { state: 'failed' }));
        if (!askServerKnownMissing() && byPull) setNote({ ok: false, words: ASK_WORDS.failedRead });
        return;
      }
      setLoad((old) => {
        // The first read picks the member's own trainer; later reads keep the member's pick.
        if (old.state !== 'ready') setPick(defaultPick(choices));
        return { state: 'ready', choices, list };
      });
      void saveAskSeen(link.memberId, list);
    },
    [link],
  );

  useFocusEffect(
    useCallback(() => {
      void fetchAll(false);
    }, [fetchAll]),
  );

  const send = async (): Promise<void> => {
    if (busy.current || load.state !== 'ready') return;
    const t = text.trim();
    if (!t) {
      setNote({ ok: false, words: ASK_WORDS.errEmpty });
      return;
    }
    busy.current = true;
    setSending(true);
    setNote(null);
    const r = await sendAskQuestion(link, pick, t);
    busy.current = false;
    setSending(false);
    if (r.ok) {
      setText('');
      setNote({ ok: true, words: ASK_WORDS.sent });
      setLoad({ ...load, list: [r.question, ...load.list.filter((q) => q.id !== r.question.id)] });
    } else {
      // R-505: NO_PLAN (logged by sendAskQuestion): the box goes, the typed words with it.
      if (r.code === 'NO_PLAN') {
        setRefused(true);
        setText('');
      }
      setNote({ ok: false, words: r.words });
    }
    void fetchAll(false);
  };

  const takeBack = async (q: AskQuestion): Promise<void> => {
    if (busy.current) return;
    busy.current = true;
    setNote(null);
    const ok = await withdrawAskQuestion(link, q.id);
    busy.current = false;
    if (!ok) setNote({ ok: false, words: ASK_WORDS.failedOffline });
    await fetchAll(false);
  };

  const small = { fontFamily: type.body, fontSize: type.size.sub, lineHeight: 20, color: color.inkSecondary } as const;
  const now = Date.now();

  let body: ReactNode;
  if (load.state === 'loading') {
    body = (
      <View accessibilityLiveRegion="polite" style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.lg }}>
        <ActivityIndicator color={color.accent} />
        <Text style={small}>Loading…</Text>
      </View>
    );
  } else if (load.state === 'missing') {
    body = <Text style={small}>{ASK_WORDS.notReady}</Text>;
  } else if (load.state === 'failed') {
    body = (
      <View style={{ gap: space.md }}>
        <Text style={small}>{ASK_WORDS.failedRead}</Text>
        <GhostButton label="Try again" onPress={() => void fetchAll(false)} />
      </View>
    );
  } else {
    const { choices, list } = load;
    const open = openQuestion(list);
    const noTrainers = !choices.trainers.some((t) => !t.owner);
    // R-505: may this member ask now? Not known: the box shows (the server still checks).
    const locked = refused || (access != null && access.kind !== 'open');
    const offerRenew = access?.kind === 'locked' && access.renew;
    // Back to the Gym tab, whichever page opened this one (the Gym tab, Settings, a reply's pop-up).
    const renew = (): void => {
      requestRenew();
      router.dismissTo('/shop');
    };
    body = (
      <View style={{ gap: space.md }}>
        {/* After a NO_PLAN the note below says it, with "Your question was not sent." */}
        {refused ? null : <Text style={small}>{locked ? ASK_WORDS.locked : ASK_WORDS.intro}</Text>}
        {locked && !open ? (
          offerRenew ? <GhostButton label={ASK_WORDS.renew} onPress={renew} /> : null
        ) : open ? (
          <Card style={{ gap: space.sm }}>
            <Text style={{ ...small, color: color.inkMuted }}>{`${ASK_WORDS.askedTo(open.trainer)} · ${askWhen(open.askedAt, now)}`}</Text>
            <Text style={{ fontFamily: type.body, fontSize: type.size.body, lineHeight: 22, color: color.ink }}>{open.question}</Text>
            <Text style={{ ...small, color: color.ink }}>{ASK_WORDS.waiting}</Text>
            <GhostButton label={ASK_WORDS.takeBack} onPress={() => void takeBack(open)} />
          </Card>
        ) : (
          <Card style={{ gap: space.md }}>
            <Text accessibilityRole="header" style={{ fontFamily: type.bodySemi, fontSize: type.size.body, color: color.ink }}>
              {ASK_WORDS.toLabel}
            </Text>
            <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
              {choices.trainers.map((t) => (
                <Chip
                  key={t.id}
                  role="radio"
                  label={t.id === choices.mine ? ASK_WORDS.yours(t.name) : t.owner ? ASK_WORDS.owner(t.name) : t.name}
                  selected={pick === t.id}
                  onPress={() => setPick(t.id)}
                />
              ))}
              <Chip role="radio" label={ASK_WORDS.anyTrainer} selected={pick === null} onPress={() => setPick(null)} />
            </View>
            <Text style={small}>{noTrainers ? ASK_WORDS.noTrainers : ASK_WORDS.onlyThem}</Text>
            <TextInput
              value={text}
              onChangeText={(t) => {
                setText(t);
                if (note) setNote(null);
              }}
              placeholder={ASK_WORDS.placeholder}
              placeholderTextColor={color.inkMuted}
              accessibilityLabel="Your question"
              multiline
              maxLength={ASK_MAX}
              textAlignVertical="top"
              style={{
                minHeight: 120,
                backgroundColor: color.surfaceSunken,
                borderWidth: 1,
                borderColor: color.borderStrong,
                borderRadius: radius.md,
                padding: space.md,
                fontFamily: type.body,
                fontSize: type.size.body,
                color: color.ink,
              }}
            />
            <Text style={{ ...small, color: color.inkMuted, alignSelf: 'flex-end' }}>{ASK_WORDS.counter(text.length)}</Text>
            <PrimaryButton label={ASK_WORDS.send} icon="send" loading={sending} disabled={!text.trim()} onPress={() => void send()} />
          </Card>
        )}
        {note ? (
          <Text accessibilityLiveRegion="polite" style={{ ...small, fontFamily: type.bodySemi, color: note.ok ? color.goodText : color.criticalText }}>
            {note.words}
          </Text>
        ) : null}
        {!pushOn && (!locked || open) ? <Text style={{ ...small, color: color.inkMuted }}>{ASK_WORDS.pushNote}</Text> : null}
        <Text accessibilityRole="header" style={{ fontFamily: type.bodySemi, fontSize: type.size.body, color: color.ink, marginTop: space.md }}>
          {ASK_WORDS.history}
        </Text>
        {list.length === 0 ? <Text style={small}>{ASK_WORDS.empty}</Text> : null}
        {list
          .filter((q) => q !== open)
          .map((q) => (
            <Card key={q.id} style={{ gap: space.sm }}>
              <Text style={{ ...small, color: color.inkMuted }}>{`${ASK_WORDS.askedTo(q.trainer)} · ${askWhen(q.askedAt, now)}`}</Text>
              <Text style={{ fontFamily: type.body, fontSize: type.size.body, lineHeight: 22, color: color.ink }}>{q.question}</Text>
              {q.answer ? (
                <View style={{ gap: 4, borderLeftWidth: 3, borderLeftColor: color.accent, paddingLeft: space.md, marginTop: space.xs }}>
                  <Text style={{ ...small, fontFamily: type.bodySemi, color: color.ink }}>
                    {`${ASK_WORDS.replied(q.answeredBy)}${q.answeredAt ? ` · ${askWhen(q.answeredAt, now)}` : ''}`}
                  </Text>
                  <Text style={{ fontFamily: type.body, fontSize: type.size.body, lineHeight: 22, color: color.ink }}>{q.answer}</Text>
                </View>
              ) : (
                <Text style={{ ...small, color: color.inkMuted }}>{closedLine(q)}</Text>
              )}
            </Card>
          ))}
      </View>
    );
  }

  return (
    <Screen title={ASK_WORDS.title} onBack={() => (router.canGoBack() ? router.back() : router.replace('/shop'))} scroll={false}>
      <ScrollView
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: space.xxl }}
        refreshControl={
          <RefreshControl refreshing={pulling} onRefresh={() => void fetchAll(true)} colors={[color.accent]} tintColor={color.accent} progressBackgroundColor={color.surfaceRaised} />
        }
      >
        {body}
      </ScrollView>
    </Screen>
  );
}
