import * as ImagePicker from 'expo-image-picker';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, View } from 'react-native';
import type { ListRenderItemInfo } from 'react-native';

import { ChatSkeleton, InputBar, MessageBubble, SuggestedPrompts } from '@/components/chat';
import { EmptyState, IconButton, Screen, askConfirm } from '@/components/ui';
import * as userRepo from '@/db/repos/userRepo';
import { FEATURES, linkedDraft } from '@/lib/features';
import { success, thud } from '@/lib/haptics';
import { launchFor, takePendingPick } from '@/lib/pendingPick';
import { speak } from '@/lib/voice';
import { useChat } from '@/store/chatStore';
import { useDashboard } from '@/store/dashboardStore';
import { useSettings } from '@/store/settingsStore';
import { color, space } from '@/theme/tokens';
import type { ChatMessage } from '@/types/models';

interface Row {
  message: ChatMessage;
  showTimestamp: boolean;
}

/** A new time group (tiny centred timestamp) starts after this gap. */
const TIMESTAMP_GAP_MS = 12 * 60_000;

/** D4 = A: the coach is hidden until its own phase — any route here (an old link,
 *  stale navigation) goes Home. The chat below stays intact for when it returns. */
export default function CoachRoute() {
  if (!FEATURES.coach) return <Redirect href="/" />;
  return <CoachScreen />;
}

function CoachScreen() {
  const messages = useChat((s) => s.messages);
  const sending = useChat((s) => s.sending);
  const loaded = useChat((s) => s.loaded);
  const load = useChat((s) => s.load);
  const send = useChat((s) => s.send);
  const clear = useChat((s) => s.clear);
  const refresh = useDashboard((s) => s.refresh);
  const voiceEnabled = useSettings((s) => s.ai.voiceEnabled);
  const language = useSettings((s) => s.language);

  const [gymName, setGymName] = useState<string | null>(null);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const listRef = useRef<FlatList<Row>>(null);

  useEffect(() => {
    if (!loaded) void load();
  }, [loaded, load]);

  // Phase 3 review: a meal photo picked while Android closed the app comes back into the
  // message box (never sent on its own — the member still taps send).
  useEffect(() => {
    let alive = true;
    takePendingPick('chat-photo')
      .then((asset) => {
        if (alive && asset) setImageUri(asset.uri);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    userRepo
      .getProfile()
      .then((p) => {
        // Since Phase O2 the gym name is optional at onboarding — an empty one
        // must fall back to the generic subtitle, not render a blank line.
        if (alive && p.gymName.trim().length > 0) setGymName(p.gymName);
      })
      .catch(() => {
        /* no profile yet — keep the fallback subtitle */
      });
    return () => {
      alive = false;
    };
  }, []);

  // Inverted list: newest first. Timestamps computed chronologically.
  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    let prev: ChatMessage | null = null;
    for (const message of messages) {
      out.push({
        message,
        showTimestamp: !prev || message.createdAt - prev.createdAt > TIMESTAMP_GAP_MS,
      });
      prev = message;
    }
    out.reverse();
    return out;
  }, [messages]);

  useEffect(() => {
    if (messages.length > 0) {
      listRef.current?.scrollToOffset({ offset: 0, animated: true });
    }
  }, [messages.length]);

  const handleSend = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      const attachment = imageUri;
      if ((!trimmed && !attachment) || useChat.getState().sending) return;
      setImageUri(null);
      thud();
      const beforeIds = new Set(useChat.getState().messages.map((m) => m.id));
      await send(trimmed, attachment);
      void refresh();
      const fresh = useChat.getState().messages.filter((m) => !beforeIds.has(m.id));
      if (fresh.some((m) => m.kind === 'workout_logged' || m.kind === 'pr_list')) success();
      if (useSettings.getState().ai.speakReplies) {
        const reply = [...fresh]
          .reverse()
          .find((m) => m.role === 'coach' && m.kind === 'text' && m.text.trim().length > 0);
        if (reply) speak(reply.text);
      }
    },
    [imageUri, refresh, send],
  );

  const pickImage = useCallback(async () => {
    try {
      const result = await launchFor('chat-photo', () =>
        ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          quality: 0.7,
          base64: false,
        }),
      );
      const asset = result.canceled ? null : (result.assets[0] ?? null);
      if (asset) setImageUri(asset.uri);
    } catch {
      /* picker unavailable (web/emulator) — silently ignore */
    }
  }, []);

  const handlePrompt = useCallback(
    (label: string) => {
      if (label === 'Upload food photo') {
        void pickImage();
        return;
      }
      void handleSend(label);
    },
    [handleSend, pickImage],
  );

  // A link here with ?prompt=… (another screen, or forgeai://coach?prompt=… from outside
  // the app) only FILLS the message box — the member reads it and taps send. Never sent
  // on its own: an outside link must not log workouts in the member's name (SH-01).
  const params = useLocalSearchParams<{ prompt?: string | string[] }>();
  const draft = linkedDraft(params.prompt);

  const confirmClear = useCallback(() => {
    void askConfirm({
      title: 'Clear conversation?',
      body: 'This deletes your entire chat history with the coach. Your workouts, meals and records stay logged.',
      confirmLabel: 'Clear',
      destructive: true,
    }).then((ok) => {
      if (ok) void clear();
    });
  }, [clear]);

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<Row>) => (
      <MessageBubble message={item.message} showTimestamp={item.showTimestamp} />
    ),
    [],
  );

  return (
    <Screen
      title="Coach"
      subtitle={gymName ?? undefined}
      scroll={false}
      noPad
      right={
        <IconButton
          icon="trash"
          onPress={confirmClear}
          size={38}
          tint={color.inkSecondary}
          accessibilityLabel="Clear chat history"
        />
      }
    >
      {/* Android: the app-wide KeyboardRoom makes the room (one handler, never two). */}
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={0} style={{ flex: 1 }}>
        {!loaded ? (
          <ChatSkeleton />
        ) : rows.length === 0 ? (
          <View style={{ flex: 1, justifyContent: 'center' }}>
            <EmptyState
              icon="chat"
              title="Ask your coach anything"
              body="Log a workout, snap a meal photo, or ask what to lift today — one chat runs it all."
            />
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={rows}
            inverted
            keyExtractor={(item) => item.message.id}
            renderItem={renderItem}
            contentContainerStyle={{
              paddingHorizontal: space.screenX,
              paddingTop: space.lg,
              paddingBottom: space.sm,
            }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            initialNumToRender={14}
          />
        )}
        <SuggestedPrompts onPrompt={handlePrompt} />
        <InputBar
          sending={sending}
          imageUri={imageUri}
          onPickImage={() => {
            void pickImage();
          }}
          onClearImage={() => setImageUri(null)}
          onSend={(t) => {
            void handleSend(t);
          }}
          micEnabled={voiceEnabled}
          language={language}
          draft={draft}
        />
      </KeyboardAvoidingView>
    </Screen>
  );
}
