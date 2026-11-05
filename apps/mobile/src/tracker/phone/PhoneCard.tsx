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
import { useGymShop } from '@/shop/gymStore';
import { tap } from '@/lib/haptics';
import { color, radius, space, type } from '@/theme/tokens';

import {
  COUNT_FAILED,
  HC_CALORIES_OFF,
  HC_NOTHING_NEW,
  HC_NOT_ALLOWED,
  HC_OLDER_LEFT_OUT,
  HC_OPEN_FAILED,
  HC_SEND_OLDER,
  HC_REMOVED,
  HC_REMOVE_ASK,
  HC_REMOVE_FAILED,
  HC_STOPPED,
  SEE_THEM_IN_GOOGLE_HEALTH,
  askHealthConnect,
  canRemoveHealthAccess,
  healthCheck,
  lastSentText,
  olderSendAsk,
  openHealthConnect,
  pastSendAsk,
  pastSince,
  pastWorkoutsSummary,
  removeHealthAccess,
  resendUnsentToHealth,
  sendAllWorkoutsToHealth,
  sendProgressText,
  sendResultText,
  unsentText,
  type HealthState,
  type SendResult,
} from './healthConnect';
import {
  HC_STEPS_ABOUT,
  HC_STEPS_ERROR,
  HC_STEPS_NOT_ALLOWED,
  HC_STEPS_TITLE,
  HC_WEIGHT_ABOUT,
  HC_WEIGHT_NOT_ALLOWED,
  HC_WEIGHT_ON,
  HC_WEIGHT_STOPPED,
  HC_WEIGHT_TITLE,
  askHealthRead,
  canReadHealth,
  healthReadAccess,
  readHealthWeights,
  readStepsToday,
  stepsText,
  weightResultText,
  type HealthReadAccess,
  type StepsResult,
} from './healthRead';
import { usePhonePrefs } from './phonePrefs';
import { askSleep, canReadSleep, SLEEP_ABOUT, SLEEP_NOT_ALLOWED, SLEEP_ON, SLEEP_TITLE, sleepAccess } from './sleepLink';
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
import { PIN_CHECK_MS, pinNotPlaced, placeWidget, refreshWidgets, widgetHintText, widgetsPlaced, type WidgetKind } from './widgets';

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
  // "Stop and remove MettleUp's access" was used: look again, so the row shows Off.
  const revoked = usePhonePrefs((s) => s.healthRevoked);
  const [state, setState] = useState<HealthState | null>(null);
  // 24 Oct 2026: calories have their own switch in Health Connect; workouts go without them.
  const [calories, setCalories] = useState(true);
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
  // 0.56.0: workouts from before MettleUp first ran (the old ForgeAI app's), left out by default.
  const [older, setOlder] = useState(0);
  // R-267: "Stop" says what it did, and that the workouts already sent stay in Health Connect.
  const [stopped, setStopped] = useState(false);

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
    // 0.56.0: by default only workouts logged in MettleUp (started after its first run here).
    const since = await pastSince();
    const summary = await pastWorkoutsSummary(since).catch((e: unknown) => {
      console.warn('[ForgeErr] health: past workouts could not be counted', e);
      return null;
    });
    if (!summary) {
      setNotice(COUNT_FAILED);
      return;
    }
    setOlder(summary.older ?? 0);
    const ask = summary.count === 0 && (summary.older ?? 0) > 0 && !summary.demo ? { notice: HC_NOTHING_NEW } : pastSendAsk(summary, undefined, calories);
    if ('notice' in ask) {
      setNotice(ask.notice);
      return;
    }
    const yes = await askConfirm({ title: ask.title, body: ask.body, confirmLabel: ask.confirm, cancelLabel: 'Not now' });
    if (!yes) return;
    await sendNow(since);
  };

  // 0.56.0: "Send older workouts too": every workout, after a yes that says they may show twice.
  const sendOlder = async (): Promise<void> => {
    if (busy) return;
    tap();
    setNotice(null);
    setSent(null);
    const summary = await pastWorkoutsSummary(null).catch((e: unknown) => {
      console.warn('[ForgeErr] health: past workouts could not be counted', e);
      return null;
    });
    if (!summary) {
      setNotice(COUNT_FAILED);
      return;
    }
    const ask = olderSendAsk(summary, undefined, calories);
    if ('notice' in ask) {
      setNotice(ask.notice);
      return;
    }
    const yes = await askConfirm({ title: ask.title, body: ask.body, confirmLabel: ask.confirm, cancelLabel: 'Not now' });
    if (!yes) return;
    await sendNow(null);
  };

  const sendNow = async (since: number | null): Promise<void> => {
    setBusy(true);
    setProgress(null);
    try {
      setSent(await sendAllWorkoutsToHealth((done, total) => setProgress({ sent: done, total }), since));
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

  // 24 Oct 2026: only the newest look counts (a slow older one never overwrites it).
  const looks = useRef(0);
  const check = useCallback(async () => {
    const mine = ++looks.current;
    const r = await healthCheck().catch((e: unknown) => {
      console.warn('[ForgeErr] health: Health Connect could not be checked', e);
      return null;
    });
    if (mine !== looks.current || !r) return;
    setState(r.state);
    setCalories(r.calories);
  }, []);

  // 0.56.0: how many older workouts are left out, so the line and "Send older workouts too" show up front.
  useEffect(() => {
    if (state !== 'on') return;
    let live = true;
    void (async () => {
      const since = await pastSince();
      if (since == null) return;
      const summary = await pastWorkoutsSummary(since).catch((e: unknown) => {
        console.warn('[ForgeErr] health: older workouts could not be counted', e);
        return null;
      });
      if (live && summary && !summary.demo) setOlder(summary.older ?? 0);
    })();
    return () => {
      live = false;
    };
  }, [state]);

  // Re-checked on every return to the app — also after Health Connect's own screen.
  useEffect(() => {
    void check();
    const sub = AppState.addEventListener('change', (a) => {
      if (a === 'active') void check();
    });
    return () => sub.remove();
  }, [check, on, revoked]);

  if (state === null || state === 'none') return null;

  const caption =
    state === 'unavailable'
      ? 'Health Connect is not available on this phone.'
      : state === 'update'
        ? 'Install or update Health Connect from the Play Store first.'
        : state === 'on'
          ? calories
            ? 'On. Each workout you finish goes to Health Connect as strength training, with its calories (an estimate), so Google Health and Samsung Health can show it.'
            : 'On. Each workout you finish goes to Health Connect as strength training, so Google Health and Samsung Health can show it.'
          : state === 'off' && on && !asked
            ? HC_NOT_ALLOWED
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
                setStopped(true);
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
            Nothing opened? Open Health Connect, find MettleUp and allow it there.
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
            setStopped(false);
          }}
        />
      ) : null}
      {state === 'allowed' && stopped ? (
        <View style={{ gap: space.xs, paddingBottom: space.sm }}>
          <Text accessibilityLiveRegion="polite" style={{ ...CAPTION(), textAlign: 'center' }}>
            {HC_STOPPED}
          </Text>
          <GhostButton label="Open Health Connect" icon="heart" onPress={openHc} />
          {openFailed ? (
            <Text accessibilityLiveRegion="polite" style={{ ...CAPTION(), color: color.criticalText, textAlign: 'center' }}>
              {HC_OPEN_FAILED}
            </Text>
          ) : null}
        </View>
      ) : null}
      {state === 'update' ? <GhostButton label="Open Health Connect" icon="heart" onPress={openHc} /> : null}
      {openFailed && (state === 'off' || state === 'update') ? (
        <Text accessibilityLiveRegion="polite" style={{ ...CAPTION(), color: color.criticalText, textAlign: 'center', paddingBottom: space.sm }}>
          {HC_OPEN_FAILED}
        </Text>
      ) : null}
      {state === 'on' && !calories ? (
        <View style={{ gap: space.xs, paddingBottom: space.sm }}>
          <Text style={{ ...CAPTION(), textAlign: 'center' }}>{HC_CALORIES_OFF}</Text>
          <GhostButton label="Open Health Connect" icon="heart" onPress={openHc} />
          {openFailed ? (
            <Text accessibilityLiveRegion="polite" style={{ ...CAPTION(), color: color.criticalText, textAlign: 'center' }}>
              {HC_OPEN_FAILED}
            </Text>
          ) : null}
        </View>
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
          {older > 0 && !busy ? (
            <>
              <Text style={{ ...CAPTION(), textAlign: 'center' }}>{HC_OLDER_LEFT_OUT}</Text>
              <GhostButton label={HC_SEND_OLDER} icon="heart" onPress={() => void sendOlder()} />
            </>
          ) : null}
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
              {/* Calories refused: the same button already shows above. */}
              {calories ? <GhostButton label="Open Health Connect" icon="heart" onPress={openHc} /> : null}
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
  const inGym = useGymShop((g) => g.link != null);
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

  const add = (kind: WidgetKind): void => {
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
            ? `${placed} on your home screen. Add another, or long-press your home screen → Widgets → MettleUp.`
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
      {/* R-320: "Gym right now" (how busy the gym is, tap to check in), for a phone in a gym (R-106: gym-only). */}
      {inGym ? (
        <View style={{ paddingBottom: space.sm, gap: space.xs }}>
          <GhostButton label="Add Gym right now" icon="plus" onPress={() => add('gym')} />
          <Text style={{ ...CAPTION(), textAlign: 'center' }}>How busy your gym is now. Tap it to check in.</Text>
        </View>
      ) : null}
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

/**
 * "Stop and remove MettleUp's access" (1 Nov 2026), next to Stop: every Health Connect permission
 * is taken back after a yes, and the page then shows everything off.
 */
function RemoveAccessRow() {
  const sending = usePhonePrefs((s) => s.healthConnect);
  const weightOn = usePhonePrefs((s) => s.healthWeightOn);
  const stepsOn = usePhonePrefs((s) => s.healthStepsOn);
  const sleepOn = usePhonePrefs((s) => s.sleepLinkOn);
  const revoked = usePhonePrefs((s) => s.healthRevoked);
  const [held, setHeld] = useState(false);
  const [done, setDone] = useState<'removed' | 'failed' | null>(null);
  const [busy, setBusy] = useState(false);

  const check = useCallback(async () => {
    const [c, r, sl] = await Promise.all([
      healthCheck().catch((e: unknown) => {
        console.warn('[ForgeErr] health: Health Connect could not be checked', e);
        return null;
      }),
      healthReadAccess(),
      sleepAccess(),
    ]);
    const write = c != null && (c.state === 'on' || c.state === 'allowed');
    const read = (r != null && r !== 'error' && (r.weight || r.steps)) || sl === true;
    setHeld(write || read);
  }, []);

  useEffect(() => {
    void check();
    const sub = AppState.addEventListener('change', (a) => {
      if (a === 'active') void check();
    });
    return () => sub.remove();
  }, [check, sending, weightOn, stepsOn, sleepOn, revoked]);

  if (!canRemoveHealthAccess()) return null;
  if (done === 'removed') {
    return (
      <Text accessibilityLiveRegion="polite" style={{ ...CAPTION(), textAlign: 'center', paddingBottom: space.sm }}>
        {HC_REMOVED}
      </Text>
    );
  }
  if (!held || revoked) return null;

  const remove = async (): Promise<void> => {
    if (busy) return;
    tap();
    const yes = await askConfirm({ title: HC_REMOVE_ASK.title, body: HC_REMOVE_ASK.body, confirmLabel: HC_REMOVE_ASK.confirm, cancelLabel: 'Not now', destructive: true });
    if (!yes) return;
    setBusy(true);
    try {
      setDone((await removeHealthAccess()) ? 'removed' : 'failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ gap: space.xs, paddingBottom: space.sm }}>
      <GhostButton label={busy ? 'Removing…' : "Stop and remove MettleUp's access"} icon="close" onPress={() => void remove()} />
      {done === 'failed' ? (
        <Text accessibilityLiveRegion="polite" style={{ ...CAPTION(), color: color.criticalText, textAlign: 'center' }}>
          {HC_REMOVE_FAILED}
        </Text>
      ) : null}
    </View>
  );
}

/** A small "Stop" on the right of a Health Connect row (48 dp target). */
function StopButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={{ minHeight: TOUCH, minWidth: TOUCH, alignItems: 'center', justifyContent: 'center' }}
    >
      <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: color.inkMuted }}>Stop</Text>
    </Pressable>
  );
}

type ReadLook = HealthReadAccess | 'error' | null | undefined;

/** The read permissions, looked at on show, on every return to the app and when `a` / `b` change. */
function useReadAccess(a: unknown, b: unknown): ReadLook {
  const [access, setAccess] = useState<ReadLook>(undefined);
  const looks = useRef(0);
  const recheck = useCallback(async () => {
    const mine = ++looks.current;
    const got = await healthReadAccess();
    // Could not ask this time: keep what was shown (never flip to Off on a hiccup).
    if (mine === looks.current) setAccess((prev) => (got === 'error' && prev != null ? prev : got));
  }, []);
  useEffect(() => {
    void recheck();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void recheck();
    });
    return () => sub.remove();
  }, [recheck, a, b]);
  return access;
}

/** F55: weigh-ins from Health Connect go into the body-weight log, after the member's yes. */
function WeightRow() {
  const on = usePhonePrefs((s) => s.healthWeightOn);
  const revoked = usePhonePrefs((s) => s.healthRevoked);
  const setRead = usePhonePrefs((s) => s.setHealthRead);
  const access = useReadAccess(on, revoked);
  const allowed = access != null && access !== 'error' && access.weight;
  const [line, setLine] = useState<{ text: string; bad: boolean } | null>(null);
  const [stopped, setStopped] = useState(false);
  const [openFailed, setOpenFailed] = useState(false);
  // The member just said yes: read at once, without the 10-minute wait.
  const fresh = useRef(false);

  useEffect(() => {
    if (!on || !allowed) return;
    let live = true;
    const force = fresh.current;
    fresh.current = false;
    void readHealthWeights({ force }).then((r) => {
      const t = weightResultText(r);
      if (!live || !t) return;
      // Automatic reads speak up only when something was added or went wrong.
      if (force || r.kind === 'error' || (r.kind === 'added' && r.added > 0)) setLine({ text: t, bad: r.kind === 'error' });
    });
    return () => {
      live = false;
    };
  }, [on, allowed]);

  if (access === undefined || access === null) return null;

  const start = (): void => {
    tap();
    setStopped(false);
    setLine(null);
    fresh.current = true;
    setRead({ healthWeightOn: true, healthRevoked: false });
    // Already allowed (from before a Stop): nothing to ask.
    if (!allowed) askHealthRead(['weight']);
  };
  const openHc = (): void => {
    tap();
    const opened = openHealthConnect();
    if (!opened) console.warn('[ForgeErr] Health Connect did not open');
    setOpenFailed(!opened);
  };

  const shownOn = on && (allowed || access === 'error');
  const caption = shownOn ? HC_WEIGHT_ON : on ? HC_WEIGHT_NOT_ALLOWED : stopped ? HC_WEIGHT_STOPPED : HC_WEIGHT_ABOUT;

  return (
    <View>
      <SettingRow
        icon="scale"
        title={HC_WEIGHT_TITLE}
        caption={caption}
        right={
          shownOn ? (
            <StopButton
              label="Stop adding weigh-ins from Health Connect"
              onPress={() => {
                tap();
                setRead({ healthWeightOn: false });
                setLine(null);
                setStopped(true);
              }}
            />
          ) : undefined
        }
      />
      {!on ? <GhostButton label="Read my weight" icon="scale" onPress={start} /> : null}
      {on && !shownOn ? (
        <View style={{ gap: space.xs, paddingBottom: space.sm }}>
          <GhostButton label="Read my weight" icon="scale" onPress={start} />
          <GhostButton label="Open Health Connect" icon="heart" onPress={openHc} />
        </View>
      ) : null}
      {openFailed ? (
        <Text accessibilityLiveRegion="polite" style={{ ...CAPTION(), color: color.criticalText, textAlign: 'center', paddingBottom: space.sm }}>
          {HC_OPEN_FAILED}
        </Text>
      ) : null}
      {shownOn && line ? (
        <Text
          accessibilityLiveRegion="polite"
          style={{ ...CAPTION(), textAlign: 'center', paddingBottom: space.sm, color: line.bad ? color.criticalText : color.goodText }}
        >
          {line.text}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * F62: today's steps, on this page only (builder's pick, 1 Nov 2026): the Workout tab shows one
 * card at a time for the gym day, and steps there would push "Up next" down for every member,
 * also those who never connect Health Connect. Here they sit next to their permission.
 */
function StepsRow() {
  const on = usePhonePrefs((s) => s.healthStepsOn);
  const revoked = usePhonePrefs((s) => s.healthRevoked);
  const setRead = usePhonePrefs((s) => s.setHealthRead);
  const access = useReadAccess(on, revoked);
  const allowed = access != null && access !== 'error' && access.steps;
  const [steps, setSteps] = useState<StepsResult | null>(null);
  const [openFailed, setOpenFailed] = useState(false);

  useEffect(() => {
    if (!on || !allowed) {
      setSteps(null);
      return;
    }
    let live = true;
    const load = (): void => {
      void readStepsToday().then((r) => {
        if (live) setSteps(r);
      });
    };
    load();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') load();
    });
    return () => {
      live = false;
      sub.remove();
    };
  }, [on, allowed]);

  if (access === undefined || access === null) return null;

  const start = (): void => {
    tap();
    setRead({ healthStepsOn: true, healthRevoked: false });
    if (!allowed) askHealthRead(['steps']);
  };
  const openHc = (): void => {
    tap();
    const opened = openHealthConnect();
    if (!opened) console.warn('[ForgeErr] Health Connect did not open');
    setOpenFailed(!opened);
  };

  const shownOn = on && (allowed || access === 'error');
  const refused = on && (!shownOn || steps?.kind === 'not-allowed');
  const caption = !on
    ? HC_STEPS_ABOUT
    : refused
      ? HC_STEPS_NOT_ALLOWED
      : steps?.kind === 'steps'
        ? stepsText(steps.steps)
        : steps?.kind === 'error'
          ? HC_STEPS_ERROR
          : 'Reading your steps…';

  return (
    <View>
      <SettingRow
        icon="route"
        title={HC_STEPS_TITLE}
        caption={caption}
        right={
          shownOn ? (
            <StopButton
              label="Stop showing steps from Health Connect"
              onPress={() => {
                tap();
                setRead({ healthStepsOn: false });
              }}
            />
          ) : undefined
        }
      />
      {!on ? <GhostButton label="Show my steps" icon="route" onPress={start} /> : null}
      {refused ? (
        <View style={{ gap: space.xs, paddingBottom: space.sm }}>
          <GhostButton label="Show my steps" icon="route" onPress={start} />
          <GhostButton label="Open Health Connect" icon="heart" onPress={openHc} />
        </View>
      ) : null}
      {openFailed ? (
        <Text accessibilityLiveRegion="polite" style={{ ...CAPTION(), color: color.criticalText, textAlign: 'center', paddingBottom: space.sm }}>
          {HC_OPEN_FAILED}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * R-344 (owner, 5 Nov 2026), F193 step 1: "Sleep and workouts". Off by default; turning it on asks Health
 * Connect for sleep only. After a lighter workout the finish screen may then name last night's short sleep.
 * The sleep is read on this phone for that one line and never stored or sent.
 */
function SleepRow() {
  const on = usePhonePrefs((s) => s.sleepLinkOn);
  const revoked = usePhonePrefs((s) => s.healthRevoked);
  const setSleepLink = usePhonePrefs((s) => s.setSleepLink);
  const [access, setAccess] = useState<boolean | 'error' | null | undefined>(undefined);
  const [openFailed, setOpenFailed] = useState(false);
  const looks = useRef(0);
  const recheck = useCallback(async () => {
    const mine = ++looks.current;
    const got = await sleepAccess();
    // Could not ask this time: keep what was shown (never flip to Off on a hiccup).
    if (mine === looks.current) setAccess((prev) => (got === 'error' && prev != null ? prev : got));
  }, []);
  useEffect(() => {
    void recheck();
    const sub = AppState.addEventListener('change', (a) => {
      if (a === 'active') void recheck();
    });
    return () => sub.remove();
  }, [recheck, on, revoked]);

  if (access === undefined || access === null) return null;
  const allowed = access === true || access === 'error';
  const refused = on && !allowed;

  const turn = (v: boolean): void => {
    setOpenFailed(false);
    setSleepLink({ sleepLinkOn: v });
    // Already allowed (from before a switch-off): nothing to ask.
    if (v && access !== true) askSleep();
  };
  const openHc = (): void => {
    tap();
    const opened = openHealthConnect();
    if (!opened) console.warn('[ForgeErr] Health Connect did not open');
    setOpenFailed(!opened);
  };

  return (
    <View>
      <ToggleRow icon="clock" title={SLEEP_TITLE} caption={!on ? SLEEP_ABOUT : refused ? SLEEP_NOT_ALLOWED : SLEEP_ON} value={on} onChange={turn} divider={false} />
      {refused ? (
        <View style={{ paddingBottom: space.sm }}>
          <GhostButton label="Open Health Connect" icon="heart" onPress={openHc} />
        </View>
      ) : null}
      {openFailed ? (
        <Text accessibilityLiveRegion="polite" style={{ ...CAPTION(), color: color.criticalText, textAlign: 'center', paddingBottom: space.sm }}>
          {HC_OPEN_FAILED}
        </Text>
      ) : null}
    </View>
  );
}

export function HealthCard() {
  return (
    <>
      <Card style={{ paddingVertical: space.xs }}>
        <HealthRow />
        <RemoveAccessRow />
      </Card>
      {canReadHealth() ? (
        <>
          <Card style={{ paddingVertical: space.xs }}>
            <WeightRow />
          </Card>
          <Card style={{ paddingVertical: space.xs }}>
            <StepsRow />
          </Card>
          {canReadSleep() ? (
            <Card style={{ paddingVertical: space.xs }}>
              <SleepRow />
            </Card>
          ) : null}
        </>
      ) : null}
    </>
  );
}

export function WidgetsCard() {
  return (
    <Card style={{ paddingVertical: space.xs }}>
      <WidgetsRow divider={false} />
    </Card>
  );
}
