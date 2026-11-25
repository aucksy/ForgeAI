/**
 * F237 (owner, 25 Nov 2026, R-627): Settings → "Backup and restore" → "Continue with your phone number". The member
 * types their number, WhatsApp opens with a ready message to MettleUp (the same live 'member' check as the welcome;
 * they send it, we send nothing), and the proven number signs in to their MettleUp account: from then on the
 * workouts are saved by themselves. The first name is the profile's (the recycled-number rule: see migration 0099).
 * Used by AccountCard (not signed in, or "sign in again"). Shared code: Android and iPhone alike.
 */
import { mobileInput } from '@forgeai/theme';
import { useEffect, useRef, useState } from 'react';
import { AppState, Linking, Text, TextInput, View } from 'react-native';

import { PHONE_ACCOUNT_WORDS } from '@/cloud/phoneAccount';
import { GhostButton, PrimaryButton } from '@/components/ui';
import { InlineError } from '@/components/ui/InlineError';
import { success, warn } from '@/lib/haptics';
import { SIGN_IN, SIGN_IN_PHONE_ERROR } from '@/onboarding/phoneSignIn';
import { checkProblemWords, firstNameOf, mobile10, showWaNumber, stateWords, whatsAppLink, type CheckStart } from '@/shop/findGym';
import { checkStatus, startCheck } from '@/shop/findGymApi';
import { useAccount } from '@/store/accountStore';
import { color, radius, space, type } from '@/theme/tokens';

const POLL_MS = 3000;

async function profileFirstName(): Promise<string> {
  try {
    const { getProfile } = await import('@/db/repos/userRepo');
    return firstNameOf((await getProfile()).name);
  } catch (e) {
    console.warn('[phone backup] could not read the profile name', e);
    return '';
  }
}

export function PhoneBackup({ before }: { before?: () => Promise<boolean> }) {
  const busy = useAccount((s) => s.busy);
  const [phone, setPhone] = useState('');
  const [start, setStart] = useState<CheckStart | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const asking = useRef(false);
  const typed = useRef('');
  typed.current = phone;

  const go = async (): Promise<void> => {
    if (starting || busy) return;
    const mobile = mobile10(phone);
    if (!mobile) return setError(SIGN_IN_PHONE_ERROR);
    if (before && !(await before())) return;
    setStarting(true);
    setError(null);
    try {
      const r = await startCheck(mobile);
      if (!r.ok) {
        warn();
        return setError(checkProblemWords(r.problem));
      }
      setStart(r.start);
      openWhatsApp(r.start);
    } finally {
      setStarting(false);
    }
  };

  // Waiting for the member's message: ask every few seconds while the app is open, and at once when it comes back.
  useEffect(() => {
    if (!start) return;
    let live = true;
    const look = async (): Promise<void> => {
      if (asking.current || !live) return;
      asking.current = true;
      try {
        const s = await checkStatus(start.id);
        if (!live || !s) return;
        if (s.state === 'verified' && s.proof) {
          live = false;
          const mobile = mobile10(typed.current) ?? '';
          const r = await useAccount.getState().signIn({ phone: { proof: s.proof, firstName: await profileFirstName(), mobile10: mobile } });
          setStart(null);
          if (r.kind === 'signed-in') success();
          else if (r.kind === 'error') {
            warn();
            setError(r.words);
          }
          return;
        }
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
  }, [start]);

  const small = { fontFamily: type.body, fontSize: type.size.caption, lineHeight: 17, color: color.inkMuted } as const;
  const body = { fontFamily: type.body, fontSize: type.size.sub, lineHeight: 20, color: color.inkSecondary } as const;
  const label = { fontFamily: type.bodySemi, fontSize: type.size.sub, lineHeight: 20, color: color.inkSecondary } as const;

  if (start) {
    return (
      <View style={{ gap: space.sm }} testID="phone-backup-waiting">
        <Text accessibilityRole="header" style={{ fontFamily: type.bodySemi, fontSize: type.size.body, color: color.ink }}>
          {SIGN_IN.waitingTitle}
        </Text>
        <Text style={body}>{busy ? PHONE_ACCOUNT_WORDS.saving : PHONE_ACCOUNT_WORDS.waitingBody}</Text>
        <Text style={small}>{`To ${showWaNumber(start.waNumber)}: MettleUp code ${start.code}`}</Text>
        <InlineError message={error} />
        <PrimaryButton label={SIGN_IN.openWhatsApp} loading={busy} onPress={() => openWhatsApp(start)} />
        <GhostButton
          label={SIGN_IN.startAgain}
          onPress={() => {
            setError(null);
            setStart(null);
          }}
        />
      </View>
    );
  }

  return (
    <View style={{ gap: space.sm }} testID="phone-backup">
      <Text style={label}>{SIGN_IN.phoneLabel}</Text>
      <TextInput
        value={phone}
        onChangeText={(t) => {
          setPhone(mobileInput(phone, t));
          setError(null);
        }}
        keyboardType="phone-pad"
        autoComplete="tel-national"
        textContentType="telephoneNumber"
        placeholder={SIGN_IN.phoneHint}
        placeholderTextColor={color.inkFaint}
        accessibilityLabel={SIGN_IN.phoneLabel}
        testID="phone-backup-number"
        style={{
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
        }}
      />
      <InlineError message={error} />
      <PrimaryButton label={PHONE_ACCOUNT_WORDS.phoneButton} icon="person" loading={starting || busy} onPress={() => void go()} />
      <Text style={small}>{PHONE_ACCOUNT_WORDS.how}</Text>
    </View>
  );
}

function openWhatsApp(start: CheckStart): void {
  Linking.openURL(whatsAppLink(start)).catch((e: unknown) => console.warn('[phone backup] WhatsApp did not open', e));
}
