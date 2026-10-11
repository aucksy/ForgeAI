/**
 * The bag (S1): each line with its picture, price and quantity; remove; the total; and
 * "Place demo order", which makes a demo order (kept on the phone, never sent).
 */
import { useRouter } from 'expo-router';
import { Text, View } from 'react-native';

import { EmptyState, GhostButton, IconButton, PrimaryButton, Screen } from '@/components/ui';
import { color, radius, space, type } from '@/theme/tokens';

import { getCatalog } from './catalog';
import { itemsText, priceBag, rupees, type PricedLine } from './money';
import { ProductArt } from './ProductArt';
import { DEMO_ORDER_LINE, DemoNote, QtyStepper, leave } from './ShopParts';
import { useShop } from './shopStore';

export function BagScreen() {
  const router = useRouter();
  const bag = useShop((s) => s.bag);
  const setQty = useShop((s) => s.setQty);
  const remove = useShop((s) => s.remove);
  const placeOrder = useShop((s) => s.placeOrder);
  const priced = priceBag(bag, getCatalog());

  const onPlace = () => {
    const order = placeOrder();
    if (order) router.replace('/shop/orders');
  };

  return (
    <Screen title="Bag" subtitle={bag.length > 0 ? itemsText(priced.count) : undefined} onBack={() => leave(router, '/shop')}>
      {bag.length === 0 ? (
        <View>
          <EmptyState icon="list" title="Your bag is empty" body="Add something from the shop and it shows here." />
          <GhostButton label="Browse the shop" onPress={() => leave(router, '/shop')} />
        </View>
      ) : (
        <View style={{ gap: space.md }}>
          {priced.lines.map((l) => (
            <BagRow key={l.key} line={l} onQty={(q) => setQty(l.key, q)} onRemove={() => remove(l.key)} />
          ))}

          <View
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              gap: space.sm,
              marginTop: space.md,
              paddingTop: space.md,
              borderTopWidth: 1,
              borderTopColor: color.border,
            }}
          >
            <Text style={{ fontFamily: type.heading, fontSize: type.size.h3, color: color.ink }}>Total</Text>
            <Text style={{ fontFamily: type.monoBold, fontSize: type.size.h2, color: color.ink }}>{rupees(priced.totalP)}</Text>
          </View>

          {/* Review fix: no "pay at the desk" while orders are demos — a member could walk to the
              desk for an order the gym never got. */}
          <DemoNote text={`${DEMO_ORDER_LINE}. Nothing is charged and nothing is kept for you yet.`} />
          <PrimaryButton label="Place demo order" onPress={onPlace} disabled={priced.count === 0} />
          <GhostButton label="My orders" onPress={() => router.push('/shop/orders')} />
        </View>
      )}
    </Screen>
  );
}

function BagRow({ line, onQty, onRemove }: { line: PricedLine; onQty: (q: number) => void; onRemove: () => void }) {
  const p = line.product;
  return (
    <View
      style={{
        flexDirection: 'row',
        gap: space.md,
        padding: space.md,
        borderRadius: radius.lg,
        backgroundColor: color.surface,
        borderWidth: 1,
        borderColor: color.border,
      }}
    >
      {p ? <ProductArt kind={p.art.kind} tint={p.options.find((o) => o.id === line.line.optionId)?.tint ?? p.art.tint} size={64} /> : null}
      <View style={{ flex: 1, gap: space.xs }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.sm }}>
          <Text style={{ flex: 1, fontFamily: type.bodySemi, fontSize: type.size.body, color: color.ink }}>{line.name}</Text>
          <IconButton icon="trash" size={36} onPress={onRemove} accessibilityLabel={`Remove ${line.name} from bag`} tint={color.inkSecondary} />
        </View>
        {line.available ? (
          <>
            <Text style={{ fontFamily: type.body, fontSize: type.size.sub, color: color.inkMuted }}>{`${rupees(line.unitPriceP)} each`}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: space.sm, marginTop: space.xs }}>
              <QtyStepper qty={line.qty} max={line.max} onChange={onQty} what={line.name} />
              <Text style={{ fontFamily: type.monoBold, fontSize: type.size.body, color: color.ink }}>{rupees(line.lineTotalP)}</Text>
            </View>
          </>
        ) : (
          <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: color.inkMuted }}>
            {p ? 'Out of stock now — not in the total' : 'No longer sold — not in the total'}
          </Text>
        )}
      </View>
    </View>
  );
}
