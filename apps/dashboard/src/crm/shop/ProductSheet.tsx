/**
 * Add or edit one product — the same sheet pattern as the CRM's member and payment
 * forms. Prices are typed in rupees and saved as paise; a product either has one
 * stock number, or a list of choices (a flavour, a size) each with its own stock,
 * in which case the product's stock is their sum — the cloud keeps the same rule.
 */

import { useCallback, useState, type ReactNode } from 'react';

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
} from '../ui/kit';
import * as api from './api';
import {
  ART_KINDS,
  CATEGORIES,
  draftFromProduct,
  MAX_OPTIONS,
  optionStockSum,
  parseStock,
  TINT_CHOICES,
  validateDraft,
  type DraftErrors,
  type OptionDraft,
  type Product,
  type ProductDraft,
} from './logic';
import { ProductArt } from './ProductArt';
import { useShop } from './ShopProvider';

export function ProductSheet({
  product,
  onClose,
  onSaved,
}: {
  product: Product | null;
  onClose: () => void;
  onSaved: (p: Product, verb: 'added' | 'saved' | 'deleted') => void;
}) {
  const { cloud, handleError } = useShop();
  const [d, setD] = useState<ProductDraft>(() => draftFromProduct(product));
  const [errors, setErrors] = useState<DraftErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const closeConfirm = useCallback(() => setConfirmDelete(false), []);

  const set = <K extends keyof ProductDraft>(k: K, v: ProductDraft[K]) => setD((prev) => ({ ...prev, [k]: v }));
  const setOption = (i: number, patch: Partial<OptionDraft>) =>
    setD((prev) => ({ ...prev, options: prev.options.map((o, j) => (j === i ? { ...o, ...patch } : o)) }));

  const save = async () => {
    if (!cloud) return;
    const v = validateDraft(d);
    if (!v.ok) {
      setErrors(v.errors);
      setError('Please fix the highlighted fields.');
      return;
    }
    setErrors({});
    setError(null);
    setSaving(true);
    try {
      const saved = await api.saveProduct(cloud.ownerKey, v.payload);
      onSaved(saved, product ? 'saved' : 'added');
    } catch (e) {
      setError(handleError(e));
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!cloud || !product) return;
    setSaving(true);
    setError(null);
    try {
      await api.deleteProduct(cloud.ownerKey, product.productId);
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
        title={`Delete ${product.name}?`}
        onClose={closeConfirm}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              Keep it
            </Button>
            <Button tone="danger" disabled={saving} onClick={() => void remove()}>
              {saving ? 'Deleting…' : 'Delete product'}
            </Button>
          </>
        }
      >
        {error && <ErrorBanner>{error}</ErrorBanner>}
        <p style={{ margin: 0, fontFamily: font.body, fontSize: 14, color: color.inkSecondary }}>
          It disappears from the app straight away. Orders already placed for it stay as they are. If you
          might sell it again, use <strong style={{ color: color.ink }}>Hide from app</strong> instead.
        </p>
      </Sheet>
    );
  }

  return (
    <Sheet
      title={product ? 'Edit product' : 'Add product'}
      onClose={onClose}
      wide
      footer={
        <>
          {product && (
            <span style={{ marginRight: 'auto' }}>
              <Button variant="quiet" tone="danger" onClick={() => setConfirmDelete(true)}>
                Delete
              </Button>
            </span>
          )}
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={saving} onClick={() => void save()}>
            {saving ? 'Saving…' : product ? 'Save changes' : 'Add product'}
          </Button>
        </>
      }
    >
      {error && <ErrorBanner>{error}</ErrorBanner>}

      <div style={{ display: 'flex', gap: space.lg, alignItems: 'center', marginTop: space.sm }}>
        <ProductArt kind={d.artKind} tint={d.artTint} size={84} />
        <div style={{ fontFamily: font.body, fontSize: 13, color: color.inkSecondary }}>
          This is the picture members see in the app. Pick a shape and a colour below.
        </div>
      </div>

      <TextField
        label="Name"
        value={d.name}
        onChange={(v) => set('name', v)}
        placeholder="Whey protein 1 kg"
        error={errors.name}
        autoFocus={!product}
      />

      <div style={twoCol}>
        <SelectField
          label="Category"
          value={d.category}
          onChange={(v) => set('category', v as ProductDraft['category'])}
          options={CATEGORIES}
        />
        <TextField
          label="Price"
          prefix="₹"
          inputMode="decimal"
          value={d.price}
          onChange={(v) => set('price', v)}
          placeholder="2499"
          error={errors.price}
        />
      </div>

      <TextField
        label="Description (optional)"
        value={d.description}
        onChange={(v) => set('description', v.slice(0, 600))}
        placeholder="One line members see, like the size or how to use it"
        multiline
      />

      <FieldGroup label="Picture">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(64px, 1fr))', gap: 6 }}>
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

      <FieldGroup label="Colour">
        <Swatches value={d.artTint} onChange={(t) => set('artTint', t)} />
      </FieldGroup>

      <FieldGroup label="Shown in the app">
        <Switch
          on={d.active}
          onChange={(v) => set('active', v)}
          label={d.active ? 'Members can see and order this' : 'Hidden — members can’t see it'}
        />
      </FieldGroup>

      <FieldGroup label="Choices">
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
          label={d.useOptions ? 'Comes in flavours or sizes, each with its own stock' : 'One kind, one stock number'}
        />
      </FieldGroup>

      {!d.useOptions ? (
        <div style={{ maxWidth: 220 }}>
          <TextField
            label="Stock"
            inputMode="numeric"
            value={d.stock}
            onChange={(v) => set('stock', v)}
            error={errors.stock}
            hint="How many you have at the desk."
          />
        </div>
      ) : (
        <>
          <div style={{ maxWidth: 260 }}>
            <TextField
              label="What is the choice?"
              value={d.optionName}
              onChange={(v) => set('optionName', v)}
              placeholder="Flavour or Size"
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
              + Add a choice
            </Button>
            <span style={{ fontFamily: font.body, fontSize: 13, color: color.inkSecondary }}>
              Total stock: <strong style={{ color: color.ink }}>{optionTotal}</strong>
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
        <TextField label={`Choice ${index + 1}`} value={o.label} onChange={(v) => onChange({ label: v })} placeholder="Chocolate" />
        <TextField label="Stock" inputMode="numeric" value={o.stock} onChange={(v) => onChange({ stock: v })} />
        <TextField
          label="Own price (optional)"
          prefix="₹"
          inputMode="decimal"
          value={o.price}
          onChange={(v) => onChange({ price: v })}
          placeholder="Same"
        />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: space.sm, flexWrap: 'wrap', marginTop: space.sm }}>
        <span style={{ fontFamily: font.body, fontSize: 12, color: color.inkSecondary }}>Colour (optional)</span>
        <Swatches value={o.tint} onChange={(t) => onChange({ tint: t === o.tint ? null : t })} small />
        <span style={{ flex: 1 }} />
        <Button variant="quiet" tone="danger" onClick={onRemove} ariaLabel={`Remove choice ${o.label || index + 1}`}>
          Remove
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
    <div role="group" aria-label="Colour" style={{ display: 'flex', flexWrap: 'wrap', gap: small ? 4 : 8 }}>
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
