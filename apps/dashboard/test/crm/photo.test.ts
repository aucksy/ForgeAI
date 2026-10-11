/**
 * Product photos — the pure rules. Contract: supabase/migrations/0004_product_photos.sql
 * (public bucket, JPEG/PNG/WebP up to 3 MB, `<48-hex ticket>/<name>` paths, no overwrite).
 */

import { describe, expect, it } from 'vitest';

import { draftFromProduct, productFromRow, validateDraft } from '../../src/crm/shop/logic';
import {
  checkEncodedPhoto,
  checkSourceFile,
  fitWithin,
  isPhotoUrl,
  MAX_PHOTO_BYTES,
  newPhotoName,
  photoPath,
  uploadErrorWords,
} from '../../src/crm/shop/photo';

const TICKET = 'a1'.repeat(24);
const URL_OK = `https://hdxzqbdiokjklnypfisq.supabase.co/storage/v1/object/public/product-photos/${TICKET}/0f3c9a.jpg`;

describe('picking a file', () => {
  it('takes pictures, refuses everything else in plain words', () => {
    expect(checkSourceFile({ type: 'image/jpeg', size: 4_000_000 })).toBeNull();
    expect(checkSourceFile({ type: 'image/png', size: 10 })).toBeNull();
    // Some systems send no type for a HEIC; the name still says it is a photo.
    expect(checkSourceFile({ type: '', size: 2_000_000, name: 'IMG_0042.HEIC' })).toBeNull();
    expect(checkSourceFile({ type: 'application/pdf', size: 1000, name: 'menu.pdf' })).toMatch(/isn’t a photo/);
    expect(checkSourceFile({ type: 'image/jpeg', size: 0 })).toMatch(/empty/);
    expect(checkSourceFile({ type: 'image/jpeg', size: 41 * 1024 * 1024 })).toMatch(/too big/);
  });

  it('checks the shrunk photo against the bucket rules', () => {
    expect(checkEncodedPhoto({ type: 'image/jpeg', size: 300_000 })).toBeNull();
    expect(checkEncodedPhoto({ type: 'image/jpeg', size: MAX_PHOTO_BYTES })).toBeNull();
    expect(checkEncodedPhoto({ type: 'image/jpeg', size: MAX_PHOTO_BYTES + 1 })).toMatch(/3 MB/);
    expect(checkEncodedPhoto({ type: 'image/gif', size: 1000 })).toBeTruthy();
  });
});

describe('shrinking', () => {
  it('fits the long side inside 1000 px and keeps the shape', () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: 1000, height: 750 });
    expect(fitWithin(3024, 4032)).toEqual({ width: 750, height: 1000 });
    expect(fitWithin(2000, 2000)).toEqual({ width: 1000, height: 1000 });
  });

  it('never enlarges a small photo, never returns zero for a sliver', () => {
    expect(fitWithin(640, 480)).toEqual({ width: 640, height: 480 });
    expect(fitWithin(10000, 3)).toEqual({ width: 1000, height: 1 });
    expect(fitWithin(0, 100)).toEqual({ width: 0, height: 0 });
  });
});

describe('names and links', () => {
  it('makes a fresh .jpg name the bucket accepts', () => {
    const name = newPhotoName(() => '3F2504E0-4F89-11D3-9A0C-0305E82C3301');
    expect(name).toBe('3f2504e04f8911d39a0c0305e82c3301.jpg');
    expect(name).toMatch(/^[A-Za-z0-9._-]{1,80}$/);
  });

  it('builds the ticket folder path and refuses a bad ticket or name', () => {
    expect(photoPath(TICKET, 'x.jpg')).toBe(`${TICKET}/x.jpg`);
    expect(() => photoPath('not-a-ticket', 'x.jpg')).toThrow();
    expect(() => photoPath(TICKET, '../x.jpg')).toThrow();
  });

  it('accepts only links inside our bucket, like the server', () => {
    expect(isPhotoUrl(URL_OK)).toBe(true);
    expect(isPhotoUrl('https://example.com/whey.jpg')).toBe(false);
    expect(isPhotoUrl(URL_OK.replace(TICKET, 'abc'))).toBe(false);
    expect(isPhotoUrl(`${URL_OK}/extra`)).toBe(false);
    expect(isPhotoUrl(null)).toBe(false);
  });
});

describe('the product keeps its photo', () => {
  const row = {
    product_id: 'p1',
    name: 'Whey',
    category: 'protein',
    price_p: 249900,
    options: [],
    stock: 4,
    updated_at: '2026-10-12T05:00:00+00:00',
    image_url: URL_OK,
  };

  it('reads image_url and sends it back on save, null when removed', () => {
    const p = productFromRow(row);
    expect(p.imageUrl).toBe(URL_OK);
    const kept = validateDraft(draftFromProduct(p));
    expect(kept.ok && kept.payload.imageUrl).toBe(URL_OK);
    const removed = validateDraft({ ...draftFromProduct(p), imageUrl: null });
    expect(removed.ok && removed.payload.imageUrl).toBeNull();
    expect(productFromRow({ ...row, image_url: null }).imageUrl).toBeNull();
  });
});

describe('upload error words', () => {
  it('never shows raw storage text', () => {
    const cases = [
      new TypeError('Failed to fetch'),
      { message: 'The object exceeded the maximum allowed size' },
      { message: 'mime type text/plain is not supported' },
      { message: 'new row violates row-level security policy' },
      { message: 'BUSY' },
    ];
    for (const c of cases) {
      const w = uploadErrorWords(c);
      expect(w).not.toMatch(/row-level|mime|exceeded|BUSY|Failed to fetch/);
      expect(w).toMatch(/^[A-Z].*\.$/);
    }
  });
});
