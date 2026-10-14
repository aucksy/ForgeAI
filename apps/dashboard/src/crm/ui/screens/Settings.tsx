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
import { LangToggle } from '../LangToggle';
import { JoinCodeCard } from '../../shop/JoinCode';
import { useShop } from '../../shop/ShopProvider';
import { useCrm } from '../../store';
import { tr } from '../../i18n';
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
  // Staff (front desk) sees only the language, the app install and their own sign-in card;
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
      flash(tr('Saved.', 'Save ho gaya.'));
    } catch (e) {
      // Without this, a failed write (storage full) just stopped the spinner and
      // said nothing — the owner would assume it saved.
      setError(e instanceof Error ? e.message : tr('Could not save your gym details.', 'Gym ki details save nahi hui.'));
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

  if (!canManage) return <StaffSettings />;

  return (
    <>
      <PageHeader title={tr('Settings', 'Settings')} subtitle={tr("Your gym's details and data", 'Aapke gym ki details aur data')} />

      {error && <ErrorBanner>{error}</ErrorBanner>}

      {/* Sign-in first: "put your records online" is the one thing here that protects the gym. */}
      <SignInCard />

      <InstallCard />

      <Card style={{ marginBottom: space.lg }}>
        <SectionTitle>{tr('Gym details', 'Gym ki details')}</SectionTitle>
        <TextField label={tr('Gym name', 'Gym ka naam')} value={name} onChange={setName} />
        <Grid min={220}>
          <TextField label={tr('Phone', 'Phone')} value={phone} onChange={setPhone} inputMode="tel" />
          <TextField
            label={tr('GSTIN (optional)', 'GSTIN (zaroori nahi)')}
            value={gstin}
            onChange={setGstin}
            hint={tr("Only if you're GST registered — used on invoices.", 'Sirf agar aap GST mein registered hain — bill par chhapta hai.')}
          />
        </Grid>
        <TextField label={tr('Address', 'Pata')} value={address} onChange={setAddress} multiline />
        <div style={{ marginTop: space.lg }}>
          <Button onClick={save} disabled={saving}>
            {saving ? tr('Saving…', 'Save ho raha hai…') : tr('Save details', 'Details save karo')}
          </Button>
        </div>
      </Card>

      {/* Titled inside its card like the sections above and below it — the title
          used to sit outside, on the page, the only one that did. */}
      <JoinCodeCard title={tr('Member app', 'Member app')} />

      {/* Gym branding: the gym's own logo and colours in the member app. */}
      <Card style={{ marginBottom: space.lg }}>
        <SectionTitle>{tr('Your look in the app', 'App mein aapka look')}</SectionTitle>
        <p style={{ margin: 0, fontFamily: font.body, fontSize: 14, color: color.inkSecondary }}>
          {cloud
            ? tr(
                'Your logo opens the app, and your colour runs through every screen members see.',
                'App aapke logo se khulti hai, aur aapka rang members ki har screen par dikhta hai.',
              )
            : tr(
                'Turn on the member app above first; then your logo and colour can run through it.',
                'Pehle upar Member App chalu karo; phir aapka logo aur rang usmein dikhega.',
              )}
        </p>
        <div style={{ marginTop: space.lg }}>
          <Button variant="ghost" disabled={!cloud} onClick={() => navigate('/settings/branding')}>
            {tr('Open branding', 'Branding kholo')}
          </Button>
        </div>
      </Card>

      <Card>
        <SectionTitle>{tr('Your data', 'Aapka data')}</SectionTitle>
        <p style={{ margin: 0, fontFamily: font.body, fontSize: 14, color: color.inkSecondary }}>
          {tr(
            `${counts.members} members · ${counts.memberships} memberships · ${counts.payments} payments · ${counts.visits} check-ins. Set up ${formatDay(dateISOFromEpoch(gym.createdAt))}.`,
            `${counts.members} members · ${counts.memberships} memberships · ${counts.payments} payments · ${counts.visits} Check-in. Shuru kiya ${formatDay(dateISOFromEpoch(gym.createdAt))}.`,
          )}
        </p>
        <p style={{ margin: `${space.sm}px 0 0`, fontFamily: font.body, fontSize: 13, color: color.inkMuted }}>
          {online
            ? tr(
                'Stored online. Safe if a phone or computer breaks, and the same on every device you sign in on.',
                'Online save hai. Phone ya computer toote tab bhi safe, aur jis bhi device par sign in karo wahan same.',
              )
            : tr(
                'Stored in this browser only. Put your records online (above) to keep them safe and open them anywhere.',
                'Sirf is browser mein save hai. Data safe rakhne aur kahin bhi kholne ke liye upar se Online karo.',
              )}
        </p>

        {!online && canErase && (
        <Row gap={space.sm}>
          <div style={{ marginTop: space.lg }}>
            <Button variant="ghost" onClick={() => setConfirming('demo')}>
              {tr('Load demo gym', 'Demo gym kholo')}
            </Button>
          </div>
          <div style={{ marginTop: space.lg }}>
            <Button variant="ghost" tone="danger" onClick={() => setConfirming('fresh')}>
              {tr('Erase and start fresh', 'Sab mitao, naya shuru karo')}
            </Button>
          </div>
          {/* Only a DEMO gym may be started over: that erases this browser. A real
              gym that turned the shop on can only disconnect it, which keeps
              every member and payment here. */}
          {cloud?.demo && (
            <div style={{ marginTop: space.lg }}>
              <Button variant="ghost" tone="danger" onClick={() => setConfirming('over')}>
                {tr('Start over with a new demo gym', 'Naye demo gym se shuru karo')}
              </Button>
            </div>
          )}
          {cloud && !cloud.demo && (
            <div style={{ marginTop: space.lg }}>
              <Button variant="ghost" tone="danger" onClick={() => setConfirming('disconnect')}>
                {tr('Disconnect the shop', 'Shop band karo')}
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
              ? tr('Load the demo gym?', 'Demo gym kholein?')
              : confirming === 'over'
                ? tr('Start over with a new demo gym?', 'Naye demo gym se shuru karein?')
                : confirming === 'disconnect'
                  ? tr('Disconnect the shop?', 'Shop band karein?')
                  : tr('Erase everything?', 'Sab kuch mitayein?')
          }
          onClose={closeConfirm}
          footer={
            <>
              <Button variant="ghost" onClick={() => setConfirming(null)}>
                {tr('Cancel', 'Cancel')}
              </Button>
              <Button
                tone="danger"
                onClick={async () => {
                  setError(null);
                  try {
                    if (confirming === 'disconnect') {
                      disconnectShop();
                      setConfirming(null);
                      flash(tr('Shop disconnected. Your members and payments are still here.', 'Shop band ho gayi. Aapke members aur payments yahin hain.'));
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
                      flash(tr('Demo gym loaded.', 'Demo gym khul gaya.'));
                    } else {
                      // The PERSISTED name, not the unsaved form field: an
                      // unsaved edit here decided whether the fresh gym counted
                      // as "never set up" and bounced back to the welcome screen.
                      await startEmptyGym(gym.name);
                      flash(tr('Started fresh.', 'Naya shuru ho gaya.'));
                    }
                  } catch (e) {
                    setError(e instanceof Error ? e.message : tr('That didn’t work. Please try again.', 'Nahi hua. Phir se try karo.'));
                  }
                  setConfirming(null);
                }}
              >
                {confirming === 'demo'
                  ? tr('Load demo gym', 'Demo gym kholo')
                  : confirming === 'over'
                    ? tr('Start over', 'Naya shuru karo')
                    : confirming === 'disconnect'
                      ? tr('Disconnect', 'Band karo')
                      : tr('Erase everything', 'Sab mitao')}
              </Button>
            </>
          }
        >
          {confirming !== 'disconnect' && (
            <ErrorBanner>
              {tr(
                `This replaces everything currently in this browser — all ${counts.members} members, ${counts.payments} payments and ${counts.visits} check-ins. It cannot be undone.`,
                `Is browser mein jo kuch hai sab badal jayega — saare ${counts.members} members, ${counts.payments} payments aur ${counts.visits} Check-in. Yeh wapas nahi hoga.`,
              )}
            </ErrorBanner>
          )}
          <p style={{ margin: 0, fontFamily: font.body, fontSize: 14, color: color.inkSecondary }}>
            {confirming === 'disconnect'
              ? tr(
                  `Your members, plans, payments and check-ins stay exactly as they are. This browser stops showing shop orders and products, and code ${cloud?.joinCode ?? ''} stops being managed from here. Members who already joined can’t be reached from this panel any more.`,
                  `Aapke members, Plan, payments aur Check-in jaise hain waise rahenge. Yeh browser Shop ke Order aur products dikhana band karega, aur Code ${cloud?.joinCode ?? ''} yahan se nahi chalega. Jo members pehle join kar chuke hain, unse is panel se baat nahi ho payegi.`,
                )
              : confirming === 'over'
              ? tr(
                  `This browser forgets the current demo gym and its shop (join code ${cloud?.joinCode ?? ''} stops being yours here). You go back to the welcome screen, where Start demo makes a fresh gym with a new code.`,
                  `Yeh browser abhi wala Demo gym aur uski Shop bhool jayega (join Code ${cloud?.joinCode ?? ''} yahan aapka nahi rahega). Aap shuru wali screen par pahunchenge, jahan "Demo shuru karo" naye Code ke saath naya gym banata hai.`,
                )
              : confirming === 'demo'
              ? tr(
                  'A sample gym with around 128 members, their payment history and attendance will be created. Use this to show someone the product — not on a gym with real records in it.',
                  'Lagbhag 128 members, unki payments aur hazri ke saath ek Demo gym banega. Ise kisi ko product dikhane ke liye use karein — asli data wale gym par nahi.',
                )
              : tr(
                  'You will be left with an empty gym: no members, no plans, no payments.',
                  'Gym khaali ho jayega: koi member nahi, koi Plan nahi, koi payment nahi.',
                )}
          </p>
        </Sheet>
      )}

      {toast && <Toast message={toast} />}
    </>
  );
}

/** Settings for a Staff person: language, the app on this phone, and their own sign-in (sign out). */
function StaffSettings() {
  return (
    <>
      <PageHeader title={tr('Settings', 'Settings')} subtitle={tr('Language, app and your sign-in', 'Bhasha, app aur aapka sign in')} />
      <Card style={{ marginBottom: space.lg }}>
        <SectionTitle>{tr('Language', 'Bhasha')}</SectionTitle>
        <LangToggle />
      </Card>
      <SignInCard />
      <InstallCard />
    </>
  );
}
