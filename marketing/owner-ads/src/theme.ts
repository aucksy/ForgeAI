import { Easing } from 'remotion';
import { loadFont } from '@remotion/google-fonts/Manrope';

// Brand headlines: Manrope ExtraBold, sentence case, tight (branding/mettleup/BRAND.md).
export const { fontFamily: MANROPE } = loadFont('normal', { weights: ['600', '700', '800'], subsets: ['latin', 'latin-ext'] });

export const FPS = 30;
export const W = 1080;
export const H = 1920;

export const C = {
  steel: '#1B1F26',
  ink: '#0C0E12',
  iron: '#E8EAEE',
  grey: '#B9BFC8',
  molten: '#FF8A4C',
  forge: '#F0662A',
  slag: '#C9481A',
  ember: '#E0581F',
};

/** One easing for the whole campaign: fast away, long soft landing. */
export const EASE = Easing.bezier(0.16, 1, 0.3, 1);
export const clampOpts = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
export const easeOpts = { ...clampOpts, easing: EASE } as const;

export const sec = (s: number) => Math.round(s * FPS);
