/**
 * R-506 phase 3: the gym's alerts on this phone or computer with the admin app closed (logic/webPush.ts).
 *  - AlertsSettingsCard (Settings): turn alerts on or off for this device; the owner picks when the rest come
 *    ("Instantly", "Once a day" at a time, "Once a week" on a day at a time). The desk sees the choice, read only.
 *  - BellAlertsCard (R-561, owner 15 Nov 2026: "the button to switch on the alerts can just stay there [in the
 *    notifications panel] until they either turn it on or X out of it ... it's already there in the settings"): at the
 *    top of the bell panel while alerts are off for this device. X hides it for good on this device. It replaced the
 *    offer on Today (same closed flag, so a "Not now" tapped there stays closed). The
 *    browser's own permission question comes only from a tap on "Turn on alerts", never on load.
 * Both are hidden in the demo gym, offline, and until the gym's server has 0076.
 */

import { useCallback, useEffect, useState } from 'react';

import { useAuth, useRole } from '../auth/AuthProvider';
import {
  PUSH_WORDS as W,
  TEST_SHOWN_MESSAGE,
  TEST_WORDS as TW,
  TIME_CHOICES,
  WEEKDAYS,
  clockLabel,
  restLine,
  settingLine,
  showAlertsOffer,
  testAlertState,
  testPollMs,
  testWords,
  timeLabel,
  type AlertMode,
  type AlertSettings,
  type TestAlertAnswer,
} from '../logic/webPush';
import {
  browserPushSupport,
  getAlertSettings,
  pushIsOn,
  readTestAlert,
  saveAlertSettings,
  sendTestAlert,
  turnOffPush,
  turnOnPush,
  type TurnOn,
} from '../shop/webPushApi';
import { t } from '../lang/lang';
import { Button, Card, ChipToggle, ErrorBanner, SectionTitle, SelectField, TOUCH, color, font, radius, space } from './kit';

const OFFER_KEY = 'mettleup.alertsOffer.closed';
const body = { margin: 0, fontFamily: font.body, fontSize: 14, lineHeight: 1.5, color: color.inkSecondary } as const;

function offerClosed(): boolean {
  try {
    return localStorage.getItem(OFFER_KEY) === '1';
  } catch {
    return false;
  }
}

function permission(): string {
  return typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported';
}

function turnOnWords(r: TurnOn): string | null {
  if (r === 'blocked') return W.blocked;
  if (r === 'unsupported') return W.noSupport;
  if (r === 'not-ready' || r === 'missing') return W.notReady;
  return null;
}

/** This device's state and the gym's choice, read once the key is known. null settings: not here (hide). */
function useAlertsState() {
  const { session } = useAuth();
  const key = session?.online ? (session.ownerKey ?? null) : null;
  const [settings, setSettings] = useState<AlertSettings | null>(null);
  const [on, setOn] = useState(false);
  const read = useCallback(async () => {
    if (!key) return;
    try {
      const s = await getAlertSettings(key);
      if (s === 'missing') {
        setSettings(null);
        return;
      }
      setSettings(s);
      const o = await pushIsOn(key);
      setOn(o === true);
    } catch (e) {
      console.warn('[ForgeErr] alerts settings', e);
    }
  }, [key]);
  useEffect(() => {
    void read();
  }, [read]);
  return { key, settings, setSettings, on, setOn };
}

function DeviceSwitch({ apiKey, on, setOn }: { apiKey: string; on: boolean; setOn: (v: boolean) => void }) {
  const support = browserPushSupport();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  if (support === 'iphone-install') return <p style={{ ...body, marginTop: space.sm }}>{W.iphone}</p>;
  if (support === 'no') return <p style={{ ...body, marginTop: space.sm }}>{W.noSupport}</p>;
  const blocked = permission() === 'denied';
  const turnOn = async () => {
    setBusy(true);
    setNote(null);
    try {
      const r = await turnOnPush(apiKey);
      setOn(r === 'on');
      setNote(turnOnWords(r));
    } catch (e) {
      console.warn('[ForgeErr] alerts: turning on', e);
      setNote(W.failed);
    } finally {
      setBusy(false);
    }
  };
  const turnOff = async () => {
    setBusy(true);
    try {
      await turnOffPush(apiKey);
      setOn(false);
    } catch (e) {
      console.warn('[ForgeErr] alerts: turning off', e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div style={{ marginTop: space.md, display: 'grid', gap: space.sm }} data-testid="alerts-device">
      <p style={{ ...body, color: color.ink, fontWeight: 600 }}>{on ? W.on : blocked ? W.blocked : W.off}</p>
      {note && !on && note !== W.blocked ? <p style={body}>{note}</p> : null}
      {on ? <TestAlertBox apiKey={apiKey} /> : null}
      {!blocked || on ? (
        <div>
          <Button variant={on ? 'ghost' : 'primary'} disabled={busy} needsInternet onClick={on ? turnOff : turnOn}>
            {on ? W.turnOff : W.turnOn}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/** "7:41 pm" on this device's own clock. */
function deviceClock(at: number): string {
  return clockLabel(at, -new Date(at).getTimezoneOffset());
}

/**
 * R-578 (owner, 15 Nov 2026): "Send a test alert" for this device, while its alerts are on. The test goes the real way
 * (the gym server, the HQ Worker, the push company, this browser's service worker), to this browser only; the service
 * worker says "shown" back. The card asks again every few seconds, answers within about 90 s, and reads the answer
 * again when the admin app is opened again (the owner may close it to check the closed case). Hidden until the gym's
 * server has 0095.
 */
function TestAlertBox({ apiKey }: { apiKey: string }) {
  const [answer, setAnswer] = useState<TestAlertAnswer | null>(null);
  const [here, setHere] = useState(true);
  // Nothing shows until the first answer: a server without 0095 never flashes the button.
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [hiddenHelp, setHiddenHelp] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  // The gym server's clock minus this device's (a device whose clock is off still waits the right 90 seconds).
  const [skew, setSkew] = useState(0);
  const read = useCallback(async () => {
    try {
      const r = await readTestAlert(apiKey);
      if (r === 'missing') setHere(false);
      else if (r) {
        setAnswer(r);
        if (r.serverNow !== null) setSkew(r.serverNow - Date.now());
      }
    } catch (e) {
      console.warn('[ForgeErr] test alert: reading', e);
    } finally {
      // Also after a failed read: the next ask is planned from the new time.
      setNow(Date.now());
      setReady(true);
    }
  }, [apiKey]);
  useEffect(() => {
    void read();
  }, [read]);
  const test = answer?.test ?? null;
  const state = testAlertState(test, now + skew);
  const poll = test ? testPollMs(state, now + skew - test.at) : null;
  useEffect(() => {
    if (poll === null) return;
    const id = window.setTimeout(() => void read(), poll);
    return () => window.clearTimeout(id);
  }, [poll, now, read]);
  // The service worker's own word that it showed a test, and the page coming back into view.
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.data && typeof e.data === 'object' && (e.data as { type?: unknown }).type === TEST_SHOWN_MESSAGE) void read();
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') void read();
    };
    const sw = typeof navigator !== 'undefined' && 'serviceWorker' in navigator ? navigator.serviceWorker : null;
    sw?.addEventListener?.('message', onMessage as EventListener);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      sw?.removeEventListener?.('message', onMessage as EventListener);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [read]);
  if (!here || !ready) return null;
  const send = async () => {
    setBusy(true);
    setNote(null);
    setHiddenHelp(false);
    try {
      const r = await sendTestAlert(apiKey);
      if (r === 'missing') setHere(false);
      else if (r.ok) {
        const sentNow = Date.now();
        setAnswer({ on: true, wait: 60, serverNow: r.at, test: { id: r.id, at: r.at, sentAt: null, sentHow: null, shownAt: null } });
        setSkew(r.at - sentNow);
        setNow(sentNow);
      } else if (r.error === 'TOO_SOON') setNote(testWords(TW.tooSoon, { n: r.wait || 60 }));
      else if (r.error === 'NOT_ON') setNote(TW.unreached);
      else setNote(TW.failed);
    } catch (e) {
      console.warn('[ForgeErr] test alert: sending', e);
      setNote(TW.failed);
    } finally {
      setBusy(false);
    }
  };
  const checks = (intro: string, online: boolean) => (
    <div data-testid="test-alert-checks" style={{ display: 'grid', gap: space.xs }}>
      <p style={body}>{t(intro)}</p>
      <ul style={{ ...body, margin: 0, paddingLeft: 20, display: 'grid', gap: space.xs }}>
        <li>{t(TW.checkAllowed)}</li>
        <li>{t(TW.checkQuiet)}</li>
        {online ? <li>{t(TW.checkOnline)}</li> : null}
      </ul>
      <p style={body}>{t(TW.tryAgain)}</p>
    </div>
  );
  const waiting = state === 'waiting';
  return (
    <div
      data-testid="test-alert"
      data-state={state}
      style={{ display: 'grid', gap: space.sm, padding: space.md, borderRadius: radius.md, border: `1px solid ${color.border}`, background: color.surfaceSunken }}
    >
      {state === 'none' ? <p style={body}>{t(TW.intro)}</p> : null}
      {waiting ? (
        <p style={{ ...body, color: color.ink }} role="status">
          {t(TW.waiting)}
        </p>
      ) : null}
      {state === 'shown' && test?.shownAt ? (
        <>
          <p style={{ ...body, color: color.ink, fontWeight: 600 }} role="status">
            {t(testWords(TW.shown, { time: deviceClock(test.shownAt) }))}
          </p>
          {hiddenHelp ? (
            checks(TW.hiddenIntro, false)
          ) : (
            <div>
              <Button variant="quiet" onClick={() => setHiddenHelp(true)}>
                {t(TW.noPopup)}
              </Button>
            </div>
          )}
        </>
      ) : null}
      {state === 'not-shown' ? (
        <>
          <p style={{ ...body, color: color.ink, fontWeight: 600 }} role="status">
            {t(TW.notShown)}
          </p>
          {checks(TW.checksIntro, true)}
        </>
      ) : null}
      {state === 'not-sent' ? (
        <p style={{ ...body, color: color.ink }} role="status">
          {t(TW.notSent)}
        </p>
      ) : null}
      {state === 'unreached' ? (
        <p style={{ ...body, color: color.ink }} role="status">
          {t(TW.unreached)}
        </p>
      ) : null}
      {note ? <p style={{ ...body, color: color.ink }}>{t(note)}</p> : null}
      {waiting ? null : (
        <div>
          <Button variant={state === 'none' ? 'primary' : 'ghost'} disabled={busy} needsInternet onClick={send}>
            {busy ? t(TW.sending) : t(TW.button)}
          </Button>
        </div>
      )}
    </div>
  );
}

/** Settings: this device, and when the rest come. */
export function AlertsSettingsCard() {
  const { key, settings, setSettings, on, setOn } = useAlertsState();
  const owner = useRole() === 'owner';
  const [draft, setDraft] = useState<Pick<AlertSettings, 'mode' | 'minute' | 'weekday'> | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!key || !settings) return null;
  const pick = draft ?? settings;
  const changed = draft !== null && (draft.mode !== settings.mode || draft.minute !== settings.minute || draft.weekday !== settings.weekday);
  const set = (p: Partial<Pick<AlertSettings, 'mode' | 'minute' | 'weekday'>>) => {
    setDraft({ mode: pick.mode, minute: pick.minute, weekday: pick.weekday, ...p });
    setSaved(false);
  };
  const save = async () => {
    if (!draft) return;
    setSaving(true);
    setError(null);
    try {
      setSettings(await saveAlertSettings(key, draft));
      setDraft(null);
      setSaved(true);
    } catch (e) {
      console.warn('[ForgeErr] alerts: saving the choice', e);
      setError('Not saved. Check the internet and try again.');
    } finally {
      setSaving(false);
    }
  };
  return (
    <Card style={{ marginBottom: space.lg }}>
      <SectionTitle>{W.title}</SectionTitle>
      <p style={body}>{W.what}</p>
      <DeviceSwitch apiKey={key} on={on} setOn={setOn} />
      <p style={{ ...body, marginTop: space.lg }} data-testid="alerts-urgent">
        {owner ? W.urgentOwner : W.urgentStaff}
      </p>
      {settings.canEdit ? (
        <div data-testid="alerts-when">
          <p style={{ ...body, marginTop: space.sm }}>{W.rest}</p>
          <div style={{ marginTop: space.sm }}>
            <ChipToggle
              label={W.modeLabel}
              value={pick.mode}
              onChange={(v) => set({ mode: v as AlertMode })}
              options={[
                { value: 'instant', label: W.instant },
                { value: 'daily', label: W.daily },
                { value: 'weekly', label: W.weekly },
              ]}
              wrap
            />
          </div>
          {pick.mode !== 'instant' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: space.md }}>
              {pick.mode === 'weekly' && (
                <SelectField label={W.day} value={String(pick.weekday)} onChange={(v) => set({ weekday: Number(v) })} options={WEEKDAYS.map((d, i) => ({ value: String(i), label: d }))} />
              )}
              <SelectField label={W.time} value={String(pick.minute)} onChange={(v) => set({ minute: Number(v) })} options={timeOptions(pick.minute)} />
            </div>
          )}
          <p style={{ ...body, marginTop: space.sm }}>{settingLine(pick)}</p>
          {error && <ErrorBanner>{error}</ErrorBanner>}
          <div style={{ marginTop: space.md, display: 'flex', alignItems: 'center', gap: space.sm }}>
            <Button onClick={save} disabled={!changed || saving} needsInternet>
              {saving ? 'Saving…' : W.save}
            </Button>
            {saved && !changed ? <span style={body}>{W.saved}</span> : null}
          </div>
        </div>
      ) : (
        <p style={{ ...body, marginTop: space.sm }} data-testid="alerts-when-readonly">
          {restLine(settings)} {W.ownerOnly}
        </p>
      )}
    </Card>
  );
}

/** Every half hour, plus the saved time if it is not on the half hour. PURE. */
function timeOptions(current: number): { value: string; label: string }[] {
  const all = TIME_CHOICES.includes(current) ? TIME_CHOICES : [...TIME_CHOICES, current].sort((a, b) => a - b);
  return all.map((m) => ({ value: String(m), label: timeLabel(m) }));
}

/**
 * R-561: the bell panel's first card while alerts are off for this device. Hidden when they are on, when this browser
 * cannot show them (an iPhone not added to the Home Screen, an old browser), when they are blocked, when the gym's
 * server has no alerts part (0076), and for good once X is tapped on this device.
 */
export function BellAlertsCard() {
  const { key, settings, on, setOn } = useAlertsState();
  const [closed, setClosed] = useState(offerClosed);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [perm, setPerm] = useState(permission);
  const show = showAlertsOffer({ support: browserPushSupport(), permission: perm, on, dismissed: closed, ready: Boolean(key && settings) });
  if (!key || (!show && !note)) return null;
  const close = () => {
    try {
      localStorage.setItem(OFFER_KEY, '1');
    } catch {
      // quiet: a browser that keeps nothing shows the card again next time
    }
    setClosed(true);
    setNote(null);
  };
  const yes = async () => {
    setBusy(true);
    try {
      const r = await turnOnPush(key);
      setPerm(permission());
      setOn(r === 'on');
      setNote(r === 'on' ? W.on : (turnOnWords(r) ?? W.failed));
    } catch (e) {
      console.warn('[ForgeErr] alerts: turning on from the bell', e);
      setNote(W.failed);
    } finally {
      setBusy(false);
    }
  };
  const done = on && note === W.on;
  return (
    <section
      data-testid="bell-alerts-card"
      aria-label={t(W.bellTitle)}
      style={{
        position: 'relative',
        display: 'grid',
        gap: space.sm,
        padding: `${space.md}px ${space.md}px ${space.md}px ${space.md}px`,
        marginBottom: space.md,
        borderRadius: radius.md,
        border: `1px solid ${color.accent}`,
        background: color.accentSoft,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: space.sm }}>
        <h3 style={{ margin: 0, flex: 1, minWidth: 0, paddingTop: 6, fontFamily: font.body, fontSize: 15, fontWeight: 800, color: color.ink }}>{t(W.bellTitle)}</h3>
        {done ? null : (
          <button
            type="button"
            onClick={close}
            aria-label={t(W.bellClose)}
            style={{
              flexShrink: 0,
              width: TOUCH - 8,
              height: TOUCH - 8,
              margin: -4,
              display: 'grid',
              placeItems: 'center',
              background: 'transparent',
              border: 'none',
              borderRadius: radius.pill,
              color: color.inkSecondary,
              cursor: 'pointer',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        )}
      </div>
      {note ? (
        <p style={{ ...body, color: color.ink }}>{t(note)}</p>
      ) : (
        <>
          <p style={{ ...body, color: color.ink }}>{t(W.bellText)}</p>
          <p style={body}>{t(W.bellLater)}</p>
        </>
      )}
      {done ? null : (
        <div>
          <Button onClick={yes} disabled={busy} needsInternet>
            {t(W.offerYes)}
          </Button>
        </div>
      )}
    </section>
  );
}
