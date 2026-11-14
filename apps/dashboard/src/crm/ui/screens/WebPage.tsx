/**
 * F207 "Your web page" (R-519, R-529, 14 Nov 2026): the owner makes the gym's own free page at
 * join.mettleup.fit/<address>, in the "Your gym" menu group and from Set up your gym's step.
 *
 * What the owner writes here: the page address (suggested from the gym's name and area, locked once the page has been
 * published), area, city, About (500 letters, no web addresses), facility ticks (the fixed list), up to 6 photos with
 * captions, the Google Maps link, show phone, WhatsApp, "let Google list my page", the publish switch and, the first
 * time it is published, the owner's tick on the page terms. Fees, timings, name, logo, colours and address come from
 * their own screens; this screen says where and links there. "See your page" draws the real page (deploy/panel
 * gymPage.js) right here, so it works before the page host is open to visitors (logic.ts GYM_PAGE_PUBLIC).
 *
 * The owner edits; the front desk sees the address and whether it is published (the server lets only the owner save).
 * Saved on the gym's server (0080), photos in our own storage (0082), so it needs the gym online and the internet.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';

import type { GymHours } from '@forgeai/theme';

import { useAuth } from '../../auth/AuthProvider';
import { getPage, photoFile, savePage } from '../../gympage/api';
import {
  GYM_PAGE_PUBLIC,
  HIGHLIGHTS,
  HIGHLIGHT_KEYS,
  LIMITS,
  PAGE_HOST,
  addressLocked,
  draftChanged,
  draftErrors,
  draftFrom,
  gymSlug,
  letterCount,
  movePhoto,
  pageAddress,
  pageLive,
  saveErrorOf,
  savePayload,
  slugTyped,
  thrownWords,
  type FieldErrors,
  type PageAnswer,
  type PageDraft,
  type SavedPage,
} from '../../gympage/logic';
import { rememberPage, useWebPage } from '../../gympage/pageState';
import { PagePhotoError, uploadPagePhoto } from '../../gympage/photoUpload';
import { buildPreview } from '../../gympage/preview';
import { formatPhone } from '../../logic/members';
import { isNoSuchFunction } from '../../logic/workoutOffer';
import * as timingsApi from '../../shop/timingsApi';
import { ownerGym } from '../../shop/api';
import { useCrm } from '../../store';
import { Button, Card, CheckField, EmptyState, ErrorBanner, PageHeader, SectionTitle, Sheet, TOUCH, TextField, Toast, color, font, radius, space } from '../kit';
import { Link, navigate } from '../router';

type Load = { state: 'loading' } | { state: 'missing' } | { state: 'error'; message: string } | { state: 'ready'; answer: PageAnswer };

const quiet: CSSProperties = { margin: 0, fontFamily: font.body, fontSize: 14, lineHeight: 1.5, color: color.inkSecondary };
const small: CSSProperties = { ...quiet, fontSize: 13 };

export function WebPageScreen() {
  const { session } = useAuth();
  const online = Boolean(session?.online);
  const key = online ? (session?.ownerKey ?? null) : null;
  const known = useWebPage();
  const [load, setLoad] = useState<Load>(() => (known ? { state: 'ready', answer: known } : { state: 'loading' }));

  const fetchPage = useCallback(async () => {
    if (!key) return;
    setLoad((l) => (l.state === 'ready' ? l : { state: 'loading' }));
    try {
      const answer = await getPage(key);
      if (!answer) return setLoad({ state: 'missing' });
      rememberPage(key, answer);
      setLoad({ state: 'ready', answer });
    } catch (e) {
      if (isNoSuchFunction(e)) return setLoad({ state: 'missing' });
      console.warn('[ForgeErr] web page: reading', e);
      setLoad({ state: 'error', message: thrownWords(e) ?? 'Your web page could not be opened. Check your internet and try again.' });
    }
  }, [key]);

  useEffect(() => {
    void fetchPage();
  }, [fetchPage]);

  return (
    <>
      <PageHeader title="Your web page" subtitle="Your gym’s own free page, for people who may join: fees, timings, photos and a way to ask you a question." />
      {!online || !key ? (
        <Card>
          <EmptyState title="Your web page needs your gym online" body="The page is made from your gym’s records on its server. Put your gym online first (Settings → Sign-in & data)." />
        </Card>
      ) : load.state === 'missing' ? (
        <Card>
          <EmptyState title="Web pages are not switched on for your gym yet" body="This will appear here once your gym’s server has them." />
        </Card>
      ) : load.state === 'error' ? (
        <Card>
          <ErrorBanner>{load.message}</ErrorBanner>
          <Button variant="ghost" onClick={() => void fetchPage()}>
            Try again
          </Button>
        </Card>
      ) : load.state === 'loading' ? (
        <p style={quiet}>Loading…</p>
      ) : load.answer.canEdit ? (
        <PageEditor
          ownerKey={key}
          saved={load.answer.page}
          onSaved={(page) => {
            const answer = { page, canEdit: true };
            rememberPage(key, answer);
            setLoad({ state: 'ready', answer });
          }}
        />
      ) : (
        <PageReadOnly saved={load.answer.page} />
      )}
    </>
  );
}

// ---------------------------------------------------------------- shared parts

/** "Visitors cannot open it yet" (before go-live), "taken down by MettleUp", or where it lives. */
function StatusCard({ saved, children }: { saved: SavedPage | null; children?: ReactNode }) {
  const live = pageLive(saved);
  const line = !saved
    ? 'Not made yet. Fill in the parts below, then publish.'
    : saved.hiddenByHq
      ? 'Taken down by MettleUp.'
      : live
        ? GYM_PAGE_PUBLIC
          ? 'Published. People can open your page.'
          : 'Published. It opens to visitors when MettleUp switches gym web pages on.'
        : 'Saved, not published. Visitors cannot see it.';
  return (
    <Card style={{ marginBottom: space.lg }}>
      {saved?.hiddenByHq && (
        <ErrorBanner>
          {`MettleUp has taken your page down, so visitors cannot see it.${saved.hqNote ? ` MettleUp’s note: “${saved.hqNote}”` : ''} Fix what the note says, then write to MettleUp from Help and feedback to put it back.`}
        </ErrorBanner>
      )}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: space.sm }}>
        <span aria-hidden style={{ width: 10, height: 10, borderRadius: 5, flexShrink: 0, marginTop: 6, background: saved?.hiddenByHq ? color.critical : live ? color.good : color.borderStrong }} />
        <strong style={{ fontFamily: font.body, fontSize: 15, color: color.ink }}>{line}</strong>
      </div>
      {saved && (
        <p style={{ ...quiet, marginTop: space.xs, fontFamily: font.mono, fontSize: 13, overflowWrap: 'anywhere' }}>{pageAddress(saved.slug)}</p>
      )}
      {!GYM_PAGE_PUBLIC && !live && !saved?.hiddenByHq && (
        <p style={{ ...small, marginTop: space.sm }}>
          Gym web pages are not open to visitors yet. Get yours ready now: when MettleUp opens them, your page goes live at this address with what you saved
          here.
        </p>
      )}
      {children}
    </Card>
  );
}

function PageReadOnly({ saved }: { saved: SavedPage | null }) {
  return (
    <>
      <StatusCard saved={saved} />
      <Card>
        <p style={quiet}>Only the owner can change the web page.</p>
      </Card>
    </>
  );
}

// ---------------------------------------------------------------- the owner's editor

function PageEditor({ ownerKey, saved, onSaved }: { ownerKey: string; saved: SavedPage | null; onSaved: (p: SavedPage) => void }) {
  const { snapshot } = useCrm();
  const gym = snapshot.gym;
  const gymInfo = useMemo(() => ({ name: gym.name, joinCode: gym.joinCode }), [gym.name, gym.joinCode]);
  const [draft, setDraft] = useState<PageDraft>(() => draftFrom(saved, gymInfo));
  // The owner typed the address: the area no longer changes it.
  const [slugTouched, setSlugTouched] = useState(saved !== null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(0);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(toastTimer.current), []);
  const flash = (m: string) => {
    setToast(m);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 3500);
  };
  const thumbs = usePhotoThumbs(draft.photos.map((p) => p.url));
  const locked = addressLocked(saved);
  const termsAt = saved?.termsAt ?? null;

  const set = (patch: Partial<PageDraft>) => {
    setBanner(null);
    setDraft((d) => {
      const next = { ...d, ...patch };
      // Fresh errors only for the fields that were wrong (they clear as soon as they are fixed).
      setErrors((old) => {
        if (!Object.keys(old).length) return old;
        const now = draftErrors(next, termsAt);
        return Object.fromEntries(Object.entries(old).filter(([k]) => k in now).map(([k]) => [k, now[k as keyof FieldErrors]])) as FieldErrors;
      });
      return next;
    });
  };

  const setArea = (area: string) => {
    if (!slugTouched && !locked) set({ area, slug: gymSlug(gym.name, area, gym.joinCode) });
    else set({ area });
  };

  const changed = draftChanged(draft, saved, gymInfo);

  const save = async () => {
    if (saving) return;
    const found = draftErrors(draft, termsAt);
    setErrors(found);
    if (Object.keys(found).length) {
      setBanner('Fix the parts marked in red, then save again.');
      return;
    }
    setSaving(true);
    setBanner(null);
    try {
      const r = await savePage(ownerKey, savePayload(draft, saved));
      if ('error' in r) {
        const why = saveErrorOf(r.error, draft.slug);
        if (why.field) setErrors({ [why.field]: why.words });
        setBanner(why.words);
        console.warn('[web page] the gym server refused the save:', r.error);
        return;
      }
      const wasLive = pageLive(saved);
      onSaved(r.page);
      setDraft(draftFrom(r.page, gymInfo));
      setSlugTouched(true);
      flash(r.page.published && !wasLive ? 'Published. Your page is ready.' : r.page.published ? 'Saved. Your page shows the changes.' : 'Saved. Your page is not published.');
    } catch (e) {
      console.warn('[ForgeErr] web page: saving', e);
      setBanner(thrownWords(e) ?? 'Your page could not be saved. Check your internet and try again.');
    } finally {
      setSaving(false);
    }
  };

  const addPhotos = async (files: FileList | null) => {
    if (!files?.length) return;
    setPhotoError(null);
    const room = LIMITS.photos - draft.photos.length;
    const list = [...files].slice(0, Math.max(0, room));
    if (files.length > room) setPhotoError(`A page has at most ${LIMITS.photos} photos. Remove one to add another.`);
    for (const file of list) {
      setUploading((n) => n + 1);
      try {
        const { slot, blob } = await uploadPagePhoto(ownerKey, file);
        thumbs.add(slot.url, blob);
        setDraft((d) => (d.photos.length >= LIMITS.photos ? d : { ...d, photos: [...d.photos, { url: slot.url, alt: '' }] }));
      } catch (e) {
        setPhotoError(e instanceof PagePhotoError ? e.message : 'The photo could not be added. Try again.');
      } finally {
        setUploading((n) => n - 1);
      }
    }
  };

  const publishWords = draft.published && !saved?.published ? 'Save and publish' : 'Save';
  const phone = gym.phone && /\d{10}$/.test(gym.phone.replace(/\D/g, '')) ? gym.phone : null;

  return (
    <>
      <StatusCard saved={saved}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: space.sm, marginTop: space.md }}>
          <Button variant="ghost" onClick={() => setPreview(true)}>
            See your page
          </Button>
          {GYM_PAGE_PUBLIC && pageLive(saved) && saved && <ShareButtons slug={saved.slug} gymName={gym.name} onCopied={() => flash('Link copied.')} />}
        </div>
      </StatusCard>


      <Card style={{ marginBottom: space.lg }}>
        <SectionTitle>Your page address</SectionTitle>
        {locked ? (
          <>
            <p style={{ ...quiet, color: color.ink, fontFamily: font.mono, fontSize: 15, overflowWrap: 'anywhere' }}>{pageAddress(draft.slug)}</p>
            <p style={{ ...small, marginTop: space.xs }}>
              The address stays the same once the page is published, so links you shared and printed QR codes keep working. To change your address, write to
              MettleUp from <Link to="/feedback" style={{ color: color.accentBright, fontWeight: 700, textDecoration: 'underline' }}>Help and feedback</Link>.
            </p>
          </>
        ) : (
          <>
            <TextField
              label="Page address"
              prefix={`${PAGE_HOST}/`}
              value={draft.slug}
              onChange={(v) => {
                setSlugTouched(true);
                set({ slug: slugTyped(v) });
              }}
              error={errors.slug}
              hint="Small letters, numbers and dashes. Made from your gym’s name and area; you can change it until you publish."
            />
            <p aria-live="polite" style={{ ...small, marginTop: space.xs, overflowWrap: 'anywhere' }}>
              Your page: <strong style={{ color: color.ink, fontFamily: font.mono }}>{pageAddress(draft.slug || '…')}</strong>
            </p>
          </>
        )}
      </Card>

      <Card style={{ marginBottom: space.lg }}>
        <SectionTitle>Where your gym is</SectionTitle>
        <div style={pairGrid}>
          <TextField label="Area" value={draft.area} onChange={setArea} placeholder="Sector 12" error={errors.area} />
          <TextField label="City" value={draft.city} onChange={(v) => set({ city: v })} placeholder="Jaipur" error={errors.city} />
        </div>
        <TextField
          label="Google Maps link (optional)"
          value={draft.mapsUrl}
          onChange={(v) => set({ mapsUrl: v.trim() })}
          placeholder="https://maps.app.goo.gl/…"
          error={errors.mapsUrl}
          hint="Open your gym in Google Maps, tap Share, then Copy link and paste it here. Without it, the page finds your gym by its name and address."
        />
      </Card>

      <Card style={{ marginBottom: space.lg }}>
        <SectionTitle>About your gym</SectionTitle>
        <TextField
          label="A few lines for people who may join"
          multiline
          value={draft.about}
          onChange={(v) => set({ about: v.slice(0, LIMITS.about + 50) })}
          placeholder="A friendly gym near the market. Ladies batch every morning. Trainers on the floor all day."
          error={errors.about}
          hint={`${letterCount(draft.about, LIMITS.about)}. No web addresses.`}
        />
      </Card>

      <Card style={{ marginBottom: space.lg }}>
        <SectionTitle>What your gym has</SectionTitle>
        <p style={small}>{`Tick what is true for your gym. Pick up to ${LIMITS.highlights}.`}</p>
        <div role="group" aria-label="What your gym has" style={{ display: 'flex', flexWrap: 'wrap', gap: space.sm, marginTop: space.md }}>
          {HIGHLIGHT_KEYS.map((k) => {
            const on = draft.highlights.includes(k);
            const full = !on && draft.highlights.length >= LIMITS.highlights;
            return (
              <button
                key={k}
                type="button"
                aria-pressed={on}
                disabled={full}
                onClick={() => set({ highlights: on ? draft.highlights.filter((x) => x !== k) : [...draft.highlights, k] })}
                style={chip(on, full)}
              >
                {on ? <Tick /> : null}
                {HIGHLIGHTS[k]}
              </button>
            );
          })}
        </div>
        {errors.highlights && <p style={{ ...small, color: color.criticalText, marginTop: space.sm }}>{errors.highlights}</p>}
      </Card>

      <Card style={{ marginBottom: space.lg }}>
        <SectionTitle
          action={
            <PhotoPicker disabled={draft.photos.length >= LIMITS.photos || uploading > 0} onPick={(f) => void addPhotos(f)} />
          }
        >
          Photos
        </SectionTitle>
        <p style={small}>{`Up to ${LIMITS.photos} photos of your gym. The first one is the biggest on your page. Each photo is made smaller on this device, and its location data is taken out before it is sent.`}</p>
        {photoError && <p role="alert" style={{ ...small, color: color.criticalText, marginTop: space.sm }}>{photoError}</p>}
        {errors.photos && <p style={{ ...small, color: color.criticalText, marginTop: space.sm }}>{errors.photos}</p>}
        {uploading > 0 && <p aria-live="polite" style={{ ...small, marginTop: space.sm }}>{uploading === 1 ? 'Adding a photo…' : `Adding ${uploading} photos…`}</p>}
        {draft.photos.length > 0 && (
          <ol style={{ listStyle: 'none', margin: `${space.md}px 0 0`, padding: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 220px), 1fr))', gap: space.md }}>
            {draft.photos.map((p, i) => (
              <li key={p.url} style={{ minWidth: 0 }}>
                <div style={{ aspectRatio: '4 / 3', borderRadius: radius.md, overflow: 'hidden', background: color.surfaceSunken, border: `1px solid ${color.border}` }}>
                  {thumbs.urls[p.url] ? (
                    <img src={thumbs.urls[p.url]} alt={p.alt || `Photo ${i + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  ) : (
                    <div style={{ ...small, height: '100%', display: 'grid', placeItems: 'center' }}>{thumbs.failed[p.url] ? 'Photo saved' : 'Loading…'}</div>
                  )}
                </div>
                <TextField
                  label={`Photo ${i + 1}: what it shows (optional)`}
                  value={p.alt}
                  onChange={(v) => set({ photos: draft.photos.map((x, j) => (j === i ? { ...x, alt: v.slice(0, LIMITS.alt) } : x)) })}
                  placeholder="The weights floor"
                />
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: space.xs, marginTop: space.xs }}>
                  {i > 0 && (
                    <Button variant="quiet" ariaLabel={`Make photo ${i + 1} the first`} onClick={() => set({ photos: movePhoto(draft.photos, i, -1) })}>
                      Move up
                    </Button>
                  )}
                  <Button variant="quiet" tone="danger" ariaLabel={`Remove photo ${i + 1}`} onClick={() => set({ photos: draft.photos.filter((_, j) => j !== i) })}>
                    Remove
                  </Button>
                </div>
              </li>
            ))}
          </ol>
        )}
      </Card>

      <Card style={{ marginBottom: space.lg }}>
        <SectionTitle>Phone and WhatsApp</SectionTitle>
        <CheckField
          checked={draft.showPhone}
          onChange={(v) => set({ showPhone: v, whatsapp: v ? draft.whatsapp : false })}
          disabled={!phone}
          hint={phone ? `Your gym’s number: ${formatPhone(phone)} (from Settings → Gym details).` : 'Add your gym’s phone number in Settings → Gym details first.'}
        >
          Show my gym’s phone number, with a Call button
        </CheckField>
        <CheckField checked={draft.whatsapp} onChange={(v) => set({ whatsapp: v })} disabled={!draft.showPhone}>
          Add a WhatsApp button for the same number
        </CheckField>
        <p style={{ ...small, marginTop: space.sm }}>Questions sent from your page come to Enquiries either way.</p>
      </Card>

      <Card style={{ marginBottom: space.lg }}>
        <SectionTitle>Also on your page, from your other screens</SectionTitle>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid' }}>
          <FromRow what="Fees" from={`${snapshot.plans.filter((p) => p.active).length} plans from Plans`} to="/plans" open="Open Plans" />
          <FromRow what="Timings" from="From Gym timings" to="/settings/timings" open="Open Gym timings" />
          <FromRow what="Name, logo and colours" from="From Branding" to="/settings/branding" open="Open Branding" />
          <FromRow what="Address" from={gym.address ? gym.address : 'Not added yet: Settings → Gym details'} to="/settings" open="Open Settings" />
        </ul>
        <p style={{ ...small, marginTop: space.sm }}>Change them there and your page changes too. Members, money and staff never show on the page.</p>
      </Card>

      <Card style={{ marginBottom: space.lg }}>
        <SectionTitle>Publish</SectionTitle>
        <CheckField
          checked={draft.published}
          onChange={(v) => set({ published: v })}
          hint={GYM_PAGE_PUBLIC ? 'Untick to take your page down at any time.' : 'Visitors see it once MettleUp opens gym web pages. Untick to take it down at any time.'}
        >
          Show my page to visitors
        </CheckField>
        <CheckField checked={draft.indexable} onChange={(v) => set({ indexable: v })} hint="Off: only people with the link find your page. On: Google may show it in search results.">
          Let Google list my page
        </CheckField>
        {draft.published && termsAt === null && (
          <div>
            <CheckField checked={draft.termsAgreed} onChange={(v) => set({ termsAgreed: v })}>
              These fees, photos and words are my gym’s own, and I am responsible for them.
            </CheckField>
            {errors.terms && <p style={{ ...small, color: color.criticalText, margin: `2px 0 0 ${20 + space.sm}px` }}>{errors.terms}</p>}
          </div>
        )}
        {banner && (
          <div style={{ marginTop: space.lg }}>
            <ErrorBanner>{banner}</ErrorBanner>
          </div>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: space.sm, alignItems: 'center', marginTop: banner ? 0 : space.lg }}>
          <Button needsInternet onClick={save} disabled={saving || uploading > 0 || !changed}>
            {saving ? 'Saving…' : publishWords}
          </Button>
          {!changed && saved && <span style={small}>All changes saved.</span>}
        </div>
      </Card>

      {preview && <PreviewSheet ownerKey={ownerKey} draft={draft} thumbs={thumbs.urls} onClose={() => setPreview(false)} />}
      {toast && <Toast message={toast} />}
    </>
  );
}

function FromRow({ what, from, to, open }: { what: string; from: string; to: string; open: string }) {
  return (
    <li style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: space.md, padding: `${space.sm}px 0`, borderTop: `1px solid ${color.border}` }}>
      <div style={{ minWidth: 0, flex: '1 1 auto' }}>
        <div style={{ fontFamily: font.body, fontSize: 14, fontWeight: 700, color: color.ink }}>{what}</div>
        <div style={{ ...small, overflowWrap: 'anywhere' }}>{from}</div>
      </div>
      <div style={{ flexShrink: 0 }}>
        <Button variant="quiet" ariaLabel={open} onClick={() => navigate(to)}>
          Open
        </Button>
      </div>
    </li>
  );
}

function Tick() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </svg>
  );
}

function chip(on: boolean, full: boolean): CSSProperties {
  return {
    appearance: 'none',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    minHeight: TOUCH,
    padding: '0 14px',
    borderRadius: radius.pill,
    border: `1px solid ${on ? color.accent : color.borderStrong}`,
    background: on ? color.accentSoft : 'transparent',
    color: on ? color.accentBright : full ? color.inkMuted : color.ink,
    fontFamily: font.body,
    fontSize: 14,
    fontWeight: on ? 700 : 600,
    cursor: full ? 'default' : 'pointer',
    opacity: full ? 0.6 : 1,
  };
}

function PhotoPicker({ disabled, onPick }: { disabled: boolean; onPick: (f: FileList | null) => void }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
        multiple
        hidden
        aria-label="Choose photos"
        onChange={(e) => {
          onPick(e.target.files);
          e.target.value = '';
        }}
      />
      <Button variant="ghost" needsInternet disabled={disabled} onClick={() => input.current?.click()}>
        + Add photos
      </Button>
    </>
  );
}

function ShareButtons({ slug, gymName, onCopied }: { slug: string; gymName: string; onCopied: () => void }) {
  const link = `https://${pageAddress(slug)}`;
  return (
    <>
      <Button
        variant="ghost"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(link);
            onCopied();
          } catch (e) {
            console.warn('[web page] could not copy the link', e);
          }
        }}
      >
        Copy link
      </Button>
      <a
        href={`https://wa.me/?text=${encodeURIComponent(`${gymName}: fees, timings and photos. ${link}`)}`}
        target="_blank"
        rel="noreferrer"
        style={{ ...small, alignSelf: 'center', color: color.accentBright, fontWeight: 700 }}
      >
        Share on WhatsApp
      </a>
    </>
  );
}

const pairGrid: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', columnGap: space.md };

// ---------------------------------------------------------------- photos shown in the editor

/**
 * The photos as this browser can show them: a new photo from its shrunk file at once; a saved one fetched from our
 * storage (its visitor address is not open yet). Object URLs are let go when the screen closes.
 */
function usePhotoThumbs(urls: string[]) {
  const [shown, setShown] = useState<Record<string, string>>({});
  const [failed, setFailed] = useState<Record<string, boolean>>({});
  const made = useRef<Record<string, string>>({});
  const asked = useRef(new Set<string>());
  const add = useCallback((url: string, blob: Blob) => {
    const local = URL.createObjectURL(blob);
    made.current[url] = local;
    asked.current.add(url);
    setShown((s) => ({ ...s, [url]: local }));
  }, []);
  const wanted = urls.join(' ');
  useEffect(() => {
    for (const url of wanted ? wanted.split(' ') : []) {
      if (asked.current.has(url)) continue;
      asked.current.add(url);
      photoFile(url)
        .then((blob) => add(url, blob))
        .catch((e) => {
          console.warn('[web page] could not show a saved photo', e);
          setFailed((f) => ({ ...f, [url]: true }));
        });
    }
  }, [wanted, add]);
  useEffect(() => () => Object.values(made.current).forEach((u) => URL.revokeObjectURL(u)), []);
  return { urls: shown, failed, add };
}

// ---------------------------------------------------------------- "See your page"

function PreviewSheet({ ownerKey, draft, thumbs, onClose }: { ownerKey: string; draft: PageDraft; thumbs: Record<string, string>; onClose: () => void }) {
  const { snapshot } = useCrm();
  const [html, setHtml] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void (async () => {
      let hours: GymHours | null = null;
      let brand: { accent?: string | null; logoUrl?: string | null } | null = null;
      try {
        hours = (await timingsApi.getTimings(ownerKey)).hours;
      } catch (e) {
        console.warn('[web page] preview without timings', e);
      }
      try {
        brand = (await ownerGym(ownerKey)).brand ?? null;
      } catch (e) {
        console.warn('[web page] preview without the brand', e);
      }
      const out = buildPreview({ draft, gym: snapshot.gym, plans: snapshot.plans, hours, brand, thumbs, nowMs: Date.now() });
      if (!alive) return;
      if (out) setHtml(out);
      else setProblem('The preview could not be drawn. Check the page address, then try again.');
    })();
    return () => {
      alive = false;
    };
    // Drawn once per opening, from the draft as it was then.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <Sheet
      title="Your page, as visitors see it"
      onClose={onClose}
      wide
      footer={
        <Button variant="ghost" onClick={onClose}>
          Close
        </Button>
      }
    >
      <p style={{ ...small, marginBottom: space.md }}>
        {draft.published ? 'With your changes, before you save them.' : 'A preview: your page is not published yet.'} Buttons do not work here.
      </p>
      {problem ? (
        <ErrorBanner>{problem}</ErrorBanner>
      ) : html ? (
        <iframe
          title="Preview of your web page"
          srcDoc={html}
          sandbox="allow-same-origin"
          style={{ display: 'block', width: '100%', maxWidth: 430, height: 'min(720px, 70vh)', margin: '0 auto', border: `1px solid ${color.border}`, borderRadius: radius.md, background: '#FFFFFF' }}
        />
      ) : (
        <p style={quiet}>Drawing your page…</p>
      )}
    </Sheet>
  );
}
