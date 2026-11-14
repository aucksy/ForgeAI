/**
 * R-506 phase 3: the gym's alerts on this phone or computer with the admin app closed (logic/webPush.ts).
 *  - AlertsSettingsCard (Settings): turn alerts on or off for this device; the owner picks when the rest come
 *    ("Instantly", "Once a day" at a time, "Once a week" on a day at a time). The desk sees the choice, read only.
 *  - AlertsOfferCard (Today): the one-time offer, until it is turned on, blocked or "Not now". The browser's own
 *    permission question comes only from a tap on "Turn on alerts", never on load.
 * Both are hidden in the demo gym, offline, and until the gym's server has 0076.
 */

import { useCallback, useEffect, useState } from 'react';

import { useAuth, useRole } from '../auth/AuthProvider';
import { PUSH_WORDS as W, TIME_CHOICES, WEEKDAYS, restLine, settingLine, showAlertsOffer, timeLabel, type AlertMode, type AlertSettings } from '../logic/webPush';
import { browserPushSupport, getAlertSettings, pushIsOn, saveAlertSettings, turnOffPush, turnOnPush, type TurnOn } from '../shop/webPushApi';
import { Button, Card, ChipToggle, ErrorBanner, SectionTitle, SelectField, color, font, space } from './kit';
import { useSetupTurn } from './SetupSlot';

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

/** Today: the one-time offer. */
export function AlertsOfferCard() {
  const { key, settings, on, setOn } = useAlertsState();
  const [closed, setClosed] = useState(offerClosed);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [perm, setPerm] = useState(permission);
  const show = showAlertsOffer({ support: browserPushSupport(), permission: perm, on, dismissed: closed, ready: Boolean(key && settings) });
  // Fresh eyes (14 Nov 2026): one set-up card on Today at a time; this one comes after Get started.
  const myTurn = useSetupTurn('alerts', Boolean(key) && (show || Boolean(note)));
  if (!myTurn || !key) return null;
  const close = () => {
    try {
      localStorage.setItem(OFFER_KEY, '1');
    } catch {
      // quiet: a browser that keeps nothing shows the offer again next time
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
      console.warn('[ForgeErr] alerts: turning on from Today', e);
      setNote(W.failed);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card style={{ marginBottom: space.lg }}>
      <div data-testid="alerts-offer">
        <SectionTitle>{W.offerTitle}</SectionTitle>
        {note ? <p style={body}>{note}</p> : <p style={body}>{W.offerText}</p>}
        <div style={{ marginTop: space.md, display: 'flex', flexWrap: 'wrap', gap: space.sm }}>
          {note ? (
            <Button variant="ghost" onClick={close}>
              OK
            </Button>
          ) : (
            <>
              <Button onClick={yes} disabled={busy} needsInternet>
                {W.offerYes}
              </Button>
              <Button variant="quiet" onClick={close}>
                {W.offerNo}
              </Button>
            </>
          )}
        </div>
      </div>
    </Card>
  );
}
