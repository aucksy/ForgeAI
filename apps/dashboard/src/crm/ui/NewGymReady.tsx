/**
 * Owner, 1 Nov 2026: shown once, right after "Create my gym": the gym code, the join link and its QR,
 * with Copy and Share, and one line on what members do with it. Reuses Settings → Invite's link, QR
 * and WhatsApp words (shop/invite.ts, shop/InviteScreen.tsx).
 */

import { useEffect, useState } from 'react';

import { t } from '../lang/lang';
import { forgetNewGym, peekNewGym } from '../logic/newGymReady';
import { copyText } from '../shop/JoinCode';
import { QrSvg } from '../shop/InviteScreen';
import { inviteLink, inviteMessage, whatsAppHref } from '../shop/invite';
import { Button, Sheet, color, font, radius, space } from './kit';
import { navigate } from './router';

export function NewGymReady() {
  const [gym, setGym] = useState(peekNewGym);
  const [said, setSaid] = useState<string | null>(null);
  // Shown once: the note goes as soon as the card is on screen.
  useEffect(() => {
    if (gym) forgetNewGym();
  }, [gym]);
  if (!gym) return null;

  const link = inviteLink(gym.joinCode);
  const message = inviteMessage(gym.name, gym.joinCode);
  const close = () => setGym(null);
  const say = (words: string) => {
    setSaid(words);
    window.setTimeout(() => setSaid(null), 2500);
  };
  const copy = async (text: string, done: string) => say((await copyText(text)) ? done : t('This browser blocked copying. Select the text and copy it.'));
  const share = async () => {
    // The phone's own share sheet where there is one; WhatsApp otherwise.
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ text: message });
        return;
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return;
        console.warn('[new gym] share sheet failed; opening WhatsApp', e);
      }
    }
    window.open(whatsAppHref(message), '_blank', 'noopener');
  };

  const box = {
    fontFamily: font.mono,
    color: color.ink,
    background: color.surfaceSunken,
    border: `1px dashed ${color.borderStrong}`,
    borderRadius: radius.md,
    userSelect: 'all',
  } as const;
  const label = { margin: `0 0 ${space.xs}px`, fontFamily: font.body, fontSize: 13, fontWeight: 700, color: color.inkSecondary } as const;

  return (
    <Sheet
      title={t('Your gym is ready')}
      onClose={close}
      footer={
        <>
          <Button variant="ghost" onClick={() => { close(); navigate('/settings/invite'); }}>
            {t('Open the QR poster')}
          </Button>
          <Button onClick={close}>{t('Done')}</Button>
        </>
      }
    >
      <p style={{ margin: 0, fontFamily: font.body, fontSize: 15, fontWeight: 600, color: color.ink }}>
        {t('Members type this code in the MettleUp app to join your gym.')}
      </p>

      <div style={{ marginTop: space.lg }}>
        <p style={label}>{t('Gym code')}</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: space.md, flexWrap: 'wrap' }}>
          <span aria-label={`${t('Gym code')} ${gym.joinCode.split('').join(' ')}`} style={{ ...box, fontSize: 30, fontWeight: 700, letterSpacing: 6, color: color.accentBright, padding: '4px 14px', lineHeight: 1.2 }}>
            {gym.joinCode}
          </span>
          <Button variant="ghost" onClick={() => void copy(gym.joinCode, t('Code copied.'))}>
            {t('Copy code')}
          </Button>
        </div>
      </div>

      <div style={{ marginTop: space.lg }}>
        <p style={label}>{t('Join link')}</p>
        <div style={{ ...box, fontSize: 14, padding: '10px 12px', wordBreak: 'break-all' }}>{link}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: space.sm, marginTop: space.sm }}>
          <Button onClick={() => void share()}>{t('Share')}</Button>
          <Button variant="ghost" onClick={() => void copy(link, t('Link copied.'))}>
            {t('Copy link')}
          </Button>
        </div>
      </div>

      <div style={{ marginTop: space.lg, display: 'flex', alignItems: 'center', gap: space.lg, flexWrap: 'wrap' }}>
        <div style={{ width: 132, flexShrink: 0, borderRadius: radius.md, overflow: 'hidden' }}>
          <QrSvg text={link} px={132} label={`QR code for ${link}`} />
        </div>
        <p style={{ margin: 0, flex: '1 1 160px', fontFamily: font.body, fontSize: 13, color: color.inkSecondary }}>
          {t('Members can also scan this QR with their phone camera. The link opens the MettleUp app on your gym.')}
        </p>
      </div>

      {said && (
        <p role="status" style={{ margin: `${space.md}px 0 0`, fontFamily: font.body, fontSize: 13, fontWeight: 600, color: color.good }}>
          {said}
        </p>
      )}
    </Sheet>
  );
}
