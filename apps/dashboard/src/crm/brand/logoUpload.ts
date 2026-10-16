/**
 * Gym logo — the browser half: shrink a picked picture to at most 512 px as a PNG (a logo's
 * see-through background is kept; a product photo turns JPEG on white, a logo must not), then put
 * it in the public `gym-logos` bucket with a one-time upload ticket — the same ticket and the same
 * decode step as product photos (shop/photoUpload.ts). Rules live in `brandLogic.ts`.
 */

import { supabase } from '../../lib/supabase';
import { photoTicket } from '../shop/api';
import { checkSourceFile, fitWithin } from '../shop/photo';
import { brandErrorWords, checkEncodedLogo, LOGO_BUCKET, LOGO_EDGE, logoPath, newLogoName } from './brandLogic';

/** A failure whose message is already plain words for the owner. */
export class LogoError extends Error {}

async function decode(file: Blob): Promise<{ source: CanvasImageSource; width: number; height: number; close?: () => void }> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(file);
      return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() };
    } catch {
      // Fall through to <img> (SVG logos, older browsers).
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    // An SVG may report 0×0: draw it at the logo size.
    const w = img.naturalWidth || LOGO_EDGE;
    const h = img.naturalHeight || LOGO_EDGE;
    return { source: img, width: w, height: h };
  } catch {
    throw new LogoError('This picture can’t be read here. Save the logo as PNG and try again.');
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

/** Shrink to at most 512 px on the long side, as PNG (transparency kept). */
export async function shrinkLogo(file: File): Promise<Blob> {
  const bad = checkSourceFile(file);
  if (bad) throw new LogoError(bad.replace('photo', 'picture'));
  const pic = await decode(file);
  try {
    const { width, height } = fitWithin(pic.width, pic.height, LOGO_EDGE);
    if (!width || !height) throw new LogoError('That picture looks empty. Pick another one.');
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new LogoError('This browser can’t open pictures. Try Chrome.');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(pic.source, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new LogoError('That logo could not be used. Try a PNG or JPEG picture.');
    const tooBig = checkEncodedLogo(blob);
    if (tooBig) throw new LogoError(tooBig);
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

/** Shrink, upload, and return the logo's public URL. Throws LogoError (plain words). */
export async function uploadGymLogo(ownerKey: string, file: File): Promise<string> {
  const blob = await shrinkLogo(file);
  try {
    const ticket = await photoTicket(ownerKey);
    const path = logoPath(ticket, newLogoName(randomHex));
    const { error } = await supabase.storage
      .from(LOGO_BUCKET)
      .upload(path, blob, { contentType: 'image/png', upsert: false, cacheControl: '31536000' });
    if (error) throw error;
    return supabase.storage.from(LOGO_BUCKET).getPublicUrl(path).data.publicUrl;
  } catch (e) {
    if (e instanceof LogoError) throw e;
    throw new LogoError(brandErrorWords(e));
  }
}
