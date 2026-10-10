/**
 * Profile → "Around your phone" (v0.27.0, tracker plan Phase 5): Health Connect, workout
 * reminders and home-screen widgets. One card, three plain rows; each says what it does and
 * what state it is in, with one Action Button where something can be done.
 *
 * Audit Phase 6: Health Connect says what "Send past workouts" really did (PH-03); reminders say
 * "Notifications are off — Turn on" when Android blocks them (PH-01, re-checked on every return
 * to the app), start on "your usual days and time", and pick the time with an hour and a
 * minute (5-minute steps) in a sheet (PH-06); every tap target is 48 dp tall (PH-11).
 */
import { useCallback, useEffect, useState } from 'react';
import { AppState, Pressable, Text, View } from 'react-native';

import { SettingRow, ToggleRow } from '@/components/settings/SettingRow';
import { Card, GhostButton, PrimaryButton, Sheet } from '@/components/ui';
import { tap } from '@/lib/haptics';
import { color, radius, space, type } from '@/theme/tokens';

import {
  askHealthConnect,
  healthState,
  openHealthConnect,
  sendAllWorkoutsToHealth,
  sendResultText,
  type HealthState,
  type SendResult,
} from './healthConnect';
import { usePhonePrefs } from './phonePrefs';
import { openFixFor } from '../services/restAlertAccess';
import {
  fmtNextReminder,
  fmtReminderTime,
  readUsualSlot,
  refreshReminders,
  reminderCaption,
  remindersBlocked,
  stepReminderHour,
  stepReminderMinute,
} from './reminders';
import { placeWidget, refreshWidgets, widgetsPlaced } from './widgets';

const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
/** PH-11 / design language: every tap target at least 48 dp. */
const TOUCH = 48;

const CAPTION = { fontFamily: type.body, fontSize: type.size.caption, color: color.inkMuted, lineHeight: 15 } as const;

function HealthRow() {
  const on = usePhonePrefs((s) => s.healthConnect);
  const setOn = usePhonePrefs((s) => s.setHealthConnect);
  const [state, setState] = useState<HealthState | null>(null);
  const [sent, setSent] = useState<SendResult | null>(null);
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
              style={{ minHeight: TOUCH, minWidth: TOUCH, alignItems: 'center', justifyContent: 'center' }}
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
            icon="heart"
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
            <Text accessibilityLiveRegion="polite" style={{ ...CAPTION, textAlign: 'center' }}>
              {sendResultText(sent)}
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
  const chosen = usePhonePrefs((s) => s.reminderChosen);
  const setReminders = usePhonePrefs((s) => s.setReminders);
  const [next, setNext] = useState<number | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    let alive = true;
    void refreshReminders({ ask: on }).then((t) => {
      if (!alive) return;
      setNext(t);
      // After the permission prompt (if any) has been answered.
      if (on) void remindersBlocked().then((b) => alive && setBlocked(b === true));
    });
    return () => {
      alive = false;
    };
  }, [on, days, minutes]);

  // PH-01: re-checked on every return — also after Android's notification settings.
  useEffect(() => {
    if (!on) {
      setBlocked(false);
      return;
    }
    const sub = AppState.addEventListener('change', (a) => {
      if (a !== 'active') return;
      void remindersBlocked().then((b) => setBlocked(b === true));
      void refreshReminders().then(setNext);
    });
    return () => sub.remove();
  }, [on]);

  const switchOn = (v: boolean): void => {
    if (!v || chosen) {
      setReminders({ remindersOn: v });
      return;
    }
    // Owner pick: the first time, your usual training days and time.
    void readUsualSlot().then((slot) => setReminders({ remindersOn: true, reminderDays: slot.days, reminderMinutes: slot.minutes }));
  };

  const toggleDay = (d: number): void => {
    tap();
    const set = new Set(days);
    if (set.has(d)) set.delete(d);
    else set.add(d);
    setReminders({ reminderDays: [...set].sort((a, b) => a - b), reminderChosen: true });
  };

  const caption = reminderCaption({ on, blocked, next: next != null ? fmtNextReminder(next) : null, days: days.length });

  return (
    <View>
      <ToggleRow icon="clock" title="Workout reminders" caption={caption} value={on} onChange={switchOn} divider />
      {on && blocked ? (
        <View style={{ paddingBottom: space.md }}>
          <GhostButton
            label="Turn on notifications"
            icon="clock"
            onPress={() => {
              tap();
              openFixFor('off');
            }}
          />
        </View>
      ) : null}
      {on ? (
        <View style={{ gap: space.md, paddingBottom: space.md }}>
          <View style={{ flexDirection: 'row' }}>
            {DAY_LETTERS.map((l, i) => {
              const sel = days.includes(i);
              return (
                // The whole cell is the target (48 dp tall, the full seventh of the row).
                <Pressable
                  key={i}
                  onPress={() => toggleDay(i)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: sel }}
                  accessibilityLabel={`Remind me on ${DAY_NAMES[i]}`}
                  style={{ flex: 1, height: TOUCH, alignItems: 'center', justifyContent: 'center' }}
                >
                  <View
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
                  </View>
                </Pressable>
              );
            })}
          </View>
          <Pressable
            onPress={() => {
              tap();
              setPicking(true);
            }}
            accessibilityRole="button"
            accessibilityLabel={`Reminder time ${fmtReminderTime(minutes)}. Change`}
            style={{
              minHeight: TOUCH,
              alignSelf: 'center',
              flexDirection: 'row',
              alignItems: 'center',
              gap: space.sm,
              paddingHorizontal: space.lg,
              borderRadius: radius.md,
              backgroundColor: color.surfaceSunken,
              borderWidth: 1,
              borderColor: color.border,
            }}
          >
            <Text style={{ fontFamily: type.monoBold, fontSize: type.size.h3, color: color.ink }}>{fmtReminderTime(minutes)}</Text>
            <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: color.accent }}>Change</Text>
          </Pressable>
        </View>
      ) : null}
      <ReminderTimeSheet
        visible={picking}
        minutes={minutes}
        onClose={() => setPicking(false)}
        onDone={(m) => {
          setPicking(false);
          setReminders({ reminderMinutes: m, reminderChosen: true });
        }}
      />
    </View>
  );
}

/** PH-06: the reminder time — the hour and the minutes (5-minute steps), each on its own. */
function ReminderTimeSheet({
  visible,
  minutes,
  onClose,
  onDone,
}: {
  visible: boolean;
  minutes: number;
  onClose: () => void;
  onDone: (minutes: number) => void;
}) {
  const [m, setM] = useState(minutes);
  useEffect(() => {
    if (visible) setM(minutes);
  }, [visible, minutes]);
  const h24 = Math.floor(m / 60);
  const hourLabel = `${h24 % 12 === 0 ? 12 : h24 % 12} ${h24 < 12 ? 'am' : 'pm'}`;
  const minLabel = `:${String(m % 60).padStart(2, '0')}`;
  return (
    <Sheet
      visible={visible}
      title="Reminder time"
      subtitle={fmtReminderTime(m)}
      onClose={onClose}
      footer={<PrimaryButton label="Set time" onPress={() => onDone(m)} />}
    >
      <View style={{ gap: space.md, paddingVertical: space.sm }}>
        <TimeStepRow what="hour" value={hourLabel} onStep={(d) => setM((x) => stepReminderHour(x, d))} />
        <TimeStepRow what="minutes" value={minLabel} onStep={(d) => setM((x) => stepReminderMinute(x, d))} />
      </View>
    </Sheet>
  );
}

function TimeStepRow({ what, value, onStep }: { what: 'hour' | 'minutes'; value: string; onStep: (dir: 1 | -1) => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.lg }}>
      <TimeStep label={what === 'hour' ? 'One hour earlier' : 'Five minutes earlier'} sign="−" onPress={() => onStep(-1)} />
      <Text
        accessibilityLabel={what === 'hour' ? `Hour ${value}` : `Minutes ${value.slice(1)}`}
        style={{ fontFamily: type.monoBold, fontSize: type.size.h3, color: color.ink, minWidth: 96, textAlign: 'center' }}
      >
        {value}
      </Text>
      <TimeStep label={what === 'hour' ? 'One hour later' : 'Five minutes later'} sign="+" onPress={() => onStep(1)} />
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
      accessibilityLabel={label}
      style={{
        width: TOUCH,
        height: TOUCH,
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
