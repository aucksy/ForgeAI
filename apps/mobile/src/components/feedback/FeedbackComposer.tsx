/**
 * The feedback message box with its own microphone (R-206, 30 Oct 2026), used by the floating
 * button's sheet and by Settings → Send feedback.
 *
 * One big round button: Speak → it records (a clock and a level bar show it is hearing you) → Stop →
 * "Turning your voice into text…" → the words land in the box, where the member checks and fixes them
 * before Send. Typing works at any time. The clip goes to our server, which asks Groq's Whisper (the
 * owner's key) for the text (lib/feedbackVoice.ts); the phone's own speech to text is not used.
 */
import {
  getRecordingPermissionsAsync,
  requestRecordingPermissionsAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, Text, TextInput, View } from 'react-native';

import { Icon } from '@/components/ui';
import { FEEDBACK_MAX } from '@/lib/feedback';
import {
  CLIP_OPTIONS,
  MAX_CLIP_MS,
  MIN_CLIP_MS,
  VOICE_WORDS,
  clipClock,
  deleteClip,
  levelFromMetering,
  mergeHeard,
  transcribe,
} from '@/lib/feedbackVoice';
import { color, radius, space, type } from '@/theme/tokens';

type Stage = 'idle' | 'recording' | 'writing';

export interface ComposerProps {
  text: string;
  onText: (t: string) => void;
  /** Called when spoken words were added, so the message is sent as "voice". */
  onSpoke: () => void;
  placeholder: string;
  /** Box height when empty. */
  minHeight?: number;
}

export function FeedbackComposer({ text, onText, onSpoke, placeholder, minHeight = 120 }: ComposerProps) {
  const recorder = useAudioRecorder(CLIP_OPTIONS);
  const state = useAudioRecorderState(recorder, 120);
  const [stage, setStage] = useState<Stage>('idle');
  const [note, setNote] = useState<{ words: string; settings?: boolean; good?: boolean } | null>(null);
  const textRef = useRef(text);
  textRef.current = text;
  const stageRef = useRef<Stage>('idle');
  stageRef.current = stage;
  const alive = useRef(true);

  useEffect(
    () => () => {
      alive.current = false;
      // Leaving mid-recording: stop and throw the clip away.
      if (stageRef.current === 'recording') {
        recorder
          .stop()
          .then(() => deleteClip(recorder.uri))
          .catch((e: unknown) => console.warn('[feedback-voice] stop on leave failed', e));
      }
    },
    [recorder],
  );

  const start = async () => {
    setNote(null);
    try {
      let perm = await getRecordingPermissionsAsync();
      if (!perm.granted && perm.canAskAgain) perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) {
        setNote({ words: VOICE_WORDS.micOff, settings: !perm.canAskAgain });
        return;
      }
      await recorder.prepareToRecordAsync();
      recorder.record({ forDuration: MAX_CLIP_MS / 1000 });
      setStage('recording');
    } catch (e) {
      console.warn('[feedback-voice] could not start recording', e);
      setStage('idle');
      setNote({ words: VOICE_WORDS.failed });
    }
  };

  const finish = async (keep: boolean) => {
    const ms = state.durationMillis;
    setStage(keep ? 'writing' : 'idle');
    try {
      await recorder.stop();
    } catch (e) {
      console.warn('[feedback-voice] stop failed', e);
    }
    const uri = recorder.uri;
    if (!keep || !uri) {
      deleteClip(uri);
      if (keep) setNote({ words: VOICE_WORDS.failed });
      setStage('idle');
      return;
    }
    if (ms < MIN_CLIP_MS) {
      deleteClip(uri);
      setStage('idle');
      setNote({ words: VOICE_WORDS.tooShort });
      return;
    }
    const r = await transcribe(uri);
    deleteClip(uri);
    if (!alive.current) return;
    setStage('idle');
    if (r.ok) {
      onText(mergeHeard(textRef.current, r.text));
      onSpoke();
      setNote({ words: VOICE_WORDS.check, good: true });
    } else {
      setNote({ words: r.words });
    }
  };

  // The recorder can stop by itself: at 2 minutes (record forDuration), or early on a phone call or when
  // the app goes to the background. Turn what was heard into text then too, so the screen never sticks
  // on "recording". `heard` waits for the first "recording" status, so the start itself is not mistaken
  // for a stop.
  const heard = useRef(false);
  useEffect(() => {
    if (stage !== 'recording') {
      heard.current = false;
      return;
    }
    if (state.isRecording) heard.current = true;
    else if (heard.current) void finish(true);
  }, [stage, state.isRecording]); // eslint-disable-line react-hooks/exhaustive-deps

  const recording = stage === 'recording';
  const writing = stage === 'writing';
  const level = recording ? levelFromMetering(state.metering) : 0;

  return (
    <View style={{ gap: space.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
        <Pressable
          onPress={() => (recording ? void finish(true) : writing ? undefined : void start())}
          disabled={writing}
          accessibilityRole="button"
          accessibilityLabel={recording ? VOICE_WORDS.stopLabel : VOICE_WORDS.speakLabel}
          accessibilityState={{ busy: writing }}
          style={{
            width: 64,
            height: 64,
            borderRadius: radius.pill,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: recording ? color.critical : color.accent,
            opacity: writing ? 0.5 : 1,
          }}
        >
          {writing ? (
            <ActivityIndicator color={color.onAccent} />
          ) : recording ? (
            <View style={{ width: 22, height: 22, borderRadius: 4, backgroundColor: color.ink }} />
          ) : (
            <Icon name="mic" size={28} color={color.onAccent} />
          )}
        </Pressable>
        <View style={{ flex: 1, gap: 6 }}>
          <Text style={{ fontFamily: type.bodyBold, fontSize: type.size.body, color: color.ink }}>
            {recording ? `${VOICE_WORDS.stop} · ${clipClock(state.durationMillis)} / ${clipClock(MAX_CLIP_MS)}` : writing ? VOICE_WORDS.writing : VOICE_WORDS.speak}
          </Text>
          {recording ? (
            <View style={{ height: 6, borderRadius: 3, backgroundColor: color.surfaceSunken, overflow: 'hidden' }}>
              <View style={{ width: `${Math.round(8 + level * 92)}%`, height: 6, borderRadius: 3, backgroundColor: color.critical }} />
            </View>
          ) : null}
          <Text accessibilityLiveRegion="polite" style={{ fontFamily: type.body, fontSize: type.size.sub, lineHeight: 18, color: color.inkSecondary }}>
            {recording ? VOICE_WORDS.listening : writing ? ' ' : 'Hindi or English'}
          </Text>
        </View>
        {recording ? (
          <Pressable
            onPress={() => void finish(false)}
            accessibilityRole="button"
            accessibilityLabel={VOICE_WORDS.cancel}
            hitSlop={6}
            style={{ minHeight: 48, minWidth: 48, alignItems: 'center', justifyContent: 'center' }}
          >
            <Icon name="close" size={22} color={color.inkSecondary} />
          </Pressable>
        ) : null}
      </View>

      {note ? (
        <View style={{ gap: space.sm }}>
          <Text
            accessibilityLiveRegion="polite"
            style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, lineHeight: 20, color: note.good ? color.goodText : color.criticalText }}
          >
            {note.words}
          </Text>
          {note.settings ? (
            <Pressable
              onPress={() => void Linking.openSettings().catch((e: unknown) => console.warn('[feedback-voice] app settings did not open', e))}
              accessibilityRole="button"
              style={{ minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' }}
            >
              <Text style={{ fontFamily: type.bodyBold, fontSize: type.size.sub, color: color.accent }}>{VOICE_WORDS.openSettings}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <TextInput
        value={text}
        onChangeText={(t) => {
          onText(t);
          if (note?.good) setNote(null);
        }}
        placeholder={placeholder}
        placeholderTextColor={color.inkMuted}
        accessibilityLabel="Your feedback"
        editable={!writing}
        multiline
        maxLength={FEEDBACK_MAX}
        textAlignVertical="top"
        style={{
          minHeight,
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
      <Text style={{ fontFamily: type.body, fontSize: type.size.caption, lineHeight: 16, color: color.inkMuted }}>{VOICE_WORDS.privacy}</Text>
    </View>
  );
}
