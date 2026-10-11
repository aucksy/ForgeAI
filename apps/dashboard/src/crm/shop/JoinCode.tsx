/**
 * The gym's join code, big enough to read out across a front desk, with a copy
 * button. When this browser has no cloud gym there is no real code yet — showing
 * the CRM's local placeholder would send members to type a code that does
 * nothing — so it offers to turn the shop on instead.
 */

import { useRef, useState } from 'react';

import { Button, Card, ErrorBanner, color, font, radius, space } from '../ui/kit';
import { useShop } from './ShopProvider';

async function copyText(text: string): Promise<boolean> {
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

export function JoinCodeCard({ compact = false, flush = false }: { compact?: boolean; flush?: boolean }) {
  const { cloud, connectShop, online } = useShop();
  const [copied, setCopied] = useState<'yes' | 'no' | null>(null);
  const codeRef = useRef<HTMLSpanElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!cloud) {
    return (
      <Card style={{ marginBottom: flush ? 0 : space.lg }}>
        <div style={{ fontFamily: font.display, fontSize: 16, fontWeight: 600, color: color.ink }}>
          Let members order from your gym in the ForgeAI app
        </div>
        <p style={{ margin: `6px 0 0`, fontFamily: font.body, fontSize: 14, color: color.inkSecondary }}>
          Turn on the shop to get your gym’s join code. It comes with 12 sample products you can change
          or delete.
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
                setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? 'Turning on…' : 'Turn on the shop'}
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card style={{ marginBottom: flush ? 0 : space.lg }} pad={compact ? space.lg : space.xl}>
      <div style={{ fontFamily: font.body, fontSize: 14, color: color.inkSecondary }}>
        Members join in the <strong style={{ color: color.ink }}>ForgeAI app</strong> with code
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
          aria-label={`Join code ${cloud.joinCode.split('').join(' ')}`}
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
          {copied === 'yes' ? 'Copied ✓' : 'Copy code'}
        </Button>
      </div>
      {copied === 'no' && (
        <div role="status" style={{ marginTop: space.sm, fontFamily: font.body, fontSize: 12, color: color.warning }}>
          This browser blocked copying. The code is selected — press Ctrl+C.
        </div>
      )}
      <div style={{ marginTop: space.sm, fontFamily: font.body, fontSize: 12, color: color.inkMuted }}>
        In the app: open the Shop tab, type this code and their name, tap Join. Their orders show up here.
      </div>
      {!online && (
        <div style={{ marginTop: space.sm, fontFamily: font.body, fontSize: 12, color: color.warning }}>
          Offline right now — the code still works; new orders show up when the internet is back.
        </div>
      )}
    </Card>
  );
}
