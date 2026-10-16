/**
 * Members who joined this gym from the ForgeAI app (with the join code), read live
 * from the cloud. A separate list from the CRM roster on purpose: the roster is
 * the gym's own record of everyone who pays, this is who has the app — and the two
 * are not linked yet.
 */

import { useCallback, useState } from 'react';

import { formatINR } from '../logic/money';
import { initials } from '../logic/members';
import { Avatar, Card, EmptyState, ErrorBanner, Row, color, font, space } from '../ui/kit';
import { tr } from '../i18n';
import * as api from './api';
import { JoinCodeCard } from './JoinCode';
import { timeAgo, type AppMember } from './logic';
import { usePoll, useShop } from './ShopProvider';

export function AppMembersSection() {
  const { cloud, handleError, now } = useShop();
  const [members, setMembers] = useState<AppMember[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const key = cloud?.ownerKey ?? null;

  const load = useCallback(async () => {
    if (!key) return;
    try {
      setMembers(await api.listAppMembers(key));
      setError(null);
    } catch (e) {
      setError(handleError(e));
    }
  }, [key, handleError]);

  usePoll(load, 15_000, key !== null);

  if (!cloud) return <JoinCodeCard />;

  return (
    <>
      <p style={{ margin: `0 0 ${space.lg}px`, fontFamily: font.body, fontSize: 14, color: color.inkSecondary }}>
        {tr('Members who joined your gym in the ForgeAI app with gym code', 'Jo members ForgeAI app mein is gym code se aapke gym se jude')}{' '}
        <strong style={{ fontFamily: font.mono, color: color.accentBright, letterSpacing: 2 }}>{cloud.joinCode}</strong>.
      </p>

      {error && <ErrorBanner>{error}</ErrorBanner>}

      {members === null && !error ? (
        <Card>
          <EmptyState title={tr('Loading…', 'Load ho raha hai…')} />
        </Card>
      ) : members && members.length === 0 ? (
        <Card>
          <EmptyState
            title={tr('Nobody has joined in the app yet', 'Abhi tak koi app mein nahi juda')}
            body={tr(
              `Ask members to open the ForgeAI app and join with gym code ${cloud.joinCode}. They show up here straight away.`,
              `Members se kaho ForgeAI app kholkar gym code ${cloud.joinCode} se judein. Woh turant yahan dikhenge.`,
            )}
          />
        </Card>
      ) : (
        <div style={{ display: 'grid', gap: space.sm }}>
          {(members ?? []).map((m) => (
            <Card key={m.memberId} pad={space.lg}>
              <Row gap={space.md} wrap={false} align="center">
                <Avatar text={initials(m.name)} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: font.body, fontSize: 15, fontWeight: 600, color: color.ink }}>{m.name}</div>
                  <div style={{ fontFamily: font.body, fontSize: 12, color: color.inkMuted, marginTop: 2 }}>
                    {tr(
                      `Joined ${timeAgo(m.joinedAt, now)} · last seen ${timeAgo(m.lastSeen, now)}`,
                      `${timeAgo(m.joinedAt, now)} jude · aakhri baar ${timeAgo(m.lastSeen, now)}`,
                    )}
                  </div>
                </div>
                {/* Two lines facing the two on the left. A bold "₹0" over "paid at the
                    desk" read as the member's headline figure while their order was
                    still open; the count of orders is the fact, the money is its note. */}
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontFamily: font.body, fontSize: 15, fontWeight: 600, color: color.ink }}>
                    {m.orders === 0
                      ? tr('No orders yet', 'Abhi koi order nahi')
                      : m.orders === 1
                        ? tr('1 order', '1 order')
                        : tr(`${m.orders} orders`, `${m.orders} orders`)}
                  </div>
                  <div style={{ fontFamily: font.body, fontSize: 12, color: color.inkMuted, marginTop: 2 }}>
                    {m.spentP > 0
                      ? tr(`${formatINR(m.spentP)} paid at the desk`, `${formatINR(m.spentP)} desk par diye`)
                      : tr('Nothing paid at the desk yet', 'Abhi desk par kuch nahi diya')}
                  </div>
                </div>
              </Row>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
