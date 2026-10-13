/**
 * Gym branding (Level 1): the contract between the server (supabase/migrations/0005_gym_theme.sql)
 * and the app — the `brand` object in member_join / member_me / owner_gym, read by the one shared
 * parser (parseGymBrand), kept on the phone with the gym link, and updated from member_me.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { cleanGymBlob, gymNowFromMe, linkFromJoin, linkWithNow } from '@/shop/gym';

const SQL = readFileSync(resolve(__dirname, '../../../../supabase/migrations/0005_gym_theme.sql'), 'utf8');
const LOGO = 'https://hdxzqbdiokjklnypfisq.supabase.co/storage/v1/object/public/gym-logos/' + 'a'.repeat(48) + '/logo.png';

/** member_join's answer as 0005 builds it (jsonb_build_object … 'brand', _brand_json(g)). */
const JOIN = {
  memberId: '0c3da4e8-3bfe-49f8-a6b8-e9e6116a5120',
  memberKey: '5badd76034e8ceaf0c1be1fbaaddb1a5d5c5ff352970eee6',
  gymId: '72d67a54-71bc-4b3c-be5e-df4d49c96bcf',
  gymName: "RAM'S FITNESS CLUB IMPACT",
  joinCode: 'RAMS01',
  name: 'Asha',
  brand: { accent: '#F7D411', bg: '#0A0A0C', logoUrl: LOGO, heading: 'bold-italic', updatedAt: '2026-10-13T10:00:00.123+00:00' },
};
/** member_me's answer (no key, otherwise the same). */
const ME = { memberId: JOIN.memberId, gymId: JOIN.gymId, gymName: JOIN.gymName, joinCode: 'RAMS01', name: 'Asha', brand: JOIN.brand };
/** An unbranded gym (FORGE1): the brand object is all nulls. */
const PLAIN_BRAND = { accent: null, bg: null, logoUrl: null, heading: 'normal', updatedAt: null };

describe('member_join / member_me carry the gym brand', () => {
  it('the join keeps the brand on the link', () => {
    const link = linkFromJoin(JOIN);
    expect(link?.brand).toEqual({ accent: '#F7D411', bg: '#0A0A0C', logoUrl: LOGO, heading: 'bold-italic', updatedAt: JOIN.brand.updatedAt });
  });

  it('an unbranded gym leaves no brand on the link', () => {
    expect(linkFromJoin({ ...JOIN, brand: PLAIN_BRAND })).not.toHaveProperty('brand');
    expect(linkFromJoin({ ...JOIN, brand: undefined })).not.toHaveProperty('brand');
  });

  it('member_me is read as the gym now; junk is nothing', () => {
    expect(gymNowFromMe(ME)).toEqual({ gymId: JOIN.gymId, gymName: JOIN.gymName, brand: linkFromJoin(JOIN)?.brand });
    expect(gymNowFromMe({ ...ME, brand: PLAIN_BRAND })?.brand).toBeNull();
    expect(gymNowFromMe(null)).toBeNull();
    expect(gymNowFromMe({ gymName: 'x' })).toBeNull();
  });

  it('member_me changes the link only when the name or the look changed', () => {
    const link = linkFromJoin(JOIN)!;
    expect(linkWithNow(link, gymNowFromMe({ ...ME, brand: { ...JOIN.brand, updatedAt: 'later' } })!)).toBe(link);
    const red = linkWithNow(link, gymNowFromMe({ ...ME, brand: { ...JOIN.brand, accent: '#D32F2F' } })!);
    expect(red).not.toBe(link);
    expect(red.brand?.accent).toBe('#D32F2F');
    expect(red.memberKey).toBe(link.memberKey);
    const cleared = linkWithNow(link, gymNowFromMe({ ...ME, brand: PLAIN_BRAND })!);
    expect(cleared).not.toHaveProperty('brand');
    // Another gym's answer never rewrites this link.
    expect(linkWithNow(link, { gymId: 'other', gymName: 'Other', brand: null })).toBe(link);
  });

  it('the brand survives the phone saving and reading the link', () => {
    const link = linkFromJoin(JOIN)!;
    const back = cleanGymBlob(JSON.parse(JSON.stringify({ link, products: [], productsAt: null, orders: [], bag: [] })));
    expect(back.link).toEqual(link);
  });
});

describe('the migration (0005_gym_theme.sql) keeps its side of the contract', () => {
  const fn = (name: string) => {
    const at = SQL.indexOf(`function public.${name}(`);
    expect(at).toBeGreaterThan(-1);
    return SQL.slice(at, SQL.indexOf('end $$;', at));
  };

  it('member_join, member_me and owner_gym all answer with the brand', () => {
    for (const f of ['member_join', 'member_me', 'owner_gym']) expect(fn(f)).toMatch(/'brand',\s*public\._brand_json\(g\)/);
  });

  it('the brand object has exactly the keys the shared parser reads', () => {
    const body = SQL.slice(SQL.indexOf('function public._brand_json('));
    for (const key of ['accent', 'bg', 'logoUrl', 'heading', 'updatedAt']) expect(body).toContain(`'${key}'`);
  });

  it('only the owner key sets the brand, with checked colours, logo and heading', () => {
    const body = fn('owner_set_brand');
    expect(body).toMatch(/_owner_gym\(p_key\)/);
    expect(body).toMatch(/_brand_hex\(p_accent\)/);
    expect(body).toMatch(/_logo_url_ok\(u\)/);
    expect(body).toMatch(/BAD_HEADING/);
    expect(SQL).toMatch(/grant execute on function public\.owner_set_brand\(text, text, text, text, text\)\s+to anon, authenticated/);
    expect(SQL).toMatch(/gym-logos\/\[0-9a-f\]\{48\}\//);
  });

  it('is additive: no drop table, no drop column', () => {
    expect(SQL).not.toMatch(/drop\s+(table|column)/i);
    expect(SQL.match(/add column if not exists/g)?.length).toBe(5);
  });

  it("seeds RAM'S FITNESS CLUB IMPACT (RAMS01) in their colours, and leaves FORGE1 alone", () => {
    expect(SQL).toContain("'RAM''S FITNESS CLUB IMPACT', 'RAMS01'");
    expect(SQL).toMatch(/brand_accent = '#F7D411', brand_bg = '#0A0A0C', brand_heading = 'bold-italic'/);
    expect(SQL).not.toContain("'FORGE1'");
  });
});
