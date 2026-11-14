/**
 * "Joined online" on Today (R-513 Join online, phase 1): people who filled the gym's "Become a member" page on their
 * own phone (app.mettleup.fit/m/<code>). Each row: the name, the plan and start day they picked, what they will pay
 * at the desk, "Not paid yet", and one "Make member" tap: the usual Add member form filled in, then Sell membership
 * on that plan (nothing collected until they pay), then their page. Hidden when nobody is waiting. Owner and desk
 * (both may add members and sell plans). Rules: logic/selfJoin.ts.
 */

import { useMemo, useState } from 'react';

import { t } from '../lang/lang';
import { formatDay } from '../logic/dates';
import { formatPhone } from '../logic/members';
import { formatINR } from '../logic/money';
import { waitingOnlineJoins } from '../logic/selfJoin';
import { useCrm } from '../store';
import type { Enquiry } from '../types';
import { Button, Card, ErrorBanner, Row, SectionTitle, color, font, space } from './kit';
import { MakeMemberFlow } from './screens/Enquiries';

export function JoinedOnlineCard() {
  const { snapshot } = useCrm();
  const rows = useMemo(() => waitingOnlineJoins(snapshot.enquiries), [snapshot.enquiries]);
  // Kept while the flow runs: the row itself goes away as soon as the member is saved.
  const [making, setMaking] = useState<Enquiry | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (rows.length === 0 && !making && !error) return null;

  return (
    <>
      {rows.length > 0 || error ? (
        <Card pad={space.lg} style={{ marginBottom: space.md }}>
          <SectionTitle>{t('Joined online')}</SectionTitle>
          <p style={{ margin: `0 0 ${space.md}px`, fontFamily: font.body, fontSize: 13, color: color.inkSecondary, overflowWrap: 'anywhere' }}>
            {t('They filled your "Become a member" page. Make them a member when they come in and pay.')}
          </p>
          {error ? <ErrorBanner>{error}</ErrorBanner> : null}
          <div style={{ display: 'flex', flexDirection: 'column', gap: space.md }}>
            {rows.map(({ enquiry, join }) => (
              <Row key={enquiry.id} gap={space.md}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontFamily: font.body, fontSize: 14, fontWeight: 600, color: color.ink, overflowWrap: 'anywhere' }}>{enquiry.name}</div>
                  <div style={{ fontFamily: font.mono, fontSize: 12, color: color.inkSecondary }}>{formatPhone(enquiry.phone)}</div>
                  <div style={{ fontFamily: font.body, fontSize: 13, color: color.ink, overflowWrap: 'anywhere' }}>
                    {t('{plan} · starts {date}', { plan: join.planName, date: formatDay(join.startsOn) })}
                  </div>
                  <div style={{ fontFamily: font.body, fontSize: 13, fontWeight: 600, color: join.paid ? color.goodText : color.warning }}>
                    {join.paid ? t('{total} paid', { total: formatINR(join.totalP) }) : t('{total} to pay at the desk · Not paid yet', { total: formatINR(join.totalP) })}
                  </div>
                </div>
                <Button
                  needsInternet
                  onClick={() => {
                    setError(null);
                    setMaking(enquiry);
                  }}
                  ariaLabel={t('Make {name} a member', { name: enquiry.name })}
                >
                  {t('Make member')}
                </Button>
              </Row>
            ))}
          </div>
        </Card>
      ) : null}
      {making ? (
        <MakeMemberFlow
          enquiry={making}
          onClose={() => setMaking(null)}
          onError={(m) => {
            setError(m);
            setMaking(null);
          }}
        />
      ) : null}
    </>
  );
}
