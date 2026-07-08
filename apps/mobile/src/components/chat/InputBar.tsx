import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, Text, TextInput, View } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { Icon, IconButton } from '@/components/ui';
import { tap, thud } from '@/lib/haptics';
import { useVoiceInput } from '@/lib/voice';
import { color, gradients, motion, radius, shadow, space, type } from '@/theme/tokens';
import type { AppLanguage } from '@/types/models';

export interface InputBarProps {
  sending: boolean;
  /** Pending photo attachment (preview chip shown above the input). */
  imageUri: string | null;
  onPickImage: () => void;
  onClearImage: () => void;
  /** Called with the trimmed text; the attachment is owned by the parent. */
  onSend: (text: string) => void;
  /** Settings voiceEnabled — mic only shows when this AND device support. */
  micEnabled: boolean;
  language: AppLanguage;
}

/** Safety-net wait for the final transcript if the recognizer's end event never
 *  fires. The primary flush is the falling edge of `listening` (see effect). */
const FINAL_TRANSCRIPT_FALLBACK_MS = 2500;

export function InputBar({
  sending,
  imageUri,
  onPickImage,
  onClearImage,
  onSend,
  micEnabled,
  language,
}: InputBarProps) {
  const [text, setText] = useState('');
  const [micHeld, setMicHeld] = useState(false);
  const voice = useVoiceInput();

  // Mirror the live transcript so the flush reads the latest value.
  const partialRef = useRef('');
  useEffect(() => {
    partialRef.current = voice.partial;
  }, [voice.partial]);

  // Voice send is flushed on the recognizer's end (the falling edge of
  // `listening`, which lands AFTER the final result) rather than a fixed race
  // timer; the fallback timer only covers an engine that never fires 'end'.
  const flushPendingRef = useRef(false);
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushVoice = useCallback(() => {
    if (!flushPendingRef.current) return; // idempotent: timer + end can't double-send
    flushPendingRef.current = false;
    if (flushTimerRef.current) {
      clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    const finalText = partialRef.current.trim();
    partialRef.current = '';
    if (finalText) onSend(finalText);
  }, [onSend]);

  const pulse = useSharedValue(1);
  const micStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));

  const showMic = micEnabled && voice.available;
  const micActive = micHeld || voice.listening;

  const handleMicIn = useCallback(() => {
    setMicHeld(true);
    thud();
    pulse.value = withRepeat(
      withSequence(withTiming(1.16, { duration: 380 }), withTiming(1, { duration: 380 })),
      -1,
      false,
    );
    void voice.start(language === 'hi' ? 'hi-IN' : 'en-IN');
  }, [language, pulse, voice]);

  const handleMicOut = useCallback(() => {
    setMicHeld(false);
    cancelAnimation(pulse);
    pulse.value = withSpring(1, motion.spring);
    flushPendingRef.current = true;
    void voice.stop();
    // Primary flush is the listening falling-edge effect below; this timer is a
    // safety net if the recognizer never emits 'end'.
    if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
    flushTimerRef.current = setTimeout(flushVoice, FINAL_TRANSCRIPT_FALLBACK_MS);
  }, [flushVoice, pulse, voice]);

  // Recognizer finished (listening dropped after the final result) and the mic
  // is released -> send the completed transcript.
  useEffect(() => {
    if (!voice.listening && !micHeld) flushVoice();
  }, [voice.listening, micHeld, flushVoice]);

  // Cancel a pending flush timer on unmount.
  useEffect(() => {
    return () => {
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
    };
  }, []);

  const handleSendPress = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed && !imageUri) return;
    setText('');
    onSend(trimmed);
  }, [text, imageUri, onSend]);

  const canSend = !sending && (text.trim().length > 0 || imageUri != null);
  const displayValue = micActive ? voice.partial : text;

  return (
    <View
      style={{
        borderTopWidth: 1,
        borderTopColor: color.border,
        backgroundColor: color.bg,
        paddingHorizontal: space.screenX,
        paddingTop: space.md,
        paddingBottom: space.md,
      }}
    >
      {imageUri ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: space.md,
            alignSelf: 'flex-start',
            backgroundColor: color.surfaceRaised,
            borderWidth: 1,
            borderColor: color.border,
            borderRadius: radius.md,
            padding: 6,
            paddingRight: space.md,
            marginBottom: space.md,
          }}
        >
          <Image
            source={{ uri: imageUri }}
            style={{ width: 44, height: 44, borderRadius: 8 }}
            contentFit="cover"
            transition={120}
          />
          <Text
            style={{
              fontFamily: type.bodyMedium,
              fontSize: type.size.caption,
              color: color.inkSecondary,
            }}
          >
            Meal photo attached
          </Text>
          <Pressable
            onPress={() => {
              tap();
              onClearImage();
            }}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Remove photo"
          >
            <Icon name="close" size={15} color={color.inkMuted} />
          </Pressable>
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space.sm }}>
        <IconButton
          icon="camera"
          onPress={onPickImage}
          size={44}
          tint={color.inkSecondary}
          accessibilityLabel="Attach a meal photo"
        />

        <View
          style={{
            flex: 1,
            backgroundColor: color.surfaceSunken,
            borderRadius: 22,
            borderWidth: 1,
            borderColor: micActive ? 'rgba(255, 122, 59, 0.5)' : color.border,
            paddingHorizontal: space.lg,
            justifyContent: 'center',
            minHeight: 44,
          }}
        >
          <TextInput
            value={displayValue}
            onChangeText={setText}
            editable={!micActive}
            multiline
            placeholder={micActive ? 'Listening…' : 'Ask your coach anything…'}
            placeholderTextColor={micActive ? color.accentBright : color.inkMuted}
            style={{
              maxHeight: 96,
              paddingVertical: Platform.OS === 'ios' ? 12 : 8,
              color: color.ink,
              fontFamily: type.body,
              fontSize: type.size.body,
              lineHeight: 20,
            }}
          />
        </View>

        {showMic ? (
          <Pressable
            onPressIn={handleMicIn}
            onPressOut={handleMicOut}
            hitSlop={4}
            accessibilityRole="button"
            accessibilityLabel="Hold to talk to your coach"
          >
            <Animated.View
              style={[
                {
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: micActive ? color.accentSoft : color.surfaceRaised,
                  borderWidth: 1,
                  borderColor: micActive ? 'rgba(255, 122, 59, 0.5)' : color.border,
                },
                micStyle,
              ]}
            >
              <Icon name="mic" size={20} color={micActive ? color.accent : color.inkSecondary} />
            </Animated.View>
          </Pressable>
        ) : null}

        <Pressable
          onPress={handleSendPress}
          disabled={!canSend}
          hitSlop={4}
          accessibilityRole="button"
          accessibilityLabel="Send message"
        >
          <LinearGradient
            colors={gradients.ember}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[
              {
                width: 44,
                height: 44,
                borderRadius: 22,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: canSend ? 1 : 0.35,
              },
              canSend ? shadow.glow : null,
            ]}
          >
            <Icon name="send" size={19} color="#FFF6EF" />
          </LinearGradient>
        </Pressable>
      </View>
    </View>
  );
}
