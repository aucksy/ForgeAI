/**
 * Settings → Help and feedback (launch H7): type, or tap Speak (R-206, FeedbackComposer), then Send.
 * R-319 item 10 / R-320: under it, "Your questions": every question from this phone with its answer and
 * the MettleUp team's reply (HelpQuestions). The answer shows there as soon as it comes.
 */
import Constants from 'expo-constants';
import { useEffect, useRef, useState } from 'react';
import { Text } from 'react-native';

import { FeedbackComposer } from '@/components/feedback/FeedbackComposer';

import { ToggleRow } from '@/components/settings/SettingRow';
import { SettingsPage } from '@/components/settings/SettingsPage';
import { Card, PrimaryButton } from '@/components/ui';
import { FEEDBACK_WORDS, sendFeedback } from '@/lib/feedback';
import { HelpQuestions } from '@/components/feedback/HelpQuestions';
import { useWatchLog, WatchLogSwitch } from '@/components/feedback/WatchLogSwitch';
import { HELP_HISTORY_WORDS } from '@/lib/helpHistory';
import { FEEDBACK_BUTTON_WORDS } from '@/lib/feedbackButton';
import { useFeedbackButton } from '@/lib/feedbackButtonStore';
import { sendWatchLog, WATCH_LOG_WORDS } from '@/lib/watchDiag';
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
  // R-149: the floating feedback button on every screen is switched here (on by default, owner 4 Nov 2026).
  const buttonOn = useFeedbackButton((s) => s.enabled);
  // R-441: "Add my watch's screen log" (only with a MettleUp watch log on this phone).
  const watchLog = useWatchLog(true);
  useEffect(() => {
    void useFeedbackButton.getState().load();
  }, []);

  const send = async () => {
    if (busy.current) return;
    busy.current = true;
    setSending(true);
    setNote(null);
    const r = await sendFeedback(text, { app: Constants.expoConfig?.version, gym, screen: 'settings/feedback', input });
    // R-441: the watch screen log goes as its own message, after the member's own was taken.
    const log = r.ok && watchLog.on ? await sendWatchLog(Constants.expoConfig?.version ?? '') : 'none';
    busy.current = false;
    setSending(false);
    if (r.ok) {
      setText('');
      setInput('typed');
      if (log === 'sent') watchLog.setOn(false);
      // The answer itself shows in Your questions below (it is kept there).
      if (log === 'failed') setNote({ ok: false, words: WATCH_LOG_WORDS.notSent });
      else if (log === 'sent') setNote({ ok: true, words: r.reply ? WATCH_LOG_WORDS.sent : `${FEEDBACK_WORDS.sent} ${WATCH_LOG_WORDS.sent}` });
      else setNote(r.reply ? null : { ok: true, words: FEEDBACK_WORDS.sent });
    } else {
      setNote({ ok: false, words: r.words });
    }
  };

  return (
    <SettingsPage title="Help and feedback">
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
      {watchLog.available ? (
        <Card>
          <WatchLogSwitch available={watchLog.available} on={watchLog.on} onChange={watchLog.setOn} />
        </Card>
      ) : null}
      {sending ? (
        <Text accessibilityLiveRegion="polite" style={{ fontFamily: type.body, fontSize: type.size.sub, lineHeight: 20, color: color.inkSecondary }}>
          {HELP_HISTORY_WORDS.sending}
        </Text>
      ) : note ? (
        <Text
          accessibilityLiveRegion="polite"
          style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, lineHeight: 20, color: note.ok ? color.goodText : color.criticalText }}
        >
          {note.words}
        </Text>
      ) : null}
      <PrimaryButton label="Send" icon="chat" loading={sending} disabled={!text.trim()} onPress={() => void send()} />
      <Card>
        <HelpQuestions />
      </Card>
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
