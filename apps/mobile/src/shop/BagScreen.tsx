/**
 * The bag: each line with its picture, price and quantity; remove; the total.
 *  - Joined (S2): priced against the gym's live list (fetched again when the bag opens), and
 *    "Place order" sends it to the gym (member_place_order). Nothing is charged: pay at the desk.
 *  - Sample shop (S1): "Place demo order" makes a pretend order kept on the phone.
 */
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';

import { EmptyState, GhostButton, IconButton, PrimaryButton, Screen } from '@/components/ui';
import { InlineError } from '@/components/ui/InlineError';
import { color, radius, space, type } from '@/theme/tokens';

import { placeGymOrder, refreshProducts } from './gymActions';
import { displayName, itemsText, priceBag, rupees, type PricedLine } from './money';
import { ProductPicture } from './ProductPicture';
import { DEMO_ORDER_LINE, DemoNote, PAY_AT_DESK_LINE, QtyStepper, QuietLine, leave } from './ShopParts';
import { GymOnly } from './GymOnly';
import { useShopSource } from './shopSource';
import { useShop } from './shopStore';

/** R-77: only with a gym joined (GymOnly). */
export function BagScreen() {
  return (
    <GymOnly>
      <BagPage />
    </GymOnly>
  );
}

function BagPage() {
  const router = useRouter();
  const source = useShopSource();
  const gym = source.mode === 'gym';
  const bag = source.bag;
  const priced = priceBag(bag, source.products);
  const placeDemo = useShop((s) => s.placeOrder);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [stale, setStale] = useState<string | null>(null);

  // The gym's list may have moved since the shop was opened: price the bag against today's.
  useFocusEffect(
    useCallback(() => {
      if (!gym) return;
      let live = true;
      void refreshProducts().then((words) => {
        if (live) setStale(words);
      });
      return () => {
        live = false;
      };
    }, [gym]),
  );

  const onPlace = async () => {
    if (busy) return;
    setProblem(null);
    if (!gym) {
      if (placeDemo()) router.replace('/shop/orders');
      return;
    }
    setBusy(true);
    const r = await placeGymOrder();
    setBusy(false);
    if (r.ok) router.replace('/shop/orders');
    else setProblem(r.message);
  };

  return (
    <Screen title="Bag" subtitle={bag.length > 0 ? itemsText(priced.count) : undefined} onBack={() => leave(router, '/shop')}>
      {bag.length === 0 ? (
        <View>
          {problem ? (
            <View style={{ marginBottom: space.md }}>
              <InlineError message={problem} />
            </View>
          ) : null}
          <EmptyState icon="list" title="Your bag is empty" body="Add something from the shop and it shows here." />
          <GhostButton label="Browse the shop" onPress={() => leave(router, '/shop')} />
        </View>
      ) : (
        <View style={{ gap: space.md }}>
          {gym ? <QuietLine text={stale} /> : null}
          {priced.lines.map((l) => (
            <BagRow key={l.key} line={l} onQty={(q) => source.setQty(l.key, q)} onRemove={() => source.remove(l.key)} />
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

          {/* Review fix (S1): no "pay at the desk" on a demo order — a member could walk to the
              desk for an order the gym never got. The gym's own orders do reach the desk. */}
          <DemoNote text={gym ? PAY_AT_DESK_LINE : `${DEMO_ORDER_LINE}. Nothing is charged and nothing is kept for you yet.`} />
          <InlineError message={problem} />
          <PrimaryButton
            label={gym ? 'Place order' : 'Place demo order'}
            accessibilityLabel={gym ? `Place order, ${rupees(priced.totalP)}, pay at the desk` : undefined}
            onPress={() => void onPlace()}
            loading={busy}
            disabled={priced.count === 0}
          />
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
      {p ? <ProductPicture kind={p.art.kind} tint={p.options.find((o) => o.id === line.line.optionId)?.tint ?? p.art.tint} size={64} imageUrl={p.imageUrl} /> : null}
      <View style={{ flex: 1, gap: space.xs }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.sm }}>
          <Text style={{ flex: 1, fontFamily: type.bodySemi, fontSize: type.size.body, color: color.ink }}>{displayName(line.name)}</Text>
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
