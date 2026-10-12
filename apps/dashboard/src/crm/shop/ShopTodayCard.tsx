/**
 * Today's shop at a glance: orders waiting at the desk, and money collected for
 * shop orders today. One tap opens the orders.
 */

import { useMemo } from 'react';

import { formatINR } from '../logic/money';
import { Button, Card, SectionTitle, color, font, space } from '../ui/kit';
import { navigate } from '../ui/router';
import { collectedTodayP } from './logic';
import { useShop } from './ShopProvider';

export function ShopTodayCard({ flush = false }: { flush?: boolean }) {
  const { cloud, orders, ordersLoaded, newCount, now } = useShop();
  const today = useMemo(() => collectedTodayP(orders, now), [orders, now]);
  const readyCount = useMemo(() => orders.filter((o) => o.status === 'ready').length, [orders]);

  if (!cloud) return null;

  return (
    <Card style={{ marginBottom: flush ? 0 : space.lg }}>
      <SectionTitle
        action={
          <Button variant="ghost" onClick={() => navigate('/shop/orders')}>
            Open shop
          </Button>
        }
      >
        Shop today
      </SectionTitle>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: space.md }}>
        <Figure
          value={ordersLoaded ? String(newCount) : '…'}
          label={newCount === 1 ? 'new order' : 'new orders'}
          tone={newCount > 0 ? color.accentBright : color.ink}
        />
        <Figure value={ordersLoaded ? String(readyCount) : '…'} label="ready for pickup" tone={color.ink} />
        {/* "Sold", not "collected": it sits above "Collected this month" for
            memberships, and two different "collected" figures on one screen read as
            one number that disagrees with itself. Green only once there is money. */}
        <Figure
          value={ordersLoaded ? formatINR(today) : '…'}
          label="sold today"
          tone={today > 0 ? color.goodText : color.ink}
        />
      </div>
    </Card>
  );
}

function Figure({ value, label, tone }: { value: string; label: string; tone: string }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div
        style={{
          fontFamily: font.mono,
          fontSize: 24,
          fontWeight: 700,
          color: tone,
          lineHeight: 1.15,
          overflowWrap: 'anywhere',
        }}
      >
        {value}
      </div>
      <div style={{ fontFamily: font.body, fontSize: 12, color: color.inkMuted, marginTop: 4 }}>{label}</div>
    </div>
  );
}
