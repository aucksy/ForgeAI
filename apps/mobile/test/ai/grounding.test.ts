import { describe, expect, it } from 'vitest';

import { checkGrounding } from '@/ai/grounding';

describe('checkGrounding', () => {
  it('passes when every data-like number appears in a source', () => {
    const r = checkGrounding('You benched 82.5 kg for 125 kg total volume.', [
      'profile: bench 82.5 kg',
      '{"volume":125}',
    ]);
    expect(r.grounded).toBe(true);
    expect(r.ungroundedNumbers).toEqual([]);
  });

  it('flags a data-like number that no source contains', () => {
    const r = checkGrounding('Your squat e1RM is 142.5 kg.', ['profile: squat 120 kg']);
    expect(r.grounded).toBe(false);
    expect(r.ungroundedNumbers).toEqual(['142.5']);
  });

  it('ignores single-digit numbers (generic programming advice)', () => {
    const r = checkGrounding('Do 3 sets of 8 reps.', []);
    expect(r.grounded).toBe(true);
    expect(r.ungroundedNumbers).toEqual([]);
  });

  it('checks multi-digit integers and decimals, de-duplicating repeats', () => {
    const r = checkGrounding('125 and 125 and 60.5', ['only 60.5 here']);
    // 125 (2+ digits) ungrounded, reported once; 60.5 grounded.
    expect(r.ungroundedNumbers).toEqual(['125']);
  });

  it('pins a known limitation: a number that is a SUBSTRING of a source number reads as grounded', () => {
    // The check is a plain corpus.includes(n), so "12" is "found" inside "125".
    // This is a lenient by-design tripwire (never blocks a reply); documented here
    // so a future tightening is a conscious, test-visible change.
    const r = checkGrounding('You did 12 sets total.', ['session volume 125 kg']);
    expect(r.grounded).toBe(true);
  });
});
