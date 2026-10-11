/**
 * One product (S1): its pictures, name, price, stock, description, options (flavour / size /
 * colour, each with its own price and stock when it has them), a quantity and "Add to bag".
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState, type ReactNode } from 'react';
import { ScrollView, Text, View, useWindowDimensions } from 'react-native';

import { Chip, EmptyState, GhostButton, PrimaryButton, Screen } from '@/components/ui';
import { CHIP_TOUCH_SLOP } from '@/components/ui/Chip';
import { color, space, type } from '@/theme/tokens';

import { findProduct, getCatalog } from './catalog';
import { bagBadgeCount, clampQty, defaultOptionId, lineKey, maxQty, picturesOf, rupees, stockFor, stockText, unitPriceP } from './money';
import { ProductArt } from './ProductArt';
import { BagButton, QtyStepper, leave } from './ShopParts';
import { useShop } from './shopStore';
import type { Product } from './types';

export function ProductScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = typeof params.id === 'string' ? params.id : '';
  const product = findProduct(getCatalog(), id);
  const bag = useShop((s) => s.bag);
  const back = () => leave(router, '/shop');
  const bagButton = <BagButton count={bagBadgeCount(bag)} onPress={() => router.push('/shop/bag')} />;

  if (!product) {
    return (
      <Screen title="Shop" onBack={back} right={bagButton}>
        <EmptyState icon="search" title="This product is not in the shop" body="It may have been taken off the shelf." />
      </Screen>
    );
  }
  return <ProductBody product={product} onBack={back} bagButton={bagButton} />;
}

function ProductBody({ product, onBack, bagButton }: { product: Product; onBack: () => void; bagButton: ReactNode }) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const picW = width - space.screenX * 2;
  const pictures = picturesOf(product);
  const pager = useRef<ScrollView>(null);
  const [page, setPage] = useState(0);
  const [optionId, setOptionId] = useState<string | null>(() => defaultOptionId(product));
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState<number | null>(null);
  const add = useShop((s) => s.add);
  const inBag = useShop((s) => s.bag.find((l) => lineKey(l.productId, l.optionId) === lineKey(product.id, optionId))?.qty ?? 0);

  const stock = stockFor(product, optionId);
  const room = Math.max(0, maxQty(product, optionId) - inBag);
  const shownQty = room > 0 ? clampQty(qty, room) : 1;
  const price = unitPriceP(product, optionId);

  const choose = (next: string) => {
    setOptionId(next);
    setQty(1);
    setAdded(null);
    const at = pictures.findIndex((p) => p.optionId === next);
    if (at >= 0) {
      setPage(at);
      pager.current?.scrollTo({ x: at * picW, animated: true });
    }
  };

  const onAdd = () => {
    const n = add(product.id, optionId, shownQty);
    setAdded(n);
    setQty(1);
  };

  return (
    <Screen title={product.name} onBack={onBack} right={bagButton}>
      <ScrollView
        ref={pager}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / Math.max(1, picW)))}
        style={{ width: picW }}
      >
        {pictures.map((p) => (
          <ProductArt key={p.key} kind={product.art.kind} tint={p.tint} size={picW} height={Math.round(picW * 0.75)} />
        ))}
      </ScrollView>
      {pictures.length > 1 ? (
        <View
          accessibilityLabel={`Picture ${page + 1} of ${pictures.length}`}
          style={{ flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: space.sm }}
        >
          {pictures.map((p, i) => (
            <View key={p.key} style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: i === page ? color.accent : color.borderStrong }} />
          ))}
        </View>
      ) : null}

      <Text style={{ marginTop: space.lg, fontFamily: type.monoBold, fontSize: type.size.h2, color: color.ink }}>{rupees(price)}</Text>
      <Text style={{ marginTop: 2, fontFamily: type.bodySemi, fontSize: type.size.sub, color: stock > 0 ? color.inkSecondary : color.inkMuted }}>
        {stockText(stock)}
      </Text>
      <Text style={{ marginTop: space.md, fontFamily: type.body, fontSize: type.size.body, color: color.inkSecondary, lineHeight: 22 }}>
        {product.description}
      </Text>

      {product.options.length > 0 ? (
        <View style={{ marginTop: space.xl }}>
          <Text accessibilityRole="header" style={{ fontFamily: type.heading, fontSize: type.size.sub, color: color.inkSecondary, marginBottom: space.sm }}>
            {product.optionName ?? 'Options'}
          </Text>
          <View
            accessibilityRole="radiogroup"
            style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, paddingVertical: CHIP_TOUCH_SLOP, marginVertical: -CHIP_TOUCH_SLOP }}
          >
            {product.options.map((o) => {
              const extra = o.priceP != null && o.priceP !== product.priceP ? ` · ${rupees(o.priceP)}` : '';
              const out = o.stock <= 0;
              return (
                <Chip
                  key={o.id}
                  role="radio"
                  label={`${o.label}${extra}${out ? ' · out of stock' : ''}`}
                  selected={optionId === o.id}
                  onPress={() => choose(o.id)}
                />
              );
            })}
          </View>
        </View>
      ) : null}

      {stock > 0 ? (
        <View style={{ marginTop: space.xl, gap: space.sm }}>
          <Text accessibilityRole="header" style={{ fontFamily: type.heading, fontSize: type.size.sub, color: color.inkSecondary }}>
            Quantity
          </Text>
          {room > 0 ? (
            <QtyStepper qty={shownQty} max={room} onChange={(q) => { setQty(q); setAdded(null); }} what={product.name} />
          ) : (
            <Text style={{ fontFamily: type.body, fontSize: type.size.sub, color: color.inkMuted }}>
              The most you can order of this is already in your bag.
            </Text>
          )}
        </View>
      ) : null}

      <View style={{ marginTop: space.xl, gap: space.md }}>
        <PrimaryButton
          label={stock > 0 ? 'Add to bag' : 'Out of stock'}
          accessibilityLabel={stock > 0 ? `Add ${shownQty} to bag, ${rupees(price * shownQty)}` : 'Out of stock'}
          onPress={onAdd}
          disabled={stock <= 0 || room <= 0}
        />
        {added != null ? (
          <View accessibilityLiveRegion="polite" style={{ gap: space.sm }}>
            <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: added > 0 ? color.goodText : color.inkMuted, textAlign: 'center' }}>
              {added > 0 ? `Added ${added} to your bag` : 'Nothing added — your bag already has the most you can order.'}
            </Text>
            {added > 0 ? <GhostButton label="Go to bag" onPress={() => router.push('/shop/bag')} /> : null}
          </View>
        ) : null}
      </View>
    </Screen>
  );
}
