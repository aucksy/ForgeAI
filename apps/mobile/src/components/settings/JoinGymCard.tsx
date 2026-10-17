/**
 * Settings → Your gym, for a member in no gym (owner report, 17 Oct 2026): "Join your gym" with the
 * gym's code. Next opens the invite screen for that code, which shows the gym and asks before
 * joining (never automatic). Joining paints the app in the gym's colours (part BR).
 */
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import { GlassCard, PrimaryButton } from '@/components/ui';
import { InlineError } from '@/components/ui/InlineError';
import { JOIN_CODE_LENGTH, joinCodeFromTyped, joinPathFromSettings } from '@/shop/gym';
import { shopInputStyle } from '@/shop/ShopParts';
import { color, space, type } from '@/theme/tokens';

export function JoinGymCard() {
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
      <PrimaryButton label="Next" accessibilityLabel="Find my gym" onPress={next} />
    </GlassCard>
  );
}
