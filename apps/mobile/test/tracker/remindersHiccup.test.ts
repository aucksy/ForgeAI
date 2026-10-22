/** v0.52.0 (phone run 39722663191): a passing native database hiccup is tried once more, not logged. */
import { describe, expect, it } from 'vitest';

import { isPassingDbHiccup } from '@/tracker/phone/reminders';

describe('reminders: a passing database hiccup', () => {
  it('is told apart from a real failure', () => {
    expect(isPassingDbHiccup(new Error("Call to function 'NativeStatement.finalizeAsync' has been rejected.\n→ Caused by: Cannot use shared object that was already released"))).toBe(true);
    expect(isPassingDbHiccup(new Error('Cannot use shared object that was already released'))).toBe(true);
    expect(isPassingDbHiccup(new Error('Notifications are not allowed'))).toBe(false);
    expect(isPassingDbHiccup('database is locked')).toBe(false);
  });
});
