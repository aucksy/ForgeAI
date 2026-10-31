/**
 * "Join your gym" with the gym's code (owner report, 17 Oct 2026). Next opens the invite screen for
 * that code, which shows the gym and asks before joining (never automatic). Joining paints the app in
 * the gym's colours (part BR).
 *
 * Release A (A2/A3, docs/ux/MEMBER-APP-MAP.md): the card is the top of the Gym tab's no-gym screen,
 * the one place to join. With `scan`, "Scan the poster" comes first (UAT B-05): the phone's camera reads
 * the QR code at the gym's desk, which opens the same invite (or check-in) screen; typing the code is second.
 */
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import { GhostButton, GlassCard, PrimaryButton } from '@/components/ui';
import { InlineError } from '@/components/ui/InlineError';
import { JOIN_CODE_LENGTH, joinCodeFromTyped, joinPathFromSettings } from '@/shop/gym';
import { SCAN_POSTER_LINE } from '@/shop/scanPoster';
import { shopInputStyle } from '@/shop/ShopParts';
import { color, space, type } from '@/theme/tokens';

export function JoinGymCard({ scan = false }: { scan?: boolean }) {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  const next = (): void => {
    const path = joinPathFromSettings(code);
    if (!path) {
      setError(`The code is ${JOIN_CODE_LENGTH} letters or numbers. Ask at your gym's desk.`);
      return;
    }
    router.push(path);
  };

  return (
    <GlassCard style={{ gap: space.md }}>
      <View style={{ gap: space.xs }}>
        <Text accessibilityRole="header" style={{ fontFamily: type.heading, fontSize: type.size.h3, color: color.ink }}>
          Join your gym
        </Text>
        <Text style={{ fontFamily: type.body, fontSize: type.size.sub, color: color.inkSecondary, lineHeight: 20 }}>
          Got a code from your gym? Join to check in, order from its shop, and see the app in its colours. Your workouts stay as they are.
        </Text>
      </View>
      {/* UAT B-05 (30 Oct 2026): most members stand in front of the poster, and scanning beats typing
          6 letters, so the scan comes first and the typed code second. */}
      {scan ? (
        <View style={{ gap: space.sm }}>
          <PrimaryButton label="Scan the poster" icon="camera" onPress={() => router.push('/scan')} />
          <Text style={{ fontFamily: type.body, fontSize: type.size.caption, color: color.inkMuted, lineHeight: 17 }}>{SCAN_POSTER_LINE}</Text>
        </View>
      ) : null}
      {scan ? (
        <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.sub, color: color.inkSecondary, paddingTop: space.sm, borderTopWidth: 1, borderTopColor: color.border }}>
          Or type your gym&apos;s code
        </Text>
      ) : null}
      <TextInput
        value={code}
        onChangeText={(t) => {
          setCode(joinCodeFromTyped(t));
          setError(null);
        }}
        autoCapitalize="characters"
        autoCorrect={false}
        autoComplete="off"
        spellCheck={false}
        returnKeyType="go"
        onSubmitEditing={next}
        placeholder={`${JOIN_CODE_LENGTH} letters or numbers`}
        placeholderTextColor={color.inkFaint}
        accessibilityLabel="Gym code"
        accessibilityHint={`The ${JOIN_CODE_LENGTH} letters and numbers your gym gave you`}
        style={[shopInputStyle(), { fontFamily: type.monoBold, letterSpacing: 2 }]}
      />
      <InlineError message={error} />
      {scan ? (
        <GhostButton label="Next" accessibilityLabel="Find my gym" onPress={next} />
      ) : (
        <PrimaryButton label="Next" accessibilityLabel="Find my gym" onPress={next} />
      )}
    </GlassCard>
  );
}
