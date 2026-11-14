/**
 * F207 (supabase 0080, live 14 Nov 2026): a question asked on the gym's web page becomes an Enquiry and a
 * 'page_question' alert that opens Enquiries. The panel drops alert kinds it does not know, so it must know this one.
 */
import { describe, expect, it } from 'vitest';

import { GYM_ALERT_KINDS, gymAlertsFrom } from '../../src/crm/logic/gymAlerts';

describe('web page question alert', () => {
  it('page_question is a kind the panel shows, and it opens Enquiries', () => {
    expect(GYM_ALERT_KINDS).toContain('page_question');
    const got = gymAlertsFrom({
      ok: true,
      alerts: [{ id: 'p1', kind: 'page_question', line: 'Ravi asked a question on your web page. Reply from Enquiries.', route: '/enquiries', urgent: true, at: 7 }],
    });
    expect(got?.[0]).toMatchObject({ kind: 'page_question', route: '/enquiries', urgent: true });
  });
});
