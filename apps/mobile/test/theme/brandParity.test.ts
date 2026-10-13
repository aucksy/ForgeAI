/**
 * Gym branding: the shared palette engine (packages/theme/src/brand.ts) measures and derives
 * against the PHONE's own values. If tokens.ts (or the frozen primary button's ink) ever changes,
 * the engine's copies must change with it — this fails first.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { BUTTON_INK, FORGE_PLANES, FORGE_SERIES, PHONE_INK } from '@forgeai/theme';

import { chart, color, gradients } from '@/theme/tokens';

describe('palette engine ↔ the phone tokens', () => {
  it('planes and chart lines', () => {
    expect(FORGE_PLANES).toEqual({
      bg: color.bg,
      surface: color.surface,
      surfaceRaised: color.surfaceRaised,
      surfaceSunken: color.surfaceSunken,
      steelTop: gradients.steel[0],
      backdropTop: gradients.backdrop[0],
      grid: color.grid,
      axis: color.axis,
    });
    expect(gradients.steel[1]).toBe(color.surface);
    expect(gradients.backdrop[1]).toBe(color.bg);
  });

  it('text greys', () => {
    expect(PHONE_INK).toEqual({ ink: color.ink, inkSecondary: color.inkSecondary, inkMuted: color.inkMuted, inkFaint: color.inkFaint });
  });

  it('chart slots', () => {
    expect([...FORGE_SERIES]).toEqual([...chart.series]);
  });

  it("the primary button's ink (frozen) and the ink on the accent", () => {
    const button = readFileSync(resolve(__dirname, '../../src/components/ui/PrimaryButton.tsx'), 'utf8');
    expect(button).toContain(`const INK_ON_EMBER = '${BUTTON_INK}';`);
    expect(color.onAccent).toBe(BUTTON_INK);
  });
});
