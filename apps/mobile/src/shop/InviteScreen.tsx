/**
 * Invite link (14 Oct 2026): the screen a gym's link opens — https://forgeai.aakashpahuja.in/j/RAMS01
 * from WhatsApp or the front-desk QR (Android opens the app straight here), or forgeai://j/RAMS01
 * from the link's web page. It shows the gym first (gym_preview: its name and logo), then ONE button:
 *  - not in a gym  → "Join <gym>" (the name is filled in from the profile);
 *  - in that gym   → "You're already in <gym>" and a way to its shop;
 *  - in another    → "Switch to <gym>": the new gym is joined first, the old one let go after.
 * A code no gym has, or a link that is not a gym's, says so and points at the Shop tab's code box.
 * Joining is never automatic: a link anyone can forward must not move a member by itself.
 */
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, TextInput, View } from 'react-native';

import { Card, GhostButton, PrimaryButton, Screen } from '@/components/ui';
import { InlineError } from '@/components/ui/InlineError';
import { getProfile } from '@/db/repos/userRepo';
import { color, radius, space, type } from '@/theme/tokens';

import { afterJoinPath, codeFromInvite, gymInitial, inviteStanding, previewErrorText, type GymPreview } from './gym';
import { joinFromInvite } from './gymActions';
import { apiPreview } from './gymApi';
import { useGymShop } from './gymStore';
import { takePendingInvite } from './pendingInvite';
import { leave, shopInputStyle } from './ShopParts';
import { useGymHydrated } from './shopSource';

type Look = { state: 'loading' } | { state: 'found'; gym: GymPreview } | { state: 'none' } | { state: 'failed'; words: string };

export function InviteScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ code?: string | string[]; then?: string | string[] }>();
  const code = codeFromInvite(params.code);
  const hydrated = useGymHydrated();
  const link = useGymShop((s) => s.link);
  const [look, setLook] = useState<Look>(code ? { state: 'loading' } : { state: 'none' });
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameTouched = useRef(false);

  // This screen is open: a code kept from the welcome flow (app/_layout.tsx) has done its job.
  useEffect(() => {
    takePendingInvite();
  }, []);

  const ask = useCallback(async () => {
    if (!code) return;
    setLook({ state: 'loading' });
    const r = await apiPreview(code);
    if (!r.ok) setLook({ state: 'failed', words: previewErrorText(r.error) });
    else setLook(r.data ? { state: 'found', gym: r.data } : { state: 'none' });
  }, [code]);

  useEffect(() => {
    void ask();
  }, [ask]);

  // The name the gym's desk sees: the member's own, from the gym they are in or the profile.
  useEffect(() => {
    let live = true;
    const fromLink = useGymShop.getState().link?.name;
    if (fromLink) {
      setName(fromLink);
      return;
    }
    getProfile()
      .then((p) => {
        if (live && !nameTouched.current && p.name) setName(p.name);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  const toShop = () => router.replace('/shop');

  const onJoin = async () => {
    if (busy || !code) return;
    setBusy(true);
    setError(null);
    const words = await joinFromInvite(code, name);
    setBusy(false);
    if (words) setError(words);
    // C6-16: opened from the check-in poster → straight back to the check-in, not the Shop.
    else router.replace(afterJoinPath(code, params.then));
  };

  const standing = code && hydrated ? inviteStanding(link, code) : null;

  return (
    <Screen title="Join your gym" onBack={() => leave(router, '/shop')}>
      {look.state === 'loading' || !hydrated ? (
        <View style={{ alignItems: 'center', gap: space.md, paddingVertical: space.xxl }}>
          <ActivityIndicator color={color.accent} />
          <Text style={quiet()}>Finding your gym…</Text>
        </View>
      ) : look.state === 'failed' ? (
        <Card style={{ gap: space.md }}>
          <InlineError message={look.words} />
          <PrimaryButton label="Try again" onPress={() => void ask()} />
        </Card>
      ) : look.state === 'none' ? (
        <Card style={{ gap: space.md }}>
          <Text accessibilityRole="header" style={heading()}>
            This link is not a gym's
          </Text>
          <Text style={body()}>
            {code
              ? `No gym has the code ${code}. Ask your gym for a new link, or type their code in the Shop tab.`
              : 'Ask your gym for a new link, or type their code in the Shop tab.'}
          </Text>
          <GhostButton label="Go to the Shop tab" onPress={toShop} />
        </Card>
      ) : (
        <Card style={{ gap: space.lg }}>
          <GymFace gym={look.gym} />

          {standing === 'same' ? (
            <>
              <Text style={body()}>You're already in {look.gym.gymName}. Nothing to do.</Text>
              <PrimaryButton label={`Open ${look.gym.gymName}'s shop`} onPress={toShop} />
            </>
          ) : (
            <>
              <Text style={body()}>
                {standing === 'other' && link
                  ? `You're in ${link.gymName} now. Switching takes you out of ${link.gymName}'s shop on this phone. Orders you placed there stay with that gym.`
                  : 'Join to order from your gym in the app and pay at the desk. Your workouts stay on this phone.'}
              </Text>
              <View>
                <Text style={label()}>Your name</Text>
                <TextInput
                  value={name}
                  onChangeText={(t) => {
                    nameTouched.current = true;
                    setName(t.slice(0, 70));
                    setError(null);
                  }}
                  autoCapitalize="words"
                  autoComplete="name"
                  returnKeyType="go"
                  onSubmitEditing={() => void onJoin()}
                  placeholder="So the desk knows who you are"
                  placeholderTextColor={color.inkFaint}
                  accessibilityLabel="Your name"
                  style={shopInputStyle()}
                />
              </View>
              <InlineError message={error ?? null} />
              <PrimaryButton
                label={standing === 'other' ? `Switch to ${look.gym.gymName}` : `Join ${look.gym.gymName}`}
                onPress={() => void onJoin()}
                loading={busy}
              />
            </>
          )}
        </Card>
      )}
    </Screen>
  );
}

/** The gym as the link names it: its logo (on its own background tone) and name, and the code. */
function GymFace({ gym }: { gym: GymPreview }) {
  const [failed, setFailed] = useState(false);
  const logo = gym.brand?.logoUrl && !failed ? gym.brand.logoUrl : null;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
      <View
        style={{
          width: 64,
          height: 64,
          borderRadius: radius.md,
          backgroundColor: gym.brand?.bg ?? color.surfaceSunken,
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        {logo ? (
          <Image source={{ uri: logo }} contentFit="contain" style={{ width: 56, height: 56 }} onError={() => setFailed(true)} accessibilityIgnoresInvertColors />
        ) : (
          <Text style={{ fontFamily: type.display, fontSize: 28, color: gym.brand?.accent ?? color.accent }}>
            {gymInitial(gym.gymName)}
          </Text>
        )}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text accessibilityRole="header" style={heading()} numberOfLines={3}>
          {gym.gymName}
        </Text>
        <Text style={quiet()}>Gym code {gym.joinCode}</Text>
      </View>
    </View>
  );
}

/** Read when drawn: gym branding repaints the tokens. */
const heading = () => ({ fontFamily: type.heading, fontSize: type.size.h3, color: color.ink }) as const;
const body = () => ({ fontFamily: type.body, fontSize: type.size.sub, color: color.inkSecondary, lineHeight: 20 }) as const;
const quiet = () => ({ fontFamily: type.body, fontSize: type.size.sub, color: color.inkMuted }) as const;
const label = () => ({ fontFamily: type.bodySemi, fontSize: type.size.sub, color: color.inkSecondary, marginBottom: space.xs }) as const;
