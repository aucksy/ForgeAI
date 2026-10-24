/**
 * "Continue with Google" on the welcome screen (tracker #43 A / #50): a member who used ForgeAI
 * before signs in and gets their workouts back on this phone. With a kept profile the app opens at
 * once as theirs; without one, the name is filled in and the 3 steps go on as usual.
 *
 * Shown only when the build can sign in (a real Google client id and the server: account.ts), and
 * (R-106: the server copy is for gym members) only once a gym code waits to be joined, or this phone
 * is already in a gym (cloud/accountGate.ts). "Next" (use without an account) and "Have a gym code?
 * Join your gym" work exactly as before.
 */
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { accountOffered } from '@/cloud/accountGate';
import { ACCOUNT_WORDS } from '@/cloud/accountWords';
import { GhostButton } from '@/components/ui';
import { InlineError } from '@/components/ui/InlineError';
import { success, thud } from '@/lib/haptics';
import { useGymShop } from '@/shop/gymStore';
import { useAccount } from '@/store/accountStore';
import { color, space, type } from '@/theme/tokens';

export function WelcomeGoogle({ onName, gymCodeWaiting }: { onName: (name: string) => void; gymCodeWaiting: boolean }) {
  const configured = useAccount((s) => s.configured);
  const inGym = useGymShop((s) => s.link != null);
  const ready = useAccount((s) => s.ready);
  const busy = useAccount((s) => s.busy);
  const [line, setLine] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) void useAccount.getState().init().catch((e: unknown) => console.warn('[welcome] account check failed', e));
  }, [ready]);

  if (!accountOffered({ configured, inGym, gymCodeWaiting })) return null;

  const go = async (): Promise<void> => {
    if (busy) return;
    setError(null);
    const r = await useAccount.getState().signIn({ fromWelcome: true });
    if (r.kind === 'cancelled') return;
    if (r.kind === 'error') {
      thud();
      setError(r.words);
      return;
    }
    success();
    if (r.name) onName(r.name);
    setLine(r.note);
  };

  return (
    <View style={{ gap: space.sm }}>
      <Text style={{ fontFamily: type.body, fontSize: type.size.sub, color: color.inkSecondary, textAlign: 'center', lineHeight: 19 }}>
        {ACCOUNT_WORDS.welcomeAsk}
      </Text>
      <GhostButton label={busy ? 'Signing in…' : ACCOUNT_WORDS.signIn} icon="person" onPress={() => void go()} />
      {line ? (
        <Text accessibilityLiveRegion="polite" style={{ fontFamily: type.bodyMedium, fontSize: type.size.sub, color: color.ink, lineHeight: 19 }}>
          {line}
        </Text>
      ) : null}
      <InlineError message={error} />
    </View>
  );
}
