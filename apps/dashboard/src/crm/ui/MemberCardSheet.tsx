/**
 * Member ID card (15 Oct 2026): the member page's "Member card" sheet. One card, three ways out:
 *  - Print: the card at its real size (85.6 × 54 mm, a credit card) on A4, with a line to cut along.
 *    Same print pattern as the invite poster: a sheet that is always on the page while this is
 *    open, hidden on screen, and the only thing on the paper.
 *  - Download picture: the card as a 300 dpi PNG (for WhatsApp, or a print shop's PVC card).
 *  - Send on WhatsApp: opens the member's chat with a short message. A wa.me link cannot carry a
 *    picture, so the sheet says plainly: download it, then attach it.
 * Staff and owner may both use it (nothing on it is a money or delete action).
 *
 * The card reads in English with the gym's name (logic/memberCard.ts has its words); the QR holds
 * only the member's id. One geometry, in millimetres, draws all three: the screen and the print
 * scale it with container units (cqw), the picture multiplies it by pixels per millimetre.
 */

import qrcode from 'qrcode-generator';
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';

import type { GymBrand } from '@forgeai/theme';

import { CARD_MM, cardFileName, cardMessage, cardRows, type CardFacts } from '../logic/memberCard';
import * as api from '../shop/api';
import { loadImage, qrModules, roundRect } from '../shop/InviteScreen';
import { whatsAppHref } from '../shop/invite';
import { useShop } from '../shop/ShopProvider';
import { Button, Sheet, color, font, space } from './kit';

/** Where everything sits on the card, in millimetres from its top-left corner. */
const L = {
  pad: 4,
  head: { y: 4, h: 9 },
  logo: 9,
  label: 20,
  bar: { y: 14.5, h: 0.7 },
  photo: { x: 4, y: 19, w: 17, h: 23, r: 1.5 },
  name: { x: 24, y: 19, h: 4.6, size: 3.4 },
  rows: { y: 24.4, h: 3.7, labelW: 11.5, label: 1.9, value: 2.4 },
  qr: { x: 61.6, y: 19, size: 20, quiet: 2 },
  foot: { y: 46.5, h: 3, size: 1.7 },
  radius: 3,
} as const;

const INK = '#111111';
const SOFT = '#5A5F66';
const SANS = "'Manrope', system-ui, sans-serif";
const DISPLAY = "'Sora', system-ui, sans-serif";

/** The words at the foot of the card. */
const footLine = (gym: string) => `Property of ${gym}. If found, please return it to the gym.`;

export function MemberCardSheet({
  facts,
  phone,
  onClose,
  say,
}: {
  facts: CardFacts;
  /** The member's own number, for the WhatsApp chat (the card shows it masked). */
  phone: string;
  onClose: () => void;
  say: (words: string) => void;
}) {
  const { cloud } = useShop();
  const [brand, setBrand] = useState<GymBrand | null>(null);

  // The logo and colour, when the gym has set them (a gym without them gets a plain card).
  useEffect(() => {
    if (!cloud) return;
    let live = true;
    api
      .ownerGym(cloud.ownerKey)
      .then((g) => live && setBrand(g.brand ?? null))
      .catch((e: unknown) => console.warn('member card: the gym logo did not load, printing without it', e));
    return () => {
      live = false;
    };
  }, [cloud]);

  const help: CSSProperties = { margin: `${space.sm}px 0 0`, fontFamily: font.body, fontSize: 13, lineHeight: 1.5, color: color.inkSecondary };

  return (
    <Sheet
      title="Member card"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={() => window.print()}>
            Print
          </Button>
          <Button
            variant="ghost"
            onClick={async () => {
              const ok = await downloadCard(facts, brand);
              say(
                ok
                  ? 'Card saved as a picture.'
                  : 'Could not make the picture. Try Print.',
              );
            }}
          >
            Download picture
          </Button>
          <Button onClick={() => window.open(whatsAppHref(cardMessage(facts), phone), '_blank', 'noopener')}>
            Send on WhatsApp
          </Button>
        </>
      }
    >
      <div style={{ maxWidth: 440, margin: '0 auto' }}>
        <CardFace facts={facts} brand={brand} />
      </div>
      <p style={{ ...help, marginTop: space.md }}>
        To send it on WhatsApp: tap Download picture first, then Send on WhatsApp, and attach the picture in the chat. A WhatsApp link cannot carry a picture by itself.
      </p>
      <p style={help}>
        Print makes the card at its real size (like an ATM card) on A4 paper: cut along the line. On a phone, Print → “Save as PDF” works too.
      </p>
      <p style={{ ...help, color: color.inkMuted, fontSize: 12 }}>
        The QR holds only the member’s ID — no name or phone number. The mobile is shown with digits hidden.
      </p>
      {/* On the page for as long as the sheet is open (hidden on screen): phone Chrome draws its
          print preview after the tap has returned (see InviteScreen's print sheet). */}
      {createPortal(<PrintSheet facts={facts} brand={brand} />, document.body)}
    </Sheet>
  );
}

/** The card, sized by its container: millimetres become a share of the card's width. */
function CardFace({ facts, brand, print = false }: { facts: CardFacts; brand: GymBrand | null; print?: boolean }) {
  const u = (mm: number) => `${(mm / CARD_MM.w) * 100}cqw`;
  const box = (x: number, y: number, w: number, h: number): CSSProperties => ({
    position: 'absolute',
    left: u(x),
    top: u(y),
    width: u(w),
    height: u(h),
  });
  const line: CSSProperties = { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };
  const { size, path } = useMemo(() => qrModules(facts.qr), [facts.qr]);
  const q = L.qr.quiet;
  const [photoOk, setPhotoOk] = useState(true);
  const logo = brand?.logoUrl ?? null;
  const nameX = logo ? L.pad + L.logo + 2 : L.pad;
  const rows = cardRows(facts);

  return (
    <div style={{ containerType: 'inline-size', width: print ? `${CARD_MM.w}mm` : '100%' }}>
      <div
        role="img"
        aria-label={`Member card for ${facts.name}`}
        style={{
          position: 'relative',
          width: '100%',
          aspectRatio: `${CARD_MM.w} / ${CARD_MM.h}`,
          background: '#FFFFFF',
          color: INK,
          borderRadius: u(L.radius),
          border: print ? '0.2mm solid #9AA0A6' : '1px solid #D5D8DC',
          boxShadow: print ? 'none' : '0 6px 24px rgba(0,0,0,0.35)',
          boxSizing: 'border-box',
          overflow: 'hidden',
          fontFamily: SANS,
          WebkitPrintColorAdjust: 'exact',
          printColorAdjust: 'exact',
        }}
      >
        {logo && (
          <div style={{ ...box(L.pad, L.head.y, L.logo, L.logo), background: brand?.bg ?? INK, borderRadius: u(1.5), display: 'grid', placeItems: 'center' }}>
            <img src={logo} alt="" style={{ width: '82%', height: '82%', objectFit: 'contain', display: 'block' }} />
          </div>
        )}
        <div
          style={{
            ...box(nameX, L.head.y, CARD_MM.w - L.pad - nameX - L.label, L.head.h),
            ...line,
            display: 'flex',
            alignItems: 'center',
            fontFamily: DISPLAY,
            fontWeight: 800,
            fontSize: u(3.6),
          }}
        >
          <span style={line}>{facts.gymName}</span>
        </div>
        <div
          style={{
            ...box(CARD_MM.w - L.pad - L.label, L.head.y, L.label, L.head.h),
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            fontSize: u(1.9),
            fontWeight: 700,
            letterSpacing: u(0.25),
            color: SOFT,
          }}
        >
          MEMBER CARD
        </div>
        <div style={{ ...box(L.pad, L.bar.y, CARD_MM.w - 2 * L.pad, L.bar.h), background: brand?.accent ?? INK }} />

        <div
          style={{
            ...box(L.photo.x, L.photo.y, L.photo.w, L.photo.h),
            borderRadius: u(L.photo.r),
            background: '#EEF0F3',
            overflow: 'hidden',
            display: 'grid',
            placeItems: 'center',
            fontFamily: DISPLAY,
            fontWeight: 800,
            fontSize: u(6),
            color: '#3A3F45',
          }}
        >
          {facts.photoUrl && photoOk ? (
            <img src={facts.photoUrl} alt="" onError={() => setPhotoOk(false)} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          ) : (
            facts.initials
          )}
        </div>

        <div style={{ ...box(L.name.x, L.name.y, L.qr.x - L.name.x - 2, L.name.h), ...line, fontFamily: DISPLAY, fontWeight: 800, fontSize: u(L.name.size), lineHeight: u(L.name.h) }}>
          {facts.name}
        </div>
        {rows.map(([label, value], i) => (
          <div key={label} style={{ ...box(L.name.x, L.rows.y + i * L.rows.h, L.qr.x - L.name.x - 2, L.rows.h), display: 'flex', alignItems: 'baseline' }}>
            <span style={{ width: u(L.rows.labelW), flexShrink: 0, fontSize: u(L.rows.label), color: SOFT }}>{label}</span>
            <span style={{ ...line, minWidth: 0, fontSize: u(L.rows.value), fontWeight: 700 }}>{value}</span>
          </div>
        ))}

        <svg
          role="img"
          aria-label="QR code with the member’s ID"
          viewBox={`${-q} ${-q} ${size + 2 * q} ${size + 2 * q}`}
          shapeRendering="crispEdges"
          style={{ ...box(L.qr.x, L.qr.y, L.qr.size, L.qr.size), display: 'block' }}
        >
          <rect x={-q} y={-q} width={size + 2 * q} height={size + 2 * q} fill="#FFFFFF" />
          <path d={path} fill="#000000" />
        </svg>

        <div style={{ ...box(L.pad, L.foot.y, CARD_MM.w - 2 * L.pad, L.foot.h), ...line, fontSize: u(L.foot.size), color: SOFT, textAlign: 'center', lineHeight: u(L.foot.h) }}>
          {footLine(facts.gymName)}
        </div>
      </div>
    </div>
  );
}

/** Only the card on the paper, at its real size, with a line to cut along. */
function PrintSheet({ facts, brand }: { facts: CardFacts; brand: GymBrand | null }) {
  return (
    <div id="member-card-print">
      <style>{`
        #member-card-print { display: none; }
        @media print {
          @page { size: A4 portrait; margin: 12mm; }
          body > *:not(#member-card-print) { display: none !important; }
          html, body { background: #FFFFFF !important; }
          #member-card-print { display: block; break-inside: avoid; page-break-inside: avoid; }
          /* index.css hides every element for the receipt's print; this sheet must show. */
          #member-card-print, #member-card-print * { visibility: visible !important; }
        }
      `}</style>
      <CardFace facts={facts} brand={brand} print />
      <div style={{ fontFamily: SANS, fontSize: '3mm', color: SOFT, marginTop: '3mm' }}>Cut along the line.</div>
    </div>
  );
}

/** Pixels per millimetre at 300 dpi: the picture is 1011 × 638, a print shop's card size. */
const PX = 300 / 25.4;

/** The card drawn as a PNG and saved. False when the browser refused. */
async function downloadCard(facts: CardFacts, brand: GymBrand | null): Promise<boolean> {
  try {
    const W = Math.round(CARD_MM.w * PX);
    const H = Math.round(CARD_MM.h * PX);
    const cv = document.createElement('canvas');
    cv.width = W;
    cv.height = H;
    const g = cv.getContext('2d');
    if (!g) return false;
    const m = (mm: number) => mm * PX;

    g.fillStyle = '#FFFFFF';
    g.fillRect(0, 0, W, H);
    g.strokeStyle = '#D5D8DC';
    g.lineWidth = 2;
    strokeRound(g, 1, 1, W - 2, H - 2, m(L.radius));

    // Header: logo, gym name, the label.
    let nameX = L.pad;
    if (brand?.logoUrl) {
      const img = await loadImage(brand.logoUrl);
      if (img) {
        g.fillStyle = brand.bg ?? INK;
        roundRect(g, m(L.pad), m(L.head.y), m(L.logo), m(L.logo), m(1.5));
        const inner = L.logo * 0.82;
        const scale = Math.min(m(inner) / img.naturalWidth, m(inner) / img.naturalHeight);
        const w = img.naturalWidth * scale;
        const h = img.naturalHeight * scale;
        g.drawImage(img, m(L.pad + L.logo / 2) - w / 2, m(L.head.y + L.logo / 2) - h / 2, w, h);
        nameX = L.pad + L.logo + 2;
      }
    }
    g.textBaseline = 'middle';
    g.textAlign = 'left';
    g.fillStyle = INK;
    fitText(g, facts.gymName, m(nameX), m(L.head.y + L.head.h / 2), m(CARD_MM.w - L.pad - nameX - L.label), 800, 3.6, 2.6, DISPLAY);
    g.textAlign = 'right';
    g.fillStyle = SOFT;
    g.font = `700 ${m(1.9)}px ${SANS}`;
    g.fillText('MEMBER CARD', m(CARD_MM.w - L.pad), m(L.head.y + L.head.h / 2));
    g.fillStyle = brand?.accent ?? INK;
    g.fillRect(m(L.pad), m(L.bar.y), m(CARD_MM.w - 2 * L.pad), m(L.bar.h));

    // Photo, or the initials.
    g.save();
    g.fillStyle = '#EEF0F3';
    roundRect(g, m(L.photo.x), m(L.photo.y), m(L.photo.w), m(L.photo.h), m(L.photo.r));
    g.clip();
    const photo = facts.photoUrl ? await loadImage(facts.photoUrl) : null;
    if (photo) {
      const scale = Math.max(m(L.photo.w) / photo.naturalWidth, m(L.photo.h) / photo.naturalHeight);
      const w = photo.naturalWidth * scale;
      const h = photo.naturalHeight * scale;
      g.drawImage(photo, m(L.photo.x + L.photo.w / 2) - w / 2, m(L.photo.y + L.photo.h / 2) - h / 2, w, h);
    } else {
      g.textAlign = 'center';
      g.fillStyle = '#3A3F45';
      g.font = `800 ${m(6)}px ${DISPLAY}`;
      g.fillText(facts.initials, m(L.photo.x + L.photo.w / 2), m(L.photo.y + L.photo.h / 2));
    }
    g.restore();

    // Name and rows.
    const textW = L.qr.x - L.name.x - 2;
    g.textAlign = 'left';
    g.fillStyle = INK;
    fitText(g, facts.name, m(L.name.x), m(L.name.y + L.name.h / 2), m(textW), 800, L.name.size, 2.6, DISPLAY);
    cardRows(facts).forEach(([label, value], i) => {
      const y = m(L.rows.y + i * L.rows.h + L.rows.h / 2);
      g.fillStyle = SOFT;
      g.font = `400 ${m(L.rows.label)}px ${SANS}`;
      g.fillText(label, m(L.name.x), y);
      g.fillStyle = INK;
      fitText(g, value, m(L.name.x + L.rows.labelW), y, m(textW - L.rows.labelW), 700, L.rows.value, L.rows.value, SANS);
    });

    // The QR: the member's id only.
    const qr = qrcode(0, 'M');
    qr.addData(facts.qr);
    qr.make();
    const n = qr.getModuleCount();
    const cell = m(L.qr.size) / (n + 2 * L.qr.quiet);
    g.fillStyle = '#000000';
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (qr.isDark(r, c)) {
          // Whole pixels, a hair wide, so neighbouring squares never show a seam.
          const x = Math.floor(m(L.qr.x) + (c + L.qr.quiet) * cell);
          const y = Math.floor(m(L.qr.y) + (r + L.qr.quiet) * cell);
          g.fillRect(x, y, Math.ceil(cell) + 1, Math.ceil(cell) + 1);
        }
      }
    }

    g.textAlign = 'center';
    g.fillStyle = SOFT;
    fitText(g, footLine(facts.gymName), m(CARD_MM.w / 2), m(L.foot.y + L.foot.h / 2), m(CARD_MM.w - 2 * L.pad), 400, L.foot.size, 1.3, SANS);

    const a = document.createElement('a');
    a.href = cv.toDataURL('image/png');
    a.download = cardFileName(facts.number);
    document.body.appendChild(a);
    a.click();
    a.remove();
    return true;
  } catch (e) {
    console.warn('member card: the picture could not be made', e);
    return false;
  }
}

/** One line of text: shrunk down to `minMm` to fit, then cut with "…". */
function fitText(g: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, weight: number, sizeMm: number, minMm: number, family: string) {
  let size = sizeMm;
  g.font = `${weight} ${size * PX}px ${family}`;
  while (g.measureText(text).width > maxW && size > minMm) {
    size = Math.max(minMm, size - 0.1);
    g.font = `${weight} ${size * PX}px ${family}`;
  }
  let t = text;
  while (t.length > 1 && g.measureText(t).width > maxW) t = t.slice(0, -2) + '…';
  g.fillText(t, x, y);
}

function strokeRound(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
  g.stroke();
}
