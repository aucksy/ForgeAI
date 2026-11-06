/**
 * F103 / T77 step 2: the small "a member's right to come in may have changed" signal. The store calls
 * noteAccessChange after a sale, a renewal, a freeze, a cancel, a moved start and an archive; the entry
 * machine job (ui/EntryMachineJob.tsx) takes the notes and queues the machine updates. No imports on
 * purpose: the store loads it in every test.
 */

const changed = new Set<string>();
const listeners = new Set<() => void>();

/** A sale, renewal, freeze, cancel or archive touched this member (or this membership's member). */
export function noteAccessChange(ref: { memberId: string } | { membershipId: string }): void {
  changed.add('memberId' in ref ? `m:${ref.memberId}` : `t:${ref.membershipId}`);
  for (const l of listeners) l();
}

/** The job takes everything noted so far: "m:<memberId>" and "t:<membershipId>". */
export function takeAccessChanges(): string[] {
  const out = [...changed];
  changed.clear();
  return out;
}

export function onAccessChange(l: () => void): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/** The member ids behind the notes. PURE. */
export function memberIdsOf(notes: readonly string[], memberships: ReadonlyArray<{ id: string; memberId: string }>): string[] {
  const out = new Set<string>();
  for (const n of notes) {
    if (n.startsWith('m:')) out.add(n.slice(2));
    else if (n.startsWith('t:')) {
      const t = memberships.find((m) => m.id === n.slice(2));
      if (t) out.add(t.memberId);
    }
  }
  return [...out];
}
