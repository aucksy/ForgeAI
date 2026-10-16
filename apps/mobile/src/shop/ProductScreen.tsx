/**
 * One product (S1; S2 reads the gym's own list once joined — shopSource.ts): its pictures, name, price, stock, description, options (flavour / size /
 * colour, each with its own price and stock when it has them), a quantity and "Add to bag".
 */
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useRef, useState, type ReactNode } from 'react';
import { ScrollView, Text, View, useWindowDimensions } from 'react-native';

import { Chip, EmptyState, GhostButton, PrimaryButton, Screen } from '@/components/ui';
import { CHIP_TOUCH_SLOP } from '@/components/ui/Chip';
import { color, space, type } from '@/theme/tokens';

import { findProduct } from './catalog';
import { listAgeText } from './gym';
import { refreshProducts } from './gymActions';
import { useGymShop } from './gymStore';
import { bagBadgeCount, clampQty, defaultOptionId, displayName, lineKey, maxQty, picturesOf, rupees, stockFor, stockText, unitPriceP } from './money';
import { ProductPicture } from './ProductPicture';
import { BagButton, QtyStepper, leave } from './ShopParts';
import { useShopSource } from './shopSource';
import type { Product } from './types';

export function ProductScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = typeof params.id === 'string' ? params.id : '';
  const source = useShopSource();
  const product = findProduct(source.products, id);
  const bag = source.bag;
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
  // The gym's photo is one picture; the drawing has one per option colour (a flavour's tub).
  const pictures = product.imageUrl ? [{ key: 'photo', tint: product.art.tint, optionId: null }] : picturesOf(product);
  const pager = useRef<ScrollView>(null);
  const [page, setPage] = useState(0);
  const [optionId, setOptionId] = useState<string | null>(() => defaultOptionId(product));
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState<number | null>(null);
  const source = useShopSource();
  const add = source.add;
  const inBag = source.bag.find((l) => lineKey(l.productId, l.optionId) === lineKey(product.id, optionId))?.qty ?? 0;
  // C6-4: the gym's price and stock are asked again whenever this page comes into view, and a list
  // that could not be refreshed says how old it is.
  const gym = source.mode === 'gym';
  const productsAt = useGymShop((s) => s.productsAt);
  const listAge = gym ? listAgeText(productsAt, Date.now()) : null;
  useFocusEffect(
    useCallback(() => {
      if (!gym) return;
      void refreshProducts().catch((e: unknown) => console.warn('[ForgeErr] product page: list refresh', e));
    }, [gym]),
  );

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
    // The top bar carries only Back and the bag; the name gets its own full-width row under it, so a
    // long name (or a large font) never wraps in the narrow gap between the two round buttons.
    <Screen onBack={onBack} right={bagButton}>
      <Text
        accessibilityRole="header"
        accessibilityLabel={product.name}
        style={{ marginTop: -space.sm, marginBottom: space.lg, fontFamily: type.display, fontSize: type.size.h1, color: color.ink, letterSpacing: -0.5 }}
      >
        {displayName(product.name)}
      </Text>
      <ScrollView
        ref={pager}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / Math.max(1, picW)))}
        style={{ width: picW }}
      >
        {pictures.map((p) => (
          <ProductPicture key={p.key} kind={product.art.kind} tint={p.tint} size={picW} height={Math.round(picW * 0.75)} imageUrl={product.imageUrl} />
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
      {listAge ? (
        <Text style={{ marginTop: 2, fontFamily: type.body, fontSize: type.size.sub, color: color.inkMuted }}>{listAge}</Text>
      ) : null}
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
