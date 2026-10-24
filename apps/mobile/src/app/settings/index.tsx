/**
 * Settings (Release A, A7, docs/ux/MEMBER-APP-MAP.md §3.3), behind the Profile's gear: ONE page in 6
 * headed groups, like Hevy's — You · Workouts · Reminders and phone · Your gym · Your data · Help (the
 * groups and their rows: components/settings/settingsLines.ts). Each row opens its own page; the gym's
 * two rows act on the spot. Where it helps, a row says how that page is set now in one grey line
 * ("kg, km", "Rest 2:00", "Reminders on, 6:00 pm").
 */
import Constants from 'expo-constants';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Text, View } from 'react-native';

import { JoinedGymRows } from '@/components/settings/GymSettings';
import {
  healthLine,
  nextWeightLine,
  notificationsLine,
  onOffLine,
  settingsGroups,
  unitsLine,
  versionLine,
  weeklyGoalLine,
  widgetsLine,
  workoutsLine,
  type SettingsRowKey,
} from '@/components/settings/settingsLines';
import { LinkRow } from '@/components/stats/parts';
import { Icon, Screen, type IconName } from '@/components/ui';
import { getProfile } from '@/db/repos/userRepo';
import { FEATURES, profileParts } from '@/lib/features';
import { goBack } from '@/lib/goBack';
import { navigateOnce } from '@/lib/guardedAction';
import { useUnits } from '@/lib/useUnits';
import { canAddGymShortcut } from '@/shop/gymShortcut';
import { useGymShop } from '@/shop/gymStore';
import { useSettings } from '@/store/settingsStore';
import { color, space, type } from '@/theme/tokens';
import { PREVIOUS_FROM_CHOICES } from '@/tracker/db/historyScope';
import { healthState, type HealthState } from '@/tracker/phone/healthConnect';
import { usePhonePrefs } from '@/tracker/phone/phonePrefs';
import { fmtReminderTime } from '@/tracker/phone/reminders';
import { widgetsPlaced } from '@/tracker/phone/widgets';
import { plateSetupLine } from '@/tracker/services/plateMath';
import { fmtRest } from '@/tracker/services/restRules';
import { choiceLabel, REP_RANGE_CHOICES, WEIGHT_JUMP_CHOICES } from '@/tracker/services/targetChoices';
import { useMuscleTips } from '@/tracker/store/muscleTipsStore';
import { usePlateSetupFor } from '@/tracker/store/plateSetupStore';
import { useRestTimer } from '@/tracker/store/restTimerStore';
import { useTrackerPrefs } from '@/tracker/store/trackerPrefsStore';

// D4 = A: the AI coach and voice stay hidden until their phase (their page shows with them).
const PARTS = new Set(profileParts(FEATURES));

const ICON: Record<SettingsRowKey, IconName> = {
  profile: 'person',
  units: 'scale',
  coach: 'sparkle',
  weeklyGoal: 'target',
  rest: 'clock',
  nextWeight: 'trend',
  plates: 'dumbbell',
  lastTime: 'list',
  effort: 'gauge',
  muscleTips: 'sparkle',
  reminders: 'calendar',
  health: 'heart',
  widgets: 'home',
  gymJoin: 'key',
  gymLogo: 'home',
  gymLeave: 'key',
  backup: 'check',
  spreadsheet: 'list',
  import: 'import',
  erase: 'trash',
  news: 'sparkle',
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

/** A group's heading: Hevy's small grey caps over its rows. Read when drawn: gym branding repaints the tokens. */
function GroupHeading({ title }: { title: string }) {
  return (
    <Text
      accessibilityRole="header"
      style={{
        fontFamily: type.bodySemi,
        fontSize: type.size.caption,
        color: color.inkMuted,
        letterSpacing: 1.1,
        textTransform: 'uppercase',
        marginTop: space.lg,
        marginBottom: space.xs,
      }}
    >
      {title}
    </Text>
  );
}

export default function SettingsScreen() {
  const router = useRouter();
  const units = useSettings((s) => s.unitSystem);
  const shownUnits = useUnits();
  const remindersOn = usePhonePrefs((s) => s.remindersOn);
  const reminderMinutes = usePhonePrefs((s) => s.reminderMinutes);
  const restSec = useRestTimer((s) => s.defaultSec);
  const loadRest = useRestTimer((s) => s.loadDefault);
  const weeklyGoal = useTrackerPrefs((s) => s.weeklyGoal);
  const weightJump = useTrackerPrefs((s) => s.weightJump);
  const repRange = useTrackerPrefs((s) => s.repRange);
  const previousFrom = useTrackerPrefs((s) => s.previousFrom);
  const effortOn = useTrackerPrefs((s) => s.advancedSets);
  const tipsOn = useMuscleTips((s) => s.on);
  const plateSetup = usePlateSetupFor(shownUnits);
  const [health, setHealth] = useState<HealthState | null>(null);
  const [placed, setPlaced] = useState(0);
  const [name, setName] = useState<string | null>(null);
  // UAT U-G2: the gym joined in the app (the old typed "Your gym" answer is no longer asked, A2).
  const link = useGymShop((s) => s.link);
  // One page per tap, however fast the taps.
  const busy = useRef(false);

  useEffect(() => {
    loadRest().catch((e: unknown) => console.warn('[settings] default rest could not be read', e));
  }, [loadRest]);

  // Each visit (and each return to the app): a page may have changed what the rows say.
  const readState = useCallback(() => {
    void healthState()
      .then(setHealth)
      .catch(() => setHealth('none'));
    setPlaced(widgetsPlaced());
    void getProfile()
      .then((p) => setName(p?.name?.trim() || null))
      .catch((e: unknown) => console.warn('[settings] profile could not be read', e));
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

  const previous = PREVIOUS_FROM_CHOICES.find((c) => c.value === previousFrom) ?? PREVIOUS_FROM_CHOICES[0];
  const lines: Partial<Record<SettingsRowKey, string | null>> = {
    profile: name,
    units: unitsLine(units),
    weeklyGoal: weeklyGoalLine(weeklyGoal),
    rest: workoutsLine(fmtRest(restSec)),
    nextWeight: nextWeightLine(choiceLabel(WEIGHT_JUMP_CHOICES, weightJump), choiceLabel(REP_RANGE_CHOICES, repRange)),
    plates: plateSetupLine(plateSetup, shownUnits),
    lastTime: previous.label,
    effort: onOffLine(effortOn),
    muscleTips: onOffLine(tipsOn),
    reminders: notificationsLine(remindersOn, fmtReminderTime(reminderMinutes)),
    health: healthLine(health),
    widgets: widgetsLine(placed),
    gymJoin: 'Type your gym’s code or scan its poster',
    about: versionLine(Constants.expoConfig?.version),
  };

  const groups = settingsGroups({
    gymName: link?.gymName ?? null,
    canAddGymLogo: link ? canAddGymShortcut(link) : false,
    // Health Connect only on a build that carries it (as the old card left it out).
    hasHealth: health !== null && health !== 'none',
    coach: PARTS.has('aiCoach') || PARTS.has('voice'),
  });

  const open = (href: string): void => {
    // The Gym tab is a tab: switch to it rather than stack a page on Settings.
    if (href === '/shop') navigateOnce(busy, () => router.navigate('/shop'));
    else navigateOnce(busy, () => router.push(href as Href));
  };

  return (
    <Screen title="Settings" onBack={() => goBack(router, '/profile')}>
      <View style={{ gap: space.sm, paddingBottom: space.xl }}>
        {groups.map((g) => (
          <View key={g.title} style={{ gap: space.sm }}>
            <GroupHeading title={g.title} />
            {g.title === 'Your gym' && link ? (
              <JoinedGymRows link={link} leading={(k) => <Dot icon={ICON[k]} />} />
            ) : (
              g.rows.map((r) =>
                r.href ? (
                  <LinkRow
                    key={r.key}
                    title={r.title}
                    sub={lines[r.key] ?? undefined}
                    leading={<Dot icon={ICON[r.key]} />}
                    onPress={() => open(r.href as string)}
                  />
                ) : null,
              )
            )}
          </View>
        ))}
      </View>
    </Screen>
  );
}
