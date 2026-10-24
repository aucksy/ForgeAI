/**
 * "All branches" (#41, `/branches`): the owner's totals and lists across every branch of the gym.
 * Each branch's own records are read (the open branch from the panel, the others through
 * `dataFor`), and every number is worked out here by the same rules the branch's own screens use
 * (logic.ts). Nothing on this page changes anything: "Open" switches to that branch.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import type { CrmData, CrmSnapshot } from '../data/adapter';
import { formatDay } from '../logic/dates';
import { formatINR, formatINRShort } from '../logic/money';
import { formatPhone } from '../logic/members';
import { useCrm } from '../store';
import { Button, Card, ChipToggle, EmptyState, ErrorBanner, Grid, PageHeader, Pill, SearchField, SectionTitle, StatTile, color, font, space } from '../ui/kit';
import { navigate, replace } from '../ui/router';
import { useBranchActions } from './BranchProvider';
import { useBranches } from './context';
import { acrossBranches, branchSummary, searchAcross, totalSummary, type AcrossList, type BranchSummary } from './logic';

interface Loaded {
  gymId: string;
  name: string;
  snap: CrmSnapshot | null;
  error: string | null;
}

const SHOW = 60;

export function AllBranchesScreen() {
  const { branches, groupName, multi, canOpenOthers, currentGymId, dataFor } = useBranches();
  const { switchTo } = useBranchActions();
  const { snapshot, today } = useCrm();
  const [others, setOthers] = useState<Loaded[]>([]);
  const [loading, setLoading] = useState(true);
  const [list, setList] = useState<AcrossList>('ending');
  const [query, setQuery] = useState('');
  const [opening, setOpening] = useState<string | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const rest = branches.filter((b) => b.gymId !== currentGymId);
    const got = await Promise.all(
      rest.map(async (b): Promise<Loaded> => {
        try {
          const data = (await dataFor(b.gymId)) as CrmData & { refresh?: () => Promise<boolean> };
          // Opened earlier this visit: bring it up to date first ("Refresh" means now).
          await data.refresh?.().catch((e: unknown) => console.warn('[ForgeErr] all branches: refresh', b.gymId, e));
          return { gymId: b.gymId, name: b.name, snap: await data.load(), error: null };
        } catch (e) {
          console.warn('[ForgeErr] all branches: load', b.gymId, e);
          return { gymId: b.gymId, name: b.name, snap: null, error: e instanceof Error ? e.message : 'It could not be opened.' };
        }
      }),
    );
    setOthers(got);
    setLoading(false);
  }, [branches, currentGymId, dataFor]);

  useEffect(() => {
    if (multi && canOpenOthers) void load();
  }, [multi, canOpenOthers, load]);

  const current = branches.find((b) => b.gymId === currentGymId);
  const all = useMemo(() => {
    const mine = { gymId: currentGymId, name: current?.name ?? snapshot.gym.name, snap: snapshot };
    const rest = others.filter((o): o is Loaded & { snap: CrmSnapshot } => o.snap !== null).map((o) => ({ gymId: o.gymId, name: o.name, snap: o.snap }));
    // Branch order, as the switch shows them.
    const order = new Map(branches.map((b, i) => [b.gymId, i]));
    return [mine, ...rest].sort((a, b) => (order.get(a.gymId) ?? 0) - (order.get(b.gymId) ?? 0));
  }, [currentGymId, current, snapshot, others, branches]);

  const summaries = useMemo<BranchSummary[]>(
    () => all.map((b) => branchSummary(b.gymId, b.name, b.snap, today, all.map((x) => ({ gymId: x.gymId, snap: x.snap })))),
    [all, today],
  );
  const total = useMemo(() => totalSummary(summaries), [summaries]);
  const rows = useMemo(() => acrossBranches(all, list, today), [all, list, today]);
  const found = useMemo(() => searchAcross(all, query, today), [all, query, today]);

  const open = async (gymId: string, path: string) => {
    setOpenError(null);
    if (gymId === currentGymId) return navigate(path);
    setOpening(gymId);
    try {
      replace(path);
      await switchTo(gymId);
    } catch (e) {
      replace('/branches');
      setOpenError(e instanceof Error ? e.message : 'That branch could not be opened.');
      setOpening(null);
    }
  };

  if (!multi || !canOpenOthers) {
    return (
      <>
        <PageHeader title="All branches" />
        <EmptyState title="One branch" body="Your gym has one branch. Add another in Settings → Branches. Then this page shows every branch together." />
      </>
    );
  }

  const failed = others.filter((o) => o.error);

  return (
    <>
      <PageHeader title="All branches" subtitle={`${groupName} · ${branches.length} branches`} actions={<Button variant="ghost" onClick={() => void load()} disabled={loading}>{loading ? 'Loading…' : 'Refresh'}</Button>} />

      {openError && <ErrorBanner>{openError}</ErrorBanner>}
      {failed.map((f) => (
        <ErrorBanner key={f.gymId}>{`${f.name}: ${f.error} Its numbers are not in the totals below. Tap “Refresh” to try again.`}</ErrorBanner>
      ))}
      {loading && others.length === 0 && (
        <p role="status" style={{ fontFamily: font.body, fontSize: 14, color: color.inkSecondary }}>
          Loading every branch…
        </p>
      )}

      <Grid min={150}>
        <StatTile label="Active members" value={total.active} sub="A plan running today" />
        <StatTile label="Money in this month" value={formatINRShort(total.collectedMonthP)} fullValue={formatINR(total.collectedMonthP)} tone="good" sub={`${formatINR(total.collectedTodayP)} today`} />
        <StatTile label="Fees due" value={formatINRShort(total.dueP)} fullValue={formatINR(total.dueP)} tone={total.dueP > 0 ? 'warn' : undefined} sub={`${total.owing} ${total.owing === 1 ? 'person owes' : 'people owe'}`} />
        <StatTile label="Came in today" value={total.inToday} />
        <StatTile label="Plans ending in 7 days" value={total.endingSoon} />
        <StatTile label="Joined this month" value={total.joinedMonth} />
      </Grid>

      <Card style={{ marginTop: space.lg }}>
        <SectionTitle>Each branch</SectionTitle>
        <div style={{ display: 'grid', gap: space.sm }}>
          {summaries.map((s) => (
            <div key={s.gymId} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: space.md, padding: `${space.sm}px 0`, borderTop: `1px solid ${color.border}` }}>
              <div style={{ flex: '1 1 180px', minWidth: 0 }}>
                <div style={{ fontFamily: font.body, fontWeight: 700, fontSize: 15, color: color.ink }}>
                  {s.name} {s.gymId === currentGymId && <Pill tone="accent">Open now</Pill>}
                </div>
                <div style={{ fontFamily: font.body, fontSize: 13, color: color.inkSecondary, marginTop: 2 }}>
                  {`${s.active} active · ${s.endingSoon} ending in 7 days · ${s.inToday} came in today`}
                </div>
                <div style={{ fontFamily: font.body, fontSize: 13, color: color.inkSecondary, marginTop: 2 }}>
                  {`${formatINR(s.collectedMonthP)} this month · ${formatINR(s.dueP)} due`}
                </div>
              </div>
              {s.gymId !== currentGymId && (
                <Button variant="ghost" disabled={opening !== null} onClick={() => void open(s.gymId, '/')} ariaLabel={`Open ${s.name}`}>
                  {opening === s.gymId ? 'Opening…' : 'Open'}
                </Button>
              )}
            </div>
          ))}
        </div>
      </Card>

      <Card style={{ marginTop: space.lg }}>
        <SectionTitle>Who to call, in every branch</SectionTitle>
        <ChipToggle
          label="Which list"
          value={list}
          onChange={(v) => setList(v as AcrossList)}
          options={[
            { value: 'ending', label: 'Plan ends in 7 days' },
            { value: 'expired', label: 'Plan ended (last 30 days)' },
            { value: 'owing', label: 'Fees due' },
          ]}
        />
        <div style={{ marginTop: space.md, display: 'grid', gap: 2 }}>
          {rows.length === 0 && <p style={{ fontFamily: font.body, fontSize: 14, color: color.inkSecondary }}>Nobody on this list right now.</p>}
          {rows.slice(0, SHOW).map((r) => (
            <MemberLine
              key={`${r.gymId}:${r.view.member.id}`}
              name={r.view.member.fullName}
              phone={r.view.member.phone}
              branch={r.branchName}
              info={
                list === 'owing'
                  ? `${formatINR(r.dueP)} due`
                  : list === 'ending'
                    ? r.view.daysRemaining === 0
                      ? 'Ends today'
                      : `Ends in ${r.view.daysRemaining} ${r.view.daysRemaining === 1 ? 'day' : 'days'}`
                    : r.view.coversUntil === null && r.view.current ? `Ended ${formatDay(r.view.current.endsOn)}` : ''
              }
              busy={opening !== null}
              onOpen={() => void open(r.gymId, `/members/${encodeURIComponent(r.view.member.id)}`)}
            />
          ))}
          {rows.length > SHOW && (
            <p style={{ fontFamily: font.body, fontSize: 13, color: color.inkMuted }}>{`And ${rows.length - SHOW} more. Open a branch to see its full list.`}</p>
          )}
        </div>
      </Card>

      <Card style={{ marginTop: space.lg }}>
        <SectionTitle>Find a member in any branch</SectionTitle>
        <SearchField value={query} onChange={setQuery} placeholder="Name or mobile number" />
        <div style={{ marginTop: space.md, display: 'grid', gap: 2 }}>
          {query.trim().length >= 3 && found.length === 0 && (
            <p style={{ fontFamily: font.body, fontSize: 14, color: color.inkSecondary }}>No member with that name or number.</p>
          )}
          {found.map((r) => (
            <MemberLine
              key={`${r.gymId}:${r.view.member.id}`}
              name={r.view.member.fullName}
              phone={r.view.member.phone}
              branch={r.branchName}
              info={r.view.member.allBranches ? 'Can train at every branch' : ''}
              busy={opening !== null}
              onOpen={() => void open(r.gymId, `/members/${encodeURIComponent(r.view.member.id)}`)}
            />
          ))}
        </div>
      </Card>
    </>
  );
}

function MemberLine({ name, phone, branch, info, busy, onOpen }: { name: string; phone: string; branch: string; info: string; busy: boolean; onOpen: () => void }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: space.sm, padding: `${space.sm}px 0`, borderTop: `1px solid ${color.border}` }}>
      <div style={{ flex: '1 1 200px', minWidth: 0 }}>
        <div style={{ fontFamily: font.body, fontWeight: 700, fontSize: 14, color: color.ink }}>{name}</div>
        <div style={{ fontFamily: font.body, fontSize: 13, color: color.inkSecondary }}>
          {[branch, formatPhone(phone), info].filter(Boolean).join(' · ')}
        </div>
      </div>
      <Button variant="quiet" disabled={busy} onClick={onOpen} ariaLabel={`Open ${name} in ${branch}`}>
        Open
      </Button>
    </div>
  );
}
