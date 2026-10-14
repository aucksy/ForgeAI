/**
 * Shop — orders members placed in the ForgeAI app, and the products they can buy.
 *
 * Orders is the default because it is the part that moves: a member orders on
 * their phone, the desk sees it here within five seconds, hands it over, and
 * marks it collected when the money is taken. Products is where the owner keeps
 * prices and stock true.
 */

import { useCallback, useMemo, useRef, useState } from 'react';

import { tr } from '../i18n';
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
import { MessagesSection } from './MessagesSection';
import { ProductSheet } from './ProductSheet';
import { usePoll, useShop } from './ShopProvider';

export function ShopScreen({ section }: { section?: string }) {
  const { cloud, newCount } = useShop();
  const tab = section === 'products' || section === 'messages' ? section : 'orders';

  return (
    <>
      <PageHeader
        title={tr('Shop', 'Shop')}
        subtitle={tr(
          'What members order in the ForgeAI app, what you sell, and your messages to them',
          'Members ForgeAI app mein kya order karte hain, aap kya bechte hain, aur unke liye aapke messages',
        )}
      />

      {!cloud ? (
        <JoinCodeCard />
      ) : (
        <>
          <div style={{ marginBottom: space.lg }}>
            <ChipToggle
              variant="tabs"
              label={tr('Shop section', 'Shop ka hissa')}
              value={tab}
              onChange={(v) => navigate(`/shop/${v}`)}
              options={[
                {
                  value: 'orders',
                  label: newCount > 0 ? tr(`Orders · ${newCount} new`, `Orders · ${newCount} naye`) : tr('Orders', 'Orders'),
                },
                { value: 'products', label: tr('Products', 'Products') },
                { value: 'messages', label: tr('Messages', 'Messages') },
              ]}
            />
          </div>
          {tab === 'orders' ? <OrdersSection /> : tab === 'products' ? <ProductsSection /> : <MessagesSection />}
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
          label={tr('Show orders', 'Orders dikhao')}
          value={filter}
          onChange={(v) => setFilter(v as OrderFilter)}
          options={[
            { value: 'ordered', label: tr('New', 'Naya'), count: counts.ordered },
            { value: 'ready', label: tr('Ready', 'Taiyaar'), count: counts.ready },
            { value: 'collected', label: tr('Collected', 'Le gaye'), count: counts.collected },
            { value: 'cancelled', label: tr('Cancelled', 'Cancel hua'), count: counts.cancelled },
            { value: 'all', label: tr('All', 'Sab'), count: counts.all },
          ]}
        />
      </div>

      {!ordersLoaded && !ordersError ? (
        <Card>
          <EmptyState title={tr('Loading orders…', 'Orders load ho rahe hain…')} />
        </Card>
      ) : orders.length === 0 ? (
        <Card>
          <EmptyState
            title={tr('No orders yet', 'Abhi koi order nahi')}
            body={tr(
              `Members order from the Shop tab in the ForgeAI app after joining with code ${code}.`,
              `Members code ${code} se judkar ForgeAI app ke Shop tab se order karte hain.`,
            )}
          />
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState
            title={
              filter === 'ordered'
                ? tr('No new orders right now', 'Abhi koi naya order nahi')
                : filter === 'ready'
                  ? tr('Nothing waiting to be picked up', 'Lene ke liye kuch baaki nahi')
                  : tr(
                      `No ${STATUS_LABEL[filter as OrderStatus]?.toLowerCase() ?? ''} orders`,
                      `Koi ${STATUS_LABEL[filter as OrderStatus]?.toLowerCase() ?? ''} order nahi`,
                    )
            }
            body={
              filter === 'ready'
                ? tr(
                    'Orders you mark ready wait here until the member collects and pays.',
                    'Taiyaar kiye orders yahan rehte hain jab tak member le kar pay na kare.',
                  )
                : tr(
                    'New orders show up here by themselves within a few seconds.',
                    'Naye orders kuch second mein yahan khud aa jaate hain.',
                  )
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
          ? tr(
              `Order ${order.orderNo} is ready — ${order.memberName} can see that in the app.`,
              `Order ${order.orderNo} taiyaar hai — ${order.memberName} ise app mein dekh sakte hain.`,
            )
          : a === 'collected'
            ? tr(
                `Order ${order.orderNo} collected. ${formatINR(order.totalP)} taken.`,
                `Order ${order.orderNo} le gaye. ${formatINR(order.totalP)} mil gaye.`,
              )
            : tr(`Order ${order.orderNo} is back to new.`, `Order ${order.orderNo} wapas Naya ho gaya.`),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : tr('Something went wrong. Please try again.', 'Kuch gadbad hui. Phir se try karo.'));
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
            {tr('Order', 'Order')} {order.orderNo}
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
            ? tr('Cancelled by member', 'Member ne cancel kiya')
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
            {tr('Total', 'Kul')}
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
                    ariaLabel={tr(`${ACTION_LABEL[a]}, order ${order.orderNo}`, `${ACTION_LABEL[a]}, order ${order.orderNo}`)}
                  >
                    {busy === a ? tr('Saving…', 'Save ho raha hai…') : ACTION_LABEL[a]}
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
              ariaLabel={tr(`${ACTION_LABEL.cancel}, order ${order.orderNo}`, `${ACTION_LABEL.cancel}, order ${order.orderNo}`)}
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
      title={tr(`Cancel order ${order.orderNo}?`, `Order ${order.orderNo} cancel karein?`)}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {tr('Keep it', 'Rehne do')}
          </Button>
          <Button
            tone="danger"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await setOrderStatus(order.orderId, 'cancelled');
                flash(tr(`Order ${order.orderNo} cancelled. Stock is back.`, `Order ${order.orderNo} cancel ho gaya. Stock wapas aa gaya.`));
                onClose();
              } catch (e) {
                setError(e instanceof Error ? e.message : tr('Something went wrong. Please try again.', 'Kuch gadbad hui. Phir se try karo.'));
                setBusy(false);
              }
            }}
          >
            {busy ? tr('Cancelling…', 'Cancel ho raha hai…') : tr('Cancel order', 'Order cancel karo')}
          </Button>
        </>
      }
    >
      {error && <ErrorBanner>{error}</ErrorBanner>}
      <p style={{ margin: 0, fontFamily: font.body, fontSize: 14, color: color.inkSecondary }}>
        {order.memberName}
        {tr('’s order for ', ' ka ')}
        <strong style={{ color: color.ink }}>{formatINR(order.totalP)}</strong>
        {tr(' will be cancelled. ', ' ka order cancel hoga. ')}
        <strong style={{ color: color.ink }}>{tr('The items go back into stock', 'Saaman wapas stock mein jayega')}</strong>
        {tr(', and ', ', aur ')}
        {order.memberName}
        {tr(' sees “Cancelled” in the app. This cannot be undone.', ' ko app mein “Cancelled” dikhega. Yeh wapas nahi hoga.')}
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
            ? tr(
                `Added 10 to ${saved.name}${choice ? ` · ${choice}` : ''}. ${saved.stock} in stock now.`,
                `${saved.name}${choice ? ` · ${choice}` : ''} mein 10 jode. Ab ${saved.stock} stock mein.`,
              )
            : saved.active
              ? tr(`${saved.name} is shown in the app again.`, `${saved.name} app mein phir se dikh raha hai.`)
              : tr(`${saved.name} is hidden from the app.`, `${saved.name} app se chhupa diya.`),
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
        flash(tr(`Photo added to ${saved.name}. Members see it in the app now.`, `${saved.name} ki photo lag gayi. Members ab app mein dekh sakte hain.`));
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
            ? tr(`${products.length} products · ${shown} shown in the app`, `${products.length} products · ${shown} app mein dikh rahe`)
            : tr('Loading your products…', 'Aapke products load ho rahe hain…')}
        </div>
        <Button onClick={() => setEditing('new')}>{tr('+ Add product', '+ Product jodo')}</Button>
      </Row>

      <div style={{ height: space.lg }} />
      {error && <ErrorBanner>{error}</ErrorBanner>}

      {products && products.length === 0 ? (
        <Card>
          <EmptyState
            title={tr('No products yet', 'Abhi koi product nahi')}
            body={tr(
              'Add what you sell at the desk — protein, shakers, T-shirts — and members can order it in the app.',
              'Desk par jo bechte hain woh jodo — protein, shakers, T-shirts — members app mein order kar sakte hain.',
            )}
            action={<Button onClick={() => setEditing('new')}>{tr('+ Add product', '+ Product jodo')}</Button>}
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
                ? tr(`${saved.name} deleted.`, `${saved.name} hata diya.`)
                : verb === 'added'
                  ? tr(`${saved.name} added to the shop.`, `${saved.name} Shop mein jud gaya.`)
                  : tr(`${saved.name} saved.`, `${saved.name} save ho gaya.`),
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
        aria-label={tr(`Edit ${p.name}`, `${p.name} badlo`)}
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
            {p.options.length > 0 && ` · ${p.options.length} ${(p.optionName ?? tr('choices', 'choices')).toLowerCase()}s`}
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
            {!p.active && <Pill tone="warn">{tr('Hidden', 'Chhupa hua')}</Pill>}
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
        <SmallButton onClick={onRestock} disabled={busy} label={tr(`Add 10 to stock, ${p.name}`, `${p.name} ke stock mein 10 jodo`)}>
          {tr('+10 stock', '+10 stock')}
        </SmallButton>
        <SmallButton
          onClick={onToggle}
          disabled={busy}
          label={p.active ? tr(`Hide ${p.name}`, `${p.name} chhupao`) : tr(`Show ${p.name}`, `${p.name} dikhao`)}
        >
          {p.active ? tr('Hide from app', 'App se chhupao') : tr('Show in app', 'App mein dikhao')}
        </SmallButton>
        {!p.imageUrl && (
          <SmallButton onClick={() => fileRef.current?.click()} disabled={busy} label={tr(`Add a photo of ${p.name}`, `${p.name} ki photo lagao`)}>
            {uploading ? tr('Uploading…', 'Upload ho raha hai…') : tr('Add photo', 'Photo lagao')}
          </SmallButton>
        )}
        <SmallButton onClick={onEdit} disabled={busy} label={tr(`Edit ${p.name}`, `${p.name} badlo`)} span={!p.imageUrl ? 1 : 2}>
          {tr('Edit', 'Badlo')}
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
