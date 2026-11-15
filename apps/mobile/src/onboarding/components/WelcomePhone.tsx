/**
 * F203 (owner, 14 Nov 2026, R-493): the welcome's "Continue with your phone number" screen body. The member types
 * their number and first name and taps "Check with WhatsApp": WhatsApp opens with a ready message to MettleUp's
 * number (the live 'member' check; they send it, we send nothing). Back in the app, it waits for the message, then
 * asks the gym server who this proven number is (0093): "We found you: trainer at Iron Gym." with "Join Iron Gym",
 * or a short list when several gyms know it. "Join <gym>" hands the pick to the welcome (onPicked), which keeps the
 * gym's code exactly as "Join my gym" does and goes on to the 3 setup questions; the gym's join screen opens after.
 * Not found: "Set up the app" (as "Use without an account") or "Try another number". Skip: back to the first screen.
 * R-587 (owner, 15 Nov 2026): a MEMBER the gym knows goes straight into the gym (phoneSignInApi.goStraightIn): one
 * gym found as a member = no tap at all; several gyms = the member's tap on that gym joins it at once. No 3 setup
 * questions, no gym join screen. The gym's own people (owner, trainer, desk) keep "Join <gym>" and the old path. So
 * the join can happen here, the "I'm 18 or older ... terms" box (shop/JoinAgreement) sits above "Check with
 * WhatsApp" until it was ticked once on this phone (the same saved tick as Continue with Google).
 * QA builds with the 'phoneSignIn' stand-in answer at once with the made-up result a qa-signin link set (said on
 * screen). Shared code: Android and iPhone alike (WhatsApp opens the same way on both).
 */
import { Image } from 'expo-image';
import { useCallback, useEffect, useRef, useState } from 'react';
import { mobileInput } from '@forgeai/theme';
import { ActivityIndicator, AppState, Linking, Text, TextInput, View } from 'react-native';

import { pictureUrl } from '@/cloud/picture';
import { Card, GhostButton, PrimaryButton } from '@/components/ui';
import { InlineError } from '@/components/ui/InlineError';
import { tinyDateWithYear, todayISO } from '@/lib/date';
import { useMemberAccess } from '@/plan/memberPlanStore';
import { firstNameOf, mobile10, showWaNumber, stateWords, whatsAppLink, type CheckStart } from '@/shop/findGym';
import { checkStatus, startCheck } from '@/shop/findGymApi';
import { gymInitial } from '@/shop/gym';
import { JoinAgreement } from '@/shop/JoinAgreement';
import { useTermsAgreement } from '@/shop/useTermsAgreement';
import { color, radius, space, type } from '@/theme/tokens';

import {
  goesStraightIn,
  foundBody,
  foundLine,
  plusLine,
  severalLine,
  SIGN_IN,
  SIGN_IN_NAME_ERROR,
  SIGN_IN_PHONE_ERROR,
  signInFindWords,
  signInProblemWords,
  straightInMatch,
  type SignInMatch,
} from '../phoneSignIn';
import { findMe, goStraightIn, notePicked, qaSignInAnswer } from '../phoneSignInApi';

type Step =
  | { kind: 'form' }
  | { kind: 'waiting'; start: CheckStart }
  | { kind: 'checking' }
  | { kind: 'found'; matches: SignInMatch[]; proof: string | null }
  | { kind: 'entering'; gymName: string }
  | { kind: 'none' };

const POLL_MS = 3000;

/** Read when drawn: gym branding repaints the tokens. */
const inputStyle = () =>
  ({
    backgroundColor: color.surfaceSunken,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    minHeight: 48,
    color: color.ink,
    fontFamily: type.bodyMedium,
    fontSize: type.size.body,
  }) as const;

export function WelcomePhone({
  initialName,
  onPicked,
  onSetUp,
  onSteps,
  onSkip,
}: {
  /** The name the welcome already has (Google, or typed), so the box starts filled. */
  initialName: string;
  /** "Join <gym>": the welcome keeps the gym's code and goes on to the setup questions. */
  onPicked: (m: SignInMatch, firstName: string) => void;
  /** "Set up the app" after nothing was found: the setup questions, as "Use without an account". */
  onSetUp: () => void;
  /** R-587: a member went straight into the gym but the setup could not be saved: the 3 questions (name filled). */
  onSteps: (firstName: string) => void;
  onSkip: () => void;
}) {
  const [step, setStep] = useState<Step>({ kind: 'form' });
  const [phone, setPhone] = useState('');
  const [name, setName] = useState(() => firstNameOf(initialName));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [qa, setQa] = useState(false);
  const asking = useRef(false);
  const plusOn = useMemberAccess().why !== 'off';
  const agreement = useTermsAgreement();
  // Read when the gym answers (a change of the boxes while waiting is fine).
  const typed = useRef({ phone: '', name: '' });
  typed.current = { phone, name };
  const stepsRef = useRef(onSteps);
  stepsRef.current = onSteps;

  /** R-587: a found member goes straight into the gym. Not joined: the card again, with why. */
  const enter = useCallback(
    async (m: SignInMatch, proof: string | null): Promise<void> => {
      const first = firstNameOf(typed.current.name);
      setError(null);
      setStep({ kind: 'entering', gymName: m.gymName });
      const r = await goStraightIn(m, first, mobile10(typed.current.phone) ?? '', proof);
      if (r === 'in') return;
      if (r === 'steps') {
        stepsRef.current(first);
        return;
      }
      setError(r.words);
      setStep({ kind: 'found', matches: [m], proof });
    },
    [],
  );

  const search = useCallback(async (proof: string, first: string): Promise<void> => {
    setStep({ kind: 'checking' });
    const a = await findMe(proof, first);
    if (!a.ok) {
      setError(signInFindWords(a.problem));
      setStep({ kind: 'form' });
      return;
    }
    setError(null);
    const straight = straightInMatch(a.matches);
    if (straight) {
      await enter(straight, proof);
      return;
    }
    setStep(a.matches.length > 0 ? { kind: 'found', matches: a.matches, proof } : { kind: 'none' });
  }, [enter]);

  const go = async (): Promise<void> => {
    if (busy) return;
    const mobile = mobile10(phone);
    if (!mobile) return setError(SIGN_IN_PHONE_ERROR);
    const first = firstNameOf(name);
    if (!first) return setError(SIGN_IN_NAME_ERROR);
    setBusy(true);
    setError(null);
    try {
      // R-587: a found member may be joined to the gym at once, so the 18+ and terms box comes first.
      const notAgreed = await agreement.check();
      if (notAgreed) return setError(notAgreed);
      const stand = qaSignInAnswer();
      if (stand) {
        setQa(true);
        const straight = straightInMatch(stand);
        if (straight) {
          await enter(straight, null);
          return;
        }
        setStep(stand.length > 0 ? { kind: 'found', matches: stand, proof: null } : { kind: 'none' });
        return;
      }
      const r = await startCheck(mobile);
      if (!r.ok) return setError(signInProblemWords(r.problem));
      setStep({ kind: 'waiting', start: r.start });
      openWhatsApp(r.start);
    } finally {
      setBusy(false);
    }
  };

  // Waiting for the member's message: ask every few seconds while the app is open, and at once when it comes back.
  const waiting = step.kind === 'waiting' ? step.start : null;
  useEffect(() => {
    if (!waiting) return;
    let live = true;
    const look = async (): Promise<void> => {
      if (asking.current || !live) return;
      asking.current = true;
      try {
        const s = await checkStatus(waiting.id);
        if (!live || !s) return;
        if (s.state === 'verified' && s.proof) {
          live = false;
          await search(s.proof, firstNameOf(name));
          return;
        }
        // Verified without a proof: another screen took it already. Start again.
        setError(s.state === 'verified' ? stateWords('expired') : stateWords(s.state, s.hint));
      } finally {
        asking.current = false;
      }
    };
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') void look();
    }, POLL_MS);
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') void look();
    });
    return () => {
      live = false;
      clearInterval(timer);
      sub.remove();
    };
    // `name` is read when the proof arrives; a change while waiting is fine.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waiting, search]);

  const pick = (m: SignInMatch, proof: string | null): void => {
    // R-587: a member's tap joins at once; the gym's own people go on to the setup and the gym's join screen.
    if (goesStraightIn(m)) {
      void enter(m, proof);
      return;
    }
    notePicked(m, proof);
    onPicked(m, firstNameOf(name));
  };

  const restart = (): void => {
    setError(null);
    setStep({ kind: 'form' });
  };

  const body = { fontFamily: type.body, fontSize: type.size.sub, lineHeight: 20, color: color.inkSecondary } as const;
  const small = { fontFamily: type.body, fontSize: type.size.caption, lineHeight: 17, color: color.inkMuted } as const;
  const heading = { fontFamily: type.bodySemi, fontSize: type.size.body, color: color.ink } as const;

  return (
    <View style={{ gap: space.lg }} testID="welcome-phone">
      {qa ? <Text style={{ ...body, fontFamily: type.bodySemi, color: color.accent }}>{SIGN_IN.testBuild}</Text> : null}

      {step.kind === 'form' ? (
        <Card style={{ gap: space.sm }}>
          <TextInput
            value={phone}
            onChangeText={(t) => {
              // R-580: the keyboard's own-number suggestion ("+91 98765 43210") becomes the 10 digits. No
              // maxLength: it cut a long autofill before this line saw it; mobileInput is the limit.
              setPhone(mobileInput(phone, t));
              setError(null);
            }}
            keyboardType="phone-pad"
            autoComplete="tel-national"
            textContentType="telephoneNumber"
            placeholder={SIGN_IN.phoneLabel}
            placeholderTextColor={color.inkFaint}
            accessibilityLabel={SIGN_IN.phoneLabel}
            testID="welcome-phone-number"
            style={inputStyle()}
          />
          <TextInput
            value={name}
            onChangeText={(t) => {
              setName(t);
              setError(null);
            }}
            autoCapitalize="words"
            autoComplete="name-given"
            maxLength={40}
            placeholder={SIGN_IN.nameLabel}
            placeholderTextColor={color.inkFaint}
            accessibilityLabel={SIGN_IN.nameLabel}
            testID="welcome-phone-name"
            style={inputStyle()}
          />
          {agreement.ask ? (
            <JoinAgreement
              agreed={agreement.ticked}
              onChange={(v) => {
                agreement.tick(v);
                setError(null);
              }}
            />
          ) : null}
          <InlineError message={error} />
          <PrimaryButton label={SIGN_IN.go} loading={busy} onPress={() => void go()} />
          <Text style={small}>{SIGN_IN.how}</Text>
          <Text style={small}>{SIGN_IN.privacy}</Text>
          <GhostButton label={SIGN_IN.skip} onPress={onSkip} />
        </Card>
      ) : null}

      {step.kind === 'waiting' ? (
        <Card style={{ gap: space.sm }}>
          <Text accessibilityRole="header" style={heading}>
            {SIGN_IN.waitingTitle}
          </Text>
          <Text style={body}>{SIGN_IN.waitingBody}</Text>
          <Text style={small}>{`To ${showWaNumber(step.start.waNumber)}: MettleUp code ${step.start.code}`}</Text>
          <InlineError message={error} />
          <PrimaryButton label={SIGN_IN.openWhatsApp} onPress={() => openWhatsApp(step.start)} />
          <GhostButton label={SIGN_IN.startAgain} onPress={restart} />
        </Card>
      ) : null}

      {step.kind === 'checking' ? <Text style={body}>{SIGN_IN.checking}</Text> : null}

      {step.kind === 'entering' ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }} accessibilityLiveRegion="polite">
          <ActivityIndicator color={color.accent} />
          <Text style={{ ...body, color: color.ink }}>{SIGN_IN.opening(step.gymName)}</Text>
        </View>
      ) : null}

      {step.kind === 'found' ? (
        <>
          {step.matches.length > 1 ? <Text style={{ ...body, color: color.ink }}>{severalLine(step.matches.length)}</Text> : null}
          <InlineError message={error} />
          {step.matches.map((m) => {
            const plus = plusLine(m, plusOn);
            const plan = m.role !== 'member' ? '' : m.pass ? SIGN_IN.pass : m.endsOn ? SIGN_IN.ends(tinyDateWithYear(m.endsOn, todayISO())) : '';
            return (
              <Card key={m.gymId} style={{ gap: space.sm }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                  <GymTile match={m} />
                  <Text accessibilityRole="header" style={{ ...heading, flex: 1 }}>
                    {foundLine(m)}
                  </Text>
                </View>
                <Text style={body}>{foundBody(m)}</Text>
                {plan ? <Text style={small}>{plan}</Text> : null}
                {plus ? <Text style={small}>{plus}</Text> : null}
                <PrimaryButton label={SIGN_IN.join(m.gymName)} onPress={() => pick(m, step.proof)} />
              </Card>
            );
          })}
          <GhostButton label={SIGN_IN.skip} onPress={onSkip} />
        </>
      ) : null}

      {step.kind === 'none' ? (
        <Card style={{ gap: space.sm }}>
          <Text accessibilityRole="header" style={heading}>
            {SIGN_IN.notFoundTitle}
          </Text>
          <Text style={body}>{SIGN_IN.notFoundBody}</Text>
          <PrimaryButton label={SIGN_IN.setUp} onPress={onSetUp} />
          <GhostButton label={SIGN_IN.tryAgain} onPress={restart} />
        </Card>
      ) : null}
    </View>
  );
}

/** The found gym's logo on its own background tone, or its first letter in its colour (as the join screen). */
function GymTile({ match }: { match: SignInMatch }) {
  const [failed, setFailed] = useState(false);
  const logo = match.brand?.logoUrl && !failed ? match.brand.logoUrl : null;
  return (
    <View
      style={{
        width: 48,
        height: 48,
        borderRadius: radius.md,
        backgroundColor: match.brand?.bg ?? color.surfaceSunken,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      {logo ? (
        <Image source={{ uri: pictureUrl(logo) }} contentFit="contain" style={{ width: 42, height: 42 }} onError={() => setFailed(true)} accessibilityIgnoresInvertColors />
      ) : (
        <Text style={{ fontFamily: type.display, fontSize: 22, color: match.brand?.accent ?? color.accent }}>{gymInitial(match.gymName)}</Text>
      )}
    </View>
  );
}

function openWhatsApp(start: CheckStart): void {
  Linking.openURL(whatsAppLink(start)).catch((e: unknown) => console.warn('[phone sign-in] WhatsApp did not open', e));
}
