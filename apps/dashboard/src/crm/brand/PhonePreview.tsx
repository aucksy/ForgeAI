/**
 * Gym branding — a live phone, drawn in the palette the member app will use (the same shared
 * engine). Shows what a member sees most: the Workout tab's title with the gym's mark, the
 * "Up next" card with its main button and a second button, filter chips, a chart, and the tab bar.
 * A picture, not the app: it is hidden from screen readers and described by the label instead.
 */

import { BUTTON_INK, PHONE_INK, type BrandPalette, type HeadingStyle } from '@forgeai/theme';

import { font } from '../../theme';

const W = 300;
const H = 610;

function alpha(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

/** Twelve weeks of kg lifted (a made-up climb, the same every time). */
const POINTS = [42, 45, 44, 49, 51, 50, 55, 58, 57, 61, 64, 66];

function Chart({ p }: { p: BrandPalette }) {
  const w = 236;
  const h = 86;
  const min = 38;
  const max = 70;
  const x = (i: number) => 4 + (i * (w - 8)) / (POINTS.length - 1);
  const y = (v: number) => h - 6 - ((v - min) / (max - min)) * (h - 14);
  const line = POINTS.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const area = `${line} L${x(POINTS.length - 1).toFixed(1)} ${h} L${x(0).toFixed(1)} ${h} Z`;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: 'block' }}>
      {[0.25, 0.5, 0.75].map((f) => (
        <line key={f} x1={0} x2={w} y1={h * f} y2={h * f} stroke={p.color.grid} strokeWidth={1} />
      ))}
      <line x1={0} x2={w} y1={h - 0.5} y2={h - 0.5} stroke={p.color.axis} strokeWidth={1} />
      <path d={area} fill={alpha(p.chart.series[0], 0.14)} />
      <path d={line} fill="none" stroke={p.chart.series[0]} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(POINTS.length - 1)} cy={y(POINTS[POINTS.length - 1])} r={4} fill={p.chart.series[0]} stroke={p.color.surface} strokeWidth={2} />
    </svg>
  );
}

function TabIcon({ name, stroke }: { name: 'workout' | 'profile' | 'shop'; stroke: string }) {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }}>
      {name === 'workout' ? (
        <path d="M6.5 7v10M17.5 7v10M3.5 9.5v5M20.5 9.5v5M6.5 12h11" />
      ) : name === 'profile' ? (
        <>
          <circle cx="12" cy="8" r="3.6" />
          <path d="M5 20c0-3.7 3.1-6.2 7-6.2s7 2.5 7 6.2" />
        </>
      ) : (
        <>
          <path d="M5 8h14l-1.1 12H6.1L5 8Z" />
          <path d="M9 8V6.5a3 3 0 0 1 6 0V8" />
        </>
      )}
    </svg>
  );
}

export function PhonePreview({
  palette: p,
  gymName,
  logoUrl,
  heading,
  scale = 1,
}: {
  palette: BrandPalette;
  gymName: string;
  logoUrl: string | null;
  heading: HeadingStyle;
  scale?: number;
}) {
  const italic = heading === 'bold-italic' ? ('italic' as const) : undefined;
  const display = "'Sora', system-ui, sans-serif";
  return (
    <figure
      aria-label={`Phone preview: the Workout tab in ${gymName}'s colours`}
      style={{ margin: 0, width: W * scale, height: H * scale, flexShrink: 0 }}
    >
      <div
        aria-hidden
        style={{
          width: W,
          height: H,
          transform: scale === 1 ? undefined : `scale(${scale})`,
          transformOrigin: 'top left',
          borderRadius: 38,
          padding: 9,
          background: '#000',
          boxShadow: '0 24px 60px rgba(0,0,0,0.55), inset 0 0 0 1px rgba(255,255,255,0.08)',
        }}
      >
        <div
          style={{
            position: 'relative',
            width: '100%',
            height: '100%',
            borderRadius: 30,
            overflow: 'hidden',
            background: `linear-gradient(180deg, ${p.gradients.backdrop[0]} 0%, ${p.color.bg} 38%)`,
            color: PHONE_INK.ink,
            fontFamily: font.body,
          }}
        >
          {/* status strip */}
          <div style={{ height: 26, background: p.color.bg, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 18px', fontSize: 10, color: PHONE_INK.inkSecondary }}>
            <span style={{ fontFamily: font.mono }}>9:41</span>
            <span style={{ width: 34, height: 8, borderRadius: 3, border: `1px solid ${PHONE_INK.inkMuted}` }} />
          </div>

          <div style={{ padding: '12px 16px 0' }}>
            <div style={{ fontFamily: display, fontWeight: 700, fontSize: 22, letterSpacing: -0.4, fontStyle: italic }}>Workout</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, minHeight: 22 }}>
              {logoUrl ? (
                <img src={logoUrl} alt="" width={22} height={22} style={{ borderRadius: '50%', objectFit: 'contain', display: 'block' }} />
              ) : (
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: p.color.accent }} />
              )}
              <span
                style={{
                  fontWeight: 700,
                  fontSize: 11,
                  letterSpacing: 0.4,
                  color: PHONE_INK.inkSecondary,
                  fontStyle: italic,
                  // An italic's last letter leans past its box: room so it is not cut.
                  paddingRight: italic ? 3 : 0,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {gymName}
              </span>
            </div>

            {/* Up next */}
            <div style={{ marginTop: 14, background: p.color.surface, border: `1px solid ${alpha(p.color.accent, 0.45)}`, borderRadius: 18, padding: 14 }}>
              <div style={{ fontFamily: display, fontWeight: 600, fontSize: 15, fontStyle: italic }}>Up next: Push 1</div>
              <div style={{ fontSize: 11, color: PHONE_INK.inkSecondary, marginTop: 3 }}>6 exercises · last done Mon</div>
              <div
                style={{
                  marginTop: 12,
                  height: 40,
                  borderRadius: 999,
                  background: `linear-gradient(135deg, ${p.gradients.ember[0]}, ${p.gradients.ember[1]})`,
                  boxShadow: `0 4px 16px ${alpha(p.glow, 0.32)}`,
                  display: 'grid',
                  placeItems: 'center',
                  color: BUTTON_INK,
                  fontWeight: 700,
                  fontSize: 13,
                }}
              >
                Start Push 1
              </div>
              <div
                style={{
                  marginTop: 8,
                  height: 36,
                  borderRadius: 999,
                  border: '1px solid rgba(255,255,255,0.14)',
                  background: 'rgba(255,255,255,0.03)',
                  display: 'grid',
                  placeItems: 'center',
                  color: PHONE_INK.ink,
                  fontWeight: 600,
                  fontSize: 12,
                }}
              >
                See exercises
              </div>
            </div>

            {/* chips */}
            <div style={{ display: 'flex', gap: 6, marginTop: 14 }}>
              {['All', 'Push', 'Pull', 'Legs'].map((c, i) => (
                <span
                  key={c}
                  style={{
                    padding: '5px 11px',
                    borderRadius: 999,
                    fontSize: 11,
                    fontWeight: 600,
                    background: i === 0 ? p.color.accentSoft : p.color.surfaceRaised,
                    color: i === 0 ? p.color.accent : PHONE_INK.inkSecondary,
                    border: `1px solid ${i === 0 ? alpha(p.color.accent, 0.45) : 'rgba(255,255,255,0.08)'}`,
                  }}
                >
                  {c}
                </span>
              ))}
            </div>

            {/* chart */}
            <div style={{ marginTop: 12, background: p.color.surface, border: '1px solid rgba(255,255,255,0.08)', borderRadius: 18, padding: '12px 12px 10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontFamily: display, fontWeight: 600, fontSize: 13, fontStyle: italic }}>Kg lifted</span>
                <span style={{ fontFamily: font.mono, fontSize: 11, color: p.color.accent }}>+57 %</span>
              </div>
              <div style={{ fontSize: 10, color: PHONE_INK.inkMuted, margin: '2px 0 8px' }}>Last 12 weeks</div>
              <Chart p={p} />
            </div>
          </div>

          {/* tab bar */}
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              padding: '8px 0 14px',
              background: p.color.glass,
              borderTop: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            {(['workout', 'profile', 'shop'] as const).map((t, i) => {
              const on = i === 0;
              return (
                <div key={t} style={{ display: 'grid', justifyItems: 'center', gap: 3 }}>
                  <span style={{ width: 46, height: 26, borderRadius: 999, display: 'grid', placeItems: 'center', background: on ? p.color.accentSoft : 'transparent' }}>
                    <TabIcon name={t} stroke={on ? p.color.accent : PHONE_INK.inkMuted} />
                  </span>
                  <span style={{ fontSize: 10, fontWeight: on ? 700 : 500, color: on ? p.color.accent : PHONE_INK.inkMuted }}>
                    {t === 'workout' ? 'Workout' : t === 'profile' ? 'Profile' : 'Shop'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </figure>
  );
}
