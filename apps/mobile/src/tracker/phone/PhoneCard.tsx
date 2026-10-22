/**
 * Settings → Notifications, Health Connect and Widgets (v0.27.0, tracker plan Phase 5; redesign
 * R6 gave each its own page — once one card, "Around your phone"). Each row says what it does
 * and what state it is in, with one Action Button where something can be done.
 *
 * Audit Phase 6: Health Connect says what "Send past workouts" really did (PH-03); reminders say
 * "Notifications are off — Turn on" when Android blocks them (PH-01, re-checked on every return
 * to the app), start on "your usual days and time", and pick the time with an hour and a
 * minute (5-minute steps) in a sheet (PH-06); every tap target is 48 dp tall (PH-11).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Pressable, Text, View } from 'react-native';

import { SettingRow, ToggleRow } from '@/components/settings/SettingRow';
import { Card, GhostButton, PrimaryButton, Sheet } from '@/components/ui';
import { askConfirm } from '@/components/ui/confirmStore';
import { tap } from '@/lib/haptics';
import { color, radius, space, type } from '@/theme/tokens';

import {
  COUNT_FAILED,
  HC_OPEN_FAILED,
  SEE_THEM_IN_GOOGLE_HEALTH,
  askHealthConnect,
  healthState,
  lastSentText,
  openHealthConnect,
  pastSendAsk,
  pastWorkoutsSummary,
  resendUnsentToHealth,
  sendAllWorkoutsToHealth,
  sendProgressText,
  sendResultText,
  unsentText,
  type HealthState,
  type SendResult,
} from './healthConnect';
import { usePhonePrefs } from './phonePrefs';
import { openFixFor } from '../services/restAlertAccess';
import {
  fmtNextReminder,
  fmtReminderTime,
  readUsualSlot,
  REMINDERS_FAILED,
  refreshReminders,
  reminderCaption,
  remindersBlocked,
  stepReminderHour,
  stepReminderMinute,
  type ReminderResult,
} from './reminders';
import { PIN_CHECK_MS, pinNotPlaced, placeWidget, refreshWidgets, widgetHintText, widgetsPlaced } from './widgets';

const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
/** PH-11 / design language: every tap target at least 48 dp. */
const TOUCH = 48;

// Read when drawn: gym branding repaints the tokens.
const CAPTION = () => ({ fontFamily: type.body, fontSize: type.size.caption, color: color.inkMuted, lineHeight: 15 }) as const;
const NONE: string[] = [];

function HealthRow() {
  const on = usePhonePrefs((s) => s.healthConnect);
  const setOn = usePhonePrefs((s) => s.setHealthConnect);
  const setUnsent = usePhonePrefs((s) => s.setHealthUnsent);
  const [state, setState] = useState<HealthState | null>(null);
  const [sent, setSent] = useState<SendResult | null>(null);
  const [busy, setBusy] = useState(false);
  // R-72: how far "Send past workouts" is, a notice instead of a send, and when workouts last went in.
  const [progress, setProgress] = useState<{ sent: number; total: number } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const last = usePhonePrefs((s) => s.healthLast);
  const lastLine = lastSentText(last);
  // v0.39.0: Connect was pressed and access is still off — Android shows no screen after two
  // refusals, so offer Health Connect's own page as the way round.
  const [asked, setAsked] = useState(false);
  // Audit M1: "Open Health Connect" opened nothing — say where to find it instead.
  const [openFailed, setOpenFailed] = useState(false);
  // Audit M2: finished workouts Health Connect refused, and the result of "Send again".
  const unsent = usePhonePrefs((s) => s.healthUnsent ?? NONE);
  const [resent, setResent] = useState<SendResult | null>(null);
  const [resending, setResending] = useState(false);

  const openHc = (): void => {
    tap();
    const opened = openHealthConnect();
    if (!opened) console.warn('[ForgeErr] Health Connect did not open');
    setOpenFailed(!opened);
  };

  // R-72 (owner, 22 Oct 2026: "it sent it without confirmation and without telling what it will do"):
  // first say how many workouts, from when to when, and where they go; send only on a yes.
  const sendPast = async (): Promise<void> => {
    if (busy) return;
    tap();
    setNotice(null);
    setSent(null);
    const summary = await pastWorkoutsSummary().catch((e: unknown) => {
      console.warn('[ForgeErr] health: past workouts could not be counted', e);
      return null;
    });
    if (!summary) {
      setNotice(COUNT_FAILED);
      return;
    }
    const ask = pastSendAsk(summary);
    if ('notice' in ask) {
      setNotice(ask.notice);
      return;
    }
    const yes = await askConfirm({ title: ask.title, body: ask.body, confirmLabel: ask.confirm, cancelLabel: 'Not now' });
    if (!yes) return;
    setBusy(true);
    setProgress(null);
    try {
      setSent(await sendAllWorkoutsToHealth((done, total) => setProgress({ sent: done, total })));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const resend = (): void => {
    if (resending) return;
    tap();
    setResending(true);
    setResent(null);
    void resendUnsentToHealth()
      .then((r) => setResent(r))
      .finally(() => setResending(false));
  };

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
          ? 'On. Each workout you finish goes to Health Connect as strength training, with its calories (an estimate), so Google Health and Samsung Health can show it.'
          : 'Send each finished workout and its calories to Google Health and Samsung Health, through Health Connect.';

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
                // Stopped on purpose: nothing is owed any more ("Send past workouts" after a
                // Connect again sends every workout).
                setUnsent([]);
                setResent(null);
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
            setAsked(true);
          }}
        />
      ) : null}
      {state === 'off' && asked ? (
        <View style={{ gap: space.xs, paddingBottom: space.sm }}>
          <Text style={{ ...CAPTION(), textAlign: 'center' }}>
            Nothing opened? Open Health Connect, find ForgeAI and allow it there.
          </Text>
          <GhostButton label="Open Health Connect" icon="heart" onPress={openHc} />
        </View>
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
      {state === 'update' ? <GhostButton label="Open Health Connect" icon="heart" onPress={openHc} /> : null}
      {openFailed && (state === 'off' || state === 'update') ? (
        <Text accessibilityLiveRegion="polite" style={{ ...CAPTION(), color: color.criticalText, textAlign: 'center', paddingBottom: space.sm }}>
          {HC_OPEN_FAILED}
        </Text>
      ) : null}
      {state === 'on' ? (
        <View style={{ gap: space.xs, paddingBottom: space.sm }}>
          {/* R-72: the member can always see that it works: when workouts last went in. */}
          {lastLine && !busy ? (
            <Text style={{ ...CAPTION(), textAlign: 'center', color: color.goodText }}>{lastLine}</Text>
          ) : null}
          <GhostButton
            label={busy ? sendProgressText(progress?.sent ?? 0, progress?.total ?? 0) : 'Send past workouts'}
            icon="heart"
            onPress={() => void sendPast()}
          />
          {notice ? (
            <Text accessibilityLiveRegion="polite" style={{ ...CAPTION(), textAlign: 'center' }}>
              {notice}
            </Text>
          ) : null}
          {sent != null ? (
            <Text accessibilityLiveRegion="polite" style={{ ...CAPTION(), textAlign: 'center', color: sent.kind === 'failed' ? color.criticalText : color.inkMuted }}>
              {sendResultText(sent)}
            </Text>
          ) : null}
          {sent?.kind === 'sent' ? (
            <>
              <Text style={{ ...CAPTION(), textAlign: 'center' }}>{SEE_THEM_IN_GOOGLE_HEALTH}</Text>
              <GhostButton label="Open Health Connect" icon="heart" onPress={openHc} />
            </>
          ) : null}
        </View>
      ) : null}
      {state === 'on' && (unsent.length > 0 || resent != null) ? (
        <View style={{ gap: space.xs, paddingBottom: space.sm }}>
          {unsent.length > 0 ? (
            <>
              <Text accessibilityLiveRegion="polite" style={{ ...CAPTION(), color: color.criticalText, textAlign: 'center' }}>
                {unsentText(unsent.length)}
              </Text>
              <GhostButton label={resending ? 'Sending…' : 'Send again'} icon="heart" onPress={resend} />
            </>
          ) : null}
          {resent != null ? (
            <Text accessibilityLiveRegion="polite" style={{ ...CAPTION(), textAlign: 'center' }}>
              {sendResultText(resent)}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function RemindersRow({ divider = true }: { divider?: boolean }) {
  const on = usePhonePrefs((s) => s.remindersOn);
  const days = usePhonePrefs((s) => s.reminderDays);
  const minutes = usePhonePrefs((s) => s.reminderMinutes);
  const chosen = usePhonePrefs((s) => s.reminderChosen);
  const setReminders = usePhonePrefs((s) => s.setReminders);
  const [next, setNext] = useState<ReminderResult>(null);
  const [blocked, setBlocked] = useState(false);
  const [picking, setPicking] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const failed = next === REMINDERS_FAILED;

  // Audit H2: setting them failed — try again, from scratch.
  const retry = (): void => {
    if (retrying) return;
    tap();
    setRetrying(true);
    void refreshReminders({ force: true })
      .then(setNext)
      .finally(() => setRetrying(false));
  };

  useEffect(() => {
    let alive = true;
    // Checked at once, not only after the reminders are set again (which waits behind any
    // refresh already running and, with `ask`, behind Android's permission question).
    if (on) void remindersBlocked().then((b) => alive && setBlocked(b === true));
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

  const caption = reminderCaption({
    on,
    blocked,
    next: typeof next === 'number' ? fmtNextReminder(next) : null,
    days: days.length,
    failed,
  });

  return (
    <View>
      <ToggleRow icon="clock" title="Workout reminders" caption={caption} value={on} onChange={switchOn} divider={divider} />
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
      {on && failed && !blocked && days.length > 0 ? (
        <View style={{ paddingBottom: space.md }}>
          <GhostButton label={retrying ? 'Setting…' : 'Try again'} icon="clock" onPress={retry} />
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
                    <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: sel ? color.onAccent : color.inkSecondary }}>{l}</Text>
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

function WidgetsRow({ divider = true }: { divider?: boolean }) {
  const [placed, setPlaced] = useState(0);
  const [hint, setHint] = useState<'refused' | 'notPlaced' | null>(null);
  // Audit H3: the widget count when a pin was asked for (null = none waiting). Android's "yes"
  // does not mean placed, so the count is read again when the member is back.
  const pinBefore = useRef<number | null>(null);
  const pinTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const settlePin = useCallback(() => {
    const now = widgetsPlaced();
    setPlaced(now);
    if (pinBefore.current == null) return;
    if (pinNotPlaced(pinBefore.current, now)) setHint('notPlaced');
    pinBefore.current = null;
    if (pinTimer.current) clearTimeout(pinTimer.current);
    pinTimer.current = null;
  }, []);

  useEffect(() => {
    setPlaced(widgetsPlaced());
    void refreshWidgets();
    let back: ReturnType<typeof setTimeout> | null = null;
    const sub = AppState.addEventListener('change', (a) => {
      if (a !== 'active') return;
      // A moment for the home screen to finish adding it.
      if (back) clearTimeout(back);
      back = setTimeout(settlePin, 700);
    });
    return () => {
      sub.remove();
      if (back) clearTimeout(back);
      if (pinTimer.current) clearTimeout(pinTimer.current);
    };
  }, [settlePin]);

  const add = (kind: 'today' | 'week'): void => {
    tap();
    void refreshWidgets();
    setHint(null);
    const before = widgetsPlaced();
    if (!placeWidget(kind)) {
      pinBefore.current = null;
      setHint('refused');
      return;
    }
    pinBefore.current = before;
    // Some home screens accept and show nothing, so the app never leaves: check after a while,
    // unless the member is still on the home screen's own "Add widget?" (checked on return).
    if (pinTimer.current) clearTimeout(pinTimer.current);
    pinTimer.current = setTimeout(() => {
      pinTimer.current = null;
      if (AppState.currentState === 'active') settlePin();
    }, PIN_CHECK_MS);
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
        divider={divider}
      />
      <View style={{ flexDirection: 'row', gap: space.sm, paddingBottom: space.sm }}>
        <View style={{ flex: 1 }}>
          <GhostButton label="Add Today" icon="plus" onPress={() => add('today')} />
        </View>
        <View style={{ flex: 1 }}>
          <GhostButton label="Add This week" icon="plus" onPress={() => add('week')} />
        </View>
      </View>
      {hint ? (
        <Text accessibilityLiveRegion="polite" style={{ ...CAPTION(), textAlign: 'center', paddingBottom: space.sm }}>
          {widgetHintText(hint)}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * Redesign R6: Settings is Hevy's list of pages, so the three rows also stand alone — one page
 * each (Notifications, Health Connect, Widgets), every control working exactly as on the card.
 */
export function RemindersCard() {
  return (
    <Card style={{ paddingVertical: space.xs }}>
      <RemindersRow divider={false} />
    </Card>
  );
}

export function HealthCard() {
  return (
    <Card style={{ paddingVertical: space.xs }}>
      <HealthRow />
    </Card>
  );
}

export function WidgetsCard() {
  return (
    <Card style={{ paddingVertical: space.xs }}>
      <WidgetsRow divider={false} />
    </Card>
  );
}
