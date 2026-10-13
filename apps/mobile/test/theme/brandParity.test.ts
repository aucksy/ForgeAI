/**
 * Gym branding: the shared palette engine (packages/theme/src/brand.ts) measures and derives
 * against the PHONE's own values. If tokens.ts (or the frozen primary button's ink) ever changes,
 * the engine's copies must change with it — this fails first.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { BUTTON_INK, FORGE_PLANES, FORGE_SERIES, PHONE_INK, buildBrandPalette } from '@forgeai/theme';

import { chart, color, gradients, shadow } from '@/theme/tokens';

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

  it("D9: the engine's ForgeAI palette (logo-only gyms) is exactly the phone's own tokens", () => {
    const p = buildBrandPalette({ accent: color.accent });
    for (const k of Object.keys(p.color) as (keyof typeof p.color)[]) expect(p.color[k], k).toBe((color as Record<string, string>)[k]);
    expect(p.gradients).toEqual({
      ember: [...gradients.ember],
      emberSubtle: [...gradients.emberSubtle],
      steel: [...gradients.steel],
      backdrop: [...gradients.backdrop],
    });
    expect(p.glow).toBe(shadow.glow.shadowColor);
    expect(p.chart).toEqual({ series: [...chart.series], ramp: [...chart.ramp], diverging: { ...chart.diverging } });
  });

  it("the primary button's ink (frozen) and the ink on the accent", () => {
    const button = readFileSync(resolve(__dirname, '../../src/components/ui/PrimaryButton.tsx'), 'utf8');
    expect(button).toContain(`const INK_ON_EMBER = '${BUTTON_INK}';`);
    expect(color.onAccent).toBe(BUTTON_INK);
  });
});
