/**
 * Gym tab -> "Message your gym": the ONE page for writing to the gym (owner request 12 Nov 2026; plan
 * docs/plans/gym-member-messages.md) and, since R-549 (owner, 14 Nov 2026, option A), for asking a trainer about a
 * workout (R-319 "Ask about your workout", which had its own row and page before). Rules and words: gymMessages.ts.
 *  - "Who is it for?": "The gym" or "A trainer". "A trainer" shows only to a member who may ask today (R-505: a
 *    running paid plan, askShown 'open'). One side open: no choice, that side shows. The address picks the first side:
 *    /shop/message "The gym", /shop/ask "A trainer" (a trainer reply's notification, Settings).
 *  - The gym (0069): Question / Feedback / Complaint, up to 1000 letters; feedback may go without the name. Under
 *    the type, one line names the gym and who reads it (talkReaders): questions the owner, front desk and trainers;
 *    feedback the owner and front desk only (R-552, 0087); complaints the owner only.
 *  - A trainer (0053): one question at a time, 500 letters, to the member's own trainer, another trainer, or "Any
 *    trainer or the owner" (every trainer and the owner; owner decision 4 Nov 2026). The gym owner is no longer a
 *    person in that list (the owner is "The gym" now). A waiting question can be taken back.
 *  - Feedback and Complaint ALWAYS go to the gym (gymMessages.sendTarget): a complaint about a trainer never reaches them.
 *  - Below: one list of everything the member sent and every reply, newest first. Opening the page marks every reply
 *    read on both sides (readTalkThreads; saveAskSeen), so the red count on the row and the Gym tab goes.
 * A gym reply's notification opens /shop/message (kind 'gym_reply'), a trainer's /shop/ask (kind 'trainer_reply');
 * deploy/hq/push.js is unchanged. A server without 0069 / 0053: that side is not offered; neither: "not ready".
 */
import { Redirect, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, Switch, Text, TextInput, View } from 'react-native';

import { Card, Chip, GhostButton, PrimaryButton, Screen } from '@/components/ui';
import { color, radius, space, type } from '@/theme/tokens';
import { usePhonePrefs } from '@/tracker/phone/phonePrefs';

import { ASK_MAX, ASK_WORDS, askShown, askWhen, closedLine, defaultPick, openQuestion, type AskAccess, type AskChoices, type AskQuestion } from './askTrainer';
import { readAskAccess } from './askAccessRead';
import { saveAskSeen } from './askReplySync';
import { MSG_WORDS, kindsFor, mergeMessages, messageSides, messagesIntro, questionHint, sendTarget, startSide, trainerChips, type MessageSide } from './gymMessages';
import { TALK_MAX, TALK_WORDS, canSendAnonymous, talkReaders, talkStatus, type TalkKind, type TalkThread } from './gymTalk';
import { readTalkThreads, replyTalk, sendTalk, talkIsStandIn, talkKnownMissing } from './gymTalkSync';
import { useGymShop } from './gymStore';
import { useGymHydrated } from './shopSource';
import { askServerKnownMissing, readAskChoices, readAskQuestions, sendAskQuestion, withdrawAskQuestion } from './trainerSync';
import type { GymLink } from './types';

/** What the page holds: either half may be null (that server is not there, or did not answer). */
type Ready = { state: 'ready'; talk: TalkThread[] | null; ask: { choices: AskChoices; list: AskQuestion[] } | null };
type Load = { state: 'loading' } | { state: 'missing' } | { state: 'failed' } | Ready;

export function GymTalkScreen({ start = 'gym' }: { start?: MessageSide }) {
  const hydrated = useGymHydrated();
  const link = useGymShop((s) => s.link);
  if (hydrated && !link) return <Redirect href="/shop" />;
  if (!link) return null;
  return <GymMessages link={link} start={start} />;
}

// Functions, not constants: a gym's colours repaint the tokens in place (test/theme/noModuleColours.test.ts).
const smallStyle = () => ({ fontFamily: type.body, fontSize: type.size.sub, lineHeight: 20, color: color.inkSecondary }) as const;
const saidStyle = () => ({ fontFamily: type.body, fontSize: type.size.body, lineHeight: 22, color: color.ink }) as const;
const headStyle = () => ({ fontFamily: type.bodySemi, fontSize: type.size.body, color: color.ink }) as const;
const inputStyleOf = () =>
  ({
    backgroundColor: color.surfaceSunken,
    borderWidth: 1,
    borderColor: color.borderStrong,
    borderRadius: radius.md,
    padding: space.md,
    fontFamily: type.body,
    fontSize: type.size.body,
    color: color.ink,
  }) as const;

function GymMessages({ link, start }: { link: GymLink; start: MessageSide }) {
  const router = useRouter();
  const pushOn = usePhonePrefs((s) => s.gymMessagesOn);
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [pulling, setPulling] = useState(false);
  // The member's own pick of side; null = the address's side (startSide).
  const [picked, setPicked] = useState<MessageSide | null>(null);
  const [kind, setKind] = useState<TalkKind>('question');
  const [anonymous, setAnonymous] = useState(false);
  const [trainer, setTrainer] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [note, setNote] = useState<{ ok: boolean; words: string } | null>(null);
  const [sending, setSending] = useState(false);
  const busy = useRef(false);
  // R-505: may this member ask a trainer now? null = not answered yet ("A trainer" not offered until it is).
  const [access, setAccess] = useState<AskAccess | null>(null);
  // The server said NO_PLAN on this visit: "A trainer" goes until the page is opened again.
  const [refused, setRefused] = useState(false);

  const fetchAll = useCallback(
    async (byPull: boolean) => {
      if (byPull) setPulling(true);
      const [talk, choices, questions, a] = await Promise.all([readTalkThreads(link), readAskChoices(link), readAskQuestions(link), readAskAccess(link)]);
      setPulling(false);
      if (a) setAccess(a);
      const ask = choices && questions ? { choices, list: questions } : null;
      if (!talk && !ask) {
        const missing = talkKnownMissing() && askServerKnownMissing();
        setLoad((old) => (missing ? { state: 'missing' } : old.state === 'ready' ? old : { state: 'failed' }));
        if (!missing && byPull) setNote({ ok: false, words: TALK_WORDS.failedRead });
        return;
      }
      setLoad((old) => {
        // The first read picks the member's own trainer; later reads keep the member's pick.
        if (old.state !== 'ready' || !old.ask) setTrainer(defaultPick(choices));
        // Offline on one side: keep what that side showed before.
        const keep = old.state === 'ready' ? old : null;
        return { state: 'ready', talk: talk ?? keep?.talk ?? null, ask: ask ?? keep?.ask ?? null };
      });
      if (ask) void saveAskSeen(link.memberId, ask.list);
      if (byPull && (!talk || !ask) && !(talkKnownMissing() || askServerKnownMissing())) setNote({ ok: false, words: TALK_WORDS.failedRead });
    },
    [link],
  );

  useFocusEffect(
    useCallback(() => {
      void fetchAll(false);
    }, [fetchAll]),
  );

  const pickKind = (k: TalkKind): void => {
    setKind(k);
    if (!canSendAnonymous(k)) setAnonymous(false);
    if (note) setNote(null);
  };

  const ready = load.state === 'ready' ? load : null;
  const trainerOpen = !refused && !!ready?.ask && askShown(true, access)?.kind === 'open';
  const sides = messageSides(!!ready?.talk, trainerOpen);
  const side = startSide(sides, picked ?? start);

  const pickSide = (s: MessageSide): void => {
    setPicked(s);
    if (note) setNote(null);
  };

  const send = async (): Promise<void> => {
    if (busy.current || !ready || !side) return;
    const t = text.trim();
    if (!t) {
      setNote({ ok: false, words: side === 'trainer' ? ASK_WORDS.errEmpty : TALK_WORDS.errEmpty });
      return;
    }
    busy.current = true;
    setSending(true);
    setNote(null);
    // Feedback and Complaint always go to the gym (sendTarget), whatever side is picked.
    if (sendTarget(side, side === 'trainer' ? 'question' : kind) === 'ask') {
      const r = await sendAskQuestion(link, trainer, t);
      busy.current = false;
      setSending(false);
      if (r.ok) {
        setText('');
        setNote({ ok: true, words: ASK_WORDS.sent });
        setLoad((l) => (l.state === 'ready' && l.ask ? { ...l, ask: { ...l.ask, list: [r.question, ...l.ask.list.filter((q) => q.id !== r.question.id)] } } : l));
      } else {
        // R-505: NO_PLAN (logged by sendAskQuestion): "A trainer" goes, the typed words with it.
        if (r.code === 'NO_PLAN') {
          setRefused(true);
          setText('');
        }
        setNote({ ok: false, words: r.words });
      }
      void fetchAll(false);
      return;
    }
    const r = await sendTalk(link, kind, anonymous && canSendAnonymous(kind), t);
    busy.current = false;
    setSending(false);
    if (r.ok) {
      setText('');
      setAnonymous(false);
      setNote({ ok: true, words: TALK_WORDS.sent });
      setLoad((l) => (l.state === 'ready' ? { ...l, talk: [r.thread, ...(l.talk ?? []).filter((x) => x.id !== r.thread.id)] } : l));
    } else {
      setNote({ ok: false, words: r.words });
    }
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

  const replaced = (t: TalkThread): void => {
    setLoad((l) => (l.state === 'ready' ? { ...l, talk: [t, ...(l.talk ?? []).filter((x) => x.id !== t.id)] } : l));
  };

  const now = Date.now();
  let body: ReactNode;
  if (load.state === 'loading') {
    body = (
      <View accessibilityLiveRegion="polite" style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.lg }}>
        <ActivityIndicator color={color.accent} />
        <Text style={smallStyle()}>Loading…</Text>
      </View>
    );
  } else if (load.state === 'missing') {
    body = <Text style={smallStyle()}>{TALK_WORDS.notReady}</Text>;
  } else if (load.state === 'failed') {
    body = (
      <View style={{ gap: space.md }}>
        <Text style={smallStyle()}>{TALK_WORDS.failedRead}</Text>
        <GhostButton label="Try again" onPress={() => void fetchAll(false)} />
      </View>
    );
  } else {
    const { talk, ask } = load;
    const open = ask ? openQuestion(ask.list) : null;
    const items = mergeMessages(talk, ask?.list ?? null);
    body = (
      <View style={{ gap: space.md }}>
        {talk && talkIsStandIn() ? <Text style={{ ...smallStyle(), fontFamily: type.bodySemi, color: color.ink }}>{TALK_WORDS.standIn}</Text> : null}
        {sides.length > 0 ? <Text style={smallStyle()}>{messagesIntro(sides)}</Text> : null}
        {side ? (
          <Card style={{ gap: space.md }}>
            {sides.length > 1 ? (
              <>
                <Text accessibilityRole="header" style={headStyle()}>
                  {MSG_WORDS.toLabel}
                </Text>
                <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
                  {sides.map((s) => (
                    <Chip key={s} role="radio" label={MSG_WORDS.side[s]} selected={side === s} onPress={() => pickSide(s)} />
                  ))}
                </View>
                {/* testID: the phone test reads which side is open before it checks the words under it. */}
                <Text testID={`msg-side-hint-${side}`} style={smallStyle()}>
                  {MSG_WORDS.sideHint[side]}
                </Text>
              </>
            ) : null}
            {side === 'gym' ? (
              <>
                <Text accessibilityRole="header" style={headStyle()}>
                  {TALK_WORDS.kindLabel}
                </Text>
                <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
                  {kindsFor('gym').map((k) => (
                    <Chip key={k} role="radio" label={TALK_WORDS.kind[k]} selected={kind === k} onPress={() => pickKind(k)} />
                  ))}
                </View>
                {/* testID: the phone test waits for it before it reads the hint. The plan check (access) is read in the
                    same fetch as the list, so once this shows, "A trainer" is decided (a pass member: no mention). */}
                <Text testID="talk-kind-hint-ready" style={smallStyle()}>
                  {questionHint(kind, sides.includes('trainer'))}
                </Text>
                {/* R-552: who at the gym reads this type, naming the gym (feedback: the owner and front desk only). */}
                <Text testID={`talk-readers-${kind}`} style={{ ...smallStyle(), fontFamily: type.bodySemi, color: color.ink }}>
                  {talkReaders(kind, link.gymName)}
                </Text>
                {canSendAnonymous(kind) ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                    <View style={{ flex: 1 }}>
                      <Text style={headStyle()}>{TALK_WORDS.anonLabel}</Text>
                      <Text style={smallStyle()}>{TALK_WORDS.anonHint}</Text>
                    </View>
                    <Switch
                      testID="gym-talk-anon"
                      value={anonymous}
                      accessibilityLabel={TALK_WORDS.anonLabel}
                      onValueChange={setAnonymous}
                      trackColor={{ false: color.inkDisabled, true: color.accent }}
                    />
                  </View>
                ) : null}
                <TextInput
                  value={text}
                  onChangeText={(t) => {
                    setText(t);
                    if (note) setNote(null);
                  }}
                  placeholder={TALK_WORDS.placeholder[kind]}
                  placeholderTextColor={color.inkMuted}
                  accessibilityLabel="Your message"
                  multiline
                  maxLength={TALK_MAX}
                  textAlignVertical="top"
                  style={{ ...inputStyleOf(), minHeight: 120 }}
                />
                <Text style={{ ...smallStyle(), color: color.inkMuted, alignSelf: 'flex-end' }}>{TALK_WORDS.counter(text.length)}</Text>
                <PrimaryButton label={TALK_WORDS.send} icon="send" loading={sending} disabled={!text.trim()} onPress={() => void send()} />
              </>
            ) : open ? (
              <>
                <Text style={{ ...smallStyle(), color: color.inkMuted }}>{`${ASK_WORDS.askedTo(open.trainer)} · ${askWhen(open.askedAt, now)}`}</Text>
                <Text style={saidStyle()}>{open.question}</Text>
                <Text style={{ ...smallStyle(), color: color.ink }}>{ASK_WORDS.waiting}</Text>
                <GhostButton label={ASK_WORDS.takeBack} onPress={() => void takeBack(open)} />
              </>
            ) : ask ? (
              <>
                <Text accessibilityRole="header" style={headStyle()}>
                  {ASK_WORDS.toLabel}
                </Text>
                <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
                  {trainerChips(ask.choices).map((t) => (
                    <Chip key={t.id} role="radio" label={t.id === ask.choices.mine ? ASK_WORDS.yours(t.name) : t.name} selected={trainer === t.id} onPress={() => setTrainer(t.id)} />
                  ))}
                  <Chip role="radio" label={ASK_WORDS.anyTrainer} selected={trainer === null} onPress={() => setTrainer(null)} />
                </View>
                <Text style={smallStyle()}>{ask.choices.trainers.some((t) => !t.owner) ? ASK_WORDS.onlyThem : ASK_WORDS.noTrainers}</Text>
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
                  style={{ ...inputStyleOf(), minHeight: 120 }}
                />
                <Text style={{ ...smallStyle(), color: color.inkMuted, alignSelf: 'flex-end' }}>{ASK_WORDS.counter(text.length)}</Text>
                <PrimaryButton label={ASK_WORDS.send} icon="send" loading={sending} disabled={!text.trim()} onPress={() => void send()} />
              </>
            ) : null}
          </Card>
        ) : null}
        {note ? (
          <Text accessibilityLiveRegion="polite" style={{ ...smallStyle(), fontFamily: type.bodySemi, color: note.ok ? color.goodText : color.criticalText }}>
            {note.words}
          </Text>
        ) : null}
        {!pushOn && side ? <Text style={{ ...smallStyle(), color: color.inkMuted }}>{TALK_WORDS.pushNote}</Text> : null}
        <Text accessibilityRole="header" style={{ ...headStyle(), marginTop: space.md }}>
          {TALK_WORDS.history}
        </Text>
        {items.length === 0 ? <Text style={smallStyle()}>{TALK_WORDS.empty}</Text> : null}
        {items.map((it) =>
          it.kind === 'talk' ? (
            <ThreadCard key={it.id} t={it.thread} now={now} link={link} onChanged={replaced} />
          ) : it.question === open && side === 'trainer' ? null : (
            <AskCard key={it.id} q={it.question} now={now} onTakeBack={it.question === open ? () => void takeBack(it.question) : undefined} />
          ),
        )}
      </View>
    );
  }

  return (
    <Screen title={MSG_WORDS.title} onBack={() => (router.canGoBack() ? router.back() : router.replace('/shop'))} scroll={false}>
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

/** A workout question in the one list: who it went to, the question, the reply (or why there is none). */
function AskCard({ q, now, onTakeBack }: { q: AskQuestion; now: number; onTakeBack?: () => void }) {
  return (
    <View testID="ask-question-card">
      <Card style={{ gap: space.sm }}>
        <Text style={{ ...smallStyle(), color: color.inkMuted }}>{`${MSG_WORDS.askTag} · ${ASK_WORDS.askedTo(q.trainer)} · ${askWhen(q.askedAt, now)}`}</Text>
        <Text style={saidStyle()}>{q.question}</Text>
        {q.answer ? (
          <View style={{ gap: 4, borderLeftWidth: 3, borderLeftColor: color.accent, paddingLeft: space.md, marginTop: space.xs }}>
            <Text style={{ ...smallStyle(), fontFamily: type.bodySemi, color: color.ink }}>
              {`${ASK_WORDS.replied(q.answeredBy)}${q.answeredAt ? ` · ${askWhen(q.answeredAt, now)}` : ''}`}
            </Text>
            <Text style={saidStyle()}>{q.answer}</Text>
          </View>
        ) : q.open ? (
          <>
            <Text style={{ ...smallStyle(), color: color.ink }}>{ASK_WORDS.waiting}</Text>
            {onTakeBack ? <GhostButton label={ASK_WORDS.takeBack} onPress={onTakeBack} /> : null}
          </>
        ) : (
          <Text style={{ ...smallStyle(), color: color.inkMuted }}>{closedLine(q)}</Text>
        )}
      </Card>
    </View>
  );
}

function ThreadCard({ t, now, link, onChanged }: { t: TalkThread; now: number; link: GymLink; onChanged: (t: TalkThread) => void }) {
  const [open, setOpen] = useState(false);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; words: string } | null>(null);
  const busy = useRef(false);
  const status = talkStatus(t);
  // "New" goes on the gym's lines this member had not read when the page opened.
  const readUpTo = t.unread ? Math.max(0, ...t.messages.filter((m) => !m.fromGym).map((m) => m.at)) : Infinity;

  const send = async (): Promise<void> => {
    const text = reply.trim();
    if (busy.current) return;
    if (!text) {
      setNote({ ok: false, words: TALK_WORDS.errEmpty });
      return;
    }
    busy.current = true;
    setSending(true);
    setNote(null);
    const r = await replyTalk(link, t.id, text);
    busy.current = false;
    setSending(false);
    if (r.ok) {
      setReply('');
      setOpen(false);
      setNote({ ok: true, words: TALK_WORDS.replySent });
      onChanged(r.thread);
    } else {
      setNote({ ok: false, words: r.words });
    }
  };

  return (
    <View testID="gym-talk-thread">
      <Card style={{ gap: space.sm }}>
        <Text style={{ ...smallStyle(), color: color.inkMuted }}>
          {`${TALK_WORDS.kind[t.kind]} · ${askWhen(t.createdAt, now)}${t.anonymous ? ` · ${TALK_WORDS.anonTag}` : ''}`}
        </Text>
        {t.messages.map((m) =>
          m.fromGym ? (
            <View key={m.id} style={{ gap: 4, borderLeftWidth: 3, borderLeftColor: color.accent, paddingLeft: space.md, marginTop: space.xs }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' }}>
                <Text style={{ ...smallStyle(), fontFamily: type.bodySemi, color: color.ink }}>{`${TALK_WORDS.fromGym(m.who)} · ${askWhen(m.at, now)}`}</Text>
                {m.at > readUpTo ? (
                  <View style={{ backgroundColor: color.critical, borderRadius: radius.pill, paddingHorizontal: 6, paddingVertical: 1 }}>
                    <Text allowFontScaling={false} style={{ fontFamily: type.bodyBold, fontSize: 11, color: color.onAccent }}>
                      {TALK_WORDS.newTag}
                    </Text>
                  </View>
                ) : null}
              </View>
              <Text style={saidStyle()}>{m.text}</Text>
            </View>
          ) : (
            <View key={m.id} style={{ gap: 4, marginTop: space.xs }}>
              <Text style={{ ...smallStyle(), color: color.inkMuted }}>{`${TALK_WORDS.you} · ${askWhen(m.at, now)}`}</Text>
              <Text style={saidStyle()}>{m.text}</Text>
            </View>
          ),
        )}
        {status ? <Text style={{ ...smallStyle(), color: t.done ? color.goodText : color.inkSecondary }}>{status}</Text> : null}
        {open ? (
          <View style={{ gap: space.sm }}>
            <TextInput
              value={reply}
              onChangeText={(v) => {
                setReply(v);
                if (note) setNote(null);
              }}
              placeholder={TALK_WORDS.replyPlaceholder}
              placeholderTextColor={color.inkMuted}
              accessibilityLabel={TALK_WORDS.replyPlaceholder}
              multiline
              autoFocus
              maxLength={TALK_MAX}
              textAlignVertical="top"
              style={{ ...inputStyleOf(), minHeight: 80 }}
            />
            <PrimaryButton label={TALK_WORDS.sendReply} icon="send" loading={sending} disabled={!reply.trim()} onPress={() => void send()} />
          </View>
        ) : (
          <GhostButton label={TALK_WORDS.writeBack} onPress={() => setOpen(true)} />
        )}
        {note ? (
          <Text accessibilityLiveRegion="polite" style={{ ...smallStyle(), fontFamily: type.bodySemi, color: note.ok ? color.goodText : color.criticalText }}>
            {note.words}
          </Text>
        ) : null}
      </Card>
    </View>
  );
}
