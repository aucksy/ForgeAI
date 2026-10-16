/**
 * Settings → Invite members (14 Oct 2026): the gym's ONE invite link, three ways out.
 *  - "Send on WhatsApp": WhatsApp opens with the invite typed in; the owner picks a person, a
 *    group or the gym's broadcast list. (Each member's own page has "Send app invite" too.)
 *  - "Copy link" / "Copy message": for anywhere else (Instagram bio, SMS, the gym's status).
 *  - The front-desk QR poster: printed (A4, from the browser's print — "Save as PDF" works on a
 *    phone too) or downloaded as a picture to send to a print shop.
 * The link and words are built in invite.ts; the member's side is the app's "Join <gym>" screen
 * and, without the app, the link's web page (deploy/panel/join.html).
 */

import qrcode from 'qrcode-generator';
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

import type { GymBrand } from '@forgeai/theme';

import { tr } from '../i18n';
import * as api from './api';
import { JoinCodeCard, copyText } from './JoinCode';
import { useShop } from './ShopProvider';
import { inviteLink, inviteMessage, whatsAppHref } from './invite';
import { Button, Card, PageHeader, SectionTitle, Toast, color, font, radius, space, useIsCompact } from '../ui/kit';
import { navigate } from '../ui/router';

export function InviteScreen() {
  const { cloud } = useShop();
  return (
    <>
      <PageHeader
        title={tr('Invite members', 'Members ko bulao')}
        subtitle={tr(
          "Send your gym's link on WhatsApp, or put a QR at the front desk",
          'Apne gym ka Link WhatsApp par bhejo, ya front desk par QR lagao',
        )}
        actions={
          <Button variant="ghost" onClick={() => navigate('/settings')}>
            {tr('Back to Settings', 'Settings par wapas')}
          </Button>
        }
      />
      {cloud ? (
        <InviteBody ownerKey={cloud.ownerKey} gymName={cloud.name} joinCode={cloud.joinCode} />
      ) : (
        <JoinCodeCard title={tr('Turn on the member app first', 'Pehle member app chalu karo')} />
      )}
    </>
  );
}

/** The QR's dark squares as one SVG path (crisp at any print size). PURE apart from the encoder. */
export function qrModules(text: string): { size: number; path: string } {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  let path = '';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) if (qr.isDark(r, c)) path += `M${c} ${r}h1v1h-1z`;
  }
  return { size: n, path };
}

export function QrSvg({ text, px, label }: { text: string; px: number | string; label: string }) {
  const { size, path } = useMemo(() => qrModules(text), [text]);
  const q = 4; // the quiet margin scanners need, in squares
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`${-q} ${-q} ${size + 2 * q} ${size + 2 * q}`}
      width={px}
      height={px}
      shapeRendering="crispEdges"
      style={{ display: 'block', background: '#FFFFFF' }}
    >
      <rect x={-q} y={-q} width={size + 2 * q} height={size + 2 * q} fill="#FFFFFF" />
      <path d={path} fill="#000000" />
    </svg>
  );
}

function InviteBody({ ownerKey, gymName, joinCode }: { ownerKey: string; gymName: string; joinCode: string }) {
  const compact = useIsCompact();
  const link = inviteLink(joinCode);
  const message = inviteMessage(gymName, joinCode);
  const [toast, setToast] = useState<string | null>(null);
  const [brand, setBrand] = useState<GymBrand | null>(null);

  // The logo for the poster (quiet: no logo is fine).
  useEffect(() => {
    let live = true;
    api
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

  return (
    <div style={{ display: 'grid', gap: space.lg, gridTemplateColumns: compact ? '1fr' : 'minmax(0, 1fr) minmax(0, 1fr)', alignItems: 'start' }}>
      <Card>
        <SectionTitle>{tr("Your gym's link", 'Aapke gym ka Link')}</SectionTitle>
        <div
          style={{
            fontFamily: font.mono,
            fontSize: 15,
            color: color.ink,
            background: color.surfaceSunken,
            border: `1px dashed ${color.borderStrong}`,
            borderRadius: radius.md,
            padding: '10px 12px',
            wordBreak: 'break-all',
            userSelect: 'all',
          }}
        >
          {link}
        </div>
        <p style={{ margin: `${space.sm}px 0 0`, fontFamily: font.body, fontSize: 13, color: color.inkSecondary }}>
          {tr(
            `A member taps it on their phone: the ForgeAI app opens on “Join ${gymName}” — one tap and they are in. Without the app, the link shows how to get it, and your gym code ${joinCode}.`,
            `Member phone par tap kare: ForgeAI app “Join ${gymName}” par khulega — ek tap aur woh jud gaye. App na ho to Link app lene ka tareeka aur aapka gym code ${joinCode} dikhata hai.`,
          )}
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: space.sm, marginTop: space.lg }}>
          <Button onClick={() => window.open(whatsAppHref(message), '_blank', 'noopener')}>{tr('Send on WhatsApp', 'WhatsApp par bhejo')}</Button>
          <Button
            variant="ghost"
            onClick={async () =>
              say((await copyText(link)) ? tr('Link copied.', 'Link copy ho gaya.') : tr('This browser blocked copying.', 'Is browser ne copy rok diya.'))
            }
          >
            {tr('Copy link', 'Link copy karo')}
          </Button>
          <Button
            variant="ghost"
            onClick={async () =>
              say((await copyText(message)) ? tr('Message copied.', 'Message copy ho gaya.') : tr('This browser blocked copying.', 'Is browser ne copy rok diya.'))
            }
          >
            {tr('Copy message', 'Message copy karo')}
          </Button>
        </div>
        <div style={{ height: space.xl }} />
        <SectionTitle>{tr('The message members get', 'Members ko yeh message milega')}</SectionTitle>
        <pre
          style={{
            margin: 0,
            whiteSpace: 'pre-wrap',
            fontFamily: font.body,
            fontSize: 13,
            lineHeight: 1.5,
            color: color.inkSecondary,
            background: color.surfaceSunken,
            borderRadius: radius.md,
            padding: space.md,
          }}
        >
          {message}
        </pre>
        <p style={{ margin: `${space.sm}px 0 0`, fontFamily: font.body, fontSize: 12, color: color.inkMuted }}>
          {tr(
            'To invite one member, open them in Members and tap “Send app invite”.',
            'Ek member ko bulane ke liye, Members mein unhe kholo aur “Send app invite” dabao.',
          )}
        </p>
      </Card>

      <Card>
        <SectionTitle>{tr('Front-desk QR poster', 'Front desk ka QR Poster')}</SectionTitle>
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <div style={{ width: '100%', maxWidth: 360 }}>
            <Poster words={POSTER} gymName={gymName} joinCode={joinCode} link={link} brand={brand} />
          </div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: space.sm, marginTop: space.lg }}>
          <Button onClick={() => window.print()}>{tr('Print poster', 'Poster print karo')}</Button>
          <Button
            variant="ghost"
            onClick={async () => {
              const ok = await downloadPoster(POSTER, gymName, joinCode, link, brand);
              say(
                ok
                  ? tr('Poster saved as a picture.', 'Poster picture ki tarah save ho gaya.')
                  : tr('Could not make the picture. Try Print poster.', 'Picture nahi bani. Poster print karo try karo.'),
              );
            }}
          >
            {tr('Download picture', 'Picture download karo')}
          </Button>
        </div>
        <p style={{ margin: `${space.sm}px 0 0`, fontFamily: font.body, fontSize: 12, color: color.inkMuted }}>
          {tr(
            'Print it on A4 and stick it at the desk. On a phone, Print → “Save as PDF” works too; the picture is for a print shop.',
            'A4 par print karke desk par lagao. Phone par Print → “Save as PDF” bhi chalta hai; picture print shop ke liye hai.',
          )}
        </p>
      </Card>

      {/* Always on the page (hidden on screen): phone Chrome draws its print preview after the
          button's tap has returned, so a sheet added only for the print could already be gone. */}
      {createPortal(<PrintSheet sheetId="invite-print" words={POSTER} gymName={gymName} joinCode={joinCode} link={link} brand={brand} />, document.body)}
      {toast && <Toast message={toast} />}
    </div>
  );
}

/**
 * Words on a poster, English with Hinglish under it — BOTH languages are printed, whatever the
 * panel shows, because the members reading the wall read one or the other. Shared by the screen,
 * the print and the picture. The invite poster (POSTER) and the check-in poster
 * (checkin.ts CHECKIN_POSTER) are the same drawing with different words.
 */
export interface PosterWords {
  lead: string;
  leadHi: string;
  steps: readonly string[];
  stepsHi: string;
  codeLine: (code: string) => string;
  codeLineHi: (code: string) => string;
  /** The downloaded picture's name, before the code ("invite-poster" → invite-poster-RAMS01.png). */
  file: string;
}

export const POSTER: PosterWords = {
  lead: 'Join our gym in the ForgeAI app',
  leadHi: 'ForgeAI app mein hamare gym se judiye',
  steps: ['Scan with your phone camera', 'Get the ForgeAI app', 'Tap Join'],
  stepsHi: 'Camera se scan karein · App lein · Join dabaayein',
  codeLine: (code: string) => `Or type gym code ${code} in the app's Shop tab`,
  codeLineHi: (code: string) => `Ya app ke Shop tab mein gym code ${code} daalein`,
  file: 'invite-poster',
};

/** The poster as it looks on screen and on paper: white, black text, the gym's logo on top. */
export function Poster({
  words,
  gymName,
  joinCode,
  link,
  brand,
  print = false,
}: {
  words: PosterWords;
  gymName: string;
  joinCode: string;
  link: string;
  brand: GymBrand | null;
  print?: boolean;
}) {
  const u = (n: number) => (print ? `${n * 0.5}mm` : `${n}px`);
  return (
    <div
      style={{
        background: '#FFFFFF',
        color: '#111111',
        borderRadius: print ? 0 : radius.md,
        padding: u(print ? 24 : 20),
        textAlign: 'center',
        fontFamily: "'Manrope', system-ui, sans-serif",
        boxSizing: 'border-box',
        width: '100%',
      }}
    >
      {brand?.logoUrl && (
        <div style={{ background: brand.bg ?? '#111111', borderRadius: u(10), display: 'inline-block', padding: u(8), marginBottom: u(8) }}>
          <img src={brand.logoUrl} alt="" style={{ height: print ? '22mm' : 48, maxWidth: print ? '80mm' : 200, objectFit: 'contain', display: 'block' }} />
        </div>
      )}
      <div style={{ fontFamily: "'Sora', system-ui, sans-serif", fontWeight: 800, fontSize: print ? '13mm' : 22, lineHeight: 1.15 }}>{gymName}</div>
      <div style={{ fontWeight: 700, fontSize: print ? '7mm' : 14, marginTop: u(8) }}>{words.lead}</div>
      <div style={{ fontSize: print ? '6mm' : 13, color: '#333333' }}>{words.leadHi}</div>
      <div style={{ display: 'flex', justifyContent: 'center', margin: `${u(14)} 0` }}>
        <QrSvg text={link} px={print ? '95mm' : '72%'} label={tr(`QR code for ${link}`, `${link} ka QR code`)} />
      </div>
      <ol style={{ listStyle: 'none', padding: 0, margin: 0, fontWeight: 700, fontSize: print ? '6mm' : 13 }}>
        {words.steps.map((s, i) => (
          <li key={s}>
            {i + 1}. {s}
          </li>
        ))}
      </ol>
      <div style={{ fontSize: print ? '5mm' : 12, color: '#333333', marginTop: u(4) }}>{words.stepsHi}</div>
      <div style={{ fontSize: print ? '5mm' : 12, marginTop: u(12) }}>
        {words.codeLine(joinCode)}
        <br />
        <span style={{ color: '#333333' }}>{words.codeLineHi(joinCode)}</span>
      </div>
      <div style={{ fontFamily: "'Space Grotesk', monospace", fontSize: print ? '4mm' : 11, color: '#555555', marginTop: u(8) }}>{link.replace(/^https:\/\//, '')}</div>
    </div>
  );
}

/** Only the poster on the paper: everything else on the page is hidden while printing. */
export function PrintSheet({
  sheetId,
  ...props
}: {
  sheetId: string;
  words: PosterWords;
  gymName: string;
  joinCode: string;
  link: string;
  brand: GymBrand | null;
}) {
  const id = `#${sheetId}`;
  return (
    <div id={sheetId}>
      <style>{`
        ${id} { display: none; }
        @media print {
          @page { size: A4; margin: 10mm; }
          ${id} { break-inside: avoid; page-break-inside: avoid; }
          body > *:not(${id}) { display: none !important; }
          html, body { background: #FFFFFF !important; }
          ${id} { display: block; }
          /* index.css hides every element for the receipt's print ("body * { visibility: hidden }"):
             without this the poster came out as a blank page (found 15 Oct 2026). */
          ${id}, ${id} * { visibility: visible !important; }
        }
      `}</style>
      <Poster {...props} print />
    </div>
  );
}

/** The poster drawn as an A4 picture (1240 × 1754, 150 dpi) and saved. False when the browser refused. */
export async function downloadPoster(words: PosterWords, gymName: string, joinCode: string, link: string, brand: GymBrand | null): Promise<boolean> {
  try {
    const W = 1240;
    const H = 1754;
    const cv = document.createElement('canvas');
    cv.width = W;
    cv.height = H;
    const g = cv.getContext('2d');
    if (!g) return false;
    g.fillStyle = '#FFFFFF';
    g.fillRect(0, 0, W, H);
    g.textAlign = 'center';
    g.textBaseline = 'alphabetic';
    let y = 120;

    if (brand?.logoUrl) {
      const img = await loadImage(brand.logoUrl);
      if (img) {
        const h = 150;
        const w = Math.min(560, (img.naturalWidth / img.naturalHeight) * h);
        g.fillStyle = brand.bg ?? '#111111';
        roundRect(g, (W - w) / 2 - 24, y - 24, w + 48, h + 48, 24);
        g.drawImage(img, (W - w) / 2, y, w, h);
        y += h + 110;
      }
    }

    g.fillStyle = '#111111';
    y = wrapText(g, gymName, W / 2, y, W - 160, 84, '800 76px Sora, system-ui, sans-serif');
    y = wrapText(g, words.lead, W / 2, y + 30, W - 160, 52, '700 44px Manrope, system-ui, sans-serif');
    g.fillStyle = '#333333';
    y = wrapText(g, words.leadHi, W / 2, y, W - 160, 48, '400 38px Manrope, system-ui, sans-serif');

    const qr = qrcode(0, 'M');
    qr.addData(link);
    qr.make();
    const n = qr.getModuleCount();
    const box = 760;
    const cell = Math.floor(box / (n + 8));
    const side = cell * (n + 8);
    const qx = Math.round((W - side) / 2);
    const qy = y + 20;
    g.fillStyle = '#000000';
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) if (qr.isDark(r, c)) g.fillRect(qx + (c + 4) * cell, qy + (r + 4) * cell, cell, cell);
    }
    y = qy + side + 70;

    g.fillStyle = '#111111';
    words.steps.forEach((s, i) => {
      y = wrapText(g, `${i + 1}. ${s}`, W / 2, y, W - 160, 50, '700 40px Manrope, system-ui, sans-serif');
    });
    g.fillStyle = '#333333';
    y = wrapText(g, words.stepsHi, W / 2, y + 6, W - 160, 44, '400 34px Manrope, system-ui, sans-serif');
    g.fillStyle = '#111111';
    y = wrapText(g, words.codeLine(joinCode), W / 2, y + 40, W - 160, 44, '400 34px Manrope, system-ui, sans-serif');
    g.fillStyle = '#333333';
    y = wrapText(g, words.codeLineHi(joinCode), W / 2, y, W - 160, 44, '400 34px Manrope, system-ui, sans-serif');
    g.fillStyle = '#555555';
    y = wrapText(g, link.replace(/^https:\/\//, ''), W / 2, y + 20, W - 160, 40, '500 30px "Space Grotesk", monospace');

    // Centre the poster on the page: the space left under it is shared above and below.
    const out = document.createElement('canvas');
    out.width = W;
    out.height = H;
    const o = out.getContext('2d');
    if (!o) return false;
    o.fillStyle = '#FFFFFF';
    o.fillRect(0, 0, W, H);
    o.drawImage(cv, 0, Math.max(0, Math.round((H - y - 60) / 2)));
    const url = out.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `${words.file}-${joinCode}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    return true;
  } catch {
    return false;
  }
}

/** The logo for the picture; null when it cannot be drawn (it must allow other sites to read it). */
export function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

export function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
  g.fill();
}

/** Centred text that wraps at word gaps; returns the y below its last line. */
function wrapText(g: CanvasRenderingContext2D, text: string, cx: number, y: number, maxW: number, lineH: number, fontCss: string): number {
  g.font = fontCss;
  const words = text.split(/\s+/);
  let line = '';
  let yy = y + lineH;
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (g.measureText(next).width > maxW && line) {
      g.fillText(line, cx, yy);
      line = w;
      yy += lineH;
    } else line = next;
  }
  if (line) g.fillText(line, cx, yy);
  return yy;
}
