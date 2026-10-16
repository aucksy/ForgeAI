/**
 * Settings → Branding (gym branding, Level 1): the gym's look inside the ForgeAI member app.
 *
 * The owner uploads a logo and picks ONE colour (optionally a background tone and bold italic
 * headings); the shared palette engine builds everything else — shades, the words on the colour,
 * chart colours — checks every pair for readability, nudges a colour that would be hard to read,
 * and the phone beside the form shows the result live. Save sends it to the cloud
 * (owner_set_brand). New members get it straight after joining; members already in the gym once
 * their app has checked with the gym (on opening, and on coming back at most once an hour), the
 * next time they open or come back to the app, under the gym's logo and never mid-workout
 * (apps/mobile theme/gymTheme.ts). "Use ForgeAI's look" clears it.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { brandReport, normalizeHex, type BrandPalette, type GymBrand, type HeadingStyle } from '@forgeai/theme';

import * as api from '../shop/api';
import { JoinCodeCard } from '../shop/JoinCode';
import { useShop } from '../shop/ShopProvider';
import { Button, Card, ErrorBanner, PageHeader, SectionTitle, Sheet, Toast, color, font, radius, space, useIsCompact } from '../ui/kit';
import { navigate } from '../ui/router';
import { CLEAR_ARGS, brandErrorWords, draftChanged, draftFromBrand, hexError, previewPalette, saveArgs, type BrandDraft } from './brandLogic';
import { LogoError, uploadGymLogo } from './logoUpload';
import { PhonePreview } from './PhonePreview';

/**
 * What Save promises, exactly as the phone behaves (apps/mobile theme/gymTheme.ts): it checks
 * with the gym when the app opens, and when the member comes back to it at most once an hour; a
 * new look then shows the next time they open or come back to the app — never mid-workout.
 */
const savedWords = () =>
  'Saved. New members get it at once. Members already joined get it on one of their next visits to the app (it checks with your gym at most once an hour) — never in the middle of a workout.';

export function BrandingScreen() {
  const { cloud } = useShop();
  return (
    <>
      <PageHeader
        title="Branding"
        subtitle="Your gym's logo and colours in the ForgeAI app"
        actions={
          <Button variant="ghost" onClick={() => navigate('/settings')}>
            Back to Settings
          </Button>
        }
      />
      {cloud ? (
        <BrandingForm ownerKey={cloud.ownerKey} gymName={cloud.name} />
      ) : (
        <JoinCodeCard title="Turn on the member app first" />
      )}
    </>
  );
}

type Load = { state: 'loading' } | { state: 'error'; message: string } | { state: 'ready'; saved: GymBrand | null };

function BrandingForm({ ownerKey, gymName }: { ownerKey: string; gymName: string }) {
  const { handleError } = useShop();
  const compact = useIsCompact();
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [draft, setDraft] = useState<BrandDraft>(() => draftFromBrand(null));
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const closeClear = useCallback(() => setConfirmClear(false), []);
  const toastTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(toastTimer.current), []);
  const flash = (m: string) => {
    setToast(m);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 3000);
  };

  const fetchBrand = useCallback(async () => {
    setLoad({ state: 'loading' });
    try {
      const g = await api.ownerGym(ownerKey);
      const saved = g.brand ?? null;
      setDraft(draftFromBrand(saved));
      setLoad({ state: 'ready', saved });
    } catch (e) {
      setLoad({ state: 'error', message: handleError(e) });
    }
  }, [ownerKey, handleError]);

  useEffect(() => {
    void fetchBrand();
  }, [fetchBrand]);

  // The last palette that could be built: a half-typed code keeps the phone as it was.
  const live = useMemo(() => previewPalette(draft), [draft]);
  const lastGood = useRef<BrandPalette | null>(null);
  if (live) lastGood.current = live;
  const palette = live ?? lastGood.current ?? previewPalette(draftFromBrand(null))!;
  const report = useMemo(() => (live ? brandReport(live) : []), [live]);

  if (load.state === 'loading') {
    return (
      <Card>
        <p style={{ margin: 0, fontFamily: font.body, fontSize: 14, color: color.inkSecondary }}>
          Loading your gym’s look…
        </p>
      </Card>
    );
  }
  if (load.state === 'error') {
    return (
      <Card>
        <ErrorBanner>{load.message}</ErrorBanner>
        <Button variant="ghost" onClick={() => void fetchBrand()}>
          Try again
        </Button>
      </Card>
    );
  }

  const saved = load.saved;
  const changed = draftChanged(draft, saved);
  const set = (patch: Partial<BrandDraft>) => setDraft((d) => ({ ...d, ...patch }));

  const save = async () => {
    if (!live || saving) return;
    setSaving(true);
    setError(null);
    try {
      const next = await api.setBrand(ownerKey, saveArgs(draft));
      setLoad({ state: 'ready', saved: next });
      setDraft(draftFromBrand(next));
      flash(savedWords());
    } catch (e) {
      setError(brandErrorWords(e));
    } finally {
      setSaving(false);
    }
  };

  const clear = async () => {
    setConfirmClear(false);
    setSaving(true);
    setError(null);
    try {
      await api.setBrand(ownerKey, CLEAR_ARGS);
      setLoad({ state: 'ready', saved: null });
      setDraft(draftFromBrand(null));
      flash('Back to ForgeAI’s look.');
    } catch (e) {
      setError(brandErrorWords(e));
    } finally {
      setSaving(false);
    }
  };

  const preview = (
    <div style={{ display: 'grid', justifyItems: 'center', gap: space.md }}>
      <PhonePreview palette={palette} gymName={gymName} logoUrl={draft.logoUrl} heading={draft.heading} scale={compact ? 0.86 : 1} />
      <p style={{ margin: 0, maxWidth: 300, textAlign: 'center', fontFamily: font.body, fontSize: 12, color: color.inkMuted }}>
        The Workout tab as members will see it. The app opens with your logo for a second, then these colours.
      </p>
    </div>
  );

  return (
    <>
      {error && <ErrorBanner>{error}</ErrorBanner>}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: compact ? 'minmax(0, 1fr)' : 'minmax(0, 1fr) 320px',
          gap: space.xl,
          alignItems: 'start',
        }}
      >
        <div style={{ display: 'grid', gap: space.lg, minWidth: 0 }}>
          {compact && preview}

          <LogoCard
            ownerKey={ownerKey}
            logoUrl={draft.logoUrl}
            bg={palette.color.bg}
            disabled={saving}
            onBusy={setUploading}
            onLogo={(url) => set({ logoUrl: url })}
          />

          <Card>
            <SectionTitle>Colour</SectionTitle>
            <ColourField
              label="Your brand colour"
              hint="Buttons, the active tab, highlights and charts."
              value={draft.accent}
              onChange={(v) => set({ accent: v })}
            />
            <div style={{ marginTop: space.lg }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: space.sm, minHeight: 44, cursor: 'pointer', fontFamily: font.body, fontSize: 14, color: color.ink }}>
                <input type="checkbox" checked={draft.useBg} onChange={(e) => set({ useBg: e.target.checked })} style={{ width: 20, height: 20, accentColor: color.accent }} />
                Use my own background tone
              </label>
              {draft.useBg && (
                <ColourField
                  label="Background tone"
                  hint="A dark colour for the page; cards and sheets are made a little lighter from it."
                  value={draft.bg}
                  onChange={(v) => set({ bg: v })}
                />
              )}
            </div>
          </Card>

          <Card>
            <SectionTitle>Headings</SectionTitle>
            <div role="radiogroup" aria-label="Heading style" style={{ display: 'grid', gap: space.sm }}>
              {(
                [
                  ['normal', 'Normal', 'ForgeAI’s own headings'],
                  ['bold-italic', 'Bold italic', 'Slanted headings, for a sporty look'],
                ] as [HeadingStyle, string, string][]
              ).map(([value, label, note]) => (
                <label
                  key={value}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: space.md,
                    minHeight: 48,
                    padding: `0 ${space.md}px`,
                    borderRadius: radius.md,
                    border: `1px solid ${draft.heading === value ? color.accent : color.border}`,
                    background: draft.heading === value ? color.accentSoft : 'transparent',
                    cursor: 'pointer',
                  }}
                >
                  <input type="radio" name="heading" checked={draft.heading === value} onChange={() => set({ heading: value })} style={{ width: 18, height: 18, accentColor: color.accent }} />
                  <span style={{ fontFamily: font.display, fontWeight: 700, fontSize: 15, color: color.ink, whiteSpace: 'nowrap', paddingRight: 2, fontStyle: value === 'bold-italic' ? 'italic' : undefined }}>{label}</span>
                  <span style={{ fontFamily: font.body, fontSize: 12, color: color.inkMuted }}>{note}</span>
                </label>
              ))}
            </div>
          </Card>

          <Card>
            <SectionTitle>Readability check</SectionTitle>
            {live ? (
              <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: space.sm }}>
                {report.map((line) => {
                  const note = /lightened|darkened|lifted|instead/.test(line);
                  return (
                    <li key={line} style={{ display: 'flex', gap: space.sm, alignItems: 'flex-start', fontFamily: font.body, fontSize: 14, color: color.inkSecondary }}>
                      <CheckMark kind={note ? 'note' : 'ok'} />
                      <span>{line}</span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p style={{ margin: 0, fontFamily: font.body, fontSize: 14, color: color.inkMuted }}>
                Finish typing the colour code to check it.
              </p>
            )}
            {live && live.nudges.some((n) => n.what === 'accent' || n.what === 'background') && (
              <p style={{ margin: `${space.md}px 0 0`, fontFamily: font.body, fontSize: 12, color: color.inkMuted }}>
                Members get the adjusted colour. Save keeps the colour you picked.
              </p>
            )}
          </Card>

          <div style={{ display: 'flex', gap: space.sm, flexWrap: 'wrap', alignItems: 'center' }}>
            <Button onClick={() => void save()} disabled={!live || !changed || saving || uploading}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
            {saved && (
              <Button variant="quiet" tone="danger" onClick={() => setConfirmClear(true)} disabled={saving || uploading}>
                Use ForgeAI’s look
              </Button>
            )}
            {!changed && saved && (
              <span style={{ fontFamily: font.body, fontSize: 13, color: color.inkMuted }}>
                Saved
                {saved.updatedAt ? ` · ${new Date(saved.updatedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : ''}
              </span>
            )}
          </div>
        </div>

        {!compact && <div style={{ position: 'sticky', top: space.xl }}>{preview}</div>}
      </div>

      {confirmClear && (
        <Sheet
          title="Go back to ForgeAI’s look?"
          onClose={closeClear}
          footer={
            <>
              <Button variant="ghost" onClick={closeClear}>
                Keep my look
              </Button>
              <Button tone="danger" onClick={() => void clear()}>
                Use ForgeAI’s look
              </Button>
            </>
          }
        >
          <p style={{ margin: 0, fontFamily: font.body, fontSize: 14, color: color.inkSecondary }}>
            Your logo and colours are removed from the member app. Members see ForgeAI’s own look on one of their next visits to the app — never in the middle of a workout.
          </p>
        </Sheet>
      )}
      {toast && <Toast message={toast} />}
    </>
  );
}

function CheckMark({ kind }: { kind: 'ok' | 'note' }) {
  return (
    <svg aria-hidden width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={kind === 'ok' ? color.goodText : color.warning} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
      {kind === 'ok' ? <path d="m5 12.5 4.5 4.5L19 7.5" /> : <><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5.5M12 16.5v.01" /></>}
    </svg>
  );
}

function ColourField({ label, hint, value, onChange }: { label: string; hint: string; value: string; onChange: (v: string) => void }) {
  const err = hexError(value);
  const hex = normalizeHex(value);
  const id = label.replace(/\W+/g, '-').toLowerCase();
  return (
    <div style={{ marginTop: space.md }}>
      <label htmlFor={`${id}-hex`} style={{ display: 'block', fontFamily: font.body, fontSize: 12, color: color.inkSecondary, marginBottom: 5 }}>
        {label}
      </label>
      <div style={{ display: 'flex', gap: space.sm, alignItems: 'stretch' }}>
        <input
          type="color"
          aria-label={`${label}: picker`}
          value={(hex ?? '#000000').toLowerCase()}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          style={{ width: 52, minHeight: 44, padding: 2, border: `1px solid ${color.borderStrong}`, borderRadius: radius.md, background: color.surfaceSunken, cursor: 'pointer' }}
        />
        <input
          id={`${id}-hex`}
          value={value}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          onBlur={() => hex && onChange(hex)}
          maxLength={7}
          spellCheck={false}
          autoComplete="off"
          aria-invalid={Boolean(err)}
          aria-describedby={`${id}-note`}
          style={{
            width: 132,
            minHeight: 44,
            padding: '10px 12px',
            background: color.surfaceSunken,
            border: `1px solid ${err ? color.critical : color.borderStrong}`,
            borderRadius: radius.md,
            color: color.ink,
            fontFamily: font.mono,
            fontSize: 15,
            letterSpacing: 0.5,
            outline: 'none',
          }}
        />
      </div>
      <div id={`${id}-note`} style={{ fontFamily: font.body, fontSize: 12, color: err ? color.criticalText : color.inkMuted, marginTop: 5 }}>
        {err ?? hint}
      </div>
    </div>
  );
}

function LogoCard({
  ownerKey,
  logoUrl,
  bg,
  disabled,
  onBusy,
  onLogo,
}: {
  ownerKey: string;
  logoUrl: string | null;
  bg: string;
  disabled: boolean;
  onBusy: (busy: boolean) => void;
  onLogo: (url: string | null) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const take = async (file: File | undefined) => {
    if (!file || busy) return;
    setBusy(true);
    onBusy(true);
    setError(null);
    try {
      onLogo(await uploadGymLogo(ownerKey, file));
    } catch (e) {
      setError(e instanceof LogoError ? e.message : 'The logo didn’t upload. Please try again.');
    } finally {
      setBusy(false);
      onBusy(false);
    }
  };

  return (
    <Card>
      <SectionTitle>Logo</SectionTitle>
      <div style={{ display: 'flex', gap: space.lg, alignItems: 'center', flexWrap: 'wrap' }}>
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            void take(e.dataTransfer.files?.[0]);
          }}
          style={{
            position: 'relative',
            width: 120,
            height: 120,
            borderRadius: radius.lg,
            background: bg,
            border: `1px solid ${color.border}`,
            display: 'grid',
            placeItems: 'center',
            outline: over ? `2px dashed ${color.accent}` : 'none',
            outlineOffset: 3,
          }}
        >
          {logoUrl ? (
            <img src={logoUrl} alt="Your logo" style={{ width: 96, height: 96, objectFit: 'contain' }} />
          ) : (
            <span style={{ fontFamily: font.body, fontSize: 12, color: color.inkMuted, textAlign: 'center', padding: space.sm }}>
              No logo yet
            </span>
          )}
          {busy && (
            <div role="status" style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', borderRadius: radius.lg, background: 'rgba(7,8,12,0.72)', color: color.ink, fontFamily: font.body, fontSize: 13, fontWeight: 700 }}>
              Uploading…
            </div>
          )}
        </div>
        <div style={{ display: 'grid', gap: space.sm, flex: '1 1 200px', minWidth: 0 }}>
          <div style={{ display: 'flex', gap: space.sm, flexWrap: 'wrap' }}>
            <Button variant="ghost" disabled={busy || disabled} onClick={() => fileRef.current?.click()}>
              {logoUrl ? 'Change logo' : 'Upload logo'}
            </Button>
            {logoUrl && (
              <Button variant="quiet" tone="danger" disabled={busy || disabled} onClick={() => onLogo(null)}>
                Remove logo
              </Button>
            )}
          </div>
          <div style={{ fontFamily: font.body, fontSize: 12, color: color.inkMuted }}>
            A square PNG with a see-through background works best. Members see it full-screen as the app opens, and small at the top of their tabs. You can also drop it on the box.
          </div>
          {error && (
            <div role="alert" style={{ fontFamily: font.body, fontSize: 13, color: color.criticalText }}>
              {error}
            </div>
          )}
        </div>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        hidden
        aria-hidden
        tabIndex={-1}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          void take(file);
        }}
      />
    </Card>
  );
}
