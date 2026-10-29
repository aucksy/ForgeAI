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
 * R-200: both can also be switched ON from the leaderboard ("Show me to my gym"); switching off
 * stays here. Both places use shop/showMeRun.ts, and this page reads the same saved switches.
 */
import { Redirect } from 'expo-router';
import { Text } from 'react-native';

import { SettingsPage } from '@/components/settings/SettingsPage';
import { ToggleRow } from '@/components/settings/SettingRow';
import { GlassCard } from '@/components/ui';
import { BOARD_WORDS } from '@/shop/boardWords';
import { useGymShop } from '@/shop/gymStore';
import { MATE_WORDS } from '@/shop/mateProfile';
import { useGymHydrated } from '@/shop/shopSource';
import { useBoardLive } from '@/shop/useBoardLive';
import { switchBoardName, switchMateShare } from '@/shop/showMeRun';
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
  if (hydrated && !link) return <Redirect href="/shop" />;
  // R-200: the same calls as the leaderboard's "Show me to my gym" box (shop/showMeRun.ts).
  const flip = (v: boolean): void => switchBoardName(v);
  const flipShare = (v: boolean): void => switchMateShare(v);
  const body = { fontFamily: type.body, fontSize: type.size.sub, lineHeight: 20, color: color.inkSecondary } as const;
  return (
    <SettingsPage title={BOARD_WORDS.seesTitle}>
      {live ? (
        <>
          <Text style={body}>{BOARD_WORDS.seesIntro}</Text>
          <GlassCard>
            <ToggleRow icon="trophy" title={BOARD_WORDS.nameSwitch} caption={BOARD_WORDS.nameCaption} value={on} onChange={flip} />
            {matesLive || sharing ? (
              <ToggleRow icon="person" title={MATE_WORDS.shareSwitch} caption={MATE_WORDS.shareCaption} value={sharing} onChange={flipShare} divider />
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
