/**
 * The gym's join code, big enough to read out across a front desk, with a copy
 * button. When this browser has no cloud gym there is no real code yet — showing
 * the CRM's local placeholder would send members to type a code that does
 * nothing — so it offers to turn the shop on instead.
 */

import { useRef, useState } from 'react';

import { Button, Card, ErrorBanner, SectionTitle, color, font, radius, space } from '../ui/kit';
import { tr } from '../i18n';
import { useCan } from '../auth/AuthProvider';
import { useShop } from './ShopProvider';
import { inviteMessage, whatsAppHref } from './invite';
import { navigate } from '../ui/router';

export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the old way
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export function JoinCodeCard({
  compact = false,
  flush = false,
  title,
}: {
  compact?: boolean;
  flush?: boolean;
  /** A section title drawn INSIDE the card, like every other settings section. */
  title?: string;
}) {
  const { cloud, connectShop, online } = useShop();
  const [copied, setCopied] = useState<'yes' | 'no' | null>(null);
  const codeRef = useRef<HTMLSpanElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Turning the shop on changes the gym: an owner's job (permissions.ts).
  const canManage = useCan()('manageGym');

  if (!cloud && !canManage) {
    return (
      <Card style={{ marginBottom: flush ? 0 : space.lg }}>
        <p style={{ margin: 0, fontFamily: font.body, fontSize: 14, color: color.inkSecondary }}>
          {tr(
            'The member app and shop are not turned on yet. Only an owner can turn them on.',
            'Member app aur Shop abhi chalu nahi hai. Sirf Owner ise chalu kar sakta hai.',
          )}
        </p>
      </Card>
    );
  }

  if (!cloud) {
    return (
      <Card style={{ marginBottom: flush ? 0 : space.lg }}>
        <div style={{ fontFamily: font.display, fontSize: 16, fontWeight: 600, color: color.ink }}>
          {tr('Let members order from your gym in the ForgeAI app', 'Members ko ForgeAI app mein aapke gym se order karne do')}
        </div>
        <p style={{ margin: `6px 0 0`, fontFamily: font.body, fontSize: 14, color: color.inkSecondary }}>
          {tr(
            'Turn on the shop to get your gym’s join code. It comes with 12 sample products you can change or delete.',
            'Gym ka join code paane ke liye Shop chalu karo. Saath mein 12 sample products milte hain jo aap badal ya hata sakte hain.',
          )}
        </p>
        {error && (
          <div style={{ marginTop: space.md }}>
            <ErrorBanner>{error}</ErrorBanner>
          </div>
        )}
        <div style={{ marginTop: space.md }}>
          <Button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await connectShop();
              } catch (e) {
                setError(e instanceof Error ? e.message : tr('Something went wrong. Please try again.', 'Kuch gadbad hui. Phir se try karo.'));
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? tr('Turning on…', 'Chalu ho raha hai…') : tr('Turn on the shop', 'Shop chalu karo')}
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card style={{ marginBottom: flush ? 0 : space.lg }} pad={space.xl}>
      {title && <SectionTitle>{title}</SectionTitle>}
      <div style={{ fontFamily: font.body, fontSize: 14, color: color.inkSecondary }}>
        {tr('Members join in the ', 'Members ')}
        <strong style={{ color: color.ink }}>{tr('ForgeAI app', 'ForgeAI app')}</strong>
        {tr(' with code', ' mein is code se judte hain')}
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: space.md,
          flexWrap: 'wrap',
          marginTop: space.sm,
        }}
      >
        <span
          ref={codeRef}
          aria-label={tr(`Join code ${cloud.joinCode.split('').join(' ')}`, `Join code ${cloud.joinCode.split('').join(' ')}`)}
          style={{
            fontFamily: font.mono,
            userSelect: 'all',
            fontSize: compact ? 30 : 40,
            fontWeight: 700,
            letterSpacing: 6,
            color: color.accentBright,
            background: color.surfaceSunken,
            border: `1px dashed ${color.borderStrong}`,
            borderRadius: radius.md,
            padding: '4px 14px',
            lineHeight: 1.2,
          }}
        >
          {cloud.joinCode}
        </span>
        <Button
          variant="ghost"
          onClick={async () => {
            const ok = await copyText(cloud.joinCode);
            if (!ok && codeRef.current) {
              // The browser refused the clipboard: select the code so Ctrl+C works.
              const range = document.createRange();
              range.selectNodeContents(codeRef.current);
              const sel = window.getSelection();
              sel?.removeAllRanges();
              sel?.addRange(range);
            }
            setCopied(ok ? 'yes' : 'no');
            window.setTimeout(() => setCopied(null), 3000);
          }}
        >
          {copied === 'yes' ? tr('Copied ✓', 'Copy ho gaya ✓') : tr('Copy code', 'Code copy karo')}
        </Button>
      </div>
      {copied === 'no' && (
        <div role="status" style={{ marginTop: space.sm, fontFamily: font.body, fontSize: 12, color: color.warning }}>
          {tr('This browser blocked copying. The code is selected — press Ctrl+C.', 'Is browser ne copy rok diya. Code select hai — Ctrl+C dabao.')}
        </div>
      )}
      <div style={{ marginTop: space.sm, fontFamily: font.body, fontSize: 12, color: color.inkMuted }}>
        {tr(
          "Easiest: send members your gym's link — one tap in the app and they are in. Or they type this code in the app's Shop tab. Their orders show up here.",
          'Sabse aasaan: members ko gym ka Link bhejo — app mein ek tap aur woh jud gaye. Ya woh app ke Shop tab mein yeh code daalein. Unke orders yahan dikhenge.',
        )}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: space.sm, marginTop: space.md }}>
        <Button onClick={() => window.open(whatsAppHref(inviteMessage(cloud.name, cloud.joinCode)), '_blank', 'noopener')}>
          {tr('Send link on WhatsApp', 'Link WhatsApp par bhejo')}
        </Button>
        <Button variant="ghost" onClick={() => navigate('/settings/invite')}>
          {tr('Invite & QR poster', 'Invite aur QR Poster')}
        </Button>
      </div>
      {!online && (
        <div style={{ marginTop: space.sm, fontFamily: font.body, fontSize: 12, color: color.warning }}>
          {tr(
            'Offline right now — the code still works; new orders show up when the internet is back.',
            'Abhi offline hain — code phir bhi chalega; internet aane par naye orders dikhenge.',
          )}
        </div>
      )}
    </Card>
  );
}
