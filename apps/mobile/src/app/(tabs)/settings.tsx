import { useState, type ReactNode } from 'react';
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
import { ProfileFold } from '@/components/settings/ProfileFold';
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
import type { AiProviderId, UnitSystem } from '@/types/models';

// D4 = A: AI coach settings, voice and gym sync stay hidden until their phase.
const PARTS = new Set(profileParts(FEATURES));
// The folded half, named by what is inside (the coach only while it is switched on).
const FOLD_TITLE = PARTS.has('aiCoach') ? 'Coach, gym and data' : 'Gym, backup and data';
const FOLD_CONTENTS = PARTS.has('aiCoach')
  ? 'AI coach · voice · your gym · backup · import from Hevy or Strong · erase'
  : 'Your gym · backup · import from Hevy or Strong · erase';

const PROVIDER_OPTIONS = [
  // Packet B (one meaning per icon): provider names need no icons of their own.
  { id: 'anthropic', label: 'Claude' },
  { id: 'openai', label: 'OpenAI' },
  { id: 'groq', label: 'Groq' },
  { id: 'local', label: 'Local demo' },
] as const satisfies readonly ChipOption<AiProviderId>[];

// v0.27.0 (tracker plan Phase 5): pounds and miles everywhere a weight or a kilometre shows
// (stored metric as always; `lib/units.ts`). Metre exercises stay in metres.
const UNIT_OPTIONS = [
  { id: 'metric', label: 'kg, km' },
  { id: 'imperial', label: 'lb, miles' },
] as const satisfies readonly ChipOption<UnitSystem>[];

// v0.25.1: the figure the body map on Progress and the share picture draw.
const FIGURE_OPTIONS = [
  { id: 'male', label: 'Male' },
  { id: 'female', label: 'Female' },
] as const satisfies readonly ChipOption<BodyFigure>[];

const groupLabel = {
  fontFamily: type.bodySemi,
  fontSize: type.size.caption,
  color: color.inkMuted,
  letterSpacing: 1.1,
  textTransform: 'uppercase',
  marginBottom: space.sm,
} as const;

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
  const setProvider = useSettings((s) => s.setProvider);
  const setModel = useSettings((s) => s.setModel);
  const setVoiceEnabled = useSettings((s) => s.setVoiceEnabled);
  const setSpeakReplies = useSettings((s) => s.setSpeakReplies);
  const setUnitSystem = useSettings((s) => s.setUnitSystem);
  const bodyFigure = useTrackerPrefs((s) => s.bodyFigure);
  const setBodyFigure = useTrackerPrefs((s) => s.setBodyFigure);
  const router = useRouter();
  // A saved name or gym re-reads the gym card (it shows the gym name).
  const [saves, setSaves] = useState(0);

  return (
    <Screen title="Profile">
      {/* Audit Phase 7 (D12): the half a member uses — "You & workouts" — is open; the rest
          (gym, backup, imports, erase) is folded under one heading that names what is inside. */}
      <Text accessibilityRole="header" style={groupLabel}>
        You &amp; workouts
      </Text>

      <Section title="Your details" delay={0}>
        <ProfileCard
          onSaved={() => {
            void useDashboard.getState().refresh();
            setSaves((n) => n + 1);
          }}
        />
      </Section>

      <Section title="Preferences" delay={60}>
        <Card>
          <ChipGroup
            label="Units"
            options={UNIT_OPTIONS}
            selectedId={unitSystem}
            onSelect={setUnitSystem}
          />
          {/* SH-15: "Language" is gone (it changed nothing on screen); so is the locked
              "Dark mode" switch (the app has one theme, and a switch that cannot move is not
              a setting). */}
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
                marginTop: space.xs,
                lineHeight: 17,
              }}
            >
              The body drawn on Progress and on share pictures.
            </Text>
          </View>
        </Card>
      </Section>

      <Section title="Workout" delay={120}>
        <WorkoutPrefsCard showCoachNotes={PARTS.has('coachNotes')} />
      </Section>

      <Section title="Around your phone" delay={160}>
        <PhoneCard />
      </Section>

      <Animated.View entering={FadeInDown.duration(motion.slow).delay(200)}>
        <ProfileFold title={FOLD_TITLE} contents={FOLD_CONTENTS}>
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

          {PARTS.has('gymSync') ? (
            <Section title="Gym sync" delay={0}>
              <CloudCard />
            </Section>
          ) : null}

          <Section title="Your gym" delay={0}>
            <GymCard key={saves} />
          </Section>

          {/* SH-27 / DS-01: one true status line, "Save my history", then the imports. The Excel
              export is gone: it could not be read back (DS-12); the Hevy-format file can. */}
          <Section title="Backup" delay={0}>
            <BackupCard />
            <View style={{ marginTop: space.md }}>
              <ImportCard />
            </View>
          </Section>

          <Section title="Your data" delay={0}>
            <DataCard />
          </Section>

          <Section title="About" delay={0}>
            <Card style={{ paddingVertical: space.xs }}>
              <Pressable
                onPress={() => router.push('/credits')}
                accessibilityRole="button"
                accessibilityLabel="Credits"
                style={{ minHeight: 48 }}
              >
                <SettingRow
                  title="Credits"
                  right={<Icon name="chevron-right" size={16} color={color.inkMuted} />}
                />
              </Pressable>
            </Card>
          </Section>
        </ProfileFold>
      </Animated.View>
    </Screen>
  );
}
