import type { ReactNode } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { ANTHROPIC_MODELS, GROQ_MODELS, OPENAI_MODELS } from '@/ai/models';
import { ApiKeyField } from '@/components/settings/ApiKeyField';
import { ChipGroup } from '@/components/settings/ChipGroup';
import type { ChipOption } from '@/components/settings/ChipGroup';
import { BackupCard } from '@/components/settings/BackupCard';
import { CloudCard } from '@/components/settings/CloudCard';
import { DataCard } from '@/components/settings/DataCard';
import { GymCard } from '@/components/settings/GymCard';
import { ProfileCard } from '@/components/settings/ProfileCard';
import { SettingRow, ToggleRow } from '@/components/settings/SettingRow';
import { Card, Icon, Screen, SectionHeader } from '@/components/ui';
import { FEATURES, profileParts } from '@/lib/features';
import { ImportCard } from '@/tracker/components/ImportCard';
import { WorkoutPrefsCard } from '@/tracker/components/WorkoutPrefsCard';
import { PhoneCard } from '@/tracker/phone/PhoneCard';
import type { BodyFigure } from '@/tracker/catalog/bodyMapPaths';
import { useTrackerPrefs } from '@/tracker/store/trackerPrefsStore';
import {
  getAnthropicKey,
  getGroqKey,
  getOpenAiKey,
  setAnthropicKey,
  setGroqKey,
  setOpenAiKey,
} from '@/lib/keys';
import { useDashboard } from '@/store/dashboardStore';
import { useSettings } from '@/store/settingsStore';
import { color, motion, space, type } from '@/theme/tokens';
import type { AiProviderId, AppLanguage, UnitSystem } from '@/types/models';

// D4 = A: AI coach settings, voice, language and gym sync stay hidden until their phase.
const PARTS = new Set(profileParts(FEATURES));

const PROVIDER_OPTIONS = [
  { id: 'anthropic', label: 'Claude', icon: 'sparkle' },
  { id: 'openai', label: 'OpenAI', icon: 'globe' },
  { id: 'groq', label: 'Groq', icon: 'flame' },
  { id: 'local', label: 'Local demo', icon: 'zap' },
] as const satisfies readonly ChipOption<AiProviderId>[];

// v0.27.0 (tracker plan Phase 5): pounds and miles everywhere a weight or a kilometre shows
// (stored metric as always; `lib/units.ts`). Metre exercises stay in metres.
const UNIT_OPTIONS = [
  { id: 'metric', label: 'kg, km' },
  { id: 'imperial', label: 'lb, miles' },
] as const satisfies readonly ChipOption<UnitSystem>[];

const LANGUAGE_OPTIONS = [
  { id: 'en', label: 'English' },
  { id: 'hi', label: 'Hindi' },
  { id: 'hinglish', label: 'Hinglish' },
] as const satisfies readonly ChipOption<AppLanguage>[];

// v0.25.1: the figure the body map on Progress and the share picture draw.
const FIGURE_OPTIONS = [
  { id: 'male', label: 'Male' },
  { id: 'female', label: 'Female' },
] as const satisfies readonly ChipOption<BodyFigure>[];

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
  const bodyFigure = useTrackerPrefs((s) => s.bodyFigure);
  const setBodyFigure = useTrackerPrefs((s) => s.setBodyFigure);
  const router = useRouter();

  return (
    <Screen title="Settings">
      <Section title="Your profile" delay={0}>
        <ProfileCard onSaved={() => void useDashboard.getState().refresh()} />
      </Section>

      {PARTS.has('aiCoach') ? (
        <Section title="AI Coach" delay={60}>
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
                  options={
                    ai.provider === 'anthropic'
                      ? ANTHROPIC_MODELS
                      : ai.provider === 'groq'
                        ? GROQ_MODELS
                        : OPENAI_MODELS
                  }
                  selectedId={
                    ai.provider === 'anthropic'
                      ? ai.anthropicModel
                      : ai.provider === 'groq'
                        ? ai.groqModel
                        : ai.openaiModel
                  }
                  onSelect={(id) =>
                    setModel(
                      ai.provider === 'anthropic'
                        ? 'anthropic'
                        : ai.provider === 'groq'
                          ? 'groq'
                          : 'openai',
                      id,
                    )
                  }
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
            <ApiKeyField
              label="Groq API key"
              placeholder="gsk_…"
              load={getGroqKey}
              save={setGroqKey}
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
      ) : null}

      {PARTS.has('voice') ? (
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
      ) : null}

      <Section title="Preferences" delay={140}>
        <Card>
          <ChipGroup
            label="Units"
            options={UNIT_OPTIONS}
            selectedId={unitSystem}
            onSelect={setUnitSystem}
          />
          {PARTS.has('language') ? (
            <View style={{ marginTop: space.lg }}>
              <ChipGroup
                label="Language"
                options={LANGUAGE_OPTIONS}
                selectedId={language}
                onSelect={setLanguage}
              />
            </View>
          ) : null}
          <View style={{ marginTop: space.lg }}>
            <ChipGroup
              label="Body figure"
              options={FIGURE_OPTIONS}
              selectedId={bodyFigure}
              onSelect={setBodyFigure}
            />
            <Text
              style={{
                fontFamily: type.body,
                fontSize: type.size.caption,
                color: color.inkMuted,
                marginTop: space.sm,
              }}
            >
              The body drawn on Progress and on share pictures.
            </Text>
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
        <WorkoutPrefsCard showCoachNotes={PARTS.has('coachNotes')} />
      </Section>

      <Section title="Around your phone" delay={190}>
        <PhoneCard />
      </Section>

      {PARTS.has('gymSync') ? (
        <Section title="Gym sync" delay={210}>
          <CloudCard />
        </Section>
      ) : null}

      <Section title="Your gym" delay={245}>
        <GymCard />
      </Section>

      {/* SH-27 / DS-01: one true status line, "Save my history", then the imports. The Excel
          export is gone: it could not be read back (DS-12); the Hevy-format file can. */}
      <Section title="Backup" delay={280}>
        <BackupCard />
        <View style={{ marginTop: space.md }}>
          <ImportCard />
        </View>
      </Section>

      <Section title="Your data" delay={315}>
        <DataCard />
      </Section>

      <Section title="About" delay={350}>
        <Card style={{ paddingVertical: space.xs }}>
          <Pressable
            onPress={() => router.push('/credits')}
            accessibilityRole="button"
            accessibilityLabel="Credits"
          >
            <SettingRow
              title="Credits"
              right={<Icon name="chevron-right" size={16} color={color.inkMuted} />}
            />
          </Pressable>
        </Card>
      </Section>
    </Screen>
  );
}
