/**
 * Voice first, then timing (D:/Brain/Lessons/remotion-reel-pipeline.md): every scene boundary is
 * derived from the measured length of the real voice files in public/audio/vo.json.
 */
import copy from './copy.json';
import vo from '../public/audio/vo.json';
import { sec } from './theme';

export type Line = { say: string; show: string };
export type Ad = {
  id: string;
  hook: string[];
  accent: number[];
  hi: string;
  lines: Line[];
  payoff: string[];
  proof: string[];
};

export const ADS = (copy as { ads: Ad[] }).ads;

const GAP = 0.3; // breath between two lines
const LEAD = 0.15; // the first word lands almost at once: the hook must read in 2 s
const TAIL = 1.15; // the end card holds after the last word

export type Timing = {
  /** start frame and length in frames of each voice line */
  lines: { from: number; dur: number }[];
  /** phase starts: A hook, B first product beat, C second beat, D end card */
  A: number;
  B: number;
  C: number;
  D: number;
  total: number;
};

/**
 * Ads with no voice files (yet): the render plays music only and times the lines by the planned
 * lengths in vo.json. scripts/voice-pack.mjs fills it in the cloud render (`voice` input).
 */
export function hasVoice(id: string): boolean {
  const off = (vo as unknown as { _novoice?: string[] })._novoice ?? [];
  return !off.includes(id);
}

export function timing(id: string): Timing {
  const lens = (vo as unknown as Record<string, number[]>)[id];
  if (!lens) throw new Error(`no voice lengths for ${id}: run scripts/generate-vo.mjs`);
  let t = LEAD;
  const lines = lens.map((s) => {
    const l = { from: sec(t), dur: Math.ceil(s * 30) };
    t += s + GAP;
    return l;
  });
  const last = lines[lines.length - 1];
  return {
    lines,
    A: 0,
    B: lines[1].from - 6,
    C: lines[2].from - 6,
    D: lines[3].from - 12,
    total: last.from + last.dur + sec(TAIL),
  };
}
