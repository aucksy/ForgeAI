/**
 * My orders (S1): newest first, each with its items, total, status and when it was placed.
 * Every order today is a demo — it says so, and it can be cancelled any time before collection.
 */
import { useRouter } from 'expo-router';
import { Text, View } from 'react-native';

import { Badge, EmptyState, GhostButton, Screen, askConfirm } from '@/components/ui';
import { color, radius, space, type } from '@/theme/tokens';

import { ORDER_STATUS_TEXT, canCancel, itemsText, orderTimeText, rupees } from './money';
import { DEMO_ORDER_LINE, leave } from './ShopParts';
import { useShop } from './shopStore';
import type { Order } from './types';

const STATUS_TONE: Record<Order['status'], 'accent' | 'good' | 'neutral'> = {
  ordered: 'accent',
  ready: 'good',
  collected: 'neutral',
  cancelled: 'neutral',
};

export function OrdersScreen() {
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
    <Screen title="My orders" onBack={() => leave(router, '/shop')}>
      {orders.length === 0 ? (
        <View>
          <EmptyState icon="list" title="No orders yet" body="Orders you place in the shop show here." />
          <GhostButton label="Browse the shop" onPress={() => leave(router, '/shop')} />
        </View>
      ) : (
        <View style={{ gap: space.md }}>
          {orders.map((o) => (
            <View
              key={o.id}
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
                <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: color.inkSecondary }}>{orderTimeText(o.createdAt)}</Text>
                <Badge label={ORDER_STATUS_TEXT[o.status]} tone={STATUS_TONE[o.status]} />
              </View>
              {o.demo ? <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.caption, color: color.inkMuted }}>{DEMO_ORDER_LINE}</Text> : null}
              <View style={{ gap: 6, marginTop: space.xs }}>
                {o.lines.map((l) => (
                  <View key={`${l.productId}::${l.optionId ?? ''}`} style={{ flexDirection: 'row', gap: space.sm }}>
                    <Text style={{ flex: 1, fontFamily: type.body, fontSize: type.size.body, color: o.status === 'cancelled' ? color.inkMuted : color.ink }}>
                      {`${l.qty} × ${l.name}`}
                    </Text>
                    <Text style={{ fontFamily: type.mono, fontSize: type.size.body, color: color.inkSecondary }}>{rupees(l.unitPriceP * l.qty)}</Text>
                  </View>
                ))}
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingTop: space.sm, borderTopWidth: 1, borderTopColor: color.border }}>
                <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.body, color: color.ink }}>Total</Text>
                <Text style={{ fontFamily: type.monoBold, fontSize: type.size.h3, color: color.ink }}>{rupees(o.totalP)}</Text>
              </View>
              {o.status === 'ordered' ? (
                <Text style={{ fontFamily: type.body, fontSize: type.size.sub, color: color.inkMuted }}>Demo only: your gym does not see this order.</Text>
              ) : null}
              {canCancel(o) ? <GhostButton label="Cancel order" onPress={() => void onCancel(o)} /> : null}
            </View>
          ))}
        </View>
      )}
    </Screen>
  );
}
