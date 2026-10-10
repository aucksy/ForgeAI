/**
 * First-run welcome — Phase O2 (W1), rebuilt in Audit Phase 7 as 3 calm steps (D12 = A):
 *
 *   1. Your name (+ an optional mobile number, any country)
 *   2. kg or lb
 *   3. Your goal and experience → Start training
 *
 * Rendered by the root layout INSTEAD of the navigator when no profile row exists,
 * so the tabs never mount with someone else's data behind them and an erase can
 * return here with no restart and no navigation race.
 *
 * SH-10 / SH-26: the number no longer blocks the start and no country's rule is assumed.
 * SH-17: a missing or wrong answer is written under its own field, scrolled into view, and
 * spoken by the screen reader — never only a buzz. Every answer can be changed in Profile.
 * The step logic is pure (`../welcomeSteps`); the demo and the "Coming from Hevy or Strong?"
 * pick behave exactly as before.
 */
import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  BackHandler,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ConfirmSheet, IconButton, PrimaryButton, Screen } from '@/components/ui';
import { InlineError } from '@/components/ui/InlineError';
import { Logo } from '@/components/ui/Logo';
import { success, thud } from '@/lib/haptics';
import { useSettings } from '@/store/settingsStore';
import { color, motion, radius, space, type } from '@/theme/tokens';
import type { Goal, UnitSystem } from '@/types/models';

import { choosePendingImport, SwitcherCard, type SwitchApp } from '@/tracker/components/SwitcherCard';

import { countOwnWorkouts } from '../db/dataActions';
import type { Experience, OnboardingDraft } from '../form';
import { validateOnboarding, welcomeDraft } from '../form';
import { useOnboarding } from '../store/onboardingStore';
import {
  nextStep,
  previousStep,
  stepLabel,
  stepOf,
  stepProblem,
  WELCOME_STEP_COUNT,
  welcomeFieldOf,
  type WelcomeField,
  type WelcomeProblem,
  type WelcomeStep,
} from '../welcomeSteps';
import { RadioList, type RadioOption } from './RadioList';

const GOAL_OPTIONS: readonly RadioOption<Goal>[] = [
  { id: 'muscle', label: 'Build muscle' },
  { id: 'fat_loss', label: 'Lose fat' },
  { id: 'strength', label: 'Get stronger' },
  { id: 'general', label: 'General fitness' },
];

const EXPERIENCE_OPTIONS: readonly RadioOption<Experience>[] = [
  { id: 'beginner', label: 'New to lifting' },
  { id: 'intermediate', label: 'Intermediate' },
  { id: 'advanced', label: 'Advanced' },
];

// The same choice as Profile → Units ("kg, km" / "lb, miles").
const UNIT_OPTIONS: readonly RadioOption<UnitSystem>[] = [
  { id: 'metric', label: 'Kilograms', caption: 'kg and km' },
  { id: 'imperial', label: 'Pounds', caption: 'lb and miles' },
];

const STEP_TEXT: Record<WelcomeStep, { title: string; sub: string }> = {
  0: {
    title: 'Welcome to ForgeAI',
    sub: 'Three quick questions and you are training. Every number in here will be one you lifted.',
  },
  1: { title: 'Kilograms or pounds?', sub: 'For every weight in the app. You can change it in Profile.' },
  2: { title: 'Your goal and experience', sub: 'They shape your Targets. You can change them in Profile.' },
};

const inputStyle = {
  backgroundColor: color.surfaceSunken,
  borderWidth: 1,
  borderColor: color.borderStrong,
  borderRadius: radius.md,
  paddingHorizontal: space.md,
  paddingVertical: 12,
  minHeight: 48,
  color: color.ink,
  fontFamily: type.body,
  fontSize: type.size.body,
} as const;

const overline = {
  fontFamily: type.bodySemi,
  fontSize: type.size.caption,
  color: color.inkMuted,
  letterSpacing: 1.1,
  textTransform: 'uppercase',
  marginBottom: space.sm,
} as const;

/**
 * The line under a field. Spoken by `showProblem`'s announcement each time it is shown — no
 * live region as well, or TalkBack would say it twice (one mechanism: `shouldAnnounce`).
 */
function FieldError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <Text
      style={{
        fontFamily: type.bodyMedium,
        fontSize: type.size.sub,
        color: color.criticalText,
        marginTop: space.xs,
        lineHeight: 19,
      }}
    >
      {message}
    </Text>
  );
}

function Hint({ children }: { children: string }) {
  return (
    <Text style={{ fontFamily: type.body, fontSize: type.size.caption, color: color.inkMuted, marginTop: space.xs, lineHeight: 17 }}>
      {children}
    </Text>
  );
}

export function WelcomeScreen() {
  const complete = useOnboarding((s) => s.complete);
  const loadDemo = useOnboarding((s) => s.loadDemo);
  const busy = useOnboarding((s) => s.busy);
  const setUnits = useSettings((s) => s.setUnitSystem);
  const insets = useSafeAreaInsets();

  const [step, setStep] = useState<WelcomeStep>(0);
  const [draft, setDraft] = useState<OnboardingDraft>(welcomeDraft);
  // Nothing is chosen for the member: step 2 waits for a tap (the pick is saved at once).
  const [units, setPickedUnits] = useState<UnitSystem | null>(null);
  const [problem, setProblem] = useState<WelcomeProblem | null>(null);

  const scrollRef = useRef<ScrollView>(null);
  const nameRef = useRef<TextInput>(null);
  const phoneRef = useRef<TextInput>(null);
  // Where each field sits inside the step body, and where the body sits in the scroll.
  const bodyY = useRef(0);
  const fieldY = useRef<Partial<Record<WelcomeField, number>>>({});
  const at = (field: WelcomeField) => (e: { nativeEvent: { layout: { y: number } } }) => {
    fieldY.current[field] = e.nativeEvent.layout.y;
  };

  const patch = (p: Partial<OnboardingDraft>): void => {
    setDraft((d) => ({ ...d, ...p }));
    setProblem((cur) => (cur && cur.field in p ? null : cur));
  };

  const errFor = (field: WelcomeField): string | null => (problem && problem.field === field ? problem.message : null);

  // The app's own sheets: this screen renders before the navigator, so there is no ConfirmHost.
  const [saveProblem, setSaveProblem] = useState<string | null>(null);
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

  /** Write it under the field, bring the field into view, say it out loud (SH-17). */
  const showProblem = (p: WelcomeProblem): void => {
    setProblem(p);
    thud();
    AccessibilityInfo.announceForAccessibility(p.message);
    // After the line has been laid out, so the field and its message both fit in view.
    requestAnimationFrame(() => {
      const y = fieldY.current[p.field];
      if (y != null) scrollRef.current?.scrollTo({ y: Math.max(0, bodyY.current + y - space.lg), animated: true });
      if (p.field === 'name') nameRef.current?.focus();
      else if (p.field === 'phone') phoneRef.current?.focus();
    });
  };

  const goTo = (s: WelcomeStep): void => {
    setProblem(null);
    setSaveProblem(null);
    setStep(s);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
    AccessibilityInfo.announceForAccessibility(`${stepLabel(s)}. ${STEP_TEXT[s].title}`);
  };

  // Android back walks back through the steps; on the first step it leaves as usual.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      const prev = previousStep(step);
      if (prev == null || useOnboarding.getState().busy) return false;
      goTo(prev);
      return true;
    });
    return () => sub.remove();
    // goTo only touches setters and refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const onNext = (): void => {
    const p = stepProblem(step, draft, units);
    if (p) {
      showProblem(p);
      return;
    }
    goTo(nextStep(step));
  };

  const onStart = async (): Promise<void> => {
    if (busy) return;
    const p = stepProblem(2, draft, units);
    if (p) {
      showProblem(p);
      return;
    }
    const result = validateOnboarding(draft, units ?? 'metric');
    if (!result.ok) {
      // Only reachable for an answer on an earlier step: go there and point at it.
      const back = stepOf(result.field);
      if (back !== step) goTo(back);
      showProblem({ field: welcomeFieldOf(result.field), message: result.message });
      return;
    }
    setSaveProblem(null);
    try {
      await complete(result.value);
      success();
    } catch {
      thud();
      // Spoken once, by InlineError's own announcement when the line appears.
      setSaveProblem('Could not save your details. Please try again.');
    }
  };

  const onLoadDemo = (): void => {
    if (busy) return;
    setSaveProblem(null);
    setAskDemo(true);
  };

  const confirmDemo = (): void => {
    setAskDemo(false);
    if (useOnboarding.getState().busy) return; // re-check: the sheet sat open
    // A "From Hevy / Strong" pick is for starting with their own history, not the demo.
    choosePendingImport(null);
    void loadDemo().catch(() => {
      thud();
      setSaveProblem('Could not load the demo. Please try again.');
    });
  };

  const demoBody =
    kept > 0
      ? `Fills the app with a sample member and 13 weeks of made-up training, for showing ForgeAI off. Your ${kept} workout${kept === 1 ? '' : 's'} on this phone ${kept === 1 ? 'is' : 'are'} deleted.`
      : 'Fills the app with a sample member and 13 weeks of made-up training, for showing ForgeAI off. You can remove it any time.';

  const text = STEP_TEXT[step];

  return (
    <Screen scroll={false}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView
          ref={scrollRef}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: space.xxl + insets.bottom }}
        >
          {/* ---------------------------------------------------------------- header */}
          <View style={{ marginBottom: space.xl }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 48 }}>
              {step > 0 ? (
                <IconButton icon="chevron-left" size={48} accessibilityLabel="Back" onPress={() => goTo(previousStep(step) ?? 0)} />
              ) : (
                <Logo height={26} />
              )}
              <View style={{ flex: 1 }} />
              <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.caption, color: color.inkMuted }}>{stepLabel(step)}</Text>
            </View>
            {/* Three bars: done and current lit (the step label above says the same in words). */}
            <View
              style={{ flexDirection: 'row', gap: space.xs, marginTop: space.md }}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              {Array.from({ length: WELCOME_STEP_COUNT }, (_, i) => (
                <View
                  key={i}
                  style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i <= step ? color.accent : color.border }}
                />
              ))}
            </View>
            <Text
              accessibilityRole="header"
              style={{ fontFamily: type.display, fontSize: type.size.h1, color: color.ink, letterSpacing: -0.5, marginTop: space.lg }}
            >
              {text.title}
            </Text>
            <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.sub, color: color.inkSecondary, marginTop: 4, lineHeight: 19 }}>
              {text.sub}
            </Text>
          </View>

          {/* ---------------------------------------------------------------- the step */}
          <Animated.View
            key={step}
            entering={FadeIn.duration(motion.base)}
            onLayout={(e) => {
              bodyY.current = e.nativeEvent.layout.y;
            }}
          >
            {step === 0 ? (
              <>
                <View onLayout={at('name')} style={{ marginBottom: space.lg }}>
                  <Text style={overline}>Your name</Text>
                  <TextInput
                    ref={nameRef}
                    value={draft.name}
                    onChangeText={(t) => patch({ name: t })}
                    placeholder="e.g. Rahul Sharma"
                    placeholderTextColor={color.inkMuted}
                    accessibilityLabel="Your name"
                    autoCapitalize="words"
                    autoCorrect={false}
                    autoComplete="name"
                    returnKeyType="next"
                    blurOnSubmit={false}
                    onSubmitEditing={() => phoneRef.current?.focus()}
                    maxLength={80}
                    style={[inputStyle, errFor('name') ? { borderColor: color.criticalText } : null]}
                  />
                  <FieldError message={errFor('name')} />
                </View>

                <View onLayout={at('phone')} style={{ marginBottom: space.lg }}>
                  <Text style={overline}>Mobile number · optional</Text>
                  <TextInput
                    ref={phoneRef}
                    value={draft.phone}
                    onChangeText={(t) => patch({ phone: t })}
                    placeholder="e.g. +91 98765 43210"
                    placeholderTextColor={color.inkMuted}
                    accessibilityLabel="Mobile number, optional"
                    keyboardType="phone-pad"
                    autoComplete="tel"
                    returnKeyType="done"
                    onSubmitEditing={onNext}
                    maxLength={24}
                    style={[inputStyle, errFor('phone') ? { borderColor: color.criticalText } : null]}
                  />
                  <FieldError message={errFor('phone')} />
                  <Hint>Any country. Only for your gym, once you link one. Add or remove it any time in Profile.</Hint>
                </View>

                {kept > 0 ? (
                  <Text style={{ fontFamily: type.body, fontSize: type.size.sub, color: color.inkSecondary, marginBottom: space.lg, lineHeight: 19 }}>
                    Your {kept} workout{kept === 1 ? ' is' : 's are'} still here. Add your details to carry on.
                  </Text>
                ) : null}

                <PrimaryButton label="Next" onPress={onNext} />

                <View style={{ marginTop: space.xl }}>
                  <SwitcherCard onPick={pickSwitch} selected={switchApp} later />
                </View>

                <Pressable
                  onPress={onLoadDemo}
                  accessibilityRole="button"
                  accessibilityLabel="Load demo data instead"
                  style={({ pressed }) => ({
                    minHeight: 48,
                    marginTop: space.lg,
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: pressed ? 0.6 : 1,
                  })}
                >
                  <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: color.inkSecondary, textDecorationLine: 'underline' }}>
                    Load demo data instead
                  </Text>
                </Pressable>
                <InlineError message={saveProblem} />
                <Text
                  style={{
                    fontFamily: type.body,
                    fontSize: type.size.caption,
                    color: color.inkMuted,
                    textAlign: 'center',
                    marginTop: space.sm,
                    lineHeight: 17,
                  }}
                >
                  Everything stays on this phone and works offline.
                </Text>
              </>
            ) : null}

            {step === 1 ? (
              <>
                <View onLayout={at('units')} style={{ marginBottom: space.xl }}>
                  <RadioList
                    options={UNIT_OPTIONS}
                    selectedId={units}
                    invalid={errFor('units') != null}
                    onSelect={(u) => {
                      setPickedUnits(u);
                      setUnits(u);
                      setProblem(null);
                    }}
                  />
                  <FieldError message={errFor('units')} />
                </View>
                <PrimaryButton label="Next" onPress={onNext} />
              </>
            ) : null}

            {step === 2 ? (
              <>
                <View onLayout={at('goal')} style={{ marginBottom: space.xl }}>
                  <Text style={overline} accessibilityRole="header">
                    Your goal
                  </Text>
                  <RadioList
                    options={GOAL_OPTIONS}
                    selectedId={draft.goal}
                    invalid={errFor('goal') != null}
                    onSelect={(goal) => patch({ goal })}
                  />
                  <FieldError message={errFor('goal')} />
                </View>
                <View onLayout={at('experience')} style={{ marginBottom: space.xl }}>
                  <Text style={overline} accessibilityRole="header">
                    Experience
                  </Text>
                  <RadioList
                    options={EXPERIENCE_OPTIONS}
                    selectedId={draft.experience}
                    invalid={errFor('experience') != null}
                    onSelect={(experience) => patch({ experience })}
                  />
                  <FieldError message={errFor('experience')} />
                </View>
                {switchApp ? (
                  <Text style={{ fontFamily: type.body, fontSize: type.size.sub, color: color.inkSecondary, marginBottom: space.md, lineHeight: 19 }}>
                    Your {switchApp === 'hevy' ? 'Hevy' : 'Strong'} workouts and routines come in right after you start.
                  </Text>
                ) : null}
                <PrimaryButton
                  label={busy ? 'Setting up…' : 'Start training'}
                  icon="dumbbell"
                  loading={busy}
                  onPress={() => void onStart()}
                />
                <View style={{ marginTop: space.md }}>
                  <InlineError message={saveProblem} />
                </View>
              </>
            ) : null}
          </Animated.View>
        </ScrollView>
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
