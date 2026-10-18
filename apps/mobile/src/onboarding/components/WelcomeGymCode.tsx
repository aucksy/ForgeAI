/**
 * "Have a gym code? Join your gym" under Next on the welcome screen (OWNER-INBOX #11, decided
 * 18 Oct 2026). Folded to one line until tapped. The code is kept like a gym's invite link
 * (shop/pendingInvite.ts) and the gym's "Join <gym>" screen opens once setup is done (app/_layout.tsx),
 * where the member sees the gym and says yes. Nothing is joined here, and no internet is needed.
 */
import { useEffect, useState } from 'react';
import { AppState, Linking, Pressable, Text, TextInput, View } from 'react-native';

import { GhostButton, GlassCard } from '@/components/ui';
import { InlineError } from '@/components/ui/InlineError';
import { JOIN_CODE_LENGTH } from '@/shop/gym';
import { peekPendingInvite, restorePendingLinks, setPendingInvite } from '@/shop/pendingInvite';
import { shopInputStyle } from '@/shop/ShopParts';
import { color, space, type } from '@/theme/tokens';

import { WELCOME_GYM_ASK, WELCOME_GYM_WHY, welcomeGymCode, welcomeGymKept } from '../welcomeGym';

export function WelcomeGymCode() {
  // A gym link opened before setup already waits: show it as saved.
  const [kept, setKept] = useState<string | null>(() => peekPendingInvite());
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);

  // What waits can change under this screen: a code kept before the app was closed during setup
  // (restored from the phone), or a gym link tapped now (app/_layout.tsx keeps it). Show what will open.
  useEffect(() => {
    let live = true;
    const reread = (): void => {
      // After the layout's own link listener has kept the code.
      setTimeout(() => {
        if (live) setKept(peekPendingInvite());
      }, 0);
    };
    void restorePendingLinks().then(reread);
    const link = Linking.addEventListener('url', reread);
    const app = AppState.addEventListener('change', (st) => {
      if (st === 'active') reread();
    });
    return () => {
      live = false;
      link.remove();
      app.remove();
    };
  }, []);

  const save = (): void => {
    const r = welcomeGymCode(typed);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setPendingInvite(r.code);
    setKept(r.code);
    setOpen(false);
  };
  const change = (): void => {
    setPendingInvite(null);
    setKept(null);
    setTyped('');
    setOpen(true);
  };

  if (kept) {
    return (
      <GlassCard style={{ gap: space.sm }}>
        <Text accessibilityLiveRegion="polite" style={body()}>
          {welcomeGymKept(kept)}
        </Text>
        <GhostButton label="Change the code" onPress={change} />
      </GlassCard>
    );
  }

  if (!open) {
    return (
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        style={({ pressed }) => ({ minHeight: 48, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}
      >
        <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: color.accent, textDecorationLine: 'underline' }}>{WELCOME_GYM_ASK}</Text>
      </Pressable>
    );
  }

  return (
    <GlassCard style={{ gap: space.md }}>
      <View style={{ gap: space.xs }}>
        <Text accessibilityRole="header" style={{ fontFamily: type.heading, fontSize: type.size.h3, color: color.ink }}>
          Join your gym
        </Text>
        <Text style={body()}>{WELCOME_GYM_WHY}</Text>
      </View>
      <TextInput
        value={typed}
        onChangeText={(t) => {
          setTyped(t.slice(0, 120));
          setError(null);
        }}
        autoCapitalize="characters"
        autoCorrect={false}
        autoComplete="off"
        spellCheck={false}
        autoFocus
        returnKeyType="done"
        onSubmitEditing={save}
        // Typed in full, then "Next" tapped without "Save the code": keep it anyway.
        onBlur={() => {
          if (welcomeGymCode(typed).ok) save();
        }}
        placeholder={`${JOIN_CODE_LENGTH} letters or numbers`}
        placeholderTextColor={color.inkFaint}
        accessibilityLabel="Gym code"
        accessibilityHint={`The ${JOIN_CODE_LENGTH} letters and numbers your gym gave you`}
        style={[shopInputStyle(), { fontFamily: type.monoBold, letterSpacing: 2 }]}
      />
      <InlineError message={error} />
      <GhostButton label="Save the code" onPress={save} />
    </GlassCard>
  );
}

/** Read when drawn: gym branding repaints the tokens. */
const body = () => ({ fontFamily: type.body, fontSize: type.size.sub, color: color.inkSecondary, lineHeight: 20 }) as const;
