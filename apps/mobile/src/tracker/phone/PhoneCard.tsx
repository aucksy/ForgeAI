/**
 * Profile → "Around your phone" (v0.27.0, tracker plan Phase 5): Health Connect, workout
 * reminders and home-screen widgets. One card, three plain rows; each says what it does and
 * what state it is in, with one Action Button where something can be done.
 */
import { useCallback, useEffect, useState } from 'react';
import { AppState, Pressable, Text, View } from 'react-native';

import { SettingRow, ToggleRow } from '@/components/settings/SettingRow';
import { Card, GhostButton } from '@/components/ui';
import { tap } from '@/lib/haptics';
import { color, radius, space, type } from '@/theme/tokens';

import {
  askHealthConnect,
  healthState,
  openHealthConnect,
  sendAllWorkoutsToHealth,
  type HealthState,
} from './healthConnect';
import { usePhonePrefs } from './phonePrefs';
import { fmtNextReminder, fmtReminderTime, refreshReminders } from './reminders';
import { placeWidget, refreshWidgets, widgetsPlaced } from './widgets';

const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const STEP_MIN = 30;

const CAPTION = { fontFamily: type.body, fontSize: type.size.caption, color: color.inkMuted, lineHeight: 15 } as const;

function HealthRow() {
  const on = usePhonePrefs((s) => s.healthConnect);
  const setOn = usePhonePrefs((s) => s.setHealthConnect);
  const [state, setState] = useState<HealthState | null>(null);
  const [sent, setSent] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const check = useCallback(async () => {
    setState(await healthState().catch(() => 'none' as const));
  }, []);

  // Re-checked on every return to the app — also after Health Connect's own screen.
  useEffect(() => {
    void check();
    const sub = AppState.addEventListener('change', (a) => {
      if (a === 'active') void check();
    });
    return () => sub.remove();
  }, [check, on]);

  if (state === null || state === 'none') return null;

  const caption =
    state === 'unavailable'
      ? 'Health Connect is not available on this phone.'
      : state === 'update'
        ? 'Install or update Health Connect from the Play Store first.'
        : state === 'on'
          ? 'On. Each workout you finish goes to Health Connect with its calories (an estimate), so Google Fit and Samsung Health show it.'
          : 'Send each finished workout and its calories to Google Fit and Samsung Health, through Health Connect.';

  return (
    <View>
      <SettingRow
        icon="heart"
        title="Health Connect"
        caption={caption}
        right={
          state === 'on' ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Stop sending to Health Connect"
              onPress={() => {
                tap();
                setOn(false);
                setSent(null);
              }}
              hitSlop={8}
            >
              <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: color.inkMuted }}>Stop</Text>
            </Pressable>
          ) : undefined
        }
      />
      {state === 'off' ? (
        <GhostButton
          label="Connect"
          icon="heart"
          onPress={() => {
            tap();
            // On from now; it only counts once Health Connect's screen allows it (checked on return).
            setOn(true);
            askHealthConnect();
          }}
        />
      ) : null}
      {state === 'allowed' ? (
        <GhostButton
          label="Turn on"
          icon="heart"
          onPress={() => {
            tap();
            setOn(true);
          }}
        />
      ) : null}
      {state === 'update' ? <GhostButton label="Open Health Connect" icon="heart" onPress={() => void openHealthConnect()} /> : null}
      {state === 'on' ? (
        <View style={{ gap: space.xs, paddingBottom: space.sm }}>
          <GhostButton
            label={busy ? 'Sending…' : 'Send past workouts'}
            icon="calendar"
            onPress={() => {
              if (busy) return;
              tap();
              setBusy(true);
              void sendAllWorkoutsToHealth()
                .then((n) => setSent(n))
                .finally(() => setBusy(false));
            }}
          />
          {sent != null ? (
            <Text style={{ ...CAPTION, textAlign: 'center' }}>
              {sent === 0
                ? 'Nothing sent. Workouts on demo data are never sent.'
                : `Sent ${sent} workout${sent === 1 ? '' : 's'} to Health Connect.`}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function RemindersRow() {
  const on = usePhonePrefs((s) => s.remindersOn);
  const days = usePhonePrefs((s) => s.reminderDays);
  const minutes = usePhonePrefs((s) => s.reminderMinutes);
  const setReminders = usePhonePrefs((s) => s.setReminders);
  const [next, setNext] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    void refreshReminders({ ask: on }).then((t) => alive && setNext(t));
    return () => {
      alive = false;
    };
  }, [on, days, minutes]);

  const toggleDay = (d: number): void => {
    tap();
    const set = new Set(days);
    if (set.has(d)) set.delete(d);
    else set.add(d);
    setReminders({ reminderDays: [...set].sort((a, b) => a - b) });
  };

  return (
    <View>
      <ToggleRow
        icon="clock"
        title="Workout reminders"
        caption={
          on
            ? next != null
              ? `Next: ${fmtNextReminder(next)}. No reminder on a day you already trained.`
              : days.length === 0
                ? 'Pick at least one day.'
                : 'Set. No reminder on a day you already trained.'
            : 'A quiet reminder on the days and at the time you choose.'
        }
        value={on}
        onChange={(v) => setReminders({ remindersOn: v })}
        divider
      />
      {on ? (
        <View style={{ gap: space.md, paddingBottom: space.md }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            {DAY_LETTERS.map((l, i) => {
              const sel = days.includes(i);
              return (
                <Pressable
                  key={i}
                  onPress={() => toggleDay(i)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: sel }}
                  accessibilityLabel={`Remind me on ${DAY_NAMES[i]}`}
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 19,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: sel ? color.accent : color.surfaceSunken,
                    borderWidth: 1,
                    borderColor: sel ? color.accent : color.border,
                  }}
                >
                  <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: sel ? color.bg : color.inkSecondary }}>{l}</Text>
                </Pressable>
              );
            })}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.lg }}>
            <TimeStep label="Earlier" sign="−" onPress={() => setReminders({ reminderMinutes: (minutes - STEP_MIN + 1440) % 1440 })} />
            <Text
              accessibilityLabel={`Reminder time ${fmtReminderTime(minutes)}`}
              style={{ fontFamily: type.monoBold, fontSize: type.size.h3, color: color.ink, minWidth: 96, textAlign: 'center' }}
            >
              {fmtReminderTime(minutes)}
            </Text>
            <TimeStep label="Later" sign="+" onPress={() => setReminders({ reminderMinutes: (minutes + STEP_MIN) % 1440 })} />
          </View>
        </View>
      ) : null}
    </View>
  );
}

function TimeStep({ label, sign, onPress }: { label: string; sign: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={() => {
        tap();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={`Remind me ${label.toLowerCase()}`}
      hitSlop={6}
      style={{
        width: 44,
        height: 44,
        borderRadius: radius.md,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: color.surfaceSunken,
        borderWidth: 1,
        borderColor: color.border,
      }}
    >
      <Text style={{ fontFamily: type.monoBold, fontSize: type.size.h3, color: color.ink }}>{sign}</Text>
    </Pressable>
  );
}

function WidgetsRow() {
  const [placed, setPlaced] = useState(0);
  const [refused, setRefused] = useState(false);

  useEffect(() => {
    setPlaced(widgetsPlaced());
    void refreshWidgets();
    const sub = AppState.addEventListener('change', (a) => {
      if (a === 'active') setPlaced(widgetsPlaced());
    });
    return () => sub.remove();
  }, []);

  const add = (kind: 'today' | 'week'): void => {
    tap();
    void refreshWidgets();
    setRefused(!placeWidget(kind));
  };

  return (
    <View>
      <SettingRow
        icon="home"
        title="Home-screen widgets"
        caption={
          placed > 0
            ? `${placed} on your home screen. Add another, or long-press your home screen → Widgets → ForgeAI.`
            : "Today's workout and your week, on your home screen."
        }
        divider
      />
      <View style={{ flexDirection: 'row', gap: space.sm, paddingBottom: space.sm }}>
        <View style={{ flex: 1 }}>
          <GhostButton label="Add Today" icon="plus" onPress={() => add('today')} />
        </View>
        <View style={{ flex: 1 }}>
          <GhostButton label="Add This week" icon="plus" onPress={() => add('week')} />
        </View>
      </View>
      {refused ? (
        <Text style={{ ...CAPTION, textAlign: 'center', paddingBottom: space.sm }}>
          Your home screen can't add it from here. Long-press your home screen → Widgets → ForgeAI.
        </Text>
      ) : null}
    </View>
  );
}

export function PhoneCard() {
  return (
    <Card style={{ paddingVertical: space.xs }}>
      <HealthRow />
      <RemindersRow />
      <WidgetsRow />
    </Card>
  );
}
