/**
 * F107 desk photo (29 Oct 2026): the pure rules behind "Take photo" — the centre square, the shrink
 * ladder that keeps a photo small, the camera's refusals in plain words, the server's answers, and
 * that no new desk-facing line uses a banned word.
 */
import { describe, expect, it } from 'vitest';

import {
  PHOTO_SERVER_MAX_BYTES,
  PHOTO_SIDE,
  PHOTO_TARGET_BYTES,
  PICKED_FILE_MAX_BYTES,
  SHRINK_STEPS,
  bytesToBase64,
  cameraTrouble,
  cameraTroubleWords,
  centreSquare,
  checkPickedFile,
  jpegDataUrl,
  looksLikeJpeg,
  nextShrinkStep,
  outputSide,
  photoFits,
  photoReadBatches,
  photoRowsFromAnswer,
  photoServerWords,
  type CameraTrouble,
} from '../../src/crm/logic/memberPhoto';
import { CAMERA_WORDS } from '../../src/crm/ui/DeskCameraSheet';
import { FORM_PHOTO_WORDS } from '../../src/crm/ui/forms/MemberFormSheet';
import { MEMBER_PHOTO_WORDS } from '../../src/crm/ui/screens/MemberDetail';

describe('centreSquare / outputSide', () => {
  it('cuts the middle square of a landscape webcam frame', () => {
    expect(centreSquare(1280, 720)).toEqual({ sx: 280, sy: 0, side: 720 });
  });
  it('cuts the middle square of a portrait phone photo', () => {
    expect(centreSquare(3000, 4000)).toEqual({ sx: 0, sy: 500, side: 3000 });
  });
  it('leaves a square alone and copes with nothing', () => {
    expect(centreSquare(400, 400)).toEqual({ sx: 0, sy: 0, side: 400 });
    expect(centreSquare(0, 0)).toEqual({ sx: 0, sy: 0, side: 0 });
    expect(centreSquare(-5, 10)).toEqual({ sx: 0, sy: 5, side: 0 });
  });
  it('never blows a small camera up, and caps a big one at 400', () => {
    expect(outputSide(240)).toBe(240);
    expect(outputSide(720)).toBe(PHOTO_SIDE);
    expect(outputSide(399.7)).toBe(399);
    expect(outputSide(1000, 300)).toBe(300);
  });
});

describe('the shrink ladder', () => {
  it('starts at 400 px and only ever gets smaller or rougher', () => {
    expect(SHRINK_STEPS[0].side).toBe(PHOTO_SIDE);
    for (let i = 1; i < SHRINK_STEPS.length; i++) {
      expect(SHRINK_STEPS[i].side).toBeLessThanOrEqual(SHRINK_STEPS[i - 1].side);
      expect(SHRINK_STEPS[i].quality).toBeLessThan(SHRINK_STEPS[i - 1].quality);
    }
  });
  it('stops as soon as a try is under the 60 KB target', () => {
    expect(nextShrinkStep(0, 30_000)).toBeNull();
    expect(nextShrinkStep(0, PHOTO_TARGET_BYTES)).toBeNull();
  });
  it('moves to the next try when still too big, and gives up after the last', () => {
    expect(nextShrinkStep(0, PHOTO_TARGET_BYTES + 1)).toBe(1);
    expect(nextShrinkStep(SHRINK_STEPS.length - 2, 90_000)).toBe(SHRINK_STEPS.length - 1);
    expect(nextShrinkStep(SHRINK_STEPS.length - 1, 90_000)).toBeNull();
  });
  it('walks the whole ladder for a stubborn picture, ending on the smallest try', () => {
    let step = 0;
    let tries = 1;
    for (let next = nextShrinkStep(step, 200_000); next !== null; next = nextShrinkStep(step, 200_000)) {
      step = next;
      tries++;
    }
    expect(tries).toBe(SHRINK_STEPS.length);
    expect(SHRINK_STEPS[step].side).toBe(280);
  });
  it('sends only what the server accepts (1 byte to 100,000)', () => {
    expect(photoFits(0)).toBe(false);
    expect(photoFits(1)).toBe(true);
    expect(photoFits(PHOTO_SERVER_MAX_BYTES)).toBe(true);
    expect(photoFits(PHOTO_SERVER_MAX_BYTES + 1)).toBe(false);
  });
});

describe('checkPickedFile', () => {
  it('accepts ordinary photos, even with no type from the browser', () => {
    expect(checkPickedFile({ size: 2_000_000, type: 'image/jpeg', name: 'a.jpg' })).toBeNull();
    expect(checkPickedFile({ size: 500_000, type: 'image/png' })).toBeNull();
    expect(checkPickedFile({ size: 3_000_000, type: '', name: 'IMG_0001.HEIC' })).toBeNull();
  });
  it('refuses empty, huge and non-picture files in plain words', () => {
    expect(checkPickedFile({ size: 0, type: 'image/jpeg' })).toMatch(/empty/);
    expect(checkPickedFile({ size: PICKED_FILE_MAX_BYTES + 1, type: 'image/jpeg' })).toMatch(/too big/);
    expect(checkPickedFile({ size: 1000, type: 'application/pdf', name: 'id.pdf' })).toMatch(/not a photo/);
  });
});

describe('camera trouble', () => {
  it('sorts the browser errors', () => {
    expect(cameraTrouble('NotAllowedError')).toBe('refused');
    expect(cameraTrouble('PermissionDeniedError')).toBe('refused');
    expect(cameraTrouble('SecurityError')).toBe('refused');
    expect(cameraTrouble('NotFoundError')).toBe('none');
    expect(cameraTrouble('OverconstrainedError')).toBe('none');
    expect(cameraTrouble('NotReadableError')).toBe('busy');
    expect(cameraTrouble('TypeError')).toBe('unsupported');
    expect(cameraTrouble('Whatever')).toBe('other');
    expect(cameraTrouble(undefined)).toBe('other');
  });
  it('always points the desk at Upload a photo', () => {
    const all: CameraTrouble[] = ['refused', 'none', 'busy', 'unsupported', 'other'];
    for (const t of all) expect(cameraTroubleWords(t)).toContain('Upload a photo');
  });
});

describe('server answers', () => {
  it('turns the server refusals into plain words, and leaves others to the caller', () => {
    expect(photoServerWords(new Error('TOO_BIG'))).toMatch(/too big/);
    expect(photoServerWords({ message: 'BAD_PHOTO' })).toMatch(/couldn’t be saved/);
    expect(photoServerWords('NO_MEMBER')).toMatch(/isn’t saved online/);
    expect(photoServerWords(new Error('network down'))).toBeNull();
    expect(photoServerWords(null)).toBeNull();
  });
  it('reads rows, skipping anything malformed', () => {
    const rows = photoRowsFromAnswer([
      { memberId: 'm1', jpeg: '/9j/AA\nBB', updatedAt: 5 },
      { memberId: 'm2', jpeg: '' },
      { memberId: 3, jpeg: 'x' },
      null,
      'junk',
      { memberId: 'm4', jpeg: '/9j/' },
    ]);
    expect(rows).toEqual([
      { memberId: 'm1', dataUrl: 'data:image/jpeg;base64,/9j/AABB', updatedAt: 5 },
      { memberId: 'm4', dataUrl: 'data:image/jpeg;base64,/9j/', updatedAt: 0 },
    ]);
    expect(photoRowsFromAnswer({ not: 'a list' })).toEqual([]);
    expect(jpegDataUrl('ab cd')).toBe('data:image/jpeg;base64,abcd');
  });
});

describe('bytes', () => {
  it('base64s like the browser does, including big arrays', () => {
    expect(bytesToBase64(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('/9j/4A==');
    const big = new Uint8Array(100_000).map((_, i) => i % 256);
    expect(atob(bytesToBase64(big)).length).toBe(100_000);
    expect(bytesToBase64(new Uint8Array())).toBe('');
  });
  it('knows a JPEG by its first bytes', () => {
    expect(looksLikeJpeg(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe(true);
    expect(looksLikeJpeg(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe(false);
    expect(looksLikeJpeg(new Uint8Array([0xff, 0xd8]))).toBe(false);
  });
  it('batches ids under the server limit, without duplicates or blanks', () => {
    const ids = Array.from({ length: 95 }, (_, i) => `m${i}`);
    const batches = photoReadBatches([...ids, 'm1', '', 'm2']);
    expect(batches.map((b) => b.length)).toEqual([40, 40, 15]);
    expect(batches.flat()).toEqual(ids);
    expect(photoReadBatches([])).toEqual([]);
  });
});

describe('desk-facing words', () => {
  const lines: string[] = [
    ...Object.values(CAMERA_WORDS),
    ...Object.values(MEMBER_PHOTO_WORDS),
    ...Object.values(FORM_PHOTO_WORDS).map((w) => (typeof w === 'function' ? w('Asha', 'Try again.') : w)),
    ...(['refused', 'none', 'busy', 'unsupported', 'other'] as CameraTrouble[]).map(cameraTroubleWords),
    ...['TOO_BIG', 'BAD_PHOTO', 'NO_MEMBER'].map((c) => photoServerWords(c) ?? ''),
    checkPickedFile({ size: 0, type: '' }) ?? '',
    checkPickedFile({ size: PICKED_FILE_MAX_BYTES + 1, type: 'image/png' }) ?? '',
    checkPickedFile({ size: 1, type: 'text/plain' }) ?? '',
  ];
  it('never uses the banned words', () => {
    expect(lines.length).toBeGreaterThan(30);
    for (const line of lines) {
      expect(line).not.toMatch(/\bvolume\b/i);
      expect(line).not.toMatch(/\bPRs?\b/);
      expect(line).not.toMatch(/\bsessions?\b/i);
    }
  });
});
