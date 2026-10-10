import path from 'node:path';
import { createRequire } from 'node:module';

import { describe, expect, it } from 'vitest';

import {
  MIN_TOUCH,
  TEXT_SCALE_CAP,
  deltaDirection,
  deltaWords,
  hitSlopFor,
  ringLabel,
  shouldAnnounce,
  statLabel,
  textCapProp,
  textScaleCap,
} from '@/components/ui/a11y';
import { type } from '@/theme/tokens';

const require = createRequire(import.meta.url);
const { textScaleTarget, withTextScale, ENTRIES } = require('../../../scripts/metro-text-scale.cjs') as {
  textScaleTarget: (root: string, origin: string | undefined, name: string) => string | null;
  withTextScale: (
    root: string,
    upstream?: (ctx: unknown, name: string, platform: string | null) => unknown,
  ) => (ctx: { originModulePath: string; resolveRequest: (...a: unknown[]) => unknown }, name: string, platform: string | null) => unknown;
  ENTRIES: Record<string, string>;
};

describe('Phase 7 — text grows with the phone, up to a sane cap (SH-21)', () => {
  it('body text, labels and captions grow the most', () => {
    for (const s of [type.size.caption, type.size.sub, type.size.body, type.size.h3]) {
      expect(textScaleCap(s)).toBe(TEXT_SCALE_CAP.body);
    }
    expect(TEXT_SCALE_CAP.body).toBeGreaterThanOrEqual(1.5);
  });

  it('text with no size of its own (the 14 sp default) is body text', () => {
    expect(textScaleCap(undefined)).toBe(TEXT_SCALE_CAP.body);
    expect(textScaleCap(null)).toBe(TEXT_SCALE_CAP.body);
    expect(textScaleCap(Number.NaN)).toBe(TEXT_SCALE_CAP.body);
  });

  it('bigger text grows less: headings, then page titles, then hero numerals', () => {
    expect(textScaleCap(type.size.h2)).toBe(TEXT_SCALE_CAP.heading);
    expect(textScaleCap(type.size.h1)).toBe(TEXT_SCALE_CAP.title);
    expect(textScaleCap(type.size.hero)).toBe(TEXT_SCALE_CAP.hero);
    expect(textScaleCap(64)).toBe(TEXT_SCALE_CAP.hero);
    expect(TEXT_SCALE_CAP.body).toBeGreaterThan(TEXT_SCALE_CAP.heading);
    expect(TEXT_SCALE_CAP.heading).toBeGreaterThan(TEXT_SCALE_CAP.title);
    expect(TEXT_SCALE_CAP.title).toBeGreaterThan(TEXT_SCALE_CAP.hero);
  });

  it('every cap still lets text grow (never 1 = frozen, never 0 = no cap at all)', () => {
    for (const cap of Object.values(TEXT_SCALE_CAP)) {
      expect(cap).toBeGreaterThan(1);
    }
  });

  it('at the phone\'s 200 % setting a 40 sp hero numeral stays under 50 sp, body reaches 24 sp', () => {
    expect(type.size.hero * Math.min(2, textScaleCap(type.size.hero))).toBeLessThan(50);
    expect(type.size.body * Math.min(2, textScaleCap(type.size.body))).toBe(24);
  });
});

describe('Phase 7 — the cap reaches every screen through the bundler', () => {
  const root = path.join('C:', 'app');
  const rnIndex = path.join('C:', 'repo', 'node_modules', 'react-native', 'index.js');

  it('points React Native\'s own Text and TextInput entries at the capped versions', () => {
    expect(textScaleTarget(root, rnIndex, './Libraries/Text/Text')).toBe(path.join(root, ENTRIES['./Libraries/Text/Text']));
    expect(textScaleTarget(root, rnIndex, './Libraries/Components/TextInput/TextInput')).toBe(
      path.join(root, 'src/components/ui/scaledTextInput.ts'),
    );
    // forward slashes too (Metro on macOS/Linux CI)
    expect(textScaleTarget(root, '/repo/node_modules/react-native/index.js', './Libraries/Text/Text')).not.toBeNull();
  });

  it('never redirects the capped file\'s own import of the real Text (no loop), nor anything else', () => {
    const own = path.join(root, 'src', 'components', 'ui', 'scaledText.tsx');
    expect(textScaleTarget(root, own, 'react-native/Libraries/Text/Text')).toBeNull();
    expect(textScaleTarget(root, own, './Libraries/Text/Text')).toBeNull();
    // react-native's internal pieces (Button, …) keep the real Text
    const button = path.join('C:', 'repo', 'node_modules', 'react-native', 'Libraries', 'Components', 'Button.js');
    expect(textScaleTarget(root, button, '../Text/Text')).toBeNull();
    expect(textScaleTarget(root, rnIndex, './Libraries/Components/View/View')).toBeNull();
    expect(textScaleTarget(root, undefined, './Libraries/Text/Text')).toBeNull();
  });

  it('the capped files exist where the bundler is told to look', async () => {
    const fs = await import('node:fs');
    const appRoot = path.resolve(__dirname, '../../..');
    for (const rel of Object.values(ENTRIES)) {
      expect(fs.existsSync(path.join(appRoot, rel))).toBe(true);
    }
  });

  it('hands every other request to the normal resolver, and leaves the web build alone', () => {
    const calls: string[] = [];
    const upstream = (_c: unknown, name: string) => {
      calls.push(name);
      return { type: 'sourceFile', filePath: `real:${name}` };
    };
    const resolve = withTextScale(root, upstream);
    const ctx = { originModulePath: rnIndex, resolveRequest: () => null };
    expect(resolve(ctx, './Libraries/Text/Text', 'android')).toEqual({
      type: 'sourceFile',
      filePath: path.join(root, 'src/components/ui/scaledText.tsx'),
    });
    expect(resolve(ctx, './Libraries/Text/Text', 'web')).toEqual({ type: 'sourceFile', filePath: 'real:./Libraries/Text/Text' });
    expect(resolve(ctx, 'react', 'android')).toEqual({ type: 'sourceFile', filePath: 'real:react' });
    expect(calls).toEqual(['./Libraries/Text/Text', 'react']);
  });

  it('falls back to Metro\'s own resolver when nothing else was set', () => {
    const resolve = withTextScale(root, undefined);
    const ctx = { originModulePath: '/x.js', resolveRequest: (_c: unknown, name: unknown) => `metro:${String(name)}` };
    expect(resolve(ctx, 'lodash', 'android')).toBe('metro:lodash');
  });
});

describe('Phase 7 — touch targets are at least 48 dp', () => {
  it('pads a small control out to 48 dp', () => {
    expect(MIN_TOUCH).toBe(48);
    expect(hitSlopFor(42)).toBe(3);
    expect(hitSlopFor(32)).toBe(8);
    expect(hitSlopFor(33)).toBe(8);
    expect(33 + 2 * hitSlopFor(33)).toBeGreaterThanOrEqual(48);
  });
  it('adds nothing to a control that is already big enough', () => {
    expect(hitSlopFor(48)).toBe(0);
    expect(hitSlopFor(60)).toBe(0);
  });
  it('a size of 0 or nonsense still gets a full 48 dp', () => {
    expect(hitSlopFor(0)).toBe(24);
    expect(hitSlopFor(Number.NaN)).toBe(24);
  });
});

describe('Phase 7 — a change is never told by colour alone', () => {
  it('reads the direction from the sign', () => {
    expect(deltaDirection('+3')).toBe('up');
    expect(deltaDirection('+12%')).toBe('up');
    expect(deltaDirection('−2')).toBe('down');
    expect(deltaDirection('-2')).toBe('down');
    expect(deltaDirection('Same')).toBe('same');
    expect(deltaDirection('  +1 ')).toBe('up');
  });
  it('says it in words', () => {
    expect(deltaWords('+3')).toBe('up 3');
    expect(deltaWords('−12%')).toBe('down 12 %');
    expect(deltaWords('+1,240')).toBe('up 1,240');
    expect(deltaWords('Same')).toBe('same');
  });
});

describe('Phase 7 — a stat tile is read as one line with its numbers (SH-20)', () => {
  it('label, value with unit, then the change', () => {
    expect(statLabel({ label: 'Kg lifted', value: '12,400', unit: 'kg', delta: '+12%' })).toBe('Kg lifted, 12,400 kg, up 12 %');
    expect(statLabel({ label: 'Recovery', value: '82', unit: 'Primed' })).toBe('Recovery, 82 Primed');
    expect(statLabel({ label: 'Sets', value: '41', delta: '−3' })).toBe('Sets, 41, down 3');
  });
  it('skips blanks instead of reading empty commas', () => {
    expect(statLabel({ label: 'Workouts', value: '7', unit: '', delta: null })).toBe('Workouts, 7');
    expect(statLabel({ label: 'Workouts', value: '7', unit: '  ' })).toBe('Workouts, 7');
  });
});

describe('Phase 7 — a ring says its numbers', () => {
  it('uses its own words, led by the title', () => {
    expect(ringLabel({ title: 'Calories', label: '1,420', sublabel: 'of 2,200', value: 1420, max: 2200 })).toBe('Calories, 1,420 of 2,200');
    expect(ringLabel({ label: '80 g', sublabel: 'of 150 g', value: 80, max: 150 })).toBe('80 g of 150 g');
  });
  it('falls back to a percentage, clamped to 0–100', () => {
    expect(ringLabel({ value: 1, max: 4 })).toBe('25 %');
    expect(ringLabel({ title: 'Goal', value: 9, max: 4 })).toBe('Goal, 100 %');
    expect(ringLabel({ value: 3, max: 0 })).toBe('0 %');
    expect(ringLabel({ value: -3, max: 10 })).toBe('0 %');
  });
});

describe('Phase 7 — errors are spoken the moment they appear, once', () => {
  it('speaks a line that has just appeared, and again when its words change', () => {
    expect(shouldAnnounce(null, "Couldn't save")).toBe(true);
    expect(shouldAnnounce(undefined, "Couldn't save")).toBe(true);
    expect(shouldAnnounce("Couldn't save", 'Try again later')).toBe(true);
  });
  it('the same words are not said twice', () => {
    expect(shouldAnnounce("Couldn't save", "Couldn't save")).toBe(false);
  });
  it('says nothing when the error clears', () => {
    expect(shouldAnnounce("Couldn't save", null)).toBe(false);
    expect(shouldAnnounce("Couldn't save", '')).toBe(false);
  });
  it('one mechanism: the error lines carry no live region (it doubled the announcement)', () => {
    const fs = require('node:fs') as typeof import('node:fs');
    const root = path.resolve(__dirname, '../../..');
    for (const f of [
      'src/components/ui/InlineError.tsx',
      'src/components/ui/LoadError.tsx',
      'src/onboarding/components/WelcomeScreen.tsx',
    ]) {
      expect(fs.readFileSync(path.join(root, f), 'utf8'), f).not.toMatch(/accessibilityLiveRegion/);
    }
    // Profile: only the quiet "Saved" confirmation is a live region; its error lines are not.
    const profile = fs.readFileSync(path.join(root, 'src/components/settings/ProfileCard.tsx'), 'utf8');
    expect(profile.match(/accessibilityLiveRegion/g)).toHaveLength(1);
  });
});

describe('Phase 7 review — a nested Text keeps its parent’s cap', () => {
  it('a span with no size of its own passes no cap (it inherits the outer Text’s)', () => {
    expect(textCapProp(undefined, undefined, true)).toBeUndefined();
  });
  it('a nested span with its own size, or its own cap, still gets that', () => {
    expect(textCapProp(undefined, type.size.h1, true)).toBe(TEXT_SCALE_CAP.title);
    expect(textCapProp(1.1, undefined, true)).toBe(1.1);
  });
  it('a Text on its own always gets a cap (body when it has no size)', () => {
    expect(textCapProp(undefined, undefined, false)).toBe(TEXT_SCALE_CAP.body);
    expect(textCapProp(undefined, type.size.hero, false)).toBe(TEXT_SCALE_CAP.hero);
    expect(textCapProp(2, type.size.hero, false)).toBe(2);
  });
});
