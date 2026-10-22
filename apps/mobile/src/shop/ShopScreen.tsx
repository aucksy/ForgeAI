/**
 * The gym's tab (R-77, owner 22 Oct 2026: "the shop shouldn't be there if there is no gym active").
 *  - No gym joined: there is no tab (TrackerTabBar, shop/gymTab.ts); this address goes to Workout.
 *    Joining is in Settings → Your gym and the gym's own link (InviteScreen).
 *  - A gym joined, its shop not on (it lists nothing): "Gym" — My membership, the gym's messages
 *    (the bell), My orders when there are any, and the gym row with Leave at the bottom.
 *  - Its shop on (S2): the gym's own products (member_products) as well: category chips, a 2-column
 *    grid, the bag top right, pull to refresh. The last good list is kept, so the tab opens at once
 *    and reads offline.
 */
import { Redirect, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View, useWindowDimensions } from 'react-native';

import { Chip, GhostButton, Screen } from '@/components/ui';
import { InlineError } from '@/components/ui/InlineError';
import { CHIP_TOUCH_SLOP } from '@/components/ui/Chip';
import { PressScale } from '@/components/ui/PressScale';
import { GymBrandMark } from '@/components/GymBrandMark';
import { useGymTheme } from '@/theme/gymTheme';
import { color, radius, space, type } from '@/theme/tokens';
import { isBranded } from '@forgeai/theme';

import { SHOP_CATEGORIES } from './catalog';
import { listAgeText } from './gym';
import { refreshGymNow, refreshOrders, refreshProducts } from './gymActions';
import { askAndLeaveGym } from './leaveFlow';
import { useGymShop } from './gymStore';
import { bagBadgeCount, cardPriceText, displayName, isOutOfStock } from './money';
import { MembershipCard } from './MembershipCard';
import { OfferCard } from './OfferCard';
import { ProductPicture } from './ProductPicture';
import { BagButton, BellButton, MyOrdersRow, QuietLine } from './ShopParts';
import { unreadCount } from './inbox';
import { inboxFor, useGymInbox } from './inboxStore';
import { useGymHydrated } from './shopSource';
import type { GymLink, Product, ShopCategory } from './types';

type Filter = 'all' | ShopCategory;

export function ShopScreen() {
  const hydrated = useGymHydrated();
  const link = useGymShop((s) => s.link);
  if (!hydrated) return <Screen key="wait" title="" />;
  if (link) return <GymShop key={`gym-${link.memberId}`} link={link} />;
  // R-77: no gym, no shop (a Leave, or an old link to this tab): back to Workout.
  return <Redirect href="/workout" />;
}

/** C6-4: "Couldn't refresh — showing the last list. Prices and stock as of Mon 13 Oct, 7:10 pm." */
function withListAge(problem: string, age: string | null): string {
  return age ? `${problem} ${age}` : problem;
}

// ------------------------------------------------------------------ joined: the gym's own shop

function GymShop({ link }: { link: GymLink }) {
  const router = useRouter();
  const products = useGymShop((s) => s.products);
  const hasList = useGymShop((s) => s.productsAt != null);
  // R-77: the shop shows once the gym lists something (its owner turned it on in the admin app).
  const shopOn = products.length > 0;
  const tagline = shopOn ? "Your gym's shop · pay at the desk" : 'Your gym';
  const productsAt = useGymShop((s) => s.productsAt);
  const bag = useGymShop((s) => s.bag);
  const orderCount = useGymShop((s) => s.orders.length);
  const unread = useGymInbox((s) => unreadCount(inboxFor(s, link.memberId)));
  const [filter, setFilter] = useState<Filter>('all');
  const [loading, setLoading] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const running = useRef(false);

  const refresh = useCallback(async (byPull: boolean) => {
    if (running.current) return;
    running.current = true;
    if (byPull) setPulling(true);
    else setLoading(true);
    // Gym branding: the gym's name and look as they are now ride along (quiet on failure).
    // Gym messages: refreshGymNow also refreshes the inbox (the bell's count).
    const [words] = await Promise.all([refreshProducts(), refreshOrders(), refreshGymNow().catch(() => undefined)]);
    running.current = false;
    setProblem(words);
    setPulling(false);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refresh(false);
    }, [refresh]),
  );

  // Gym branding: a branded gym's page is "Shop" under the gym's own logo and name (as the
  // Workout and Profile tabs); an unbranded gym keeps its name as the title. Read from the look the
  // app is painted in (it can wait for a safe moment), so the title and the header mark agree.
  const look = useGymTheme((s) => s.look);
  const branded = look?.gymId === link.gymId && isBranded(look.brand);

  // UAT U-G1: Leave says what is still open and cancels the open orders first (leaveFlow.ts).
  const [leaving, setLeaving] = useState(false);
  const leavingNow = useRef(false);
  const onLeave = async () => {
    if (leavingNow.current) return;
    leavingNow.current = true;
    setLeaving(true);
    try {
      await askAndLeaveGym(branded);
    } finally {
      leavingNow.current = false;
      setLeaving(false);
    }
  };

  return (
    <Screen
      title={branded ? (shopOn ? 'Shop' : 'Gym') : link.gymName}
      subtitle={branded ? undefined : tagline}
      scroll={false}
      noPad
      right={
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          <BellButton count={unread} onPress={() => router.push('/shop/inbox')} />
          {shopOn ? <BagButton count={bagBadgeCount(bag, products)} onPress={() => router.push('/shop/bag')} /> : null}
        </View>
      }
    >
      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: space.screenX, paddingBottom: space.xxl }}
        refreshControl={
          <RefreshControl refreshing={pulling} onRefresh={() => void refresh(true)} colors={[color.accent]} tintColor={color.accent} progressBackgroundColor={color.surfaceRaised} />
        }
      >
        {branded ? (
          <View style={{ gap: space.xs, marginBottom: space.md }}>
            <GymBrandMark />
            <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.sub, color: color.inkSecondary }}>{tagline}</Text>
          </View>
        ) : null}
        {!hasList && loading ? (
          <View accessibilityLiveRegion="polite" style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.lg }}>
            <ActivityIndicator color={color.accent} />
            <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.body, color: color.inkSecondary }}>Loading…</Text>
          </View>
        ) : null}
        {!hasList && !loading && problem ? (
          <View style={{ gap: space.md, paddingVertical: space.lg }}>
            <InlineError message={problem} />
            <GhostButton label="Try again" onPress={() => void refresh(false)} />
          </View>
        ) : null}
        {hasList && problem ? <QuietLine text={withListAge(problem, listAgeText(productsAt, Date.now()))} /> : null}

        {/* #49 step 2: the gym's workout offer (hidden when there is none, or the server has none yet). */}
        <OfferCard link={link} />
        <MembershipCard link={link} />
        {/* R-77: the home-screen icon is offered in a pop-up right after joining (GymIconOffer.tsx). */}
        {shopOn || orderCount > 0 ? <MyOrdersRow count={orderCount} onPress={() => router.push('/shop/orders')} /> : null}
        {shopOn ? <ProductGrid products={products} filter={filter} onFilter={setFilter} onOpen={(id) => router.push({ pathname: '/shop/[id]', params: { id } })} emptyText="Your gym has nothing in its shop yet." /> : null}

        <View
          style={{
            marginTop: space.xxl,
            flexDirection: 'row',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: space.sm,
            paddingTop: space.md,
            borderTopWidth: 1,
            borderTopColor: color.border,
          }}
        >
          <Text style={{ flexShrink: 1, fontFamily: type.bodyMedium, fontSize: type.size.sub, color: color.inkMuted }}>{`Gym: ${link.gymName}`}</Text>
          <Pressable
            onPress={() => void onLeave()}
            disabled={leaving}
            accessibilityRole="button"
            accessibilityLabel={`Leave ${link.gymName}`}
            style={({ pressed }) => ({ minHeight: 48, minWidth: 48, justifyContent: 'center', paddingHorizontal: space.sm, opacity: pressed ? 0.6 : 1 })}
          >
            {leaving ? <ActivityIndicator color={color.inkSecondary} /> : <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: color.inkSecondary }}>Leave</Text>}
          </Pressable>
        </View>
      </ScrollView>
    </Screen>
  );
}

// ------------------------------------------------------------------ shared: chips and grid

function ProductGrid({
  products,
  filter,
  onFilter,
  onOpen,
  emptyText,
}: {
  products: readonly Product[];
  filter: Filter;
  onFilter: (f: Filter) => void;
  onOpen: (id: string) => void;
  emptyText: string;
}) {
  const { width } = useWindowDimensions();
  const gap = space.md;
  const cardW = Math.floor((width - space.screenX * 2 - gap) / 2);
  // Only the categories this shop sells (the gym may not stock every kind).
  const chips = useMemo(() => SHOP_CATEGORIES.filter((c) => products.some((p) => p.category === c.id)), [products]);
  // A chip whose last product went away (hidden by the gym) must not leave an empty grid behind.
  const active: Filter = filter !== 'all' && chips.length > 1 && chips.some((c) => c.id === filter) ? filter : 'all';
  const shown = useMemo(() => (active === 'all' ? products : products.filter((p) => p.category === active)), [products, active]);
  const rows: Product[][] = [];
  for (let i = 0; i < shown.length; i += 2) rows.push(shown.slice(i, i + 2));

  return (
    <>
      {chips.length > 1 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          accessibilityRole="radiogroup"
          style={{ marginTop: space.lg, marginHorizontal: -space.screenX }}
          contentContainerStyle={{ paddingHorizontal: space.screenX, gap: space.sm, paddingVertical: CHIP_TOUCH_SLOP }}
        >
          {[{ id: 'all' as const, label: 'All' }, ...chips].map((c) => (
            <Chip key={c.id} role="radio" label={c.label} selected={active === c.id} onPress={() => onFilter(c.id)} />
          ))}
        </ScrollView>
      ) : null}

      <View style={{ marginTop: chips.length > 1 ? space.md - CHIP_TOUCH_SLOP : space.lg, gap }}>
        {rows.map((row) => {
          // A row with a sold-out card keeps the stock line's room in both, so the prices line up.
          const stockLine = row.some(isOutOfStock);
          return (
            <View key={row.map((p) => p.id).join('|')} style={{ flexDirection: 'row', gap, alignItems: 'stretch' }}>
              {row.map((p) => (
                <ProductCard key={p.id} product={p} width={cardW} stockLine={stockLine} onPress={() => onOpen(p.id)} />
              ))}
            </View>
          );
        })}
        {shown.length === 0 ? (
          <Text style={{ fontFamily: type.body, fontSize: type.size.body, color: color.inkMuted, textAlign: 'center', marginTop: space.xl }}>{emptyText}</Text>
        ) : null}
      </View>
    </>
  );
}

/**
 * One card of the grid. Both cards in a row are the row's height (the row stretches them; the
 * card's surface grows to fill — PressScale puts the style on its inner view, so it needs the
 * flexGrow), the name sits under the picture and the price is pinned to the card's foot, so two
 * cards side by side line up at any font size even when one name takes two lines.
 */
function ProductCard({ product, width, stockLine, onPress }: { product: Product; width: number; stockLine: boolean; onPress: () => void }) {
  const out = isOutOfStock(product);
  const price = cardPriceText(product);
  return (
    <PressScale
      onPress={onPress}
      scaleTo={0.97}
      accessibilityRole="button"
      accessibilityLabel={`${product.name}, ${price}${out ? ', out of stock' : ''}`}
      style={{
        flexGrow: 1,
        width,
        borderRadius: radius.lg,
        backgroundColor: color.surface,
        borderWidth: 1,
        borderColor: color.border,
        padding: space.sm,
      }}
    >
      <View style={{ opacity: out ? 0.55 : 1 }}>
        <ProductPicture kind={product.art.kind} tint={product.art.tint} size={width - space.sm * 2} imageUrl={product.imageUrl} />
      </View>
      <View style={{ flexGrow: 1, paddingHorizontal: space.xs, paddingTop: space.sm, paddingBottom: space.xs, gap: 4 }}>
        <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: color.ink }}>{displayName(product.name)}</Text>
        <View style={{ marginTop: 'auto', gap: 4 }}>
          <Text style={{ fontFamily: type.monoBold, fontSize: type.size.body, color: out ? color.inkMuted : color.ink }}>{price}</Text>
          {stockLine ? (
            // Kept (empty) on the in-stock card beside a sold-out one: same height, prices level.
            <Text
              accessibilityElementsHidden={!out}
              importantForAccessibility={out ? 'auto' : 'no-hide-descendants'}
              style={{ fontFamily: type.bodySemi, fontSize: type.size.caption, color: color.inkMuted }}
            >
              {out ? 'Out of stock' : ' '}
            </Text>
          ) : null}
        </View>
      </View>
    </PressScale>
  );
}
