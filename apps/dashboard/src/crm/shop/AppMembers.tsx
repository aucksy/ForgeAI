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
        Members who joined your gym in the ForgeAI app with code{' '}
        <strong style={{ fontFamily: font.mono, color: color.accentBright, letterSpacing: 2 }}>{cloud.joinCode}</strong>.
      </p>

      {error && <ErrorBanner>{error}</ErrorBanner>}

      {members === null && !error ? (
        <Card>
          <EmptyState title="Loading…" />
        </Card>
      ) : members && members.length === 0 ? (
        <Card>
          <EmptyState
            title="Nobody has joined in the app yet"
            body={`Ask members to open the ForgeAI app and join with code ${cloud.joinCode}. They show up here straight away.`}
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
                    Joined {timeAgo(m.joinedAt, now)} · last seen {timeAgo(m.lastSeen, now)}
                  </div>
                </div>
                {/* Two lines facing the two on the left. A bold "₹0" over "paid at the
                    desk" read as the member's headline figure while their order was
                    still open; the count of orders is the fact, the money is its note. */}
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontFamily: font.body, fontSize: 15, fontWeight: 600, color: color.ink }}>
                    {m.orders === 0 ? 'No orders yet' : m.orders === 1 ? '1 order' : `${m.orders} orders`}
                  </div>
                  <div style={{ fontFamily: font.body, fontSize: 12, color: color.inkMuted, marginTop: 2 }}>
                    {m.spentP > 0 ? `${formatINR(m.spentP)} paid at the desk` : 'Nothing paid at the desk yet'}
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
