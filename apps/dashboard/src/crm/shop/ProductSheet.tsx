/**
 * Add or edit one product — the same sheet pattern as the CRM's member and payment
 * forms. Prices are typed in rupees and saved as paise; a product either has one
 * stock number, or a list of choices (a flavour, a size) each with its own stock,
 * in which case the product's stock is their sum — the cloud keeps the same rule.
 */

import { useCallback, useRef, useState, type ReactNode } from 'react';

import {
  Button,
  ErrorBanner,
  SelectField,
  Sheet,
  TextField,
  TOUCH,
  color,
  font,
  radius,
  space,
  useIsCompact,
} from '../ui/kit';
import { tr } from '../i18n';
import * as api from './api';
import {
  ART_KINDS,
  CATEGORIES,
  draftFromProduct,
  errorCode,
  MAX_OPTIONS,
  MutationGate,
  optionStockSum,
  parseStock,
  TINT_CHOICES,
  validateDraft,
  type DraftErrors,
  type OptionDraft,
  type Product,
  type ProductDraft,
} from './logic';
import { ProductArt, ProductPicture } from './ProductArt';
import { PhotoError, uploadProductPhoto } from './photoUpload';
import { useShop } from './ShopProvider';

export function ProductSheet({
  product,
  onClose,
  onSaved,
  gate,
  onReloaded,
}: {
  product: Product | null;
  onClose: () => void;
  onSaved: (p: Product, verb: 'added' | 'saved' | 'deleted') => void;
  /** The product list's gate: a save is a mutation the list's poll must not undo. */
  gate: MutationGate;
  /** The fresh list read after a CHANGED refusal, for the screen behind. */
  onReloaded: (list: Product[]) => void;
}) {
  const { cloud, handleError } = useShop();
  const compact = useIsCompact();
  const [d, setD] = useState<ProductDraft>(() => draftFromProduct(product));
  const [errors, setErrors] = useState<DraftErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [uploading, setUploading] = useState(false);
  const closeConfirm = useCallback(() => setConfirmDelete(false), []);

  const set = <K extends keyof ProductDraft>(k: K, v: ProductDraft[K]) => setD((prev) => ({ ...prev, [k]: v }));
  const setOption = (i: number, patch: Partial<OptionDraft>) =>
    setD((prev) => ({ ...prev, options: prev.options.map((o, j) => (j === i ? { ...o, ...patch } : o)) }));

  const save = async () => {
    if (!cloud) return;
    const v = validateDraft(d);
    if (!v.ok) {
      setErrors(v.errors);
      setError(tr('Please fix the highlighted fields.', 'Laal wale fields theek karo.'));
      return;
    }
    setErrors({});
    setError(null);
    setSaving(true);
    let failure: { e: unknown } | null = null;
    let saved: Product | null = null;
    await gate.run(async () => {
      try {
        saved = await api.saveProduct(cloud.ownerKey, v.payload);
      } catch (e) {
        failure = { e };
      }
    });
    if (saved) {
      onSaved(saved, product ? 'saved' : 'added');
      return;
    }
    const err = (failure as { e: unknown } | null)?.e;
    const words = handleError(err);
    if (errorCode(err) === 'CHANGED' && d.productId) {
      // Someone ordered it (or another tab saved) while this was open. Load the
      // latest into the form — stock especially — and let the owner save again.
      try {
        const list = await api.listProducts(cloud.ownerKey);
        onReloaded(list);
        const latest = list.find((x) => x.productId === d.productId);
        // Fresh values, but keep a photo the owner just uploaded in this form.
        if (latest) setD({ ...draftFromProduct(latest), imageUrl: d.imageUrl });
        setError(latest ? words : tr('This product was deleted while you were editing it.', 'Aap badal rahe the tab tak yeh product hata diya gaya.'));
      } catch (e2) {
        setError(handleError(e2));
      }
    } else {
      setError(words);
    }
    setSaving(false);
  };

  const remove = async () => {
    if (!cloud || !product) return;
    setSaving(true);
    setError(null);
    try {
      await gate.run(() => api.deleteProduct(cloud.ownerKey, product.productId));
      onSaved(product, 'deleted');
    } catch (e) {
      setError(handleError(e));
      setSaving(false);
      setConfirmDelete(false);
    }
  };

  const optionTotal = optionStockSum(d.options.map((o) => ({ stock: parseStock(o.stock) ?? 0 })));

  if (confirmDelete && product) {
    return (
      <Sheet
        title={tr(`Delete ${product.name}?`, `${product.name} hatayein?`)}
        onClose={closeConfirm}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              {tr('Keep it', 'Rehne do')}
            </Button>
            <Button tone="danger" disabled={saving} onClick={() => void remove()}>
              {saving ? tr('Deleting…', 'Hata rahe hain…') : tr('Delete product', 'Product hatao')}
            </Button>
          </>
        }
      >
        {error && <ErrorBanner>{error}</ErrorBanner>}
        <p style={{ margin: 0, fontFamily: font.body, fontSize: 14, color: color.inkSecondary }}>
          {tr(
            'It disappears from the app straight away. Orders already placed for it stay as they are. If you might sell it again, use ',
            'Yeh app se turant hat jayega. Iske pehle se diye orders waise hi rahenge. Agar phir se bech sakte hain, to iski jagah ',
          )}
          <strong style={{ color: color.ink }}>{tr('Hide from app', 'App se chhupao')}</strong>
          {tr(' instead.', ' use karo.')}
        </p>
      </Sheet>
    );
  }

  return (
    <Sheet
      title={product ? tr('Edit product', 'Product badlo') : tr('Add product', 'Product jodo')}
      onClose={onClose}
      wide
      footer={
        <>
          {product && (
            <span style={{ marginRight: 'auto' }}>
              <Button variant="quiet" tone="danger" onClick={() => setConfirmDelete(true)}>
                {tr('Delete', 'Hatao')}
              </Button>
            </span>
          )}
          <Button variant="ghost" onClick={onClose}>
            {tr('Cancel', 'Cancel')}
          </Button>
          <Button disabled={saving || uploading} onClick={() => void save()}>
            {uploading
              ? tr('Uploading photo…', 'Photo upload ho rahi hai…')
              : saving
                ? tr('Saving…', 'Save ho raha hai…')
                : product
                  ? tr('Save changes', 'Badlav save karo')
                  : tr('Add product', 'Product jodo')}
          </Button>
        </>
      }
    >
      {error && <ErrorBanner>{error}</ErrorBanner>}

      <PhotoBlock
        draft={d}
        disabled={saving}
        onPhoto={(url) => set('imageUrl', url)}
        onBusy={setUploading}
      />

      <TextField
        label={tr('Name', 'Naam')}
        value={d.name}
        onChange={(v) => set('name', v)}
        placeholder={tr('Whey protein 1 kg', 'Whey protein 1 kg')}
        error={errors.name}
        autoFocus={!product}
      />

      <div style={twoCol}>
        <SelectField
          label={tr('Category', 'Category')}
          value={d.category}
          onChange={(v) => set('category', v as ProductDraft['category'])}
          options={CATEGORIES}
        />
        <TextField
          label={tr('Price', 'Price')}
          prefix="₹"
          inputMode="decimal"
          value={d.price}
          onChange={(v) => set('price', v)}
          placeholder="2499"
          error={errors.price}
        />
      </div>

      <TextField
        label={tr('Description (optional)', 'Jaankari (optional)')}
        value={d.description}
        onChange={(v) => set('description', v.slice(0, 600))}
        placeholder={tr('One line members see, like the size or how to use it', 'Ek line jo members dekhenge, jaise size ya kaise use karein')}
        multiline
      />

      <FieldGroup label={tr('Picture if there’s no photo', 'Photo na ho to yeh picture')}>
        {/* A fixed count that divides the twelve pictures: auto-fill put nine on the
            first row and three on the second. Six across in the sheet, four on a phone. */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${compact ? 4 : 6}, minmax(0, 1fr))`,
            gap: 6,
          }}
        >
          {ART_KINDS.map((k) => {
            const on = d.artKind === k.value;
            return (
              <button
                key={k.value}
                type="button"
                aria-pressed={on}
                aria-label={k.label}
                onClick={() => set('artKind', k.value)}
                style={{
                  appearance: 'none',
                  padding: 4,
                  borderRadius: radius.md,
                  border: `2px solid ${on ? color.accent : 'transparent'}`,
                  background: 'transparent',
                  cursor: 'pointer',
                  display: 'grid',
                  justifyItems: 'center',
                  gap: 2,
                  color: on ? color.accentBright : color.inkMuted,
                  fontFamily: font.body,
                  fontSize: 11,
                }}
              >
                <ProductArt kind={k.value} tint={d.artTint} size={48} />
                {k.label}
              </button>
            );
          })}
        </div>
      </FieldGroup>

      <FieldGroup label={tr('Colour', 'Rang')}>
        <Swatches value={d.artTint} onChange={(t) => set('artTint', t)} />
      </FieldGroup>

      <FieldGroup label={tr('Shown in the app', 'App mein dikhe')}>
        <Switch
          on={d.active}
          onChange={(v) => set('active', v)}
          label={
            d.active
              ? tr('Members can see and order this', 'Members ise dekh kar order kar sakte hain')
              : tr('Hidden — members can’t see it', 'Chhupa hua — members ko nahi dikhega')
          }
        />
      </FieldGroup>

      <FieldGroup label={tr('Choices', 'Choices')}>
        <Switch
          on={d.useOptions}
          onChange={(v) =>
            setD((prev) => ({
              ...prev,
              useOptions: v,
              options:
                v && prev.options.length === 0
                  ? [{ id: null, label: '', stock: prev.stock || '0', price: '', tint: null }]
                  : prev.options,
            }))
          }
          label={
            d.useOptions
              ? tr('Comes in flavours or sizes, each with its own stock', 'Alag flavour ya size, har ek ka apna stock')
              : tr('One kind, one stock number', 'Ek hi type, ek stock number')
          }
        />
      </FieldGroup>

      {!d.useOptions ? (
        <div style={{ maxWidth: 220 }}>
          <TextField
            label={tr('Stock', 'Stock')}
            inputMode="numeric"
            value={d.stock}
            onChange={(v) => set('stock', v)}
            error={errors.stock}
            hint={tr('How many you have at the desk.', 'Desk par kitne hain.')}
          />
        </div>
      ) : (
        <>
          <div style={{ maxWidth: 260 }}>
            <TextField
              label={tr('What is the choice?', 'Choice kya hai?')}
              value={d.optionName}
              onChange={(v) => set('optionName', v)}
              placeholder={tr('Flavour or Size', 'Flavour ya Size')}
              error={errors.optionName}
            />
          </div>
          {errors.options && (
            <div style={{ marginTop: space.sm, fontFamily: font.body, fontSize: 12, color: color.criticalText }}>
              {errors.options}
            </div>
          )}
          <div style={{ display: 'grid', gap: space.sm, marginTop: space.md }}>
            {d.options.map((o, i) => (
              <OptionRow
                key={o.id ?? `new-${i}`}
                option={o}
                index={i}
                error={errors.optionRows?.[i]}
                onChange={(patch) => setOption(i, patch)}
                onRemove={() => setD((prev) => ({ ...prev, options: prev.options.filter((_, j) => j !== i) }))}
              />
            ))}
          </div>
          <Row2>
            <Button
              variant="ghost"
              disabled={d.options.length >= MAX_OPTIONS}
              onClick={() =>
                setD((prev) => ({
                  ...prev,
                  options: [...prev.options, { id: null, label: '', stock: '0', price: '', tint: null }],
                }))
              }
            >
              {tr('+ Add a choice', '+ Choice jodo')}
            </Button>
            <span style={{ fontFamily: font.body, fontSize: 13, color: color.inkSecondary }}>
              {tr('Total stock:', 'Kul stock:')} <strong style={{ color: color.ink }}>{optionTotal}</strong>
            </span>
          </Row2>
        </>
      )}
    </Sheet>
  );
}

function OptionRow({
  option: o,
  index,
  error,
  onChange,
  onRemove,
}: {
  option: OptionDraft;
  index: number;
  error?: string;
  onChange: (patch: Partial<OptionDraft>) => void;
  onRemove: () => void;
}) {
  return (
    <div
      style={{
        border: `1px solid ${error ? color.critical : color.border}`,
        borderRadius: radius.md,
        padding: `0 ${space.md}px ${space.md}px`,
        background: color.surface,
      }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(120px, 100%), 1fr))', gap: space.sm }}>
        <TextField
          label={tr(`Choice ${index + 1}`, `Choice ${index + 1}`)}
          value={o.label}
          onChange={(v) => onChange({ label: v })}
          placeholder={tr('Chocolate', 'Chocolate')}
        />
        <TextField label={tr('Stock', 'Stock')} inputMode="numeric" value={o.stock} onChange={(v) => onChange({ stock: v })} />
        <TextField
          label={tr('Own price (optional)', 'Apna price (optional)')}
          prefix="₹"
          inputMode="decimal"
          value={o.price}
          onChange={(v) => onChange({ price: v })}
          placeholder={tr('Same', 'Same')}
        />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: space.sm, flexWrap: 'wrap', marginTop: space.sm }}>
        <span style={{ fontFamily: font.body, fontSize: 12, color: color.inkSecondary }}>{tr('Colour (optional)', 'Rang (optional)')}</span>
        <Swatches value={o.tint} onChange={(t) => onChange({ tint: t === o.tint ? null : t })} small />
        <span style={{ flex: 1 }} />
        <Button
          variant="quiet"
          tone="danger"
          onClick={onRemove}
          ariaLabel={tr(`Remove choice ${o.label || index + 1}`, `Choice ${o.label || index + 1} hatao`)}
        >
          {tr('Remove', 'Hatao')}
        </Button>
      </div>
      {error && (
        <div style={{ fontFamily: font.body, fontSize: 12, color: color.criticalText, marginTop: 4 }}>{error}</div>
      )}
    </div>
  );
}

function Swatches({ value, onChange, small }: { value: string | null; onChange: (t: string) => void; small?: boolean }) {
  const size = small ? 28 : 36;
  return (
    <div role="group" aria-label={tr('Colour', 'Rang')} style={{ display: 'flex', flexWrap: 'wrap', gap: small ? 4 : 8 }}>
      {TINT_CHOICES.map(({ value: t, name }) => {
        const on = value?.toLowerCase() === t.toLowerCase();
        return (
          <button
            key={t}
            type="button"
            aria-pressed={on}
            aria-label={name}
            title={name}
            onClick={() => onChange(t)}
            style={{
              appearance: 'none',
              width: Math.max(size, small ? 32 : TOUCH),
              height: Math.max(size, small ? 32 : TOUCH),
              padding: 0,
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              display: 'grid',
              placeItems: 'center',
            }}
          >
            <span
              style={{
                width: size,
                height: size,
                borderRadius: radius.pill,
                background: t,
                border: on ? `3px solid ${color.ink}` : '1px solid rgba(255,255,255,0.25)',
                boxShadow: on ? `0 0 0 2px ${color.accent}` : undefined,
              }}
            />
          </button>
        );
      })}
    </div>
  );
}

function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      style={{
        appearance: 'none',
        background: 'transparent',
        border: 'none',
        padding: 0,
        display: 'flex',
        alignItems: 'center',
        gap: space.md,
        minHeight: TOUCH,
        cursor: 'pointer',
        color: color.ink,
        fontFamily: font.body,
        fontSize: 14,
        textAlign: 'left',
      }}
    >
      <span
        aria-hidden
        style={{
          width: 46,
          height: 26,
          borderRadius: radius.pill,
          background: on ? color.accent : color.surfaceSunken,
          border: `1px solid ${on ? 'transparent' : color.borderStrong}`,
          position: 'relative',
          flexShrink: 0,
          transition: 'background 120ms',
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: 2,
            left: on ? 22 : 2,
            width: 20,
            height: 20,
            borderRadius: radius.pill,
            background: '#fff',
            transition: 'left 120ms',
          }}
        />
      </span>
      {label}
    </button>
  );
}

function FieldGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ marginTop: space.lg }}>
      <div style={{ fontFamily: font.body, fontSize: 12, color: color.inkSecondary, marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  );
}

function Row2({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: space.md,
        flexWrap: 'wrap',
        marginTop: space.md,
      }}
    >
      {children}
    </div>
  );
}

const twoCol: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(min(200px, 100%), 1fr))',
  columnGap: space.md,
};

/**
 * The photo at the top of the form: a big preview (the photo, else the drawn
 * picture), Upload / Change / Remove, and drag-and-drop onto the preview on a
 * desktop. The photo is uploaded straight away; the product only points at it
 * once the owner presses Save, so Cancel leaves the product as it was.
 */
function PhotoBlock({
  draft: d,
  disabled,
  onPhoto,
  onBusy,
}: {
  draft: ProductDraft;
  disabled: boolean;
  onPhoto: (url: string | null) => void;
  onBusy: (busy: boolean) => void;
}) {
  const { cloud } = useShop();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);

  const take = async (file: File | undefined) => {
    if (!file || !cloud || busy) return;
    setBusy(true);
    onBusy(true);
    setError(null);
    try {
      onPhoto(await uploadProductPhoto(cloud.ownerKey, file));
    } catch (e) {
      setError(e instanceof PhotoError ? e.message : tr('The photo didn’t upload. Please try again.', 'Photo upload nahi hui. Phir se try karo.'));
    } finally {
      setBusy(false);
      onBusy(false);
    }
  };

  return (
    <div style={{ marginTop: space.sm }}>
      <div style={{ fontFamily: font.body, fontSize: 12, color: color.inkSecondary, marginBottom: 6 }}>{tr('Photo', 'Photo')}</div>
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
            borderRadius: 16,
            outline: over ? `2px dashed ${color.accent}` : 'none',
            outlineOffset: 3,
          }}
        >
          <ProductPicture kind={d.artKind} tint={d.artTint} imageUrl={d.imageUrl} size={132} />
          {busy && (
            <div
              role="status"
              style={{
                position: 'absolute',
                inset: 0,
                display: 'grid',
                placeItems: 'center',
                borderRadius: 14,
                background: 'rgba(7,8,12,0.72)',
                color: color.ink,
                fontFamily: font.body,
                fontSize: 13,
                fontWeight: 700,
              }}
            >
              {tr('Uploading…', 'Upload ho raha hai…')}
            </div>
          )}
        </div>
        <div style={{ display: 'grid', gap: space.sm, flex: '1 1 180px', minWidth: 0 }}>
          <div style={{ display: 'flex', gap: space.sm, flexWrap: 'wrap' }}>
            <Button variant="ghost" disabled={busy || disabled} onClick={() => fileRef.current?.click()}>
              {d.imageUrl ? tr('Change photo', 'Photo badlo') : tr('Upload photo', 'Photo upload karo')}
            </Button>
            {d.imageUrl && (
              <Button variant="quiet" tone="danger" disabled={busy || disabled} onClick={() => onPhoto(null)}>
                {tr('Remove photo', 'Photo hatao')}
              </Button>
            )}
          </div>
          <div style={{ fontFamily: font.body, fontSize: 12, color: color.inkMuted }}>
            {d.imageUrl
              ? tr(
                  'Members see this photo in the app. Remove it to show the drawn picture instead.',
                  'Members app mein yeh photo dekhte hain. Hatane par bani hui picture dikhegi.',
                )
              : tr(
                  'A clear photo on a plain background works best. You can also drop a photo on the picture.',
                  'Saade background par saaf photo sabse achhi lagti hai. Photo ko picture par drop bhi kar sakte hain.',
                )}
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
        accept="image/*"
        hidden
        aria-hidden
        tabIndex={-1}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          void take(file);
        }}
      />
    </div>
  );
}
