import { describe, expect, it } from 'vitest';

import { BAD_LINK_TEXT, leaveLinkNotice, takeLinkNotice } from '@/lib/linkNotice';

describe('SH-29: a wrong link lands on Home with one calm line', () => {
  it('shows the note once', () => {
    expect(takeLinkNotice()).toBeNull();
    leaveLinkNotice();
    expect(takeLinkNotice()).toBe("That link didn't work.");
    expect(takeLinkNotice()).toBeNull();
    expect(BAD_LINK_TEXT).toBe("That link didn't work.");
  });
});
