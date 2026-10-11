/**
 * The Shop tab (S1, PLAN §7 "Now"): the calm demo line, category chips, a 2-column grid of
 * products, the bag top right and "My orders". Products come only from `getCatalog()`.
 */
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, Text, View, useWindowDimensions } from 'react-native';

import { Chip, Icon, Screen } from '@/components/ui';
import { CHIP_TOUCH_SLOP } from '@/components/ui/Chip';
import { PressScale } from '@/components/ui/PressScale';
import { color, radius, space, type } from '@/theme/tokens';

import { SHOP_CATEGORIES, getCatalog, isDemoCatalog } from './catalog';
import { bagBadgeCount, cardPriceText, isOutOfStock } from './money';
import { ProductArt } from './ProductArt';
import { BagButton, DEMO_SHOP_LINE, DemoNote } from './ShopParts';
import { useShop } from './shopStore';
import type { Product, ShopCategory } from './types';

type Filter = 'all' | ShopCategory;

export function ShopScreen() {
  const router = useRouter();
  const bag = useShop((s) => s.bag);
  const orderCount = useShop((s) => s.orders.length);
  const [filter, setFilter] = useState<Filter>('all');
  const { width } = useWindowDimensions();
  const gap = space.md;
  const cardW = Math.floor((width - space.screenX * 2 - gap) / 2);

  const catalog = getCatalog();
  const shown = useMemo(() => (filter === 'all' ? catalog : catalog.filter((p) => p.category === filter)), [catalog, filter]);
  const rows: Product[][] = [];
  for (let i = 0; i < shown.length; i += 2) rows.push(shown.slice(i, i + 2));

  return (
    <Screen title="Shop" right={<BagButton count={bagBadgeCount(bag)} onPress={() => router.push('/shop/bag')} />}>
      {isDemoCatalog() ? <DemoNote text={DEMO_SHOP_LINE} /> : null}

      <PressScale
        onPress={() => router.push('/shop/orders')}
        accessibilityRole="button"
        accessibilityLabel={orderCount > 0 ? `My orders, ${orderCount}` : 'My orders'}
        style={{
          marginTop: space.md,
          minHeight: 48,
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.md,
          paddingHorizontal: space.md,
          paddingVertical: space.sm,
          borderRadius: radius.md,
          backgroundColor: color.surface,
          borderWidth: 1,
          borderColor: color.border,
        }}
      >
        <Icon name="list" size={18} color={color.inkSecondary} />
        <Text style={{ flex: 1, fontFamily: type.bodySemi, fontSize: type.size.body, color: color.ink }}>My orders</Text>
        {orderCount > 0 ? <Text style={{ fontFamily: type.mono, fontSize: type.size.sub, color: color.inkMuted }}>{orderCount}</Text> : null}
        <Icon name="chevron-right" size={18} color={color.inkMuted} />
      </PressScale>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        accessibilityRole="radiogroup"
        style={{ marginTop: space.lg, marginHorizontal: -space.screenX }}
        contentContainerStyle={{ paddingHorizontal: space.screenX, gap: space.sm, paddingVertical: CHIP_TOUCH_SLOP }}
      >
        {[{ id: 'all' as const, label: 'All' }, ...SHOP_CATEGORIES].map((c) => (
          <Chip key={c.id} role="radio" label={c.label} selected={filter === c.id} onPress={() => setFilter(c.id)} />
        ))}
      </ScrollView>

      <View style={{ marginTop: space.md - CHIP_TOUCH_SLOP, gap }}>
        {rows.map((row) => (
          <View key={row.map((p) => p.id).join('|')} style={{ flexDirection: 'row', gap, alignItems: 'stretch' }}>
            {row.map((p) => (
              <ProductCard key={p.id} product={p} width={cardW} onPress={() => router.push({ pathname: '/shop/[id]', params: { id: p.id } })} />
            ))}
          </View>
        ))}
        {shown.length === 0 ? (
          <Text style={{ fontFamily: type.body, fontSize: type.size.body, color: color.inkMuted, textAlign: 'center', marginTop: space.xl }}>
            Nothing here yet.
          </Text>
        ) : null}
      </View>
    </Screen>
  );
}

function ProductCard({ product, width, onPress }: { product: Product; width: number; onPress: () => void }) {
  const out = isOutOfStock(product);
  const price = cardPriceText(product);
  return (
    <PressScale
      onPress={onPress}
      scaleTo={0.97}
      accessibilityRole="button"
      accessibilityLabel={`${product.name}, ${price}${out ? ', out of stock' : ''}`}
      style={{
        width,
        borderRadius: radius.lg,
        backgroundColor: color.surface,
        borderWidth: 1,
        borderColor: color.border,
        padding: space.sm,
      }}
    >
      <View style={{ opacity: out ? 0.55 : 1 }}>
        <ProductArt kind={product.art.kind} tint={product.art.tint} size={width - space.sm * 2} />
      </View>
      <View style={{ paddingHorizontal: space.xs, paddingTop: space.sm, paddingBottom: space.xs, gap: 4 }}>
        <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: color.ink }}>{product.name}</Text>
        <Text style={{ fontFamily: type.monoBold, fontSize: type.size.body, color: out ? color.inkMuted : color.ink }}>{price}</Text>
        {out ? <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.caption, color: color.inkMuted }}>Out of stock</Text> : null}
      </View>
    </PressScale>
  );
}
