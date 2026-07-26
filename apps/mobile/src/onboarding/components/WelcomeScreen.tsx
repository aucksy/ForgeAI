/**
 * First-run welcome — Phase O2 (W1 real onboarding).
 *
 * Rendered by the root layout INSTEAD of the navigator when no profile row exists,
 * so the tabs never mount with someone else's data behind them and an erase can
 * return here with no restart and no navigation race.
 *
 * Name + mobile number are required (the number is the identity the gym will
 * verify against its roster once the platform track opens — it is stored locally
 * only, no SMS is sent). Everything else is optional and editable in Settings.
 */
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Text, TextInput, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Card, GhostButton, Icon, PrimaryButton, Screen } from '@/components/ui';
import { ChipGroup } from '@/components/settings/ChipGroup';
import type { ChipOption } from '@/components/settings/ChipGroup';
import { Logo } from '@/components/ui/Logo';
import { success, thud } from '@/lib/haptics';
import { color, motion, radius, space, type } from '@/theme/tokens';
import type { Goal } from '@/types/models';

import type { Experience, OnboardingDraft } from '../form';
import { emptyDraft, validateOnboarding } from '../form';
import { useOnboarding } from '../store/onboardingStore';

const GOAL_OPTIONS = [
  { id: 'muscle', label: 'Build muscle' },
  { id: 'fat_loss', label: 'Lose fat' },
  { id: 'strength', label: 'Get stronger' },
  { id: 'general', label: 'General' },
] as const satisfies readonly ChipOption<Goal>[];

const EXPERIENCE_OPTIONS = [
  { id: 'beginner', label: 'New to lifting' },
  { id: 'intermediate', label: 'Intermediate' },
  { id: 'advanced', label: 'Advanced' },
] as const satisfies readonly ChipOption<Experience>[];

const inputStyle = {
  backgroundColor: color.surfaceSunken,
  borderWidth: 1,
  borderColor: color.borderStrong,
  borderRadius: radius.md,
  paddingHorizontal: space.md,
  paddingVertical: 10,
  color: color.ink,
  fontFamily: type.body,
  fontSize: type.size.sub,
} as const;

const overline = {
  fontFamily: type.bodySemi,
  fontSize: type.size.caption,
  color: color.inkMuted,
  letterSpacing: 1.1,
  textTransform: 'uppercase',
  marginBottom: space.sm,
} as const;

function FieldError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <Text
      style={{
        fontFamily: type.bodyMedium,
        fontSize: type.size.caption,
        color: color.criticalText,
        marginTop: space.xs,
      }}
    >
      {message}
    </Text>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={{ marginBottom: space.lg }}>
      <Text style={overline}>{label}</Text>
      {children}
      {hint ? (
        <Text
          style={{
            fontFamily: type.body,
            fontSize: type.size.caption,
            color: color.inkMuted,
            marginTop: space.xs,
          }}
        >
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

export function WelcomeScreen() {
  const complete = useOnboarding((s) => s.complete);
  const loadDemo = useOnboarding((s) => s.loadDemo);
  const busy = useOnboarding((s) => s.busy);

  const [draft, setDraft] = useState<OnboardingDraft>(emptyDraft);
  const [error, setError] = useState<{ field: keyof OnboardingDraft; message: string } | null>(null);

  const patch = (p: Partial<OnboardingDraft>): void => {
    setDraft((d) => ({ ...d, ...p }));
    setError(null);
  };

  const errFor = (field: keyof OnboardingDraft): string | null =>
    error && error.field === field ? error.message : null;

  const onStart = async (): Promise<void> => {
    if (busy) return;
    const result = validateOnboarding(draft);
    if (!result.ok) {
      setError({ field: result.field, message: result.message });
      thud();
      return;
    }
    try {
      await complete(result.value);
      success();
    } catch {
      Alert.alert('Could not set up', 'Something went wrong saving your details — please try again.');
    }
  };

  const onLoadDemo = (): void => {
    if (busy) return;
    Alert.alert(
      'Load demo data?',
      'Fills the app with a sample member and 13 weeks of made-up training history, for showing ForgeAI off. You can erase it any time in Settings.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Load demo',
          onPress: () => {
            if (useOnboarding.getState().busy) return; // re-check: the alert sat open
            void loadDemo().catch(() => {
              Alert.alert('Could not load the demo', 'Something went wrong — please try again.');
            });
          },
        },
      ],
    );
  };

  return (
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Animated.View entering={FadeInDown.duration(motion.slow)} style={{ marginBottom: space.xl }}>
          <Logo height={26} />
          <Text
            style={{
              fontFamily: type.display,
              fontSize: type.size.h1,
              color: color.ink,
              letterSpacing: -0.5,
              marginTop: space.lg,
            }}
          >
            Welcome to ForgeAI
          </Text>
          <Text
            style={{
              fontFamily: type.bodyMedium,
              fontSize: type.size.sub,
              color: color.inkSecondary,
              marginTop: 4,
              lineHeight: 19,
            }}
          >
            Two details and you are training. Your history starts empty — every number in
            here will be one you actually lifted.
          </Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(motion.slow).delay(60)}>
          <Card style={{ marginBottom: space.lg }}>
            <Field label="Your name">
              <TextInput
                value={draft.name}
                onChangeText={(t) => patch({ name: t })}
                placeholder="e.g. Rahul Sharma"
                placeholderTextColor={color.inkMuted}
                autoCapitalize="words"
                autoCorrect={false}
                returnKeyType="next"
                style={inputStyle}
              />
              <FieldError message={errFor('name')} />
            </Field>

            <Field
              label="Mobile number"
              hint="Stays on this phone. Your gym uses it to recognise you when you join them."
            >
              <View style={{ flexDirection: 'row', gap: space.sm }}>
                <TextInput
                  value={draft.dialCode}
                  onChangeText={(t) => patch({ dialCode: t })}
                  keyboardType="phone-pad"
                  maxLength={5}
                  style={[inputStyle, { width: 68, textAlign: 'center' }]}
                />
                <TextInput
                  value={draft.phone}
                  onChangeText={(t) => patch({ phone: t })}
                  placeholder="98765 43210"
                  placeholderTextColor={color.inkMuted}
                  keyboardType="phone-pad"
                  maxLength={18}
                  style={[inputStyle, { flex: 1 }]}
                />
              </View>
              <FieldError message={errFor('phone')} />
            </Field>

            <View style={{ marginBottom: space.lg }}>
              <ChipGroup
                label="Your goal"
                options={GOAL_OPTIONS}
                selectedId={draft.goal}
                onSelect={(goal) => patch({ goal })}
              />
            </View>

            <ChipGroup
              label="Experience"
              options={EXPERIENCE_OPTIONS}
              selectedId={draft.experience}
              onSelect={(experience) => patch({ experience })}
            />
          </Card>
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(motion.slow).delay(120)}>
          <Card style={{ marginBottom: space.lg }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.lg }}>
              <Icon name="sparkle" size={16} color={color.accent} />
              <Text style={{ fontFamily: type.heading, fontSize: type.size.h3, color: color.ink }}>
                Optional — sharpens your coach
              </Text>
            </View>

            <View style={{ flexDirection: 'row', gap: space.md }}>
              <View style={{ flex: 1 }}>
                <Field label="Age">
                  <TextInput
                    value={draft.age}
                    onChangeText={(t) => patch({ age: t })}
                    placeholder="—"
                    placeholderTextColor={color.inkMuted}
                    keyboardType="number-pad"
                    maxLength={3}
                    style={inputStyle}
                  />
                </Field>
              </View>
              <View style={{ flex: 1 }}>
                <Field label="Height (cm)">
                  <TextInput
                    value={draft.heightCm}
                    onChangeText={(t) => patch({ heightCm: t })}
                    placeholder="—"
                    placeholderTextColor={color.inkMuted}
                    keyboardType="numeric"
                    maxLength={5}
                    style={inputStyle}
                  />
                </Field>
              </View>
            </View>
            <FieldError message={errFor('age') ?? errFor('heightCm')} />

            <Field label="Body weight (kg)" hint="Logs today's weight and sets your starting daily targets.">
              <TextInput
                value={draft.bodyWeightKg}
                onChangeText={(t) => patch({ bodyWeightKg: t })}
                placeholder="—"
                placeholderTextColor={color.inkMuted}
                keyboardType="numeric"
                maxLength={6}
                style={inputStyle}
              />
              <FieldError message={errFor('bodyWeightKg')} />
            </Field>

            <Field label="Your gym">
              <TextInput
                value={draft.gymName}
                onChangeText={(t) => patch({ gymName: t })}
                placeholder="e.g. Iron Temple Fitness"
                placeholderTextColor={color.inkMuted}
                autoCapitalize="words"
                style={inputStyle}
              />
              <FieldError message={errFor('gymName')} />
            </Field>
          </Card>
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(motion.slow).delay(180)} style={{ gap: space.md }}>
          <PrimaryButton
            label={busy ? 'Setting up…' : 'Start training'}
            icon="dumbbell"
            loading={busy}
            onPress={() => void onStart()}
          />
          <GhostButton label="Load demo data instead" icon="sparkle" onPress={onLoadDemo} />
          <Text
            style={{
              fontFamily: type.body,
              fontSize: type.size.caption,
              color: color.inkMuted,
              textAlign: 'center',
              lineHeight: 16,
            }}
          >
            Everything is stored on this phone and works offline. Nothing is shared until you
            link a gym.
          </Text>
        </Animated.View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
