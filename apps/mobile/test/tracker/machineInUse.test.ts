import { describe, expect, it } from 'vitest';

import { IN_USE_WORDS, machineName } from '@/tracker/components/MachineInUse';

describe('Machine in use (backlog, 21 Oct)', () => {
  it('names the machine, not the set', () => {
    expect(machineName('Bench Press, set 3')).toBe('Bench Press');
    expect(machineName('Leg Press')).toBe('Leg Press');
    expect(machineName(null)).toBeNull();
    expect(machineName('  ')).toBeNull();
  });
  it('member words never say volume, PR or session', () => {
    for (const w of Object.values(IN_USE_WORDS)) expect(w).not.toMatch(/\b(volume|PR|session)\b/i);
  });
});
