/**
 * Settings — the gym's own details, and the data actions.
 *
 * "Load demo gym" and "Start fresh" are both destructive, so both confirm first and
 * both say plainly what will happen. The mobile app learned this the hard way in
 * Phase O2: a reset that quietly regenerates fake data over someone's real records
 * is the single worst thing this kind of app can do.
 */

import { useEffect, useRef, useState } from 'react';

import { useCrm } from '../../store';
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

  const [name, setName] = useState(gym.name);
  const [phone, setPhone] = useState(gym.phone ?? '');
  const [address, setAddress] = useState(gym.address ?? '');
  const [gstin, setGstin] = useState(gym.gstin ?? '');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<'demo' | 'fresh' | null>(null);

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

      <Card style={{ marginBottom: space.lg }}>
        <SectionTitle>Member app</SectionTitle>
        <p style={{ margin: 0, fontFamily: font.body, fontSize: 14, color: color.inkSecondary }}>
          Members enter this code in the ForgeAI app to link their training to your gym.
        </p>
        <div
          style={{
            marginTop: space.md,
            fontFamily: font.mono,
            fontSize: 30,
            fontWeight: 700,
            letterSpacing: 4,
            color: color.accentBright,
          }}
        >
          {gym.joinCode}
        </div>
      </Card>

      <Card>
        <SectionTitle>Your data</SectionTitle>
        <p style={{ margin: 0, fontFamily: font.body, fontSize: 14, color: color.inkSecondary }}>
          {counts.members} members · {counts.memberships} memberships · {counts.payments} payments ·{' '}
          {counts.visits} check-ins. Set up {formatDay(dateISOFromEpoch(gym.createdAt))}.
        </p>
        <p style={{ margin: `${space.sm}px 0 0`, fontFamily: font.body, fontSize: 13, color: color.inkMuted }}>
          This gym is stored in this browser. Signing in to the cloud (coming next) is what makes it
          reachable from any device and safe if this computer dies.
        </p>

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
        </Row>
      </Card>

      {confirming && (
        <Sheet
          title={confirming === 'demo' ? 'Load the demo gym?' : 'Erase everything?'}
          onClose={() => setConfirming(null)}
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
                {confirming === 'demo' ? 'Load demo gym' : 'Erase everything'}
              </Button>
            </>
          }
        >
          <ErrorBanner>
            This replaces everything currently in this browser — all {counts.members} members,{' '}
            {counts.payments} payments and {counts.visits} check-ins. It cannot be undone.
          </ErrorBanner>
          <p style={{ margin: 0, fontFamily: font.body, fontSize: 14, color: color.inkSecondary }}>
            {confirming === 'demo'
              ? 'A sample gym with around 128 members, their payment history and attendance will be created. Use this to show someone the product — not on a gym with real records in it.'
              : 'You will be left with an empty gym: no members, no plans, no payments.'}
          </p>
        </Sheet>
      )}

      {toast && <Toast message={toast} />}
    </>
  );
}
