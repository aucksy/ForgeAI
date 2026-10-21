/** Settings → Send feedback (launch H7): type or speak (keyboard microphone), then Send. */
import Constants from 'expo-constants';
import { useRef, useState } from 'react';
import { Text, TextInput } from 'react-native';

import { SettingsPage } from '@/components/settings/SettingsPage';
import { Card, PrimaryButton } from '@/components/ui';
import { FEEDBACK_MAX, FEEDBACK_WORDS, sendFeedback } from '@/lib/feedback';
import { useGymShop } from '@/shop/gymStore';
import { color, radius, space, type } from '@/theme/tokens';

export default function FeedbackPage() {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; words: string } | null>(null);
  const gym = useGymShop((s) => s.link?.joinCode ?? '');
  // A ref, not the state: two taps in the same frame both see `sending` still false (review, 21 Oct).
  const busy = useRef(false);

  const send = async () => {
    if (busy.current) return;
    busy.current = true;
    setSending(true);
    setNote(null);
    const r = await sendFeedback(text, { app: Constants.expoConfig?.version, gym, screen: 'settings/feedback' });
    busy.current = false;
    setSending(false);
    if (r.ok) {
      setText('');
      setNote({ ok: true, words: FEEDBACK_WORDS.sent });
    } else {
      setNote({ ok: false, words: r.words });
    }
  };

  return (
    <SettingsPage title="Send feedback">
      <Text style={{ fontFamily: type.body, fontSize: type.size.sub, lineHeight: 20, color: color.inkSecondary }}>{FEEDBACK_WORDS.intro}</Text>
      <Card>
        <TextInput
          value={text}
          onChangeText={(t) => {
            setText(t);
            if (note?.ok) setNote(null);
          }}
          placeholder={FEEDBACK_WORDS.placeholder}
          placeholderTextColor={color.inkMuted}
          accessibilityLabel="Your feedback"
          multiline
          maxLength={FEEDBACK_MAX}
          textAlignVertical="top"
          style={{
            minHeight: 140,
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
      </Card>
      {note ? (
        <Text
          accessibilityLiveRegion="polite"
          style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, lineHeight: 20, color: note.ok ? color.goodText : color.criticalText }}
        >
          {note.words}
        </Text>
      ) : null}
      <PrimaryButton label="Send" icon="chat" loading={sending} disabled={!text.trim()} onPress={() => void send()} />
    </SettingsPage>
  );
}
