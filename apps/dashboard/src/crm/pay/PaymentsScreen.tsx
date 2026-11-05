/**
 * F79 online payments (R-328, 4 Nov 2026): Settings -> Payments (/settings/payments).
 *
 *  - UPI QR: uses the gym's UPI ID from Settings -> Gym details. Works today, with no server part.
 *  - Payment companies (Razorpay, Cashfree, PayU, PhonePe): the owner pastes the keys from the
 *    company's own dashboard; MettleUp tests them with one read-only call, keeps them sealed, and from
 *    then on answers only "Connected with the key ending 3456". A key is shown only while it is typed.
 *    "Connect Razorpay" / "Connect Cashfree" (sign in on the company's site, no keys) appears only when
 *    MettleUp's partner sign-up is done and switched on (server flag), never before.
 *  - Money always goes straight to the gym's own account; MettleUp takes no fee.
 *  - Off until the server parts are live: "Online payments are not switched on yet." and no buttons.
 *  - Test mode is said on screen until MettleUp switches live payments on.
 * The owner connects and disconnects; the front desk sees the state only.
 */

import { useEffect, useState } from 'react';

import { useCan } from '../auth/AuthProvider';
import { t } from '../lang/lang';
import { validUpiId } from '../logic/upiPay';
import { useCrm } from '../store';
import { Button, Card, ErrorBanner, PageHeader, Pill, Row, SectionTitle, TextField, Toast, color, font, space } from '../ui/kit';
import { navigate } from '../ui/router';
import { PayRefused, connectKeys, disconnect, oauthStart, type DeskPay, type PayProvider } from './payApi';
import { KEYS_HELP, connectProblem, connectionLine } from './payWords';
import { setDeskPay, useDeskPay } from './useDeskPay';

/** What the screen says when the server part is not on. PURE. UAT 5 Nov 2026: with the next step. */
export function offWords(state: DeskPay | null): string | null {
  if (!state) return null;
  const notYet = t('Online payments are not switched on yet. Until then, members can pay by the UPI QR above.');
  if (!state.on) return state.why === 'OFFLINE' ? t('Turn on the member app and sign in to connect a payment company.') : notYet;
  if (!state.connectOn) return notYet;
  return null;
}

/** The ?payments= word the company's sign-in page sends back, as a line. PURE. */
export function oauthBackWords(code: string | null): { ok: boolean; text: string } | null {
  if (!code) return null;
  if (code === 'connected') return { ok: true, text: t('Connected. Members can now pay you online.') };
  if (code === 'cancelled') return { ok: false, text: t('Not connected: the sign-in was cancelled.') };
  return { ok: false, text: t('Could not connect. Try again.') };
}

function backCode(): string | null {
  try {
    const m = /[?&]payments=([a-z_]+)/.exec(window.location.search);
    return m ? m[1] : null;
  } catch (e) {
    console.warn('[pay] address not read', e);
    return null;
  }
}

export function PaymentsScreen() {
  const { gym } = useCrm().snapshot;
  const ownerCan = useCan()('manageGym');
  const { state, key, reload } = useDeskPay(true);
  const upi = validUpiId(gym.upiId);
  const [toast, setToast] = useState<string | null>(null);
  const back = oauthBackWords(backCode());

  useEffect(() => {
    if (back?.ok) reload();
    // Once, on opening after the company's sign-in page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const off = offWords(state);
  const live = state?.on === true ? state : null;
  const canManage = ownerCan && (live?.canManage ?? false);

  return (
    <div>
      <PageHeader
        title={t('Payments')}
        subtitle={t('Let members pay you online. The money goes straight to your own account.')}
        actions={
          <Button variant="ghost" onClick={() => navigate('/settings')}>
            {t('Back to settings')}
          </Button>
        }
      />

      {back && (back.ok ? <Toast message={back.text} /> : <ErrorBanner>{back.text}</ErrorBanner>)}
      {toast && <Toast message={toast} />}

      <Card style={{ marginBottom: space.lg }}>
        <SectionTitle>{t('UPI QR')}</SectionTitle>
        <p style={para}>
          {upi
            ? t('Your UPI ID {upi} is ready. Collect payment shows a QR with the amount; the member scans it with any UPI app.', { upi })
            : t('Add your gym’s UPI ID in Gym details. Then Collect payment can show a QR with the amount.')}
        </p>
        <p style={muted}>{t('The money comes to you directly. Tap Save payment when it shows in your UPI app or sound box.')}</p>
        {!upi && ownerCan && (
          <div style={{ marginTop: space.md }}>
            <Button variant="ghost" onClick={() => navigate('/settings')}>
              {t('Add UPI ID')}
            </Button>
          </div>
        )}
      </Card>

      <Card style={{ marginBottom: space.lg }}>
        <Row gap={space.sm} align="center">
          <span style={{ flex: 1 }}>
            <SectionTitle>{t('Payment company')}</SectionTitle>
          </span>
          {live?.connectOn && live.testMode && <Pill tone="warn">{t('Test mode')}</Pill>}
        </Row>
        <p style={para}>
          {t('Connect your own Razorpay, Cashfree, PayU or PhonePe account. Members then pay by UPI, card or net banking from a link or QR, and the receipt is made by itself.')}
        </p>
        <p style={muted}>{t('MettleUp takes no fee. Your payment company’s own charges apply.')}</p>
        {live?.connectOn && live.testMode && (
          <p style={{ ...muted, color: color.warning, fontWeight: 700 }}>{t('Test mode: no real money moves. Use your test keys.')}</p>
        )}
        {off && (
          <p role="status" style={{ ...para, fontWeight: 700 }}>
            {off}
          </p>
        )}
        {!state && <p style={muted}>{t('Loading…')}</p>}
      </Card>

      {live?.connectOn &&
        live.providers.map((p) => (
          <ProviderCard
            key={p.id}
            provider={p}
            deskKey={key}
            canManage={canManage}
            otherOn={live.providers.some((o) => o.id !== p.id && o.connection?.on)}
            onChanged={(next, words) => {
              if (key) setDeskPay(key, { ...live, providers: live.providers.map((o) => (o.id === p.id ? next : o)) });
              setToast(words);
            }}
          />
        ))}
    </div>
  );
}

function ProviderCard({
  provider,
  deskKey,
  canManage,
  otherOn,
  onChanged,
}: {
  provider: PayProvider;
  deskKey: string | null;
  canManage: boolean;
  otherOn: boolean;
  onChanged: (p: PayProvider, words: string) => void;
}) {
  const c = provider.connection;
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const help = KEYS_HELP[provider.id];
  const ready = provider.fields.every((f) => (values[f.name] ?? '').trim().length > 0);

  const connect = async () => {
    if (!deskKey || !ready) return;
    setBusy(true);
    setProblem(null);
    try {
      const connection = await connectKeys(deskKey, provider.id, values);
      setValues({});
      setOpen(false);
      onChanged({ ...provider, connection }, t('{name} connected. Payment links now use it.', { name: provider.name }));
    } catch (e) {
      const code = e instanceof PayRefused ? e.code : e instanceof Error ? e.message : 'ERROR';
      setProblem(connectProblem(code, e instanceof PayRefused ? e.words : null, provider.name));
    } finally {
      setBusy(false);
    }
  };

  const drop = async () => {
    if (!deskKey) return;
    if (!window.confirm(t('Disconnect {name}? Payment links stop until you connect again. Payments already made stay.', { name: provider.name }))) return;
    setBusy(true);
    setProblem(null);
    try {
      const connection = await disconnect(deskKey, provider.id);
      onChanged({ ...provider, connection }, t('{name} disconnected.', { name: provider.name }));
    } catch (e) {
      setProblem(connectProblem(e instanceof PayRefused ? e.code : 'ERROR', null, provider.name));
    } finally {
      setBusy(false);
    }
  };

  const signIn = async () => {
    if (!deskKey) return;
    setBusy(true);
    setProblem(null);
    try {
      window.location.assign(await oauthStart(deskKey, provider.id));
    } catch (e) {
      setProblem(connectProblem(e instanceof PayRefused ? e.code : 'ERROR', null, provider.name));
      setBusy(false);
    }
  };

  return (
    <Card style={{ marginBottom: space.lg }}>
      <Row gap={space.sm} align="center">
        <span style={{ flex: 1, fontFamily: font.display, fontSize: 17, fontWeight: 700, color: color.ink }}>{provider.name}</span>
        {c?.on ? <Pill tone="good">{t('Connected')}</Pill> : c?.offReason === 'revoked' || c?.offReason === 'bad_keys' ? <Pill tone="critical">{t('Stopped')}</Pill> : null}
      </Row>
      <p role="status" style={para}>
        {connectionLine(provider.name, c)}
      </p>
      {c?.on && otherOn && <p style={muted}>{t('Payment links use the first connected company in this list.')}</p>}
      {problem && <ErrorBanner>{problem}</ErrorBanner>}

      {canManage && !c?.on && !open && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: space.sm, marginTop: space.md }}>
          {provider.oauth && (
            <Button disabled={busy} needsInternet onClick={signIn}>
              {t('Connect {name}', { name: provider.name })}
            </Button>
          )}
          <Button variant={provider.oauth ? 'quiet' : 'ghost'} onClick={() => setOpen(true)}>
            {t('Paste keys')}
          </Button>
        </div>
      )}

      {canManage && open && !c?.on && (
        <div style={{ marginTop: space.md }}>
          <p style={muted}>
            {t(help.where)}{' '}
            <a href={help.url} target="_blank" rel="noopener noreferrer" style={{ color: color.accentBright }}>
              {t('Open {name}', { name: provider.name })}
            </a>
          </p>
          {provider.fields.map((f) => (
            <TextField
              key={f.name}
              label={t(f.label)}
              value={values[f.name] ?? ''}
              placeholder={f.placeholder}
              onChange={(v) => setValues((old) => ({ ...old, [f.name]: v }))}
              hint={f.secret ? t('Shown only while you type. After you connect, only its last 4 letters show.') : undefined}
            />
          ))}
          <Row gap={space.sm} align="center">
            <Button disabled={busy || !ready} needsInternet onClick={connect}>
              {busy ? t('Testing the keys…') : t('Test and connect')}
            </Button>
            <Button
              variant="quiet"
              onClick={() => {
                setOpen(false);
                setValues({});
                setProblem(null);
              }}
            >
              {t('Cancel')}
            </Button>
          </Row>
        </div>
      )}

      {canManage && c?.on && (
        <div style={{ marginTop: space.md }}>
          <Button variant="quiet" tone="danger" disabled={busy} needsInternet onClick={drop}>
            {t('Disconnect')}
          </Button>
        </div>
      )}
      {!canManage && !c?.on && <p style={muted}>{t('Only the gym owner can connect a payment company.')}</p>}
    </Card>
  );
}

const para = { margin: `${space.sm}px 0 0`, fontFamily: font.body, fontSize: 14, color: color.inkSecondary } as const;
const muted = { margin: `${space.sm}px 0 0`, fontFamily: font.body, fontSize: 13, color: color.inkMuted } as const;
