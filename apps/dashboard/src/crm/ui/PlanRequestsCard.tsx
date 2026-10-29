/**
 * "Requests from the app" on Today (F150): members' pause and renew requests, each with the member's
 * name, what they asked for, and Approve / Decline. Approve runs the desk's own freeze or sell tool
 * first (F81: extendMembership / sellMembership), then tells the server, which checks that plan is
 * there. Hidden until the gym server has 0044, when signed out of the cloud, and when there is
 * nothing to show. Rules and words: logic/planRequests.ts.
 */

import { useCallback, useState } from 'react';

import { useAuth, useRole } from '../auth/AuthProvider';
import { takerOf } from '../auth/permissions';
import {
  approveErrorWords,
  decidedLine,
  decideErrorWords,
  planFreeze,
  planRenewal,
  PLAN_REQUEST_DESK_WORDS as W,
  requestWhat,
  sortRequests,
  type PlanRequestRow,
} from '../logic/planRequests';
import { decidePlanRequest, listPlanRequests, planRequestServer } from '../shop/planRequestApi';
import { usePoll } from '../shop/ShopProvider';
import { useCrm } from '../store';
import { Button, Card, ErrorBanner, Row, SectionTitle, color, font, space } from './kit';

export function PlanRequestsCard() {
  const { session } = useAuth();
  const key = session?.online ? (session.ownerKey ?? null) : null;
  const role = useRole();
  const taker = takerOf(session);
  const { snapshot, today, extendMembership, sellMembership } = useCrm();
  const [rows, setRows] = useState<PlanRequestRow[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<{ id: string; text: string } | null>(null);

  const load = useCallback(async () => {
    if (!key) return;
    try {
      const r = await listPlanRequests(key);
      setRows(r === 'missing' ? null : sortRequests(r));
    } catch (e) {
      console.warn('[ForgeErr] plan requests: reading the list', e);
    }
  }, [key]);
  usePoll(load, 60_000, key !== null && planRequestServer() !== 'no');

  if (!key || !rows || rows.length === 0) return null;

  const approve = async (r: PlanRequestRow): Promise<void> => {
    setBusy(r.id);
    setProblem(null);
    try {
      let membershipId: string;
      if (r.kind === 'freeze') {
        const plan = planFreeze(r, snapshot.memberships);
        if (!plan.ok) return setProblem({ id: r.id, text: plan.problem });
        // F81's freeze tool: the same write as the member page's "Freeze / extra days".
        if (!plan.alreadyDone) await extendMembership(plan.membershipId, plan.days, plan.reason);
        membershipId = plan.membershipId;
      } else {
        const plan = planRenewal(r, snapshot, today, role === 'staff' ? 'staff' : 'owner', taker);
        if (!plan.ok) return setProblem({ id: r.id, text: plan.problem });
        // F81's sell tool, nothing collected (paid at the desk); the request id makes it once only.
        membershipId = plan.alreadyDone ? plan.membershipId : (await sellMembership(plan.input)).membership.id;
      }
      await decidePlanRequest(key, r.id, 'approved', membershipId);
      await load();
    } catch (e) {
      console.warn('[ForgeErr] plan requests: approve', e);
      setProblem({ id: r.id, text: approveErrorWords(e) });
      await load();
    } finally {
      setBusy(null);
    }
  };

  const decline = async (r: PlanRequestRow): Promise<void> => {
    setBusy(r.id);
    setProblem(null);
    try {
      await decidePlanRequest(key, r.id, 'declined', null);
      await load();
    } catch (e) {
      console.warn('[ForgeErr] plan requests: decline', e);
      setProblem({ id: r.id, text: decideErrorWords(e) });
      await load();
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card pad={space.lg} style={{ marginBottom: space.md }}>
      <SectionTitle>{W.title}</SectionTitle>
      <div style={{ display: 'flex', flexDirection: 'column', gap: space.md }}>
        {rows.map((r) => (
          <div key={r.id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Row gap={space.md}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontFamily: font.body, fontSize: 14, fontWeight: 600, color: color.ink }}>{r.memberName}</div>
                <div style={{ fontFamily: font.body, fontSize: 13, color: color.inkSecondary }}>{requestWhat(r)}</div>
                {r.status === 'pending' && r.kind === 'renew' ? (
                  <div style={{ fontFamily: font.body, fontSize: 12, color: color.inkSecondary }}>{W.renewNote}</div>
                ) : null}
                {r.status !== 'pending' ? (
                  <div style={{ fontFamily: font.body, fontSize: 12, color: r.status === 'approved' ? color.goodText : color.inkSecondary }}>{decidedLine(r)}</div>
                ) : null}
              </div>
              {r.status === 'pending' ? (
                <Row gap={space.sm} wrap={false}>
                  <Button variant="ghost" disabled={busy !== null} onClick={() => decline(r)} ariaLabel={`${W.decline}: ${r.memberName}, ${requestWhat(r)}`}>
                    {W.decline}
                  </Button>
                  <Button disabled={busy !== null} onClick={() => approve(r)} ariaLabel={`${W.approve}: ${r.memberName}, ${requestWhat(r)}`}>
                    {busy === r.id ? W.working : W.approve}
                  </Button>
                </Row>
              ) : null}
            </Row>
            {problem?.id === r.id ? <ErrorBanner>{problem.text}</ErrorBanner> : null}
          </div>
        ))}
      </div>
    </Card>
  );
}
