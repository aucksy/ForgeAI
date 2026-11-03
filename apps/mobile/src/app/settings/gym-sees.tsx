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
 *
 * F109 (OWNER-INBOX #46, DECIDED 24 Oct 2026, words still need the owner's yes): once the gym's server has the
 * trainer view (0050), a card "Share my workouts with my trainers" (on by default; off deletes the gym's copy at
 * once), "Your trainer: <first name>" when the owner picked one, and "Ask my trainer for help" while sharing.
 * Without 0050 nothing of it shows and the page is exactly as before.
 */
import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text } from 'react-native';

import { SettingsPage } from '@/components/settings/SettingsPage';
import { ToggleRow } from '@/components/settings/SettingRow';
import { GhostButton, GlassCard } from '@/components/ui';
import { BOARD_WORDS } from '@/shop/boardWords';
import { useGymShop } from '@/shop/gymStore';
import { MATE_WORDS } from '@/shop/mateProfile';
import { useGymHydrated } from '@/shop/shopSource';
import { useBoardLive } from '@/shop/useBoardLive';
import { useMatesLive } from '@/shop/useMatesLive';
import { TRAINER_WORDS, type TrainerStatus } from '@/shop/trainerShare';
import type { HelpOutcome } from '@/shop/trainerSync';
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
  // F109: does the gym's server have the trainer view (0050)? null: no, or not known (offline): nothing shows.
  const trainersShared = usePhonePrefs((s) => s.shareWithTrainers);
  const [trainer, setTrainer] = useState<TrainerStatus | null>(null);
  const [help, setHelp] = useState<HelpOutcome | 'busy' | null>(null);
  useEffect(() => {
    let alive = true;
    if (link)
      void import('@/shop/trainerSync')
        .then((m) => m.readTrainerStatus(link))
        .then((s) => {
          if (alive) setTrainer(s);
        })
        .catch((e: unknown) => console.warn('[trainer] could not read the status', e));
    return () => {
      alive = false;
    };
  }, [link]);
  if (hydrated && !link) return <Redirect href="/shop" />;
  const flipTrainers = (v: boolean): void => {
    const prefs = usePhonePrefs.getState();
    prefs.setShareWithTrainers(v);
    prefs.setTrainerSharePending(true);
    setHelp(null);
    void import('@/shop/trainerSync')
      .then((m) => m.shareWithTrainers('setting'))
      .catch((e: unknown) => console.warn('[trainer] share switch', e));
  };
  const askHelp = (): void => {
    if (!link || help === 'busy') return;
    setHelp('busy');
    void import('@/shop/trainerSync')
      .then(async (m) => {
        const first = await m.askTrainerForHelp(link);
        if (first !== 'off') return first;
        // The switch is on but the gym has no summary yet (a new member): send it, then ask once more.
        await m.shareWithTrainers('setting');
        return m.askTrainerForHelp(link);
      })
      .then((r) => setHelp(r))
      .catch((e: unknown) => {
        console.warn('[trainer] help button', e);
        setHelp('failed');
      });
  };
  const helpWords =
    help === 'sent' ? TRAINER_WORDS.helpSent : help === 'already' ? TRAINER_WORDS.helpAlready : help === 'failed' || help === 'off' ? TRAINER_WORDS.helpFailed : null;
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
          {/* F109: with the trainer view live, "never sends which exercises you did" is no longer true (best sets). */}
          <Text style={body}>{machinesOn || trainer ? BOARD_WORDS.seesIntroMachines : BOARD_WORDS.seesIntro}</Text>
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
      {trainer ? (
        <>
          <GlassCard>
            <ToggleRow icon="trend" title={TRAINER_WORDS.shareSwitch} caption={TRAINER_WORDS.shareCaption} value={trainersShared} onChange={flipTrainers} />
          </GlassCard>
          {trainersShared && trainer.trainer ? <Text style={body}>{TRAINER_WORDS.yourTrainer(trainer.trainer)}</Text> : null}
          {trainersShared ? <GhostButton label={TRAINER_WORDS.helpButton} icon="chat" onPress={askHelp} /> : null}
          {trainersShared && helpWords ? <Text style={body}>{helpWords}</Text> : null}
        </>
      ) : null}
    </SettingsPage>
  );
}
