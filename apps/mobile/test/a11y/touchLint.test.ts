/**
 * UAT WP13: every pressable in the member app has a spoken label and a 48 dp touch area
 * (touchLint.ts says how it is read). Nothing is excused: a new control without a label, or an
 * icon-only one under 48 dp, fails CI with its file and line.
 */
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { lintSource, lintTree } from './touchLint';

const kinds = (src: string): string[] => lintSource(src, 'x.tsx').map((p) => `${p.line} ${p.kind}`);

describe('the lint itself', () => {
  it('an icon-only control with no label and no size is both problems', () => {
    expect(kinds('const A = () => (\n<Pressable onPress={f}>\n<Icon name="close" size={22} />\n</Pressable>);')).toEqual(['2 no label', '2 small target']);
  });

  it('words inside are the label, and the run-time size is not judged', () => {
    expect(kinds('const A = () => <Pressable onPress={f}><Text>Done</Text></Pressable>;')).toEqual([]);
    expect(kinds('const A = () => <Pressable onPress={f}><Badge label="Superset A" /></Pressable>;')).toEqual([]);
  });

  it('a label with 48 dp drawn, or a slop that reaches 48, passes', () => {
    expect(kinds('const A = () => <Pressable accessibilityLabel="Close" style={{ width: 48, height: 48 }}><Icon size={20} /></Pressable>;')).toEqual([]);
    expect(kinds('const A = () => <Pressable accessibilityLabel="Close" hitSlop={13}><Icon name="close" size={22} /></Pressable>;')).toEqual([]);
    expect(kinds('const S = 40;\nconst A = () => <Pressable accessibilityLabel="X" hitSlop={4} style={{ width: S, height: S }}><Icon size={20} /></Pressable>;')).toEqual([]);
  });

  it('a slop that still comes to under 48 is a small target', () => {
    expect(kinds('const A = () => <Pressable accessibilityLabel="Close" hitSlop={8}><Icon name="close" size={22} /></Pressable>;')).toEqual(['1 small target']);
    expect(kinds('const A = () => <Pressable accessibilityLabel="Up" hitSlop={6} style={{ width: 30, height: 30 }}><Icon size={20} /></Pressable>;')).toEqual(['1 small target']);
  });

  it('a backdrop that fills the screen needs a label but is big enough', () => {
    expect(kinds("const A = () => <Pressable style={{ flex: 1, backgroundColor: 'black' }} onPress={f} />;")).toEqual(['1 no label']);
    expect(kinds('const A = () => <Pressable style={{ flex: 1 }} onPress={f} accessibilityLabel="Close" />;')).toEqual([]);
  });

  it('accessible={false} and a spread of props are left to the caller', () => {
    expect(kinds('const A = () => <Pressable accessible={false} onPress={f} />;')).toEqual([]);
    expect(kinds('const A = (p) => <Pressable {...p} />;')).toEqual([]);
  });
});

describe('the member app (src/**/*.tsx)', () => {
  it('every pressable has a spoken label and a 48 dp touch area', () => {
    const root = join(__dirname, '../..');
    const problems = lintTree(join(root, 'src'), root).map((p) => `${p.file}:${p.line} ${p.tag}: ${p.kind}`);
    expect(problems).toEqual([]);
  });
});
