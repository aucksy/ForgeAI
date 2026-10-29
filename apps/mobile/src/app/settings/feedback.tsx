/** Settings → Send feedback (launch H7): type, or tap Speak (R-206, FeedbackComposer), then Send. */
import Constants from 'expo-constants';
import { useEffect, useRef, useState } from 'react';
import { Text } from 'react-native';

import { FeedbackComposer } from '@/components/feedback/FeedbackComposer';

import { ToggleRow } from '@/components/settings/SettingRow';
import { SettingsPage } from '@/components/settings/SettingsPage';
import { Card, PrimaryButton } from '@/components/ui';
import { FEEDBACK_WORDS, sendFeedback } from '@/lib/feedback';
import { FEEDBACK_BUTTON_WORDS } from '@/lib/feedbackButton';
import { useFeedbackButton } from '@/lib/feedbackButtonStore';
import { useGymShop } from '@/shop/gymStore';
import { color, type } from '@/theme/tokens';

export default function FeedbackPage() {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [input, setInput] = useState<'voice' | 'typed'>('typed');
  const [note, setNote] = useState<{ ok: boolean; words: string } | null>(null);
  const gym = useGymShop((s) => s.link?.joinCode ?? '');
  // A ref, not the state: two taps in the same frame both see `sending` still false (review, 21 Oct).
  const busy = useRef(false);
  // R-149: the floating feedback button on every screen (on by default) is switched here.
  const buttonOn = useFeedbackButton((s) => s.enabled);
  useEffect(() => {
    void useFeedbackButton.getState().load();
  }, []);

  const send = async () => {
    if (busy.current) return;
    busy.current = true;
    setSending(true);
    setNote(null);
    const r = await sendFeedback(text, { app: Constants.expoConfig?.version, gym, screen: 'settings/feedback', input });
    busy.current = false;
    setSending(false);
    if (r.ok) {
      setText('');
      setInput('typed');
      setNote({ ok: true, words: FEEDBACK_WORDS.sent });
    } else {
      setNote({ ok: false, words: r.words });
    }
  };

  return (
    <SettingsPage title="Send feedback">
      <Text style={{ fontFamily: type.body, fontSize: type.size.sub, lineHeight: 20, color: color.inkSecondary }}>{FEEDBACK_WORDS.intro}</Text>
      <Card>
        <FeedbackComposer
          text={text}
          onText={(t) => {
            setText(t);
            if (note?.ok) setNote(null);
          }}
          onSpoke={() => setInput('voice')}
          placeholder={FEEDBACK_WORDS.placeholder}
          minHeight={140}
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
      <Card>
        <ToggleRow
          icon="chat"
          title={FEEDBACK_BUTTON_WORDS.switchTitle}
          caption={FEEDBACK_BUTTON_WORDS.switchCaption}
          value={buttonOn}
          onChange={(on) => useFeedbackButton.getState().setEnabled(on)}
        />
      </Card>
    </SettingsPage>
  );
}
