/**
 * Settings → Backup and restore → "Keep your workouts on MettleUp" (tracker #50, owner 24 Oct 2026): sign in with
 * Google, see that the copy is up to date (or what is waiting for the internet), bring the copy back,
 * sign out, or delete the account. Hidden until the build can sign in (account.ts), so nothing here
 * promises a copy that does not exist. Google Drive backup stays below it as an extra copy.
 * R-320: offered to every member (cloud/accountGate.ts).
 * D7 (owner, 10 Nov 2026): "Continue with Google" waits for the same 18+ / terms box as a gym join, shown
 * above it until it has been ticked once on this phone (shop/useTermsAgreement.ts).
 */
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';

import { accountOffered } from '@/cloud/accountGate';
import { ACCOUNT_WORDS, copyStatusLine } from '@/cloud/accountWords';
import { askConfirm, Card, GhostButton, PrimaryButton } from '@/components/ui';
import { InlineError } from '@/components/ui/InlineError';
import { clockTime, tinyDateWithYear, toISO } from '@/lib/date';
import { success, warn } from '@/lib/haptics';
import { useGymShop } from '@/shop/gymStore';
import { JoinAgreement } from '@/shop/JoinAgreement';
import { useTermsAgreement } from '@/shop/useTermsAgreement';
import { useAccount } from '@/store/accountStore';
import { color, space, type } from '@/theme/tokens';

const body = () => ({ fontFamily: type.body, fontSize: type.size.sub, color: color.inkSecondary, lineHeight: 19 }) as const;

export function AccountCard() {
  const configured = useAccount((s) => s.configured);
  const account = useAccount((s) => s.account);
  const status = useAccount((s) => s.status);
  const busy = useAccount((s) => s.busy);
  const note = useAccount((s) => s.note);
  const inGym = useGymShop((s) => s.link != null);
  // D7: 18 or older + the terms, ticked before Google's sign-in (remembered once given).
  const agreement = useTermsAgreement();
  const [notAgreed, setNotAgreed] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      void useAccount.getState().init().catch((e: unknown) => console.warn('[account card] could not read the account', e));
    }, []),
  );

  if (!accountOffered({ configured, inGym, signedIn: account != null })) return null;

  const signIn = async (): Promise<void> => {
    if (busy) return;
    const words = await agreement.check();
    setNotAgreed(words);
    if (words) {
      warn();
      return;
    }
    const r = await useAccount.getState().signIn();
    if (r.kind === 'signed-in') success();
    else if (r.kind === 'error') warn();
  };
  const signOut = async (): Promise<void> => {
    if (!(await askConfirm({ title: ACCOUNT_WORDS.signOutTitle, body: ACCOUNT_WORDS.signOutBody, confirmLabel: ACCOUNT_WORDS.signOut }))) return;
    await useAccount.getState().signOut();
  };
  const remove = async (): Promise<void> => {
    if (!(await askConfirm({ title: ACCOUNT_WORDS.deleteTitle, body: ACCOUNT_WORDS.deleteBody, confirmLabel: ACCOUNT_WORDS.deleteConfirm, destructive: true }))) return;
    await useAccount.getState().deleteAccount();
  };

  // D7: the box above "Continue with Google", until it has been ticked once on this phone.
  const tickBox = agreement.ask ? (
    <JoinAgreement
      agreed={agreement.ticked}
      onChange={(v) => {
        agreement.tick(v);
        setNotAgreed(null);
      }}
    />
  ) : null;

  return (
    <Card>
      <Text accessibilityRole="header" style={{ fontFamily: type.heading, fontSize: type.size.h3, color: color.ink }}>
        {ACCOUNT_WORDS.cardTitle}
      </Text>
      {account ? (
        <View style={{ gap: space.sm, marginTop: space.xs }}>
          <Text style={{ ...body(), color: color.ink }}>{ACCOUNT_WORDS.signedInAs(account.email)}</Text>
          <Text accessibilityLiveRegion="polite" style={body()}>
            {copyStatusLine(status, (ms) => `${tinyDateWithYear(toISO(new Date(ms)))}, ${clockTime(ms)}`)}
          </Text>
          <Text style={{ ...body(), fontSize: type.size.caption, color: color.inkMuted }}>{ACCOUNT_WORDS.privacy}</Text>
          {status?.needsSignIn ? (
            <>
              {tickBox}
              <PrimaryButton label={ACCOUNT_WORDS.signIn} icon="person" loading={busy} onPress={() => void signIn()} />
              <InlineError message={notAgreed} />
            </>
          ) : null}
          <GhostButton label={ACCOUNT_WORDS.bringBack} icon="import" onPress={() => void useAccount.getState().bringBack()} />
          <GhostButton label={ACCOUNT_WORDS.signOut} onPress={() => void signOut()} />
          <GhostButton label={ACCOUNT_WORDS.deleteAccount} icon="trash" onPress={() => void remove()} />
        </View>
      ) : (
        <View style={{ gap: space.md, marginTop: space.xs }}>
          <Text style={body()}>{ACCOUNT_WORDS.cardBody}</Text>
          <Text style={{ ...body(), fontSize: type.size.caption, color: color.inkMuted }}>{ACCOUNT_WORDS.privacy}</Text>
          {tickBox}
          <PrimaryButton label={ACCOUNT_WORDS.signIn} icon="person" loading={busy} onPress={() => void signIn()} />
          <InlineError message={notAgreed} />
        </View>
      )}
      {note ? (
        <Text accessibilityLiveRegion="polite" style={{ ...body(), color: color.ink, marginTop: space.md }}>
          {busy ? '' : note}
        </Text>
      ) : null}
    </Card>
  );
}
