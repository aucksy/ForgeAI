/**
 * Settings → Your gym → What my gym can see (R-133). One switch: "Show my name on my gym's
 * leaderboard", off by default (other members then see "A member"). Flipping it tells the gym at
 * once; with no signal the change is kept and sent again (leaderboardPush.ts). Until the gym's
 * leaderboard has answered in this app session the page only says it is not switched on yet. No gym
 * joined: the Gym tab's join screen.
 *
 * R-164: a second, separate switch, "Let my gym mates see my workouts", off by default, shown only
 * once the gym's server can hold shared workouts (0040 live). On: the phone shares its bio and
 * recent workouts at once (mateShare.ts); off: the gym deletes them at once (kept and sent again
 * with no signal). Gym mates can open them only while the name switch is on too.
 *
 * F137 (owner approved the words, 3 Nov 2026, #84): while the gym has Busy machines on, the intro drops
 * "never sends which exercises you did", says what is sent, and a third switch "Share which machines I use"
 * (on by default) lets the member stop it.
 */
import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text } from 'react-native';

import { SettingsPage } from '@/components/settings/SettingsPage';
import { ToggleRow } from '@/components/settings/SettingRow';
import { GlassCard } from '@/components/ui';
import { BOARD_WORDS } from '@/shop/boardWords';
import { useGymShop } from '@/shop/gymStore';
import { MATE_WORDS } from '@/shop/mateProfile';
import { useGymHydrated } from '@/shop/shopSource';
import { useBoardLive } from '@/shop/useBoardLive';
import { useMatesLive } from '@/shop/useMatesLive';
import { color, type } from '@/theme/tokens';
import { usePhonePrefs } from '@/tracker/phone/phonePrefs';

export default function GymSeesPage() {
  const hydrated = useGymHydrated();
  const link = useGymShop((s) => s.link);
  const live = useBoardLive(link);
  const matesLive = useMatesLive(link);
  const on = usePhonePrefs((s) => s.showNameOnBoard);
  const sharing = usePhonePrefs((s) => s.shareWorkoutsWithGym);
  const machinesShared = usePhonePrefs((s) => s.shareMachineUse);
  // F137: does the gym have Busy machines on? Asked once per open (kept 30 minutes by machineBusySync).
  const [machinesOn, setMachinesOn] = useState(false);
  useEffect(() => {
    let alive = true;
    if (link)
      void import('@/shop/machineBusySync')
        .then((m) => m.syncMachines(link, 'focus'))
        .then((a) => {
          if (alive) setMachinesOn(a?.on === true);
        })
        .catch((e: unknown) => console.warn('[machines] could not read the gym switch', e));
    return () => {
      alive = false;
    };
  }, [link]);
  if (hydrated && !link) return <Redirect href="/shop" />;
  const flip = (v: boolean): void => {
    const prefs = usePhonePrefs.getState();
    prefs.setShowNameOnBoard(v);
    // Kept until the gym has heard it, so a change made with no signal is sent again later.
    prefs.setBoardNamePending(true);
    void import('@/shop/leaderboardSync')
      .then((m) => m.pushBoard('setting'))
      .catch((e: unknown) => console.warn('[board] name switch push', e));
  };
  const flipShare = (v: boolean): void => {
    const prefs = usePhonePrefs.getState();
    prefs.setShareWorkoutsWithGym(v);
    prefs.setMateSharePending(true);
    void import('@/shop/mateSync')
      .then((m) => m.shareWithMates('setting'))
      .catch((e: unknown) => console.warn('[mates] share switch', e));
  };
  const body = { fontFamily: type.body, fontSize: type.size.sub, lineHeight: 20, color: color.inkSecondary } as const;
  return (
    <SettingsPage title={BOARD_WORDS.seesTitle}>
      {live ? (
        <>
          <Text style={body}>{machinesOn ? BOARD_WORDS.seesIntroMachines : BOARD_WORDS.seesIntro}</Text>
          {machinesOn ? <Text style={body}>{BOARD_WORDS.machinesLine}</Text> : null}
          <GlassCard>
            <ToggleRow icon="trophy" title={BOARD_WORDS.nameSwitch} caption={BOARD_WORDS.nameCaption} value={on} onChange={flip} />
            {matesLive || sharing ? (
              <ToggleRow icon="person" title={MATE_WORDS.shareSwitch} caption={MATE_WORDS.shareCaption} value={sharing} onChange={flipShare} divider />
            ) : null}
            {machinesOn ? (
              <ToggleRow
                icon="dumbbell"
                title={BOARD_WORDS.machinesSwitch}
                caption={BOARD_WORDS.machinesCaption}
                value={machinesShared}
                onChange={(v) => usePhonePrefs.getState().setShareMachineUse(v)}
                divider
              />
            ) : null}
          </GlassCard>
          {sharing && !on ? <Text style={body}>{MATE_WORDS.needsName}</Text> : null}
        </>
      ) : (
        <Text style={body}>{BOARD_WORDS.notLive}</Text>
      )}
    </SettingsPage>
  );
}
