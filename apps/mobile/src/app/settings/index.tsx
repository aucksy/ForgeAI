/**
 * Settings — redesign R6, Hevy's list of pages (PLAN §5), behind the Profile's gear. One row per
 * page: Your details · Workouts · Units · Notifications · Health Connect · Widgets · Your gym ·
 * Backup · Export & import · Your data · About. Where it helps, a row says how that page is set
 * now in one grey line ("kg, km", "Reminders on, 6:00 pm"). The old "Gym, backup and data" fold
 * is gone: it only existed to shorten the one long page.
 */
import Constants from 'expo-constants';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, View } from 'react-native';

import { healthLine, notificationsLine, SETTINGS_PAGES, unitsLine, versionLine, widgetsLine, workoutsLine, type SettingsPage } from '@/components/settings/settingsLines';
import { LinkRow } from '@/components/stats/parts';
import { Icon, Screen, type IconName } from '@/components/ui';
import { getProfile } from '@/db/repos/userRepo';
import { FEATURES, profileParts } from '@/lib/features';
import { goBack } from '@/lib/goBack';
import { navigateOnce } from '@/lib/guardedAction';
import { settingsGymName } from '@/shop/gym';
import { useGymShop } from '@/shop/gymStore';
import { useSettings } from '@/store/settingsStore';
import { color, space } from '@/theme/tokens';
import { healthState, type HealthState } from '@/tracker/phone/healthConnect';
import { usePhonePrefs } from '@/tracker/phone/phonePrefs';
import { fmtReminderTime } from '@/tracker/phone/reminders';
import { widgetsPlaced } from '@/tracker/phone/widgets';
import { fmtRest } from '@/tracker/services/restRules';
import { useRestTimer } from '@/tracker/store/restTimerStore';

// D4 = A: the AI coach and voice stay hidden until their phase (their page shows with them).
const PARTS = new Set(profileParts(FEATURES));

const ICON: Record<SettingsPage, IconName> = {
  details: 'person',
  workouts: 'dumbbell',
  units: 'scale',
  notifications: 'clock',
  health: 'heart',
  widgets: 'home',
  gym: 'key',
  backup: 'check',
  export: 'import',
  data: 'trash',
  feedback: 'chat',
  about: 'globe',
};

function Dot({ icon }: { icon: IconName }) {
  return (
    <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: color.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={icon} size={16} color={color.accent} />
    </View>
  );
}

export default function SettingsScreen() {
  const router = useRouter();
  const units = useSettings((s) => s.unitSystem);
  const remindersOn = usePhonePrefs((s) => s.remindersOn);
  const reminderMinutes = usePhonePrefs((s) => s.reminderMinutes);
  const restSec = useRestTimer((s) => s.defaultSec);
  const loadRest = useRestTimer((s) => s.loadDefault);
  const [health, setHealth] = useState<HealthState | null>(null);
  const [placed, setPlaced] = useState(0);
  const [name, setName] = useState<string | null>(null);
  const [gym, setGym] = useState<string | null>(null);
  // UAT U-G2: a gym joined in the app is named over the one typed at onboarding.
  const joinedGym = useGymShop((s) => s.link);
  // One page per tap, however fast the taps.
  const busy = useRef(false);

  useEffect(() => {
    void loadRest().catch(() => undefined);
  }, [loadRest]);

  // Each visit (and each return to the app): a page may have changed what the rows say.
  const readState = useCallback(() => {
    void healthState()
      .then(setHealth)
      .catch(() => setHealth('none'));
    setPlaced(widgetsPlaced());
    void getProfile()
      .then((p) => {
        setName(p?.name?.trim() || null);
        setGym(p?.gymName?.trim() || null);
      })
      .catch(() => undefined);
  }, []);
  useFocusEffect(
    useCallback(() => {
      readState();
      const sub = AppState.addEventListener('change', (a) => {
        if (a === 'active') readState();
      });
      return () => sub.remove();
    }, [readState]),
  );

  const lines: Record<SettingsPage, string | null> = {
    details: name,
    workouts: workoutsLine(fmtRest(restSec)),
    units: unitsLine(units),
    notifications: notificationsLine(remindersOn, fmtReminderTime(reminderMinutes)),
    health: healthLine(health),
    widgets: widgetsLine(placed),
    gym: settingsGymName(joinedGym, gym),
    backup: null,
    export: null,
    data: null,
    feedback: null,
    about: versionLine(Constants.expoConfig?.version),
  };

  const open = (href: Href): void => {
    navigateOnce(busy, () => router.push(href));
  };

  return (
    <Screen title="Settings" onBack={() => goBack(router, '/profile')}>
      <View style={{ gap: space.sm }}>
        {SETTINGS_PAGES.map((p) => {
          // Health Connect only on a build that carries it (as the old card left it out).
          if (p.key === 'health' && (health === null || health === 'none')) return null;
          const sub = lines[p.key] ?? undefined;
          return <LinkRow key={p.key} title={p.title} sub={sub} leading={<Dot icon={ICON[p.key]} />} onPress={() => open(`/settings/${p.key}` as Href)} />;
        })}
        {PARTS.has('aiCoach') || PARTS.has('voice') ? (
          <LinkRow title="AI coach" leading={<Dot icon="sparkle" />} onPress={() => open('/settings/coach')} />
        ) : null}
      </View>
    </Screen>
  );
}
