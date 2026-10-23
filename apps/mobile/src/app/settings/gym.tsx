/**
 * Settings → Your gym (redesign R6): the member's gym (gym sync stays hidden behind its flag, D4).
 *
 * UAT U-G2: a member who JOINED a gym in the app sees that gym here (it used to show the name typed
 * at onboarding), with My membership and "Leave <gym>" on its own row (R-77, owner 22 Oct 2026: the
 * old "Shop and leave" row was "so weird"; the shop is the gym's own tab). A member in no gym sees
 * the card as before (the name they typed, or "Not added yet"), why the phone left its gym when the
 * gym let it go, and (owner report, 17 Oct 2026) "Join your gym" with the gym's code under it. A
 * joined gym with a logo also has "Add to your home screen" (OWNER-INBOX #11): the gym's logo as a
 * shortcut that opens ForgeAI.
 */
import { useEffect, useRef, useState } from 'react';
import { AppState, Linking, Text } from 'react-native';

import { CloudCard } from '@/components/settings/CloudCard';
import { GymCard } from '@/components/settings/GymCard';
import { ToggleRow } from '@/components/settings/SettingRow';
import { JoinGymCard } from '@/components/settings/JoinGymCard';
import { SettingsPage } from '@/components/settings/SettingsPage';
import { LinkRow } from '@/components/stats/parts';
import { GlassCard } from '@/components/ui';
import { InlineError } from '@/components/ui/InlineError';
import { MembershipCard } from '@/shop/MembershipCard';
import { askAndLeaveGym } from '@/shop/leaveFlow';
import { DemoNote } from '@/shop/ShopParts';
import { useGymTheme } from '@/theme/gymTheme';
import { isBranded } from '@forgeai/theme';
import { addGymShortcut, canAddGymShortcut, gymShortcutWords, markShortcutOffered } from '@/shop/gymShortcut';
import { FEATURES, profileParts } from '@/lib/features';
import { useGymShop } from '@/shop/gymStore';
import { cancelGymReminders, refreshGymReminders } from '@/shop/gymReminders';
import { gymRemindersCaption } from '@/shop/autoReminders';
import { usePhonePrefs } from '@/tracker/phone/phonePrefs';
import { ensureAlertPermission, notificationsGranted } from '@/tracker/services/workoutAlerts';
import { useGymHydrated } from '@/shop/shopSource';
import type { GymLink } from '@/shop/types';
import { color, space, type } from '@/theme/tokens';

const PARTS = new Set(profileParts(FEATURES));

export default function GymPage() {
  const hydrated = useGymHydrated();
  const link = useGymShop((s) => s.link);
  // Why this phone is in no gym, when the gym let it go (shop/gymActions.ts → unlink(UNLINKED_TEXT)).
  const notice = useGymShop((s) => s.notice);
  return (
    <SettingsPage title="Your gym">
      {!hydrated ? null : link ? (
        <JoinedGymCard link={link} />
      ) : (
        <>
          {notice ? <DemoNote text={notice} /> : null}
          <GymCard />
          <JoinGymCard />
        </>
      )}
      {PARTS.has('gymSync') ? <CloudCard /> : null}
    </SettingsPage>
  );
}

function JoinedGymCard({ link }: { link: GymLink }) {
  const [words, setWords] = useState<string | null>(null);
  // Leave says what is still open and cancels the open orders first (shop/leaveFlow.ts, UAT U-G1).
  const look = useGymTheme((s) => s.look);
  const branded = look?.gymId === link.gymId && isBranded(look.brand);
  const leaving = useRef(false);
  const leave = async (): Promise<void> => {
    if (leaving.current) return;
    leaving.current = true;
    try {
      await askAndLeaveGym(branded);
    } finally {
      leaving.current = false;
    }
  };
  const busy = useRef(false);
  const addShortcut = async (): Promise<void> => {
    if (busy.current) return;
    busy.current = true;
    setWords(null);
    const r = await addGymShortcut(link);
    setWords(gymShortcutWords(r, link.gymName));
    // Added here: the Shop tab need not offer it again.
    if (r === 'asked' || r === 'updated') void markShortcutOffered(link.joinCode);
    busy.current = false;
  };
  return (
    <>
      <GlassCard>
        <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.caption, color: color.accentBright, letterSpacing: 1.4, textTransform: 'uppercase' }}>
          Your gym
        </Text>
        <Text style={{ fontFamily: type.display, fontSize: type.size.h2, color: color.ink, letterSpacing: -0.3, marginTop: space.sm }}>{link.gymName}</Text>
        <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.sub, color: color.inkSecondary, marginTop: 3 }}>
          {link.name.trim() ? `Joined in the app as ${link.name.trim()}` : 'Joined in the app'}
        </Text>
      </GlassCard>
      <MembershipCard link={link} />
      <GymRemindersSwitch gymName={link.gymName} />
      {canAddGymShortcut(link) ? (
        <LinkRow title="Add to your home screen" sub={`${link.gymName}'s logo on your home screen. It opens ForgeAI.`} onPress={() => void addShortcut()} />
      ) : null}
      <InlineError message={words} />
      <LinkRow title={`Leave ${link.gymName}`} sub="Your workouts stay on this phone." onPress={() => void leave()} />
    </>
  );
}

/**
 * R-86: "Reminders from my gym" — plan ending, birthday and the other automatic reminders the
 * owner switched on (shop/gymReminders.ts). On by default; off cancels every one at once.
 */
function GymRemindersSwitch({ gymName }: { gymName: string }) {
  const on = usePhonePrefs((s) => s.gymRemindersOn);
  // Review NIT 5: switched on but Android blocks ForgeAI's notifications: say so, with the way out.
  const [blocked, setBlocked] = useState(false);
  const check = (): void => {
    void notificationsGranted().then((g) => setBlocked(g === false));
  };
  useEffect(() => {
    check();
    // Back from Android's settings: read it again.
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') check();
    });
    return () => sub.remove();
  }, []);
  const flip = (v: boolean): void => {
    usePhonePrefs.getState().setGymRemindersOn(v);
    if (!v) {
      void cancelGymReminders();
      return;
    }
    // Switched on by the member: the one moment the app may ask for notifications for these.
    void ensureAlertPermission()
      .catch((e: unknown) => console.warn('[ForgeErr] gym reminders: asking for notifications', e))
      .then(() => {
        check();
        return refreshGymReminders();
      });
  };
  return (
    <>
      <GlassCard>
        <ToggleRow icon="calendar" title="Reminders from my gym" caption={gymRemindersCaption(gymName)} value={on} onChange={flip} />
      </GlassCard>
      {on && blocked ? (
        <LinkRow
          title="Notifications are off for ForgeAI"
          sub="No reminder from your gym can arrive. Turn them on in your phone's settings."
          onPress={() => void Linking.openSettings().catch((e: unknown) => console.warn('[ForgeErr] app settings did not open', e))}
        />
      ) : null}
    </>
  );
}
