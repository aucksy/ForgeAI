/**
 * The browser half of the desk photo (F107): cut a camera frame or a picked picture to its centre
 * square and shrink it to a small JPEG (about 400 px, under ~60 KB) before anything is sent.
 * The sizes and qualities tried, in order, are logic/memberPhoto.ts SHRINK_STEPS (unit-tested there).
 */

import {
  centreSquare,
  checkPickedFile,
  nextShrinkStep,
  outputSide,
  photoFits,
  SHRINK_STEPS,
} from '../logic/memberPhoto';
import { MemberPhotoError } from '../shop/memberPhotoApi';

type Drawable = { source: CanvasImageSource; width: number; height: number; close?: () => void };

function encode(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
}

/**
 * Draw the centre square of `pic`, then try SHRINK_STEPS until the JPEG is small enough.
 * `mirror` flips it left-right (never used for the saved photo of a camera: a front camera's
 * preview is mirrored, the photo itself must not be).
 */
export async function shrinkToSquare(pic: Drawable, mirror = false): Promise<Blob> {
  const { sx, sy, side } = centreSquare(pic.width, pic.height);
  if (!side) throw new MemberPhotoError('That photo looks empty. Try again.'); // member-words
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new MemberPhotoError('This browser can’t make photos. Try Chrome.'); // member-words
  let step = 0;
  let last: Blob | null = null;
  for (;;) {
    const s = SHRINK_STEPS[step];
    const out = outputSide(side, s.side);
    canvas.width = out;
    canvas.height = out;
    // JPEG has no see-through parts: a transparent PNG would turn black without a white floor.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, out, out);
    if (mirror) ctx.setTransform(-1, 0, 0, 1, out, 0);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(pic.source, sx, sy, side, side, 0, 0, out, out);
    last = await encode(canvas, s.quality);
    if (!last) throw new MemberPhotoError('That photo couldn’t be made. Try again.'); // member-words
    const next = nextShrinkStep(step, last.size);
    if (next === null) break;
    step = next;
  }
  if (!photoFits(last.size)) throw new MemberPhotoError('That photo is too big to save. Try again.'); // member-words
  return last;
}

/** The current frame of a playing camera, as the saved photo (never mirrored). */
export function shrinkVideoFrame(video: HTMLVideoElement): Promise<Blob> {
  return shrinkToSquare({ source: video, width: video.videoWidth, height: video.videoHeight });
}

async function decodeFile(file: Blob): Promise<Drawable> {
  // Phone photos are often stored sideways with an EXIF "rotate me" note; 'from-image' applies it.
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() };
    } catch {
      // quiet: older browsers reject the option or the format; the <img> below tries next
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
    console.warn('[member photos] a picked picture could not be opened', e);
    throw new MemberPhotoError('This photo can’t be opened here (iPhone HEIC photos often can’t). Pick a JPG or PNG picture.'); // member-words
  } finally {
    // The <img> has decoded; its pixels stay usable after the address is released.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

/** A picked picture file, cut square and shrunk. Throws MemberPhotoError (plain words). */
export async function shrinkPickedFile(file: File): Promise<Blob> {
  const bad = checkPickedFile(file);
  if (bad) throw new MemberPhotoError(bad);
  const pic = await decodeFile(file);
  try {
    return await shrinkToSquare(pic);
  } finally {
    pic.close?.();
  }
}
