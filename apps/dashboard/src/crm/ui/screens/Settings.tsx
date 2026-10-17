/**
 * Settings — the gym's own details, and the data actions.
 *
 * "Load demo gym" and "Start fresh" are both destructive, so both confirm first and
 * both say plainly what will happen. The mobile app learned this the hard way in
 * Phase O2: a reset that quietly regenerates fake data over someone's real records
 * is the single worst thing this kind of app can do.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { useAuth, useCan } from '../../auth/AuthProvider';
import { SignInCard } from '../../auth/GoOnlineCard';
import { InstallCard } from '../InstallCard';
import { ThemeToggle } from '../ThemeToggle';
import { JoinCodeCard } from '../../shop/JoinCode';
import { useShop } from '../../shop/ShopProvider';
import { useCrm } from '../../store';
import { navigate } from '../router';
import { dateISOFromEpoch, formatDay } from '../../logic/dates';
import { checkGymDetails } from '../../logic/gst';
import { countOf } from '../../logic/plural';
import { unreadableCopy } from '../../data/local';
import { downloadSavedData } from '../../store';
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
  // Staff (front desk) sees only the screen colours, the app install and their own sign-in card;
  // gym details, branding, the member app switch and the data actions are the owner's.
  const allowed = useCan();
  const canManage = allowed('manageGym');
  const canErase = allowed('eraseOrDemo');

  const [name, setName] = useState(gym.name);
  const [phone, setPhone] = useState(gym.phone ?? '');
  const [address, setAddress] = useState(gym.address ?? '');
  const [gstin, setGstin] = useState(gym.gstin ?? '');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<{ field: 'name' | 'gstin'; message: string } | null>(null);
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
    // C7-11 / C7-41: a wrong GSTIN or a blank name is said on its field, never saved with "Saved.".
    const problem = checkGymDetails({ name, gstin });
    setFieldError(problem);
    if (problem) return;
    setSaving(true);
    setError(null);
    try {
      await updateGym({
        name: name.trim(),
        phone: phone.trim() || null,
        address: address.trim() || null,
        gstin: gstin.trim().toUpperCase() || null,
      });
      // The app shows members the gym's name, so a rename goes to the cloud too.
      await renameCloudGym(name.trim());
      flash('Saved.');
    } catch (e) {
      // Without this, a failed write (storage full) just stopped the spinner and
      // said nothing — the owner would assume it saved.
      setError(e instanceof Error ? e.message : 'Could not save your gym details.');
    } finally {
      setSaving(false);
    }
  };

  // Read once per visit to Settings: it only changes when a damaged gym is found at start-up.
  const [kept] = useState(() => unreadableCopy());

  const counts = {
    members: snapshot.members.length,
    memberships: snapshot.memberships.length,
    payments: snapshot.payments.length,
    visits: snapshot.visits.length,
  };

  if (!canManage) return <StaffSettings />;

  return (
    <>
      <PageHeader title="Settings" subtitle="Your gym's details and data" />

      {error && <ErrorBanner>{error}</ErrorBanner>}

      {/* Sign-in first: "put your records online" is the one thing here that protects the gym. */}
      <SignInCard />

      <InstallCard />

      <Card style={{ marginBottom: space.lg }}>
        <SectionTitle>Gym details</SectionTitle>
        <TextField
          label="Gym name"
          value={name}
          onChange={setName}
          error={fieldError?.field === 'name' ? fieldError.message : null}
        />
        <Grid min={220}>
          <TextField label="Phone" value={phone} onChange={setPhone} inputMode="tel" />
          <TextField
            label="GSTIN (optional)"
            value={gstin}
            onChange={setGstin}
            error={fieldError?.field === 'gstin' ? fieldError.message : null}
            hint="Only if you have GST. It shows on your receipts."
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
            ? 'Members see your logo when the app opens, and your colour on every screen.'
            : 'First turn on the member app above. Then you can add your logo and colour.'}
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
          {`${countOf(counts.members, 'member')} · ${countOf(counts.memberships, 'membership')} · ${countOf(counts.payments, 'payment')} · ${countOf(counts.visits, 'check-in')}. Set up ${formatDay(dateISOFromEpoch(gym.createdAt))}.`}
        </p>
        <p style={{ margin: `${space.sm}px 0 0`, fontFamily: font.body, fontSize: 13, color: color.inkMuted }}>
          {online
            ? 'Saved online. Safe if a phone or computer breaks. The same on every phone or computer you sign in on.'
            : 'Saved in this browser only. Put your gym online (above) to keep it safe and open it anywhere.'}
        </p>

        <div style={{ marginTop: space.lg }}>
          <Button variant="ghost" wrap onClick={() => navigate('/members/import')}>
            Import members from Excel
          </Button>
        </div>

        {/* UAT U-A13: a gym this browser could not read is kept, and stays downloadable here. */}
        {kept && (
          <div style={{ marginTop: space.lg }}>
            <p style={{ margin: 0, fontFamily: font.body, fontSize: 13, color: color.inkMuted }}>
              A gym this browser couldn’t read is kept here.
            </p>
            <div style={{ marginTop: space.sm }}>
              <Button variant="ghost" wrap onClick={() => downloadSavedData(kept.raw)}>
                Download the saved data
              </Button>
            </div>
          </div>
        )}

        {!online && canErase && (
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
              {`This replaces everything in this browser: ${countOf(counts.members, 'member')}, ${countOf(counts.payments, 'payment')} and ${countOf(counts.visits, 'check-in')}. You can’t undo this.`}
            </ErrorBanner>
          )}
          <p style={{ margin: 0, fontFamily: font.body, fontSize: 14, color: color.inkSecondary }}>
            {confirming === 'disconnect'
              ? `Your members, plans, payments and check-ins stay as they are. This browser stops showing shop orders and products. You can’t manage gym code ${cloud?.joinCode ?? ''} from here any more. You also can’t reach members who already joined from this admin app.`
              : confirming === 'over'
              ? `This browser forgets this demo gym and its shop (gym code ${cloud?.joinCode ?? ''}). You go back to the first screen. There, Start demo makes a new gym with a new code.`
              : confirming === 'demo'
              ? 'This makes a sample gym with about 128 members, their payments and check-ins. Use it to show someone the app. Don’t use it on a gym with real members.'
              : 'You will be left with an empty gym: no members, no plans, no payments.'}
          </p>
        </Sheet>
      )}

      {toast && <Toast message={toast} />}
    </>
  );
}

/** Settings for a Staff person: screen colours, the app on this phone, and their own sign-in (sign out). */
function StaffSettings() {
  return (
    <>
      <PageHeader title="Settings" subtitle="Screen colours, app and your sign-in" />
      <Card style={{ marginBottom: space.lg }}>
        <SectionTitle>Dark or light</SectionTitle>
        <ThemeToggle />
      </Card>
      {/* Adding members is front-desk work, so Staff may import a list too. */}
      <Card style={{ marginBottom: space.lg }}>
        <SectionTitle>Members</SectionTitle>
        <Button variant="ghost" wrap onClick={() => navigate('/members/import')}>
          Import members from Excel
        </Button>
      </Card>
      <SignInCard />
      <InstallCard />
    </>
  );
}
