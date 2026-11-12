/**
 * "Find my gym" (R-458 + F56 R-461, owner 12 Nov 2026): the member proves their number with WhatsApp (they send
 * one message from their own phone; we send nothing), and the app shows the MettleUp gym that has them on its
 * list with a plan running today: "You are a member of Iron Temple. Iron Temple gives you every MettleUp feature
 * free. Join through your gym" -> "Join Iron Temple" (the usual Join screen, which asks first). After the join the
 * same proof links the gym's list (findGymApi.claimIfJoined), so every paid feature opens at once.
 * Not found: "You can unlock every feature free if your gym uses MettleUp" -> "Tell my gym" (the member's own share
 * menu, a ready message with the link; the gym's name and city, if typed, go to MettleUp as a lead, never the
 * member's number) or "Skip".
 * Opened from the Gym tab's no-gym screen and from MettleUp Plus -> "Find my gym". QA builds with the 'memberPlan'
 * stand-in can answer without WhatsApp (mettleup://qa-plan?find=found|none, said on screen).
 * Shared code: Android and iPhone alike (WhatsApp opens the same way on both).
 */
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Linking, Share, Text, TextInput, View } from 'react-native';

import { Card, GhostButton, PrimaryButton, Screen } from '@/components/ui';
import { InlineError } from '@/components/ui/InlineError';
import { getProfile } from '@/db/repos/userRepo';
import { tinyDateWithYear, todayISO } from '@/lib/date';
import { goBack } from '@/lib/goBack';
import { getMemberPhone } from '@/onboarding/db/dataActions';
import {
  checkProblemWords,
  FIND_GYM,
  FIND_NAME_ERROR,
  FIND_PHONE_ERROR,
  findProblemWords,
  firstNameOf,
  leadFrom,
  mobile10,
  showWaNumber,
  stateWords,
  tellGymMessage,
  whatsAppLink,
  type CheckStart,
  type FoundGym,
} from '@/shop/findGym';
import { checkStatus, findGyms, qaFindAnswer, rememberFound, sendGymLead, startCheck } from '@/shop/findGymApi';
import { color, radius, space, type } from '@/theme/tokens';

type Step = { kind: 'form' } | { kind: 'waiting'; start: CheckStart } | { kind: 'checking' } | { kind: 'found'; gyms: FoundGym[]; proof: string } | { kind: 'none' };

const POLL_MS = 3000;

/** The Gym tab's box look (as ShopParts.shopInputStyle; not imported so this page pulls in no shop words). */
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

export default function FindGymScreen() {
  const router = useRouter();
  const [step, setStep] = useState<Step>({ kind: 'form' });
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [qa, setQa] = useState(false);
  const [gymName, setGymName] = useState('');
  const [city, setCity] = useState('');
  const asking = useRef(false);

  // The number and first name the member already gave the app (both can be changed here).
  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const [p, prof] = await Promise.all([getMemberPhone().catch(() => null), getProfile().catch(() => null)]);
        if (!live) return;
        if (p) setPhone((now) => now || p);
        const first = firstNameOf(prof?.name);
        if (first) setName((now) => now || first);
      } catch (e) {
        console.warn('[find-gym] could not read the profile', e);
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  const search = useCallback(async (proof: string, first: string): Promise<void> => {
    setStep({ kind: 'checking' });
    const a = await findGyms(proof, first);
    if (!a.ok) {
      setError(findProblemWords(a.problem));
      setStep({ kind: 'form' });
      return;
    }
    setError(null);
    setStep(a.gyms.length > 0 ? { kind: 'found', gyms: a.gyms, proof } : { kind: 'none' });
  }, []);

  const go = async (): Promise<void> => {
    if (busy) return;
    const mobile = mobile10(phone);
    if (!mobile) return setError(FIND_PHONE_ERROR);
    const first = firstNameOf(name);
    if (!first) return setError(FIND_NAME_ERROR);
    setBusy(true);
    setError(null);
    try {
      const stand = qaFindAnswer();
      if (stand) {
        setQa(true);
        setStep(stand.gyms.length > 0 ? { kind: 'found', gyms: stand.gyms, proof: 'qa' } : { kind: 'none' });
        return;
      }
      const r = await startCheck(mobile);
      if (!r.ok) return setError(checkProblemWords(r.problem));
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
        if (s.state === 'verified') {
          // The proof was handed out already (another screen took it): start again.
          setError(stateWords('expired'));
          return;
        }
        setError(stateWords(s.state, s.hint));
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

  const join = (proof: string, gym: FoundGym): void => {
    if (proof !== 'qa') rememberFound(proof, gym);
    router.push(`/j/${gym.joinCode}`);
  };

  const tell = (): void => {
    const lead = leadFrom(gymName, city);
    if (lead && !qa) void sendGymLead(lead);
    Share.share({ message: tellGymMessage(gymName) }).catch((e: unknown) => console.warn('[find-gym] share did not open', e));
  };

  const restart = (): void => {
    setError(null);
    setStep({ kind: 'form' });
  };

  const body = { fontFamily: type.body, fontSize: type.size.sub, lineHeight: 20, color: color.inkSecondary } as const;
  const small = { fontFamily: type.body, fontSize: type.size.caption, lineHeight: 17, color: color.inkMuted } as const;
  const heading = { fontFamily: type.bodySemi, fontSize: type.size.body, color: color.ink } as const;

  return (
    <Screen title={FIND_GYM.title} onBack={() => goBack(router, '/shop')}>
      <View style={{ gap: space.lg, paddingBottom: space.xxl }} testID="find-gym-screen">
        {qa ? <Text style={{ ...body, fontFamily: type.bodySemi, color: color.accent }}>{FIND_GYM.testBuild}</Text> : null}

        {step.kind === 'form' ? (
          <Card style={{ gap: space.sm }}>
            <Text style={body}>{FIND_GYM.intro}</Text>
            <TextInput
              value={phone}
              onChangeText={(t) => {
                setPhone(t);
                setError(null);
              }}
              keyboardType="phone-pad"
              autoComplete="tel"
              textContentType="telephoneNumber"
              maxLength={16}
              placeholder={FIND_GYM.phoneLabel}
              placeholderTextColor={color.inkFaint}
              accessibilityLabel={FIND_GYM.phoneLabel}
              testID="find-gym-phone"
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
              placeholder={FIND_GYM.nameLabel}
              placeholderTextColor={color.inkFaint}
              accessibilityLabel={FIND_GYM.nameLabel}
              testID="find-gym-name"
              style={inputStyle()}
            />
            <InlineError message={error} />
            <PrimaryButton label={FIND_GYM.go} loading={busy} onPress={() => void go()} />
            <Text style={small}>{FIND_GYM.how}</Text>
            <Text style={small}>{FIND_GYM.privacy}</Text>
          </Card>
        ) : null}

        {step.kind === 'waiting' ? (
          <Card style={{ gap: space.sm }}>
            <Text accessibilityRole="header" style={heading}>
              {FIND_GYM.waitingTitle}
            </Text>
            <Text style={body}>{FIND_GYM.waitingBody}</Text>
            <Text style={small}>{`To ${showWaNumber(step.start.waNumber)}: MettleUp code ${step.start.code}`}</Text>
            <InlineError message={error} />
            <PrimaryButton label={FIND_GYM.openWhatsApp} onPress={() => openWhatsApp(step.start)} />
            <GhostButton label={FIND_GYM.startAgain} onPress={restart} />
          </Card>
        ) : null}

        {step.kind === 'checking' ? <Text style={body}>{FIND_GYM.checking}</Text> : null}

        {step.kind === 'found'
          ? step.gyms.map((g) => (
              <Card key={g.gymId} style={{ gap: space.sm }}>
                <Text accessibilityRole="header" style={heading}>
                  {FIND_GYM.foundTitle(g.gymName)}
                </Text>
                <Text style={body}>{FIND_GYM.foundBody(g.gymName)}</Text>
                <Text style={small}>{g.pass ? FIND_GYM.foundPass : g.endsOn ? FIND_GYM.foundEnds(tinyDateWithYear(g.endsOn, todayISO())) : ''}</Text>
                <PrimaryButton label={FIND_GYM.join(g.gymName)} onPress={() => join(step.proof, g)} />
              </Card>
            ))
          : null}

        {step.kind === 'none' ? (
          <Card style={{ gap: space.sm }}>
            <Text accessibilityRole="header" style={heading}>
              {FIND_GYM.notFoundTitle}
            </Text>
            <Text style={body}>{FIND_GYM.notFoundBody}</Text>
            <Text style={small}>{FIND_GYM.notFoundWhy}</Text>
            <TextInput
              value={gymName}
              onChangeText={setGymName}
              autoCapitalize="words"
              maxLength={80}
              placeholder={FIND_GYM.gymNameLabel}
              placeholderTextColor={color.inkFaint}
              accessibilityLabel={FIND_GYM.gymNameLabel}
              style={inputStyle()}
            />
            <TextInput
              value={city}
              onChangeText={setCity}
              autoCapitalize="words"
              maxLength={40}
              placeholder={FIND_GYM.cityLabel}
              placeholderTextColor={color.inkFaint}
              accessibilityLabel={FIND_GYM.cityLabel}
              style={inputStyle()}
            />
            <Text style={small}>{FIND_GYM.leadNote}</Text>
            <PrimaryButton label={FIND_GYM.tell} onPress={tell} />
            <GhostButton label={FIND_GYM.skip} onPress={() => goBack(router, '/shop')} />
          </Card>
        ) : null}
      </View>
    </Screen>
  );
}

function openWhatsApp(start: CheckStart): void {
  Linking.openURL(whatsAppLink(start)).catch((e: unknown) => console.warn('[find-gym] WhatsApp did not open', e));
}
