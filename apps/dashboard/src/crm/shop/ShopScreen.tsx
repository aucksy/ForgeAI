/**
 * Shop — orders members placed in the MettleUp app, and the products they can buy.
 *
 * Orders is the default because it is the part that moves: a member orders on
 * their phone, the desk sees it here within five seconds, hands it over, and
 * marks it collected when the money is taken. Products is where the owner keeps
 * prices and stock true.
 */

import { useCallback, useMemo, useRef, useState } from 'react';

import { formatINR } from '../logic/money';
import {
  Button,
  Card,
  ChipToggle,
  EmptyState,
  ErrorBanner,
  Grid,
  PageHeader,
  Pill,
  Row,
  Sheet,
  TOUCH,
  color,
  font,
  radius,
  space,
  type Tone,
} from '../ui/kit';
import { navigate } from '../ui/router';
import * as api from './api';
import { JoinCodeCard } from './JoinCode';
import {
  ACTION_LABEL,
  ACTION_TARGET,
  actionsFor,
  CATEGORIES,
  clockTime,
  countByStatus,
  filterOrders,
  lineText,
  priceText,
  MutationGate,
  restockOptionId,
  STATUS_LABEL,
  stockLabel,
  timeAgo,
  type Order,
  type OrderAction,
  type OrderFilter,
  type OrderStatus,
  type Product,
} from './logic';
import { ProductPicture } from './ProductArt';
import { PhotoError, uploadProductPhoto } from './photoUpload';
import { useRole } from '../auth/AuthProvider';
import { shopTabFor, shopTabs } from '../auth/permissions';
import { ProductSheet } from './ProductSheet';
import { usePoll, useShop } from './ShopProvider';

export function ShopScreen({ section }: { section?: string }) {
  const { cloud, newCount } = useShop();
  // Staff (front desk) hands over orders; products and prices are the owner's (permissions.ts), so
  // Staff gets the Orders list with no tabs above it. Messages to members moved to their own page,
  // Messages & offers (22 Oct 2026).
  const role = useRole();
  const tab = shopTabFor(role, section);
  const tabs = shopTabs(role);

  return (
    <>
      <PageHeader
        title="Shop"
        subtitle={
          tabs.length > 1
            ? 'What members order in the MettleUp app, and what you sell'
            : 'What members order in the MettleUp app'
        }
      />

      {!cloud ? (
        <JoinCodeCard />
      ) : (
        <>
          {tabs.length > 1 && (
            <div style={{ marginBottom: space.lg }}>
              <ChipToggle
                variant="tabs"
                label="Shop section"
                value={tab}
                onChange={(v) => navigate(`/shop/${v}`)}
                options={[
                  {
                    value: 'orders',
                    label: newCount > 0 ? `Orders · ${newCount} new` : 'Orders',
                  },
                  { value: 'products', label: 'Products' },
                ]}
              />
            </div>
          )}
          {tab === 'orders' ? <OrdersSection /> : <ProductsSection />}
        </>
      )}
    </>
  );
}

// ---------------------------------------------------------------- orders

const STATUS_TONE: Record<OrderStatus, Tone> = {
  ordered: 'accent',
  ready: 'good',
  collected: 'muted',
  cancelled: 'critical',
};

function OrdersSection() {
  const { cloud, orders, ordersLoaded, ordersError, now } = useShop();
  const [filter, setFilter] = useState<OrderFilter>('ordered');
  const [cancelling, setCancelling] = useState<Order | null>(null);

  // Stable, because the sheet re-focuses itself whenever its onClose changes.
  const closeCancel = useCallback(() => setCancelling(null), []);
  const counts = useMemo(() => countByStatus(orders), [orders]);
  const rows = useMemo(() => filterOrders(orders, filter), [orders, filter]);
  const code = cloud?.joinCode ?? '';

  return (
    <>
      {ordersError && <ErrorBanner>{ordersError}</ErrorBanner>}

      <div style={{ marginBottom: space.lg }}>
        <ChipToggle
          label="Show orders"
          value={filter}
          onChange={(v) => setFilter(v as OrderFilter)}
          options={[
            { value: 'ordered', label: 'New', count: counts.ordered },
            { value: 'ready', label: 'Ready', count: counts.ready },
            { value: 'collected', label: 'Collected', count: counts.collected },
            { value: 'cancelled', label: 'Cancelled', count: counts.cancelled },
            { value: 'all', label: 'All', count: counts.all },
          ]}
        />
      </div>

      {!ordersLoaded && !ordersError ? (
        <Card>
          <EmptyState title="Loading orders…" />
        </Card>
      ) : orders.length === 0 ? (
        <Card>
          <EmptyState
            title="No orders yet"
            body={`Members order from the Shop tab in the MettleUp app after joining with gym code ${code}.`}
          />
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState
            title={
              filter === 'ordered'
                ? 'No new orders right now'
                : filter === 'ready'
                  ? 'Nothing waiting to be picked up'
                  : `No ${STATUS_LABEL[filter as OrderStatus]?.toLowerCase() ?? ''} orders`
            }
            body={
              filter === 'ready'
                ? 'Orders you mark ready wait here until the member collects and pays.'
                : 'New orders show up here on their own in a few seconds.'
            }
          />
        </Card>
      ) : (
        <Grid min={320}>
          {rows.map((o) => (
            <OrderCard key={o.orderId} order={o} now={now} onCancel={() => setCancelling(o)} />
          ))}
        </Grid>
      )}

      {cancelling && <CancelSheet order={cancelling} onClose={closeCancel} />}
    </>
  );
}

function OrderCard({ order, now, onCancel }: { order: Order; now: number; onCancel: () => void }) {
  const { setOrderStatus, flash } = useShop();
  const [busy, setBusy] = useState<OrderAction | null>(null);
  const [error, setError] = useState<string | null>(null);

  const act = async (a: OrderAction) => {
    if (a === 'cancel') return onCancel();
    setBusy(a);
    setError(null);
    try {
      await setOrderStatus(order.orderId, ACTION_TARGET[a]);
      flash(
        a === 'ready'
          ? `Order ${order.orderNo} is ready. ${order.memberName} can see this in the app.`
          : a === 'collected'
            ? `Order ${order.orderNo} collected. ${formatINR(order.totalP)} taken.`
            : `Order ${order.orderNo} is back to new.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(null);
    }
  };

  const actions = actionsFor(order.status);

  return (
    <Card pad={space.lg} style={{ display: 'flex', flexDirection: 'column' }}>
      <Row gap={space.sm} wrap={false} align="flex-start">
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: font.display, fontSize: 18, fontWeight: 700, color: color.ink }}>
            Order {order.orderNo}
          </div>
          <div style={{ fontFamily: font.body, fontSize: 14, color: color.ink, marginTop: 2 }}>
            {order.memberName}
          </div>
          <div style={{ fontFamily: font.body, fontSize: 12, color: color.inkMuted, marginTop: 2 }}>
            {timeAgo(order.createdAt, now)} · {clockTime(order.createdAt)}
          </div>
        </div>
        <Pill tone={STATUS_TONE[order.status]}>
          {order.status === 'cancelled' && order.cancelledBy === 'member'
            ? 'Cancelled by member'
            : STATUS_LABEL[order.status]}
        </Pill>
      </Row>

      <div
        style={{
          marginTop: space.md,
          paddingTop: space.md,
          borderTop: `1px solid ${color.border}`,
          display: 'grid',
          gap: 6,
        }}
      >
        {order.lines.map((l, i) => (
          <Row key={`${l.productId}-${l.optionId ?? ''}-${i}`} gap={space.sm} wrap={false} align="baseline">
            <span style={{ flex: 1, minWidth: 0, fontFamily: font.body, fontSize: 14, color: color.inkSecondary }}>
              {lineText(l)}
            </span>
            <span style={{ fontFamily: font.mono, fontSize: 14, color: color.inkSecondary, whiteSpace: 'nowrap' }}>
              {formatINR(l.unitPriceP * l.qty)}
            </span>
          </Row>
        ))}
        <Row gap={space.sm} wrap={false} align="baseline">
          <span style={{ flex: 1, fontFamily: font.body, fontSize: 14, fontWeight: 700, color: color.ink }}>
            Total
          </span>
          <span style={{ fontFamily: font.mono, fontSize: 18, fontWeight: 700, color: color.ink }}>
            {formatINR(order.totalP)}
          </span>
        </Row>
      </div>

      {error && (
        <div style={{ marginTop: space.md }}>
          <ErrorBanner>{error}</ErrorBanner>
        </div>
      )}

      {actions.length > 0 && (
        // Two equal buttons side by side (each takes a full row when the card is too
        // narrow for both), and Cancel as a full-width quiet line under them. It used
        // to wrap onto a row of its own, indented by its padding, under two buttons
        // of different widths. `marginTop: auto` pins the block to the card's bottom
        // so cards in one row keep their buttons on one line.
        <div style={{ marginTop: 'auto', paddingTop: space.md, display: 'grid', gap: space.xs }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: space.sm }}>
            {actions
              .filter((a) => a !== 'cancel')
              .map((a, i) => (
                <div key={a} style={{ flex: '1 1 0', minWidth: 'max-content' }}>
                  <Button
                    full
                    variant={i === 0 ? 'primary' : 'ghost'}
                    disabled={busy !== null}
                    onClick={() => void act(a)}
                    ariaLabel={`${ACTION_LABEL[a]}, order ${order.orderNo}`}
                  >
                    {busy === a ? 'Saving…' : ACTION_LABEL[a]}
                  </Button>
                </div>
              ))}
          </div>
          {actions.includes('cancel') && (
            <Button
              full
              variant="quiet"
              tone="danger"
              disabled={busy !== null}
              onClick={() => void act('cancel')}
              ariaLabel={`${ACTION_LABEL.cancel}, order ${order.orderNo}`}
            >
              {ACTION_LABEL.cancel}
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}

function CancelSheet({ order, onClose }: { order: Order; onClose: () => void }) {
  const { setOrderStatus, flash } = useShop();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <Sheet
      title={`Cancel order ${order.orderNo}?`}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Keep it
          </Button>
          <Button
            tone="danger"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await setOrderStatus(order.orderId, 'cancelled');
                flash(`Order ${order.orderNo} cancelled. Stock is back.`);
                onClose();
              } catch (e) {
                setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
                setBusy(false);
              }
            }}
          >
            {busy ? 'Cancelling…' : 'Cancel order'}
          </Button>
        </>
      }
    >
      {error && <ErrorBanner>{error}</ErrorBanner>}
      <p style={{ margin: 0, fontFamily: font.body, fontSize: 14, color: color.inkSecondary }}>
        {order.memberName}
        {'’s order for '}
        <strong style={{ color: color.ink }}>{formatINR(order.totalP)}</strong>
        {' will be cancelled. '}
        <strong style={{ color: color.ink }}>The items go back into stock</strong>
        {', and '}
        {order.memberName}
        {' sees “Cancelled” in the app. This cannot be undone.'}
      </p>
    </Sheet>
  );
}

// ---------------------------------------------------------------- products

function ProductsSection() {
  const { cloud, handleError, flash } = useShop();
  const [products, setProducts] = useState<Product[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Product | 'new' | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [photoBusyId, setPhotoBusyId] = useState<string | null>(null);

  const key = cloud?.ownerKey ?? null;
  // Stable, because the sheet re-focuses itself whenever its onClose changes.
  const closeEditor = useCallback(() => setEditing(null), []);
  // A 15 s read already on its way must not paint over +10 / hide / save.
  const gate = useRef(new MutationGate()).current;

  const load = useCallback(async () => {
    if (!key) return;
    const stamp = gate.stamp();
    try {
      const list = await api.listProducts(key);
      if (!gate.fresh(stamp)) return;
      setProducts(list);
      setError(null);
    } catch (e) {
      setError(handleError(e));
    }
  }, [key, handleError, gate]);

  // Members buying changes stock, so the list keeps itself fresh while it is open.
  usePoll(load, 15_000, key !== null && editing === null);

  /** Re-read the list (the truth), THEN say what went wrong — a reload clears the banner. */
  const showAfterReload = async (message: string) => {
    await load();
    setError(message);
  };

  const quick = async (p: Product, kind: 'restock' | 'toggle') => {
    if (!key) return;
    setBusyId(p.productId);
    setError(null);
    const optionId = restockOptionId(p);
    let failed: string | null = null;
    await gate.run(async () => {
      try {
        // Both ask the cloud for a CHANGE (add 10, flip shown), never send the
        // whole product back — a member's order in between is never undone.
        const saved =
          kind === 'restock'
            ? await api.addStock(key, p.productId, optionId, 10)
            : await api.setProductActive(key, p.productId, !p.active);
        setProducts((prev) => prev?.map((x) => (x.productId === saved.productId ? saved : x)) ?? prev);
        const choice = optionId ? saved.options.find((o) => o.id === optionId)?.label : null;
        flash(
          kind === 'restock'
            ? `Added 10 to ${saved.name}${choice ? ` · ${choice}` : ''}. ${saved.stock} in stock now.`
            : saved.active
              ? `${saved.name} is shown in the app again.`
              : `${saved.name} is hidden from the app.`,
        );
      } catch (e) {
        failed = handleError(e);
      }
    });
    setBusyId(null);
    if (failed) await showAfterReload(failed);
  };

  /** "Add photo" on a card: upload, then point only the photo at it (no CHANGED risk). */
  const addPhoto = async (p: Product, file: File) => {
    if (!key) return;
    setBusyId(p.productId);
    setPhotoBusyId(p.productId);
    setError(null);
    let failed: string | null = null;
    await gate.run(async () => {
      try {
        const url = await uploadProductPhoto(key, file);
        const saved = await api.setProductPhoto(key, p.productId, url);
        setProducts((prev) => prev?.map((x) => (x.productId === saved.productId ? saved : x)) ?? prev);
        flash(`Photo added to ${saved.name}. Members see it in the app now.`);
      } catch (e) {
        failed = e instanceof PhotoError ? e.message : handleError(e);
      }
    });
    setBusyId(null);
    setPhotoBusyId(null);
    if (failed) await showAfterReload(failed);
  };

  const shown = products?.filter((p) => p.active).length ?? 0;

  return (
    <>
      <Row gap={space.md}>
        <div style={{ flex: 1, minWidth: 200, fontFamily: font.body, fontSize: 14, color: color.inkSecondary }}>
          {products
            ? `${products.length} products · ${shown} shown in the app`
            : 'Loading your products…'}
        </div>
        <Button onClick={() => setEditing('new')}>+ Add product</Button>
      </Row>

      <div style={{ height: space.lg }} />
      {error && <ErrorBanner>{error}</ErrorBanner>}

      {products && products.length === 0 ? (
        <Card>
          <EmptyState
            title="No products yet"
            body="Add what you sell at the desk, like protein, shakers and T-shirts. Members can then order them in the app."
            action={<Button onClick={() => setEditing('new')}>+ Add product</Button>}
          />
        </Card>
      ) : (
        <Grid min={290}>
          {(products ?? []).map((p) => (
            <ProductCard
              key={p.productId}
              product={p}
              busy={busyId === p.productId}
              uploading={photoBusyId === p.productId}
              onAddPhoto={(file) => void addPhoto(p, file)}
              onEdit={() => setEditing(p)}
              onRestock={() => void quick(p, 'restock')}
              onToggle={() => void quick(p, 'toggle')}
            />
          ))}
        </Grid>
      )}

      {editing && (
        <ProductSheet
          product={editing === 'new' ? null : editing}
          onClose={closeEditor}
          gate={gate}
          onReloaded={(list) => setProducts(list)}
          onSaved={(saved, verb) => {
            setProducts((prev) => {
              if (!prev) return [saved];
              if (verb === 'deleted') return prev.filter((x) => x.productId !== saved.productId);
              const exists = prev.some((x) => x.productId === saved.productId);
              return exists ? prev.map((x) => (x.productId === saved.productId ? saved : x)) : [...prev, saved];
            });
            flash(
              verb === 'deleted'
                ? `${saved.name} deleted.`
                : verb === 'added'
                  ? `${saved.name} added to the shop.`
                  : `${saved.name} saved.`,
            );
            setEditing(null);
          }}
        />
      )}
    </>
  );
}

function ProductCard({
  product: p,
  busy,
  uploading,
  onAddPhoto,
  onEdit,
  onRestock,
  onToggle,
}: {
  product: Product;
  busy: boolean;
  uploading: boolean;
  onAddPhoto: (file: File) => void;
  onEdit: () => void;
  onRestock: () => void;
  onToggle: () => void;
}) {
  const stock = stockLabel(p.stock);
  const fileRef = useRef<HTMLInputElement>(null);
  const category = CATEGORIES.find((c) => c.value === p.category)?.label ?? p.category;

  return (
    <Card pad={space.lg} style={{ opacity: p.active ? 1 : 0.72, display: 'flex', flexDirection: 'column' }}>
      <button
        type="button"
        onClick={onEdit}
        aria-label={`Edit ${p.name}`}
        style={{
          appearance: 'none',
          background: 'transparent',
          border: 'none',
          padding: 0,
          margin: 0,
          width: '100%',
          textAlign: 'left',
          cursor: 'pointer',
          color: 'inherit',
          display: 'flex',
          gap: space.md,
          alignItems: 'flex-start',
          minHeight: TOUCH,
        }}
      >
        <ProductPicture kind={p.artKind} tint={p.artTint} imageUrl={p.imageUrl} size={76} />
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Balanced, so a long name breaks into two even lines rather than leaving
              "g" alone on the second ("Creatine monohydrate 250 / g"). */}
          <div
            style={{
              fontFamily: font.body,
              fontSize: 15,
              fontWeight: 700,
              color: color.ink,
              lineHeight: 1.3,
              textWrap: 'balance',
            }}
          >
            {p.name}
          </div>
          <div style={{ fontFamily: font.body, fontSize: 12, color: color.inkMuted, marginTop: 2 }}>
            {category}
            {p.options.length > 0 && ` · ${p.options.length} ${(p.optionName ?? 'choices').toLowerCase()}s`}
          </div>
          <div style={{ fontFamily: font.mono, fontSize: 17, fontWeight: 700, color: color.ink, marginTop: 6 }}>
            {priceText(p)}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
            <span
              style={{
                fontFamily: font.body,
                fontSize: 12,
                fontWeight: 700,
                color:
                  stock.tone === 'out' ? color.criticalText : stock.tone === 'low' ? color.warning : color.goodText,
              }}
            >
              {stock.text}
            </span>
            {!p.active && <Pill tone="warn">Hidden</Pill>}
          </div>
        </div>
      </button>

      {/* A 2-column grid of equal buttons pinned to the card's bottom. Wrapping
          buttons left "Edit" alone on a second row, and a card with a two-line name
          pushed its buttons below its neighbours'. With three buttons the last one
          spans the row, so the block is always a full rectangle. */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          gap: space.sm,
          marginTop: 'auto',
          paddingTop: space.md,
        }}
      >
        <SmallButton onClick={onRestock} disabled={busy} label={`Add 10 to stock, ${p.name}`}>
          +10 stock
        </SmallButton>
        <SmallButton
          onClick={onToggle}
          disabled={busy}
          label={p.active ? `Hide ${p.name}` : `Show ${p.name}`}
        >
          {p.active ? 'Hide from app' : 'Show in app'}
        </SmallButton>
        {!p.imageUrl && (
          <SmallButton onClick={() => fileRef.current?.click()} disabled={busy} label={`Add a photo of ${p.name}`}>
            {uploading ? 'Uploading…' : 'Add photo'}
          </SmallButton>
        )}
        <SmallButton onClick={onEdit} disabled={busy} label={`Edit ${p.name}`} span={!p.imageUrl ? 1 : 2}>
          Edit
        </SmallButton>
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
            if (file) onAddPhoto(file);
          }}
        />
      </div>
    </Card>
  );
}

function SmallButton({
  children,
  onClick,
  disabled,
  label,
  span = 1,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  label: string;
  span?: 1 | 2;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      style={{
        appearance: 'none',
        minHeight: TOUCH,
        padding: '6px 14px',
        borderRadius: radius.pill,
        border: `1px solid ${color.borderStrong}`,
        background: 'transparent',
        color: color.ink,
        fontFamily: font.body,
        fontSize: 13,
        fontWeight: 600,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        width: '100%',
        whiteSpace: 'nowrap',
        gridColumn: span === 2 ? '1 / -1' : undefined,
      }}
    >
      {children}
    </button>
  );
}
