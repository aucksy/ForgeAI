/**
 * R-571 (owner, 15 Nov 2026): "can we still keep that in the setup steps so the gym owner knows that they can do it?
 * They can choose to enable or disable it, and the whole setup will tell them about the page as well as the payments
 * they can enable by having them add the QR code or the link. It should be like one journey to set this up."
 *
 * Set up your gym's step "Let people find and join your gym online" opens this screen (/setup/online, the owner's).
 * Three parts, in order, each built from the pieces that already exist (no second copies):
 *  1. The free web page (only while gym web pages are open and this gym has the page part; HQ's per-gym switch, 0090,
 *     removes it): what it is, on by default, the owner's own "Not now" / "Turn off my page", and the way into the
 *     editor (Settings -> Your web page) to fill it and publish.
 *  2. The one link (shop/oneLink.ts) and its QR poster (shop/InviteScreen.tsx Poster, PrintSheet, downloadPoster):
 *     WhatsApp, copy, print, the picture, and the Google Maps tip.
 *  3. How people pay: only what is on today. Pay at the desk always; the desk's UPI QR from the gym's UPI ID (Settings
 *     -> Gym details); paying online when they join only while the Worker's JOIN_PAY switch is on (never "coming soon").
 * The step ticks itself when the page is published, or after "Not now" and sharing the link (logic/getStarted.ts).
 */
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import type { GymBrand } from '@forgeai/theme';

import { savePage } from '../../gympage/api';
import { draftFrom, pageAddress, pageLive, saveErrorOf, savePayload, thrownWords, type SavedPage } from '../../gympage/logic';
import { useJoinPayOn, usePagesOpen } from '../../gympage/pagesOpen';
import { rememberPage, useWebPage } from '../../gympage/pageState';
import { t } from '../../lang/lang';
import { validUpiId } from '../../logic/upiPay';
import * as shopApi from '../../shop/api';
import { GYM_PAGE_POSTER, JOIN_ONLINE_POSTER, Poster, PrintSheet, downloadPoster } from '../../shop/InviteScreen';
import { copyText } from '../../shop/JoinCode';
import { whatsAppHref } from '../../shop/invite';
import { useJoinOrigin } from '../../shop/linkOrigin';
import { gymLinkFrom, gymLinkMessage } from '../../shop/oneLink';
import { useSelfJoinReady } from '../../shop/selfJoinReady';
import { useShop } from '../../shop/ShopProvider';
import { useCrm } from '../../store';
import { noteLinkShared, rememberOpened, setPageNotNow, useGetStarted } from '../GetStartedCard';
import { Button, Card, ErrorBanner, PageHeader, Sheet, Toast, color, font, radius, space } from '../kit';
import { Redirect, navigate } from '../router';

const para: CSSProperties = { margin: 0, fontFamily: font.body, fontSize: 14, lineHeight: 1.5, color: color.inkSecondary };
const small: CSSProperties = { ...para, fontSize: 13, color: color.inkMuted };
const buttons: CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: space.sm, marginTop: space.md };

export function OnlineJourneyScreen() {
  const { steps, owner } = useGetStarted();
  const { cloud } = useShop();
  const step = steps.find((s) => s.key === 'online');
  // Opened from anywhere (a typed address, Invite members): its screens still offer "Back to" this journey.
  useEffect(() => rememberOpened('online'), []);
  if (!owner) return null;
  // Not an online gym (or the demo): the step is not in the list, so neither is this screen.
  if (!step || !cloud) return <Redirect to="/setup" />;
  return <Journey title={step.title} done={step.done} ownerKey={cloud.ownerKey} gymName={cloud.name} joinCode={cloud.joinCode} />;
}

function Journey({ title, done, ownerKey, gymName, joinCode }: { title: string; done: boolean; ownerKey: string; gymName: string; joinCode: string }) {
  const { snapshot } = useCrm();
  const gymId = snapshot.gym.gymId;
  const { saved } = useGetStarted();
  const web = useWebPage();
  const pagesOpen = usePagesOpen();
  const joinOrigin = useJoinOrigin();
  const joinPay = useJoinPayOn();
  const joinReady = useSelfJoinReady(joinCode);
  const link = gymLinkFrom({ pagesOpen, web, joinCode, joinOrigin });
  const isPage = link.kind === 'page';
  const pagePart = Boolean(web?.canEdit);
  const poster = isPage ? GYM_PAGE_POSTER : JOIN_ONLINE_POSTER;
  const [brand, setBrand] = useState<GymBrand | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // The logo for the poster (quiet: no logo is fine), as Invite members does.
  useEffect(() => {
    let live = true;
    shopApi
      .ownerGym(ownerKey)
      .then((g) => live && setBrand(g.brand ?? null))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [ownerKey]);

  const say = (words: string) => {
    setToast(words);
    window.setTimeout(() => setToast(null), 2500);
  };
  const shared = () => noteLinkShared(gymId);
  const linkWorks = isPage || joinReady;
  let n = 0;

  return (
    <>
      <PageHeader
        title={t(title)}
        subtitle={
          pagePart
            ? t('Three parts, in order: your free web page, your one link and QR poster, and how people pay.')
            : t('Two parts, in order: your join link and QR poster, and how people pay.')
        }
      />
      <div style={{ display: 'grid', gap: space.lg, maxWidth: 760 }}>
        {pagePart && web && (
          <Part n={++n} title={t('Your free web page')}>
            <PagePart ownerKey={ownerKey} gymId={gymId} page={web.page} notNow={saved.pageNotNow === true} onSaid={say} />
          </Part>
        )}

        <Part n={++n} title={isPage ? t('Your one link and QR poster') : t('Your join link and QR poster')}>
          {!linkWorks ? (
            <>
              <p style={para}>{t('Your join link works once your gym has at least one plan that people can pick. Add one in Plans.')}</p>
              <div style={buttons}>
                <Button variant="ghost" onClick={() => navigate('/plans')}>
                  {t('Open Plans')}
                </Button>
              </div>
            </>
          ) : (
            <>
              <div style={linkBox}>{link.url}</div>
              <p style={{ ...para, marginTop: space.sm }}>
                {isPage
                  ? t('This is your gym’s one link. It opens your web page on a phone or a computer, and its “Become a member” button opens your join form.')
                  : t('This is your gym’s one link. People open it on a phone or a computer, pick a plan and send you their details.')}
              </p>
              {link.pageNotMade && saved.pageNotNow !== true && (
                <p style={{ ...small, marginTop: space.sm }}>{t('Once your page is on, this link and the poster show your page instead. A poster you print now keeps working.')}</p>
              )}
              <div style={buttons}>
                <Button
                  onClick={() => {
                    window.open(whatsAppHref(gymLinkMessage(gymName, link, joinCode, joinOrigin, joinPay)), '_blank', 'noopener');
                    shared();
                  }}
                >
                  {t('Send on WhatsApp')}
                </Button>
                <Button
                  variant="ghost"
                  onClick={async () => {
                    const ok = await copyText(link.url);
                    if (ok) shared();
                    say(ok ? t('Link copied.') : t('This browser blocked copying. Select the text and copy it.'));
                  }}
                >
                  {t('Copy link')}
                </Button>
              </div>

              <div style={{ display: 'flex', justifyContent: 'center', marginTop: space.lg }}>
                <div style={{ width: '100%', maxWidth: 300 }}>
                  <Poster words={poster} gymName={gymName} joinCode={joinCode} link={link.url} brand={brand} />
                </div>
              </div>
              <div style={buttons}>
                <Button
                  variant="ghost"
                  onClick={() => {
                    shared();
                    window.print();
                  }}
                >
                  {t('Print poster')}
                </Button>
                <Button
                  variant="ghost"
                  onClick={async () => {
                    const ok = await downloadPoster(poster, gymName, joinCode, link.url, brand);
                    if (ok) shared();
                    say(ok ? t('Poster saved as a picture.') : t('Could not make the picture. Try Print poster.'));
                  }}
                >
                  {t('Download picture')}
                </Button>
              </div>
              <p style={{ ...small, marginTop: space.sm }}>{t('Print it on A4 and stick it at the desk. On a phone, Print → “Save as PDF” also works. Use the picture for a print shop.')}</p>

              <div style={tipBox}>
                <strong style={{ fontFamily: font.body, fontSize: 14, color: color.ink }}>{t('Google Maps')}</strong>
                <p style={{ ...para, marginTop: 2 }}>{t('Put this link on your gym’s Google Maps listing. In Google Business Profile, open Edit profile and paste it as your website.')}</p>
              </div>
              {saved.linkShared && <p style={{ ...para, marginTop: space.md, color: color.good, fontWeight: 700 }}>✓ {t('You have shared your link.')}</p>}
              {/* Hidden on screen, always on the page: phone Chrome draws its print preview after the tap returned. */}
              {createPortal(<PrintSheet sheetId="online-print" words={poster} gymName={gymName} joinCode={joinCode} link={link.url} brand={brand} />, document.body)}
            </>
          )}
        </Part>

        <Part n={++n} title={t('How people pay')}>
          <PayRow title={t('Pay at the gym desk')}>
            {t('People who ask to join online pay at your desk on their first visit. Then you make them a member on Today.')}
          </PayRow>
          <UpiRow upiId={validUpiId(snapshot.gym.upiId)} />
          {joinPay && (
            <PayRow title={t('Pay online when they join')}>
              {t('Connect your Razorpay or Cashfree account in Payments, then switch on “Take payments when people join online”. The money goes straight to your own account.')}
              <div style={buttons}>
                <Button variant="ghost" onClick={() => navigate('/settings/payments')}>
                  {t('Open Payments')}
                </Button>
              </div>
            </PayRow>
          )}
        </Part>

        {done && (
          <p role="status" style={{ ...para, color: color.good, fontWeight: 700 }}>
            ✓ {t('This step is done. You can come back here at any time.')}
          </p>
        )}
      </div>
      {toast && <Toast message={toast} />}
    </>
  );
}

function Part({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <Card>
      <h2 style={{ display: 'flex', alignItems: 'center', gap: space.sm, margin: `0 0 ${space.md}px`, fontFamily: font.display, fontSize: 17, fontWeight: 700, color: color.ink }}>
        <span
          aria-hidden
          style={{ width: 28, height: 28, borderRadius: 14, flexShrink: 0, display: 'grid', placeItems: 'center', fontFamily: font.body, fontSize: 13, fontWeight: 800, border: `2px solid ${color.borderStrong}`, color: color.inkSecondary }}
        >
          {n}
        </span>
        <span style={{ minWidth: 0 }}>{title}</span>
      </h2>
      {children}
    </Card>
  );
}

function PayRow({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ padding: `${space.sm}px 0`, borderTop: `1px solid ${color.border}` }}>
      <h3 style={{ margin: 0, fontFamily: font.body, fontSize: 15, fontWeight: 700, color: color.ink }}>{title}</h3>
      <div style={{ ...para, marginTop: 2 }}>{children}</div>
    </div>
  );
}

function UpiRow({ upiId }: { upiId: string | null }) {
  return (
    <PayRow title={t('UPI at the desk')}>
      {upiId
        ? t('Your UPI ID {upi} is saved. When the desk collects a payment, it can show a UPI QR with the amount, and people scan it with any UPI app.', { upi: upiId })
        : t('Add your gym’s UPI ID in Settings, under Gym details. Then the desk can show a UPI QR with the amount when people pay.')}
      {!upiId && (
        <div style={buttons}>
          <Button variant="ghost" onClick={() => navigate('/settings')}>
            {t('Add UPI ID')}
          </Button>
        </div>
      )}
    </PayRow>
  );
}

/** Part 1: the web page. On by default; the owner's own choice to say "Not now" or turn it off. */
function PagePart({ ownerKey, gymId, page, notNow, onSaid }: { ownerKey: string; gymId: string; page: SavedPage | null; notNow: boolean; onSaid: (w: string) => void }) {
  const { snapshot } = useCrm();
  const gymInfo = useMemo(() => ({ name: snapshot.gym.name, joinCode: snapshot.gym.joinCode }), [snapshot.gym.name, snapshot.gym.joinCode]);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const live = pageLive(page);
  const openEditor = () => {
    rememberOpened('online');
    navigate('/settings/web-page');
  };

  const turnOff = async () => {
    if (!page || busy) return;
    setBusy(true);
    setProblem(null);
    try {
      const r = await savePage(ownerKey, savePayload({ ...draftFrom(page, gymInfo), published: false }, page));
      if ('error' in r) {
        console.warn('[web page] the gym server refused turning the page off:', r.error);
        setProblem(saveErrorOf(r.error, page.slug).words);
        return;
      }
      rememberPage(ownerKey, { page: r.page, canEdit: true });
      setPageNotNow(gymId, true);
      setAsking(false);
      onSaid(t('Your page is off.'));
    } catch (e) {
      console.warn('[ForgeErr] web page: turning off', e);
      setProblem(thrownWords(e) ?? t('Your page could not be turned off. Check your internet and try again.'));
    } finally {
      setBusy(false);
    }
  };

  const intro = (
    <p style={para}>
      {t('MettleUp makes a free web page for your gym at join.mettleup.fit. It shows your fees, timings, photos and address. People can send you a question there, or tap “Become a member” to ask to join.')}
    </p>
  );

  let body: ReactNode;
  if (page?.hiddenByHq) {
    body = (
      <>
        <p style={{ ...para, marginTop: space.sm, color: color.criticalText, fontWeight: 700 }}>{t('MettleUp has taken your page down, so visitors cannot see it. Open your page to read MettleUp’s note.')}</p>
        <div style={buttons}>
          <Button variant="ghost" onClick={openEditor}>
            {t('Open your page')}
          </Button>
        </div>
      </>
    );
  } else if (live && page) {
    body = (
      <>
        <Status on text={t('Your page is on. People can open it at {address}.', { address: pageAddress(page.slug) })} />
        <div style={buttons}>
          <Button onClick={openEditor}>{t('Edit your page')}</Button>
          <Button variant="ghost" tone="danger" needsInternet onClick={() => setAsking(true)}>
            {t('Turn off my page')}
          </Button>
        </div>
      </>
    );
  } else if (notNow) {
    body = (
      <>
        <Status on={false} text={t('Your web page is off. Your one link below opens the join form instead.')} />
        <p style={{ ...small, marginTop: space.xs }}>{t('To turn it on, open your page, tick “Show my page to visitors” and save.')}</p>
        <div style={buttons}>
          <Button
            onClick={() => {
              setPageNotNow(gymId, false);
              openEditor();
            }}
          >
            {t('Turn my page on')}
          </Button>
        </div>
      </>
    );
  } else {
    body = (
      <>
        <Status
          on={false}
          text={page ? t('Your page is saved but not on yet. Open it, tick “Show my page to visitors” and save.') : t('Your page is not made yet. Add a few lines about your gym, what it has and some photos, then publish it.')}
        />
        <div style={buttons}>
          <Button onClick={openEditor}>{page ? t('Finish my page') : t('Make my page')}</Button>
          <Button variant="ghost" onClick={() => setPageNotNow(gymId, true)}>
            {t('Not now')}
          </Button>
        </div>
      </>
    );
  }

  return (
    <>
      {intro}
      {body}
      <p style={{ ...small, marginTop: space.sm }}>{t('It is your choice. You can turn your page on or off here at any time.')}</p>
      {problem && (
        <div style={{ marginTop: space.md }}>
          <ErrorBanner>{problem}</ErrorBanner>
        </div>
      )}
      {asking && (
        <Sheet
          title={t('Turn off your web page?')}
          onClose={() => setAsking(false)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setAsking(false)}>
                {t('Keep it on')}
              </Button>
              <Button tone="danger" needsInternet disabled={busy} onClick={turnOff}>
                {busy ? t('Turning off…') : t('Turn off my page')}
              </Button>
            </>
          }
        >
          <p style={para}>
            {t('Visitors then see that the page is not here, and links or posters with your page address stop working until you turn it on again. Your one link then opens the join form instead.')}
          </p>
        </Sheet>
      )}
    </>
  );
}

function Status({ on, text }: { on: boolean; text: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: space.sm, marginTop: space.md }}>
      <span aria-hidden style={{ width: 10, height: 10, borderRadius: 5, flexShrink: 0, marginTop: 6, background: on ? color.good : color.borderStrong }} />
      <strong style={{ fontFamily: font.body, fontSize: 15, color: color.ink, overflowWrap: 'anywhere' }}>{text}</strong>
    </div>
  );
}

const linkBox: CSSProperties = {
  fontFamily: font.mono,
  fontSize: 15,
  color: color.ink,
  background: color.surfaceSunken,
  border: `1px dashed ${color.borderStrong}`,
  borderRadius: radius.md,
  padding: '10px 12px',
  wordBreak: 'break-all',
  userSelect: 'all',
};

const tipBox: CSSProperties = {
  marginTop: space.lg,
  padding: `${space.md}px ${space.lg}px`,
  borderRadius: radius.md,
  background: color.surfaceSunken,
  border: `1px solid ${color.border}`,
};

