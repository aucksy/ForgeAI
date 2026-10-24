/**
 * The Gym tab (Release A, docs/ux/MEMBER-APP-MAP.md §3.1–3.2, A1–A4). Always there, always "Gym".
 *  - No gym joined: one "Join your gym" screen (`JoinGymDoor`): the code box, "Scan the poster", what a
 *    gym in the app gives you, and "No gym? Everything else works without one." No locked rows.
 *  - A gym joined: the gym's home, most-used first: My membership, Check in (the phone's camera reads
 *    the poster), the gym's workout offer, My orders when there are any, and the gym's shop once it
 *    lists something (category chips, a 2-column grid, the bag top right). The bell (gym messages)
 *    stays top right. The last good product list is kept, so the tab opens at once and reads offline.
 *    Leaving the gym lives in Settings → Your gym only (A4).
 */
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View, useWindowDimensions } from 'react-native';

import { JoinGymCard } from '@/components/settings/JoinGymCard';
import { LinkRow } from '@/components/stats/parts';
import { Card, Chip, GhostButton, Icon, Screen, type IconName } from '@/components/ui';
import { InlineError } from '@/components/ui/InlineError';
import { CHIP_TOUCH_SLOP } from '@/components/ui/Chip';
import { PressScale } from '@/components/ui/PressScale';
import { GymBrandMark } from '@/components/GymBrandMark';
import { dismissHint, hintDue, HINT_TEXT } from '@/lib/layoutHints';
import { useGymTheme } from '@/theme/gymTheme';
import { color, radius, space, type } from '@/theme/tokens';
import { isBranded } from '@forgeai/theme';

import { SHOP_CATEGORIES } from './catalog';
import { listAgeText } from './gym';
import { refreshGymNow, refreshOrders, refreshProducts } from './gymActions';
import { useGymShop } from './gymStore';
import { gymShopOn } from './gymTab';
import { bagBadgeCount, cardPriceText, displayName, isOutOfStock } from './money';
import { MembershipCard } from './MembershipCard';
import { OfferCard } from './OfferCard';
import { ProductPicture } from './ProductPicture';
import { openPosterScan } from './scanPoster';
import { BagButton, BellButton, DemoNote, MyOrdersRow, QuietLine } from './ShopParts';
import { unreadCount } from './inbox';
import { inboxFor, useGymInbox } from './inboxStore';
import { useGymHydrated } from './shopSource';
import type { GymLink, Product, ShopCategory } from './types';

type Filter = 'all' | ShopCategory;

export function ShopScreen() {
  const hydrated = useGymHydrated();
  const link = useGymShop((s) => s.link);
  if (!hydrated) return <Screen key="wait" title="Gym" />;
  if (link) return <GymShop key={`gym-${link.memberId}`} link={link} />;
  return <JoinGymDoor key="door" />;
}

/** C6-4: "Couldn't refresh — showing the last list. Prices and stock as of Mon 13 Oct, 7:10 pm." */
function withListAge(problem: string, age: string | null): string {
  return age ? `${problem} ${age}` : problem;
}

// ------------------------------------------------------------------ no gym: the one join screen

/** What a gym in the app gives a member: only what the app does today. */
const WHAT_YOU_GET: readonly { icon: IconName; text: string }[] = [
  { icon: 'dumbbell', text: "Your trainer's workout plans, right on your Workout tab." },
  { icon: 'calendar', text: 'Your membership: your plan, its end date and the days left.' },
  { icon: 'check', text: 'Check in at the desk with your phone.' },
];

function JoinGymDoor() {
  // Why this phone is in no gym, when the gym let it go (gymActions.ts → unlink(UNLINKED_TEXT)).
  const notice = useGymShop((s) => s.notice);
  return (
    <Screen title="Gym">
      <View style={{ gap: space.lg, paddingBottom: space.xl }}>
        {notice ? <DemoNote text={notice} /> : null}
        <JoinGymCard scan />
        <View style={{ gap: space.md }}>
          <Text accessibilityRole="header" style={{ fontFamily: type.bodySemi, fontSize: type.size.body, color: color.ink }}>
            With your gym in the app
          </Text>
          {WHAT_YOU_GET.map((w) => (
            <View key={w.text} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.md }}>
              <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: color.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name={w.icon} size={16} color={color.accent} />
              </View>
              <Text style={{ flex: 1, fontFamily: type.body, fontSize: type.size.sub, lineHeight: 20, color: color.inkSecondary, paddingTop: 6 }}>{w.text}</Text>
            </View>
          ))}
        </View>
        <Text style={{ fontFamily: type.body, fontSize: type.size.sub, lineHeight: 20, color: color.inkMuted }}>
          No gym? Everything else works without one.
        </Text>
      </View>
    </Screen>
  );
}

// ------------------------------------------------------------------ joined: the gym's home and shop

function GymShop({ link }: { link: GymLink }) {
  const router = useRouter();
  const products = useGymShop((s) => s.products);
  const hasList = useGymShop((s) => s.productsAt != null);
  // R-77: the shop shows once the gym lists something (its owner turned it on in the admin app).
  const shopOn = gymShopOn(true, products.length);
  const productsAt = useGymShop((s) => s.productsAt);
  const bag = useGymShop((s) => s.bag);
  const orderCount = useGymShop((s) => s.orders.length);
  const unread = useGymInbox((s) => unreadCount(inboxFor(s, link.memberId)));
  const [filter, setFilter] = useState<Filter>('all');
  const [loading, setLoading] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const running = useRef(false);
  // A1: once, for a member whose tab used to say "Shop" (lib/layoutHints.ts).
  const [shopHint, setShopHint] = useState(false);
  useEffect(() => {
    let live = true;
    void hintDue('shopInGym').then((due) => {
      if (live) setShopHint(due);
    });
    return () => {
      live = false;
    };
  }, []);

  const refresh = useCallback(async (byPull: boolean) => {
    if (running.current) return;
    running.current = true;
    if (byPull) setPulling(true);
    else setLoading(true);
    // Gym branding: the gym's name and look as they are now ride along (quiet on failure).
    // Gym messages: refreshGymNow also refreshes the inbox (the bell's count).
    const [words] = await Promise.all([
      refreshProducts(),
      refreshOrders(),
      refreshGymNow().catch((e: unknown) => console.warn('[gym] refreshing the gym failed', e)),
    ]);
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

  // Gym branding: a branded gym's page is "Gym" under the gym's own logo and name (as the Workout
  // and Profile tabs); an unbranded gym keeps its name as the title. Read from the look the app is
  // painted in (it can wait for a safe moment), so the title and the header mark agree.
  const look = useGymTheme((s) => s.look);
  const branded = look?.gymId === link.gymId && isBranded(look.brand);
  const tagline = shopOn ? "Your gym's shop · pay at the desk" : 'Your gym';

  return (
    <Screen
      title={branded ? 'Gym' : link.gymName}
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

        {/* A4: My membership lives here only (not in Settings any more). First: the most used. */}
        <MembershipCard link={link} />
        {/* A3: Check in from the app: the phone's camera reads the poster at the desk. */}
        <View style={{ marginTop: space.md }}>
          <LinkRow
            title="Check in"
            sub="Scan the poster at the desk to mark today's visit"
            leading={
              <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: color.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="camera" size={16} color={color.accent} />
              </View>
            }
            onPress={() => void openPosterScan()}
          />
        </View>
        {/* #49 step 2: the gym's workout offer (hidden when there is none, or the server has none yet). */}
        <OfferCard link={link} />
        {/* R-77: the home-screen icon is offered in a pop-up right after joining (GymIconOffer.tsx). */}
        {shopOn || orderCount > 0 ? <MyOrdersRow count={orderCount} onPress={() => router.push('/shop/orders')} /> : null}
        {shopOn ? (
          <>
            <Text accessibilityRole="header" style={{ fontFamily: type.heading, fontSize: type.size.h3, color: color.ink, marginTop: space.xl }}>
              Shop
            </Text>
            {shopHint ? (
              <Card style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, marginTop: space.sm }}>
                <Text style={{ flex: 1, fontFamily: type.bodyMedium, fontSize: type.size.sub, lineHeight: 19, color: color.inkSecondary }}>{HINT_TEXT.shopInGym}</Text>
                <Pressable
                  onPress={() => {
                    setShopHint(false);
                    dismissHint('shopInGym').catch((e: unknown) => console.warn('[gym] could not save the hint', e));
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Got it. Hide this note"
                  style={{ minHeight: 48, minWidth: 48, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Text style={{ fontFamily: type.bodySemi, fontSize: type.size.sub, color: color.accent }}>Got it</Text>
                </Pressable>
              </Card>
            ) : null}
            <ProductGrid products={products} filter={filter} onFilter={setFilter} onOpen={(id) => router.push({ pathname: '/shop/[id]', params: { id } })} emptyText="Your gym has nothing in its shop yet." />
          </>
        ) : null}
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
