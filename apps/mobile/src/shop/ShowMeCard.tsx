/**
 * R-200: "Show me to my gym", the box at the top of the gym's leaderboard for a member whose name is
 * off. One line says what it shares, "Show me" switches on the name (and the workouts, when still
 * off and the gym can hold them) with the Settings switches' own calls, "Not now" hides it for this
 * gym for 30 days. Switching off stays in Settings → Your gym → What my gym can see.
 * When it shows, and the switch-on: showMe.ts. Words: boardWords.ts SHOW_ME_WORDS.
 */
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';

import { GhostButton, PrimaryButton } from '@/components/ui';
import { InlineError } from '@/components/ui/InlineError';
import { color, radius, space, type } from '@/theme/tokens';
import { usePhonePrefs } from '@/tracker/phone/phonePrefs';

import { SHOW_ME_WORDS } from './boardWords';
import type { Board } from './leaderboard';
import { showMeOffer, type ShowMeOffer } from './showMe';
import { showMeToGym } from './showMeRun';
import type { GymLink } from './types';
import { useMatesLive } from './useMatesLive';

export function ShowMeCard({ link, board, onShown }: { link: GymLink; board: Board; onShown: () => void }) {
  const nameOn = usePhonePrefs((s) => s.showNameOnBoard);
  const shareOn = usePhonePrefs((s) => s.shareWorkoutsWithGym);
  const snoozed = usePhonePrefs((s) => s.showMeSnoozed);
  const matesLive = useMatesLive(link);
  // null until read: the box never shows before the app knows the member is not under 18.
  const [age, setAge] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  // The offer that was switched on, kept while this screen is open so "Done." can say what.
  const [done, setDone] = useState<Exclude<ShowMeOffer, 'none'> | null>(null);

  useFocusEffect(
    useCallback(() => {
      let live = true;
      void import('@/db/repos/userRepo')
        .then((m) => m.getProfile())
        .then((p) => {
          if (live) setAge(Number.isFinite(p.age) ? p.age : 0);
        })
        .catch((e: unknown) => console.warn('[board] show me: could not read the age, box stays hidden', e));
      return () => {
        live = false;
      };
    }, []),
  );

  const offer = showMeOffer({
    nameOn,
    shareOn,
    matesLive,
    board,
    age,
    snoozedAt: snoozed && typeof snoozed === 'object' ? snoozed[link.gymId] : null,
    now: Date.now(),
  });
  // While a tap is out the name is already on: keep the box (with its busy button) until it settles.
  const shown: ShowMeOffer = busy ? (done ?? 'name') : offer;

  // Workouts already shared but the name off: gym mates can open them only once the name shows, so
  // switching the name on opens them too; the words say so.
  const withWorkouts = shown === 'both' || done === 'both' || shareOn;
  // "Done." only while the name is still on (switched off in Settings later: the box may come back).
  if (done && !busy && nameOn) {
    return (
      <Text accessibilityLiveRegion="polite" style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, lineHeight: 20, color: color.ink }}>
        {withWorkouts ? SHOW_ME_WORDS.doneBoth : SHOW_ME_WORDS.doneName}
      </Text>
    );
  }
  if (shown === 'none') return null;

  const onShowMe = (): void => {
    if (busy) return;
    const want = shown;
    setFailed(false);
    setDone(want);
    setBusy(true);
    void showMeToGym(want)
      .then((r) => {
        if (r === 'on') onShown();
        else {
          setDone(null);
          setFailed(true);
        }
      })
      .catch((e: unknown) => {
        // runShowMe never throws; this is only a last guard.
        console.warn('[board] show me failed', e);
        setDone(null);
        setFailed(true);
      })
      .finally(() => setBusy(false));
  };

  return (
    <View style={{ gap: space.sm, padding: space.md, borderRadius: radius.md, backgroundColor: color.accentSoft }}>
      <Text accessibilityRole="header" style={{ fontFamily: type.heading, fontSize: type.size.body, color: color.ink }}>
        {SHOW_ME_WORDS.title}
      </Text>
      <Text style={{ fontFamily: type.body, fontSize: type.size.sub, lineHeight: 20, color: color.inkSecondary }}>
        {withWorkouts ? SHOW_ME_WORDS.both : SHOW_ME_WORDS.name}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
        <View style={{ flexGrow: 1, flexBasis: 120 }}>
          <PrimaryButton label={SHOW_ME_WORDS.showMe} onPress={onShowMe} loading={busy} />
        </View>
        <View style={{ flexGrow: 1, flexBasis: 120 }}>
          <GhostButton
            label={SHOW_ME_WORDS.notNow}
            onPress={() => {
              if (!busy) usePhonePrefs.getState().snoozeShowMe(link.gymId, Date.now());
            }}
          />
        </View>
      </View>
      <InlineError message={failed ? SHOW_ME_WORDS.failed : null} />
      <Text style={{ fontFamily: type.body, fontSize: type.size.caption + 1, lineHeight: 17, color: color.inkMuted }}>{SHOW_ME_WORDS.offNote}</Text>
    </View>
  );
}
