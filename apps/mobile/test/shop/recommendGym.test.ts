import { describe, expect, it } from 'vitest';

import { RECOMMEND_BODY, RECOMMEND_BUTTON, RECOMMEND_LINK, RECOMMEND_TITLE, recommendMessage } from '@/shop/recommendGym';

describe('R-263 recommend MettleUp to my gym', () => {
  it('sends the gym-owner page with the member mark, so the lead shows it came from a member', () => {
    expect(RECOMMEND_LINK).toBe('https://gyms.mettleup.fit/?from=member');
    expect(recommendMessage()).toContain(RECOMMEND_LINK);
  });

  it('says MettleUp runs gyms and that members get the app free', () => {
    expect(RECOMMEND_BODY).toMatch(/run their gym/);
    expect(RECOMMEND_BODY).toMatch(/free/);
  });

  it('uses no banned member words', () => {
    const all = [RECOMMEND_TITLE, RECOMMEND_BODY, RECOMMEND_BUTTON, recommendMessage()].join(' ');
    expect(all).not.toMatch(/\b(volume|PR|session)\b/i);
  });
});
