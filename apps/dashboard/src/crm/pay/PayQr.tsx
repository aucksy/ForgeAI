/**
 * F79 (R-328): a QR code to scan with any UPI app (or a phone camera, for a payment link), drawn as one
 * SVG path: black squares on white with a 4-square quiet zone, so it scans on a dark screen too.
 * Owner research (4 Nov 2026): a scanned QR works for every UPI ID, while a tapped upi:// link with an
 * amount is often refused for a personal UPI ID. So the QR comes first everywhere.
 */

import qrcode from 'qrcode-generator';
import { useMemo } from 'react';

/** The dark squares of `text` as an SVG path, in module units, with a quiet zone of `quiet`. PURE. */
export function qrPath(text: string, quiet = 4): { size: number; d: string } {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  let d = '';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (qr.isDark(r, c)) d += `M${c + quiet} ${r + quiet}h1v1h-1z`;
    }
  }
  return { size: n + quiet * 2, d };
}

export function PayQr({ text, label, px = 220 }: { text: string; label: string; px?: number }) {
  const { size, d } = useMemo(() => qrPath(text), [text]);
  return (
    <svg
      role="img"
      aria-label={label}
      width={px}
      height={px}
      viewBox={`0 0 ${size} ${size}`}
      shapeRendering="crispEdges"
      style={{ display: 'block', background: '#ffffff', borderRadius: 12, maxWidth: '100%', height: 'auto' }}
    >
      <rect width={size} height={size} fill="#ffffff" />
      <path d={d} fill="#000000" />
    </svg>
  );
}
