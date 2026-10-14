/**
 * Settings — the gym's own details, and the data actions.
 *
 * "Load demo gym" and "Start fresh" are both destructive, so both confirm first and
 * both say plainly what will happen. The mobile app learned this the hard way in
 * Phase O2: a reset that quietly regenerates fake data over someone's real records
 * is the single worst thing this kind of app can do.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { useAuth } from '../../auth/AuthProvider';
import { SignInCard } from '../../auth/GoOnlineCard';
import { JoinCodeCard } from '../../shop/JoinCode';
import { useShop } from '../../shop/ShopProvider';
import { useCrm } from '../../store';
import { navigate } from '../router';
import { dateISOFromEpoch, formatDay } from '../../logic/dates';
import {
  Button,
  Card,
  ErrorBanner,
  Grid,
  PageHeader,
  Row,
  SectionTitle,
  Sheet,
  TextField,
  Toast,
  color,
  font,
  space,
} from '../kit';

export function SettingsScreen() {
  const { snapshot, updateGym, loadDemoGym, startEmptyGym } = useCrm();
  const { gym } = snapshot;
  const { cloud, startOver, disconnectShop, renameCloudGym } = useShop();
  // Online records are never wiped, replaced with the demo, or cut off from here.
  const online = useAuth().session?.online === true;

  const [name, setName] = useState(gym.name);
  const [phone, setPhone] = useState(gym.phone ?? '');
  const [address, setAddress] = useState(gym.address ?? '');
  const [gstin, setGstin] = useState(gym.gstin ?? '');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<'demo' | 'fresh' | 'over' | 'disconnect' | null>(null);
  // Stable, because the sheet re-focuses itself whenever its onClose changes.
  const closeConfirm = useCallback(() => setConfirming(null), []);

  const toastTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  const flash = (msg: string) => {
    setToast(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2600);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await updateGym({
        name: name.trim() || 'My Gym',
        phone: phone.trim() || null,
        address: address.trim() || null,
        gstin: gstin.trim().toUpperCase() || null,
      });
      // The app shows members the gym's name, so a rename goes to the cloud too.
      await renameCloudGym(name.trim() || 'My Gym');
      flash('Saved.');
    } catch (e) {
      // Without this, a failed write (storage full) just stopped the spinner and
      // said nothing — the owner would assume it saved.
      setError(e instanceof Error ? e.message : 'Could not save your gym details.');
    } finally {
      setSaving(false);
    }
  };

  const counts = {
    members: snapshot.members.length,
    memberships: snapshot.memberships.length,
    payments: snapshot.payments.length,
    visits: snapshot.visits.length,
  };

  return (
    <>
      <PageHeader title="Settings" subtitle="Your gym's details and data" />

      {error && <ErrorBanner>{error}</ErrorBanner>}

      {/* Sign-in first: "put your records online" is the one thing here that protects the gym. */}
      <SignInCard />

      <Card style={{ marginBottom: space.lg }}>
        <SectionTitle>Gym details</SectionTitle>
        <TextField label="Gym name" value={name} onChange={setName} />
        <Grid min={220}>
          <TextField label="Phone" value={phone} onChange={setPhone} inputMode="tel" />
          <TextField
            label="GSTIN (optional)"
            value={gstin}
            onChange={setGstin}
            hint="Only if you're GST registered — used on invoices."
          />
        </Grid>
        <TextField label="Address" value={address} onChange={setAddress} multiline />
        <div style={{ marginTop: space.lg }}>
          <Button onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save details'}
          </Button>
        </div>
      </Card>

      {/* Titled inside its card like the sections above and below it — the title
          used to sit outside, on the page, the only one that did. */}
      <JoinCodeCard title="Member app" />

      {/* Gym branding: the gym's own logo and colours in the member app. */}
      <Card style={{ marginBottom: space.lg }}>
        <SectionTitle>Your look in the app</SectionTitle>
        <p style={{ margin: 0, fontFamily: font.body, fontSize: 14, color: color.inkSecondary }}>
          {cloud
            ? 'Your logo opens the app, and your colour runs through every screen members see.'
            : 'Turn on the member app above first; then your logo and colour can run through it.'}
        </p>
        <div style={{ marginTop: space.lg }}>
          <Button variant="ghost" disabled={!cloud} onClick={() => navigate('/settings/branding')}>
            Open branding
          </Button>
        </div>
      </Card>

      <Card>
        <SectionTitle>Your data</SectionTitle>
        <p style={{ margin: 0, fontFamily: font.body, fontSize: 14, color: color.inkSecondary }}>
          {counts.members} members · {counts.memberships} memberships · {counts.payments} payments ·{' '}
          {counts.visits} check-ins. Set up {formatDay(dateISOFromEpoch(gym.createdAt))}.
        </p>
        <p style={{ margin: `${space.sm}px 0 0`, fontFamily: font.body, fontSize: 13, color: color.inkMuted }}>
          {online
            ? 'Stored online. Safe if a phone or computer breaks, and the same on every device you sign in on.'
            : 'Stored in this browser only. Put your records online (above) to keep them safe and open them anywhere.'}
        </p>

        {!online && (
        <Row gap={space.sm}>
          <div style={{ marginTop: space.lg }}>
            <Button variant="ghost" onClick={() => setConfirming('demo')}>
              Load demo gym
            </Button>
          </div>
          <div style={{ marginTop: space.lg }}>
            <Button variant="ghost" tone="danger" onClick={() => setConfirming('fresh')}>
              Erase and start fresh
            </Button>
          </div>
          {/* Only a DEMO gym may be started over: that erases this browser. A real
              gym that turned the shop on can only disconnect it, which keeps
              every member and payment here. */}
          {cloud?.demo && (
            <div style={{ marginTop: space.lg }}>
              <Button variant="ghost" tone="danger" onClick={() => setConfirming('over')}>
                Start over with a new demo gym
              </Button>
            </div>
          )}
          {cloud && !cloud.demo && (
            <div style={{ marginTop: space.lg }}>
              <Button variant="ghost" tone="danger" onClick={() => setConfirming('disconnect')}>
                Disconnect the shop
              </Button>
            </div>
          )}
        </Row>
        )}
      </Card>

      {confirming && (
        <Sheet
          title={
            confirming === 'demo'
              ? 'Load the demo gym?'
              : confirming === 'over'
                ? 'Start over with a new demo gym?'
                : confirming === 'disconnect'
                  ? 'Disconnect the shop?'
                  : 'Erase everything?'
          }
          onClose={closeConfirm}
          footer={
            <>
              <Button variant="ghost" onClick={() => setConfirming(null)}>
                Cancel
              </Button>
              <Button
                tone="danger"
                onClick={async () => {
                  setError(null);
                  try {
                    if (confirming === 'disconnect') {
                      disconnectShop();
                      setConfirming(null);
                      flash('Shop disconnected. Your members and payments are still here.');
                      return;
                    }
                    if (confirming === 'over') {
                      // Back to the welcome screen, where "Start demo" makes a new one.
                      setConfirming(null);
                      await startOver();
                      return;
                    }
                    if (confirming === 'demo') {
                      await loadDemoGym();
                      flash('Demo gym loaded.');
                    } else {
                      // The PERSISTED name, not the unsaved form field: an
                      // unsaved edit here decided whether the fresh gym counted
                      // as "never set up" and bounced back to the welcome screen.
                      await startEmptyGym(gym.name);
                      flash('Started fresh.');
                    }
                  } catch (e) {
                    setError(e instanceof Error ? e.message : 'That didn’t work. Please try again.');
                  }
                  setConfirming(null);
                }}
              >
                {confirming === 'demo'
                  ? 'Load demo gym'
                  : confirming === 'over'
                    ? 'Start over'
                    : confirming === 'disconnect'
                      ? 'Disconnect'
                      : 'Erase everything'}
              </Button>
            </>
          }
        >
          {confirming !== 'disconnect' && (
            <ErrorBanner>
              This replaces everything currently in this browser — all {counts.members} members,{' '}
              {counts.payments} payments and {counts.visits} check-ins. It cannot be undone.
            </ErrorBanner>
          )}
          <p style={{ margin: 0, fontFamily: font.body, fontSize: 14, color: color.inkSecondary }}>
            {confirming === 'disconnect'
              ? `Your members, plans, payments and check-ins stay exactly as they are. This browser stops showing shop orders and products, and code ${cloud?.joinCode ?? ''} stops being managed from here. Members who already joined can’t be reached from this panel any more.`
              : confirming === 'over'
              ? `This browser forgets the current demo gym and its shop (join code ${cloud?.joinCode ?? ''} stops being yours here). You go back to the welcome screen, where Start demo makes a fresh gym with a new code.`
              : confirming === 'demo'
              ? 'A sample gym with around 128 members, their payment history and attendance will be created. Use this to show someone the product — not on a gym with real records in it.'
              : 'You will be left with an empty gym: no members, no plans, no payments.'}
          </p>
        </Sheet>
      )}

      {toast && <Toast message={toast} />}
    </>
  );
}
