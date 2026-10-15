/**
 * QR self check-in (15 Oct 2026): the screen the gym's check-in poster opens —
 * https://forgeai.aakashpahuja.in/c/RAMS01 scanned with the phone's camera (Android opens the app
 * straight here), or forgeai://c/RAMS01 from the poster link's web page.
 *  - in that gym     → one tap "Check in" (member_check_in, 0015/0016) → "You're in ✓ 6:42 pm".
 *    A tap, not at once (review, 15 Oct 2026): a poster link forwarded into a WhatsApp group must
 *    not check in everyone who opens it at home;
 *  - the first time  → asks once for the mobile number the gym has, then one tap "Check in";
 *  - no plan covers today → still checked in, with "Please see the desk" under it;
 *  - not on the gym's list, gym not online, too many tries, offline → plain words, never a dead end;
 *  - in no gym, or another → "Join <gym>" (the invite screen), then scan again.
 * The words are all in checkIn.ts (tested); this file only lays them out.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Text, TextInput, View } from 'react-native';

import { Card, GhostButton, PrimaryButton, Screen } from '@/components/ui';
import { InlineError } from '@/components/ui/InlineError';
import { color, space, type } from '@/theme/tokens';

import {
  ASK_PHONE_TEXT,
  checkInCodeFromUrl,
  checkInErrorText,
  checkInStanding,
  checkInTitle,
  doneDetail,
  doneHeadline,
  isRealFailure,
  mobileDigits,
  notMemberText,
  PLAN_ENDED_TEXT,
  problemText,
  READY_TEXT,
  type CheckInAnswer,
} from './checkIn';
import { previewErrorText, UNLINKED_TEXT, type GymPreview } from './gym';
import { checkInAtGym } from './gymActions';
import { apiPreview } from './gymApi';
import { useGymShop } from './gymStore';
import { takePendingCheckIn } from './pendingInvite';
import { leave, shopInputStyle } from './ShopParts';
import { useGymHydrated } from './shopSource';

type Done = Extract<CheckInAnswer, { ok: true }>;
type Problem = Extract<CheckInAnswer, { ok: false }>;

type View_ =
  | { state: 'ready' }
  | { state: 'working' }
  | { state: 'done'; done: Done }
  | { state: 'ask-phone'; error: string | null }
  | { state: 'problem'; problem: Problem; typed: string | null }
  | { state: 'unlinked' }
  | { state: 'failed'; words: string };

type Look = { state: 'loading' } | { state: 'found'; gym: GymPreview } | { state: 'none' } | { state: 'failed'; words: string };

export function CheckInScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ code?: string | string[] }>();
  // Exactly 6 letters or digits (review, 15 Oct 2026): /c/RAMS01XYZ is not RAMS01's poster.
  const code = checkInCodeFromUrl(`forgeai://c/${Array.isArray(params.code) ? params.code[0] ?? '' : params.code ?? ''}`);
  const hydrated = useGymHydrated();
  const link = useGymShop((s) => s.link);
  const standing = code && hydrated ? checkInStanding(link, code) : null;

  const [view, setView] = useState<View_>({ state: 'ready' });
  const [look, setLook] = useState<Look>({ state: 'loading' });
  const [phone, setPhone] = useState('');

  // This screen is open: a code kept from the welcome flow (app/_layout.tsx) has done its job.
  useEffect(() => {
    takePendingCheckIn();
  }, []);

  const run = useCallback(
    async (typed: string | null) => {
      if (!code) return;
      setView({ state: 'working' });
      const out = await checkInAtGym(code, typed);
      if (out.kind === 'not-joined' || out.kind === 'unlinked') {
        setView({ state: 'unlinked' });
        return;
      }
      if (out.kind === 'failed') {
        if (isRealFailure(out.error)) console.warn('[ForgeErr] check-in', out.error);
        setView({ state: 'failed', words: checkInErrorText(out.error) });
        return;
      }
      const a = out.answer;
      if (a.ok) setView({ state: 'done', done: a });
      else if (a.problem === 'NO_PHONE') setView({ state: 'ask-phone', error: null });
      else if (a.problem === 'BAD_PHONE') setView({ state: 'ask-phone', error: problemText(a) });
      else if (a.problem === 'TOO_MANY_NUMBERS' && typed !== null) setView({ state: 'ask-phone', error: problemText(a) });
      else setView({ state: 'problem', problem: a, typed });
    },
    [code],
  );

  // Not in that gym: show which gym the poster is (gym_preview), and offer to join it.
  const ask = useCallback(async () => {
    if (!code) return;
    setLook({ state: 'loading' });
    const r = await apiPreview(code);
    if (!r.ok) setLook({ state: 'failed', words: previewErrorText(r.error) });
    else setLook(r.data ? { state: 'found', gym: r.data } : { state: 'none' });
  }, [code]);
  const needsPreview = standing === 'fresh' || standing === 'other' || view.state === 'unlinked' || (view.state === 'problem' && view.problem.problem === 'OTHER_GYM');
  useEffect(() => {
    if (needsPreview && look.state === 'loading') void ask();
  }, [needsPreview, look.state, ask]);

  const done = () => leave(router, '/shop');
  const toJoin = () => code && router.replace(`/j/${code}`);
  const sendPhone = () => {
    const d = mobileDigits(phone);
    if (!d) {
      setView({ state: 'ask-phone', error: problemText({ problem: 'BAD_PHONE', gymName: null, phone: null }) });
      return;
    }
    void run(d);
  };

  const gymName = standing === 'same' && link ? link.gymName : look.state === 'found' ? look.gym.gymName : null;

  let body: ReactNode;
  if (!code) {
    body = <NotAGymLink code={null} onShop={done} />;
  } else if (!hydrated) {
    body = <Busy words="Finding your gym…" />;
  } else if (needsPreview) {
    body =
      look.state === 'loading' ? (
        <Busy words="Finding your gym…" />
      ) : look.state === 'failed' ? (
        <Card style={{ gap: space.md }}>
          <InlineError message={look.words} />
          <PrimaryButton label="Try again" onPress={() => void ask()} />
        </Card>
      ) : look.state === 'none' ? (
        <NotAGymLink code={code} onShop={done} />
      ) : (
        <Card style={{ gap: space.lg }}>
          <Text accessibilityRole="header" style={heading()}>
            {checkInTitle(look.gym.gymName)}
          </Text>
          <Text style={bodyText()}>
            {view.state === 'unlinked' ? `${UNLINKED_TEXT} ` : ''}
            {notMemberText(standing === 'same' ? 'fresh' : (standing ?? 'fresh'), look.gym.gymName, standing === 'other' && link ? link.gymName : null)}
          </Text>
          <PrimaryButton label={`Join ${look.gym.gymName}`} onPress={toJoin} />
          <GhostButton label="Not now" onPress={done} />
        </Card>
      );
  } else if (view.state === 'ready') {
    body = (
      <Card style={{ gap: space.md }}>
        <Text accessibilityRole="header" style={heading()}>
          {checkInTitle(gymName)}
        </Text>
        <Text style={bodyText()}>{READY_TEXT}</Text>
        <PrimaryButton label="Check in" onPress={() => void run(null)} />
        <GhostButton label="Not now" onPress={done} />
      </Card>
    );
  } else if (view.state === 'working') {
    body = <Busy words={gymName ? `Checking you in at ${gymName}…` : 'Checking you in…'} />;
  } else if (view.state === 'done') {
    body = (
      <Card style={{ gap: space.md, alignItems: 'center', paddingVertical: space.xl }}>
        <Text accessibilityRole="header" accessibilityLiveRegion="polite" style={[heading(), { fontSize: type.size.h2, color: color.good, textAlign: 'center' }]}>
          {doneHeadline(view.done)}
        </Text>
        <Text style={[bodyText(), { textAlign: 'center' }]}>{doneDetail(view.done)}</Text>
        {view.done.planOk === false && <InlineError message={PLAN_ENDED_TEXT} />}
        <View style={{ alignSelf: 'stretch' }}>
          <PrimaryButton label="Done" onPress={done} />
        </View>
      </Card>
    );
  } else if (view.state === 'ask-phone') {
    body = (
      <Card style={{ gap: space.md }}>
        <Text accessibilityRole="header" style={heading()}>
          {checkInTitle(gymName)}
        </Text>
        <Text style={bodyText()}>{ASK_PHONE_TEXT}</Text>
        <View>
          <Text style={label()}>Your mobile number</Text>
          <TextInput
            value={phone}
            onChangeText={(t) => {
              setPhone(t.slice(0, 16));
              if (view.error) setView({ state: 'ask-phone', error: null });
            }}
            keyboardType="phone-pad"
            autoComplete="tel"
            textContentType="telephoneNumber"
            returnKeyType="go"
            onSubmitEditing={sendPhone}
            placeholder="98290 12345"
            placeholderTextColor={color.inkFaint}
            accessibilityLabel="Your mobile number"
            style={shopInputStyle()}
          />
        </View>
        <InlineError message={view.error} />
        <PrimaryButton label="Check in" onPress={sendPhone} />
      </Card>
    );
  } else if (view.state === 'problem') {
    const p = view.problem;
    body = (
      <Card style={{ gap: space.md }}>
        <Text accessibilityRole="header" style={heading()}>
          {checkInTitle(p.gymName ?? gymName)}
        </Text>
        <Text style={bodyText()}>{problemText(p, view.typed)}</Text>
        {p.problem === 'NOT_ON_ROSTER' ? (
          <>
            <PrimaryButton label="Check in" onPress={() => void run(view.typed)} />
            <GhostButton label="Change my number" onPress={() => setView({ state: 'ask-phone', error: null })} />
          </>
        ) : p.problem === 'TOO_MANY' ? (
          <PrimaryButton label="Check in" onPress={() => void run(null)} />
        ) : (
          <PrimaryButton label="Done" onPress={done} />
        )}
      </Card>
    );
  } else {
    // failed
    body = (
      <Card style={{ gap: space.md }}>
        <Text accessibilityRole="header" style={heading()}>
          {checkInTitle(gymName)}
        </Text>
        <InlineError message={view.state === 'failed' ? view.words : null} />
        <PrimaryButton label="Check in" onPress={() => void run(null)} />
      </Card>
    );
  }

  return (
    <Screen title="Gym check-in" onBack={done}>
      {body}
    </Screen>
  );
}

function Busy({ words }: { words: string }) {
  return (
    <View style={{ alignItems: 'center', gap: space.md, paddingVertical: space.xxl }}>
      <ActivityIndicator color={color.accent} />
      <Text style={quiet()}>{words}</Text>
    </View>
  );
}

function NotAGymLink({ code, onShop }: { code: string | null; onShop: () => void }) {
  return (
    <Card style={{ gap: space.md }}>
      <Text accessibilityRole="header" style={heading()}>
        This link is not a gym's
      </Text>
      <Text style={bodyText()}>
        {code ? `No gym has the code ${code}. Check in at the desk, and ask them for a new poster.` : 'Check in at the desk, and ask them for a new poster.'}
      </Text>
      <GhostButton label="Go to the Shop tab" onPress={onShop} />
    </Card>
  );
}

/** Read when drawn: gym branding repaints the tokens. */
const heading = () => ({ fontFamily: type.heading, fontSize: type.size.h3, color: color.ink }) as const;
const bodyText = () => ({ fontFamily: type.body, fontSize: type.size.sub, color: color.inkSecondary, lineHeight: 20 }) as const;
const quiet = () => ({ fontFamily: type.body, fontSize: type.size.sub, color: color.inkMuted }) as const;
const label = () => ({ fontFamily: type.bodySemi, fontSize: type.size.sub, color: color.inkSecondary, marginBottom: space.xs }) as const;
