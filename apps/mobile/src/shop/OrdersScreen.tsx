/**
 * My orders, newest first, each with its items, total, status and when it was placed.
 *  - Joined (S2): the gym's own record (member_orders), fetched when the page opens, on pull, and
 *    every 10 s while it is open — so "Ready — collect it at the desk" arrives while the member
 *    looks. Cancel only while Ordered (the server's rule); after that it is the desk's call.
 *  - Sample shop (S1): the pretend orders on the phone, each marked "Demo order".
 */
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';

import { Badge, EmptyState, GhostButton, Screen, askConfirm } from '@/components/ui';
import { InlineError } from '@/components/ui/InlineError';
import { useAnnounce } from '@/components/ui/useAnnounce';
import { color, radius, space, type } from '@/theme/tokens';

import { canCancelGymOrder, gymStatusBadge, gymStatusText } from './gym';
import { cancelGymOrder, refreshOrders } from './gymActions';
import { useGymShop } from './gymStore';
import { ORDER_STATUS_TEXT, canCancel, itemsText, orderTimeText, rupees } from './money';
import { DEMO_ORDER_LINE, QuietLine, leave } from './ShopParts';
import { useShop } from './shopStore';
import type { GymOrder, Order, OrderLine } from './types';

const STATUS_TONE: Record<Order['status'], 'accent' | 'good' | 'neutral'> = {
  ordered: 'accent',
  ready: 'good',
  collected: 'neutral',
  cancelled: 'neutral',
};

/** How often an open My orders asks the gym for news (ms). */
const POLL_MS = 10000;

export function OrdersScreen() {
  const joined = useGymShop((s) => s.link != null);
  return joined ? <GymOrders /> : <SampleOrders />;
}

// ------------------------------------------------------------------ the gym's own orders

function GymOrders() {
  const router = useRouter();
  const orders = useGymShop((s) => s.orders);
  // "Order 12 placed…" is said once, on the My orders the bag opened: read it here, clear it in
  // the store (state, not a cleanup, so React's double effect run in development keeps it).
  const [flash] = useState(() => useGymShop.getState().flash);
  useEffect(() => {
    useGymShop.getState().setFlash(null);
  }, []);
  // A line that is on screen when the page opens is not read by a live region: say it.
  useAnnounce(flash);
  const [pulling, setPulling] = useState(false);
  const [stale, setStale] = useState<string | null>(null);
  const [problems, setProblems] = useState<Record<string, string>>({});
  const [cancelling, setCancelling] = useState<string | null>(null);
  const running = useRef(false);

  const refresh = useCallback(async (byPull: boolean) => {
    if (running.current) return;
    running.current = true;
    if (byPull) setPulling(true);
    const words = await refreshOrders();
    running.current = false;
    setStale(words);
    setPulling(false);
  }, []);

  // On open, then every 10 s while this page is the one on screen.
  useFocusEffect(
    useCallback(() => {
      void refresh(false);
      const t = setInterval(() => void refresh(false), POLL_MS);
      return () => clearInterval(t);
    }, [refresh]),
  );

  const onCancel = async (o: GymOrder) => {
    const ok = await askConfirm({
      title: 'Cancel this order?',
      body: `Order ${o.orderNo} · ${itemsText(o.lines.reduce((s, l) => s + l.qty, 0))} · ${rupees(o.totalP)}`,
      confirmLabel: 'Cancel order',
      cancelLabel: 'Keep order',
      destructive: true,
    });
    if (!ok) return;
    setCancelling(o.id);
    const words = await cancelGymOrder(o.id);
    setCancelling(null);
    setProblems((p) => {
      const next = { ...p };
      if (words) next[o.id] = words;
      else delete next[o.id];
      return next;
    });
  };

  return (
    <Screen title="My orders" onBack={() => leave(router, '/shop')} scroll={false} noPad>
      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: space.screenX, paddingBottom: space.xxl, gap: space.md }}
        refreshControl={
          <RefreshControl refreshing={pulling} onRefresh={() => void refresh(true)} colors={[color.accent]} tintColor={color.accent} progressBackgroundColor={color.surfaceRaised} />
        }
      >
        {flash ? (
          <View
            style={{ padding: space.md, borderRadius: radius.md, backgroundColor: 'rgba(61, 203, 108, 0.12)', borderWidth: 1, borderColor: 'rgba(61, 203, 108, 0.35)' }}
          >
            <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.body, color: color.goodText, lineHeight: 22 }}>{flash}</Text>
          </View>
        ) : null}
        <QuietLine text={stale} />
        {orders.length === 0 ? (
          <View>
            <EmptyState icon="list" title="No orders yet" body="Orders you place in your gym's shop show here." />
            <GhostButton label="Browse the shop" onPress={() => leave(router, '/shop')} />
          </View>
        ) : (
          orders.map((o) => (
            <OrderCard
              key={o.id}
              title={`Order ${o.orderNo}`}
              when={orderTimeText(o.createdAt)}
              badge={gymStatusBadge(o)}
              tone={STATUS_TONE[o.status]}
              sentence={gymStatusText(o)}
              lines={o.lines}
              totalP={o.totalP}
              cancelled={o.status === 'cancelled'}
              foot={o.status === 'ordered' || o.status === 'ready' ? 'Pay at the desk when you collect it.' : null}
            >
              <InlineError message={problems[o.id] ?? null} />
              {canCancelGymOrder(o) ? (
                <GhostButton
                  label={cancelling === o.id ? 'Cancelling…' : 'Cancel order'}
                  accessibilityLabel={cancelling === o.id ? `Cancelling order ${o.orderNo}` : `Cancel order ${o.orderNo}`}
                  onPress={() => {
                    if (cancelling == null) void onCancel(o);
                  }}
                />
              ) : null}
            </OrderCard>
          ))
        )}
      </ScrollView>
    </Screen>
  );
}

// ------------------------------------------------------------------ the sample shop's demo orders

function SampleOrders() {
  const router = useRouter();
  const orders = useShop((s) => s.orders);
  const cancelOrder = useShop((s) => s.cancelOrder);

  const onCancel = async (o: Order) => {
    const ok = await askConfirm({
      title: 'Cancel this order?',
      body: `${itemsText(o.lines.reduce((s, l) => s + l.qty, 0))} · ${rupees(o.totalP)}`,
      confirmLabel: 'Cancel order',
      cancelLabel: 'Keep order',
      destructive: true,
    });
    if (ok) cancelOrder(o.id);
  };

  return (
    <Screen title="My orders" subtitle="Sample shop" onBack={() => leave(router, '/shop')}>
      {orders.length === 0 ? (
        <View>
          <EmptyState icon="list" title="No orders yet" body="Orders you place in the sample shop show here." />
          <GhostButton label="Browse the shop" onPress={() => leave(router, '/shop')} />
        </View>
      ) : (
        <View style={{ gap: space.md }}>
          {orders.map((o) => (
            <OrderCard
              key={o.id}
              title={null}
              when={orderTimeText(o.createdAt)}
              badge={ORDER_STATUS_TEXT[o.status]}
              tone={STATUS_TONE[o.status]}
              sentence={null}
              demoLine={o.demo ? DEMO_ORDER_LINE : null}
              lines={o.lines}
              totalP={o.totalP}
              cancelled={o.status === 'cancelled'}
              foot={o.status === 'ordered' ? 'Demo only: your gym does not see this order.' : null}
            >
              {canCancel(o) ? <GhostButton label="Cancel order" onPress={() => void onCancel(o)} /> : null}
            </OrderCard>
          ))}
        </View>
      )}
    </Screen>
  );
}

// ------------------------------------------------------------------ one order card

function OrderCard({
  title,
  when,
  badge,
  tone,
  sentence,
  demoLine = null,
  lines,
  totalP,
  cancelled,
  foot,
  children,
}: {
  title: string | null;
  when: string;
  badge: string;
  tone: 'accent' | 'good' | 'neutral';
  sentence: string | null;
  demoLine?: string | null;
  lines: OrderLine[];
  totalP: number;
  cancelled: boolean;
  foot: string | null;
  children?: ReactNode;
}) {
  return (
    <View
      style={{
        padding: space.lg,
        borderRadius: radius.lg,
        backgroundColor: color.surface,
        borderWidth: 1,
        borderColor: color.border,
        gap: space.sm,
      }}
    >
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: space.sm }}>
        <View style={{ flexShrink: 1, gap: 2 }}>
          {title ? <Text style={{ fontFamily: type.heading, fontSize: type.size.h3, color: color.ink }}>{title}</Text> : null}
          <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: color.inkSecondary }}>{when}</Text>
        </View>
        <Badge label={badge} tone={tone} />
      </View>
      {sentence ? (
        <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.body, color: tone === 'good' ? color.goodText : tone === 'accent' ? color.accentBright : color.inkSecondary, lineHeight: 22 }}>
          {sentence}
        </Text>
      ) : null}
      {demoLine ? <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.caption, color: color.inkMuted }}>{demoLine}</Text> : null}
      <View style={{ gap: 6, marginTop: space.xs }}>
        {lines.map((l, i) => (
          <View key={`${l.productId}::${l.optionId ?? ''}::${i}`} style={{ flexDirection: 'row', gap: space.sm }}>
            <Text style={{ flex: 1, fontFamily: type.body, fontSize: type.size.body, color: cancelled ? color.inkMuted : color.ink }}>{`${l.qty} × ${l.name}`}</Text>
            <Text style={{ fontFamily: type.mono, fontSize: type.size.body, color: color.inkSecondary }}>{rupees(l.unitPriceP * l.qty)}</Text>
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'baseline', gap: space.sm, paddingTop: space.sm, borderTopWidth: 1, borderTopColor: color.border }}>
        <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.body, color: color.ink }}>Total</Text>
        <Text style={{ fontFamily: type.monoBold, fontSize: type.size.h3, color: color.ink }}>{rupees(totalP)}</Text>
      </View>
      {foot ? <Text style={{ fontFamily: type.body, fontSize: type.size.sub, color: color.inkMuted }}>{foot}</Text> : null}
      {children}
    </View>
  );
}
