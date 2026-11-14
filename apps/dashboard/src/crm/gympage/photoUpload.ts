/**
 * F207 "Your web page" photos, the browser half (R-529): a picked photo is drawn on a canvas at most 1600 px on its long
 * side and saved again as WebP. Drawing it again keeps only the pixels: the camera's notes (EXIF: the place it was taken,
 * the phone, the time) never leave this computer. Then it goes into its slot in the private bucket (api.ts). The
 * sideways-photo note is applied first (imageOrientation), so the gym is not lying down.
 */
import { checkSourceFile, fitWithin } from '../shop/photo';
import { photoSlot, putPhoto, type PhotoSlot } from './api';
import { isNoSuchFunction } from '../logic/workoutOffer';
import { thrownWords } from './logic';

export const PHOTO_EDGE = 1600;
/** The bucket takes at most 1 MB; a photo is tried again smaller until it fits. */
export const PHOTO_MAX_BYTES = 1024 * 1024;
const TRIES: readonly { edge: number; quality: number }[] = [
  { edge: PHOTO_EDGE, quality: 0.8 },
  { edge: PHOTO_EDGE, quality: 0.65 },
  { edge: 1200, quality: 0.65 },
  { edge: 900, quality: 0.6 },
];

/** A failure whose message is already plain words for the owner. */
export class PagePhotoError extends Error {}

type Drawable = { source: CanvasImageSource; width: number; height: number; close?: () => void };

async function decode(file: Blob): Promise<Drawable> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() };
    } catch (e) {
      // Older browsers reject the option, or the format: fall through to <img>.
      console.warn('[web page] createImageBitmap could not read the photo; trying <img>', e);
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return { source: img, width: img.naturalWidth, height: img.naturalHeight };
  } catch (e) {
    console.warn('[web page] the photo could not be decoded', e);
    throw new PagePhotoError('This photo can’t be read here (iPhone HEIC photos often can’t). Save it as JPEG and try again.');
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

function encode(pic: Drawable, edge: number, quality: number): Promise<Blob | null> {
  const { width, height } = fitWithin(pic.width, pic.height, edge);
  if (!width || !height) throw new PagePhotoError('That photo looks empty. Pick another one.');
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new PagePhotoError('This browser can’t open photos. Try Chrome.');
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, width, height);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(pic.source, 0, 0, width, height);
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', quality));
}

/** The photo as WebP, at most 1600 px and 1 MB, with nothing but its pixels. Throws PagePhotoError. */
export async function shrinkPagePhoto(file: File): Promise<Blob> {
  const bad = checkSourceFile(file);
  if (bad) throw new PagePhotoError(bad);
  const pic = await decode(file);
  try {
    for (const t of TRIES) {
      const blob = await encode(pic, t.edge, t.quality);
      // A browser that cannot write WebP hands back a PNG instead (older Safari).
      if (!blob || blob.type !== 'image/webp') throw new PagePhotoError('This browser can’t prepare the photo. Try Chrome on a phone or computer.');
      if (blob.size <= PHOTO_MAX_BYTES) return blob;
    }
    throw new PagePhotoError('That photo is still too big after making it smaller. Pick a simpler one.');
  } finally {
    pic.close?.();
  }
}

/** Shrink, take a slot, upload. Returns the photo's page address and the shrunk file (to show at once). */
export async function uploadPagePhoto(ownerKey: string, file: File): Promise<{ slot: PhotoSlot; blob: Blob }> {
  const blob = await shrinkPagePhoto(file);
  try {
    const slot = await photoSlot(ownerKey);
    await putPhoto(slot.path, blob);
    return { slot, blob };
  } catch (e) {
    console.warn('[ForgeErr] web page: photo upload', e);
    // The gym server has the page (0080) but not yet its photo part (0082): say so, not "check your internet".
    if (isNoSuchFunction(e)) throw new PagePhotoError('Adding photos is not switched on for your gym yet. Save the rest of your page now and add photos later.');
    throw new PagePhotoError(thrownWords(e) ?? 'The photo could not be sent. Check your internet and try again.');
  }
}
