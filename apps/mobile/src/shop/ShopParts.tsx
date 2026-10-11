/**
 * Small pieces the Shop screens share (S1, S2): the bag button with its count, the quantity
 * stepper, the calm note, the "My orders" row, and the back arrow's fallback.
 */
import type { Href } from 'expo-router';
import { Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { Icon } from '@/components/ui';
import { PressScale } from '@/components/ui/PressScale';
import { color, radius, space, type } from '@/theme/tokens';

/** The words at the top of the sample shop (the S1 demo catalog, opened from the join card). */
export const DEMO_SHOP_LINE = "Sample shop — these are example products, not your gym's. Orders here are demos: nothing is sent or charged.";
/** Under the gym's own shop and its bag: money never moves in the app. */
export const PAY_AT_DESK_LINE = 'Pay at the desk when you collect it. Nothing is charged in the app.';
/** On every demo order. */
export const DEMO_ORDER_LINE = 'Demo order — not sent to your gym';

interface Nav {
  canGoBack: () => boolean;
  back: () => void;
  replace: (href: Href) => void;
}

/** Back when there is a page behind, else the given page (a link or restored app). */
export function leave(router: Nav, fallback: Href): void {
  if (router.canGoBack()) router.back();
  else router.replace(fallback);
}

/** A shopping bag outline (the ui Icon set has none, and it is frozen). */
export function BagGlyph({ size = 20, tint = color.ink }: { size?: number; tint?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={tint} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M5.5 8h13l-1 12.5a1.5 1.5 0 0 1-1.5 1.4H8a1.5 1.5 0 0 1-1.5-1.4Z" />
      <Path d="M9 10.5V6.5a3 3 0 0 1 6 0v4" />
    </Svg>
  );
}

/** Top-right bag: a round 42 dp button (48 dp to the finger) with the item count on it. */
export function BagButton({ count, onPress }: { count: number; onPress: () => void }) {
  const label = count === 0 ? 'Bag, empty' : `Bag, ${count} ${count === 1 ? 'item' : 'items'}`;
  return (
    <PressScale
      onPress={onPress}
      scaleTo={0.92}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{
        width: 48,
        height: 48,
        borderRadius: radius.pill,
        backgroundColor: color.surfaceRaised,
        borderWidth: 1,
        borderColor: color.border,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <BagGlyph size={22} />
      {count > 0 ? (
        <View
          style={{
            position: 'absolute',
            top: -4,
            right: -4,
            minWidth: 20,
            paddingHorizontal: 5,
            paddingVertical: 1,
            borderRadius: radius.pill,
            backgroundColor: color.accent,
            alignItems: 'center',
          }}
        >
          <Text maxFontSizeMultiplier={1.3} style={{ fontFamily: type.bodyBold, fontSize: type.size.caption, color: '#1F0D05' }}>
            {count > 99 ? '99+' : String(count)}
          </Text>
        </View>
      ) : null}
    </PressScale>
  );
}

/** − 2 + : each button 48 dp; says the item and the count to a screen reader. */
export function QtyStepper({ qty, max, onChange, what }: { qty: number; max: number; onChange: (q: number) => void; what: string }) {
  const canDown = qty > 1;
  const canUp = qty < max;
  const btn = (icon: 'minus' | 'plus', enabled: boolean, next: number, label: string) => (
    <PressScale
      onPress={() => enabled && onChange(next)}
      disabled={!enabled}
      scaleTo={0.9}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !enabled }}
      style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center', opacity: enabled ? 1 : 0.4 }}
    >
      {icon === 'plus' ? (
        <Icon name="plus" size={18} color={color.ink} />
      ) : (
        <View style={{ width: 14, height: 2, borderRadius: 1, backgroundColor: color.ink }} />
      )}
    </PressScale>
  );
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        borderRadius: radius.pill,
        backgroundColor: color.surfaceRaised,
        borderWidth: 1,
        borderColor: color.border,
      }}
    >
      {btn('minus', canDown, qty - 1, `One fewer ${what}`)}
      <Text
        accessibilityLabel={`Quantity ${qty}`}
        style={{ minWidth: 28, textAlign: 'center', fontFamily: type.monoBold, fontSize: type.size.body, color: color.ink }}
      >
        {qty}
      </Text>
      {btn('plus', canUp, qty + 1, `One more ${what}`)}
    </View>
  );
}

/** The "My orders" row under the shop's title. */
export function MyOrdersRow({ count, onPress }: { count: number; onPress: () => void }) {
  return (
    <PressScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={count > 0 ? `My orders, ${count}` : 'My orders'}
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
      {count > 0 ? <Text style={{ fontFamily: type.mono, fontSize: type.size.sub, color: color.inkMuted }}>{count}</Text> : null}
      <Icon name="chevron-right" size={18} color={color.inkMuted} />
    </PressScale>
  );
}

/** A quiet grey line ("Couldn't refresh — showing the last list."), spoken when it appears. */
export function QuietLine({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <Text accessibilityLiveRegion="polite" style={{ fontFamily: type.bodyMedium, fontSize: type.size.sub, color: color.inkMuted, lineHeight: 19 }}>
      {text}
    </Text>
  );
}

/** A text box in the Shop's forms (the join card), as Edit profile draws them. */
export const shopInputStyle = {
  backgroundColor: color.surfaceSunken,
  borderWidth: 1,
  borderColor: color.border,
  borderRadius: radius.md,
  paddingHorizontal: space.md,
  paddingVertical: space.sm,
  minHeight: 48,
  color: color.ink,
  fontFamily: type.bodyMedium,
  fontSize: type.size.body,
} as const;

/** The calm demo note: grey text on a quiet strip, never a warning colour. */
export function DemoNote({ text }: { text: string }) {
  return (
    <View
      style={{
        paddingVertical: space.sm,
        paddingHorizontal: space.md,
        borderRadius: radius.md,
        backgroundColor: color.surface,
        borderWidth: 1,
        borderColor: color.border,
      }}
    >
      <Text style={{ fontFamily: type.bodyMedium, fontSize: type.size.sub, color: color.inkSecondary, lineHeight: 19 }}>{text}</Text>
    </View>
  );
}
