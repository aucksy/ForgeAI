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
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Text, TextInput, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Card, ConfirmSheet, GhostButton, Icon, PrimaryButton, Screen } from '@/components/ui';
import { ChipGroup } from '@/components/settings/ChipGroup';
import type { ChipOption } from '@/components/settings/ChipGroup';
import { Logo } from '@/components/ui/Logo';
import { success, thud } from '@/lib/haptics';
import { useSettings } from '@/store/settingsStore';
import { color, motion, radius, space, type } from '@/theme/tokens';
import type { Goal, UnitSystem } from '@/types/models';

import { choosePendingImport, SwitcherCard, type SwitchApp } from '@/tracker/components/SwitcherCard';

import { countOwnWorkouts } from '../db/dataActions';
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

// v0.27.0: the same choice as Profile → Units.
const UNIT_OPTIONS = [
  { id: 'metric', label: 'kg, km' },
  { id: 'imperial', label: 'lb, miles' },
] as const satisfies readonly ChipOption<UnitSystem>[];

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
  const units = useSettings((s) => s.unitSystem);
  const setUnits = useSettings((s) => s.setUnitSystem);
  const imperial = units === 'imperial';

  const [draft, setDraft] = useState<OnboardingDraft>(emptyDraft);
  const [error, setError] = useState<{ field: keyof OnboardingDraft; message: string } | null>(null);

  const patch = (p: Partial<OnboardingDraft>): void => {
    setDraft((d) => ({ ...d, ...p }));
    setError(null);
  };

  const errFor = (field: keyof OnboardingDraft): string | null =>
    error && error.field === field ? error.message : null;

  // The app's own sheets: this screen renders before the navigator, so there is no ConfirmHost.
  const [problem, setProblem] = useState<string | null>(null);
  const [askDemo, setAskDemo] = useState(false);
  // Audit Phase 4: a switcher's app — its import opens right after "Start training".
  const [switchApp, setSwitchApp] = useState<SwitchApp | null>(null);
  const pickSwitch = (app: SwitchApp): void => {
    const next = switchApp === app ? null : app;
    setSwitchApp(next);
    choosePendingImport(next);
  };
  // Phase 1 (DS-06): "Remove demo data" keeps the member's own workouts and lands here.
  const [kept, setKept] = useState(0);
  useEffect(() => {
    let live = true;
    countOwnWorkouts()
      .then((n) => {
        if (live) setKept(n);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  const onStart = async (): Promise<void> => {
    if (busy) return;
    const result = validateOnboarding(draft, units);
    if (!result.ok) {
      setError({ field: result.field, message: result.message });
      thud();
      return;
    }
    setProblem(null);
    try {
      await complete(result.value);
      success();
    } catch {
      thud();
      setProblem('Could not save your details. Please try again.');
    }
  };

  const onLoadDemo = (): void => {
    if (busy) return;
    setProblem(null);
    setAskDemo(true);
  };

  const confirmDemo = (): void => {
    setAskDemo(false);
    if (useOnboarding.getState().busy) return; // re-check: the sheet sat open
    // A "From Hevy / Strong" pick is for starting with their own history, not the demo.
    choosePendingImport(null);
    void loadDemo().catch(() => {
      thud();
      setProblem('Could not load the demo. Please try again.');
    });
  };

  const demoBody =
    kept > 0
      ? `Fills the app with a sample member and 13 weeks of made-up training, for showing ForgeAI off. Your ${kept} workout${kept === 1 ? '' : 's'} on this phone ${kept === 1 ? 'is' : 'are'} deleted.`
      : 'Fills the app with a sample member and 13 weeks of made-up training, for showing ForgeAI off. You can remove it any time.';

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
                Optional — a bit more about you
              </Text>
            </View>

            <View style={{ marginBottom: space.md }}>
              <ChipGroup
                label="Units"
                options={UNIT_OPTIONS}
                selectedId={units}
                onSelect={(u) => {
                  setUnits(u);
                  setError(null);
                }}
              />
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
                <Field label={imperial ? 'Height (inches)' : 'Height (cm)'}>
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

            <Field label={imperial ? 'Body weight (lb)' : 'Body weight (kg)'} hint="Logs today's weight and sets your starting daily targets.">
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

        <Animated.View entering={FadeInDown.duration(motion.slow).delay(150)} style={{ marginBottom: space.lg }}>
          <SwitcherCard onPick={pickSwitch} selected={switchApp} later />
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(motion.slow).delay(180)} style={{ gap: space.md }}>
          <PrimaryButton
            label={busy ? 'Setting up…' : 'Start training'}
            icon="dumbbell"
            loading={busy}
            onPress={() => void onStart()}
          />
          {problem ? (
            <Text style={{ fontFamily: type.body, fontSize: type.size.sub, color: color.criticalText, textAlign: 'center' }}>
              {problem}
            </Text>
          ) : null}
          {kept > 0 ? (
            <Text style={{ fontFamily: type.body, fontSize: type.size.sub, color: color.inkSecondary, textAlign: 'center' }}>
              Your {kept} workout{kept === 1 ? ' is' : 's are'} still here. Add your details to carry on.
            </Text>
          ) : null}
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
      <ConfirmSheet
        visible={askDemo}
        title="Load demo data?"
        body={demoBody}
        confirmLabel="Load demo"
        destructive={kept > 0}
        onConfirm={confirmDemo}
        onCancel={() => setAskDemo(false)}
      />
    </Screen>
  );
}
