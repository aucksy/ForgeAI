/**
 * Gym tab -> "Message your gym" (/shop/message; owner request 12 Nov 2026; plan docs/plans/gym-member-messages.md).
 * Pick Question / Feedback / Complaint, type up to 1000 letters, send. Feedback may go without the name. Below:
 * the member's messages, each with the gym's replies in order ("New" on a reply not read before), a status line
 * (seen by the gym, waiting, done) and "Write back". A reply's notification opens this page (kind 'gym_reply',
 * route /shop/message, 0069 + 0054). Server: supabase/migrations/0069_member_messages.sql; without it the page says
 * it is not ready and the Gym tab hides the row (QA builds use the pretend gym and say so). Words: gymTalk.ts.
 */
import { Redirect, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, Switch, Text, TextInput, View } from 'react-native';

import { Card, Chip, GhostButton, PrimaryButton, Screen } from '@/components/ui';
import { color, radius, space, type } from '@/theme/tokens';
import { usePhonePrefs } from '@/tracker/phone/phonePrefs';

import { askShown, askWhen } from './askTrainer';
import { TALK_KINDS, TALK_MAX, TALK_WORDS, canSendAnonymous, talkHint, talkStatus, type TalkKind, type TalkThread } from './gymTalk';
import { readTalkThreads, replyTalk, sendTalk, talkIsStandIn, talkKnownMissing } from './gymTalkSync';
import { useGymShop } from './gymStore';
import { useGymHydrated } from './shopSource';
import type { GymLink } from './types';

type Load = { state: 'loading' } | { state: 'missing' } | { state: 'failed' } | { state: 'ready'; list: TalkThread[] };

export function GymTalkScreen() {
  const hydrated = useGymHydrated();
  const link = useGymShop((s) => s.link);
  if (hydrated && !link) return <Redirect href="/shop" />;
  if (!link) return null;
  return <GymTalk link={link} />;
}

// Functions, not constants: a gym's colours repaint the tokens in place (test/theme/noModuleColours.test.ts).
const smallStyle = () => ({ fontFamily: type.body, fontSize: type.size.sub, lineHeight: 20, color: color.inkSecondary }) as const;
const saidStyle = () => ({ fontFamily: type.body, fontSize: type.size.body, lineHeight: 22, color: color.ink }) as const;
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

function GymTalk({ link }: { link: GymLink }) {
  const router = useRouter();
  const pushOn = usePhonePrefs((s) => s.gymMessagesOn);
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [pulling, setPulling] = useState(false);
  const [kind, setKind] = useState<TalkKind>('question');
  const [anonymous, setAnonymous] = useState(false);
  const [text, setText] = useState('');
  const [note, setNote] = useState<{ ok: boolean; words: string } | null>(null);
  const [sending, setSending] = useState(false);
  const busy = useRef(false);
  // R-505: may this member ask a trainer now? The Gym tab row's own check (askShown); null = not answered yet.
  const [canAsk, setCanAsk] = useState<boolean | null>(null);
  useFocusEffect(
    useCallback(() => {
      let live = true;
      void Promise.all([import('./trainerSync'), import('./askAccessRead')])
        .then(([m, a]) => Promise.all([m.readAskChoices(link), a.readAskAccess(link)]))
        .then(([choices, access]) => {
          if (live) setCanAsk(askShown(!!choices, access)?.kind === 'open');
        })
        .catch((e: unknown) => {
          console.warn('[talk] could not tell whether Ask a trainer is open', e);
          if (live) setCanAsk(false);
        });
      return () => {
        live = false;
      };
    }, [link]),
  );

  const fetchAll = useCallback(
    async (byPull: boolean) => {
      if (byPull) setPulling(true);
      const list = await readTalkThreads(link);
      setPulling(false);
      if (!list) {
        setLoad((old) => (talkKnownMissing() ? { state: 'missing' } : old.state === 'ready' ? old : { state: 'failed' }));
        if (!talkKnownMissing() && byPull) setNote({ ok: false, words: TALK_WORDS.failedRead });
        return;
      }
      setLoad({ state: 'ready', list });
    },
    [link],
  );

  useFocusEffect(
    useCallback(() => {
      void fetchAll(false);
    }, [fetchAll]),
  );

  const pick = (k: TalkKind): void => {
    setKind(k);
    if (!canSendAnonymous(k)) setAnonymous(false);
    if (note) setNote(null);
  };

  const send = async (): Promise<void> => {
    if (busy.current || load.state !== 'ready') return;
    const t = text.trim();
    if (!t) {
      setNote({ ok: false, words: TALK_WORDS.errEmpty });
      return;
    }
    busy.current = true;
    setSending(true);
    setNote(null);
    const r = await sendTalk(link, kind, anonymous && canSendAnonymous(kind), t);
    busy.current = false;
    setSending(false);
    if (r.ok) {
      setText('');
      setAnonymous(false);
      setNote({ ok: true, words: TALK_WORDS.sent });
      setLoad((l) => (l.state === 'ready' ? { state: 'ready', list: [r.thread, ...l.list.filter((x) => x.id !== r.thread.id)] } : l));
    } else {
      setNote({ ok: false, words: r.words });
    }
  };

  const replaced = (t: TalkThread): void => {
    setLoad((l) => (l.state === 'ready' ? { state: 'ready', list: [t, ...l.list.filter((x) => x.id !== t.id)] } : l));
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
    const { list } = load;
    body = (
      <View style={{ gap: space.md }}>
        {talkIsStandIn() ? <Text style={{ ...smallStyle(), fontFamily: type.bodySemi, color: color.ink }}>{TALK_WORDS.standIn}</Text> : null}
        <Text style={smallStyle()}>{TALK_WORDS.intro}</Text>
        <Card style={{ gap: space.md }}>
          <Text accessibilityRole="header" style={{ fontFamily: type.bodySemi, fontSize: type.size.body, color: color.ink }}>
            {TALK_WORDS.kindLabel}
          </Text>
          <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            {TALK_KINDS.map((k) => (
              <Chip key={k} role="radio" label={TALK_WORDS.kind[k]} selected={kind === k} onPress={() => pick(k)} />
            ))}
          </View>
          {/* testID: the phone test waits for "-ready" before it checks that a pass member sees no Ask a trainer. */}
          <Text testID={canAsk == null ? 'talk-kind-hint' : 'talk-kind-hint-ready'} style={smallStyle()}>
            {talkHint(kind, canAsk === true)}
          </Text>
          {canSendAnonymous(kind) ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.body, color: color.ink }}>{TALK_WORDS.anonLabel}</Text>
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
        </Card>
        {note ? (
          <Text accessibilityLiveRegion="polite" style={{ ...smallStyle(), fontFamily: type.bodySemi, color: note.ok ? color.goodText : color.criticalText }}>
            {note.words}
          </Text>
        ) : null}
        {!pushOn ? <Text style={{ ...smallStyle(), color: color.inkMuted }}>{TALK_WORDS.pushNote}</Text> : null}
        <Text accessibilityRole="header" style={{ fontFamily: type.bodySemi, fontSize: type.size.body, color: color.ink, marginTop: space.md }}>
          {TALK_WORDS.history}
        </Text>
        {list.length === 0 ? <Text style={smallStyle()}>{TALK_WORDS.empty}</Text> : null}
        {list.map((t) => (
          <ThreadCard key={t.id} t={t} now={now} link={link} onChanged={replaced} />
        ))}
      </View>
    );
  }

  return (
    <Screen title={TALK_WORDS.title} onBack={() => (router.canGoBack() ? router.back() : router.replace('/shop'))} scroll={false}>
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
