/**
 * F103 / T77 step 2: the job that keeps the gym's entry machines in step with MettleUp. Mounted once in the
 * app (CrmApp Routes); renders nothing, ever.
 *
 *  - After a sale, a renewal, a freeze, a cancel, a moved start or an archive (the store notes it,
 *    machines/accessChanges.ts): the core's commands for that member (entryMachine.syncCommands) are queued
 *    on every machine. A member with no machine number gets one first (entryMachineAdmin.numbersToGive).
 *  - Once a day, the first desk that is open (the nightly sweep): members whose right to come in changed
 *    since that machine's last sweep (a plan ended, a plan bought for later began). A machine just added
 *    gets every member who may come in. The server remembers each machine's sweep day, so two desks send
 *    it once.
 *
 * Does nothing at all, and asks nothing, while the gym is not online, the server has no 0059 (NOT APPLIED),
 * or no machine is registered. A failed call (no internet) keeps the members for the next try.
 */
import { useEffect, useRef, useState } from 'react';

import { memberIdsOf, onAccessChange, takeAccessChanges } from '../machines/accessChanges';
import { commandsForMembers, numbersToGive, sweepCommands, type QueueItem } from '../machines/entryMachineAdmin';
import * as entryApi from '../shop/entryMachinesApi';
import { useCrm } from '../store';
import { refreshEntryMachines, useEntryMachines } from './useEntryMachines';

export function EntryMachineJob() {
  const { snapshot, today } = useCrm();
  const { load, key } = useEntryMachines();
  const [tick, setTick] = useState(0);
  const waiting = useRef(new Set<string>());
  const running = useRef(false);
  const latest = useRef({ snapshot, today, load, key });
  latest.current = { snapshot, today, load, key };

  // Notes from the store arrive as a tick; they are kept even while no machine is known yet.
  useEffect(() => onAccessChange(() => setTick((t) => t + 1)), []);

  useEffect(() => {
    if (running.current) return;
    const { snapshot: snap, today: day, load: l, key: k } = latest.current;
    for (const id of memberIdsOf(takeAccessChanges(), snap.memberships)) waiting.current.add(id);
    if (!k || l.state !== 'ready') return;
    const live = l.machines.filter((m) => !m.paused);
    if (live.length === 0) {
      // No machine: nothing to send, nothing to keep.
      waiting.current.clear();
      return;
    }
    const numbers = l.numbers ?? {};
    const toSweep = live.filter((m) => m.sweptOn === null || m.sweptOn < day);
    const members = [...waiting.current];
    if (members.length === 0 && toSweep.length === 0) return;

    running.current = true;
    void (async () => {
      try {
        // 1. Every member still without a number gets one (the gym's own number when free, else 1001 up).
        const give = numbersToGive(snap.members, numbers);
        if (give.length > 0) await entryApi.setMachineNumbers(k, give);
        const all = { ...numbers, ...Object.fromEntries(give.map((g) => [g.memberId, g.memberNo])) };

        // 2. The members just touched.
        const items: QueueItem[] = commandsForMembers(members, snap.members, snap.memberships, all, live, day);
        if (items.length > 0) await entryApi.queueMachineCommands(k, items, null);
        for (const id of members) waiting.current.delete(id);

        // 3. The sweep, once a day per machine.
        if (toSweep.length > 0) {
          const sweep: QueueItem[] = [];
          for (const m of toSweep) {
            for (const command of sweepCommands(snap.members, snap.memberships, all, m, m.sweptOn, day)) sweep.push({ machineId: m.id, command });
          }
          await entryApi.queueMachineCommands(k, sweep, { day, machineIds: toSweep.map((m) => m.id) });
        }
        if (give.length > 0 || toSweep.length > 0) await refreshEntryMachines(k);
      } catch (e) {
        console.warn('[ForgeErr] entry machines: queueing member updates', e);
      } finally {
        running.current = false;
      }
    })();
  }, [tick, load, key, today]);

  return null;
}
