/**
 * The gym's settings (Release A, docs/ux/MEMBER-APP-MAP.md §3.3, A4 and A10). Each lives in ONE place:
 *  - `JoinedGymRows`: Settings → Your gym, with a gym: "Gym logo on my home screen" (when the gym has a
 *    logo; OWNER-INBOX #11, the gym's logo as a shortcut that opens ForgeAI) and "Leave <gym>" (Leave
 *    says what is still open and cancels open orders first, UAT U-G1). The Gym tab no longer has a
 *    Leave at its foot, and My membership lives on the Gym tab only.
 *  - `GymRemindersSwitch`: "Reminders from my gym" (R-86), on the one Reminders page beside the
 *    workout reminders, no longer away on the gym's page.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, Linking } from 'react-native';

import { ToggleRow } from '@/components/settings/SettingRow';
import { LinkRow } from '@/components/stats/parts';
import { GlassCard } from '@/components/ui';
import { InlineError } from '@/components/ui/InlineError';
import { gymRemindersCaption } from '@/shop/autoReminders';
import { cancelGymReminders, refreshGymReminders } from '@/shop/gymReminders';
import { addGymShortcut, canAddGymShortcut, gymShortcutWords, markShortcutOffered } from '@/shop/gymShortcut';
import { askAndLeaveGym } from '@/shop/leaveFlow';
import type { GymLink } from '@/shop/types';
import { useGymTheme } from '@/theme/gymTheme';
import { usePhonePrefs } from '@/tracker/phone/phonePrefs';
import { ensureAlertPermission, notificationsGranted } from '@/tracker/services/workoutAlerts';
import { isBranded } from '@forgeai/theme';

/** "Gym logo on my home screen" (when it can) and "Leave <gym>": the Your gym group's rows. */
export function JoinedGymRows({ link, leading }: { link: GymLink; leading?: (key: 'gymLogo' | 'gymLeave') => ReactNode }) {
  const [words, setWords] = useState<string | null>(null);
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
    try {
      const r = await addGymShortcut(link);
      setWords(gymShortcutWords(r, link.gymName));
      // Added here: the Gym tab need not offer it again.
      if (r === 'asked' || r === 'updated') void markShortcutOffered(link.joinCode);
    } finally {
      busy.current = false;
    }
  };
  return (
    <>
      {canAddGymShortcut(link) ? (
        <LinkRow
          title="Gym logo on my home screen"
          sub={`${link.gymName}'s logo on your home screen. It opens MettleUp.`}
          leading={leading?.('gymLogo')}
          onPress={() => void addShortcut()}
        />
      ) : null}
      <InlineError message={words} />
      <LinkRow title={`Leave ${link.gymName}`} sub="Your workouts stay on this phone." leading={leading?.('gymLeave')} onPress={() => void leave()} />
    </>
  );
}

/**
 * R-86: "Reminders from my gym" — plan ending, birthday and the other automatic reminders the
 * owner switched on (shop/gymReminders.ts). On by default; off cancels every one at once.
 */
export function GymRemindersSwitch({ gymName }: { gymName: string }) {
  const on = usePhonePrefs((s) => s.gymRemindersOn);
  // Review NIT 5: switched on but Android blocks ForgeAI's notifications: say so, with the way out.
  const [blocked, setBlocked] = useState(false);
  useEffect(() => {
    const check = (): void => {
      void notificationsGranted().then((g) => setBlocked(g === false));
    };
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
      .then(async () => {
        const g = await notificationsGranted();
        setBlocked(g === false);
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
          title="Notifications are off for MettleUp"
          sub="No reminder from your gym can arrive. Turn them on in your phone's settings."
          onPress={() => void Linking.openSettings().catch((e: unknown) => console.warn('[ForgeErr] app settings did not open', e))}
        />
      ) : null}
    </>
  );
}
