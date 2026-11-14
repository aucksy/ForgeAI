/**
 * The floating feedback button and its sheet (R-149, 28 Oct 2026). Mounted once beside the navigator
 * (app/_layout.tsx). The rules — where it may sit, when it hides, the screen name — are pure, in
 * lib/feedbackButton.ts. The live workout screen draws its own `FeedbackHeaderButton` in its top bar
 * instead, so nothing ever covers the set ticks, the rest timer or Finish.
 *
 * Voice (R-206): the sheet's FeedbackComposer records the member, our server turns it into text with
 * Groq's Whisper, and the text lands in the box to check before Send. The message records that it was
 * spoken ("input: voice").
 *
 * R-452 (owner, 12 Nov 2026: "a badge right around the floating feedback button ... when they tap it right
 * there, they should see the manual answer"): a red dot with the number of unread replies from the MettleUp
 * team sits on the round button and on the workout top-bar button; a tap opens the sheet straight on those
 * conversations (the question, the quick automatic answer, the team's replies in order). The round button
 * comes back while a reply is unread even when the member switched it off. The app asks for replies when it
 * opens and comes back to the front (lib/helpHistoryStore.ts checkHelpReplies).
 */
import Constants from 'expo-constants';
import { usePathname } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, AppState, PanResponder, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FeedbackComposer } from '@/components/feedback/FeedbackComposer';
import { useWatchLog, WatchLogSwitch } from '@/components/feedback/WatchLogSwitch';
import { sendWatchLog, WATCH_LOG_WORDS } from '@/lib/watchDiag';
import { useKeyboardFrame } from '@/components/KeyboardRoom';
import { GhostButton, Icon, PrimaryButton, Sheet } from '@/components/ui';
import { FEEDBACK_WORDS, senderId, sendFeedback, type HelpReply as HelpReplyData } from '@/lib/feedback';
import { HelpConversation } from '@/components/feedback/HelpConversation';
import { HelpReply } from '@/components/feedback/HelpReply';
import { dotNumber, HELP_HISTORY_WORDS, unreadQuestions, unreadReplies, unreadWords } from '@/lib/helpHistory';
import { checkHelpReplies, useHelpHistory } from '@/lib/helpHistoryStore';
import {
  DRAG_SLOP,
  FEEDBACK_BUTTON_SIZE,
  FEEDBACK_BUTTON_WORDS,
  feedbackScreenName,
  showsFloatingButton,
  spotFromDrop,
  spotToXY,
  type FeedbackInput,
  type ScreenRoom,
} from '@/lib/feedbackButton';
import { useFeedbackButton } from '@/lib/feedbackButtonStore';
import { useGymShop } from '@/shop/gymStore';
import { color, radius, shadow, space, type } from '@/theme/tokens';

/** The floating button + the one feedback sheet. */
export function FeedbackButtonHost() {
  const pathname = usePathname();
  const kb = useKeyboardFrame();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const loaded = useFeedbackButton((s) => s.loaded);
  const enabled = useFeedbackButton((s) => s.enabled);
  const spot = useFeedbackButton((s) => s.spot);
  const sheetFor = useFeedbackButton((s) => s.sheetFor);
  const unread = useHelpHistory((s) => unreadReplies(s.items));

  useEffect(() => {
    void useFeedbackButton.getState().load();
    void useHelpHistory.getState().load();
  }, []);

  // R-452: replies from the team are asked for when the app opens and each time it comes back to the front.
  useEffect(() => {
    const check = () =>
      void checkHelpReplies({
        sender: senderId,
        alert: async (count) => {
          const { showHelpReplyAlert } = await import('@/lib/helpReplyAlert');
          await showHelpReplyAlert(count);
        },
      });
    check();
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') check();
    });
    return () => sub.remove();
  }, []);

  const room: ScreenRoom = useMemo(
    () => ({ width, height, insetTop: insets.top, insetBottom: insets.bottom }),
    [width, height, insets.top, insets.bottom],
  );
  const shows = loaded && sheetFor == null && showsFloatingButton({ pathname, enabled, keyboardOpen: kb != null, unread });

  return (
    <>
      {shows ? (
        <FloatingButton room={room} spot={spot} unread={unread} onTap={() => useFeedbackButton.getState().open(feedbackScreenName(pathname))} />
      ) : null}
      <FeedbackSheet screen={sheetFor} onClose={() => useFeedbackButton.getState().close()} />
    </>
  );
}

/** Size of the red dot with the number of unread replies (R-452). */
const DOT = 18;

/** The red dot with the number of unread replies from the team. Drawn only; the button says it aloud. */
function UnreadDot({ count, at }: { count: number; at: { left?: number; right?: number; top: number } }) {
  if (count < 1) return null;
  return (
    <View
      testID="feedback-unread-dot"
      pointerEvents="none"
      style={{
        position: 'absolute',
        ...at,
        minWidth: DOT,
        height: DOT,
        paddingHorizontal: 4,
        borderRadius: DOT / 2,
        backgroundColor: color.critical,
        borderWidth: 1.5,
        borderColor: color.surfaceRaised,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text allowFontScaling={false} style={{ fontFamily: type.bodyBold, fontSize: 10, lineHeight: 12, color: color.onAccent }}>
        {dotNumber(count)}
      </Text>
    </View>
  );
}

/** What the button says aloud: its name, then the unread replies (R-452). */
function buttonLabel(unread: number): string {
  return unread > 0 ? `${FEEDBACK_BUTTON_WORDS.button}. ${unreadWords(unread)}` : FEEDBACK_BUTTON_WORDS.button;
}

function FloatingButton({
  room,
  spot,
  unread,
  onTap,
}: {
  room: ScreenRoom;
  spot: ReturnType<typeof useFeedbackButton.getState>['spot'];
  unread: number;
  onTap: () => void;
}) {
  const at = spotToXY(spot, room);
  const pos = useRef(new Animated.ValueXY(at)).current;
  const start = useRef(at);
  // A new spot, a turned phone or a new screen size: move to it.
  useEffect(() => {
    pos.setValue(at);
    start.current = at;
  }, [at.x, at.y]); // eslint-disable-line react-hooks/exhaustive-deps

  const roomRef = useRef(room);
  roomRef.current = room;
  const responder = useMemo(
    () =>
      PanResponder.create({
        // A tap stays the Pressable's; only a real drag is taken over (in the capture phase, so the
        // Pressable under the finger lets go instead of firing on release).
        onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > DRAG_SLOP || Math.abs(g.dy) > DRAG_SLOP,
        onMoveShouldSetPanResponderCapture: (_e, g) => Math.abs(g.dx) > DRAG_SLOP || Math.abs(g.dy) > DRAG_SLOP,
        onPanResponderTerminationRequest: () => false,
        onPanResponderMove: (_e, g) => pos.setValue({ x: start.current.x + g.dx, y: start.current.y + g.dy }),
        onPanResponderRelease: (_e, g) => {
          const next = spotFromDrop(start.current.x + g.dx, start.current.y + g.dy, roomRef.current);
          const to = spotToXY(next, roomRef.current);
          Animated.spring(pos, { toValue: to, useNativeDriver: false, friction: 7 }).start();
          start.current = to;
          useFeedbackButton.getState().setSpot(next);
        },
        onPanResponderTerminate: () => {
          Animated.spring(pos, { toValue: start.current, useNativeDriver: false }).start();
        },
      }),
    [pos],
  );

  return (
    <Animated.View
      {...responder.panHandlers}
      style={{ position: 'absolute', left: 0, top: 0, transform: pos.getTranslateTransform(), zIndex: 50, elevation: 8 }}
    >
      <Pressable
        onPress={onTap}
        accessibilityRole="button"
        accessibilityLabel={buttonLabel(unread)}
        style={{
          // 48 dp = FEEDBACK_BUTTON_SIZE (written out so the touch-size lint can read it).
          width: 48,
          height: 48,
          borderRadius: radius.pill,
          // UAT A-01: half of it sits behind the screen edge, so the icon sits in the half that shows.
          alignItems: spot.side === 'left' ? 'flex-end' : 'flex-start',
          paddingHorizontal: 3,
          justifyContent: 'center',
          backgroundColor: color.surfaceRaised,
          borderWidth: 1,
          borderColor: color.borderStrong,
          opacity: 0.92,
          // R-452: the red dot sits just past the edge of the button.
          overflow: 'visible',
          ...shadow.card,
        }}
      >
        <Icon name="chat" size={18} color={color.accent} />
        {/* Half the button sits behind the screen edge (PEEK): the dot goes on the half that shows. */}
        <UnreadDot count={unread} at={spot.side === 'left' ? { right: -2, top: -6 } : { left: -2, top: -6 }} />
      </Pressable>
    </Animated.View>
  );
}

/** The live workout screen's top-bar button (42 dp, like the Minimise button beside it). */
export function FeedbackHeaderButton({ screen }: { screen: string }) {
  // Launch audit 3 Nov 2026: the top-bar button stays for everyone (it covers nothing); only the
  // floating one follows the Settings switch (on by default).
  const loaded = useFeedbackButton((s) => s.loaded);
  // R-452: the same red dot as the round button.
  const unread = useHelpHistory((s) => unreadReplies(s.items));
  if (!loaded) return <View style={{ width: 42 }} />;
  return (
    <Pressable
      onPress={() => useFeedbackButton.getState().open(screen)}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={buttonLabel(unread)}
      style={{
        width: 42,
        height: 42,
        borderRadius: radius.pill,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: color.surfaceRaised,
        borderWidth: 1,
        borderColor: color.border,
        overflow: 'visible',
      }}
    >
      <Icon name="chat" size={20} color={color.inkSecondary} />
      <UnreadDot count={unread} at={{ right: -4, top: -4 }} />
    </Pressable>
  );
}

function FeedbackSheet({ screen, onClose }: { screen: string | null; onClose: () => void }) {
  const [text, setText] = useState('');
  const [input, setInput] = useState<FeedbackInput>('typed');
  const [sending, setSending] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; words: string; reply?: HelpReplyData } | null>(null);
  const gym = useGymShop((s) => s.link?.joinCode ?? '');
  // F209: the gym's AI credits pay for the answer (a member with no gym sends none).
  const memberKey = useGymShop((s) => s.link?.memberKey ?? '');
  const busy = useRef(false);
  // R-441: "Add my watch's screen log" (only with a MettleUp watch log on this phone), looked up when it opens.
  const watchLog = useWatchLog(screen != null);
  const [logNote, setLogNote] = useState<{ ok: boolean; words: string } | null>(null);
  const items = useHelpHistory((s) => s.items);
  // R-452: `talk` set = the sheet shows conversations (`keys`: the unread ones it opened on; null = every
  // question kept); `since`: what counts as New while it is open. Not set = the message box.
  const [talk, setTalk] = useState<{ keys: string[] | null; since: Map<string, string>; fresh: boolean } | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // A fresh sheet each time it opens; an unsent message stays while it is closed and opened again.
  // A reply from the team not read yet: the sheet opens straight on it.
  useEffect(() => {
    if (screen == null) return;
    setNote(null);
    setLogNote(null);
    setNow(Date.now());
    const list = useHelpHistory.getState().items;
    const fresh = unreadQuestions(list);
    setTalk(fresh.length ? { keys: fresh.map((q) => q.key), since: new Map(list.map((q) => [q.key, q.seenAt])), fresh: true } : null);
  }, [screen]);

  // Shown = read: the red dot goes as soon as the conversation is on screen.
  const shownKeys = useMemo(() => (talk ? (talk.keys ?? items.map((q) => q.key)) : null), [talk, items]);
  useEffect(() => {
    if (screen == null || !shownKeys) return;
    if (items.some((q) => shownKeys.includes(q.key) && q.replies.length > 0 && q.replies[q.replies.length - 1].at > q.seenAt)) {
      void useHelpHistory.getState().markSeen(shownKeys);
    }
  }, [screen, shownKeys, items]);

  const showAll = () => {
    setNow(Date.now());
    setTalk({ keys: null, since: new Map(useHelpHistory.getState().items.map((q) => [q.key, q.seenAt])), fresh: false });
  };

  const send = async () => {
    if (busy.current || screen == null) return;
    busy.current = true;
    setSending(true);
    setNote(null);
    setLogNote(null);
    const r = await sendFeedback(text, { app: Constants.expoConfig?.version, gym, screen, input, memberKey });
    // R-441: the watch screen log goes as its own message, after the member's own was taken.
    const log = r.ok && watchLog.on ? await sendWatchLog(Constants.expoConfig?.version ?? '') : 'none';
    busy.current = false;
    setSending(false);
    if (r.ok) {
      setText('');
      setInput('typed');
      if (log === 'sent') watchLog.setOn(false);
      setNote({ ok: true, words: FEEDBACK_WORDS.sent, reply: r.reply });
      setLogNote(log === 'sent' ? { ok: true, words: WATCH_LOG_WORDS.sent } : log === 'failed' ? { ok: false, words: WATCH_LOG_WORDS.notSent } : null);
    } else {
      setNote({ ok: false, words: r.words });
    }
  };

  if (talk && shownKeys) {
    const shown = items.filter((q) => shownKeys.includes(q.key));
    return (
      <Sheet
        visible={screen != null}
        title={talk.fresh ? HELP_HISTORY_WORDS.newRepliesTitle : HELP_HISTORY_WORDS.title}
        onClose={onClose}
        footer={<PrimaryButton label={HELP_HISTORY_WORDS.askNew} icon="chat" onPress={() => setTalk(null)} />}
      >
        <View style={{ gap: space.sm }}>
          {shown.length === 0 ? (
            <Text style={{ fontFamily: type.body, fontSize: type.size.sub, lineHeight: 20, color: color.inkSecondary }}>{HELP_HISTORY_WORDS.empty}</Text>
          ) : (
            shown.map((q, i) => <HelpConversation key={q.key} q={q} now={now} newSince={talk.since.get(q.key) ?? ''} first={i === 0} />)
          )}
          {talk.fresh && items.length > shown.length ? <GhostButton label={HELP_HISTORY_WORDS.seeQuestions} icon="list" onPress={showAll} /> : null}
          <Text style={{ fontFamily: type.body, fontSize: type.size.caption, lineHeight: 18, color: color.inkMuted }}>{HELP_HISTORY_WORDS.keptHere}</Text>
        </View>
      </Sheet>
    );
  }

  return (
    <Sheet
      visible={screen != null}
      title="Help and feedback"
      onClose={onClose}
      footer={<PrimaryButton label="Send" icon="chat" loading={sending} disabled={!text.trim()} onPress={() => void send()} />}
    >
      <View style={{ gap: space.md }}>
        <Text style={{ fontFamily: type.body, fontSize: type.size.sub, lineHeight: 20, color: color.inkSecondary }}>{FEEDBACK_BUTTON_WORDS.intro}</Text>
        <FeedbackComposer
          text={text}
          onText={(t) => {
            setText(t);
            if (note?.ok) setNote(null);
          }}
          onSpoke={() => setInput('voice')}
          placeholder={FEEDBACK_BUTTON_WORDS.placeholder}
        />
        <WatchLogSwitch available={watchLog.available} on={watchLog.on} onChange={watchLog.setOn} />
        {sending ? (
          <Text accessibilityLiveRegion="polite" style={{ fontFamily: type.body, fontSize: type.size.sub, lineHeight: 20, color: color.inkSecondary }}>
            {HELP_HISTORY_WORDS.sending}
          </Text>
        ) : null}
        {note?.reply ? (
          <>
            <HelpReply reply={note.reply} />
            {/* R-319 item 10 / R-320: the answer is kept; say where, so it is never lost when the sheet closes. */}
            <Text style={{ fontFamily: type.body, fontSize: type.size.caption, lineHeight: 18, color: color.inkMuted }}>{HELP_HISTORY_WORDS.keptHere}</Text>
          </>
        ) : note ? (
          <Text
            accessibilityLiveRegion="polite"
            style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, lineHeight: 20, color: note.ok ? color.goodText : color.criticalText }}
          >
            {note.words}
          </Text>
        ) : null}
        {logNote ? (
          <Text
            accessibilityLiveRegion="polite"
            style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, lineHeight: 20, color: logNote.ok ? color.goodText : color.criticalText }}
          >
            {logNote.words}
          </Text>
        ) : null}
        {items.length > 0 && !sending ? <GhostButton label={HELP_HISTORY_WORDS.seeQuestions} icon="list" onPress={showAll} /> : null}
        <Text style={{ fontFamily: type.body, fontSize: type.size.caption, lineHeight: 18, color: color.inkMuted }}>{FEEDBACK_BUTTON_WORDS.hideHow}</Text>
      </View>
    </Sheet>
  );
}
