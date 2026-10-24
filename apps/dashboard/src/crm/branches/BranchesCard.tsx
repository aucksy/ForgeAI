/**
 * Settings -> Branches (#41): the gym's branches, the business's name, and "Add a branch".
 * Owners only (Settings shows owners this card; the server refuses the desk anyway).
 */

import { useCallback, useEffect, useState } from 'react';

import { useAuth } from '../auth/AuthProvider';
import { Button, Card, CheckField, ErrorBanner, Pill, SectionTitle, Sheet, TextField, Toast, color, font, space } from '../ui/kit';
import { replace } from '../ui/router';
import { useBranchActions } from './BranchProvider';
import { useBranches } from './context';

const body = { margin: 0, fontFamily: font.body, fontSize: 14, lineHeight: 1.5, color: color.inkSecondary } as const;

/** What a receipt number of this branch starts like ("B2/2026-27/0001"). */
function receiptExample(prefix: string | null): string {
  const now = new Date();
  const y = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  const fy = `${y}-${String((y + 1) % 100).padStart(2, '0')}`;
  return prefix ? `${prefix}/${fy}/0001` : `${fy}/0001`;
}

export function BranchesCard() {
  const { session } = useAuth();
  const online = session?.online === true && Boolean(session.person);
  const { branches, groupName, multi, currentGymId } = useBranches();
  const { serverReady, addBranch, renameGroup, switchTo } = useBranchActions();

  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [copyPlans, setCopyPlans] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [made, setMade] = useState<{ gymId: string; name: string; plansCopied: number } | null>(null);
  const [group, setGroup] = useState(groupName);
  const [groupBusy, setGroupBusy] = useState(false);
  // The list loads after the screen opens: the field follows the name the server says.
  useEffect(() => setGroup(groupName), [groupName]);
  const [toast, setToast] = useState<string | null>(null);
  const close = useCallback(() => {
    setAdding(false);
    setError(null);
  }, []);

  if (!online) {
    return (
      <Card style={{ marginBottom: space.lg }}>
        <SectionTitle>Branches</SectionTitle>
        <p style={body}>
          Have more than one gym? Put your gym online first (above). Then you can add each branch here, with its own
          front desk, receipts and member list.
        </p>
      </Card>
    );
  }

  if (!serverReady) {
    return (
      <Card style={{ marginBottom: space.lg }}>
        <SectionTitle>Branches</SectionTitle>
        <p style={body}>Branches are not switched on for your gym yet. Message MettleUp on WhatsApp to switch them on.</p>
      </Card>
    );
  }

  const add = async () => {
    if (name.trim().length < 2) return setError('Type the branch’s name, like “Iron Temple, Vaishali Nagar”.');
    setBusy(true);
    setError(null);
    try {
      const r = await addBranch(name, copyPlans);
      setMade({ gymId: r.gymId, name: r.name, plansCopied: r.plansCopied });
      setAdding(false);
      setName('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The branch could not be added. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const saveGroup = async () => {
    if (!group.trim()) return;
    setGroupBusy(true);
    try {
      await renameGroup(group);
      setToast('Saved.');
      window.setTimeout(() => setToast(null), 2400);
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'Could not save the name.');
    } finally {
      setGroupBusy(false);
    }
  };

  const openMade = async () => {
    if (!made) return;
    try {
      replace('/settings/people');
      await switchTo(made.gymId);
    } catch (e) {
      replace('/settings');
      setToast(e instanceof Error ? e.message : 'That branch could not be opened.');
    }
  };

  return (
    <Card style={{ marginBottom: space.lg }}>
      <SectionTitle>Branches</SectionTitle>
      <p style={body}>
        {multi
          ? 'Each branch has its own members, plans, receipts, front desk and QR poster. Pick a branch at the top of the screen. “All branches” there shows every branch together.'
          : 'Have more than one gym? Add each branch here. Every branch gets its own members, receipts, front desk and QR poster. You see all of them with one sign-in.'}
      </p>

      <div style={{ display: 'grid', gap: 2, marginTop: space.md }}>
        {branches.map((b) => (
          <div key={b.gymId} style={{ padding: `${space.sm}px 0`, borderTop: `1px solid ${color.border}` }}>
            <div style={{ fontFamily: font.body, fontWeight: 700, fontSize: 15, color: color.ink }}>
              {b.name} {b.gymId === currentGymId && <Pill tone="accent">Open now</Pill>}
            </div>
            <div style={{ fontFamily: font.body, fontSize: 13, color: color.inkSecondary, marginTop: 2 }}>
              {`Gym code ${b.joinCode || '-'} · receipts start ${receiptExample(b.receiptPrefix)}`}
            </div>
          </div>
        ))}
      </div>

      {multi && (
        <div style={{ marginTop: space.md }}>
          <TextField label="Your business name" value={group} onChange={setGroup} hint="Shown at the top of “All branches”. Members see each branch’s own name." />
          <div style={{ marginTop: space.sm }}>
            <Button variant="ghost" needsInternet disabled={groupBusy || !group.trim() || group.trim() === groupName} onClick={() => void saveGroup()}>
              {groupBusy ? 'Saving…' : 'Save name'}
            </Button>
          </div>
        </div>
      )}

      {made && (
        <div role="status" style={{ marginTop: space.lg, display: 'grid', gap: space.sm }}>
          <p style={{ ...body, color: color.ink }}>
            {`${made.name} is added.${made.plansCopied > 0 ? ` ${made.plansCopied} plans were copied to it.` : ''} Next: open it and add its front-desk staff.`}
          </p>
          <div>
            <Button needsInternet onClick={() => void openMade()}>{`Open ${made.name}`}</Button>
          </div>
        </div>
      )}

      <div style={{ marginTop: space.lg }}>
        <Button variant={made ? 'ghost' : 'primary'} needsInternet onClick={() => setAdding(true)}>
          Add a branch
        </Button>
      </div>

      {adding && (
        <Sheet
          title="Add a branch"
          onClose={close}
          footer={
            <>
              <Button variant="ghost" onClick={close}>
                Cancel
              </Button>
              <Button disabled={busy} onClick={() => void add()}>
                {busy ? 'Adding…' : 'Add branch'}
              </Button>
            </>
          }
        >
          {error && <ErrorBanner>{error}</ErrorBanner>}
          <TextField label="Branch name" value={name} onChange={setName} placeholder="Iron Temple, Vaishali Nagar" hint="Members see this name in their app." />
          <CheckField checked={copyPlans} onChange={setCopyPlans} hint="You can change the prices there later.">
            Copy this branch’s plans to the new branch
          </CheckField>
          <ul style={{ ...body, margin: `${space.md}px 0 0`, paddingLeft: 18, display: 'grid', gap: 4 }}>
            <li>Every owner of this gym is an owner of the new branch too.</li>
            <li>To add its front-desk staff, pick the new branch at the top of the screen, then go to Settings → Staff & sign-in.</li>
            <li>Its receipt numbers start with its own code (like B2), so two branches never print the same number.</li>
            <li>It gets its own gym code and QR poster for members.</li>
            <li>It starts with your first branch’s GST number. If the new branch has its own, change it in Settings after you open it.</li>
            <li>Its free trial ends when your first branch’s does, on the same MettleUp plan. MettleUp is priced per branch.</li>
          </ul>
        </Sheet>
      )}
      {toast && <Toast message={toast} />}
    </Card>
  );
}
