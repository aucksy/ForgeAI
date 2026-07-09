import type { ReactNode } from 'react';
import { useState } from 'react';
import { Alert, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { ANTHROPIC_MODELS, OPENAI_MODELS } from '@/ai/models';
import { ApiKeyField } from '@/components/settings/ApiKeyField';
import { ChipGroup } from '@/components/settings/ChipGroup';
import type { ChipOption } from '@/components/settings/ChipGroup';
import { BackupCard } from '@/components/settings/BackupCard';
import { CloudCard } from '@/components/settings/CloudCard';
import { GymCard } from '@/components/settings/GymCard';
import { resetDemoData } from '@/components/settings/resetDemo';
import { ToggleRow } from '@/components/settings/SettingRow';
import { Card, GhostButton, Icon, Screen, SectionHeader } from '@/components/ui';
import { ExportCard } from '@/tracker/components/ExportCard';
import { ImportCard } from '@/tracker/components/ImportCard';
import { useTrackerPrefs } from '@/tracker/store/trackerPrefsStore';
import { success, thud } from '@/lib/haptics';
import { getAnthropicKey, getOpenAiKey, setAnthropicKey, setOpenAiKey } from '@/lib/keys';
import { useChat } from '@/store/chatStore';
import { useDashboard } from '@/store/dashboardStore';
import { useSettings } from '@/store/settingsStore';
import { color, motion, space, type } from '@/theme/tokens';
import type { AiProviderId, AppLanguage, UnitSystem } from '@/types/models';

const PROVIDER_OPTIONS = [
  { id: 'anthropic', label: 'Claude', icon: 'sparkle' },
  { id: 'openai', label: 'OpenAI', icon: 'globe' },
  { id: 'local', label: 'Local demo', icon: 'zap' },
] as const satisfies readonly ChipOption<AiProviderId>[];

// Demo ships kg-only (Indian gym context). Full pounds support — input parsing,
// every coach reply string, chat cards and analytics — is a tracked enhancement;
// exposing a half-converted lb toggle would read worse than kg-only.
const UNIT_OPTIONS = [
  { id: 'metric', label: 'kg' },
] as const satisfies readonly ChipOption<UnitSystem>[];

const LANGUAGE_OPTIONS = [
  { id: 'en', label: 'English' },
  { id: 'hi', label: 'Hindi' },
  { id: 'hinglish', label: 'Hinglish' },
] as const satisfies readonly ChipOption<AppLanguage>[];

function Section({
  title,
  delay,
  children,
}: {
  title: string;
  delay: number;
  children: ReactNode;
}) {
  return (
    <Animated.View
      entering={FadeInDown.duration(motion.slow).delay(delay)}
      style={{ marginBottom: space.xl }}
    >
      <SectionHeader title={title} />
      {children}
    </Animated.View>
  );
}

export default function SettingsScreen() {
  const ai = useSettings((s) => s.ai);
  const unitSystem = useSettings((s) => s.unitSystem);
  const language = useSettings((s) => s.language);
  const setProvider = useSettings((s) => s.setProvider);
  const setModel = useSettings((s) => s.setModel);
  const setVoiceEnabled = useSettings((s) => s.setVoiceEnabled);
  const setSpeakReplies = useSettings((s) => s.setSpeakReplies);
  const setUnitSystem = useSettings((s) => s.setUnitSystem);
  const setLanguage = useSettings((s) => s.setLanguage);

  const advancedSets = useTrackerPrefs((s) => s.advancedSets);
  const setAdvancedSets = useTrackerPrefs((s) => s.setAdvancedSets);

  const [resetting, setResetting] = useState(false);

  const runReset = async () => {
    if (resetting) return;
    setResetting(true);
    try {
      const { reseeded } = await resetDemoData();
      if (reseeded) {
        await Promise.all([useDashboard.getState().refresh(), useChat.getState().load()]);
        success();
        Alert.alert('Demo data regenerated', 'A fresh 13-week training history is ready.');
      } else {
        // Reseed genuinely failed — refresh anyway so the UI reflects the wiped
        // DB rather than showing ghost pre-reset data, then ask for a restart.
        await Promise.all([useDashboard.getState().refresh(), useChat.getState().load()]);
        thud();
        Alert.alert(
          'Demo data cleared',
          'Close and reopen ForgeAI to finish forging the fresh demo.',
        );
      }
    } catch {
      Alert.alert('Reset failed', 'Something went wrong — please try again.');
    } finally {
      setResetting(false);
    }
  };

  const confirmReset = () => {
    Alert.alert(
      'Reset demo data?',
      'This wipes every workout, meal, PR and chat message, then regenerates the demo from scratch.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Reset', style: 'destructive', onPress: () => void runReset() },
      ],
    );
  };

  return (
    <Screen title="Settings" subtitle="Tune your coach">
      <Section title="AI Coach" delay={0}>
        <Card>
          <ChipGroup
            label="Provider"
            options={PROVIDER_OPTIONS}
            selectedId={ai.provider}
            onSelect={setProvider}
          />

          {ai.provider === 'local' ? (
            <Text
              style={{
                fontFamily: type.body,
                fontSize: type.size.caption,
                color: color.inkMuted,
                marginTop: space.md,
                lineHeight: 15,
              }}
            >
              The local coach runs fully offline — no API key needed.
            </Text>
          ) : (
            <View style={{ marginTop: space.lg }}>
              <ChipGroup
                label="Model"
                options={ai.provider === 'anthropic' ? ANTHROPIC_MODELS : OPENAI_MODELS}
                selectedId={ai.provider === 'anthropic' ? ai.anthropicModel : ai.openaiModel}
                onSelect={(id) => setModel(ai.provider === 'anthropic' ? 'anthropic' : 'openai', id)}
              />
            </View>
          )}

          <View
            style={{ borderTopWidth: 1, borderTopColor: color.border, marginTop: space.lg }}
          />
          <ApiKeyField
            label="Claude API key"
            placeholder="sk-ant-…"
            load={getAnthropicKey}
            save={setAnthropicKey}
          />
          <ApiKeyField
            label="OpenAI API key"
            placeholder="sk-…"
            load={getOpenAiKey}
            save={setOpenAiKey}
            divider
          />
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              marginTop: space.xs,
            }}
          >
            <Icon name="key" size={12} color={color.inkMuted} />
            <Text
              style={{
                fontFamily: type.bodyMedium,
                fontSize: type.size.caption,
                color: color.inkMuted,
              }}
            >
              Keys are stored securely on this device.
            </Text>
          </View>
        </Card>
      </Section>

      <Section title="Voice" delay={70}>
        <Card style={{ paddingVertical: space.xs }}>
          <ToggleRow
            icon="mic"
            title="Voice input"
            caption="Hold the mic in chat to talk to your coach"
            value={ai.voiceEnabled}
            onChange={setVoiceEnabled}
          />
          <ToggleRow
            icon="volume"
            title="Speak replies"
            caption="Your coach reads answers out loud"
            value={ai.speakReplies}
            onChange={setSpeakReplies}
            divider
          />
        </Card>
      </Section>

      <Section title="Preferences" delay={140}>
        <Card>
          <ChipGroup
            label="Units"
            options={UNIT_OPTIONS}
            selectedId={unitSystem}
            onSelect={setUnitSystem}
          />
          <Text
            style={{
              fontFamily: type.body,
              fontSize: type.size.caption,
              color: color.inkMuted,
              marginTop: space.sm,
            }}
          >
            Pounds (lb) support is coming soon.
          </Text>
          <View style={{ marginTop: space.lg }}>
            <ChipGroup
              label="Language"
              options={LANGUAGE_OPTIONS}
              selectedId={language}
              onSelect={setLanguage}
            />
          </View>
          <View style={{ marginTop: space.lg }}>
            <ToggleRow
              icon="flame"
              title="Dark mode"
              caption="Forged in darkness. Light mode never made anyone stronger."
              value
              locked
              divider
            />
          </View>
        </Card>
      </Section>

      <Section title="Workout" delay={175}>
        <Card style={{ paddingVertical: space.xs }}>
          <ToggleRow
            icon="target"
            title="Advanced set logging"
            caption="Show RPE and set types (warm-up · drop · failure) on each set"
            value={advancedSets}
            onChange={setAdvancedSets}
          />
        </Card>
      </Section>

      <Section title="Gym sync" delay={210}>
        <CloudCard />
      </Section>

      <Section title="Your gym" delay={245}>
        <GymCard />
      </Section>

      <Section title="Backup & restore" delay={280}>
        <BackupCard />
        <View style={{ marginTop: space.md }}>
          <ExportCard />
        </View>
        <View style={{ marginTop: space.md }}>
          <ImportCard />
        </View>
      </Section>

      <Section title="Danger zone" delay={315}>
        <Card>
          <GhostButton
            label={resetting ? 'Resetting…' : 'Reset demo data'}
            icon="flame"
            onPress={confirmReset}
          />
          <Text
            style={{
              fontFamily: type.body,
              fontSize: type.size.caption,
              color: color.inkMuted,
              textAlign: 'center',
              marginTop: space.md,
              lineHeight: 15,
            }}
          >
            Wipes every workout, meal and chat, then regenerates the full demo dataset.
          </Text>
        </Card>
      </Section>
    </Screen>
  );
}
