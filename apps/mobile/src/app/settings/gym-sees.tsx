/**
 * Settings → Your gym → What my gym can see (R-133). One switch: "Show my name on my gym's
 * leaderboard", off by default (other members then see "A member"). Flipping it tells the gym at
 * once; with no signal the change is kept and sent again (leaderboardPush.ts). Until the gym's
 * leaderboard has answered in this app session the page only says it is not switched on yet. No gym
 * joined: the Gym tab's join screen.
 */
import { Redirect } from 'expo-router';
import { Text } from 'react-native';

import { SettingsPage } from '@/components/settings/SettingsPage';
import { ToggleRow } from '@/components/settings/SettingRow';
import { GlassCard } from '@/components/ui';
import { BOARD_WORDS } from '@/shop/boardWords';
import { useGymShop } from '@/shop/gymStore';
import { useGymHydrated } from '@/shop/shopSource';
import { useBoardLive } from '@/shop/useBoardLive';
import { color, type } from '@/theme/tokens';
import { usePhonePrefs } from '@/tracker/phone/phonePrefs';

export default function GymSeesPage() {
  const hydrated = useGymHydrated();
  const link = useGymShop((s) => s.link);
  const live = useBoardLive(link);
  const on = usePhonePrefs((s) => s.showNameOnBoard);
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
  const body = { fontFamily: type.body, fontSize: type.size.sub, lineHeight: 20, color: color.inkSecondary } as const;
  return (
    <SettingsPage title={BOARD_WORDS.seesTitle}>
      {live ? (
        <>
          <Text style={body}>{BOARD_WORDS.seesIntro}</Text>
          <GlassCard>
            <ToggleRow icon="trophy" title={BOARD_WORDS.nameSwitch} caption={BOARD_WORDS.nameCaption} value={on} onChange={flip} />
          </GlassCard>
        </>
      ) : (
        <Text style={body}>{BOARD_WORDS.notLive}</Text>
      )}
    </SettingsPage>
  );
}
