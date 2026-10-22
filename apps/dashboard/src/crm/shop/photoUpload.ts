/**
 * Product photos — the browser half: shrink a picked file on a canvas, then put it
 * in the public bucket with a one-time upload ticket. Rules live in `photo.ts`.
 */

import { savedPictureUrl, supabase } from '../../lib/supabase';
import { photoTicket } from './api';
import {
  checkEncodedPhoto,
  checkSourceFile,
  fitWithin,
  JPEG_QUALITY,
  newPhotoName,
  PHOTO_BUCKET,
  photoPath,
  uploadErrorWords,
} from './photo';

/** A failure whose message is already plain words for the owner. */
export class PhotoError extends Error {}

type Drawable = { source: CanvasImageSource; width: number; height: number; close?: () => void };

async function decode(file: Blob): Promise<Drawable> {
  // Phone photos are often stored sideways with an EXIF "rotate me" note;
  // `imageOrientation: 'from-image'` applies it so the product is not lying down.
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() };
    } catch {
      // Older browsers reject the option, or the format: fall through to <img>.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return { source: img, width: img.naturalWidth, height: img.naturalHeight };
  } catch {
    throw new PhotoError(
      'This photo can’t be read here (iPhone HEIC photos often can’t). Save it as JPEG or PNG and try again.',
    );
  } finally {
    // The <img> has decoded; its pixels stay usable after the URL is released.
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

/** Shrink to at most 1000 px on the long side and re-encode as JPEG 0.82. */
export async function shrinkPhoto(file: File): Promise<Blob> {
  const bad = checkSourceFile(file);
  if (bad) throw new PhotoError(bad);
  const pic = await decode(file);
  try {
    const { width, height } = fitWithin(pic.width, pic.height);
    if (!width || !height) throw new PhotoError('That photo looks empty. Pick another one.');
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new PhotoError('This browser can’t open photos. Try Chrome.');
    // JPEG has no transparency: a see-through PNG would turn black without this.
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, width, height);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(pic.source, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
    if (!blob) throw new PhotoError('That photo could not be used. Try a JPEG or PNG picture.');
    const tooBig = checkEncodedPhoto(blob);
    if (tooBig) throw new PhotoError(tooBig);
    return blob;
  } finally {
    pic.close?.();
  }
}

function randomHex(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID().replace(/-/g, '');
  const bytes = new Uint8Array(16);
  if (c && typeof c.getRandomValues === 'function') c.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Shrink, upload, and return the photo's public URL. Throws PhotoError (plain words). */
export async function uploadProductPhoto(ownerKey: string, file: File): Promise<string> {
  const blob = await shrinkPhoto(file);
  try {
    const ticket = await photoTicket(ownerKey);
    const path = photoPath(ticket, newPhotoName(randomHex));
    const { error } = await supabase.storage
      .from(PHOTO_BUCKET)
      .upload(path, blob, { contentType: 'image/jpeg', upsert: false, cacheControl: '31536000' });
    if (error) throw error;
    // Not getPublicUrl: on our site the client's address is ours (/sb), and the server pins the host.
    return savedPictureUrl(PHOTO_BUCKET, path);
  } catch (e) {
    if (e instanceof PhotoError) throw e;
    throw new PhotoError(uploadErrorWords(e));
  }
}
