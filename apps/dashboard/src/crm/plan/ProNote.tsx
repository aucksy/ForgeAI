/**
 * T66 (#30 A): what a Starter gym sees in place of a Pro page or part. Shown only when the switch
 * PLAN_GATE_ON is on (owner's yes) and the server says the gym is on Starter (GymPackProvider).
 * Words: plan/pack.ts.
 */
import type { ProFeature } from '@forgeai/theme';

import { Card, EmptyState, PageHeader, color, font, space } from '../ui/kit';
import { PRO_HOW, PRO_LINE, PRO_PAGE_TITLE, PRO_TITLE } from './pack';

/** A whole page. */
export function ProPage({ feature }: { feature: ProFeature }) {
  return (
    <>
      <PageHeader title={PRO_PAGE_TITLE[feature]} />
      <Card>
        <EmptyState title={PRO_TITLE} body={`${PRO_LINE[feature]} ${PRO_HOW}`} />
      </Card>
    </>
  );
}

/** A part of a page (Today's numbers, a member's measurements, the workout offer). */
export function ProNote({ feature }: { feature: ProFeature }) {
  return (
    <Card style={{ marginBottom: space.lg }}>
      <div style={{ fontFamily: font.body, fontSize: 15, fontWeight: 700, color: color.ink }}>{PRO_TITLE}</div>
      <div style={{ fontFamily: font.body, fontSize: 14, color: color.inkSecondary, marginTop: space.xs }}>{PRO_LINE[feature]}</div>
      <div style={{ fontFamily: font.body, fontSize: 14, color: color.inkSecondary, marginTop: space.xs }}>{PRO_HOW}</div>
    </Card>
  );
}
