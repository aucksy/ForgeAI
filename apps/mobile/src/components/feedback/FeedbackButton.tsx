/**
 * The floating feedback button and its sheet (R-149, 28 Oct 2026). Mounted once beside the navigator
 * (app/_layout.tsx). The rules — where it may sit, when it hides, the screen name — are pure, in
 * lib/feedbackButton.ts. The live workout screen draws its own `FeedbackHeaderButton` in its top bar
 * instead, so nothing ever covers the set ticks, the rest timer or Finish.
 *
 * Voice: the app has no microphone permission (launch C5). "Speak" puts the cursor in the box, which
 * opens the keyboard; the member taps the keyboard's own microphone (free, Hindi or English, set by the
 * keyboard). The message records that it was spoken ("input: voice").
 */
import Constants from 'expo-constants';
import { usePathname } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, Pressable, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useKeyboardFrame } from '@/components/KeyboardRoom';
import { Icon, PrimaryButton, Sheet } from '@/components/ui';
import { FEEDBACK_MAX, FEEDBACK_WORDS, sendFeedback } from '@/lib/feedback';
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

  useEffect(() => {
    void useFeedbackButton.getState().load();
  }, []);

  const room: ScreenRoom = useMemo(
    () => ({ width, height, insetTop: insets.top, insetBottom: insets.bottom }),
    [width, height, insets.top, insets.bottom],
  );
  const shows = loaded && sheetFor == null && showsFloatingButton({ pathname, enabled, keyboardOpen: kb != null });

  return (
    <>
      {shows ? <FloatingButton room={room} spot={spot} onTap={() => useFeedbackButton.getState().open(feedbackScreenName(pathname))} /> : null}
      <FeedbackSheet screen={sheetFor} onClose={() => useFeedbackButton.getState().close()} />
    </>
  );
}

function FloatingButton({ room, spot, onTap }: { room: ScreenRoom; spot: ReturnType<typeof useFeedbackButton.getState>['spot']; onTap: () => void }) {
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
        accessibilityLabel={FEEDBACK_BUTTON_WORDS.button}
        style={{
          // 48 dp = FEEDBACK_BUTTON_SIZE (written out so the touch-size lint can read it).
          width: 48,
          height: 48,
          borderRadius: radius.pill,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: color.surfaceRaised,
          borderWidth: 1,
          borderColor: color.borderStrong,
          opacity: 0.92,
          ...shadow.card,
        }}
      >
        <Icon name="chat" size={22} color={color.accent} />
      </Pressable>
    </Animated.View>
  );
}

/** The live workout screen's top-bar button (42 dp, like the Minimise button beside it). */
export function FeedbackHeaderButton({ screen }: { screen: string }) {
  const enabled = useFeedbackButton((s) => s.enabled);
  const loaded = useFeedbackButton((s) => s.loaded);
  if (!loaded || !enabled) return <View style={{ width: 42 }} />;
  return (
    <Pressable
      onPress={() => useFeedbackButton.getState().open(screen)}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={FEEDBACK_BUTTON_WORDS.button}
      style={{
        width: 42,
        height: 42,
        borderRadius: radius.pill,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: color.surfaceRaised,
        borderWidth: 1,
        borderColor: color.border,
      }}
    >
      <Icon name="chat" size={20} color={color.inkSecondary} />
    </Pressable>
  );
}

function FeedbackSheet({ screen, onClose }: { screen: string | null; onClose: () => void }) {
  const [text, setText] = useState('');
  const [input, setInput] = useState<FeedbackInput>('typed');
  const [speakHint, setSpeakHint] = useState(false);
  const [sending, setSending] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; words: string } | null>(null);
  const gym = useGymShop((s) => s.link?.joinCode ?? '');
  const box = useRef<TextInput>(null);
  const busy = useRef(false);

  // A fresh sheet each time it opens; an unsent message stays while it is closed and opened again.
  useEffect(() => {
    if (screen == null) return;
    setNote(null);
    setSpeakHint(false);
  }, [screen]);

  const speak = () => {
    setInput('voice');
    setSpeakHint(true);
    box.current?.focus();
  };

  const send = async () => {
    if (busy.current || screen == null) return;
    busy.current = true;
    setSending(true);
    setNote(null);
    const r = await sendFeedback(text, { app: Constants.expoConfig?.version, gym, screen, input });
    busy.current = false;
    setSending(false);
    if (r.ok) {
      setText('');
      setInput('typed');
      setSpeakHint(false);
      setNote({ ok: true, words: FEEDBACK_WORDS.sent });
    } else {
      setNote({ ok: false, words: r.words });
    }
  };

  return (
    <Sheet
      visible={screen != null}
      title="Send feedback"
      onClose={onClose}
      footer={<PrimaryButton label="Send" icon="chat" loading={sending} disabled={!text.trim()} onPress={() => void send()} />}
    >
      <View style={{ gap: space.md }}>
        <Text style={{ fontFamily: type.body, fontSize: type.size.sub, lineHeight: 20, color: color.inkSecondary }}>{FEEDBACK_BUTTON_WORDS.intro}</Text>
        <Pressable
          onPress={speak}
          accessibilityRole="button"
          accessibilityLabel={FEEDBACK_BUTTON_WORDS.speakLabel}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            alignSelf: 'flex-start',
            gap: space.sm,
            minHeight: 48,
            paddingHorizontal: space.lg,
            borderRadius: radius.pill,
            backgroundColor: color.accentSoft,
            borderWidth: 1,
            borderColor: color.accent,
          }}
        >
          <Icon name="mic" size={20} color={color.accent} />
          <Text style={{ fontFamily: type.bodyBold, fontSize: type.size.body, color: color.accent }}>{FEEDBACK_BUTTON_WORDS.speak}</Text>
        </Pressable>
        {speakHint ? (
          <Text accessibilityLiveRegion="polite" style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, lineHeight: 20, color: color.ink }}>
            {FEEDBACK_BUTTON_WORDS.speakHint}
          </Text>
        ) : null}
        <TextInput
          ref={box}
          value={text}
          onChangeText={(t) => {
            setText(t);
            if (note?.ok) setNote(null);
          }}
          placeholder={FEEDBACK_BUTTON_WORDS.placeholder}
          placeholderTextColor={color.inkMuted}
          accessibilityLabel="Your feedback"
          multiline
          maxLength={FEEDBACK_MAX}
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
        {note ? (
          <Text
            accessibilityLiveRegion="polite"
            style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, lineHeight: 20, color: note.ok ? color.goodText : color.criticalText }}
          >
            {note.words}
          </Text>
        ) : null}
        <Text style={{ fontFamily: type.body, fontSize: type.size.caption, lineHeight: 18, color: color.inkMuted }}>{FEEDBACK_BUTTON_WORDS.hideHow}</Text>
      </View>
    </Sheet>
  );
}
