/**
 * Settings → Backup → "Keep your workouts on ForgeAI" (tracker #50, owner 24 Oct 2026): sign in with
 * Google, see that the copy is up to date (or what is waiting for the internet), bring the copy back,
 * sign out, or delete the account. Hidden until the build can sign in (account.ts), so nothing here
 * promises a copy that does not exist. Google Drive backup stays below it as an extra copy.
 * R-106: for gym members only (cloud/accountGate.ts); a member without a gym sees Drive backup alone.
 */
import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { Text, View } from 'react-native';

import { accountOffered } from '@/cloud/accountGate';
import { ACCOUNT_WORDS, copyStatusLine } from '@/cloud/accountWords';
import { askConfirm, Card, GhostButton, PrimaryButton } from '@/components/ui';
import { clockTime, tinyDateWithYear, toISO } from '@/lib/date';
import { success, warn } from '@/lib/haptics';
import { useGymShop } from '@/shop/gymStore';
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

  useFocusEffect(
    useCallback(() => {
      void useAccount.getState().init().catch((e: unknown) => console.warn('[account card] could not read the account', e));
    }, []),
  );

  if (!accountOffered({ configured, inGym, signedIn: account != null })) return null;

  const signIn = async (): Promise<void> => {
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
          {status?.needsSignIn ? <PrimaryButton label={ACCOUNT_WORDS.signIn} icon="person" loading={busy} onPress={() => void signIn()} /> : null}
          <GhostButton label={ACCOUNT_WORDS.bringBack} icon="import" onPress={() => void useAccount.getState().bringBack()} />
          <GhostButton label={ACCOUNT_WORDS.signOut} onPress={() => void signOut()} />
          <GhostButton label={ACCOUNT_WORDS.deleteAccount} icon="trash" onPress={() => void remove()} />
        </View>
      ) : (
        <View style={{ gap: space.md, marginTop: space.xs }}>
          <Text style={body()}>{ACCOUNT_WORDS.cardBody}</Text>
          <Text style={{ ...body(), fontSize: type.size.caption, color: color.inkMuted }}>{ACCOUNT_WORDS.privacy}</Text>
          <PrimaryButton label={ACCOUNT_WORDS.signIn} icon="person" loading={busy} onPress={() => void signIn()} />
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
