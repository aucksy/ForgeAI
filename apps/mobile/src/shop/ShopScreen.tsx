/**
 * The Shop tab. Three faces:
 *  - Not joined (S2): "Your gym's shop" — the code from the gym and the member's name, Join; and a
 *    quiet "See a sample shop".
 *  - Joined (S2): the gym's own products (member_products), titled with the gym's name, category
 *    chips, a 2-column grid, the bag top right, My orders, pull to refresh, and the gym row with
 *    Leave at the bottom. The last good list is kept, so the tab opens at once and reads offline.
 *  - The sample shop (S1): the demo catalog, clearly labelled, its orders pretend and on the phone.
 */
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, Pressable, RefreshControl, ScrollView, Text, TextInput, View, useWindowDimensions } from 'react-native';

import { Card, Chip, GhostButton, PrimaryButton, Screen, askConfirm } from '@/components/ui';
import { InlineError } from '@/components/ui/InlineError';
import { CHIP_TOUCH_SLOP } from '@/components/ui/Chip';
import { PressScale } from '@/components/ui/PressScale';
import { getProfile } from '@/db/repos/userRepo';
import { color, radius, space, type } from '@/theme/tokens';

import { SHOP_CATEGORIES, getCatalog } from './catalog';
import { JOIN_CODE_LENGTH, cleanJoinCode } from './gym';
import { joinGym, leaveGym, refreshOrders, refreshProducts } from './gymActions';
import { useGymShop } from './gymStore';
import { bagBadgeCount, cardPriceText, isOutOfStock } from './money';
import { ProductArt } from './ProductArt';
import { BagButton, DEMO_SHOP_LINE, DemoNote, MyOrdersRow, QuietLine, shopInputStyle } from './ShopParts';
import { useGymHydrated } from './shopSource';
import { useShop } from './shopStore';
import type { GymLink, Product, ShopCategory } from './types';

type Filter = 'all' | ShopCategory;

export function ShopScreen() {
  const hydrated = useGymHydrated();
  const link = useGymShop((s) => s.link);
  const sampleOpen = useGymShop((s) => s.sampleOpen);
  if (!hydrated) return <Screen key="wait" title="Shop" />;
  if (link) return <GymShop key={`gym-${link.memberId}`} link={link} />;
  if (sampleOpen) return <SampleShop key="sample" />;
  return <JoinShop key="join" />;
}

// ------------------------------------------------------------------ not joined: the join card

function JoinShop() {
  const notice = useGymShop((s) => s.notice);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameTouched = useRef(false);
  const nameBox = useRef<TextInput>(null);

  // Start the name from the member's profile, unless they have already typed one.
  useEffect(() => {
    let live = true;
    getProfile()
      .then((p) => {
        if (live && !nameTouched.current && p.name) setName(p.name);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  const onJoin = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const words = await joinGym(code, name);
    // On success this card is gone (the store now holds the link); only a failure comes back here.
    setBusy(false);
    setError(words);
  };

  return (
    <Screen title="Shop">
      {notice ? (
        <View style={{ marginBottom: space.md }}>
          <DemoNote text={notice} />
        </View>
      ) : null}
      <Card style={{ gap: space.lg }}>
        <View style={{ gap: space.xs }}>
          <Text accessibilityRole="header" style={{ fontFamily: type.heading, fontSize: type.size.h3, color: color.ink }}>
            Your gym's shop
          </Text>
          <Text style={{ fontFamily: type.body, fontSize: type.size.sub, color: color.inkSecondary, lineHeight: 20 }}>
            Order shakes, supplements and gear from your gym, and pay at the desk when you collect.
          </Text>
        </View>

        <View>
          <Text style={labelStyle}>Enter the code from your gym</Text>
          <TextInput
            value={code}
            onChangeText={(t) => {
              setCode(cleanJoinCode(t));
              setError(null);
            }}
            autoCapitalize="characters"
            autoCorrect={false}
            autoComplete="off"
            spellCheck={false}
            returnKeyType="next"
            onSubmitEditing={() => nameBox.current?.focus()}
            submitBehavior="submit"
            placeholder={`${JOIN_CODE_LENGTH} letters or numbers`}
            placeholderTextColor={color.inkFaint}
            accessibilityLabel="Gym code"
            accessibilityHint={`The ${JOIN_CODE_LENGTH} letters and numbers your gym gave you`}
            style={[shopInputStyle, { fontFamily: type.monoBold, letterSpacing: 2 }]}
          />
        </View>

        <View>
          <Text style={labelStyle}>Your name</Text>
          <TextInput
            ref={nameBox}
            value={name}
            onChangeText={(t) => {
              nameTouched.current = true;
              setName(t.slice(0, 70));
              setError(null);
            }}
            autoCapitalize="words"
            autoComplete="name"
            returnKeyType="go"
            onSubmitEditing={() => void onJoin()}
            placeholder="So the desk knows whose order it is"
            placeholderTextColor={color.inkFaint}
            accessibilityLabel="Name on your orders"
            style={shopInputStyle}
          />
        </View>

        <InlineError message={error} />
        <PrimaryButton label="Join" accessibilityLabel="Join your gym's shop" onPress={() => void onJoin()} loading={busy} />
      </Card>

      <Pressable
        onPress={() => useGymShop.getState().setSampleOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="See a sample shop"
        style={({ pressed }) => ({ marginTop: space.lg, minHeight: 48, alignSelf: 'center', justifyContent: 'center', paddingHorizontal: space.md, opacity: pressed ? 0.6 : 1 })}
      >
        <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.body, color: color.accent, textAlign: 'center' }}>See a sample shop</Text>
      </Pressable>
    </Screen>
  );
}

const labelStyle = { fontFamily: type.bodySemi, fontSize: type.size.sub, color: color.inkSecondary, marginBottom: space.xs } as const;

// ------------------------------------------------------------------ joined: the gym's own shop

function GymShop({ link }: { link: GymLink }) {
  const router = useRouter();
  const products = useGymShop((s) => s.products);
  const hasList = useGymShop((s) => s.productsAt != null);
  const bag = useGymShop((s) => s.bag);
  const orderCount = useGymShop((s) => s.orders.length);
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
    const [words] = await Promise.all([refreshProducts(), refreshOrders()]);
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

  const onLeave = async () => {
    const ok = await askConfirm({
      title: `Leave ${link.gymName}'s shop?`,
      body: 'Your bag on this phone is emptied. Orders you placed stay with the gym. You can join again with the code.',
      confirmLabel: 'Leave shop',
      cancelLabel: 'Stay',
      destructive: true,
    });
    if (ok) await leaveGym();
  };

  return (
    <Screen
      title={link.gymName}
      subtitle="Your gym's shop · pay at the desk"
      scroll={false}
      noPad
      right={<BagButton count={bagBadgeCount(bag)} onPress={() => router.push('/shop/bag')} />}
    >
      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: space.screenX, paddingBottom: space.xxl }}
        refreshControl={
          <RefreshControl refreshing={pulling} onRefresh={() => void refresh(true)} colors={[color.accent]} tintColor={color.accent} progressBackgroundColor={color.surfaceRaised} />
        }
      >
        {!hasList && loading ? (
          <View accessibilityLiveRegion="polite" style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.lg }}>
            <ActivityIndicator color={color.accent} />
            <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.body, color: color.inkSecondary }}>Loading the shop…</Text>
          </View>
        ) : null}
        {!hasList && !loading && problem ? (
          <View style={{ gap: space.md, paddingVertical: space.lg }}>
            <InlineError message={problem} />
            <GhostButton label="Try again" onPress={() => void refresh(false)} />
          </View>
        ) : null}
        {hasList && problem ? <QuietLine text={problem} /> : null}

        <MyOrdersRow count={orderCount} onPress={() => router.push('/shop/orders')} />
        {hasList ? <ProductGrid products={products} filter={filter} onFilter={setFilter} onOpen={(id) => router.push({ pathname: '/shop/[id]', params: { id } })} emptyText="Your gym has nothing in its shop yet." /> : null}

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
            accessibilityRole="button"
            accessibilityLabel={`Leave ${link.gymName}'s shop`}
            style={({ pressed }) => ({ minHeight: 48, minWidth: 48, justifyContent: 'center', paddingHorizontal: space.sm, opacity: pressed ? 0.6 : 1 })}
          >
            <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: color.inkSecondary }}>Leave</Text>
          </Pressable>
        </View>
      </ScrollView>
    </Screen>
  );
}

// ------------------------------------------------------------------ the sample shop (S1 demo)

function SampleShop() {
  const router = useRouter();
  const bag = useShop((s) => s.bag);
  const orderCount = useShop((s) => s.orders.length);
  const [filter, setFilter] = useState<Filter>('all');
  const close = useCallback(() => useGymShop.getState().setSampleOpen(false), []);

  // Android's Back closes the sample and shows the join card again (not the app).
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        close();
        return true;
      });
      return () => sub.remove();
    }, [close]),
  );

  return (
    <Screen title="Sample shop" onBack={close} right={<BagButton count={bagBadgeCount(bag)} onPress={() => router.push('/shop/bag')} />}>
      <DemoNote text={DEMO_SHOP_LINE} />
      <MyOrdersRow count={orderCount} onPress={() => router.push('/shop/orders')} />
      <ProductGrid products={getCatalog()} filter={filter} onFilter={setFilter} onOpen={(id) => router.push({ pathname: '/shop/[id]', params: { id } })} emptyText="Nothing here yet." />
      <View style={{ marginTop: space.xl }}>
        <GhostButton label="Join your gym's shop" onPress={close} />
      </View>
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
  const shown = useMemo(() => (filter === 'all' ? products : products.filter((p) => p.category === filter)), [products, filter]);
  // Only the categories this shop sells (the gym may not stock every kind).
  const chips = useMemo(() => SHOP_CATEGORIES.filter((c) => products.some((p) => p.category === c.id)), [products]);
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
            <Chip key={c.id} role="radio" label={c.label} selected={filter === c.id} onPress={() => onFilter(c.id)} />
          ))}
        </ScrollView>
      ) : null}

      <View style={{ marginTop: chips.length > 1 ? space.md - CHIP_TOUCH_SLOP : space.lg, gap }}>
        {rows.map((row) => (
          <View key={row.map((p) => p.id).join('|')} style={{ flexDirection: 'row', gap, alignItems: 'stretch' }}>
            {row.map((p) => (
              <ProductCard key={p.id} product={p} width={cardW} onPress={() => onOpen(p.id)} />
            ))}
          </View>
        ))}
        {shown.length === 0 ? (
          <Text style={{ fontFamily: type.body, fontSize: type.size.body, color: color.inkMuted, textAlign: 'center', marginTop: space.xl }}>{emptyText}</Text>
        ) : null}
      </View>
    </>
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
